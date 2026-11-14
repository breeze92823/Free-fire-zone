// Blocky stand-in characters (worn until a Bloxity look loads): the same proportions
// and bone names as the Bloxity base rig (player.glb: torso 2.8 x 2.4 x 1.6,
// arms 1.2 wide, legs 1.4 wide, 1.6 head, 6.4 units tall), so the shared
// animator drives them, plus elbows/knees (two boxes per limb) and outfits:
// face, shirt design (jacket, hoodie, vest, tee...), pants + belt + shoes,
// hair styles, hats, glasses, backpacks and a team armband.
// Each part is a rigid box parented to its bone (no skinning needed).
import { Bone, BoxGeometry, CanvasTexture, CylinderGeometry, Group, Mesh, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace, SphereGeometry } from 'three'
import { mergeChildren } from './merge.js'
import { OUTFITS, PLAYER_DIMS, RIG_HEIGHT, TEAMS } from '../config.js'

const pick = (rand, list) => list[Math.floor(rand() * list.length)]

const HAIRS = ['short', 'spiky', 'long', 'bowl', 'bun', 'mohawk', 'curly', 'none']
const HATS = ['none', 'none', 'none', 'cap', 'beanie', 'helmet', 'bandana', 'headphones', 'cap']
const SHIRTS = ['jacket', 'hoodie', 'vest', 'tee', 'suit', 'tactical', 'striped']
const FACES = ['smile', 'grin', 'smirk', 'serious', 'happy', 'cool', 'wink']

export function randomOutfit(rand = Math.random) {
  return {
    skin: pick(rand, OUTFITS.skins),
    shirt: pick(rand, OUTFITS.shirts),
    shirt2: pick(rand, OUTFITS.shirts),
    shirtStyle: pick(rand, SHIRTS),
    pants: pick(rand, OUTFITS.pants),
    hair: pick(rand, OUTFITS.hair),
    hairStyle: pick(rand, HAIRS),
    hat: pick(rand, HATS),
    hatColor: pick(rand, OUTFITS.shirts),
    shoes: pick(rand, OUTFITS.shoes),
    accent: pick(rand, OUTFITS.accents),
    face: pick(rand, FACES),
    glasses: rand() < 0.22,
    backpack: rand() < 0.35,
    mask: rand() < 0.12,
  }
}

// --- Canvas painters -------------------------------------------------------------------
function canvas(w, h = w) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}
function tex(c) {
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 4
  return t
}

export function paintFace(g, o, x, y, s) {
  // s = face square size in px; draws on the given context at (x, y).
  const u = s / 16
  g.fillStyle = o.skin
  g.fillRect(x, y, s, s)
  const eyeY = y + u * 7
  if (o.glasses || o.face === 'cool') {
    g.fillStyle = '#111318'
    g.fillRect(x + u * 2.5, eyeY - u * 1, u * 4.6, u * 2.6)
    g.fillRect(x + u * 8.9, eyeY - u * 1, u * 4.6, u * 2.6)
    g.fillRect(x + u * 6.8, eyeY - u * 0.6, u * 2.4, u * 0.8)
    g.fillStyle = 'rgba(160,200,255,0.55)'
    g.fillRect(x + u * 3, eyeY - u * 0.6, u * 1.4, u * 0.8)
    g.fillRect(x + u * 9.4, eyeY - u * 0.6, u * 1.4, u * 0.8)
  } else {
    g.fillStyle = '#ffffff'
    g.fillRect(x + u * 3.6, eyeY - u * 0.8, u * 2.6, u * 2.4)
    g.fillRect(x + u * 9.8, eyeY - u * 0.8, u * 2.6, u * 2.4)
    g.fillStyle = '#1a1a22'
    if (o.face === 'wink') g.fillRect(x + u * 3.4, eyeY + u * 0.4, u * 3, u * 0.7)
    else g.fillRect(x + u * 4.6, eyeY - u * 0.4, u * 1.4, u * 1.9)
    g.fillRect(x + u * 10.6, eyeY - u * 0.4, u * 1.4, u * 1.9)
    g.fillStyle = '#ffffff'
    g.fillRect(x + u * 4.9, eyeY - u * 0.2, u * 0.5, u * 0.5)
    g.fillRect(x + u * 10.9, eyeY - u * 0.2, u * 0.5, u * 0.5)
  }
  // Brows
  g.fillStyle = 'rgba(40,25,15,0.9)'
  const browTilt = o.face === 'serious' ? 0.5 : 0
  g.save()
  g.translate(x + u * 4.9, eyeY - u * 2)
  g.rotate(browTilt * 0.4)
  g.fillRect(-u * 1.6, -u * 0.35, u * 3.2, u * 0.7)
  g.restore()
  g.save()
  g.translate(x + u * 11.1, eyeY - u * 2)
  g.rotate(-browTilt * 0.4)
  g.fillRect(-u * 1.6, -u * 0.35, u * 3.2, u * 0.7)
  g.restore()
  // Mouth
  if (o.mask) {
    g.fillStyle = '#20232b'
    g.fillRect(x + u * 1.5, y + u * 9.6, u * 13, u * 5.4)
    g.fillStyle = 'rgba(255,255,255,0.12)'
    for (let i = 0; i < 4; i++) g.fillRect(x + u * 3 + i * u * 2.8, y + u * 11, u * 1.6, u * 2.6)
    return
  }
  g.strokeStyle = '#2a1610'
  g.lineWidth = u * 0.9
  g.lineCap = 'round'
  const mx = x + u * 8
  const my = y + u * 11.6
  g.beginPath()
  if (o.face === 'grin' || o.face === 'happy') {
    g.fillStyle = '#3a1410'
    g.moveTo(mx - u * 3.2, my - u * 0.6)
    g.quadraticCurveTo(mx, my + u * 3.4, mx + u * 3.2, my - u * 0.6)
    g.closePath()
    g.fill()
    g.fillStyle = '#ffffff'
    g.fillRect(mx - u * 2.4, my - u * 0.5, u * 4.8, u * 0.9)
  } else if (o.face === 'smirk') {
    g.moveTo(mx - u * 2.6, my + u * 0.2)
    g.quadraticCurveTo(mx + u * 0.5, my + u * 1.2, mx + u * 3, my - u * 1)
    g.stroke()
  } else if (o.face === 'serious') {
    g.moveTo(mx - u * 2.2, my + u * 0.4)
    g.lineTo(mx + u * 2.2, my + u * 0.4)
    g.stroke()
  } else {
    g.moveTo(mx - u * 3, my - u * 0.4)
    g.quadraticCurveTo(mx, my + u * 2.4, mx + u * 3, my - u * 0.4)
    g.stroke()
  }
}

function paintShirtFront(o, teamColor) {
  const c = canvas(128)
  const g = c.getContext('2d')
  g.fillStyle = o.shirt
  g.fillRect(0, 0, 128, 128)
  const shade = (a) => `rgba(0,0,0,${a})`
  switch (o.shirtStyle) {
    case 'jacket':
      g.fillStyle = o.shirt2
      g.fillRect(44, 0, 40, 128) // inner shirt
      g.fillStyle = o.shirt
      g.beginPath()
      g.moveTo(44, 0)
      g.lineTo(64, 46)
      g.lineTo(44, 128)
      g.lineTo(30, 128)
      g.lineTo(30, 0)
      g.fill()
      g.beginPath()
      g.moveTo(84, 0)
      g.lineTo(64, 46)
      g.lineTo(84, 128)
      g.lineTo(98, 128)
      g.lineTo(98, 0)
      g.fill()
      g.fillStyle = shade(0.25)
      g.fillRect(26, 0, 4, 128)
      g.fillRect(98, 0, 4, 128)
      g.fillStyle = 'rgba(255,255,255,0.18)'
      g.fillRect(14, 70, 18, 3)
      g.fillRect(96, 70, 18, 3)
      break
    case 'hoodie':
      g.fillStyle = shade(0.18)
      g.beginPath()
      g.ellipse(64, 0, 40, 26, 0, 0, Math.PI)
      g.fill()
      g.strokeStyle = '#eeeeee'
      g.lineWidth = 3
      g.beginPath()
      g.moveTo(54, 18)
      g.lineTo(52, 50)
      g.moveTo(74, 18)
      g.lineTo(76, 50)
      g.stroke()
      g.fillStyle = shade(0.2)
      g.fillRect(30, 80, 68, 32)
      g.fillStyle = o.shirt
      g.fillRect(33, 83, 62, 26)
      g.fillStyle = shade(0.1)
      g.fillRect(64, 83, 2, 26)
      break
    case 'vest':
    case 'tactical':
      g.fillStyle = o.shirtStyle === 'tactical' ? '#3a4030' : o.shirt2
      g.fillRect(12, 18, 104, 110)
      g.fillStyle = shade(0.3)
      for (let i = 0; i < 3; i++) {
        g.fillRect(20 + i * 32, 66, 24, 30)
        g.fillStyle = 'rgba(255,255,255,0.08)'
        g.fillRect(20 + i * 32, 66, 24, 6)
        g.fillStyle = shade(0.3)
      }
      g.fillStyle = shade(0.4)
      g.fillRect(12, 18, 104, 6)
      g.fillStyle = '#c9c9c9'
      g.fillRect(58, 30, 12, 10)
      break
    case 'suit':
      g.fillStyle = '#f4f4f4'
      g.beginPath()
      g.moveTo(44, 0)
      g.lineTo(84, 0)
      g.lineTo(64, 70)
      g.fill()
      g.fillStyle = o.accent
      g.beginPath()
      g.moveTo(60, 8)
      g.lineTo(68, 8)
      g.lineTo(70, 60)
      g.lineTo(64, 68)
      g.lineTo(58, 60)
      g.fill()
      g.fillStyle = shade(0.25)
      g.fillRect(63, 70, 2, 58)
      g.fillStyle = '#d8d8d8'
      g.fillRect(60, 84, 6, 6)
      g.fillRect(60, 104, 6, 6)
      break
    case 'striped':
      g.fillStyle = o.shirt2
      for (let i = 0; i < 128; i += 22) g.fillRect(0, i, 128, 10)
      break
    default: {
      // tee with a chest logo
      g.fillStyle = o.accent
      g.beginPath()
      g.arc(64, 54, 20, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = o.shirt
      g.beginPath()
      g.moveTo(64, 40)
      g.lineTo(76, 62)
      g.lineTo(52, 62)
      g.fill()
      g.fillStyle = shade(0.2)
      g.beginPath()
      g.ellipse(64, 0, 22, 10, 0, 0, Math.PI)
      g.fill()
    }
  }
  // Wrinkle shading at the bottom (belt line)
  const grad = g.createLinearGradient(0, 96, 0, 128)
  grad.addColorStop(0, 'rgba(0,0,0,0)')
  grad.addColorStop(1, 'rgba(0,0,0,0.18)')
  g.fillStyle = grad
  g.fillRect(0, 96, 128, 32)
  return tex(c)
}

function paintFaceTexture(o) {
  const c = canvas(128)
  const g = c.getContext('2d')
  paintFace(g, o, 0, 0, 128)
  return tex(c)
}

// A small 2D portrait (head + hair) for HUD lists.
const portraitCache = new Map()
export function portrait(o, size = 96) {
  const key = JSON.stringify(o) + size
  if (portraitCache.has(key)) return portraitCache.get(key)
  const c = canvas(size)
  const g = c.getContext('2d')
  const s = size * 0.62
  const x = (size - s) / 2
  const y = size * 0.26
  g.fillStyle = o.shirt
  g.fillRect(size * 0.1, y + s - 2, size * 0.8, size)
  paintFace(g, o, x, y, s)
  g.fillStyle = o.hat !== 'none' && o.hat !== 'headphones' ? o.hatColor : o.hair
  if (o.hairStyle !== 'none' || (o.hat !== 'none' && o.hat !== 'headphones')) {
    g.fillRect(x - s * 0.06, y - s * 0.22, s * 1.12, s * 0.34)
    if (o.hairStyle === 'long') {
      g.fillRect(x - s * 0.08, y, s * 0.12, s * 0.8)
      g.fillRect(x + s * 0.96, y, s * 0.12, s * 0.8)
    }
    if (o.hat === 'cap') g.fillRect(x + s * 0.3, y + s * 0.08, s * 0.85, s * 0.08)
  }
  const url = c.toDataURL()
  portraitCache.set(key, url)
  return url
}

// --- Geometry ----------------------------------------------------------------------------
const G = {}
function geo(key, make) {
  return G[key] || (G[key] = make())
}
const B = (w, h, d) => geo(`b${w}_${h}_${d}`, () => new BoxGeometry(w, h, d))

function mesh(parent, geometry, material, x, y, z) {
  const m = new Mesh(geometry, material)
  m.position.set(x, y, z)
  m.castShadow = true
  m.receiveShadow = true
  parent.add(m)
  return m
}

function bone(name, parent, x, y, z) {
  const b = new Bone()
  b.name = name
  b.position.set(x, y, z)
  parent.add(b)
  return b
}

// Builds the character. team: 'blue' | 'orange' | null (armband colour).
export function buildCharacter(o, team = null) {
  const root = new Group()
  root.name = 'character'
  const std = (color, extra = {}) => new MeshStandardMaterial({ color, roughness: 0.75, metalness: 0, ...extra })
  const mats = {
    skin: std(o.skin),
    shirt: std(o.shirt),
    pants: std(o.pants),
    hair: std(o.hair, { roughness: 0.9 }),
    hat: std(o.hatColor),
    shoes: std(o.shoes),
    belt: std('#1a1a1a', { roughness: 0.5 }),
    buckle: std('#c9b37a', { metalness: 0.8, roughness: 0.3 }),
    band: std(team ? TEAMS[team].tag : o.accent),
    pack: std('#4a4f3a'),
    dark: std('#1b1d22'),
    lens: std('#16181d', { roughness: 0.15, metalness: 0.6 }),
  }
  const shirtFront = std(o.shirt, { map: paintShirtFront(o) })
  const faceMat = std('#ffffff', { map: paintFaceTexture(o) })

  // Skeleton (same names/bind positions as player.glb, plus elbow/knee bones).
  const rig = bone('Rig1', root, 0, 0, 0)
  const spine1 = bone('Spine1', rig, 0, 2.4, 0)
  const spine2 = bone('Spine2', spine1, 0, 1.8, 0)
  const neck = bone('Neck1', bone('Neck_Offset', spine2, 0, 0.6, 0), 0, 0, 0)
  const armR1 = bone('ArmR1', bone('ArmR_Offset', spine2, -2, 0.6, 0.4), 0, 0, 0)
  const armL1 = bone('ArmL1', bone('ArmL_Offset', spine2, 2, 0.6, 0.4), 0, 0, 0)
  const armR2 = bone('ArmR2', armR1, 0, -1.2, 0)
  const armL2 = bone('ArmL2', armL1, 0, -1.2, 0)
  const legR1 = bone('LegR1', bone('LegR_Offset', rig, -0.7, 2.4, 0), 0, 0, 0)
  const legL1 = bone('LegL1', bone('LegL_Offset', rig, 0.7, 2.4, 0), 0, 0, 0)
  const legR2 = bone('LegR2', legR1, 0, -1.2, 0)
  const legL2 = bone('LegL2', legL1, 0, -1.2, 0)

  // Torso: 2.8 x 2.4 x 1.6, front face textured. BoxGeometry groups: +x -x +y -y +z -z.
  const torso = mesh(spine1, B(2.8, 2.4, 1.6), mats.shirt, 0, 1.2, 0)
  torso.name = 'torso'
  mesh(spine1, geo('front', () => new PlaneGeometry(2.8, 2.4)), shirtFront, 0, 1.2, 0.802).castShadow = false
  mesh(spine1, B(2.86, 0.22, 1.66), mats.belt, 0, 0.12, 0)
  mesh(spine1, B(0.42, 0.26, 0.06), mats.buckle, 0, 0.12, 0.84)
  if (o.backpack) {
    mesh(spine1, B(2, 1.9, 0.8), mats.pack, 0, 1.25, -1.15)
    mesh(spine1, B(1.6, 0.7, 0.3), mats.dark, 0, 0.8, -1.6)
  }

  // Arms: upper (sleeve) + forearm (sleeve, then a skin hand), team armband on the upper arm.
  for (const [a1, a2, side] of [[armR1, armR2, -1], [armL1, armL2, 1]]) {
    mesh(a1, B(1.2, 1.25, 1.6), mats.shirt, 0, -0.6, -0.4)
    mesh(a1, B(1.26, 0.3, 1.66), mats.band, 0, -0.55, -0.4)
    const sleeveShort = o.shirtStyle === 'tee' || o.shirtStyle === 'vest'
    mesh(a2, B(1.18, 0.8, 1.56), sleeveShort ? mats.skin : mats.shirt, 0, -0.4, -0.4)
    mesh(a2, B(1.2, 0.42, 1.58), mats.skin, 0, -1.0, -0.4)
    void side
  }
  // Legs: thigh + shin with shoe.
  for (const [l1, l2] of [[legR1, legR2], [legL1, legL2]]) {
    mesh(l1, B(1.38, 1.25, 1.58), mats.pants, 0, -0.6, 0)
    mesh(l2, B(1.36, 0.85, 1.56), mats.pants, 0, -0.45, 0)
    mesh(l2, B(1.42, 0.38, 1.9), mats.shoes, 0, -1.04, 0.14)
  }

  // Head: a cube with the face on its front.
  const head = mesh(neck, B(1.6, 1.6, 1.6), mats.skin, 0, 0.8, 0)
  head.name = 'head'
  mesh(neck, geo('face', () => new PlaneGeometry(1.6, 1.6)), faceMat, 0, 0.8, 0.802).castShadow = false
  buildHair(neck, o, mats)
  buildHat(neck, o, mats)

  // One vertex-coloured mesh per bone (plus the two textured planes): ~12 draw calls a character.
  const vc = new MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0 })
  for (const b of [spine1, neck, armR1, armR2, armL1, armL2, legR1, legR2, legL1, legL2]) mergeChildren(b, vc)
  for (const m of Object.values(mats)) m.dispose()

  root.userData.mats = [vc, shirtFront, faceMat]
  root.animations = []
  root.nodes = {}
  root.traverse((n) => {
    if (n.name) root.nodes[n.name] = n
  })
  root.scale.setScalar(PLAYER_DIMS.height / RIG_HEIGHT)
  return root
}

function buildHair(neck, o, m) {
  if (o.hat === 'helmet' || o.hat === 'beanie') return // covered
  const h = m.hair
  switch (o.hairStyle) {
    case 'short':
      mesh(neck, B(1.72, 0.42, 1.72), h, 0, 1.68, -0.02)
      mesh(neck, B(1.72, 0.9, 0.3), h, 0, 1.2, -0.72)
      break
    case 'spiky':
      mesh(neck, B(1.72, 0.36, 1.72), h, 0, 1.66, 0)
      for (let i = 0; i < 5; i++) {
        const s = mesh(neck, B(0.42, 0.6, 0.42), h, -0.64 + i * 0.32, 1.98, -0.1 + (i % 2) * 0.3)
        s.rotation.z = (i - 2) * 0.22
        s.rotation.x = -0.25
      }
      break
    case 'long':
      mesh(neck, B(1.76, 0.42, 1.76), h, 0, 1.68, -0.02)
      mesh(neck, B(1.8, 1.9, 0.4), h, 0, 0.9, -0.74)
      mesh(neck, B(0.24, 1.5, 1.4), h, 0.86, 1.05, -0.1)
      mesh(neck, B(0.24, 1.5, 1.4), h, -0.86, 1.05, -0.1)
      break
    case 'bowl':
      mesh(neck, B(1.8, 0.6, 1.8), h, 0, 1.6, 0)
      mesh(neck, B(1.82, 0.28, 0.2), h, 0, 1.34, 0.82)
      break
    case 'bun':
      mesh(neck, B(1.74, 0.4, 1.74), h, 0, 1.66, 0)
      mesh(neck, geo('bun', () => new SphereGeometry(0.45, 10, 8)), h, 0, 1.95, -0.6)
      break
    case 'mohawk':
      mesh(neck, B(0.42, 0.7, 1.7), h, 0, 1.9, 0)
      break
    case 'curly':
      for (let i = 0; i < 9; i++) mesh(neck, geo('curl', () => new SphereGeometry(0.42, 8, 6)), h, -0.6 + (i % 3) * 0.6, 1.72 + (i % 2) * 0.08, -0.6 + Math.floor(i / 3) * 0.55)
      break
    default:
      break
  }
}

function buildHat(neck, o, m) {
  const c = m.hat
  switch (o.hat) {
    case 'cap':
      mesh(neck, B(1.74, 0.5, 1.74), c, 0, 1.78, -0.02)
      mesh(neck, B(1.6, 0.1, 0.9), c, 0, 1.56, 1.2)
      mesh(neck, B(0.3, 0.12, 0.3), c, 0, 2.08, 0)
      break
    case 'beanie':
      mesh(neck, B(1.76, 0.7, 1.76), c, 0, 1.72, 0)
      mesh(neck, B(1.82, 0.26, 1.82), c, 0, 1.42, 0)
      mesh(neck, geo('pom', () => new SphereGeometry(0.26, 8, 6)), m.band, 0, 2.18, 0)
      break
    case 'helmet':
      mesh(neck, B(1.86, 0.74, 1.9), c, 0, 1.7, 0)
      mesh(neck, B(1.96, 0.16, 2.02), c, 0, 1.36, 0)
      mesh(neck, B(1.4, 0.22, 0.12), m.lens, 0, 1.62, 0.98)
      break
    case 'bandana':
      mesh(neck, B(1.72, 0.32, 1.72), c, 0, 1.5, 0)
      mesh(neck, B(0.3, 0.5, 0.2), c, 0.3, 1.25, -0.9)
      if (o.hairStyle === 'none') mesh(neck, B(1.68, 0.3, 1.68), m.hair, 0, 1.72, 0)
      break
    case 'headphones':
      mesh(neck, B(1.9, 0.18, 0.3), m.dark, 0, 1.78, 0)
      mesh(neck, geo('cup', () => new CylinderGeometry(0.4, 0.4, 0.26, 12).rotateZ(Math.PI / 2)), c, 0.92, 0.95, 0)
      mesh(neck, geo('cup', () => new CylinderGeometry(0.4, 0.4, 0.26, 12).rotateZ(Math.PI / 2)), c, -0.92, 0.95, 0)
      break
    default:
      break
  }
}

// Flash every material of a character (hit feedback). k 0..1.
export function setFlash(root, k, color = '#ff3030') {
  for (const m of root.userData.mats || []) {
    if (!m.emissive) continue
    if (k > 0) {
      if (m.userData.baseEmissive === undefined) {
        m.userData.baseEmissive = m.emissive.getHex()
        m.userData.baseEI = m.emissiveIntensity
      }
      m.emissive.set(color)
      m.emissiveIntensity = k * 0.9
    } else if (m.userData.baseEmissive !== undefined) {
      m.emissive.setHex(m.userData.baseEmissive)
      m.emissiveIntensity = m.userData.baseEI
    }
  }
}

// Fade a character (cloak / dissolve). opacity 1 = solid.
// Each material's own settings are remembered on the first fade and restored at opacity 1, so a
// Bloxity item that is meant to be see-through (alpha cut-outs, glass) stays that way afterwards.
// root.userData.opacity records the current fade: a root that is worn again (the local player's
// avatar is reused by the lobby and every round) must be reset with setOpacity(root, 1).
export function setOpacity(root, opacity) {
  const solid = opacity >= 1
  root.traverse((n) => {
    if (!n.isMesh) return
    const u = n.userData
    if (u.baseCastShadow === undefined) u.baseCastShadow = n.castShadow
    const list = Array.isArray(n.material) ? n.material : [n.material]
    for (const m of list) {
      if (!m) continue
      const b = m.userData
      if (b.baseOpacity === undefined) {
        b.baseOpacity = m.opacity
        b.baseTransparent = m.transparent
        b.baseDepthWrite = m.depthWrite
      }
      m.opacity = b.baseOpacity * opacity
      m.transparent = solid ? b.baseTransparent : true
      m.depthWrite = solid ? b.baseDepthWrite : false
    }
    n.castShadow = u.baseCastShadow && opacity > 0.5
  })
  root.userData.opacity = opacity
}
