// Rounds that fly instead of hitting at once (WEAPONS[id].projectile): crossbow bolts (they drop
// over distance and stick where they land), the Thumper's 40 mm grenades (a high arc, burst on
// impact) and the Rhino's rockets (almost flat, a fire-and-smoke trail).
// The shooter's client flies its own rounds and decides what they hit: a bolt on a player is a
// `hit` (combat.projectileHit), a grenade or rocket going off is a `blast` with the players caught
// in it (combat.weaponBlast); the server checks and applies the damage. The others fly a copy from
// the relayed `shot` (with the launch velocity) for their eyes only: it vanishes where it lands and
// the real blast arrives as `blast`.
import { Quaternion, Vector3 } from 'three'
import { WEAPON_SCALE } from '../config.js'
import { G } from './state.js'
import { castWorld, projectileHit, wallColliders, weaponBlast } from './combat.js'
import { buildProjectile } from './weaponModels.js'
import * as fx from './fx.js'
import { sfx, spatial } from '../audio/index.js'

const list = []
const Z = new Vector3(0, 0, 1)
const tmpD = new Vector3()
const tmpP = new Vector3()
const tmpQ = new Quaternion()
const MAX_AGE = 6 // s: a round still flying by then goes off (or is dropped)
const STUCK_FOR = 8 // s a bolt stays in a wall

// opts: { owner, weapon, def, pos, vel, seq, local }
export function launchProjectile({ owner, weapon, def, pos, vel, seq, local }) {
  const mesh = buildProjectile(def.projectile.model)
  mesh.scale.setScalar(WEAPON_SCALE)
  mesh.position.copy(pos)
  orient(mesh, vel)
  G.scene?.add(mesh)
  list.push({ owner, weapon, def, pos: pos.clone(), vel: vel.clone(), seq, local, mesh, origin: pos.clone(), age: 0, stuck: 0, trail: 0 })
}

function orient(mesh, v) {
  tmpD.copy(v).normalize()
  if (tmpD.lengthSq() > 0.5) mesh.quaternion.copy(tmpQ.setFromUnitVectors(Z, tmpD))
}

function remove(i) {
  list[i].mesh.removeFromParent()
  list.splice(i, 1)
}

// Nearest player on the segment (not the shooter or their team), as { actor, t, head }.
function castActors(p, o, d, maxDist) {
  let best = null
  let bestT = maxDist
  for (const a of G.actors) {
    if (a === p.owner || a.team === p.owner.team || a.life === 'dead' || a.untargetable) continue
    tmpP.subVectors(a.pos, o)
    const along = tmpP.dot(d)
    if (along < -2 || along > bestT + 2) continue
    const h = a.hitTest(o, d, bestT)
    if (h && h.t < bestT) {
      bestT = h.t
      best = { actor: a, t: h.t, head: h.head }
    }
  }
  return best
}

function detonate(p, point) {
  if (p.local) weaponBlast(p.owner, p.weapon, p.seq, point)
  // Another player's round: the blast they report arrives as `blast` (online.js).
}

export function updateProjectiles(dt) {
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i]
    if (p.stuck > 0) {
      p.stuck -= dt
      if (p.stuck <= 0) remove(i)
      continue
    }
    p.age += dt
    const proj = p.def.projectile
    p.vel.y -= proj.gravity * dt
    const len = p.vel.length() * dt
    tmpD.copy(p.vel).normalize()
    const wh = castWorld(p.pos, tmpD, len + 0.05)
    const whDist = wh ? wh.dist : Infinity
    const wPoint = wh ? wh.point.clone() : null
    const wNormal = wh ? wh.normal.clone() : null
    const wCollider = wh ? wh.collider : null
    const ah = castActors(p, p.pos, tmpD, Math.min(len + 0.05, whDist))
    if (ah) {
      const point = p.pos.clone().addScaledVector(tmpD, ah.t)
      if (p.def.blast) detonate(p, point)
      else {
        if (p.local) projectileHit(p.owner, p.weapon, p.seq, ah.actor, ah.head, point.distanceTo(p.origin))
        fx.hitPuff(point, tmpD, ah.head)
        sfx.boltHit(spatial(point.x, point.y, point.z), 'flesh')
      }
      remove(i)
      continue
    }
    if (wh) {
      if (p.def.blast) {
        detonate(p, wPoint.addScaledVector(wNormal, 0.15))
        remove(i)
        continue
      }
      // A bolt sticks in what it hit (and chips a frost wall).
      const wall = wCollider ? wallColliders.get(wCollider.handle) : null
      if (wall) {
        wall.damage(p.def.damage, p.owner)
        fx.iceBurst(wPoint, 6)
        remove(i)
        continue
      }
      p.pos.copy(wPoint).addScaledVector(tmpD, -0.1)
      p.mesh.position.copy(p.pos)
      p.stuck = STUCK_FOR
      fx.impact(wPoint, wNormal, 'stone')
      sfx.boltHit(spatial(wPoint.x, wPoint.y, wPoint.z), 'wood')
      continue
    }
    p.pos.addScaledVector(p.vel, dt)
    p.mesh.position.copy(p.pos)
    orient(p.mesh, p.vel)
    trail(p, dt)
    if (p.age > MAX_AGE || p.pos.y < -20) {
      if (p.def.blast) detonate(p, p.pos.clone())
      remove(i)
    }
  }
}

// Exhaust and smoke behind a rocket, a thin smoke line behind a grenade.
function trail(p, dt) {
  const k = p.def.projectile.model
  if (k === 'bolt') return
  p.trail += dt
  const back = tmpP.copy(p.vel).normalize().multiplyScalar(-0.35 * WEAPON_SCALE).add(p.pos)
  if (k === 'rocket') {
    fx.emitAdd(back.x, back.y, back.z, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, 0.09, 0.32, fx.FX_COLORS.fire, 1, 0, 2, 2)
    fx.emitAdd(back.x, back.y, back.z, 0, 0, 0, 0.05, 0.18, fx.FX_COLORS.spark, 1, 0, 0, 0)
    while (p.trail > 0.012) {
      p.trail -= 0.012
      fx.emitBlend(back.x + (Math.random() - 0.5) * 0.1, back.y + (Math.random() - 0.5) * 0.1, back.z + (Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.4, 0.3 + Math.random() * 0.3, (Math.random() - 0.5) * 0.4, 1.6 + Math.random() * 0.8, 0.35, fx.FX_COLORS.smoke, 0.5, 0.15, 1.2, 0.9)
    }
  } else {
    while (p.trail > 0.03) {
      p.trail -= 0.03
      fx.emitBlend(back.x, back.y, back.z, 0, 0.1, 0, 0.7, 0.12, fx.FX_COLORS.smoke, 0.3, 0.05, 1, 0.5)
    }
  }
}

// Another player's round went off (their `blast`): drop the copy that was flying here.
export function endRemote(owner, weapon) {
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i]
    if (p.owner === owner && p.weapon === weapon && !p.local && !p.stuck) {
      remove(i)
      return
    }
  }
}

export function clearProjectiles() {
  for (const p of list) p.mesh.removeFromParent()
  list.length = 0
}
