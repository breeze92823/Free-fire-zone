// Navigation for bots: a 2D grid over the island, rasterised from the physics
// world itself (so it follows whatever the island builder placed): each cell
// finds its floor with a ray and is walkable when a character-sized box above
// that floor touches no static collider. Ground floors of buildings with
// doorways come out walkable on their own. A* (8-way, octile, binary heap,
// no corner cutting, no climbing walls) + string-pulling for smooth paths,
// and connected components so goals are always reachable.
import { WATER, BOTS } from '../config.js'
import { RAPIER, world } from '../physics.js'

const STATIC = () => RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC | RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC | RAPIER.QueryFilterFlags.EXCLUDE_SENSORS
const MAX_STEP = 0.55 // m of floor height difference between neighbouring cells

export function buildNav(island) {
  const cell = BOTS.navCell
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

// --- A* ------------------------------------------------------------------------------------------
let gScore = null
let fScore = null
let came = null
let closed = null
let stamp = null
let heap = null
let run = 0

function heapPush(h, n, f) {
  let i = h.size++
  h.nodes[i] = n
  h.keys[i] = f
  while (i > 0) {
    const p = (i - 1) >> 1
    if (h.keys[p] <= h.keys[i]) break
    ;[h.nodes[p], h.nodes[i]] = [h.nodes[i], h.nodes[p]]
    ;[h.keys[p], h.keys[i]] = [h.keys[i], h.keys[p]]
    i = p
  }
}
function heapPop(h) {
  const top = h.nodes[0]
  h.size--
  if (h.size > 0) {
    h.nodes[0] = h.nodes[h.size]
    h.keys[0] = h.keys[h.size]
    let i = 0
    for (;;) {
      const l = i * 2 + 1
      const r = l + 1
      let m = i
      if (l < h.size && h.keys[l] < h.keys[m]) m = l
      if (r < h.size && h.keys[r] < h.keys[m]) m = r
      if (m === i) break
      ;[h.nodes[m], h.nodes[i]] = [h.nodes[i], h.nodes[m]]
      ;[h.keys[m], h.keys[i]] = [h.keys[i], h.keys[m]]
      i = m
    }
  }
  return top
}

// Path of world points [{x, y, z}] from (sx, sz) to (gx, gz), or null. Partial paths
// (toward the closest reached cell) when the search budget runs out.
export function findPath(nav, sx, sz, gx, gz, budget = 9000) {
  const n = nav.w * nav.h
  if (!gScore || gScore.length !== n) {
    gScore = new Float32Array(n)
    fScore = new Float32Array(n)
    came = new Int32Array(n)
    closed = new Uint32Array(n)
    stamp = new Uint32Array(n)
    heap = { nodes: new Int32Array(n), keys: new Float32Array(n), size: 0 }
  }
  run++
  const start = nearestWalkable(nav, sx, sz, 6)
  const goal = nearestWalkable(nav, gx, gz, 10)
  if (start < 0 || goal < 0) return null
  if (start === goal) return [{ x: gx, y: nav.floor[goal], z: gz }]
  const w = nav.w
  const gi = goal % w
  const gj = (goal / w) | 0
  const hEst = (c) => {
    const dx = Math.abs((c % w) - gi)
    const dz = Math.abs(((c / w) | 0) - gj)
    return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz)
  }
  heap.size = 0
  stamp[start] = run
  gScore[start] = 0
  came[start] = -1
  heapPush(heap, start, hEst(start))
  let best = start
  let bestH = hEst(start)
  let iter = 0
  while (heap.size > 0 && iter++ < budget) {
    const c = heapPop(heap)
    if (closed[c] === run) continue
    closed[c] = run
    if (c === goal) {
      best = c
      break
    }
    const hc = hEst(c)
    if (hc < bestH) {
      bestH = hc
      best = c
    }
    const ci = c % w
    const cj = (c / w) | 0
    for (const [di, dj, cost] of nav.nb) {
      const ni = ci + di
      const nj = cj + dj
      if (ni < 0 || nj < 0 || ni >= w || nj >= nav.h) continue
      const nn = nj * w + ni
      if (closed[nn] === run || !passable(nav, c, nn, di, dj)) continue
      const g = gScore[c] + cost
      if (stamp[nn] === run && g >= gScore[nn]) continue
      stamp[nn] = run
      gScore[nn] = g
      came[nn] = c
      heapPush(heap, nn, g + hEst(nn) * 1.05)
    }
  }
  // Walk back.
  const cells = []
  for (let c = best; c >= 0; c = came[c]) {
    cells.push(c)
    if (c === start) break
  }
  cells.reverse()
  // String-pull: keep a cell only when the straight walk to the next anchor is blocked.
  const out = []
  let anchor = 0
  out.push(cells[0])
  for (let k = 2; k < cells.length; k++) {
    if (!walkLine(nav, cells[anchor], cells[k])) {
      out.push(cells[k - 1])
      anchor = k - 1
    }
  }
  if (cells.length > 1) out.push(cells[cells.length - 1])
  const pts = out.map((c) => ({ x: cellX(nav, c), y: nav.floor[c], z: cellZ(nav, c) }))
  if (best === goal) pts[pts.length - 1] = { x: gx, y: nav.floor[goal], z: gz }
  pts.shift() // the start cell itself
  return pts
}

// True when a straight walk between two cells crosses only walkable, level-ish cells.
export function walkLine(nav, a, b) {
  const w = nav.w
  let x0 = a % w
  let y0 = (a / w) | 0
  const x1 = b % w
  const y1 = (b / w) | 0
  const dx = Math.abs(x1 - x0)
  const dy = Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx - dy
  let prev = a
  for (let guard = 0; guard < 400; guard++) {
    if (x0 === x1 && y0 === y1) return true
    const e2 = 2 * err
    // Supercover: step one axis at a time so diagonals can't slip between blocked cells.
    if (e2 > -dy) {
      err -= dy
      x0 += sx
    } else if (e2 < dx) {
      err += dx
      y0 += sy
    }
    const c = y0 * w + x0
    if (!nav.walk[c] || Math.abs(nav.floor[c] - nav.floor[prev]) > MAX_STEP) return false
    prev = c
  }
  return false
}
