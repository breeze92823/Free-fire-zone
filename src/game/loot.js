// Supply crates (open with E: ammo, meds, utility, armour) spread over the
// island's loot spots, drawn as instanced parts so ~45 detailed crates cost a
// handful of draw calls; plus supply drops that parachute in mid-match under
// a light beam and hold the good stuff. Online, the server owns which crates are
// open (and refills them), where drops land, and the armour a crate gives; the
// ammo and utility inside are this client's.
import {
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DynamicDrawUsage,
  Euler,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OctahedronGeometry,
  Quaternion,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  DoubleSide,
} from 'three'
import { ITEMS, LOOT } from '../config.js'
import { RAPIER, addFixed, world } from '../physics.js'
import { sfx } from '../audio/index.js'
import { G, emit } from './state.js'
import * as fx from './fx.js'
import { send } from '../net.js'

const m1 = new Matrix4()
const m2 = new Matrix4()
const m3 = new Matrix4()
const q1 = new Quaternion()
const v1 = new Vector3()
const v2 = new Vector3()
const ONE = new Vector3(1, 1, 1)
const e1 = new Euler()

// A stable 0..2PI angle from a crate spot's position, identical on every client.
function spotYaw(x, z) {
  let h = Math.imul(Math.round(x * 100) | 0, 73856093) ^ Math.imul(Math.round(z * 100) | 0, 19349663)
  h = Math.imul(h ^ (h >>> 15), 2246822507)
  h ^= h >>> 13
  return ((h >>> 0) / 4294967296) * Math.PI * 2
}

function stripeTexture() {
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 32
  const g = c.getContext('2d')
  g.fillStyle = '#ffd21f'
  g.fillRect(0, 0, 128, 32)
  g.fillStyle = '#1b1b1b'
  for (let x = -32; x < 160; x += 24) {
    g.beginPath()
    g.moveTo(x, 32)
    g.lineTo(x + 12, 32)
    g.lineTo(x + 28, 0)
    g.lineTo(x + 16, 0)
    g.fill()
  }
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  return t
}

// Crate parts: [geometry, material, x, y, z, sx?, lid?]
function crateParts() {
  const body = new MeshStandardMaterial({ color: '#4d5a36', roughness: 0.7, metalness: 0.15 })
  const metal = new MeshStandardMaterial({ color: '#2b2e33', roughness: 0.45, metalness: 0.7 })
  const stripe = new MeshStandardMaterial({ map: stripeTexture(), roughness: 0.6 })
  const glow = new MeshStandardMaterial({ color: '#7ff3ff', emissive: '#29d8ff', emissiveIntensity: 2.2 })
  const W = 1.15
  const H = 0.62
  const D = 0.75
  const B = (w, h, d) => new BoxGeometry(w, h, d)
  return {
    W,
    H,
    D,
    parts: [
      [B(W, H, D), body, 0, H / 2, 0],
      // frame edges
      [B(W + 0.04, 0.06, 0.06), metal, 0, 0.03, D / 2],
      [B(W + 0.04, 0.06, 0.06), metal, 0, 0.03, -D / 2],
      [B(0.06, H, 0.06), metal, W / 2, H / 2, D / 2],
      [B(0.06, H, 0.06), metal, -W / 2, H / 2, D / 2],
      [B(0.06, H, 0.06), metal, W / 2, H / 2, -D / 2],
      [B(0.06, H, 0.06), metal, -W / 2, H / 2, -D / 2],
      [B(W * 0.7, 0.1, 0.012), stripe, 0, H * 0.45, D / 2 + 0.006],
      [B(0.16, 0.05, 0.05), metal, W / 2 + 0.03, H * 0.6, 0], // handles
      [B(0.16, 0.05, 0.05), metal, -W / 2 - 0.03, H * 0.6, 0],
      [B(W * 0.5, 0.025, 0.02), glow, 0, H * 0.78, D / 2 + 0.01],
      // lid (hinged at the back edge): pieces relative to the hinge
      [B(W + 0.06, 0.1, D + 0.06), body, 0, 0.05, D / 2 + 0.03, 1, true],
      [B(W + 0.08, 0.04, 0.08), metal, 0, 0.07, D + 0.02, 1, true],
      [B(0.12, 0.08, 0.04), metal, W * 0.3, 0.0, D + 0.06, 1, true], // latches
      [B(0.12, 0.08, 0.04), metal, -W * 0.3, 0.0, D + 0.06, 1, true],
    ],
    glow,
  }
}

// One crate set per world (worlds.js): the active world's set is the one in play. Its crate index is
// the index the server knows (`open { c }`), so each world's list keeps its own order.
const sets = new Map() // world id -> { crates, meshes, iconMesh, colliders }
let crates = [] // the active set's crates
let parts = null
let meshes = []
let iconMesh = null
let H = 0.62
let D = 0.75
const lidLocal = new Matrix4()
let def = null

// Builds the crates of world `id` at `spots`; the first set built becomes the active one.
export function buildLoot(scene, spots, id = 'coral') {
  def ??= crateParts()
  H = def.H
  D = def.D
  parts = def.parts
  const n = spots.length
  const set = { crates: [], colliders: [], meshes: null, iconMesh: null }
  set.meshes = parts.map(([geo, mat]) => {
    const im = new InstancedMesh(geo, mat, n)
    im.castShadow = true
    im.receiveShadow = true
    im.instanceMatrix.setUsage(DynamicDrawUsage)
    scene.add(im)
    return im
  })
  // Floating holographic icon above closed crates.
  set.iconMesh = new InstancedMesh(new OctahedronGeometry(0.16, 0), new MeshStandardMaterial({ color: '#9ff6ff', emissive: '#33e0ff', emissiveIntensity: 2.6, transparent: true, opacity: 0.9 }), n)
  set.iconMesh.instanceMatrix.setUsage(DynamicDrawUsage)
  scene.add(set.iconMesh)
  spots.forEach((s, i) => {
    // The same yaw on every client (the collider turns with it): from the spot's position.
    const yaw = s.yaw ?? spotYaw(s.x, s.z)
    const c = { i, pos: new Vector3(s.x, s.y, s.z), yaw, open: 0, opened: false, refillAt: 0, phase: Math.random() * 6 }
    set.crates.push(c)
    const q = { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }
    set.colliders.push(addFixed(RAPIER.ColliderDesc.cuboid(def.W / 2, H / 2, D / 2), { x: s.x, y: s.y + H / 2, z: s.z }, q))
  })
  sets.set(id, set)
  const first = sets.size === 1
  showSet(set, first)
  if (first) useLoot(id)
  else {
    // drawn once so the instance matrices are valid when it is switched on
    const keep = [crates, meshes, iconMesh]
    ;[crates, meshes, iconMesh] = [set.crates, set.meshes, set.iconMesh]
    for (const c of crates) writeCrate(c, 0)
    for (const m of meshes) m.instanceMatrix.needsUpdate = true
    iconMesh.instanceMatrix.needsUpdate = true
    ;[crates, meshes, iconMesh] = keep
  }
}

function showSet(set, on) {
  for (const m of set.meshes) m.visible = on
  set.iconMesh.visible = on
  for (const c of set.colliders) if (world.getCollider(c.handle)) c.setEnabled(on)
}

// Makes world `id`'s crates the ones in play (visible, solid, used by crateNear / markOpened).
export function useLoot(id) {
  const set = sets.get(id)
  if (!set) return false
  for (const [k, other] of sets) if (k !== id) showSet(other, false)
  showSet(set, true)
  crates = set.crates
  meshes = set.meshes
  iconMesh = set.iconMesh
  for (const c of crates) writeCrate(c, 0)
  for (const m of meshes) m.instanceMatrix.needsUpdate = true
  iconMesh.instanceMatrix.needsUpdate = true
  return true
}

function writeCrate(c, t) {
  m1.compose(c.pos, q1.setFromAxisAngle(v1.set(0, 1, 0), c.yaw), ONE)
  // Lid: hinge at the back top edge, rotated open by c.open (0..1).
  lidLocal.makeTranslation(0, H, -D / 2).multiply(m3.makeRotationX(-c.open * 1.9))
  parts.forEach(([, , x, y, z, , lid], k) => {
    m2.makeTranslation(x, y, z)
    if (lid) m2.premultiply(lidLocal)
    meshes[k].setMatrixAt(c.i, m3.multiplyMatrices(m1, m2))
  })
  const show = c.opened ? 0 : 1
  v2.set(c.pos.x, c.pos.y + H + 0.55 + Math.sin(t * 2 + c.phase) * 0.08, c.pos.z)
  q1.setFromEuler(e1.set(0, t * 1.6 + c.phase, 0))
  iconMesh.setMatrixAt(c.i, m3.compose(v2, q1, v1.set(show, show * 1.3, show)))
}

// The crate the actor can open (closest, in range), or null.
export function crateNear(actor) {
  let best = null
  let bd = LOOT.interactRange
  for (const c of crates) {
    if (c.opened) continue
    const d = Math.hypot(c.pos.x - actor.pos.x, c.pos.z - actor.pos.z)
    if (d < bd && Math.abs(c.pos.y - actor.pos.y) < 1.5) {
      bd = d
      best = c
    }
  }
  for (const d of drops) {
    if (d.opened || !d.landed) continue
    const dist = Math.hypot(d.pos.x - actor.pos.x, d.pos.z - actor.pos.z)
    if (dist < bd + 0.6) return d
  }
  return best
}

// Fills the actor up from a crate; returns a list of strings for the pickup toast.
function grant(actor, rich) {
  const got = []
  const add = (key, n, label) => {
    const max = ITEMS[key].max
    const before = actor.items[key]
    actor.items[key] = Math.min(max, before + n)
    if (actor.items[key] > before) got.push(`+${actor.items[key] - before} ${label}`)
  }
  // Ammo for both guns.
  for (const s of actor.slots.slice(0, 2)) {
    if (!s.def.reserve) continue
    const before = s.reserve
    s.reserve = Math.min(s.def.reserve * 2, s.reserve + Math.round(s.def.mag * (rich ? 4 : 2)))
    if (s.reserve > before) got.push(`+${s.reserve - before} ${s.def.name} ammo`)
  }
  const r = Math.random()
  if (rich) {
    add('frag', 3, 'Frag')
    add('frostWall', 3, 'Frost Wall')
    add('medkit', 2, 'Medkit')
    if (actor.vest < 3 || actor.helmet < 3) got.push('Vest + Helmet Lv.3')
    actor.ult = actor.operativeDef.charge
    got.push('Ability charged')
  } else {
    if (r < 0.35) add('medkit', 1, 'Medkit')
    else if (r < 0.6) add('frostWall', 2, 'Frost Wall')
    else if (r < 0.8) add('frag', 1, 'Frag')
    else actor.ult = Math.min(actor.operativeDef.charge, actor.ult + 20)
    // A chance of armour: rolled by the server, which then raises vest / helmet.
  }
  return got
}

export function openCrate(actor, c) {
  if (!c || c.opened) return false
  c.opened = true
  c.refillAt = G.time + LOOT.respawn
  if (actor.isPlayer) send('open', c.rich ? { d: c.id } : { c: c.i })
  const got = grant(actor, !!c.rich)
  fx.poof(v1.copy(c.pos).setY(c.pos.y + 0.6), c.rich ? fx.FX_COLORS.gold : fx.FX_COLORS.ice, 16)
  if (actor.isPlayer || c.pos.distanceTo(G.player?.pos ?? c.pos) < 25) sfx.crateOpen()
  emit('loot', { actor, items: got, rich: !!c.rich })
  if (c.rich) c.removeAt = G.time + 2.5
  return true
}

// --- Supply drops ---------------------------------------------------------------------
const drops = []
const dropMats = {
  crate: new MeshStandardMaterial({ color: '#c0392b', roughness: 0.55, metalness: 0.2 }),
  trim: new MeshStandardMaterial({ color: '#f4d03f', roughness: 0.4, metalness: 0.6 }),
  chute: new MeshStandardMaterial({ color: '#ff7a1a', roughness: 0.8, side: DoubleSide }),
  chute2: new MeshStandardMaterial({ color: '#ffffff', roughness: 0.8, side: DoubleSide }),
  rope: new MeshBasicMaterial({ color: '#333333' }),
}
function buildDropModel() {
  const g = new Group()
  const box = new Mesh(new BoxGeometry(1.5, 1.2, 1.5), dropMats.crate)
  box.position.y = 0.6
  box.castShadow = true
  g.add(box)
  for (const [x, z] of [[0.76, 0.76], [-0.76, 0.76], [0.76, -0.76], [-0.76, -0.76]]) {
    const post = new Mesh(new BoxGeometry(0.12, 1.24, 0.12), dropMats.trim)
    post.position.set(x, 0.6, z)
    g.add(post)
  }
  const band = new Mesh(new BoxGeometry(1.56, 0.16, 1.56), dropMats.trim)
  band.position.y = 0.95
  g.add(band)
  const light = new Mesh(new SphereGeometry(0.12, 10, 8), new MeshStandardMaterial({ color: '#ff5050', emissive: '#ff2020', emissiveIntensity: 3 }))
  light.position.y = 1.28
  g.add(light)
  // Parachute: a dome of alternating panels plus lines.
  const chute = new Group()
  for (let i = 0; i < 8; i++) {
    const panel = new Mesh(new SphereGeometry(3.2, 6, 6, (i / 8) * Math.PI * 2, Math.PI / 4, 0, Math.PI / 2.6), i % 2 ? dropMats.chute : dropMats.chute2)
    chute.add(panel)
  }
  chute.scale.set(1, 0.55, 1)
  chute.position.y = 6.5
  g.add(chute)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    const rope = new Mesh(new CylinderGeometry(0.015, 0.015, 6, 3), dropMats.rope)
    rope.position.set(Math.cos(a) * 1.4, 4.2, Math.sin(a) * 1.4)
    rope.lookAt(0, 1.2, 0)
    rope.rotateX(Math.PI / 2)
    g.add(rope)
  }
  g.userData.chute = chute
  return g
}
// Shader warm-up (warmup.js): a drop is only built when one falls, so boot warms a sample.
export const warmSamples = () => [buildDropModel()]

// at: landing point; id: the server's drop id; age: s since it was dropped (late joiners).
export function spawnDrop(at, id = 0, age = 0) {
  const model = buildDropModel()
  const y = Math.max(at.y, at.y + 80 - (80 / LOOT.airdropFall) * age)
  const d = { id, pos: at.clone(), y, landed: false, opened: false, rich: true, model, beam: fx.makeLootBeam('#ff6a3d', 60, 0.6), t: 0 }
  model.position.set(at.x, d.y, at.z)
  d.beam.position.set(at.x, at.y, at.z)
  G.scene.add(model, d.beam)
  drops.push(d)
  sfx.airdrop()
  emit('airdrop', d)
  return d
}

export function updateLoot(dt, t) {
  if (!parts) return
  for (const c of crates) {
    const want = c.opened ? 1 : 0
    if (c.opened && G.time >= c.refillAt) {
      c.opened = false
      fx.beam(c.pos, '#7ff3ff', 0.6, 0.5, 3)
    }
    c.open += (want - c.open) * (1 - Math.exp(-10 * dt))
    writeCrate(c, t)
  }
  for (const m of meshes) m.instanceMatrix.needsUpdate = true
  iconMesh.instanceMatrix.needsUpdate = true

  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i]
    d.t += dt
    if (!d.landed) {
      d.y = Math.max(d.pos.y, d.y - (80 / LOOT.airdropFall) * dt)
      d.model.position.y = d.y
      d.model.rotation.y += dt * 0.4
      d.model.userData.chute.rotation.z = Math.sin(d.t * 1.3) * 0.06
      if (d.y <= d.pos.y + 0.01) {
        d.landed = true
        d.model.userData.chute.visible = false
        fx.dustKick(d.pos, 20)
        fx.ring(d.pos, 0.5, 4, 0.6, '#ffb070')
        // Red smoke trail while it waits.
      }
    } else if (!d.opened && Math.random() < dt * 8) {
      fx.emitBlend(d.pos.x + 0.6, d.pos.y + 1.3, d.pos.z, 0.2, 1.4, 0.1, 2.5, 0.6, new Color('#ff4b3a'), 0.5, 0.2, 0.2, 0.7)
    }
    if (d.opened && G.time > (d.removeAt ?? 0)) {
      d.model.removeFromParent()
      d.beam.removeFromParent()
      drops.splice(i, 1)
    }
  }
}

// Another player opened a crate (index c) or a drop (id d).
export function markOpened(c, d) {
  if (typeof c === 'number') {
    const crate = crates[c]
    if (crate && !crate.opened) {
      crate.opened = true
      crate.refillAt = G.time + LOOT.respawn
      fx.poof(v1.copy(crate.pos).setY(crate.pos.y + 0.6), fx.FX_COLORS.ice, 10)
    }
  } else if (typeof d === 'number') {
    const drop = drops.find((x) => x.id === d)
    if (drop && !drop.opened) {
      drop.opened = true
      drop.removeAt = G.time + 2.5
    }
  }
}

// The room's opened crates (index -> round clock they refill) on joining a round.
export function syncCrates(map) {
  if (!map) return
  map.forEach((at, key) => {
    const crate = crates[Number(key)]
    if (crate) {
      crate.opened = true
      crate.refillAt = at
    }
  })
}

// The room's supply drops: spawns any this client has not drawn yet.
export function syncDrops(list) {
  if (!list || !G.island) return
  list.forEach((s) => {
    let d = drops.find((x) => x.id === s.id)
    if (!d && !s.opened) {
      d = spawnDrop(new Vector3(s.x, G.island.groundHeight(s.x, s.z), s.z), s.id, Math.max(0, G.time - s.at))
    }
    if (d && s.opened && !d.opened) {
      d.opened = true
      d.removeAt = G.time + 2.5
    }
  })
}

export const activeDrops = () => drops
export const allCrates = () => crates

export function resetLoot() {
  for (const c of crates) {
    c.opened = false
    c.open = 0
  }
  for (const d of drops) {
    d.model.removeFromParent()
    d.beam.removeFromParent()
  }
  drops.length = 0
}

