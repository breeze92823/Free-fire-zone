// Shooting and damage. Hitscan bullets: the ray is cast against the static
// world (Rapier, fixed colliders only: buildings, terrain, frost walls) and
// against every character's capsule + head sphere; the nearest wins. The
// player aims from the camera (what the crosshair covers is what gets hit)
// and a second ray from the gun checks nothing blocks the shot at the muzzle.
// Damage runs through armour, knock-down and elimination, and every outcome
// is broadcast on the event bus for the HUD, audio, score and bots.
import { Vector3 } from 'three'
import { BULLET, HEALTH, ITEMS, OPERATIVES, ULT_CHARGE } from '../config.js'
import { RAPIER, world } from '../physics.js'
import { sfx, spatial } from '../audio/index.js'
import { G, emit } from './state.js'
import * as fx from './fx.js'

const DEG = Math.PI / 180
const tmpO = new Vector3()
const tmpD = new Vector3()
const tmpP = new Vector3()
const tmpM = new Vector3()
const tmpN = new Vector3()
const tmpR = new Vector3()
const tmpU = new Vector3()
const tmpE = new Vector3()
const tmpL = new Vector3()

let ray = null
const STATIC = () => RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC | RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC | RAPIER.QueryFilterFlags.EXCLUDE_SENSORS

// Wall registry: frost walls register their collider handle -> wall so bullets can damage them.
export const wallColliders = new Map()

// Nearest static hit along a unit ray: { dist, point, normal, collider } (shared object) or null.
const hitOut = { dist: 0, point: new Vector3(), normal: new Vector3(), collider: null }
export function castWorld(o, d, maxDist) {
  if (!world || !(maxDist > 0)) return null
  // Rapier traps (wasm "unreachable") on a zero or NaN direction: refuse those.
  const len2 = d.x * d.x + d.y * d.y + d.z * d.z
  if (!(len2 > 1e-8) || !Number.isFinite(o.x + o.y + o.z)) return null
  if (!ray) ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 })
  ray.origin.x = o.x
  ray.origin.y = o.y
  ray.origin.z = o.z
  ray.dir.x = d.x
  ray.dir.y = d.y
  ray.dir.z = d.z
  const hit = world.castRayAndGetNormal(ray, maxDist, true, STATIC())
  if (!hit) return null
  const toi = hit.timeOfImpact ?? hit.toi
  hitOut.dist = toi
  hitOut.point.copy(o).addScaledVector(d, toi)
  hitOut.normal.set(hit.normal.x, hit.normal.y, hit.normal.z)
  hitOut.collider = hit.collider
  return hitOut
}

export function lineOfSight(a, b) {
  tmpL.subVectors(b, a)
  const len = tmpL.length()
  if (len < 0.01) return true
  tmpL.divideScalar(len)
  return !castWorld(a, tmpL, len - 0.05)
}

// Nearest character hit along the ray (excluding `shooter` and its allies).
function castActors(o, d, maxDist, shooter) {
  let best = null
  let bestT = maxDist
  for (const a of G.actors) {
    if (a === shooter || a.team === shooter.team || a.life === 'dead') continue
    // Quick reject: distance from the ray to the actor.
    tmpP.subVectors(a.pos, o)
    const along = tmpP.dot(d)
    if (along < -1 || along > bestT + 2) continue
    const h = a.hitTest(o, d, bestT)
    if (h && h.t < bestT) {
      bestT = h.t
      best = { actor: a, t: h.t, head: h.head }
    }
  }
  return best
}

function surfaceOf(point, normal) {
  const gy = G.island?.groundHeight?.(point.x, point.z) ?? 0
  if (normal.y > 0.7 && point.y < gy + 0.2) return Math.hypot(point.x, point.z) > (G.island?.radius ?? 999) - 18 ? 'dirt' : 'grass'
  return 'stone'
}

// Random direction inside a cone of `deg` degrees around d (writes into out).
function coneDir(d, deg, out) {
  if (deg <= 0) return out.copy(d)
  const a = Math.random() * Math.PI * 2
  const r = Math.sqrt(Math.random()) * Math.tan(deg * DEG * 0.5)
  tmpU.set(0, 1, 0)
  if (Math.abs(d.y) > 0.95) tmpU.set(1, 0, 0)
  tmpR.crossVectors(d, tmpU).normalize()
  tmpU.crossVectors(tmpR, d).normalize()
  return out.copy(d).addScaledVector(tmpR, Math.cos(a) * r).addScaledVector(tmpU, Math.sin(a) * r).normalize()
}

// The muzzle position of an actor's held weapon (world).
export function muzzleOf(actor, out = new Vector3()) {
  const m = actor.heldModel?.userData.muzzle
  if (m && actor.heldModel.visible) {
    actor.heldModel.updateMatrixWorld(true)
    return m.getWorldPosition(out)
  }
  return actor.chest(out).addScaledVector(tmpE.set(Math.sin(actor.facing), 0, Math.cos(actor.facing)), 0.6)
}

export function currentSpread(actor, speed) {
  const def = actor.def
  if (!def.spread) return 0
  let s = def.spread[actor.aiming ? 1 : 0]
  if (!actor.grounded) s = s * 1.8 + 2
  else if (speed > 1) s *= 1 + Math.min(speed / 8, 1) * (actor.aiming ? 1.2 : 0.6)
  if (actor.crouch) s *= 0.75
  return s + actor.spreadBloom
}

// Fire the held gun. origin/dir: the aim ray. Returns true if a shot went off.
export function fire(actor, origin, dir, speed = 0) {
  const def = actor.def
  const w = actor.weapon
  if (actor.life !== 'alive' || actor.fireCooldown > 0 || actor.reloadT >= 0 || actor.throwT >= 0 || actor.healT >= 0) return false
  if (def.kind === 'knife' || def.kind === 'fists') return melee(actor)
  if (w.ammo <= 0) {
    if (actor.isPlayer) sfx.dryFire()
    actor.fireCooldown = 0.25
    startReload(actor)
    return false
  }
  const overdrive = G.time < actor.ultActiveUntil && actor.operative === 'nova' ? 0.77 : 1
  actor.fireCooldown = def.interval * overdrive
  w.ammo--
  actor.lastShotAt = G.time
  actor.ready = 1
  actor.emote = null
  actor.kick = 1
  actor.cloakUntil = Math.min(actor.cloakUntil, G.time) // firing breaks the cloak

  const muzzle = muzzleOf(actor, tmpM)
  const spread = currentSpread(actor, speed)
  const pellets = def.pellets || 1
  let anyHit = false
  let headHit = false
  for (let i = 0; i < pellets; i++) {
    const d = coneDir(dir, spread, tmpD)
    const range = def.range
    const wh = castWorld(origin, d, range)
    let endDist = wh ? wh.dist : range
    const wallCollider = wh ? wh.collider : null
    const whPoint = wh ? tmpN.copy(wh.point) : null
    const whNormal = wh ? tmpO.copy(wh.normal) : null
    const ah = castActors(origin, d, endDist, actor)
    let endPoint = tmpP.copy(origin).addScaledVector(d, ah ? ah.t : endDist)
    // From the muzzle: anything in the way of the gun itself (hugging a wall)?
    tmpE.subVectors(endPoint, muzzle)
    const mlen = tmpE.length()
    if (mlen > 0.3) {
      tmpE.divideScalar(mlen)
      const block = castWorld(muzzle, tmpE, mlen - 0.15)
      if (block && block.dist < mlen - 0.4) {
        endPoint = tmpP.copy(block.point)
        fx.impact(block.point, block.normal, surfaceOf(block.point, block.normal))
        fx.tracer(muzzle, endPoint)
        continue
      }
    }
    if (ah) {
      const falloff = damageFalloff(def, ah.t)
      const dmg = def.damage * falloff * (ah.head ? def.headMul : 1)
      applyDamage(ah.actor, dmg, actor, { head: ah.head, weapon: w.id, point: endPoint, dir: d })
      fx.hitPuff(endPoint, d, ah.head)
      anyHit = true
      headHit = headHit || ah.head
    } else if (whPoint) {
      const wall = wallCollider ? wallColliders.get(wallCollider.handle) : null
      if (wall) {
        wall.damage(def.damage * (def.pellets ? 1 : 1.2), actor)
        fx.iceBurst(whPoint, 3)
      } else {
        fx.impact(whPoint, whNormal, surfaceOf(whPoint, whNormal))
        if (actor.isPlayer || i === 0) {
          const s = spatial(whPoint.x, whPoint.y, whPoint.z)
          sfx.impact('stone', s)
        }
      }
    }
    if (i < 3 || Math.random() < 0.4) fx.tracer(muzzle, endPoint, def.kind === 'sniper' ? fx.FX_COLORS.white : null)
    // A near miss whizzes past the player's head.
    if (G.player && !actor.isPlayer && actor.team !== G.player.team && G.player.alive) nearMiss(origin, d, endDist)
  }
  if (actor.isPlayer && anyHit) sfx.hitmarker(headHit)

  // Flash, shell, sound, noise for the bots.
  tmpU.set(0, 1, 0)
  tmpR.set(Math.cos(actor.facing), 0, -Math.sin(actor.facing))
  fx.muzzleFlash(muzzle, dir, def.kind === 'shotgun' || def.kind === 'sniper' || def.kind === 'lmg', actor.isPlayer || Math.random() < 0.35)
  const ej = actor.heldModel?.userData.ejector
  if (ej && def.kind !== 'shotgun') fx.shellCasing(ej.getWorldPosition(tmpE), tmpR.negate(), tmpU)
  const s = actor.isPlayer ? { dist: 0, pan: 0 } : spatial(muzzle.x, muzzle.y, muzzle.z)
  const kind = def.kind === 'lmg' ? 'lmg' : def.kind
  if (!(G.time < actor.cloakUntil)) sfx.shot(kind, { ...s, own: actor.isPlayer })
  if (actor.isPlayer && (def.kind === 'sniper' || def.kind === 'shotgun')) sfx.bolt(def.kind)
  actor.spreadBloom = Math.min(actor.spreadBloom + def.recoil * 0.22, 3.5)
  emit('shot', { actor, pos: muzzle.clone(), recoil: def.recoil })
  if (w.ammo === 0 && actor.isPlayer) setTimeout(() => startReload(actor), 120)
  return true
}

function nearMiss(o, d, len) {
  const p = G.player
  p.eye(tmpE)
  tmpU.subVectors(tmpE, o)
  const along = tmpU.dot(d)
  if (along < 0 || along > len) return
  const close = tmpU.addScaledVector(d, -along).length()
  if (close < 1.6) {
    const s = spatial(o.x, o.y, o.z)
    sfx.whiz(s.pan)
  }
}

function damageFalloff(def, dist) {
  const start = def.range * BULLET.falloffStart
  if (dist <= start) return 1
  return 1 - 0.4 * Math.min(1, (dist - start) / (def.range - start))
}

// --- Melee -------------------------------------------------------------------------------
export function melee(actor) {
  const def = actor.def
  actor.fireCooldown = def.interval
  actor.swingT = 0
  actor.swingSide = 1 - actor.swingSide
  actor.ready = 1
  actor.lastShotAt = G.time
  actor.emote = null
  sfx.swing()
  // The blow lands a moment into the swing.
  const at = G.time + 0.14
  actor.pendingMelee = at
  return true
}

export function resolveMelee(actor) {
  const def = actor.def
  actor.pendingMelee = 0
  const fwdX = Math.sin(actor.facing)
  const fwdZ = Math.cos(actor.facing)
  let best = null
  let bestD = def.range + 0.5
  for (const a of G.actors) {
    if (a === actor || a.team === actor.team || a.life === 'dead') continue
    const dx = a.pos.x - actor.pos.x
    const dz = a.pos.z - actor.pos.z
    const dy = a.pos.y - actor.pos.y
    const d = Math.hypot(dx, dz)
    if (d > bestD || Math.abs(dy) > 1.6) continue
    if (d > 0.3 && (dx * fwdX + dz * fwdZ) / d < 0.45) continue
    best = a
    bestD = d
  }
  if (!best) return
  best.chest(tmpP)
  applyDamage(best, def.damage, actor, { head: false, weapon: actor.weapon.id, point: tmpP.clone(), dir: tmpD.set(fwdX, 0, fwdZ) })
  fx.hitPuff(tmpP, tmpD, false)
  sfx.punch()
  if (actor.isPlayer) sfx.hitmarker(false)
  // Knockback
  best.impulse.x += fwdX * 4
  best.impulse.z += fwdZ * 4
}

// --- Reload / switch -----------------------------------------------------------------------
export function startReload(actor) {
  const w = actor.weapon
  const def = w.def
  if (!def.mag || actor.reloadT >= 0 || w.ammo >= def.mag || w.reserve <= 0 || actor.life !== 'alive') return false
  actor.reloadT = 0
  actor.emote = null
  if (actor.isPlayer) sfx.reload(def.reload)
  return true
}

export function finishReload(actor) {
  const w = actor.weapon
  const need = w.def.mag - w.ammo
  const take = Math.min(need, w.reserve)
  w.ammo += take
  w.reserve -= take
  actor.reloadT = -1
}

export function selectSlot(actor, i) {
  if (i === actor.slot || i < 0 || i >= actor.slots.length || actor.life !== 'alive') return
  actor.slot = i
  actor.reloadT = -1
  actor.swingT = -1
  actor.fireCooldown = Math.max(actor.fireCooldown, 0.35)
  actor.aiming = false
  actor.refreshHeld()
  if (actor.isPlayer) sfx.swap()
  emit('slot', actor)
}

// --- Damage --------------------------------------------------------------------------------
// opts: { head, weapon, point, dir, explosive, zone }
export function applyDamage(target, amount, attacker, opts = {}) {
  if (target.life === 'dead' || amount <= 0) return 0
  if (G.time < target.protectedUntil && !opts.zone) return 0
  if (G.phase !== 'playing' && G.phase !== 'ending') return 0
  let dmg = amount
  if (G.time < target.ultActiveUntil && target.operative === 'rook') dmg *= 0.55
  // Armour soaks part of the hit and wears down.
  if (target.life === 'alive' && !opts.zone) {
    if (opts.head && target.helmet > 0) {
      const cut = dmg * HEALTH.helmet[target.helmet]
      dmg -= cut
      target.helmetDur -= cut
      if (target.helmetDur <= 0) {
        target.helmet--
        target.helmetDur = HEALTH.armorDurability[target.helmet]
      }
    } else if (!opts.head && target.vest > 0) {
      const cut = dmg * HEALTH.vest[target.vest]
      dmg -= cut
      target.vestDur -= cut
      if (target.vestDur <= 0) {
        target.vest--
        target.vestDur = HEALTH.armorDurability[target.vest]
      }
    }
  }
  target.lastDamageAt = G.time
  if (attacker && attacker !== target) {
    target.lastHitBy = attacker
    target.damagers.set(attacker.id, G.time)
    attacker.stats.damage += dmg
    attacker.ult = Math.min(attacker.operativeDef.charge, attacker.ult + dmg * ULT_CHARGE.perDamage)
    if (opts.head) attacker.stats.headshots++
  }
  target.hitFlash()
  target.emote = null
  if (target.healT >= 0) target.healT = -1 // hits interrupt healing
  emit('damage', { target, attacker, amount: dmg, head: !!opts.head, point: opts.point, dir: opts.dir, zone: !!opts.zone, explosive: !!opts.explosive })

  if (target.life === 'alive') {
    target.hp -= dmg
    if (target.hp <= 0) {
      target.hp = 0
      const helpers = G.actors.some((a) => a.team === target.team && a !== target && a.life === 'alive')
      if (helpers && !opts.zone) knock(target, attacker, opts)
      else eliminate(target, attacker, opts)
    }
  } else if (target.life === 'knocked') {
    target.downHp -= dmg
    if (target.downHp <= 0) eliminate(target, attacker, opts)
  }
  return dmg
}

export function knock(target, attacker, opts = {}) {
  target.life = 'knocked'
  target.downHp = HEALTH.knockedHp
  target.reloadT = -1
  target.throwT = -1
  target.healT = -1
  target.emote = null
  target.aiming = false
  target.crouch = false
  target.reviveProgress = 0
  if (attacker && attacker !== target) attacker.stats.knocks++
  emit('knock', { target, attacker, weapon: opts.weapon, head: !!opts.head })
}

export function eliminate(target, attacker, opts = {}) {
  if (target.life === 'dead') return
  target.life = 'dead'
  target.hp = 0
  target.downHp = 0
  target.stats.deaths++
  target.streak = 0
  target.reloadT = -1
  target.aiming = false
  const killer = attacker && attacker !== target && attacker.team !== target.team ? attacker : target.lastHitBy && target.lastHitBy.team !== target.team ? target.lastHitBy : null
  let streak = 0
  if (killer) {
    killer.stats.eliminations++
    killer.streak = G.time - killer.lastElimAt < 6 ? killer.streak + 1 : 1
    killer.lastElimAt = G.time
    streak = killer.streak
    for (const [id, at] of target.damagers) {
      if (id === killer.id || G.time - at > 10) continue
      const helper = G.actors.find((a) => a.id === id)
      if (helper && helper.team === killer.team) helper.stats.assists++
    }
  }
  target.damagers.clear()
  emit('elimination', { target, killer, weapon: opts.weapon ?? (opts.zone ? 'zone' : opts.explosive ? 'frag' : null), head: !!opts.head, streak })
}

export function revive(target, by) {
  if (target.life !== 'knocked') return
  target.life = 'alive'
  target.hp = HEALTH.reviveHp
  target.downHp = 0
  target.reviveProgress = 0
  target.protectedUntil = G.time + 1
  fx.healSparkles(target.pos)
  fx.ring(target.pos, 0.3, 2.2, 0.6, '#7dffb0')
  emit('revive', { target, by })
}

// --- Explosions -----------------------------------------------------------------------------
export function explode(pos, attacker, damage = ITEMS.frag.damage, radius = ITEMS.frag.radius) {
  fx.explosion(pos, radius)
  sfx.explosion(spatial(pos.x, pos.y, pos.z))
  emit('explosion', { pos: pos.clone(), radius })
  tmpO.copy(pos).y += 0.5
  for (const a of G.actors) {
    if (a.life === 'dead') continue
    if (attacker && a.team === attacker.team && a !== attacker) continue
    a.chest(tmpP)
    const d = tmpP.distanceTo(pos)
    if (d > radius) continue
    if (!lineOfSight(tmpO, tmpP)) continue
    const k = Math.pow(1 - d / radius, 0.7)
    const dmg = damage * k * (a === attacker ? 0.5 : 1)
    applyDamage(a, dmg, attacker, { explosive: true, weapon: 'frag', point: tmpP.clone(), dir: tmpD.subVectors(tmpP, pos).normalize().clone() })
    a.impulse.x += (tmpP.x - pos.x) * k * 2.5
    a.impulse.z += (tmpP.z - pos.z) * k * 2.5
  }
  for (const wall of wallColliders.values()) {
    if (wall.pos.distanceTo(pos) < radius + 1.5) wall.damage(damage * 1.5, attacker)
  }
}

export const operativeOf = (a) => OPERATIVES[a.operative]
