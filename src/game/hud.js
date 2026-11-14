// The in-match HUD: team score + clock, zone timer, minimap (+ big map on M),
// squad list, kill feed, weapon panel (tap a slot to switch), health and
// armour, item buttons with cooldowns, the operative ability diamond,
// crosshair with spread + hit markers, floating damage numbers, damage
// direction arcs, kill reward popups (Gems / coins / rank points the server granted) and
// multi-kill banners, pickup toasts, the interact prompt, the
// knocked-down overlay, the spectate/revive panel, the scope overlay and the
// scoreboard (Tab). Event-driven where it can be; per-frame writes are cached.
import './hud.css'
import { Vector3 } from 'three'
import { HEALTH, ITEMS, OPERATIVES, TEAMS, WEAPONS } from '../config.js'
import * as bloxity from '../bloxity.js'
import { G, on } from './state.js'
import { SVG, svgData, weaponIcon } from './icons.js'
import { portrait } from './characters.js'

const h = (tag, cls = '', html = '') => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (html) e.innerHTML = html
  return e
}
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

// Multi-kill badge (original art): a hexagonal medal with a reticle, blade fins and one pip per
// elimination in the streak. The colour climbs with the streak.
const STREAK_TIERS = [
  null,
  null,
  { text: 'Double Elimination', c: '#4fe0d0', d: '#0b6f78' },
  { text: 'Triple Elimination', c: '#ffc83d', d: '#9a5a00' },
  { text: 'Quad Elimination', c: '#ff7a2a', d: '#8a2400' },
  { text: 'Rampage!', c: '#ff4d9a', d: '#7a0a44' },
  { text: 'Unstoppable!', c: '#b26bff', d: '#41108a' },
]
const BADGE = (n, c, d) => {
  const pips = Math.min(n, 6)
  let dots = ''
  for (let i = 0; i < pips; i++) {
    const x = 100 + (i - (pips - 1) / 2) * 16
    dots += `<path d="M${x} 122 l6 6 -6 6 -6 -6z" fill="${c}" stroke="#0e1424" stroke-width="2"/>`
  }
  return `<svg viewBox="0 0 200 140" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="ffz-badge" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="0.38" stop-color="${c}"/><stop offset="1" stop-color="${d}"/></linearGradient></defs>
  <path d="M62 44 L6 30 L26 58 L4 70 L28 80 L14 102 L62 86 Z" fill="${d}" stroke="#0e1424" stroke-width="4" stroke-linejoin="round"/>
  <path d="M62 50 L22 40 L36 60 L20 70 L38 76 L28 92 L62 80 Z" fill="${c}" opacity="0.9"/>
  <path d="M138 44 L194 30 L174 58 L196 70 L172 80 L186 102 L138 86 Z" fill="${d}" stroke="#0e1424" stroke-width="4" stroke-linejoin="round"/>
  <path d="M138 50 L178 40 L164 60 L180 70 L162 76 L172 92 L138 80 Z" fill="${c}" opacity="0.9"/>
  <path d="M100 6 L148 32 V86 L100 112 L52 86 V32 Z" fill="url(#ffz-badge)" stroke="#0e1424" stroke-width="5" stroke-linejoin="round"/>
  <path d="M100 22 L134 41 V77 L100 96 L66 77 V41 Z" fill="#141c2e" stroke="#ffffff" stroke-opacity="0.45" stroke-width="2"/>
  <circle cx="100" cy="59" r="17" fill="none" stroke="${c}" stroke-width="4"/>
  <path d="M100 35v13M100 70v13M76 59h13M111 59h13" stroke="${c}" stroke-width="4" stroke-linecap="round"/>
  <circle cx="100" cy="59" r="4.5" fill="#ffffff"/>
  ${dots}</svg>`
}

let root = null
const el = {}
let cb = {}
let death = null // the portal's death handle while the player is eliminated (hud.setDeath)
let deathOff = null
let hudCb = null
const cache = {}
let mapImg = null // { clean, labelled, bounds, span, size }
const pings = [] // enemy gunfire pings { x, z, t }
let waypoint = null
const dmgNums = []
const dmgDirs = []
const tmpV = new Vector3()

function set(key, value, fn) {
  if (cache[key] === value) return
  cache[key] = value
  fn(value)
}

export function initHud(callbacks) {
  cb = callbacks
  root = h('div', 'hud')
  root.innerHTML = `
    <div class="hud-score">
      <div class="team blue"><img class="mvp" alt=""><div class="pts o">0</div></div>
      <div class="mid"><div class="clock o">0:00</div><div class="mapname">Coral Key</div></div>
      <div class="team orange"><div class="pts o">0</div><img class="mvp" alt=""></div>
    </div>
    <div class="hud-zone"></div>
    <div class="hud-banner"><div class="emb"></div><div class="txt o"></div><div class="sub o"></div></div>
    <div class="hud-reward"></div>
    <div class="hud-announce"><div class="big o"></div><div class="small o"></div></div>
    <div class="hud-squad"></div>
    <div class="hud-right">
      <div class="hud-minimap-wrap"><canvas width="220" height="220"></canvas><span class="key o">M</span></div>
      <div class="hud-weapons"></div>
    </div>
    <div class="hud-feed"></div>
    <div class="hud-health">
      <div class="armor"></div>
      <div class="hpwrap"><div class="lbl o"><span>Health Points</span><span class="hpv">200/200</span></div><div class="hpbar"><div class="lag"></div><div class="fill"></div><div class="shield"></div></div></div>
      <button class="ult silent" title="Ability (Q)"><div class="dia"></div><img class="ico" alt=""><span class="k o">Q</span></button>
    </div>
    <div class="hud-items"></div>
    <div class="hud-cross"><i class="t"></i><i class="b"></i><i class="l"></i><i class="r"></i><i class="d"></i></div>
    <div class="hud-hit"></div>
    <div class="hud-dirs"></div>
    <div class="hud-nums"></div>
    <div class="hud-ping o"></div>
    <div class="hud-vignette"></div>
    <div class="hud-zonetint"></div>
    <div class="hud-prompt"><div class="key">E</div><div><div class="t1"></div><div class="t2 o"></div></div></div>
    <div class="hud-toasts"></div>
    <div class="hud-notice"><div class="line1 o"></div><div class="line2 o"></div></div>
    <div class="hud-knocked"><div class="box"><div class="big o">KNOCKED DOWN</div><div class="bleed"><i></i></div><div class="o sub">Crawl to your squad &mdash; they can revive you</div></div></div>
    <div class="hud-spectate">
      <div class="info"><div class="l1 o"></div><div class="l2 o"></div><button class="bigbtn yellow respawn" disabled><span class="o">Respawn</span></button></div>
      <div class="hearts"><img alt=""><span class="o">0</span></div>
      <div class="who"><button class="arrow prev silent"></button><div class="nm o"></div><button class="arrow next silent"></button></div>
      <div class="btns"><button class="bigbtn white lobby"><span class="o">Lobby</span></button><button class="bigbtn yellow revive"><span class="o">Revive</span><small class="o"></small></button></div>
    </div>
    <div class="hud-scope"><div class="lens"></div><div class="h"></div><div class="v"></div><div class="ticks"></div><div class="dot"></div></div>
    <div class="hud-countdown o"></div>
    <div class="hud-bigmap"><div class="frame"><div class="title o">Coral Key</div><canvas width="900" height="900"></canvas><button class="close">&times;</button></div>
      <div class="legend"><div><i style="background:#fff"></i>Safe zone</div><div><i style="background:#5ab4ff;border-radius:2px"></i>Outside zone</div><div><i style="background:#ffd34d"></i>You</div><div><i style="background:#43b6ff"></i>Squad</div><div><i style="background:#ff3b3b"></i>Gunfire</div><div><i style="background:#3dff8b"></i>Your marker (tap map)</div></div></div>
    <div class="hud-board"></div>
  `
  document.body.appendChild(root)
  const q = (s) => root.querySelector(s)
  Object.assign(el, {
    blueScore: q('.team.blue .pts'),
    orangeScore: q('.team.orange .pts'),
    blueMvp: q('.team.blue .mvp'),
    orangeMvp: q('.team.orange .mvp'),
    clock: q('.clock'),
    mapname: q('.mapname'),
    zone: q('.hud-zone'),
    banner: q('.hud-banner'),
    reward: q('.hud-reward'),
    announce: q('.hud-announce'),
    squad: q('.hud-squad'),
    minimap: q('.hud-minimap-wrap canvas'),
    weapons: q('.hud-weapons'),
    feed: q('.hud-feed'),
    armor: q('.hud-health .armor'),
    hpv: q('.hpv'),
    hpbar: q('.hpbar'),
    hpfill: q('.hpbar .fill'),
    hplag: q('.hpbar .lag'),
    hpshield: q('.hpbar .shield'),
    ult: q('.ult'),
    items: q('.hud-items'),
    cross: q('.hud-cross'),
    hit: q('.hud-hit'),
    dirs: q('.hud-dirs'),
    nums: q('.hud-nums'),
    ping: q('.hud-ping'),
    vignette: q('.hud-vignette'),
    zonetint: q('.hud-zonetint'),
    prompt: q('.hud-prompt'),
    toasts: q('.hud-toasts'),
    notice: q('.hud-notice'),
    knocked: q('.hud-knocked'),
    bleed: q('.hud-knocked .bleed i'),
    spectate: q('.hud-spectate'),
    scope: q('.hud-scope'),
    countdown: q('.hud-countdown'),
    bigmap: q('.hud-bigmap'),
    bigCanvas: q('.hud-bigmap canvas'),
    board: q('.hud-board'),
  })
  el.ult.querySelector('.ico').src = svgData(SVG.bolt)
  el.spectate.querySelector('.hearts img').src = svgData(SVG.heart)

  // Platform toolbar + chat live in the top-left: keep clear of them.
  bloxity.onReservedAreas((areas) => {
    reserved = areas
    layoutReserved()
  })
  window.addEventListener('resize', layoutReserved)

  // Buttons
  el.ult.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    e.stopPropagation()
    cb.onUlt?.()
  })
  el.minimap.parentElement.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    e.stopPropagation()
    toggleMap(true)
  })
  q('.hud-bigmap .close').addEventListener('pointerdown', (e) => {
    e.stopPropagation()
    toggleMap(false)
  })
  el.bigCanvas.addEventListener('pointerdown', (e) => {
    e.stopPropagation()
    if (!mapImg) return
    const r = el.bigCanvas.getBoundingClientRect()
    const u = (e.clientX - r.left) / r.width
    const v = (e.clientY - r.top) / r.height
    const b = mapImg.bounds
    waypoint = { x: b.minX + u * mapImg.span, z: b.minZ + v * mapImg.span }
  })
  el.bigmap.addEventListener('pointerdown', (e) => {
    if (e.target === el.bigmap) toggleMap(false)
  })
  q('.hud-spectate .lobby').addEventListener('click', () => cb.onLobby?.())
  q('.hud-spectate .revive').addEventListener('click', () => cb.onRevive?.())
  hudCb = cb
  q('.hud-spectate .respawn').addEventListener('click', () => cb.onRespawn?.(death))
  q('.hud-spectate .prev').addEventListener('pointerdown', () => cb.onSpectate?.(-1))
  q('.hud-spectate .next').addEventListener('pointerdown', () => cb.onSpectate?.(1))
  // Interact prompt doubles as a touch button (hold for revive).
  el.prompt.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    e.stopPropagation()
    hud.interactHeld = true
    cb.onInteract?.()
  })
  const up = () => (hud.interactHeld = false)
  el.prompt.addEventListener('pointerup', up)
  el.prompt.addEventListener('pointercancel', up)
  el.prompt.addEventListener('pointerleave', up)

  // Pools
  for (let i = 0; i < 24; i++) {
    const d = h('div', 'dmgnum o')
    d.style.opacity = 0
    el.nums.appendChild(d)
    dmgNums.push({ el: d, t: 0, pos: new Vector3(), vx: 0 })
  }
  for (let i = 0; i < 6; i++) {
    const d = h('div', 'dmgdir')
    el.dirs.appendChild(d)
    dmgDirs.push({ el: d, t: 0, from: new Vector3() })
  }

  wireEvents()
  return hud
}

// --- Building blocks per match ---------------------------------------------------------------
function buildWeapons() {
  const p = G.player
  el.weapons.innerHTML = ''
  const card = h('div', 'wcard')
  card.innerHTML = `<div class="ammo o">0<small>/0</small></div><button class="rl o silent">Reload</button><img alt=""><div class="wname o"></div><div class="rtime o"></div><div class="prog"><i></i></div>`
  card.querySelector('.rl').addEventListener('pointerdown', (e) => {
    e.stopPropagation()
    cb.onReload?.()
  })
  el.weapons.appendChild(card)
  el.wcard = card
  el.slots = []
  p.slots.forEach((s, i) => {
    const b = h('button', `wslot silent${s.def.slot === 'fists' ? ' fistslot' : ''}`)
    b.innerHTML = `<img alt=""><span class="n o"></span><span class="k o">${i + 1}</span><div class="bar"><i></i></div>`
    b.querySelector('img').src = weaponIcon(s.id, s.skin, 160, 70)
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      e.stopPropagation()
      cb.onSlot?.(i)
    })
    el.weapons.appendChild(b)
    el.slots.push(b)
  })
  cache.slot = -1
}

function buildItems() {
  el.items.innerHTML = ''
  const defs = [
    { id: 'emote', icon: SVG.emote, key: 'Z' },
    { id: 'frostWall', icon: SVG.wall, key: 'G' },
    { id: 'frag', icon: SVG.frag, key: 'T' },
    { id: 'medkit', icon: SVG.medkit, key: 'X' },
    { id: 'dash', icon: SVG.dash, key: 'F' },
  ]
  el.itemBtns = {}
  for (const d of defs) {
    const b = h('button', 'item silent')
    b.dataset.id = d.id // the touch layout places each one by id (hud.css)
    b.innerHTML = `<img alt=""><div class="cd"></div><span class="k o">${d.key}</span><span class="c o"></span>`
    b.querySelector('img').src = svgData(d.icon)
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      e.stopPropagation()
      cb.onItem?.(d.id)
    })
    el.items.appendChild(b)
    el.itemBtns[d.id] = b
  }
}

function buildArmor() {
  el.armor.innerHTML = `<div class="pc helm"><img alt=""><b class="o">0</b><div class="dur"><i></i></div></div><div class="pc vest"><img alt=""><b class="o">0</b><div class="dur"><i></i></div></div>`
  el.armor.querySelector('.helm img').src = svgData(SVG.helmet)
  el.armor.querySelector('.vest img').src = svgData(SVG.vest)
}

function buildSquad() {
  el.squad.innerHTML = ''
  el.squadRows = []
  const mates = G.actors.filter((a) => a.team === G.player.team)
  for (const a of mates) {
    const r = h('div', `sq${a === G.player ? ' me' : ''}`)
    r.innerHTML = `<img alt=""><div class="col"><div class="nm o">${esc(a.name)}</div><div class="bar"><i></i></div></div><span class="st o"></span>`
    r.querySelector('img').src = a.portrait || portrait(a.outfit)
    el.squad.appendChild(r)
    el.squadRows.push({ a, r, bar: r.querySelector('.bar i'), st: r.querySelector('.st'), key: '' })
  }
}

// Places the top-centre group (score, zone timer, banners) and the right column clear of
// the platform's reserved rectangles: a small overlap slides the score bar right, a big one
// (a toolbar across the whole width, or the chat on a portrait phone) pushes things down.
let reserved = []
function layoutReserved() {
  if (!root) return
  const w = window.innerWidth
  let bottom = 0
  for (const a of reserved) if (a.left < 40) bottom = Math.max(bottom, a.top + a.height)
  const vmin = Math.min(w, window.innerHeight) / 100
  const sw = Math.max(208, Math.min(2 * Math.min(100, Math.max(64, 11 * vmin)) + Math.min(130, Math.max(80, 15 * vmin)) + 40, 330))
  const sh = Math.min(58, Math.max(40, 6.4 * vmin)) + 30 // bar + zone timer
  let top = 0
  let shift = 0
  for (let pass = 0; pass < 3; pass++) {
    shift = 0
    for (const a of reserved) {
      const right = a.left + a.width
      const left = w / 2 - sw / 2 + shift
      if (a.top >= top + sh || a.top + a.height <= top || right <= left) continue
      const overlap = right - left + 8
      // Short screens slide the bar further rather than pushing it down into the view.
      if (overlap < (window.innerHeight <= 500 ? 120 : 90) && right < w / 2) shift += overlap
      else top = Math.max(top, a.top + a.height)
    }
  }
  // The right column only moves for areas that actually reach it.
  let rtop = 0
  for (const a of reserved) if (a.left + a.width > w - 260) rtop = Math.max(rtop, a.top + a.height)
  // Touch layout: the minimap alone sits in the top-right corner (beside the chat in portrait):
  // below the areas that reach into the corner (the toolbar on narrow phones), shrunk to fit
  // right of the ones it can sit beside (the chat), never under 64 px; if it would still land on
  // the score bar's band, it goes under the score bar instead.
  const pad = Math.min(16, Math.max(8, 1.6 * vmin))
  let mm = Math.min(140, Math.max(88, 17 * vmin))
  let mmTop = 0
  for (const a of reserved) if (a.left + a.width > w - pad - 64) mmTop = Math.max(mmTop, a.top + a.height)
  for (const a of reserved) {
    if (a.left + a.width > w - pad - 64 || a.top + a.height <= mmTop || a.top >= mmTop + pad + mm) continue
    mm = Math.max(64, Math.min(mm, w - pad - (a.left + a.width) - 4))
  }
  if (w / 2 + sw / 2 + shift > w - pad - mm && mmTop + pad + mm > top && mmTop < top + sh) mmTop = top + sh + 8
  root.style.setProperty('--mm', `${Math.round(mm)}px`)
  root.style.setProperty('--res-mmtop', `${mmTop}px`)
  root.style.setProperty('--res-bottom', `${bottom}px`)
  root.style.setProperty('--res-top', `${top}px`)
  root.style.setProperty('--res-rtop', `${rtop}px`)
  root.style.setProperty('--score-shift', `${shift}px`)
}

export function setMapImage(img) {
  mapImg = img
}

// Called when a match starts.
function begin(mapName) {
  for (const k of Object.keys(cache)) delete cache[k]
  el.mapname.textContent = mapName
  root.querySelector('.hud-bigmap .title').textContent = mapName
  el.feed.innerHTML = ''
  el.toasts.innerHTML = ''
  el.reward.innerHTML = ''
  el.banner.classList.remove('show')
  pings.length = 0
  waypoint = null
  buildWeapons()
  buildItems()
  buildArmor()
  buildSquad()
  const op = OPERATIVES[G.player.operative]
  el.ult.style.setProperty('--opc', op.color)
  el.ult.title = `${op.ability} (Q): ${op.desc}`
  toggleMap(false)
  showBoard(false)
}

// --- Events -----------------------------------------------------------------------------------
function teamClass(a) {
  if (!a) return 'enemy'
  if (a === G.player) return 'me'
  return a.team === G.player?.team ? 'ally' : 'enemy'
}

function feed(killer, victim, kind, weapon, streak = 0) {
  const r = h('div', 'kf')
  const wid = weapon && WEAPONS[weapon] ? weapon : null
  const actText = kind === 'knock' ? 'Knocked down' : kind === 'head' ? 'Shot to the head' : kind === 'zone' ? 'Lost in the zone' : kind === 'frag' ? 'Blown up' : 'Eliminated'
  const actCls = kind === 'knock' ? 'knock' : kind === 'head' ? 'head' : 'elim'
  const icon = wid ? weaponIcon(wid, 'standard', 160, 70) : svgData(kind === 'frag' ? SVG.frag : SVG.skull)
  r.innerHTML = `${streak > 1 ? `<span class="streak o">&lsaquo;${streak}&rsaquo;</span>` : ''}<img alt="" src="${icon}"><span class="a o ${teamClass(killer)}">${killer ? esc(killer.name) : ''}</span><span class="act o ${actCls}">${actText}</span><span class="a o ${teamClass(victim)}">${esc(victim.name)}</span>`
  el.feed.prepend(r)
  while (el.feed.children.length > 3) el.feed.lastChild.remove()
  setTimeout(() => (r.style.opacity = 0), 5000)
  setTimeout(() => r.remove(), 5600)
}

let bannerTimer = 0
function streakBanner(n, bonusGems = 0) {
  const tier = STREAK_TIERS[Math.min(n, STREAK_TIERS.length - 1)]
  if (!tier) return
  el.banner.querySelector('.emb').innerHTML = BADGE(n, tier.c, tier.d)
  const txt = el.banner.querySelector('.txt')
  txt.textContent = tier.text
  txt.style.color = tier.c
  el.banner.querySelector('.sub').innerHTML = bonusGems > 0 ? `Streak bonus <img alt="" src="${GEM_ICON}">+${bonusGems}` : ''
  // Restart the pop when a streak climbs while the banner is still up.
  el.banner.classList.remove('show')
  void el.banner.offsetWidth
  el.banner.classList.add('show')
  clearTimeout(bannerTimer)
  bannerTimer = setTimeout(() => el.banner.classList.remove('show'), 2400)
}

// Beside the crosshair: what the server granted for a knock / elimination. Newest at the bottom;
// each one pops in, floats up and fades (CSS animation), at most three on screen.
const GEM_ICON = svgData(SVG.gem)
const COIN_ICON = svgData(SVG.coin)
const RP_ICON = svgData(SVG.rp)
function rewardPopup({ kind, gems, coins, rp }) {
  const chip = (cls, icon, n, label) => (n > 0 ? `<div class="c ${cls}"><img alt="" src="${icon}"><span class="n o">+${n}</span><span class="l o">${label}</span></div>` : '')
  const html = chip('gem', GEM_ICON, gems, 'Gems') + chip('coin', COIN_ICON, coins, 'Coins') + chip('rp', RP_ICON, rp, 'Rank')
  if (!html) return
  const r = h('div', `rw ${kind}`, html)
  el.reward.appendChild(r)
  while (el.reward.children.length > 3) el.reward.firstChild.remove()
  setTimeout(() => r.remove(), 2300)
}

let announceTimer = 0
export function announce(big, small = '', ms = 2600) {
  el.announce.querySelector('.big').textContent = big
  el.announce.querySelector('.small').textContent = small
  el.announce.classList.add('show')
  clearTimeout(announceTimer)
  announceTimer = setTimeout(() => el.announce.classList.remove('show'), ms)
}

let noticeTimer = 0
function notice(line1, line2) {
  el.notice.querySelector('.line1').innerHTML = line1
  el.notice.querySelector('.line2').textContent = line2
  el.notice.classList.add('show')
  clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => el.notice.classList.remove('show'), 2200)
}

export function toast(text) {
  const t = h('div', 'toast o', esc(text))
  el.toasts.appendChild(t)
  while (el.toasts.children.length > 5) el.toasts.firstChild.remove()
  setTimeout(() => (t.style.opacity = 0), 2600)
  setTimeout(() => t.remove(), 3100)
}

let hitTimer = 0
function hitmarker(kind) {
  el.hit.className = `hud-hit show ${kind}`
  clearTimeout(hitTimer)
  hitTimer = setTimeout(() => (el.hit.className = 'hud-hit'), kind === 'kill' ? 380 : 140)
}

function damageNumber(pos, amount, head, heal = false) {
  const d = dmgNums.reduce((a, b) => (a.t < b.t ? a : b))
  d.t = 0.9
  d.pos.copy(pos)
  d.pos.y += 0.3
  d.vx = (Math.random() - 0.5) * 40
  d.el.textContent = `${heal ? '+' : ''}${Math.max(1, Math.round(amount))}`
  d.el.className = `dmgnum o${head ? ' head' : ''}${heal ? ' heal' : ''}`
}

function hurtFrom(pos) {
  const d = dmgDirs.reduce((a, b) => (a.t < b.t ? a : b))
  d.t = 1.2
  d.from.copy(pos)
}

function wireEvents() {
  on('damage', ({ target, attacker, amount, head, point, zone }) => {
    if (!G.player) return
    if (attacker === G.player && target !== G.player && point) {
      damageNumber(point, amount, head)
      if (target.life !== 'dead') hitmarker(head ? 'head' : '')
    }
    if (target === G.player && attacker && attacker !== G.player && !zone) hurtFrom(attacker.pos)
  })
  on('knock', ({ target, attacker, weapon, head }) => {
    feed(attacker, target, 'knock', weapon)
    if (attacker === G.player) notice(`Knocked <em>${esc(target.name)}</em>`, '')
  })
  on('elimination', ({ target, killer, weapon, head, streak }) => {
    feed(killer, target, weapon === 'zone' ? 'zone' : weapon === 'frag' ? 'frag' : head ? 'head' : 'elim', weapon, streak)
    if (killer === G.player) {
      hitmarker('kill')
      notice(`Eliminated <em>${esc(target.name)}</em>`, '')
    }
  })
  // The server's grant for this player's knock / elimination (online.js 'reward').
  on('reward', (r) => {
    if (!G.player) return
    rewardPopup(r)
    if (r.kind === 'elim' && r.streak >= 2) streakBanner(r.streak, r.bonus)
  })
  // A medic weapon healed someone: green numbers for the healer.
  on('heal', ({ target, by, amount }) => {
    if (!G.player || by !== G.player || target === G.player) return
    damageNumber(target.chest(tmpV), amount, false, true)
  })
  on('loot', ({ actor, items }) => {
    if (actor !== G.player) return
    for (const t of items) toast(t)
    if (!items.length) toast('Nothing new — you are stocked up')
  })
  on('shot', ({ actor }) => {
    if (!G.player || actor.team === G.player.team) return
    pings.push({ x: actor.pos.x, z: actor.pos.z, t: 2.5 })
    if (pings.length > 24) pings.shift()
  })
}

// --- Map drawing ---------------------------------------------------------------------------
function worldToMap(x, z, out) {
  const b = mapImg.bounds
  out.u = (x - b.minX) / mapImg.span
  out.v = (z - b.minZ) / mapImg.span
  return out
}
const mp = { u: 0, v: 0 }

function drawArrow(g, x, y, yaw, size, fill, stroke = '#000') {
  g.save()
  g.translate(x, y)
  g.rotate(-yaw + Math.PI)
  g.beginPath()
  g.moveTo(0, -size)
  g.lineTo(size * 0.7, size * 0.8)
  g.lineTo(0, size * 0.35)
  g.lineTo(-size * 0.7, size * 0.8)
  g.closePath()
  g.fillStyle = fill
  g.fill()
  g.lineWidth = 1.5
  g.strokeStyle = stroke
  g.stroke()
  g.restore()
}

function drawOverlay(g, W, Hh, toPx, scale, viewCone) {
  const zone = G.match?.zone?.state
  if (zone) {
    // Outside the zone: blue tint.
    const c = toPx(zone.center.x, zone.center.y)
    g.save()
    g.fillStyle = 'rgba(40, 130, 255, 0.28)'
    g.beginPath()
    g.rect(0, 0, W, Hh)
    g.arc(c.x, c.y, zone.radius * scale, 0, Math.PI * 2, true)
    g.fill('evenodd')
    g.lineWidth = 2
    g.strokeStyle = '#ffffff'
    g.beginPath()
    g.arc(c.x, c.y, zone.radius * scale, 0, Math.PI * 2)
    g.stroke()
    if (zone.nextR < zone.radius - 1) {
      const n = toPx(zone.next.x, zone.next.y)
      g.setLineDash([6, 5])
      g.strokeStyle = 'rgba(255,255,255,0.85)'
      g.beginPath()
      g.arc(n.x, n.y, zone.nextR * scale, 0, Math.PI * 2)
      g.stroke()
      g.setLineDash([])
      // Route to the next zone.
      const p = G.player
      if (p && G.match.zone.outside(p.pos.x, p.pos.z, 0)) {
        const pp = toPx(p.pos.x, p.pos.z)
        g.strokeStyle = '#ffc83d'
        g.lineWidth = 2
        g.setLineDash([4, 4])
        g.beginPath()
        g.moveTo(pp.x, pp.y)
        g.lineTo(n.x, n.y)
        g.stroke()
        g.setLineDash([])
      }
    }
    g.restore()
  }
  // Airdrops
  for (const d of G.match?.drops?.() ?? []) {
    if (d.opened) continue
    const p = toPx(d.pos.x, d.pos.z)
    g.fillStyle = '#ff6a3d'
    g.strokeStyle = '#000'
    g.lineWidth = 2
    g.fillRect(p.x - 5, p.y - 5, 10, 10)
    g.strokeRect(p.x - 5, p.y - 5, 10, 10)
  }
  // Gunfire pings
  for (const pg of pings) {
    const p = toPx(pg.x, pg.z)
    g.globalAlpha = Math.min(1, pg.t)
    g.fillStyle = '#ff3b3b'
    g.beginPath()
    g.arc(p.x, p.y, 4, 0, Math.PI * 2)
    g.fill()
    g.strokeStyle = 'rgba(255,60,60,0.8)'
    g.beginPath()
    g.arc(p.x, p.y, 4 + (2.5 - pg.t) * 5, 0, Math.PI * 2)
    g.stroke()
    g.globalAlpha = 1
  }
  if (waypoint) {
    const p = toPx(waypoint.x, waypoint.z)
    g.fillStyle = '#3dff8b'
    g.strokeStyle = '#000'
    g.beginPath()
    g.moveTo(p.x, p.y)
    g.arc(p.x, p.y - 9, 6, Math.PI * 0.8, Math.PI * 2.2)
    g.closePath()
    g.fill()
    g.stroke()
  }
  // Squad + me
  const me = G.spectating || G.player
  for (const a of G.actors) {
    if (a.team !== G.player.team || a.life === 'dead' || a === me) continue
    const p = toPx(a.pos.x, a.pos.z)
    if (a.life === 'knocked') {
      g.fillStyle = '#ff3b3b'
      g.beginPath()
      g.arc(p.x, p.y, 5, 0, Math.PI * 2)
      g.fill()
    } else drawArrow(g, p.x, p.y, a.facing, 7, '#43b6ff')
  }
  if (me) {
    const p = toPx(me.pos.x, me.pos.z)
    if (viewCone) {
      const yaw = me.facing
      const grad = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, 40)
      grad.addColorStop(0, 'rgba(255,255,255,0.55)')
      grad.addColorStop(1, 'rgba(255,255,255,0)')
      g.fillStyle = grad
      g.beginPath()
      g.moveTo(p.x, p.y)
      const a0 = Math.atan2(Math.cos(yaw), Math.sin(yaw))
      g.arc(p.x, p.y, 40, a0 - 0.5, a0 + 0.5)
      g.closePath()
      g.fill()
    }
    drawArrow(g, p.x, p.y, me.facing, 8, '#ffd34d')
  }
}

function drawMinimap() {
  if (!mapImg) return
  const c = el.minimap
  const g = c.getContext('2d')
  const W = c.width
  const me = G.spectating || G.player
  const viewR = 55 // metres from centre to edge
  const scale = W / 2 / viewR
  const pxPerM = mapImg.size / mapImg.span
  worldToMap(me.pos.x, me.pos.z, mp)
  g.fillStyle = '#1d5fa8'
  g.fillRect(0, 0, W, W)
  const srcHalf = viewR * pxPerM
  g.drawImage(mapImg.clean, mp.u * mapImg.size - srcHalf, mp.v * mapImg.size - srcHalf, srcHalf * 2, srcHalf * 2, 0, 0, W, W)
  const toPx = (x, z) => ({ x: W / 2 + (x - me.pos.x) * scale, y: W / 2 + (z - me.pos.z) * scale })
  drawOverlay(g, W, W, toPx, scale, true)
}

function drawBigMap() {
  if (!mapImg) return
  const c = el.bigCanvas
  const g = c.getContext('2d')
  const W = c.width
  g.drawImage(mapImg.labelled, 0, 0, W, W)
  const scale = W / mapImg.span
  const b = mapImg.bounds
  const toPx = (x, z) => ({ x: (x - b.minX) * scale, y: (z - b.minZ) * scale })
  drawOverlay(g, W, W, toPx, scale, false)
}

export function toggleMap(force) {
  const on = force ?? !el.bigmap.classList.contains('on')
  el.bigmap.classList.toggle('on', on)
  cb.onMapOpen?.(on)
}
export const mapOpen = () => el.bigmap.classList.contains('on')

export function showBoard(on) {
  el.board.classList.toggle('on', on)
  if (!on) return
  const row = (a) => `<tr class="${a === G.player ? 'me' : ''} ${a.life === 'dead' ? 'dead' : ''}"><td>${esc(a.name)}</td><td>${a.stats.eliminations}</td><td>${a.stats.assists}</td><td>${a.stats.deaths}</td><td>${Math.round(a.stats.damage)}</td></tr>`
  const table = (team) => {
    const list = G.actors.filter((a) => a.team === team).sort((x, y) => y.stats.eliminations - x.stats.eliminations || y.stats.damage - x.stats.damage)
    const score = G.match?.score?.[team] ?? 0
    return `<div><h3 class="o" style="color:${TEAMS[team].color}">${TEAMS[team].name} · ${score}</h3><table><tr><th>Player</th><th>Elims</th><th>Ast</th><th>Deaths</th><th>Damage</th></tr>${list.map(row).join('')}</table></div>`
  }
  el.board.innerHTML = table(G.player.team) + table(G.player.team === 'blue' ? 'orange' : 'blue')
}

// --- Per frame ---------------------------------------------------------------------------------
const hud = {
  interactHeld: false,
  init: initHud,
  // Respawn shortcut (G): same as pressing the panel's Respawn button.
  pressRespawn() {
    hudCb.onRespawn?.(death)
  },
  begin,
  announce,
  toast,
  toggleMap,
  showBoard,
  setMapImage,
  // The portal's death handle (bloxity.showDeathScreen), or null to go back to the timer-based panel.
  // Its countdown drives the centred Respawn button; it stays disabled until it reaches 0.
  setDeath(handle) {
    deathOff?.()
    deathOff = null
    death = handle || null
    el.spectate.classList.toggle('portal', !!death)
    const btn = el.spectate.querySelector('.respawn')
    btn.disabled = true
    btn.querySelector('span').textContent = 'Respawn'
    if (!death) return
    try {
      const off = death.onCountdown?.((n) => {
        btn.disabled = n > 0
        btn.querySelector('span').textContent = n > 0 ? String(n) : document.body.classList.contains('touch-ui') ? 'RESPAWN' : 'RESPAWN (G)'
      })
      if (typeof off === 'function') deathOff = off
    } catch {
      btn.disabled = false
    }
  },
  // The offline Weapon Test range: no score, zone or minimap (testRange.js draws its own card).
  setTest(on) {
    root?.classList.toggle('test', !!on)
  },
  show(on) {
    root.classList.toggle('on', on)
    if (!on) {
      toggleMap(false)
      showBoard(false)
    }
  },
  countdown(text) {
    el.countdown.textContent = text
    el.countdown.classList.remove('pop')
    void el.countdown.offsetWidth
    el.countdown.classList.add('pop')
  },
  update(dt, camera, info) {
    const p = G.player
    if (!p) return
    const m = G.match
    // Score + clock
    set('blue', m.score.blue, (v) => (el.blueScore.textContent = v))
    set('orange', m.score.orange, (v) => (el.orangeScore.textContent = v))
    const left = Math.max(0, m.duration - G.time)
    set('clock', Math.ceil(left), () => {
      el.clock.textContent = fmt(Math.ceil(left))
      el.clock.classList.toggle('low', left < 30)
    })
    set('mvpB', m.mvp?.blue?.id ?? 0, () => (el.blueMvp.src = m.mvp?.blue ? m.mvp.blue.portrait || portrait(m.mvp.blue.outfit) : ''))
    set('mvpO', m.mvp?.orange?.id ?? 0, () => (el.orangeMvp.src = m.mvp?.orange ? m.mvp.orange.portrait || portrait(m.mvp.orange.outfit) : ''))
    // Zone
    const zi = m.zone.info(G.time)
    const outside = m.zone.outside(p.pos.x, p.pos.z) && p.life !== 'dead'
    set('zone', `${zi.label}|${Math.ceil(zi.time)}|${outside}`, () => {
      el.zone.innerHTML = `${outside ? '<span class="out o">OUTSIDE ZONE</span> · ' : ''}<span class="o">${zi.label}${zi.time > 0 ? ` <b>${fmt(Math.ceil(zi.time))}</b>` : ''}</span>`
      el.zone.classList.toggle('warn', zi.shrinking || outside)
    })
    el.zonetint.classList.toggle('on', outside)

    // Weapon panel
    const w = p.weapon
    const def = w.def
    set('slot', p.slot, (s) => {
      el.slots.forEach((b, i) => b.classList.toggle('active', i === s))
      el.wcard.querySelector('img').src = weaponIcon(w.id, w.skin)
      el.wcard.querySelector('.wname').textContent = def.name
    })
    const reloading = p.reloadT >= 0
    set('ammo', `${w.ammo}|${w.reserve}|${def.mag ?? 0}`, () => {
      el.wcard.querySelector('.ammo').innerHTML = def.mag ? `${w.ammo}<small>/${def.mag}</small>` : '&infin;'
      el.wcard.classList.toggle('empty', !!def.mag && w.ammo === 0)
      el.wcard.querySelector('.rl').style.visibility = def.mag ? 'visible' : 'hidden'
      el.wcard.querySelector('.rl').textContent = def.mag ? `Reload · ${w.reserve}` : ''
    })
    set('rl', reloading ? Math.ceil((def.reload - p.reloadT) * 10) : -1, (v) => {
      el.wcard.classList.toggle('reloading', v >= 0)
      el.wcard.querySelector('.rtime').textContent = v >= 0 ? (v / 10).toFixed(1) : ''
    })
    el.wcard.querySelector('.prog i').style.width = reloading ? `${(p.reloadT / def.reload) * 100}%` : def.mag ? `${(w.ammo / def.mag) * 100}%` : '100%'
    p.slots.forEach((s, i) => {
      set(`s${i}`, `${s.ammo}|${s.reserve}`, () => {
        const b = el.slots[i]
        b.querySelector('.n').textContent = s.def.mag ? s.ammo + s.reserve : '∞'
        b.querySelector('.bar i').style.width = s.def.mag ? `${(s.ammo / s.def.mag) * 100}%` : '100%'
      })
    })

    // Health + armour
    const hpK = p.life === 'knocked' ? p.downHp / HEALTH.knockedHp : p.hp / p.maxHp
    set('hp', Math.round(hpK * 400), () => {
      el.hpfill.style.width = `${hpK * 100}%`
      el.hplag.style.width = `${hpK * 100}%`
      el.hpbar.classList.toggle('low', hpK < 0.3 || p.life === 'knocked')
      el.hpv.textContent = p.life === 'knocked' ? `${Math.ceil(p.downHp)}` : `${Math.ceil(p.hp)}/${p.maxHp}`
    })
    set('armor', `${p.helmet}|${p.vest}|${Math.round(p.helmetDur / 10)}|${Math.round(p.vestDur / 10)}`, () => {
      const hEl = el.armor.querySelector('.helm')
      const vEl = el.armor.querySelector('.vest')
      hEl.classList.toggle('off', !p.helmet)
      vEl.classList.toggle('off', !p.vest)
      hEl.querySelector('b').textContent = p.helmet
      vEl.querySelector('b').textContent = p.vest
      hEl.querySelector('.dur i').style.width = p.helmet ? `${(p.helmetDur / HEALTH.armorDurability[p.helmet]) * 100}%` : '0%'
      vEl.querySelector('.dur i').style.width = p.vest ? `${(p.vestDur / HEALTH.armorDurability[p.vest]) * 100}%` : '0%'
      el.hpshield.style.width = `${(p.vest / 3) * 100}%`
    })
    const op = p.operativeDef
    const ultK = Math.min(1, p.ult / op.charge)
    set('ult', Math.round(ultK * 50), () => {
      el.ult.style.setProperty('--k', `${ultK * 100}%`)
      el.ult.classList.toggle('ready', ultK >= 1)
    })
    el.vignette.style.opacity = p.life === 'alive' ? Math.max(0, 0.75 - hpK * 2.2).toFixed(2) : 0

    // Items
    const cdK = Math.max(0, (p.dashReadyAt - G.time) / ITEMS.dash.cooldown)
    set('items', `${p.items.frostWall}|${p.items.frag}|${p.items.medkit}|${Math.round(cdK * 40)}|${p.healT >= 0}`, () => {
      const B = el.itemBtns
      B.frostWall.querySelector('.c').textContent = p.items.frostWall
      B.frag.querySelector('.c').textContent = p.items.frag
      B.medkit.querySelector('.c').textContent = p.items.medkit
      B.frostWall.classList.toggle('empty', !p.items.frostWall)
      B.frag.classList.toggle('empty', !p.items.frag)
      B.medkit.classList.toggle('empty', !p.items.medkit)
      B.medkit.classList.toggle('busy', p.healT >= 0)
      B.dash.querySelector('.cd').style.setProperty('--cd', `${cdK * 100}%`)
      B.dash.querySelector('.c').textContent = cdK > 0 ? Math.ceil(cdK * ITEMS.dash.cooldown) : ''
    })

    // Squad rows
    for (const s of el.squadRows) {
      const a = s.a
      const k = a.life === 'knocked' ? a.downHp / HEALTH.knockedHp : a.hp / a.maxHp
      const key = `${a.life}|${Math.round(k * 30)}|${a.life === 'dead' ? Math.ceil(Math.max(0, a.respawnAt - G.time)) : ''}`
      if (key === s.key) continue
      s.key = key
      s.r.className = `sq${a === p ? ' me' : ''} ${a.life}`
      s.bar.style.width = `${a.life === 'dead' ? 0 : k * 100}%`
      s.st.textContent = a.life === 'knocked' ? 'HELP!' : a.life === 'dead' ? (a.respawnAt > G.time ? `${Math.ceil(a.respawnAt - G.time)}s` : '') : ''
    }

    // Crosshair
    const scoped = !!info.scoped // toggle(name, undefined) would flip the class instead
    el.scope.classList.toggle('on', scoped)
    const showCross = p.life === 'alive' && !scoped && G.phase === 'playing' && !G.spectating
    el.cross.classList.toggle('hide', !showCross)
    if (showCross) {
      const px = (Math.tan(((info.spread || 0) * Math.PI) / 360) / Math.tan(((camera.fov / 2) * Math.PI) / 180)) * (window.innerHeight / 2)
      el.cross.style.setProperty('--s', `${Math.max(5, px + 4).toFixed(1)}px`)
      el.cross.classList.toggle('enemy', !!info.onEnemy)
    }

    // Damage numbers
    for (const d of dmgNums) {
      if (d.t <= 0) continue
      d.t -= dt
      tmpV.copy(d.pos)
      tmpV.y += (0.9 - d.t) * 0.8
      tmpV.project(camera)
      if (d.t <= 0 || tmpV.z > 1) {
        d.el.style.opacity = 0
        continue
      }
      const x = (tmpV.x * 0.5 + 0.5) * window.innerWidth + d.vx * (0.9 - d.t)
      const y = (-tmpV.y * 0.5 + 0.5) * window.innerHeight
      const s = d.t > 0.75 ? 1 + (d.t - 0.75) * 4 : 1
      d.el.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px) translate(-50%, -50%) scale(${s.toFixed(2)})`
      d.el.style.opacity = Math.min(1, d.t * 3).toFixed(2)
    }
    // Damage directions
    const camYaw = info.yaw
    for (const d of dmgDirs) {
      if (d.t <= 0) continue
      d.t -= dt
      const dx = d.from.x - p.pos.x
      const dz = d.from.z - p.pos.z
      const ang = Math.atan2(dx, -dz) + camYaw // screen angle, 0 = up
      d.el.style.transform = `rotate(${ang}rad)`
      d.el.style.opacity = Math.max(0, Math.min(1, d.t)).toFixed(2)
    }
    // Pings fade
    for (let i = pings.length - 1; i >= 0; i--) {
      pings[i].t -= dt
      if (pings[i].t <= 0) pings.splice(i, 1)
    }
    // Waypoint distance marker (projected)
    if (waypoint && p.life !== 'dead') {
      tmpV.set(waypoint.x, p.pos.y + 2, waypoint.z).project(camera)
      if (tmpV.z < 1) {
        el.ping.style.display = 'block'
        const x = Math.max(20, Math.min(window.innerWidth - 60, (tmpV.x * 0.5 + 0.5) * window.innerWidth))
        const y = Math.max(60, Math.min(window.innerHeight - 40, (-tmpV.y * 0.5 + 0.5) * window.innerHeight))
        el.ping.style.transform = `translate(${x}px, ${y}px)`
        el.ping.textContent = `◆ ${Math.round(Math.hypot(waypoint.x - p.pos.x, waypoint.z - p.pos.z))}m`
      } else el.ping.style.display = 'none'
      if (Math.hypot(waypoint.x - p.pos.x, waypoint.z - p.pos.z) < 4) waypoint = null
    } else el.ping.style.display = 'none'

    // Prompt
    if (info.prompt) {
      el.prompt.classList.add('on')
      set('prompt', `${info.prompt.t1}|${info.prompt.t2}`, () => {
        el.prompt.querySelector('.t1').textContent = info.prompt.t1
        el.prompt.querySelector('.t2').textContent = info.prompt.t2
        el.prompt.querySelector('.key').textContent = info.touch ? '✋' : 'E'
      })
      el.prompt.querySelector('.key').style.setProperty('--p', `${(info.prompt.progress || 0) * 100}%`)
    } else {
      el.prompt.classList.remove('on')
      cache.prompt = ''
    }

    // Knocked overlay
    el.knocked.classList.toggle('on', p.life === 'knocked')
    if (p.life === 'knocked') el.bleed.style.width = `${(p.downHp / HEALTH.knockedHp) * 100}%`

    // Spectate panel
    const spect = p.life === 'dead' && G.phase === 'playing'
    el.spectate.classList.toggle('on', spect)
    if (spect) {
      const s = G.spectating
      set('spect', s ? s.id : 0, () => {
        el.spectate.querySelector('.who .nm').textContent = s ? s.name : '—'
      })
      // With the portal's death screen the Respawn button carries the countdown (setDeath).
      const wait = death ? 0 : Math.max(0, Math.ceil(p.respawnAt - G.time))
      const hearts = info.hearts ?? 0
      set('spinfo', `${wait}|${hearts}|${p.lastKilledBy?.name ?? ''}|${death ? 1 : 0}`, () => {
        el.spectate.querySelector('.info .l1').textContent = p.lastKilledBy ? `Eliminated by ${p.lastKilledBy.name}` : 'Eliminated'
        el.spectate.querySelector('.info .l2').textContent = death ? '' : wait > 0 ? `Respawning in ${wait}s` : 'Respawning…'
        el.spectate.querySelector('.hearts span').textContent = hearts
        const rv = el.spectate.querySelector('.revive')
        rv.disabled = hearts <= 0
        rv.querySelector('small').textContent = hearts > 0 ? 'uses 1 heart' : 'no hearts left'
      })
    }

    if (mapOpen()) drawBigMap()
    drawMinimap()
  },
}

export default hud
