// Building kit: walls with framed door/window openings, floor slabs with holes,
// stairs with ramp colliders, railings, gable and flat roofs, chimneys,
// gutters, plus the furniture / street props every district reuses. All
// functions draw into a Batch (geom.js) in its current frame; "+z" is the
// front of a prop. Colliders are registered for walls, floors, roofs, stairs
// and anything that is cover.
import { BoxGeometry, BufferAttribute, BufferGeometry, IcosahedronGeometry, PlaneGeometry } from 'three'
import { cylGeo, prismGeo } from './geom.js'
import { M, TINT } from './materials.js'
import { mulberry32 } from '../textures.js'

export const DOOR_W = 2.0 // nominal door opening (clear 2.0 m, casings sit outside it)
export const DOOR_H = 2.6

// --- Walls ---------------------------------------------------------------------------
// Wall along local x from x0 to x1, centred on z, from y0 up h, thickness t.
// o.openings: [{ x: centre, w, y: sill height above y0, h, kind: 'door' | 'window' | 'open' }]
// o.out: +1 / -1 (which side is outside: sills, shutters, plinth)
// o.mat / o.tint (outer layer), o.inner: { mat, tint } (inner layer; else one layer)
export function wall(B, x0, x1, z, y0, h, t, o = {}) {
  const mat = o.mat ?? M.stucco
  const tint = o.tint ?? TINT.white
  const out = o.out ?? 1
  const ops = (o.openings ?? []).slice().sort((a, b) => a.x - b.x)
  const zo = z + (out * t) / 2 // outside face
  const zi = z - (out * t) / 2 // inside face
  const layers = o.inner
    ? [
        { mat, tint, za: zo, zb: z },
        { mat: o.inner.mat, tint: o.inner.tint ?? TINT.white, za: z, zb: zi },
      ]
    : [{ mat, tint, za: zo, zb: zi }]
  const piece = (xa, xb, ya, yb) => {
    if (xb - xa < 1e-3 || yb - ya < 1e-3) return
    for (const L of layers) B.span(L.mat, xa, ya, L.za, xb, yb, L.zb, { tint: L.tint })
    if (o.solid !== false) B.solidSpan(xa, ya, zo, xb, yb, zi)
  }
  let cx = x0
  for (const op of ops) {
    const a = op.x - op.w / 2
    const b = op.x + op.w / 2
    if (a > cx) piece(cx, a, y0, y0 + h)
    if (op.y > 0) piece(a, b, y0, y0 + op.y)
    if (op.y + op.h < h) piece(a, b, y0 + op.y + op.h, y0 + h)
    cx = b
    openingTrim(B, op, a, b, y0, z, t, out, o)
  }
  if (x1 > cx) piece(cx, x1, y0, y0 + h)
  // plinth band on the outside (stone base), broken at doors
  if (o.plinth) {
    const p = o.plinth
    const seg = (xa, xb) => {
      if (xb - xa > 0.01) B.span(p.mat ?? M.stone, xa, y0, zo, xb, y0 + (p.h ?? 0.7), zo + out * 0.06, { tint: p.tint ?? TINT.white })
    }
    let px = x0
    for (const op of ops) {
      if (op.kind === 'window') continue
      seg(px, op.x - op.w / 2 - 0.12)
      px = op.x + op.w / 2 + 0.12
    }
    seg(px, x1)
  }
}

function openingTrim(B, op, a, b, y0, z, t, out, o) {
  if (op.kind === 'open' || o.noTrim) return
  const fw = 0.12
  const ft = o.frameTint ?? TINT.trim
  const zo = z + (out * t) / 2
  const zi = z - (out * t) / 2
  const yb = y0 + op.y
  const yt = y0 + op.y + op.h
  const faces = o.inside === false ? [[zo, out]] : [[zo, out], [zi, -out]]
  for (const [fz, s] of faces) {
    const z2 = fz + s * 0.045
    B.span(M.paint, a - fw, yb, fz, a, yt + fw, z2, { tint: ft })
    B.span(M.paint, b, yb, fz, b + fw, yt + fw, z2, { tint: ft })
    B.span(M.paint, a - fw, yt, fz, b + fw, yt + fw, z2, { tint: ft })
    if (op.kind === 'window') B.span(M.paint, a - fw, yb - fw, fz, b + fw, yb, z2, { tint: ft })
  }
  if (op.kind === 'door') {
    // threshold + an open door leaf folded back against the inside wall
    B.span(M.concrete, a, y0 - 0.02, zo, b, y0 + 0.03, zi, { tint: 0xd8d4cc })
    if (o.leaf !== false && op.leaf !== false) {
      const lw = Math.min(1.0, op.w * 0.5)
      const lz = zi - out * 0.06
      B.span(M.wood, a - fw - lw, y0 + 0.02, lz, a - fw - 0.02, y0 + Math.min(op.h, 2.2), lz - out * 0.05, { tint: op.leafTint ?? o.leafTint ?? 0x8a5a34 })
      B.span(M.chrome, a - fw - lw + 0.08, y0 + 1.0, lz - out * 0.05, a - fw - lw + 0.2, y0 + 1.05, lz - out * 0.09, { tint: 0xdddddd })
    }
    return
  }
  if (op.kind !== 'window') return
  // sash: frame bars, glass, mullions
  const st = o.sashTint ?? TINT.frame
  const sw = 0.06
  B.span(M.paint, a, yb, z - 0.04, a + sw, yt, z + 0.04, { tint: st })
  B.span(M.paint, b - sw, yb, z - 0.04, b, yt, z + 0.04, { tint: st })
  B.span(M.paint, a, yt - sw, z - 0.04, b, yt, z + 0.04, { tint: st })
  B.span(M.paint, a, yb, z - 0.04, b, yb + sw, z + 0.04, { tint: st })
  if (b - a > 1.1) B.span(M.paint, (a + b) / 2 - 0.03, yb, z - 0.035, (a + b) / 2 + 0.03, yt, z + 0.035, { tint: st })
  if (yt - yb > 1.0 && !o.noTransom) B.span(M.paint, a, yb + (yt - yb) * 0.62 - 0.03, z - 0.035, b, yb + (yt - yb) * 0.62 + 0.03, z + 0.035, { tint: st })
  if (o.glass !== false) {
    B.span(M.glass, a + sw, yb + sw, z - 0.012, b - sw, yt - sw, z + 0.012)
    if (o.solid !== false) B.solidSpan(a, yb, z - 0.05, b, yt, z + 0.05)
  }
  // outside sill
  B.span(M.paint, a - 0.16, yb - 0.08, zo, b + 0.16, yb, zo + out * 0.16, { tint: o.sillTint ?? ft })
  if (o.shutters) {
    const w2 = Math.min(0.55, (b - a) * 0.45)
    for (const [sa, sb] of [[a - fw - w2, a - fw - 0.02], [b + fw + 0.02, b + fw + w2]]) {
      B.span(M.siding, sa, yb, zo, sb, yt, zo + out * 0.05, { tint: o.shutters })
      for (let k = 1; k < 3; k++) B.span(M.paint, sa, yb + ((yt - yb) * k) / 3 - 0.02, zo + out * 0.05, sb, yb + ((yt - yb) * k) / 3 + 0.02, zo + out * 0.07, { tint: o.shutters })
    }
  }
  if (o.flowerBox) {
    const fz = zo + out * 0.16
    B.span(M.wood, a - 0.05, yb - 0.4, fz, b + 0.05, yb - 0.1, fz + out * 0.28, { tint: 0x7a4e2c })
    for (let k = 0; k < 4; k++) {
      const px = a + ((k + 0.5) / 4) * (b - a)
      B.geo(M.leaf, new IcosahedronGeometry(0.17, 0), px, yb - 0.02, fz + out * 0.14, { tint: 0x4caf3a, sy: 0.8 })
      B.geo(M.leaf, new IcosahedronGeometry(0.07, 0), px + 0.06, yb + 0.1, fz + out * 0.2, { tint: [0xff5f8a, 0xffd23f, 0xffffff, 0xff7b3a][k % 4] })
    }
  }
}

// Wall running along local z (z0..z1) at x. o.out: +1 = outside toward +x.
export function wallZ(B, z0, z1, x, y0, h, t, o = {}) {
  B.push(x, 0, 0, -Math.PI / 2)
  wall(B, z0, z1, 0, y0, h, t, { ...o, out: -(o.out ?? 1) })
  B.pop()
}

// Four walls around a rectangle (centrelines on its edges). sides: { n, s, e, w }
// each an openings array, or false to omit that wall. o is passed to every wall.
export function room(B, x0, z0, x1, z1, y0, h, t, sides = {}, o = {}) {
  const ov = t / 2
  if (sides.n !== false) wall(B, x0 - ov, x1 + ov, z0, y0, h, t, { ...o, openings: sides.n ?? [], out: -1 })
  if (sides.s !== false) wall(B, x0 - ov, x1 + ov, z1, y0, h, t, { ...o, openings: sides.s ?? [], out: 1 })
  if (sides.e !== false) wallZ(B, z0 + ov, z1 - ov, x1, y0, h, t, { ...o, openings: sides.e ?? [], out: 1 })
  if (sides.w !== false) wallZ(B, z0 + ov, z1 - ov, x0, y0, h, t, { ...o, openings: sides.w ?? [], out: -1 })
}

export const door = (x, w = DOOR_W, h = DOOR_H, extra = {}) => ({ x, w, y: 0, h, kind: 'door', ...extra })
export const win = (x, w = 1.4, y = 0.95, h = 1.4, extra = {}) => ({ x, w, y, h, kind: 'window', ...extra })
export const gap = (x, w = DOOR_W, h = DOOR_H) => ({ x, w, y: 0, h, kind: 'open' })

// --- Floors --------------------------------------------------------------------------
// Slab over [x0..x1] x [z0..z1] with its top at yTop, minus rectangular holes
// [[hx0, hz0, hx1, hz1], ...]. Decomposed into strips, each with a collider.
export function slab(B, x0, z0, x1, z1, yTop, th, holes = [], o = {}) {
  const mat = o.mat ?? M.concrete
  const tint = o.tint ?? TINT.white
  const xs = [...new Set([x0, x1, ...holes.flatMap((h) => [h[0], h[2]])])].filter((v) => v >= x0 && v <= x1).sort((a, b) => a - b)
  const zs = [...new Set([z0, z1, ...holes.flatMap((h) => [h[1], h[3]])])].filter((v) => v >= z0 && v <= z1).sort((a, b) => a - b)
  const inHole = (x, z) => holes.some(([a, b, c, d]) => x > a && x < c && z > b && z < d)
  for (let j = 0; j < zs.length - 1; j++) {
    const zc = (zs[j] + zs[j + 1]) / 2
    let start = null
    for (let i = 0; i <= xs.length - 1; i++) {
      const filled = i < xs.length - 1 && !inHole((xs[i] + xs[i + 1]) / 2, zc)
      if (filled && start === null) start = xs[i]
      if (!filled && start !== null) {
        const end = xs[i]
        if (o.under) {
          B.span(mat, start, yTop - 0.02, zs[j], end, yTop, zs[j + 1], { tint })
          B.span(o.under.mat, start, yTop - th, zs[j], end, yTop - 0.02, zs[j + 1], { tint: o.under.tint })
        } else B.span(mat, start, yTop - th, zs[j], end, yTop, zs[j + 1], { tint })
        if (o.solid !== false) B.solidSpan(start, yTop - th, zs[j], end, yTop, zs[j + 1])
        start = null
      }
    }
  }
}

// --- Stairs ---------------------------------------------------------------------------
// Straight flight at (x, y0, z) rising along local +z (after yaw) by `rise` over `run`.
// Visual steps <= 0.3 m + one ramp collider through the step noses.
export function stairs(B, x, y0, z, yaw, w, rise, run, o = {}) {
  const mat = o.mat ?? M.concrete
  const tint = o.tint ?? TINT.white
  const n = Math.max(2, Math.round(rise / 0.27))
  const sh = rise / n
  const tr = run / n
  B.push(x, y0, z, yaw)
  for (let i = 0; i < n; i++) {
    if (o.style === 'open') {
      B.span(mat, -w / 2, (i + 1) * sh - 0.07, i * tr, w / 2, (i + 1) * sh, (i + 1) * tr + 0.03, { tint })
    } else {
      B.span(mat, -w / 2, o.base ?? 0, i * tr, w / 2, (i + 1) * sh, (i + 1) * tr, { tint })
      if (o.nosing) B.span(M.paint, -w / 2, (i + 1) * sh - 0.03, i * tr - 0.02, w / 2, (i + 1) * sh + 0.005, i * tr + 0.06, { tint: o.nosing })
    }
  }
  const L = Math.hypot(n * tr, rise)
  const th = Math.atan2(rise, n * tr)
  if (o.style === 'open') {
    // stringers
    for (const sx of [-w / 2 - 0.05, w / 2 + 0.05]) B.box(o.stringerMat ?? mat, 0.08, 0.28, L, sx, rise / 2 - 0.05, (n * tr) / 2, { rx: -th, tint: o.stringerTint ?? tint })
  }
  const zc = ((n - 2) * tr) / 2
  B.solid(w / 2, 0.15, L / 2, 0, rise / 2 - 0.15 * Math.cos(th), zc + 0.15 * Math.sin(th), { rx: -th })
  const rails = o.rails ?? []
  for (const side of rails) {
    const sx = side === 'left' ? -w / 2 + 0.05 : w / 2 - 0.05
    const rt = o.railTint ?? TINT.frame
    const posts = Math.max(2, Math.round(run / 1.2) + 1)
    for (let k = 0; k < posts; k++) {
      const pz = (k / (posts - 1)) * (n - 1) * tr + tr * 0.5
      const py = ((pz + tr) / (n * tr)) * rise
      B.span(M.paint, sx - 0.03, py, pz - 0.03, sx + 0.03, py + 0.95, pz + 0.03, { tint: rt })
    }
    B.box(M.paint, 0.07, 0.06, L, sx, rise / 2 + 0.95 + sh * 0.5, (n * tr) / 2 - tr / 2, { rx: -th, tint: rt })
    // collider: one vertical slab per step pair, following the nosing exactly
    for (let i = 0; i < n; i += 2) {
      const j = Math.min(n, i + 2)
      B.solidSpan(sx - 0.06, (i + 1) * sh, i * tr, sx + 0.06, (i + 1) * sh + 1.0, j * tr)
    }
  }
  B.pop()
  return { n, sh, tr }
}

// --- Railings ---------------------------------------------------------------------------
// Straight railing from (x0, z0) to (x1, z1) standing on height y.
export function railing(B, x0, z0, x1, z1, y, o = {}) {
  const L = Math.hypot(x1 - x0, z1 - z0)
  if (L < 0.05) return
  const yaw = Math.atan2(-(z1 - z0), x1 - x0)
  const h = o.h ?? 1.0
  const tint = o.tint ?? TINT.frame
  const mat = o.mat ?? M.paint
  B.push(x0, y, z0, yaw)
  const posts = Math.max(1, Math.round(L / (o.spacing ?? 1.4)))
  for (let k = 0; k <= posts; k++) {
    const px = (k / posts) * L
    B.span(mat, px - 0.04, 0, -0.04, px + 0.04, h, 0.04, { tint })
  }
  B.span(mat, -0.04, h - 0.06, -0.05, L + 0.04, h + 0.02, 0.05, { tint })
  if (o.style === 'glass') B.span(M.glass, 0, 0.1, -0.015, L, h - 0.08, 0.015)
  else if (o.style === 'bars') {
    const bars = Math.round(L / 0.26)
    for (let k = 1; k < bars; k++) B.span(mat, (k / bars) * L - 0.015, 0.08, -0.015, (k / bars) * L + 0.015, h - 0.06, 0.015, { tint })
    B.span(mat, 0, 0.06, -0.03, L, 0.1, 0.03, { tint })
  } else {
    B.span(mat, 0, h * 0.5 - 0.03, -0.035, L, h * 0.5 + 0.03, 0.035, { tint })
  }
  if (o.solid !== false) B.solid(L / 2, (o.colliderH ?? h) / 2, 0.06, L / 2, (o.colliderH ?? h) / 2, 0)
  B.pop()
}

// --- Roofs ---------------------------------------------------------------------------------
// Gable roof over [x0..x1] x [z0..z1] (wall centrelines), eaves at y, ridge
// along x rising `rise`. Gable triangles in the wall material, fascia, ridge
// cap, gutters + downpipes, colliders on both planes.
export function gableRoof(B, x0, z0, x1, z1, y, rise, o = {}) {
  const mat = o.mat ?? M.shingle
  const tint = o.tint ?? TINT.terracotta
  const ov = o.ov ?? 0.55
  const t = o.t ?? 0.3
  const th = 0.16
  const zc = (z0 + z1) / 2
  const half = (z1 - z0) / 2
  const pitch = Math.atan2(rise, half)
  const S = (half + ov) / Math.cos(pitch)
  const W = x1 - x0 + ov * 2
  const xc = (x0 + x1) / 2
  const nrm = (s) => ({ y: Math.cos(pitch), z: s * Math.sin(pitch) }) // s = -1 north plane, +1 south
  for (const s of [-1, 1]) {
    const ze = zc + s * (half + ov)
    const ye = y - ov * Math.tan(pitch)
    const mz = (ze + zc) / 2
    const my = (ye + y + rise) / 2
    const n = nrm(s)
    const cz = mz + (n.z * th) / 2
    const cy = my + (n.y * th) / 2
    B.box(mat, W, th, S, xc, cy, cz, { rx: s < 0 ? -pitch : pitch, tint })
    B.solid(W / 2, th / 2, S / 2, xc, cy, cz, { rx: s < 0 ? -pitch : pitch })
    // fascia board along the eave + gutter + downpipes
    const ft = o.trimTint ?? TINT.trim
    B.box(M.paint, W + 0.04, 0.22, 0.05, xc, ye - 0.04, ze + s * 0.03, { tint: ft })
    if (o.gutter !== false) {
      B.box(M.paint, W, 0.12, 0.16, xc, ye - 0.1, ze + s * 0.12, { tint: o.gutterTint ?? 0xe8e8e8 })
      const gy = o.groundY ?? 0
      for (const px of [x0 + 0.25, x1 - 0.25]) {
        const pz = (s < 0 ? z0 : z1) + s * (t / 2 + 0.07)
        B.span(M.paint, px - 0.05, gy + 0.1, pz - 0.05, px + 0.05, ye - 0.1, pz + 0.05, { tint: o.gutterTint ?? 0xe8e8e8 })
        B.span(M.paint, px - 0.05, ye - 0.16, Math.min(pz, ze + s * 0.12), px + 0.05, ye - 0.06, Math.max(pz, ze + s * 0.12), { tint: o.gutterTint ?? 0xe8e8e8 })
        B.span(M.paint, px - 0.09, gy, pz - 0.09, px + 0.09, gy + 0.12, pz + 0.09, { tint: 0x9a9a9a })
      }
    }
  }
  // ridge cap
  B.box(mat, W, 0.14, 0.34, xc, y + rise + th * 0.9, zc, { tint: o.ridgeTint ?? tint })
  // gable triangles + rake boards
  const wm = o.wallMat ?? M.stucco
  const wt = o.wallTint ?? TINT.white
  for (const [gx, sgn] of [[x0, -1], [x1, 1]]) {
    if (o.gables !== false) B.geo(wm, prismGeo(z1 - z0 + t, rise + 0.02, t), gx, y, zc, { ry: Math.PI / 2, tint: wt })
    const rz = half + ov
    for (const s of [-1, 1]) {
      B.box(M.paint, 0.06, 0.24, S + 0.05, gx + sgn * (ov + 0.03), y + rise / 2 - (ov * Math.tan(pitch)) / 2 + 0.05, zc + (s * rz) / 2, { rx: s < 0 ? -pitch : pitch, tint: o.trimTint ?? TINT.trim })
    }
    if (o.vent !== false && rise > 1.4) {
      // little louvred vent in the gable
      const vx = gx + sgn * (t / 2)
      B.span(M.paint, vx, y + rise * 0.42, zc - 0.35, vx + sgn * 0.05, y + rise * 0.42 + 0.5, zc + 0.35, { tint: o.trimTint ?? TINT.trim })
      for (let k = 1; k < 4; k++) B.span(M.paint, vx, y + rise * 0.42 + k * 0.12 - 0.015, zc - 0.3, vx + sgn * 0.08, y + rise * 0.42 + k * 0.12 + 0.015, zc + 0.3, { tint: 0x777777 })
    }
  }
  if (o.chimney) {
    const c = o.chimney
    chimney(B, c.x, c.z, y, rise + (c.above ?? 1.2), c.w ?? 0.9, c.d ?? 0.9)
  }
}

export function chimney(B, x, z, y0, h, w = 0.9, d = 0.9) {
  B.span(M.brick, x - w / 2, y0, z - d / 2, x + w / 2, y0 + h, z + d / 2, { tint: 0xffffff })
  B.span(M.concrete, x - w / 2 - 0.08, y0 + h, z - d / 2 - 0.08, x + w / 2 + 0.08, y0 + h + 0.14, z + d / 2 + 0.08, { tint: 0xd0d0d0 })
  B.cyl(M.paint, 0.13, 0.15, 0.4, x - w * 0.18, y0 + h + 0.34, z, { tint: 0xb5562e, seg: 8 })
  B.cyl(M.paint, 0.13, 0.15, 0.32, x + w * 0.2, y0 + h + 0.3, z, { tint: 0xb5562e, seg: 8 })
}

// Hip / pyramid roof (4-sided cone), apex up `rise`, base half-size hx x hz.
export function pyramidRoof(B, mat, x, y, z, hx, hz, rise, tint = TINT.white, solid = true) {
  const g = cylGeo(0.05, Math.SQRT2, rise, 4)
  g.rotateY(Math.PI / 4)
  B.geo(mat, g, x, y + rise / 2, z, { sx: hx, sz: hz, tint })
  if (solid) B.solid(hx * 0.8, 0.2, hz * 0.8, x, y + 0.2, z)
}

// Flat roof: slab (+holes), parapet with coping.
export function flatRoof(B, x0, z0, x1, z1, y, o = {}) {
  slab(B, x0, z0, x1, z1, y + 0.25, 0.25, o.holes ?? [], { mat: o.mat ?? M.concrete, tint: o.tint ?? 0x9a9da3, under: o.under })
  const ph = o.parapet ?? 0.9
  if (ph > 0) {
    const pt = 0.25
    const pm = o.parapetMat ?? M.stucco
    const tint = o.parapetTint ?? TINT.white
    const yb = y + 0.25
    B.span(pm, x0, yb, z0, x1, yb + ph, z0 + pt, { tint, solid: true })
    B.span(pm, x0, yb, z1 - pt, x1, yb + ph, z1, { tint, solid: true })
    B.span(pm, x0, yb, z0 + pt, x0 + pt, yb + ph, z1 - pt, { tint, solid: true })
    B.span(pm, x1 - pt, yb, z0 + pt, x1, yb + ph, z1 - pt, { tint, solid: true })
    const ct = o.copingTint ?? TINT.trim
    const c = 0.06
    B.span(M.paint, x0 - c, yb + ph, z0 - c, x1 + c, yb + ph + 0.08, z0 + pt + c, { tint: ct })
    B.span(M.paint, x0 - c, yb + ph, z1 - pt - c, x1 + c, yb + ph + 0.08, z1 + c, { tint: ct })
    B.span(M.paint, x0 - c, yb + ph, z0 + pt + c, x0 + pt + c, yb + ph + 0.08, z1 - pt - c, { tint: ct })
    B.span(M.paint, x1 - pt - c, yb + ph, z0 + pt + c, x1 + c, yb + ph + 0.08, z1 - pt - c, { tint: ct })
  }
  // fascia band under the parapet
  if (o.fascia !== false) {
    const ft = o.fasciaTint ?? TINT.trim
    B.span(M.paint, x0 - 0.05, y - 0.05, z0 - 0.05, x1 + 0.05, y + 0.25, z0 + 0.01, { tint: ft })
    B.span(M.paint, x0 - 0.05, y - 0.05, z1 - 0.01, x1 + 0.05, y + 0.25, z1 + 0.05, { tint: ft })
    B.span(M.paint, x0 - 0.05, y - 0.05, z0, x0 + 0.01, y + 0.25, z1, { tint: ft })
    B.span(M.paint, x1 - 0.01, y - 0.05, z0, x1 + 0.05, y + 0.25, z1, { tint: ft })
  }
}

// --- Exterior details --------------------------------------------------------------------
export function acUnit(B, x, y, z, yaw = 0) {
  B.push(x, y, z, yaw)
  B.span(M.paint, -0.45, 0, -0.3, 0.45, 0.65, 0.3, { tint: 0xe9ecef, solid: true })
  B.cyl(M.paint, 0.22, 0.22, 0.03, 0, 0.33, 0.3, { rx: Math.PI / 2, tint: 0x3a3f45, seg: 12 })
  for (let k = -2; k <= 2; k++) B.span(M.paint, -0.22, 0.33 + k * 0.07 - 0.01, 0.3, 0.22, 0.33 + k * 0.07 + 0.01, 0.33, { tint: 0x9aa0a6 })
  B.span(M.paint, -0.4, -0.08, -0.25, -0.34, 0, 0.25, { tint: 0x777777 })
  B.span(M.paint, 0.34, -0.08, -0.25, 0.4, 0, 0.25, { tint: 0x777777 })
  B.pop()
}

export function wallAC(B, x, y, z, yaw = 0) {
  // wall-mounted split unit with bracket
  B.push(x, y, z, yaw)
  B.span(M.paint, -0.42, 0, 0, 0.42, 0.55, 0.32, { tint: 0xeef0f2 })
  B.cyl(M.paint, 0.19, 0.19, 0.03, 0.05, 0.28, 0.33, { rx: Math.PI / 2, tint: 0x3a3f45, seg: 10 })
  B.span(M.paint, -0.36, -0.06, 0, -0.32, 0, 0.36, { tint: 0x666666 })
  B.span(M.paint, 0.32, -0.06, 0, 0.36, 0, 0.36, { tint: 0x666666 })
  B.span(M.paint, 0.36, 0.1, 0.02, 0.4, 0.7, 0.06, { tint: 0xdddddd })
  B.pop()
}

export function waterTank(B, x, y, z) {
  for (const [lx, lz] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) B.span(M.paint, x + lx - 0.05, y, z + lz - 0.05, x + lx + 0.05, y + 0.9, z + lz + 0.05, { tint: 0x6c737a })
  B.cyl(M.paint, 0.95, 0.95, 1.6, x, y + 1.7, z, { tint: 0x2f6fb5, seg: 14, solid: true })
  B.cyl(M.paint, 0.2, 0.95, 0.25, x, y + 2.62, z, { tint: 0x2a62a0, seg: 14 })
}

export function solarPanel(B, x, y, z, yaw = 0) {
  B.push(x, y, z, yaw)
  B.span(M.paint, -0.05, 0, -0.6, 0.05, 0.5, -0.5, { tint: 0x888888 })
  B.span(M.paint, -0.05, 0, 0.5, 0.05, 0.9, 0.6, { tint: 0x888888 })
  B.box(M.dark, 1.8, 0.05, 1.3, 0, 0.72, 0, { rx: -0.35, tint: 0x1d3a6b })
  B.box(M.paint, 1.84, 0.03, 0.03, 0, 0.72 + 0.03, 0, { rx: -0.35, tint: 0xcccccc })
  B.pop()
}

export function antenna(B, x, y, z, h = 3) {
  B.span(M.paint, x - 0.03, y, z - 0.03, x + 0.03, y + h, z + 0.03, { tint: 0xbfc4c9 })
  for (let k = 1; k <= 3; k++) B.span(M.paint, x - 0.4 + k * 0.08, y + h - k * 0.45, z - 0.015, x + 0.4 - k * 0.08, y + h - k * 0.45 + 0.03, z + 0.015, { tint: 0xbfc4c9 })
}

// Wall lamp (sconce) on a face pointing +z.
export function sconce(B, x, y, z) {
  B.span(M.paint, x - 0.08, y - 0.12, z, x + 0.08, y + 0.12, z + 0.04, { tint: 0x2b2b2b })
  B.span(M.bulb, x - 0.07, y - 0.06, z + 0.04, x + 0.07, y + 0.12, z + 0.18)
  B.span(M.paint, x - 0.1, y + 0.12, z + 0.02, x + 0.1, y + 0.16, z + 0.2, { tint: 0x2b2b2b })
}

// --- Signs -----------------------------------------------------------------------------------
// Text panel facing +z at (x, y, z) local, w x h metres, on a backing board.
export function sign(B, text, x, y, z, w, h, opts = {}, yaw = 0) {
  const mat = M.sign(text, opts)
  B.push(x, y, z, yaw)
  if (opts.board !== false) B.span(M.paint, -w / 2 - 0.06, -h / 2 - 0.06, -0.08, w / 2 + 0.06, h / 2 + 0.06, 0, { tint: opts.boardTint ?? 0x2c3138 })
  const g = new PlaneGeometry(w, h)
  B.geo(mat, g, 0, 0, 0.012)
  if (opts.back) B.geo(mat, new PlaneGeometry(w, h), 0, 0, -0.092, { ry: Math.PI })
  B.pop()
  return mat
}

// --- Furniture -------------------------------------------------------------------------------
// All at floor height y, facing +z after yaw.
export function sofa(B, x, y, z, yaw, tint = 0x3f6fb0, len = 2.2) {
  B.push(x, y, z, yaw)
  const d = 0.95
  B.span(M.cloth, -len / 2, 0.12, -d / 2, len / 2, 0.45, d / 2, { tint })
  B.span(M.cloth, -len / 2, 0.12, -d / 2, len / 2, 0.95, -d / 2 + 0.25, { tint })
  B.span(M.cloth, -len / 2, 0.12, -d / 2, -len / 2 + 0.22, 0.68, d / 2, { tint })
  B.span(M.cloth, len / 2 - 0.22, 0.12, -d / 2, len / 2, 0.68, d / 2, { tint })
  const seats = Math.max(2, Math.round((len - 0.44) / 0.75))
  const sw = (len - 0.44) / seats
  for (let k = 0; k < seats; k++) {
    const sx = -len / 2 + 0.22 + k * sw
    B.span(M.cloth, sx + 0.02, 0.45, -d / 2 + 0.27, sx + sw - 0.02, 0.58, d / 2 - 0.02, { tint: lighten(tint, 1.12) })
    B.span(M.cloth, sx + 0.04, 0.5, -d / 2 + 0.25, sx + sw - 0.04, 0.9, -d / 2 + 0.4, { tint: lighten(tint, 1.08) })
  }
  B.span(M.cloth, -len / 2 + 0.3, 0.55, -d / 2 + 0.3, -len / 2 + 0.7, 0.85, -d / 2 + 0.45, { tint: 0xf3d36b })
  for (const lx of [-len / 2 + 0.08, len / 2 - 0.08]) for (const lz of [-d / 2 + 0.08, d / 2 - 0.08]) B.span(M.paint, lx - 0.04, 0, lz - 0.04, lx + 0.04, 0.12, lz + 0.04, { tint: 0x3a2a1a })
  B.solid(len / 2, 0.48, d / 2, 0, 0.48, 0)
  B.pop()
}

export function armchair(B, x, y, z, yaw, tint = 0xb0473f) {
  B.push(x, y, z, yaw)
  B.span(M.cloth, -0.45, 0.12, -0.42, 0.45, 0.45, 0.42, { tint })
  B.span(M.cloth, -0.45, 0.12, -0.42, 0.45, 0.95, -0.2, { tint })
  B.span(M.cloth, -0.45, 0.12, -0.42, -0.3, 0.65, 0.42, { tint })
  B.span(M.cloth, 0.3, 0.12, -0.42, 0.45, 0.65, 0.42, { tint })
  B.span(M.cloth, -0.3, 0.45, -0.2, 0.3, 0.56, 0.4, { tint: lighten(tint, 1.12) })
  B.solid(0.45, 0.48, 0.42, 0, 0.48, 0)
  B.pop()
}

export function table(B, x, y, z, yaw, w = 1.6, d = 0.9, o = {}) {
  B.push(x, y, z, yaw)
  const h = o.h ?? 0.76
  const tint = o.tint ?? TINT.wood
  B.span(o.mat ?? M.wood, -w / 2, h - 0.05, -d / 2, w / 2, h, d / 2, { tint })
  for (const lx of [-w / 2 + 0.07, w / 2 - 0.07]) for (const lz of [-d / 2 + 0.07, d / 2 - 0.07]) B.span(M.wood, lx - 0.04, 0, lz - 0.04, lx + 0.04, h - 0.05, lz + 0.04, { tint: o.legTint ?? darken(tint) })
  if (o.solid !== false) B.solid(w / 2, h / 2, d / 2, 0, h / 2, 0)
  B.pop()
}

export function chair(B, x, y, z, yaw, tint = TINT.darkWood) {
  B.push(x, y, z, yaw)
  B.span(M.wood, -0.22, 0.44, -0.22, 0.22, 0.49, 0.22, { tint })
  B.span(M.wood, -0.22, 0.49, -0.24, 0.22, 0.95, -0.19, { tint })
  for (const lx of [-0.18, 0.18]) for (const lz of [-0.18, 0.18]) B.span(M.wood, lx - 0.025, 0, lz - 0.025, lx + 0.025, 0.44, lz + 0.025, { tint })
  B.pop()
}

export function diningSet(B, x, y, z, yaw, n = 3, tint = TINT.wood) {
  const w = n * 0.7 + 0.2
  table(B, x, y, z, yaw, w, 1.0, { tint })
  B.push(x, y, z, yaw)
  for (let k = 0; k < n; k++) {
    const cx = -w / 2 + 0.45 + k * 0.7
    chair(B, cx, 0, -0.75, 0, darken(tint))
    chair(B, cx, 0, 0.75, Math.PI, darken(tint))
  }
  // a bowl + plates
  B.cyl(M.paint, 0.18, 0.12, 0.1, 0, 0.81, 0, { tint: 0xf4efe6, seg: 10 })
  for (let k = 0; k < 3; k++) B.geo(M.leaf, new IcosahedronGeometry(0.06, 0), -0.05 + k * 0.05, 0.89, (k % 2) * 0.04, { tint: [0xe8402a, 0xf2c230, 0x7bc043][k] })
  B.pop()
}

export function coffeeTable(B, x, y, z, yaw) {
  B.push(x, y, z, yaw)
  B.span(M.wood, -0.6, 0.36, -0.35, 0.6, 0.42, 0.35, { tint: TINT.darkWood })
  B.span(M.wood, -0.55, 0.06, -0.3, 0.55, 0.1, 0.3, { tint: TINT.darkWood })
  for (const lx of [-0.55, 0.55]) for (const lz of [-0.3, 0.3]) B.span(M.wood, lx - 0.03, 0, lz - 0.03, lx + 0.03, 0.36, lz + 0.03, { tint: TINT.darkWood })
  B.span(M.paint, -0.3, 0.42, -0.1, -0.05, 0.47, 0.12, { tint: 0xc0392b })
  B.span(M.paint, 0.1, 0.42, -0.05, 0.3, 0.44, 0.15, { tint: 0xeeeeee })
  B.pop()
}

export function bed(B, x, y, z, yaw, tint = 0x5f9fd8, double = true) {
  B.push(x, y, z, yaw)
  const w = double ? 1.7 : 1.0
  const L = 2.1
  B.span(M.wood, -w / 2, 0.1, -L / 2, w / 2, 0.38, L / 2, { tint: TINT.darkWood })
  B.span(M.cloth, -w / 2 + 0.04, 0.38, -L / 2 + 0.04, w / 2 - 0.04, 0.58, L / 2 - 0.04, { tint: 0xf6f4ef })
  B.span(M.cloth, -w / 2 + 0.02, 0.5, -L / 2 + 0.6, w / 2 - 0.02, 0.62, L / 2 - 0.02, { tint })
  B.span(M.cloth, -w / 2 + 0.02, 0.2, L / 2 - 0.02, w / 2 - 0.02, 0.62, L / 2 + 0.01, { tint })
  const pillows = double ? [-w / 4, w / 4] : [0]
  for (const px of pillows) B.span(M.cloth, px - 0.32, 0.58, -L / 2 + 0.12, px + 0.32, 0.72, -L / 2 + 0.5, { tint: 0xffffff })
  B.span(M.wood, -w / 2 - 0.04, 0.1, -L / 2 - 0.08, w / 2 + 0.04, 1.15, -L / 2, { tint: TINT.darkWood })
  for (const lx of [-w / 2 + 0.05, w / 2 - 0.05]) for (const lz of [-L / 2 + 0.05, L / 2 - 0.05]) B.span(M.wood, lx - 0.04, 0, lz - 0.04, lx + 0.04, 0.1, lz + 0.04, { tint: TINT.darkWood })
  B.solid(w / 2, 0.36, L / 2, 0, 0.36, 0)
  // bedside table + lamp
  B.span(M.wood, w / 2 + 0.1, 0, -L / 2 + 0.05, w / 2 + 0.6, 0.55, -L / 2 + 0.5, { tint: TINT.wood })
  B.cyl(M.paint, 0.05, 0.08, 0.25, w / 2 + 0.35, 0.68, -L / 2 + 0.27, { tint: 0x444444, seg: 8 })
  B.cyl(M.cloth, 0.1, 0.17, 0.2, w / 2 + 0.35, 0.88, -L / 2 + 0.27, { tint: 0xfff1cc, seg: 10 })
  B.pop()
}

export function bookshelf(B, x, y, z, yaw, w = 1.8, h = 2.0) {
  B.push(x, y, z, yaw)
  const d = 0.4
  B.span(M.wood, -w / 2, 0, -d / 2, w / 2, h, -d / 2 + 0.04, { tint: TINT.darkWood })
  B.span(M.wood, -w / 2, 0, -d / 2, -w / 2 + 0.05, h, d / 2, { tint: TINT.darkWood })
  B.span(M.wood, w / 2 - 0.05, 0, -d / 2, w / 2, h, d / 2, { tint: TINT.darkWood })
  B.span(M.wood, -w / 2, h - 0.05, -d / 2, w / 2, h, d / 2, { tint: TINT.darkWood })
  // books block: face UVs show the whole spine image per 2 shelves
  const rows = Math.max(1, Math.round(h / 1.0))
  for (let k = 0; k < rows; k++) {
    const y0 = k * (h / rows)
    const g = new BoxGeometry(w - 0.1, h / rows - 0.05, d - 0.08)
    B.geo(M.books, g, 0, y0 + (h / rows) / 2, 0.02)
  }
  B.solid(w / 2, h / 2, d / 2, 0, h / 2, 0)
  B.pop()
}

export function wardrobe(B, x, y, z, yaw, w = 1.4, tint = 0xf2ece0) {
  B.push(x, y, z, yaw)
  B.span(M.wood, -w / 2, 0, -0.3, w / 2, 2.1, 0.3, { tint, solid: true })
  B.span(M.paint, -0.01, 0.1, 0.3, 0.01, 2.0, 0.31, { tint: 0x777777 })
  B.span(M.chrome, -0.12, 1.0, 0.3, -0.08, 1.3, 0.34, { tint: 0xcccccc })
  B.span(M.chrome, 0.08, 1.0, 0.3, 0.12, 1.3, 0.34, { tint: 0xcccccc })
  B.pop()
}

// Kitchen run: base cabinets with worktop, sink, hob, wall cabinets above.
export function kitchen(B, x, y, z, yaw, len = 3.2, o = {}) {
  B.push(x, y, z, yaw)
  const ct = o.tint ?? 0xffffff
  B.span(M.wood, -len / 2, 0.08, -0.3, len / 2, 0.88, 0.3, { tint: ct })
  B.span(M.paint, -len / 2, 0, -0.26, len / 2, 0.08, 0.26, { tint: 0x333333 })
  B.span(M.stone, -len / 2 - 0.02, 0.88, -0.32, len / 2 + 0.02, 0.93, 0.33, { tint: 0x8a8f96 })
  const doors = Math.round(len / 0.6)
  for (let k = 0; k < doors; k++) {
    const dx = -len / 2 + (k + 0.5) * (len / doors)
    B.span(M.paint, dx - 0.01, 0.12, 0.3, dx + 0.01, 0.84, 0.305, { tint: 0x999999 })
    B.span(M.chrome, dx + 0.08, 0.7, 0.3, dx + 0.2, 0.73, 0.33, { tint: 0xcccccc })
  }
  B.span(M.chrome, -len / 4 - 0.3, 0.9, -0.2, -len / 4 + 0.3, 0.935, 0.2, { tint: 0xbfc5cc })
  B.span(M.chrome, -len / 4 - 0.02, 0.93, -0.25, -len / 4 + 0.02, 1.2, -0.21, { tint: 0xbfc5cc })
  B.span(M.dark, len / 4 - 0.3, 0.93, -0.25, len / 4 + 0.3, 0.945, 0.25, { tint: 0x1a1a1a })
  for (const [hx, hz] of [[-0.14, -0.12], [0.14, -0.12], [-0.14, 0.12], [0.14, 0.12]]) B.cyl(M.paint, 0.08, 0.08, 0.01, len / 4 + hx, 0.952, hz, { tint: 0x555555, seg: 10 })
  if (o.upper !== false) {
    B.span(M.wood, -len / 2, 1.5, -0.3, len / 2, 2.2, 0.02, { tint: ct })
    for (let k = 0; k < doors; k++) B.span(M.paint, -len / 2 + (k + 0.5) * (len / doors) - 0.01, 1.52, 0.02, -len / 2 + (k + 0.5) * (len / doors) + 0.01, 2.18, 0.025, { tint: 0x999999 })
  }
  B.solid(len / 2, 0.47, 0.32, 0, 0.47, 0)
  B.pop()
}

export function fridge(B, x, y, z, yaw) {
  B.push(x, y, z, yaw)
  B.span(M.gloss, -0.42, 0, -0.35, 0.42, 1.95, 0.35, { tint: 0xe8ecef, solid: true })
  B.span(M.paint, -0.42, 1.25, 0.35, 0.42, 1.27, 0.36, { tint: 0x9aa0a6 })
  B.span(M.chrome, 0.3, 1.35, 0.35, 0.34, 1.8, 0.4, { tint: 0xcccccc })
  B.span(M.chrome, 0.3, 0.5, 0.35, 0.34, 1.15, 0.4, { tint: 0xcccccc })
  B.pop()
}

export function tvUnit(B, x, y, z, yaw) {
  B.push(x, y, z, yaw)
  B.span(M.wood, -0.9, 0, -0.22, 0.9, 0.5, 0.22, { tint: TINT.darkWood, solid: true })
  B.span(M.dark, -0.65, 0.58, -0.05, 0.65, 1.32, 0.0, { tint: 0x101317 })
  B.span(M.paint, -0.7, 0.55, -0.07, 0.7, 1.36, -0.04, { tint: 0x222222 })
  B.span(M.paint, -0.1, 0.5, -0.06, 0.1, 0.58, 0.02, { tint: 0x222222 })
  B.pop()
}

export function desk(B, x, y, z, yaw, o = {}) {
  B.push(x, y, z, yaw)
  B.span(M.wood, -0.8, 0.72, -0.4, 0.8, 0.77, 0.4, { tint: o.tint ?? 0xd8c4a4 })
  B.span(M.wood, -0.8, 0, -0.4, -0.74, 0.72, 0.4, { tint: o.tint ?? 0xd8c4a4 })
  B.span(M.wood, 0.3, 0, -0.4, 0.8, 0.72, 0.4, { tint: o.tint ?? 0xd8c4a4 })
  B.span(M.dark, -0.35, 0.82, -0.3, 0.35, 1.25, -0.26, { tint: 0x0d1b2a })
  B.span(M.paint, -0.38, 0.79, -0.32, 0.38, 1.28, -0.3, { tint: 0x222222 })
  B.span(M.paint, -0.05, 0.77, -0.33, 0.05, 0.82, -0.25, { tint: 0x222222 })
  B.span(M.paint, -0.3, 0.77, -0.05, 0.25, 0.79, 0.12, { tint: 0x333333 })
  B.solid(0.8, 0.39, 0.4, 0, 0.39, 0)
  // office chair
  B.cyl(M.paint, 0.04, 0.04, 0.4, 0, 0.22, 0.65, { tint: 0x333333, seg: 6 })
  B.span(M.cloth, -0.25, 0.42, 0.42, 0.25, 0.5, 0.9, { tint: o.chairTint ?? 0x2c3e50 })
  B.span(M.cloth, -0.24, 0.5, 0.86, 0.24, 1.05, 0.92, { tint: o.chairTint ?? 0x2c3e50 })
  B.pop()
}

export function plant(B, x, y, z, s = 1, tint = 0x3f9c35) {
  B.cyl(M.paint, 0.22 * s, 0.16 * s, 0.4 * s, x, y + 0.2 * s, z, { tint: 0xc0643a, seg: 10 })
  B.geo(M.leaf, new IcosahedronGeometry(0.4 * s, 0), x, y + 0.72 * s, z, { tint, sy: 1.2 })
  B.geo(M.leaf, new IcosahedronGeometry(0.28 * s, 0), x + 0.15 * s, y + 1.05 * s, z - 0.05 * s, { tint: lighten(tint, 1.2) })
}

export function floorLamp(B, x, y, z) {
  B.cyl(M.paint, 0.18, 0.2, 0.04, x, y + 0.02, z, { tint: 0x333333, seg: 10 })
  B.cyl(M.paint, 0.02, 0.02, 1.5, x, y + 0.77, z, { tint: 0x333333, seg: 6 })
  B.cyl(M.cloth, 0.15, 0.25, 0.32, x, y + 1.62, z, { tint: 0xfff0c8, seg: 12 })
}

export function rug(B, x, y, z, w, d, mat, yaw = 0) {
  B.push(x, y, z, yaw)
  const g = new PlaneGeometry(w, d)
  g.rotateX(-Math.PI / 2)
  B.geo(mat, g, 0, 0.012, 0)
  B.pop()
}

export function counter(B, x, y, z, yaw, len = 3, o = {}) {
  B.push(x, y, z, yaw)
  B.span(o.mat ?? M.wood, -len / 2, 0, -0.35, len / 2, 1.0, 0.35, { tint: o.tint ?? 0x8a5a34 })
  B.span(M.stone, -len / 2 - 0.05, 1.0, -0.4, len / 2 + 0.05, 1.06, 0.45, { tint: o.topTint ?? 0xe9e4da })
  B.span(M.paint, -len / 2, 0, 0.35, len / 2, 0.12, 0.38, { tint: 0x333333 })
  B.solid(len / 2, 0.53, 0.4, 0, 0.53, 0)
  B.pop()
}

export function stool(B, x, y, z, tint = 0xc0392b) {
  B.cyl(M.chrome, 0.03, 0.03, 0.7, x, y + 0.35, z, { tint: 0xcccccc, seg: 6 })
  B.cyl(M.chrome, 0.18, 0.18, 0.03, x, y + 0.02, z, { tint: 0xcccccc, seg: 10 })
  B.cyl(M.cloth, 0.2, 0.2, 0.08, x, y + 0.74, z, { tint, seg: 12 })
}

export function cafeTable(B, x, y, z, o = {}) {
  B.cyl(M.paint, 0.4, 0.4, 0.04, x, y + 0.74, z, { tint: o.top ?? 0xf4f1ea, seg: 14 })
  B.cyl(M.paint, 0.03, 0.03, 0.72, x, y + 0.37, z, { tint: 0x333333, seg: 6 })
  B.cyl(M.paint, 0.22, 0.22, 0.03, x, y + 0.015, z, { tint: 0x333333, seg: 10 })
  B.solidCyl(0.4, 0.76, x, y + 0.38, z)
  const n = o.chairs ?? 2
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + (o.rot ?? 0)
    chair(B, x + Math.sin(a) * 0.7, y, z + Math.cos(a) * 0.7, a + Math.PI, o.chair ?? 0x2f6f4f)
  }
  if (o.umbrella) {
    B.cyl(M.paint, 0.025, 0.025, 2.4, x, y + 1.2, z, { tint: 0xeeeeee, seg: 6 })
    B.geo(o.umbrella, cylGeo(0.05, 1.3, 0.45, 8, true), x, y + 2.25, z)
  }
}

export function shelfRack(B, x, y, z, yaw, len = 3, h = 3, o = {}) {
  B.push(x, y, z, yaw)
  const d = 1.0
  const pt = o.tint ?? 0x2f6db5
  for (const lx of [-len / 2, len / 2]) for (const lz of [-d / 2, d / 2]) B.span(M.paint, lx - 0.05, 0, lz - 0.05, lx + 0.05, h, lz + 0.05, { tint: pt })
  const levels = Math.round(h / 1.0)
  const rand = mulberry32(o.seed ?? 7)
  for (let k = 0; k < levels; k++) {
    const ly = 0.1 + k * (h / levels)
    B.span(M.paint, -len / 2, ly, -d / 2, len / 2, ly + 0.08, d / 2, { tint: 0xf28c28 })
    let cx = -len / 2 + 0.1
    while (cx < len / 2 - 0.6) {
      const bw = 0.5 + rand() * 0.5
      const bh = 0.35 + rand() * 0.4
      if (rand() < 0.8) {
        if (rand() < 0.5) B.span(M.paint, cx, ly + 0.08, -0.4, cx + bw, ly + 0.08 + bh, 0.4, { tint: [0xc49a6c, 0xb88b5c, 0xd8b484][Math.floor(rand() * 3)] })
        else B.geo(M.crate, new BoxGeometry(bw, bh, 0.8), cx + bw / 2, ly + 0.08 + bh / 2, 0)
      }
      cx += bw + 0.08
    }
  }
  B.solid(len / 2 + 0.05, h / 2, d / 2 + 0.05, 0, h / 2, 0)
  B.pop()
}

export function lockers(B, x, y, z, yaw, n = 4) {
  B.push(x, y, z, yaw)
  const w = n * 0.45
  B.span(M.metal, -w / 2, 0, -0.25, w / 2, 1.9, 0.25, { tint: 0x7a8fa6, solid: true })
  for (let k = 0; k < n; k++) {
    const lx = -w / 2 + (k + 0.5) * 0.45
    B.span(M.paint, lx - 0.21, 0.05, 0.25, lx + 0.21, 1.85, 0.27, { tint: 0x8aa0b8 })
    for (let s = 0; s < 3; s++) B.span(M.paint, lx - 0.12, 1.55 + s * 0.06, 0.27, lx + 0.12, 1.57 + s * 0.06, 0.28, { tint: 0x3a4652 })
  }
  B.pop()
}

export function consoleDesk(B, x, y, z, yaw, len = 2.4) {
  B.push(x, y, z, yaw)
  B.span(M.paint, -len / 2, 0, -0.4, len / 2, 0.8, 0.4, { tint: 0xc9cdd2 })
  B.box(M.paint, len, 0.08, 0.5, 0, 0.88, 0.05, { rx: -0.3, tint: 0x5b6670 })
  for (let k = 0; k < Math.round(len / 0.8); k++) {
    const lx = -len / 2 + 0.4 + k * 0.8
    B.span(M.dark, lx - 0.32, 0.98, -0.36, lx + 0.32, 1.42, -0.32, { tint: k % 2 ? 0x0f3b2c : 0x0d2a4a })
    B.span(M.paint, lx - 0.34, 0.96, -0.38, lx + 0.34, 1.44, -0.36, { tint: 0x222222 })
  }
  for (let k = 0; k < 10; k++) B.span(M.decal, -len / 2 + 0.2 + k * (len - 0.4) / 10, 0.92, 0.05, -len / 2 + 0.26 + k * (len - 0.4) / 10, 0.94, 0.1, { tint: [0xff4444, 0x44ff66, 0xffcc33][k % 3] })
  B.solid(len / 2, 0.45, 0.4, 0, 0.45, 0)
  B.pop()
}

export function serverRack(B, x, y, z, yaw) {
  B.push(x, y, z, yaw)
  B.span(M.paint, -0.35, 0, -0.5, 0.35, 2.0, 0.5, { tint: 0x22262b, solid: true })
  for (let k = 0; k < 8; k++) {
    B.span(M.paint, -0.3, 0.15 + k * 0.22, 0.5, 0.3, 0.32 + k * 0.22, 0.51, { tint: 0x3a4048 })
    B.span(M.decal, 0.18, 0.22 + k * 0.22, 0.51, 0.22, 0.25 + k * 0.22, 0.52, { tint: k % 3 ? 0x44ff77 : 0xffaa22 })
  }
  B.pop()
}

// --- Street + yard props -----------------------------------------------------------------
export function bench(B, x, y, z, yaw, o = {}) {
  B.push(x, y, z, yaw)
  const L = o.len ?? 1.8
  const st = o.tint ?? 0xb0743f
  for (let k = 0; k < 3; k++) B.span(M.wood, -L / 2, 0.42, -0.25 + k * 0.17, L / 2, 0.47, -0.25 + k * 0.17 + 0.13, { tint: st })
  if (o.back !== false) for (let k = 0; k < 2; k++) B.box(M.wood, L, 0.12, 0.04, 0, 0.62 + k * 0.17, -0.31, { rx: 0.15, tint: st })
  for (const lx of [-L / 2 + 0.15, L / 2 - 0.15]) {
    B.span(M.paint, lx - 0.04, 0, -0.28, lx + 0.04, 0.42, -0.2, { tint: 0x2f3337 })
    B.span(M.paint, lx - 0.04, 0, 0.18, lx + 0.04, 0.42, 0.26, { tint: 0x2f3337 })
    if (o.back !== false) B.span(M.paint, lx - 0.04, 0.42, -0.36, lx + 0.04, 0.95, -0.3, { tint: 0x2f3337 })
  }
  B.solid(L / 2, 0.24, 0.3, 0, 0.24, 0)
  B.pop()
}

export function trashBin(B, x, y, z, tint = 0x2e7d4f) {
  B.cyl(M.metal, 0.3, 0.27, 0.95, x, y + 0.475, z, { tint, seg: 12, solid: true })
  B.cyl(M.paint, 0.33, 0.33, 0.06, x, y + 0.98, z, { tint: 0x333333, seg: 12 })
}

export function planter(B, x, y, z, w = 1.6, d = 0.8, o = {}) {
  B.span(o.mat ?? M.wood, x - w / 2, y, z - d / 2, x + w / 2, y + 0.55, z + d / 2, { tint: o.tint ?? 0x8a5a34, solid: true })
  B.span(M.paint, x - w / 2 + 0.06, y + 0.5, z - d / 2 + 0.06, x + w / 2 - 0.06, y + 0.56, z + d / 2 - 0.06, { tint: 0x4a3322 })
  const n = Math.max(1, Math.round(w / 0.6))
  for (let k = 0; k < n; k++) {
    const px = x - w / 2 + (k + 0.5) * (w / n)
    B.geo(M.leaf, new IcosahedronGeometry(0.32, 0), px, y + 0.75, z, { tint: k % 2 ? 0x4caf3a : 0x3e9b33, sy: 0.85 })
    B.geo(M.leaf, new IcosahedronGeometry(0.1, 0), px + 0.1, y + 0.98, z + 0.12, { tint: o.flowers ?? [0xff5f8a, 0xffd23f, 0xffffff][k % 3] })
  }
}

export function hedge(B, x0, z0, x1, z1, h = 1.3, y = 0) {
  const L = Math.hypot(x1 - x0, z1 - z0)
  const yaw = Math.atan2(-(z1 - z0), x1 - x0)
  B.push(x0, y, z0, yaw)
  B.span(M.hedge, 0, 0, -0.45, L, h, 0.45, { tint: 0xffffff })
  B.span(M.hedge, 0.08, h, -0.37, L - 0.08, h + 0.12, 0.37, { tint: 0xf0fff0 })
  B.solid(L / 2, (h + 0.1) / 2, 0.45, L / 2, (h + 0.1) / 2, 0)
  B.pop()
}

export function stoneWall(B, x0, z0, x1, z1, h = 1.1, y = 0, o = {}) {
  const L = Math.hypot(x1 - x0, z1 - z0)
  const yaw = Math.atan2(-(z1 - z0), x1 - x0)
  B.push(x0, y, z0, yaw)
  B.span(M.stone, 0, -0.3, -0.3, L, h, 0.3, { tint: o.tint ?? 0xffffff })
  B.span(M.concrete, -0.05, h, -0.36, L + 0.05, h + 0.12, 0.36, { tint: o.cap ?? 0xc8c4bc })
  B.solid(L / 2, (h + 0.12) / 2, 0.32, L / 2, (h + 0.12) / 2, 0)
  B.pop()
}

export function picketFence(B, x0, z0, x1, z1, o = {}) {
  const L = Math.hypot(x1 - x0, z1 - z0)
  const yaw = Math.atan2(-(z1 - z0), x1 - x0)
  const h = o.h ?? 1.0
  const tint = o.tint ?? 0xffffff
  const y = o.y ?? 0
  B.push(x0, y, z0, yaw)
  const n = Math.max(1, Math.floor(L / 0.24))
  for (let k = 0; k < n; k++) {
    const px = (k + 0.5) * (L / n)
    B.span(M.wood, px - 0.05, 0, -0.02, px + 0.05, h - 0.04 - (k % 2) * 0.06, 0.02, { tint })
  }
  for (const ry of [0.25, h - 0.3]) B.span(M.wood, 0, ry, 0.02, L, ry + 0.08, 0.06, { tint })
  const posts = Math.max(1, Math.round(L / 2.4))
  for (let k = 0; k <= posts; k++) B.span(M.wood, (k / posts) * L - 0.06, 0, -0.06, (k / posts) * L + 0.06, h + 0.05, 0.08, { tint })
  if (o.solid !== false) B.solid(L / 2, h / 2, 0.08, L / 2, h / 2, 0)
  B.pop()
}

// Rustic rail fence (farm): posts + 2 rails.
export function railFence(B, x0, z0, x1, z1, o = {}) {
  const L = Math.hypot(x1 - x0, z1 - z0)
  const yaw = Math.atan2(-(z1 - z0), x1 - x0)
  const tint = o.tint ?? 0x9b7048
  B.push(x0, o.y ?? 0, z0, yaw)
  const posts = Math.max(1, Math.round(L / 2.2))
  for (let k = 0; k <= posts; k++) B.span(M.wood, (k / posts) * L - 0.07, 0, -0.07, (k / posts) * L + 0.07, 1.2, 0.07, { tint: darken(tint) })
  for (const ry of [0.45, 0.95]) B.span(M.wood, 0, ry, 0.07, L, ry + 0.12, 0.13, { tint })
  if (o.solid !== false) B.solid(L / 2, 0.6, 0.1, L / 2, 0.6, 0)
  B.pop()
}

export function crate(B, x, y, z, s = 1.0, yaw = 0, solid = true) {
  B.geo(M.crate, new BoxGeometry(s, s, s), x, y + s / 2, z, { ry: yaw })
  if (solid) B.solid(s / 2, s / 2, s / 2, x, y + s / 2, z, { ry: yaw })
}

export function barrel(B, x, y, z, tint = 0x2f6db5, solid = true) {
  B.cyl(M.metal, 0.36, 0.36, 1.1, x, y + 0.55, z, { tint, seg: 14 })
  for (const ry of [0.2, 0.55, 0.9]) B.cyl(M.paint, 0.375, 0.375, 0.05, x, y + ry, z, { tint: darken(tint), seg: 14 })
  B.cyl(M.paint, 0.33, 0.33, 0.02, x, y + 1.105, z, { tint: lighten(tint, 1.1), seg: 14 })
  if (solid) B.solidCyl(0.36, 1.1, x, y + 0.55, z)
}

export function pallet(B, x, y, z, yaw = 0, load = 0, seed = 1) {
  B.push(x, y, z, yaw)
  for (let k = 0; k < 5; k++) B.span(M.wood, -0.6, 0.11, -0.5 + k * 0.23, 0.6, 0.15, -0.5 + k * 0.23 + 0.16, { tint: 0xc9a06a })
  for (const lx of [-0.55, 0, 0.55]) B.span(M.wood, lx - 0.06, 0, -0.5, lx + 0.06, 0.11, 0.5, { tint: 0xa8804e })
  if (load) {
    const rand = mulberry32(seed)
    if (load === 1) {
      for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let c = 0; c < 2; c++) B.span(M.paint, -0.55 + a * 0.56, 0.15 + c * 0.42, -0.48 + b * 0.5, -0.03 + a * 0.56, 0.55 + c * 0.42, -0.02 + b * 0.5, { tint: [0xc49a6c, 0xb88b5c, 0xd8b484][Math.floor(rand() * 3)] })
      B.span(M.glass, -0.58, 0.15, -0.51, 0.58, 1.0, 0.51)
    } else {
      for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) barrel(B, -0.3 + a * 0.6, 0.15, -0.25 + b * 0.5, [0xd8402a, 0x2f6db5, 0x3f9c35][(a + b) % 3], false)
    }
    B.solid(0.6, 0.6, 0.52, 0, 0.6, 0)
  } else B.solid(0.6, 0.08, 0.52, 0, 0.08, 0)
  B.pop()
}

export function mailbox(B, x, y, z, yaw, tint = 0x2f6db5) {
  B.push(x, y, z, yaw)
  B.span(M.wood, -0.05, 0, -0.05, 0.05, 1.0, 0.05, { tint: 0x7a5232 })
  B.span(M.paint, -0.18, 1.0, -0.28, 0.18, 1.25, 0.28, { tint })
  B.cyl(M.paint, 0.18, 0.18, 0.56, 0, 1.25, 0, { rx: Math.PI / 2, tint, seg: 10 })
  B.span(M.paint, 0.18, 1.15, -0.05, 0.21, 1.45, -0.01, { tint: 0xe53935 })
  B.pop()
}

export function hydrant(B, x, y, z) {
  B.cyl(M.paint, 0.16, 0.18, 0.7, x, y + 0.35, z, { tint: 0xd8322a, seg: 10 })
  B.cyl(M.paint, 0.1, 0.17, 0.16, x, y + 0.78, z, { tint: 0xd8322a, seg: 10 })
  B.cyl(M.paint, 0.07, 0.07, 0.4, x, y + 0.5, z, { rz: Math.PI / 2, tint: 0xe8e8e8, seg: 8 })
}

// Street lamp: returns the world position of its bulb.
export function streetLamp(B, x, y, z, yaw = 0, o = {}) {
  const h = o.h ?? 5.2
  const pt = o.tint ?? 0x2f3a40
  B.push(x, y, z, yaw)
  B.cyl(M.paint, 0.2, 0.24, 0.5, 0, 0.25, 0, { tint: pt, seg: 10 })
  B.cyl(M.paint, 0.07, 0.1, h, 0, h / 2, 0, { tint: pt, seg: 8 })
  B.span(M.paint, -0.05, h - 0.12, -0.04, 0.05, h - 0.02, 1.2, { tint: pt })
  B.span(M.paint, -0.22, h - 0.22, 0.95, 0.22, h - 0.02, 1.6, { tint: pt })
  B.span(M.bulb, -0.17, h - 0.3, 1.0, 0.17, h - 0.22, 1.55)
  B.solidCyl(0.12, h, 0, h / 2, 0)
  const p = B.P(0, h - 0.4, 1.28)
  B.pop()
  return p
}

// Wooden utility pole: returns the world points of its 3 insulators.
export function utilityPole(B, x, y, z, yaw = 0) {
  const h = 8.5
  B.push(x, y, z, yaw)
  B.cyl(M.wood, 0.13, 0.17, h, 0, h / 2, 0, { tint: 0x7a5434, seg: 8 })
  B.span(M.wood, -1.1, h - 0.9, -0.07, 1.1, h - 0.75, 0.07, { tint: 0x6a4a2e })
  B.box(M.wood, 0.06, 0.06, 1.1, -0.55, h - 1.1, 0, { rz: 0.8, ry: Math.PI / 2, tint: 0x6a4a2e })
  const pts = []
  for (const ix of [-0.95, 0, 0.95]) {
    B.cyl(M.paint, 0.05, 0.06, 0.18, ix, h - 0.66, 0, { tint: 0x6fb7c8, seg: 6 })
    pts.push(B.P(ix, h - 0.55, 0))
  }
  // transformer can on some poles
  if (yaw % 2 > 1) B.cyl(M.paint, 0.28, 0.28, 0.8, 0, h - 2.2, 0.3, { tint: 0x8a9399, seg: 10 })
  B.solidCyl(0.16, h, 0, h / 2, 0)
  B.pop()
  return pts
}

// Sagging cable between two world points (in the batch's root frame).
export function cable(B, a, b, sag = 0.9, segs = 8, tint = 0x1c1c1c) {
  let px = a.x
  let py = a.y
  let pz = a.z
  for (let k = 1; k <= segs; k++) {
    const t = k / segs
    const x = a.x + (b.x - a.x) * t
    const z = a.z + (b.z - a.z) * t
    const y = a.y + (b.y - a.y) * t - sag * 4 * t * (1 - t)
    const L = Math.hypot(x - px, y - py, z - pz)
    const yaw = Math.atan2(-(z - pz), x - px) // direction in xz
    const pitch = Math.atan2(y - py, Math.hypot(x - px, z - pz))
    B.box(M.paint, L + 0.02, 0.035, 0.035, (x + px) / 2, (y + py) / 2, (z + pz) / 2, { ry: yaw, rz: pitch, tint })
    px = x
    py = y
    pz = z
  }
}

// Billboard on two posts with a catwalk and spot lamps; text faces +z.
export function billboard(B, x, y, z, yaw, text, opts = {}) {
  B.push(x, y, z, yaw)
  const w = opts.w ?? 8
  const h = opts.h ?? 3.4
  const lift = opts.lift ?? 3.2
  for (const px of [-w / 3, w / 3]) {
    B.span(M.paint, px - 0.2, 0, -0.24, px + 0.2, lift + h - 0.05, -0.13, { tint: 0x4f5960 })
    B.solid(0.2, (lift + h) / 2, 0.12, px, (lift + h) / 2, -0.185)
  }
  B.span(M.paint, -w / 2 - 0.1, lift - 0.1, -0.25, w / 2 + 0.1, lift + h + 0.1, -0.12, { tint: 0x30373d })
  if (opts.poster) B.geo(M.poster(opts.poster), new PlaneGeometry(w, h), 0, lift + h / 2, -0.108)
  else sign(B, text, 0, lift + h / 2, -0.12, w, h, { board: false, ...opts })
  if (opts.backPoster) B.geo(M.poster(opts.backPoster), new PlaneGeometry(w, h), 0, lift + h / 2, -0.262, { ry: Math.PI })
  B.span(M.plate, -w / 2, lift - 0.25, -0.1, w / 2, lift - 0.18, 0.7, { tint: 0xbbbbbb })
  for (const px of [-w / 3, 0, w / 3]) {
    B.span(M.paint, px - 0.03, lift - 0.2, 0.6, px + 0.03, lift + 0.3, 0.66, { tint: 0x333333 })
    B.box(M.paint, 0.3, 0.18, 0.3, px, lift + 0.4, 0.62, { rx: 0.6, tint: 0x333333 })
  }
  B.pop()
}

// --- Vehicles --------------------------------------------------------------------------------
// A car facing +z. type: 'sedan' | 'hatch' | 'suv' | 'van' | 'pickup'
export function car(B, x, y, z, yaw, color = 0xd23b3b, type = 'sedan', o = {}) {
  B.push(x, y, z, yaw)
  const W = type === 'van' ? 2.0 : type === 'suv' ? 1.95 : 1.85
  const L = type === 'van' ? 5.0 : type === 'pickup' ? 5.2 : type === 'hatch' ? 3.9 : type === 'suv' ? 4.6 : 4.5
  const lowY = 0.32
  const bodyH = type === 'van' ? 1.25 : type === 'suv' ? 0.85 : 0.68
  // lower body
  B.span(M.gloss, -W / 2, lowY, -L / 2 + 0.12, W / 2, lowY + bodyH, L / 2 - 0.12, { tint: color })
  B.span(M.gloss, -W / 2 + 0.06, lowY + 0.08, -L / 2, W / 2 - 0.06, lowY + bodyH - 0.12, L / 2, { tint: color })
  // bumpers + grille + lights + plates
  for (const s of [-1, 1]) {
    B.span(M.paint, -W / 2 + 0.02, lowY - 0.02, s * L / 2 - 0.08, W / 2 - 0.02, lowY + 0.2, s * L / 2 + 0.05, { tint: 0x2a2d31 })
    B.span(M.paint, -0.25, lowY + 0.04, s * L / 2 + 0.05, 0.25, lowY + 0.17, s * L / 2 + 0.07, { tint: 0xf4f4f4 })
    for (const lx of [-W / 2 + 0.28, W / 2 - 0.28]) {
      B.span(s > 0 ? M.bulb : M.paint, lx - 0.2, lowY + bodyH - 0.3, s * L / 2 - 0.02, lx + 0.2, lowY + bodyH - 0.14, s * L / 2 + 0.02, { tint: s > 0 ? 0xffffff : 0xd8201a })
    }
  }
  B.span(M.dark, -0.4, lowY + 0.22, L / 2 - 0.02, 0.4, lowY + bodyH - 0.33, L / 2 + 0.02, { tint: 0x1a1d21 })
  // wheels
  const wr = type === 'van' || type === 'suv' || type === 'pickup' ? 0.4 : 0.36
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const wz = sz * (L / 2 - (type === 'hatch' ? 0.7 : 0.85))
      B.cyl(M.rubber, wr, wr, 0.26, sx * (W / 2 - 0.1), wr, wz, { rz: Math.PI / 2, seg: 12 })
      B.cyl(M.chrome, wr * 0.55, wr * 0.55, 0.28, sx * (W / 2 - 0.1), wr, wz, { rz: Math.PI / 2, seg: 10, tint: 0xd8dde2 })
      B.span(M.paint, sx * (W / 2) - 0.02, lowY + 0.15, wz - wr - 0.12, sx * (W / 2) + 0.02, lowY + 0.3, wz + wr + 0.12, { tint: darken(color) })
    }
  }
  // cabin
  const cabY = lowY + bodyH
  if (type === 'van') {
    B.span(M.dark, -W / 2 + 0.04, cabY - 0.55, L / 2 - 1.1, W / 2 - 0.04, cabY - 0.05, L / 2 - 0.55, { tint: 0x22303c })
    B.box(M.dark, W - 0.1, 0.6, 0.06, 0, cabY - 0.3, L / 2 - 0.5, { rx: -0.45, tint: 0x22303c })
    B.span(M.gloss, -W / 2, cabY - 0.05, -L / 2 + 0.12, W / 2, cabY + 0.6, L / 2 - 0.9, { tint: color })
    B.span(M.dark, -W / 2 - 0.01, cabY + 0.05, L / 2 - 2.3, W / 2 + 0.01, cabY + 0.45, L / 2 - 1.2, { tint: 0x22303c })
    B.span(M.paint, -W / 2 - 0.02, lowY + 0.35, -L / 2 + 0.6, W / 2 + 0.02, lowY + 0.65, L / 2 - 1.4, { tint: o.stripe ?? 0xffffff })
  } else {
    const cl = type === 'pickup' ? 1.9 : type === 'hatch' ? 2.0 : type === 'suv' ? 2.6 : 2.3
    const cz = type === 'pickup' ? 0.55 : type === 'hatch' ? -0.35 : type === 'suv' ? -0.3 : -0.15
    const ch = type === 'suv' ? 0.62 : 0.55
    const cab = new BoxGeometry(W - 0.14, ch, cl)
    const p = cab.attributes.position
    for (let i = 0; i < p.count; i++) {
      if (p.getY(i) > 0) {
        p.setX(i, p.getX(i) * 0.9)
        const zz = p.getZ(i)
        const back = type === 'hatch' || type === 'suv' ? 0.12 : 0.35
        p.setZ(i, zz > 0 ? zz - 0.45 : zz + back)
      }
    }
    cab.computeVertexNormals()
    B.geo(M.dark, cab, 0, cabY + ch / 2, cz, { tint: 0x2a3a48 })
    // roof + pillars in body colour
    B.span(M.gloss, -(W - 0.14) * 0.45, cabY + ch, cz - cl / 2 + (type === 'hatch' || type === 'suv' ? 0.12 : 0.35), (W - 0.14) * 0.45, cabY + ch + 0.05, cz + cl / 2 - 0.45, { tint: color })
    for (const sx of [-1, 1]) B.span(M.gloss, sx * (W / 2 - 0.12) - 0.04, cabY, cz - 0.05, sx * (W / 2 - 0.12) + 0.04, cabY + ch - 0.02, cz + 0.05, { tint: color })
    if (type === 'pickup') {
      B.span(M.gloss, -W / 2, cabY, -L / 2 + 0.12, -W / 2 + 0.08, cabY + 0.35, cz - cl / 2, { tint: color })
      B.span(M.gloss, W / 2 - 0.08, cabY, -L / 2 + 0.12, W / 2, cabY + 0.35, cz - cl / 2, { tint: color })
      B.span(M.gloss, -W / 2, cabY, -L / 2 + 0.12, W / 2, cabY + 0.35, -L / 2 + 0.2, { tint: color })
      B.span(M.plate, -W / 2 + 0.08, cabY - 0.02, -L / 2 + 0.2, W / 2 - 0.08, cabY + 0.01, cz - cl / 2, { tint: 0x777777 })
    }
    // mirrors
    for (const sx of [-1, 1]) B.span(M.gloss, sx * (W / 2) - 0.06, cabY + 0.05, cz + cl / 2 - 0.55, sx * (W / 2) + sx * 0.14, cabY + 0.2, cz + cl / 2 - 0.4, { tint: color })
    if (o.roofRack) for (const sx of [-0.6, 0.6]) B.span(M.chrome, sx - 0.03, cabY + ch + 0.05, cz - cl / 3, sx + 0.03, cabY + ch + 0.1, cz + cl / 4, { tint: 0x999999 })
  }
  const top = type === 'van' ? lowY + bodyH + 0.6 : lowY + bodyH + 0.55
  B.solid(W / 2, top / 2, L / 2, 0, top / 2, 0)
  B.pop()
}

// --- Colour helpers ------------------------------------------------------------------------
export function lighten(hex, k = 1.15) {
  const r = Math.min(255, ((hex >> 16) & 255) * k)
  const g = Math.min(255, ((hex >> 8) & 255) * k)
  const b = Math.min(255, (hex & 255) * k)
  return (r << 16) | (g << 8) | b
}
export function darken(hex, k = 0.7) {
  return lighten(hex, k)
}



// --- Flags -----------------------------------------------------------------------------------
// Waving flag hanging from (x, y, z) toward local +x: `bands` horizontal stripes
// (colours top to bottom). uv.x runs 0 at the pole -> 1 at the fly end (the
// M.flag shader waves by it).
function flagStrip(w, h, segs) {
  const pos = []
  const uv = []
  const idx = []
  for (let i = 0; i <= segs; i++) {
    pos.push((i / segs) * w, -h / 2, 0, (i / segs) * w, h / 2, 0)
    uv.push(i / segs, 0, i / segs, 1)
  }
  for (let i = 0; i < segs; i++) {
    const a = i * 2
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}
export function flag(B, x, y, z, bands = [0x2f6fd0, 0xffffff, 0x2f6fd0], w = 1.8, h = 1.1, yaw = 0) {
  const bh = h / bands.length
  B.push(x, y, z, yaw)
  bands.forEach((c, i) => B.geo(M.flag, flagStrip(w, bh, 8), 0, h / 2 - bh * (i + 0.5), 0, { tint: c }))
  B.pop()
}

// Chain-link fence from (x0, z0) to (x1, z1): posts, top rail, see-through mesh, collider.
export function chainFence(B, x0, z0, x1, z1, o = {}) {
  const L = Math.hypot(x1 - x0, z1 - z0)
  if (L < 0.1) return
  const yaw = Math.atan2(-(z1 - z0), x1 - x0)
  const h = o.h ?? 2.2
  B.push(x0, o.y ?? 0, z0, yaw)
  const posts = Math.max(1, Math.round(L / 2.5))
  for (let k = 0; k <= posts; k++) B.cyl(M.chrome, 0.045, 0.045, h + 0.1, (k / posts) * L, (h + 0.1) / 2, 0, { tint: 0xb8bec4, seg: 6 })
  B.box(M.chrome, L, 0.05, 0.05, L / 2, h, 0, { tint: 0xb8bec4 })
  B.box(M.chain, L, h - 0.1, 0.01, L / 2, (h - 0.1) / 2 + 0.05, 0)
  if (o.wire !== false) for (let k = 0; k < 3; k++) B.box(M.paint, L, 0.015, 0.015, L / 2, h + 0.15 + k * 0.12, 0.08, { tint: 0x777777 })
  B.solid(L / 2, h / 2, 0.06, L / 2, h / 2, 0)
  B.pop()
}

// Shipping container, length along local x, doors at +x. o: { len (6.06 | 12.19),
// color, open (walkable inside, doors swung back), logo: text or null }
export function container(B, x, y, z, yaw, o = {}) {
  const L = o.len ?? 6.06
  const W = 2.44
  const H = 2.6
  const c = o.color ?? 0xc0392b
  const fr = darken(c, 0.62)
  B.push(x, y, z, yaw)
  const t = 0.05
  if (!o.open) {
    B.span(M.metal, -L / 2 + 0.08, 0.12, -W / 2 + 0.04, L / 2 - 0.08, H - 0.12, W / 2 - 0.04, { tint: c })
    B.solid(L / 2, H / 2, W / 2, 0, H / 2, 0)
    // doors: seam, lock bars, handles, hinges
    const dx = L / 2 - 0.08
    B.span(M.metal, dx, 0.14, -W / 2 + 0.1, dx + 0.04, H - 0.14, W / 2 - 0.1, { tint: lighten(c, 1.05) })
    B.span(M.paint, dx + 0.04, 0.14, -0.015, dx + 0.06, H - 0.14, 0.015, { tint: fr })
    for (const bz of [-0.85, -0.35, 0.35, 0.85]) {
      B.cyl(M.chrome, 0.025, 0.025, H - 0.3, dx + 0.09, H / 2, bz, { tint: 0xa8adb2, seg: 6 })
      B.span(M.chrome, dx + 0.05, 1.05, bz - 0.04, dx + 0.12, 1.25, bz + 0.04, { tint: 0x8a9096 })
      B.span(M.paint, dx + 0.1, 1.12, bz, dx + 0.14, 1.16, bz + (bz > 0 ? -0.22 : 0.22), { tint: 0x8a9096 })
    }
    for (const hz of [-W / 2 + 0.12, W / 2 - 0.12]) for (const hy of [0.4, 1.3, 2.2]) B.span(M.paint, dx + 0.04, hy, hz - 0.06, dx + 0.1, hy + 0.12, hz + 0.06, { tint: fr })
  } else {
    B.span(M.floorWood, -L / 2 + 0.12, 0, -W / 2 + 0.12, L / 2 - 0.12, 0.13, W / 2 - 0.12, { tint: 0x9b7048 })
    B.solid(L / 2, 0.07, W / 2, 0, 0.07, 0)
    for (const s of [-1, 1]) {
      B.span(M.metal, -L / 2 + 0.08, 0.14, s * (W / 2 - 0.04) - t / 2, L / 2 - 0.08, H - 0.12, s * (W / 2 - 0.04) + t / 2, { tint: c })
      B.solid(L / 2, H / 2, t, 0, H / 2, s * (W / 2 - 0.04))
      // door leaf swung back flat against the outside of the side wall
      B.span(M.metal, L / 2 - W / 2 - 0.02, 0.16, s * (W / 2 + 0.03), L / 2 - 0.04, H - 0.16, s * (W / 2 + 0.07), { tint: lighten(c, 1.05) })
      for (const bx of [L / 2 - 0.35, L / 2 - 0.85]) B.cyl(M.chrome, 0.025, 0.025, H - 0.3, bx, H / 2, s * (W / 2 + 0.1), { tint: 0xa8adb2, seg: 6 })
    }
    B.span(M.metal, -L / 2 + 0.06, 0.14, -W / 2 + 0.04, -L / 2 + 0.11, H - 0.12, W / 2 - 0.04, { tint: c })
    B.solid(0.05, H / 2, W / 2, -L / 2 + 0.08, H / 2, 0)
    B.span(M.metal, -L / 2 + 0.08, H - 0.14, -W / 2 + 0.04, L / 2 - 0.08, H - 0.08, W / 2 - 0.04, { tint: c })
    B.solid(L / 2, 0.05, W / 2, 0, H - 0.1, 0)
  }
  // frame: corner posts, top/bottom rails, corner castings
  const px = (sx) => (sx > 0 ? [L / 2 - 0.12, L / 2] : [-L / 2, -L / 2 + 0.12])
  const pz = (sz) => (sz > 0 ? [W / 2 - 0.12, W / 2] : [-W / 2, -W / 2 + 0.12])
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const [xa, xb] = px(sx)
      const [za, zb] = pz(sz)
      B.span(M.paint, xa, 0, za, xb, H, zb, { tint: fr })
      B.span(M.paint, xa - 0.01, H - 0.16, za - 0.01, xb + 0.01, H + 0.01, zb + 0.01, { tint: 0x4a4e53 })
      B.span(M.paint, xa - 0.01, -0.01, za - 0.01, xb + 0.01, 0.16, zb + 0.01, { tint: 0x4a4e53 })
    }
  }
  for (const sz of [-1, 1]) {
    const [za, zb] = pz(sz)
    B.span(M.paint, -L / 2, 0, za, L / 2, 0.14, zb, { tint: fr })
    B.span(M.paint, -L / 2, H - 0.12, za, L / 2, H, zb, { tint: fr })
  }
  for (const sx of [-1, 1]) {
    const [xa, xb] = px(sx)
    B.span(M.paint, xa, H - 0.12, -W / 2, xb, H, W / 2, { tint: fr })
    B.span(M.paint, xa, 0, -W / 2, xb, 0.14, W / 2, { tint: fr })
  }
  if (o.logo) {
    const mat = M.sign(o.logo, { bg: 'rgba(0,0,0,0)', fg: '#ffffff', border: null, w: 512, h: 128, font: '700 80px Fredoka, sans-serif' })
    mat.transparent = true
    mat.alphaTest = 0.4
    for (const s of [-1, 1]) {
      const g = new PlaneGeometry(Math.min(4, L * 0.6), 1.0)
      B.geo(mat, g, -0.3, H * 0.62, s * (W / 2 + 0.005), { ry: s > 0 ? 0 : Math.PI })
    }
  }
  B.pop()
}

// Solid board (privacy) fence: one boarded panel per run + posts + top cap; full cover.
export function boardFence(B, x0, z0, x1, z1, o = {}) {
  const L = Math.hypot(x1 - x0, z1 - z0)
  if (L < 0.1) return
  const yaw = Math.atan2(-(z1 - z0), x1 - x0)
  const h = o.h ?? 1.6
  const tint = o.tint ?? 0xc9a27a
  B.push(x0, o.y ?? 0, z0, yaw)
  B.span(M.boardsV, 0, 0.05, -0.03, L, h, 0.03, { tint })
  B.span(M.wood, -0.03, h, -0.06, L + 0.03, h + 0.07, 0.06, { tint: darken(tint, 0.85) })
  const posts = Math.max(1, Math.round(L / 2.4))
  for (let k = 0; k <= posts; k++) B.span(M.wood, (k / posts) * L - 0.07, 0, -0.08, (k / posts) * L + 0.07, h + 0.12, 0.08, { tint: darken(tint, 0.8) })
  B.solid(L / 2, h / 2, 0.08, L / 2, h / 2, 0)
  B.pop()
}
