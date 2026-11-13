// One character in a match: the local player or a bot. Holds the gameplay
// state (health, armour, life, weapons, utility, stats), the visual model
// (blocky avatar + animator + held/back weapons + name tag) and the hitboxes
// (a body capsule and a head sphere, laid flat while knocked down).
// Movement lives elsewhere (player.js for the player, bots.js for bots); each
// frame they copy their interpolated feet position into `actor.pos`.
import { CanvasTexture, Group, Object3D, Sprite, SpriteMaterial, SRGBColorSpace, Vector3 } from 'three'
import { HEALTH, ITEMS, OPERATIVES, PLAYER_DIMS, SKINS, TEAMS, WEAPONS, WEAPON_SCALE } from '../config.js'
import { makeAnimator, disposeAnimator } from '../avatar/animator.js'
import { bakeWeapon } from './merge.js'
import { buildCharacter, setFlash, setOpacity } from './characters.js'
import { buildGrenade, buildWeapon } from './weaponModels.js'
import { G } from './state.js'
import { disposeLook } from '../avatar/look.js'

const tmpA = new Vector3()
const tmpB = new Vector3()
const tmpC = new Vector3()
const UP = new Vector3(0, 1, 0)

// Weapon model, merged to one mesh per material, keeping the muzzle/ejector markers.
const weaponCache = new Map()
function weaponMesh(id, skin) {
  const def = WEAPONS[id]
  const key = `${def.model}:${skin}`
  let proto = weaponCache.get(key)
  if (!proto) {
    const raw = buildWeapon(def.model, skin)
    const baked = bakeWeapon(raw, { metal: !!SKINS[skin]?.metal })
    const muzzle = new Object3D()
    muzzle.position.copy(raw.userData.muzzle.position)
    const ejector = new Object3D()
    ejector.position.copy(raw.userData.ejector.position)
    baked.add(muzzle, ejector)
    baked.userData = { muzzleIndex: baked.children.length - 2, ejectorIndex: baked.children.length - 1, length: raw.userData.length }
    proto = baked
    weaponCache.set(key, proto)
  }
  const g = proto.clone()
  g.scale.setScalar(WEAPON_SCALE) // chunky, readable guns on blocky characters
  g.userData = { ...proto.userData }
  g.userData.muzzle = g.children[proto.userData.muzzleIndex]
  g.userData.ejector = g.children[proto.userData.ejectorIndex]
  g.traverse((n) => {
    if (n.isMesh) n.castShadow = true
  })
  return g
}

let nextId = 1

export class Actor {
  // opts: { name, team, isPlayer, outfit, loadout: { primary, secondary, skins }, operative, avatar? }
  constructor(opts) {
    this.id = nextId++
    this.name = opts.name
    this.team = opts.team
    this.isPlayer = !!opts.isPlayer
    this.scene = opts.scene || null // where the held weapon lives (defaults to the game scene)
    this.outfit = opts.outfit
    this.operative = opts.operative || 'rook'
    this.bot = null // set by bots.js

    // Gameplay state
    this.hp = HEALTH.max
    this.maxHp = HEALTH.max
    this.vest = 0
    this.helmet = 0
    this.vestDur = 0
    this.helmetDur = 0
    this.life = 'alive'
    this.downHp = 0
    this.lastHitBy = null
    this.lastDamageAt = -99
    this.protectedUntil = 0
    this.respawnAt = 0
    this.revivedBy = null
    this.reviveProgress = 0

    this.pos = new Vector3()
    this.vel = new Vector3()
    this.impulse = new Vector3() // knockback, consumed by the mover
    this.facing = 0
    this.pitch = 0
    this.crouch = false
    this.grounded = true
    this.aiming = false
    this.ready = 0 // weapon raised (aiming or recently fired)
    this.lastShotAt = -99
    this.aimPoint = new Vector3()

    // Weapons: 0 primary, 1 secondary, 2 knife, 3 fists
    const lo = opts.loadout || {}
    const skins = lo.skins || {}
    this.slots = [lo.primary || 'striker', lo.secondary || 'viper', 'knife', 'fists'].map((id) => {
      const def = WEAPONS[id]
      return { id, def, ammo: def.mag ?? 0, reserve: def.reserve ?? 0, skin: skins[id] || 'standard' }
    })
    this.slot = 0
    this.fireCooldown = 0
    this.reloadT = -1 // seconds into a reload, -1 = none
    this.swingT = -1
    this.swingSide = 0
    this.throwT = -1
    this.throwKind = null
    this.healT = -1
    this.emote = null
    this.emoteT = 0
    this.kick = 0
    this.spreadBloom = 0

    // Utility
    this.items = { frostWall: ITEMS.frostWall.start, frag: ITEMS.frag.start, medkit: ITEMS.medkit.start }
    this.dashReadyAt = 0
    this.ult = 0
    this.ultActiveUntil = 0
    this.cloakUntil = 0

    // Stats
    this.stats = { eliminations: 0, knocks: 0, deaths: 0, damage: 0, assists: 0, headshots: 0 }
    this.streak = 0
    this.lastElimAt = -99
    this.damagers = new Map() // attacker id -> time (for assists)

    // Visual
    this.group = new Group()
    this.group.name = `actor:${this.name}`
    this.avatar = null
    this.animator = null
    this.weaponModels = []
    this.backModel = null
    this.heldModel = null
    this.grenadeModel = buildGrenade('frag')
    this.grenadeModel.visible = false
    this.flash = 0
    this.nameTag = null
    this.tagState = ''
    this.hidden = false
    this.opacity = 1
    this.setAvatar(opts.avatar || buildCharacter(this.outfit, this.team))
    this.buildWeapons()
    if (!this.isPlayer && !opts.noTag) this.makeNameTag()
  }

  get def() {
    return this.slots[this.slot].def
  }
  get weapon() {
    return this.slots[this.slot]
  }
  get alive() {
    return this.life === 'alive'
  }
  get operativeDef() {
    return OPERATIVES[this.operative] || OPERATIVES.rook
  }

  // --- Visual setup --------------------------------------------------------------
  setAvatar(root) {
    if (this.avatar) this.group.remove(this.avatar)
    disposeAnimator(this.animator)
    this.avatar = root
    this.group.add(root)
    this.animator = makeAnimator(root)
    const n = root.nodes || {}
    this.armR2 = n.ArmR2 || n.ArmR1
    let leaf = n.ArmR2_leaf
    if (!leaf && this.armR2) {
      leaf = new Object3D()
      leaf.name = 'ArmR2_leaf_gen'
      leaf.position.set(0, n.ArmR2 ? -1.15 : -2.3, 0)
      this.armR2.add(leaf)
      if (root.nodes) root.nodes.ArmR2_leaf = leaf
    }
    this.hand = leaf
    this.opacity = 1
  }

  buildWeapons() {
    for (const m of this.weaponModels) m?.removeFromParent()
    this.weaponModels = this.slots.map((s) => (s.def.model === 'fists' ? null : weaponMesh(s.id, s.skin)))
    if (this.backModel) this.backModel.removeFromParent()
    // The weapon not in hand rides on the back (primary or secondary).
    this.backModel = new Group()
    this.group.add(this.backModel)
    this.refreshHeld()
  }

  refreshHeld() {
    for (const m of this.weaponModels) {
      if (m) m.removeFromParent()
    }
    this.backModel.clear()
    const held = this.weaponModels[this.slot]
    this.heldModel = held
    const scene = this.scene || G.scene
    if (held) scene?.add(held)
    // Back: the other gun (if the held one is a gun) or the primary.
    const backSlot = this.slot === 0 ? 1 : 0
    const back = this.weaponModels[backSlot]
    if (back && this.slot !== backSlot) {
      back.position.set(0.12, 1.12, -0.3)
      back.rotation.set(0.15, Math.PI, 0.9)
      this.backModel.add(back)
    }
    if (scene && !this.grenadeModel.parent) scene.add(this.grenadeModel)
  }

  addToScene(scene) {
    scene.add(this.group)
    if (this.heldModel) scene.add(this.heldModel)
    scene.add(this.grenadeModel)
  }
  removeFromScene() {
    this.group.removeFromParent()
    this.heldModel?.removeFromParent()
    this.grenadeModel.removeFromParent()
  }

  makeNameTag() {
    const c = document.createElement('canvas')
    c.width = 256
    c.height = 72
    const t = new CanvasTexture(c)
    t.colorSpace = SRGBColorSpace
    const s = new Sprite(new SpriteMaterial({ map: t, transparent: true, depthWrite: false, depthTest: false, fog: false }))
    s.renderOrder = 10
    s.scale.set(2.3, 0.65, 1)
    s.position.y = 2.4
    s.userData = { canvas: c, tex: t }
    this.nameTag = s
    this.group.add(s)
    this.drawTag()
  }

  drawTag() {
    if (!this.nameTag) return
    const hpK = this.life === 'knocked' ? this.downHp / HEALTH.knockedHp : this.hp / this.maxHp
    const key = `${this.life}|${Math.round(hpK * 40)}|${this.vest}|${this.helmet}`
    if (key === this.tagState) return
    this.tagState = key
    const { canvas: c, tex } = this.nameTag.userData
    const g = c.getContext('2d')
    g.clearRect(0, 0, c.width, c.height)
    const team = TEAMS[this.team]
    const friendly = G.player && G.player.team === this.team
    g.font = '600 30px Fredoka, Arial, sans-serif'
    g.textAlign = 'center'
    g.lineWidth = 6
    g.strokeStyle = 'rgba(0,0,0,0.75)'
    g.fillStyle = friendly ? team.tag : '#ff6b6b'
    g.strokeText(this.name, 128, 30)
    g.fillText(this.name, 128, 30)
    // Health bar
    const w = 150
    const x = 128 - w / 2
    g.fillStyle = 'rgba(0,0,0,0.6)'
    g.fillRect(x - 3, 42, w + 6, 16)
    g.fillStyle = this.life === 'knocked' ? '#ff3b3b' : friendly ? '#5fd3ff' : '#ff5148'
    g.fillRect(x, 45, w * Math.max(0, Math.min(1, hpK)), 10)
    if (this.vest > 0) {
      g.fillStyle = '#ffd34d'
      g.fillRect(x, 45, 4 * this.vest, 10)
    }
    tex.needsUpdate = true
  }

  // --- Hitboxes ---------------------------------------------------------------------
  // Returns { t, head } for the closest hit along the ray within maxDist, or null.
  hitTest(o, d, maxDist) {
    if (this.life === 'dead' || this.hidden) return null
    const p = this.pos
    let best = null
    if (this.life === 'knocked') {
      const fx = Math.sin(this.facing)
      const fz = Math.cos(this.facing)
      tmpA.set(p.x + fx * 0.1, p.y + 0.25, p.z + fz * 0.1)
      tmpB.set(p.x + fx * 1.25, p.y + 0.25, p.z + fz * 1.25)
      const tb = rayCapsule(o, d, tmpA, tmpB, 0.32)
      if (tb !== null && tb <= maxDist) best = { t: tb, head: false }
      tmpC.set(p.x + fx * 1.55, p.y + 0.25, p.z + fz * 1.55)
      const th = raySphere(o, d, tmpC, 0.25)
      if (th !== null && th <= maxDist && (!best || th < best.t)) best = { t: th, head: true }
      return best
    }
    const drop = this.crouch ? 0.25 : 0
    tmpA.set(p.x, p.y + 0.35, p.z)
    tmpB.set(p.x, p.y + 1.18 - drop, p.z)
    const tb = rayCapsule(o, d, tmpA, tmpB, 0.42)
    if (tb !== null && tb <= maxDist) best = { t: tb, head: false }
    tmpC.set(p.x, p.y + 1.58 - drop, p.z)
    const th = raySphere(o, d, tmpC, 0.25)
    if (th !== null && th <= maxDist && (!best || th < best.t + 0.05)) best = { t: th, head: true }
    return best
  }

  // World points used by AI, cameras and line-of-sight checks.
  eye(out = new Vector3()) {
    const h = this.life === 'knocked' ? 0.45 : this.crouch ? 1.3 : 1.58
    return out.set(this.pos.x, this.pos.y + h, this.pos.z)
  }
  chest(out = new Vector3()) {
    const h = this.life === 'knocked' ? 0.3 : this.crouch ? 0.85 : 1.05
    return out.set(this.pos.x, this.pos.y + h, this.pos.z)
  }
  head(out = new Vector3()) {
    if (this.life === 'knocked') return out.set(this.pos.x + Math.sin(this.facing) * 1.55, this.pos.y + 0.25, this.pos.z + Math.cos(this.facing) * 1.55)
    return out.set(this.pos.x, this.pos.y + (this.crouch ? 1.33 : 1.58), this.pos.z)
  }

  // --- Per frame ---------------------------------------------------------------------
  // aimDir: unit world direction the weapon points at (from the hand) when raised.
  updateModel(dt, aimDir, speed) {
    const g = this.group
    g.position.copy(this.pos)
    g.rotation.y = this.facing
    const reloadK = this.reloadT >= 0 && this.def.reload ? this.reloadT / this.def.reload : -1
    const swingDur = this.def.interval || 0.5
    this.animator?.update(dt, {
      grounded: this.grounded,
      speed,
      verticalVelocity: this.vel.y,
      turn: 0,
      hold: this.def.hold,
      pitch: this.pitch,
      ready: this.ready,
      kick: this.kick,
      reload: reloadK,
      swing: this.swingT >= 0 ? this.swingT / Math.min(0.45, swingDur) : -1,
      swingSide: this.swingSide,
      throwing: this.throwT >= 0 ? this.throwT / 0.55 : -1,
      crouch: this.crouch,
      life: this.life,
      emote: this.emote,
      emoteTime: this.emoteT,
    })
    this.kick = Math.max(0, this.kick - dt * 9)

    // Held weapon: grip in the right hand, pointing along the aim (raised) or the forearm (lowered).
    const held = this.heldModel
    const showHeld = held && this.life === 'alive' && !this.emote && this.throwT < 0 && !this.hidden
    if (held) held.visible = !!showHeld
    this.backModel.visible = this.life !== 'dead' && !this.hidden
    if (showHeld && this.hand) {
      this.avatar.updateMatrixWorld(true)
      this.hand.getWorldPosition(tmpA)
      this.armR2.getWorldPosition(tmpB)
      tmpC.subVectors(tmpA, tmpB).normalize() // forearm direction
      if (this.def.hold === 'melee') {
        tmpB.copy(tmpC).lerp(UP, 0.25).normalize()
      } else {
        // Lowered: carried across the chest, muzzle forward-left and down; raised: along the aim.
        const w = this.reloadT >= 0 ? 0.4 : this.ready
        const f = this.facing + (this.def.hold === 'pistol' ? 0.25 : 0.62)
        tmpB.set(Math.sin(f), -0.42, Math.cos(f)).normalize().lerp(aimDir, w).normalize()
      }
      held.position.copy(tmpA).addScaledVector(tmpB, -0.02)
      held.position.y -= 0.03
      tmpC.copy(held.position).add(tmpB)
      held.lookAt(tmpC)
      if (this.reloadT >= 0) held.rotateZ(Math.sin(Math.min(1, this.reloadT / (this.def.reload || 1)) * Math.PI) * 0.6)
    }
    // Grenade in hand while throwing.
    const gm = this.grenadeModel
    gm.visible = this.throwT >= 0 && this.throwT < 0.45 && this.life === 'alive'
    if (gm.visible && this.hand) {
      this.hand.getWorldPosition(gm.position)
    }

    // Hit flash fades.
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 6)
      setFlash(this.avatar, this.flash)
    }
    // Cloak / spawn shimmer / hidden.
    let want = 1
    if (this.hidden) want = 0
    else if (G.time < this.cloakUntil) want = this.isPlayer || (G.player && G.player.team === this.team) ? 0.35 : 0.08
    else if (G.time < this.protectedUntil) want = 0.55 + 0.25 * Math.sin(G.time * 18)
    if (Math.abs(want - this.opacity) > 0.02) {
      this.opacity = want
      setOpacity(this.avatar, want)
      if (held) held.visible = held.visible && want > 0.2
    }
    this.group.visible = want > 0.001
    if (this.nameTag) {
      // Teammates' tags show through walls; enemies' only in plain sight and within range.
      // Close up the tag shrinks with distance so it never fills the screen.
      const cam = G.camera
      const d = cam ? cam.position.distanceTo(this.group.position) : 20
      const friendly = G.player && G.player.team === this.team
      const tag = this.nameTag
      tag.visible = this.life !== 'dead' && !this.hidden && G.phase !== 'results' && (friendly || d < 45)
      tag.material.depthTest = !friendly
      const k = Math.min(1, Math.max(0.25, d / 9))
      tag.scale.set(2.3 * k, 0.65 * k, 1)
      if (tag.visible) this.drawTag()
      tag.position.y = this.life === 'knocked' ? 0.9 : 2.4
    }
  }

  hitFlash() {
    this.flash = 1
    setFlash(this.avatar, 1)
  }

  dispose() {
    this.removeFromScene()
    disposeAnimator(this.animator)
    if (this.isPlayer) return // the player's avatar is reused by the lobby and the next match
    disposeLook(this.avatar) // a kit-dressed rig gives its outfit back
    // Bots own their merged meshes, outfit textures and name tag: free them (weapons are shared).
    this.avatar.traverse((n) => {
      if (n.isMesh && n.userData.ownGeometry) n.geometry.dispose()
    })
    for (const m of this.avatar.userData.mats || []) {
      m.map?.dispose()
      m.dispose()
    }
    if (this.nameTag) {
      this.nameTag.userData.tex.dispose()
      this.nameTag.material.dispose()
    }
  }
}

// --- Ray math -------------------------------------------------------------------------
// Distance along a unit ray to a sphere, or null.
export function raySphere(o, d, c, r) {
  const ox = o.x - c.x
  const oy = o.y - c.y
  const oz = o.z - c.z
  const b = ox * d.x + oy * d.y + oz * d.z
  const cc = ox * ox + oy * oy + oz * oz - r * r
  const h = b * b - cc
  if (h < 0) return null
  const t = -b - Math.sqrt(h)
  if (t >= 0) return t
  return cc <= 0 ? 0 : null
}

// Distance along a unit ray to a capsule a-b radius r, or null.
export function rayCapsule(o, d, a, b, r) {
  const bax = b.x - a.x
  const bay = b.y - a.y
  const baz = b.z - a.z
  const oax = o.x - a.x
  const oay = o.y - a.y
  const oaz = o.z - a.z
  const baba = bax * bax + bay * bay + baz * baz
  const bard = bax * d.x + bay * d.y + baz * d.z
  const baoa = bax * oax + bay * oay + baz * oaz
  const rdoa = d.x * oax + d.y * oay + d.z * oaz
  const oaoa = oax * oax + oay * oay + oaz * oaz
  const a2 = baba - bard * bard
  let b2 = baba * rdoa - baoa * bard
  let c2 = baba * oaoa - baoa * baoa - r * r * baba
  let h = b2 * b2 - a2 * c2
  if (h >= 0) {
    const t = (-b2 - Math.sqrt(h)) / a2
    const y = baoa + t * bard
    if (y > 0 && y < baba && t >= 0) return t
    // caps
    const ocx = y <= 0 ? oax : o.x - b.x
    const ocy = y <= 0 ? oay : o.y - b.y
    const ocz = y <= 0 ? oaz : o.z - b.z
    b2 = d.x * ocx + d.y * ocy + d.z * ocz
    c2 = ocx * ocx + ocy * ocy + ocz * ocz - r * r
    h = b2 * b2 - c2
    if (h > 0) {
      const tc = -b2 - Math.sqrt(h)
      if (tc >= 0) return tc
    }
  }
  return null
}

export const CAPSULE = PLAYER_DIMS
