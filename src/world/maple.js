// Maple Row (east): six suburban houses along the east road, three per side,
// all facing the street. Alternating two-storey stucco houses (interior stair,
// porch whose roof is a floor-2 balcony) and wood-sided bungalows (front gable,
// covered porch), each with an attached stone garage, driveway, walkway,
// picket fence, mailbox, flower beds and a fenced back yard.
import { IcosahedronGeometry } from 'three'
import { Batch } from './geom.js'
import { M, TINT } from './materials.js'
import { occupy } from './layout.js'
import {
  acUnit, armchair, barrel, bed, bench, boardFence, bookshelf, car, chair, chimney, coffeeTable, crate, diningSet, door, fridge, gableRoof, kitchen, mailbox,
  picketFence, plant, railing, room, rug, shelfRack, sign, slab, sofa, stairs, table, tvUnit, wall, wallAC, wallZ, wardrobe, win,
} from './kit.js'

const LOTS = [
  { x: 61, side: -1, type: 'A', wall: TINT.mint, roof: TINT.darkSlate, door: 0x2f6fd0, shutters: 0x3f8a5a, car: [0xd23b3b, 'hatch'] },
  { x: 79, side: -1, type: 'B', wall: 0xf6e7a8, roof: TINT.terracotta, door: 0xc0392b, shutters: 0x5a7a3a },
  { x: 97, side: -1, type: 'A', wall: TINT.peach, roof: TINT.slate, door: 0x2c3e50, shutters: 0xffffff, car: [0x2f6fd0, 'suv'] },
  { x: 61, side: 1, type: 'B', wall: 0xbfdff4, roof: TINT.darkSlate, door: 0xf2c230, shutters: 0x2f5f8a },
  { x: 79, side: 1, type: 'A', wall: 0xf5ead2, roof: TINT.terracotta, door: 0x6e4528, shutters: 0x8a3a2a, car: [0xf2f2f2, 'sedan'] },
  { x: 97, side: 1, type: 'B', wall: 0xffffff, roof: 0xb84a32, door: 0x3f8a5a, shutters: 0x3f6fb0 },
]
const SET = 11.5 // front wall distance from the road centreline

export function build(ctx) {
  const B = new Batch('maple')
  const { nature: N } = ctx
  for (const lot of LOTS) {
    // north row faces south (+z), south row faces north (yaw PI)
    const z = lot.side < 0 ? -SET : SET
    const yaw = lot.side < 0 ? 0 : Math.PI
    // garages always on world +x: local +x for the north row, local -x for the south row
    const gs = lot.side < 0 ? 1 : -1
    B.push(lot.x, 0, z, yaw)
    if (lot.type === 'A') houseA(B, ctx, lot, gs)
    else houseB(B, ctx, lot, gs)
    yard(B, ctx, lot, gs)
    B.pop()
    const x0 = lot.x - 8
    const x1 = lot.x + 11
    occupy(x0, lot.side < 0 ? -30 : 6.6, x1, lot.side < 0 ? -6.6 : 30)
  }
  // street sign at the junction
  B.push(54.6, 0.14, -7.4, 0)
  B.cyl(M.paint, 0.05, 0.05, 3.0, 0, 1.5, 0, { tint: 0x9aa3ad, seg: 6 })
  B.pop()
  sign(B, 'MAPLE ROW', 54.6, 2.85, -7.4, 1.8, 0.38, { bg: '#1f7a3a', fg: '#ffffff', border: '#ffffff', w: 512, h: 112, back: true }, Math.PI / 2)
  // street trees on the verges between lots
  for (const x of [71.6, 89.7]) {
    N.tree(x, -8.6, { s: 0.75, v: 1 })
    N.tree(x, 8.6, { s: 0.75, v: 1 })
  }
  B.build(ctx.root, true)
}

// --- Two-storey house: body x -5..5, z -8..0 (front at z = 0) -----------------------------
function houseA(B, ctx, lot, gs) {
  const Y0 = 0.35
  const Y1 = 3.45
  const Y2 = 6.3
  const T = 0.3
  const wo = { mat: M.stucco, tint: lot.wall, inner: { mat: M.plaster, tint: 0xf6efe2 }, frameTint: TINT.trim, sashTint: 0xffffff, shutters: lot.shutters, leafTint: lot.door, plinth: { mat: M.stone, tint: 0xd8d8d8, h: 0.75 } }
  const wo2 = { ...wo, plinth: null }
  const part = { mat: M.plaster, tint: 0xf6efe2, frameTint: 0xe8dcc8, leafTint: 0x8a5a34 }
  const X = (v) => v * gs // mirror x so the garage sits on the +gs side
  // slabs
  slab(B, -5, -8, 5, 0, Y0, Y0, [], { mat: M.floorWood, tint: 0xe2b88a })
  B.span(M.stone, -5.2, 0, -8.2, 5.2, Y0 - 0.02, 0.2, { tint: 0xcfcfcf })
  const hole = [Math.min(X(-4.85), X(-3.3)), -6.7, Math.max(X(-4.85), X(-3.3)), -1.4]
  slab(B, -5, -8, 5, 0, Y1, 0.25, [hole], { mat: M.floorWood, tint: 0xe2b88a, under: { mat: M.plaster, tint: 0xfaf6ee } })
  // ground floor walls
  const H = Y1 - Y0
  wall(B, -5.15, 5.15, 0, Y0, H, T, { ...wo, out: 1, openings: [door(X(-1.6), 1.9, 2.5, { leafTint: lot.door }), win(X(1.6), 1.6, 0.9, 1.5), win(X(3.8), 1.0, 0.9, 1.5)] })
  wall(B, -5.15, 5.15, -8, Y0, H, T, { ...wo, out: -1, openings: [win(X(-3.9), 1.0, 1.2, 1.1), win(X(0), 1.2, 0.9, 1.5), door(X(2.2), 1.7, 2.5)] })
  wallZ(B, -7.85, -0.15, X(-5), Y0, H, T, { ...wo, out: -gs, openings: [] })
  wallZ(B, -7.85, -0.15, X(5), Y0, H, T, { ...wo, out: gs, plinth: null, openings: [door(-1.9, 1.7, 2.5)] })
  // kitchen partition
  wall(B, Math.min(X(1.0), X(4.85)), Math.max(X(1.0), X(4.85)), -3.5, Y0, H - 0.25, 0.16, { ...part, openings: [door(X(3.0), 1.8, 2.4)] })
  // floor 2 walls
  const H2 = Y2 - Y1
  wall(B, -5.15, 5.15, 0, Y1, H2, T, { ...wo2, out: 1, openings: [win(X(-2.2), 1.4, 0.8, 1.4), door(X(2.6), 1.7, 2.3, { leaf: false })] })
  wall(B, -5.15, 5.15, -8, Y1, H2, T, { ...wo2, out: -1, openings: [win(X(-2.5), 1.4, 0.8, 1.4), win(X(2.5), 1.4, 0.8, 1.4)] })
  wallZ(B, -7.85, -0.15, X(-5), Y1, H2, T, { ...wo2, out: -gs, openings: [win(-4.2, 1.2, 0.8, 1.4)] })
  wallZ(B, -7.85, -0.15, X(5), Y1, H2, T, { ...wo2, out: gs, openings: [win(-4.0, 1.2, 0.8, 1.4)] })
  wallZ(B, -7.85, -0.15, X(0.5), Y1, H2, 0.16, { ...part, openings: [door(-5.0, 1.6, 2.3)] })
  // stair up the west (-gs) wall, rising toward the back
  stairs(B, X(-4.08), Y0, -1.5, Math.PI, 1.5, Y1 - Y0, 5.1, { mat: M.wood, tint: 0xb07a4a, rails: [gs > 0 ? 'left' : 'right'], railTint: 0xffffff })
  railing(B, X(-3.3), -1.45, X(-3.3), -6.65, Y1, { tint: 0xffffff, style: 'bars', h: 0.95 })
  railing(B, X(-4.85), -1.45, X(-3.3), -1.45, Y1, { tint: 0xffffff, style: 'bars', h: 0.95 })
  // roof + chimney
  gableRoof(B, -5, -8, 5, 0, Y2, 2.5, { tint: lot.roof, wallMat: M.stucco, wallTint: lot.wall, chimney: { x: X(-3.2), z: -5.6, w: 0.8, d: 0.8, above: 1.0 } })
  chimney(B, X(-3.2), -5.6, Y2 - 2.8, 2.8, 0.8, 0.8)
  // porch (its roof is the floor-2 balcony)
  slab(B, -5, 0.15, 5, 2.5, Y0, Y0, [], { mat: M.floorWood, tint: 0xc9a06a })
  B.span(M.wood, X(-2.8), 0, 2.5, X(-0.4), 0.18, 3.05, { tint: 0xb08a5a, solid: true })
  for (const px of [-4.85, -3.1, -0.1, 4.85]) B.span(M.wood, X(px) - 0.1, Y0, 2.2, X(px) + 0.1, Y1 - 0.25, 2.4, { tint: 0xffffff, solid: true })
  slab(B, -5.15, 0.15, 5.15, 2.55, Y1, 0.25, [], { mat: M.floorWood, tint: 0xd8b48a, under: { mat: M.paint, tint: 0xffffff } })
  railing(B, X(-4.85), 2.3, X(-3.1), 2.3, Y0, { tint: 0xffffff, style: 'bars', h: 0.9 })
  railing(B, X(-0.1), 2.3, X(4.85), 2.3, Y0, { tint: 0xffffff, style: 'bars', h: 0.9 })
  railing(B, X(-4.95), 0.25, X(-4.95), 2.3, Y0, { tint: 0xffffff, style: 'bars', h: 0.9 })
  railing(B, X(4.95), 0.25, X(4.95), 2.3, Y0, { tint: 0xffffff, style: 'bars', h: 0.9 })
  railing(B, X(-5.1), 2.45, X(5.1), 2.45, Y1, { tint: 0xffffff, style: 'bars', h: 1.0 })
  railing(B, X(-5.1), 0.25, X(-5.1), 2.45, Y1, { tint: 0xffffff, style: 'bars', h: 1.0 })
  railing(B, X(5.1), 0.25, X(5.1), 2.45, Y1, { tint: 0xffffff, style: 'bars', h: 1.0 })
  // corner boards
  for (const cx of [-5.15, 5.15]) for (const cz of [-8.15, 0.15]) B.span(M.paint, cx - 0.1, Y0, cz - 0.1, cx + 0.1, Y2, cz + 0.1, { tint: TINT.trim })
  B.span(M.paint, -5.25, Y1 - 0.25, 0.15, 5.25, Y1 - 0.05, 0.25, { tint: TINT.trim })
  // garage
  garage(B, ctx, lot, gs, 5, 9.5, Y0)
  // interior: living (front-left), kitchen (back-right), bedrooms upstairs
  const f = Y0
  tvUnit(B, X(-1.9), f, -7.6, 0)
  sofa(B, X(-1.6), f, -3.0, Math.PI, 0x3f6fb0, 2.2)
  coffeeTable(B, X(-1.7), f, -5.2, 0)
  rug(B, X(-1.7), f, -5.2, 2.6, 2.0, M.rug('#c0392b', '#f2eadb', '#2a3f6a'))
  kitchen(B, X(4.55), f, -5.7, (-Math.PI / 2) * gs, 3.2, { upper: false })
  table(B, X(1.9), f, -4.8, 0, 1.4, 0.8, { tint: 0xb07a4a })
  chair(B, X(1.9), f, -5.55, 0, 0x6e4528)
  const g = Y1
  bed(B, X(-1.6), g, -1.4, Math.PI, 0x3fae5a, false)
  wardrobe(B, X(-1.5), g, -7.55, 0, 1.2)
  bed(B, X(2.8), g, -6.6, 0, 0xe0662a)
  armchair(B, X(4.2), g, -2.0, (-Math.PI / 2) * gs, 0xf2c230)
  ctx.loot(B.P(X(2.2), g, -3.4))
  acUnit(B, X(-3.4), 0, -8.75, Math.PI)
  wallAC(B, X(-5.15), Y1 + 1.6, -2, (-Math.PI / 2) * gs)
}

// --- Bungalow: body x -5.5..5.5, z -8..0, front gable ----------------------------------------
function houseB(B, ctx, lot, gs) {
  const Y0 = 0.35
  const T = 0.3
  const H = 2.95
  const X = (v) => v * gs
  const wo = { mat: M.siding, tint: lot.wall, inner: { mat: M.plaster, tint: 0xf4ecdc }, frameTint: TINT.trim, sashTint: 0xffffff, shutters: lot.shutters, flowerBox: true, leafTint: lot.door, plinth: { mat: M.stone, tint: 0xcfcfcf, h: 0.6 } }
  const part = { mat: M.plaster, tint: 0xf4ecdc, frameTint: 0xe8dcc8, leafTint: 0x8a5a34 }
  slab(B, -5.5, -8, 5.5, 0, Y0, Y0, [], { mat: M.floorWood, tint: 0xd8a878 })
  B.span(M.stone, -5.7, 0, -8.2, 5.7, Y0 - 0.02, 0.2, { tint: 0xcfcfcf })
  wall(B, -5.65, 5.65, 0, Y0, H, T, { ...wo, out: 1, openings: [win(X(-3.4), 1.5, 0.9, 1.4), door(X(0.6), 1.9, 2.45, { leafTint: lot.door }), win(X(3.6), 1.3, 0.9, 1.4)] })
  wall(B, -5.65, 5.65, -8, Y0, H, T, { ...wo, out: -1, flowerBox: false, openings: [win(X(-3.2), 1.3, 0.9, 1.4), door(X(1.5), 1.8, 2.45), win(X(4.0), 1.0, 1.1, 1.0)] })
  wallZ(B, -7.85, -0.15, X(-5.5), Y0, H, T, { ...wo, out: -gs, openings: [win(-5.8, 1.3, 0.9, 1.4), win(-1.5, 1.3, 0.9, 1.4)] })
  wallZ(B, -7.85, -0.15, X(5.5), Y0, H, T, { ...wo, out: gs, plinth: null, flowerBox: false, openings: [door(-2.2, 1.7, 2.45)] })
  // partitions: bedroom (back, -gs side), bathroom-ish nook
  wall(B, Math.min(X(-5.35), X(0)), Math.max(X(-5.35), X(0)), -4.2, Y0, H, 0.16, { ...part, openings: [door(X(-1.6), 1.7, 2.35)] })
  wallZ(B, -7.85, -4.28, X(0), Y0, H, 0.16, { ...part, openings: [] })
  // ceiling joists hidden: flat ceiling slab (walkable is not needed, but blocks the attic)
  slab(B, -5.5, -8, 5.5, 0, Y0 + H + 0.12, 0.12, [], { mat: M.plaster, tint: 0xfaf6ee, solid: false })
  // front-gable roof (ridge runs front-to-back)
  B.push(0, 0, -4, Math.PI / 2)
  gableRoof(B, -4, -5.5, 4, 5.5, Y0 + H, 2.4, { tint: lot.roof, wallMat: M.siding, wallTint: lot.wall, ov: 0.5 })
  B.pop()
  chimney(B, X(-3.5), -6.2, Y0 + H - 0.3, 3.4, 0.8, 0.8)
  // covered porch with a shed roof
  slab(B, -4.5, 0.15, 4.5, 2.6, Y0, Y0, [], { mat: M.floorWood, tint: 0xc9a06a })
  B.span(M.wood, X(-0.6), 0, 2.6, X(1.8), 0.18, 3.15, { tint: 0xb08a5a, solid: true })
  for (const px of [-4.35, -0.9, 2.1, 4.35]) B.span(M.wood, X(px) - 0.09, Y0, 2.3, X(px) + 0.09, Y0 + 2.55, 2.48, { tint: 0xffffff, solid: true })
  B.box(M.shingle, 9.4, 0.12, 3.0, 0, Y0 + 2.75, 1.3, { rx: 0.14, tint: lot.roof, solid: true })
  B.span(M.paint, -4.7, Y0 + 2.45, 2.42, 4.7, Y0 + 2.62, 2.52, { tint: TINT.trim })
  railing(B, X(-4.35), 2.4, X(-0.9), 2.4, Y0, { tint: 0xffffff, style: 'bars', h: 0.85 })
  railing(B, X(2.1), 2.4, X(4.35), 2.4, Y0, { tint: 0xffffff, style: 'bars', h: 0.85 })
  railing(B, X(-4.4), 0.25, X(-4.4), 2.4, Y0, { tint: 0xffffff, style: 'bars', h: 0.85 })
  bench(B, X(-2.6), Y0, 0.75, Math.PI, { tint: 0xffffff, len: 1.6 })
  plant(B, X(3.4), Y0, 0.7, 0.8)
  for (const cx of [-5.65, 5.65]) for (const cz of [-8.15, 0.15]) B.span(M.paint, cx - 0.09, Y0, cz - 0.09, cx + 0.09, Y0 + H, cz + 0.09, { tint: TINT.trim })
  garage(B, ctx, lot, gs, 5.5, 10, Y0)
  // interior
  const f = Y0
  sofa(B, X(-3.0), f, -1.0, Math.PI, 0xb0473f, 2.0)
  armchair(B, X(-0.6), f, -2.6, (Math.PI / 2) * -gs, 0x3f6fb0)
  bookshelf(B, X(-5.2), f, -3.3, (Math.PI / 2) * gs, 1.4, 1.9)
  kitchen(B, X(5.05), f, -6.0, (-Math.PI / 2) * gs, 3.6, { upper: true })
  diningSet(B, X(2.6), f, -6.0, 0, 2, 0xb07a4a)
  fridge(B, X(5.0), f, -0.75, (-Math.PI / 2) * gs)
  bed(B, X(-3.0), f, -6.6, 0, 0x5f9fd8)
  wardrobe(B, X(-0.6), f, -6.6, (-Math.PI / 2) * gs, 1.2)
  ctx.loot(B.P(X(1.0), f, -2.2))
  acUnit(B, X(-3.8), 0, -8.75, Math.PI)
}

// Attached stone garage on the +gs side from |x| = xa..xb, z -7..0, open front.
function garage(B, ctx, lot, gs, xa, xb, y0) {
  const X = (v) => v * gs
  const x0 = Math.min(X(xa), X(xb))
  const x1 = Math.max(X(xa), X(xb))
  const xc = (x0 + x1) / 2
  const w = x1 - x0
  slab(B, x0, -7, x1, 0, 0.12, 0.12, [], { mat: M.concrete, tint: 0xd0cdc6 })
  const H = 2.9
  const sides = { s: [{ x: xc, w: w - 1.0, y: 0, h: 2.55, kind: 'door', leaf: false }], n: [win(xc, 1.2, 1.2, 0.9)] }
  if (gs > 0) {
    sides.w = false
    sides.e = [win(-3.5, 1.2, 1.2, 0.9)]
  } else {
    sides.e = false
    sides.w = [win(-3.5, 1.2, 1.2, 0.9)]
  }
  room(B, x0, -7, x1, 0, 0.12, H, 0.3, sides, { mat: M.stone, tint: 0xd8d8d8, frameTint: TINT.trim, sashTint: 0xffffff })
  B.push(xc, 0, -3.5, Math.PI / 2)
  gableRoof(B, -3.5, -w / 2, 3.5, w / 2, 0.12 + H, 1.2, { tint: lot.roof, wallMat: M.stone, wallTint: 0xd8d8d8, ov: 0.15, gutter: false, vent: false })
  B.pop()
  // roller door housing over the opening
  B.span(M.paint, xc - w / 2 + 0.5, 2.67, 0.15, xc + w / 2 - 0.5, 2.95, 0.32, { tint: 0xe8e8e8 })
  // contents: a car or a workshop
  if (lot.car) car(B, xc, 0.12, -3.3, Math.PI, lot.car[0], lot.car[1] === 'suv' ? 'hatch' : lot.car[1])
  else {
    B.span(M.wood, x0 + 0.4, 0.12, -6.8, x1 - 0.4, 1.0, -6.1, { tint: 0x9b7048, solid: true })
    shelfRack(B, xc, 0.12, -1.4 - 0.0, 0, Math.min(2.6, w - 1.4), 1.9, { tint: 0x3f8a5a, seed: lot.x })
    barrel(B, x0 + 0.7, 0.12, -4.4, 0xd8402a)
    crate(B, x1 - 0.8, 0.12, -4.2, 0.9, 0.3)
    ctx.loot(B.P(xc, 0.12, -4.6))
  }
}

// Front yard, driveway, walkway, fences, mailbox, back yard.
function yard(B, ctx, lot, gs) {
  const { nature: N } = ctx
  const X = (v) => v * gs
  const type = lot.type
  const gx0 = type === 'A' ? 5 : 5.5
  const gx1 = type === 'A' ? 9.5 : 10
  const front = SET - 4 - 2.4 // distance from the front wall to the sidewalk's outer edge (5.1)
  const doorX = type === 'A' ? -1.6 : 0.6
  const stepZ = type === 'A' ? 3.05 : 3.15
  // driveway + walkway
  B.span(M.concrete, Math.min(X(gx0 + 0.3), X(gx1 - 0.3)), 0, 0, Math.max(X(gx0 + 0.3), X(gx1 - 0.3)), 0.04, front, { tint: 0xd6d3cc })
  B.span(M.concrete, X(doorX) - 0.65, 0, stepZ, X(doorX) + 0.65, 0.04, front, { tint: 0xe2dfd8 })
  if (lot.car && type === 'A') car(B, X((gx0 + gx1) / 2), 0.04, 2.6, 0, 0x7a8a99, 'sedan')
  // picket fence along the front with gaps for the walkway and the driveway
  const fz = front - 0.35
  const xs = [-6.6, doorX - 0.9, doorX + 0.9, gx0 + 0.1].map(X)
  picketFence(B, xs[0], fz, xs[1], fz, { h: 0.9 })
  picketFence(B, xs[2], fz, xs[3], fz, { h: 0.9 })
  mailbox(B, X(doorX + 1.4), 0, fz + 0.1, 0, lot.door)
  // flower beds under the front windows + bushes
  const bedZ = type === 'A' ? 3.6 : 3.8
  for (let k = 0; k < 7; k++) {
    N.flower(B.P(X(-6.8 + k * 0.7), 0, bedZ).x, B.P(X(-6.8 + k * 0.7), 0, bedZ).z)
  }
  const bp = B.P(X(-6.5), 0, 1.0)
  N.bush(bp.x, bp.z, 0.7)
  const bp2 = B.P(X(3.4), 0, bedZ + 0.2)
  N.bush(bp2.x, bp2.z, 0.5)
  // back yard: fence with a gate, patio table, bbq or swing, a tree
  const by = -17
  const lx = X(-6.6)
  const rx = X(gx1)
  const ft = [0xc9a27a, 0xe8e2d4, 0xb08a64][Math.round(lot.x / 18 + lot.side) % 3]
  boardFence(B, lx, -1.0, lx, by, { tint: ft })
  boardFence(B, lx, by, X(-1.1), by, { tint: ft })
  boardFence(B, X(1.1), by, rx, by, { tint: ft })
  boardFence(B, rx, by, rx, -7.2, { tint: ft })
  B.span(M.tiles, X(-4), 0, -12.2, X(2), 0.08, -8.2, { tint: 0xf2dcc0 })
  table(B, X(-1), 0.08, -10.4, 0, 1.6, 0.9, { tint: 0xffffff })
  chair(B, X(-1.8), 0.08, -10.4, Math.PI / 2, 0xffffff)
  chair(B, X(-0.2), 0.08, -10.4, -Math.PI / 2, 0xffffff)
  if (type === 'A') {
    // swing set
    const sx = X(4.5)
    for (const dz of [-14.8, -12.0]) {
      B.box(M.paint, 0.08, 2.6, 0.08, sx - 0.9, 1.25, dz, { rz: 0.3, tint: 0xc0392b })
      B.box(M.paint, 0.08, 2.6, 0.08, sx + 0.9, 1.25, dz, { rz: -0.3, tint: 0xc0392b })
    }
    B.span(M.paint, sx - 0.06, 2.42, -14.9, sx + 0.06, 2.52, -11.9, { tint: 0xc0392b })
    for (const dz of [-14.0, -12.8]) {
      B.span(M.paint, sx - 0.01, 0.6, dz - 0.01, sx + 0.01, 2.42, dz + 0.01, { tint: 0x333333 })
      B.span(M.paint, sx - 0.25, 0.55, dz - 0.2, sx + 0.25, 0.6, dz + 0.2, { tint: 0x2f6fd0 })
    }
    B.solid(1.2, 1.2, 1.6, sx, 1.2, -13.4)
  } else {
    // bbq + shed
    B.span(M.paint, X(4.0) - 0.4, 0, -9.6, X(4.0) + 0.4, 0.9, -9.1, { tint: 0x222222, solid: true })
    room(B, Math.min(X(5.6), X(8.8)), -16.6, Math.max(X(5.6), X(8.8)), -13.6, 0.1, 2.3, 0.12, { [gs > 0 ? 'w' : 'e']: [door(-15.1, 1.6, 2.1)] }, { mat: M.boardsV, tint: 0x9bb88a, frameTint: 0xffffff })
    slab(B, Math.min(X(5.6), X(8.8)), -16.6, Math.max(X(5.6), X(8.8)), -13.6, 0.1, 0.1, [], { mat: M.floorWood, tint: 0xb08a5a })
    B.box(M.shingle, 3.8, 0.1, 3.6, X(7.2), 2.55, -15.1, { rx: 0.12, tint: lot.roof, solid: true })
  }
  const tp = B.P(X(-5), 0, -14.5)
  N.tree(tp.x, tp.z, { s: 0.75, v: lot.x % 3 })
  // garden pots on the patio + grass
  B.geo(M.leaf, new IcosahedronGeometry(0.35, 0), X(1.6), 0.4, -8.6, { tint: 0x4caf3a })
  for (let k = 0; k < Math.round(16 * ctx.q * ctx.q); k++) {
    const p = B.P(X(-6.5 + ((k * 3.7) % 12)), 0, -9 - ((k * 2.3) % 7.5))
    N.tuft(p.x, p.z, 0.9)
  }
}
