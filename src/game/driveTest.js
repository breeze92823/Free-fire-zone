// Test Drive (the lobby's TEST DRIVE button): an offline drive on Dustline Ridge with the Jeep and the
// Dune Buggy parked in West Camp's vehicle bay. A card at the top walks through four steps (get in,
// drive 300 m, reach 70 km/h, try the other vehicle) and then leaves the player to explore; EXIT goes
// back to the lobby. Nothing talks to the server. main.js owns entering / leaving (G.test + G.drive),
// like the Weapon Test range, and runs updateDriveTest every frame.
import { Vector3 } from 'three'
import './testRange.css'
import { DRIVE, VEHICLES } from '../config.js'
import * as bloxity from '../bloxity.js'
import { sfx } from '../audio/index.js'
import { G } from './state.js'
import { Actor } from './actor.js'
import { randomOutfit } from './characters.js'
import { getZone, kit } from './match.js'
import { profile } from './save.js'
import { clearVehicles, myVehicle, spawnVehicle, vehicles } from './vehicles.js'
import * as fx from './fx.js'

const BADGE = '<svg viewBox="0 0 48 48"><rect x="4" y="16" width="40" height="16" rx="5" fill="#5f6b3a" stroke="#1d2210" stroke-width="2"/><path d="M12 16l5-8h14l5 8" fill="#7d8a50" stroke="#1d2210" stroke-width="2"/><circle cx="14" cy="34" r="6" fill="#1c1d20" stroke="#ffc23a" stroke-width="2"/><circle cx="34" cy="34" r="6" fill="#1c1d20" stroke="#ffc23a" stroke-width="2"/><rect x="38" y="20" width="6" height="4" rx="1" fill="#fff6d8"/></svg>'
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const tmp = new Vector3()

let S = null
let ui = null
let offAreas = null

function steps() {
  const touch = document.body.classList.contains('touch-ui')
  const keys = touch ? 'the <b>left stick</b> drives and steers, hold <b>BRAKE</b> to slide' : '<b>W / S</b> drive and brake, <b>A / D</b> steer, <b>Space</b> handbrake'
  return [
    {
      title: 'Get in',
      text: `Walk into the vehicle bay and ${touch ? 'tap <b>Drive</b>' : 'press <b>E</b>'} beside the Jeep or the Dune Buggy.`,
      need: 1,
      update: () => {
        const v = myVehicle()
        if (v) S.first = v.type
        return v ? 1 : 0
      },
    },
    {
      title: 'Hit the road',
      text: `Drive 300 m: ${keys}.`,
      need: 300,
      update: (dt) => {
        const v = myVehicle()
        if (v) S.dist += Math.abs(v.speed) * dt
        return S.dist
      },
    },
    {
      title: 'Full speed',
      text: 'Reach <b>70 km/h</b>. The main road east to the town is long and straight.',
      need: 70,
      update: () => Math.max(S.progress, Math.abs(myVehicle()?.speed ?? 0) * 3.6),
    },
    {
      // Text filled in when the step starts (paint): the vehicle not tried yet.
      title: 'Try the other one',
      other: true,
      text: '',
      need: 1,
      update: () => {
        const v = myVehicle()
        return v && v.type !== S.first ? 1 : 0
      },
    },
  ]
}

// Builds the test: the player actor, the vehicles, the card. Returns the player and its start pose.
export function startDrive({ playerName, playerAvatar, playerPortrait, onExit }) {
  const lo = { primary: profile.loadout?.primary || 'striker', secondary: profile.loadout?.secondary || 'viper', melee: profile.loadout?.melee || 'knife', grenade: profile.loadout?.grenade || 'frag' }
  G.actors = []
  const player = new Actor({ name: playerName, team: 'blue', isPlayer: true, outfit: randomOutfit(), operative: profile.loadout?.operative, loadout: lo, avatar: playerAvatar })
  player.portrait = playerPortrait
  player.offline = true
  G.actors.push(player)
  G.player = player
  player.addToScene(G.scene)
  G.match = {
    mode: { name: 'Test Drive', desc: 'Offline practice', duration: 1e6, scoreToWin: 0 },
    modeId: 'drive',
    map: { name: 'Dustline Ridge' },
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
  player.life = 'alive'
  player.hp = player.maxHp
  for (const s of DRIVE.test.vehicles) spawnVehicle(s.type, s.x, s.z, s.yaw)
  S = { steps: steps(), i: 0, progress: 0, dist: 0, nextT: 0, onExit, tagHtml: '' }
  buildUi(onExit)
  paint()
  return { player, ...startPose() }
}

export function startPose() {
  const [x, z] = DRIVE.test.spawn
  return { pos: new Vector3(x, (G.island?.groundHeight(x, z) ?? 0) + 0.15, z), facing: DRIVE.test.facing }
}

export function updateDriveTest(dt, camera) {
  if (!S) return
  const st = S.steps[S.i]
  if (st) {
    S.progress = st.update(dt)
    if (S.nextT <= 0 && S.progress >= st.need) {
      S.nextT = 1.1
      const ok = ui.querySelector('.tr-ok')
      ok.classList.remove('show')
      void ok.offsetWidth
      ok.classList.add('show')
      sfx.equip?.()
      fx.ring?.(G.player.pos, 0.4, 2.4, 0.6, '#ffd84a')
    }
    if (S.nextT > 0) {
      S.nextT -= dt
      if (S.nextT <= 0) {
        S.i++
        S.progress = 0
        if (S.i >= S.steps.length) sfx.purchase?.()
        paint()
      }
    }
    paintBar()
  }
  S.layoutT = (S.layoutT ?? 0) - dt
  if (S.layoutT <= 0) {
    S.layoutT = 0.5 // the screen may have turned or been resized
    placeCard(ui.querySelector('.tr-card'))
  }
  paintTags(camera)
}

export function endDrive() {
  if (!S) return
  clearVehicles()
  offAreas?.()
  offAreas = null
  ui?.remove()
  ui = null
  S = null
}

export const drivingTest = () => !!S

// --- Card + labels (the Weapon Test range's look, testRange.css) ------------------------------------
function buildUi(onExit) {
  ui = document.createElement('div')
  ui.className = 'tr'
  ui.innerHTML = `<div class="tr-card"><div class="tr-ic">${BADGE}</div><div class="tr-b"><div class="tr-step o"></div><div class="tr-title o"></div><div class="tr-text"></div><div class="tr-bar"><i></i></div></div><button class="tr-exit o">EXIT</button></div><div class="tr-tags"></div><div class="tr-ok o">OK!</div>`
  document.body.appendChild(ui)
  ui.querySelector('.tr-exit').addEventListener('click', () => onExit())
  const card = ui.querySelector('.tr-card')
  offAreas = bloxity.onReservedAreas((areas) => {
    S.areas = areas
    placeCard(card)
  })
  placeCard(card)
}

// Below the platform toolbar when they would overlap, and below the minimap on a narrow screen
// (the Test Drive keeps the minimap, unlike the Weapon Test).
function placeCard(card) {
  if (!S) return
  const w = window.innerWidth
  const cw = Math.min(480, w - 24)
  const left = (w - cw) / 2
  let top = 8
  for (const a of S.areas || []) if (a.top < 20 && a.left + a.width > left) top = Math.max(top, a.top + a.height + 6)
  const mini = document.querySelector('.hud-minimap-wrap')?.getBoundingClientRect()
  if (mini && mini.width > 0 && mini.left < left + cw && mini.top < top + 40) top = Math.max(top, mini.bottom + 6)
  if (top !== S.cardTop) {
    S.cardTop = top
    card.style.setProperty('--tr-top', `${top}px`)
  }
}

function paint() {
  const st = S.steps[S.i]
  const done = S.i >= S.steps.length
  ui.querySelector('.tr-step').textContent = done ? 'Free drive' : `Step ${S.i + 1}/${S.steps.length}`
  let title = st?.title
  let text = st?.text
  if (st?.other) {
    const other = S.first === 'buggy' ? 'jeep' : 'buggy'
    const touch = document.body.classList.contains('touch-ui')
    title = `Try the ${VEHICLES[other].name}`
    text = `${touch ? 'Tap <b>Get out</b>' : 'Press <b>E</b> to get out'}, then take the ${esc(VEHICLES[other].name)} (marked; it waits in the West Camp bay): ${other === 'buggy' ? 'lighter, faster, rear-wheel drive, slides on the handbrake' : 'heavier, four-wheel drive, climbs anything'}.`
  }
  ui.querySelector('.tr-title').textContent = done ? 'All done!' : title
  ui.querySelector('.tr-text').innerHTML = done ? 'Explore <b>Dustline Ridge</b>: the town, the quarry, Radio Mesa, the depot. Press EXIT to go back to the lobby.' : text
  ui.classList.toggle('done', done)
}
function paintBar() {
  const st = S.steps[S.i]
  const k = st ? Math.min(1, S.progress / st.need) : 1
  ui.querySelector('.tr-bar i').style.width = `${Math.round(k * 100)}%`
}

// Labels over the parked vehicles (not the one the player sits in), only while near enough to matter.
function paintTags(camera) {
  const box = ui.querySelector('.tr-tags')
  const w = window.innerWidth
  const hgt = window.innerHeight
  const want = S.i === 3 ? (S.first === 'buggy' ? 'jeep' : 'buggy') : null
  let html = ''
  for (const v of vehicles) {
    if (v === myVehicle()) continue
    tmp.copy(v.model.position)
    const d = tmp.distanceTo(G.player.pos)
    if (d > 120 || (want && v.type !== want && d > 14)) continue
    tmp.y += 2.2
    tmp.project(camera)
    if (tmp.z > 1 || Math.abs(tmp.x) > 1.2 || Math.abs(tmp.y) > 1.2) continue
    const label = `${esc(VEHICLES[v.type].name)}${d > 12 ? ` · ${Math.round(d)} m` : ''}`
    html += `<div class="tr-tag ${v.type === want ? 'say' : ''} o" style="left:${Math.round(((tmp.x + 1) / 2) * w)}px;top:${Math.round(((1 - tmp.y) / 2) * hgt)}px">${label}</div>`
  }
  if (html !== S.tagHtml) {
    box.innerHTML = html
    S.tagHtml = html
  }
}
