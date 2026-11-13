// Dockyard (west): a concrete apron ending in a quay wall with bollards and
// fenders, a timber pier with a moored (bobbing) boat, a corrugated warehouse
// (big doors, interior catwalk reached by a steel stair, office, racking,
// forklift), stacks of shipping containers (some open and walkable, stacks
// reachable by crates and a stair), a gantry crane whose trolley travels,
// light towers and a guard booth at the gate.
import { Group } from 'three'
import { Batch } from './geom.js'
import { M, TINT } from './materials.js'
import { DOCK, occupy } from './layout.js'
import {
  barrel, chainFence, container, crate, desk, door, gableRoof, lockers, pallet, railing, room, shelfRack, sign, slab, stairs, streetLamp, wall, wallZ, win,
} from './kit.js'

const TOP = 0.06
const RED = 0xc0392b
const BLUE = 0x2f6fd0
const GREEN = 0x2e8b57
const ORANGE = 0xe67e22
const TEAL = 0x1f8a8a

export function build(ctx) {
  const B = new Batch('dock')
  const { x0: QX, x1: EX, z0: NZ, z1: SZ } = DOCK

  // --- apron + quay wall ---
  B.span(M.concrete, QX, -4.6, NZ, EX, TOP, SZ, { tint: 0xcfcdc7 })
  B.solidSpan(QX, -0.6, NZ, EX, TOP, SZ)
  B.span(M.marking, QX + 0.35, TOP, NZ + 0.2, QX + 0.6, TOP + 0.004, SZ - 0.2, { tint: 0xf2c230 })
  for (let z = NZ + 3; z < SZ - 1; z += 6) {
    if (z > DOCK.pier.z0 - 1 && z < DOCK.pier.z1 + 1) continue
    B.cyl(M.paint, 0.22, 0.26, 0.55, QX + 0.9, TOP + 0.28, z, { tint: 0x2c3138, seg: 10, solid: true })
    B.cyl(M.paint, 0.32, 0.32, 0.08, QX + 0.9, TOP + 0.56, z, { tint: 0x2c3138, seg: 10 })
    B.cyl(M.rubber, 0.35, 0.35, 1.6, QX - 0.35, -0.9, z + 3, { rx: Math.PI / 2, seg: 10 })
  }
  for (const z of [-30, 6]) for (let k = 0; k < 6; k++) B.span(M.chrome, QX - 0.12, -3.6 + k * 0.6, z - 0.25, QX - 0.04, -3.56 + k * 0.6, z + 0.25, { tint: 0x9aa3ad })

  // --- pier + moored boat ---
  pier(B, ctx)

  // --- warehouse ---
  warehouse(B, ctx, -112, -40, -88, -24)

  // --- container yard ---
  const yard = [
    // [x, z, len, level, color, open, logo]
    [-111, -3.6, 12.19, 0, RED, false, 'OCEANIX'], [-111, -3.6, 12.19, 1, BLUE, false, null],
    [-114.5, 3.6, 6.06, 0, GREEN, false, null], [-107.5, 3.6, 6.06, 0, ORANGE, true, null],
    [-94, -16.2, 12.19, 0, BLUE, false, 'BLUWAVE'], [-94, -16.2, 12.19, 1, RED, false, null], [-94, -16.2, 12.19, 2, TEAL, false, 'OCEANIX'],
    [-97.5, -11.4, 6.06, 0, ORANGE, false, null], [-88.5, -11.4, 6.06, 0, RED, true, null],
    [-92, 2.2, 12.19, 0, GREEN, true, 'BLUWAVE'], [-97, 7.0, 6.06, 0, BLUE, false, null], [-97, 7.0, 6.06, 1, ORANGE, false, null],
    [-86, 7.0, 6.06, 0, TEAL, false, null], [-90.5, 11.2, 6.06, 0, RED, true, null],
  ]
  for (const [x, z, len, lv, c, open, logo] of yard) container(B, x, TOP + lv * 2.6, z, 0, { len, color: c, open, logo })
  container(B, -81.2, TOP, -16.5, Math.PI / 2, { len: 6.06, color: GREEN })
  container(B, -81.2, TOP, -24.5, Math.PI / 2, { len: 6.06, color: ORANGE, open: true })
  ctx.loot({ x: -107.5, y: TOP + 0.13, z: 3.6 })
  ctx.loot({ x: -92, y: TOP + 0.13, z: 2.2 })
  ctx.loot({ x: -94, y: TOP + 7.8, z: -16.2 })
  ctx.loot({ x: -81.2, y: TOP + 0.13, z: -24.5 })
  // crate steps up onto the 2-high stack at -97.5, and a steel stair onto the 3-high stack
  crate(B, -101.4, TOP, -11.4, 1.0, 0.1)
  crate(B, -101.4, TOP, -10.3, 1.0, -0.1)
  crate(B, -101.4, TOP + 1.0, -11.1, 0.9, 0.2)
  stairs(B, -87.2, TOP, -18.25, -Math.PI / 2, 1.3, 7.86 - TOP, 9.6, { style: 'open', mat: M.plate, tint: 0xb8bec4, stringerMat: M.paint, stringerTint: TINT.yellow, rails: ['left'], railTint: TINT.yellow })
  slab(B, -98.3, -18.95, -96.75, -17.3, TOP + 7.8, 0.12, [], { mat: M.plate, tint: 0xb8bec4 })
  railing(B, -98.3, -18.9, -96.8, -18.9, TOP + 7.8, { tint: TINT.yellow })
  railing(B, -98.25, -18.9, -98.25, -17.35, TOP + 7.8, { tint: TINT.yellow })
  for (const x of [-98.2, -96.85]) B.span(M.paint, x - 0.06, TOP, -18.9, x + 0.06, TOP + 7.7, -18.78, { tint: TINT.yellow })
  for (const [x, z, s] of [[-102, 0.5, 1.0], [-103, 0.6, 0.9], [-84, -5, 1.1], [-84.2, -3.8, 1.0], [-84.1, -4.4, 0.9]]) crate(B, x, z === -4.4 ? TOP + 1.0 : TOP, z, s, x * 0.3)
  for (const [x, z, load] of [[-100.5, 12.4, 1], [-98.8, 12.4, 2], [-83.5, 11.6, 1], [-106, -20.5, 2], [-104.3, -20.5, 1]]) pallet(B, x, TOP, z, 0, load, x | 0)
  for (let i = 0; i < 4; i++) barrel(B, -117.6 + (i % 2) * 0.8, TOP, -19 - Math.floor(i / 2) * 0.8, [0x2f6db5, 0xd8402a, 0x3f8a4a, 0xf2c230][i])

  // --- gantry crane over the quay bay ---
  const crane = gantry(B, ctx, -119, -103, -7.2, 7.2)
  ctx.loot({ x: -107, y: TOP, z: 0 })

  // forklifts
  forklift(B, -84.5, TOP, 0.5, Math.PI / 2)
  forklift(B, -92, TOP, -30.5, Math.PI)

  // light towers
  for (const [x, z] of [[-117.5, -21.5], [-79, 12]]) {
    B.cyl(M.paint, 0.18, 0.26, 12, x, TOP + 6, z, { tint: 0x7a8590, seg: 8, solid: true })
    B.span(M.paint, x - 1.2, TOP + 12, z - 0.4, x + 1.2, TOP + 12.9, z + 0.4, { tint: 0x5b6670 })
    for (const lx of [-0.8, 0, 0.8]) B.box(M.bulb, 0.6, 0.5, 0.05, x + lx, TOP + 12.45, z + 0.43)
    ctx.lamp({ x, y: TOP + 11.6, z: z + 1 }, 2)
  }

  // guard booth + raised barrier at the gate
  const gx = -80
  const gz = -7.6
  room(B, gx - 1.3, gz - 1.3, gx + 1.3, gz + 1.3, TOP, 2.6, 0.12, { e: [win(gz, 1.8, 0.9, 1.2)], n: [door(gx, 1.7, 2.3)], s: [win(gx, 1.6, 0.9, 1.2)], w: [win(gz, 1.6, 0.9, 1.2)] }, { mat: M.stucco, tint: 0xf2f2f2, frameTint: BLUE, sashTint: 0x2c3138 })
  slab(B, gx - 1.3, gz - 1.3, gx + 1.3, gz + 1.3, TOP + 0.1, 0.1, [], { mat: M.tiles, tint: 0xe0e0e0 })
  slab(B, gx - 1.6, gz - 1.6, gx + 1.6, gz + 1.6, TOP + 2.85, 0.25, [], { mat: M.paint, tint: BLUE })
  B.span(M.paint, gx - 0.2, TOP, gz + 1.8, gx + 0.2, TOP + 1.0, gz + 2.2, { tint: 0x2c3138, solid: true })
  B.box(M.paint, 0.12, 4.2, 0.12, gx, TOP + 3.0, gz + 2.0, { rz: 0.15, tint: 0xd8402a })
  sign(B, 'DOCKYARD', gx + 1.38, TOP + 2.2, gz, 2.2, 0.5, { bg: '#2f6fd0', fg: '#ffffff', border: '#ffffff', w: 512, h: 112 }, Math.PI / 2)

  // perimeter fence on the south edge (with gaps) and a few lamps
  chainFence(B, QX + 2, SZ - 0.5, -101, SZ - 0.5)
  chainFence(B, -95, SZ - 0.5, -86, SZ - 0.5)
  for (const [x, z, yaw] of [[-86, -21.5, 0], [-100, -21.5, 0]]) streetLamp(B, x, TOP, z, yaw, { h: 5.5 })

  B.build(ctx.root, true)
  occupy(QX - 30, NZ - 2, EX + 1, SZ + 1)
  ctx.anim(crane)
}

function pier(B, ctx) {
  const { z0, z1, x1 } = DOCK.pier
  const QX = DOCK.x0
  const deckY = 0.22
  B.span(M.floorWood, x1, deckY - 0.18, z0, QX, deckY, z1, { tint: 0xc49a6c })
  B.solidSpan(x1, deckY - 0.4, z0, QX + 0.1, deckY, z1)
  for (let x = QX - 1.5; x > x1; x -= 3.2) {
    for (const z of [z0 + 0.3, z1 - 0.3]) B.cyl(M.wood, 0.2, 0.22, 5.2, x, deckY - 2.7, z, { tint: 0x6e4f34, seg: 8 })
    B.span(M.wood, x - 0.15, deckY - 0.45, z0 + 0.1, x + 0.15, deckY - 0.18, z1 - 0.1, { tint: 0x7a5a3c })
  }
  for (const z of [z0 + 0.1, z1 - 0.1]) railing(B, QX - 1, z, x1 + 0.3, z, deckY, { mat: M.wood, tint: 0x8a6a4a, h: 1.0, spacing: 2.4, solid: false })
  railing(B, x1 + 0.15, z0 + 0.2, x1 + 0.15, z1 - 0.2, deckY, { mat: M.wood, tint: 0x8a6a4a, h: 1.0, spacing: 2, solid: false })
  for (const x of [QX - 8, QX - 17]) {
    B.cyl(M.paint, 0.18, 0.2, 0.5, x, deckY + 0.25, z1 - 0.6, { tint: 0x2c3138, seg: 8, solid: true })
    B.cyl(M.paint, 0.18, 0.2, 0.5, x, deckY + 0.25, z0 + 0.6, { tint: 0x2c3138, seg: 8, solid: true })
  }
  ctx.lamp(streetLamp(B, QX - 12, deckY, z1 - 0.5, Math.PI, { h: 4.2 }), 1)
  streetLamp(B, x1 + 1.5, deckY, z0 + 0.5, 0, { h: 4.2 })
  crate(B, x1 + 2.5, deckY, z1 - 1.4, 0.9, 0.3)
  barrel(B, x1 + 3.6, deckY, z1 - 1.2, 0x2f6db5)
  ctx.loot({ x: x1 + 2.2, y: deckY, z: (z0 + z1) / 2 })
  // life ring on a post
  B.span(M.wood, QX - 4, deckY, z0 + 0.15, QX - 3.85, deckY + 1.3, z0 + 0.3, { tint: 0x8a6a4a })
  B.cyl(M.paint, 0.35, 0.35, 0.1, QX - 3.92, deckY + 1.0, z0 + 0.38, { rx: Math.PI / 2, tint: 0xff5a1f, seg: 12 })
  // moored fishing boat (bobs gently)
  const boat = new Batch('boat')
  boatModel(boat)
  const g = new Group()
  boat.build(g, true)
  g.position.set(x1 + 9, -0.62, z1 + 2.7)
  ctx.root.add(g)
  ctx.anim((dt, t) => {
    g.position.y = -0.62 + Math.sin(t * 1.1) * 0.06
    g.rotation.z = Math.sin(t * 0.9) * 0.025
    g.rotation.x = Math.sin(t * 0.7 + 1) * 0.02
  })
}

function boatModel(B) {
  // hull along x, origin at the waterline
  const hull = (y0, y1, w, len, tint) => B.span(M.gloss, -len / 2, y0, -w / 2, len / 2, y1, w / 2, { tint })
  hull(-0.5, 0.2, 2.4, 8.4, 0x1f4f8f)
  hull(0.2, 0.75, 2.8, 8.6, 0xf4f4f4)
  B.box(M.gloss, 2.6, 1.2, 2.6, 4.6, 0.25, 0, { ry: Math.PI / 4, sy: 1, tint: 0xf4f4f4 })
  B.span(M.paint, -4.2, 0.6, -1.32, 4.2, 0.72, 1.32, { tint: 0xc0392b })
  B.span(M.floorWood, -4.1, 0.55, -1.25, 4.0, 0.62, 1.25, { tint: 0xc49a6c })
  // wheelhouse
  B.span(M.gloss, -2.6, 0.62, -1.0, 0.2, 2.5, 1.0, { tint: 0xf4f4f4 })
  B.span(M.dark, -2.65, 1.6, -0.9, 0.25, 2.2, 0.9, { tint: 0x203848 })
  B.span(M.gloss, -2.8, 2.5, -1.15, 0.4, 2.65, 1.15, { tint: 0x1f4f8f })
  B.cyl(M.chrome, 0.05, 0.05, 2.2, -1.2, 3.7, 0, { tint: 0xdddddd, seg: 6 })
  B.span(M.paint, -1.6, 4.3, -0.04, -0.8, 4.36, 0.04, { tint: 0xdddddd })
  // nets + buoys at the stern
  B.span(M.cloth, -4.0, 0.62, -1.0, -2.9, 0.95, 0.6, { tint: 0x3a7a5a })
  for (const z of [-0.8, 0.0, 0.8]) B.cyl(M.paint, 0.18, 0.18, 0.4, -3.6, 1.1, z, { tint: 0xff7b1a, seg: 8 })
}

function warehouse(B, ctx, x0, z0, x1, z1) {
  const y0 = 0.2
  const H = 8
  const T = 0.3
  slab(B, x0, z0, x1, z1, y0, y0 - TOP + 0.05, [], { mat: M.concrete, tint: 0xbfbdb7 })
  B.span(M.concrete, x0 - 0.3, TOP, z0 - 0.3, x1 + 0.3, y0 - 0.01, z1 + 0.3, { tint: 0xa8a6a0 })
  const wc = 0x5f86a8
  const o = { mat: M.metal, tint: wc, inner: { mat: M.metal, tint: 0xb9c6d2 }, frameTint: 0x2c3138, sashTint: 0x2c3138, leafTint: 0x2c3138, plinth: { mat: M.concrete, tint: 0xd0cec8, h: 1.0 } }
  const big = (x) => ({ x, w: 6, y: 0, h: 5, kind: 'door', leaf: false })
  const clere = (xs) => xs.map((x) => win(x, 2.0, 5.6, 1.4))
  wall(B, x0 - T / 2, x1 + T / 2, z1, y0, H, T, { ...o, out: 1, openings: [door(-108, 1.8, 2.5), big(-96), ...clere([-110, -104, -101, -90])] })
  wall(B, x0 - T / 2, x1 + T / 2, z0, y0, H, T, { ...o, out: -1, openings: [door(-100, 1.8, 2.5), ...clere([-109, -105, -96, -92])] })
  wallZ(B, z0 + T / 2, z1 - T / 2, x0, y0, H, T, { ...o, out: -1, openings: [door(-30, 1.8, 2.5), win(-36, 1.6, 1.0, 1.4)] })
  wallZ(B, z0 + T / 2, z1 - T / 2, x1, y0, H, T, { ...o, out: 1, openings: [big(-32)] })
  // roller-door housings over the big doors
  B.span(M.paint, -99.2, y0 + 5.0, z1 + 0.15, -92.8, y0 + 5.5, z1 + 0.6, { tint: 0x9aa3ad })
  B.span(M.paint, x1 + 0.15, y0 + 5.0, -35.2, x1 + 0.6, y0 + 5.5, -28.8, { tint: 0x9aa3ad })
  gableRoof(B, x0, z0, x1, z1, y0 + H, 1.8, { mat: M.metal, tint: 0xb8c0c8, wallMat: M.metal, wallTint: wc, ov: 0.6, trimTint: 0x2c3138, gutterTint: 0x9aa3ad, groundY: TOP, vent: false })
  sign(B, 'DOCK 7', x1 + 0.17, y0 + 6.4, -32, 4.4, 1.2, { bg: '#f2c230', fg: '#1a1a1a', border: '#1a1a1a', w: 512, h: 140, font: '700 110px Fredoka, sans-serif' }, Math.PI / 2)
  sign(B, 'WAREHOUSE B', -96, y0 + 6.2, z1 + 0.17, 5.0, 0.9, { bg: '#2c3138', fg: '#ffffff', border: '#f2c230', w: 512, h: 96 })

  // catwalk along the north and west walls at 4.5 m, with posts and railings
  const CY = y0 + 4.3
  const cw = 2.25
  slab(B, x0 + 0.15, z0 + 0.15, x1 - 0.15, z0 + 0.15 + cw, CY, 0.15, [], { mat: M.plate, tint: 0xb8bec4 })
  slab(B, x0 + 0.15, z0 + 0.15 + cw, x0 + 0.15 + cw, z1 - 0.15, CY, 0.15, [], { mat: M.plate, tint: 0xb8bec4 })
  railing(B, x0 + 0.15 + cw, z0 + 0.15 + cw, x1 - 0.15, z0 + 0.15 + cw, CY, { tint: TINT.yellow, style: 'bars', h: 1.05 })
  railing(B, x0 + 0.15 + cw, z0 + 0.15 + cw, x0 + 0.15 + cw, z1 - 2.0, CY, { tint: TINT.yellow, style: 'bars', h: 1.05 })
  for (let x = x0 + 4; x < -95.5; x += 4) B.span(M.paint, x - 0.08, y0, z0 + cw + 0.0, x + 0.08, CY - 0.15, z0 + cw + 0.16, { tint: 0x5b6670, solid: true })
  for (let z = z0 + 6; z < z1 - 2; z += 4) B.span(M.paint, x0 + cw, y0, z - 0.08, x0 + cw + 0.16, CY - 0.15, z + 0.08, { tint: 0x5b6670, solid: true })
  stairs(B, -101.8, y0, z1 - 1.1, -Math.PI / 2, 1.5, CY - y0, 7.6, { style: 'open', mat: M.plate, tint: 0xb8bec4, stringerMat: M.paint, stringerTint: TINT.yellow, rails: ['left'], railTint: TINT.yellow })
  ctx.loot({ x: x0 + 1.3, y: CY, z: z0 + 8 })
  crate(B, x1 - 3, CY, z0 + 0.4 + 0.5, 0.9, 0.2)
  crate(B, x1 - 4.1, CY, z0 + 0.4 + 0.5, 0.9, -0.1)

  // office in the north-east corner (under the catwalk)
  const ox0 = -95.2
  const oz1 = -35.2
  room(B, ox0, z0 + 0.15, x1 - 0.15, oz1, y0, 3.0, 0.15, { n: false, e: false, s: [door(-91.8, 1.8, 2.4), win(-94.0, 1.4, 1.0, 1.2)], w: [win(-37.6, 1.4, 1.0, 1.2)] }, { mat: M.plaster, tint: 0xf2f2f2, frameTint: 0x2c3138, sashTint: 0x2c3138 })
  slab(B, ox0, z0 + 0.15, x1 - 0.15, oz1, y0 + 3.1, 0.1, [], { mat: M.paint, tint: 0xdadada })
  desk(B, -90.6, y0, -38.0, 0, { tint: 0xd8dde2 })
  lockers(B, -94.4, y0, -38.5, Math.PI / 2, 3)
  ctx.loot({ x: -92.6, y: y0, z: -36.6 })

  // racking, pallets
  shelfRack(B, -103, y0, -29.2, 0, 6, 3.2, { seed: 3 })
  shelfRack(B, -103, y0, -33.6, 0, 6, 3.2, { seed: 5, tint: 0xd8402a })
  for (const [x, z, l] of [[-97.2, -37.8, 1], [-97.2, -36.4, 2], [-90, -27, 1], [-108.5, -33.6, 1]]) pallet(B, x, y0, z, 0, l, Math.abs(x | 0))
  ctx.loot({ x: -106, y: y0, z: -31.4 })
}

// Rubber-tyred gantry crane spanning x0..x1 with portal legs at z = zA, zB.
// Returns the animation step (trolley travels along the girders).
function gantry(B, ctx, x0, x1, zA, zB) {
  const H = 16
  const Y = TOP
  const yel = 0xf2c230
  for (const x of [x0, x1]) {
    for (const z of [zA, zB]) {
      B.span(M.paint, x - 0.45, Y + 0.9, z - 0.45, x + 0.45, Y + H, z + 0.45, { tint: yel, solid: true })
      B.span(M.paint, x - 0.7, Y + 0.45, z - 1.4, x + 0.7, Y + 0.9, z + 1.4, { tint: 0x3a3f45 })
      for (const dz of [-0.9, 0.9]) B.cyl(M.rubber, 0.45, 0.45, 0.5, x, Y + 0.45, z + dz, { rz: Math.PI / 2, seg: 12 })
    }
    // upper bracing between the legs of each portal side
    B.span(M.paint, x - 0.3, Y + H - 1.0, zA, x + 0.3, Y + H - 0.4, zB, { tint: yel })
    const L = Math.hypot(zB - zA, 6)
    B.box(M.paint, 0.25, 0.25, L, x, Y + H - 4, (zA + zB) / 2, { rx: Math.atan2(6, zB - zA), tint: yel })
    B.box(M.paint, 0.25, 0.25, L, x, Y + H - 4, (zA + zB) / 2, { rx: -Math.atan2(6, zB - zA), tint: yel })
  }
  for (const z of [zA, zB]) B.span(M.paint, x0 - 1.2, Y + H, z - 0.6, x1 + 1.2, Y + H + 1.1, z + 0.6, { tint: yel })
  // machinery house + walkway rails on the girders
  B.span(M.metal, x1 - 1.2, Y + H + 1.1, zA - 0.8, x1 + 1.4, Y + H + 3.2, zB + 0.8, { tint: 0xe8e8e8 })
  sign(B, 'DOCK 7', (x0 + x1) / 2, Y + H + 0.55, zB + 0.62, 4, 0.9, { bg: '#f2c230', fg: '#1a1a1a', border: '#1a1a1a', w: 512, h: 112, board: false })
  for (const z of [zA, zB]) B.span(M.paint, x0 - 1.2, Y + H + 1.1, z - 0.62, x1 + 1.2, Y + H + 1.2, z - 0.56, { tint: 0x2c3138 })
  // moving trolley + cab + hoist + spreader
  const T = new Batch('craneTrolley')
  T.span(M.paint, -1.6, 0, zA - 0.9, 1.6, 1.2, zB + 0.9, { tint: 0xe8b020 })
  T.span(M.metal, -1.0, -2.6, zB - 2.6, 1.0, -0.1, zB - 0.6, { tint: 0xf4f4f4 })
  T.span(M.dark, 1.0, -2.2, zB - 2.5, 1.02, -0.8, zB - 0.7, { tint: 0x203848 })
  T.span(M.dark, -1.0, -2.6, zB - 2.62, 1.0, -1.6, zB - 2.6, { tint: 0x203848 })
  const hookY = -6.6
  for (const dz of [-1.0, 1.0]) for (const dx of [-0.6, 0.6]) T.box(M.paint, 0.04, -hookY, 0.04, dx, hookY / 2, dz, { tint: 0x222222 })
  T.span(M.paint, -0.6, hookY - 0.4, -2.9, 0.6, hookY, 2.9, { tint: yel })
  T.span(M.paint, -1.25, hookY - 0.45, -3.05, 1.25, hookY - 0.3, 3.05, { tint: 0xd09a10 })
  const trolley = new Group()
  T.build(trolley, true)
  trolley.position.set((x0 + x1) / 2, Y + H + 1.1, 0)
  ctx.root.add(trolley)
  const span = (x1 - x0) / 2 - 2.2
  const mid = (x0 + x1) / 2
  return (dt, t) => {
    trolley.position.x = mid + Math.sin(t * 0.12) * span
  }
}

function forklift(B, x, y, z, yaw) {
  B.push(x, y, z, yaw)
  B.span(M.gloss, -0.6, 0.25, -1.2, 0.6, 1.1, 0.8, { tint: 0xf2c230 })
  B.span(M.gloss, -0.62, 0.25, -1.5, 0.62, 1.4, -1.0, { tint: 0x3a3f45 })
  for (const sx of [-0.55, 0.55]) for (const sz of [-0.95, 0.55]) B.cyl(M.rubber, 0.3, 0.3, 0.25, sx, 0.3, sz, { rz: Math.PI / 2, seg: 10 })
  for (const sx of [-0.55, 0.55]) {
    B.span(M.paint, sx - 0.04, 1.1, -0.9, sx + 0.04, 2.3, -0.82, { tint: 0x222222 })
    B.span(M.paint, sx - 0.04, 1.1, 0.5, sx + 0.04, 2.3, 0.58, { tint: 0x222222 })
  }
  B.span(M.paint, -0.6, 2.3, -0.95, 0.6, 2.36, 0.6, { tint: 0x222222 })
  B.span(M.cloth, -0.35, 1.1, -0.4, 0.35, 1.2, 0.1, { tint: 0x222222 })
  B.span(M.cloth, -0.35, 1.2, -0.45, 0.35, 1.7, -0.35, { tint: 0x222222 })
  for (const sx of [-0.35, 0.35]) B.span(M.paint, sx - 0.06, 0.2, 0.85, sx + 0.06, 2.6, 0.95, { tint: 0x3a3f45 })
  for (const sx of [-0.3, 0.3]) B.span(M.chrome, sx - 0.06, 0.12, 0.95, sx + 0.06, 0.18, 2.1, { tint: 0x9aa3ad })
  B.solid(0.65, 0.8, 1.1, 0, 0.8, -0.3)
  B.pop()
}

