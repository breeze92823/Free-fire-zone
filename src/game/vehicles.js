// Vehicles: the Jeep and the Dune Buggy (config.js VEHICLES), driven with Rapier's raycast vehicle
// controller. A vehicle is a dynamic chassis box with four suspension rays; its model (vehicleModels.js)
// follows the chassis through physics.js bindMesh (interpolated between ticks) and its wheels are
// turned, spun and lowered on the suspension every frame.
//
// The local player gets in with E (or the HUD's interact button) near a vehicle and out with E again:
// while seated the player's capsule is switched off and follows the seat (player.js setRide), the
// actor sits (animator 'sit' layer), the camera becomes a chase camera (camera.js opts.drive) and the
// input drives: W / S or the stick's forward axis = throttle / brake / reverse, A / D or its side axis
// = steering, Space or the touch BRAKE button = handbrake.
//
// Offline (the Test Drive, driveTest.js) every vehicle is simulated here. Online (vehicleNet.js) the
// server decides the seats: requestEnter / requestExit ask it, and each vehicle has an authority:
// 'local' (a dynamic body simulated here: driven or last driven by this player, or parked with nobody
// simulating it) or 'remote' (a kinematic body following the poses of the player who drives it).
//
// Combat (the server decides every number, backend vehicles.ts / MatchRoom): bullets stop on a
// vehicle's hull (castVehicles, combat.js) and hurt it, blasts list the vehicles they catch, sticky
// charges cling to them (items.js); it smokes when hurt, burns below VEHICLE_DAMAGE.burnBelow and
// ends as a charred wreck (setWreck) until a new one is parked. The driver may shoot their
// secondary weapon; the Jeep's gunner seat mans its mounted gun (aimMount, combat.js fireMounted).
// The driver's client reports players its vehicle runs over (`ram`); players on foot are pushed out
// of vehicles others drive.
import { CanvasTexture, CircleGeometry, Mesh, MeshBasicMaterial, Quaternion, SRGBColorSpace, Sprite, SpriteMaterial, Vector3 } from 'three'
import { DRIVE, MOUNTS, PHYSICS, VEHICLE_DAMAGE, VEHICLES } from '../config.js'
import { RAPIER, bindMesh, onTick, unbindMesh, world } from '../physics.js'
import { inputState, isHeld } from '../input.js'
import { aimRay } from '../camera.js'
import { player as body, resetPlayer, setRide } from '../player.js'
import { sfx, setEngine } from '../audio/index.js'
import { send } from '../net.js'
import { G } from './state.js'
import { buildVehicleModel, setWrecked } from './vehicleModels.js'
import './vehicles.css'
import * as fx from './fx.js'

export const vehicles = [] // every vehicle in the scene
let mine = null // the vehicle the local player sits in
let mySeat = -1

const tmpQ = new Quaternion()
const tmpV = new Vector3()
const tmpW = new Vector3()
const fwd = new Vector3()
const up = new Vector3()
const FLAGS = () => RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC | RAPIER.QueryFilterFlags.EXCLUDE_SENSORS

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)
const yawOf = (q) => {
  fwd.set(0, 0, 1).applyQuaternion(q)
  return Math.atan2(fwd.x, fwd.z)
}

// Spawns a parked vehicle of `type` with its wheels on the ground at (x, z), facing `yaw`
// (0 = +z, PI/2 = +x). `id`: the server's vehicle id (online).
export function spawnVehicle(type, x, z, yaw = 0, id = null) {
  const def = VEHICLES[type]
  const w = def.wheels
  const ground = G.island?.groundHeight(x, z) ?? 0
  const y = ground + w.radius + w.rest - w.y - 0.12
  const rot = tmpQ.setFromAxisAngle(up.set(0, 1, 0), yaw)
  const rb = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, y, z)
      .setRotation({ x: rot.x, y: rot.y, z: rot.z, w: rot.w })
      .setLinearDamping(0.05)
      .setAngularDamping(0.6)
      .setGravityScale(def.gravity ?? 1)
      .setCanSleep(true),
  )
  const [hx, hy, hz] = def.half
  const col = world.createCollider(
    RAPIER.ColliderDesc.cuboid(hx, hy, hz)
      .setFriction(0.5)
      .setRestitution(0.05)
      .setMassProperties(def.mass, { x: def.com[0], y: def.com[1], z: def.com[2] }, { x: def.mass * (hy * hy + hz * hz) / 3, y: def.mass * (hx * hx + hz * hz) / 3, z: def.mass * (hx * hx + hy * hy) / 3 }, { x: 0, y: 0, z: 0, w: 1 }),
    rb,
  )
  const ctrl = world.createVehicleController(rb)
  ctrl.indexUpAxis = 1
  ctrl.setIndexForwardAxis = 2
  const wheelPts = [
    [w.x, w.front],
    [-w.x, w.front],
    [w.x, w.back],
    [-w.x, w.back],
  ]
  for (let i = 0; i < 4; i++) {
    ctrl.addWheel({ x: wheelPts[i][0], y: w.y, z: wheelPts[i][1] }, { x: 0, y: -1, z: 0 }, { x: -1, y: 0, z: 0 }, w.rest, w.radius)
    ctrl.setWheelMaxSuspensionTravel(i, w.travel)
    ctrl.setWheelSuspensionStiffness(i, def.suspension.stiffness)
    ctrl.setWheelSuspensionCompression(i, def.suspension.compression)
    ctrl.setWheelSuspensionRelaxation(i, def.suspension.relaxation)
    ctrl.setWheelMaxSuspensionForce(i, def.suspension.maxForce)
    ctrl.setWheelFrictionSlip(i, def.grip)
    ctrl.setWheelSideFrictionStiffness(i, def.sideGrip)
  }
  const model = buildVehicleModel(type)
  model.root.position.set(x, y, z)
  model.root.quaternion.copy(rot)
  G.scene.add(model.root)
  bindMesh(rb, model.root)
  const v = {
    id,
    auth: 'local', // 'local' (dynamic, simulated here) | 'remote' (kinematic, follows the network)
    snaps: [], // remote: pose samples { t, x, y, z, qx, qy, qz, qw, st }
    netSteer: 0,
    type,
    def,
    body: rb,
    collider: col,
    ctrl,
    model: model.root,
    wheels: model.wheels,
    mount: model.mount, // { yaw, pitch, muzzle } or null
    tail: model.tail, // its own tail-lamp material (brake lights)
    exhaust: model.exhaust,
    hitAt: -1e9, // performance.now() of its last damage (the health bar over it)
    bar: null, // that bar (a sprite), made on first use
    scorch: null, // the burn mark under a wreck
    exhaustT: 0,
    dustT: 0,
    gunSeat: def.seats.findIndex((s) => s.gun),
    hp: def.hp,
    wreck: false,
    life: 0, // the server's VehicleState.life this was built for
    fxT: 0,
    spawn: { x, z, yaw },
    seats: def.seats.map(() => null), // actor per seat
    throttle: 0,
    steerIn: 0,
    handbrake: false,
    steer: 0, // wheel angle now (rad)
    steerShown: 0, // -1..1 for the driver's arms
    speed: 0, // forward m/s (signed)
    flipT: 0,
    lastSpeed: 0,
    bumpT: 0,
  }
  vehicles.push(v)
  return v
}

export function removeVehicle(v) {
  if (v === mine) exitVehicle(true)
  if (v.bar) {
    v.bar.removeFromParent()
    v.bar.material.map.dispose()
    v.bar.material.dispose()
  }
  if (v.scorch) {
    v.scorch.removeFromParent()
    v.scorch.geometry.dispose()
  }
  v.tail?.dispose()
  unbindMesh(v.model)
  v.model.removeFromParent()
  v.model.traverse((o) => {
    if (o.isMesh && o.userData.ownGeometry) o.geometry.dispose()
  })
  world.removeVehicleController(v.ctrl)
  if (world.getRigidBody(v.body.handle)) world.removeRigidBody(v.body)
  const i = vehicles.indexOf(v)
  if (i >= 0) vehicles.splice(i, 1)
}

export function clearVehicles() {
  for (const v of [...vehicles]) removeVehicle(v)
  setEngine(null)
}

export const myVehicle = () => mine
export const mySeatIndex = () => mySeat
export const driving = () => !!mine && mySeat === 0
export const vehicleById = (id) => vehicles.find((v) => v.id === id) ?? null

// Switches who simulates a vehicle: 'local' (dynamic body, this client) or 'remote' (kinematic body
// moved to the network poses). `vel`: the velocity to carry on with when it becomes local.
export function setAuthority(v, auth, vel = null) {
  if (v.auth === auth) return
  v.auth = auth
  v.snaps.length = 0
  if (auth === 'remote') {
    v.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true)
  } else {
    v.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true)
    if (vel) v.body.setLinvel(vel, true)
    v.body.wakeUp()
  }
}

// Puts a vehicle at a pose at once (joining, or someone's last pose of a parked vehicle).
export function snapVehicle(v, x, y, z, q, vel = null) {
  v.body.setTranslation({ x, y, z }, true)
  v.body.setRotation(q, true)
  if (v.auth === 'remote') {
    v.body.setNextKinematicTranslation({ x, y, z })
    v.body.setNextKinematicRotation(q)
  } else {
    v.body.setLinvel(vel ?? { x: 0, y: 0, z: 0 }, true)
    v.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
  }
  v.model.position.set(x, y, z)
  v.model.quaternion.set(q.x, q.y, q.z, q.w)
}

// Online, the server seats players: these ask it (the local seat follows its answer, vehicleNet.js).
// Offline (the Test Drive) they act at once.
const online = () => !G.test && !!G.match
let askedAt = 0
export function requestEnter(v, seat) {
  if (!online()) return enterVehicle(v, seat)
  if (!v.id || performance.now() - askedAt < 400) return false
  askedAt = performance.now()
  send('enter', { v: v.id, s: seat })
  return true
}
let exitedAt = -1e9
export const recentlyExited = () => performance.now() - exitedAt < 1500
export function requestExit() {
  const v = mine
  if (!exitVehicle()) return false
  if (online()) {
    exitedAt = performance.now()
    send('exit')
    if (v?.auth === 'local') sendVehiclePose(v, false) // where it was left, at once
  }
  return true
}

// The owner's pose of a vehicle for the server (vehicleNet.js decides when). rest: at rest, let go.
const r2 = (n) => Math.round(n * 100) / 100
const r4 = (n) => Math.round(n * 10000) / 10000
export function sendVehiclePose(v, rest) {
  const t = v.body.translation()
  const q = v.body.rotation()
  const lv = v.body.linvel()
  send('vpose', { v: v.id, x: r2(t.x), y: r2(t.y), z: r2(t.z), qx: r4(q.x), qy: r4(q.y), qz: r4(q.z), qw: r4(q.w), vx: r2(lv.x), vy: r2(lv.y), vz: r2(lv.z), st: r2(v.steerShown), r: rest ? 1 : 0 })
}

// The feet origin of a seat from the vehicle's drawn (interpolated) pose: other players in seats.
export function seatFeet(v, index, out) {
  const s = v.def.seats[index]
  if (!s) return out.copy(v.model.position)
  tmpW.set(s.x, s.y - DRIVE.hipHeight, s.z).applyQuaternion(v.model.quaternion)
  return out.copy(v.model.position).add(tmpW)
}

// --- Hits: the hull as a box (the drawn pose: what the shooter sees) ---------------------------------
const HULL_UP = 0.05 // the tub / panels reach a little above the collider
const rq = new Quaternion()
const ro = new Vector3()
const rd = new Vector3()
// Distance along the ray (o, unit d) to the vehicle's hull within maxDist, or -1; nOut: the face normal.
function rayHull(v, o, d, maxDist, nOut) {
  rq.copy(v.model.quaternion).invert()
  ro.copy(o).sub(v.model.position).applyQuaternion(rq)
  rd.copy(d).applyQuaternion(rq)
  const [hx, hy, hz] = v.def.half
  let t0 = 0
  let t1 = maxDist
  let axis = -1
  let sign = 0
  for (let i = 0; i < 3; i++) {
    const lo = i === 0 ? -hx : i === 1 ? -hy : -hz
    const hi = i === 0 ? hx : i === 1 ? hy + HULL_UP : hz
    const oi = ro.getComponent(i)
    const di = rd.getComponent(i)
    if (Math.abs(di) < 1e-9) {
      if (oi < lo || oi > hi) return -1
      continue
    }
    let a = (lo - oi) / di
    let b = (hi - oi) / di
    let sg = -1
    if (a > b) {
      const t = a
      a = b
      b = t
      sg = 1
    }
    if (a > t0) {
      t0 = a
      axis = i
      sign = sg
    }
    if (b < t1) t1 = b
    if (t0 > t1) return -1
  }
  if (axis < 0) return -1 // the ray starts inside
  if (nOut) nOut.set(0, 0, 0).setComponent(axis, sign).applyQuaternion(v.model.quaternion)
  return t0
}

// The nearest vehicle hull along a unit ray within maxDist: { v, t, normal } (shared object) or null.
// `skip`: a vehicle to ignore (the shooter's own).
const vhOut = { v: null, t: 0, normal: new Vector3() }
const vn = new Vector3()
export function castVehicles(o, d, maxDist, skip = null) {
  let best = null
  let bt = maxDist
  for (const v of vehicles) {
    if (v === skip) continue
    // quick reject: the ray's closest approach to the centre
    ro.subVectors(v.model.position, o)
    const along = ro.dot(d)
    if (along < -4 || along > bt + 4 || ro.lengthSq() - along * along > 16) continue
    const t = rayHull(v, o, d, bt, vn)
    if (t >= 0 && t < bt) {
      bt = t
      best = v
      vhOut.normal.copy(vn)
    }
  }
  if (!best) return null
  vhOut.v = best
  vhOut.t = bt
  return vhOut
}

// Is the world point inside the hull, padded by `pad` m (sides) and `padY` (up and down)? Writes the
// local offset into `local`.
function inHull(v, p, pad, padY, local) {
  rq.copy(v.model.quaternion).invert()
  local.copy(p).sub(v.model.position).applyQuaternion(rq)
  const [hx, hy, hz] = v.def.half
  return Math.abs(local.x) < hx + pad && local.y > -hy - padY && local.y < hy + HULL_UP + padY && Math.abs(local.z) < hz + pad
}

// May this actor's shots or blasts hurt `v`? (The server checks the same: not a wreck, not one they
// sit in, nobody of their team inside.)
export function canHurtVehicle(v, actor) {
  if (v.wreck) return false
  for (const a of v.seats) if (a && (a === actor || a.team === actor.team)) return false
  return true
}

// The ids of the vehicles a blast at `pos` (radius R) catches, with line of sight to their centre.
export function vehiclesInBlast(pos, R, actor, los) {
  const out = []
  for (const v of vehicles) {
    if (!v.id || !canHurtVehicle(v, actor)) continue
    if (v.model.position.distanceTo(pos) > R + VEHICLE_DAMAGE.size) continue
    if (los && !los(pos, v.model.position)) continue
    out.push(v.id)
  }
  return out
}

export const vehicleHpShare = (v) => clamp(v.hp / (v.def.hp || 1), 0, 1)

// Destroyed (or rebuilt): charred look, the mount drooped, nobody drives it.
export function setWreck(v, on) {
  if (v.wreck === on) return
  v.wreck = on
  setWrecked(v.model, on)
  if (on && v.mount) v.mount.pitch.rotation.x = 0.35
  // A burn mark on the ground where it went up.
  if (on && !v.scorch) {
    const p = v.model.position
    // the floor under it (a camp's concrete, a road, the terrain): a ray down past its own body
    const ray = new RAPIER.Ray({ x: p.x, y: p.y + 0.2, z: p.z }, { x: 0, y: -1, z: 0 })
    const hit = world.castRay(ray, 6, true, RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC | RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC | RAPIER.QueryFilterFlags.EXCLUDE_SENSORS)
    const gy = hit ? p.y + 0.2 - (hit.timeOfImpact ?? hit.toi) : (G.island?.groundHeight?.(p.x, p.z) ?? p.y - 0.9)
    v.scorch = new Mesh(new CircleGeometry(2.8, 20), SCORCH())
    v.scorch.rotation.x = -Math.PI / 2
    v.scorch.position.set(p.x, gy + 0.04, p.z)
    v.scorch.renderOrder = 1
    G.scene.add(v.scorch)
  }
}
let scorchMat = null
const SCORCH = () => (scorchMat ??= new MeshBasicMaterial({ color: 0x0c0a08, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }))

// Marks fresh damage (vehicleNet.js, when its health drops): the bar over it shows for a while.
export function vehicleHit(v) {
  v.hitAt = performance.now()
}

// The mounted gun's muzzle (world), for the gunner's shots and the tracers others draw.
export function mountMuzzle(v, out) {
  if (!v?.mount) return null
  v.model.updateMatrixWorld(true)
  return v.mount.muzzle.getWorldPosition(out)
}

// The mounted gun follows its gunner's aim (the local player: the camera; others: their pose yaw and
// pitch), turned into the vehicle's frame and eased; with nobody on it, it swings back forward.
const ma = new Vector3()
function aimMount(v, dt) {
  const m = v.mount
  if (!m || v.wreck) return
  const g = v.seats[v.gunSeat]
  let yaw = 0
  let pitch = 0.05
  if (g) {
    if (g === G.player) ma.copy(aimRay.dir)
    else ma.set(Math.sin(g.facing) * Math.cos(g.pitch), -Math.sin(g.pitch), Math.cos(g.facing) * Math.cos(g.pitch))
    rq.copy(v.model.quaternion).invert()
    ma.applyQuaternion(rq)
    yaw = Math.atan2(ma.x, ma.z)
    pitch = clamp(-Math.asin(clamp(ma.y, -1, 1)), -0.55, 0.38)
  }
  const k = 1 - Math.exp(-dt * (g ? 30 : 3))
  let dy = yaw - m.yaw.rotation.y
  dy = Math.atan2(Math.sin(dy), Math.cos(dy))
  m.yaw.rotation.y = Math.atan2(Math.sin(m.yaw.rotation.y + dy * k), Math.cos(m.yaw.rotation.y + dy * k))
  m.pitch.rotation.x += (pitch - m.pitch.rotation.x) * k
}

// --- Running people over (the local driver's vehicle) and being pushed out of others' ---------------
const ramAt = new Map() // actor -> ms of the last report
const loc = new Vector3()
const chestP = new Vector3()
function checkRams() {
  const v = mine
  if (!v || mySeat !== 0 || v.auth !== 'local' || v.wreck || !v.id) return
  const lv = v.body.linvel()
  const sp = Math.hypot(lv.x, lv.z)
  if (sp < VEHICLE_DAMAGE.ram.minSpeed) return
  const now = performance.now()
  for (const a of G.actors) {
    if (!a.remote || !a.netId || a.seat || a.life === 'dead' || a.team === G.player?.team) continue
    chestP.set(a.pos.x, a.pos.y + (a.life === 'knocked' ? 0.35 : 0.9), a.pos.z)
    if (!inHull(v, chestP, 0.55, 0.9, loc)) continue
    if (now - (ramAt.get(a) ?? 0) < VEHICLE_DAMAGE.ram.gapMs) continue
    ramAt.set(a, now)
    send('ram', { v: v.id, t: a.netId, sp: Math.round(sp * 10) / 10 })
    sfx.impact('metal')
    sfx.hitmarker(false)
    fx.hitPuff(chestP, fwd.set(lv.x, 0, lv.z).normalize(), false)
  }
}
const nudgeOut = { x: 0, z: 0 }
function pushWalker() {
  const p = G.player
  if (!p || p.seat || p.life === 'dead') return
  chestP.set(p.pos.x, p.pos.y + 0.9, p.pos.z)
  for (const v of vehicles) {
    if (v.auth !== 'remote') continue
    if (!inHull(v, chestP, 0.42, 0.85, loc)) continue
    const [hx, , hz] = v.def.half
    const px = hx + 0.45 - Math.abs(loc.x)
    const pz = hz + 0.45 - Math.abs(loc.z)
    // out through the nearer side; a moving vehicle brushes past (sideways), it does not bulldoze
    // (running someone over is the driver's `ram` report: damage and a push from the server)
    if (px < pz || Math.abs(v.speed) > 2) loc.set(Math.sign(loc.x || 1) * Math.min(px + 0.02, 0.6), 0, 0)
    else loc.set(0, 0, Math.sign(loc.z || 1) * Math.min(pz + 0.02, 0.6))
    loc.applyQuaternion(v.model.quaternion)
    nudgeOut.x = loc.x
    nudgeOut.z = loc.z
    body.nudge = nudgeOut
    return
  }
}

// --- Physics tick: controls -> wheel forces, then the raycast vehicle update --------------------------
function tickVehicle(v, dt) {
  const def = v.def
  if (v.auth === 'remote') {
    // Kinematic, moved by vehicleNet.js: only the wheels need the suspension rays (and the steering).
    const lv = v.body.linvel()
    const rot = v.body.rotation()
    tmpQ.set(rot.x, rot.y, rot.z, rot.w)
    fwd.set(0, 0, 1).applyQuaternion(tmpQ)
    v.speed = lv.x * fwd.x + lv.y * fwd.y + lv.z * fwd.z
    v.steer = v.netSteer * def.steer
    v.steerShown = v.netSteer
    for (let i = 0; i < 4; i++) {
      v.ctrl.setWheelEngineForce(i, 0)
      v.ctrl.setWheelBrake(i, 0)
      v.ctrl.setWheelSteering(i, i < 2 ? v.steer : 0)
    }
    v.ctrl.updateVehicle(dt, FLAGS(), undefined, (c) => c.handle !== v.collider.handle)
    return
  }
  const lv = v.body.linvel()
  const rot = v.body.rotation()
  tmpQ.set(rot.x, rot.y, rot.z, rot.w)
  fwd.set(0, 0, 1).applyQuaternion(tmpQ)
  v.speed = lv.x * fwd.x + lv.y * fwd.y + lv.z * fwd.z
  const driven = !!v.seats[0] && v.seats[0] === G.player && !v.wreck // a local sim is driven from here, or parked
  const s = v.speed
  let engine = 0
  let brake = 0
  const t = driven ? v.throttle : 0
  if (!driven) brake = def.handbrake // parked
  else if (t > 0.05) {
    if (s < -1) brake = def.brake * t
    else engine = def.engine * t * Math.max(0, 1 - Math.max(0, s) / def.topSpeed) ** 0.55
  } else if (t < -0.05) {
    if (s > 1) brake = def.brake * -t
    else engine = s > -def.reverseSpeed ? -def.engine * 0.65 * -t : 0
  } else brake = def.roll
  // Steering: less lock at speed, eased toward the input.
  const lock = def.steer + (def.steerAtTop - def.steer) * clamp(Math.abs(s) / def.topSpeed, 0, 1)
  const want = driven ? v.steerIn * lock : 0
  const step = def.steerRate * dt
  v.steer += clamp(want - v.steer, -step, step)
  v.steerShown = v.steer / def.steer
  const hb = driven && v.handbrake
  for (let i = 0; i < 4; i++) {
    const front = i < 2
    const powered = def.driven === 'all' || !front
    v.ctrl.setWheelEngineForce(i, powered ? engine : 0)
    v.ctrl.setWheelBrake(i, hb && !front ? def.handbrake : brake)
    v.ctrl.setWheelSteering(i, front ? v.steer : 0)
    // The handbrake lets the back slide (drifts).
    v.ctrl.setWheelSideFrictionStiffness(i, hb && !front ? def.sideGrip * 0.45 : def.sideGrip)
  }
  if (driven || Math.abs(s) > 0.05) v.body.wakeUp()
  v.ctrl.updateVehicle(dt, FLAGS(), undefined, (c) => c.handle !== v.collider.handle)
}

onTick((dt) => {
  for (let i = 0; i < vehicles.length; i++) tickVehicle(vehicles[i], dt)
})

// --- The local player's seat -------------------------------------------------------------------
// The feet origin for a seat: the hip point minus DRIVE.hipHeight along the vehicle's up.
function seatPose(v, index, out) {
  const s = v.def.seats[index]
  const t = v.body.translation()
  const r = v.body.rotation()
  tmpQ.set(r.x, r.y, r.z, r.w)
  tmpW.set(s.x, s.y - DRIVE.hipHeight, s.z).applyQuaternion(tmpQ)
  out.x = t.x + tmpW.x
  out.y = t.y + tmpW.y
  out.z = t.z + tmpW.z
  const lv = v.body.linvel()
  out.vx = lv.x
  out.vy = lv.y
  out.vz = lv.z
  out.yaw = yawOf(tmpQ)
  return out
}

// The vehicle (and free seat) the actor can get into: the nearest within DRIVE.enterRange of its side.
export function vehicleNear(actor) {
  let best = null
  let bd = DRIVE.enterRange
  for (const v of vehicles) {
    if (v.wreck) continue
    const free = v.seats.findIndex((a) => !a)
    if (free < 0) continue
    const t = v.body.translation()
    const r = v.body.rotation()
    tmpQ.set(r.x, r.y, r.z, r.w).invert()
    // distance to the chassis box (local), so the long sides count, not just the centre
    tmpV.set(actor.pos.x - t.x, actor.pos.y + 0.9 - t.y, actor.pos.z - t.z).applyQuaternion(tmpQ)
    const [hx, hy, hz] = v.def.half
    const dx = Math.max(Math.abs(tmpV.x) - hx, 0)
    const dy = Math.max(Math.abs(tmpV.y) - hy - 0.6, 0)
    const dz = Math.max(Math.abs(tmpV.z) - hz, 0)
    const d = Math.hypot(dx, dy, dz)
    if (d < bd) {
      bd = d
      best = { v, seat: v.seats[0] ? free : 0 }
    }
  }
  return best
}

export function enterVehicle(v, index = 0) {
  const p = G.player
  if (!p || mine || v.seats[index]) return false
  mine = v
  mySeat = index
  v.seats[index] = p
  p.seat = { v, index, drive: index === 0, gun: v.def.seats[index].gun || null }
  p.crouch = false
  p.aiming = false
  p.reloadT = -1
  inputState.crouch = false
  inputState.aim = false
  setRide((out) => seatPose(v, index, out), index !== 0) // passengers look (and aim) freely
  document.body.classList.toggle('driving', index === 0)
  document.body.classList.toggle('riding', index !== 0)
  document.body.classList.toggle('gunner', !!p.seat.gun)
  document.body.classList.toggle('drive-shoot', index === 0 && !!p.slots[1]?.def.mag)
  v.body.wakeUp()
  sfx.equip()
  return true
}

// Gets out beside the vehicle (the first clear exit spot of its `exits`). `force`: even if none is clear
// (then on top of it). Returns false when there was nowhere to stand.
export function exitVehicle(force = false) {
  const v = mine
  const p = G.player
  if (!v) return false
  if (!p) {
    // the round is being torn down: just let go
    v.seats[mySeat] = null
    mine = null
    mySeat = -1
    setRide(null)
    document.body.classList.remove('driving', 'riding', 'gunner', 'drive-shoot')
    setEngine(null)
    paintHud()
    return true
  }
  const spot = exitSpot(v)
  if (!spot && !force) {
    sfx.deny()
    return false
  }
  const t = v.body.translation()
  const at = spot || { x: t.x, y: t.y + 1.6, z: t.z }
  v.seats[mySeat] = null
  p.seat = null
  mine = null
  mySeat = -1
  setRide(null)
  resetPlayer(at, body.facing)
  const lv = v.body.linvel()
  body.velocity.x = lv.x * 0.5
  body.velocity.z = lv.z * 0.5
  document.body.classList.remove('driving', 'riding', 'gunner', 'drive-shoot')
  inputState.brake = false
  setEngine(null)
  paintHud()
  sfx.equip()
  return true
}

const capsule = { shape: null }
function exitSpot(v) {
  const t = v.body.translation()
  const r = v.body.rotation()
  tmpQ.set(r.x, r.y, r.z, r.w)
  const yaw = yawOf(tmpQ)
  const c = Math.cos(yaw)
  const s = Math.sin(yaw)
  capsule.shape ??= new RAPIER.Capsule(0.45, 0.42)
  const ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 })
  for (const [lx, lz] of v.def.exits) {
    // local (x left, z forward) -> world, yawed only
    const x = t.x + lx * c + lz * s
    const z = t.z - lx * s + lz * c
    ray.origin.x = x
    ray.origin.y = t.y + 2.5
    ray.origin.z = z
    const hit = world.castRay(ray, 8, true, FLAGS(), undefined, v.collider)
    if (!hit) continue
    const fy = t.y + 2.5 - (hit.timeOfImpact ?? hit.toi)
    if (fy < t.y - 3) continue
    const clear = !world.intersectionWithShape({ x, y: fy + 0.98, z }, { x: 0, y: 0, z: 0, w: 1 }, capsule.shape, FLAGS())
    if (clear) return { x, y: fy + 0.02, z }
  }
  return null
}

// Per frame (before physics): the local driver's input.
export function driveInput() {
  const v = mine
  if (!v || mySeat !== 0) return
  const mv = inputState.move
  v.throttle = clamp(mv.z, -1, 1)
  v.steerIn = clamp(-mv.x, -1, 1)
  v.handbrake = isHeld('Space') || !!inputState.brake
  inputState.jump = false
}

// The chase camera options for the local player's vehicle (camera.js opts.drive), or null.
const camOpts = { distance: 7, height: 2.2, heading: 0, speed: 0 }
export function driveCamera() {
  if (!mine) return null
  camOpts.distance = mine.def.camera.distance
  camOpts.height = mine.def.camera.height
  camOpts.heading = yawOf(mine.model.quaternion)
  camOpts.speed = mine.speed
  return camOpts
}
export const vehicleFocus = () => mine?.model.position ?? null

// --- Per frame: wheels, flips, falls, bumps, engine sound, the speed readout ---------------------------
export function updateVehicles(dt) {
  for (const v of vehicles) {
    const c = v.ctrl
    for (let i = 0; i < 4; i++) {
      const wg = v.wheels[i]
      const len = c.wheelSuspensionLength(i)
      const cp = c.wheelChassisConnectionPointCs(i)
      if (cp && len !== null) wg.position.set(cp.x, cp.y - len, cp.z)
      wg.rotation.y = c.wheelSteering(i) ?? 0
      wg.rotation.x = c.wheelRotation(i) ?? 0
    }
    // Upside down or on its side and slow: put it back on its wheels after a moment.
    up.set(0, 1, 0).applyQuaternion(v.model.quaternion)
    if (up.y < 0.35 && Math.abs(v.speed) < 3) v.flipT += dt
    else v.flipT = 0
    const t = v.body.translation()
    if (v.flipT > DRIVE.flipAfter || t.y < PHYSICS.killY) {
      v.flipT = 0
      const fell = t.y < PHYSICS.killY
      const x = fell ? v.spawn.x : t.x
      const z = fell ? v.spawn.z : t.z
      const yaw = fell ? v.spawn.yaw : yawOf(v.model.quaternion)
      tmpQ.setFromAxisAngle(up.set(0, 1, 0), yaw)
      const gy = G.island?.groundHeight(x, z) ?? t.y
      v.body.setTranslation({ x, y: Math.max(gy, t.y) + 1.4, z }, true)
      v.body.setRotation({ x: tmpQ.x, y: tmpQ.y, z: tmpQ.z, w: tmpQ.w }, true)
      v.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
      v.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
      fx.dustKick?.(v.model.position, 12)
    }
    // A hard knock (sudden speed loss): a thump and some dust.
    v.bumpT = Math.max(0, v.bumpT - dt)
    const drop = Math.abs(v.lastSpeed) - Math.abs(v.speed)
    if (drop > 6 && v.bumpT <= 0 && (v === mine || G.player?.pos.distanceTo(v.model.position) < 40)) {
      v.bumpT = 0.4
      sfx.impact('metal')
      fx.dustKick?.(v.model.position, 8)
    }
    v.lastSpeed = v.speed
    aimMount(v, dt)
    damageFx(v, dt)
    driveFx(v, dt)
    healthBar(v)
  }
  checkRams()
  pushWalker()
  // Engine sound for the vehicle the player sits in.
  if (mine) {
    const v = mine
    const rpm = clamp(Math.abs(v.speed) / v.def.topSpeed, 0, 1)
    setEngine({ rpm: 0.12 + rpm * 0.88, load: mySeat === 0 ? Math.abs(v.throttle) : 0, kind: v.type })
  }
  paintHud()
}

// Smoke when hurt, fire and black smoke when burning, a smoulder from a wreck (near the camera only).
const fxP = new Vector3()
function damageFx(v, dt) {
  const share = vehicleHpShare(v)
  if (!v.wreck && share >= VEHICLE_DAMAGE.smokeBelow) return
  if (G.camera && G.camera.position.distanceToSquared(v.model.position) > 160 * 160) return
  v.fxT -= dt
  if (v.fxT > 0) return
  const burning = !v.wreck && share < VEHICLE_DAMAGE.burnBelow
  v.fxT = burning ? 0.04 : v.wreck ? 0.16 : 0.09
  // from the engine (the Jeep's hood, the Buggy's back)
  const ez = v.type === 'buggy' ? -1.25 : 1.35
  fxP.set((Math.random() - 0.5) * 0.6, v.def.half[1] + 0.1, ez + (Math.random() - 0.5) * 0.5).applyQuaternion(v.model.quaternion).add(v.model.position)
  const lv = v.body.linvel()
  if (burning) {
    fx.emitAdd(fxP.x, fxP.y, fxP.z, lv.x * 0.3 + (Math.random() - 0.5) * 0.6, 1.4 + Math.random(), lv.z * 0.3 + (Math.random() - 0.5) * 0.6, 0.35 + Math.random() * 0.25, 0.32, fx.FX_COLORS.fire, 1, 1.5, 0.5, -0.4)
  }
  const dark = burning || v.wreck || share < 0.35
  fx.emitBlend(fxP.x, fxP.y + 0.2, fxP.z, lv.x * 0.2 + (Math.random() - 0.5) * 0.5, 1.2 + Math.random() * 0.8, lv.z * 0.2 + (Math.random() - 0.5) * 0.5, 1.6 + Math.random(), 0.45, dark ? fx.FX_COLORS.darkSmoke : fx.FX_COLORS.smoke, dark ? 0.55 : 0.4, 0.3, 0.6, 1.4)
}

// Driving looks (near the camera): dust thrown up by the wheels on the move, exhaust puffs while
// someone sits at the wheel, the tail lamps brighten while it brakes.
const camNear = (v, r) => !G.camera || G.camera.position.distanceToSquared(v.model.position) < r * r
const ex = new Vector3()
function driveFx(v, dt) {
  if (v.wreck) return
  const sp = Math.abs(v.speed)
  // brake lights: braking against the motion, the handbrake, or (someone else's) slowing down hard
  if (v.tail) {
    const local = v.auth === 'local' && v.seats[0] === G.player
    const braking = local ? (v.handbrake && sp > 1) || (v.throttle * v.speed < -0.5 && sp > 1) : v.lastSpeed !== undefined && Math.abs(v.lastSpeed) - sp > 8 * dt
    const want = braking ? 3.2 : 0.9
    v.tail.emissiveIntensity += (want - v.tail.emissiveIntensity) * Math.min(1, dt * 12)
  }
  if (!camNear(v, 120)) return
  // dust off the back wheels
  if (sp > 4) {
    v.dustT -= dt * Math.min(1, sp / 18)
    if (v.dustT <= 0) {
      v.dustT = 0.025
      for (const i of [2, 3]) {
        if (!v.ctrl.wheelIsInContact(i)) continue
        const w = v.wheels[i]
        ex.set(w.position.x + (Math.random() - 0.5) * 0.4, w.position.y - v.def.wheels.radius + 0.15, w.position.z - 0.3 - Math.random() * 0.8).applyQuaternion(v.model.quaternion).add(v.model.position)
        fx.emitBlend(ex.x, ex.y, ex.z, (Math.random() - 0.5) * 1.2, 0.6 + Math.random() * 0.8, (Math.random() - 0.5) * 1.2, 0.9 + Math.random() * 0.6, 0.6 + sp * 0.02, fx.FX_COLORS.sand, 0.6, 0.2, 1.4, 1.2)
      }
    }
  }
  // exhaust while someone drives it
  if (v.seats[0] && v.exhaust && camNear(v, 50)) {
    v.exhaustT -= dt
    if (v.exhaustT <= 0) {
      v.exhaustT = 0.12 + Math.random() * 0.08
      ex.set(v.exhaust[0], v.exhaust[1], v.exhaust[2]).applyQuaternion(v.model.quaternion).add(v.model.position)
      fx.emitBlend(ex.x, ex.y, ex.z, (Math.random() - 0.5) * 0.3, 0.35, (Math.random() - 0.5) * 0.3, 0.7, 0.16, fx.FX_COLORS.smoke, 0.28, 0, 1.5, 1.2)
    }
  }
}

// The health bar over a vehicle (not the one the player sits in): for 4 s after it is hurt, and
// whenever it is burning, within 80 m.
const BAR_W = 96
const BAR_H = 12
function healthBar(v) {
  const share = vehicleHpShare(v)
  const show = v !== mine && !v.wreck && (performance.now() - v.hitAt < 4000 || share < VEHICLE_DAMAGE.burnBelow) && camNear(v, 80)
  if (!show) {
    if (v.bar) v.bar.visible = false
    return
  }
  if (!v.bar) {
    const c = document.createElement('canvas')
    c.width = BAR_W
    c.height = BAR_H
    const tex = new CanvasTexture(c)
    tex.colorSpace = SRGBColorSpace
    v.bar = new Sprite(new SpriteMaterial({ map: tex, depthTest: false, transparent: true }))
    v.bar.scale.set(1.9, (1.9 * BAR_H) / BAR_W, 1)
    v.bar.renderOrder = 10
    v.bar.userData.shown = -1
    G.scene.add(v.bar)
  }
  v.bar.visible = true
  v.bar.position.set(v.model.position.x, v.model.position.y + v.def.half[1] + 1.9, v.model.position.z)
  const pct = Math.round(share * 100)
  if (pct === v.bar.userData.shown) return
  v.bar.userData.shown = pct
  const c = v.bar.material.map.image
  const g = c.getContext('2d')
  g.clearRect(0, 0, BAR_W, BAR_H)
  g.fillStyle = 'rgba(0,0,0,0.75)'
  g.fillRect(0, 0, BAR_W, BAR_H)
  g.fillStyle = share < VEHICLE_DAMAGE.burnBelow ? '#ff5a3a' : share < VEHICLE_DAMAGE.smokeBelow ? '#f2c14a' : '#7ddc5a'
  g.fillRect(2, 2, Math.max(0, (BAR_W - 4) * share), BAR_H - 4)
  v.bar.material.map.needsUpdate = true
}

// --- Speed readout (DOM, shown while seated) --------------------------------------------------------
// The mounted gun the local player mans: heat 0..1 (controller.js / combat.js fireMounted), `over`
// while it cools down from overheating.
export const gunState = { heat: 0, over: false }
let hud = null
const shown = { kmh: -1, name: '', hp: -1, heat: -1, over: null, mode: '' }
// Driving: the speed, the vehicle's health and the keys; riding: its health; on the gun: its heat too.
function paintHud() {
  if (!mine) {
    if (hud) hud.style.display = 'none'
    shown.kmh = -1
    shown.mode = ''
    return
  }
  if (!hud) {
    hud = document.createElement('div')
    hud.className = 'veh-hud'
    hud.innerHTML = '<div class="vh-speed o"><b>0</b><span>km/h</span></div><div class="vh-name o"></div><div class="vh-bar hp"><i></i></div><div class="vh-bar heat"><i></i><span>OVERHEATED</span></div><div class="vh-keys"></div>'
    document.body.appendChild(hud)
  }
  hud.style.display = ''
  const drive = mySeat === 0
  const gunner = mySeat === mine.gunSeat
  const shoots = drive && !!G.player?.slots[1]?.def.mag
  const mode = drive ? (shoots ? 'drive-gun' : 'drive') : gunner ? 'gun' : 'ride'
  if (mode !== shown.mode) {
    shown.mode = mode
    hud.dataset.mode = mode
    hud.querySelector('.vh-keys').innerHTML = drive
      ? `<span><b>W S</b> drive</span><span><b>A D</b> steer</span><span><b>Space</b> handbrake</span>${shoots ? '<span><b>LMB</b> shoot</span>' : ''}<span><b>E</b> get out</span>`
      : gunner
        ? '<span><b>LMB</b> mounted gun</span><span><b>E</b> get out</span>'
        : '<span><b>E</b> get out</span>'
  }
  if (drive) {
    const kmh = Math.round(Math.abs(mine.speed) * 3.6)
    if (kmh !== shown.kmh) {
      shown.kmh = kmh
      hud.querySelector('.vh-speed b').textContent = String(kmh)
    }
  }
  const name = gunner ? MOUNT_NAME(mine) : `${mine.def.name}${mine.speed < -0.5 && drive ? ' · R' : ''}`
  if (name !== shown.name) {
    shown.name = name
    hud.querySelector('.vh-name').textContent = name
  }
  const hp = Math.round(vehicleHpShare(mine) * 100)
  if (hp !== shown.hp) {
    shown.hp = hp
    const bar = hud.querySelector('.vh-bar.hp')
    bar.firstChild.style.width = `${hp}%`
    bar.classList.toggle('low', hp < VEHICLE_DAMAGE.burnBelow * 100)
    bar.classList.toggle('mid', hp >= VEHICLE_DAMAGE.burnBelow * 100 && hp < VEHICLE_DAMAGE.smokeBelow * 100)
  }
  if (gunner) {
    const heat = Math.round(gunState.heat * 100)
    if (heat !== shown.heat || gunState.over !== shown.over) {
      shown.heat = heat
      shown.over = gunState.over
      const bar = hud.querySelector('.vh-bar.heat')
      bar.firstChild.style.width = `${heat}%`
      bar.classList.toggle('over', gunState.over)
    }
  }
}
const MOUNT_NAME = (v) => `${v.def.name} · ${MOUNTS[v.def.seats[v.gunSeat].gun]?.name ?? 'Gun'}`
