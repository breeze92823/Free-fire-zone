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
// Offline only for now (the Test Drive, driveTest.js); nothing here talks to the server yet.
import { Quaternion, Vector3 } from 'three'
import { DRIVE, PHYSICS, VEHICLES } from '../config.js'
import { RAPIER, bindMesh, onTick, unbindMesh, world } from '../physics.js'
import { inputState, isHeld } from '../input.js'
import { player as body, resetPlayer, setRide } from '../player.js'
import { sfx, setEngine } from '../audio/index.js'
import { G } from './state.js'
import { buildVehicleModel } from './vehicleModels.js'
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
// (0 = +z, PI/2 = +x).
export function spawnVehicle(type, x, z, yaw = 0) {
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
    type,
    def,
    body: rb,
    collider: col,
    ctrl,
    model: model.root,
    wheels: model.wheels,
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
export const driving = () => !!mine && mySeat === 0

// --- Physics tick: controls -> wheel forces, then the raycast vehicle update --------------------------
function tickVehicle(v, dt) {
  const def = v.def
  const lv = v.body.linvel()
  const rot = v.body.rotation()
  tmpQ.set(rot.x, rot.y, rot.z, rot.w)
  fwd.set(0, 0, 1).applyQuaternion(tmpQ)
  v.speed = lv.x * fwd.x + lv.y * fwd.y + lv.z * fwd.z
  const driven = !!v.seats[0]
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
  p.seat = { v, index, drive: index === 0 }
  p.crouch = false
  p.aiming = false
  p.reloadT = -1
  inputState.crouch = false
  inputState.aim = false
  setRide((out) => seatPose(v, index, out))
  document.body.classList.add('driving')
  v.body.wakeUp()
  sfx.equip()
  return true
}

// Gets out beside the vehicle (the first clear exit spot of its `exits`). `force`: even if none is clear
// (then on top of it). Returns false when there was nowhere to stand.
export function exitVehicle(force = false) {
  const v = mine
  const p = G.player
  if (!v || !p) return false
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
  document.body.classList.remove('driving')
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
  }
  // Engine sound for the vehicle the player sits in.
  if (mine) {
    const v = mine
    const rpm = clamp(Math.abs(v.speed) / v.def.topSpeed, 0, 1)
    setEngine({ rpm: 0.12 + rpm * 0.88, load: mySeat === 0 ? Math.abs(v.throttle) : 0, kind: v.type })
  }
  paintHud()
}

// --- Speed readout (DOM, shown while seated) --------------------------------------------------------
let hud = null
let shownKmh = -1
let shownName = ''
function paintHud() {
  if (!mine) {
    if (hud) hud.style.display = 'none'
    shownKmh = -1
    return
  }
  if (!hud) {
    hud = document.createElement('div')
    hud.className = 'veh-hud'
    hud.innerHTML = '<div class="vh-speed o"><b>0</b><span>km/h</span></div><div class="vh-name o"></div><div class="vh-keys"><span><b>W S</b> drive</span><span><b>A D</b> steer</span><span><b>Space</b> handbrake</span><span><b>E</b> get out</span></div>'
    document.body.appendChild(hud)
  }
  hud.style.display = ''
  const kmh = Math.round(Math.abs(mine.speed) * 3.6)
  if (kmh !== shownKmh) {
    shownKmh = kmh
    hud.querySelector('.vh-speed b').textContent = String(kmh)
  }
  const name = `${mine.def.name}${mine.speed < -0.5 && mySeat === 0 ? ' · R' : ''}`
  if (name !== shownName) {
    shownName = name
    hud.querySelector('.vh-name').textContent = name
  }
}
