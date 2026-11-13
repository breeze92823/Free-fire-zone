// Fountain Plaza (north-east): a cobbled square with a two-tier fountain
// (animated jet + droplets), benches, cherry trees in stone planters, lamps,
// a flower cart, a gateway arch, and Café Aroma on the north side (shop
// windows, striped awning, outdoor tables with umbrellas, counter inside).
import { BufferAttribute, BufferGeometry, IcosahedronGeometry, InstancedMesh, Mesh, Object3D, SphereGeometry } from 'three'
import { Batch, cylGeo } from './geom.js'
import { M } from './materials.js'
import { DISTRICTS, occupy } from './layout.js'
import { acUnit, bench, cafeTable, counter, crate, door, flatRoof, plant, room, sign, slab, stool, streetLamp, trashBin, wall, win } from './kit.js'

const PX0 = 25
const PX1 = 57
const PZ0 = -92
const PZ1 = -60

export function build(ctx) {
  const B = new Batch('plaza')
  const { nature: N } = ctx
  const { x: FX, z: FZ } = DISTRICTS.plaza
  const top = 0.08

  // --- paving + kerb ---
  B.span(M.cobble, PX0, 0, PZ0, PX1, top, PZ1)
  B.solidSpan(PX0, -0.2, PZ0, PX1, top, PZ1)
  const k = 0.3
  const kerb = (x0, z0, x1, z1) => B.span(M.concrete, x0, 0, z0, x1, 0.22, z1, { tint: 0xd6d2ca })
  kerb(PX0 - k, PZ1, -3 + FX, PZ1 + k)
  kerb(FX + 3, PZ1, PX1 + k, PZ1 + k)
  kerb(PX1, PZ0 - k, PX1 + k, FZ - 3)
  kerb(PX1, FZ + 3, PX1 + k, PZ1)
  kerb(PX0 - k, PZ0 - k, PX0, -70)
  // decorative inlay ring around the fountain
  B.geo(M.decal, ringGeo(7.4, 8.1, 40), FX, top + 0.004, FZ, { tint: 0x8a7f72 })

  // --- fountain ---
  fountain(B, ctx, FX, top, FZ)

  // --- benches facing the fountain, lamps, bins ---
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8
    const r = 9.5
    bench(B, FX + Math.cos(a) * r, top, FZ + Math.sin(a) * r, -a - Math.PI / 2, { tint: 0x8a5a34 })
  }
  for (const [dx, dz] of [[-11, -11], [11, -11], [-11, 11], [11, 11]]) {
    const p = streetLamp(B, FX + dx, top, FZ + dz, Math.atan2(-dx, -dz), { h: 4.4, tint: 0x1f2a30 })
    ctx.lamp(p, 3)
  }
  trashBin(B, FX - 13, top, FZ + 2, 0x2e5d7d)
  trashBin(B, FX + 13, top, FZ - 2, 0x2e5d7d)

  // --- corner planters with cherry trees + flower beds ---
  for (const [dx, dz] of [[-12.5, -12.5], [12.5, -12.5], [-12.5, 12.5], [12.5, 12.5]]) {
    const x = FX + dx
    const z = FZ + dz
    B.span(M.stone, x - 1.4, top, z - 1.4, x + 1.4, top + 0.6, z + 1.4, { tint: 0xe8e2d6, solid: true })
    B.span(M.concrete, x - 1.5, top + 0.6, z - 1.5, x + 1.5, top + 0.7, z + 1.5, { tint: 0xd8d2c6 })
    B.span(M.soil, x - 1.25, top + 0.6, z - 1.25, x + 1.25, top + 0.66, z + 1.25)
    N.cherry(x, z, 0.85)
  }
  for (const [x0, z0] of [[PX0 + 2, PZ1 - 2.5], [PX1 - 6, PZ1 - 2.5]]) {
    B.span(M.stone, x0, top, z0 - 0.6, x0 + 4, top + 0.4, z0 + 0.6, { tint: 0xe2dcd0, solid: true })
    for (let i = 0; i < 6; i++) B.geo(M.leaf, new IcosahedronGeometry(0.3, 0), x0 + 0.4 + i * 0.64, top + 0.62, z0, { tint: 0x4caf3a, sy: 0.8 })
    for (let i = 0; i < 6; i++) B.geo(M.leaf, new IcosahedronGeometry(0.12, 0), x0 + 0.4 + i * 0.64, top + 0.9, z0 + 0.1, { tint: [0xff5f8a, 0xffd23f, 0xffffff, 0xd884ff][i % 4] })
  }

  // --- gateway arch at the west entrance ---
  const gx = PX0 + 0.4
  const gz = -66
  for (const dz of [-4.4, 4.4]) {
    B.span(M.stone, gx - 0.6, top, gz + dz - 0.6, gx + 0.6, top + 4.6, gz + dz + 0.6, { tint: 0xe2e2e2, solid: true })
    B.span(M.concrete, gx - 0.7, top + 4.6, gz + dz - 0.7, gx + 0.7, top + 4.8, gz + dz + 0.7, { tint: 0xd0d0d0 })
  }
  B.span(M.paint, gx - 0.25, top + 4.1, gz - 4.4, gx + 0.25, top + 4.6, gz + 4.4, { tint: 0x2c3138 })
  sign(B, 'FOUNTAIN PLAZA', gx - 0.27, top + 4.35, gz, 6.0, 0.7, { bg: '#2c3138', fg: '#ffd23f', border: '#ffd23f', w: 512, h: 64, font: '700 44px Fredoka, sans-serif', board: false }, -Math.PI / 2)
  sign(B, 'FOUNTAIN PLAZA', gx + 0.27, top + 4.35, gz, 6.0, 0.7, { bg: '#2c3138', fg: '#ffd23f', border: '#ffd23f', w: 512, h: 64, font: '700 44px Fredoka, sans-serif', board: false }, Math.PI / 2)

  // --- flower cart ---
  flowerCart(B, PX1 - 4.5, top, PZ1 - 6.5, -0.3)
  ctx.loot({ x: PX1 - 7, y: top, z: PZ1 - 8.5 })

  // --- Café Aroma (north side) ---
  cafe(B, ctx, FX - 7, FX + 7, -101.5, PZ0)

  // outdoor seating in front of the café
  for (const [dx, dz, um] of [[-5, 3.2, M.awningTeal], [-0.5, 4.2, M.awningRed], [4.5, 3.2, M.awningTeal]]) cafeTable(B, FX + dx, top, PZ0 + dz, { umbrella: um, chairs: 3, chair: 0x2f6f4f, rot: dx })
  ctx.loot({ x: FX + 2.5, y: top, z: FZ + 6.8 })

  // bollards along the south edge
  for (let x = PX0 + 2; x <= PX1 - 2; x += 3) {
    if (Math.abs(x - FX) < 3.2) continue
    B.cyl(M.paint, 0.14, 0.16, 0.9, x, top + 0.45, PZ1 + 0.6, { tint: 0x2c3138, seg: 8, solid: true })
    B.cyl(M.paint, 0.16, 0.16, 0.06, x, top + 0.75, PZ1 + 0.6, { tint: 0xf2c230, seg: 8 })
  }
  // bike rack + bikes
  bikeRack(B, PX1 - 3, top, FZ + 9)

  B.build(ctx.root, true)
  occupy(PX0 - 1, -103, PX1 + 1, PZ1 + 1)
  for (const [x, z] of [[PX0 - 3, PZ1 + 4], [PX1 + 3, PZ0 + 3], [PX1 + 3, PZ1 + 2], [PX0 - 2, PZ0 - 2]]) N.bush(x, z, 0.8)
}

function ringGeo(r0, r1, seg) {
  const pos = []
  const idx = []
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2
    pos.push(Math.cos(a) * r0, 0, Math.sin(a) * r0, Math.cos(a) * r1, 0, Math.sin(a) * r1)
    if (i < seg) {
      const k = i * 2
      idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3)
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

// Octagonal stone basin, two bowls on a pedestal, water discs, falling-water
// veils, and an animated jet with arcing droplets.
function fountain(B, ctx, x, y, z) {
  const R = 4.6
  const H = 0.62
  const seg = 8
  for (let k = 0; k < seg; k++) {
    const a = (k / seg) * Math.PI * 2 + Math.PI / seg
    const ap = R * Math.cos(Math.PI / seg)
    const len = 2 * R * Math.sin(Math.PI / seg) + 0.5
    const cx = x + Math.cos(a) * ap
    const cz = z + Math.sin(a) * ap
    B.box(M.stone, len, H, 0.5, cx, y + H / 2, cz, { ry: -a + Math.PI / 2, tint: 0xf0ece4, solid: true })
    B.box(M.concrete, len + 0.1, 0.1, 0.7, x + Math.cos(a) * (ap + 0.02), y + H + 0.05, z + Math.sin(a) * (ap + 0.02), { ry: -a + Math.PI / 2, tint: 0xe8e4dc })
  }
  B.cyl(M.paint, R - 0.2, R - 0.2, 0.06, x, y + 0.03, z, { seg, tint: 0x1f7fa0 })
  B.cyl(M.water, R - 0.24, R - 0.24, 0.02, x, y + H - 0.12, z, { seg: 16 })
  // pedestal + bowls
  B.cyl(M.stone, 0.55, 0.75, 1.5, x, y + 0.75, z, { seg: 10, tint: 0xf2eee6, solid: true })
  B.cyl(M.stone, 1.9, 0.6, 0.45, x, y + 1.72, z, { seg: 14, tint: 0xf2eee6 })
  B.cyl(M.water, 1.75, 1.75, 0.02, x, y + 1.93, z, { seg: 14 })
  B.cyl(M.stone, 0.3, 0.4, 0.9, x, y + 2.35, z, { seg: 10, tint: 0xf2eee6 })
  B.cyl(M.stone, 0.95, 0.35, 0.3, x, y + 2.9, z, { seg: 12, tint: 0xf2eee6 })
  B.cyl(M.water, 0.85, 0.85, 0.02, x, y + 3.03, z, { seg: 12 })
  B.cyl(M.stone, 0.12, 0.18, 0.45, x, y + 3.25, z, { seg: 8, tint: 0xf2eee6 })
  // falling veils from the bowl rims
  const veil = new Batch('fountainVeil')
  veil.geo(M.sprayCone, cylGeo(1.92, 2.25, 1.15, 20, true), x, y + 1.22, z)
  veil.geo(M.sprayCone, cylGeo(0.97, 1.25, 1.05, 16, true), x, y + 2.25, z)
  veil.build(ctx.root, false)
  // jet column + droplets (animated)
  const jet = new Mesh(cylGeo(0.06, 0.1, 1.2, 8, true), M.sprayCone)
  jet.position.set(x, y + 3.45 + 0.6, z)
  jet.matrixAutoUpdate = true
  ctx.root.add(jet)
  const n = Math.max(16, Math.round(70 * ctx.q))
  const drops = new InstancedMesh(new SphereGeometry(0.06, 5, 4), M.spray, n)
  drops.frustumCulled = false
  ctx.root.add(drops)
  const d = new Object3D()
  const phase = new Float32Array(n)
  const ang = new Float32Array(n)
  const spd = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    phase[i] = (i * 0.618) % 1
    ang[i] = (i * 2.399) % (Math.PI * 2)
    spd[i] = 0.75 + ((i * 7) % 10) * 0.05
  }
  const y0 = y + 4.0
  ctx.anim((dt, t) => {
    jet.scale.y = 1 + Math.sin(t * 9) * 0.12
    for (let i = 0; i < n; i++) {
      const tau = (t * 0.55 * spd[i] + phase[i]) % 1
      const r = tau * 1.35 * spd[i]
      d.position.set(x + Math.cos(ang[i]) * r, y0 + 1.1 * tau * 2.2 - 4.4 * tau * tau * 1.1, z + Math.sin(ang[i]) * r)
      const s = 1 - tau * 0.4
      d.scale.set(s, s * 1.6, s)
      d.updateMatrix()
      drops.setMatrixAt(i, d.matrix)
    }
    drops.instanceMatrix.needsUpdate = true
  })
  ctx.loot({ x: x + 6, y, z: z - 1.5 })
}

function cafe(B, ctx, x0, x1, z0, z1) {
  const y0 = 0.25
  const H = 3.6
  const T = 0.3
  const tint = 0xf6e2c4
  slab(B, x0, z0, x1, z1, y0, y0, [], { mat: M.checker, tint: 0xffffff })
  B.span(M.stone, x0 - 0.2, 0, z0 - 0.2, x1 + 0.2, y0 - 0.02, z1 + 0.2, { tint: 0xc9c9c9 })
  const xc = (x0 + x1) / 2
  const shop = (x, w) => win(x, w, 0.55, 2.3)
  const o = { mat: M.brick, tint: 0xffffff, inner: { mat: M.plaster, tint: tint }, frameTint: 0x2c3138, sashTint: 0x2c3138, leafTint: 0x2c3138, noTransom: true }
  wall(B, x0 - T / 2, x1 + T / 2, z1, y0, H, T, { ...o, out: 1, openings: [shop(xc - 4.3, 3.4), door(xc, 2.0, 2.6, { leafTint: 0x2c3138 }), shop(xc + 4.3, 3.4)] })
  wall(B, x0 - T / 2, x1 + T / 2, z0, y0, H, T, { ...o, out: -1, openings: [door(xc + 4.5, 1.8, 2.5), win(xc - 3, 1.4, 1.1, 1.3)] })
  room(B, x0, z0, x1, z1, y0, H, T, { n: false, s: false, e: [win((z0 + z1) / 2, 2.0, 0.9, 1.6)], w: [win((z0 + z1) / 2 - 1, 1.6, 0.9, 1.6)] }, o)
  flatRoof(B, x0 - T / 2, z0 - T / 2, x1 + T / 2, z1 + T / 2, y0 + H, { parapet: 0.8, parapetMat: M.brick, parapetTint: 0xffffff, tint: 0x8a8a8a, under: { mat: M.plaster, tint: 0xfaf4ea }, copingTint: 0xf2ece0, fasciaTint: 0x2c3138 })
  // sign on the parapet + awning
  sign(B, 'CAFE AROMA', xc, y0 + H + 0.6, z1 + 0.2, 6.2, 1.1, { bg: '#2c3138', fg: '#ffe7b0', border: '#e8b04a', w: 512, h: 96, font: '700 70px Fredoka, sans-serif' })
  B.box(M.awningRed, x1 - x0 - 0.4, 0.06, 2.3, xc, y0 + 3.05, z1 + 1.05, { rx: 0.35 })
  for (let i = 0; i < 14; i++) {
    const vx = x0 + 0.4 + ((i + 0.5) / 14) * (x1 - x0 - 0.8)
    B.box(M.awningRed, (x1 - x0 - 0.8) / 14 - 0.04, 0.32, 0.03, vx, y0 + 2.48, z1 + 2.15, { tint: 0xffffff })
  }
  for (const sx of [x0 + 0.25, x1 - 0.25]) B.box(M.paint, 0.05, 0.05, 2.3, sx, y0 + 2.98, z1 + 1.05, { rx: 0.35, tint: 0x2c3138 })
  // chalkboard A-frame
  B.box(M.paint, 0.7, 1.0, 0.05, xc + 1.7, 0.6, z1 + 1.1, { rx: 0.2, tint: 0x222a22 })
  B.box(M.paint, 0.7, 1.0, 0.05, xc + 1.7, 0.6, z1 + 1.45, { rx: -0.2, tint: 0x6e4528 })
  // interior: counter, display case, espresso machine, shelves, tables
  const f = y0
  counter(B, xc + 2, f, z0 + 2.4, 0, 5.0, { tint: 0x6e4528 })
  B.span(M.glass, xc - 0.3, f + 1.06, z0 + 2.1, xc + 1.5, f + 1.5, z0 + 2.7)
  B.span(M.chrome, xc + 3.2, f + 1.06, z0 + 2.15, xc + 4.0, f + 1.6, z0 + 2.65, { tint: 0xc8ccd0 })
  B.span(M.paint, xc + 3.3, f + 1.25, z0 + 2.6, xc + 3.9, f + 1.45, z0 + 2.7, { tint: 0x222222 })
  for (const s of [0, 1, 2]) B.span(M.wood, xc - 1.5, f + 1.3 + s * 0.55, z0 + 0.2, xc + 3.3, f + 1.35 + s * 0.55, z0 + 0.5, { tint: 0x8a5a34 })
  for (let i = 0; i < 14; i++) B.cyl(M.paint, 0.07, 0.07, 0.22, xc - 1.2 + (i % 7) * 0.65, f + 1.46 + Math.floor(i / 7) * 0.55, z0 + 0.35, { tint: [0xc0392b, 0xf2c230, 0x3f8a4a, 0xffffff][i % 4], seg: 6 })
  for (const sx of [xc - 0.2, xc + 1.2, xc + 2.6, xc + 4.0]) stool(B, sx, f, z0 + 3.2, 0x2f6f4f)
  for (const [dx, dz] of [[-4.5, -1.8], [-4.5, 1.6], [-1.2, 1.9]]) cafeTable(B, xc + dx, f, (z0 + z1) / 2 + dz, { chairs: 2, chair: 0x8a5a34, top: 0x2c3138, rot: dx })
  plant(B, x0 + 0.7, f, z1 - 0.7, 1.0)
  plant(B, x1 - 0.7, f, z1 - 0.7, 1.0)
  for (const px of [xc - 3, xc, xc + 3]) {
    B.span(M.paint, px - 0.01, f + H - 0.8, z0 + 4.4, px + 0.01, f + H, z0 + 4.42, { tint: 0x222222 })
    B.cyl(M.paint, 0.08, 0.28, 0.25, px, f + H - 0.9, z0 + 4.41, { tint: 0x2c3138, seg: 10 })
    B.cyl(M.bulb, 0.08, 0.08, 0.08, px, f + H - 1.04, z0 + 4.41, { seg: 6 })
  }
  ctx.loot({ x: xc - 2.5, y: f, z: z0 + 1.2 })
  // roof clutter + back alley
  acUnit(B, xc - 4, y0 + H + 0.25, z0 + 1.5)
  acUnit(B, xc - 2.6, y0 + H + 0.25, z0 + 1.5)
  B.cyl(M.chrome, 0.15, 0.15, 1.2, xc + 4, y0 + H + 0.85, z0 + 1.2, { tint: 0xcfd3d8, seg: 8 })
  for (let i = 0; i < 3; i++) crate(B, x0 + 1 + i * 1.1, 0, z0 - 1.4, 1.0, i * 0.3)
  B.span(M.metal, xc + 1, 0, z0 - 2.0, xc + 3.4, 1.3, z0 - 0.7, { tint: 0x2f7d4f, solid: true })
}

function flowerCart(B, x, y, z, yaw) {
  B.push(x, y, z, yaw)
  B.span(M.wood, -1.3, 0.55, -0.6, 1.3, 1.05, 0.6, { tint: 0x8a5a34, solid: true })
  for (const sx of [-1.0, 1.0]) B.cyl(M.paint, 0.38, 0.38, 0.08, sx, 0.4, 0.66, { rx: Math.PI / 2, tint: 0x2c3138, seg: 12 })
  for (let i = 0; i < 8; i++) {
    const bx = -1.0 + (i % 4) * 0.66
    const bz = i < 4 ? -0.25 : 0.25
    B.cyl(M.metal, 0.18, 0.14, 0.3, bx, 1.2, bz, { tint: 0x9aa3ad, seg: 8 })
    B.geo(M.leaf, new IcosahedronGeometry(0.22, 0), bx, 1.48, bz, { tint: [0xff5f8a, 0xffd23f, 0xffffff, 0xd884ff, 0xff7b3a][i % 5] })
  }
  for (const sx of [-1.2, 1.2]) B.span(M.paint, sx - 0.03, 1.05, -0.03, sx + 0.03, 2.4, 0.03, { tint: 0xffffff })
  B.box(M.awningYellow, 2.8, 0.05, 1.6, 0, 2.45, 0, { rx: 0.1 })
  B.pop()
}

function bikeRack(B, x, y, z) {
  for (let i = 0; i < 4; i++) {
    const bx = x - 2.2 + i * 1.2
    B.span(M.chrome, bx - 0.03, y, z - 0.5, bx + 0.03, y + 0.8, z - 0.44, { tint: 0xbfc4c9 })
    B.span(M.chrome, bx - 0.03, y + 0.74, z - 0.5, bx + 0.03, y + 0.8, z + 0.5, { tint: 0xbfc4c9 })
    B.span(M.chrome, bx - 0.03, y, z + 0.44, bx + 0.03, y + 0.8, z + 0.5, { tint: 0xbfc4c9 })
    if (i % 2 === 0) {
      const c = [0xc0392b, 0x2f6fd0][i / 2]
      for (const dz of [-0.55, 0.55]) B.cyl(M.rubber, 0.33, 0.33, 0.05, bx + 0.25, y + 0.33, z + dz, { rz: Math.PI / 2, seg: 14 })
      B.box(M.gloss, 0.05, 0.05, 1.1, bx + 0.25, y + 0.62, z, { tint: c })
      B.box(M.gloss, 0.05, 0.6, 0.05, bx + 0.25, y + 0.5, z - 0.2, { rx: 0.4, tint: c })
      B.span(M.paint, bx + 0.15, y + 0.85, z - 0.35, bx + 0.35, y + 0.9, z - 0.15, { tint: 0x222222 })
    }
  }
  B.solid(2.6, 0.4, 0.55, x - 0.4, y + 0.4, z)
}

