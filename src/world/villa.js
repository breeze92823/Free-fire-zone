// The Villa (centre): a 40 x 28 m two-storey compound around an open
// courtyard with a reflecting pool. Stone ground floor, cream stucco upper
// floor, columned portico with a balcony over it, flat roof with parapet,
// roof bulkhead, AC units, water tank and solar panels. Every ground-floor
// room is enterable; a stair in the north-east hall climbs to floor 2 and a
// second flight to the roof. Grounds: cobbled avenue lined with cypresses,
// hedged lawns, a parking pad, a gazebo and a garden shed.
import { IcosahedronGeometry } from 'three'
import { Batch } from './geom.js'
import { M, TINT } from './materials.js'
import { occupy } from './layout.js'
import {
  acUnit, antenna, armchair, bed, bench, bookshelf, car, chair, coffeeTable, crate, desk, diningSet, door, flag, flatRoof, floorLamp, fridge, gap,
  hedge, kitchen, planter, plant, railing, room, rug, sconce, sign, slab, sofa, solarPanel, stairs, streetLamp, table, tvUnit, wall, wallAC, wallZ, wardrobe,
  waterTank, win,
} from './kit.js'
import { mulberry32 } from '../textures.js'

const Y0 = 0.3 // ground floor level
const Y1 = 4.3 // floor 2 level
const Y2 = 8.3 // roof slab bottom
const RT = 8.55 // roof walking surface
const X = 20
const Z = 14
const CX = 7 // courtyard half size x
const CZ = 5 // courtyard half size z
const T = 0.3 // exterior wall thickness
const TI = 0.2 // interior wall thickness
const CREAM = 0xf3e6c8
const STUC = 0xf7efdc
const STONE = 0xe2e2e2

export function build(ctx) {
  const B = new Batch('villa')
  const { nature: N } = ctx

  // --- ground floor slab + courtyard paving ---
  slab(B, -X, -Z, X, Z, Y0, Y0, [[-CX, -CZ, CX, CZ]], { mat: M.tiles, tint: 0xfff0dc })
  slab(B, -CX, -CZ, CX, CZ, Y0, Y0, [], { mat: M.cobble })
  // plinth skirt around the outside
  B.span(M.concrete, -X - 0.25, 0, -Z - 0.25, X + 0.25, Y0 - 0.02, Z + 0.25, { tint: 0xd6d2ca })

  const ext = { mat: M.stone, tint: STONE, inner: { mat: M.plaster, tint: CREAM }, frameTint: TINT.trim, sashTint: 0x2c3138, leafTint: 0x6e4528 }
  const ext2 = { mat: M.stucco, tint: STUC, inner: { mat: M.plaster, tint: CREAM }, frameTint: TINT.trim, sashTint: 0x2c3138, leafTint: 0x6e4528 }
  const part = { mat: M.plaster, tint: CREAM, frameTint: 0xd8c8a8, leafTint: 0x8a5a34 }
  const H1 = Y1 - Y0
  const W = (x, w = 1.6) => win(x, w, 1.0, 2.0)
  const W2 = (x, w = 1.5) => win(x, w, 0.9, 1.9)

  // --- ground floor exterior walls ---
  wall(B, -X - T / 2, X + T / 2, Z, Y0, H1, T, { ...ext, out: 1, openings: [W(-16), W(-11), W(-4.2, 1.4), door(0, 2.4, 3.0), W(4.2, 1.4), W(11), W(16)] })
  wall(B, -X - T / 2, X + T / 2, -Z, Y0, H1, T, { ...ext, out: -1, openings: [W(-10), W(-4), door(0, 2.2, 2.9), W(4)] })
  wallZ(B, -Z + T / 2, Z - T / 2, -X, Y0, H1, T, { ...ext, out: -1, openings: [W(-11.5), door(-7.5, 2.0, 2.8), W(-2.5), W(4), W(10)] })
  wallZ(B, -Z + T / 2, Z - T / 2, X, Y0, H1, T, { ...ext, out: 1, openings: [W(-4), W(3.5), door(7.5, 2.0, 2.8), W(11.5)] })

  // --- ground floor interior ---
  const HI = Y1 - 0.3 - Y0 // partitions stop under the floor-2 slab
  const sideWall = (x, out) =>
    wallZ(B, -Z + T / 2, Z - T / 2, x, Y0, HI, TI, { ...part, out, openings: [door(-9.5), win(-2.8, 1.8, 0.9, 2.0), door(0, 2.2, 2.8), win(2.8, 1.8, 0.9, 2.0), door(9.5)] })
  sideWall(-CX, 1)
  sideWall(CX, -1)
  wall(B, -CX + TI / 2, CX - TI / 2, -CZ, Y0, HI, TI, { ...part, out: 1, openings: [win(-4.3, 1.8, 0.9, 2.0), door(0, 3.0, 3.0), win(4.3, 1.8, 0.9, 2.0)] })
  wall(B, -CX + TI / 2, CX - TI / 2, CZ, Y0, HI, TI, { ...part, out: -1, openings: [win(-4.3, 1.8, 0.9, 2.0), gap(0, 4.0, 3.2), win(4.3, 1.8, 0.9, 2.0)] })
  wall(B, -X + T / 2, -CX - TI / 2, 1, Y0, HI, TI, { ...part, openings: [door(-13.5)] })
  wall(B, CX + TI / 2, X - T / 2, 1, Y0, HI, TI, { ...part, openings: [door(13.5)] })
  for (const x of [-2.4, 2.4]) B.cyl(M.stucco, 0.22, 0.24, HI, x, Y0 + HI / 2, CZ + 0.55, { tint: TINT.trim, seg: 12, solid: true })

  // --- floor 2 slab (holes: courtyard + stair flight 1) ---
  const S1 = { x0: 8.9, x1: 15.6, z0: -Z + T / 2, z1: -11.4 }
  slab(B, -X, -Z, X, Z, Y1, 0.3, [[-CX, -CZ, CX, CZ], [S1.x0, S1.z0, S1.x1, S1.z1]], { mat: M.floorWood, tint: 0xe8c8a0, under: { mat: M.plaster, tint: 0xfaf6ee } })
  // cornice band between the floors
  B.span(M.paint, -X - 0.22, Y1 - 0.32, -Z - 0.22, X + 0.22, Y1 + 0.02, -Z - 0.15, { tint: TINT.trim })
  B.span(M.paint, -X - 0.22, Y1 - 0.32, Z + 0.15, X + 0.22, Y1 + 0.02, Z + 0.22, { tint: TINT.trim })
  B.span(M.paint, -X - 0.22, Y1 - 0.32, -Z - 0.15, -X - 0.15, Y1 + 0.02, Z + 0.15, { tint: TINT.trim })
  B.span(M.paint, X + 0.15, Y1 - 0.32, -Z - 0.15, X + 0.22, Y1 + 0.02, Z + 0.15, { tint: TINT.trim })

  // --- floor 2 walls ---
  const H2 = Y2 - Y1
  wall(B, -X - T / 2, X + T / 2, Z, Y1, H2, T, { ...ext2, out: 1, openings: [W2(-16), W2(-11), door(-4, 1.8, 2.6, { leaf: false }), door(4, 1.8, 2.6, { leaf: false }), W2(11), W2(16)] })
  wall(B, -X - T / 2, X + T / 2, -Z, Y1, H2, T, { ...ext2, out: -1, openings: [W2(-16), W2(-11), W2(-4), W2(0), W2(4), win(18, 1.2, 1.5, 1.3)] })
  wallZ(B, -Z + T / 2, Z - T / 2, -X, Y1, H2, T, { ...ext2, out: -1, openings: [W2(-11.5), W2(-6), W2(-1), W2(4), W2(10)] })
  wallZ(B, -Z + T / 2, Z - T / 2, X, Y1, H2, T, { ...ext2, out: 1, openings: [W2(-4), W2(3.5), W2(8.5), W2(11.8, 1.2)] })
  const GW = (x) => win(x, 2.4, 0.9, 2.0)
  wallZ(B, -Z + T / 2, -CZ - TI / 2, -CX, Y1, H2, TI, { ...part, openings: [door(-9.5)] })
  wallZ(B, CZ + TI / 2, Z - T / 2, -CX, Y1, H2, TI, { ...part, openings: [door(9.5)] })
  wallZ(B, -Z + T / 2, -CZ - TI / 2, CX, Y1, H2, TI, { ...part, openings: [door(-6.5)] })
  wallZ(B, CZ + TI / 2, Z - T / 2, CX, Y1, H2, TI, { ...part, openings: [door(9.5)] })
  wallZ(B, -CZ - TI / 2, CZ + TI / 2, -CX, Y1, H2, TI, { ...part, out: 1, openings: [GW(-2), GW(2)] })
  wallZ(B, -CZ - TI / 2, CZ + TI / 2, CX, Y1, H2, TI, { ...part, out: -1, openings: [GW(-2), GW(2)] })
  wall(B, -CX + TI / 2, CX - TI / 2, -CZ, Y1, H2, TI, { ...part, out: 1, openings: [GW(-3.5), GW(0), GW(3.5)] })
  wall(B, -CX + TI / 2, CX - TI / 2, CZ, Y1, H2, TI, { ...part, out: -1, openings: [GW(-3.5), GW(0), GW(3.5)] })
  wall(B, -X + T / 2, -CX - TI / 2, 1, Y1, H2, TI, { ...part, openings: [door(-13.5)] })
  wall(B, CX + TI / 2, X - T / 2, 1, Y1, H2, TI, { ...part, openings: [door(13.5)] })

  // --- stairs: flight 1 (ground -> floor 2) along the north wall rising east,
  // flight 2 (floor 2 -> roof) beside it rising west; rails on the open sides.
  stairs(B, 9, Y0, -12.6, Math.PI / 2, 2.2, Y1 - Y0, 6.5, { mat: M.stone, tint: 0xeeeae2, nosing: 0x8a6a4a, rails: ['left'] })
  stairs(B, 15.5, Y1, -10.2, -Math.PI / 2, 2.2, RT - Y1, 6.5, { mat: M.stone, tint: 0xeeeae2, nosing: 0x8a6a4a, rails: ['left'] })
  railing(B, S1.x0, S1.z0 + 0.1, S1.x0, S1.z1, Y1, { tint: 0x2c3138, style: 'bars' })

  // --- roof ---
  const ROOFHOLE = [8.9, -11.35, 15.6, -9.0]
  flatRoof(B, -X - T / 2, -Z - T / 2, X + T / 2, Z + T / 2, Y2, {
    holes: [[-CX, -CZ, CX, CZ], ROOFHOLE],
    tint: 0xb6b2aa,
    parapet: 1.0,
    parapetMat: M.stucco,
    parapetTint: STUC,
    under: { mat: M.plaster, tint: 0xfaf6ee },
  })
  for (const [a, b, c, d] of [[-CX, -CZ, CX, -CZ], [CX, -CZ, CX, CZ], [CX, CZ, -CX, CZ], [-CX, CZ, -CX, -CZ]]) railing(B, a, b, c, d, RT, { tint: 0xdadada, style: 'glass', h: 1.05 })
  // roof bulkhead over flight 2, door on its south side
  const bx0 = 6.6
  const bx1 = 16.3
  const bz0 = -12.0
  const bz1 = -8.55
  room(B, bx0, bz0, bx1, bz1, RT, 2.8, 0.25, { s: [door(8.0, 1.9, 2.5)] }, { mat: M.stucco, tint: STUC, frameTint: TINT.trim, leafTint: 0x5a6a7a })
  flatRoof(B, bx0 - 0.2, bz0 - 0.2, bx1 + 0.2, bz1 + 0.2, RT + 2.8, { parapet: 0.25, parapetMat: M.stucco, parapetTint: STUC, tint: 0x9a9a9a, fascia: false })
  sconce(B, 9.4, RT + 2.2, bz1 + 0.13)
  acUnit(B, -14, RT, -8, 0)
  acUnit(B, -12.6, RT, -8, 0)
  acUnit(B, 14, RT, 8, Math.PI)
  waterTank(B, -15, RT, 8)
  for (let k = 0; k < 4; k++) solarPanel(B, -2 + k * 2.1, RT, 9.5, 0)
  antenna(B, 17.5, RT, -6, 3.5)
  B.cyl(M.paint, 0.55, 0.45, 0.12, 18, RT + 1.6, -2, { rx: 0.9, tint: 0xf2f2f2, seg: 14 })
  B.span(M.paint, 17.95, RT, -2.05, 18.05, RT + 1.5, -1.95, { tint: 0x777777 })
  B.cyl(M.chrome, 0.05, 0.06, 6, -17, RT + 3, -11, { tint: 0xdddddd, seg: 8 })
  flag(B, -17, RT + 5.2, -11, [0xf2c230, 0xffffff, 0xf2c230])
  crate(B, -4, RT, -8.8, 1.0, 0.3)
  crate(B, -2.9, RT, -8.6, 1.0, -0.2)
  crate(B, -3.4, RT + 1, -8.7, 0.9, 0.1)
  crate(B, 3.5, RT, 7.5, 1.1, 0.5)
  ctx.loot({ x: -10, y: RT, z: 0 })

  // --- portico: platform, columns, balcony above ---
  slab(B, -10, Z, 10, Z + 3.6, Y0, Y0, [], { mat: M.tiles, tint: 0xf6e8d2 })
  B.span(M.concrete, -6, 0, Z + 3.6, 6, 0.15, Z + 4.2, { tint: 0xe8e4dc, solid: true })
  for (const x of [-9.4, -5.6, -1.9, 1.9, 5.6, 9.4]) {
    B.span(M.stucco, x - 0.42, Y0, Z + 2.68, x + 0.42, Y0 + 0.35, Z + 3.52, { tint: TINT.trim })
    B.cyl(M.stucco, 0.27, 0.31, Y1 - Y0 - 0.75, x, Y0 + 0.35 + (Y1 - Y0 - 0.75) / 2, Z + 3.1, { tint: TINT.trim, seg: 14, solid: true })
    B.span(M.stucco, x - 0.45, Y1 - 0.4, Z + 2.65, x + 0.45, Y1 - 0.3, Z + 3.55, { tint: TINT.trim })
  }
  slab(B, -10, Z + 0.15, 10, Z + 3.6, Y1, 0.3, [], { mat: M.tiles, tint: 0xf0e8dc, under: { mat: M.stucco, tint: TINT.trim } })
  railing(B, -10, Z + 3.5, 10, Z + 3.5, Y1, { tint: TINT.trim, style: 'bars', h: 1.05 })
  railing(B, -10, Z + 0.2, -10, Z + 3.5, Y1, { tint: TINT.trim, style: 'bars', h: 1.05 })
  railing(B, 10, Z + 0.2, 10, Z + 3.5, Y1, { tint: TINT.trim, style: 'bars', h: 1.05 })
  planter(B, -7.5, Y1, Z + 2.6, 1.6, 0.6, { tint: 0xd8d0c0, mat: M.stucco })
  planter(B, 7.5, Y1, Z + 2.6, 1.6, 0.6, { tint: 0xd8d0c0, mat: M.stucco })
  for (const x of [-1.1, 1.1]) chair(B, x, Y1, Z + 2.2, x < 0 ? Math.PI / 2 : -Math.PI / 2, 0xffffff)
  B.cyl(M.paint, 0.4, 0.4, 0.04, 0, Y1 + 0.72, Z + 2.2, { tint: 0xffffff, seg: 12 })
  B.cyl(M.paint, 0.04, 0.04, 0.7, 0, Y1 + 0.36, Z + 2.2, { tint: 0x333333, seg: 6 })
  ctx.loot({ x: 5.8, y: Y1, z: Z + 1.4 })
  sign(B, 'VILLA SOLARA', 0, Y0 + 3.45, Z + 0.17, 3.0, 0.5, { bg: '#f5ecd6', fg: '#6b4a1f', border: '#b08a3a', w: 512, h: 96, font: '700 64px Fredoka, serif' })
  sconce(B, -1.7, Y0 + 2.3, Z + 0.15)
  sconce(B, 1.7, Y0 + 2.3, Z + 0.15)
  // wall AC units on the side walls (floor 2)
  B.push(X + 0.15, 0, 0, Math.PI / 2)
  wallAC(B, 6.5, Y1 + 2.9, 0)
  wallAC(B, -1, Y1 + 2.9, 0)
  B.pop()
  B.push(-X - 0.15, 0, 0, -Math.PI / 2)
  wallAC(B, 3, Y1 + 2.9, 0)
  B.pop()
  for (const [x, z] of [[-X - 0.22, -Z - 0.22], [X + 0.22, -Z - 0.22], [-X - 0.22, Z + 0.22], [X + 0.22, Z + 0.22]]) B.span(M.paint, x - 0.06, 0.1, z - 0.06, x + 0.06, RT + 0.9, z + 0.06, { tint: 0xd8d8d8 })
  // steps at the side/back doors
  B.span(M.concrete, -X - 1.0, 0, -9, -X - 0.25, 0.15, -6, { tint: 0xe8e4dc, solid: true })
  B.span(M.concrete, X + 0.25, 0, 6, X + 1.0, 0.15, 9, { tint: 0xe8e4dc, solid: true })
  B.span(M.concrete, -1.6, 0, -Z - 1.0, 1.6, 0.15, -Z - 0.25, { tint: 0xe8e4dc, solid: true })

  // --- courtyard: reflecting pool, planters, benches ---
  const py = Y0
  for (const [a, b, c, d] of [[-3.2, -1.7, 3.2, -1.4], [-3.2, 1.4, 3.2, 1.7], [-3.2, -1.4, -2.9, 1.4], [2.9, -1.4, 3.2, 1.4]]) B.span(M.stone, a, py, b, c, py + 0.45, d, { tint: 0xf2eee6, solid: true })
  B.span(M.paint, -2.9, py, -1.4, 2.9, py + 0.05, 1.4, { tint: 0x1d6f8f })
  B.solidSpan(-2.9, py, -1.4, 2.9, py + 0.3, 1.4)
  B.span(M.water, -2.9, py + 0.3, -1.4, 2.9, py + 0.32, 1.4)
  for (const [x, z] of [[-5.4, -3.6], [5.4, -3.6], [-5.4, 3.6], [5.4, 3.6]]) planter(B, x, py, z, 1.4, 1.4, { mat: M.stone, tint: 0xe8e2d6 })
  bench(B, 0, py, -3.5, 0, { tint: 0x8a5a34 })
  bench(B, 0, py, 3.3, Math.PI, { tint: 0x8a5a34 })
  ctx.loot({ x: -4.5, y: py, z: 0 })

  // --- ground floor rooms ---
  const f = Y0
  // entrance hall (x -7..7, z 5..14)
  rug(B, 0, f, 9.5, 4.0, 5.0, M.rug('#a8323a', '#f0d9a0', '#2a3f6a'))
  table(B, 0, f, 7.0, 0, 1.8, 0.7, { tint: 0x6e4528, h: 0.9 })
  plant(B, -5.8, f, 12.8, 1.1)
  plant(B, 5.8, f, 12.8, 1.1)
  floorLamp(B, -5.8, f, 6.2)
  ctx.loot({ x: 3.5, y: f, z: 10.5 })
  // living room (x -20..-7, z 1..14)
  tvUnit(B, -17, f, 2.0, 0)
  sofa(B, -17, f, 9.6, Math.PI, 0x3f6fb0, 3.0)
  coffeeTable(B, -17, f, 6.2, 0)
  armchair(B, -12.9, f, 6.0, -Math.PI / 2, 0xd88a3a)
  rug(B, -17, f, 6.2, 4.6, 3.8, M.rug('#2f5f8a', '#f2eadb', '#e0b23a'))
  bookshelf(B, -19.6, f, 12.6, Math.PI / 2, 1.8, 2.2)
  plant(B, -8.0, f, 13.0, 1)
  ctx.loot({ x: -11, y: f, z: 11 })
  // library (x -20..-7, z -14..1)
  for (const x of [-18.4, -16.1, -13.8]) bookshelf(B, x, f, -13.55, 0, 2.2, 2.4)
  desk(B, -11, f, -6.5, Math.PI, { tint: 0x8a5a34 })
  armchair(B, -17.2, f, -3.5, Math.PI / 2, 0x2f6f4f)
  armchair(B, -17.2, f, -1.4, Math.PI / 2, 0x2f6f4f)
  coffeeTable(B, -15.4, f, -2.4, Math.PI / 2)
  // dining + kitchen (x 7..20, z 1..14)
  diningSet(B, 12.6, f, 8.6, 0, 3, 0x8a5a34)
  kitchen(B, 13.4, f, 13.45, Math.PI, 4.2, { upper: false })
  fridge(B, 18.9, f, 12.6, -Math.PI / 2)
  B.span(M.wood, 15.2, f, 3.3, 19.2, f + 0.95, 4.3, { tint: 0xffffff, solid: true })
  B.span(M.stone, 15.1, f + 0.95, 3.2, 19.3, f + 1.0, 4.4, { tint: 0x8a8f96 })
  for (const x of [15.9, 17.2, 18.5]) {
    B.cyl(M.chrome, 0.03, 0.03, 0.7, x, f + 0.35, 2.6, { tint: 0xcccccc, seg: 6 })
    B.cyl(M.cloth, 0.2, 0.2, 0.07, x, f + 0.72, 2.6, { tint: 0xc0392b, seg: 10 })
  }
  // stair hall (x 7..20, z -14..1): piano corner + lounge
  B.span(M.gloss, 16.4, f, -6.5, 19.2, f + 1.0, -4.0, { tint: 0x111111, solid: true })
  B.span(M.paint, 16.4, f + 0.8, -6.6, 19.2, f + 0.85, -6.4, { tint: 0xf4f4f4 })
  chair(B, 17.8, f, -7.5, 0, 0x111111)
  sofa(B, 11.2, f, -2.9, Math.PI, 0x8a3fb0, 2.4)
  plant(B, 19.0, f, 0.0, 1.2)
  ctx.loot({ x: 13.5, y: f, z: -7 })
  // north gallery (x -7..7, z -14..-5)
  for (const x of [-4.5, 4.5]) B.span(M.stone, x - 0.35, f, -12.9, x + 0.35, f + 1.0, -12.2, { tint: 0xf6f2ea, solid: true })
  B.geo(M.paint, new IcosahedronGeometry(0.35, 0), -4.5, f + 1.35, -12.55, { tint: 0xe0b23a })
  B.span(M.paint, 4.2, f + 1.0, -12.75, 4.8, f + 1.8, -12.35, { tint: 0xc0392b })
  bench(B, -3.2, f, -7.0, 0, { back: false, tint: 0x6e4528 })
  bench(B, 3.2, f, -7.0, 0, { back: false, tint: 0x6e4528 })

  // --- floor 2 rooms ---
  const g = Y1
  sofa(B, -3.2, g, 7.2, 0, 0xe0b23a, 2.4)
  sofa(B, 3.2, g, 7.2, 0, 0xe0b23a, 2.4)
  coffeeTable(B, 0, g, 9.0, 0)
  plant(B, -6.0, g, 13.0, 1)
  ctx.loot({ x: 0, y: g, z: 11.5 })
  bed(B, -13.5, g, 12.2, Math.PI, 0xc0392b)
  wardrobe(B, -18.9, g, 6, Math.PI / 2, 2.0)
  rug(B, -13.5, g, 9.2, 3.5, 2.4, M.rug('#f2eadb', '#c0392b', '#2a3f6a'))
  bed(B, -16.5, g, -12.2, 0, 0x3f8a4a, false)
  bed(B, -12.5, g, -12.2, 0, 0x3f6fb0, false)
  desk(B, -10, g, -3, Math.PI, { tint: 0xf2ece0, chairTint: 0xc0392b })
  bed(B, 13.5, g, 12.2, Math.PI, 0x8a3fb0)
  wardrobe(B, 18.9, g, 6, -Math.PI / 2, 1.6)
  armchair(B, 9.5, g, 4.5, Math.PI / 2, 0x3f6fb0)
  // east landing lounge: pool table
  table(B, 13, g, -4.6, 0, 2.6, 1.4, { tint: 0x2f7d4f, h: 0.85, mat: M.cloth })
  B.span(M.wood, 11.65, g + 0.85, -5.35, 14.35, g + 0.95, -5.25, { tint: 0x6e4528 })
  B.span(M.wood, 11.65, g + 0.85, -3.95, 14.35, g + 0.95, -3.85, { tint: 0x6e4528 })
  armchair(B, 18.5, g, -2.2, -Math.PI / 2, 0x8a5a34)
  // north wing upstairs: gym corner
  B.span(M.cloth, -5.5, g, -13.0, -2.5, g + 0.1, -11.0, { tint: 0x3f6fb0 })
  B.span(M.paint, 1.5, g, -13.3, 3.5, g + 1.2, -12.2, { tint: 0x333333, solid: true })
  B.span(M.paint, 4.5, g, -13.3, 5.5, g + 1.8, -12.6, { tint: 0x555555, solid: true })
  plant(B, -6.2, g, -6.0, 1)

  // --- grounds ---
  const G = new Batch('villaGrounds')
  // cobbled avenue from the ring road to the portico, lined with cypresses + lamps
  G.span(M.cobble, -3, 0, Z + 4.2, 3, 0.06, 41.4)
  G.span(M.concrete, -3.25, 0, Z + 4.2, -3, 0.14, 41.4, { tint: 0xd9d6cf })
  G.span(M.concrete, 3, 0, Z + 4.2, 3.25, 0.14, 41.4, { tint: 0xd9d6cf })
  for (let z = 22; z <= 38; z += 4) {
    N.cypress(-4.7, z, 0.85)
    N.cypress(4.7, z, 0.85)
  }
  ctx.lamp(streetLamp(G, -3.8, 0, 24, Math.PI / 2, { h: 4.2 }), 1)
  ctx.lamp(streetLamp(G, -3.8, 0, 36, Math.PI / 2, { h: 4.2 }), 1)
  streetLamp(G, 3.8, 0, 32, -Math.PI / 2, { h: 4.2 })
  // paths around the house
  G.span(M.cobble, -X - 4, 0, -Z - 3, X + 4, 0.05, -Z - 1.5)
  G.span(M.cobble, -X - 4, 0, -Z - 1.5, -X - 1.5, 0.05, Z + 1.5)
  G.span(M.cobble, X + 1.5, 0, -Z - 1.5, X + 4, 0.05, Z + 1.5)
  G.span(M.cobble, -X - 4, 0, Z + 1.5, -10.2, 0.05, Z + 4.2)
  G.span(M.cobble, 10.2, 0, Z + 1.5, X + 4, 0.05, Z + 4.2)
  // parking pad with two cars
  G.span(M.concrete, 9, 0, 20, 21, 0.06, 27, { tint: 0xd0cdc6 })
  car(G, 12, 0.06, 23.5, 0, 0x111111, 'suv', { roofRack: true })
  car(G, 17.5, 0.06, 23.5, 0, 0xe9e9e9, 'sedan')
  // hedges framing the lawns (gaps on every axis)
  const hx = 27
  const hzN = -25
  const hzS = 29
  hedge(G, -hx, hzN, -4, hzN, 1.2)
  hedge(G, 4, hzN, hx, hzN, 1.2)
  hedge(G, -hx, hzS, -5.5, hzS, 1.2)
  hedge(G, 5.5, hzS, hx, hzS, 1.2)
  hedge(G, -hx, hzN, -hx, -4, 1.2)
  hedge(G, -hx, 4, -hx, hzS, 1.2)
  hedge(G, hx, hzN, hx, -4, 1.2)
  hedge(G, hx, 4, hx, hzS, 1.2)
  gazebo(G, 19.5, -20.6)
  ctx.loot({ x: 19.5, y: 0.25, z: -20.6 })
  // garden shed + bbq in the north-west garden
  room(G, -24.5, -23, -19.5, -19.5, 0.12, 2.5, 0.15, { s: [door(-22, 1.8, 2.3)] }, { mat: M.siding, tint: 0x8fb3c9, frameTint: 0xffffff, leafTint: 0xffffff })
  slab(G, -24.5, -23, -19.5, -19.5, 0.12, 0.12, [], { mat: M.floorWood, tint: 0xc9a06a })
  G.box(M.shingle, 5.8, 0.12, 4.4, -22, 2.75, -21.25, { rx: 0.12, tint: TINT.darkSlate, solid: true })
  crate(G, -23.6, 0.12, -22.2, 0.8)
  ctx.loot({ x: -21, y: 0.12, z: -21.3 })
  G.span(M.paint, -17, 0, -21.5, -16, 0.9, -20.9, { tint: 0x222222, solid: true })
  G.cyl(M.paint, 0.4, 0.3, 0.3, -16.5, 1.0, -21.2, { tint: 0x222222, seg: 10 })
  table(G, -13.5, 0, -21, 0, 1.8, 0.9, { tint: 0xb0743f })
  // lawn trees, bushes, flowerbeds, grass
  for (const [x, z] of [[-15, 24.5], [-24, 24], [24, 24.5], [-9, -21.2], [8, -21.5]]) N.tree(x, z, { s: 0.85 })
  N.cherry(24.6, 11, 0.8)
  N.cherry(-24.6, -11, 0.8)
  for (const [x, z, s] of [[-8, 20.5, 0.7], [-20, 20.5, 0.6], [-11, 27, 0.6], [22.8, 20.5, 0.6], [-4.8, -19, 0.6], [4.8, -19, 0.6], [-14, -24, 0.6], [13, -24, 0.7], [24.5, -2, 0.5], [-24.5, 2, 0.5]]) N.bush(x, z, s)
  for (let k = 0; k < 24; k++) N.flower(-24 + (k % 6) * 0.9, 19 + Math.floor(k / 6) * 0.9)
  for (let k = 0; k < 18; k++) N.flower(-6.5 + (k % 6) * 0.9, -18.4 - Math.floor(k / 6) * 0.9)
  const rand = mulberry32(4321)
  const lawns = [[-26, 18.5, 8, 28.3], [9, 27.5, 26, 28.3], [-26, -24.4, 26, -17.4], [-26, -15, -24.3, 15], [24.3, -15, 26, 15]]
  const nt = Math.round(160 * ctx.q * ctx.q)
  for (let k = 0; k < nt; k++) {
    const [x0, z0, x1, z1] = lawns[k % lawns.length]
    N.tuft(x0 + rand() * (x1 - x0), z0 + rand() * (z1 - z0), 0.8 + rand() * 0.5)
  }

  B.build(ctx.root, true)
  G.build(ctx.root, true)
  occupy(-28, -26, 28, 30) // the whole walled garden: no random scatter inside
}

// Gazebo: octagonal deck, 8 posts, low rails (open to the south), cone roof.
function gazebo(B, x, z) {
  B.cyl(M.floorWood, 3.2, 3.3, 0.25, x, 0.125, z, { seg: 8, tint: 0xd8b68a, solid: true })
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8
    const px = x + Math.cos(a) * 2.9
    const pz = z + Math.sin(a) * 2.9
    B.cyl(M.wood, 0.1, 0.1, 2.6, px, 0.25 + 1.3, pz, { tint: 0xffffff, seg: 6, solid: true })
    if (k !== 1) {
      const b = ((k + 1) / 8) * Math.PI * 2 + Math.PI / 8
      railing(B, px, pz, x + Math.cos(b) * 2.9, z + Math.sin(b) * 2.9, 0.25, { tint: 0xffffff, h: 0.8, spacing: 0.6, style: 'bars' })
    }
  }
  B.cyl(M.shingle, 0.1, 3.7, 1.6, x, 0.25 + 2.6 + 0.8, z, { seg: 8, tint: TINT.terracotta })
  B.cyl(M.paint, 0.08, 0.08, 0.8, x, 0.25 + 2.6 + 1.9, z, { tint: 0xffffff, seg: 6 })
  B.solid(3.2, 0.1, 3.2, x, 2.95, z)
}
