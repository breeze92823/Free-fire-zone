// Shooting and damage. Hitscan bullets: the ray is cast against the static
// world (Rapier, fixed colliders only: buildings, terrain, frost walls) and
// against every character's capsule + head sphere; the nearest wins. The
// player aims from the camera (what the crosshair covers is what gets hit)
// and a second ray from the gun checks nothing blocks the shot at the muzzle.
// Online, the shooter's client decides only WHAT it hit: each hit goes to the
// server (net.js `hit`), which checks it and decides the damage, armour,
// knock-downs and eliminations (online.js turns its answers into bus events).
// The shot itself is relayed so the others draw its tracers and hear it.
import { Vector3 } from 'three'
import { BULLET, GRENADES, ITEMS, OPERATIVES } from '../config.js'
import { RAPIER, world } from '../physics.js'
import { sfx, spatial } from '../audio/index.js'
import { G, emit } from './state.js'
import * as fx from './fx.js'
import { send } from '../net.js'

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
let shotSeq = 0 // numbers this client's shots: one shot may hit several players (server fire-rate check)

// The weapon test range (testRange.js) runs offline: hits on its dummies (no netId) go to this
// handler instead of the server. fn(target, { weapon, n, h, d, heal, explosive, damage }).
let localHits = null
export function setLocalHits(fn) {
  localHits = fn
}
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

// Nearest character hit along the ray (excluding `shooter`, and its allies unless `allies`: a
// medic weapon's shots land on teammates too).
function castActors(o, d, maxDist, shooter, allies = false) {
  let best = null
  let bestT = maxDist
  for (const a of G.actors) {
    if (a === shooter || (a.team === shooter.team && !allies) || a.life === 'dead' || a.untargetable) continue
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
  if (def.melee) return melee(actor)
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
  const seq = ++shotSeq
  const hits = new Map() // target actor -> { n, h, d }
  const ends = []
  for (let i = 0; i < pellets; i++) {
    const d = coneDir(dir, spread, tmpD)
    const range = def.range
    const wh = castWorld(origin, d, range)
    let endDist = wh ? wh.dist : range
    const wallCollider = wh ? wh.collider : null
    const whPoint = wh ? tmpN.copy(wh.point) : null
    const whNormal = wh ? tmpO.copy(wh.normal) : null
    const ah = castActors(origin, d, endDist, actor, !!def.heal)
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
        ends.push(pt(endPoint))
        continue
      }
    }
    ends.push(pt(endPoint))
    if (ah) {
      const rec = hits.get(ah.actor) || { n: 0, h: 0, d: ah.t }
      rec.n++
      if (ah.head) rec.h++
      rec.d = Math.min(rec.d, ah.t)
      hits.set(ah.actor, rec)
      const healHit = def.heal && ah.actor.team === actor.team
      if (healHit) for (let k = 0; k < 6; k++) fx.emitAdd(endPoint.x, endPoint.y, endPoint.z, (Math.random() - 0.5) * 1.6, 1 + Math.random(), (Math.random() - 0.5) * 1.6, 0.6, 0.18, fx.FX_COLORS.heal, 1, -0.6, 0)
      else fx.hitPuff(endPoint, d, ah.head)
      anyHit = true
      headHit = headHit || (ah.head && !healHit)
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
    if (i < 3 || Math.random() < 0.4) fx.tracer(muzzle, endPoint, def.kind === 'sniper' ? fx.FX_COLORS.white : def.heal ? fx.FX_COLORS.heal : null)
  }
  if (actor.isPlayer && anyHit) sfx.hitmarker(headHit)
  // To the server: what this shot hit (it decides the damage), and the shot for the others' eyes and ears.
  for (const [target, r] of hits) {
    if (target.netId) send('hit', { t: target.netId, w: w.id, s: seq, n: r.n, h: r.h, d: Math.round(r.d * 10) / 10 })
    else if (localHits) localHits(target, { weapon: w.id, n: r.n, h: r.h, d: r.d, heal: def.heal && target.team === actor.team ? def.heal * r.n : 0 })
  }
  if (!localHits) send('shot', { w: w.id, o: pt(muzzle), e: ends.slice(0, 12) })

  // Flash, shell and sound.
  tmpU.set(0, 1, 0)
  tmpR.set(Math.cos(actor.facing), 0, -Math.sin(actor.facing))
  fx.muzzleFlash(muzzle, dir, def.kind === 'shotgun' || def.kind === 'sniper' || def.kind === 'lmg', actor.isPlayer || Math.random() < 0.35)
  const ej = actor.heldModel?.userData.ejector
  if (ej && def.kind !== 'shotgun') fx.shellCasing(ej.getWorldPosition(tmpE), tmpR.negate(), tmpU)
  const s = actor.isPlayer ? { dist: 0, pan: 0 } : spatial(muzzle.x, muzzle.y, muzzle.z)
  const kind = def.sound || def.kind
  if (!(G.time < actor.cloakUntil)) sfx.shot(kind, { ...s, own: actor.isPlayer })
  if (actor.isPlayer && (def.kind === 'sniper' || def.kind === 'shotgun')) sfx.bolt(def.kind)
  actor.spreadBloom = Math.min(actor.spreadBloom + def.recoil * 0.22, 3.5)
  emit('shot', { actor, pos: muzzle.clone(), recoil: def.recoil })
  if (w.ammo === 0 && actor.isPlayer) setTimeout(() => startReload(actor), 120)
  return true
}

const pt = (v) => [Math.round(v.x * 100) / 100, Math.round(v.y * 100) / 100, Math.round(v.z * 100) / 100]

// Damage at a distance (the server applies the same falloff).
export function damageFalloff(def, dist) {
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
    if (a === actor || a.team === actor.team || a.life === 'dead' || a.untargetable) continue
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
  if (best.netId) send('hit', { t: best.netId, w: actor.weapon.id, s: ++shotSeq, n: 1, h: 0, d: Math.round(bestD * 10) / 10 })
  else if (localHits) localHits(best, { weapon: actor.weapon.id, n: 1, h: 0, d: bestD, heal: 0 })
  fx.hitPuff(tmpP, tmpD.set(fwdX, 0, fwdZ), false)
  sfx.punch()
  if (actor.isPlayer) sfx.hitmarker(false)
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

// --- Explosions -----------------------------------------------------------------------------
// The local player's frag went off: tell the server who was in the blast (with line of sight); it
// decides the damage. The flash, sound and frost-wall damage are drawn by every client.
export function explode(pos, attacker, damage = ITEMS.frag.damage, radius = ITEMS.frag.radius) {
  explodeVisual(pos, radius, damage)
  if (!attacker?.isPlayer) return
  tmpO.copy(pos).y += 0.5
  const targets = []
  if (localHits) {
    // Test range: the blast is resolved here against the dummies.
    for (const a of G.actors) {
      if (a.life === 'dead' || a === attacker || a.team === attacker.team || a.untargetable) continue
      a.chest(tmpP)
      const d = tmpP.distanceTo(pos)
      if (d > radius || !lineOfSight(tmpO, tmpP)) continue
      localHits(a, { weapon: 'grenade', n: 1, h: 0, d, heal: 0, explosive: true, damage: damage * Math.pow(1 - d / radius, 0.7) })
    }
    return
  }
  for (const a of G.actors) {
    if (a.life === 'dead' || !a.netId) continue
    if (a.team === attacker.team && a !== attacker) continue
    a.chest(tmpP)
    const d = tmpP.distanceTo(pos)
    if (d > radius) continue
    if (!lineOfSight(tmpO, tmpP)) continue
    targets.push(a.netId)
    if (a === attacker) {
      const k = Math.pow(1 - d / radius, 0.7)
      a.impulse.x += (tmpP.x - pos.x) * k * 2.5
      a.impulse.z += (tmpP.z - pos.z) * k * 2.5
    }
  }
  send('boom', { x: Math.round(pos.x * 100) / 100, y: Math.round(pos.y * 100) / 100, z: Math.round(pos.z * 100) / 100, t: targets })
}

export function explodeVisual(pos, radius = ITEMS.frag.radius, damage = ITEMS.frag.damage) {
  fx.explosion(pos, radius)
  sfx.explosion(spatial(pos.x, pos.y, pos.z))
  emit('explosion', { pos: pos.clone(), radius })
  for (const wall of wallColliders.values()) {
    if (wall.pos.distanceTo(pos) < radius + 1.5) wall.damage(damage * 1.5, null)
  }
}

export const operativeOf = (a) => OPERATIVES[a.operative]
