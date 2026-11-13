import { IcosahedronGeometry, Matrix4, Mesh, MeshLambertMaterial, MeshPhysicalMaterial, MeshStandardMaterial, Object3D, PlaneGeometry, Vector2 } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { WATER } from './config.js'
import { mulberry32, paintWaterNormal, toTexture } from './textures.js'

// The sea around the island and the puffy clouds in the sky (the island itself is src/world/).
// The sea uses one ripple normal map twice (normalMap + clearcoatNormalMap) at
// different scales, scrolled in different directions each frame.

// All clouds are ONE mesh (one draw call); puffs are lower-poly on lighter presets.
function makeClouds(detail = 1) {
  const rand = mulberry32(2024)
  const geo = new IcosahedronGeometry(1, detail >= 0.9 ? 2 : 1)
  const mat = new MeshLambertMaterial({ color: '#ffffff', emissive: '#dcebff', emissiveIntensity: 0.62, fog: false })
  const parts = []
  const cloud = new Object3D()
  const puff = new Object3D()
  cloud.add(puff)
  const m = new Matrix4()
  const add = () => {
    cloud.updateMatrixWorld(true)
    parts.push(geo.clone().applyMatrix4(m.copy(puff.matrixWorld)))
  }
  for (let i = 0; i < 22; i++) {
    // Mostly ahead (-Z), a few all around.
    const ang = rand() * Math.PI * 2
    const dist = 240 + rand() * 170
    const puffs = 5 + Math.floor(rand() * 4)
    const len = 22 + rand() * 26
    // (Same random sequence as before: the cloud's place is drawn after its puffs.)
    const shape = []
    for (let p = 0; p < puffs; p++) {
      const t = p / (puffs - 1) - 0.5
      const r = (1 - Math.abs(t) * 1.1) * (9 + rand() * 6)
      shape.push([r, r * 0.82, r, t * len, r * 0.25 + rand() * 3, (rand() - 0.5) * 8])
    }
    shape.push([len * 0.62, 4, 9, 0, 0, 0]) // flat underside
    cloud.position.set(Math.cos(ang) * dist, 30 + rand() * 70, Math.sin(ang) * dist)
    cloud.lookAt(0, cloud.position.y, 0)
    for (const [sx, sy, sz, x, y, z] of shape) {
      puff.scale.set(sx, sy, sz)
      puff.position.set(x, y, z)
      add()
    }
  }
  const mesh = new Mesh(mergeGeometries(parts), mat)
  for (const g of parts) g.dispose()
  geo.dispose()
  mesh.name = 'clouds'
  mesh.matrixAutoUpdate = false
  return mesh
}

// The sea around the land and the clouds in the sky. preset.detail < 0.5: a cheaper sea (no clearcoat layer).
export function createWorld(scene, preset = {}) {
  const detail = preset.detail ?? 1
  // Sea: physical material, two scrolling ripple layers, slightly see-through.
  const ripples = paintWaterNormal()
  const normalA = toTexture(ripples, { repeat: WATER.size / 14 })
  const normalB = toTexture(ripples, { repeat: WATER.size / 37 })
  const sea = new Mesh(
    new PlaneGeometry(WATER.size, WATER.size),
    detail < 0.5
      ? new MeshStandardMaterial({ color: WATER.color, roughness: 0.25, metalness: 0, normalMap: normalA, normalScale: new Vector2(0.35, 0.35), transparent: true, opacity: 0.94 })
      : new MeshPhysicalMaterial({
      color: WATER.color,
      roughness: 0.3,
      metalness: 0,
      normalMap: normalA,
      normalScale: new Vector2(0.3, 0.3),
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      clearcoatNormalMap: normalB,
      clearcoatNormalScale: new Vector2(0.5, 0.5),
      transparent: true,
      opacity: 0.94,
    }),
  )
  sea.rotation.x = -Math.PI / 2
  sea.position.y = WATER.level
  sea.receiveShadow = true
  const clouds = makeClouds(detail)
  scene.add(sea, clouds)
  let fit = 1

  return {
    setSeaColor: (color) => sea.material.color.set(color),
    // Shorter view distances: the clouds are drawn scaled down toward the eye by `s`, which
    // looks identical on screen but keeps them inside the camera's far plane.
    setViewFit(s) {
      fit = Math.min(1, s)
    },
    update(dt, elapsed, eye) {
      if (eye) {
        clouds.scale.setScalar(fit)
        clouds.position.set(eye.x * (1 - fit), eye.y * (1 - fit), eye.z * (1 - fit))
        clouds.updateMatrix()
      }
      // One ripple tile is 14 m (A) / 37 m (B); v runs toward -Z.
      normalA.offset.set(elapsed * 0.012, elapsed * 0.02)
      normalB.offset.set(-elapsed * 0.008, elapsed * 0.005)
    },
  }
}
