// Old Farm (south-west): a red timber barn (open doors at both ends, stalls,
// a hayloft reached by a wooden stair), a corrugated silo, a fenced field of
// crop rows with a scarecrow, a tractor, a well, a chicken coop, hay bales,
// a water trough, and a classic windmill whose sails turn.
import { Group, IcosahedronGeometry } from 'three'
import { Batch, cylGeo } from './geom.js'
import { M, TINT } from './materials.js'
import { occupy, occupyCircle } from './layout.js'
import { barrel, crate, gableRoof, railFence, railing, sign, slab, stairs, wall, wallZ, win } from './kit.js'
import { hayBale } from './fields.js'
import { mulberry32 } from '../textures.js'

const RED = 0xb8352a
const WHITE = 0xf4f0e6

export function build(ctx) {
  const B = new Batch('farm')
  const { nature: N } = ctx
  barn(B, ctx, -70, 24, -54, 36)
  silo(B, ctx, -48.5, 20.5)
  cropField(B, ctx, -98, 20, -76, 44)
  windmill(B, ctx, -92, 53)

  // farmyard props
  tractor(B, -44, 0, 41, -0.4)
  well(B, -39.5, 23)
  coop(B, -40, 43.5)
  // water trough + feed sacks
  B.span(M.wood, -57.5, 0, 19.0, -54.5, 0.7, 20.0, { tint: 0x8a6a4a, solid: true })
  B.span(M.water, -57.3, 0.55, 19.15, -54.7, 0.6, 19.85)
  for (let i = 0; i < 4; i++) B.box(M.cloth, 0.6, 0.35, 0.9, -51.5 + (i % 2) * 0.65, 0.18 + Math.floor(i / 2) * 0.35, 38.5, { ry: i * 0.3, tint: 0xd8c8a0 })
  for (const [x, z, r] of [[-50, 44, true], [-48.2, 44.4, true], [-49.2, 42.6, false], [-36.5, 36, true], [-62, 40, false], [-61, 40.2, false]]) hayBale(B, x, 0, z, x * 0.7, r)
  hayBale(B, -61.5, 0.55, 40.1, 0.3, false)
  barrel(B, -53, 0, 22.5, 0x3f8a4a)
  barrel(B, -52.2, 0, 22.9, 0x3f8a4a)
  crate(B, -38, 0, 30, 1.0, 0.3)
  crate(B, -38.2, 0, 31.1, 1.0, 0.1)
  ctx.loot({ x: -45, y: 0, z: 26 })
  // farmyard fence (south side, with a gate) + mailbox sign
  railFence(B, -58, 47.5, -46, 47.5)
  railFence(B, -42, 47.5, -34.5, 47.5)
  railFence(B, -34.5, 47.5, -34.5, 36.5)
  sign(B, 'OLD FARM', -35.2, 1.7, 33.6, 2.4, 0.6, { bg: '#b8352a', fg: '#fff3d0', border: '#fff3d0', w: 512, h: 128 }, Math.PI / 2)
  B.span(M.wood, -35.3, 0, 32.4, -35.15, 2.0, 32.55, { tint: 0x7a5232 })
  B.span(M.wood, -35.3, 0, 34.65, -35.15, 2.0, 34.8, { tint: 0x7a5232 })
  // trees around the farm
  for (const [x, z] of [[-75, 15], [-56, 49.5], [-30, 44], [-74, 49], [-102, 40]]) N.tree(x, z, { s: 0.95 })
  for (const [x, z] of [[-44, 16], [-66, 46], [-32, 26]]) N.bush(x, z, 0.7)

  B.build(ctx.root, true)
  occupy(-103, 14, -34, 60)
}

function barn(B, ctx, x0, z0, x1, z1) {
  const y0 = 0.15
  const H = 5.5
  const T = 0.25
  const zc = (z0 + z1) / 2
  slab(B, x0, z0, x1, z1, y0, y0, [], { mat: M.floorWood, tint: 0xa88058 })
  B.span(M.stone, x0 - 0.15, 0, z0 - 0.15, x1 + 0.15, y0 - 0.01, z1 + 0.15, { tint: 0xb8b8b8 })
  const o = { mat: M.boardsV, tint: RED, inner: { mat: M.boardsV, tint: 0x9a5a3a }, frameTint: WHITE, sashTint: WHITE, leaf: false, plinth: { mat: M.stone, tint: 0xcfcfcf, h: 0.5 } }
  const bigE = { x: zc, w: 4.6, y: 0, h: 4.1, kind: 'door', leaf: false }
  const bigW = { x: zc, w: 4.0, y: 0, h: 4.0, kind: 'door', leaf: false }
  const sw = (x) => win(x, 1.2, 1.7, 1.0)
  wall(B, x0 - T / 2, x1 + T / 2, z0, y0, H, T, { ...o, out: -1, openings: [sw(-66), sw(-62), sw(-58)] })
  wall(B, x0 - T / 2, x1 + T / 2, z1, y0, H, T, { ...o, out: 1, openings: [sw(-64.5), sw(-58), { x: -60.5, w: 1.8, y: 0, h: 2.5, kind: 'door', leaf: false }] })
  wallZ(B, z0 + T / 2, z1 - T / 2, x0, y0, H, T, { ...o, out: -1, openings: [bigW] })
  wallZ(B, z0 + T / 2, z1 - T / 2, x1, y0, H, T, { ...o, out: 1, openings: [bigE] })
  // white corner boards + X-braced sliding door leaves parked beside the big doors
  for (const cx of [x0, x1]) for (const cz of [z0, z1]) B.span(M.paint, cx - 0.2, y0, cz - 0.2, cx + 0.2, y0 + H, cz + 0.2, { tint: WHITE })
  for (const [x, s, w] of [[x1, 1, 4.6], [x0, -1, 4.0]]) {
    for (const side of [-1, 1]) {
      const zA = zc + side * (w / 2 + 0.15)
      const zB = zc + side * (w / 2 + 0.15 + w / 2)
      const fx = x + s * (T / 2 + 0.05)
      const fx2 = fx + s * 0.08
      B.span(M.boardsV, fx, y0, Math.min(zA, zB), fx2, y0 + 3.9, Math.max(zA, zB), { tint: RED })
      const L = Math.hypot(w / 2, 3.6)
      const ang = Math.atan2(3.6, w / 2)
      const mid = (zA + zB) / 2
      for (const a of [ang, -ang]) B.box(M.paint, 0.04, 0.16, L, fx2 + s * 0.02, y0 + 1.95, mid, { rx: a, tint: WHITE })
      B.span(M.paint, fx2, y0 + 3.7, Math.min(zA, zB), fx2 + s * 0.04, y0 + 3.9, Math.max(zA, zB), { tint: WHITE })
      B.span(M.paint, fx2, y0, Math.min(zA, zB), fx2 + s * 0.04, y0 + 0.2, Math.max(zA, zB), { tint: WHITE })
    }
    B.span(M.paint, x + s * (T / 2), y0 + 4.0, zc - w - 0.4, x + s * (T / 2 + 0.2), y0 + 4.15, zc + w + 0.4, { tint: 0x444444 })
  }
  // roof (dark shingles), hayloft door panel + hoist beam on the east gable
  gableRoof(B, x0, z0, x1, z1, y0 + H, 4.2, { tint: TINT.darkSlate, wallMat: M.boardsV, wallTint: RED, t: T, ov: 0.6, trimTint: WHITE, vent: false })
  B.span(M.boardsV, x1 + T / 2, y0 + H + 0.3, zc - 1.0, x1 + T / 2 + 0.06, y0 + H + 2.2, zc + 1.0, { tint: 0x8a2a20 })
  B.span(M.paint, x1 + T / 2 + 0.06, y0 + H + 0.3, zc - 1.1, x1 + T / 2 + 0.1, y0 + H + 2.3, zc + 1.1, { tint: WHITE })
  B.span(M.wood, x1, y0 + H + 2.7, zc - 0.15, x1 + 1.6, y0 + H + 2.95, zc + 0.15, { tint: 0x6e4f34 })
  B.span(M.paint, x1 + 1.4, y0 + H + 1.2, zc - 0.01, x1 + 1.42, y0 + H + 2.7, zc + 0.01, { tint: 0x333333 })
  B.span(M.chrome, x1 + 1.32, y0 + H + 1.0, zc - 0.08, x1 + 1.5, y0 + H + 1.2, zc + 0.08, { tint: 0x888888 })
  sign(B, 'EST. 1952', x1 + T / 2 + 0.11, y0 + H - 0.55, zc, 1.8, 0.45, { bg: '#f4f0e6', fg: '#8a2a20', border: '#8a2a20', w: 256, h: 64, font: '700 40px Fredoka, serif' }, Math.PI / 2)
  // hayloft over the east half + stair up the south wall
  const LY = y0 + 4.25
  const lx0 = -61.0
  slab(B, lx0, z0 + T / 2, x1 - T / 2, z1 - T / 2, LY, 0.2, [], { mat: M.floorWood, tint: 0xb08a5a, under: { mat: M.wood, tint: 0x8a6a4a } })
  for (let z = z0 + 2; z < z1 - 1; z += 3.2) B.span(M.wood, lx0 - 0.12, y0, z - 0.12, lx0 + 0.12, LY - 0.2, z + 0.12, { tint: 0x6e4f34, solid: true })
  railing(B, lx0, z0 + 0.2, lx0, z1 - 1.85, LY, { mat: M.wood, tint: 0x8a6a4a })
  stairs(B, -67.6, y0, z1 - 0.9, Math.PI / 2, 1.4, LY - y0, 6.6, { mat: M.wood, tint: 0x9b7048, style: 'open', stringerMat: M.wood, stringerTint: 0x6e4f34, rails: ['right'], railTint: 0x6e4f34 })
  for (const [x, z, r] of [[-58, 25.8, false], [-56.6, 25.8, false], [-57.3, 25.8, false], [-55.6, 27.4, true], [-57.5, 33.5, true]]) hayBale(B, x, LY, z, 0.2 * x, r)
  hayBale(B, -57.3, LY + 0.55, 25.8, 0.1, false)
  ctx.loot({ x: -58.5, y: LY, z: 30 })
  // stalls along the north wall (west half) + trough, tools, bales on the floor
  for (let k = 0; k <= 3; k++) {
    const x = -69.85 + k * 2.6
    B.span(M.wood, x - 0.06, y0, z0 + T / 2, x + 0.06, y0 + 1.35, z0 + 3.0, { tint: 0x8a6a4a, solid: true })
  }
  B.span(M.wood, -69.85, y0 + 1.1, z0 + 2.95, -62.05, y0 + 1.25, z0 + 3.05, { tint: 0x8a6a4a })
  B.span(M.wood, -69.6, y0, z0 + 0.3, -62.3, y0 + 0.5, z0 + 0.8, { tint: 0x6e4f34 })
  B.span(M.hay, -69.5, y0 + 0.5, z0 + 0.35, -62.4, y0 + 0.6, z0 + 0.75)
  for (const [x, z] of [[-66, 33], [-64.8, 33.2], [-65.4, 31.9]]) hayBale(B, x, y0, z, x, false)
  barrel(B, -55.5, y0, 34.6, 0x8a5a34)
  crate(B, -56.6, y0, 34.8, 0.9, 0.2)
  for (let k = 0; k < 4; k++) B.box(M.wood, 0.05, 1.6, 0.05, -60.5 + k * 0.35, y0 + 1.9, z0 + T / 2 + 0.06, { rz: 0.05, tint: 0x8a6a4a })
  ctx.loot({ x: -63, y: y0, z: 29.5 })
}

function silo(B, ctx, x, z) {
  const R = 2.5
  const H = 12
  B.cyl(M.concrete, R + 0.3, R + 0.3, 0.4, x, 0.2, z, { tint: 0xcfcfcf, seg: 18 })
  B.cyl(M.metal, R, R, H, x, 0.4 + H / 2, z, { tint: 0xd8dde2, seg: 18, solid: true })
  for (let k = 1; k < 6; k++) B.cyl(M.paint, R + 0.04, R + 0.04, 0.12, x, 0.4 + k * 2, z, { tint: 0x9aa3ad, seg: 18 })
  B.geo(M.metal, cylGeo(0.3, R + 0.15, 1.6, 18, false), x, 0.4 + H + 0.8, z, { tint: 0xc0c6cc })
  B.cyl(M.paint, 0.35, 0.35, 0.4, x, 0.4 + H + 1.8, z, { tint: 0x9aa3ad, seg: 8 })
  // ladder + cage
  for (const dz of [-0.25, 0.25]) B.span(M.chrome, x + R + 0.05, 0.4, z + dz - 0.03, x + R + 0.11, 0.4 + H, z + dz + 0.03, { tint: 0x9aa3ad })
  for (let k = 0; k < 24; k++) B.span(M.chrome, x + R + 0.05, 0.7 + k * 0.48, z - 0.25, x + R + 0.11, 0.73 + k * 0.48, z + 0.25, { tint: 0x9aa3ad })
  // little door + chute
  B.span(M.paint, x - 0.6, 0.4, z + R - 0.05, x + 0.6, 2.4, z + R + 0.05, { tint: 0x6e7880 })
  B.box(M.metal, 0.6, 0.6, 3.2, x - 1.6, 3.6, z + R + 0.8, { rx: 0.7, tint: 0xb8c0c8 })
  ctx.loot({ x: x - 3.4, y: 0, z: z + 1 })
  occupyCircle(x, z, R + 1)
}

function cropField(B, ctx, x0, z0, x1, z1) {
  const rand = mulberry32(99)
  // fence with a gate on the east side
  railFence(B, x0, z0, x1, z0)
  railFence(B, x0, z1, x1, z1)
  railFence(B, x0, z0, x0, z1)
  railFence(B, x1, z0, x1, 30.5)
  railFence(B, x1, 34, x1, z1)
  // rows along x
  let row = 0
  for (let z = z0 + 1.6; z < z1 - 1; z += 1.7, row++) {
    B.span(M.soil, x0 + 1.2, 0, z - 0.42, x1 - 1.2, 0.26, z + 0.42, { tint: 0xffffff })
    const kind = row % 4 === 3 ? 'pumpkin' : row % 4 === 1 ? 'cabbage' : 'corn'
    for (let x = x0 + 1.8; x < x1 - 1.4; x += kind === 'corn' ? 0.9 : 1.2) {
      const jx = x + (rand() - 0.5) * 0.2
      if (kind === 'corn') {
        const h = 1.6 + rand() * 0.5
        B.cyl(M.leaf, 0.04, 0.05, h, jx, 0.26 + h / 2, z, { tint: 0x6fae3a, seg: 4 })
        B.box(M.leaf, 0.7, 0.04, 0.14, jx + 0.25, 0.26 + h * 0.5, z, { rz: 0.5, ry: rand() * 3, tint: 0x5c9e33 })
        B.box(M.leaf, 0.6, 0.04, 0.12, jx - 0.2, 0.26 + h * 0.72, z, { rz: -0.5, ry: rand() * 3, tint: 0x6fbe3a })
      } else if (kind === 'cabbage') {
        B.geo(M.leaf, new IcosahedronGeometry(0.32, 0), jx, 0.42, z, { sy: 0.7, tint: 0x8fd16a })
      } else {
        B.geo(M.leaf, new IcosahedronGeometry(0.34, 0), jx, 0.5, z, { sy: 0.7, tint: 0xf08a24 })
        B.cyl(M.leaf, 0.03, 0.04, 0.14, jx, 0.78, z, { tint: 0x5a7a2a, seg: 4 })
      }
    }
  }
  // scarecrow
  const sx = (x0 + x1) / 2
  const sz = (z0 + z1) / 2 + 0.85
  B.span(M.wood, sx - 0.06, 0, sz - 0.06, sx + 0.06, 2.6, sz + 0.06, { tint: 0x7a5232 })
  B.span(M.wood, sx - 1.0, 1.85, sz - 0.05, sx + 1.0, 1.95, sz + 0.05, { tint: 0x7a5232 })
  B.span(M.cloth, sx - 0.35, 1.2, sz - 0.18, sx + 0.35, 2.0, sz + 0.18, { tint: 0x3f6fb0 })
  B.span(M.cloth, sx - 0.95, 1.8, sz - 0.12, sx + 0.95, 2.0, sz + 0.12, { tint: 0xc0392b })
  B.geo(M.cloth, new IcosahedronGeometry(0.24, 1), sx, 2.3, sz, { tint: 0xe8d8a0 })
  B.geo(M.hay, cylGeo(0.05, 0.45, 0.35, 8, false), sx, 2.6, sz, { tint: 0xffffff })
  ctx.loot({ x: sx + 1.5, y: 0, z: sz })
}

// Classic tower windmill; sails turn about the axle (facing east).
function windmill(B, ctx, x, z) {
  const H = 10
  B.cyl(M.stone, 3.6, 3.8, 1.0, x, 0.5, z, { tint: 0xd8d8d8, seg: 8 })
  B.cyl(M.stucco, 2.3, 3.4, H, x, 1.0 + H / 2, z, { tint: 0xf6efe2, seg: 8, solid: true })
  for (const y of [3.8, 7.2]) B.cyl(M.paint, 2.95 - (y / H) * 0.9, 3.0 - (y / H) * 0.9, 0.15, x, 1 + y, z, { tint: 0x8a5a34, seg: 8 })
  // door + windows (decor)
  B.box(M.wood, 1.3, 2.2, 0.12, x + 3.25, 2.1, z, { ry: Math.PI / 2, tint: 0x6e4528 })
  B.box(M.paint, 1.5, 2.4, 0.06, x + 3.22, 2.15, z, { ry: Math.PI / 2, tint: 0xffffff })
  for (const [a, y] of [[0.5, 5.5], [2.6, 4.5], [-1.9, 7.0]]) {
    const r = 3.4 - ((y - 1) / H) * 1.1
    B.box(M.dark, 0.7, 0.9, 0.08, x + Math.cos(a) * r, y, z + Math.sin(a) * r, { ry: -a + Math.PI / 2, tint: 0x203848 })
  }
  // gallery (balcony) + cap
  B.cyl(M.wood, 3.4, 3.4, 0.15, x, 1 + H * 0.62, z, { tint: 0x8a6a4a, seg: 8 })
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2
    B.span(M.wood, x + Math.cos(a) * 3.3 - 0.04, 1 + H * 0.62, z + Math.sin(a) * 3.3 - 0.04, x + Math.cos(a) * 3.3 + 0.04, 1 + H * 0.62 + 0.9, z + Math.sin(a) * 3.3 + 0.04, { tint: 0x8a6a4a })
  }
  B.cyl(M.wood, 3.35, 3.35, 0.08, x, 1 + H * 0.62 + 0.9, z, { tint: 0x8a6a4a, seg: 8, open: true })
  B.geo(M.shingle, cylGeo(0.2, 2.7, 2.8, 8, false), x, 1 + H + 1.4, z, { tint: 0x5a4a3a })
  B.cyl(M.wood, 0.25, 0.3, 1.4, x + 2.2, 1 + H + 0.6, z, { rz: Math.PI / 2 - 0.1, tint: 0x6e4f34, seg: 8 })
  // sails (separate group, animated)
  const S = new Batch('windmillSails')
  S.cyl(M.wood, 0.4, 0.4, 0.5, 0, 0, 0, { rz: Math.PI / 2, tint: 0x5a3a24, seg: 10 })
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2
    const ca = Math.cos(a)
    const sa = Math.sin(a)
    // spar, then a one-sided lattice + cloth sail offset to the trailing side
    S.box(M.wood, 0.14, 9.0, 0.14, 0.3, ca * 4.5, sa * 4.5, { rx: a, tint: 0x6e4f34 })
    const py = -sa * 0.8
    const pz = ca * 0.8
    for (let r = 1.6; r <= 8.6; r += 1.0) S.box(M.wood, 0.06, 0.06, 1.7, 0.32, ca * r + py, sa * r + pz, { rx: a, tint: 0x8a6a4a })
    for (const off of [0.05, 1.55]) S.box(M.wood, 0.06, 7.2, 0.06, 0.32, ca * 5.1 - sa * off, sa * 5.1 + ca * off, { rx: a, tint: 0x8a6a4a })
    S.box(M.cloth, 0.03, 7.0, 1.45, 0.36, ca * 5.1 + py, sa * 5.1 + pz, { rx: a, tint: 0xf4eedf })
  }
  const sails = new Group()
  S.build(sails, true)
  sails.position.set(x + 3.1, 1 + H + 0.45, z)
  ctx.root.add(sails)
  ctx.anim((dt) => {
    sails.rotation.x += dt * 0.6
    if (sails.rotation.x > Math.PI * 2) sails.rotation.x -= Math.PI * 2
  })
  occupyCircle(x, z, 4.5)
}

function tractor(B, x, y, z, yaw) {
  B.push(x, y, z, yaw)
  const g = 0x2e8b3a
  B.span(M.gloss, -0.6, 0.7, -0.4, 0.6, 1.5, 2.2, { tint: g })
  B.span(M.gloss, -0.75, 0.6, -1.6, 0.75, 1.3, -0.3, { tint: g })
  B.span(M.dark, -0.7, 1.3, -1.5, 0.7, 2.6, -0.2, { tint: 0x203848 })
  B.span(M.gloss, -0.8, 2.6, -1.6, 0.8, 2.72, -0.1, { tint: 0xf2c230 })
  for (const sx of [-1, 1]) {
    B.cyl(M.rubber, 0.85, 0.85, 0.5, sx * 0.95, 0.85, -1.0, { rz: Math.PI / 2, seg: 14 })
    B.cyl(M.paint, 0.45, 0.45, 0.52, sx * 0.95, 0.85, -1.0, { rz: Math.PI / 2, seg: 10, tint: 0xf2c230 })
    B.cyl(M.rubber, 0.5, 0.5, 0.35, sx * 0.75, 0.5, 1.7, { rz: Math.PI / 2, seg: 12 })
    B.cyl(M.paint, 0.26, 0.26, 0.37, sx * 0.75, 0.5, 1.7, { rz: Math.PI / 2, seg: 8, tint: 0xf2c230 })
  }
  B.cyl(M.chrome, 0.07, 0.07, 1.0, 0.35, 2.0, 1.6, { tint: 0x555555, seg: 6 })
  B.span(M.paint, -0.5, 0.75, 2.2, 0.5, 1.35, 2.25, { tint: 0x222222 })
  B.solid(0.95, 1.0, 1.9, 0, 1.0, 0.3)
  B.pop()
}

function well(B, x, z) {
  B.cyl(M.stone, 1.1, 1.2, 0.9, x, 0.45, z, { tint: 0xd8d8d8, seg: 10, solid: true })
  B.cyl(M.paint, 0.9, 0.9, 0.05, x, 0.8, z, { tint: 0x1a3a4a, seg: 10 })
  for (const dx of [-1.0, 1.0]) B.span(M.wood, x + dx - 0.08, 0.9, z - 0.08, x + dx + 0.08, 2.5, z + 0.08, { tint: 0x6e4f34 })
  B.cyl(M.wood, 0.1, 0.1, 2.0, x, 2.0, z, { rz: Math.PI / 2, tint: 0x8a6a4a, seg: 8 })
  B.box(M.shingle, 2.6, 0.08, 1.0, x, 2.75, z - 0.42, { rx: -0.5, tint: TINT.terracotta })
  B.box(M.shingle, 2.6, 0.08, 1.0, x, 2.75, z + 0.42, { rx: 0.5, tint: TINT.terracotta })
  B.cyl(M.wood, 0.18, 0.15, 0.3, x, 1.5, z, { tint: 0x8a6a4a, seg: 8 })
}

function coop(B, x, z) {
  for (const [dx, dz] of [[-1, -0.7], [1, -0.7], [-1, 0.7], [1, 0.7]]) B.span(M.wood, x + dx - 0.06, 0, z + dz - 0.06, x + dx + 0.06, 0.8, z + dz + 0.06, { tint: 0x6e4f34 })
  B.span(M.boardsV, x - 1.1, 0.8, z - 0.8, x + 1.1, 2.0, z + 0.8, { tint: 0xd8b07a, solid: true })
  B.span(M.paint, x - 0.25, 0.85, z + 0.8, x + 0.25, 1.4, z + 0.82, { tint: 0x2a1a10 })
  B.box(M.wood, 0.4, 0.04, 1.1, x, 0.45, z + 1.25, { rx: 0.6, tint: 0x8a6a4a })
  B.box(M.shingle, 2.6, 0.08, 1.2, x, 2.25, z - 0.45, { rx: -0.45, tint: RED })
  B.box(M.shingle, 2.6, 0.08, 1.2, x, 2.25, z + 0.45, { rx: 0.45, tint: RED })
  for (let k = 0; k < 3; k++) {
    const cx = x - 1.2 + k * 1.1
    const cz = z + 2.0 + (k % 2) * 0.5
    B.geo(M.paint, new IcosahedronGeometry(0.18, 0), cx, 0.2, cz, { tint: 0xffffff, sx: 1.2 })
    B.geo(M.paint, new IcosahedronGeometry(0.09, 0), cx + 0.18, 0.36, cz, { tint: 0xffffff })
    B.span(M.paint, cx + 0.22, 0.42, cz - 0.02, cx + 0.28, 0.48, cz + 0.02, { tint: 0xd8261c })
  }
}

