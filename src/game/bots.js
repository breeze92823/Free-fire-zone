// Bot players. Each bot drives its own Rapier kinematic capsule through a
// KinematicCharacterController (same physics as the player) and thinks a few
// times a second: perceive (sight cone + line of sight, hearing gunfire),
// pick a goal (fight, revive a teammate, investigate, loot, stay in the zone,
// roam) and path to it on the nav grid. In a fight they strafe, crouch,
// burst-fire with an aim error that tightens while they track a target,
// reload behind the action, heal, raise frost walls and throw grenades.
import { Vector3 } from 'three'
import { BOTS, HEALTH, PHYSICS, PLAYER_DIMS } from '../config.js'
import { RAPIER, alpha, onTick, world } from '../physics.js'
import { G, on } from './state.js'
import { castWorld, fire, lineOfSight, resolveMelee, revive, selectSlot, startReload } from './combat.js'
import { dash, deployWall, startHeal, startThrow, ultReady, useUltimate } from './items.js'
import { crateNear, openCrate, allCrates, activeDrops } from './loot.js'
import { findPath, randomWalkable } from './navgrid.js'

const HALF = PLAYER_DIMS.height / 2
const rnd = (a, b) => a + Math.random() * (b - a)
const tmp = new Vector3()
const tmp2 = new Vector3()
const tmp3 = new Vector3()
const aimDir = new Vector3()
const DEG = Math.PI / 180

const bots = []

// --- Movement: one KCC per bot ----------------------------------------------------------------
class Mover {
  constructor(actor) {
    this.actor = actor
    const r = PLAYER_DIMS.radius
    this.body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, -50, 0))
    this.collider = world.createCollider(RAPIER.ColliderDesc.capsule(HALF - r, r).setFriction(0), this.body)
    this.kcc = world.createCharacterController(0.02)
    this.kcc.setUp({ x: 0, y: 1, z: 0 })
    this.kcc.enableAutostep(PHYSICS.stepHeight, 0.15, false)
    this.kcc.enableSnapToGround(PHYSICS.snapToGround)
    this.kcc.setMaxSlopeClimbAngle((PHYSICS.maxSlope * Math.PI) / 180)
    this.kcc.setMinSlopeSlideAngle(((PHYSICS.maxSlope + 5) * Math.PI) / 180)
    this.prev = new Vector3()
    this.curr = new Vector3()
    this.vel = new Vector3()
    this.wishX = 0
    this.wishZ = 0
    this.speed = PHYSICS.walkSpeed
    this.jump = false
    this.grounded = true
    this.push = null
  }
  teleport(p) {
    this.prev.copy(p)
    this.curr.copy(p)
    this.vel.set(0, 0, 0)
    this.body.setTranslation({ x: p.x, y: p.y + HALF, z: p.z }, true)
    this.body.setNextKinematicTranslation({ x: p.x, y: p.y + HALF, z: p.z })
  }
  step(dt) {
    this.prev.copy(this.curr)
    const a = this.actor
    if (a.life === 'dead') return
    const v = this.vel
    let tx = this.wishX * this.speed
    let tz = this.wishZ * this.speed
    if (this.push && this.push.t > 0) {
      tx = this.push.x
      tz = this.push.z
      this.push.t -= dt
    }
    const rate = !this.grounded ? PHYSICS.airAccel : Math.hypot(this.wishX, this.wishZ) > 0.01 ? PHYSICS.accel : PHYSICS.decel
    const dx = tx - v.x
    const dz = tz - v.z
    const d = Math.hypot(dx, dz)
    const m = rate * dt
    if (d <= m) {
      v.x = tx
      v.z = tz
    } else {
      v.x += (dx / d) * m
      v.z += (dz / d) * m
    }
    // Knockback impulses from hits/explosions.
    v.x += a.impulse.x
    v.z += a.impulse.z
    a.impulse.set(0, 0, 0)
    let jumped = false
    if (this.jump && this.grounded && a.life === 'alive') {
      v.y = PHYSICS.jumpSpeed
      jumped = true
    }
    this.jump = false
    v.y += PHYSICS.gravity * dt
    if (this.grounded && !jumped && v.y < -2) v.y = -2
    const desired = { x: v.x * dt, y: v.y * dt, z: v.z * dt }
    this.kcc.computeColliderMovement(this.collider, desired, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS | RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC)
    const mv = this.kcc.computedMovement()
    this.grounded = !jumped && this.kcc.computedGrounded()
    if (v.y > 0 && mv.y < desired.y * 0.5) v.y = 0
    if (this.grounded && v.y < 0) v.y = Math.max(v.y, -2)
    const t = this.body.translation()
    const next = { x: t.x + mv.x, y: t.y + mv.y, z: t.z + mv.z }
    this.body.setNextKinematicTranslation(next)
    this.curr.set(next.x, next.y - HALF, next.z)
    if (this.curr.y < PHYSICS.killY) this.actor.fellOut = true
  }
  interpolate(out) {
    return out.lerpVectors(this.prev, this.curr, alpha)
  }
  dispose() {
    world.removeCharacterController(this.kcc)
    world.removeRigidBody(this.body)
  }
}

// --- Brain ------------------------------------------------------------------------------------
class Bot {
  constructor(actor) {
    this.actor = actor
    actor.bot = this
    this.mover = new Mover(actor)
    this.think = rnd(0, BOTS.thinkInterval)
    this.target = null
    this.targetSeenAt = -99
    this.trackTime = 0
    this.reactAt = 0
    this.lastKnown = new Vector3()
    this.lastKnownAt = -99
    this.goal = null
    this.goalKind = 'roam'
    this.path = null
    this.pathI = 0
    this.repathAt = 0
    this.strafe = 0
    this.strafeUntil = 0
    this.burstLeft = 0
    this.burstPauseUntil = 0
    this.crouchUntil = 0
    this.stuckT = 0
    this.lastPos = new Vector3()
    this.progressCheckAt = 0
    this.reviving = null
    this.aimErr = new Vector3()
    this.aimErrTarget = new Vector3()
    this.nextUtilityAt = 0
    this.skill = rnd(0.75, 1.15) // aim quality multiplier (lower = better)
    this.heardAt = -99
    this.prefersHead = Math.random() < 0.25
    this.skipCrates = new Set()
    this.lootCrate = null
    this.lootUntil = 0
  }

  spawn(p, facing) {
    this.mover.teleport(p)
    this.actor.pos.copy(p)
    this.actor.facing = facing
    this.target = null
    this.path = null
    this.goal = null
    this.reviving = null
    this.repathAt = 0
  }

  // --- Perception --------------------------------------------------------------
  canSee(other, eye) {
    if (other.life === 'dead' || other.hidden) return false
    const cloaked = G.time < other.cloakUntil
    other.chest(tmp2)
    const d = eye.distanceTo(tmp2)
    const range = this.actor.def.kind === 'sniper' || this.actor.def.kind === 'dmr' ? BOTS.sniperRange : BOTS.viewRange
    if (d > (cloaked ? 7 : range)) return false
    // View cone (wide: they glance around), always aware very close by.
    if (d > 6) {
      const fx = Math.sin(this.actor.facing)
      const fz = Math.cos(this.actor.facing)
      const dot = ((tmp2.x - eye.x) * fx + (tmp2.z - eye.z) * fz) / Math.max(0.01, Math.hypot(tmp2.x - eye.x, tmp2.z - eye.z))
      if (dot < Math.cos((BOTS.fov / 2) * DEG)) return false
    }
    if (lineOfSight(eye, tmp2)) return true
    other.head(tmp2)
    return lineOfSight(eye, tmp2)
  }

  perceive() {
    const a = this.actor
    const eye = a.eye(tmp3)
    let best = null
    let bestScore = Infinity
    for (const o of G.actors) {
      if (o.team === a.team || o.life === 'dead') continue
      const d = o.pos.distanceTo(a.pos)
      if (d > BOTS.sniperRange) continue
      if (!this.canSee(o, eye)) continue
      // Prefer close, standing threats; finish the knocked when nothing else is around.
      let score = d + (o.life === 'knocked' ? 6 : 0) + (o === this.target ? -8 : 0)
      if (o.isPlayer) score += 4 // a tiny bit of mercy for the human
      if (score < bestScore) {
        bestScore = score
        best = o
      }
    }
    if (best) {
      if (best !== this.target) {
        this.target = best
        this.trackTime = 0
        this.reactAt = G.time + rnd(BOTS.reaction[0], BOTS.reaction[1]) * (best.isPlayer ? 1.25 : 1)
        this.burstLeft = 0
      }
      this.targetSeenAt = G.time
      this.lastKnown.copy(best.pos)
      this.lastKnownAt = G.time
    } else if (this.target && G.time - this.targetSeenAt > 1.2) {
      this.target = null
    }
  }

  // --- Goals -------------------------------------------------------------------
  setGoal(p, kind) {
    if (this.goal && this.goalKind === kind && this.goal.distanceTo(p) < 3 && this.path) return
    this.goal = this.goal || new Vector3()
    this.goal.copy(p)
    this.goalKind = kind
    this.repathAt = 0
  }

  decide() {
    const a = this.actor
    const zone = G.match?.zone
    const z = zone?.state
    if (a.life === 'knocked') {
      // Crawl toward the nearest standing teammate.
      let near = null
      let nd = 60
      for (const o of G.actors) {
        if (o.team !== a.team || o === a || o.life !== 'alive') continue
        const d = o.pos.distanceTo(a.pos)
        if (d < nd) {
          nd = d
          near = o
        }
      }
      if (near && nd > 2) this.setGoal(near.pos, 'crawl')
      else this.goal = null
      return
    }
    // Zone first: get inside with margin.
    if (z && zone.outside(a.pos.x, a.pos.z, 6)) {
      const p = randomWalkable(G.nav, z.center.x, z.center.y, Math.max(5, z.radius * 0.5))
      if (p) this.setGoal(tmp.set(p.x, p.y, p.z), 'zone')
      return
    }
    if (this.target) {
      this.goalKind = 'fight'
      return
    }
    // Revive a knocked teammate if it is calm.
    if (G.time - this.heardAt > 2) {
      for (const o of G.actors) {
        if (o.team !== a.team || o === a || o.life !== 'knocked') continue
        if (o.pos.distanceTo(a.pos) < BOTS.reviveRange) {
          this.setGoal(o.pos, 'revive')
          this.reviving = o
          return
        }
      }
    }
    this.reviving = null
    // Investigate recent contacts.
    if (G.time - this.lastKnownAt < 7) {
      this.setGoal(this.lastKnown, 'investigate')
      return
    }
    // Supplies: short on something important and a reachable crate close by.
    if (this.goalKind === 'loot' && G.time > this.lootUntil) {
      if (this.lootCrate) this.skipCrates.add(this.lootCrate)
      this.goal = null
      this.goalKind = 'roam'
    }
    const needs = a.items.medkit < 1 || a.weapon.reserve < (a.def.mag ?? 0) || (a.vest === 0 && Math.random() < 0.25)
    if (needs && this.goalKind !== 'loot') {
      let best = null
      let bd = 28
      for (const c of allCrates()) {
        if (c.opened || this.skipCrates.has(c) || !crateReachable(c)) continue
        const d = c.pos.distanceTo(a.pos)
        if (d < bd && (!z || !zone.outside(c.pos.x, c.pos.z, 4))) {
          bd = d
          best = c
        }
      }
      if (best) {
        this.setGoal(best.pos, 'loot')
        this.lootCrate = best
        this.lootUntil = G.time + 6 + bd / 4
        return
      }
    }
    for (const d of activeDrops()) {
      if (!d.opened && d.landed && d.pos.distanceTo(a.pos) < 80 && Math.random() < 0.5) {
        this.setGoal(d.pos, 'loot')
        this.lootCrate = null
        this.lootUntil = G.time + 25
        return
      }
    }
    if (this.goal && this.goalKind !== 'fight' && this.goal.distanceTo(a.pos) > 4 && this.path) return
    // Roam: toward the enemy half / the zone / points of interest.
    const enemyCenter = tmp2.set(0, 0, 0)
    let n = 0
    for (const o of G.actors) {
      if (o.team === a.team || o.life === 'dead') continue
      enemyCenter.add(o.pos)
      n++
    }
    if (n) enemyCenter.divideScalar(n)
    const cx = z ? z.center.x : 0
    const cz = z ? z.center.y : 0
    const r = z ? Math.max(12, z.radius * 0.7) : 80
    // Mostly hunt: head for the nearest enemy's area (where the fights are), else the zone.
    let near = null
    let nd = Infinity
    for (const o of G.actors) {
      if (o.team === a.team || o.life === 'dead') continue
      const d = o.pos.distanceTo(a.pos)
      if (d < nd) {
        nd = d
        near = o
      }
    }
    const t = Math.random()
    const hunt = near && t < 0.7
    const bx = hunt ? near.pos.x : t < 0.85 ? (enemyCenter.x + cx) / 2 : cx
    const bz = hunt ? near.pos.z : t < 0.85 ? (enemyCenter.z + cz) / 2 : cz
    const p = randomWalkable(G.nav, bx, bz, hunt ? 18 : t < 0.85 ? 30 : r, (x, zz) => !zone || !zone.outside(x, zz, 8))
    if (p) this.setGoal(tmp.set(p.x, p.y, p.z), 'roam')
  }

  repath() {
    const a = this.actor
    this.repathAt = G.time + BOTS.repathInterval * rnd(0.8, 1.3)
    if (!this.goal || !G.nav) {
      this.path = null
      return
    }
    this.path = findPath(G.nav, a.pos.x, a.pos.z, this.goal.x, this.goal.z)
    this.pathI = 0
  }

  // --- Per frame -----------------------------------------------------------------
  update(dt) {
    const a = this.actor
    const mv = this.mover
    mv.interpolate(a.pos)
    a.grounded = mv.grounded
    a.vel.copy(mv.vel)
    if (a.life === 'dead') {
      mv.wishX = mv.wishZ = 0
      return
    }
    if (G.phase !== 'playing') {
      mv.wishX = mv.wishZ = 0
      if (G.phase === 'countdown' || G.phase === 'intro') a.ready = 0
      if (G.phase !== 'ending') return
    }

    this.think -= dt
    if (this.think <= 0) {
      this.think = BOTS.thinkInterval * rnd(0.8, 1.2)
      if (a.life === 'alive') this.perceive()
      this.decide()
      this.utilities()
    }

    // Movement intent
    let wishX = 0
    let wishZ = 0
    let speed = PHYSICS.walkSpeed
    const fighting = this.target && a.life === 'alive' && G.time - this.targetSeenAt < 1.2
    if (a.life === 'knocked') speed = PHYSICS.crawlSpeed
    if (this.goal && (!fighting || this.goalKind === 'zone')) {
      if (G.time >= this.repathAt || !this.path) this.repath()
      const wp = this.path && this.path[this.pathI]
      if (wp) {
        const dx = wp.x - a.pos.x
        const dz = wp.z - a.pos.z
        const d = Math.hypot(dx, dz)
        if (d < 0.9) this.pathI++
        else {
          wishX = dx / d
          wishZ = dz / d
        }
      } else {
        const dx = this.goal.x - a.pos.x
        const dz = this.goal.z - a.pos.z
        const d = Math.hypot(dx, dz)
        if (d > 1.2) {
          wishX = dx / d
          wishZ = dz / d
        }
      }
      if (a.life === 'alive' && !fighting && this.goal.distanceTo(a.pos) > 25 && this.goalKind !== 'revive') speed = PHYSICS.sprintSpeed
    }

    // Revive / loot on arrival
    if (a.life === 'alive' && this.goalKind === 'revive' && this.reviving) {
      const o = this.reviving
      if (o.life !== 'knocked') {
        this.reviving = null
        this.goal = null
      } else if (o.pos.distanceTo(a.pos) < 1.9) {
        wishX = wishZ = 0
        a.crouch = true
        o.reviveProgress += dt
        o.revivedBy = a
        a.facing = Math.atan2(o.pos.x - a.pos.x, o.pos.z - a.pos.z)
        if (o.reviveProgress >= HEALTH.reviveTime) {
          revive(o, a)
          this.reviving = null
          this.goal = null
          a.crouch = false
        }
      }
    }
    if (a.life === 'alive' && this.goalKind === 'loot') {
      const c = crateNear(a)
      if (c) {
        openCrate(a, c)
        this.goal = null
        this.goalKind = 'roam'
      }
    }

    // Fight: face the target, strafe, shoot.
    if (fighting) this.fight(dt, (x, z, s) => {
      wishX = x
      wishZ = z
      speed = s
    })
    else {
      this.trackTime = 0
      if (a.life === 'alive') a.crouch = this.goalKind === 'revive' && a.crouch
      // Face where we walk; look around a little.
      if (Math.hypot(wishX, wishZ) > 0.1) a.facing = turnToward(a.facing, Math.atan2(wishX, wishZ), 8 * dt)
      a.pitch += (0 - a.pitch) * Math.min(1, dt * 4)
      a.ready = Math.max(0, a.ready - dt * 2)
      // Reload / swap back while calm.
      if (a.life === 'alive' && a.weapon.def.mag && a.weapon.ammo < a.weapon.def.mag * 0.5) startReload(a)
    }

    // Stuck handling: little progress while trying to move -> hop, then repath.
    if (Math.hypot(wishX, wishZ) > 0.1 && a.life === 'alive') {
      if (G.time >= this.progressCheckAt) {
        const moved = Math.hypot(a.pos.x - this.lastPos.x, a.pos.z - this.lastPos.z)
        if (moved < 0.6) {
          this.stuckT++
          mv.jump = true
          if (this.stuckT > 1) {
            this.repathAt = 0
            if (this.stuckT > 3) {
              this.goal = null
              this.stuckT = 0
            }
          }
        } else this.stuckT = 0
        this.lastPos.copy(a.pos)
        this.progressCheckAt = G.time + 1
      }
    }

    if (a.crouch) speed = Math.min(speed, PHYSICS.crouchSpeed)
    if (a.healT >= 0) speed = Math.min(speed, PHYSICS.crouchSpeed)
    if (G.time < a.ultActiveUntil && a.operative === 'nova') speed *= 1.3
    mv.wishX = wishX
    mv.wishZ = wishZ
    mv.speed = speed
    if (a.pendingMelee && G.time >= a.pendingMelee) resolveMelee(a)
  }

  fight(dt, setMove) {
    const a = this.actor
    const t = this.target
    this.trackTime += dt
    const dist = t.pos.distanceTo(a.pos)
    // Aim point: chest (or head for the sharp ones), plus a wandering error that settles.
    if (this.prefersHead && t.life === 'alive') t.head(tmp)
    else t.chest(tmp)
    const E = BOTS.aimError
    const errDeg = (E.settle + (E.start - E.settle) * Math.max(0, 1 - this.trackTime / E.settleTime)) * this.skill * (t.isPlayer ? 1.15 : 1) * (t.crouch ? 1.1 : 1)
    if (Math.random() < dt * 3) this.aimErrTarget.set(rnd(-1, 1), rnd(-0.6, 0.6), rnd(-1, 1)).multiplyScalar(Math.tan(errDeg * DEG) * dist)
    this.aimErr.lerp(this.aimErrTarget, Math.min(1, dt * 4))
    tmp.add(this.aimErr)
    // Lead moving targets a little.
    tmp.addScaledVector(t.vel, Math.min(0.15, dist / 400))
    const eye = a.eye(tmp2)
    aimDir.subVectors(tmp, eye).normalize()
    const yaw = Math.atan2(aimDir.x, aimDir.z)
    a.facing = turnToward(a.facing, yaw, 9 * dt)
    a.pitch = -Math.asin(Math.max(-1, Math.min(1, aimDir.y)))
    a.ready = 1
    a.aiming = dist > 11 && a.def.kind !== 'shotgun'

    // Weapon choice: knife/fists only if nothing else; secondary when primary is dry.
    const prim = a.slots[0]
    const sec = a.slots[1]
    if (a.slot >= 2 && (prim.ammo + prim.reserve > 0 || sec.ammo + sec.reserve > 0)) selectSlot(a, prim.ammo + prim.reserve > 0 ? 0 : 1)
    else if (a.slot === 0 && prim.ammo === 0 && prim.reserve === 0 && sec.ammo + sec.reserve > 0) selectSlot(a, 1)
    else if (a.slot === 0 && dist < 9 && prim.def.kind === 'sniper' && sec.ammo > 0) selectSlot(a, 1)

    // Movement: keep a preferred distance and strafe.
    const def = a.def
    const ideal = def.kind === 'shotgun' ? 7 : def.kind === 'smg' || def.kind === 'pistol' ? 13 : def.kind === 'sniper' || def.kind === 'dmr' ? 45 : 24
    const fx = Math.sin(yaw)
    const fz = Math.cos(yaw)
    if (G.time > this.strafeUntil) {
      this.strafe = Math.random() < 0.15 ? 0 : Math.random() < 0.5 ? -1 : 1
      this.strafeUntil = G.time + rnd(0.5, 1.4)
      if (Math.random() < 0.18 && a.life === 'alive') this.crouchUntil = G.time + rnd(0.8, 2)
      if (Math.random() < 0.1) this.mover.jump = true
    }
    a.crouch = G.time < this.crouchUntil && dist > 10
    const approach = dist > ideal * 1.3 ? 1 : dist < ideal * 0.6 ? -0.7 : 0
    let mx = fx * approach + Math.cos(yaw) * this.strafe * 0.9
    let mz = fz * approach - Math.sin(yaw) * this.strafe * 0.9
    const ml = Math.hypot(mx, mz)
    if (ml > 1) {
      mx /= ml
      mz /= ml
    }
    // Don't strafe into walls: probe ahead.
    if (ml > 0.1) {
      tmp3.set(mx, 0, mz).normalize()
      a.chest(tmp2)
      const block = castWorld(tmp2, tmp3, 1.4)
      if (block) {
        this.strafe = -this.strafe
        mx = fx * approach
        mz = fz * approach
      }
    }
    setMove(mx, mz, a.aiming ? PHYSICS.aimSpeed : PHYSICS.walkSpeed)

    // Shooting
    if (a.life !== 'alive' || G.phase !== 'playing' || a.reloadT >= 0) return
    if (a.weapon.ammo <= 0 && a.def.mag) {
      startReload(a)
      return
    }
    if (G.time < this.reactAt) return
    const visible = G.time - this.targetSeenAt < 0.35
    if (!visible) return
    if (def.kind === 'knife' || def.kind === 'fists') {
      if (dist < def.range) fire(a, eye, aimDir)
      else setMove(fx, fz, PHYSICS.sprintSpeed)
      return
    }
    if (dist > def.range * 0.95) return
    if (G.time < this.burstPauseUntil) return
    if (def.auto) {
      if (this.burstLeft <= 0) {
        this.burstLeft = Math.round(rnd(BOTS.burst[0], BOTS.burst[1]) * (dist < 15 ? 1.6 : 1))
      }
      if (fire(a, eye, aimDir, Math.hypot(this.mover.vel.x, this.mover.vel.z))) {
        this.burstLeft--
        if (this.burstLeft <= 0) this.burstPauseUntil = G.time + rnd(BOTS.burstPause[0], BOTS.burstPause[1]) * (dist > 30 ? 1.5 : 1)
      }
    } else {
      // Semi-auto: a human-ish cadence on top of the weapon's own interval.
      if (fire(a, eye, aimDir, Math.hypot(this.mover.vel.x, this.mover.vel.z))) this.burstPauseUntil = G.time + rnd(0.05, 0.35) + (def.kind === 'sniper' ? rnd(0.3, 0.9) : 0)
    }
  }

  // Heal, walls, grenades, ability, dash: checked on think ticks.
  utilities() {
    const a = this.actor
    if (a.life !== 'alive' || G.phase !== 'playing' || G.time < this.nextUtilityAt) return
    const hpK = a.hp / a.maxHp
    const fighting = this.target && G.time - this.targetSeenAt < 1
    const underFire = G.time - a.lastDamageAt < 1.2
    if (!fighting && !underFire && hpK < BOTS.medkitBelow && a.items.medkit > 0 && a.healT < 0) {
      if (startHeal(a)) this.nextUtilityAt = G.time + 3
      return
    }
    if (fighting && underFire && hpK < BOTS.wallBelow && a.items.frostWall > 0 && Math.random() < 0.5) {
      // Face the threat first so the wall lands between.
      a.facing = Math.atan2(this.target.pos.x - a.pos.x, this.target.pos.z - a.pos.z)
      if (deployWall(a)) {
        this.nextUtilityAt = G.time + 4
        this.burstPauseUntil = G.time + 1.2
        return
      }
    }
    if (fighting && a.items.frag > 0 && Math.random() < BOTS.grenadeChance * 0.25) {
      const d = this.target.pos.distanceTo(a.pos)
      if (d > 9 && d < 26 && startThrow(a, 'frag')) {
        this.nextUtilityAt = G.time + 5
        return
      }
    }
    if (ultReady(a) && (fighting || (a.operative === 'jin' && hpK < 0.6))) {
      useUltimate(a)
      this.nextUtilityAt = G.time + 2
      return
    }
    if (underFire && hpK < 0.5 && Math.random() < 0.3) {
      const side = Math.random() < 0.5 ? -1 : 1
      const p = dash(a, Math.cos(a.facing) * side, -Math.sin(a.facing) * side)
      if (p) this.mover.push = p
    }
  }

  dispose() {
    this.mover.dispose()
  }
}

// A crate counts as reachable when a walkable nav cell on its floor lies within reach of it.
function crateReachable(c) {
  if (c.reach !== undefined) return c.reach
  const nav = G.nav
  c.reach = false
  if (!nav) return false
  const r = Math.ceil(2.2 / nav.cell)
  const ci = Math.floor((c.pos.x - nav.minX) / nav.cell)
  const cj = Math.floor((c.pos.z - nav.minZ) / nav.cell)
  for (let dj = -r; dj <= r && !c.reach; dj++) {
    for (let di = -r; di <= r; di++) {
      const i = ci + di
      const j = cj + dj
      if (i < 0 || j < 0 || i >= nav.w || j >= nav.h) continue
      const k = j * nav.w + i
      if (nav.walk[k] && nav.comp[k] === nav.main && Math.abs(nav.floor[k] - c.pos.y) < 0.8) {
        c.reach = true
        break
      }
    }
  }
  return c.reach
}

function turnToward(from, to, max) {
  const diff = Math.atan2(Math.sin(to - from), Math.cos(to - from))
  if (Math.abs(diff) <= max) return to
  return from + Math.sign(diff) * max
}

// --- Public API -----------------------------------------------------------------------------
let ticking = false
export function createBot(actor) {
  const b = new Bot(actor)
  bots.push(b)
  if (!ticking) {
    ticking = true
    onTick((dt) => {
      for (const bot of bots) bot.mover.step(dt)
    })
  }
  return b
}

export function updateBots(dt) {
  for (const b of bots) b.update(dt)
}

// Bots aim along this for their held-weapon model.
export function botAimDir(actor, out) {
  const p = actor.pitch
  return out.set(Math.sin(actor.facing) * Math.cos(p), -Math.sin(p), Math.cos(actor.facing) * Math.cos(p))
}

export function removeAllBots() {
  for (const b of bots) b.dispose()
  bots.length = 0
}

// Gunfire is heard: bots within range turn toward it and investigate.
on('shot', ({ actor, pos }) => {
  for (const b of bots) {
    const a = b.actor
    if (a.team === actor.team || a.life !== 'alive') continue
    const d = a.pos.distanceTo(pos)
    if (d > BOTS.hearRange * (actor.def.kind === 'sniper' ? 2 : 1)) continue
    b.heardAt = G.time
    if (!b.target) {
      b.lastKnown.copy(actor.pos)
      b.lastKnownAt = G.time
      // Glance toward the sound.
      a.facing = turnToward(a.facing, Math.atan2(pos.x - a.pos.x, pos.z - a.pos.z), 1.2)
    }
  }
})
on('damage', ({ target, attacker }) => {
  const b = target.bot
  if (!b || !attacker || attacker.team === target.team) return
  b.heardAt = G.time
  if (!b.target || b.target.life !== 'alive') {
    b.lastKnown.copy(attacker.pos)
    b.lastKnownAt = G.time
    target.facing = turnToward(target.facing, Math.atan2(attacker.pos.x - target.pos.x, attacker.pos.z - target.pos.z), 1.6)
  }
  if (b.reviving) b.reviving.reviveProgress = 0
})

