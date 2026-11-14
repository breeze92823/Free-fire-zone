// Vehicle models (procedural boxes and cylinders, like everything else): the open-top Jeep and the
// Dune Buggy. Local frame = the physics chassis: origin at the chassis collider's centre, +z forward,
// +x the left side, +y up (config.js VEHICLES). Plain coloured parts are merged into one
// vertex-coloured mesh (merge.js); glass and lamps keep their own materials; each wheel is its own
// group (vehicles.js turns and spins it) with the tyre's axis along local x.
import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, Object3D, Quaternion, TorusGeometry, Vector3 } from 'three'
import { VEHICLES } from '../config.js'
import { mergeChildren } from './merge.js'

let MAT = null
function mats() {
  if (MAT) return MAT
  MAT = {
    body: new MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.12 }),
    tyre: new MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 }),
    glass: new MeshStandardMaterial({ color: '#bfe3ff', roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.32, depthWrite: false }),
    lamp: new MeshStandardMaterial({ color: '#fff6d8', emissive: '#ffe9a8', emissiveIntensity: 1.4, roughness: 0.3 }),
    tail: new MeshStandardMaterial({ color: '#ff3a2a', emissive: '#ff2a1a', emissiveIntensity: 0.9, roughness: 0.4 }),
    // a destroyed vehicle: everything charred (vertex colours darkened), no glass or lamps
    wreck: new MeshStandardMaterial({ vertexColors: true, color: 0x57504a, roughness: 1, metalness: 0 }),
    gun: new MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.45 }),
  }
  MAT.glass.name = 'vehicleGlass'
  return MAT
}

const UP = new Vector3(0, 1, 0)
const tmpV = new Vector3()
const tmpQ = new Quaternion()

// Plain coloured part on `g` (merged later): a box w x h x d at (x, y, z), optional Euler rotation.
function box(g, color, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new Mesh(new BoxGeometry(w, h, d), new MeshStandardMaterial({ color }))
  m.position.set(x, y, z)
  m.rotation.set(rx, ry, rz)
  g.add(m)
  return m
}
function cyl(g, color, r, h, x, y, z, rx = 0, ry = 0, rz = 0, seg = 14, rTop = r) {
  const m = new Mesh(new CylinderGeometry(rTop, r, h, seg), new MeshStandardMaterial({ color }))
  m.position.set(x, y, z)
  m.rotation.set(rx, ry, rz)
  g.add(m)
  return m
}
// A tube from a to b ([x, y, z]).
function tube(g, color, a, b, r = 0.045) {
  tmpV.set(b[0] - a[0], b[1] - a[1], b[2] - a[2])
  const len = tmpV.length()
  const m = new Mesh(new CylinderGeometry(r, r, len, 8), new MeshStandardMaterial({ color }))
  m.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2)
  m.quaternion.copy(tmpQ.setFromUnitVectors(UP, tmpV.normalize()))
  g.add(m)
  return m
}
function special(g, mat, geo, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new Mesh(geo, mat)
  m.position.set(x, y, z)
  m.rotation.set(rx, ry, rz)
  g.add(m)
  return m
}

// A wheel: tyre with tread blocks, rim, hub; axis along local x. `side` +1 left / -1 right (hub cap outward).
function wheel(def, side, rimColor) {
  const { radius: r, width: w } = def.wheels
  const g = new Group()
  cyl(g, 0x1c1d20, r, w, 0, 0, 0, 0, 0, Math.PI / 2, 20)
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2
    box(g, 0x232428, w * 0.92, 0.07, 0.12, 0, Math.cos(a) * (r + 0.015), Math.sin(a) * (r + 0.015), a)
  }
  cyl(g, rimColor, r * 0.58, w + 0.02, 0, 0, 0, 0, 0, Math.PI / 2, 12)
  cyl(g, 0x2a2c30, r * 0.22, w + 0.06, 0, 0, 0, 0, 0, Math.PI / 2, 8)
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2
    box(g, 0x55585e, 0.03, r * 0.5, 0.06, side * (w / 2 + 0.012), Math.cos(a) * r * 0.32, Math.sin(a) * r * 0.32, a)
  }
  mergeChildren(g, mats().tyre)
  return g
}

function seat(g, s, color = 0x3a2a1e) {
  box(g, color, 0.52, 0.14, 0.5, s.x, s.y - 0.16, s.z - 0.02)
  box(g, color, 0.52, 0.62, 0.12, s.x, s.y + 0.12, s.z - 0.3, -0.16)
}

function jeep(def) {
  const g = new Group()
  const P = def.color
  const D = 0x2b2f26 // dark trim
  const M_ = 0x3a3d40 // metal
  // floor pan + tub
  box(g, D, 1.86, 0.3, 4.0, 0, -0.22, 0)
  box(g, P, 0.12, 0.52, 2.72, 0.9, 0.18, -0.62)
  box(g, P, 0.12, 0.52, 2.72, -0.9, 0.18, -0.62)
  box(g, P, 1.92, 0.52, 0.12, 0, 0.18, -1.98)
  box(g, 0x24261f, 1.66, 0.04, 2.7, 0, -0.05, -0.62) // floor mat
  // dashboard + hood + grille
  box(g, P, 1.8, 0.5, 0.14, 0, 0.18, 0.72)
  box(g, D, 1.6, 0.18, 0.3, 0, 0.42, 0.62)
  box(g, P, 1.78, 0.46, 1.3, 0, 0.17, 1.4)
  box(g, P, 1.7, 0.06, 1.24, 0, 0.42, 1.38)
  box(g, D, 1.52, 0.5, 0.08, 0, 0.12, 2.06)
  for (let k = -3; k <= 3; k++) box(g, 0x1a1c18, 0.07, 0.36, 0.04, k * 0.13, 0.13, 2.11)
  // fenders over the wheels
  for (const z of [def.wheels.front, def.wheels.back]) {
    for (const sx of [1, -1]) {
      box(g, P, 0.42, 0.08, 1.06, sx * 0.96, 0.08, z)
      box(g, P, 0.42, 0.08, 0.32, sx * 0.96, -0.02, z + 0.62, -0.5)
      box(g, P, 0.42, 0.08, 0.32, sx * 0.96, -0.02, z - 0.62, 0.5)
    }
  }
  // bumpers + tow hooks
  box(g, M_, 2.04, 0.18, 0.2, 0, -0.32, 2.16)
  box(g, M_, 1.96, 0.18, 0.2, 0, -0.3, -2.1)
  for (const sx of [0.62, -0.62]) box(g, 0x8a8f94, 0.08, 0.12, 0.16, sx, -0.32, 2.3)
  // windshield frame (folded up) + roll bar
  for (const sx of [0.86, -0.86]) box(g, D, 0.07, 0.66, 0.07, sx, 0.75, 0.8, -0.18)
  box(g, D, 1.8, 0.07, 0.07, 0, 1.06, 0.74)
  for (const sx of [0.84, -0.84]) {
    box(g, D, 0.09, 1.05, 0.09, sx, 0.88, -0.58)
    box(g, D, 0.08, 0.08, 1.3, sx, 1.38, -1.2)
    box(g, D, 0.08, 1.0, 0.08, sx, 0.9, -1.88)
  }
  box(g, D, 1.76, 0.09, 0.09, 0, 1.4, -0.58)
  box(g, D, 1.76, 0.08, 0.08, 0, 1.38, -1.86)
  // seats (not the gunner's: it stands), steering wheel, gear stick
  for (const s of def.seats) if (!s.gun) seat(g, s)
  // the ring mount's frame: a ring at waist height round the gunner, braced to the tub and roll bar
  const m = def.mount
  const ring = new Mesh(new TorusGeometry(0.5, 0.035, 6, 24), new MeshStandardMaterial({ color: D }))
  ring.position.set(m.x, 1.2, m.z)
  ring.rotation.x = Math.PI / 2
  g.add(ring)
  tube(g, D, [m.x - 0.36, 1.2, m.z - 0.34], [m.x - 0.42, 0.42, m.z - 0.5], 0.03)
  tube(g, D, [m.x + 0.36, 1.2, m.z - 0.34], [m.x + 0.42, 0.42, m.z - 0.5], 0.03)
  tube(g, D, [m.x, 1.2, m.z + 0.5], [m.x * 0.5, 1.38, -0.58], 0.03)
  const sw = def.seats[0]
  box(g, 0x1a1a1a, 0.06, 0.06, 0.42, sw.x, sw.y + 0.12, 0.52, 0.85)
  const wheelRing = new Mesh(new TorusGeometry(0.19, 0.028, 6, 16), new MeshStandardMaterial({ color: 0x1a1a1a }))
  wheelRing.position.set(sw.x, sw.y + 0.28, 0.42)
  wheelRing.rotation.set(-0.95, 0, 0)
  g.add(wheelRing)
  box(g, 0x1a1a1a, 0.04, 0.32, 0.04, 0, 0.12, 0.2, 0.3)
  // spare tyre + jerry cans
  cyl(g, 0x1c1d20, 0.38, 0.24, 0, 0.32, -2.18, Math.PI / 2, 0, 0, 16)
  cyl(g, 0x55585e, 0.2, 0.26, 0, 0.32, -2.18, Math.PI / 2, 0, 0, 10)
  for (const sx of [0.55, -0.55]) box(g, 0x4c5a2a, 0.22, 0.42, 0.34, sx, 0.25, -2.16)
  // a star on the hood + side numbers (paint)
  box(g, 0xe9e4cf, 0.32, 0.012, 0.32, 0, 0.455, 1.38, 0, Math.PI / 4)
  for (const sx of [1, -1]) box(g, 0xe9e4cf, 0.012, 0.18, 0.5, sx * 0.965, 0.22, -0.7)
  // mirrors
  for (const sx of [1, -1]) box(g, D, 0.16, 0.1, 0.04, sx * 1.06, 0.62, 0.72)
  mergeChildren(g, mats().body)
  // glass + lamps (own materials)
  special(g, mats().glass, new BoxGeometry(1.66, 0.52, 0.02), 0, 0.74, 0.8, -0.18)
  for (const sx of [0.64, -0.64]) special(g, mats().lamp, new CylinderGeometry(0.13, 0.13, 0.06, 14), sx, 0.18, 2.1, Math.PI / 2)
  for (const sx of [0.78, -0.78]) special(g, tailMat(g), new BoxGeometry(0.16, 0.1, 0.03), sx, 0.3, -2.05)
  g.userData.exhaust = [-0.7, -0.38, -2.15]
  return g
}

function buggy(def) {
  const g = new Group()
  const P = def.color
  const T = 0x23252a // frame tubes
  const D = 0x2c2e33
  // floor pan, nose, side pods
  box(g, D, 1.3, 0.12, 2.9, 0, -0.24, -0.1)
  box(g, P, 1.12, 0.3, 0.9, 0, -0.1, 1.38, -0.12)
  box(g, P, 0.9, 0.12, 0.7, 0, 0.08, 1.2, -0.3)
  for (const sx of [1, -1]) {
    box(g, P, 0.24, 0.32, 1.4, sx * 0.62, -0.08, -0.1)
    box(g, 0xf2efe8, 0.245, 0.06, 1.2, sx * 0.62, 0.02, -0.1)
  }
  // roll cage
  const top = 1.12
  for (const sx of [0.56, -0.56]) {
    tube(g, T, [sx, -0.18, 0.62], [sx * 0.88, top, 0.18], 0.05)
    tube(g, T, [sx, -0.18, -0.86], [sx * 0.88, top, -0.72], 0.05)
    tube(g, T, [sx * 0.88, top, 0.18], [sx * 0.88, top, -0.72], 0.045)
    tube(g, T, [sx, -0.18, 0.62], [sx * 0.7, -0.1, 1.82], 0.045) // to the nose
    tube(g, T, [sx * 0.88, top, -0.72], [sx * 0.6, 0.25, -1.62], 0.045) // down to the back
    tube(g, T, [sx, 0.28, 0.5], [sx, 0.28, -0.84], 0.04) // side rail
  }
  tube(g, T, [0.5, top, 0.18], [-0.5, top, 0.18], 0.045)
  tube(g, T, [0.5, top, -0.72], [-0.5, top, -0.72], 0.045)
  tube(g, T, [0.5, top, -0.72], [-0.5, top, 0.18], 0.04)
  tube(g, T, [0.65, -0.1, 1.86], [-0.65, -0.1, 1.86], 0.05) // front bumper
  // engine at the back
  box(g, 0x3a3c41, 0.82, 0.44, 0.62, 0, 0.12, -1.28)
  box(g, 0x55585e, 0.6, 0.06, 0.5, 0, 0.37, -1.28)
  for (const sx of [0.22, -0.22]) cyl(g, 0xb8bec4, 0.06, 0.5, sx, 0.08, -1.66, Math.PI / 2 - 0.3, 0, 0, 8)
  cyl(g, 0x9a2a1e, 0.13, 0.22, 0.3, 0.46, -1.1, 0, 0, 0, 10)
  // seats (buckets), steering wheel
  for (const s of def.seats) seat(g, s, 0x18191c)
  const sw = def.seats[0]
  box(g, 0x1a1a1a, 0.05, 0.05, 0.5, sw.x, sw.y + 0.08, 0.32, 0.75)
  const ring = new Mesh(new TorusGeometry(0.17, 0.026, 6, 16), new MeshStandardMaterial({ color: 0x1a1a1a }))
  ring.position.set(sw.x, sw.y + 0.26, 0.2)
  ring.rotation.set(-1.0, 0, 0)
  g.add(ring)
  // number board
  box(g, 0xf2efe8, 0.5, 0.3, 0.02, 0, 0.12, 1.84, -0.12)
  box(g, 0x1a1a1a, 0.08, 0.18, 0.025, -0.06, 0.12, 1.85, -0.12)
  box(g, 0x1a1a1a, 0.08, 0.18, 0.025, 0.06, 0.12, 1.85, -0.12)
  mergeChildren(g, mats().body)
  // light bar on the cage + tail lights
  for (const sx of [0.3, 0.1, -0.1, -0.3]) special(g, mats().lamp, new BoxGeometry(0.14, 0.1, 0.06), sx, top + 0.08, 0.2)
  for (const sx of [0.32, -0.32]) special(g, tailMat(g), new BoxGeometry(0.1, 0.08, 0.03), sx, 0.2, -1.6)
  g.userData.exhaust = [0, 0.08, -1.8]
  return g
}

// The mounted gun on its ring (vehicles.js turns it): yaw group at the pivot (local +z = where it
// points), pitch group carrying the gun, a muzzle point at the barrel's end.
function mountedGun(def) {
  const m = def.mount
  const yaw = new Group()
  yaw.position.set(m.x, m.y, m.z)
  const carriage = new Group()
  box(carriage, 0x2b2f26, 0.1, 0.3, 0.08, 0, -0.14, 0.5) // the post from the ring
  mergeChildren(carriage, mats().body)
  yaw.add(carriage)
  const pitch = new Group()
  pitch.position.set(0, 0, 0.5)
  const g = new Group()
  const K = 0x2a2c2f
  box(g, K, 0.16, 0.17, 0.56, 0, 0.02, 0.06) // receiver
  box(g, 0x1f2023, 0.12, 0.05, 0.4, 0, 0.13, 0.04) // top cover
  cyl(g, 0x1d1e20, 0.055, 0.5, 0, 0.02, 0.56, Math.PI / 2, 0, 0, 10) // barrel jacket
  cyl(g, 0x151617, 0.028, 0.5, 0, 0.02, 0.98, Math.PI / 2, 0, 0, 8) // barrel
  cyl(g, 0x151617, 0.045, 0.1, 0, 0.02, 1.24, Math.PI / 2, 0, 0, 8) // flash hider
  box(g, 0x4c5a2a, 0.16, 0.2, 0.26, 0.17, -0.02, 0.0) // ammo can
  box(g, 0xc9a23a, 0.04, 0.03, 0.14, 0.09, 0.05, 0.02) // belt
  for (const sx of [0.08, -0.08]) box(g, 0x18191b, 0.035, 0.12, 0.035, sx, -0.04, -0.27, 0.3) // spade grips
  box(g, 0x18191b, 0.2, 0.03, 0.03, 0, -0.02, -0.25)
  box(g, 0x55585e, 0.04, 0.08, 0.04, 0, 0.13, 0.32) // sight post
  mergeChildren(g, mats().gun)
  pitch.add(g)
  const muzzle = new Object3D()
  muzzle.position.set(0, 0.02, 1.3)
  pitch.add(muzzle)
  yaw.add(pitch)
  return { yaw, pitch, muzzle }
}

// Charred (destroyed) or as new: swaps the painted parts to the wreck material, hides glass and lamps.
export function setWrecked(root, on) {
  const M = mats()
  root.traverse((o) => {
    if (!o.isMesh) return
    if (o.userData.live === undefined) o.userData.live = o.material
    const live = o.userData.live
    if (live === M.glass || live === M.lamp || live === M.tail || live.userData?.isTail) o.visible = !on
    else o.material = on ? M.wreck : live
  })
}

// Each vehicle's own tail-lamp material (vehicles.js brightens it while braking).
function tailMat(g) {
  if (!g.userData.tail) {
    g.userData.tail = mats().tail.clone()
    g.userData.tail.userData.isTail = true
  }
  return g.userData.tail
}

const BUILDERS = { jeep, buggy }
const RIM = { jeep: 0x6f7550, buggy: 0xd8d2c4 }

// { root, body, wheels: [Group x4] (front left, front right, back left, back right), mount (the
// Jeep's gun: { yaw, pitch, muzzle }) or null, tail (its tail-lamp material), exhaust ([x, y, z]) }.
export function buildVehicleModel(type) {
  const def = VEHICLES[type]
  const root = new Group()
  root.name = `vehicle:${type}`
  const body = BUILDERS[type](def)
  root.add(body)
  const w = def.wheels
  const wheels = [
    [w.x, w.front, 1],
    [-w.x, w.front, -1],
    [w.x, w.back, 1],
    [-w.x, w.back, -1],
  ].map(([x, z, side]) => {
    const wg = new Group()
    wg.rotation.order = 'YXZ'
    wg.add(wheel(def, side, RIM[type]))
    wg.position.set(x, w.y - w.rest, z)
    root.add(wg)
    return wg
  })
  let mount = null
  if (def.mount) {
    mount = mountedGun(def)
    root.add(mount.yaw)
  }
  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = o.material !== mats().glass
      o.receiveShadow = true
    }
  })
  return { root, body, wheels, mount, tail: body.userData.tail, exhaust: body.userData.exhaust }
}
