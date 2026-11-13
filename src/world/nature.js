// Vegetation and rocks, all instanced: each kind is one InstancedMesh (a few
// draw calls for the whole island). Low-poly faceted look: clustered
// icosahedron canopies, cone cypresses, palms with drooping fronds, squashed
// bushes with flower buds, jittered rocks, flower patches and grass tufts.
// Canopies, fronds and grass sway with one shared time uniform.
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  DoubleSide,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Object3D,
  OctahedronGeometry,
  TetrahedronGeometry,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { staticBox, staticPrism } from './geom.js'
import { mulberry32 } from '../textures.js'

const windTime = { value: 0 }

// Gentle sway: displacement grows with height above `pivot` (geometry space),
// phase from the instance position so neighbours move out of step.
function windify(mat, amount, pivot, key) {
  mat.onBeforeCompile = (s) => {
    s.uniforms.uWind = windTime
    s.vertexShader = 'uniform float uWind;\n' + s.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       float wh = max(0.0, position.y - ${pivot.toFixed(2)});
       float wp = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.23;
       transformed.x += sin(uWind * 1.3 + wp) * wh * ${amount.toFixed(4)};
       transformed.z += cos(uWind * 1.1 + wp * 1.3) * wh * ${(amount * 0.7).toFixed(4)};`,
    )
  }
  mat.customProgramCacheKey = () => `wind:${key}`
}

// Per-vertex colour on a (non-indexed) geometry.
function paint(g, hex) {
  const c = new Color(hex)
  const n = g.attributes.position.count
  const col = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3)
  g.setAttribute('color', new BufferAttribute(col, 3))
  return g
}

// Deterministic jitter keyed on the rounded position (coincident vertices move together).
function jitter(g, amt, seed) {
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const y = p.getY(i)
    const z = p.getZ(i)
    const k = Math.round(x * 97 + seed) * 73856093 ^ Math.round(y * 97) * 19349663 ^ Math.round(z * 97) * 83492791
    const r = mulberry32(k)
    p.setXYZ(i, x + (r() - 0.5) * amt, y + (r() - 0.5) * amt, z + (r() - 0.5) * amt)
  }
  g.computeVertexNormals()
  return g
}

function nonIndexed(g) {
  const out = g.index ? g.toNonIndexed() : g
  for (const k of Object.keys(out.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') out.deleteAttribute(k)
  return out
}

function merge(list) {
  return mergeGeometries(list.map(nonIndexed), false)
}

// --- Geometries -----------------------------------------------------------------------
function canopyGeo(variant) {
  const rand = mulberry32(100 + variant)
  const blobs = []
  const layouts = [
    [[0, 3.7, 0, 1.7], [1.05, 3.2, 0.3, 1.15], [-1.0, 3.3, -0.2, 1.2], [0.2, 3.3, 1.0, 1.1], [-0.2, 3.4, -1.0, 1.1], [0.1, 4.7, 0.1, 1.15]],
    [[0, 3.4, 0, 1.45], [0.9, 3.9, 0.4, 1.0], [-0.8, 3.8, 0.3, 1.0], [0.1, 4.4, -0.5, 1.05], [0.3, 2.9, -0.6, 0.9]],
    [[0, 4.2, 0, 1.9], [1.3, 3.6, 0.2, 1.25], [-1.3, 3.7, 0.1, 1.3], [0, 3.6, 1.3, 1.2], [0, 3.7, -1.3, 1.2], [0.5, 5.2, 0.3, 1.2], [-0.6, 5.0, -0.3, 1.1]],
  ][variant]
  for (const [x, y, z, r] of layouts) {
    const g = jitter(new IcosahedronGeometry(r, r >= 1.4 ? 1 : 0), r * (r >= 1.4 ? 0.18 : 0.1), variant * 13 + blobs.length)
    g.translate(x, y, z)
    const shade = 0.82 + (y - 3) * 0.1 + rand() * 0.08
    paint(g, new Color(shade, shade, shade).getHex())
    blobs.push(g)
  }
  return merge(blobs)
}

function trunkGeo(variant) {
  const parts = []
  const h = variant === 2 ? 3.6 : 3.0
  const t = new CylinderGeometry(0.17, 0.3, h, 7)
  t.translate(0, h / 2, 0)
  parts.push(paint(t, 0xffffff))
  for (const [ang, tilt, len] of [[0.4, 0.75, 1.3], [2.6, -0.7, 1.1], [4.4, 0.65, 1.0]]) {
    const b = new CylinderGeometry(0.06, 0.11, len, 5)
    b.translate(0, len / 2, 0)
    b.rotateZ(tilt)
    b.rotateY(ang)
    b.translate(0, h * 0.72, 0)
    parts.push(paint(b, 0xffffff))
  }
  return merge(parts)
}

function cypressGeo() {
  const parts = []
  const t = new CylinderGeometry(0.12, 0.16, 0.8, 6)
  t.translate(0, 0.4, 0)
  parts.push(paint(t, 0x6b4a2e))
  const a = jitter(new ConeGeometry(1.05, 4.6, 7, 2), 0.12, 5)
  a.translate(0, 0.6 + 2.3, 0)
  parts.push(paint(a, 0xffffff))
  const b = jitter(new ConeGeometry(0.75, 2.6, 7, 1), 0.1, 6)
  b.translate(0, 4.2 + 1.3, 0)
  parts.push(paint(b, 0xe6ffe6))
  return merge(parts)
}

function palmGeos() {
  const trunk = []
  let x = 0
  let y = 0
  const segs = 7
  for (let i = 0; i < segs; i++) {
    const len = 0.85
    const c = new CylinderGeometry(0.17 - i * 0.008, 0.21 - i * 0.008, len, 7)
    const lean = 0.05 + i * 0.035
    c.translate(0, len / 2, 0)
    c.rotateZ(-lean)
    c.translate(x, y, 0)
    trunk.push(paint(c, i % 2 ? 0x9a7650 : 0x8a6644))
    x += Math.sin(lean) * len
    y += Math.cos(lean) * len
  }
  const top = { x, y }
  for (let k = 0; k < 3; k++) {
    const nut = new IcosahedronGeometry(0.16, 0)
    nut.translate(top.x + Math.cos(k * 2.1) * 0.2, top.y - 0.15, Math.sin(k * 2.1) * 0.2)
    trunk.push(paint(nut, 0x5a3d1e))
  }
  // fronds: bent strips (3 segments) radiating from the crown
  const pos = []
  const col = []
  const fronds = 9
  for (let f = 0; f < fronds; f++) {
    const ang = (f / fronds) * Math.PI * 2 + (f % 2) * 0.2
    const len = 2.6 + (f % 3) * 0.3
    const pts = []
    for (let s = 0; s <= 4; s++) {
      const t = s / 4
      const r = t * len
      const dy = 0.45 * t - 1.5 * t * t
      pts.push([top.x + Math.cos(ang) * r, top.y + 0.1 + dy, Math.sin(ang) * r, (1 - Math.abs(t - 0.4) * 1.2) * 0.42 + 0.05])
    }
    const sx = -Math.sin(ang)
    const sz = Math.cos(ang)
    for (let s = 0; s < 4; s++) {
      const [ax, ay, az, aw] = pts[s]
      const [bx, by, bz, bw] = pts[s + 1]
      const A1 = [ax + sx * aw, ay - aw * 0.25, az + sz * aw]
      const A2 = [ax - sx * aw, ay - aw * 0.25, az - sz * aw]
      const B1 = [bx + sx * bw, by - bw * 0.25, bz + sz * bw]
      const B2 = [bx - sx * bw, by - bw * 0.25, bz - sz * bw]
      const A0 = [ax, ay, az]
      const B0 = [bx, by, bz]
      pos.push(...A0, ...B0, ...A1, ...A1, ...B0, ...B1, ...A0, ...A2, ...B0, ...A2, ...B2, ...B0)
      const shade = 0.75 + s * 0.07
      for (let v = 0; v < 12; v++) col.push(shade * 0.55, shade, shade * 0.4)
    }
  }
  const leaves = new BufferGeometry()
  leaves.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  leaves.setAttribute('color', new BufferAttribute(new Float32Array(col), 3))
  leaves.computeVertexNormals()
  return { trunk: merge(trunk), leaves, top }
}

function bushGeo() {
  const parts = []
  const a = jitter(new IcosahedronGeometry(1, 1), 0.18, 21)
  a.scale(1, 0.72, 1)
  a.translate(0, 0.55, 0)
  parts.push(paint(a, 0xffffff))
  const b = jitter(new IcosahedronGeometry(0.62, 0), 0.1, 22)
  b.translate(0.75, 0.42, 0.25)
  parts.push(paint(b, 0xe8f4e0))
  const c = jitter(new IcosahedronGeometry(0.55, 0), 0.1, 23)
  c.translate(-0.7, 0.38, -0.3)
  parts.push(paint(c, 0xdde8d6))
  return merge(parts)
}

function budsGeo() {
  const rand = mulberry32(31)
  const parts = []
  for (let k = 0; k < 6; k++) {
    const a = rand() * Math.PI * 2
    const up = 0.35 + rand() * 0.55
    const r = Math.sqrt(1 - up * up) * 0.95
    const g = new OctahedronGeometry(0.14, 0)
    g.translate(Math.cos(a) * r, 0.55 + up * 0.72, Math.sin(a) * r)
    parts.push(paint(g, 0xffffff))
  }
  return merge(parts)
}

function rockGeo(seed) {
  const g = jitter(new DodecahedronGeometry(1, 0), 0.45, seed)
  g.scale(1, 0.7, 0.9)
  return paint(nonIndexed(g), 0xffffff)
}

function flowerGeo() {
  const rand = mulberry32(41)
  const heads = []
  const leaves = []
  for (let k = 0; k < 5; k++) {
    const x = (rand() - 0.5) * 0.9
    const z = (rand() - 0.5) * 0.9
    const h = 0.16 + rand() * 0.16
    const head = new OctahedronGeometry(0.095, 0)
    head.scale(1, 0.55, 1)
    head.translate(x, h, z)
    heads.push(paint(head, 0xffffff))
    // one blade-like leaf per flower doubling as its stem
    const lf = new TetrahedronGeometry(0.12, 0)
    lf.scale(0.35, h * 4.5, 0.35)
    lf.rotateZ((rand() - 0.5) * 0.3)
    lf.translate(x, h * 0.45, z)
    leaves.push(paint(lf, 0x4fa83a))
  }
  return { heads: merge(heads), leaves: merge(leaves) }
}

function tuftGeo() {
  const rand = mulberry32(51)
  const pos = []
  const col = []
  const nor = []
  for (let k = 0; k < 7; k++) {
    const a = rand() * Math.PI * 2
    const r = rand() * 0.18
    const x = Math.cos(a) * r
    const z = Math.sin(a) * r
    const h = 0.28 + rand() * 0.32
    const w = 0.035 + rand() * 0.02
    const lean = (rand() - 0.5) * 0.5
    const la = rand() * Math.PI * 2
    const tx = x + Math.cos(la) * lean * h
    const tz = z + Math.sin(la) * lean * h
    const px = -Math.sin(la) * w
    const pz = Math.cos(la) * w
    pos.push(x - px, 0, z - pz, x + px, 0, z + pz, tx, h, tz)
    col.push(0.45, 0.62, 0.35, 0.45, 0.62, 0.35, 1, 1, 0.9)
    nor.push(0, 1, 0, 0, 1, 0, 0, 1, 0)
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3))
  g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3))
  return g
}

function logGeo() {
  const g = new CylinderGeometry(0.32, 0.36, 3.2, 8)
  g.rotateZ(Math.PI / 2)
  paint(nonIndexed(g), 0x8a6040)
  const ring = new CylinderGeometry(0.28, 0.28, 3.22, 8)
  ring.rotateZ(Math.PI / 2)
  return merge([paint(nonIndexed(g), 0x8a6040), paint(nonIndexed(ring), 0xd9b47e)])
}

// --- Collector ---------------------------------------------------------------------------
export function createNature() {
  const L = { tree: [], cypress: [], palm: [], bush: [], rock: [], flower: [], tuft: [], log: [] }
  return {
    lists: L,
    // variant 0..2, color hex (canopy), s scale. pink: cherry blossom.
    tree(x, z, o = {}) {
      L.tree.push({ x, z, s: o.s ?? 1, v: o.v ?? Math.floor(Math.abs(Math.sin(x * 12.9 + z * 78.2)) * 3) % 3, c: o.c ?? null, r: o.r ?? (x * 7.1 + z * 3.3) % 6.28 })
    },
    cherry(x, z, s = 1) {
      L.tree.push({ x, z, s, v: 0, c: [0xffb7d5, 0xf9a3c8, 0xffc8e0][Math.floor(Math.abs(x + z)) % 3], r: x + z, cherry: true })
    },
    cypress(x, z, s = 1) {
      L.cypress.push({ x, z, s })
    },
    palm(x, z, s = 1, r = null) {
      L.palm.push({ x, z, s, r: r ?? (x * 3.7 + z) % 6.28 })
    },
    bush(x, z, s = 1, flowers = null) {
      L.bush.push({ x, z, s, f: flowers })
    },
    rock(x, z, s = 1, y = null) {
      L.rock.push({ x, z, s, y })
    },
    flower(x, z, c = null) {
      L.flower.push({ x, z, c })
    },
    tuft(x, z, s = 1) {
      L.tuft.push({ x, z, s })
    },
    log(x, z, yaw = 0) {
      L.log.push({ x, z, yaw })
    },
    build(scene, ground, preset) {
      const meshes = []
      const m4 = new Matrix4()
      const dummy = new Object3D()
      const col = new Color()
      const greens = [0x5cbf3c, 0x4caf34, 0x6fcf4a, 0x3f9f2e, 0x7fd655, 0x58b83a]
      const mk = (geo, mat, count, cast, name) => {
        const m = new InstancedMesh(geo, mat, Math.max(1, count))
        m.count = count
        m.name = name
        m.castShadow = cast
        m.receiveShadow = true
        meshes.push(m)
        scene.add(m)
        return m
      }
      const place = (m, i, x, y, z, ry, sx, sy = sx, sz = sx, rx = 0, rz = 0) => {
        dummy.position.set(x, y, z)
        dummy.rotation.set(rx, ry, rz)
        dummy.scale.set(sx, sy, sz)
        dummy.updateMatrix()
        m.setMatrixAt(i, dummy.matrix)
      }

      // trees by variant
      const leafMat = new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8 })
      leafMat.name = 'canopy'
      windify(leafMat, 0.025, 2.5, 'canopy')
      const barkMat = new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9, color: 0x7a5232 })
      barkMat.name = 'bark'
      for (let v = 0; v < 3; v++) {
        const list = L.tree.filter((t) => t.v === v)
        if (!list.length) continue
        const can = mk(canopyGeo(v), leafMat, list.length, true, `canopy${v}`)
        const tr = mk(trunkGeo(v), barkMat, list.length, true, `trunk${v}`)
        list.forEach((t, i) => {
          const y = ground(t.x, t.z) - 0.1
          place(can, i, t.x, y, t.z, t.r, t.s, t.s * (0.92 + (i % 3) * 0.06), t.s)
          place(tr, i, t.x, y, t.z, t.r, t.s)
          can.setColorAt(i, col.set(t.c ?? greens[(i * 7 + v) % greens.length]))
          tr.setColorAt(i, col.set(t.cherry ? 0x6a4a3a : 0xffffff))
          staticPrism(0.24 * t.s, 3.2 * t.s, t.x, y + 1.6 * t.s, t.z, 6)
        })
      }

      // cypress
      if (L.cypress.length) {
        const mat = new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8 })
        mat.name = 'cypress'
        windify(mat, 0.012, 1.0, 'cypress')
        const m = mk(cypressGeo(), mat, L.cypress.length, true, 'cypress')
        L.cypress.forEach((t, i) => {
          const y = ground(t.x, t.z) - 0.05
          place(m, i, t.x, y, t.z, i * 1.3, t.s, t.s * (0.9 + (i % 4) * 0.08), t.s)
          m.setColorAt(i, col.set([0x3fbf4a, 0x34b043, 0x4ccc55, 0x2fa63e][i % 4]))
          staticPrism(0.55 * t.s, 2.8, t.x, y + 1.4, t.z, 6)
        })
      }

      // palms
      if (L.palm.length) {
        const g = palmGeos()
        const tmat = new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 })
        tmat.name = 'palmTrunk'
        const lmat = new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.75, side: DoubleSide })
        lmat.name = 'palmLeaves'
        windify(lmat, 0.04, g.top.y - 0.3, 'palm')
        const t = mk(g.trunk, tmat, L.palm.length, true, 'palmTrunk')
        const l = mk(g.leaves, lmat, L.palm.length, true, 'palmLeaves')
        L.palm.forEach((p, i) => {
          const y = ground(p.x, p.z) - 0.1
          place(t, i, p.x, y, p.z, p.r, p.s)
          place(l, i, p.x, y, p.z, p.r, p.s)
          l.setColorAt(i, col.set([0x8ee05a, 0x7fd04c, 0x9ae866][i % 3]))
          staticPrism(0.24 * p.s, 4, p.x, y + 2, p.z, 6)
        })
      }

      // bushes + buds
      if (L.bush.length) {
        const mat = new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85 })
        mat.name = 'bush'
        const m = mk(bushGeo(), mat, L.bush.length, false, 'bush')
        const flowered = L.bush.filter((b) => b.f !== false)
        const budMat = new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.6 })
        budMat.name = 'buds'
        const buds = mk(budsGeo(), budMat, flowered.length, false, 'buds')
        let bi = 0
        L.bush.forEach((b, i) => {
          const y = ground(b.x, b.z) - 0.08
          const r = b.x * 1.7 + b.z
          place(m, i, b.x, y, b.z, r, b.s, b.s * 0.95, b.s)
          m.setColorAt(i, col.set(greens[i % greens.length]))
          if (b.f !== false) {
            place(buds, bi, b.x, y, b.z, r, b.s)
            buds.setColorAt(bi, col.set(b.f ?? [0xff6f9a, 0xffd23f, 0xffffff, 0xff8a3d, 0xd884ff, 0xff4f5e][i % 6]))
            bi++
          }
        })
      }

      // rocks (two shapes)
      if (L.rock.length) {
        const mat = new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 })
        mat.name = 'rock'
        for (let v = 0; v < 2; v++) {
          const list = L.rock.filter((_, i) => i % 2 === v)
          if (!list.length) continue
          const m = mk(rockGeo(61 + v * 7), mat, list.length, true, `rock${v}`)
          list.forEach((r, i) => {
            const y = (r.y ?? ground(r.x, r.z)) - r.s * 0.2
            place(m, i, r.x, y, r.z, r.x * 3 + r.z, r.s, r.s * (0.8 + (i % 3) * 0.15), r.s * (0.9 + (i % 2) * 0.2))
            const g = 0.4 + ((i * 37) % 10) * 0.02
            m.setColorAt(i, col.setRGB(g, g * 0.99, g * 1.02))
            if (r.s > 0.7) staticBox(r.s * 0.7, r.s * 0.55, r.s * 0.65, m4.makeRotationY(r.x * 3 + r.z).setPosition(r.x, y + r.s * 0.15, r.z))
          })
        }
      }

      // flowers (heads + leaves)
      const fl = L.flower
      if (fl.length) {
        const g = flowerGeo()
        const hm = new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.6 })
        hm.name = 'flowerHeads'
        const lm = new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8 })
        lm.name = 'flowerLeaves'
        const h = mk(g.heads, hm, fl.length, false, 'flowerHeads')
        const l = mk(g.leaves, lm, fl.length, false, 'flowerLeaves')
        const cols = [0xff5f8a, 0xffd23f, 0xffffff, 0xff7b3a, 0xb98cff, 0xff3b4f, 0x6fb6ff]
        fl.forEach((f, i) => {
          const y = ground(f.x, f.z)
          const r = f.x * 2.3 + f.z
          place(h, i, f.x, y, f.z, r, 1)
          place(l, i, f.x, y, f.z, r, 1)
          h.setColorAt(i, col.set(f.c ?? cols[i % cols.length]))
        })
      }

      // grass tufts
      if (L.tuft.length) {
        const mat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: DoubleSide })
        mat.name = 'tuft'
        windify(mat, 0.12, 0.0, 'tuft')
        const m = mk(tuftGeo(), mat, L.tuft.length, false, 'tufts')
        L.tuft.forEach((t, i) => {
          place(m, i, t.x, ground(t.x, t.z) - 0.02, t.z, t.x * 5 + t.z, t.s, t.s * (0.8 + (i % 5) * 0.1), t.s)
          m.setColorAt(i, col.set([0x6fd04a, 0x5cbf3c, 0x82d85a, 0x4fae36][i % 4]))
        })
      }

      // logs
      if (L.log.length) {
        const mat = new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 })
        mat.name = 'log'
        const m = mk(logGeo(), mat, L.log.length, true, 'logs')
        L.log.forEach((t, i) => {
          const y = ground(t.x, t.z) + 0.25
          place(m, i, t.x, y, t.z, t.yaw, 1)
          staticBox(1.6, 0.34, 0.36, m4.makeRotationY(t.yaw).setPosition(t.x, y, t.z))
        })
      }

      for (const m of meshes) {
        m.instanceMatrix.needsUpdate = true
        if (m.instanceColor) m.instanceColor.needsUpdate = true
        m.computeBoundingSphere()
      }
      return meshes
    },
  }
}

export function updateNature(elapsed) {
  windTime.value = elapsed
}

export { Matrix4 }
