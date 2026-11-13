// The island plan: outline, district anchors, road network, flat zones and the
// "occupied" registry scatter code checks before placing a tree or rock.
// Pure maths (no three.js), so terrain, roads, districts and nature share it.
// Axes: +X east, -Z north, +Y up, metres; island centred on the origin.

const TAU = Math.PI * 2
export const smooth = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}
export const lerp = (a, b, t) => a + (b - a) * t

// --- Outline -----------------------------------------------------------------------
// Waterline radius by angle a = atan2(z, x) (0 = east, +90deg = south, -90deg = north):
// a periodic Catmull-Rom through hand-picked radii + small harmonics.
const CTRL = [127, 124, 128, 132, 129, 126, 121.5, 125, 128, 126.5, 127, 124] // every 30deg from east
function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t
  const t3 = t2 * t
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
}
export function shoreR(a) {
  let u = (((a % TAU) + TAU) % TAU) / (TAU / 12)
  const i = Math.floor(u)
  const t = u - i
  const n = CTRL.length
  const r = catmull(CTRL[(i - 1 + n) % n], CTRL[i % n], CTRL[(i + 1) % n], CTRL[(i + 2) % n], t)
  return r + 1.4 * Math.sin(7 * a + 0.4) + 0.8 * Math.sin(11 * a + 1.7) + 0.5 * Math.sin(17 * a + 2.9)
}
// Beach width: 11 m in the north growing to 18 m in the south.
export const beachW = (a) => 11 + 7 * Math.max(0, Math.sin(a)) ** 2

// NE cliffs: angular mask centred at -42deg.
const CLIFF_A = (-42 * Math.PI) / 180
const CLIFF_HALF = (18 * Math.PI) / 180
export function cliffMask(a) {
  let d = Math.abs(a - CLIFF_A)
  if (d > Math.PI) d = TAU - d
  return smooth(0, 1, 1 - d / CLIFF_HALF)
}

// --- Districts -----------------------------------------------------------------------
export const RING = { r: 48, half: 4.5, walk: 2.6 } // ring road centreline radius, half-width, sidewalk width
export const SPAWNS = { blue: { x: -70, z: 70, r: 15 }, orange: { x: 70, z: -70, r: 15 } }

export const DOCK = { x0: -120, x1: -76, z0: -42, z1: 14, pier: { z0: -12, z1: -6, x1: -146 } }

export const DISTRICTS = {
  villa: { name: 'The Villa', x: 0, z: 0 },
  maple: { name: 'Maple Row', x: 84, z: 0 },
  plaza: { name: 'Fountain Plaza', x: 41, z: -76 },
  relay: { name: 'Relay Station', x: -10, z: -92 },
  dock: { name: 'Dockyard', x: -98, z: -14 },
  beach: { name: 'Sunset Beach', x: 0, z: 112 },
  farm: { name: 'Old Farm', x: -66, z: 34 },
  lookout: { name: 'Lookout', x: -62, z: -72 },
}

// --- Roads ---------------------------------------------------------------------------
// { pts: [[x, z], ...], half: half-width, kind: 'asphalt' | 'dirt', walk: sidewalk width (0 = none), closed }
function circlePts(r, n, cx = 0, cz = 0) {
  const p = []
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU
    p.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r])
  }
  return p
}
export const ROADS = [
  { id: 'ring', pts: circlePts(RING.r, 160), half: RING.half, kind: 'asphalt', walk: RING.walk, closed: true },
  { id: 'north', pts: [[0, -RING.r], [0, -77]], half: 4, kind: 'asphalt', walk: 2.4 },
  { id: 'east', pts: [[RING.r, 0], [100, 0]], half: 4, kind: 'asphalt', walk: 2.4 },
  { id: 'west', pts: [[-RING.r, 0], [-77, 0]], half: 4, kind: 'asphalt', walk: 2.4 },
  { id: 'south', pts: [[0, RING.r], [0, 84]], half: 4, kind: 'asphalt', walk: 2.4 },
  { id: 'plazaLink', pts: [[0, -66], [25, -66]], half: 3.5, kind: 'asphalt', walk: 2 },
  { id: 'farmTrack', pts: [[-36.4, 31.3], [-46, 31]], half: 2.6, kind: 'dirt', walk: 0 },
]
// The cul-de-sac at the end of Maple Row and the beach car park are drawn as pads.
export const PADS = [
  { x: 107, z: 0, r: 8, kind: 'asphalt' },
  { rect: [-18, 84, 18, 100], kind: 'asphalt' }, // beach car park
]

function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax
  const dz = bz - az
  const l2 = dx * dx + dz * dz || 1
  let t = ((px - ax) * dx + (pz - az) * dz) / l2
  t = t < 0 ? 0 : t > 1 ? 1 : t
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t))
}
// Signed distance from a point to the nearest road edge (negative = on the road).
// `withWalk` includes sidewalks.
export function roadDist(x, z, withWalk = true) {
  let best = 1e9
  for (const r of ROADS) {
    const w = r.half + (withWalk ? r.walk : 0)
    if (r.id === 'ring') {
      best = Math.min(best, Math.abs(Math.hypot(x, z) - RING.r) - w)
      continue
    }
    for (let i = 1; i < r.pts.length; i++) {
      const [ax, az] = r.pts[i - 1]
      const [bx, bz] = r.pts[i]
      best = Math.min(best, segDist(x, z, ax, az, bx, bz) - w)
    }
  }
  for (const p of PADS) {
    if (p.r) best = Math.min(best, Math.hypot(x - p.x, z - p.z) - p.r)
    else {
      const [x0, z0, x1, z1] = p.rect
      const dx = Math.max(x0 - x, 0, x - x1)
      const dz = Math.max(z0 - z, 0, z - z1)
      best = Math.min(best, Math.hypot(dx, dz) - (dx === 0 && dz === 0 ? 1 : 0))
    }
  }
  return best
}

// --- Flat zones (no hills/undulation) -------------------------------------------------
// rects [x0, z0, x1, z1, margin] and circles [x, z, r, margin]
export const FLAT_RECTS = [
  [50, -40, 116, 40, 6], // Maple Row
  [22, -104, 60, -58, 6], // Fountain Plaza
  [-46, -106, 24, -74, 6], // Relay Station
  [-122, -44, -74, 16, 5], // Dockyard
  [-102, 12, -34, 60, 6], // Old Farm
  [-20, 80, 20, 104, 6], // beach car park
]
export const FLAT_CIRCLES = [[0, 0, 58, 8]]

function rectMask(x, z, [x0, z0, x1, z1, m]) {
  const dx = Math.max(x0 - x, 0, x - x1)
  const dz = Math.max(z0 - z, 0, z - z1)
  return 1 - smooth(0, m, Math.hypot(dx, dz))
}
export function flatMask(x, z) {
  let f = 0
  for (const r of FLAT_RECTS) f = Math.max(f, rectMask(x, z, r))
  for (const [cx, cz, r, m] of FLAT_CIRCLES) f = Math.max(f, 1 - smooth(r, r + m, Math.hypot(x - cx, z - cz)))
  const rd = roadDist(x, z, true)
  f = Math.max(f, 1 - smooth(2, 8, rd))
  return f
}

// --- Dirt (terrain paint only) --------------------------------------------------------
export const DIRT_PATHS = [
  { pts: [[-33, -34], [-42, -46], [-50, -56], [-56, -64], [-60, -69]], half: 1.6 }, // up to the Lookout
  { pts: [[-46, 31], [-54, 30]], half: 3.2 }, // farmyard in front of the barn
  { pts: [[-12, 60], [-30, 64], [-48, 66], [-64, 68]], half: 1.3 }, // footpath to the blue fields
  { pts: [[30, -52], [44, -58], [58, -64], [68, -68]], half: 1.3 }, // footpath to the orange fields
]
export const DIRT_RECTS = [
  [-98, 18, -74, 46, 3], // crop field
  [-58, 18, -34, 46, 4], // farmyard
]
export function dirtMask(x, z) {
  let f = 0
  for (const p of DIRT_PATHS) {
    for (let i = 1; i < p.pts.length; i++) {
      const [ax, az] = p.pts[i - 1]
      const [bx, bz] = p.pts[i]
      f = Math.max(f, 1 - smooth(p.half * 0.6, p.half + 1.2, segDist(x, z, ax, az, bx, bz)))
    }
  }
  for (const r of DIRT_RECTS) f = Math.max(f, rectMask(x, z, r) * 0.9)
  return f
}

// --- Height ---------------------------------------------------------------------------
const gauss = (x, z, cx, cz, s) => Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (2 * s * s))
function hills(x, z) {
  let h = 7 * gauss(x, z, -62, -72, 15) + 4.5 * gauss(x, z, -92, -48, 11) + 2.2 * gauss(x, z, 58, 74, 12) + 1.6 * gauss(x, z, -28, 80, 10)
  // soft plateau on the Lookout summit
  if (h > 6.2) h = 6.2 + (h - 6.2) * 0.25
  return h
}
function undulate(x, z) {
  return 0.32 * Math.sin(x * 0.071 + 1.3) * Math.sin(z * 0.063 + 0.4) + 0.22 * Math.sin(x * 0.13 + z * 0.09 + 2) + 0.12 * Math.sin(z * 0.21 - x * 0.05)
}

// Terrain height without buildings (exact analytic surface the grid is sampled from).
export function terrainHeight(x, z) {
  const r = Math.hypot(x, z)
  const a = Math.atan2(z, x)
  const R = shoreR(a)
  const bw = beachW(a)
  const d = R - r // metres inland of the waterline
  const flat = flatMask(x, z)
  // normal shore profile: seabed -> sand rising to 0 at the grass edge
  let base
  if (d < 0) base = Math.max(-5, -0.6 + d * 0.2)
  else if (d < bw) base = -0.6 + 0.6 * smooth(0, 1, d / bw)
  else base = 0
  const inland = smooth(bw, bw + 12, d)
  let elev = (hills(x, z) + undulate(x, z) * inland) * (1 - flat) * inland
  // NE cliffs: land rises toward the coast then drops sheer into the sea
  const cm = cliffMask(a)
  if (cm > 0) {
    const top = 4.4 * smooth(27, 8, d) * (1 - flat)
    let cliff
    if (d >= 6) cliff = top
    else if (d >= 3) cliff = lerp(-2.4, 4.4 * (1 - flat), (d - 3) / 3)
    else cliff = Math.max(-5, -2.4 + (d - 3) * 0.35)
    base = lerp(base, cliff, cm)
    elev *= 1 - cm * smooth(10, 0, d)
  }
  let h = base + elev
  // Dockyard: concrete apron flat at 0 up to the quay line, deep water beyond.
  const dz = Math.max(DOCK.z0 - z, 0, z - DOCK.z1)
  if (x < DOCK.x1 + 6 && dz < 6) {
    const w = (1 - smooth(0, 6, dz)) * (1 - smooth(DOCK.x1, DOCK.x1 + 6, x))
    const dockH = x > DOCK.x0 ? 0 : -4.5
    h = lerp(h, dockH, w)
  }
  return h
}

// --- Occupancy registry -----------------------------------------------------------------
// Districts register footprints here; scatter code asks isFree() before placing.
const rects = [] // [x0, z0, x1, z1]
const CELL = 10
const grid = new Map() // "ix,iz" -> [[x, z, r], ...] (circles, r <= ~6)
const big = [] // circles too large for the grid
const key = (ix, iz) => ix * 1000 + iz
export function occupy(x0, z0, x1, z1) {
  rects.push([Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1)])
}
export function occupyCircle(x, z, r) {
  if (r > 6) {
    big.push([x, z, r])
    return
  }
  const k = key(Math.floor(x / CELL), Math.floor(z / CELL))
  let list = grid.get(k)
  if (!list) grid.set(k, (list = []))
  list.push([x, z, r])
}
export function isFree(x, z, r = 0, { roads = true, spawns = false } = {}) {
  for (const [x0, z0, x1, z1] of rects) if (x > x0 - r && x < x1 + r && z > z0 - r && z < z1 + r) return false
  for (const [cx, cz, cr] of big) if (Math.hypot(x - cx, z - cz) < cr + r) return false
  const ix = Math.floor(x / CELL)
  const iz = Math.floor(z / CELL)
  for (let a = -1; a <= 1; a++) {
    for (let b = -1; b <= 1; b++) {
      const list = grid.get(key(ix + a, iz + b))
      if (!list) continue
      for (const [cx, cz, cr] of list) {
        const dx = x - cx
        const dz = z - cz
        const rr = cr + r
        if (dx * dx + dz * dz < rr * rr) return false
      }
    }
  }
  if (spawns) {
    for (const s of Object.values(SPAWNS)) if (Math.hypot(x - s.x, z - s.z) < s.r + r) return false
  }
  if (roads && roadDist(x, z, true) < r + 0.8) return false
  return true
}
export function resetOccupancy() {
  rects.length = 0
  big.length = 0
  grid.clear()
}

// Polar helpers.
export const polar = (x, z) => ({ r: Math.hypot(x, z), a: Math.atan2(z, x) })
export const inlandOf = (x, z) => {
  const { r, a } = polar(x, z)
  return shoreR(a) - r
}
