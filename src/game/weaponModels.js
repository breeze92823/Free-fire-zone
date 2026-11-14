// Procedural weapon models. Local frame: the grip (right hand) at the origin,
// barrel along +Z, up +Y, metres. `muzzle` (an Object3D at the barrel tip) and
// `ejector` (where shells fly out) are stashed on the returned group's userData.
// Each skin (SKINS in config) re-colours the body / accent / furniture parts.
// Models (BUILDERS ids): ar, smg, pistol, shotgun, lmg, dmr, sniper, knife,
// heavy (big-bore pistol), wasp (compact SMG), ridge (battle rifle), bullpup,
// double (break-action shotgun), autoshot (drum-fed shotgun), blade (long sword),
// mender (medic pistol, fixed white/red colours whatever the skin).
// Throwables: buildGrenade('frag' | 'ice' (frost) | 'pulse' | 'breach'), buildMedkit().
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
  add(g, box(0.02, 0.018, 0.04), m.steel, 0.042, 0.075, 0.14) // charging handle
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
  add(g, box(0.05, 0.13, 0.075), m.furniture, 0, -0.045, 0.135, 0.1)
  add(g, box(0.05, 0.11, 0.072), m.furniture, 0, -0.16, 0.16, 0.32)
  add(g, box(0.054, 0.015, 0.08), m.accent, 0, -0.22, 0.18, 0.32)
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
  add(g, box(0.045, 0.2, 0.06), m.furniture, 0, -0.08, 0.16)
  add(g, box(0.05, 0.015, 0.066), m.accent, 0, -0.18, 0.16)
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
  add(g, box(0.035, 0.045, 0.2), m.body, 0, 0.075, 0.06) // slide
  for (let i = 0; i < 5; i++) add(g, box(0.037, 0.03, 0.005), m.dark, 0, 0.078, -0.02 + i * 0.012) // serrations
  add(g, box(0.032, 0.03, 0.17), m.furniture, 0, 0.04, 0.05) // frame
  add(g, box(0.032, 0.11, 0.045), m.furniture, 0, -0.025, -0.01, -0.2)
  add(g, box(0.008, 0.008, 0.05), m.steel, 0, 0.015, 0.035)
  add(g, cyl(0.009, 0.009, 0.02, 8), m.steel, 0, 0.075, 0.17)
  add(g, box(0.008, 0.012, 0.01), m.dark, 0, 0.103, 0.14)
  add(g, box(0.02, 0.012, 0.01), m.dark, 0, 0.103, -0.02)
  if (m.glow) add(g, box(0.037, 0.005, 0.12), m.glow, 0, 0.06, 0.08)
  return { muzzle: [0, 0.075, 0.18], ejector: [0.02, 0.09, 0.04], length: 0.3 }
}

function buildShotgun(g, m) {
  add(g, box(0.07, 0.09, 0.32), m.body, 0, 0.06, 0.04)
  add(g, cyl(0.022, 0.022, 0.6, 12), m.steel, 0, 0.09, 0.48) // barrel
  add(g, cyl(0.02, 0.02, 0.48, 12), m.steel, 0, 0.045, 0.42) // tube magazine
  add(g, box(0.07, 0.07, 0.2), m.furniture, 0, 0.045, 0.36) // pump
  for (let i = 0; i < 6; i++) add(g, box(0.073, 0.072, 0.008), m.dark, 0, 0.045, 0.28 + i * 0.03)
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
  add(g, box(0.12, 0.13, 0.14), m.furniture, -0.03, -0.06, 0.12)
  add(g, box(0.122, 0.02, 0.142), m.accent, -0.03, -0.12, 0.12)
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
  add(g, box(0.05, 0.12, 0.07), m.furniture, 0, -0.04, 0.14)
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
  add(g, cyl(0.013, 0.013, 0.08, 8), m.steel, 0.05, 0.08, 0.02, 0, 0, Math.PI / 2) // bolt handle
  add(g, new SphereGeometry(0.018, 8, 6), m.steel, 0.09, 0.08, 0.02)
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
  add(g, box(0.044, 0.056, 0.24), m.body, 0, 0.082, 0.05) // slide
  for (let i = 0; i < 6; i++) add(g, box(0.046, 0.038, 0.006), m.dark, 0, 0.084, -0.055 + i * 0.012) // serrations
  add(g, box(0.03, 0.01, 0.16), m.accent, 0, 0.115, 0.06) // top rib
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
  add(g, box(0.026, 0.014, 0.012), m.dark, 0, 0.117, -0.055) // rear sight
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
  add(g, box(0.04, 0.12, 0.05), m.furniture, 0, -0.05, 0.13)
  add(g, box(0.044, 0.012, 0.054), m.accent, 0, -0.112, 0.13)
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
  add(g, box(0.045, 0.09, 0.07), m.steel, 0, -0.025, 0.1, -0.08)
  add(g, box(0.044, 0.09, 0.068), m.steel, 0, -0.113, 0.118, -0.32)
  add(g, box(0.047, 0.012, 0.05), m.dark, 0, -0.113, 0.118, -0.32)
  add(g, box(0.043, 0.08, 0.066), m.steel, 0, -0.189, 0.153, -0.55)
  add(g, box(0.048, 0.012, 0.07), m.dark, 0, -0.228, 0.177, -0.55)
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
  add(g, box(0.045, 0.1, 0.066), m.furniture, 0, -0.05, -0.1, -0.1)
  add(g, box(0.044, 0.06, 0.064), m.furniture, 0, -0.128, -0.086, -0.3)
  add(g, box(0.048, 0.012, 0.068), m.accent, 0, -0.16, -0.076, -0.3)
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
  for (const x of [-0.019, 0.019]) {
    add(g, cyl(0.018, 0.018, 0.56, 12), m.steel, x, 0.085, 0.41)
    add(g, cyl(0.012, 0.012, 0.004, 10), m.dark, x, 0.085, 0.69)
    // Exposed hammers (cocked back)
    add(g, box(0.01, 0.04, 0.014), m.steel, x, 0.1, -0.005, -0.4)
    add(g, box(0.012, 0.008, 0.02), m.steel, x, 0.12, -0.02)
  }
  add(g, box(0.012, 0.006, 0.56), m.dark, 0, 0.105, 0.41) // top rib
  add(g, box(0.006, 0.006, 0.006), m.accent, 0, 0.111, 0.68) // bead
  add(g, box(0.012, 0.008, 0.04), m.steel, 0, 0.1, 0.02, 0, 0.4) // top lever
  // Wooden forend
  add(g, box(0.06, 0.04, 0.24), m.furniture, 0, 0.055, 0.3)
  for (let i = 0; i < 3; i++) add(g, box(0.062, 0.025, 0.006), m.dark, 0, 0.05, 0.25 + i * 0.04)
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
  add(g, cyl(0.085, 0.085, 0.07, 16), m.furniture, 0, -0.08, 0.15, 0, Math.PI / 2)
  add(g, cyl(0.05, 0.05, 0.076, 12), m.accent, 0, -0.08, 0.15, 0, Math.PI / 2)
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

const BUILDERS = {
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
}
export function buildGrenade(kind = 'frag') {
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
