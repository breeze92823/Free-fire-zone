// Procedural weapon models. Local frame: the grip (right hand) at the origin,
// barrel along +Z, up +Y, metres. `muzzle` (an Object3D at the barrel tip) and
// `ejector` (where shells fly out) are stashed on the returned group's userData.
// Each skin (SKINS in config) re-colours the body / accent / furniture parts.
// Models (BUILDERS ids): ar, smg, pistol, shotgun, lmg, dmr, sniper, knife,
// heavy (big-bore pistol), wasp (compact SMG), ridge (battle rifle), bullpup,
// double (break-action shotgun), autoshot (drum-fed shotgun), blade (long sword),
// mender (medic pistol, fixed white/red colours whatever the skin), and the second wave: gnat
// (full-auto pistol), mantis (machine pistol), revolver, falcon (bullpup), sentinel (burst rifle),
// sparrow (light DMR), whisper (silenced DMR), osprey (bolt-action), ranger (lever-action), bulldog
// (drum SMG), swarm (top-fed SMG), sawback (sawn-off), rattler (box-fed shotgun), machete, crowbar,
// pan, crossbow, thumper (grenade launcher), rhino (rocket launcher).
// Moving parts: a builder puts the meshes of a part that animates (slide, bolt, lever, pump,
// magazine, revolver cylinder, hammer, barrels, crossbow string, loaded round...) in a named group
// made with part(); bakeWeapon (merge.js) bakes each part into its own small mesh so actor.js can
// move it (animateParts). Names: slide, mag, bolt, lever, pump, cyl, hammer, barrels, breech, drum,
// stringL / stringR, round.
// Throwables: buildGrenade('frag' | 'ice' (frost) | 'pulse' | 'breach' | 'leech' | 'molotov' |
// 'smoke' | 'flash'), buildProjectile('bolt' | 'shell40' | 'rocket'), buildMedkit().
import {
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  SRGBColorSpace,
  TorusGeometry,
  SphereGeometry,
  RepeatWrapping,
} from 'three'
import { SKINS } from '../config.js'
import { mulberry32 } from '../textures.js'

const geoCache = new Map()
function box(w, h, d) {
  const k = `b${w},${h},${d}`
  if (!geoCache.has(k)) geoCache.set(k, new BoxGeometry(w, h, d))
  return geoCache.get(k)
}
function cyl(rt, rb, h, seg = 10) {
  const k = `c${rt},${rb},${h},${seg}`
  if (!geoCache.has(k)) {
    const g = new CylinderGeometry(rt, rb, h, seg)
    g.rotateX(Math.PI / 2) // along Z
    geoCache.set(k, g)
  }
  return geoCache.get(k)
}

function camoTexture(colors, seed = 3) {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')
  g.fillStyle = colors[0]
  g.fillRect(0, 0, 128, 128)
  const r = mulberry32(seed)
  for (let i = 0; i < 26; i++) {
    g.fillStyle = colors[1 + (i % (colors.length - 1))]
    g.beginPath()
    const x = r() * 128
    const y = r() * 128
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2
      const rr = 6 + r() * 14
      g.lineTo(x + Math.cos(a) * rr * 1.6, y + Math.sin(a) * rr)
    }
    g.fill()
  }
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.wrapS = t.wrapT = RepeatWrapping
  t.repeat.set(3, 3)
  return t
}

const matCache = new Map()
export function skinMaterials(skinId = 'standard') {
  if (matCache.has(skinId)) return matCache.get(skinId)
  const s = SKINS[skinId] ?? SKINS.standard
  const metal = !!s.metal
  const m = {
    body: new MeshStandardMaterial({ color: s.body, roughness: metal ? 0.28 : 0.55, metalness: metal ? 0.85 : 0.25, map: s.camo ? camoTexture(s.camo) : null }),
    accent: new MeshStandardMaterial({ color: s.accent, roughness: metal ? 0.25 : 0.5, metalness: metal ? 0.9 : 0.4 }),
    furniture: new MeshStandardMaterial({ color: s.furniture, roughness: 0.75, metalness: 0.05 }),
    steel: new MeshStandardMaterial({ color: '#2a2c30', roughness: 0.35, metalness: 0.8 }),
    dark: new MeshStandardMaterial({ color: '#141518', roughness: 0.6, metalness: 0.3 }),
    lens: new MeshStandardMaterial({ color: '#1b3a5a', roughness: 0.05, metalness: 0.2, emissive: '#0a2540', emissiveIntensity: 0.6 }),
    glow: s.glow ? new MeshStandardMaterial({ color: s.glow, emissive: s.glow, emissiveIntensity: 2.4, roughness: 0.4 }) : null,
    blade: new MeshStandardMaterial({ color: '#d7dde3', roughness: 0.18, metalness: 0.95 }),
  }
  matCache.set(skinId, m)
  return m
}

function add(group, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
  const mesh = new Mesh(geo, mat)
  mesh.position.set(x, y, z)
  mesh.rotation.set(rx, ry, rz)
  mesh.castShadow = true
  group.add(mesh)
  return mesh
}

// A moving part: a group whose origin is the part's pivot. Meshes added to it use coordinates
// relative to that pivot (a pivot at the origin keeps the model's own coordinates).
function part(group, name, x = 0, y = 0, z = 0) {
  const p = new Group()
  p.name = name
  p.userData.part = name
  p.position.set(x, y, z)
  group.add(p)
  return p
}

// A cylinder standing up (axis along Y), for discs whose face looks up (the pan, drum faces).
function cylY(rt, rb, h, seg = 12) {
  const k = `y${rt},${rb},${h},${seg}`
  if (!geoCache.has(k)) geoCache.set(k, new CylinderGeometry(rt, rb, h, seg))
  return geoCache.get(k)
}
// A cylinder lying along X (cross pins, knobs).
function cylX(r, h, seg = 8) {
  const k = `x${r},${h},${seg}`
  if (!geoCache.has(k)) {
    const g = new CylinderGeometry(r, r, h, seg)
    g.rotateZ(Math.PI / 2)
    geoCache.set(k, g)
  }
  return geoCache.get(k)
}
function sphere(r, w = 8, h = 6) {
  const k = `s${r},${w},${h}`
  if (!geoCache.has(k)) geoCache.set(k, new SphereGeometry(r, w, h))
  return geoCache.get(k)
}
// A box spanning x 0..1 (scaled at run time: the crossbow string halves).
function unitBarX() {
  const k = 'ux'
  if (!geoCache.has(k)) {
    const g = new BoxGeometry(1, 0.005, 0.005)
    g.translate(0.5, 0, 0)
    geoCache.set(k, g)
  }
  return geoCache.get(k)
}

// Fixed colours that every skin keeps (merged into the vertex colours like the skinned parts).
const fixed = {
  brass: new MeshStandardMaterial({ color: '#c99a3c', roughness: 0.3, metalness: 0.9 }),
  shell: new MeshStandardMaterial({ color: '#b3262a', roughness: 0.5, metalness: 0.1 }),
  olive: new MeshStandardMaterial({ color: '#4f5a32', roughness: 0.65, metalness: 0.2 }),
  oliveDark: new MeshStandardMaterial({ color: '#363d22', roughness: 0.6, metalness: 0.2 }),
  rubber: new MeshStandardMaterial({ color: '#17181a', roughness: 0.9, metalness: 0 }),
  red: new MeshStandardMaterial({ color: '#c0262b', roughness: 0.45, metalness: 0.3 }),
  iron: new MeshStandardMaterial({ color: '#2b2b2e', roughness: 0.55, metalness: 0.6 }),
  ironIn: new MeshStandardMaterial({ color: '#1a1a1c', roughness: 0.75, metalness: 0.4 }),
  wood: new MeshStandardMaterial({ color: '#6b4426', roughness: 0.7, metalness: 0.05 }),
  cord: new MeshStandardMaterial({ color: '#e8e2cf', roughness: 0.9, metalness: 0 }),
  fletch: new MeshStandardMaterial({ color: '#ff8a1f', roughness: 0.6, metalness: 0 }),
  smoked: new MeshStandardMaterial({ color: '#2e3424', roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.55 }),
}

function marker(group, name, x, y, z) {
  const o = new Object3D()
  o.name = name
  o.position.set(x, y, z)
  group.add(o)
  return o
}

// Picatinny rail: a strip with notches.
function rail(g, mat, x, y, z, len) {
  add(g, box(0.034, 0.012, len), mat, x, y, z)
  const n = Math.floor(len / 0.022)
  for (let i = 0; i < n; i++) add(g, box(0.04, 0.008, 0.009), mat, x, y + 0.009, z - len / 2 + 0.011 + i * 0.022)
}

function scope(g, m, z, len = 0.3, r = 0.034) {
  add(g, cyl(r, r, len, 14), m.dark, 0, 0.165, z)
  add(g, cyl(r * 1.35, r, 0.07, 14), m.dark, 0, 0.165, z + len / 2 + 0.03)
  add(g, cyl(r * 1.25, r, 0.06, 14), m.dark, 0, 0.165, z - len / 2 - 0.02)
  add(g, cyl(r * 1.15, r * 1.15, 0.005, 14), m.lens, 0, 0.165, z + len / 2 + 0.066)
  add(g, cyl(r * 1.05, r * 1.05, 0.005, 14), m.lens, 0, 0.165, z - len / 2 - 0.052)
  add(g, cyl(0.016, 0.016, 0.05, 8), m.dark, 0, 0.215, z, Math.PI / 2) // turret
  add(g, cyl(0.016, 0.016, 0.05, 8), m.dark, 0.045, 0.165, z, 0, 0, Math.PI / 2)
  add(g, box(0.03, 0.04, 0.03), m.dark, 0, 0.125, z - len * 0.25)
  add(g, box(0.03, 0.04, 0.03), m.dark, 0, 0.125, z + len * 0.25)
}

function redDot(g, m, z) {
  add(g, box(0.05, 0.012, 0.07), m.dark, 0, 0.115, z)
  add(g, box(0.008, 0.055, 0.05), m.dark, 0.022, 0.145, z)
  add(g, box(0.008, 0.055, 0.05), m.dark, -0.022, 0.145, z)
  add(g, box(0.05, 0.008, 0.05), m.dark, 0, 0.175, z)
  add(g, box(0.036, 0.04, 0.003), m.lens, 0, 0.145, z + 0.02)
}

// --- Models ---------------------------------------------------------------------------
function buildAR(g, m) {
  // Receiver
  add(g, box(0.07, 0.085, 0.36), m.body, 0, 0.055, 0.05)
  add(g, box(0.072, 0.03, 0.3), m.accent, 0, 0.11, 0.07) // upper
  rail(g, m.dark, 0, 0.128, 0.06, 0.28)
  add(g, box(0.074, 0.02, 0.06), m.dark, 0.0, 0.07, 0.14) // ejection port
  add(part(g, 'slide'), box(0.02, 0.018, 0.04), m.steel, 0.042, 0.075, 0.14) // charging handle
  // Handguard with vents
  add(g, box(0.068, 0.075, 0.32), m.body, 0, 0.065, 0.39)
  for (let i = 0; i < 5; i++) add(g, box(0.071, 0.018, 0.035), m.dark, 0, 0.06, 0.27 + i * 0.055)
  rail(g, m.dark, 0, 0.11, 0.39, 0.3)
  add(g, box(0.03, 0.05, 0.05), m.furniture, 0, 0.005, 0.42) // foregrip stub
  // Barrel + muzzle brake
  add(g, cyl(0.014, 0.014, 0.24, 10), m.steel, 0, 0.07, 0.66)
  add(g, cyl(0.022, 0.022, 0.07, 8), m.dark, 0, 0.07, 0.8)
  for (let i = 0; i < 3; i++) add(g, box(0.05, 0.008, 0.008), m.steel, 0, 0.07, 0.775 + i * 0.02)
  add(g, box(0.012, 0.04, 0.02), m.dark, 0, 0.115, 0.6) // front sight
  // Magazine (curved: two angled boxes)
  const mg = part(g, 'mag')
  add(mg, box(0.05, 0.13, 0.075), m.furniture, 0, -0.045, 0.135, 0.1)
  add(mg, box(0.05, 0.11, 0.072), m.furniture, 0, -0.16, 0.16, 0.32)
  add(mg, box(0.054, 0.015, 0.08), m.accent, 0, -0.22, 0.18, 0.32)
  // Grip + trigger guard
  add(g, box(0.045, 0.13, 0.055), m.furniture, 0, -0.05, -0.02, -0.28)
  add(g, box(0.012, 0.012, 0.08), m.steel, 0, -0.01, 0.04)
  add(g, box(0.008, 0.03, 0.008), m.steel, 0, 0.005, 0.03)
  // Stock
  add(g, box(0.04, 0.04, 0.16), m.steel, 0, 0.065, -0.2)
  add(g, box(0.06, 0.12, 0.15), m.furniture, 0, 0.04, -0.33)
  add(g, box(0.065, 0.14, 0.025), m.dark, 0, 0.035, -0.415)
  add(g, box(0.05, 0.035, 0.12), m.body, 0, 0.11, -0.32) // cheek rest
  redDot(g, m, 0.08)
  if (m.glow) add(g, box(0.074, 0.006, 0.26), m.glow, 0, 0.04, 0.39)
  return { muzzle: [0, 0.07, 0.84], ejector: [0.04, 0.07, 0.14], length: 1.26 }
}

function buildSMG(g, m) {
  add(g, box(0.07, 0.1, 0.3), m.body, 0, 0.06, 0.08)
  add(g, box(0.072, 0.03, 0.26), m.accent, 0, 0.12, 0.08)
  rail(g, m.dark, 0, 0.142, 0.08, 0.22)
  add(g, box(0.066, 0.06, 0.12), m.body, 0, 0.05, 0.28) // short handguard
  add(g, cyl(0.016, 0.016, 0.12, 10), m.steel, 0, 0.065, 0.38)
  add(g, cyl(0.026, 0.026, 0.1, 10), m.dark, 0, 0.065, 0.46) // suppressor-ish
  // Straight mag ahead of the grip
  const mg = part(g, 'mag')
  add(mg, box(0.045, 0.2, 0.06), m.furniture, 0, -0.08, 0.16)
  add(mg, box(0.05, 0.015, 0.066), m.accent, 0, -0.18, 0.16)
  add(g, box(0.045, 0.12, 0.05), m.furniture, 0, -0.045, -0.01, -0.22)
  add(g, box(0.012, 0.012, 0.07), m.steel, 0, -0.005, 0.05)
  // Folding stock frame
  add(g, box(0.012, 0.012, 0.22), m.steel, 0.025, 0.08, -0.16)
  add(g, box(0.012, 0.012, 0.22), m.steel, -0.025, 0.08, -0.16)
  add(g, box(0.06, 0.1, 0.02), m.dark, 0, 0.06, -0.27)
  add(g, box(0.012, 0.04, 0.02), m.dark, 0, 0.16, 0.0)
  add(g, box(0.012, 0.03, 0.02), m.dark, 0, 0.155, 0.17)
  if (m.glow) add(g, box(0.074, 0.006, 0.2), m.glow, 0, 0.03, 0.1)
  return { muzzle: [0, 0.065, 0.52], ejector: [0.04, 0.08, 0.1], length: 0.82 }
}

function buildPistol(g, m) {
  const sl = part(g, 'slide')
  add(sl, box(0.035, 0.045, 0.2), m.body, 0, 0.075, 0.06) // slide
  for (let i = 0; i < 5; i++) add(sl, box(0.037, 0.03, 0.005), m.dark, 0, 0.078, -0.02 + i * 0.012) // serrations
  add(sl, box(0.008, 0.012, 0.01), m.dark, 0, 0.103, 0.14)
  add(sl, box(0.02, 0.012, 0.01), m.dark, 0, 0.103, -0.02)
  add(sl, box(0.002, 0.016, 0.04), m.dark, 0.0185, 0.08, 0.06) // ejection port
  add(part(g, 'mag'), box(0.026, 0.02, 0.036), m.dark, 0, -0.08, -0.03, -0.2) // base plate
  add(g, box(0.032, 0.03, 0.17), m.furniture, 0, 0.04, 0.05) // frame
  add(g, box(0.032, 0.11, 0.045), m.furniture, 0, -0.025, -0.01, -0.2)
  add(g, box(0.008, 0.008, 0.05), m.steel, 0, 0.015, 0.035)
  add(g, cyl(0.009, 0.009, 0.02, 8), m.steel, 0, 0.075, 0.17)
  if (m.glow) add(g, box(0.037, 0.005, 0.12), m.glow, 0, 0.06, 0.08)
  return { muzzle: [0, 0.075, 0.18], ejector: [0.02, 0.09, 0.04], length: 0.3 }
}

function buildShotgun(g, m) {
  add(g, box(0.07, 0.09, 0.32), m.body, 0, 0.06, 0.04)
  add(g, cyl(0.022, 0.022, 0.6, 12), m.steel, 0, 0.09, 0.48) // barrel
  add(g, cyl(0.02, 0.02, 0.48, 12), m.steel, 0, 0.045, 0.42) // tube magazine
  const pump = part(g, 'pump')
  add(pump, box(0.07, 0.07, 0.2), m.furniture, 0, 0.045, 0.36) // pump
  for (let i = 0; i < 6; i++) add(pump, box(0.073, 0.072, 0.008), m.dark, 0, 0.045, 0.28 + i * 0.03)
  add(g, box(0.045, 0.12, 0.055), m.furniture, 0, -0.04, -0.06, -0.3)
  add(g, box(0.012, 0.012, 0.08), m.steel, 0, -0.005, 0.0)
  add(g, box(0.062, 0.11, 0.3), m.furniture, 0, 0.03, -0.3, 0.08) // stock
  add(g, box(0.066, 0.13, 0.025), m.dark, 0, 0.015, -0.45, 0.08)
  add(g, box(0.014, 0.02, 0.02), m.accent, 0, 0.115, 0.76)
  rail(g, m.dark, 0, 0.115, 0.04, 0.2)
  for (let i = 0; i < 4; i++) add(g, cyl(0.011, 0.011, 0.05, 8), m.accent, 0.04, 0.06, -0.02 + i * 0.05, 0, 0, 0) // side shells
  if (m.glow) add(g, box(0.074, 0.006, 0.18), m.glow, 0, 0.1, 0.06)
  return { muzzle: [0, 0.09, 0.79], ejector: [0.04, 0.07, 0.06], length: 1.25 }
}

function buildLMG(g, m) {
  add(g, box(0.085, 0.11, 0.42), m.body, 0, 0.06, 0.05)
  add(g, box(0.09, 0.035, 0.3), m.accent, 0, 0.13, 0.03) // feed cover
  add(g, box(0.07, 0.08, 0.3), m.body, 0, 0.06, 0.41)
  for (let i = 0; i < 6; i++) add(g, cyl(0.022, 0.022, 0.012, 10), m.dark, 0, 0.065, 0.5 + i * 0.04) // barrel shroud fins
  add(g, cyl(0.018, 0.018, 0.5, 10), m.steel, 0, 0.065, 0.66)
  add(g, cyl(0.026, 0.026, 0.08, 8), m.dark, 0, 0.065, 0.92)
  add(g, box(0.02, 0.02, 0.14), m.steel, 0, 0.1, 0.33) // carry handle
  add(g, box(0.02, 0.05, 0.02), m.steel, 0, 0.08, 0.27)
  add(g, box(0.02, 0.05, 0.02), m.steel, 0, 0.08, 0.39)
  // Box magazine + belt
  const mg = part(g, 'mag')
  add(mg, box(0.12, 0.13, 0.14), m.furniture, -0.03, -0.06, 0.12)
  add(mg, box(0.122, 0.02, 0.142), m.accent, -0.03, -0.12, 0.12)
  for (let i = 0; i < 5; i++) add(g, cyl(0.008, 0.008, 0.035, 6), m.accent, 0.03, 0.02 + i * 0.012, 0.1 + i * 0.015, 0, Math.PI / 2, 0)
  // Bipod folded
  add(g, box(0.012, 0.012, 0.22), m.steel, 0.025, 0.02, 0.62)
  add(g, box(0.012, 0.012, 0.22), m.steel, -0.025, 0.02, 0.62)
  add(g, box(0.05, 0.13, 0.06), m.furniture, 0, -0.05, -0.04, -0.28)
  add(g, box(0.07, 0.12, 0.2), m.furniture, 0, 0.04, -0.28)
  add(g, box(0.075, 0.14, 0.03), m.dark, 0, 0.035, -0.39)
  redDot(g, m, -0.06)
  if (m.glow) add(g, box(0.09, 0.007, 0.3), m.glow, 0, 0.04, 0.05)
  return { muzzle: [0, 0.065, 0.97], ejector: [0.05, 0.06, 0.08], length: 1.4 }
}

function buildDMR(g, m) {
  add(g, box(0.07, 0.085, 0.38), m.body, 0, 0.055, 0.06)
  add(g, box(0.072, 0.03, 0.32), m.accent, 0, 0.11, 0.08)
  add(g, box(0.066, 0.075, 0.36), m.body, 0, 0.065, 0.43)
  for (let i = 0; i < 6; i++) add(g, box(0.069, 0.016, 0.03), m.dark, 0, 0.062, 0.29 + i * 0.05)
  add(g, cyl(0.014, 0.014, 0.34, 10), m.steel, 0, 0.07, 0.78)
  add(g, cyl(0.022, 0.022, 0.08, 8), m.dark, 0, 0.07, 0.96)
  add(part(g, 'mag'), box(0.05, 0.12, 0.07), m.furniture, 0, -0.04, 0.14)
  add(g, box(0.045, 0.13, 0.055), m.furniture, 0, -0.05, -0.03, -0.28)
  add(g, box(0.012, 0.012, 0.08), m.steel, 0, -0.01, 0.03)
  add(g, box(0.06, 0.13, 0.2), m.furniture, 0, 0.035, -0.3)
  add(g, box(0.065, 0.15, 0.025), m.dark, 0, 0.03, -0.41)
  scope(g, m, 0.08, 0.26, 0.03)
  if (m.glow) add(g, box(0.074, 0.006, 0.3), m.glow, 0, 0.04, 0.43)
  return { muzzle: [0, 0.07, 1.0], ejector: [0.04, 0.07, 0.14], length: 1.42 }
}

function buildSniper(g, m) {
  add(g, box(0.07, 0.08, 0.36), m.body, 0, 0.06, 0.06)
  const bolt = part(g, 'bolt', 0, 0.08, 0.02)
  add(bolt, cylX(0.013, 0.08), m.steel, 0.05, 0, 0) // bolt handle
  add(bolt, sphere(0.018), m.steel, 0.09, 0, 0)
  add(bolt, cyl(0.02, 0.02, 0.06, 10), m.steel, 0, 0, -0.03) // bolt body behind the receiver
  add(g, box(0.075, 0.07, 0.42), m.furniture, 0, 0.045, 0.45) // forend
  add(g, cyl(0.017, 0.015, 0.62, 12), m.steel, 0, 0.075, 0.88) // long barrel
  add(g, box(0.07, 0.04, 0.09), m.dark, 0, 0.075, 1.2) // muzzle brake
  add(g, box(0.09, 0.012, 0.012), m.dark, 0, 0.075, 1.18)
  add(g, box(0.05, 0.08, 0.08), m.furniture, 0, -0.02, 0.18)
  add(g, box(0.045, 0.14, 0.055), m.furniture, 0, -0.05, -0.05, -0.32)
  add(g, box(0.012, 0.012, 0.08), m.steel, 0, -0.01, 0.02)
  // Thumbhole stock
  add(g, box(0.065, 0.06, 0.34), m.furniture, 0, 0.07, -0.3)
  add(g, box(0.065, 0.05, 0.2), m.furniture, 0, -0.04, -0.35, -0.3)
  add(g, box(0.07, 0.17, 0.03), m.dark, 0, 0.02, -0.48)
  add(g, box(0.05, 0.03, 0.14), m.accent, 0, 0.115, -0.32) // cheek
  // Bipod
  add(g, box(0.012, 0.18, 0.012), m.steel, 0.03, -0.05, 0.6, 0.6)
  add(g, box(0.012, 0.18, 0.012), m.steel, -0.03, -0.05, 0.6, 0.6)
  scope(g, m, 0.1, 0.36, 0.036)
  if (m.glow) add(g, box(0.078, 0.006, 0.36), m.glow, 0, 0.02, 0.45)
  return { muzzle: [0, 0.075, 1.25], ejector: [0.04, 0.08, 0.06], length: 1.75 }
}

function buildKnife(g, m) {
  add(g, box(0.03, 0.035, 0.12), m.furniture, 0, 0, 0) // handle
  for (let i = 0; i < 3; i++) add(g, box(0.032, 0.037, 0.008), m.dark, 0, 0, -0.04 + i * 0.04)
  add(g, box(0.07, 0.015, 0.02), m.steel, 0, 0, 0.07) // guard
  add(g, box(0.008, 0.045, 0.2), m.blade, 0, 0.005, 0.18)
  add(g, box(0.006, 0.02, 0.06), m.blade, 0, 0.0, 0.3, 0.35)
  if (m.glow) add(g, box(0.01, 0.004, 0.18), m.glow, 0, 0.027, 0.18)
  return { muzzle: [0, 0, 0.3], ejector: [0, 0, 0], length: 0.36 }
}

// Big-bore heavy pistol: chunky long slide, ported shroud, a larger grip.
function buildHeavy(g, m) {
  const sl = part(g, 'slide')
  add(sl, box(0.044, 0.056, 0.24), m.body, 0, 0.082, 0.05) // slide
  for (let i = 0; i < 6; i++) add(sl, box(0.046, 0.038, 0.006), m.dark, 0, 0.084, -0.055 + i * 0.012) // serrations
  add(sl, box(0.03, 0.01, 0.16), m.accent, 0, 0.115, 0.06) // top rib
  add(sl, box(0.026, 0.014, 0.012), m.dark, 0, 0.117, -0.055) // rear sight
  // Ported barrel shroud
  add(g, box(0.046, 0.05, 0.09), m.accent, 0, 0.08, 0.215)
  for (let i = 0; i < 3; i++) add(g, box(0.03, 0.006, 0.014), m.dark, 0, 0.104, 0.188 + i * 0.024)
  for (let i = 0; i < 2; i++) add(g, box(0.048, 0.014, 0.018), m.dark, 0, 0.08, 0.2 + i * 0.03)
  add(g, cyl(0.014, 0.014, 0.008, 10), m.dark, 0, 0.08, 0.262) // bore
  // Frame, accessory stub, trigger
  add(g, box(0.04, 0.034, 0.2), m.furniture, 0, 0.04, 0.06)
  add(g, box(0.03, 0.01, 0.07), m.dark, 0, 0.018, 0.12)
  add(g, box(0.008, 0.008, 0.06), m.steel, 0, 0.0, 0.04)
  add(g, box(0.008, 0.03, 0.008), m.steel, 0, 0.012, 0.07)
  add(g, box(0.006, 0.025, 0.006), m.steel, 0, 0.012, 0.025)
  // Larger grip with panels + base plate
  add(g, box(0.042, 0.135, 0.06), m.furniture, 0, -0.03, -0.02, 0.22)
  add(g, box(0.046, 0.09, 0.04), m.dark, 0, -0.03, -0.02, 0.22)
  add(g, box(0.046, 0.014, 0.064), m.accent, 0, -0.1, -0.036, 0.22)
  add(g, box(0.012, 0.02, 0.014), m.steel, 0, 0.1, -0.078) // hammer
  add(g, box(0.01, 0.014, 0.01), m.dark, 0, 0.12, 0.155) // front sight
  if (m.glow) add(g, box(0.047, 0.005, 0.14), m.glow, 0, 0.064, 0.08)
  return { muzzle: [0, 0.08, 0.27], ejector: [0.025, 0.1, 0.06], length: 0.36 }
}

// Compact futuristic SMG: short body, angular shroud, vertical foregrip, stub stock.
function buildWasp(g, m) {
  add(g, box(0.066, 0.085, 0.24), m.body, 0, 0.05, 0.05) // receiver
  add(g, box(0.068, 0.026, 0.22), m.accent, 0, 0.1, 0.05) // upper
  rail(g, m.dark, 0, 0.118, 0.03, 0.16)
  add(g, box(0.068, 0.018, 0.05), m.dark, 0, 0.07, 0.08) // ejection port
  add(g, box(0.016, 0.016, 0.03), m.steel, -0.04, 0.08, 0.12) // charging handle
  // Angular shroud
  add(g, box(0.072, 0.08, 0.18), m.body, 0, 0.055, 0.26)
  add(g, box(0.06, 0.02, 0.12), m.accent, 0, 0.1, 0.27, -0.12)
  add(g, box(0.07, 0.04, 0.09), m.accent, 0, 0.022, 0.32, 0.45)
  for (let i = 0; i < 3; i++) add(g, box(0.075, 0.012, 0.03), m.dark, 0, 0.068, 0.21 + i * 0.04)
  add(g, cyl(0.014, 0.014, 0.04, 10), m.steel, 0, 0.06, 0.365)
  add(g, cyl(0.02, 0.018, 0.03, 6), m.dark, 0, 0.06, 0.39)
  // Vertical foregrip
  add(g, box(0.032, 0.1, 0.036), m.furniture, 0, -0.035, 0.28)
  add(g, box(0.036, 0.012, 0.04), m.dark, 0, -0.09, 0.28)
  // Short stick mag
  add(g, box(0.05, 0.03, 0.062), m.body, 0, 0.0, 0.13)
  const mg = part(g, 'mag')
  add(mg, box(0.04, 0.12, 0.05), m.furniture, 0, -0.05, 0.13)
  add(mg, box(0.044, 0.012, 0.054), m.accent, 0, -0.112, 0.13)
  // Grip + trigger
  add(g, box(0.04, 0.12, 0.05), m.furniture, 0, -0.045, -0.01, 0.25)
  add(g, box(0.01, 0.01, 0.07), m.steel, 0, -0.005, 0.05)
  add(g, box(0.006, 0.024, 0.006), m.steel, 0, 0.008, 0.035)
  // Collapsed stub stock
  add(g, box(0.06, 0.08, 0.02), m.dark, 0, 0.05, -0.078)
  add(g, box(0.01, 0.01, 0.06), m.steel, 0.022, 0.06, -0.11)
  add(g, box(0.01, 0.01, 0.06), m.steel, -0.022, 0.06, -0.11)
  add(g, box(0.058, 0.085, 0.018), m.dark, 0, 0.05, -0.145)
  redDot(g, m, 0.02)
  if (m.glow) add(g, box(0.074, 0.005, 0.2), m.glow, 0, 0.03, 0.14)
  return { muzzle: [0, 0.06, 0.405], ejector: [0.04, 0.07, 0.08], length: 0.55 }
}

// Classic battle rifle: wood stock + handguard, banana magazine, gas tube.
function buildRidge(g, m) {
  add(g, box(0.065, 0.08, 0.26), m.body, 0, 0.055, 0.07) // receiver
  add(g, box(0.06, 0.025, 0.22), m.accent, 0, 0.105, 0.07) // dust cover
  add(g, box(0.067, 0.02, 0.07), m.dark, 0, 0.075, 0.12) // ejection port
  add(g, box(0.03, 0.016, 0.022), m.steel, 0.045, 0.08, 0.16) // charging handle
  add(g, box(0.006, 0.012, 0.04), m.steel, 0.034, 0.04, 0.0) // selector
  add(g, box(0.03, 0.02, 0.04), m.dark, 0, 0.125, -0.03) // rear sight
  // Wooden handguard, gas tube, barrel
  add(g, box(0.07, 0.06, 0.2), m.furniture, 0, 0.045, 0.3)
  add(g, box(0.05, 0.03, 0.14), m.furniture, 0, 0.098, 0.29)
  add(g, cyl(0.01, 0.01, 0.1, 8), m.steel, 0, 0.098, 0.4) // gas tube
  add(g, cyl(0.013, 0.013, 0.16, 10), m.steel, 0, 0.065, 0.42) // barrel
  add(g, cyl(0.004, 0.004, 0.12, 6), m.steel, 0, 0.035, 0.44) // cleaning rod
  add(g, box(0.03, 0.05, 0.03), m.dark, 0, 0.085, 0.455) // front sight block
  add(g, box(0.006, 0.03, 0.006), m.dark, 0, 0.125, 0.455)
  add(g, box(0.004, 0.026, 0.012), m.dark, 0.012, 0.122, 0.455)
  add(g, box(0.004, 0.026, 0.012), m.dark, -0.012, 0.122, 0.455)
  add(g, cyl(0.018, 0.018, 0.04, 8), m.dark, 0, 0.065, 0.49) // muzzle brake
  add(g, box(0.04, 0.006, 0.01), m.steel, 0, 0.065, 0.495)
  // Curved (banana) magazine: three angled boxes curving forward
  const mg = part(g, 'mag')
  add(mg, box(0.045, 0.09, 0.07), m.steel, 0, -0.025, 0.1, -0.08)
  add(mg, box(0.044, 0.09, 0.068), m.steel, 0, -0.113, 0.118, -0.32)
  add(mg, box(0.047, 0.012, 0.05), m.dark, 0, -0.113, 0.118, -0.32)
  add(mg, box(0.043, 0.08, 0.066), m.steel, 0, -0.189, 0.153, -0.55)
  add(mg, box(0.048, 0.012, 0.07), m.dark, 0, -0.228, 0.177, -0.55)
  // Grip + trigger
  add(g, box(0.042, 0.12, 0.052), m.furniture, 0, -0.045, -0.02, 0.3)
  add(g, box(0.01, 0.01, 0.08), m.steel, 0, -0.008, 0.02)
  add(g, box(0.006, 0.024, 0.006), m.steel, 0, 0.005, 0.01)
  // Wooden stock
  add(g, box(0.05, 0.07, 0.12), m.furniture, 0, 0.055, -0.12) // wrist
  add(g, box(0.058, 0.12, 0.2), m.furniture, 0, 0.025, -0.28, -0.08)
  add(g, box(0.05, 0.03, 0.12), m.furniture, 0, 0.09, -0.27) // comb
  add(g, box(0.062, 0.135, 0.02), m.dark, 0, 0.02, -0.39)
  add(g, box(0.012, 0.02, 0.02), m.steel, 0, -0.04, -0.33) // sling swivel
  if (m.glow) add(g, box(0.073, 0.006, 0.16), m.glow, 0, 0.03, 0.3)
  return { muzzle: [0, 0.065, 0.515], ejector: [0.04, 0.075, 0.12], length: 0.92 }
}

// Bullpup rifle: magazine behind the grip, one-piece shell, carry handle + small scope.
function buildBullpup(g, m) {
  add(g, box(0.07, 0.1, 0.6), m.body, 0, 0.045, -0.05) // one-piece shell
  add(g, box(0.072, 0.16, 0.05), m.body, 0, 0.02, -0.33) // butt
  add(g, box(0.074, 0.165, 0.02), m.dark, 0, 0.02, -0.36)
  add(g, box(0.06, 0.02, 0.18), m.accent, 0, 0.1, -0.22) // cheek piece
  add(g, box(0.064, 0.07, 0.1), m.body, 0, 0.055, 0.29) // front taper
  add(g, box(0.066, 0.05, 0.08), m.accent, 0, 0.0, 0.27, 0.5)
  for (let i = 0; i < 3; i++) add(g, box(0.073, 0.012, 0.03), m.dark, 0, 0.06, 0.12 + i * 0.04)
  add(g, box(0.072, 0.02, 0.06), m.dark, 0, 0.06, -0.17) // ejection port
  // Grip with a full hand guard
  add(g, box(0.04, 0.12, 0.052), m.furniture, 0, -0.05, 0.0, 0.25)
  add(g, box(0.036, 0.016, 0.1), m.body, 0, -0.112, 0.03)
  add(g, box(0.036, 0.11, 0.028), m.body, 0, -0.058, 0.093, 0.23)
  add(g, box(0.006, 0.025, 0.006), m.steel, 0, -0.015, 0.04)
  // Curved magazine behind the grip
  const mg = part(g, 'mag')
  add(mg, box(0.045, 0.1, 0.066), m.furniture, 0, -0.05, -0.1, -0.1)
  add(mg, box(0.044, 0.06, 0.064), m.furniture, 0, -0.128, -0.086, -0.3)
  add(mg, box(0.048, 0.012, 0.068), m.accent, 0, -0.16, -0.076, -0.3)
  // Integrated carry handle + small scope
  add(g, box(0.03, 0.035, 0.03), m.body, 0, 0.11, -0.12)
  add(g, box(0.03, 0.035, 0.03), m.body, 0, 0.11, 0.12)
  add(g, box(0.034, 0.025, 0.3), m.accent, 0, 0.14, 0)
  add(g, box(0.02, 0.012, 0.06), m.dark, 0, 0.157, 0)
  add(g, cyl(0.022, 0.022, 0.14, 12), m.dark, 0, 0.18, 0)
  add(g, cyl(0.028, 0.022, 0.03, 12), m.dark, 0, 0.18, 0.085)
  add(g, cyl(0.026, 0.022, 0.03, 12), m.dark, 0, 0.18, -0.08)
  add(g, cyl(0.025, 0.025, 0.004, 12), m.lens, 0, 0.18, 0.101)
  add(g, cyl(0.023, 0.023, 0.004, 12), m.lens, 0, 0.18, -0.096)
  // Short barrel stub
  add(g, cyl(0.015, 0.015, 0.03, 10), m.steel, 0, 0.055, 0.35)
  add(g, cyl(0.02, 0.02, 0.03, 6), m.dark, 0, 0.055, 0.37)
  if (m.glow) add(g, box(0.073, 0.005, 0.4), m.glow, 0, 0.02, -0.05)
  return { muzzle: [0, 0.055, 0.385], ejector: [0.04, 0.06, -0.17], length: 0.76 }
}

// Double-barrel break-action shotgun: side-by-side barrels, wood, exposed hammers.
function buildDouble(g, m) {
  add(g, box(0.07, 0.07, 0.14), m.body, 0, 0.06, 0.06) // action
  add(g, box(0.074, 0.05, 0.1), m.accent, 0, 0.055, 0.05) // side plates
  add(g, cyl(0.012, 0.012, 0.075, 8), m.steel, 0, 0.045, 0.13, 0, Math.PI / 2) // hinge pin
  // The barrels and forend tip down round the hinge pin to reload.
  const brl = part(g, 'barrels', 0, 0.045, 0.13)
  for (const x of [-0.019, 0.019]) {
    add(brl, cyl(0.018, 0.018, 0.56, 12), m.steel, x, 0.04, 0.28)
    add(brl, cyl(0.012, 0.012, 0.004, 10), m.dark, x, 0.04, 0.56)
    add(brl, cyl(0.013, 0.013, 0.006, 10), fixed.brass, x, 0.04, 0.0) // shell rims
  }
  add(brl, box(0.012, 0.006, 0.56), m.dark, 0, 0.06, 0.28) // top rib
  add(brl, box(0.006, 0.006, 0.006), m.accent, 0, 0.066, 0.55) // bead
  add(brl, box(0.06, 0.04, 0.24), m.furniture, 0, 0.01, 0.17) // wooden forend
  for (let i = 0; i < 3; i++) add(brl, box(0.062, 0.025, 0.006), m.dark, 0, 0.005, 0.12 + i * 0.04)
  for (const x of [-0.019, 0.019]) {
    // Exposed hammers (cocked back)
    add(g, box(0.01, 0.04, 0.014), m.steel, x, 0.1, -0.005, -0.4)
    add(g, box(0.012, 0.008, 0.02), m.steel, x, 0.12, -0.02)
  }
  add(g, box(0.012, 0.008, 0.04), m.steel, 0, 0.1, 0.02, 0, 0.4) // top lever
  // Twin triggers
  add(g, box(0.01, 0.01, 0.09), m.steel, 0, 0.0, 0.04)
  add(g, box(0.006, 0.024, 0.006), m.steel, 0, 0.015, 0.03)
  add(g, box(0.006, 0.024, 0.006), m.steel, 0, 0.015, 0.055)
  // Wooden stock
  add(g, box(0.042, 0.055, 0.16), m.furniture, 0, 0.03, -0.07, -0.2) // wrist
  add(g, box(0.042, 0.06, 0.05), m.furniture, 0, -0.01, -0.06, 0.3)
  add(g, box(0.055, 0.13, 0.26), m.furniture, 0, 0.005, -0.28, -0.06)
  add(g, box(0.058, 0.14, 0.022), m.dark, 0, 0.0, -0.42)
  if (m.glow) for (const x of [-0.038, 0.038]) add(g, box(0.004, 0.006, 0.4), m.glow, x, 0.085, 0.42)
  return { muzzle: [0, 0.085, 0.7], ejector: [0.03, 0.09, 0.13], length: 1.12 }
}

// Magazine-fed automatic shotgun: boxy receiver, drum, ribbed shroud, rail.
function buildAutoshot(g, m) {
  add(g, box(0.08, 0.11, 0.36), m.body, 0, 0.055, 0.06) // receiver
  add(g, box(0.082, 0.025, 0.3), m.accent, 0, 0.115, 0.06)
  rail(g, m.dark, 0, 0.133, 0.05, 0.26)
  add(g, box(0.083, 0.03, 0.08), m.dark, 0, 0.075, 0.12) // ejection port
  add(g, box(0.02, 0.02, 0.04), m.steel, -0.048, 0.08, 0.2) // charging handle
  // Ribbed barrel shroud + brake
  add(g, cyl(0.034, 0.034, 0.3, 10), m.dark, 0, 0.07, 0.39)
  for (let i = 0; i < 8; i++) add(g, cyl(0.038, 0.038, 0.012, 10), m.steel, 0, 0.07, 0.265 + i * 0.036)
  add(g, cyl(0.02, 0.02, 0.08, 10), m.steel, 0, 0.07, 0.56)
  add(g, box(0.06, 0.045, 0.06), m.dark, 0, 0.07, 0.62)
  for (let i = 0; i < 3; i++) add(g, box(0.065, 0.008, 0.01), m.steel, 0, 0.07, 0.6 + i * 0.018)
  add(g, box(0.012, 0.03, 0.015), m.dark, 0, 0.115, 0.52) // front sight
  add(g, box(0.032, 0.07, 0.04), m.furniture, 0, 0.0, 0.4) // foregrip
  // Drum magazine
  add(g, box(0.05, 0.04, 0.06), m.furniture, 0, 0.0, 0.15)
  const mg = part(g, 'mag')
  add(mg, cyl(0.085, 0.085, 0.07, 16), m.furniture, 0, -0.08, 0.15, 0, Math.PI / 2)
  add(mg, cyl(0.05, 0.05, 0.076, 12), m.accent, 0, -0.08, 0.15, 0, Math.PI / 2)
  // Grip + trigger
  add(g, box(0.046, 0.13, 0.056), m.furniture, 0, -0.05, -0.015, 0.25)
  add(g, box(0.012, 0.012, 0.08), m.steel, 0, -0.005, 0.035)
  add(g, box(0.006, 0.024, 0.006), m.steel, 0, 0.01, 0.02)
  // Stock
  add(g, box(0.06, 0.1, 0.22), m.furniture, 0, 0.05, -0.23)
  add(g, box(0.05, 0.04, 0.1), m.furniture, 0, -0.02, -0.29, 0.3)
  add(g, box(0.05, 0.025, 0.14), m.accent, 0, 0.11, -0.24)
  add(g, box(0.065, 0.13, 0.03), m.dark, 0, 0.04, -0.355)
  if (m.glow) add(g, box(0.083, 0.006, 0.28), m.glow, 0, 0.03, 0.06)
  return { muzzle: [0, 0.07, 0.655], ejector: [0.045, 0.075, 0.12], length: 1.02 }
}

// Long single-edged sword: wrapped grip, round guard, slightly tapered blade.
function buildBlade(g, m) {
  add(g, box(0.03, 0.036, 0.25), m.dark, 0, 0, 0.01) // grip core
  for (let i = 0; i < 10; i++) add(g, box(0.034, 0.04, 0.023), i % 2 ? m.dark : m.accent, 0, 0, -0.098 + i * 0.025)
  add(g, box(0.036, 0.042, 0.02), m.steel, 0, 0, -0.12) // pommel
  add(g, cyl(0.05, 0.05, 0.012, 16), m.steel, 0, 0.004, 0.15) // guard
  add(g, cyl(0.054, 0.054, 0.004, 16), m.accent, 0, 0.004, 0.15)
  add(g, box(0.03, 0.042, 0.016), m.steel, 0, 0.004, 0.164) // collar
  // Blade: spine on top, two tapering sections + an angled tip
  add(g, box(0.008, 0.042, 0.41), m.blade, 0, 0.004, 0.378)
  add(g, box(0.007, 0.036, 0.37), m.blade, 0, 0.007, 0.765)
  add(g, box(0.006, 0.03, 0.08), m.blade, 0, 0.012, 0.985, -0.3)
  add(g, box(0.009, 0.005, 0.78), m.steel, 0, 0.0255, 0.56) // spine
  add(g, box(0.0088, 0.005, 0.6), m.dark, 0, 0.013, 0.47) // groove
  if (m.glow) add(g, box(0.0095, 0.004, 0.7), m.glow, 0, -0.012, 0.55)
  return { muzzle: [0, 0.015, 1.02], ejector: [0, 0, 0], length: 1.15 }
}

// Medic pistol: fixed white / red colours (not skinned), glowing vial under the barrel.
const menderMats = {
  white: new MeshStandardMaterial({ color: '#f2f2f2', roughness: 0.4, metalness: 0.1 }),
  red: new MeshStandardMaterial({ color: '#e23a3a', roughness: 0.45, metalness: 0.1 }),
  dark: new MeshStandardMaterial({ color: '#2a2f38', roughness: 0.5, metalness: 0.4 }),
  vial: new MeshStandardMaterial({ color: '#3dffb0', emissive: '#3dffb0', emissiveIntensity: 1.8, roughness: 0.2 }),
}
function buildMender(g, m) {
  const k = menderMats
  add(g, box(0.05, 0.07, 0.26), k.white, 0, 0.08, 0.07) // body
  add(g, box(0.046, 0.06, 0.03), k.white, 0, 0.08, -0.075) // rear cap
  add(g, box(0.052, 0.006, 0.26), k.red, 0, 0.11, 0.07) // top stripe
  add(g, box(0.054, 0.074, 0.012), k.red, 0, 0.08, 0.17) // front band
  add(g, box(0.054, 0.014, 0.044), k.red, 0, 0.075, 0.03) // cross
  add(g, box(0.054, 0.044, 0.014), k.red, 0, 0.075, 0.03)
  add(g, box(0.012, 0.025, 0.1), k.white, 0, 0.125, 0.05) // sight fin
  add(g, box(0.013, 0.012, 0.02), k.red, 0, 0.13, 0.1)
  // Emitter
  add(g, cyl(0.024, 0.03, 0.08, 12), k.white, 0, 0.085, 0.24)
  add(g, cyl(0.03, 0.03, 0.015, 12), k.red, 0, 0.085, 0.285)
  add(g, cyl(0.016, 0.016, 0.02, 10), k.dark, 0, 0.085, 0.3)
  add(g, cyl(0.012, 0.012, 0.004, 10), k.vial, 0, 0.085, 0.311)
  // Grip + trigger
  add(g, box(0.04, 0.12, 0.05), k.dark, 0, -0.005, -0.01, 0.22)
  add(g, box(0.044, 0.012, 0.054), k.red, 0, -0.068, -0.024, 0.22)
  add(g, box(0.01, 0.01, 0.065), k.dark, 0, 0.0, 0.05)
  add(g, box(0.01, 0.045, 0.01), k.dark, 0, 0.022, 0.08)
  add(g, box(0.006, 0.022, 0.006), k.dark, 0, 0.03, 0.035)
  // Under-barrel canister with a glowing vial
  add(g, box(0.02, 0.012, 0.1), k.dark, 0, 0.044, 0.17)
  add(g, cyl(0.026, 0.026, 0.025, 12), k.dark, 0, 0.018, 0.115)
  add(g, cyl(0.026, 0.026, 0.025, 12), k.dark, 0, 0.018, 0.225)
  add(g, cyl(0.017, 0.017, 0.09, 10), k.vial, 0, 0.018, 0.17)
  add(g, box(0.006, 0.006, 0.09), k.dark, 0.022, 0.018, 0.17)
  add(g, box(0.006, 0.006, 0.09), k.dark, -0.022, 0.018, 0.17)
  add(g, box(0.006, 0.006, 0.09), k.dark, 0, -0.006, 0.17)
  if (m.glow) add(g, box(0.052, 0.004, 0.12), m.glow, 0, 0.05, 0.1)
  return { muzzle: [0, 0.085, 0.315], ejector: [0.03, 0.09, 0.08], length: 0.4 }
}

// --- Second wave ------------------------------------------------------------------------------
// Shared bits: a pistol grip raked back, a trigger guard + trigger, a butt plate.
function grip(g, m, z = -0.02, y = -0.045, rake = 0.26, w = 0.042, h = 0.12) {
  add(g, box(w, h, 0.052), m.furniture, 0, y, z, rake)
  for (let i = 0; i < 3; i++) add(g, box(w + 0.003, 0.008, 0.04), m.dark, 0, y + 0.03 - i * 0.03, z - 0.004 - i * 0.008, rake) // texture ribs
}
function trigger(g, m, z = 0.04, y = 0, len = 0.08) {
  add(g, box(0.008, 0.008, len), m.steel, 0, y - 0.01, z)
  add(g, box(0.008, 0.03, 0.008), m.steel, 0, y + 0.004, z + len / 2 - 0.004)
  add(g, box(0.006, 0.024, 0.006), m.steel, 0, y + 0.012, z - 0.008, 0.25)
}

// Full-auto pistol: polymer frame, slotted compensator slide, extended magazine, selector.
function buildGnat(g, m) {
  const sl = part(g, 'slide', 0, 0.078, 0.06)
  add(sl, box(0.034, 0.042, 0.2), m.body, 0, 0, 0)
  for (let i = 0; i < 6; i++) add(sl, box(0.036, 0.028, 0.004), m.dark, 0, 0.002, -0.088 + i * 0.01)
  for (let i = 0; i < 3; i++) add(sl, box(0.036, 0.02, 0.004), m.dark, 0, 0.004, 0.062 + i * 0.01)
  for (let i = 0; i < 2; i++) add(sl, box(0.024, 0.004, 0.012), m.dark, 0, 0.0215, 0.068 + i * 0.018) // compensator ports
  add(sl, box(0.002, 0.018, 0.046), m.dark, 0.0175, 0.006, 0.0) // ejection port
  add(sl, box(0.008, 0.012, 0.01), m.accent, 0, 0.026, 0.088) // front sight
  add(sl, box(0.022, 0.012, 0.012), m.dark, 0, 0.026, -0.088) // rear sight
  add(sl, box(0.002, 0.004, 0.004), m.accent, 0.006, 0.033, -0.088)
  add(sl, box(0.002, 0.004, 0.004), m.accent, -0.006, 0.033, -0.088)
  add(g, cyl(0.009, 0.009, 0.012, 8), m.steel, 0, 0.078, 0.162) // barrel crown
  add(g, box(0.032, 0.03, 0.18), m.furniture, 0, 0.042, 0.05) // frame
  add(g, box(0.028, 0.008, 0.05), m.dark, 0, 0.022, 0.11) // accessory rail
  for (let i = 0; i < 3; i++) add(g, box(0.03, 0.005, 0.006), m.dark, 0, 0.017, 0.093 + i * 0.016)
  add(g, box(0.004, 0.012, 0.012), m.accent, -0.018, 0.075, -0.03) // fire selector
  trigger(g, m, 0.04, 0.012, 0.06)
  grip(g, m, -0.012, -0.022, 0.2, 0.032, 0.11)
  add(g, box(0.034, 0.012, 0.03), m.furniture, 0, 0.028, -0.045) // beavertail
  // 33-round stick magazine poking out of the grip
  const mg = part(g, 'mag', 0, -0.08, -0.024)
  mg.rotation.x = 0.2
  add(mg, box(0.026, 0.11, 0.034), m.dark, 0, -0.05, 0)
  add(mg, box(0.03, 0.014, 0.04), m.accent, 0, -0.108, 0)
  if (m.glow) add(g, box(0.034, 0.005, 0.12), m.glow, 0, 0.058, 0.06)
  return { muzzle: [0, 0.078, 0.168], ejector: [0.02, 0.088, 0.06], length: 0.33 }
}

// Machine pistol: long flat receiver, cocking knobs, curved magazine ahead of the guard, a wire
// stock folded over the top.
function buildMantis(g, m) {
  add(g, box(0.04, 0.05, 0.27), m.body, 0, 0.07, 0.06) // receiver
  add(g, box(0.042, 0.012, 0.25), m.accent, 0, 0.1, 0.06) // top cover
  add(g, box(0.044, 0.016, 0.05), m.dark, 0, 0.074, 0.11) // ejection window
  add(g, cyl(0.011, 0.011, 0.08, 10), m.steel, 0, 0.072, 0.23) // barrel
  add(g, cyl(0.016, 0.016, 0.022, 8), m.dark, 0, 0.072, 0.27) // barrel nut
  add(g, box(0.006, 0.028, 0.008), m.dark, 0, 0.115, 0.17) // front post
  add(g, box(0.004, 0.026, 0.018), m.dark, 0.01, 0.112, 0.17)
  add(g, box(0.004, 0.026, 0.018), m.dark, -0.01, 0.112, 0.17)
  add(g, box(0.026, 0.016, 0.012), m.dark, 0, 0.113, -0.045) // rear sight
  // Cocking knobs on both sides ride with the bolt.
  const sl = part(g, 'slide', 0, 0.08, 0.03)
  add(sl, cylX(0.006, 0.07), m.steel, 0, 0, 0)
  add(sl, cylX(0.011, 0.012), m.dark, 0.036, 0, 0)
  add(sl, cylX(0.011, 0.012), m.dark, -0.036, 0, 0)
  // Folded wire stock over the top, butt pad at the front.
  add(g, box(0.005, 0.005, 0.24), m.steel, 0.019, 0.112, 0.05)
  add(g, box(0.005, 0.005, 0.24), m.steel, -0.019, 0.112, 0.05)
  add(g, box(0.048, 0.03, 0.012), m.dark, 0, 0.118, 0.175)
  add(g, cylX(0.008, 0.05), m.steel, 0, 0.1, -0.075) // hinge
  trigger(g, m, 0.055, 0.045, 0.07)
  grip(g, m, -0.03, 0.0, 0.22, 0.032, 0.1)
  // Curved 20-round magazine
  const mg = part(g, 'mag', 0, 0.045, 0.115)
  add(mg, box(0.026, 0.09, 0.04), m.furniture, 0, -0.045, 0)
  add(mg, box(0.026, 0.07, 0.04), m.furniture, 0, -0.118, 0.012, -0.25)
  for (let i = 0; i < 3; i++) add(mg, box(0.028, 0.006, 0.042), m.dark, 0, -0.02 - i * 0.03, 0)
  add(mg, box(0.03, 0.012, 0.046), m.accent, 0, -0.152, 0.022, -0.25)
  if (m.glow) add(g, box(0.042, 0.005, 0.2), m.glow, 0, 0.05, 0.06)
  return { muzzle: [0, 0.072, 0.285], ejector: [0.025, 0.1, 0.11], length: 0.42 }
}

// Six-shot revolver: swinging cylinder (part `cyl`, with brass rims at the back), a hammer that
// cocks, full-length underlug and a ventilated rib.
function buildRevolver(g, m) {
  add(g, box(0.026, 0.012, 0.085), m.body, 0, 0.115, 0.045) // top strap
  add(g, box(0.026, 0.018, 0.085), m.body, 0, 0.036, 0.045) // under the cylinder
  add(g, box(0.032, 0.072, 0.016), m.body, 0, 0.075, 0.006) // recoil shield
  add(g, box(0.026, 0.05, 0.014), m.body, 0, 0.082, 0.085) // frame front
  add(g, cyl(0.011, 0.011, 0.19, 12), m.steel, 0, 0.096, 0.17) // barrel
  add(g, box(0.022, 0.026, 0.18), m.body, 0, 0.078, 0.172) // underlug
  add(g, box(0.012, 0.008, 0.18), m.accent, 0, 0.111, 0.172) // vent rib
  for (let i = 0; i < 5; i++) add(g, box(0.013, 0.004, 0.006), m.dark, 0, 0.116, 0.1 + i * 0.035)
  add(g, box(0.004, 0.018, 0.02), m.dark, 0, 0.122, 0.252) // front sight
  add(g, box(0.003, 0.006, 0.004), fixed.red, 0, 0.128, 0.255)
  add(g, box(0.022, 0.008, 0.012), m.dark, 0, 0.124, 0.0) // rear sight
  add(g, cyl(0.0125, 0.0125, 0.006, 12), m.dark, 0, 0.096, 0.264) // crown
  add(g, cyl(0.006, 0.006, 0.004, 8), fixed.ironIn, 0, 0.096, 0.268) // bore
  add(g, box(0.004, 0.01, 0.014), m.steel, -0.018, 0.08, 0.0) // cylinder latch
  // Cylinder: six chambers round the axis, the top one in line with the barrel.
  const cy = part(g, 'cyl', 0, 0.075, 0.045)
  add(cy, cyl(0.032, 0.032, 0.058, 12), m.steel, 0, 0, 0)
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + Math.PI / 6
    add(cy, box(0.008, 0.006, 0.052), m.dark, Math.cos(a) * 0.031, Math.sin(a) * 0.031, 0, 0, 0, a) // flutes
    const c = a + Math.PI / 6
    add(cy, cyl(0.0068, 0.0068, 0.004, 8), fixed.ironIn, Math.cos(c) * 0.02, Math.sin(c) * 0.02, 0.0295) // chamber mouths
    add(cy, cyl(0.0075, 0.0075, 0.004, 8), fixed.brass, Math.cos(c) * 0.02, Math.sin(c) * 0.02, -0.0295) // rims
  }
  add(cy, cyl(0.006, 0.006, 0.07, 8), m.steel, 0, 0, 0.0) // axis pin
  // Hammer
  const hm = part(g, 'hammer', 0, 0.098, -0.006)
  add(hm, box(0.008, 0.032, 0.012), m.steel, 0, 0.012, -0.006)
  add(hm, box(0.012, 0.006, 0.018), m.steel, 0, 0.028, -0.014)
  // Guard, trigger, grip
  add(g, box(0.006, 0.006, 0.05), m.body, 0, 0.012, 0.04)
  add(g, box(0.006, 0.03, 0.006), m.body, 0, 0.026, 0.066)
  add(g, box(0.005, 0.024, 0.007), m.steel, 0, 0.03, 0.034, 0.2)
  add(g, box(0.02, 0.08, 0.008), m.body, 0, 0.035, -0.034, 0.3) // back strap
  add(g, box(0.032, 0.1, 0.044), m.furniture, 0, 0.0, -0.02, 0.32)
  for (let i = 0; i < 4; i++) add(g, box(0.034, 0.006, 0.036), m.dark, 0, 0.026 - i * 0.02, -0.014 - i * 0.007, 0.32) // checkering
  add(g, box(0.034, 0.012, 0.046), m.body, 0, -0.05, -0.036, 0.32) // grip cap
  add(g, cylX(0.006, 0.036), m.accent, 0, 0.0, -0.02) // grip screw
  if (m.glow) add(g, box(0.028, 0.004, 0.17), m.glow, 0, 0.064, 0.17)
  return { muzzle: [0, 0.096, 0.272], ejector: [0.02, 0.08, 0.045], length: 0.38 }
}

// Bullpup assault rifle: long carry handle along the top, magazine behind the grip, folded bipod.
function buildFalcon(g, m) {
  add(g, box(0.07, 0.1, 0.56), m.body, 0, 0.05, -0.02) // shell
  add(g, box(0.072, 0.14, 0.022), m.dark, 0, 0.03, -0.31) // butt plate
  add(g, box(0.06, 0.02, 0.16), m.accent, 0, 0.105, -0.2) // cheek rest
  add(g, box(0.072, 0.02, 0.05), m.dark, 0, 0.06, -0.14) // ejection port
  // Carry handle with sights
  add(g, box(0.03, 0.02, 0.42), m.accent, 0, 0.18, 0.02)
  add(g, box(0.03, 0.075, 0.03), m.accent, 0, 0.135, 0.21)
  add(g, box(0.03, 0.075, 0.03), m.accent, 0, 0.135, -0.17)
  for (let i = 0; i < 6; i++) add(g, box(0.032, 0.006, 0.012), m.dark, 0, 0.192, -0.06 + i * 0.03)
  add(g, box(0.022, 0.024, 0.02), m.dark, 0, 0.198, -0.14) // rear aperture
  add(g, box(0.005, 0.03, 0.01), m.dark, 0.012, 0.2, 0.21) // front sight ears
  add(g, box(0.005, 0.03, 0.01), m.dark, -0.012, 0.2, 0.21)
  add(part(g, 'slide'), box(0.012, 0.02, 0.05), m.steel, 0, 0.142, 0.05) // charging handle
  // Handguard, barrel, flash hider
  add(g, box(0.064, 0.08, 0.18), m.furniture, 0, 0.04, 0.33)
  for (let i = 0; i < 4; i++) add(g, box(0.066, 0.016, 0.022), m.dark, 0, 0.055, 0.27 + i * 0.04)
  add(g, cyl(0.012, 0.012, 0.14, 10), m.steel, 0, 0.06, 0.48)
  add(g, cyl(0.018, 0.016, 0.05, 8), m.dark, 0, 0.06, 0.57)
  for (let i = 0; i < 3; i++) add(g, box(0.004, 0.038, 0.03), m.steel, 0, 0.06, 0.575, 0, 0, (i * Math.PI) / 3)
  // Folded bipod legs along the handguard
  add(g, box(0.008, 0.008, 0.2), m.steel, 0.036, 0.015, 0.36)
  add(g, box(0.008, 0.008, 0.2), m.steel, -0.036, 0.015, 0.36)
  add(g, cylX(0.008, 0.08), m.steel, 0, 0.02, 0.45)
  // Grip with a full hand guard
  grip(g, m, 0.0, -0.05, 0.25, 0.04, 0.12)
  add(g, box(0.036, 0.012, 0.1), m.body, 0, -0.112, 0.035)
  add(g, box(0.036, 0.1, 0.014), m.body, 0, -0.06, 0.086, 0.2)
  add(g, box(0.006, 0.025, 0.006), m.steel, 0, -0.015, 0.04)
  // 25-round magazine behind the grip
  const mg = part(g, 'mag', 0, 0.0, -0.12)
  add(mg, box(0.042, 0.12, 0.062), m.furniture, 0, -0.06, 0, -0.12)
  for (let i = 0; i < 3; i++) add(mg, box(0.044, 0.004, 0.05), m.dark, 0, -0.03 - i * 0.03, 0.002, -0.12)
  add(mg, box(0.046, 0.014, 0.068), m.accent, 0, -0.122, -0.012, -0.12)
  if (m.glow) add(g, box(0.072, 0.005, 0.42), m.glow, 0, 0.02, -0.02)
  return { muzzle: [0, 0.06, 0.6], ejector: [0.04, 0.06, -0.14], length: 0.92 }
}

// Burst rifle: classic carry-handle upper, round ribbed handguard, front sight tower, fixed stock.
function buildSentinel(g, m) {
  add(g, box(0.058, 0.07, 0.24), m.body, 0, 0.04, 0.05) // lower
  add(g, box(0.062, 0.058, 0.3), m.body, 0, 0.098, 0.06) // upper
  add(g, box(0.064, 0.02, 0.06), m.dark, 0, 0.085, 0.09) // ejection port
  add(g, box(0.068, 0.006, 0.01), m.steel, 0, 0.073, 0.04) // brass deflector
  add(g, box(0.03, 0.024, 0.17), m.body, 0, 0.162, 0.03) // carry handle
  add(g, box(0.03, 0.05, 0.03), m.body, 0, 0.135, -0.045)
  add(g, box(0.03, 0.05, 0.03), m.body, 0, 0.135, 0.105)
  add(g, cylX(0.012, 0.03), m.dark, 0, 0.18, -0.045) // rear sight drum
  add(g, cyl(0.011, 0.011, 0.05, 8), m.steel, 0.04, 0.11, -0.03) // forward assist
  add(part(g, 'slide'), box(0.05, 0.012, 0.014), m.steel, 0, 0.135, -0.1) // T charging handle
  add(g, box(0.004, 0.012, 0.012), m.accent, 0.031, 0.06, 0.0) // burst selector
  // Round handguard with ribs
  add(g, cyl(0.04, 0.04, 0.3, 12), m.furniture, 0, 0.088, 0.36)
  for (let i = 0; i < 7; i++) add(g, cyl(0.042, 0.042, 0.008, 12), m.dark, 0, 0.088, 0.24 + i * 0.04)
  add(g, cyl(0.046, 0.046, 0.022, 12), m.dark, 0, 0.088, 0.215) // delta ring
  // Barrel, sight tower, flash hider
  add(g, cyl(0.011, 0.011, 0.24, 10), m.steel, 0, 0.088, 0.62)
  add(g, box(0.018, 0.075, 0.026), m.dark, 0, 0.13, 0.58)
  add(g, box(0.006, 0.026, 0.006), m.dark, 0, 0.18, 0.58)
  add(g, box(0.004, 0.024, 0.016), m.dark, 0.01, 0.176, 0.58)
  add(g, box(0.004, 0.024, 0.016), m.dark, -0.01, 0.176, 0.58)
  add(g, cyl(0.016, 0.016, 0.05, 8), m.dark, 0, 0.088, 0.76)
  for (let i = 0; i < 3; i++) add(g, box(0.004, 0.034, 0.03), m.steel, 0, 0.088, 0.77, 0, 0, (i * Math.PI) / 3)
  // Magazine, grip, guard
  const mg = part(g, 'mag', 0, 0.005, 0.13)
  add(mg, box(0.045, 0.17, 0.068), m.furniture, 0, -0.085, 0.012, -0.12)
  for (let i = 0; i < 4; i++) add(mg, box(0.047, 0.004, 0.05), m.dark, 0, -0.04 - i * 0.03, 0.008, -0.12)
  add(mg, box(0.05, 0.014, 0.074), m.accent, 0, -0.17, 0.022, -0.12)
  grip(g, m, -0.04, -0.045, 0.28, 0.042, 0.12)
  trigger(g, m, 0.04, 0.0, 0.08)
  // Fixed stock
  add(g, box(0.045, 0.05, 0.12), m.furniture, 0, 0.085, -0.13)
  add(g, box(0.056, 0.12, 0.2), m.furniture, 0, 0.06, -0.28, -0.04)
  add(g, box(0.06, 0.13, 0.022), m.dark, 0, 0.06, -0.385)
  add(g, box(0.012, 0.02, 0.03), m.steel, 0, -0.005, -0.3) // sling loop
  if (m.glow) add(g, box(0.064, 0.005, 0.28), m.glow, 0, 0.07, 0.06)
  return { muzzle: [0, 0.088, 0.79], ejector: [0.035, 0.09, 0.09], length: 1.18 }
}

// Light marksman rifle: slim sporting stock, op-rod on the side, low-power scope.
function buildSparrow(g, m) {
  add(g, box(0.056, 0.07, 0.3), m.body, 0, 0.068, 0.05) // receiver
  add(g, box(0.058, 0.014, 0.26), m.accent, 0, 0.106, 0.05)
  add(g, box(0.058, 0.018, 0.05), m.dark, 0, 0.09, 0.09) // ejection port
  add(part(g, 'slide'), box(0.008, 0.014, 0.3), m.steel, 0.032, 0.07, 0.27) // operating rod
  add(g, box(0.06, 0.06, 0.34), m.furniture, 0, 0.042, 0.36) // forend
  for (let i = 0; i < 5; i++) add(g, box(0.062, 0.012, 0.025), m.dark, 0, 0.05, 0.25 + i * 0.05)
  add(g, cyl(0.011, 0.011, 0.3, 10), m.steel, 0, 0.078, 0.65) // barrel
  add(g, box(0.022, 0.026, 0.03), m.dark, 0, 0.078, 0.52) // gas block
  add(g, cyl(0.016, 0.016, 0.04, 8), m.dark, 0, 0.078, 0.82) // brake
  for (let i = 0; i < 2; i++) add(g, box(0.036, 0.006, 0.008), m.steel, 0, 0.078, 0.81 + i * 0.016)
  // Stock with a raised comb
  add(g, box(0.05, 0.07, 0.12), m.furniture, 0, 0.05, -0.15, 0.06)
  add(g, box(0.055, 0.12, 0.2), m.furniture, 0, 0.032, -0.3, -0.08)
  add(g, box(0.048, 0.03, 0.14), m.accent, 0, 0.1, -0.28)
  add(g, box(0.058, 0.13, 0.022), m.dark, 0, 0.03, -0.405, -0.08)
  grip(g, m, -0.06, -0.035, 0.32, 0.04, 0.1)
  trigger(g, m, 0.03, 0.02, 0.07)
  const mg = part(g, 'mag', 0, 0.03, 0.12)
  add(mg, box(0.04, 0.1, 0.06), m.furniture, 0, -0.05, 0, -0.08)
  add(mg, box(0.044, 0.012, 0.066), m.accent, 0, -0.1, 0.004, -0.08)
  scope(g, m, 0.06, 0.24, 0.028)
  if (m.glow) add(g, box(0.062, 0.005, 0.3), m.glow, 0, 0.02, 0.36)
  return { muzzle: [0, 0.078, 0.845], ejector: [0.03, 0.09, 0.09], length: 1.24 }
}

// Silenced marksman rifle: fat integral suppressor, skeleton stock, short magazine, side scope.
function buildWhisper(g, m) {
  add(g, box(0.056, 0.07, 0.24), m.body, 0, 0.06, 0.03) // receiver
  add(g, box(0.058, 0.016, 0.22), m.accent, 0, 0.1, 0.03)
  add(part(g, 'slide'), box(0.016, 0.016, 0.022), m.steel, 0.034, 0.07, 0.08) // charging handle
  add(g, cyl(0.031, 0.031, 0.36, 14), m.dark, 0, 0.065, 0.33) // suppressor
  for (let i = 0; i < 6; i++) add(g, cyl(0.0325, 0.0325, 0.008, 14), m.steel, 0, 0.065, 0.2 + i * 0.05)
  add(g, cyl(0.033, 0.03, 0.022, 14), m.steel, 0, 0.065, 0.515)
  add(g, cyl(0.007, 0.007, 0.004, 8), fixed.ironIn, 0, 0.065, 0.527)
  add(g, box(0.066, 0.052, 0.16), m.furniture, 0, 0.034, 0.22) // forend round the can
  for (let i = 0; i < 3; i++) add(g, box(0.068, 0.012, 0.02), m.dark, 0, 0.04, 0.17 + i * 0.045)
  // Skeleton stock (a frame you can see through)
  add(g, box(0.04, 0.03, 0.26), m.furniture, 0, 0.072, -0.2)
  add(g, box(0.035, 0.025, 0.24), m.furniture, 0, -0.018, -0.21, 0.35)
  add(g, box(0.045, 0.14, 0.024), m.dark, 0, 0.03, -0.33)
  add(g, box(0.04, 0.11, 0.045), m.furniture, 0, -0.03, -0.04, 0.25) // grip
  trigger(g, m, 0.03, 0.02, 0.07)
  const mg = part(g, 'mag', 0, 0.025, 0.1)
  add(mg, box(0.04, 0.09, 0.06), m.furniture, 0, -0.045, 0)
  add(mg, box(0.044, 0.012, 0.066), m.accent, 0, -0.092, 0)
  scope(g, m, 0.02, 0.2, 0.026)
  if (m.glow) add(g, box(0.032, 0.004, 0.3), m.glow, 0, 0.098, 0.33)
  return { muzzle: [0, 0.065, 0.53], ejector: [0.03, 0.07, 0.05], length: 0.92 }
}

// Bolt-action sniper: round receiver, bolt handle that lifts and pulls back (part `bolt`), full
// wooden stock with a cheek riser, long scope.
function buildOsprey(g, m) {
  add(g, cyl(0.022, 0.022, 0.2, 12), m.body, 0, 0.08, 0.04) // receiver
  add(g, box(0.046, 0.012, 0.03), m.dark, 0.0, 0.1, 0.06) // ejection port
  const bolt = part(g, 'bolt', 0, 0.08, -0.04)
  add(bolt, cyl(0.014, 0.014, 0.1, 10), m.steel, 0, 0, -0.02)
  add(bolt, cyl(0.016, 0.012, 0.03, 10), m.steel, 0, 0, -0.08) // bolt shroud
  add(bolt, box(0.05, 0.008, 0.008), m.steel, 0.028, 0, 0.0)
  add(bolt, sphere(0.012), m.dark, 0.056, -0.004, 0.0)
  add(g, cyl(0.013, 0.011, 0.62, 12), m.steel, 0, 0.08, 0.45) // barrel
  add(g, cyl(0.016, 0.016, 0.03, 10), m.dark, 0, 0.08, 0.765)
  // Stock
  add(g, box(0.062, 0.05, 0.46), m.furniture, 0, 0.046, 0.38) // forend
  add(g, box(0.06, 0.06, 0.2), m.furniture, 0, 0.042, 0.03) // action bedding
  add(g, box(0.045, 0.08, 0.12), m.furniture, 0, 0.03, -0.12, 0.25) // wrist
  add(g, box(0.055, 0.14, 0.26), m.furniture, 0, 0.035, -0.3, -0.05) // butt
  add(g, box(0.05, 0.03, 0.14), m.accent, 0, 0.115, -0.3) // cheek riser
  add(g, box(0.058, 0.15, 0.024), fixed.rubber, 0, 0.033, -0.44, -0.05)
  add(g, box(0.03, 0.012, 0.08), m.steel, 0, 0.012, 0.05) // floor plate
  trigger(g, m, 0.03, 0.022, 0.07)
  add(g, box(0.012, 0.02, 0.02), m.steel, 0, 0.012, 0.52) // sling swivels
  add(g, box(0.012, 0.02, 0.02), m.steel, 0, -0.035, -0.32)
  scope(g, m, 0.05, 0.34, 0.034)
  if (m.glow) add(g, box(0.064, 0.005, 0.4), m.glow, 0, 0.025, 0.38)
  return { muzzle: [0, 0.08, 0.78], ejector: [0.03, 0.095, 0.06], length: 1.26 }
}

// Lever-action rifle: brass-trimmed receiver, tube magazine under the barrel, iron sights, the
// lever loop (part `lever`) and a hammer.
function buildRanger(g, m) {
  add(g, box(0.045, 0.078, 0.17), m.accent, 0, 0.07, 0.02) // receiver
  add(g, box(0.047, 0.05, 0.12), m.body, 0, 0.07, 0.02) // side plates
  add(g, box(0.002, 0.016, 0.03), m.dark, 0.0235, 0.055, 0.05) // loading gate
  add(g, box(0.03, 0.006, 0.07), m.dark, 0, 0.11, 0.02) // top ejection
  const hm = part(g, 'hammer', 0, 0.1, -0.065)
  add(hm, box(0.008, 0.03, 0.012), m.steel, 0, 0.012, -0.004)
  add(hm, box(0.012, 0.006, 0.018), m.steel, 0, 0.027, -0.012)
  add(g, cyl(0.012, 0.012, 0.5, 10), m.steel, 0, 0.094, 0.36) // barrel
  add(g, cyl(0.009, 0.009, 0.42, 8), m.steel, 0, 0.066, 0.32) // tube magazine
  add(g, box(0.03, 0.05, 0.016), m.dark, 0, 0.08, 0.5) // barrel band
  add(g, box(0.03, 0.05, 0.016), m.dark, 0, 0.08, 0.26)
  add(g, box(0.004, 0.02, 0.012), m.dark, 0, 0.11, 0.6) // front blade
  add(g, box(0.026, 0.016, 0.006), m.dark, 0, 0.108, 0.17) // buckhorn rear sight
  add(g, box(0.04, 0.042, 0.2), m.furniture, 0, 0.068, 0.21) // forend
  // Stock
  add(g, box(0.038, 0.06, 0.13), m.furniture, 0, 0.05, -0.12, 0.18)
  add(g, box(0.045, 0.12, 0.24), m.furniture, 0, 0.03, -0.3, -0.08)
  add(g, box(0.048, 0.13, 0.016), m.steel, 0, 0.03, -0.42, -0.08)
  add(g, box(0.006, 0.022, 0.006), m.steel, 0, 0.028, 0.02, 0.25) // trigger
  // Lever loop, pivoting at the front of the receiver
  const lv = part(g, 'lever', 0, 0.034, 0.08)
  add(lv, box(0.008, 0.05, 0.008), m.steel, 0, -0.025, 0)
  add(lv, box(0.008, 0.008, 0.11), m.steel, 0, -0.05, -0.055)
  add(lv, box(0.008, 0.032, 0.008), m.steel, 0, -0.036, -0.11)
  add(lv, box(0.008, 0.008, 0.05), m.steel, 0, -0.02, -0.088)
  if (m.glow) add(g, box(0.042, 0.005, 0.18), m.glow, 0, 0.05, 0.21)
  return { muzzle: [0, 0.094, 0.61], ejector: [0, 0.115, 0.02], length: 1.04 }
}

// Drum SMG: finned barrel, compensator, wooden foregrip and stock, a 50-round drum (part `drum`).
function buildBulldog(g, m) {
  add(g, box(0.05, 0.07, 0.28), m.body, 0, 0.075, 0.04) // receiver
  add(g, box(0.052, 0.014, 0.26), m.accent, 0, 0.114, 0.04)
  add(g, box(0.052, 0.02, 0.05), m.dark, 0, 0.09, 0.1) // ejection port
  add(part(g, 'slide'), cyl(0.009, 0.009, 0.02, 8), m.steel, 0, 0.13, 0.08, Math.PI / 2) // actuator knob
  add(g, cyl(0.014, 0.014, 0.32, 10), m.steel, 0, 0.085, 0.34) // barrel
  for (let i = 0; i < 10; i++) add(g, cyl(0.021, 0.021, 0.006, 10), m.dark, 0, 0.085, 0.2 + i * 0.016) // cooling fins
  add(g, box(0.032, 0.032, 0.05), m.dark, 0, 0.085, 0.52) // compensator
  for (let i = 0; i < 3; i++) add(g, box(0.02, 0.004, 0.006), m.steel, 0, 0.102, 0.506 + i * 0.012)
  add(g, box(0.004, 0.02, 0.01), m.dark, 0, 0.11, 0.5)
  add(g, box(0.022, 0.02, 0.012), m.dark, 0, 0.12, -0.08) // rear sight
  // Wooden foregrip with finger grooves
  add(g, box(0.035, 0.1, 0.042), m.furniture, 0, 0.02, 0.3)
  for (let i = 0; i < 3; i++) add(g, box(0.037, 0.008, 0.044), m.dark, 0, 0.04 - i * 0.025, 0.3)
  add(g, box(0.036, 0.11, 0.05), m.furniture, 0, 0.0, -0.04, 0.25)
  trigger(g, m, 0.0, 0.04, 0.06)
  // 50-round drum
  const dr = part(g, 'drum', 0, -0.05, 0.13)
  add(dr, cylX(0.085, 0.06, 18), m.body, 0, 0, 0)
  add(dr, cylX(0.06, 0.062, 16), m.accent, 0, 0, 0)
  add(dr, cylX(0.018, 0.066, 10), m.steel, 0, 0, 0)
  add(dr, box(0.03, 0.006, 0.006), m.steel, 0.034, 0.0, 0.0)
  add(dr, box(0.03, 0.04, 0.04), m.dark, 0, 0.075, 0)
  // Wooden stock
  add(g, box(0.04, 0.06, 0.12), m.furniture, 0, 0.068, -0.15)
  add(g, box(0.045, 0.12, 0.2), m.furniture, 0, 0.048, -0.3, -0.06)
  add(g, box(0.048, 0.13, 0.016), m.dark, 0, 0.048, -0.405, -0.06)
  if (m.glow) add(g, box(0.052, 0.005, 0.22), m.glow, 0, 0.05, 0.04)
  return { muzzle: [0, 0.085, 0.55], ejector: [0.03, 0.09, 0.1], length: 0.96 }
}

// Top-loading bullpup SMG: rounded shell, thumbhole grip, see-through magazine along the top.
function buildSwarm(g, m) {
  add(g, box(0.065, 0.09, 0.42), m.body, 0, 0.04, -0.02) // shell
  add(g, box(0.062, 0.07, 0.08), m.accent, 0, 0.045, 0.21) // nose
  add(g, box(0.05, 0.03, 0.06), m.accent, 0, 0.01, 0.22, 0.5)
  add(g, box(0.068, 0.13, 0.03), m.dark, 0, 0.02, -0.24) // butt
  add(g, box(0.04, 0.1, 0.05), m.furniture, 0, -0.03, 0.02, 0.2) // thumbhole grip
  add(g, box(0.03, 0.012, 0.12), m.body, 0, -0.09, 0.08) // guard loop
  add(g, box(0.03, 0.09, 0.02), m.body, 0, -0.045, 0.14)
  add(g, box(0.006, 0.024, 0.006), m.steel, 0, -0.01, 0.06)
  add(g, cyl(0.012, 0.012, 0.06, 10), m.steel, 0, 0.045, 0.27) // barrel stub
  add(g, cyl(0.016, 0.016, 0.03, 8), m.dark, 0, 0.045, 0.3)
  const sl = part(g, 'slide')
  add(sl, box(0.012, 0.012, 0.02), m.steel, 0.035, 0.07, 0.12) // charging handles
  add(sl, box(0.012, 0.012, 0.02), m.steel, -0.035, 0.07, 0.12)
  // Translucent magazine on top with the rounds showing through
  const mg = part(g, 'mag', 0, 0.11, -0.02)
  add(mg, box(0.056, 0.022, 0.34), fixed.smoked, 0, 0, 0)
  for (let i = 0; i < 8; i++) add(mg, box(0.02, 0.012, 0.03), fixed.brass, 0.012 * (i % 2 ? 1 : -1), -0.002, -0.14 + i * 0.04)
  add(mg, box(0.058, 0.01, 0.03), m.accent, 0, 0.0, -0.17)
  // Reflex sight on a raised mount ahead of the magazine
  add(g, box(0.04, 0.04, 0.07), m.body, 0, 0.1, 0.19)
  add(g, box(0.03, 0.04, 0.05), m.dark, 0, 0.14, 0.19)
  add(g, box(0.022, 0.026, 0.003), m.lens, 0, 0.145, 0.216)
  if (m.glow) add(g, box(0.067, 0.005, 0.3), m.glow, 0, 0.0, -0.02)
  return { muzzle: [0, 0.045, 0.315], ejector: [0.0, -0.04, -0.08], length: 0.62 }
}

// Sawn-off double barrel: short side-by-side barrels that tip open on the hinge (part `barrels`),
// cut-down pistol grip, twin hammers.
function buildSawback(g, m) {
  add(g, box(0.06, 0.065, 0.1), m.body, 0, 0.06, 0.0) // action
  add(g, box(0.064, 0.045, 0.07), m.accent, 0, 0.055, -0.005) // side plates
  add(g, cylX(0.011, 0.068), m.steel, 0, 0.04, 0.05) // hinge pin
  add(g, box(0.012, 0.008, 0.04), m.steel, 0, 0.097, -0.02, 0, 0.4) // top lever
  for (const x of [-0.012, 0.012]) add(g, box(0.008, 0.036, 0.012), m.steel, x, 0.1, -0.042, -0.4) // hammers
  const brl = part(g, 'barrels', 0, 0.04, 0.05)
  for (const x of [-0.018, 0.018]) {
    add(brl, cyl(0.017, 0.017, 0.26, 12), m.steel, x, 0.04, 0.13)
    add(brl, cyl(0.012, 0.012, 0.004, 10), fixed.ironIn, x, 0.04, 0.262)
    add(brl, cyl(0.0125, 0.0125, 0.006, 10), fixed.brass, x, 0.04, 0.0)
    add(brl, cyl(0.011, 0.011, 0.02, 10), fixed.shell, x, 0.04, -0.012)
  }
  add(brl, box(0.012, 0.006, 0.26), m.dark, 0, 0.06, 0.13) // rib
  add(brl, box(0.05, 0.03, 0.12), m.furniture, 0, 0.012, 0.08) // forend
  add(brl, box(0.052, 0.008, 0.1), m.dark, 0, 0.0, 0.08)
  // Cut-down grip
  add(g, box(0.036, 0.095, 0.044), m.furniture, 0, 0.012, -0.07, 0.62)
  for (let i = 0; i < 3; i++) add(g, box(0.038, 0.006, 0.036), m.dark, 0, 0.03 - i * 0.022, -0.064 - i * 0.014, 0.62)
  add(g, box(0.04, 0.012, 0.048), m.dark, 0, -0.026, -0.099, 0.62)
  add(g, box(0.006, 0.006, 0.05), m.steel, 0, 0.012, 0.0) // guard
  add(g, box(0.006, 0.022, 0.006), m.steel, 0, 0.026, -0.006)
  add(g, box(0.006, 0.022, 0.006), m.steel, 0, 0.026, 0.012)
  if (m.glow) for (const x of [-0.036, 0.036]) add(brl, box(0.004, 0.006, 0.2), m.glow, x, 0.04, 0.13)
  return { muzzle: [0, 0.08, 0.315], ejector: [0.02, 0.08, 0.05], length: 0.5 }
}

// Box-fed semi-auto shotgun: stamped receiver with a ribbed dust cover, gas tube, slotted brake,
// a 5-shell magazine (shells showing at the top) and a solid stock.
function buildRattler(g, m) {
  add(g, box(0.06, 0.08, 0.3), m.body, 0, 0.06, 0.05) // receiver
  add(g, box(0.058, 0.022, 0.28), m.accent, 0, 0.108, 0.05) // dust cover
  for (let i = 0; i < 6; i++) add(g, box(0.06, 0.004, 0.006), m.dark, 0, 0.12, -0.05 + i * 0.03)
  add(g, box(0.062, 0.02, 0.07), m.dark, 0, 0.085, 0.12) // ejection port
  add(part(g, 'slide'), box(0.03, 0.014, 0.016), m.steel, 0.042, 0.082, 0.14) // charging handle
  add(g, box(0.006, 0.03, 0.05), m.steel, 0.032, 0.05, 0.03) // selector lever
  add(g, cyl(0.016, 0.016, 0.2, 10), m.dark, 0, 0.115, 0.3) // gas tube
  add(g, box(0.06, 0.05, 0.2), m.furniture, 0, 0.055, 0.3) // lower handguard
  add(g, box(0.045, 0.026, 0.18), m.furniture, 0, 0.118, 0.3)
  add(g, cyl(0.02, 0.02, 0.4, 12), m.steel, 0, 0.078, 0.48) // barrel
  add(g, box(0.05, 0.045, 0.06), m.dark, 0, 0.078, 0.69) // brake
  for (let i = 0; i < 3; i++) add(g, box(0.055, 0.008, 0.01), m.steel, 0, 0.078, 0.672 + i * 0.018)
  add(g, box(0.02, 0.04, 0.026), m.dark, 0, 0.11, 0.62) // front sight block
  rail(g, m.dark, 0, 0.127, 0.05, 0.18)
  const mg = part(g, 'mag', 0, 0.02, 0.11)
  add(mg, box(0.06, 0.13, 0.1), m.furniture, 0, -0.065, 0, -0.15)
  for (let i = 0; i < 3; i++) add(mg, box(0.062, 0.006, 0.08), m.dark, 0, -0.04 - i * 0.03, 0.004, -0.15)
  add(mg, box(0.064, 0.016, 0.106), m.accent, 0, -0.13, 0.01, -0.15)
  add(mg, cyl(0.016, 0.016, 0.06, 10), fixed.shell, 0, 0.008, 0.0)
  add(mg, cyl(0.016, 0.016, 0.008, 10), fixed.brass, 0, 0.008, -0.034)
  grip(g, m, -0.04, -0.04, 0.3, 0.042, 0.11)
  trigger(g, m, 0.04, 0.012, 0.07)
  add(g, box(0.05, 0.1, 0.22), m.furniture, 0, 0.05, -0.22, -0.05) // stock
  add(g, box(0.055, 0.12, 0.022), fixed.rubber, 0, 0.05, -0.335, -0.05)
  if (m.glow) add(g, box(0.062, 0.005, 0.26), m.glow, 0, 0.03, 0.05)
  return { muzzle: [0, 0.078, 0.72], ejector: [0.04, 0.085, 0.12], length: 1.12 }
}

// Machete: rubber grip, small guard, long blade that widens toward a clipped tip.
function buildMachete(g, m) {
  add(g, box(0.03, 0.04, 0.13), fixed.rubber, 0, 0, 0)
  for (let i = 0; i < 4; i++) add(g, box(0.032, 0.042, 0.008), m.furniture, 0, 0, -0.045 + i * 0.03)
  add(g, cylX(0.006, 0.034), m.steel, 0, 0, -0.055) // lanyard hole
  add(g, box(0.036, 0.056, 0.012), m.steel, 0, 0.004, 0.072) // guard
  add(g, box(0.006, 0.05, 0.2), m.blade, 0, 0.008, 0.18)
  add(g, box(0.006, 0.062, 0.2), m.blade, 0, 0.012, 0.37, -0.03)
  add(g, box(0.006, 0.05, 0.09), m.blade, 0, 0.018, 0.5, 0.42)
  add(g, box(0.0075, 0.006, 0.42), m.steel, 0, 0.037, 0.3) // spine
  add(g, box(0.0065, 0.008, 0.36), m.dark, 0, -0.01, 0.3) // edge bevel line
  if (m.glow) add(g, box(0.008, 0.004, 0.36), m.glow, 0, 0.024, 0.3)
  return { muzzle: [0, 0.01, 0.55], ejector: [0, 0, 0], length: 0.62 }
}

// Crowbar: red-painted hex bar, curved claw at the top, flat chisel end at the back.
function buildCrowbar(g, m) {
  add(g, cyl(0.014, 0.014, 0.12, 6), fixed.rubber, 0, 0, 0) // grip tape
  add(g, cyl(0.013, 0.013, 0.44, 6), fixed.red, 0, 0, 0.26)
  // The hook: segments round an arc (radius 5 cm) that curls up and back over the bar.
  const D = Math.PI / 180
  for (const deg of [-60, -20, 20, 60, 100, 140]) {
    const a = deg * D
    add(g, cyl(0.013, 0.013, 0.046, 6), fixed.red, 0, 0.05 + 0.05 * Math.sin(a), 0.48 + 0.05 * Math.cos(a), -(a + Math.PI / 2))
  }
  const tip = 165 * D
  for (const x of [-0.008, 0.008]) add(g, box(0.012, 0.008, 0.04), m.steel, x, 0.05 + 0.05 * Math.sin(tip), 0.48 + 0.05 * Math.cos(tip) - 0.012, -(tip + Math.PI / 2)) // claw prongs
  add(g, box(0.026, 0.008, 0.06), m.steel, 0, -0.006, -0.085, 0.15) // chisel end
  if (m.glow) add(g, box(0.004, 0.004, 0.4), m.glow, 0.014, 0, 0.26)
  return { muzzle: [0, 0.08, 0.58], ejector: [0, 0, 0], length: 0.66 }
}

// Frying pan: cast-iron pan (face looking up) on a riveted handle.
function buildPan(g, m) {
  add(g, box(0.022, 0.016, 0.18), fixed.rubber, 0, 0, 0.04) // handle
  add(g, box(0.024, 0.018, 0.04), m.furniture, 0, 0, 0.0)
  add(g, cylY(0.008, 0.008, 0.02, 8), m.steel, 0, 0, -0.03) // hang hole ring
  add(g, box(0.03, 0.012, 0.05), fixed.iron, 0, 0.004, 0.14) // neck
  for (const x of [-0.008, 0.008]) add(g, cylY(0.005, 0.005, 0.026, 6), m.steel, x, 0.004, 0.155) // rivets
  add(g, cylY(0.13, 0.11, 0.04, 22), fixed.iron, 0, 0.012, 0.29) // pan
  add(g, cylY(0.115, 0.1, 0.012, 22), fixed.ironIn, 0, 0.028, 0.29) // cooking surface
  add(g, cylY(0.1, 0.1, 0.004, 20), m.accent, 0, -0.01, 0.29) // base disc
  if (m.glow) add(g, cylY(0.132, 0.132, 0.004, 22), m.glow, 0, 0.03, 0.29)
  return { muzzle: [0, 0.01, 0.42], ejector: [0, 0, 0], length: 0.44 }
}

// Crossbow: stock with a rail, recurved limbs, a string in two halves (parts stringL / stringR,
// pivoting at the limb tips and stretched to the nock each frame), the loaded bolt (part `round`).
function buildCrossbow(g, m) {
  add(g, box(0.05, 0.05, 0.5), m.furniture, 0, 0.05, 0.12) // stock body
  add(g, box(0.02, 0.008, 0.46), m.steel, 0, 0.079, 0.15) // flight rail
  add(g, box(0.05, 0.11, 0.2), m.furniture, 0, 0.03, -0.22, -0.05) // butt
  add(g, box(0.054, 0.12, 0.02), fixed.rubber, 0, 0.03, -0.325, -0.05)
  add(g, box(0.044, 0.03, 0.14), m.accent, 0, 0.098, -0.2) // cheek piece
  add(g, box(0.04, 0.11, 0.05), m.furniture, 0, -0.03, -0.05, 0.3) // grip
  trigger(g, m, 0.0, 0.02, 0.07)
  add(g, box(0.026, 0.02, 0.03), m.dark, 0, 0.085, 0.04) // latch
  add(g, cylX(0.016, 0.03), m.dark, 0.04, 0.05, -0.04) // cocking crank
  add(g, box(0.006, 0.04, 0.012), m.steel, 0.055, 0.03, -0.04)
  // Riser and limbs
  add(g, box(0.08, 0.05, 0.05), m.dark, 0, 0.07, 0.37)
  for (const s of [-1, 1]) {
    add(g, box(0.13, 0.02, 0.032), m.body, s * 0.08, 0.075, 0.355, 0, s * 0.25, 0)
    add(g, box(0.1, 0.018, 0.03), m.body, s * 0.18, 0.075, 0.315, 0, s * 0.55, 0)
    add(g, cylY(0.014, 0.014, 0.03, 8), m.dark, s * 0.225, 0.075, 0.29) // cams
  }
  add(g, box(0.09, 0.008, 0.008), m.steel, 0, 0.03, 0.42) // foot stirrup
  add(g, box(0.008, 0.05, 0.008), m.steel, 0.045, 0.05, 0.42)
  add(g, box(0.008, 0.05, 0.008), m.steel, -0.045, 0.05, 0.42)
  // String halves (scaled + turned at run time)
  // Built drawn back to the latch (z 0.05): actor.js re-aims and stretches them every frame.
  for (const [name, x] of [['stringL', -0.225], ['stringR', 0.225]]) {
    const s = part(g, name, x, 0.084, 0.29)
    add(s, unitBarX(), fixed.cord, 0, 0, 0)
    s.rotation.y = Math.atan2(0.24, -x)
    s.scale.x = Math.hypot(x, 0.24)
  }
  // Loaded bolt on the rail
  const rd = part(g, 'round', 0, 0.092, 0.06)
  add(rd, cyl(0.004, 0.004, 0.32, 6), fixed.iron, 0, 0, 0.16)
  add(rd, cyl(0.0, 0.007, 0.03, 6), m.steel, 0, 0, 0.335)
  for (let i = 0; i < 3; i++) add(rd, box(0.002, 0.016, 0.05), fixed.fletch, 0, 0, 0.03, 0, 0, (i * Math.PI * 2) / 3)
  redDot(g, m, -0.05)
  if (m.glow) add(g, box(0.052, 0.005, 0.4), m.glow, 0, 0.03, 0.12)
  return { muzzle: [0, 0.092, 0.4], ejector: [0, 0, 0], length: 0.78 }
}

// Grenade launcher: fat barrel that breaks open on the hinge (part `breech`), leaf sight, wooden
// stock with a thick recoil pad; the 40 mm round shows while loading (part `round`).
function buildThumper(g, m) {
  add(g, box(0.06, 0.07, 0.12), m.body, 0, 0.06, 0.0) // receiver
  add(g, box(0.012, 0.008, 0.04), m.steel, 0, 0.098, -0.03, 0, 0.4) // top lever
  const br = part(g, 'breech', 0, 0.035, 0.06)
  add(br, cyl(0.036, 0.036, 0.32, 14), m.body, 0, 0.06, 0.17)
  add(br, cyl(0.039, 0.039, 0.02, 14), m.dark, 0, 0.06, 0.32)
  add(br, cyl(0.029, 0.029, 0.004, 12), fixed.ironIn, 0, 0.06, 0.332)
  for (let i = 0; i < 4; i++) add(br, cyl(0.0375, 0.0375, 0.006, 14), m.accent, 0, 0.06, 0.06 + i * 0.06)
  add(br, box(0.05, 0.035, 0.16), m.furniture, 0, 0.018, 0.12) // forend
  add(br, box(0.036, 0.05, 0.008), m.steel, 0, 0.115, 0.06) // leaf sight
  add(br, box(0.004, 0.02, 0.012), m.dark, 0, 0.105, 0.31) // front blade
  const rd = part(g, 'round', 0, 0.095, 0.08)
  rd.visible = false // only shown while it is being loaded (store pictures leave it out)
  add(rd, cyl(0.03, 0.03, 0.045, 12), fixed.brass, 0, 0, 0)
  add(rd, cyl(0.028, 0.018, 0.04, 12), fixed.olive, 0, 0, 0.042)
  // Stock
  add(g, box(0.045, 0.07, 0.12), m.furniture, 0, 0.04, -0.1, 0.2)
  add(g, box(0.055, 0.14, 0.22), m.furniture, 0, 0.02, -0.27, -0.04)
  add(g, box(0.06, 0.15, 0.034), fixed.rubber, 0, 0.02, -0.395, -0.04)
  trigger(g, m, 0.01, 0.022, 0.07)
  if (m.glow) add(br, box(0.004, 0.006, 0.26), m.glow, 0.038, 0.06, 0.17)
  return { muzzle: [0, 0.095, 0.4], ejector: [0, 0, 0], length: 0.82 }
}

// Rocket launcher: launch tube with a flared venturi, wooden heat shield, two grips, a side optic
// and the warhead sticking out of the front (part `round`, gone until reloaded).
function buildRhino(g, m) {
  add(g, cyl(0.035, 0.035, 0.9, 14), m.body, 0, 0.1, 0.15) // tube
  add(g, cyl(0.035, 0.065, 0.14, 14), m.dark, 0, 0.1, -0.37) // venturi (wide end at the back)
  add(g, cyl(0.068, 0.068, 0.012, 14), m.steel, 0, 0.1, -0.44)
  add(g, cyl(0.046, 0.046, 0.26, 14), m.furniture, 0, 0.1, 0.02) // heat shield
  for (let i = 0; i < 3; i++) add(g, cyl(0.048, 0.048, 0.01, 14), m.dark, 0, 0.1, -0.09 + i * 0.11)
  add(g, cyl(0.04, 0.04, 0.03, 14), m.dark, 0, 0.1, 0.6) // muzzle ring
  add(g, box(0.04, 0.11, 0.05), m.furniture, 0, 0.0, 0.0, 0.2) // rear grip
  add(g, box(0.036, 0.1, 0.045), m.furniture, 0, 0.0, 0.16, 0.1) // front grip
  trigger(g, m, 0.04, 0.05, 0.06)
  add(g, box(0.03, 0.06, 0.12), m.dark, -0.058, 0.14, 0.08) // optic
  add(g, box(0.024, 0.04, 0.003), m.lens, -0.058, 0.15, 0.141)
  add(g, box(0.024, 0.04, 0.003), m.lens, -0.058, 0.15, 0.019)
  add(g, box(0.02, 0.02, 0.03), m.steel, -0.038, 0.12, 0.08)
  add(g, box(0.006, 0.03, 0.006), m.dark, 0, 0.15, 0.5) // flip sights
  add(g, box(0.02, 0.026, 0.006), m.dark, 0, 0.15, 0.18)
  const rd = part(g, 'round', 0, 0.1, 0.6)
  add(rd, cyl(0.022, 0.022, 0.06, 10), fixed.oliveDark, 0, 0, 0.02)
  add(rd, cyl(0.055, 0.05, 0.12, 14), fixed.olive, 0, 0, 0.11)
  add(rd, cyl(0.012, 0.055, 0.12, 14), fixed.oliveDark, 0, 0, 0.23)
  add(rd, cyl(0.008, 0.008, 0.03, 8), m.steel, 0, 0, 0.305)
  if (m.glow) add(g, box(0.004, 0.006, 0.7), m.glow, 0.036, 0.1, 0.15)
  return { muzzle: [0, 0.1, 0.62], ejector: [0, 0, 0], length: 1.28 }
}

const BUILDERS = {
  gnat: buildGnat,
  mantis: buildMantis,
  revolver: buildRevolver,
  falcon: buildFalcon,
  sentinel: buildSentinel,
  sparrow: buildSparrow,
  whisper: buildWhisper,
  osprey: buildOsprey,
  ranger: buildRanger,
  bulldog: buildBulldog,
  swarm: buildSwarm,
  sawback: buildSawback,
  rattler: buildRattler,
  machete: buildMachete,
  crowbar: buildCrowbar,
  pan: buildPan,
  crossbow: buildCrossbow,
  thumper: buildThumper,
  rhino: buildRhino,
  ar: buildAR,
  smg: buildSMG,
  pistol: buildPistol,
  shotgun: buildShotgun,
  lmg: buildLMG,
  dmr: buildDMR,
  sniper: buildSniper,
  knife: buildKnife,
  heavy: buildHeavy,
  wasp: buildWasp,
  ridge: buildRidge,
  bullpup: buildBullpup,
  double: buildDouble,
  autoshot: buildAutoshot,
  blade: buildBlade,
  mender: buildMender,
}

// A weapon model (or an empty group for fists).
export function buildWeapon(modelId, skinId = 'standard') {
  const g = new Group()
  g.name = `weapon:${modelId}`
  const build = BUILDERS[modelId]
  if (!build) {
    g.userData.muzzle = marker(g, 'muzzle', 0, 0, 0.2)
    g.userData.ejector = marker(g, 'ejector', 0, 0, 0)
    g.userData.length = 0
    return g
  }
  const info = build(g, skinMaterials(skinId))
  g.userData.muzzle = marker(g, 'muzzle', ...info.muzzle)
  g.userData.ejector = marker(g, 'ejector', ...info.ejector)
  g.userData.length = info.length
  return g
}

// --- Throwables / items (also used for HUD icons) ---------------------------------------
const itemMats = {
  frag: new MeshStandardMaterial({ color: '#3f5a2e', roughness: 0.6, metalness: 0.2 }),
  fragTop: new MeshStandardMaterial({ color: '#b9a35a', roughness: 0.35, metalness: 0.8 }),
  ice: new MeshStandardMaterial({ color: '#8fe3ff', roughness: 0.1, metalness: 0.1, emissive: '#2aa8ff', emissiveIntensity: 0.6, transparent: true, opacity: 0.92 }),
  iceCore: new MeshStandardMaterial({ color: '#e8fbff', emissive: '#7fe0ff', emissiveIntensity: 1.6 }),
  medkit: new MeshStandardMaterial({ color: '#f2f2f2', roughness: 0.5 }),
  red: new MeshStandardMaterial({ color: '#e63b3b', roughness: 0.5 }),
  pulseBody: new MeshStandardMaterial({ color: '#22262e', roughness: 0.45, metalness: 0.6 }),
  pulseGlow: new MeshStandardMaterial({ color: '#36d6ff', emissive: '#36d6ff', emissiveIntensity: 2, roughness: 0.3 }),
  breachBody: new MeshStandardMaterial({ color: '#4d5a2c', roughness: 0.7, metalness: 0.15 }),
  breachBand: new MeshStandardMaterial({ color: '#e07a1f', roughness: 0.55, metalness: 0.1 }),
  breachDark: new MeshStandardMaterial({ color: '#2a2c30', roughness: 0.5, metalness: 0.6 }),
  breachLight: new MeshStandardMaterial({ color: '#ff2a2a', emissive: '#ff2a2a', emissiveIntensity: 2.2, roughness: 0.3 }),
  cloth: new MeshStandardMaterial({ color: '#3d4a2c', roughness: 0.95, metalness: 0 }),
  tape: new MeshStandardMaterial({ color: '#e0b524', roughness: 0.7, metalness: 0 }),
  goo: new MeshStandardMaterial({ color: '#f2d64a', roughness: 0.15, metalness: 0.1 }),
  glass: new MeshStandardMaterial({ color: '#6a8a52', roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.6 }),
  fuel: new MeshStandardMaterial({ color: '#d98a1c', roughness: 0.2, metalness: 0, emissive: '#5a2a00', emissiveIntensity: 0.4 }),
  rag: new MeshStandardMaterial({ color: '#d8cdb0', roughness: 1, metalness: 0 }),
  flame: new MeshStandardMaterial({ color: '#ffb02a', emissive: '#ff7a10', emissiveIntensity: 3, roughness: 0.6 }),
  label: new MeshStandardMaterial({ color: '#efe6c8', roughness: 0.8 }),
  smokeBody: new MeshStandardMaterial({ color: '#5a6650', roughness: 0.6, metalness: 0.3 }),
  smokeBand: new MeshStandardMaterial({ color: '#e9ecef', roughness: 0.6 }),
  flashBody: new MeshStandardMaterial({ color: '#1e2024', roughness: 0.5, metalness: 0.5 }),
  flashBand: new MeshStandardMaterial({ color: '#f2c12e', roughness: 0.5 }),
  flashHole: new MeshStandardMaterial({ color: '#08090a', roughness: 0.9 }),
  bolt: new MeshStandardMaterial({ color: '#2b2b2e', roughness: 0.5, metalness: 0.6 }),
  tip: new MeshStandardMaterial({ color: '#c9cdd2', roughness: 0.2, metalness: 0.95 }),
  fletch: new MeshStandardMaterial({ color: '#ff8a1f', roughness: 0.6 }),
  olive: new MeshStandardMaterial({ color: '#4f5a32', roughness: 0.6, metalness: 0.25 }),
  oliveDark: new MeshStandardMaterial({ color: '#363d22', roughness: 0.6, metalness: 0.25 }),
  gold: new MeshStandardMaterial({ color: '#c99a3c', roughness: 0.3, metalness: 0.9 }),
  exhaust: new MeshStandardMaterial({ color: '#ffd27a', emissive: '#ff8a20', emissiveIntensity: 3.2, roughness: 0.5 }),
}

// A flying projectile (projectiles.js): along +Z, nose forward. bolt (crossbow), shell40 (the
// launcher's 40 mm grenade), rocket (with a glowing motor at the back).
const projectileProtos = new Map()
export function buildProjectile(kind = 'bolt') {
  let proto = projectileProtos.get(kind)
  if (!proto) projectileProtos.set(kind, (proto = makeProjectile(kind)))
  return proto.clone()
}
function makeProjectile(kind) {
  const g = new Group()
  if (kind === 'bolt') {
    add(g, cyl(0.005, 0.005, 0.42, 6), itemMats.bolt, 0, 0, 0)
    add(g, cyl(0.0, 0.009, 0.04, 6), itemMats.tip, 0, 0, 0.23)
    for (let i = 0; i < 3; i++) add(g, box(0.002, 0.02, 0.07), itemMats.fletch, 0, 0, -0.17, 0, 0, (i * Math.PI * 2) / 3)
  } else if (kind === 'shell40') {
    add(g, cyl(0.026, 0.026, 0.05, 10), itemMats.olive, 0, 0, 0)
    add(g, cyl(0.024, 0.026, 0.006, 10), itemMats.gold, 0, 0, 0.026)
    add(g, cyl(0.012, 0.024, 0.04, 10), itemMats.oliveDark, 0, 0, 0.048)
  } else {
    add(g, cyl(0.02, 0.02, 0.22, 10), itemMats.oliveDark, 0, 0, -0.12)
    add(g, cyl(0.05, 0.045, 0.12, 12), itemMats.olive, 0, 0, 0.04)
    add(g, cyl(0.01, 0.05, 0.12, 12), itemMats.oliveDark, 0, 0, 0.16)
    for (let i = 0; i < 4; i++) add(g, box(0.002, 0.06, 0.06), itemMats.oliveDark, 0, 0, -0.2, 0, 0, (i * Math.PI) / 2)
    add(g, cyl(0.016, 0.016, 0.01, 8), itemMats.exhaust, 0, 0, -0.235)
  }
  return g
}
// Thrown every few seconds: one prototype per kind, cloned (geometries and materials shared).
const grenadeProtos = new Map()
export function buildGrenade(kind = 'frag') {
  let proto = grenadeProtos.get(kind)
  if (!proto) grenadeProtos.set(kind, (proto = makeGrenade(kind)))
  return proto.clone()
}
function makeGrenade(kind) {
  const g = new Group()
  if (kind === 'frag') {
    const body = new Mesh(new SphereGeometry(0.075, 12, 10), itemMats.frag)
    body.scale.set(1, 1.15, 1)
    body.castShadow = true
    g.add(body)
    for (let i = 0; i < 3; i++) {
      const ring = new Mesh(new TorusGeometry(0.074, 0.006, 4, 16), itemMats.frag)
      ring.rotation.x = Math.PI / 2
      ring.position.y = -0.04 + i * 0.04
      g.add(ring)
    }
    add(g, cyl(0.025, 0.03, 0.04, 8), itemMats.fragTop, 0, 0.095, 0, Math.PI / 2)
    add(g, box(0.015, 0.015, 0.09), itemMats.fragTop, 0.03, 0.08, 0.0, 0, 0, 0.4)
    const pin = new Mesh(new TorusGeometry(0.018, 0.004, 4, 10), itemMats.fragTop)
    pin.position.set(-0.035, 0.1, 0)
    g.add(pin)
  } else if (kind === 'pulse') {
    // Cylindrical energy grenade: dark body, glowing cyan bands
    g.add(new Mesh(new CylinderGeometry(0.05, 0.05, 0.15, 12), itemMats.pulseBody))
    for (const y of [-0.04, 0.0, 0.04]) {
      const band = new Mesh(new CylinderGeometry(0.053, 0.053, y === 0 ? 0.008 : 0.014, 12), itemMats.pulseGlow)
      band.position.y = y
      g.add(band)
    }
    const cap = new Mesh(new CylinderGeometry(0.035, 0.045, 0.025, 12), itemMats.fragTop)
    cap.position.y = 0.087
    g.add(cap)
    const dot = new Mesh(new CylinderGeometry(0.014, 0.014, 0.01, 8), itemMats.pulseGlow)
    dot.position.y = 0.103
    g.add(dot)
    const base = new Mesh(new CylinderGeometry(0.045, 0.04, 0.02, 12), itemMats.pulseBody)
    base.position.y = -0.085
    g.add(base)
  } else if (kind === 'breach') {
    // Heavy demolition charge: olive casing, orange straps, red light on top
    add(g, box(0.16, 0.08, 0.11), itemMats.breachBody, 0, 0, 0)
    add(g, box(0.02, 0.085, 0.115), itemMats.breachBand, 0.05, 0, 0)
    add(g, box(0.02, 0.085, 0.115), itemMats.breachBand, -0.05, 0, 0)
    add(g, box(0.05, 0.025, 0.04), itemMats.breachDark, 0, 0.052, 0)
    const light = new Mesh(new CylinderGeometry(0.012, 0.012, 0.014, 8), itemMats.breachLight)
    light.position.set(0, 0.071, 0)
    g.add(light)
    add(g, box(0.004, 0.06, 0.004), itemMats.breachDark, 0.02, 0.09, 0)
    add(g, box(0.03, 0.012, 0.03), itemMats.breachDark, -0.055, 0.045, 0.03)
  } else if (kind === 'leech') {
    // Sticky charge: cloth-wrapped canister, yellow adhesive face, a blinking red diode
    add(g, cylY(0.055, 0.055, 0.12, 12), itemMats.cloth, 0, 0, 0)
    add(g, cylY(0.057, 0.057, 0.02, 12), itemMats.tape, 0, 0.03, 0)
    add(g, cylY(0.057, 0.057, 0.014, 12), itemMats.tape, 0, -0.035, 0)
    add(g, cylY(0.06, 0.05, 0.02, 12), itemMats.goo, 0, -0.07, 0)
    add(g, cylY(0.03, 0.035, 0.022, 10), itemMats.breachDark, 0, 0.07, 0)
    add(g, cylY(0.01, 0.01, 0.01, 8), itemMats.breachLight, 0, 0.085, 0)
    add(g, box(0.004, 0.05, 0.004), itemMats.breachDark, 0.018, 0.1, 0)
  } else if (kind === 'molotov') {
    // Glass bottle of fuel with a burning rag in the neck
    add(g, cylY(0.045, 0.05, 0.12, 12), itemMats.glass, 0, 0, 0)
    add(g, cylY(0.04, 0.045, 0.07, 12), itemMats.fuel, 0, -0.022, 0)
    add(g, cylY(0.02, 0.045, 0.035, 12), itemMats.glass, 0, 0.077, 0)
    add(g, cylY(0.016, 0.018, 0.05, 10), itemMats.glass, 0, 0.115, 0)
    add(g, cylY(0.02, 0.014, 0.06, 6), itemMats.rag, 0, 0.15, 0, 0.2)
    add(g, cylY(0.0, 0.022, 0.06, 6), itemMats.flame, 0.006, 0.2, 0)
    add(g, box(0.07, 0.035, 0.002), itemMats.label, 0, 0.0, 0.049)
  } else if (kind === 'smoke') {
    // Smoke canister: grey-green body, white band, vent holes on top, spoon + ring
    add(g, cylY(0.042, 0.042, 0.14, 12), itemMats.smokeBody, 0, 0, 0)
    add(g, cylY(0.0435, 0.0435, 0.03, 12), itemMats.smokeBand, 0, 0.02, 0)
    add(g, cylY(0.04, 0.042, 0.016, 12), itemMats.fragTop, 0, 0.078, 0)
    for (let i = 0; i < 4; i++) add(g, cylY(0.007, 0.007, 0.004, 6), itemMats.breachDark, Math.cos(i * 1.57) * 0.024, 0.087, Math.sin(i * 1.57) * 0.024)
    add(g, box(0.014, 0.012, 0.11), itemMats.fragTop, 0.04, 0.06, 0.0, 0, 0, 0.3)
    add(g, new TorusGeometry(0.016, 0.003, 4, 10), itemMats.fragTop, -0.03, 0.09, 0)
  } else if (kind === 'flash') {
    // Stun grenade: black perforated body, yellow bands
    add(g, cylY(0.04, 0.04, 0.13, 12), itemMats.flashBody, 0, 0, 0)
    for (const y of [-0.05, 0.05]) add(g, cylY(0.0415, 0.0415, 0.012, 12), itemMats.flashBand, 0, y, 0)
    for (let r = 0; r < 3; r++) for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + r * 0.5
      add(g, box(0.012, 0.016, 0.004), itemMats.flashHole, Math.cos(a) * 0.04, -0.025 + r * 0.025, Math.sin(a) * 0.04, 0, -a + Math.PI / 2, 0)
    }
    add(g, cylY(0.03, 0.038, 0.02, 12), itemMats.fragTop, 0, 0.075, 0)
    add(g, box(0.014, 0.012, 0.1), itemMats.fragTop, 0.036, 0.06, 0.0, 0, 0, 0.3)
    add(g, new TorusGeometry(0.016, 0.003, 4, 10), itemMats.fragTop, -0.028, 0.088, 0)
  } else {
    // 'ice' / 'frost' (and any other kind): the frost grenade
    const body = new Mesh(new CylinderGeometry(0.055, 0.055, 0.16, 10), itemMats.ice)
    g.add(body)
    const core = new Mesh(new CylinderGeometry(0.03, 0.03, 0.17, 8), itemMats.iceCore)
    g.add(core)
    const cap = new Mesh(new CylinderGeometry(0.058, 0.058, 0.03, 10), itemMats.frag)
    cap.position.y = 0.09
    g.add(cap)
  }
  return g
}

export function buildMedkit() {
  const g = new Group()
  add(g, box(0.34, 0.22, 0.12), itemMats.medkit, 0, 0, 0)
  add(g, box(0.18, 0.05, 0.125), itemMats.red, 0, 0, 0)
  add(g, box(0.05, 0.16, 0.125), itemMats.red, 0, 0, 0)
  add(g, box(0.12, 0.03, 0.03), itemMats.red, 0, 0.13, 0)
  return g
}
