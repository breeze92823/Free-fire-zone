// Dev harness for the island (world-test.html): renderer + lighting + sea +
// physics + buildIsland, a free-fly camera, district hotkeys, on-screen stats,
// a 1.8 m scale box, and a walk mode / scripted walk test that drives a Rapier
// character controller with the game's capsule settings.
import { ACESFilmicToneMapping, BoxGeometry, Clock, Mesh, MeshStandardMaterial, PCFSoftShadowMap, PerspectiveCamera, Raycaster, Scene, SRGBColorSpace, Vector2, Vector3, WebGLRenderer } from 'three'
import { graphicsPreset, RENDER } from '../config.js'
import { RAPIER, initPhysics, world } from '../physics.js'
import { createLighting } from '../lighting.js'
import { createWorld } from '../world.js'
import { setNeonBloom } from '../propkit.js'
import { buildIsland } from './index.js'

const params = new URLSearchParams(location.search)
const preset = graphicsPreset(params.get('q') || 'High')

const renderer = new WebGLRenderer({ antialias: preset.antialias, powerPreference: 'high-performance', preserveDrawingBuffer: true })
renderer.outputColorSpace = SRGBColorSpace
renderer.toneMapping = ACESFilmicToneMapping
renderer.toneMappingExposure = RENDER.exposure
renderer.shadowMap.enabled = preset.shadows
renderer.shadowMap.type = PCFSoftShadowMap
renderer.setPixelRatio(Math.min(window.devicePixelRatio, preset.dpr))
renderer.info.autoReset = false
document.body.appendChild(renderer.domElement)
setNeonBloom(false)

const scene = new Scene()
const camera = new PerspectiveCamera(70, 1, 0.1, 1200)
function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight)
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
}
window.addEventListener('resize', resize)
resize()

const hud = document.getElementById('hud')
hud.textContent = 'Building island...'

await initPhysics()
const lighting = createLighting(scene, renderer, preset)
const sea = createWorld(scene)
const t0 = performance.now()
const island = await buildIsland(scene, { lighting, preset })
const buildMs = Math.round(performance.now() - t0)
world.step() // refresh the query pipeline

// --- Free-fly camera ------------------------------------------------------------------
const cam = { pos: new Vector3(0, 60, 150), yaw: 0, pitch: -0.35 }
const keys = new Set()
const fwd = new Vector3()
const right = new Vector3()
function applyCam() {
  camera.position.copy(cam.pos)
  camera.rotation.set(cam.pitch, cam.yaw, 0, 'YXZ')
}
function setView(x, y, z, yaw = cam.yaw, pitch = cam.pitch) {
  cam.pos.set(x, y, z)
  cam.yaw = yaw
  cam.pitch = pitch
  applyCam()
}
// Look at (tx, ty, tz) from (x, y, z).
function lookFrom(x, y, z, tx, ty, tz) {
  const dx = tx - x
  const dy = ty - y
  const dz = tz - z
  setView(x, y, z, Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz)))
}
const marks = island.landmarks
function jump(i) {
  const m = marks[i]
  if (!m) return
  const gy = island.groundHeight(m.x, m.z)
  lookFrom(m.x + 22, gy + 16, m.z + 26, m.x, gy + 1, m.z)
}
let dragging = false
renderer.domElement.addEventListener('pointerdown', (e) => {
  dragging = true
  renderer.domElement.setPointerCapture(e.pointerId)
})
renderer.domElement.addEventListener('pointerup', () => (dragging = false))
renderer.domElement.addEventListener('pointermove', (e) => {
  if (!dragging) return
  cam.yaw -= e.movementX * 0.004
  cam.pitch = Math.max(-1.5, Math.min(1.5, cam.pitch - e.movementY * 0.004))
})
window.addEventListener('keydown', (e) => {
  keys.add(e.code)
  if (e.code.startsWith('Digit')) {
    const n = Number(e.code.slice(5))
    if (n === 0) setView(0, 260, 0.01, 0, -Math.PI / 2 + 0.001)
    else jump(n - 1)
  }
  if (e.code === 'KeyB') dropBox()
  if (e.code === 'KeyN') lighting.toggleDayNight()
  if (e.code === 'KeyF') toggleWalk()
})
window.addEventListener('keyup', (e) => keys.delete(e.code))

// 1.8 m reference box at the ground point the camera looks at.
const refMat = new MeshStandardMaterial({ color: '#ff2a6a' })
const ray = new Raycaster()
function dropBox(x, z) {
  let px = x
  let pz = z
  if (px === undefined) {
    ray.setFromCamera(new Vector2(0, 0), camera)
    const hit = ray.intersectObjects(scene.children, true).find((h) => h.object.name !== 'sky')
    if (!hit) return
    px = hit.point.x
    pz = hit.point.z
  }
  const m = new Mesh(new BoxGeometry(0.6, 1.8, 0.6), refMat)
  m.position.set(px, island.groundHeight(px, pz) + 0.9, pz)
  m.castShadow = true
  scene.add(m)
  return m
}

// --- Walk mode: the game's capsule (r 0.45, h 1.8, autostep 0.45, 50deg) ---------------
const R = 0.45
const HALF = 0.9
const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 50, 0))
const collider = world.createCollider(RAPIER.ColliderDesc.capsule(HALF - R, R).setFriction(0), body)
const ctl = world.createCharacterController(0.02)
ctl.setUp({ x: 0, y: 1, z: 0 })
ctl.enableAutostep(0.45, 0.15, false)
ctl.enableSnapToGround(0.4)
ctl.setMaxSlopeClimbAngle((50 * Math.PI) / 180)
ctl.setMinSlopeSlideAngle((55 * Math.PI) / 180)
const walker = { on: false, vy: 0, grounded: false }
function placeWalker(x, y, z) {
  body.setTranslation({ x, y: y + HALF, z }, true)
  body.setNextKinematicTranslation({ x, y: y + HALF, z })
  walker.vy = 0
  world.step()
}
function walkStep(dx, dz, dt, jumpNow = false) {
  if (walker.grounded) walker.vy = jumpNow ? 8.5 : -1
  else walker.vy -= 22 * dt
  ctl.computeColliderMovement(collider, { x: dx * dt, y: walker.vy * dt, z: dz * dt })
  const m = ctl.computedMovement()
  walker.grounded = ctl.computedGrounded()
  const t = body.translation()
  body.setNextKinematicTranslation({ x: t.x + m.x, y: t.y + m.y, z: t.z + m.z })
  world.step()
  const n = body.translation()
  return { x: n.x, y: n.y - HALF, z: n.z }
}
function toggleWalk() {
  walker.on = !walker.on
  if (walker.on) placeWalker(cam.pos.x, island.groundHeight(cam.pos.x, cam.pos.z) + 0.5, cam.pos.z)
}
// Scripted test: walk from start through waypoints at `speed`; returns where it got.
function walkTest(start, waypoints, { speed = 6, maxSteps = 4000, tol = 0.6 } = {}) {
  placeWalker(start.x, start.y ?? island.groundHeight(start.x, start.z) + 0.05, start.z)
  for (let i = 0; i < 20; i++) walkStep(0, 0, 1 / 60)
  let wi = 0
  let p = body.translation()
  p = { x: p.x, y: p.y - HALF, z: p.z }
  let steps = 0
  const trace = []
  while (wi < waypoints.length && steps < maxSteps) {
    const w = waypoints[wi]
    const dx = w.x - p.x
    const dz = w.z - p.z
    const d = Math.hypot(dx, dz)
    if (d < tol && (w.y === undefined || Math.abs(p.y - w.y) < 0.8)) {
      wi++
      trace.push({ wi, x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), steps })
      continue
    }
    p = walkStep((dx / d) * speed, (dz / d) * speed, 1 / 60)
    steps++
  }
  return { reached: wi, of: waypoints.length, end: { x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2) }, steps, trace }
}

// Ray down on the colliders (to compare with groundHeight).
function probe(x, z, from = 60) {
  const hit = world.castRay(new RAPIER.Ray({ x, y: from, z }, { x: 0, y: -1, z: 0 }), 200, true)
  return hit ? +(from - (hit.timeOfImpact ?? hit.toi)).toFixed(3) : null
}

// --- Loop ------------------------------------------------------------------------------
const clock = new Clock()
const focus = new Vector3()
let fpsAcc = 0
let fpsN = 0
let fps = 0
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1)
  const elapsed = clock.elapsedTime
  fwd.set(-Math.sin(cam.yaw), 0, -Math.cos(cam.yaw))
  right.set(Math.cos(cam.yaw), 0, -Math.sin(cam.yaw))
  const sp = (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 60 : 16) * dt
  let mx = 0
  let mz = 0
  if (keys.has('KeyW')) mz += 1
  if (keys.has('KeyS')) mz -= 1
  if (keys.has('KeyD')) mx += 1
  if (keys.has('KeyA')) mx -= 1
  if (walker.on) {
    const vx = (fwd.x * mz + right.x * mx) * 6
    const vz = (fwd.z * mz + right.z * mx) * 6
    const p = walkStep(vx, vz, Math.min(dt, 1 / 30), keys.has('Space'))
    cam.pos.set(p.x, p.y + 1.6, p.z)
  } else {
    cam.pos.addScaledVector(fwd, mz * sp).addScaledVector(right, mx * sp)
    if (keys.has('KeyE') || keys.has('Space')) cam.pos.y += sp
    if (keys.has('KeyQ')) cam.pos.y -= sp
  }
  applyCam()
  island.update(dt, elapsed)
  sea.update(dt, elapsed)
  focus.set(camera.position.x - Math.sin(cam.yaw) * 25, 0, camera.position.z - Math.cos(cam.yaw) * 25)
  focus.y = island.groundHeight(focus.x, focus.z)
  lighting.update(dt, focus)
  renderer.info.reset()
  renderer.render(scene, camera)
  fpsAcc += dt
  fpsN++
  if (fpsAcc > 0.5) {
    fps = Math.round(fpsN / fpsAcc)
    fpsAcc = 0
    fpsN = 0
  }
  const inf = renderer.info.render
  hud.textContent =
    `fps ${fps} | calls ${inf.calls} | tris ${(inf.triangles / 1000).toFixed(0)}k | build ${buildMs} ms | colliders ${world.colliders.len()}\n` +
    `pos ${cam.pos.x.toFixed(1)}, ${cam.pos.y.toFixed(1)}, ${cam.pos.z.toFixed(1)}  ground ${island.groundHeight(cam.pos.x, cam.pos.z).toFixed(2)}${walker.on ? '  [walk]' : ''}\n` +
    `WASD fly, drag look, Shift fast, Q/E down/up, 1-${marks.length} districts, 0 top, B scale box, F walk, N night`
})

window.__wv = { camera, scene, renderer, island, world, setView, lookFrom, jump, dropBox, walkTest, probe, placeWalker, walkStep, lighting, info: () => ({ ...renderer.info.render, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, buildMs }) }
