// Utility: frost walls (a curved barrier of ice crystals with real colliders
// that soak bullets and melt), frag grenades (bouncing projectiles with a
// fuse), medkits, the dash and each operative's Q ability.
import {
  BoxGeometry,
  Color,
  ConeGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from 'three'
import { GRENADES, ITEMS, OPERATIVES, ULT_CHARGE } from '../config.js'
import { RAPIER, world } from '../physics.js'
import { sfx, spatial } from '../audio/index.js'
import { G, emit } from './state.js'
import { castWorld, explode, wallColliders } from './combat.js'
import { buildGrenade } from './weaponModels.js'
import * as fx from './fx.js'
import { send } from '../net.js'

const tmp = new Vector3()
const tmp2 = new Vector3()
const DOWN = new Vector3(0, -1, 0)

// --- Frost wall ------------------------------------------------------------------------
const iceMat = new MeshStandardMaterial({ color: '#9fe6ff', emissive: '#2b9dff', emissiveIntensity: 0.55, roughness: 0.08, metalness: 0.15, transparent: true, opacity: 0.86 })
const iceCore = new MeshStandardMaterial({ color: '#e9fbff', emissive: '#8fe8ff', emissiveIntensity: 1.2, roughness: 0.2, transparent: true, opacity: 0.9 })
const crystalGeo = new IcosahedronGeometry(1, 0)
const spikeGeo = new ConeGeometry(0.35, 1.6, 5)
const slabGeo = new BoxGeometry(1, 1, 1)

// Shader warm-up (warmup.js): walls are only built when thrown, so boot warms one piece of each material.
export function warmSamples() {
  const slab = new Mesh(slabGeo, iceMat)
  slab.castShadow = true
  return [slab, new Mesh(crystalGeo, iceCore)]
}

const walls = []
class FrostWall {
  constructor(pos, yaw, owner) {
    const W = ITEMS.frostWall
    this.pos = pos.clone()
    this.owner = owner
    this.hp = W.hp
    this.t = 0
    this.life = W.life
    this.dead = false
    this.group = new Group()
    this.group.position.copy(pos)
    this.group.rotation.y = yaw
    this.colliders = []
    const segs = 5
    const arc = 0.9 // radians of curvature across the wall
    const radius = W.width / arc
    for (let i = 0; i < segs; i++) {
      // Segments sit on an arc that curves back around the thrower.
      const a = (i / (segs - 1) - 0.5) * arc
      const seg = new Group()
      seg.position.set(Math.sin(a) * radius, 0, (Math.cos(a) - 1) * radius)
      seg.rotation.y = a
      const slab = new Mesh(slabGeo, iceMat)
      slab.scale.set(W.width / segs + 0.12, W.height, 0.55)
      slab.position.y = W.height / 2
      slab.castShadow = true
      seg.add(slab)
      // Crystals on the face and spikes on top.
      for (let k = 0; k < 4; k++) {
        const c = new Mesh(crystalGeo, k % 2 ? iceMat : iceCore)
        const s = 0.22 + Math.random() * 0.3
        c.scale.set(s, s * (1.4 + Math.random()), s)
        c.position.set((Math.random() - 0.5) * 0.8, 0.3 + Math.random() * (W.height - 0.4), 0.3 * (Math.random() < 0.5 ? 1 : -1))
        c.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3)
        seg.add(c)
      }
      const spike = new Mesh(spikeGeo, iceMat)
      spike.position.set((Math.random() - 0.5) * 0.4, W.height + 0.5, 0)
      spike.rotation.z = (Math.random() - 0.5) * 0.5
      seg.add(spike)
      this.group.add(seg)
    }
    G.scene.add(this.group)
    this.group.scale.set(1, 0.01, 1)
    // Colliders: one cuboid per segment, from the built transforms.
    this.group.updateMatrixWorld(true)
    for (const seg of this.group.children) {
      const slab = seg.children[0]
      slab.getWorldPosition(tmp)
      const q = seg.getWorldQuaternion(slab.quaternion.clone())
      const desc = RAPIER.ColliderDesc.cuboid((W.width / segs + 0.12) / 2, W.height / 2, 0.3)
        .setTranslation(tmp.x, pos.y + W.height / 2, tmp.z)
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
      const col = world.createCollider(desc)
      this.colliders.push(col)
      wallColliders.set(col.handle, this)
    }
    fx.iceBurst(pos, 40)
    sfx.frostWall(spatial(pos.x, pos.y, pos.z))
    emit('wall', { wall: this })
  }

  damage(amount, by) {
    if (this.dead) return
    this.hp -= amount
    if (this.hp <= 0) this.shatter()
    void by
  }

  shatter() {
    if (this.dead) return
    this.dead = true
    fx.iceBurst(this.pos, 60)
    sfx.iceShatter(spatial(this.pos.x, this.pos.y, this.pos.z))
    this.remove()
  }

  remove() {
    for (const c of this.colliders) {
      wallColliders.delete(c.handle)
      world.removeCollider(c, false)
    }
    this.colliders.length = 0
    this.group.removeFromParent()
    this.dead = true
  }

  update(dt) {
    this.t += dt
    const grow = Math.min(1, this.t / 0.22)
    const melt = this.t > this.life - 1 ? Math.max(0.01, this.life - this.t) : 1
    this.group.scale.y = Math.max(0.01, grow * (2 - grow) * melt)
    if (this.t >= this.life && !this.dead) {
      fx.iceBurst(this.pos, 12)
      this.remove()
    }
  }
}

export function deployWall(actor) {
  if (actor.items.frostWall <= 0 || actor.life !== 'alive') return false
  const fwd = tmp.set(Math.sin(actor.facing), 0, Math.cos(actor.facing))
  const p = tmp2.copy(actor.pos).addScaledVector(fwd, 2.4)
  // Find the floor under the spot (or keep the actor's height).
  const from = new Vector3(p.x, actor.pos.y + 1.6, p.z)
  const hit = castWorld(from, DOWN, 4)
  if (hit) p.y = hit.point.y
  else p.y = actor.pos.y
  // Blocked straight ahead by a wall? Pull closer.
  actor.eye(from)
  const ahead = castWorld(from, fwd, 2.4)
  if (ahead && ahead.dist < 1.2) return false
  actor.items.frostWall--
  walls.push(new FrostWall(p, actor.facing, actor))
  actor.emote = null
  if (actor.isPlayer) send('wall', { x: r2(p.x), y: r2(p.y), z: r2(p.z), yaw: r2(actor.facing) })
  return true
}
const r2 = (v) => Math.round(v * 100) / 100

// Another player's frost wall (online.js): a real collider here too, so it stops this client's bullets.
export function remoteWall(pos, yaw, owner) {
  walls.push(new FrostWall(pos, yaw, owner))
}

// --- Frag grenades ----------------------------------------------------------------------------
const grenades = []
class Grenade {
  constructor(pos, vel, owner, kind = 'frag') {
    this.pos = pos.clone()
    this.vel = vel.clone()
    this.owner = owner
    this.def = GRENADES[kind] ?? GRENADES.frag
    this.fuse = this.def.fuse
    this.mesh = buildGrenade(this.def.model)
    this.mesh.position.copy(pos)
    this.spin = new Vector3(Math.random() * 10, Math.random() * 10, Math.random() * 10)
    G.scene.add(this.mesh)
    this.dead = false
    this.blink = 0
  }
  update(dt) {
    this.fuse -= dt
    if (this.fuse <= 0) {
      this.dead = true
      this.mesh.removeFromParent()
      // Another player's grenade only vanishes: their client reports the blast (`boom`) and every
      // client draws it where it really went off.
      if (!this.owner?.remote) explode(this.pos, this.owner, this.def.damage, this.def.radius)
      return
    }
    this.vel.y -= 22 * dt
    const step = this.vel.length() * dt
    if (step > 1e-4) {
      tmp.copy(this.vel).normalize()
      const hit = castWorld(this.pos, tmp, step + 0.08)
      if (hit) {
        // Bounce: reflect about the surface normal, lose energy.
        const n = hit.normal
        const vn = this.vel.dot(n)
        this.vel.addScaledVector(n, -1.6 * vn).multiplyScalar(0.55)
        this.pos.copy(hit.point).addScaledVector(n, 0.09)
        if (Math.abs(vn) > 2) sfx.bounce(spatial(this.pos.x, this.pos.y, this.pos.z))
        this.spin.multiplyScalar(0.6)
      } else this.pos.addScaledVector(this.vel, dt)
    }
    this.mesh.position.copy(this.pos)
    this.mesh.rotation.x += this.spin.x * dt
    this.mesh.rotation.z += this.spin.z * dt
    // Blinking ember as the fuse runs out.
    this.blink += dt * (this.fuse < 0.8 ? 14 : 6)
    if (Math.sin(this.blink * Math.PI) > 0.6) fx.emitAdd(this.pos.x, this.pos.y + 0.1, this.pos.z, 0, 0.3, 0, 0.08, 0.12, fx.FX_COLORS.red, 1, 0, 0)
  }
}

// Begin the throw animation; the grenade leaves the hand partway through (see updateItems).
export function startThrow(actor, kind = 'frag') {
  if (actor.life !== 'alive' || actor.throwT >= 0 || actor.reloadT >= 0) return false
  if (kind === 'frag' && actor.items.frag <= 0) return false
  actor.throwT = 0
  actor.throwKind = kind
  actor.thrown = false
  actor.emote = null
  if (actor.isPlayer) sfx.pinPull()
  return true
}

// dir: the aim direction (unit) at release.
function release(actor, dir) {
  actor.thrown = true
  if (actor.throwKind === 'frag') {
    actor.items.frag--
    const p = new Vector3()
    actor.eye(p).addScaledVector(dir, 0.6)
    const v = dir.clone().multiplyScalar(ITEMS.frag.throwSpeed)
    v.y += 4
    v.x += actor.vel.x * 0.5
    v.z += actor.vel.z * 0.5
    grenades.push(new Grenade(p, v, actor, actor.grenade))
    if (actor.isPlayer && !actor.offline) send('throw', { p: [r2(p.x), r2(p.y), r2(p.z)], v: [r2(v.x), r2(v.y), r2(v.z)] })
  }
}

// Another player's frag in flight (drawn only; see Grenade.update).
export function remoteThrow(owner, p, v, kind = 'frag') {
  if (!Array.isArray(p) || !Array.isArray(v)) return
  grenades.push(new Grenade(new Vector3(p[0], p[1], p[2]), new Vector3(v[0], v[1], v[2]), owner, kind))
}

// --- Medkit / dash / ability ------------------------------------------------------------------
export function startHeal(actor) {
  if (actor.items.medkit <= 0 || actor.healT >= 0 || actor.life !== 'alive' || actor.hp >= actor.maxHp) return false
  actor.healT = 0
  actor.reloadT = -1
  actor.emote = null
  if (actor.isPlayer) sfx.bandage(ITEMS.medkit.time)
  return true
}

// Returns the dash velocity to apply (or null if on cooldown).
export function dash(actor, dirX, dirZ) {
  if (actor.life !== 'alive' || G.time < actor.dashReadyAt) return null
  const len = Math.hypot(dirX, dirZ)
  if (len < 0.01) {
    dirX = Math.sin(actor.facing)
    dirZ = Math.cos(actor.facing)
  } else {
    dirX /= len
    dirZ /= len
  }
  actor.dashReadyAt = G.time + ITEMS.dash.cooldown
  fx.dustKick(actor.pos, 10)
  sfx.dash()
  return { x: dirX * ITEMS.dash.speed, z: dirZ * ITEMS.dash.speed, t: ITEMS.dash.time }
}

export const ultReady = (actor) => actor.ult >= actor.operativeDef.charge

export function useUltimate(actor) {
  if (actor.life !== 'alive' || !ultReady(actor)) return false
  actor.ult = 0
  if (actor.isPlayer) send('ult')
  ultVisual(actor, actor.operative)
  return true
}

// The ability's effect as drawn on this client (the server applies the heals and damage cut).
// Also used for other players' abilities (online.js).
export function ultVisual(actor, opId) {
  const op = OPERATIVES[opId] || actor.operativeDef
  const color = op.color
  if (opId === 'jin') {
    actor.hp = Math.min(actor.maxHp, actor.hp + 90)
    for (const a of G.actors) {
      if (a !== actor && a.team === actor.team && a.life === 'alive' && a.pos.distanceTo(actor.pos) < 10) {
        a.hp = Math.min(a.maxHp, a.hp + 60)
        fx.healSparkles(a.pos)
      }
    }
    fx.healSparkles(actor.pos, fx.FX_COLORS.heal, 40)
    fx.ring(actor.pos, 0.5, 10, 0.8, color)
  } else if (opId === 'shade') {
    actor.cloakUntil = G.time + op.duration
    fx.poof(actor.pos, new Color(1.4, 0.8, 2.6), 26)
  } else {
    actor.ultActiveUntil = G.time + op.duration
    fx.ring(actor.pos, 0.3, 3.5, 0.6, color, actor.pos)
  }
  fx.beam(actor.pos, color, 0.8, 1.1, 6, actor.pos)
  if (actor.isPlayer || actor.pos.distanceTo(G.player?.pos ?? actor.pos) < 30) sfx.ultimate()
  emit('ultimate', { actor, op })
}

// Per-actor timers for items (throw release, heal completion, ult charge, aura).
export function updateActorItems(actor, dt, aimDir) {
  if (actor.life !== 'alive') {
    actor.throwT = -1
    actor.healT = -1
    return
  }
  actor.ult = Math.min(actor.operativeDef.charge, actor.ult + ULT_CHARGE.perSecond * dt)
  if (actor.throwT >= 0) {
    actor.throwT += dt
    if (!actor.thrown && actor.throwT >= 0.3) release(actor, aimDir)
    if (actor.throwT >= 0.55) actor.throwT = -1
  }
  if (actor.healT >= 0) {
    actor.healT += dt
    if (Math.random() < dt * 12) fx.healSparkles(actor.pos, fx.FX_COLORS.heal, 1)
    if (actor.healT >= ITEMS.medkit.time) {
      actor.healT = -1
      actor.items.medkit--
      actor.hp = Math.min(actor.maxHp, actor.hp + ITEMS.medkit.heal)
      if (actor.isPlayer) send('heal')
      fx.healSparkles(actor.pos, fx.FX_COLORS.heal, 30)
      fx.ring(actor.pos, 0.2, 1.6, 0.5, '#6dff9c', actor.pos, 1.5)
      if (actor.isPlayer) sfx.heal()
      emit('healed', actor)
    }
  }
  // Ability aura particles.
  if (G.time < actor.ultActiveUntil && Math.random() < dt * 30) {
    const c = new Color(actor.operativeDef.color).multiplyScalar(2.5)
    const a = Math.random() * Math.PI * 2
    fx.emitAdd(actor.pos.x + Math.cos(a) * 0.5, actor.pos.y + Math.random() * 1.6, actor.pos.z + Math.sin(a) * 0.5, 0, 1.2, 0, 0.6, 0.08, c, 1, 0.5, 0.5)
  }
}

export function updateItems(dt) {
  for (let i = walls.length - 1; i >= 0; i--) {
    walls[i].update(dt)
    if (walls[i].dead) walls.splice(i, 1)
  }
  for (let i = grenades.length - 1; i >= 0; i--) {
    grenades[i].update(dt)
    if (grenades[i].dead) grenades.splice(i, 1)
  }
}

export function clearItems() {
  for (const w of walls) w.remove()
  walls.length = 0
  for (const g of grenades) g.mesh.removeFromParent()
  grenades.length = 0
}

export const activeGrenades = () => grenades
