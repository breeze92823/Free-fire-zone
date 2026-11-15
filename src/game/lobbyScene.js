// The lobby's 3D room: a briefing hangar with a glowing hex floor, ribbed
// walls with light strips, a big bay window onto the sea, crates and weapon
// racks, a rotating rank shield on a pedestal, and the squad platform where
// the player and up to three other players from this server room stand with
// their weapons (an empty platform when nobody else is online).
import {
  AmbientLight,
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DirectionalLight,
  ExtrudeGeometry,
  Fog,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  RepeatWrapping,
  Scene,
  Shape,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
} from 'three'
import { Actor } from './actor.js'
import { disposeLook } from '../avatar/look.js'
import { randomOutfit } from './characters.js'
import { RANKS } from '../config.js'

function tex(w, h, draw, repeat = null) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d'), w, h)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  if (repeat) {
    t.wrapS = t.wrapT = RepeatWrapping
    t.repeat.set(repeat[0], repeat[1])
  }
  t.anisotropy = 8
  return t
}

// Hexagon tiles with glowing seams.
function hexFloor(glow = false) {
  return tex(
    256,
    222,
    (g, w, h) => {
      g.fillStyle = glow ? '#000' : '#18213a'
      g.fillRect(0, 0, w, h)
      const r = 64
      const hx = r * Math.sqrt(3)
      const drawHex = (cx, cy) => {
        g.beginPath()
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI / 3) * i + Math.PI / 6
          g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
        }
        g.closePath()
        if (!glow) {
          const grad = g.createLinearGradient(cx, cy - r, cx, cy + r)
          grad.addColorStop(0, '#26324f')
          grad.addColorStop(1, '#1a2340')
          g.fillStyle = grad
          g.fill()
        }
        g.lineWidth = glow ? 4 : 6
        g.strokeStyle = glow ? '#ffb21a' : '#0d1322'
        g.stroke()
      }
      for (let y = -1; y < 3; y++) for (let x = -1; x < 3; x++) drawHex(x * hx + (y % 2 ? hx / 2 : 0), y * r * 1.5 + r)
    },
    [10, 10],
  )
}

function windowView() {
  return tex(1024, 512, (g, w, h) => {
    const sky = g.createLinearGradient(0, 0, 0, h * 0.62)
    sky.addColorStop(0, '#2c86ff')
    sky.addColorStop(1, '#bfe8ff')
    g.fillStyle = sky
    g.fillRect(0, 0, w, h)
    // clouds
    g.fillStyle = 'rgba(255,255,255,0.9)'
    for (let i = 0; i < 9; i++) {
      const x = (i * 137) % w
      const y = 60 + ((i * 53) % 140)
      for (let k = 0; k < 5; k++) {
        g.beginPath()
        g.arc(x + k * 26, y + Math.sin(k) * 8, 22 + (k % 3) * 8, 0, Math.PI * 2)
        g.fill()
      }
    }
    const sea = g.createLinearGradient(0, h * 0.62, 0, h)
    sea.addColorStop(0, '#1da6e8')
    sea.addColorStop(1, '#0b5fa8')
    g.fillStyle = sea
    g.fillRect(0, h * 0.62, w, h * 0.38)
    // a distant island
    g.fillStyle = '#3e9a3a'
    g.beginPath()
    g.ellipse(w * 0.62, h * 0.63, 220, 26, 0, Math.PI, 0)
    g.fill()
    g.fillStyle = '#e8d08a'
    g.fillRect(w * 0.62 - 220, h * 0.625, 440, 6)
  })
}

function shieldGeometry() {
  const s = new Shape()
  s.moveTo(0, 1)
  s.lineTo(0.8, 0.72)
  s.lineTo(0.75, -0.1)
  s.quadraticCurveTo(0.6, -0.75, 0, -1.15)
  s.quadraticCurveTo(-0.6, -0.75, -0.75, -0.1)
  s.lineTo(-0.8, 0.72)
  s.closePath()
  const g = new ExtrudeGeometry(s, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.07, bevelSegments: 3 })
  g.center()
  return g
}

export function createLobbyScene() {
  const scene = new Scene()
  scene.background = new Color('#0b1222')
  scene.fog = new Fog('#0b1222', 26, 60)
  const camera = new PerspectiveCamera(46, 1, 0.1, 200)
  camera.position.set(0, 1.95, 6.6)
  const look = new Vector3(0, 1.2, -0.4)

  scene.add(new HemisphereLight('#9fc4ff', '#1a1f33', 0.9))
  scene.add(new AmbientLight('#ffffff', 0.25))
  const key = new DirectionalLight('#fff1dc', 2.4)
  key.position.set(4, 9, 7)
  key.castShadow = true
  key.shadow.mapSize.set(1024, 1024)
  Object.assign(key.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 30 })
  key.shadow.bias = -0.0005
  scene.add(key)
  const rim = new DirectionalLight('#7fb6ff', 1.6)
  rim.position.set(-5, 4, -6)
  scene.add(rim)
  const warm = new PointLight('#ffb347', 18, 14, 2)
  warm.position.set(0, 0.6, 2)
  scene.add(warm)

  const std = (color, extra) => new MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.35, ...extra })
  const neonGold = new MeshStandardMaterial({ color: '#ffcf4a', emissive: '#ffae1a', emissiveIntensity: 2.2 })
  const neonCyan = new MeshStandardMaterial({ color: '#7ff0ff', emissive: '#22c8ff', emissiveIntensity: 2.4 })
  const metal = std('#3a4560', { metalness: 0.7, roughness: 0.35 })
  const darkMetal = std('#1d2438', { metalness: 0.6, roughness: 0.45 })

  // Floor
  const floor = new Mesh(new PlaneGeometry(40, 40), new MeshStandardMaterial({ map: hexFloor(), emissiveMap: hexFloor(true), emissive: '#ffffff', emissiveIntensity: 0.9, roughness: 0.35, metalness: 0.5 }))
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  scene.add(floor)

  // Walls: ribbed panels in a U around the platform.
  const walls = new Group()
  const panelGeo = new BoxGeometry(2.6, 7, 0.4)
  for (let i = -7; i <= 7; i++) {
    const p = new Mesh(panelGeo, i % 2 ? metal : darkMetal)
    p.position.set(i * 2.65, 3.5, -9)
    if (Math.abs(i) <= 2) continue // the window gap
    walls.add(p)
    const strip = new Mesh(new BoxGeometry(0.08, 6.2, 0.06), i % 3 ? neonGold : neonCyan)
    strip.position.set(i * 2.65 + 1.25, 3.6, -8.75)
    walls.add(strip)
  }
  for (const side of [-1, 1]) {
    for (let k = 0; k < 6; k++) {
      const p = new Mesh(panelGeo, k % 2 ? metal : darkMetal)
      p.position.set(side * 13, 3.5, -7 + k * 2.65)
      p.rotation.y = Math.PI / 2
      walls.add(p)
    }
  }
  scene.add(walls)
  // Bay window
  const view = new Mesh(new PlaneGeometry(14, 7), new MeshBasicMaterial({ map: windowView(), fog: false }))
  view.position.set(0, 3.6, -10.5)
  scene.add(view)
  const frameMat = std('#2a3350', { metalness: 0.8, roughness: 0.3 })
  for (const x of [-6.9, 6.9]) {
    const f = new Mesh(new BoxGeometry(0.5, 7.4, 0.8), frameMat)
    f.position.set(x, 3.6, -9.2)
    scene.add(f)
  }
  for (const y of [0.2, 7.1]) {
    const f = new Mesh(new BoxGeometry(14.4, 0.5, 0.8), frameMat)
    f.position.set(0, y, -9.2)
    scene.add(f)
  }
  for (const x of [-2.3, 2.3]) {
    const f = new Mesh(new BoxGeometry(0.18, 7, 0.3), frameMat)
    f.position.set(x, 3.6, -9.6)
    scene.add(f)
  }
  // Ceiling arches with lights
  for (let k = 0; k < 5; k++) {
    const arch = new Mesh(new TorusGeometry(13, 0.25, 6, 32, Math.PI), darkMetal)
    arch.position.set(0, 0, -8 + k * 3.2)
    arch.scale.set(1, 0.62, 1)
    scene.add(arch)
    const lamp = new Mesh(new BoxGeometry(3, 0.08, 0.3), neonGold)
    lamp.position.set(0, 8, -8 + k * 3.2)
    scene.add(lamp)
  }

  // Squad platform: stepped hex with glowing rim.
  const plat = new Mesh(new CylinderGeometry(4.2, 4.5, 0.3, 6), std('#2b3554', { metalness: 0.6 }))
  plat.position.y = 0.15
  plat.receiveShadow = true
  plat.castShadow = true
  scene.add(plat)
  const rimRing = new Mesh(new TorusGeometry(4.3, 0.05, 6, 6), neonGold)
  rimRing.rotation.x = Math.PI / 2
  rimRing.rotation.z = Math.PI / 6
  rimRing.position.y = 0.31
  scene.add(rimRing)
  const inner = new Mesh(new CylinderGeometry(2.2, 2.2, 0.32, 48), std('#36446a', { metalness: 0.7, roughness: 0.25 }))
  inner.position.y = 0.17
  inner.receiveShadow = true
  scene.add(inner)
  const innerRing = new Mesh(new TorusGeometry(2.2, 0.04, 6, 48), neonCyan)
  innerRing.rotation.x = Math.PI / 2
  innerRing.position.y = 0.34
  scene.add(innerRing)

  // Props: crates + weapon racks.
  const crateMat = std('#4d5a36', { metalness: 0.15, roughness: 0.7 })
  const crateTrim = std('#2b2e33', { metalness: 0.7 })
  const crate = (x, z, s = 1, r = 0) => {
    const g = new Group()
    const b = new Mesh(new BoxGeometry(1.4 * s, 0.9 * s, 0.9 * s), crateMat)
    b.position.y = 0.45 * s
    b.castShadow = true
    b.receiveShadow = true
    g.add(b)
    const t = new Mesh(new BoxGeometry(1.45 * s, 0.1 * s, 0.95 * s), crateTrim)
    t.position.y = 0.9 * s
    g.add(t)
    const strip = new Mesh(new BoxGeometry(0.7 * s, 0.05 * s, 0.02), neonCyan)
    strip.position.set(0, 0.6 * s, 0.46 * s)
    g.add(strip)
    g.position.set(x, 0, z)
    g.rotation.y = r
    scene.add(g)
  }
  crate(-7.5, -4, 1.2, 0.3)
  crate(-6.6, -2.2, 1, -0.2)
  crate(-7.4, -4, 0.9, 0.5)
  crate(7.2, -3.5, 1.2, -0.3)
  crate(8.4, -1.4, 1, 0.1)
  const rackGeo = new BoxGeometry(3.2, 2.6, 0.3)
  for (const x of [-9.5, 9.5]) {
    const rack = new Mesh(rackGeo, darkMetal)
    rack.position.set(x, 1.6, -6.5)
    rack.rotation.y = x < 0 ? 0.5 : -0.5
    scene.add(rack)
    for (let k = 0; k < 3; k++) {
      const bar = new Mesh(new BoxGeometry(2.8, 0.06, 0.1), neonGold)
      bar.position.set(0, -0.8 + k * 0.8, 0.2)
      rack.add(bar)
    }
  }

  // Rank shield on a pedestal.
  const ped = new Mesh(new CylinderGeometry(0.6, 0.8, 1.1, 8), std('#2b3554', { metalness: 0.7 }))
  ped.position.set(-4.9, 0.55, -1.2)
  ped.castShadow = true
  scene.add(ped)
  const pedGlow = new Mesh(new CylinderGeometry(0.62, 0.62, 0.06, 24), neonGold)
  pedGlow.position.set(-4.9, 1.12, -1.2)
  scene.add(pedGlow)
  const shieldMat = new MeshStandardMaterial({ color: '#cd7f32', metalness: 0.85, roughness: 0.25, emissive: '#3a1d00', emissiveIntensity: 0.4 })
  const shield = new Mesh(shieldGeometry(), shieldMat)
  shield.scale.setScalar(0.85)
  shield.position.set(-4.9, 2.3, -1.2)
  shield.castShadow = true
  scene.add(shield)
  const starShape = new Shape()
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2
    const r = i % 2 ? 0.16 : 0.38
    if (i === 0) starShape.moveTo(Math.cos(a) * r, -Math.sin(a) * r)
    else starShape.lineTo(Math.cos(a) * r, -Math.sin(a) * r)
  }
  const star = new Mesh(new ExtrudeGeometry(starShape, { depth: 0.12, bevelEnabled: false }), new MeshStandardMaterial({ color: '#fff3b0', emissive: '#ffcc33', emissiveIntensity: 1.4, metalness: 0.6 }))
  star.position.set(0, 0.05, 0.12)
  shield.add(star)

  // Squad: the player in the middle, up to four teammates (the lobby team, NET.teamMax - 1).
  const squad = []
  // The first teammate stands on the right (clear of the left menu), the second on the left, the
  // third and fourth behind them.
  const spots = [
    [2.1, -0.8, -0.3],
    [-2.1, -0.8, 0.3],
    [3.7, -2.5, -0.45],
    [-3.7, -2.5, 0.45],
  ]
  let spread = 1 // < 1 on narrow screens: teammates stand closer so the player list on the right does not hide them
  let playerAvatar = null
  const playerGroup = new Group()
  scene.add(playerGroup)
  let playerActor = null
  // mates: [{ outfit, primary, secondary }] for the other players shown (at most 4).
  let mates = []
  function rebuildSquad(loadout, nextMates = mates) {
    mates = nextMates || []
    for (const a of squad) a.dispose()
    squad.length = 0
    spots.slice(0, mates.length).forEach(([x, z, yaw], i) => {
      const m = mates[i]
      const a = new Actor({ name: '', team: 'blue', noTag: true, outfit: m.outfit || randomOutfit(), scene, loadout: { primary: m.primary || 'striker', secondary: m.secondary || 'viper', skins: {} } })
      a.addToScene(scene)
      a.pos.set(x * spread, 0.32, z)
      a.facing = yaw
      a.ready = 0.2
      a.grounded = true
      squad.push(a)
    })
    if (playerAvatar) setPlayerAvatar(playerAvatar, loadout)
  }
  // Another player's Bloxity look on platform spot i (avatar/look.js).
  function setMateAvatar(i, root) {
    const a = squad[i]
    if (!a || !root) return
    const old = a.avatar
    a.setAvatar(root)
    a.refreshHeld()
    if (old && old !== root) disposeLook(old) // a previous kit outfit gives itself back
  }
  function setPlayerAvatar(avatar, loadout) {
    playerAvatar = avatar
    if (playerActor) playerActor.dispose()
    playerActor = new Actor({ name: '', team: 'blue', isPlayer: true, outfit: randomOutfit(), scene, avatar, loadout })
    playerActor.addToScene(scene)
    playerActor.pos.set(0, 0.32, 0.4)
    playerActor.facing = 0
    playerActor.ready = 0.2
  }

  let t = 0
  const aim = new Vector3()
  const anchor = new Vector3()
  return {
    scene,
    camera,
    rebuildSquad,
    setMateAvatar,
    setPlayerAvatar,
    // Screen positions (px) over the heads of [the player, ...the platform's mates] for the name
    // plates (party.js placePlates). `on` = in front of the camera.
    anchors() {
      const w = window.innerWidth
      const h = window.innerHeight
      const out = []
      for (const a of playerActor ? [playerActor, ...squad] : squad) {
        anchor.set(a.pos.x, a.pos.y + 2.0, a.pos.z).project(camera)
        out.push({ x: (anchor.x * 0.5 + 0.5) * w, y: (-anchor.y * 0.5 + 0.5) * h, on: anchor.z < 1 })
      }
      return out
    },
    get playerActor() {
      return playerActor
    },
    // The player's avatar root, so the match can borrow it.
    releasePlayer() {
      if (playerActor) {
        playerActor.dispose()
        playerActor = null
      }
    },
    setRank(rankIndex) {
      shieldMat.color.set(RANKS[rankIndex]?.color ?? '#cd7f32')
    },
    resize(w, h) {
      camera.aspect = w / h
      // Narrow screens: step back so the squad still fits.
      const narrow = w / h < 1.2
      spread = narrow ? 0.7 : 1
      squad.forEach((a, i) => a.pos.set(spots[i][0] * spread, 0.32, spots[i][1]))
      camera.position.set(0, narrow ? 2.3 : 1.95, narrow ? 11 : 6.6)
      camera.fov = narrow ? 52 : 46
      // Portrait phones: the menu fills the left side, so the scene slides right and the player
      // stands beside it instead of behind it (the name plates follow through project()).
      const shift = w / h < 0.8 ? Math.round(w * 0.15) : 0
      if (shift) camera.setViewOffset(w, h, -shift, 0, w, h)
      else camera.clearViewOffset()
      camera.updateProjectionMatrix()
    },
    update(dt) {
      t += dt
      camera.position.x = Math.sin(t * 0.25) * 0.35
      camera.lookAt(look)
      shield.rotation.y = t * 0.8
      shield.position.y = 2.3 + Math.sin(t * 1.6) * 0.08
      innerRing.material.emissiveIntensity = 2 + Math.sin(t * 3) * 0.6
      const all = playerActor ? [playerActor, ...squad] : squad
      for (const a of all) {
        aim.set(Math.sin(a.facing) * 0.9, -0.42, Math.cos(a.facing) * 0.9).normalize()
        a.updateModel(dt, aim, 0)
      }
    },
  }
}
