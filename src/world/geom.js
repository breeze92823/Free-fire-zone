// Geometry plumbing for the island: world-scaled UVs, a few custom shapes, and
// Batch, the builder every district uses. A Batch collects transformed
// geometry per material straight into flat arrays (no Mesh per part) and
// emits ONE mesh per material when built, so a whole district costs one draw
// call per material. It keeps a frame stack (push/pop a local origin + yaw)
// so buildings are written in their own coordinates, and registers Rapier
// colliders in the same frames.
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Euler,
  Group,
  Matrix3,
  Matrix4,
  Mesh,
  Quaternion,
  Vector3,
} from 'three'
import { RAPIER, addFixed } from '../physics.js'

const Y_AXIS = new Vector3(0, 1, 0)
const _m = new Matrix4()
const _m2 = new Matrix4()
const _nm = new Matrix3()
const _q = new Quaternion()
const _e = new Euler(0, 0, 0, 'YXZ')
const _v = new Vector3()
const _s = new Vector3()
const _c = new Color()

// --- UVs in metres -------------------------------------------------------------
// Box projection: each vertex takes the two coordinates of the plane its normal
// faces, so a 10 m wall and a 1 m wall show the same texel density (the
// material's texture.repeat = 1 / tile size in metres). (ox, oy, oz) shifts the
// projection so neighbouring pieces of one wall line up.
export function projectUV(g, ox = 0, oy = 0, oz = 0) {
  const p = g.attributes.position
  if (!g.attributes.normal) g.computeVertexNormals()
  const n = g.attributes.normal
  const uv = new Float32Array(p.count * 2)
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + ox
    const y = p.getY(i) + oy
    const z = p.getZ(i) + oz
    const nx = n.getX(i)
    const ny = n.getY(i)
    const nz = n.getZ(i)
    const ax = Math.abs(nx)
    const ay = Math.abs(ny)
    const az = Math.abs(nz)
    let u
    let v
    if (ax >= ay && ax >= az) {
      u = nx > 0 ? -z : z
      v = y
    } else if (ay >= az) {
      u = x
      v = ny > 0 ? -z : z
    } else {
      u = nz > 0 ? x : -x
      v = y
    }
    uv[i * 2] = u
    uv[i * 2 + 1] = v
  }
  g.setAttribute('uv', new BufferAttribute(uv, 2))
  return g
}

// Box with metre UVs, centred on its origin.
export function boxGeo(w, h, d, ox = 0, oy = 0, oz = 0) {
  return projectUV(new BoxGeometry(w, h, d), ox, oy, oz)
}

// Cylinder/cone with metre UVs (u around the circumference, v up; caps planar).
export function cylGeo(rTop, rBot, h, seg = 12, open = false) {
  const g = new CylinderGeometry(rTop, rBot, h, seg, 1, open)
  const uv = g.attributes.uv
  const p = g.attributes.position
  const n = g.attributes.normal
  const circ = Math.PI * (rTop + rBot)
  for (let i = 0; i < p.count; i++) {
    if (Math.abs(n.getY(i)) > 0.999) uv.setXY(i, p.getX(i), p.getZ(i))
    else uv.setXY(i, uv.getX(i) * circ, p.getY(i))
  }
  return g
}

// Triangular prism: a gable end. Base `w` wide on y=0, apex `h` up at x=0, `t` thick along z.
export function prismGeo(w, h, t, apexX = 0) {
  const a = [-w / 2, 0]
  const b = [w / 2, 0]
  const c = [apexX, h]
  const z0 = -t / 2
  const z1 = t / 2
  const pos = []
  const tri = (p, q, r) => pos.push(...p, ...q, ...r)
  const quad = (p, q, r, s) => {
    tri(p, q, r)
    tri(p, r, s)
  }
  tri([a[0], a[1], z1], [b[0], b[1], z1], [c[0], c[1], z1]) // front (+z)
  tri([b[0], b[1], z0], [a[0], a[1], z0], [c[0], c[1], z0]) // back
  quad([b[0], b[1], z1], [b[0], b[1], z0], [c[0], c[1], z0], [c[0], c[1], z1]) // right slope
  quad([a[0], a[1], z0], [a[0], a[1], z1], [c[0], c[1], z1], [c[0], c[1], z0]) // left slope
  quad([a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1], z1], [a[0], a[1], z1]) // bottom
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.computeVertexNormals()
  return projectUV(g)
}

// Flat quad strip along a polyline (roads, kerbs, lines). pts = [[x, z], ...];
// the strip spans offsets [a, b] to the left (+) of travel. u = metres along,
// v = metres across. Returns a BufferGeometry in world XZ at height y.
export function ribbonGeo(pts, a, b, y = 0) {
  const pos = []
  const uv = []
  const idx = []
  let along = 0
  for (let i = 0; i < pts.length; i++) {
    const [x, z] = pts[i]
    const prev = pts[Math.max(0, i - 1)]
    const next = pts[Math.min(pts.length - 1, i + 1)]
    let dx = next[0] - prev[0]
    let dz = next[1] - prev[1]
    const len = Math.hypot(dx, dz) || 1
    dx /= len
    dz /= len
    // left of travel (seen from above, +x east, +z south): (dz, -dx)
    const lx = dz
    const lz = -dx
    if (i > 0) along += Math.hypot(x - pts[i - 1][0], z - pts[i - 1][1])
    pos.push(x + lx * a, y, z + lz * a, x + lx * b, y, z + lz * b)
    uv.push(along, a, along, b)
    if (i > 0) {
      const k = (i - 1) * 2
      idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3)
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  // make sure the strip faces up
  const n = g.attributes.normal
  if (n.count && n.getY(0) < 0) {
    const ix = g.index.array
    for (let i = 0; i < ix.length; i += 3) {
      const t = ix[i + 1]
      ix[i + 1] = ix[i + 2]
      ix[i + 2] = t
    }
    g.computeVertexNormals()
  }
  return g
}

// --- Collider soup ------------------------------------------------------------------
// Static colliders gathered into ONE trimesh per soup. Rapier's broadphase gets
// expensive with thousands of small fixed colliders next to a large one (the
// terrain heightfield): ~2.5 ms per step for 2600 boxes vs ~0.01 ms for the
// same boxes as 20 trimeshes. Boxes keep their exact shape (12 triangles).
const CORNER_FACES = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]]
export class ColliderSoup {
  constructor() {
    this.pos = []
    this.idx = []
    this.count = 0
  }

  // Cuboid with half extents (hx, hy, hz) under world matrix m (a Matrix4).
  box(hx, hy, hz, m) {
    const e = m.elements
    const base = this.pos.length / 3
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const x = sx * hx
          const y = sy * hy
          const z = sz * hz
          this.pos.push(e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14])
        }
      }
    }
    for (const [a, b, c, d] of CORNER_FACES) this.idx.push(base + a, base + b, base + c, base + a, base + c, base + d)
    this.count++
  }

  // Upright n-sided prism (cylinder stand-in) of radius r, height h, centred at (x, y, z) world.
  prism(r, h, x, y, z, n = 8) {
    const base = this.pos.length / 3
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2
      const px = x + Math.cos(a) * r
      const pz = z + Math.sin(a) * r
      this.pos.push(px, y - h / 2, pz, px, y + h / 2, pz)
    }
    for (let k = 0; k < n; k++) {
      const a0 = base + k * 2
      const a1 = base + ((k + 1) % n) * 2
      this.idx.push(a0, a0 + 1, a1 + 1, a0, a1 + 1, a1)
    }
    for (let k = 1; k < n - 1; k++) {
      this.idx.push(base, base + (k + 1) * 2, base + k * 2)
      this.idx.push(base + 1, base + k * 2 + 1, base + (k + 1) * 2 + 1)
    }
    this.count++
  }

  // Register the trimesh with the physics world (no-op when empty).
  build() {
    if (!this.idx.length) return null
    const c = addFixed(RAPIER.ColliderDesc.trimesh(new Float32Array(this.pos), new Uint32Array(this.idx)), { x: 0, y: 0, z: 0 })
    this.pos = []
    this.idx = []
    return c
  }
}

// Island-wide grid of soups: every static collider lands in the soup of the
// 32 m cell holding its centre, so each trimesh stays compact and a character
// only ever queries the few cells around it. flushColliders() builds them.
const SOUP_CELL = 32
const soups = new Map()
function soupAt(x, z) {
  const k = Math.floor(x / SOUP_CELL) * 4096 + Math.floor(z / SOUP_CELL)
  let s = soups.get(k)
  if (!s) soups.set(k, (s = new ColliderSoup()))
  return s
}
// World-space cuboid (half extents, matrix) into the grid.
export function staticBox(hx, hy, hz, m) {
  soupAt(m.elements[12], m.elements[14]).box(hx, hy, hz, m)
}
export function staticPrism(r, h, x, y, z, n = 8) {
  soupAt(x, z).prism(r, h, x, y, z, n)
}
// Raw world-space triangles (pos xyz array + index list), binned by centroid.
export function staticTris(pos, idx) {
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3
    const b = idx[i + 1] * 3
    const c = idx[i + 2] * 3
    const s = soupAt((pos[a] + pos[b] + pos[c]) / 3, (pos[a + 2] + pos[b + 2] + pos[c + 2]) / 3)
    const base = s.pos.length / 3
    s.pos.push(pos[a], pos[a + 1], pos[a + 2], pos[b], pos[b + 1], pos[b + 2], pos[c], pos[c + 1], pos[c + 2])
    s.idx.push(base, base + 1, base + 2)
  }
}
// Create the trimesh colliders; returns their handles.
export function flushColliders() {
  const out = []
  for (const s of soups.values()) {
    const c = s.build()
    if (c) out.push(c)
  }
  soups.clear()
  return out
}

// --- Batch ------------------------------------------------------------------------
// Box faces: outward normal + corners (unit signs) counter-clockwise from outside.
const FACE_N = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]
const FACE_C = [
  [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]],
  [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]],
  [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]],
  [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]],
  [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]],
  [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]],
]

class Bucket {
  constructor(mat) {
    this.mat = mat
    this.pos = []
    this.nor = []
    this.uv = []
    this.col = mat.vertexColors ? [] : null
    this.idx = []
    this.count = 0
  }
}

export class Batch {
  constructor(name = 'batch') {
    this.name = name
    this.buckets = new Map()
    this.stack = [new Matrix4()]
    this.yaws = [0]
    this.colliders = 0
    this.tris = 0
  }

  get top() {
    return this.stack[this.stack.length - 1]
  }

  // Enter a local frame: origin (x, y, z) and yaw (radians about +Y) relative to the current frame.
  push(x = 0, y = 0, z = 0, yaw = 0) {
    _m.makeRotationY(yaw).setPosition(x, y, z)
    this.stack.push(this.top.clone().multiply(_m))
    this.yaws.push(this.yaws[this.yaws.length - 1] + yaw)
    return this
  }

  pop() {
    if (this.stack.length > 1) {
      this.stack.pop()
      this.yaws.pop()
    }
    return this
  }

  // Current frame's yaw relative to the world.
  get yaw() {
    return this.yaws[this.yaws.length - 1]
  }

  // Local point -> world point (a new plain object).
  P(x, y, z) {
    _v.set(x, y, z).applyMatrix4(this.top)
    return { x: _v.x, y: _v.y, z: _v.z }
  }

  // Raw add: geometry already in local-frame coordinates, plus an optional local matrix.
  add(mat, g, local = null, tint = 0xffffff) {
    if (mat.userData.alias) {
      if (tint === 0xffffff) tint = mat.userData.aliasTint ?? tint
      mat = mat.userData.alias
    }
    let b = this.buckets.get(mat)
    if (!b) this.buckets.set(mat, (b = new Bucket(mat)))
    const m = local ? _m2.multiplyMatrices(this.top, local) : _m2.copy(this.top)
    _nm.getNormalMatrix(m)
    const e = m.elements
    const ne = _nm.elements
    const flip = m.determinant() < 0
    if (!g.attributes.normal) g.computeVertexNormals()
    const p = g.attributes.position
    const n = g.attributes.normal
    const uv = g.attributes.uv
    const col = g.attributes.color
    const base = b.count
    if (b.col) _c.set(tint)
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i)
      const y = p.getY(i)
      const z = p.getZ(i)
      b.pos.push(e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14])
      const nx = n.getX(i)
      const ny = n.getY(i)
      const nz = n.getZ(i)
      let ox = ne[0] * nx + ne[3] * ny + ne[6] * nz
      let oy = ne[1] * nx + ne[4] * ny + ne[7] * nz
      let oz = ne[2] * nx + ne[5] * ny + ne[8] * nz
      const l = Math.hypot(ox, oy, oz) || 1
      b.nor.push(ox / l, oy / l, oz / l)
      if (uv) b.uv.push(uv.getX(i), uv.getY(i))
      else b.uv.push(0, 0)
      if (b.col) {
        if (col) b.col.push(col.getX(i) * _c.r, col.getY(i) * _c.g, col.getZ(i) * _c.b)
        else b.col.push(_c.r, _c.g, _c.b)
      }
    }
    if (g.index) {
      const ix = g.index.array
      for (let i = 0; i < ix.length; i += 3) {
        if (flip) b.idx.push(base + ix[i], base + ix[i + 2], base + ix[i + 1])
        else b.idx.push(base + ix[i], base + ix[i + 1], base + ix[i + 2])
      }
      this.tris += ix.length / 3
    } else {
      for (let i = 0; i < p.count; i += 3) {
        if (flip) b.idx.push(base + i, base + i + 2, base + i + 1)
        else b.idx.push(base + i, base + i + 1, base + i + 2)
      }
      this.tris += p.count / 3
    }
    b.count += p.count
    return this
  }

  // Geometry placed at (x, y, z) with rotation (rx, ry, rz, order YXZ) and scale.
  geo(mat, g, x = 0, y = 0, z = 0, o = {}) {
    _e.set(o.rx || 0, o.ry || 0, o.rz || 0, 'YXZ')
    _q.setFromEuler(_e)
    const s = o.s ?? 1
    _s.set(o.sx ?? s, o.sy ?? s, o.sz ?? s)
    _m.compose(_v.set(x, y, z), _q, _s)
    return this.add(mat, g, _m.clone(), o.tint ?? 0xffffff)
  }

  // Box centred at (x, y, z), metre UVs (projection continuous within the frame
  // unless rotated). o: { rx, ry, rz, tint, solid, faceUV }
  box(mat, w, h, d, x, y, z, o = {}) {
    const rot = o.rx || o.ry || o.rz
    if (o.faceUV) this.geo(mat, new BoxGeometry(w, h, d), x, y, z, o)
    else {
      _e.set(o.rx || 0, o.ry || 0, o.rz || 0, 'YXZ')
      _q.setFromEuler(_e)
      _m.compose(_v.set(x, y, z), _q, _s.set(1, 1, 1))
      _m2.multiplyMatrices(this.top, _m)
      this._box(mat, w / 2, h / 2, d / 2, _m2, rot ? 0 : x, rot ? 0 : y, rot ? 0 : z, o.tint ?? 0xffffff)
    }
    if (o.solid) this.solid(w / 2, h / 2, d / 2, x, y, z, o)
    return this
  }

  // Fast path: 24 vertices written straight into the bucket (no BufferGeometry).
  _box(mat, hx, hy, hz, m, ox, oy, oz, tint) {
    if (mat.userData.alias) {
      if (tint === 0xffffff) tint = mat.userData.aliasTint ?? tint
      mat = mat.userData.alias
    }
    let b = this.buckets.get(mat)
    if (!b) this.buckets.set(mat, (b = new Bucket(mat)))
    _nm.getNormalMatrix(m)
    const e = m.elements
    const ne = _nm.elements
    if (b.col) _c.set(tint)
    const base = b.count
    for (let f = 0; f < 6; f++) {
      const [nx, ny, nz] = FACE_N[f]
      let wx = ne[0] * nx + ne[3] * ny + ne[6] * nz
      let wy = ne[1] * nx + ne[4] * ny + ne[7] * nz
      let wz = ne[2] * nx + ne[5] * ny + ne[8] * nz
      const l = Math.hypot(wx, wy, wz) || 1
      wx /= l
      wy /= l
      wz /= l
      const corners = FACE_C[f]
      for (let k = 0; k < 4; k++) {
        const c = corners[k]
        const px = c[0] * hx
        const py = c[1] * hy
        const pz = c[2] * hz
        b.pos.push(e[0] * px + e[4] * py + e[8] * pz + e[12], e[1] * px + e[5] * py + e[9] * pz + e[13], e[2] * px + e[6] * py + e[10] * pz + e[14])
        b.nor.push(wx, wy, wz)
        const ux = px + ox
        const uy = py + oy
        const uz = pz + oz
        if (nx) b.uv.push(nx > 0 ? -uz : uz, uy)
        else if (ny) b.uv.push(ux, ny > 0 ? -uz : uz)
        else b.uv.push(nz > 0 ? ux : -ux, uy)
        if (b.col) b.col.push(_c.r, _c.g, _c.b)
      }
      const i0 = base + f * 4
      b.idx.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3)
    }
    b.count += 24
    this.tris += 12
  }

  // Axis-aligned box from min to max corner (local frame).
  span(mat, x0, y0, z0, x1, y1, z1, o = {}) {
    const w = Math.abs(x1 - x0)
    const h = Math.abs(y1 - y0)
    const d = Math.abs(z1 - z0)
    if (w < 1e-4 || h < 1e-4 || d < 1e-4) return this
    return this.box(mat, w, h, d, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, o)
  }

  cyl(mat, rTop, rBot, h, x, y, z, o = {}) {
    const g = cylGeo(rTop, rBot, h, o.seg ?? 12, o.open)
    this.geo(mat, g, x, y, z, o)
    if (o.solid) this.solidCyl(Math.max(rTop, rBot), h, x, y, z)
    return this
  }

  // Fixed cuboid collider in the current frame (half extents, centre, local rotation).
  solid(hx, hy, hz, x, y, z, o = {}) {
    _e.set(o.rx || 0, o.ry || 0, o.rz || 0, 'YXZ')
    _q.setFromEuler(_e)
    _m.compose(_v.set(x, y, z), _q, _s.set(1, 1, 1))
    _m2.multiplyMatrices(this.top, _m)
    staticBox(hx, hy, hz, _m2)
    this.colliders++
    return this
  }

  solidSpan(x0, y0, z0, x1, y1, z1) {
    return this.solid(Math.abs(x1 - x0) / 2, Math.abs(y1 - y0) / 2, Math.abs(z1 - z0) / 2, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
  }

  solidCyl(r, h, x, y, z) {
    const p = this.P(x, y, z)
    staticPrism(r, h, p.x, p.y, p.z)
    this.colliders++
    return this
  }

  // One mesh per material. Materials with userData.noShadow never cast.
  build(parent, castShadow = true) {
    const group = new Group()
    group.name = this.name
    for (const b of this.buckets.values()) {
      if (!b.count) continue
      const g = new BufferGeometry()
      g.setAttribute('position', new BufferAttribute(new Float32Array(b.pos), 3))
      g.setAttribute('normal', new BufferAttribute(new Float32Array(b.nor), 3))
      g.setAttribute('uv', new BufferAttribute(new Float32Array(b.uv), 2))
      if (b.col) g.setAttribute('color', new BufferAttribute(new Float32Array(b.col), 3))
      g.setIndex(new BufferAttribute(b.count > 65535 ? new Uint32Array(b.idx) : new Uint16Array(b.idx), 1))
      g.computeBoundingSphere()
      const mesh = new Mesh(g, b.mat)
      mesh.name = `${this.name}:${b.mat.name || b.mat.type}`
      mesh.castShadow = castShadow && !b.mat.userData.noShadow
      mesh.receiveShadow = !b.mat.userData.noReceive
      mesh.matrixAutoUpdate = false
      if (b.mat.userData.renderOrder) mesh.renderOrder = b.mat.userData.renderOrder
      group.add(mesh)
    }
    this.buckets.clear()
    parent.add(group)
    return group
  }
}

// Quaternion for a yaw about +Y (Rapier-style object).
export function yawQ(yaw) {
  return { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }
}

export { Y_AXIS }
