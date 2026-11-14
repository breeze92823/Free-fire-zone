// Walkability grid over the island, rasterised from the physics world itself (so it follows
// whatever the island builder placed): each cell finds its floor with a ray and is walkable when a
// character-sized box above that floor touches no static collider. Ground floors of buildings with
// doorways come out walkable on their own. Connected components keep spawn points on the main,
// reachable area (match.js spawnActor via randomWalkable).
import { WATER, NAV } from '../config.js'
import { RAPIER, world } from '../physics.js'

const STATIC = () => RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC | RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC | RAPIER.QueryFilterFlags.EXCLUDE_SENSORS
const MAX_STEP = 0.55 // m of floor height difference between neighbouring cells

export function buildNav(island) {
  const cell = NAV.cell
  const { minX, maxX, minZ, maxZ } = island.bounds
  const w = Math.ceil((maxX - minX) / cell)
  const h = Math.ceil((maxZ - minZ) / cell)
  const walk = new Uint8Array(w * h)
  const floor = new Float32Array(w * h)
  const comp = new Int32Array(w * h).fill(-1)
  world.step() // make sure the query pipeline sees every collider
  const ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 })
  const box = new RAPIER.Cuboid(0.34, 0.55, 0.34)
  const rot = { x: 0, y: 0, z: 0, w: 1 }
  const flags = STATIC()
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const x = minX + (i + 0.5) * cell
      const z = minZ + (j + 0.5) * cell
      const idx = j * w + i
      const gh = island.groundHeight(x, z)
      if (gh < WATER.level + 0.05) continue
      ray.origin.x = x
      ray.origin.y = gh + 2.2
      ray.origin.z = z
      const hit = world.castRay(ray, 3, true, flags)
      const fy = hit ? gh + 2.2 - (hit.timeOfImpact ?? hit.toi) : gh
      if (fy - gh > 0.7) continue
      floor[idx] = fy
      const c = world.intersectionWithShape({ x, y: fy + 0.5 + 0.55, z }, rot, box, flags)
      if (!c) walk[idx] = 1
    }
  }

  const nav = { w, h, cell, minX, minZ, walk, floor, comp, main: -1 }
  const nb = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]]
  nav.nb = nb

  // Connected components (flood fill); the biggest is "main".
  let label = 0
  let bestSize = 0
  const stack = new Int32Array(w * h)
  for (let s = 0; s < w * h; s++) {
    if (!walk[s] || comp[s] >= 0) continue
    let sp = 0
    stack[sp++] = s
    comp[s] = label
    let size = 0
    while (sp > 0) {
      const c = stack[--sp]
      size++
      const ci = c % w
      const cj = (c / w) | 0
      for (const [di, dj] of nb) {
        const ni = ci + di
        const nj = cj + dj
        if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue
        const n = nj * w + ni
        if (!passable(nav, c, n, di, dj) || comp[n] >= 0) continue
        comp[n] = label
        stack[sp++] = n
      }
    }
    if (size > bestSize) {
      bestSize = size
      nav.main = label
    }
    label++
  }
  nav.walkableCount = bestSize
  return nav
}

function passable(nav, from, to, di, dj) {
  const { walk, floor, w } = nav
  if (!walk[to]) return false
  if (Math.abs(floor[to] - floor[from]) > MAX_STEP) return false
  if (di !== 0 && dj !== 0) {
    // No cutting corners.
    if (!walk[from + di] || !walk[from + dj * w]) return false
  }
  return true
}

export function cellOf(nav, x, z) {
  const i = Math.floor((x - nav.minX) / nav.cell)
  const j = Math.floor((z - nav.minZ) / nav.cell)
  if (i < 0 || j < 0 || i >= nav.w || j >= nav.h) return -1
  return j * nav.w + i
}
export const cellX = (nav, c) => nav.minX + ((c % nav.w) + 0.5) * nav.cell
export const cellZ = (nav, c) => nav.minZ + (((c / nav.w) | 0) + 0.5) * nav.cell

// Nearest walkable cell of the main component within `radius` cells, or -1.
export function nearestWalkable(nav, x, z, radius = 8) {
  const c0 = cellOf(nav, x, z)
  if (c0 >= 0 && nav.walk[c0] && nav.comp[c0] === nav.main) return c0
  const ci = Math.floor((x - nav.minX) / nav.cell)
  const cj = Math.floor((z - nav.minZ) / nav.cell)
  for (let r = 1; r <= radius; r++) {
    let best = -1
    let bd = Infinity
    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue
        const i = ci + di
        const j = cj + dj
        if (i < 0 || j < 0 || i >= nav.w || j >= nav.h) continue
        const c = j * nav.w + i
        if (!nav.walk[c] || nav.comp[c] !== nav.main) continue
        const d = di * di + dj * dj
        if (d < bd) {
          bd = d
          best = c
        }
      }
    }
    if (best >= 0) return best
  }
  return -1
}

// A random walkable (main component) cell within r metres of (x, z), passing `ok(x, z)`.
export function randomWalkable(nav, x, z, r, ok = null, tries = 60) {
  for (let t = 0; t < tries; t++) {
    const a = Math.random() * Math.PI * 2
    const d = Math.sqrt(Math.random()) * r
    const px = x + Math.cos(a) * d
    const pz = z + Math.sin(a) * d
    const c = cellOf(nav, px, pz)
    if (c < 0 || !nav.walk[c] || nav.comp[c] !== nav.main) continue
    const cx = cellX(nav, c)
    const cz = cellZ(nav, c)
    if (ok && !ok(cx, cz)) continue
    return { x: cx, y: nav.floor[c], z: cz, cell: c }
  }
  return null
}
