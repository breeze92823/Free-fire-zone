// Vehicles in an online round (Dustline Ridge): keeps the local vehicles in step with the server's
// `state.vehicles` (backend vehicles.ts, protocol.md). Every frame in a round (main.js gameFrame):
//
//   syncVehicles(dt)  before physics: creates / removes vehicles, picks each one's authority from its
//                     `owner` (this player: 'local', simulated and sent; nobody: 'local', parked, snapped
//                     to the last pose the server has; another player: 'remote', a kinematic body drawn
//                     NET.interpDelay behind their poses), seats this player as the server says (in
//                     after an `enter`, out when ejected: knocked, eliminated) and marks other seated
//                     players (actor.seat).
//   sendVehicles(dt)  the poses of the vehicles this player simulates, NET.poseHz while it drives or
//                     the vehicle still moves, then once "at rest" (the server lets go of it).
//   placeSeated()     after physics: other seated players sit on their vehicle's drawn seat.
import { Vector3 } from 'three'
import { NET } from '../config.js'
import { net } from '../net.js'
import { G } from './state.js'
import {
  enterVehicle, exitVehicle, myVehicle, mySeatIndex, recentlyExited, removeVehicle, seatFeet, sendVehiclePose, setAuthority, snapVehicle, spawnVehicle, vehicleById, vehicles,
} from './vehicles.js'

const PARKED_Y = -100 // backend vehicles.ts: never moved this round
const tmp = new Vector3()
const q = { x: 0, y: 0, z: 0, w: 1 }
const yawOf = (s) => 2 * Math.atan2(s.qy, s.qw) // parked vehicles are only yawed

export function syncVehicles() {
  const st = net.state
  if (!st?.vehicles || !G.match || G.test) return
  const now = performance.now()
  const meId = net.sessionId
  // Create / update
  st.vehicles.forEach((s, id) => {
    let v = vehicleById(id)
    if (!v) {
      v = spawnVehicle(s.type, s.x, s.z, yawOf(s), id)
      v.seenN = -1
      if (s.y !== PARKED_Y) snapVehicle(v, s.x, s.y, s.z, set(q, s), { x: s.vx, y: s.vy, z: s.vz })
    }
    const auth = s.owner && s.owner !== meId ? 'remote' : 'local'
    if (auth !== v.auth) setAuthority(v, auth, { x: s.vx, y: s.vy, z: s.vz })
    v.ownerMine = s.owner === meId
    v.netSteer = s.steer
    if (s.n !== v.seenN) {
      v.seenN = s.n
      if (v.auth === 'remote' && s.y !== PARKED_Y) {
        // a new pose sample (drawn NET.interpDelay behind the newest)
        const last = v.snaps[v.snaps.length - 1]
        if (last && Math.hypot(s.x - last.x, s.z - last.z) > 30) v.snaps.length = 0 // put back somewhere: no sweep
        v.snaps.push({ t: now, x: s.x, y: s.y, z: s.z, qx: s.qx, qy: s.qy, qz: s.qz, qw: s.qw })
        if (v.snaps.length > 12) v.snaps.shift()
      } else if (v.auth === 'local' && !v.ownerMine && s.y !== PARKED_Y) {
        // Parked by someone else (their last pose): put it exactly there.
        const t = v.body.translation()
        if (Math.hypot(t.x - s.x, t.y - s.y, t.z - s.z) > 0.25) snapVehicle(v, s.x, s.y, s.z, set(q, s), { x: s.vx, y: s.vy, z: s.vz })
      }
    }
    // Seats: other players (this player's own seat is handled below).
    for (let i = 0; i < v.seats.length; i++) {
      const sid = s.seats[i] || ''
      const cur = v.seats[i]
      if (cur === G.player) continue
      const a = sid && sid !== meId ? G.actors.find((x) => x.netId === sid) ?? null : null
      if (cur && cur !== a && cur.seat?.v === v) cur.seat = null
      v.seats[i] = a
      if (a) a.seat = { v, index: i, drive: i === 0 }
    }
    if (v.auth === 'remote') follow(v, now)
  })
  // Remove the ones the server no longer has.
  for (const v of [...vehicles]) if (v.id && !st.vehicles.has(v.id)) removeVehicle(v)
  // Remote actors whose state says they left their seat.
  for (const a of G.actors) {
    if (!a.remote || !a.seat) continue
    const p = st.players.get(a.netId)
    if (!p || p.veh !== a.seat.v.id) {
      if (a.seat.v.seats[a.seat.index] === a) a.seat.v.seats[a.seat.index] = null
      a.seat = null
    }
  }
  // This player's seat follows the server: in once an `enter` is accepted, out when ejected.
  const meP = st.players.get(meId)
  const mine = myVehicle()
  if (meP?.veh && !mine && !recentlyExited() && G.player?.life === 'alive') {
    const v = vehicleById(meP.veh)
    if (v && !v.seats[meP.seat]) enterVehicle(v, meP.seat)
  } else if (mine && (!meP?.veh || meP.veh !== mine.id || meP.seat !== mySeatIndex())) {
    exitVehicle(true)
  }
}

function set(out, s) {
  out.x = s.qx
  out.y = s.qy
  out.z = s.qz
  out.w = s.qw
  const l = Math.hypot(out.x, out.y, out.z, out.w) || 1
  out.x /= l
  out.y /= l
  out.z /= l
  out.w /= l
  return out
}

// A remote vehicle: the kinematic body's next pose, NET.interpDelay behind the newest sample.
const qa = { x: 0, y: 0, z: 0, w: 1 }
function follow(v, now) {
  const s = v.snaps
  if (!s.length) return
  const rt = now - NET.interpDelay * 1000
  let from = s[0]
  let to = s[s.length - 1]
  for (let i = s.length - 1; i > 0; i--) {
    if (s[i - 1].t <= rt) {
      from = s[i - 1]
      to = s[i]
      break
    }
  }
  const k = to === from ? 1 : Math.max(0, Math.min(1, (rt - from.t) / (to.t - from.t || 1)))
  const x = from.x + (to.x - from.x) * k
  const y = from.y + (to.y - from.y) * k
  const z = from.z + (to.z - from.z) * k
  // quaternion nlerp (short way round)
  const dot = from.qx * to.qx + from.qy * to.qy + from.qz * to.qz + from.qw * to.qw
  const sg = dot < 0 ? -1 : 1
  qa.x = from.qx + (to.qx * sg - from.qx) * k
  qa.y = from.qy + (to.qy * sg - from.qy) * k
  qa.z = from.qz + (to.qz * sg - from.qz) * k
  qa.w = from.qw + (to.qw * sg - from.qw) * k
  const l = Math.hypot(qa.x, qa.y, qa.z, qa.w) || 1
  qa.x /= l
  qa.y /= l
  qa.z /= l
  qa.w /= l
  v.body.setNextKinematicTranslation({ x, y, z })
  v.body.setNextKinematicRotation(qa)
}

// --- Sending ------------------------------------------------------------------------------------------
let acc = 0
export function sendVehicles(dt) {
  if (!net.state?.vehicles || !G.match || G.test) return
  acc += dt
  if (acc < 1 / NET.poseHz) return
  const step = acc
  acc = 0
  for (const v of vehicles) {
    if (!v.ownerMine || v.auth !== 'local') continue
    const driven = myVehicle() === v && mySeatIndex() === 0
    const lv = v.body.linvel()
    const av = v.body.angvel()
    const moving = Math.hypot(lv.x, lv.y, lv.z) > 0.25 || Math.hypot(av.x, av.y, av.z) > 0.2
    if (driven || moving) {
      v.stillT = 0
      sendVehiclePose(v, false)
    } else {
      // At rest with nobody driving: one last pose and the server lets go (owner "").
      v.stillT = (v.stillT ?? 0) + step
      if (v.stillT > 0.8 && !v.restSent) {
        v.restSent = true
        sendVehiclePose(v, true)
      }
    }
    if (driven || moving) v.restSent = false
  }
}

// --- Other seated players sit on their vehicle's drawn seat ----------------------------------------------
export function placeSeated() {
  for (const a of G.actors) {
    if (!a.remote || !a.seat) continue
    seatFeet(a.seat.v, a.seat.index, tmp)
    a.pos.copy(tmp)
    a.grounded = true
  }
}
