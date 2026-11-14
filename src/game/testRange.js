// The Weapon Test range (the Weapons Store's TEST button): an offline practice field out at sea,
// east of nothing and north of the island, where the player tries any weapon or grenade before
// buying it. An instructor stands beside the player and demonstrates; a card at the top walks
// through three steps that fit the weapon (guns: hit, headshot, take down a moving target; the
// blade: strike, run, take down; the medic pistol: heal an ally, heal a knocked ally, sting an
// enemy; grenades: hit, catch two, take down). EXIT (or the portal once done) returns to the store.
//
// Nothing here talks to the server: the dummies have no netId, so combat.js hands their hits to
// `onLocalHit` (setLocalHits) and the damage is worked out here with the same numbers the server
// uses. No rewards are granted. main.js runs the frame (G.test) and owns entering / leaving.
import { BoxGeometry, CanvasTexture, CircleGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, RepeatWrapping, SphereGeometry, SRGBColorSpace, TorusGeometry, Vector3 } from 'three'
import './testRange.css'
import { GRENADES, HEALTH, ITEMS, WEAPONS } from '../config.js'
import { RAPIER, addFixed, world } from '../physics.js'
import { sfx, spatial } from '../audio/index.js'
import { G, emit } from './state.js'
import * as bloxity from '../bloxity.js'
import { Actor } from './actor.js'
import { randomOutfit } from './characters.js'
import { damageFalloff, muzzleOf, setLocalHits } from './combat.js'
import { getZone, kit } from './match.js'
import { profile } from './save.js'
import * as fx from './fx.js'

// Out at sea (the water plane is 1400 m wide), far enough from the island's shore.
export const ARENA = { x: 0, z: 420, y: 0.6, r: 38 }
const START = { x: ARENA.x - 2, z: ARENA.z + 14 }
const PORTAL = { x: ARENA.x + 15, z: ARENA.z + 20 }

const tmp = new Vector3()
const tmp2 = new Vector3()
const h = (tag, cls = '', html = '') => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (html) e.innerHTML = html
  return e
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

// --- The field (built once, hidden between tests) ------------------------------------------------
let field = null
let colliders = []
let portalRing = null
function grassTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')
  g.fillStyle = '#4f9a3a'
  g.fillRect(0, 0, 256, 256)
  for (let i = 0; i < 2600; i++) {
    const v = Math.random()
    g.fillStyle = v < 0.5 ? '#5cab43' : v < 0.8 ? '#468c33' : '#6bbb4c'
    g.fillRect(Math.random() * 256, Math.random() * 256, 2, 3 + Math.random() * 3)
  }
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.wrapS = t.wrapT = RepeatWrapping
  t.repeat.set(14, 14)
  return t
}
function buildField(scene) {
  field = new Group()
  field.name = 'test-range'
  const grass = new MeshStandardMaterial({ color: '#ffffff', map: grassTexture(), roughness: 0.95 })
  const cliff = new MeshStandardMaterial({ color: '#8b7a5c', roughness: 0.9 })
  const top = new Mesh(new CircleGeometry(ARENA.r + 2, 64), grass)
  top.rotation.x = -Math.PI / 2
  top.position.set(ARENA.x, ARENA.y, ARENA.z)
  top.receiveShadow = true
  field.add(top)
  const side = new Mesh(new CylinderGeometry(ARENA.r + 2, ARENA.r + 5, 6, 64, 1, true), cliff)
  side.position.set(ARENA.x, ARENA.y - 3.02, ARENA.z)
  field.add(side)
  // Bushes along the rim (they also mark where the invisible wall is).
  const bush = new MeshStandardMaterial({ color: '#2f6a2c', roughness: 0.9 })
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + 0.2
    const s = 0.9 + Math.random() * 0.8
    const b = new Mesh(new SphereGeometry(1, 12, 8), bush)
    b.scale.set(s * 1.4, s, s * 1.4)
    b.position.set(ARENA.x + Math.cos(a) * (ARENA.r + 0.5), ARENA.y + s * 0.5, ARENA.z + Math.sin(a) * (ARENA.r + 0.5))
    b.castShadow = true
    field.add(b)
  }
  // The portal back to the lobby.
  const frame = new MeshStandardMaterial({ color: '#0b1730', roughness: 0.4, metalness: 0.5 })
  const glow = new MeshBasicMaterial({ color: '#7ff4ff', transparent: true, opacity: 0.85 })
  const p = new Group()
  p.position.set(PORTAL.x, ARENA.y, PORTAL.z)
  p.rotation.y = Math.atan2(START.x - PORTAL.x, START.z - PORTAL.z)
  const base = new Mesh(new CylinderGeometry(2.4, 2.6, 0.3, 32), frame)
  base.position.y = 0.15
  p.add(base)
  for (const x of [-1.5, 1.5]) {
    const post = new Mesh(new BoxGeometry(0.45, 3.6, 0.45), frame)
    post.position.set(x, 2, 0)
    p.add(post)
  }
  const lintel = new Mesh(new BoxGeometry(3.8, 0.45, 0.6), frame)
  lintel.position.y = 3.9
  p.add(lintel)
  const sheet = new Mesh(new BoxGeometry(2.6, 3.4, 0.08), glow)
  sheet.position.y = 2
  p.add(sheet)
  portalRing = new Mesh(new TorusGeometry(0.45, 0.09, 10, 28), glow)
  portalRing.position.y = 4.4
  p.add(portalRing)
  field.add(p)
  scene.add(field)
}
function addColliders() {
  if (colliders.length || !world) return
  colliders.push(addFixed(RAPIER.ColliderDesc.cylinder(3, ARENA.r + 2), { x: ARENA.x, y: ARENA.y - 3, z: ARENA.z }))
  // An invisible fence round the rim: nobody falls in the sea.
  const n = 28
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const half = (Math.PI * (ARENA.r + 1)) / n + 0.3
    const q = { x: 0, y: Math.sin(-a / 2), z: 0, w: Math.cos(-a / 2) }
    colliders.push(addFixed(RAPIER.ColliderDesc.cuboid(0.4, 3, half), { x: ARENA.x + Math.cos(a) * (ARENA.r + 1), y: ARENA.y + 2, z: ARENA.z + Math.sin(a) * (ARENA.r + 1) }, q))
  }
}
function removeColliders() {
  for (const c of colliders) world?.removeCollider(c, false)
  colliders = []
}

// --- State ----------------------------------------------------------------------------------------
let S = null // the running test
let ui = null
let offAreas = null

function weaponKind(def) {
  if (!def) return 'grenade'
  if (def.heal) return 'medic'
  if (def.melee) return 'melee'
  return 'gun'
}
// How far the first target stands, by weapon.
function targetRange(def) {
  if (!def) return 14
  if (def.scope) return 40
  if (def.kind === 'shotgun') return 7
  if (def.melee) return 4
  if (def.kind === 'pistol' || def.kind === 'smg' || def.kind === 'medic') return 12
  return 18
}

function makeActor(name, team, weaponId = 'striker', opts = {}) {
  const def = WEAPONS[weaponId]
  const lo = def?.slot === 'secondary' ? { primary: 'striker', secondary: weaponId } : { primary: def?.slot === 'primary' ? weaponId : 'striker', secondary: 'viper' }
  const a = new Actor({ name, team, outfit: randomOutfit(), loadout: lo })
  a.addToScene(G.scene)
  a.slot = Math.max(0, a.slots.findIndex((s) => s.id === weaponId))
  a.refreshHeld()
  a.dummy = true
  // Parked (hidden, not hittable) until a step places it.
  a.hidden = true
  a.untargetable = true
  Object.assign(a, opts)
  G.actors.push(a)
  return a
}
function place(a, x, z, facePoint = null) {
  a.hidden = false
  a.untargetable = !!a.instructor
  a.pos.set(x, ARENA.y + 0.05, z)
  a.vel.set(0, 0, 0)
  if (facePoint) a.facing = Math.atan2(facePoint.x - x, facePoint.z - z)
  a.pitch = 0
}
function revive(a, hp = a.maxHp) {
  a.life = 'alive'
  a.hp = hp
  a.downHp = 0
}

// Points in front of the player (toward -Z), `d` metres away, `side` metres to the side.
const ahead = (d, side = 0) => ({ x: START.x + side, z: START.z - d })

// --- Steps ----------------------------------------------------------------------------------------
// Each step: { title, text, need (count to finish), setup(), update(dt), onHit(t, info, amount), onHeal(t, n), onKill(t) }.
function buildSteps(kind, def, gdef) {
  const R = targetRange(def)
  const name = def ? def.name : gdef.name
  const enemy = () => S.enemies[0]
  const steps = []
  if (kind === 'gun') {
    steps.push({
      title: 'Hit the target',
      text: `Aim at the orange dummy and land 5 hits with the ${esc(name)}.${def.scope ? ' Hold AIM (right click) to look through the scope.' : ''}`,
      need: 5,
      setup() {
        const p = ahead(R)
        place(enemy(), p.x, p.z, START)
        revive(enemy())
        enemy().invulnerable = true
      },
      onHit: () => S.progress++,
    })
    steps.push({
      title: 'Go for the head',
      text: `Headshots hit ${def.headMul}x harder. Land 2 shots on the dummy's head.`,
      need: 2,
      onHit: (t, info) => {
        if (info.h > 0) S.progress++
      },
    })
    steps.push({
      title: 'Take it down',
      text: 'The dummy now moves and has full health (no armour). Eliminate it.',
      need: 1,
      setup() {
        enemy().invulnerable = false
        revive(enemy())
        S.strafe = { x: enemy().pos.x, z: enemy().pos.z, t: 0, w: def.kind === 'shotgun' ? 2.5 : 6 }
      },
      onKill: () => S.progress++,
    })
  } else if (kind === 'melee') {
    steps.push({
      title: 'Strike the dummy',
      text: `Walk up to the dummy and hit it 3 times with the ${esc(name)} (left click / FIRE). Its reach is ${def.range} m.`,
      need: 3,
      setup() {
        const p = ahead(R)
        place(enemy(), p.x, p.z, START)
        revive(enemy())
        enemy().invulnerable = true
      },
      onHit: () => S.progress++,
    })
    steps.push({
      title: 'Feel the speed',
      text: `With the blade out you run ${Math.round(((def.speedMul || 1) - 1) * 100)}% faster. Sprint to the glowing ring.`,
      need: 1,
      setup() {
        S.ring = ahead(26, 10)
        S.ringMesh = new Mesh(new TorusGeometry(1.6, 0.15, 10, 36), new MeshBasicMaterial({ color: '#ffd84a' }))
        S.ringMesh.rotation.x = -Math.PI / 2
        S.ringMesh.position.set(S.ring.x, ARENA.y + 0.15, S.ring.z)
        G.scene.add(S.ringMesh)
      },
      update() {
        const p = G.player.pos
        if (Math.hypot(p.x - S.ring.x, p.z - S.ring.z) < 2) S.progress = 1
      },
      cleanup() {
        S.ringMesh?.removeFromParent()
        S.ringMesh = null
      },
    })
    steps.push({
      title: 'Take it down',
      text: 'The dummy now moves and fights back with nothing. Catch it and eliminate it.',
      need: 1,
      setup() {
        enemy().invulnerable = false
        revive(enemy())
        S.strafe = { x: enemy().pos.x, z: enemy().pos.z, t: 0, w: 3 }
      },
      onKill: () => S.progress++,
    })
  } else if (kind === 'medic') {
    steps.push({
      title: 'Heal your ally',
      text: 'Your ally is hurt (30 HP). Aim at them and keep FIRE held until they are back to 100 HP.',
      need: 70,
      setup() {
        const a = S.allies[0]
        const p = ahead(R, 3)
        place(a, p.x, p.z, START)
        a.maxHp = 100
        revive(a, 30)
      },
      update() {
        S.progress = Math.max(0, S.allies[0].hp - 30)
        S.tag(S.allies[0], `${Math.round(S.allies[0].hp)}/100 HP`, 'hp')
      },
    })
    steps.push({
      title: 'Heal a fallen player',
      text: 'A KNOCKED ally can be healed too: it does not stand them up, but they hold out much longer until someone revives them. Heal them 3 times.',
      need: 3,
      setup() {
        const a = S.allies[1]
        const p = ahead(R + 6, -6)
        place(a, p.x, p.z, START)
        revive(a)
        a.life = 'knocked'
        a.downHp = 30
      },
      update(dt) {
        const a = S.allies[1]
        if (a.life === 'knocked') a.downHp = Math.max(8, a.downHp - HEALTH.bleed * dt * 0.5)
        S.tag(a, `KNOCKED · ${Math.round(a.downHp)}/${HEALTH.knockedHp}`, 'down')
      },
      onHeal: (t) => {
        if (t === S.allies[1]) S.progress++
      },
    })
    steps.push({
      title: 'Sting an enemy',
      text: 'On enemies the Mender only stings. Tag the orange dummy 5 times.',
      need: 5,
      setup() {
        const p = ahead(R, -2)
        place(enemy(), p.x, p.z, START)
        revive(enemy())
        enemy().invulnerable = true
      },
      onHit: (t) => {
        if (t === enemy()) S.progress++
      },
    })
  } else {
    // Grenades
    steps.push({
      title: 'Throw at the target',
      text: `Press T (or the grenade button) to throw the ${esc(name)}. Land the blast on the dummy (radius ${gdef.radius} m, fuse ${gdef.fuse} s).`,
      need: 1,
      setup() {
        const p = ahead(R)
        place(enemy(), p.x, p.z, START)
        revive(enemy())
        enemy().invulnerable = true
      },
      onHit: () => S.progress++,
    })
    steps.push({
      title: 'Catch two at once',
      text: 'Two dummies stand close together. Catch both of them in one blast.',
      need: 1,
      setup() {
        const p = ahead(R + 2)
        place(S.enemies[1], p.x + 1.6, p.z, START)
        place(enemy(), p.x - 1.6, p.z, START)
        revive(S.enemies[1])
        S.enemies[1].invulnerable = true
        S.blast = new Set()
      },
      onHit: (t) => {
        S.blast.add(t)
        clearTimeout(S.blastT)
        S.blastT = setTimeout(() => S.blast?.clear(), 120) // hits of one blast arrive together
        if (S.blast.size >= 2) S.progress = 1
      },
    })
    steps.push({
      title: 'Take it down',
      text: 'The dummy has full health now. Eliminate it with grenades.',
      need: 1,
      setup() {
        S.enemies[1].life = 'dead'
        S.enemies[1].hidden = true
        S.enemies[1].untargetable = true
        enemy().invulnerable = false
        revive(enemy())
      },
      onKill: () => S.progress++,
    })
  }
  return steps
}

// --- Damage from this client's shots (combat.js setLocalHits) -------------------------------------
function onLocalHit(t, info) {
  if (!S || t.life === 'dead') return
  const st = S.steps[S.i]
  const p = G.player
  if (info.heal) {
    if (t.life === 'alive') t.hp = Math.min(t.maxHp, t.hp + info.heal)
    else if (t.life === 'knocked') t.downHp = Math.min(HEALTH.knockedHp, t.downHp + info.heal)
    emit('heal', { target: t, by: p, amount: info.heal })
    st?.onHeal?.(t, info.heal)
    return
  }
  let amount
  if (info.explosive) amount = info.damage
  else {
    const def = WEAPONS[info.weapon]
    if (!def) return
    amount = def.melee ? def.damage : def.damage * damageFalloff(def, info.d) * (info.n - info.h + info.h * def.headMul)
  }
  if (!(amount > 0.5)) return
  t.chest(tmp)
  emit('damage', { target: t, attacker: p, amount, head: info.h > 0, point: tmp.clone(), dir: null, zone: false, explosive: !!info.explosive })
  st?.onHit?.(t, info, amount)
  if (t.invulnerable || t.team === p.team) return
  t.hp -= amount
  if (t.hp <= 0) {
    t.hp = 0
    t.life = 'dead'
    fx.poof?.(t.pos, fx.FX_COLORS.white, 20)
    sfx.elimination?.(1)
    emit('elimination', { target: t, killer: p, weapon: info.explosive ? 'frag' : info.weapon, head: info.h > 0, streak: 1 })
    st?.onKill?.(t)
  }
}

// --- Instructor demo: a few shots (or swings) at the step's target, then "your turn" -------------
function demo() {
  const ins = S.instructor
  const target = S.kind === 'medic' && S.i < 2 ? S.allies[S.i] : S.enemies[0]
  if (!ins || !target || S.kind === 'grenade') return
  ins.facing = Math.atan2(target.pos.x - ins.pos.x, target.pos.z - ins.pos.z)
  S.demoShots = S.kind === 'melee' ? 0 : 3
  S.demoT = 0.4
  S.bubbleT = S.kind === 'melee' ? 0.6 : 1.8
  S.demoTarget = target
}
function demoUpdate(dt) {
  const ins = S.instructor
  if (S.demoShots > 0) {
    S.demoT -= dt
    if (S.demoT <= 0) {
      S.demoT = Math.max(0.25, S.def.interval || 0.4)
      S.demoShots--
      ins.ready = 1
      ins.kick = 1
      ins.lastShotAt = G.time
      const m = muzzleOf(ins, tmp)
      S.demoTarget.chest(tmp2)
      fx.muzzleFlash(m, tmp2.clone().sub(m).normalize(), S.def.kind === 'shotgun' || S.def.kind === 'sniper', true)
      fx.tracer(m, tmp2, S.def.heal ? fx.FX_COLORS.heal : null)
      sfx.shot(S.def.sound || S.def.kind, { ...spatial(m.x, m.y, m.z), own: false })
    }
  }
  if (S.bubbleT > 0) {
    S.bubbleT -= dt
    if (S.bubbleT <= 0) S.bubbleOn = 4
  }
  if (S.bubbleOn > 0) {
    S.bubbleOn -= dt
    S.tag(ins, "Now it's your turn!", 'say')
  }
}

// --- UI -------------------------------------------------------------------------------------------
const BADGE = `<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="21" fill="#1b2232" stroke="#ffb21f" stroke-width="3"/><circle cx="24" cy="19" r="7" fill="#ffd84a"/><path d="M11 38c2-8 7-11 13-11s11 3 13 11" fill="#ffd84a"/><path d="M14 13l10-6 10 6-10 4z" fill="#ffb21f"/></svg>`
function buildUi(onExit) {
  ui = h('div', 'tr')
  ui.innerHTML = `<div class="tr-card"><div class="tr-ic">${BADGE}</div><div class="tr-b"><div class="tr-step o"></div><div class="tr-title o"></div><div class="tr-text"></div><div class="tr-bar"><i></i></div></div><button class="tr-exit o">EXIT</button></div><div class="tr-tags"></div><div class="tr-ok o">OK!</div>`
  document.body.appendChild(ui)
  ui.querySelector('.tr-exit').addEventListener('click', () => onExit())
  // Keep the card clear of the platform toolbar (top-left): below it when they would overlap.
  const card = ui.querySelector('.tr-card')
  offAreas = bloxity.onReservedAreas((areas) => {
    const w = window.innerWidth
    const cw = Math.min(480, w - 24)
    let top = 8
    for (const a of areas) if (a.top < 20 && a.left + a.width > (w - cw) / 2) top = Math.max(top, a.top + a.height + 6)
    card.style.setProperty('--tr-top', `${top}px`)
  })
  return ui
}
function paintCard() {
  const st = S.steps[S.i]
  const done = S.i >= S.steps.length
  ui.querySelector('.tr-step').textContent = done ? 'Done' : `Step ${S.i + 1}/${S.steps.length}`
  ui.querySelector('.tr-title').textContent = done ? 'Test complete!' : st.title
  ui.querySelector('.tr-text').innerHTML = done ? `You tried the <b>${esc(S.name)}</b>. Walk into the portal or press EXIT to go back to the store.` : st.text
  ui.classList.toggle('done', done)
}
function paintBar() {
  const st = S.steps[S.i]
  const k = st ? Math.min(1, S.progress / st.need) : 1
  ui.querySelector('.tr-bar i').style.width = `${Math.round(k * 100)}%`
}
// Floating labels over actors / points, rebuilt every frame from S.tags.
function paintTags(camera) {
  const box = ui.querySelector('.tr-tags')
  const w = window.innerWidth
  const hgt = window.innerHeight
  let html = ''
  for (const t of S.tags) {
    if (t.actor) t.actor.chest(tmp).y += t.actor.life === 'knocked' ? 1 : 1.5
    else tmp.set(t.x, t.y, t.z)
    tmp.project(camera)
    if (tmp.z > 1 || Math.abs(tmp.x) > 1.2 || Math.abs(tmp.y) > 1.2) continue
    html += `<div class="tr-tag ${t.cls} o" style="left:${Math.round(((tmp.x + 1) / 2) * w)}px;top:${Math.round(((1 - tmp.y) / 2) * hgt)}px">${t.text}</div>`
  }
  if (html !== S.tagHtml) {
    box.innerHTML = html
    S.tagHtml = html
  }
}

// --- Public ---------------------------------------------------------------------------------------
// weaponId: a WEAPONS id to test (or null with grenadeId). Builds the field and everyone in it and
// returns the player actor and the start pose; main.js teleports the body there.
export function startTest({ weaponId, grenadeId, playerName, playerAvatar, playerPortrait, onExit }) {
  if (!field) buildField(G.scene)
  field.visible = true
  addColliders()
  const def = weaponId ? WEAPONS[weaponId] : null
  const gdef = GRENADES[grenadeId || profile.loadout?.grenade || 'frag'] ?? GRENADES.frag
  const kind = weaponKind(def)
  const lo = { primary: profile.loadout?.primary || 'striker', secondary: profile.loadout?.secondary || 'viper', grenade: grenadeId || profile.loadout?.grenade || 'frag' }
  if (def?.slot === 'primary') lo.primary = weaponId
  if (def?.slot === 'secondary') lo.secondary = weaponId
  G.actors = []
  const player = new Actor({ name: playerName, team: 'blue', isPlayer: true, outfit: randomOutfit(), operative: profile.loadout?.operative, loadout: lo, avatar: playerAvatar })
  player.portrait = playerPortrait
  player.offline = true
  G.actors.push(player)
  G.player = player
  player.addToScene(G.scene)
  G.match = {
    mode: { name: 'Weapon Test', desc: 'Offline practice', duration: 1e6, scoreToWin: 0 },
    modeId: 'test',
    map: { name: 'Test Range' },
    duration: 1e6,
    score: { blue: 0, orange: 0 },
    zone: getZone(),
    mvp: { blue: null, orange: null },
    drops: () => [],
    winner: null,
    round: 0,
    test: true,
  }
  G.time = 0
  kit(player, true)
  if (kind === 'grenade') player.items.frag = 6
  if (def) player.slot = Math.max(0, player.slots.findIndex((s) => s.id === weaponId))
  player.refreshHeld()
  player.life = 'alive'
  player.hp = player.maxHp

  S = {
    kind,
    def: def || {},
    gdef,
    name: def ? def.name : gdef.name,
    steps: [],
    i: 0,
    progress: 0,
    tags: [],
    tagHtml: '',
    okT: 0,
    nextT: 0,
    spin: 0,
    exitArmed: false,
    onExit,
  }
  S.tag = (actor, text, cls = '') => S.tags.push({ actor, text, cls })
  S.instructor = makeActor('Instructor', 'blue', weaponId || 'striker', { instructor: true })
  place(S.instructor, START.x - 3.2, START.z - 0.6, ahead(30))
  S.enemies = [makeActor('Target', 'orange'), makeActor('Target 2', 'orange')]
  S.enemies[1].life = 'dead'
  S.allies = kind === 'medic' ? [makeActor('Ally', 'blue'), makeActor('Ally 2', 'blue')] : []
  S.steps = buildSteps(kind, def, gdef)
  setLocalHits(onLocalHit)
  buildUi(onExit)
  enterStep()
  return { player, pos: new Vector3(START.x, ARENA.y + 0.05, START.z), facing: Math.PI }
}

function enterStep() {
  S.progress = 0
  const st = S.steps[S.i]
  if (st) {
    st.setup?.()
    demo()
  } else {
    S.strafe = null
    sfx.purchase?.()
  }
  paintCard()
  paintBar()
}

// Per frame while testing (main.js gameFrame).
export function updateTest(dt, camera) {
  if (!S) return
  S.tags.length = 0
  const st = S.steps[S.i]
  // Moving targets: side to side.
  const e = S.enemies[0]
  if (S.strafe && e.life !== 'dead') {
    S.strafe.t += dt
    const x = S.strafe.x + Math.sin(S.strafe.t * 0.9) * S.strafe.w
    e.vel.set((x - e.pos.x) / Math.max(dt, 1e-3), 0, 0)
    e.pos.x = x
    e.facing = Math.atan2(G.player.pos.x - e.pos.x, G.player.pos.z - e.pos.z)
  } else if (e) e.vel.set(0, 0, 0)
  // Enemy dummies face the player; the instructor watches its target.
  for (const a of S.enemies) if (a !== e || !S.strafe) a.facing = Math.atan2(G.player.pos.x - a.pos.x, G.player.pos.z - a.pos.z)
  // A grenade test never runs dry.
  if (S.kind === 'grenade' && G.player.items.frag <= 0) G.player.items.frag = 6
  demoUpdate(dt)
  if (st) {
    st.update?.(dt)
    if (S.kind === 'gun' || S.kind === 'melee' || S.kind === 'grenade') {
      if (st.need > 1) S.tag(S.enemies[0], `${Math.min(S.progress, st.need)}/${st.need}`, 'cnt')
    }
    if (S.nextT <= 0 && S.progress >= st.need) {
      // Step done: OK!, then the next one.
      S.nextT = 1.1
      ui.querySelector('.tr-ok').classList.remove('show')
      void ui.offsetWidth
      ui.querySelector('.tr-ok').classList.add('show')
      sfx.equip?.()
      fx.ring?.(G.player.pos, 0.4, 2.4, 0.6, '#ffd84a')
    }
    if (S.nextT > 0) {
      S.nextT -= dt
      if (S.nextT <= 0) {
        st.cleanup?.()
        S.i++
        enterStep()
      }
    }
    paintBar()
  } else {
    // Done: the portal takes the player back.
    S.tags.push({ x: PORTAL.x, y: ARENA.y + 5.2, z: PORTAL.z, text: '&#8962; Back to the lobby', cls: 'portal' })
    const p = G.player.pos
    if (Math.hypot(p.x - PORTAL.x, p.z - PORTAL.z) < 1.8 && !S.exitArmed) {
      S.exitArmed = true
      S.onExit?.()
      return
    }
  }
  if (portalRing) portalRing.rotation.z += dt * 2
  paintTags(camera)
}

// Fell somehow: back to the start.
export function testStartPose() {
  return { pos: new Vector3(START.x, ARENA.y + 0.05, START.z), facing: Math.PI }
}

// Leaving: the dummies, the UI and the local hit hook go; main.js tears the match (actors) down.
export function endTest() {
  if (!S) return
  S.steps[S.i]?.cleanup?.()
  clearTimeout(S.blastT)
  setLocalHits(null)
  offAreas?.()
  offAreas = null
  ui?.remove()
  ui = null
  if (field) field.visible = false
  removeColliders()
  S = null
}

export const testing = () => !!S
