// Roads: asphalt ribbons with white/yellow markings, raised sidewalks with
// concrete kerbs (cut cleanly at junctions), zebra crossings, the Maple Row
// cul-de-sac and the beach car park. Then the street furniture along them:
// lamps, utility poles with sagging cables, parked cars, signs, a bus stop.
import { BufferAttribute, BufferGeometry, CircleGeometry } from 'three'
import { Batch, projectUV, ribbonGeo } from './geom.js'
import { M } from './materials.js'
import { PADS, RING, ROADS } from './layout.js'
import { bench, billboard, cable, car, hydrant, sign, streetLamp, trashBin, utilityPole } from './kit.js'

const ROAD_Y = { ring: 0.065, default: 0.04 }
const WALK_TOP = 0.14

function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax
  const dz = bz - az
  const l2 = dx * dx + dz * dz || 1
  let t = ((px - ax) * dx + (pz - az) * dz) / l2
  t = t < 0 ? 0 : t > 1 ? 1 : t
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t))
}

// Distance from (x, z) to road r's centreline.
function centreDist(r, x, z) {
  if (r.id === 'ring') return Math.abs(Math.hypot(x, z) - RING.r)
  let best = 1e9
  for (let i = 1; i < r.pts.length; i++) best = Math.min(best, segDist(x, z, r.pts[i - 1][0], r.pts[i - 1][1], r.pts[i][0], r.pts[i][1]))
  return best
}

// Is the point covered by another road (or pad)? Higher-priority roads (lower
// index) claim their sidewalks too, so junction corners never double up.
function covered(selfIdx, x, z, includeWalk = true) {
  for (let j = 0; j < ROADS.length; j++) {
    if (j === selfIdx) continue
    const r = ROADS[j]
    if (r.kind !== 'asphalt') continue
    const reach = r.half + (includeWalk && j < selfIdx ? r.walk : 0) + 0.05
    if (centreDist(r, x, z) < reach) return true
  }
  for (const p of PADS) {
    if (p.r) {
      if (Math.hypot(x - p.x, z - p.z) < p.r + (includeWalk ? 2.4 : 0)) return true
    } else {
      const [x0, z0, x1, z1] = p.rect
      if (x > x0 - 0.2 && x < x1 + 0.2 && z > z0 - 0.2 && z < z1 + 0.2) return true
    }
  }
  return false
}

// Resample a polyline every `step` metres.
function resample(pts, step = 1) {
  const out = [pts[0]]
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1]
    const [bx, bz] = pts[i]
    const L = Math.hypot(bx - ax, bz - az)
    const n = Math.max(1, Math.round(L / step))
    for (let k = 1; k <= n; k++) out.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n])
  }
  return out
}

// Offset point (left of travel is +).
function offsetAt(pts, i, off) {
  const prev = pts[Math.max(0, i - 1)]
  const next = pts[Math.min(pts.length - 1, i + 1)]
  let dx = next[0] - prev[0]
  let dz = next[1] - prev[1]
  const l = Math.hypot(dx, dz) || 1
  dx /= l
  dz /= l
  return [pts[i][0] + dz * off, pts[i][1] - dx * off]
}

// Split the path into runs where the band [a, b] (offsets) is not covered by another road.
function runs(pts, a, b, selfIdx, includeWalk = true) {
  const out = []
  let cur = []
  for (let i = 0; i < pts.length; i++) {
    const [mx, mz] = offsetAt(pts, i, (a + b) / 2)
    const [ex, ez] = offsetAt(pts, i, a)
    const [fx, fz] = offsetAt(pts, i, b)
    const blocked = covered(selfIdx, mx, mz, includeWalk) || covered(selfIdx, ex, ez, includeWalk) || covered(selfIdx, fx, fz, includeWalk)
    if (!blocked) cur.push(pts[i])
    else if (cur.length) {
      if (cur.length > 1) out.push(cur)
      cur = []
    }
  }
  if (cur.length > 1) out.push(cur)
  return out
}

// Vertical strip (kerb face) along a run at offset `off`, from y0 to y1, facing the road.
function wallStrip(pts, off, y0, y1, facing) {
  const pos = []
  const uv = []
  const idx = []
  let along = 0
  for (let i = 0; i < pts.length; i++) {
    const [x, z] = offsetAt(pts, i, off)
    if (i > 0) {
      const [px, pz] = offsetAt(pts, i - 1, off)
      along += Math.hypot(x - px, z - pz)
    }
    pos.push(x, y0, z, x, y1, z)
    uv.push(along, y0, along, y1)
    if (i > 0) {
      const k = (i - 1) * 2
      if (facing > 0) idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2)
      else idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3)
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

// Sidewalk band [a, b] (offsets, |a| < |b|) on one side: top surface, kerb face, kerb top, colliders.
function sidewalk(B, pts, a, b, selfIdx, side) {
  for (const run of runs(pts, a, b, selfIdx, true)) {
    const lo = Math.min(a, b)
    const hi = Math.max(a, b)
    const kerb = side > 0 ? lo : hi // road-side edge
    const inner = side > 0 ? [lo + 0.22, hi] : [lo, hi - 0.22]
    B.add(M.sidewalk, ribbonGeo(run, inner[0], inner[1], WALK_TOP))
    const kt = side > 0 ? [lo, lo + 0.22] : [hi - 0.22, hi]
    B.add(M.concrete, ribbonGeo(run, kt[0], kt[1], WALK_TOP + 0.015), null, 0xd9d6cf)
    B.add(M.concrete, wallStrip(run, kerb, 0.0, WALK_TOP + 0.015, side > 0 ? -1 : 1), null, 0xc9c6bf)
    // colliders: one thin box per ~3 m
    for (let i = 0; i < run.length - 1; i += 3) {
      const j = Math.min(run.length - 1, i + 3)
      const [ax, az] = run[i]
      const [bx, bz] = run[j]
      const L = Math.hypot(bx - ax, bz - az)
      const yaw = Math.atan2(-(bz - az), bx - ax)
      const mid = (lo + hi) / 2
      const [cx, cz] = offsetAt(run, Math.round((i + j) / 2), mid)
      B.push(cx, 0, cz, yaw)
      B.solid(L / 2 + 0.15, WALK_TOP / 2 + 0.05, (hi - lo) / 2, 0, WALK_TOP / 2 - 0.05, 0)
      B.pop()
    }
  }
}

function markings(B, pts, r, selfIdx, y) {
  const lineY = y + 0.012
  // edge lines (solid white)
  for (const off of [r.half - 0.35, -(r.half - 0.35)]) {
    for (const run of runs(pts, off - 0.07, off + 0.07, selfIdx, false)) B.add(M.marking, ribbonGeo(run, off - 0.07, off + 0.07, lineY), null, 0xf4f4f0)
  }
  // centre: dashed (ring + links) or double yellow (spokes)
  if (r.id === 'ring' || r.id === 'plazaLink') {
    for (const run of runs(pts, -0.08, 0.08, selfIdx, false)) {
      for (let i = 0; i + 3 < run.length; i += 6) B.add(M.marking, ribbonGeo(run.slice(i, i + 4), -0.08, 0.08, lineY), null, 0xf4f4f0)
    }
  } else {
    for (const off of [-0.14, 0.14]) {
      for (const run of runs(pts, off - 0.06, off + 0.06, selfIdx, false)) B.add(M.marking, ribbonGeo(run, off - 0.06, off + 0.06, lineY), null, 0xf2c230)
    }
  }
}

// Zebra crossing across road r at point index i of its resampled path.
function zebra(B, pts, i, r, y) {
  const [x, z] = pts[i]
  const [nx, nz] = pts[Math.min(pts.length - 1, i + 1)]
  const yaw = Math.atan2(-(nz - z), nx - x)
  B.push(x, y + 0.012, z, yaw)
  for (let k = -r.half + 0.5; k < r.half - 0.4; k += 0.9) B.span(M.marking, -1.6, 0, k, 1.6, 0.005, k + 0.5, { tint: 0xf4f4f0 })
  B.span(M.marking, 2.1, 0, -r.half + 0.3, 2.35, 0.005, r.half - 0.3, { tint: 0xf4f4f0 })
  B.pop()
}

export function buildRoads(scene, { lamp, loot }) {
  const B = new Batch('roads')
  const paths = []
  ROADS.forEach((r, idx) => {
    if (r.kind !== 'asphalt') return
    const pts = resample(r.pts, r.id === 'ring' ? 1.2 : 1)
    paths[idx] = pts
    const y = ROAD_Y[r.id] ?? ROAD_Y.default
    B.add(M.asphalt, ribbonGeo(pts, -r.half, r.half, y))
    markings(B, pts, r, idx, y)
    if (r.walk > 0) {
      sidewalk(B, pts, r.half, r.half + r.walk, idx, 1)
      sidewalk(B, pts, -r.half - r.walk, -r.half, idx, -1)
    }
  })
  // zebra crossings near the ring on each spoke + one on the ring at the villa gate
  for (const id of ['north', 'east', 'west', 'south']) {
    const idx = ROADS.findIndex((r) => r.id === id)
    zebra(B, paths[idx], 10, ROADS[idx], ROAD_Y.default)
  }

  // cul-de-sac pad + its sidewalk ring
  for (const p of PADS) {
    if (p.r) {
      const g = new CircleGeometry(p.r, 40)
      g.rotateX(-Math.PI / 2)
      projectUV(g)
      B.geo(M.asphalt, g, p.x, 0.025, p.z)
      // sidewalk ring, open toward the road (west)
      const ring = []
      const gapA = 0.48
      for (let k = 0; k <= 48; k++) {
        const a = Math.PI + gapA + (k / 48) * (Math.PI * 2 - gapA * 2)
        ring.push([p.x + Math.cos(a) * p.r, p.z + Math.sin(a) * p.r])
      }
      B.add(M.sidewalk, ribbonGeo(ring, 0.22, 2.4, WALK_TOP))
      B.add(M.concrete, ribbonGeo(ring, 0, 0.22, WALK_TOP + 0.015), null, 0xd9d6cf)
      B.add(M.concrete, wallStrip(ring, 0, 0, WALK_TOP + 0.015, -1), null, 0xc9c6bf)
      for (let k = 0; k < 12; k++) {
        const a = Math.PI + gapA + ((k + 0.5) / 12) * (Math.PI * 2 - gapA * 2)
        B.push(p.x + Math.cos(a) * (p.r + 1.3), 0, p.z + Math.sin(a) * (p.r + 1.3), -a)
        B.solid(1.2, 0.1, 1.6, 0, 0.04, 0)
        B.pop()
      }
    } else {
      const [x0, z0, x1, z1] = p.rect
      B.span(M.asphalt, x0, 0.0, z0, x1, 0.045, z1)
      // kerb all round except the entrance (north side, |x| < 4)
      const k = 0.25
      B.span(M.concrete, x0 - k, 0, z1, x1 + k, 0.16, z1 + k, { tint: 0xd9d6cf })
      B.span(M.concrete, x0 - k, 0, z0, x0, 0.16, z1, { tint: 0xd9d6cf })
      B.span(M.concrete, x1, 0, z0, x1 + k, 0.16, z1, { tint: 0xd9d6cf })
      B.span(M.concrete, x0 - k, 0, z0 - k, -4.2, 0.16, z0, { tint: 0xd9d6cf })
      B.span(M.concrete, 4.2, 0, z0 - k, x1 + k, 0.16, z0, { tint: 0xd9d6cf })
      // bays: two rows facing the aisle (north row leaves the entrance clear)
      for (let x = x0 + 1; x <= x1 - 1 + 1e-6; x += 2.8) {
        if (Math.abs(x) > 4.6) B.span(M.marking, x - 0.06, 0.05, z0 + 0.4, x + 0.06, 0.055, z0 + 5.2, { tint: 0xf4f4f0 })
        B.span(M.marking, x - 0.06, 0.05, z1 - 5.2, x + 0.06, 0.055, z1 - 0.4, { tint: 0xf4f4f0 })
      }
    }
  }
  const group = B.build(scene, false)

  // --- street furniture (casts shadows) ---
  const S = new Batch('street')
  // ring lamps on the inner sidewalk, arms over the road
  for (let k = 0; k < 12; k++) {
    const a = ((k + 0.5) / 12) * Math.PI * 2
    const r = RING.r - RING.half - RING.walk + 0.5
    const p = streetLamp(S, Math.cos(a) * r, WALK_TOP, Math.sin(a) * r, Math.PI / 2 - a)
    lamp(p, 2)
  }
  // spoke lamps, alternating sides
  const spoke = (id, every = 15) => {
    const r = ROADS.find((q) => q.id === id)
    const [ax, az] = r.pts[0]
    const [bx, bz] = r.pts[r.pts.length - 1]
    const L = Math.hypot(bx - ax, bz - az)
    const dx = (bx - ax) / L
    const dz = (bz - az) / L
    let side = 1
    for (let s = RING.half + RING.walk + 6; s < L - 3; s += every) {
      const off = (r.half + 0.6) * side
      const x = ax + dx * s + dz * off
      const z = az + dz * s - dx * off
      // arm points back toward the road centre: local +z = -side * left
      const tx = -dz * side
      const tz = dx * side
      const p = streetLamp(S, x, WALK_TOP, z, Math.atan2(tx, tz))
      lamp(p, 1)
      side = -side
    }
  }
  spoke('north')
  spoke('east', 16)
  spoke('west')
  spoke('south')
  spoke('plazaLink', 12)

  // utility poles + cables: along the east road (north verge) and the south road (west verge)
  const poleLine = (pts) => {
    let prev = null
    for (const [x, z, yaw] of pts) {
      const ins = utilityPole(S, x, 0, z, yaw)
      if (prev) for (let k = 0; k < 3; k++) cable(S, prev[k], ins[k], 0.7)
      prev = ins
    }
  }
  poleLine([[56, -8.2, 0], [74, -8.2, 0], [92, -8.2, 0], [108, -10.8, 0.2]])
  poleLine([[-8.2, 57, Math.PI / 2], [-8.2, 70, Math.PI / 2], [-8.2, 82, Math.PI / 2]])
  poleLine([[8.2, -58, Math.PI / 2], [8.2, -71, Math.PI / 2]])

  // parked cars (parallel, at the kerb)
  const cars = [
    [60, 2.9, Math.PI / 2, 0xd23b3b, 'sedan'],
    [77, -2.9, -Math.PI / 2, 0x2f6fd0, 'hatch'],
    [96, 2.9, Math.PI / 2, 0xf2f2f2, 'suv'],
    [-2.9, -63, Math.PI, 0x3fae5a, 'sedan'],
    [2.9, 66, 0, 0xf2b630, 'van'],
    [-62, -2.9, -Math.PI / 2, 0x6a3fb5, 'pickup'],
  ]
  for (const [x, z, yaw, c, t] of cars) car(S, x, 0.04, z, yaw, c, t)
  // ring: two cars at the outer kerb
  for (const [a, c, t] of [[0.95, 0x1f2a36, 'sedan'], [3.7, 0xe0662a, 'hatch']]) {
    const r = RING.r + RING.half - 1.05
    car(S, Math.cos(a) * r, 0.05, Math.sin(a) * r, -a + Math.PI, c, t)
  }
  // beach car park
  for (const [x, c, t] of [[-15.6, 0x2f6fd0, 'suv'], [-10, 0xd23b3b, 'sedan'], [6.8, 0xf2f2f2, 'van'], [12.4, 0x3fae5a, 'hatch']]) car(S, x, 0.045, 87.2, Math.PI, c, t)
  for (const [x, c, t] of [[-12.8, 0xf2b630, 'pickup'], [-1.6, 0x1f2a36, 'sedan'], [12.4, 0xe0662a, 'sedan']]) car(S, x, 0.045, 96.8, 0, c, t)
  loot({ x: 4.2, y: 0.05, z: 92 })

  // signs, hydrants, bins, benches, a bus stop and two billboards
  const stop = (x, z, yaw) => {
    S.push(x, WALK_TOP, z, yaw)
    S.cyl(M.paint, 0.04, 0.04, 2.4, 0, 1.2, 0, { tint: 0xa0a6ad, seg: 6 })
    sign(S, 'STOP', 0, 2.25, 0.05, 0.75, 0.75, { bg: '#d8261c', fg: '#ffffff', border: '#ffffff', w: 256, h: 256, font: '700 88px Fredoka, sans-serif' })
    S.pop()
  }
  stop(-4.9, -54.8, Math.PI)
  stop(54.8, 4.9, -Math.PI / 2)
  stop(4.9, 54.8, 0)
  stop(-54.8, -4.9, Math.PI / 2)
  hydrant(S, 58, WALK_TOP, -5.4)
  hydrant(S, -5.4, WALK_TOP, 64)
  hydrant(S, 5.4, WALK_TOP, -62)
  for (const [x, z] of [[66, 5.6], [88, -5.6], [-5.6, -70], [5.6, 76], [-70, 5.6]]) trashBin(S, x, WALK_TOP, z)
  // bus stop on the ring outer sidewalk (south-east)
  {
    const a = 1.15
    const r = RING.r + RING.half + 1.6
    S.push(Math.cos(a) * r, WALK_TOP, Math.sin(a) * r, Math.PI / 2 - a + Math.PI)
    for (const px of [-1.8, 1.8]) S.span(M.paint, px - 0.05, 0, -0.65, px + 0.05, 2.5, -0.55, { tint: 0x2f3a40 })
    S.span(M.glass, -1.8, 0.2, -0.62, 1.8, 2.3, -0.58)
    S.solid(1.8, 1.2, 0.08, 0, 1.2, -0.6)
    S.span(M.paint, -2.0, 2.5, -0.9, 2.0, 2.62, 0.5, { tint: 0x2f3a40 })
    S.span(M.glass, -1.8, 0.2, -0.6, -1.75, 2.3, 0.3)
    bench(S, 0, 0, -0.2, 0, { len: 2.4, back: false, tint: 0x2f6fd0 })
    sign(S, 'BUS', 1.4, 2.3, 0.52, 0.8, 0.4, { bg: '#2f6fd0', w: 256, h: 128 })
    S.pop()
  }
  billboard(S, 66, 0, 46, Math.atan2(-66, -46), 'FIZZ COLA', { poster: 'cola', backPoster: 'coffee', w: 8, h: 3.5 })
  billboard(S, -46, 0, 66, Math.atan2(46, -66), 'ZOOM ENERGY', { poster: 'energy', backPoster: 'beach', w: 8, h: 3.5 })
  const street = S.build(scene, true)
  return { group, street }
}
