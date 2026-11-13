// Sunset Beach (south): the wide beach below the car park. A raised
// boardwalk along the grass edge, the Sunset Shack beach bar (thatched roof,
// deck, counter, stools, kegs), a lifeguard tower on stilts with a ramp stair
// and flag, umbrellas + loungers, a volleyball net, kayaks, surfboards,
// towels, a sandcastle, showers, palms and an entrance arch.
import { IcosahedronGeometry, PlaneGeometry, TorusGeometry } from 'three'
import { Batch, cylGeo } from './geom.js'
import { M } from './materials.js'
import { beachW, occupy, occupyCircle, shoreR } from './layout.js'
import { barrel, bench, counter, crate, door, flag, fridge, plant, pyramidRoof, railing, room, sign, slab, stairs, stool, trashBin, win } from './kit.js'

// z of the point at `inland` metres from the waterline along the line x = const (south side).
function zAt(x, inland) {
  let lo = 60
  let hi = 150
  for (let k = 0; k < 30; k++) {
    const z = (lo + hi) / 2
    const a = Math.atan2(z, x)
    const d = shoreR(a) - Math.hypot(x, z)
    if (d > inland) lo = z
    else hi = z
  }
  return (lo + hi) / 2
}
const grassEdge = (x) => zAt(x, beachW(Math.atan2(115, x)))

export function build(ctx) {
  const B = new Batch('beach')
  const { nature: N, ground } = ctx
  const DY = 0.32 // boardwalk deck height

  // --- walkway from the car park + boardwalk along the beach edge ---
  const BZ = 106.5
  boardwalk(B, ground, -1.5, 100.2, 1.5, BZ - 1.5, DY)
  boardwalk(B, ground, -38, BZ - 1.5, 38, BZ + 1.5, DY)
  // stair ramps down to the sand every ~25 m
  for (const x of [-30, -6, 18]) {
    const z0 = BZ + 1.5
    const y0 = Math.min(0, ground(x, z0 + 1.2)) - 0.02
    stairs(B, x, y0, z0 + 1.6, Math.PI, 2.0, DY - y0, 1.6, { mat: M.floorWood, tint: 0xc49a6c, base: -0.3 })
  }
  for (const x of [-38, 38]) B.span(M.floorWood, x + (x < 0 ? -1.4 : 0), ground(x, BZ) - 0.2, BZ - 1.5, x + (x < 0 ? 0 : 1.4), DY - 0.16, BZ + 1.5, { tint: 0xb08a5a, solid: true })
  // entrance arch with the beach sign
  for (const x of [-2.4, 2.4]) B.span(M.wood, x - 0.2, DY, 103.2, x + 0.2, DY + 3.6, 103.6, { tint: 0x8a5a34, solid: true })
  B.span(M.wood, -2.8, DY + 3.6, 103.15, 2.8, DY + 3.85, 103.65, { tint: 0x8a5a34 })
  sign(B, 'SUNSET BEACH', 0, DY + 4.35, 103.4, 5.2, 1.0, { bg: '#ff8a3d', fg: '#ffffff', border: '#ffe08a', w: 512, h: 100, font: '700 70px Fredoka, sans-serif', outline: '#b04a10', back: true })
  for (const x of [-2.4, 2.4]) B.geo(M.leaf, new IcosahedronGeometry(0.5, 0), x, DY + 3.95, 103.4, { tint: 0x4caf3a })
  trashBin(B, 3.6, DY, BZ - 0.8, 0x2e7d9f)
  trashBin(B, -20, DY, BZ - 0.8, 0x2e7d9f)
  bench(B, -12, DY, BZ - 0.9, Math.PI, { tint: 0xc49a6c, back: true })
  bench(B, 10, DY, BZ - 0.9, Math.PI, { tint: 0xc49a6c, back: true })
  for (const x of [-26, 26]) ctx.lamp(lampPost(B, x, DY, BZ - 1.2), 2)

  // --- Sunset Shack beach bar ---
  shack(B, ctx, 25, grassEdge(25) + 6.5)

  // --- lifeguard tower ---
  const lx = -20
  const lz = zAt(lx, 7.5)
  lifeguard(B, ctx, lx, ground(lx, lz), lz)

  // --- umbrellas, loungers, towels ---
  const spots = [[-44, 8], [-34, 10], [-8, 9.5], [2, 11], [11, 8.5], [42, 9], [-27, 5.5], [6, 5.5]]
  spots.forEach(([x, inland], i) => {
    const z = zAt(x, inland)
    const y = ground(x, z)
    umbrella(B, x, y, z, [M.awningRed, M.awningBlue, M.awningYellow, M.awningTeal][i % 4], i)
    for (const dx of [-1.0, 1.0]) lounger(B, x + dx, ground(x + dx, z + 0.4), z + 0.4, [0x2f6fd0, 0xffffff, 0xff5a5a, 0x22b3a3][(i + (dx > 0)) % 4])
    towel(B, x + 2.6, ground(x + 2.6, z - 1), z - 1, [0xff5f8a, 0x3f8aff, 0xffd23f][i % 3], i * 0.7)
    occupyCircle(x, z, 3)
  })
  ctx.loot({ x: -8, y: ground(-8, zAt(-8, 7)), z: zAt(-8, 7) })
  ctx.loot({ x: 42, y: ground(42, zAt(42, 6)), z: zAt(42, 6) })

  // volleyball net
  const vz = zAt(-14, 10.5)
  const vy = ground(-14, vz)
  for (const dx of [-4.5, 4.5]) B.cyl(M.paint, 0.07, 0.07, 2.6, -14 + dx, vy + 1.3, vz, { tint: 0xffffff, seg: 8, solid: true })
  B.span(M.chain, -18.5, vy + 1.5, vz - 0.01, -9.5, vy + 2.4, vz + 0.01)
  B.span(M.paint, -18.5, vy + 2.4, vz - 0.03, -9.5, vy + 2.47, vz + 0.03, { tint: 0xffffff })
  B.geo(M.gloss, new IcosahedronGeometry(0.2, 1), -12.2, vy + 0.2, vz + 2.4, { tint: 0xfff3c4 })

  // kayaks + surfboards + sandcastle + showers
  for (const [x, c] of [[13, 0xff5a1f], [15.4, 0xf2c230]]) {
    const z = zAt(x, 3.2)
    B.geo(M.gloss, kayakGeo(), x, ground(x, z) + 0.18, z, { ry: 0.3, tint: c })
  }
  for (const [x, inland, c] of [[31, 13.5, 0x22b3a3], [32, 13.2, 0xff5f8a], [33, 13.6, 0xffd23f]]) {
    const z = zAt(x, inland)
    B.box(M.gloss, 0.55, 2.1, 0.08, x, ground(x, z) + 0.85, z, { rz: (x - 32) * 0.12, tint: c })
  }
  {
    const z = zAt(-38, 4.5)
    const y = ground(-38, z)
    for (const [dx, dz, r, h] of [[0, 0, 0.6, 0.5], [0, 0, 0.35, 0.95], [0.8, 0.4, 0.25, 0.6], [-0.7, 0.3, 0.25, 0.55]]) B.cyl(M.hay, r, r * 1.1, h, -38 + dx, y + h / 2, z + dz, { seg: 8, tint: 0xf6e2b0 })
    B.span(M.paint, -38.02, y + 0.95, z - 0.01, -37.98, y + 1.35, z + 0.01, { tint: 0x8a5a34 })
    B.box(M.cloth, 0.25, 0.15, 0.01, -37.86, y + 1.28, z, { tint: 0xff3b30 })
  }
  for (const x of [-15, 8]) {
    const z = grassEdge(x) + 2.5
    const y = ground(x, z)
    B.span(M.wood, x - 0.6, y, z - 0.6, x + 0.6, y + 0.1, z + 0.6, { tint: 0xb08a5a })
    B.cyl(M.chrome, 0.05, 0.05, 2.5, x, y + 1.25, z, { tint: 0xcfd3d8, seg: 6, solid: true })
    B.span(M.chrome, x - 0.03, y + 2.45, z - 0.03, x + 0.45, y + 2.5, z + 0.03, { tint: 0xcfd3d8 })
    B.cyl(M.chrome, 0.12, 0.08, 0.08, x + 0.45, y + 2.42, z, { tint: 0xcfd3d8, seg: 8 })
  }

  // palms along the beach + a few rocks
  const palms = [[-48, 3], [-40, 1.5], [-31, 2.5], [-22, 1.5], [-10, 2], [-2, 1.2], [7, 2.2], [17, 1.0], [34, 1.5], [44, 2], [50, 0.8], [-52, 6], [48, 6], [-16, 4.5], [38, 5.0], [20, 15]]
  palms.forEach(([x, k], i) => {
    const z = grassEdge(x) + k
    N.palm(x, z, 0.85 + (i % 4) * 0.08, (i * 1.7) % 6.28)
  })
  for (const [x, inland, s] of [[-50, 2, 1.2], [-47, 3, 0.7], [52, 1.5, 1.0], [27, 1.0, 0.6]]) {
    const z = zAt(x, inland)
    N.rock(x, z, s)
  }
  B.build(ctx.root, true)
  occupy(-56, 100, 56, 140)
}

// Plank deck on posts between two corners, top at y.
function boardwalk(B, ground, x0, z0, x1, z1, y) {
  B.span(M.floorWood, x0, y - 0.12, z0, x1, y, z1, { tint: 0xc49a6c })
  B.solidSpan(x0, y - 0.4, z0, x1, y, z1)
  const long = x1 - x0 > z1 - z0
  const L = long ? x1 - x0 : z1 - z0
  for (let t = 0.6; t < L; t += 2.4) {
    for (const s of [0.15, 0.85]) {
      const px = long ? x0 + t : x0 + (x1 - x0) * s
      const pz = long ? z0 + (z1 - z0) * s : z0 + t
      const gy = Math.min(ground(px, pz), 0)
      B.span(M.wood, px - 0.1, gy - 0.3, pz - 0.1, px + 0.1, y - 0.12, pz + 0.1, { tint: 0x7a5a3c })
    }
  }
  // edge boards
  if (long) {
    B.span(M.wood, x0, y - 0.25, z0 - 0.06, x1, y - 0.02, z0, { tint: 0x9b7048 })
    B.span(M.wood, x0, y - 0.25, z1, x1, y - 0.02, z1 + 0.06, { tint: 0x9b7048 })
  }
}

function lampPost(B, x, y, z) {
  B.cyl(M.wood, 0.1, 0.12, 3.2, x, y + 1.6, z, { tint: 0x6e4f34, seg: 8, solid: true })
  B.span(M.paint, x - 0.22, y + 3.2, z - 0.22, x + 0.22, y + 3.28, z + 0.22, { tint: 0x2c3138 })
  B.span(M.bulb, x - 0.16, y + 2.85, z - 0.16, x + 0.16, y + 3.2, z + 0.16)
  B.cyl(M.paint, 0.05, 0.3, 0.25, x, y + 3.4, z, { tint: 0x2c3138, seg: 8 })
  return { x, y: y + 2.9, z }
}

function umbrella(B, x, y, z, mat, i) {
  const tilt = ((i % 3) - 1) * 0.12
  B.cyl(M.paint, 0.035, 0.035, 2.5, x, y + 1.15, z, { tint: 0xffffff, seg: 6, rz: tilt })
  B.geo(mat, cylGeo(0.06, 1.55, 0.5, 8, true), x - Math.sin(tilt) * 2.3, y + 2.35, z, { rz: tilt })
  B.cyl(M.paint, 0.07, 0.07, 0.12, x - Math.sin(tilt) * 2.6, y + 2.62, z, { tint: 0xffffff, seg: 6 })
}

function lounger(B, x, y, z, tint) {
  B.push(x, y, z, 0)
  B.span(M.paint, -0.32, 0.25, -0.9, 0.32, 0.3, 0.6, { tint: 0xffffff })
  B.box(M.paint, 0.64, 0.05, 0.8, 0, 0.55, -1.15, { rx: -0.7, tint: 0xffffff })
  B.span(M.cloth, -0.28, 0.3, -0.85, 0.28, 0.36, 0.55, { tint })
  B.box(M.cloth, 0.56, 0.06, 0.72, 0, 0.6, -1.12, { rx: -0.7, tint })
  for (const sx of [-0.28, 0.28]) for (const sz of [-0.8, 0.5]) B.span(M.paint, sx - 0.025, 0, sz - 0.025, sx + 0.025, 0.27, sz + 0.025, { tint: 0xdddddd })
  B.pop()
}

function towel(B, x, y, z, tint, yaw) {
  const g = new PlaneGeometry(0.9, 1.8)
  g.rotateX(-Math.PI / 2)
  B.geo(M.decal, g, x, y + 0.02, z, { ry: yaw, tint })
  const g2 = new PlaneGeometry(0.9, 0.3)
  g2.rotateX(-Math.PI / 2)
  B.geo(M.decal, g2, x, y + 0.025, z, { ry: yaw, tint: 0xffffff })
}

function kayakGeo() {
  const g = new IcosahedronGeometry(1, 1)
  g.scale(1.7, 0.22, 0.38)
  return g
}

// Thatched beach bar on a deck: bar counter facing the sea, side door, stools.
function shack(B, ctx, x, z) {
  const y = 0.35
  const w = 7
  const d = 5
  const x0 = x - w / 2
  const x1 = x + w / 2
  const z0 = z - d / 2
  const z1 = z + d / 2
  // deck (larger than the hut) on posts, with steps
  slab(B, x0 - 2.5, z0 - 1.5, x1 + 2.5, z1 + 3.5, y, 0.25, [], { mat: M.floorWood, tint: 0xd8b07a })
  for (const [px, pz] of [[x0 - 2.3, z0 - 1.3], [x1 + 2.3, z0 - 1.3], [x0 - 2.3, z1 + 3.3], [x1 + 2.3, z1 + 3.3]]) B.span(M.wood, px - 0.12, -0.6, pz - 0.12, px + 0.12, y - 0.25, pz + 0.12, { tint: 0x6e4f34 })
  B.span(M.floorWood, x - 1.2, -0.3, z0 - 2.3, x + 1.2, y - 0.17, z0 - 1.5, { tint: 0xc49a6c, solid: true })
  railing(B, x1 + 2.45, z0 - 1.4, x1 + 2.45, z1 + 3.4, y, { mat: M.wood, tint: 0x8a6a4a, h: 0.9 })
  railing(B, x0 - 2.45, z0 - 1.4, x0 - 2.45, z1 + 3.4, y, { mat: M.wood, tint: 0x8a6a4a, h: 0.9 })
  // hut: bamboo-ish board walls, big serving hatch on the sea side, door on the west
  const o = { mat: M.boardsV, tint: 0xd7b27c, inner: { mat: M.boardsV, tint: 0xc9a06a }, frameTint: 0x8a5a34, sashTint: 0x8a5a34, glass: false, leafTint: 0x8a5a34 }
  room(B, x0, z0, x1, z1, y, 2.9, 0.2, {
    s: [{ x, w: 4.4, y: 1.05, h: 1.35, kind: 'open' }],
    w: [door(z, 1.7, 2.4)],
    n: [win(x - 1.5, 1.2, 1.1, 1.0, { kind: 'window' })],
    e: [win(z, 1.4, 1.1, 1.0)],
  }, o)
  slab(B, x0, z0, x1, z1, y + 0.05, 0.05, [], { mat: M.floorWood, tint: 0xb08a5a })
  pyramidRoof(B, M.thatch, x, y + 2.9, z, w / 2 + 1.1, d / 2 + 1.1, 2.4, 0xffffff)
  B.span(M.thatch, x - w / 2 - 1.1, y + 2.75, z - d / 2 - 1.1, x + w / 2 + 1.1, y + 2.95, z + d / 2 + 1.1, { tint: 0xe8d090 })
  sign(B, 'SUNSET SHACK', x, y + 3.35, z1 + 1.12, 4.0, 0.75, { bg: '#2fa8a0', fg: '#fff3c4', border: '#ff8a3d', w: 512, h: 96, font: '700 64px Fredoka, sans-serif' })
  // bar counter outside the hatch + stools
  counter(B, x, y, z1 + 0.65, 0, 4.6, { tint: 0x8a5a34, topTint: 0xd8b07a })
  for (let i = 0; i < 4; i++) stool(B, x - 1.8 + i * 1.2, y, z1 + 1.6, [0xff5a1f, 0x22b3a3, 0xffd23f, 0xff5f8a][i])
  // inside: shelves with bottles, fridge, kegs
  B.span(M.wood, x0 + 0.3, y + 1.3, z0 + 0.15, x1 - 0.3, y + 1.35, z0 + 0.45, { tint: 0x8a5a34 })
  for (let i = 0; i < 12; i++) B.cyl(M.gloss, 0.05, 0.06, 0.28, x0 + 0.6 + i * 0.5, y + 1.49, z0 + 0.3, { tint: [0x2f8a3a, 0x8a3a1a, 0xf2c230, 0x3f6fb0][i % 4], seg: 6 })
  fridge(B, x1 - 0.6, y + 0.05, z - 0.6, -Math.PI / 2)
  barrel(B, x0 + 0.7, y + 0.05, z0 + 1.0, 0x8a5a34)
  barrel(B, x0 + 1.5, y + 0.05, z0 + 0.8, 0x8a5a34)
  crate(B, x0 + 0.8, y + 0.05, z1 - 0.8, 0.8)
  ctx.loot({ x: x + 0.5, y: y + 0.05, z: z - 0.3 })
  // deck tables with umbrellas
  for (const [dx, dz] of [[-4.6, 1.5], [4.6, 1.5], [-4.6, -0.5]]) {
    const tx = x + dx
    const tz = z + dz
    B.cyl(M.wood, 0.45, 0.45, 0.06, tx, y + 0.76, tz, { tint: 0xc49a6c, seg: 10 })
    B.cyl(M.wood, 0.05, 0.05, 0.75, tx, y + 0.38, tz, { tint: 0x6e4f34, seg: 6 })
    B.solidCyl(0.45, 0.8, tx, y + 0.4, tz)
  }
  plant(B, x1 + 2.0, y, z1 + 3.0, 0.9)
  // tiki torches
  for (const [px, pz] of [[x0 - 2.2, z1 + 3.2], [x1 + 2.2, z1 + 3.2]]) {
    B.cyl(M.wood, 0.05, 0.06, 1.8, px, y + 0.9, pz, { tint: 0x6e4f34, seg: 6 })
    B.cyl(M.hay, 0.12, 0.08, 0.25, px, y + 1.9, pz, { tint: 0xffffff, seg: 6 })
    B.geo(M.lightAmber, new IcosahedronGeometry(0.1, 0), px, y + 2.1, pz)
  }
  occupy(x0 - 3, z0 - 2.5, x1 + 3, z1 + 4)
}

// Lifeguard tower: hut on stilts, deck with railing, stair ramp, flag, buoy.
function lifeguard(B, ctx, x, gy, z) {
  const H = 2.4
  const y = gy + H
  B.push(x, 0, z, 0)
  for (const [px, pz] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) {
    B.span(M.wood, px - 0.12, gy - 0.4, pz - 0.12, px + 0.12, y, pz + 0.12, { tint: 0xffffff, solid: true })
  }
  B.box(M.wood, 0.08, 0.08, 4.2, -1.5, gy + 1.2, 0, { rx: 0.62, tint: 0xffffff })
  B.box(M.wood, 0.08, 0.08, 4.2, 1.5, gy + 1.2, 0, { rx: -0.62, tint: 0xffffff })
  slab(B, -1.9, -1.9, 1.9, 1.9, y, 0.2, [], { mat: M.floorWood, tint: 0xd8b07a })
  // hut on the back half
  room(B, -1.3, -1.6, 1.3, 0.4, y, 2.2, 0.12, { s: [door(0, 1.7, 2.1, { leaf: false })], e: [win(-0.6, 1.0, 0.9, 0.8)], w: [win(-0.6, 1.0, 0.9, 0.8)], n: [win(0, 1.4, 0.9, 0.8)] }, { mat: M.siding, tint: 0xd8402a, frameTint: 0xffffff, sashTint: 0xffffff })
  B.box(M.shingle, 3.4, 0.12, 2.9, 0, y + 2.45, -0.6, { rx: 0.18, tint: 0xffffff, solid: true })
  railing(B, -1.85, 1.85, 1.85, 1.85, y, { tint: 0xffffff })
  railing(B, -1.85, -1.85, -1.85, 1.85, y, { tint: 0xffffff })
  railing(B, 1.85, -1.85, 1.85, 0.0, y, { tint: 0xffffff })
  // red cross sign + flag + buoy
  B.span(M.paint, -0.5, y + 1.5, 0.47, 0.5, y + 2.05, 0.5, { tint: 0xffffff })
  B.span(M.paint, -0.08, y + 1.56, 0.5, 0.08, y + 1.99, 0.52, { tint: 0xd8261c })
  B.span(M.paint, -0.22, y + 1.7, 0.5, 0.22, y + 1.85, 0.52, { tint: 0xd8261c })
  B.cyl(M.chrome, 0.04, 0.04, 3.2, 1.7, y + 1.6, -1.7, { tint: 0xdddddd, seg: 6 })
  flag(B, 1.7, y + 2.8, -1.7, [0xd8261c, 0xf2c230], 1.3, 0.9, -Math.PI / 2)
  B.geo(M.paint, new TorusGeometry(0.28, 0.08, 6, 12), 1.97, y + 0.6, 1.0, { ry: Math.PI / 2, tint: 0xff5a1f })
  // stair from the sand up the east side to the deck
  stairs(B, 1.9 + 4.4, gy - 0.05, 0.95, -Math.PI / 2, 1.3, H + 0.05, 4.4, { mat: M.floorWood, tint: 0xd8b07a, style: 'open', stringerMat: M.wood, stringerTint: 0xffffff, rails: ['left', 'right'], railTint: 0xffffff })
  const lp = B.P(-3.4, 0, 2.6)
  ctx.loot({ x: lp.x, y: ctx.ground(lp.x, lp.z), z: lp.z })
  B.pop()
  occupyCircle(x, z, 5)
}
