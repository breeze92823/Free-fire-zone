// Island terrain: a 2 m height grid sampled from layout.terrainHeight, drawn as
// one mesh whose shader blends grass / sand / rock / dirt textures by per-vertex
// weights, and collided as a Rapier trimesh of the same triangles
// (groundHeight() interpolates the identical triangles). Also the shallow-water
// rim, the animated foam line and the invisible boundary fence.
import { BufferAttribute, BufferGeometry, DoubleSide, Mesh, MeshBasicMaterial, MeshStandardMaterial, Vector2, Vector3 } from 'three'
import { WATER } from '../config.js'
import { paintRock, toTexture } from '../textures.js'
import { ribbonGeo, staticBox, staticTris } from './geom.js'
import { Matrix4 } from 'three'
import { DOCK, beachW, cliffMask, dirtMask, shoreR, smooth, terrainHeight } from './layout.js'
import { paintBeachSand, paintFoam, paintGrassTop, paintRamp, paintSoil } from './paint.js'

export const EXTENT = 160 // grid covers -EXTENT..EXTENT on both axes
const CELL = 2
const N = (EXTENT * 2) / CELL // cells per side
const V = N + 1
let H = null // Float32Array heights, index j * V + i (i = x index, j = z index)

// Height on the collision surface (same triangulation as the collider).
export function groundHeight(x, z) {
  if (!H) return terrainHeight(x, z)
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
  // diagonal (x1,z0)-(x0,z1), the split used by the mesh and its collider
  if (u + v < 1) return h00 + u * (h10 - h00) + v * (h01 - h00)
  return h11 + (1 - u) * (h01 - h11) + (1 - v) * (h10 - h11)
}

function noise2(x, z) {
  return 0.5 + 0.25 * Math.sin(x * 0.045 + 0.7) * Math.cos(z * 0.052 + 1.1) + 0.15 * Math.sin(x * 0.11 - z * 0.08 + 0.3) + 0.1 * Math.sin(z * 0.17 + x * 0.02)
}

// The terrain material: per-vertex weights (attribute aW: grass, sand, rock, dirt) blend four
// world-space textures. Every world uses this one shader program (same source and cache key);
// only the textures and the rock tint (a grey-scaled rock times `rockTint`) differ.
export function terrainMaterial({ grass, sand, rock, dirt, rockTint = [1.18, 1.2, 1.28] }) {
  const mat = new MeshStandardMaterial({ roughness: 0.95, metalness: 0, vertexColors: true })
  mat.name = 'terrain'
  mat.onBeforeCompile = (s) => {
    s.uniforms.tGrass = { value: grass }
    s.uniforms.tSand = { value: sand }
    s.uniforms.tRock = { value: rock }
    s.uniforms.tDirt = { value: dirt }
    s.uniforms.rockTint = { value: new Vector3(...rockTint) }
    s.vertexShader = 'attribute vec4 aW;\nvarying vec4 vW;\nvarying vec2 vXZ;\n' + s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvW = aW;\nvXZ = position.xz;')
    s.fragmentShader =
      'uniform sampler2D tGrass;\nuniform sampler2D tSand;\nuniform sampler2D tRock;\nuniform sampler2D tDirt;\nuniform vec3 rockTint;\nvarying vec4 vW;\nvarying vec2 vXZ;\n' +
      s.fragmentShader.replace(
        '#include <map_fragment>',
        `vec3 g1 = texture2D(tGrass, vXZ / 5.5).rgb;
         vec3 g2 = texture2D(tGrass, vXZ / 15.0 + vec2(0.37, 0.71)).rgb;
         vec3 gr = mix(g1, g2, 0.4);
         vec3 sa = texture2D(tSand, vXZ / 5.0).rgb;
         vec3 ro0 = texture2D(tRock, vXZ / 6.0).rgb;
         vec3 ro = vec3(dot(ro0, vec3(0.34, 0.33, 0.33))) * rockTint;
         vec3 di = texture2D(tDirt, vXZ / 4.0).rgb;
         diffuseColor.rgb *= gr * vW.x + sa * vW.y + ro * vW.z + di * vW.w;`,
      )
  }
  mat.customProgramCacheKey = () => 'islandTerrain'
  return mat
}

export function buildTerrain(scene) {
  H = new Float32Array(V * V)
  for (let j = 0; j < V; j++) {
    for (let i = 0; i < V; i++) H[j * V + i] = terrainHeight(-EXTENT + i * CELL, -EXTENT + j * CELL)
  }

  // --- visual mesh ---
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
      const h = H[k]
      pos.set([x, h, z], k * 3)
      const dx = (at(i + 1, j) - at(i - 1, j)) / (2 * CELL)
      const dz = (at(i, j + 1) - at(i, j - 1)) / (2 * CELL)
      const l = Math.hypot(dx, 1, dz)
      nor.set([-dx / l, 1 / l, -dz / l], k * 3)
      const slope = Math.hypot(dx, dz)
      const r = Math.hypot(x, z)
      const a = Math.atan2(z, x)
      const d = shoreR(a) - r
      const bw = beachW(a)
      const cm = cliffMask(a)
      const inDock = x < DOCK.x1 + 2 && z > DOCK.z0 - 3 && z < DOCK.z1 + 3
      let sand = 1 - smooth(bw - 2.5, bw + 1, d)
      if (inDock) sand *= 0.2
      let rock = Math.max(smooth(0.5, 0.9, slope), cm * (1 - smooth(6, 11, d)) * (d > -3 ? 1 : 0.7))
      rock = Math.min(1, rock)
      sand *= 1 - rock
      let dirt = dirtMask(x, z) * (1 - sand) * (1 - rock)
      let grass = Math.max(0, 1 - sand - rock - dirt)
      const s = grass + sand + rock + dirt || 1
      wts.set([grass / s, sand / s, rock / s, dirt / s], k * 4)
      // large-scale tint: lighter / darker / warmer patches of grass
      const n = noise2(x, z)
      const warm = smooth(0.62, 0.9, noise2(z * 1.3 + 40, x * 1.3 - 17))
      const t = 0.88 + n * 0.24
      col.set([t * (1 + warm * 0.08), t * (1 - warm * 0.02), t * (1 - warm * 0.12)], k * 3)
    }
  }
  const idx = []
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const a = j * V + i
      const b = a + 1
      const c = a + V + 1
      const d = a + V
      if (Math.max(H[a], H[b], H[c], H[d]) < -3.2) continue // deep seabed: hidden by the sea
      // (x1,z0)-(x0,z1) diagonal, counter-clockwise seen from above
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
    grass: toTexture(paintGrassTop().color, { srgb: true }),
    sand: toTexture(paintBeachSand().color, { srgb: true }),
    rock: toTexture(paintRock(256).color, { srgb: true }),
    dirt: toTexture(paintSoil(256, 4242, 0).color, { srgb: true }),
  })
  const mesh = new Mesh(g, mat)
  mesh.name = 'terrain'
  mesh.receiveShadow = true
  mesh.matrixAutoUpdate = false
  scene.add(mesh)

  // --- collision: a trimesh of the very same triangles. (Rapier's heightfield
  // shape makes the kinematic character controller 3-10x slower per query.)
  // Binned into the 32 m collider grid with everything else (no island-wide AABB).
  staticTris(pos, idx)

  return mesh
}

// Shoreline loop (waterline radius) as [x, z] points, `n` samples, closed.
function shoreLoop(n = 360, offset = 0, shore = shoreR) {
  const pts = []
  for (let k = 0; k <= n; k++) {
    const a = (k / n) * Math.PI * 2
    const r = shore(a) + offset
    pts.push([Math.cos(a) * r, Math.sin(a) * r])
  }
  return pts
}

// Shallow-water rim and the foam line along a waterline `shore(a)` (Coral Key's by default).
// Returns an update(elapsed) for the foam.
export function buildShore(scene, shore = shoreR, samples = 360) {
  const pts = shoreLoop(samples, 0, shore)
  // shallow rim: lighter turquoise fading out to sea
  const band = ribbonGeo(pts, -3, 22, WATER.level + 0.035)
  const uv = band.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getY(i) + 3) / 25, uv.getX(i) / 30)
  const ramp = toTexture(paintRamp(), { repeat: 1 })
  const shallow = new Mesh(
    band,
    new MeshStandardMaterial({ color: '#8ff3ff', roughness: 0.2, metalness: 0, transparent: true, opacity: 0.55, alphaMap: ramp, depthWrite: false }),
  )
  shallow.material.name = 'shallow'
  shallow.renderOrder = 1
  shallow.matrixAutoUpdate = false
  scene.add(shallow)

  // foam: white wash hugging the waterline, pulsing
  const foamGeo = ribbonGeo(pts, -1.2, 2.2, WATER.level + 0.05)
  const fu = foamGeo.attributes.uv
  for (let i = 0; i < fu.count; i++) fu.setXY(i, fu.getX(i) / 9, (fu.getY(i) + 1.2) / 3.4)
  const foamTex = toTexture(paintFoam(), { repeat: 1 })
  const foamMat = new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.75, alphaMap: foamTex, depthWrite: false, side: DoubleSide })
  foamMat.name = 'foam'
  const foam = new Mesh(foamGeo, foamMat)
  foam.renderOrder = 2
  foam.matrixAutoUpdate = false
  scene.add(foam)
  return (elapsed) => {
    foamMat.opacity = 0.55 + 0.25 * Math.sin(elapsed * 0.9)
    foamTex.offset.set(elapsed * 0.01, 0.06 * Math.sin(elapsed * 0.9))
  }
}

// Invisible fence: a few metres into the shallows on beaches, along the cliff
// tops in the NE, along the quay (with a notch around the pier) in the Dockyard.
export function buildBoundary() {
  const loop = []
  const n = 240
  const dockA0 = Math.atan2(DOCK.z1 + 4, DOCK.x0) // just south of the dock (angle ~ +172deg)
  const dockA1 = Math.atan2(DOCK.z0 - 4, DOCK.x0) + Math.PI * 2 // just north of it (~ -161deg -> +199deg)
  let insertedDock = false
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2
    if (a > dockA0 && a < dockA1) {
      if (!insertedDock) {
        insertedDock = true
        const q = DOCK.x0 + 0.25
        const { z0, z1, x1 } = DOCK.pier
        loop.push([q, DOCK.z1 + 3], [q, z1], [x1 - 0.25, z1], [x1 - 0.25, z0], [q, z0], [q, DOCK.z0 - 3])
      }
      continue
    }
    const cm = cliffMask(a)
    const r = shoreR(a) + 5 * (1 - cm) - 7.5 * cm
    loop.push([Math.cos(a) * r, Math.sin(a) * r])
  }
  let count = 0
  const m = new Matrix4()
  for (let k = 0; k < loop.length; k++) {
    const [ax, az] = loop[k]
    const [bx, bz] = loop[(k + 1) % loop.length]
    const len = Math.hypot(bx - ax, bz - az)
    if (len < 0.01) continue
    const yaw = Math.atan2(-(bz - az), bx - ax)
    staticBox(len / 2 + 0.35, 6, 0.3, m.makeRotationY(yaw).setPosition((ax + bx) / 2, 2.5, (az + bz) / 2))
    count++
  }
  return { loop, count }
}

export { N as GRID_CELLS, CELL as GRID_CELL, Vector2 }
