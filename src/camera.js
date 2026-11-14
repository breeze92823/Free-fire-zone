import { Vector3 } from 'three'
import { inputState } from './input.js'
import { segmentClear } from './physics.js'
import { CAMERA, DRIVE } from './config.js'

// Over-the-shoulder shooter camera. It owns yaw/pitch (the player's body turns
// with it), sits to the right of the character on a short boom, eases in for
// aiming (narrower FOV, closer boom) and switches to the eye for scopes. A ray
// against static colliders pulls the boom in so it never sits inside a wall.
// Recoil kicks the view up and partly recovers; shake decays.
// Other modes: 'spectate' (orbit a teammate), 'orbit' (slow cinematic circle),
// 'look' (fixed position looking at a point; intro/results).
// opts.drive (in a vehicle): a chase boom (no shoulder offset) that swings back behind the vehicle a
// moment after the last look input.
const state = { yaw: 0, pitch: CAMERA.startPitch }

let sensitivity = 1
export function setCameraSensitivity(value) {
  sensitivity = value
}
export const getCameraSensitivity = () => sensitivity

export const getYaw = () => state.yaw
export const getPitch = () => state.pitch
export function setView(yaw, pitch = CAMERA.startPitch) {
  state.yaw = yaw
  state.pitch = pitch
}
// Facing (character yaw, +Z = 0) -> camera yaw behind it.
export function syncYawToPlayer(facing = null) {
  if (facing !== null) state.yaw = facing + Math.PI
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)
const followed = new Vector3()
let initialised = false
let aimK = 0 // eased 0..1
let clearance = 1
let recoilPending = 0
let recoilRecover = 0
let shakeAmt = 0
let fovNow = CAMERA.fov
let lookIdle = 0 // s since the last look input (drive: then the camera swings behind)
const fwd = new Vector3()
const right = new Vector3()
const pivot = new Vector3()
const side = new Vector3()
const want = new Vector3()

export function addRecoil(degUp, degSide = 0) {
  recoilPending += (degUp * Math.PI) / 180
  state.yaw += ((degSide * Math.PI) / 180) * (Math.random() - 0.5)
}
export function addShake(amount) {
  shakeAmt = Math.min(1.2, shakeAmt + amount)
}
export function snapFollow() {
  initialised = false
}

// Narrow screens (portrait phones): the FOV is vertical, so a tall screen would see only a
// sliver sideways and the character would fill it. Below CAMERA.fitAspect the view widens
// (every FOV by the same tangent factor, so aim and scope zoom keep their ratios), up to
// CAMERA.fitMax.
const TAN_MAX = Math.tan((CAMERA.fitMax * Math.PI) / 360) / Math.tan((CAMERA.fov * Math.PI) / 360)
export function fitFov(fov, aspect) {
  if (!(aspect > 0) || aspect >= CAMERA.fitAspect) return fov
  const k = Math.min(CAMERA.fitAspect / aspect, TAN_MAX)
  return (Math.atan(Math.tan((fov * Math.PI) / 360) * k) * 360) / Math.PI
}

// The aim ray of the last update (camera position + forward).
export const aimRay = { origin: new Vector3(), dir: new Vector3(0, 0, -1) }

// opts: { mode: 'play'|'scope'|'spectate'|'orbit'|'look', target: {x,y,z} feet,
//   aim (bool), zoomFov (deg), crouch, knocked, lookAt, from, distance,
//   view: { yaw, pitch } (spectate: the watched player's view, eased toward),
//   drive: { distance, height, heading (the vehicle's facing), speed (m/s) } (target = the vehicle) }
export function update(camera, dt, opts) {
  const mode = opts.mode || 'play'
  const scoped = mode === 'scope'
  const fovTarget = opts.aim ? opts.zoomFov || CAMERA.aimFov : CAMERA.fov
  // Look input (aiming slows it down in proportion to the zoom).
  const zoomScale = opts.aim ? CAMERA.aimSensitivity * (fovNow / CAMERA.fov) : 1
  const k = CAMERA.lookSensitivity * sensitivity * zoomScale
  if (mode !== 'look' && mode !== 'orbit' && !opts.noLook) {
    state.yaw -= inputState.look.dx * k
    state.pitch += inputState.look.dy * k
  }
  lookIdle = inputState.look.dx || inputState.look.dy ? 0 : lookIdle + dt
  const drive = mode === 'play' ? opts.drive : null
  if (drive && lookIdle > DRIVE.camFollowDelay && Math.abs(drive.speed) > 1.5) {
    // Swing back behind the vehicle (reversing: still behind it, the way it points).
    const kf = 1 - Math.exp(-DRIVE.camFollowRate * dt * Math.min(1, Math.abs(drive.speed) / 8))
    let d = (drive.heading + Math.PI - state.yaw) % (Math.PI * 2)
    if (d > Math.PI) d -= Math.PI * 2
    if (d < -Math.PI) d += Math.PI * 2
    state.yaw += d * kf
    state.pitch += (DRIVE.camPitch - state.pitch) * kf
  }
  inputState.look.dx = 0
  inputState.look.dy = 0
  // Spectating: turn toward the watched player's own view ({ yaw, pitch }, same convention as ours).
  if (opts.view && mode === 'spectate') {
    const k = 1 - Math.exp(-CAMERA.spectateEase * dt)
    let d = (opts.view.yaw - state.yaw) % (Math.PI * 2)
    if (d > Math.PI) d -= Math.PI * 2
    if (d < -Math.PI) d += Math.PI * 2
    state.yaw += d * k
    state.pitch += (opts.view.pitch - state.pitch) * k
  }
  // Recoil: applied over a few frames, half of it drifts back.
  if (recoilPending > 0) {
    const step = Math.min(recoilPending, recoilPending * dt * 30 + 0.002)
    state.pitch -= step
    recoilPending -= step
    recoilRecover += step * 0.5
  } else if (recoilRecover > 0) {
    const step = Math.min(recoilRecover, dt * 0.6)
    state.pitch += step
    recoilRecover -= step
  }
  state.pitch = clamp(state.pitch, CAMERA.minPitch, CAMERA.maxPitch)

  aimK += ((opts.aim ? 1 : 0) - aimK) * (1 - Math.exp(-CAMERA.aimEase * dt))
  fovNow += (fovTarget - fovNow) * (1 - Math.exp(-CAMERA.aimEase * dt))
  const fovShown = fitFov(fovNow, camera.aspect)
  if (Math.abs(camera.fov - fovShown) > 0.01) {
    camera.fov = fovShown
    camera.updateProjectionMatrix()
  }

  if (mode === 'look') {
    camera.position.copy(opts.from)
    camera.lookAt(opts.lookAt)
    camera.getWorldDirection(aimRay.dir)
    aimRay.origin.copy(camera.position)
    return
  }
  if (mode === 'orbit') {
    const t = opts.time || 0
    const r = opts.distance || 120
    camera.position.set(Math.cos(t * 0.12) * r, opts.height || 70, Math.sin(t * 0.12) * r)
    camera.lookAt(opts.lookAt || want.set(0, 0, 0))
    camera.getWorldDirection(aimRay.dir)
    aimRay.origin.copy(camera.position)
    return
  }

  const p = opts.target
  if (!initialised || Math.hypot(p.x - followed.x, p.y - followed.y, p.z - followed.z) > 15) {
    followed.set(p.x, p.y, p.z)
    initialised = true
    clearance = 1
  } else {
    const t = 1 - Math.exp(-CAMERA.followLerp * dt)
    followed.x = p.x
    followed.z = p.z
    followed.y += (p.y - followed.y) * t
  }

  const cp = Math.cos(state.pitch)
  fwd.set(-Math.sin(state.yaw) * cp, -Math.sin(state.pitch), -Math.cos(state.yaw) * cp)
  right.set(Math.cos(state.yaw), 0, -Math.sin(state.yaw))
  const height = drive ? drive.height : opts.knocked ? CAMERA.knockedHeight : (opts.crouch ? CAMERA.crouchHeight + 0.3 : CAMERA.height) + (CAMERA.aimHeight - CAMERA.height) * aimK

  if (scoped) {
    camera.position.set(followed.x, followed.y + (opts.crouch ? 1.3 : 1.58), followed.z)
    camera.position.addScaledVector(fwd, 0.25)
  } else {
    const spectate = mode === 'spectate'
    const dist = drive ? drive.distance : spectate ? CAMERA.spectateDistance : CAMERA.distance + (CAMERA.aimDistance - CAMERA.distance) * aimK
    const shoulder = drive ? 0 : spectate ? 0.3 : CAMERA.shoulder + (CAMERA.aimShoulder - CAMERA.shoulder) * aimK
    pivot.set(followed.x, followed.y + height, followed.z)
    side.copy(pivot).addScaledVector(right, shoulder)
    // Shoulder offset first (a wall on the right pulls it in), then the boom.
    const hs = segmentClear(pivot.x, pivot.y, pivot.z, side.x, side.y, side.z)
    if (hs < 1) side.copy(pivot).addScaledVector(right, shoulder * Math.max(0, hs - 0.15))
    want.copy(side).addScaledVector(fwd, -dist)
    const hit = segmentClear(side.x, side.y, side.z, want.x, want.y, want.z)
    const target = hit < 1 ? Math.max(0.05, hit - 0.06) : 1
    clearance = target < clearance ? target : clearance + (target - clearance) * (1 - Math.exp(-CAMERA.clearEase * dt))
    camera.position.copy(side).addScaledVector(fwd, -dist * clearance)
  }
  if (shakeAmt > 0.001) {
    camera.position.x += (Math.random() - 0.5) * shakeAmt * 0.25
    camera.position.y += (Math.random() - 0.5) * shakeAmt * 0.25
    camera.position.z += (Math.random() - 0.5) * shakeAmt * 0.25
    shakeAmt *= Math.exp(-CAMERA.shakeDecay * dt)
  }
  want.copy(camera.position).add(fwd)
  camera.lookAt(want)
  aimRay.origin.copy(camera.position)
  aimRay.dir.copy(fwd)
}
