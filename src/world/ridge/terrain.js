// Dustline Ridge terrain: a CELL m height grid sampled from layout.terrainHeight, drawn as one mesh
// with the shared terrain shader (world/terrain.js terrainMaterial: same program as Coral Key, desert
// textures) and collided as a trimesh of the same triangles, binned into the 32 m collider grid.
// groundHeight() interpolates the very same triangles. Also the invisible fence in the shallows.
import { BufferAttribute, BufferGeometry, Matrix4, Mesh } from 'three'
import { paintRock, toTexture } from '../../textures.js'
import { staticBox, staticTris } from '../geom.js'
import { terrainMaterial } from '../terrain.js'
import { slicer } from '../../nextTask.js'
import { paintBeachSand, paintGrassTop, paintSoil } from '../paint.js'
import { CELL, EXTENT, noise2, paintWeights, shoreR, smooth, terrainHeight } from './layout.js'

const N = Math.round((EXTENT * 2) / CELL) // cells per side
const V = N + 1

// Dry grass: the island grass texture pushed toward straw.
function dryGrass() {
  const src = paintGrassTop(256, 913).color
  const c = document.createElement('canvas')
  c.width = c.height = src.width
  const g = c.getContext('2d')
  g.filter = 'sepia(0.6) saturate(0.95) hue-rotate(-14deg) brightness(0.98)' // khaki / olive
  g.drawImage(src, 0, 0)
  return c
}

// Builds the mesh + collider into `root`; resolves to { mesh, groundHeight }.
export async function buildRidgeTerrain(root) {
  const slice = slicer() // the build runs while the lobby is up
  const H = new Float32Array(V * V)
  for (let j = 0; j < V; j++) {
    for (let i = 0; i < V; i++) H[j * V + i] = terrainHeight(-EXTENT + i * CELL, -EXTENT + j * CELL)
    await slice()
  }
  function groundHeight(x, z) {
    const fx = (x + EXTENT) / CELL
    const fz = (z + EXTENT) / CELL
    if (fx < 0 || fz < 0 || fx >= N || fz >= N) return -5
    const i = Math.floor(fx)
    const j = Math.floor(fz)
    const u = fx - i
    const v = fz - j
    const h00 = H[j * V + i]
    const h10 = H[j * V + i + 1]
    const h01 = H[(j + 1) * V + i]
    const h11 = H[(j + 1) * V + i + 1]
    if (u + v < 1) return h00 + u * (h10 - h00) + v * (h01 - h00)
    return h11 + (1 - u) * (h01 - h11) + (1 - v) * (h10 - h11)
  }

  const pos = new Float32Array(V * V * 3)
  const nor = new Float32Array(V * V * 3)
  const wts = new Float32Array(V * V * 4)
  const col = new Float32Array(V * V * 3)
  const at = (i, j) => H[Math.min(V - 1, Math.max(0, j)) * V + Math.min(V - 1, Math.max(0, i))]
  for (let j = 0; j < V; j++) {
    for (let i = 0; i < V; i++) {
      const k = j * V + i
      const x = -EXTENT + i * CELL
      const z = -EXTENT + j * CELL
      pos[k * 3] = x
      pos[k * 3 + 1] = H[k]
      pos[k * 3 + 2] = z
      const dx = (at(i + 1, j) - at(i - 1, j)) / (2 * CELL)
      const dz = (at(i, j + 1) - at(i, j - 1)) / (2 * CELL)
      const l = Math.hypot(dx, 1, dz)
      nor[k * 3] = -dx / l
      nor[k * 3 + 1] = 1 / l
      nor[k * 3 + 2] = -dz / l
      const w = paintWeights(x, z, Math.hypot(dx, dz))
      wts.set(w, k * 4)
      // large-scale tint: paler and warmer patches
      const n = noise2(x, z)
      const warm = smooth(0.6, 0.9, noise2(z * 1.3 + 40, x * 1.3 - 17))
      const t = 0.9 + n * 0.2
      col[k * 3] = t * (1 + warm * 0.06)
      col[k * 3 + 1] = t * (1 - warm * 0.03)
      col[k * 3 + 2] = t * (1 - warm * 0.1)
    }
    await slice()
  }
  const idx = []
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const a = j * V + i
      const b = a + 1
      const c = a + V + 1
      const d = a + V
      if (Math.max(H[a], H[b], H[c], H[d]) < -3.2) continue // deep seabed: hidden by the sea
      idx.push(a, d, b, b, d, c)
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(pos, 3))
  g.setAttribute('normal', new BufferAttribute(nor, 3))
  g.setAttribute('aW', new BufferAttribute(wts, 4))
  g.setAttribute('color', new BufferAttribute(col, 3))
  g.setIndex(new BufferAttribute(new Uint32Array(idx), 1))
  g.computeBoundingSphere()

  const mat = terrainMaterial({
    grass: toTexture(dryGrass(), { srgb: true }),
    sand: toTexture(paintBeachSand(256, 4711).color, { srgb: true }),
    rock: toTexture(paintRock(256).color, { srgb: true }),
    dirt: toTexture(paintSoil(256, 5151, 0).color, { srgb: true }),
    rockTint: [2.0, 1.45, 1.08], // red-brown desert rock (on a grey-scaled texture)
  })
  const mesh = new Mesh(g, mat)
  mesh.name = 'ridgeTerrain'
  mesh.receiveShadow = true
  mesh.matrixAutoUpdate = false
  root.add(mesh)
  staticTris(pos, idx)
  return { mesh, groundHeight }
}

// Invisible fence a few metres into the shallows all the way round.
export function buildRidgeFence() {
  const loop = []
  const n = 300
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2
    const r = shoreR(a) + 5
    loop.push([Math.cos(a) * r, Math.sin(a) * r])
  }
  const m = new Matrix4()
  for (let k = 0; k < loop.length; k++) {
    const [ax, az] = loop[k]
    const [bx, bz] = loop[(k + 1) % loop.length]
    const len = Math.hypot(bx - ax, bz - az)
    const yaw = Math.atan2(-(bz - az), bx - ax)
    staticBox(len / 2 + 0.35, 6, 0.3, m.makeRotationY(yaw).setPosition((ax + bx) / 2, 2.5, (az + bz) / 2))
  }
}
