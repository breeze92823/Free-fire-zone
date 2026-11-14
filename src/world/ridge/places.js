// Dustline Ridge places (greybox: real walls, roofs, stairs, cover and colliders, simple dressing).
// Each build(ctx) uses the shared building kit and the ctx of src/world/ridge/index.js:
// { root, ground(x, z), loot(p), nature, anim(fn), rand() }.
//
//   Dustline Town (centre): two rows of adobe shops along the main road, a store with roof access,
//     a water tower and a gas-station canopy.
//   West Camp / East Camp: the team bases (blue / orange): concrete apron, an open vehicle bay
//     (vehicles park here in a later milestone), containers, sandbag lines, a watchtower, the flag.
//   Red Quarry (N): a pit with a ramp, rock piles, a conveyor, a site office.
//   Radio Mesa (S): a raised table with a lattice mast and a bunker; reached up its long east slope.
//   Fuel Depot (SE): storage tanks, pipes, an open warehouse, containers.
//   Windmill Flats (NW): turning windmills, a farmhouse, hay, fences.
//   Roadside: wrecked cars, rock piles and crates along the roads.
import { Batch } from '../geom.js'
import { M } from '../materials.js'
import { barrel, car, chainFence, container, crate, door, flag, flatRoof, gableRoof, pallet, railing, room, sign, slab, stairs, stoneWall, win, gap } from '../kit.js'
import { hayBale } from '../fields.js'
import { BEACH, CREEK, MESA, PLACES, QUARRY, ROADS, inlandOf, isFree, occupy, polyDist, roadDist } from './layout.js'

const ADOBE = [0xe9cda4, 0xdcae84, 0xf0e2c4, 0xcf9a72, 0xe6d2ae, 0xc7a98a, 0xe4bf96]
const TRIM = 0x8a5a3a

// Highest ground under a footprint (plus a plinth down to the lowest point, so nothing floats).
function baseY(g, x0, z0, x1, z1) {
  let hi = -1e9
  let lo = 1e9
  for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1], [(x0 + x1) / 2, (z0 + z1) / 2]]) {
    const h = g(x, z)
    hi = Math.max(hi, h)
    lo = Math.min(lo, h)
  }
  return { y: hi + 0.05, lo }
}

// An adobe block: walls with a door on `face` ('n' | 's' | 'e' | 'w') and windows, a floor, a flat
// roof (open, no parapet, when `roofStairs` puts outside stairs up to it on the east side).
function adobe(ctx, B, cx, cz, w, d, { face = 's', tint = ADOBE[0], h = 3.3, roofStairs = false, lootIn = true } = {}) {
  const x0 = cx - w / 2
  const x1 = cx + w / 2
  const z0 = cz - d / 2
  const z1 = cz + d / 2
  const { y, lo } = baseY(ctx.ground, x0 - 0.5, z0 - 0.5, x1 + 0.5, z1 + 0.5)
  B.span(M.concrete, x0 - 0.35, lo - 0.6, z0 - 0.35, x1 + 0.35, y + 0.12, z1 + 0.35, { tint: 0xb9a58c, solid: true })
  const along = (a, b) => {
    // a door in the middle, windows either side
    const m = (a + b) / 2
    const L = b - a
    return L > 7 ? [door(m), win(m - L * 0.3), win(m + L * 0.3)] : [door(m)]
  }
  const winsOnly = (a, b) => {
    const L = b - a
    return L > 6 ? [win(a + L * 0.3), win(a + L * 0.7)] : [win((a + b) / 2)]
  }
  const sides = {
    n: face === 'n' ? along(x0, x1) : winsOnly(x0, x1),
    s: face === 's' ? along(x0, x1) : winsOnly(x0, x1),
    e: face === 'e' ? along(z0, z1) : winsOnly(z0, z1),
    w: face === 'w' ? along(z0, z1) : winsOnly(z0, z1),
  }
  room(B, x0, z0, x1, z1, y + 0.12, h, 0.3, sides, { mat: M.stucco, tint, inner: { mat: M.plaster, tint: 0xf4ead8 } })
  slab(B, x0 + 0.15, z0 + 0.15, x1 - 0.15, z1 - 0.15, y + 0.14, 0.04, [], { mat: M.tiles, tint: 0xd7b48e, solid: false })
  flatRoof(B, x0 - 0.15, z0 - 0.15, x1 + 0.15, z1 + 0.15, y + 0.12 + h, { tint: 0xc4b39a, parapet: roofStairs ? 0 : 0.7, parapetMat: M.stucco, parapetTint: tint, copingTint: TRIM, fasciaTint: TRIM })
  // roof beams poking out (vigas)
  for (let k = 1; k < Math.floor(w / 1.6); k++) B.span(M.wood, x0 + k * 1.6 - 0.1, y + h - 0.25, z0 - 0.45, x0 + k * 1.6 + 0.1, y + h - 0.05, z0, { tint: TRIM })
  if (roofStairs) {
    const top = y + 0.12 + h + 0.25
    // rising north along the east wall (yaw PI: local +x is west, so the outer rail is 'left')
    const run = (top - y) * 1.25
    stairs(B, x1 + 0.95, y, z1 - 0.4, Math.PI, 1.3, top - y, run, { mat: M.concrete, tint: 0xc9b79c, rails: ['left'] })
    // a landing at the top, joined to the roof, railed on its open sides
    const lz = z1 - 0.4 - run
    slab(B, x1 + 0.1, lz - 1.6, x1 + 1.65, lz, top, 0.25, [], { mat: M.concrete, tint: 0xc9b79c })
    B.span(M.concrete, x1 + 0.2, y - 0.2, lz - 1.5, x1 + 0.45, top - 0.25, lz - 1.25, { tint: 0xb9a58c, solid: true })
    B.span(M.concrete, x1 + 1.3, y - 0.2, lz - 1.5, x1 + 1.55, top - 0.25, lz - 1.25, { tint: 0xb9a58c, solid: true })
    railing(B, x1 + 1.6, lz - 1.6, x1 + 1.6, lz, top, { h: 0.9 })
    railing(B, x1 + 0.1, lz - 1.6, x1 + 1.6, lz - 1.6, top, { h: 0.9 })
    railing(B, x0, z0, x1, z0, top, { h: 0.9 })
    railing(B, x0, z0, x0, z1, top, { h: 0.9 })
    railing(B, x0, z1, x1, z1, top, { h: 0.9 })
    ctx.loot({ x: cx, y: top, z: cz })
  }
  if (lootIn) ctx.loot({ x: cx + (w > 9 ? w * 0.22 : 0), y: y + 0.18, z: cz })
  occupy(x0 - 2, z0 - 2, x1 + (roofStairs ? 3.5 : 2), z1 + 2)
  return y
}

// A watchtower: four legs, a railed platform `P` m up, stairs on the side facing `+z after yaw`.
function tower(ctx, B, tx, tz, P = 4.6, yaw = 0, tint = 0x8a6040) {
  const g = ctx.ground
  const gy = g(tx, tz)
  B.push(tx, 0, tz, yaw)
  const S = 1.5
  for (const [x, z] of [[-S, -S], [S, -S], [-S, S], [S, S]]) B.span(M.wood, x - 0.16, gy - 0.6, z - 0.16, x + 0.16, gy + P + 2.4, z + 0.16, { tint, solid: true })
  slab(B, -S - 0.3, -S - 0.3, S + 0.3, S + 0.3, gy + P, 0.2, [], { mat: M.floorWood, tint: 0xc9a06a })
  const rt = { mat: M.wood, tint, h: 1.0, spacing: 1.0, style: 'bars' }
  railing(B, -S - 0.25, -S - 0.25, S + 0.25, -S - 0.25, gy + P, rt)
  railing(B, -S - 0.25, -S - 0.25, -S - 0.25, S + 0.25, gy + P, rt)
  railing(B, S + 0.25, -S - 0.25, S + 0.25, S + 0.25, gy + P, rt)
  railing(B, -S - 0.25, S + 0.25, -0.5, S + 0.25, gy + P, rt)
  B.span(M.metal, -S - 0.4, gy + P + 2.4, -S - 0.4, S + 0.4, gy + P + 2.6, S + 0.4, { tint: 0x8d8f86 })
  // stairs: from the ground in front, up to the platform's +z edge
  const run = P * 1.35
  stairs(B, 0.45, gy, S + 0.3 + run, Math.PI, 1.1, P, run, { mat: M.floorWood, tint: 0xc9a06a, style: 'open', stringerMat: M.wood, stringerTint: tint, rails: ['left'], railTint: tint })
  ctx.loot(B.P(-0.6, gy + P, -0.4))
  B.pop()
  occupy(tx - 4, tz - 4, tx + 4, tz + 4)
}

function flagPole(B, x, y, z, bands) {
  B.cyl(M.chrome, 0.06, 0.08, 8, x, y + 4, z, { tint: 0xdddddd, seg: 8, solid: true })
  flag(B, x, y + 7.2, z, bands, 2.2, 1.3)
}

// --- Dustline Town ---------------------------------------------------------------------------------
export function town(ctx) {
  const B = new Batch('ridgeTown')
  const g = ctx.ground
  let c = 0
  const tint = () => ADOBE[c++ % ADOBE.length]
  for (const x of [-48, -24, 24, 48]) {
    adobe(ctx, B, x, -17, 12, 10, { face: 's', tint: tint(), roofStairs: x === -24 })
    adobe(ctx, B, x, 17, 12, 10, { face: 'n', tint: tint(), roofStairs: x === 48 })
  }
  for (const x of [-36, 0, 36]) adobe(ctx, B, x, -40, 11, 9, { face: 's', tint: tint() })
  for (const x of [-36, 36]) adobe(ctx, B, x, 40, 11, 9, { face: 'n', tint: tint() })
  // The general store: bigger, with a porch and roof access.
  const sy = adobe(ctx, B, 0, 21, 16, 11, { face: 'n', tint: 0xd59a6a, h: 3.8, roofStairs: true })
  B.span(M.wood, -8.4, sy + 3.2, 14.2, 8.4, sy + 3.4, 15.6, { tint: TRIM })
  for (const x of [-7.8, -2.5, 2.5, 7.8]) B.span(M.wood, x - 0.12, sy, 14.4, x + 0.12, sy + 3.2, 14.64, { tint: TRIM, solid: true })
  sign(B, 'GENERAL STORE', 0, sy + 4.6, 15.2, 7, 1.1, { bg: '#7a3b1e', fg: '#ffe7b0', border: '#ffe7b0', w: 512, h: 80 }, Math.PI)

  // Water tower in the north plaza.
  const wy = g(0, -18)
  for (const [x, z] of [[-2.4, -20.4], [2.4, -20.4], [-2.4, -15.6], [2.4, -15.6]]) B.span(M.metal, x - 0.2, wy - 0.5, z - 0.2, x + 0.2, wy + 10, z + 0.2, { tint: 0x7d8a8f, solid: true })
  B.span(M.metal, -3, wy + 9.8, -21, 3, wy + 10.1, -15, { tint: 0x6f7a7f })
  B.cyl(M.metal, 3.2, 3.2, 4.4, 0, wy + 12.3, -18, { tint: 0x9fb0b5, seg: 18 })
  B.cyl(M.metal, 0.4, 3.4, 1.4, 0, wy + 15.2, -18, { tint: 0x8a989c, seg: 18 })
  sign(B, 'DUSTLINE', 0, wy + 12.4, -14.75, 4.4, 0.9, { bg: '#2c3138', fg: '#ffd27a', border: '#ffd27a', w: 512, h: 104, board: false })
  for (const [x, z] of [[-6, -13], [6, -13], [-7, -24], [7, -24]]) barrel(B, x, g(x, z), z, [0x7a3b1e, 0x2f6db5, 0x3f7a3f][Math.abs(x + z) % 3])
  ctx.loot({ x: 0, y: wy + 0.05, z: -18 })
  occupy(-4, -22, 4, -14)

  // Gas station canopy + pumps (south-back).
  const gy = g(0, 44)
  for (const [x, z] of [[-7, 40], [7, 40], [-7, 48], [7, 48]]) B.span(M.metal, x - 0.25, gy - 0.4, z - 0.25, x + 0.25, gy + 4.6, z + 0.25, { tint: 0xe8e2d6, solid: true })
  B.span(M.paint, -9, gy + 4.6, 38, 9, gy + 5.3, 50, { tint: 0xc0392b, solid: true })
  B.span(M.paint, -9.05, gy + 4.55, 37.95, 9.05, gy + 4.7, 50.05, { tint: 0xf2efe8 })
  for (const x of [-3, 3]) {
    B.span(M.concrete, x - 0.9, gy - 0.2, 42.5, x + 0.9, gy + 0.18, 45.5, { tint: 0xbdb7aa, solid: true })
    B.span(M.gloss, x - 0.4, gy + 0.18, 43.5, x + 0.4, gy + 1.7, 44.5, { tint: 0xf2c230, solid: true })
  }
  sign(B, 'FUEL', 0, gy + 4.95, 37.92, 4, 0.55, { bg: '#c0392b', fg: '#ffffff', border: '#ffffff', w: 256, h: 48, board: false }, Math.PI)
  car(B, 4.5, gy, 37, 0.15, 0x6b8f9a, 'pickup')
  ctx.loot({ x: 0, y: gy + 0.05, z: 47 })
  occupy(-9, 38, 9, 50)

  // Street dressing: a few parked wrecks and crates (cover along the main road).
  car(B, -36, g(-36, 7), 7, Math.PI / 2 + 0.1, 0x9a5b3a, 'sedan')
  car(B, 14, g(14, -7.5), -7.5, -Math.PI / 2 - 0.08, 0x5f7f6a, 'van')
  for (const [x, z] of [[-60, -8], [62, 8], [-12, 9], [30, -9]]) crate(B, x, g(x, z), z, 1.1, x * 0.3)
  B.build(ctx.root, true)
}

// --- Team camps ------------------------------------------------------------------------------------
export function camp(ctx, key) {
  const P = PLACES[key]
  const f = key === 'west' ? 1 : -1 // +1: the town lies to the east
  const team = key === 'west' ? [0x2f9bff, 0xffffff, 0x2f9bff] : [0xff8a1f, 0xffffff, 0xff8a1f]
  const B = new Batch(`ridgeCamp:${key}`)
  const g = ctx.ground
  const cx = P.x
  const cz = P.z
  const y = g(cx, cz)
  // apron
  slab(B, cx - 20, cz - 14, cx + 20, cz + 14, y + 0.1, 0.5, [], { mat: M.concrete, tint: 0xc9c2b4 })
  // vehicle bay: open toward the town, behind the spawn point
  const bx = cx - f * 13
  const x0 = bx - 4.5
  const x1 = bx + 4.5
  const sides = { n: [win(bx)], s: [win(bx)], e: f > 0 ? false : [], w: f > 0 ? [] : false }
  room(B, x0, cz - 8, x1, cz + 8, y + 0.1, 4.4, 0.3, sides, { mat: M.metal, tint: 0x8f9488 })
  flatRoof(B, x0 - 0.2, cz - 8.2, x1 + 0.2, cz + 8.2, y + 4.5, { tint: 0x7f857b, parapet: 0.3, parapetMat: M.metal, parapetTint: 0x8f9488, fascia: false })
  for (let k = -1; k <= 1; k += 2) B.span(M.paint, bx - 0.08, y + 0.11, cz + k * 2.6 - 0.06, bx + 0.08 + f * 4, y + 0.125, cz + k * 2.6 + 0.06, { tint: 0xf2c230 }) // bay lines
  sign(B, 'VEHICLE BAY', bx + f * 4.6, y + 3.9, cz, 4.2, 0.7, { bg: '#2c3138', fg: '#ffd27a', border: '#ffd27a', w: 512, h: 84, board: false }, f > 0 ? Math.PI / 2 : -Math.PI / 2)
  ctx.loot({ x: bx - f * 2.5, y: y + 0.12, z: cz - 5.5 })
  occupy(x0 - 1, cz - 9, x1 + 1, cz + 9)
  // containers on the flanks
  container(B, cx + f * 4, y + 0.1, cz - 11.5, 0, { len: 6.06, color: key === 'west' ? 0x2f6db5 : 0xd0623f })
  container(B, cx + f * 4, y + 0.1, cz + 11.5, 0, { len: 6.06, color: 0x6f7f5a })
  container(B, cx + f * 4, y + 2.7, cz + 11.5, 0.12, { len: 6.06, color: key === 'west' ? 0x2f6db5 : 0xd0623f })
  ctx.loot({ x: cx + f * 9, y: y + 0.12, z: cz + 9.5 })
  occupy(cx + f * 4 - 4, cz - 13, cx + f * 4 + 4, cz - 10)
  occupy(cx + f * 4 - 4, cz + 10, cx + f * 4 + 4, cz + 13)
  // sandbag lines at the front
  for (const [dz, len] of [[-6, 7], [5, 8]]) stoneWall(B, cx + f * 17, cz + dz, cx + f * 17, cz + dz + len, 1.0, y + 0.1, { tint: 0xd8c39a, cap: 0xc9b38a })
  pallet(B, cx + f * 15, y + 0.1, cz - 9, 0.3, 2, 3)
  crate(B, cx + f * 15.5, y + 0.1, cz + 1, 1.2, 0.4)
  crate(B, cx + f * 15.5, y + 1.3, cz + 1, 0.9, 0.9)
  ctx.loot({ x: cx + f * 14, y: y + 0.12, z: cz - 3 })
  // watchtower outside the fence, stairs leading away from it
  tower(ctx, B, cx - f * 10, cz - f * 18, 5, key === 'west' ? Math.PI : 0)
  // fences round the back
  chainFence(B, cx - f * 20, cz - 14, cx - f * 20, cz + 14, { y: y + 0.1 })
  chainFence(B, cx - f * 20, cz - 14, cx + f * 2, cz - 14, { y: y + 0.1 })
  chainFence(B, cx - f * 20, cz + 14, cx + f * 2, cz + 14, { y: y + 0.1 })
  flagPole(B, cx + f * 6, y + 0.1, cz - 4, team)
  sign(B, key === 'west' ? 'WEST CAMP' : 'EAST CAMP', cx + f * 20.5, y + 2.2, cz - 9, 3.6, 0.8, { bg: key === 'west' ? '#1d4f8f' : '#a24a10', fg: '#ffffff', border: '#ffffff', w: 512, h: 112 }, f > 0 ? Math.PI / 2 : -Math.PI / 2)
  B.span(M.paint, cx + f * 20.4 - 0.08, y, cz - 9 - 0.08, cx + f * 20.4 + 0.08, y + 1.8, cz - 9 + 0.08, { tint: 0x2c3138 })
  ctx.loot({ x: cx + f * 6, y: y + 0.12, z: cz + 5 })
  B.build(ctx.root, true)
}

// --- Red Quarry --------------------------------------------------------------------------------------
export function quarry(ctx) {
  const B = new Batch('ridgeQuarry')
  const g = ctx.ground
  const { x: cx, z: cz } = QUARRY
  // rock piles on the floor
  for (const [dx, dz, s] of [[-12, -8, 3.2], [-9, -12, 2.4], [10, -12, 2.8], [14, 4, 2.2], [-15, 8, 2.6], [4, -17, 2]]) ctx.nature.rock(cx + dx, cz + dz, s)
  // a conveyor: legs and a sloped belt up to the north rim
  const y0 = g(cx + 2, cz - 4)
  const yTop = g(cx + 2, cz - 30) + 2.5
  const L = Math.hypot(26, yTop - y0)
  const th = Math.atan2(yTop - y0, 26)
  B.box(M.metal, 2.2, 0.35, L, cx + 2, (y0 + yTop) / 2 + 0.8, cz - 17, { rx: th, tint: 0x6f7570, solid: true })
  B.box(M.rubber, 1.6, 0.06, L, cx + 2, (y0 + yTop) / 2 + 1.0, cz - 17, { rx: th, tint: 0x2a2a2a })
  for (let k = 0; k <= 4; k++) {
    const z = cz - 4 - k * 6.5
    const top = y0 + 0.8 + ((yTop - y0) * (k * 6.5)) / 26
    B.span(M.metal, cx + 0.6, g(cx + 1, z) - 0.4, z - 0.15, cx + 0.9, top, z + 0.15, { tint: 0xd8a22a, solid: true })
    B.span(M.metal, cx + 3.1, g(cx + 3, z) - 0.4, z - 0.15, cx + 3.4, top, z + 0.15, { tint: 0xd8a22a, solid: true })
  }
  ctx.loot({ x: cx + 5.5, y: y0 + 0.05, z: cz - 3 })
  // site office on the rim by the road
  const ox = cx - 24
  const oz = cz + 4
  adobe(ctx, B, ox, oz, 7, 5.5, { face: 'e', tint: 0xb7bfae, h: 2.9 })
  container(B, cx + 20, g(cx + 20, cz + 18), cz + 18, 0.9, { len: 6.06, color: 0x8a6a3a, open: true })
  ctx.loot({ x: cx + 20, y: g(cx + 20, cz + 18) + 0.1, z: cz + 18 })
  container(B, cx - 6, g(cx - 6, cz + 2), cz + 2, 0.3, { len: 12.19, color: 0x4d6f8f })
  for (const [dx, dz] of [[6, 6], [7.4, 6.6], [6.6, 7.8]]) crate(B, cx + dx, g(cx + dx, cz + dz), cz + dz, 1.15, dx)
  ctx.loot({ x: cx + 8, y: g(cx + 8, cz + 9) + 0.05, z: cz + 9 })
  ctx.loot({ x: cx - 13, y: g(cx - 13, cz - 2) + 0.05, z: cz - 2 })
  sign(B, 'RED QUARRY', cx - 14, g(cx - 14, cz + 26) + 2.2, cz + 26, 3.8, 0.8, { bg: '#7a2b1e', fg: '#ffe7b0', border: '#ffe7b0', w: 512, h: 104 }, 0.4)
  B.span(M.wood, cx - 14.1, g(cx - 14, cz + 26) - 0.3, cz + 25.9, cx - 13.9, g(cx - 14, cz + 26) + 1.8, cz + 26.1, { tint: TRIM })
  occupy(cx - 30, cz - 30, cx + 30, cz + 30)
  B.build(ctx.root, true)
}

// --- Radio Mesa -------------------------------------------------------------------------------------
export function mesa(ctx) {
  const B = new Batch('ridgeMesa')
  const g = ctx.ground
  const { x: cx, z: cz } = MESA
  const y = g(cx, cz)
  // lattice mast
  const S = 1.6
  const H = 26
  for (const [x, z] of [[-S, -S], [S, -S], [-S, S], [S, S]]) B.span(M.metal, cx + x - 0.12, y - 0.3, cz + z - 0.12, cx + x + 0.12, y + H, cz + z + 0.12, { tint: 0xc9cdd1, solid: true })
  for (let k = 1; k < 9; k++) {
    const yy = y + k * 3
    const s = S + 0.12
    B.span(M.metal, cx - s, yy - 0.06, cz - s, cx + s, yy + 0.06, cz - s + 0.1, { tint: k % 2 ? 0xd23b3b : 0xf2efe8 })
    B.span(M.metal, cx - s, yy - 0.06, cz + s - 0.1, cx + s, yy + 0.06, cz + s, { tint: k % 2 ? 0xd23b3b : 0xf2efe8 })
    B.span(M.metal, cx - s, yy - 0.06, cz - s, cx - s + 0.1, yy + 0.06, cz + s, { tint: k % 2 ? 0xd23b3b : 0xf2efe8 })
    B.span(M.metal, cx + s - 0.1, yy - 0.06, cz - s, cx + s, yy + 0.06, cz + s, { tint: k % 2 ? 0xd23b3b : 0xf2efe8 })
  }
  B.cyl(M.metal, 0.08, 0.08, 6, cx, y + H + 3, cz, { tint: 0xdddddd, seg: 6 })
  B.cyl(M.gloss, 0.9, 0.9, 0.25, cx + S + 0.4, y + H - 4, cz, { rz: Math.PI / 2, tint: 0xf2efe8, seg: 16 })
  ctx.loot({ x: cx, y: y + 0.05, z: cz })
  // bunker
  adobe(ctx, B, cx + 12, cz - 8, 8, 6, { face: 'e', tint: 0xa9a49a, h: 2.7 })
  // sandbag ring and crates on the top
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.3
    const r = 19
    const a2 = a + 0.55
    stoneWall(B, cx + Math.cos(a) * r, cz + Math.sin(a) * r, cx + Math.cos(a2) * r, cz + Math.sin(a2) * r, 1.0, g(cx + Math.cos(a) * r, cz + Math.sin(a) * r), { tint: 0xd8c39a, cap: 0xc9b38a })
  }
  for (const [dx, dz] of [[-10, 6], [-12, -6], [4, 12]]) {
    crate(B, cx + dx, g(cx + dx, cz + dz), cz + dz, 1.2, dx * 0.2)
    ctx.loot({ x: cx + dx + 1.6, y: g(cx + dx + 1.6, cz + dz) + 0.05, z: cz + dz })
  }
  occupy(cx - 22, cz - 22, cx + 22, cz + 22)
  B.build(ctx.root, true)
}

// --- Fuel Depot ------------------------------------------------------------------------------------
export function depot(ctx) {
  const B = new Batch('ridgeDepot')
  const g = ctx.ground
  const { x: cx, z: cz } = PLACES.depot
  const y = g(cx, cz)
  slab(B, cx - 24, cz - 20, cx + 24, cz + 20, y + 0.08, 0.4, [], { mat: M.concrete, tint: 0xbab3a6 })
  // tanks along the back (south)
  for (const dx of [-14, 0, 14]) {
    B.cyl(M.metal, 4.6, 4.6, 7, cx + dx, y + 3.6, cz + 12, { tint: 0xe9e4d8, seg: 24, solid: true })
    B.cyl(M.metal, 4.7, 4.7, 0.3, cx + dx, y + 7.2, cz + 12, { tint: 0xc0392b, seg: 24 })
    B.cyl(M.metal, 4.7, 4.7, 0.25, cx + dx, y + 0.35, cz + 12, { tint: 0x8d8f86, seg: 24 })
    occupy(cx + dx - 5, cz + 7, cx + dx + 5, cz + 17)
  }
  // pipe rack in front of the tanks
  B.span(M.metal, cx - 20, y + 2.4, cz + 5.6, cx + 20, y + 2.65, cz + 6.4, { tint: 0x8d8f86 })
  for (const dx of [-20, -10, 0, 10, 20]) B.span(M.metal, cx + dx - 0.15, y, cz + 5.85, cx + dx + 0.15, y + 2.4, cz + 6.15, { tint: 0x6f7570, solid: true })
  for (const off of [-0.25, 0.25]) B.cyl(M.metal, 0.22, 0.22, 40, cx, y + 2.9, cz + 6 + off, { rz: Math.PI / 2, tint: off < 0 ? 0xd8a22a : 0x3f7a3f, seg: 10 })
  ctx.loot({ x: cx - 7, y: y + 0.1, z: cz + 4 })
  // open warehouse (north-west)
  const wx = cx - 12
  const wz = cz - 10
  room(B, wx - 8, wz - 6, wx + 8, wz + 6, y + 0.08, 5, 0.3, { n: [win(wx - 4), win(wx + 4)], s: [gap(wx, 5, 4.2)], e: [gap(wz, 4, 3.2)], w: [win(wz)] }, { mat: M.metal, tint: 0xa79f8a })
  flatRoof(B, wx - 8.2, wz - 6.2, wx + 8.2, wz + 6.2, y + 5.1, { tint: 0x8f8a7c, parapet: 0.3, parapetMat: M.metal, parapetTint: 0xa79f8a, fascia: false })
  for (const [dx, dz] of [[-5, -3], [-5, -1.6], [4, -3.5]]) pallet(B, wx + dx, y + 0.1, wz + dz, 0, 3, Math.abs(dx * 7 + dz))
  ctx.loot({ x: wx + 3, y: y + 0.1, z: wz + 1 })
  ctx.loot({ x: wx - 4, y: y + 0.1, z: wz + 2.5 })
  occupy(wx - 9, wz - 7, wx + 9, wz + 7)
  // containers and barrels (north-east)
  container(B, cx + 12, y + 0.08, cz - 12, 0, { len: 12.19, color: 0x2f6db5 })
  container(B, cx + 12, y + 0.08, cz - 7.5, 0, { len: 6.06, color: 0xc0392b, open: true })
  container(B, cx + 12, y + 2.68, cz - 12, 0.05, { len: 6.06, color: 0xd8a22a })
  ctx.loot({ x: cx + 12, y: y + 0.1, z: cz - 7.5 })
  for (let k = 0; k < 6; k++) barrel(B, cx + 2 + (k % 3) * 0.85, y + 0.08, cz - 3 + Math.floor(k / 3) * 0.85, [0xc0392b, 0xd8a22a, 0x2f6db5][k % 3])
  ctx.loot({ x: cx + 5, y: y + 0.1, z: cz - 1 })
  occupy(cx + 5, cz - 14, cx + 19, cz - 5)
  chainFence(B, cx - 24, cz + 20, cx + 24, cz + 20, { y: y + 0.08 })
  chainFence(B, cx + 24, cz - 20, cx + 24, cz + 20, { y: y + 0.08 })
  sign(B, 'FUEL DEPOT', cx - 24.3, y + 2.4, cz + 8, 3.8, 0.8, { bg: '#2c3138', fg: '#ffd27a', border: '#ffd27a', w: 512, h: 104 }, -Math.PI / 2)
  B.build(ctx.root, true)
}

// --- Windmill Flats ------------------------------------------------------------------------------------
export function mills(ctx) {
  const B = new Batch('ridgeMills')
  const g = ctx.ground
  const { x: cx, z: cz } = PLACES.mills
  const spots = [[-16, -10], [12, -16], [18, 10], [-6, 18]]
  spots.forEach(([dx, dz], i) => {
    const x = cx + dx
    const z = cz + dz
    const y = g(x, z)
    B.cyl(M.metal, 0.22, 0.4, 13, x, y + 6.5, z, { tint: 0xe9e4d8, seg: 10, solid: true })
    B.box(M.metal, 0.9, 0.9, 1.8, x, y + 13.2, z, { tint: 0xd8d2c4 })
    occupy(x - 1.5, z - 1.5, x + 1.5, z + 1.5)
    // the rotor turns: its own little batch, spun by an anim callback
    const R = new Batch(`ridgeRotor${i}`)
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2
      R.box(M.paint, 0.5, 5.6, 0.08, Math.sin(a) * 2.9, Math.cos(a) * 2.9, 0, { rz: -a, tint: 0xf2efe8 })
    }
    R.cyl(M.metal, 0.3, 0.3, 0.4, 0, 0, 0, { rx: Math.PI / 2, tint: 0xc0392b, seg: 10 })
    const rotor = R.build(ctx.root, true)
    rotor.position.set(x, y + 13.2, z + 1)
    const speed = 0.9 + i * 0.17
    ctx.anim((dt) => {
      rotor.rotation.z += dt * speed
    })
  })
  // farmhouse
  const fx = cx + 2
  const fz = cz - 2
  const y = adobe(ctx, B, fx, fz, 10, 8, { face: 's', tint: 0xe7dcc4, h: 3, lootIn: true })
  gableRoof(B, fx - 5.2, fz - 4.2, fx + 5.2, fz + 4.2, y + 4.1, 2.2, { tint: 0x8a4a2a })
  for (const [dx, dz, r] of [[-14, 4, false], [-12.6, 4.2, false], [-13.4, 5.6, true], [10, -4, true], [8, 22, false]]) hayBale(B, cx + dx, g(cx + dx, cz + dz), cz + dz, dx, r)
  ctx.loot({ x: cx - 12, y: g(cx - 12, cz + 6) + 0.05, z: cz + 6 })
  ctx.loot({ x: cx + 9, y: g(cx + 9, cz - 6) + 0.05, z: cz - 6 })
  ctx.loot({ x: cx + 17, y: g(cx + 17, cz + 13) + 0.05, z: cz + 13 })
  for (const [ax, az, bx, bz] of [[-26, -24, 4, -26], [-26, -24, -28, 6], [22, 22, 4, 26]]) {
    const L = Math.hypot(bx - ax, bz - az)
    const n = Math.round(L / 2.4)
    for (let k = 0; k <= n; k++) {
      const x = cx + ax + ((bx - ax) * k) / n
      const z = cz + az + ((bz - az) * k) / n
      B.span(M.wood, x - 0.08, g(x, z) - 0.3, z - 0.08, x + 0.08, g(x, z) + 1.2, z + 0.08, { tint: 0x8a6040 })
    }
  }
  B.build(ctx.root, true)
}

// --- Roadside cover + the wild: rocks, scrub, palms by the beach, wrecks and crates by the roads ---------
export function roadside(ctx) {
  const B = new Batch('ridgeRoadside')
  const g = ctx.ground
  const rand = ctx.rand
  const wrecks = [0x9a5b3a, 0x6b8f9a, 0x7a7a6a, 0xa8743a, 0x5f6f4a, 0x8a3a2a]
  let w = 0
  let lootN = 0
  // Walk each road and drop a cover cluster every ~45 m beside it.
  for (const r of ROADS) {
    if (r.id === 'ring') continue
    let carry = 20
    for (let i = 1; i < r.pts.length; i++) {
      const [ax, az] = r.pts[i - 1]
      const [bx, bz] = r.pts[i]
      const L = Math.hypot(bx - ax, bz - az)
      let t = carry
      while (t < L) {
        const x0 = ax + ((bx - ax) * t) / L
        const z0 = az + ((bz - az) * t) / L
        const side = rand() < 0.5 ? -1 : 1
        const nx = (-(bz - az) / L) * side
        const nz = ((bx - ax) / L) * side
        const off = r.half + 4 + rand() * 4
        const x = x0 + nx * off
        const z = z0 + nz * off
        if (inlandOf(x, z) > BEACH + 10 && isFree(x, z, 4) && Math.hypot(x, z) > 72) {
          const yaw = Math.atan2(bx - ax, bz - az) + (rand() - 0.5) * 0.8
          const kind = rand()
          const y = g(x, z)
          if (kind < 0.4) {
            car(B, x, y - 0.05, z, yaw, wrecks[w++ % wrecks.length], ['sedan', 'pickup', 'van', 'suv'][Math.floor(rand() * 4)])
          } else if (kind < 0.7) {
            ctx.nature.rock(x, z, 1.8 + rand() * 1.4)
            ctx.nature.rock(x + 2.2, z + 1.2, 1 + rand() * 0.8)
          } else {
            crate(B, x, y, z, 1.2, yaw)
            crate(B, x + 1.3, y, z + 0.3, 1.0, yaw + 0.4)
            crate(B, x + 0.6, g(x, z) + 1.2, z + 0.1, 0.9, yaw + 0.2)
          }
          if (lootN++ % 2 === 0) ctx.loot({ x: x - nx * 2.2, y: g(x - nx * 2.2, z - nz * 2.2) + 0.05, z: z - nz * 2.2 })
          occupy(x - 3, z - 3, x + 3, z + 3)
        }
        t += 40 + rand() * 14
      }
      carry = t - L
    }
  }
  B.build(ctx.root, true)

  // The wild: a jittered grid over the island.
  const N = ctx.nature
  const step = 9
  for (let gz = -270; gz <= 270; gz += step) {
    for (let gx = -270; gx <= 270; gx += step) {
      const x = gx + (rand() - 0.5) * step
      const z = gz + (rand() - 0.5) * step
      const d = inlandOf(x, z)
      if (d < 2) continue
      const p = rand()
      if (d < BEACH + 16) {
        // palms and beach scrub
        if (p < 0.05 && isFree(x, z, 2)) N.palm(x, z, 0.9 + rand() * 0.4)
        else if (p < 0.1 && isFree(x, z, 1)) N.tuft(x, z, 0.8 + rand() * 0.5)
        continue
      }
      if (!isFree(x, z, 2.5) || polyDist(CREEK.pts, x, z) < CREEK.half) continue
      if (p < 0.035) N.rock(x, z, 0.8 + rand() * 2.2)
      else if (p < 0.075) N.bush(x, z, 0.6 + rand() * 0.6)
      else if (p < 0.087) N.cypress(x, z, 0.8 + rand() * 0.4)
      else if (p < 0.105) N.tree(x, z, { s: 0.7 + rand() * 0.3, c: [0x7f8f3a, 0x8f8a3a, 0x6f7f34][Math.floor(rand() * 3)] })
      else if (p < 0.2 && roadDist(x, z) > 3) N.tuft(x, z, 0.7 + rand() * 0.6)
    }
  }
  // boulders strewn along the ridges and the mesa skirt
  for (let k = 0; k < 70; k++) {
    const a = rand() * Math.PI * 2
    const r = MESA.r + 6 + rand() * 30
    const x = MESA.x + Math.cos(a) * r
    const z = MESA.z + Math.sin(a) * r
    if (isFree(x, z, 2) && inlandOf(x, z) > BEACH + 8) N.rock(x, z, 1 + rand() * 2.4)
  }
}
