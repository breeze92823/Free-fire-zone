// Dustline Ridge: the plan of the big arid island (about 520 m across, ~4x Coral Key's area) made
// for driving. Pure maths, no three.js: outline, places, dirt roads, flat pads, the height field and
// the texture weights, shared by the terrain, the places and the scatter.
// Axes as on Coral Key: +X east, -Z north, +Y up, metres; the island is centred on the origin and is
// built at the same coordinates (only one world is active at a time: see src/world/worlds.js).
//
// Shape: a sand beach, a bluff up to the inland plateau (PLATEAU m), rolling dunes, a few long rock
// ridges (roads cut passes through them), Radio Mesa (a raised table with one long ramp side), Red
// Quarry (a pit with a ramp), Dry Creek (a canyon in the south-east, forded where a road crosses it).

const TAU = Math.PI * 2
export const smooth = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}
export const lerp = (a, b, t) => a + (b - a) * t
export function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax
  const dz = bz - az
  const l2 = dx * dx + dz * dz || 1
  let t = ((px - ax) * dx + (pz - az) * dz) / l2
  t = t < 0 ? 0 : t > 1 ? 1 : t
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t))
}
export function polyDist(pts, x, z) {
  let best = 1e9
  for (let i = 1; i < pts.length; i++) best = Math.min(best, segDist(x, z, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]))
  return best
}

// --- Grid, outline ------------------------------------------------------------------------
export const EXTENT = 300 // the terrain grid covers -EXTENT..EXTENT
export const CELL = 2.5 // m per terrain cell (Coral Key: 2)
export const BOUNDS = { minX: -285, maxX: 285, minZ: -285, maxZ: 285 } // map picture + nav grid
export const RADIUS = 250 // the zone's land radius (config.js WORLDS.ridge.radius, backend rules.ts)

// Waterline radius every 30 deg from east (a = atan2(z, x)), Catmull-Rom + harmonics as on Coral Key.
const CTRL = [262, 254, 247, 258, 268, 262, 251, 245, 256, 266, 261, 255]
function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t
  const t3 = t2 * t
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
}
export function shoreR(a) {
  const u = (((a % TAU) + TAU) % TAU) / (TAU / 12)
  const i = Math.floor(u)
  const n = CTRL.length
  const r = catmull(CTRL[(i - 1 + n) % n], CTRL[i % n], CTRL[(i + 1) % n], CTRL[(i + 2) % n], u - i)
  return r + 3 * Math.sin(5 * a + 0.8) + 1.6 * Math.sin(9 * a + 2.1) + 0.9 * Math.sin(15 * a + 0.5)
}
export const BEACH = 14 // m of sand inland of the waterline
export const BLUFF = 34 // m over which the land then rises to the plateau
export const PLATEAU = 4.5 // m: the inland ground level (high enough for the quarry and creek floors to stay dry)
export const inlandOf = (x, z) => shoreR(Math.atan2(z, x)) - Math.hypot(x, z)

// --- Places ------------------------------------------------------------------------------------
export const PLACES = {
  town: { name: 'Dustline Town', x: 0, z: 0 },
  west: { name: 'West Camp', x: -165, z: 15 },
  east: { name: 'East Camp', x: 165, z: -15 },
  quarry: { name: 'Red Quarry', x: 34, z: -158 },
  mesa: { name: 'Radio Mesa', x: -46, z: 158 },
  depot: { name: 'Fuel Depot', x: 138, z: 128 },
  mills: { name: 'Windmill Flats', x: -140, z: -128 },
  creek: { name: 'Dry Creek', x: 168, z: 74 },
}
// Team start areas: the camps (blue west, orange east), about 330 m apart.
export const SPAWNS = { blue: { x: -168, z: 15, r: 14 }, orange: { x: 168, z: -15, r: 14 } }

// --- Roads (dirt tracks painted into the terrain; the land is levelled along them) ---------------
function circlePts(r, n, cx = 0, cz = 0) {
  const p = []
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU
    p.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r])
  }
  return p
}
export const TOWN_RING = 92
export const OUTER_LOOP = 196
export const ROADS = [
  // The main road, camp to camp through the town.
  { id: 'main', half: 5, pts: [[-146, 14], [-120, 10], [-70, 4], [0, 0], [70, -4], [120, -10], [146, -14]] },
  { id: 'ring', half: 4, ring: TOWN_RING, pts: circlePts(TOWN_RING, 96) },
  { id: 'loop', half: 4, ring: OUTER_LOOP, pts: circlePts(OUTER_LOOP, 160) },
  { id: 'quarry', half: 3.5, pts: [[8, -91.6], [20, -122], [30, -140]] },
  { id: 'mesa', half: 3.5, pts: [[-12, 91.2], [0, 125], [-2, 150], [-20, 166]] },
  { id: 'depot', half: 3.5, pts: [[65, 65], [96, 96], [124, 118]] },
  { id: 'mills', half: 3.5, pts: [[-65, -65], [-98, -98], [-126, -118]] },
  { id: 'westN', half: 3.5, pts: [[-146, 6], [-160, -40], [-158, -88], [-140, -110]] },
  { id: 'eastS', half: 3.5, pts: [[146, -6], [160, 40], [158, 96], [146, 114]] },
]
// Distance from (x, z) to the nearest road centreline minus its half-width (negative = on it).
export function roadDist(x, z) {
  let best = 1e9
  const r0 = Math.hypot(x, z)
  for (const r of ROADS) {
    const d = r.ring ? Math.abs(r0 - r.ring) : polyDist(r.pts, x, z)
    best = Math.min(best, d - r.half)
  }
  return best
}

// --- Flat pads (no dunes or ridges): [x0, z0, x1, z1, margin] and circles [x, z, r, margin] ------
export const FLAT_RECTS = [
  [-192, -8, -138, 38, 10], // West Camp
  [138, -38, 192, 8, 10], // East Camp
  [112, 104, 166, 152, 10], // Fuel Depot
]
export const FLAT_CIRCLES = [
  [0, 0, 64, 14], // Dustline Town
  [-140, -128, 30, 12], // Windmill Flats
  [34, -158, 34, 10], // Red Quarry (a level floor, dug below)
  [-46, 158, 32, 10], // Radio Mesa (a level top, raised above)
]
function rectMask(x, z, [x0, z0, x1, z1, m]) {
  const dx = Math.max(x0 - x, 0, x - x1)
  const dz = Math.max(z0 - z, 0, z - z1)
  return 1 - smooth(0, m, Math.hypot(dx, dz))
}
export function padMask(x, z) {
  let f = 0
  for (const r of FLAT_RECTS) f = Math.max(f, rectMask(x, z, r))
  for (const [cx, cz, r, m] of FLAT_CIRCLES) f = Math.max(f, 1 - smooth(r, r + m, Math.hypot(x - cx, z - cz)))
  return f
}
// Inside a pad (0..1) or on a road (levelled 6..18 m out from its edge).
export function flatMask(x, z) {
  return Math.max(padMask(x, z), 1 - smooth(4, 16, roadDist(x, z)))
}

// --- Height --------------------------------------------------------------------------------------
// Long rock ridges: [ax, az, bx, bz, height, sigma]. Roads cut passes through them (flatMask).
// Sigmas keep the steepest flank near 20-23 deg, which the vehicles climb (config.js VEHICLES).
const RIDGES = [
  [62, -64, 128, -112, 11, 17],
  [-74, 70, -134, 104, 10, 16],
  [-62, -178, -4, -206, 8, 14],
  [118, 34, 176, 58, 6, 12],
  [-212, 70, -196, 128, 7, 14],
  [210, -96, 160, -150, 8, 15],
]
// Radio Mesa: a table MESA.h above the plateau; steep sides except a long slope toward `rampA`.
export const MESA = { x: -46, z: 158, r: 30, h: 11, steep: 6, gentle: 46, rampA: Math.atan2(-0.35, 1) } // ramp faces east-north-east
// Red Quarry: a pit QUARRY.depth below the plateau with one ramp toward the road (south-west).
export const QUARRY = { x: 34, z: -158, r: 30, edge: 7, depth: 3.9, rampA: Math.atan2(1, -0.55), ramp: 26 }
// Dry Creek: a canyon CREEK.depth deep, forded where a road crosses it.
export const CREEK = { pts: [[262, 46], [228, 58], [196, 74], [164, 76], [130, 58], [104, 30], [96, 4]], half: 6, edge: 7, depth: 3.8 }

const gaussSeg = (x, z, [ax, az, bx, bz, h, s]) => {
  const d = segDist(x, z, ax, az, bx, bz)
  return h * Math.exp(-(d * d) / (2 * s * s))
}
function dunes(x, z) {
  return (
    1.2 * Math.sin(x * 0.031 + 0.4) * Math.sin(z * 0.027 + 1.7) +
    0.8 * Math.sin(x * 0.058 - z * 0.041 + 2.2) +
    0.45 * Math.sin(z * 0.093 + x * 0.021 + 0.9) +
    0.25 * Math.sin(x * 0.17 + z * 0.13)
  )
}
function angDiff(a, b) {
  let d = Math.abs(a - b) % TAU
  return d > Math.PI ? TAU - d : d
}
function mesaHeight(x, z) {
  const dx = x - MESA.x
  const dz = z - MESA.z
  const d = Math.hypot(dx, dz)
  const k = Math.max(0, Math.cos(angDiff(Math.atan2(dz, dx), MESA.rampA))) ** 6 // 1 facing the ramp
  const edge = lerp(MESA.steep, MESA.gentle, k)
  return MESA.h * (1 - smooth(MESA.r, MESA.r + edge, d))
}
function quarryCut(x, z) {
  const dx = x - QUARRY.x
  const dz = z - QUARRY.z
  const d = Math.hypot(dx, dz)
  const k = Math.max(0, Math.cos(angDiff(Math.atan2(dz, dx), QUARRY.rampA))) ** 8
  const edge = lerp(QUARRY.edge, QUARRY.ramp, k)
  return QUARRY.depth * (1 - smooth(QUARRY.r - 2, QUARRY.r - 2 + edge, d))
}
function creekCut(x, z) {
  const d = polyDist(CREEK.pts, x, z)
  const cut = CREEK.depth * (1 - smooth(CREEK.half, CREEK.half + CREEK.edge, d))
  // Fords: the floor comes up to road level where a road crosses; it stays dry: the canyon fades
  // out before the coastal bluff instead of letting the sea in.
  return cut * smooth(2, 14, roadDist(x, z)) * smooth(BEACH + 14, BEACH + 40, inlandOf(x, z))
}

// Terrain height (the exact surface the grid is sampled from).
export function terrainHeight(x, z) {
  const d = inlandOf(x, z)
  let base
  if (d < 0) base = Math.max(-5, -0.6 + d * 0.18)
  else if (d < BEACH) base = -0.6 + 1.1 * smooth(0, 1, d / BEACH)
  else base = 0.5 + (PLATEAU - 0.5) * smooth(BEACH, BEACH + BLUFF, d)
  const inland = smooth(BEACH, BEACH + BLUFF, d)
  if (inland <= 0) return base
  // The creek corridor is level too (its floor must stay above the sea).
  const creekFlat = 1 - smooth(CREEK.half + CREEK.edge, CREEK.half + CREEK.edge + 12, polyDist(CREEK.pts, x, z))
  const flat = Math.max(flatMask(x, z), creekFlat)
  const pad = padMask(x, z)
  let ridge = 0
  for (const r of RIDGES) ridge = Math.max(ridge, gaussSeg(x, z, r))
  let h = base + (dunes(x, z) * (1 - flat) + ridge * (1 - flat * 0.85) * (1 - pad)) * inland
  h += mesaHeight(x, z) * inland
  h -= quarryCut(x, z) + creekCut(x, z)
  return h
}

// --- Paint -----------------------------------------------------------------------------------------
export function noise2(x, z) {
  return 0.5 + 0.25 * Math.sin(x * 0.045 + 0.7) * Math.cos(z * 0.052 + 1.1) + 0.15 * Math.sin(x * 0.11 - z * 0.08 + 0.3) + 0.1 * Math.sin(z * 0.17 + x * 0.02)
}
// Texture weights [dry grass, sand, rock, dirt] (normalised) for a point with the given slope.
export function paintWeights(x, z, slope) {
  const d = inlandOf(x, z)
  let sand = 1 - smooth(BEACH - 2, BEACH + 6, d)
  sand = Math.max(sand, smooth(0.52, 0.72, noise2(x * 0.7 + 31, z * 0.7 - 12)) * 0.9) // open dune sand; the rest is dry grass
  let rock = smooth(0.42, 0.8, slope)
  // the mesa top, the quarry floor and the creek bed read as rock / gravel
  if (Math.hypot(x - QUARRY.x, z - QUARRY.z) < QUARRY.r) rock = Math.max(rock, 0.55)
  if (polyDist(CREEK.pts, x, z) < CREEK.half + 2) rock = Math.max(rock, 0.45)
  rock = Math.min(1, rock)
  sand *= 1 - rock
  const road = 1 - smooth(-1.2, 1.2, roadDist(x, z))
  let dirt = Math.max(road, padMask(x, z) * 0.55) * (1 - rock * 0.6)
  dirt = Math.min(1, dirt)
  sand *= 1 - dirt
  const grass = Math.max(0, 1 - sand - rock - dirt)
  const s = grass + sand + rock + dirt || 1
  return [grass / s, sand / s, rock / s, dirt / s]
}

// --- Occupancy (scatter keeps clear of buildings) ---------------------------------------------------
const taken = [] // [x0, z0, x1, z1]
export function occupy(x0, z0, x1, z1) {
  taken.push([Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1)])
}
export function resetOccupancy() {
  taken.length = 0
}
export function isFree(x, z, r = 0) {
  for (const [x0, z0, x1, z1] of taken) if (x > x0 - r && x < x1 + r && z > z0 - r && z < z1 + r) return false
  if (roadDist(x, z) < r + 1.5) return false
  for (const s of Object.values(SPAWNS)) if (Math.hypot(x - s.x, z - s.z) < s.r + r) return false
  return true
}
