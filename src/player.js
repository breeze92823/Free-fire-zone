import { inputState } from './input.js'
import { getYaw, syncYawToPlayer } from './camera.js'
import { RAPIER, alpha, onAfterTick, onTick, world } from './physics.js'
import { PHYSICS, PLAYER_DIMS, SPAWN, SPAWN_FACING } from './config.js'

// The local player singleton, mutated in place. A kinematic Rapier capsule
// driven by Rapier's KinematicCharacterController: it slides along walls,
// autosteps small ledges, climbs slopes up to PHYSICS.maxSlope, snaps down
// steps and shoves dynamic bodies. Gravity, jumping (with coyote time and a
// jump buffer) and acceleration are ours; collision resolution is Rapier's.
// The shooter sets `moveSpeed` (run / sprint / aim / crouch / crawl),
// `frozen` (countdown, dead), `canJump`, a dash `push`, and knockback through
// `impulse`; the body always faces the camera (over-the-shoulder strafing).
export const player = {
  position: { x: 0, y: 0, z: 0 }, // capsule base (feet), at the latest tick
  renderPosition: { x: 0, y: 0, z: 0 }, // feet, interpolated for this frame
  velocity: { x: 0, y: 0, z: 0 },
  grounded: true,
  facing: SPAWN_FACING, // yaw the character model faces, radians
  dims: { ...PLAYER_DIMS },
  moveSpeed: PHYSICS.walkSpeed,
  frozen: false,
  canJump: true,
  push: null, // { x, z, t } dash velocity override
  impulse: null, // { x, z } knockback (actor.impulse), consumed each tick
  onFellOut: null, // fn() when below PHYSICS.killY
  jumped: false, // edge, for sounds
  landed: false, // edge, for sounds
  riding: false, // seated in a vehicle (setRide): the body follows the seat, its collider is off
}

const HALF = PLAYER_DIMS.height / 2
const STILL = { x: 0, z: 0 }
const prev = { x: 0, y: 0, z: 0 }
let body = null
let collider = null
let controller = null
let sinceGrounded = 0
let jumpQueued = 0

export function createPlayerBody() {
  const r = PLAYER_DIMS.radius
  body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(SPAWN.x, SPAWN.y + HALF, SPAWN.z))
  collider = world.createCollider(RAPIER.ColliderDesc.capsule(HALF - r, r).setFriction(0), body)

  controller = world.createCharacterController(0.02)
  controller.setUp({ x: 0, y: 1, z: 0 })
  controller.enableAutostep(PHYSICS.stepHeight, 0.15, false)
  controller.enableSnapToGround(PHYSICS.snapToGround)
  controller.setMaxSlopeClimbAngle((PHYSICS.maxSlope * Math.PI) / 180)
  controller.setMinSlopeSlideAngle(((PHYSICS.maxSlope + 5) * Math.PI) / 180)
  controller.setApplyImpulsesToDynamicBodies(true)
  controller.setCharacterMass(PHYSICS.pushMass)

  resetPlayer()
  onTick(step)
  onAfterTick(followSeat)
}

// Seated in a vehicle: `seat(out)` fills out = { x, y, z (feet), vx, vy, vz, yaw } from the vehicle's
// pose right after each physics tick, so the player renders exactly with it (same interpolation).
// The capsule's collider is switched off meanwhile. null gets out (then resetPlayer places the body).
// look: a passenger seat, where the player faces (and aims) with the camera rather than the vehicle.
let seat = null
let seatLook = false
const seatOut = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0 }
export function setRide(fn, look = false) {
  seat = fn
  seatLook = !!fn && look
  player.riding = !!fn
  collider?.setEnabled(!fn)
  jumpQueued = 0
  if (fn) {
    followSeat()
    prev.x = player.renderPosition.x = player.position.x
    prev.y = player.renderPosition.y = player.position.y
    prev.z = player.renderPosition.z = player.position.z
  }
}
function followSeat() {
  if (!seat) return
  seat(seatOut)
  player.position.x = seatOut.x
  player.position.y = seatOut.y
  player.position.z = seatOut.z
  player.velocity.x = seatOut.vx
  player.velocity.y = seatOut.vy
  player.velocity.z = seatOut.vz
  player.facing = seatLook ? getYaw() + Math.PI : seatOut.yaw
  player.grounded = true
  body.setNextKinematicTranslation({ x: seatOut.x, y: seatOut.y + HALF, z: seatOut.z })
}

export function resetPlayer(spawn = SPAWN, facing = SPAWN_FACING) {
  player.position.x = prev.x = player.renderPosition.x = spawn.x
  player.position.y = prev.y = player.renderPosition.y = spawn.y
  player.position.z = prev.z = player.renderPosition.z = spawn.z
  player.velocity.x = player.velocity.y = player.velocity.z = 0
  player.grounded = true
  player.facing = facing
  player.push = null
  body?.setTranslation({ x: spawn.x, y: spawn.y + HALF, z: spawn.z }, true)
  body?.setNextKinematicTranslation({ x: spawn.x, y: spawn.y + HALF, z: spawn.z })
}

export function respawn() {
  resetPlayer()
  syncYawToPlayer()
}

function approach2D(v, targetX, targetZ, maxDelta) {
  const dx = targetX - v.x
  const dz = targetZ - v.z
  const dist = Math.hypot(dx, dz)
  if (dist <= maxDelta || dist === 0) {
    v.x = targetX
    v.z = targetZ
  } else {
    v.x += (dx / dist) * maxDelta
    v.z += (dz / dist) * maxDelta
  }
}

function step(dt) {
  prev.x = player.position.x
  prev.y = player.position.y
  prev.z = player.position.z
  if (seat) {
    inputState.jump = false
    return // followSeat places the body after the tick
  }

  const yaw = getYaw()
  const fwdX = -Math.sin(yaw)
  const fwdZ = -Math.cos(yaw)
  const rightX = Math.cos(yaw)
  const rightZ = -Math.sin(yaw)
  const mv = player.frozen ? STILL : inputState.move
  const len = Math.hypot(mv.x, mv.z)
  const scale = len > 1 ? 1 / len : 1
  const wishX = (fwdX * mv.z + rightX * mv.x) * scale
  const wishZ = (fwdZ * mv.z + rightZ * mv.x) * scale
  const speed = player.moveSpeed

  const rate = !player.grounded ? PHYSICS.airAccel : len > 0.01 ? PHYSICS.accel : PHYSICS.decel
  if (player.push && player.push.t > 0) {
    player.velocity.x = player.push.x
    player.velocity.z = player.push.z
    player.push.t -= dt
  } else approach2D(player.velocity, wishX * speed, wishZ * speed, rate * dt)
  if (player.impulse) {
    player.velocity.x += player.impulse.x
    player.velocity.z += player.impulse.z
    player.impulse.x = player.impulse.y = player.impulse.z = 0
  }

  if (inputState.jump) {
    if (!player.frozen && player.canJump) jumpQueued = PHYSICS.jumpBuffer
    inputState.jump = false
  }
  sinceGrounded = player.grounded ? 0 : sinceGrounded + dt
  let jumped = false
  if (jumpQueued > 0 && sinceGrounded <= PHYSICS.coyoteTime) {
    player.velocity.y = PHYSICS.jumpSpeed
    jumpQueued = 0
    sinceGrounded = PHYSICS.coyoteTime + 1
    jumped = true
    player.jumped = true
  }
  jumpQueued = Math.max(0, jumpQueued - dt)

  player.velocity.y += PHYSICS.gravity * dt
  if (player.grounded && !jumped && player.velocity.y < -2) player.velocity.y = -2

  const wasGrounded = player.grounded
  const fallSpeed = player.velocity.y
  const desired = { x: player.velocity.x * dt, y: player.velocity.y * dt, z: player.velocity.z * dt }
  controller.computeColliderMovement(collider, desired, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS | RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC)
  const moved = controller.computedMovement()
  player.grounded = !jumped && controller.computedGrounded()
  if (!wasGrounded && player.grounded && fallSpeed < -6) player.landed = true

  if (player.velocity.y > 0 && moved.y < desired.y * 0.5) player.velocity.y = 0
  if (player.grounded && player.velocity.y < 0) player.velocity.y = Math.max(player.velocity.y, -2)

  const t = body.translation()
  const next = { x: t.x + moved.x, y: t.y + moved.y, z: t.z + moved.z }
  body.setNextKinematicTranslation(next)
  player.position.x = next.x
  player.position.y = next.y - HALF
  player.position.z = next.z

  if (player.position.y < PHYSICS.killY) {
    if (player.onFellOut) player.onFellOut()
    else respawn()
    return
  }

  // Over-the-shoulder: the body always faces where the camera looks.
  player.facing = yaw + Math.PI
}

// Called once per frame after the physics ticks: interpolated feet position.
export function interpolate() {
  const p = player.position
  const r = player.renderPosition
  r.x = prev.x + (p.x - prev.x) * alpha
  r.y = prev.y + (p.y - prev.y) * alpha
  r.z = prev.z + (p.z - prev.z) * alpha
}
