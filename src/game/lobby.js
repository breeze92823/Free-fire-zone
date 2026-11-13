// The lobby UI over the 3D hangar: profile, coins and rank on top; Weapons
// Store, Store, Characters and Inventory on the left; the squad and the
// mode + PLAY button on the right; and the windows behind them. Everything
// is bought with coins earned in matches (never premium currency).
// Also the waiting / map-vote panel after PLAY (the room's server runs the
// rounds: real players only) and the loading screen.
import './lobby.css'
import { MATCH_MODES, NET, OPERATIVES, SKINS, STORE, WEAPONS, GAME_TITLE, GRAPHICS_PRESETS } from '../config.js'
import * as bloxity from '../bloxity.js'
import { sfx, setVolume, isMuted, setMuted } from '../audio/index.js'
import { SVG, svgData, weaponIcon } from './icons.js'
import { portrait, randomOutfit } from './characters.js'
import { account, buyOperative, buySkin, buyStoreItem, buyWeapon, equipEmote, equipOperative, equipSkin, equipWeapon, onProfile, owns, profile, rankOf, setMode, skinFor, upgradeLevel } from './save.js'

const h = (tag, cls = '', html = '') => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (html) e.innerHTML = html
  return e
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const coinImg = () => `<img alt="" src="${svgData(SVG.coin)}">`
const fmtN = (n) => Math.round(n).toLocaleString('en-US')

const RANK_SVG = (color) => `<svg viewBox="0 0 24 28" xmlns="http://www.w3.org/2000/svg"><path d="M12 1l10 4v8c0 7-4.6 11.6-10 14C6.6 24.6 2 20 2 13V5z" fill="${color}" stroke="#1b1205" stroke-width="1.5"/><path d="M12 6l2.2 4.6 5 .6-3.7 3.4 1 5-4.5-2.6-4.5 2.6 1-5-3.7-3.4 5-.6z" fill="#fff6c8" stroke="#6b4a00" stroke-width=".8"/></svg>`

let root = null
let modal = null
let cb = {}
let roomPlayers = [] // everyone in this server room: [{ id, name, pfp, inMatch, team, me }]
let netStatus = 'idle'
let statusText = ''
const statLimits = { damage: 165, rate: 14, range: 400, mag: 60 }

export function initLobby(callbacks) {
  cb = callbacks
  root = h('div', 'lobby')
  root.innerHTML = `
    <div class="lb-top">
      <div class="chip profile"><img class="pfp" alt=""><span class="nm o"></span></div>
      <div class="chip coins" title="Coins: earned by playing matches">${coinImg()}<span class="v o">0</span></div>
      <div class="chip rank"><span class="rs"></span><div class="rk"><b class="o rn"></b><span class="rbar"><i></i></span></div></div>
      <div class="lb-spacer"></div>
      <button class="iconbtn settings" title="Settings">${SVG.gear}</button>
    </div>
    <div class="lb-menu">
      <button class="menubtn gold" data-open="weapons"><span class="ic"><img alt="" src="${svgData(SVG.frag)}"></span><span class="tx o">Weapons Store</span></button>
      <button class="menubtn" data-open="store"><span class="ic"><img alt="" src="${svgData(SVG.coin)}"></span><span class="tx o">Store</span></button>
      <button class="menubtn" data-open="characters"><span class="ic"><img alt="" src="${svgData(SVG.emote)}"></span><span class="tx o">Characters</span></button>
      <button class="menubtn" data-open="inventory"><span class="ic"><img alt="" src="${svgData(SVG.vest)}"></span><span class="tx o">Inventory</span></button>
    </div>
    <div class="lb-squad"></div>
    <div class="lb-play">
      <button class="lb-mode"><span class="mi">6v6</span><span><div class="mt o"></div><div class="md"></div></span></button>
      <button class="playbtn o">PLAY</button>
    </div>
    <div class="lb-stats"></div>
    <div class="lb-net o"></div>
    <div class="lb-modal"></div>
  `
  document.body.appendChild(root)
  modal = root.querySelector('.lb-modal')
  root.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => open(b.dataset.open)))
  root.querySelector('.settings').addEventListener('click', () => open('settings'))
  root.querySelector('.lb-mode').addEventListener('click', () => open('mode'))
  root.querySelector('.playbtn').addEventListener('click', () => cb.onPlay?.())
  root.querySelector('.chip.profile').addEventListener('click', () => open('inventory'))
  modal.addEventListener('pointerdown', (e) => {
    if (e.target === modal && !modal.dataset.locked) close()
  })
  for (const b of root.querySelectorAll('button')) b.addEventListener('pointerenter', () => sfx.hover())

  bloxity.onReservedAreas((areas) => {
    let right = 0
    let bottom = 0
    let toolbarBottom = 0
    for (const a of areas) {
      if (a.top < 20) {
        right = Math.max(right, a.left + a.width)
        toolbarBottom = Math.max(toolbarBottom, a.top + a.height)
      }
      if (a.left < 40) bottom = Math.max(bottom, a.top + a.height)
    }
    // Beside the toolbar when it fits (compact chips when tight); otherwise under the toolbar + chat.
    const room = window.innerWidth - right
    const bar = root.querySelector('.lb-top')
    bar.classList.toggle('compact', room < 440)
    if (room < 230) {
      root.style.setProperty('--res-right', '0px')
      bar.style.top = `${bottom + 6}px`
    } else {
      root.style.setProperty('--res-right', `${right}px`)
      bar.style.top = ''
    }
    void toolbarBottom
    root.style.setProperty('--res-bottom', `${bottom}px`)
  })
  onProfile(refresh)
  newSquad()
  refresh()
  return lobby
}

function newSquad() {
  // The squad panel lists the real players in this room (setRoster).
}

// Everyone in the room (online.js roster()) and the connection state, about once a second.
function setRoster(list, status) {
  roomPlayers = list || []
  netStatus = status || netStatus
  if (!root) return
  const others = roomPlayers.filter((m) => !m.me)
  const sq = root.querySelector('.lb-squad')
  const html = others.length
    ? others
        .slice(0, 5)
        .map((m) => `<div class="mate"><img alt="" src="${m.pfp ? esc(m.pfp) : portrait(outfitFor(m.id))}"><div><b class="o">${esc(m.name || 'Player')}</b><small>${m.inMatch ? (m.team ? 'In a round' : 'Ready') : 'In the lobby'}</small></div></div>`)
        .join('') + (others.length > 5 ? `<div class="mate more"><small class="o">+${others.length - 5} more</small></div>` : '')
    : `<div class="mate"><div><b class="o">${netStatus === 'online' ? 'No one else here yet' : 'Connecting…'}</b><small>${netStatus === 'online' ? 'Invite friends from the menu' : 'Joining a server'}</small></div></div>`
  if (sq.dataset.html !== html) {
    sq.dataset.html = html
    sq.innerHTML = html
  }
  paintNet()
}

const outfits = new Map()
function outfitFor(id) {
  if (!outfits.has(id)) outfits.set(id, randomOutfit())
  return outfits.get(id)
}

function paintNet() {
  if (!root) return
  const el = root.querySelector('.lb-net')
  const n = roomPlayers.length
  const text = statusText || (netStatus === 'online' ? `Online · ${n} player${n === 1 ? '' : 's'} in this server` : netStatus === 'connecting' ? 'Connecting to the game server…' : netStatus === 'offline' ? 'Offline — PLAY retries' : '')
  el.textContent = text
  el.classList.toggle('warn', netStatus !== 'online')
}

function setStatus(text) {
  statusText = text || ''
  paintNet()
}

function refresh() {
  if (!root) return
  const r = rankOf()
  root.querySelector('.chip.coins .v').textContent = fmtN(profile.coins)
  root.querySelector('.chip.rank .rs').innerHTML = RANK_SVG(r.color)
  root.querySelector('.chip.rank .rn').textContent = r.name
  root.querySelector('.chip.rank .rbar i').style.width = `${r.progress * 100}%`
  root.querySelector('.chip.rank').title = r.next ? `${profile.rp} RP · ${r.next.rp - profile.rp} to ${r.next.name}` : `${profile.rp} RP`
  root.querySelector('.chip.profile .nm').textContent = bloxity.displayName()
  const pfp = bloxity.getPfp()
  root.querySelector('.chip.profile .pfp').src = pfp || portrait({ ...randomOutfitFixed(), face: 'cool' })
  const mode = MATCH_MODES[profile.mode] ?? MATCH_MODES.clash
  root.querySelector('.lb-mode .mt').textContent = mode.name
  root.querySelector('.lb-mode .md').textContent = mode.desc
  root.querySelector('.lb-mode .mi').textContent = `${mode.teamSize}v${mode.teamSize}`
  const s = profile.stats
  root.querySelector('.lb-stats').innerHTML = `<span class="o">Matches ${s.matches} · Wins ${s.wins} · Eliminations ${s.eliminations} · Best ${s.best}</span>`
  cb.onRank?.(r.index)
  if (modal.classList.contains('on') && current && current.kind !== 'queue') reopen()
}

let fixedOutfit = null
function randomOutfitFixed() {
  return (fixedOutfit ||= randomOutfit())
}

// --- Windows ------------------------------------------------------------------------------------
function frame(title, bodyHtml, tabs = null, activeTab = null) {
  modal.innerHTML = `<div class="win"><div class="win-h"><div class="t o">${title}</div><div class="coins">${coinImg()}<span class="o">${fmtN(profile.coins)}</span></div><button class="win-x o">&times;</button></div>${
    tabs ? `<div class="tabs">${tabs.map(([id, name]) => `<button class="tab o${id === activeTab ? ' on' : ''}" data-tab="${id}">${name}</button>`).join('')}</div>` : ''
  }<div class="win-b">${bodyHtml}</div></div>`
  modal.querySelector('.win-x').addEventListener('click', close)
  modal.classList.add('on')
  return modal.querySelector('.win')
}

export function close() {
  modal.classList.remove('on')
  modal.innerHTML = ''
  delete modal.dataset.locked
  cb.onWindow?.(false)
}

let current = null
function open(kind, opt) {
  current = { kind, opt }
  cb.onWindow?.(true)
  if (kind === 'weapons') return weaponsWindow(opt || 'weapons')
  if (kind === 'store') return storeWindow()
  if (kind === 'characters') return charactersWindow()
  if (kind === 'inventory') return inventoryWindow()
  if (kind === 'settings') return settingsWindow()
  if (kind === 'mode') return modeWindow()
}
function reopen() {
  if (current) open(current.kind, current.opt)
}

function bought(ok) {
  if (ok) {
    sfx.purchase()
    reopen()
  } else {
    sfx.deny()
    if (netStatus !== 'online' || !account.loaded) setStatus('The shop needs the game server — reconnecting…')
  }
}

function statRow(label, v, max) {
  return `<div class="stat"><span>${label}</span><span class="sb"><i style="width:${Math.min(100, (v / max) * 100)}%"></i></span></div>`
}

function weaponsWindow(tab) {
  if (tab === 'skins') return skinsWindow()
  const list = Object.entries(WEAPONS).filter(([, w]) => w.slot === 'primary' || w.slot === 'secondary')
  const cards = list
    .map(([id, w]) => {
      const own = owns('weapons', id)
      const eq = profile.loadout.primary === id || profile.loadout.secondary === id
      const dmg = w.damage * (w.pellets || 1)
      let btn
      if (eq) btn = `<button class="buy equipped o" disabled>Equipped</button>`
      else if (own) btn = `<button class="buy owned o" data-equip="${id}">Equip ${w.slot}</button>`
      else btn = `<button class="buy ${profile.coins >= w.price ? 'price' : 'cant'} o" data-buy="${id}">${coinImg()}${fmtN(w.price)}</button>`
      return `<div class="card${eq ? ' sel' : ''}">${eq ? `<span class="tag gold">${w.slot === 'primary' ? 'PRIMARY' : 'SECONDARY'}</span>` : ''}
        <div class="pic"><img alt="" src="${weaponIcon(id, skinFor(id))}"></div>
        <div class="nm o">${w.name}</div><div class="sub">${w.kind.toUpperCase()} · ${w.slot}</div>
        ${statRow('Damage', dmg, statLimits.damage)}${statRow('Fire rate', 1 / w.interval, statLimits.rate)}${statRow('Range', w.range, statLimits.range)}${statRow('Magazine', w.mag, statLimits.mag)}
        ${btn}</div>`
    })
    .join('')
  const win = frame('Weapons Store', `<div class="grid">${cards}</div><div class="hint">Prices are in coins. Earn coins in every match: eliminations, damage, wins and MVP.</div>`, [['weapons', 'Weapons'], ['skins', 'Skins']], 'weapons')
  wireTabs(win)
  win.querySelectorAll('[data-buy]').forEach((b) => b.addEventListener('click', () => bought(buyWeapon(b.dataset.buy))))
  win.querySelectorAll('[data-equip]').forEach((b) =>
    b.addEventListener('click', () => {
      equipWeapon(b.dataset.equip)
      sfx.equip()
      reopen()
    }),
  )
}

let skinWeapon = null
function skinsWindow() {
  const ownedGuns = profile.owned.weapons.filter((id) => WEAPONS[id].slot === 'primary' || WEAPONS[id].slot === 'secondary')
  if (!skinWeapon || !ownedGuns.includes(skinWeapon)) skinWeapon = profile.loadout.primary
  const pills = ownedGuns.map((id) => `<button class="pill o${id === skinWeapon ? ' on' : ''}" data-gun="${id}">${WEAPONS[id].name}</button>`).join('')
  const cards = Object.entries(SKINS)
    .map(([sid, s]) => {
      const own = owns('skins', sid)
      const eq = skinFor(skinWeapon) === sid
      let btn
      if (eq) btn = `<button class="buy equipped o" disabled>Equipped</button>`
      else if (own) btn = `<button class="buy owned o" data-equip="${sid}">Apply</button>`
      else btn = `<button class="buy ${profile.coins >= s.price ? 'price' : 'cant'} o" data-buy="${sid}">${coinImg()}${fmtN(s.price)}</button>`
      return `<div class="card${eq ? ' sel' : ''}"><div class="pic"><img alt="" src="${weaponIcon(skinWeapon, sid)}"></div><div class="nm o">${s.name}</div><div class="sub">${own ? 'Owned · works on every gun' : 'Unlocks for every gun'}</div>${btn}</div>`
    })
    .join('')
  const win = frame('Weapons Store', `<div class="pillsel">${pills}</div><div class="grid">${cards}</div>`, [['weapons', 'Weapons'], ['skins', 'Skins']], 'skins')
  wireTabs(win)
  win.querySelectorAll('[data-gun]').forEach((b) =>
    b.addEventListener('click', () => {
      skinWeapon = b.dataset.gun
      skinsWindow()
    }),
  )
  win.querySelectorAll('[data-buy]').forEach((b) =>
    b.addEventListener('click', () => {
      const ok = buySkin(b.dataset.buy)
      if (ok) equipSkin(skinWeapon, b.dataset.buy)
      bought(ok)
    }),
  )
  win.querySelectorAll('[data-equip]').forEach((b) =>
    b.addEventListener('click', () => {
      equipSkin(skinWeapon, b.dataset.equip)
      sfx.equip()
      skinsWindow()
      cb.onLoadout?.()
    }),
  )
}

function wireTabs(win) {
  win.querySelectorAll('[data-tab]').forEach((b) =>
    b.addEventListener('click', () => {
      current = { kind: 'weapons', opt: b.dataset.tab }
      weaponsWindow(b.dataset.tab)
    }),
  )
}

const STORE_ICON = { medkit: SVG.medkit, wall: SVG.wall, frag: SVG.frag, armor: SVG.vest, emote: SVG.emote }
function storeWindow() {
  const cards = STORE.map((it) => {
    let state = ''
    let btn
    if (it.type === 'upgrade') {
      const lv = upgradeLevel(it.id)
      state = `<div class="pips">${Array.from({ length: it.max }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</div>`
      if (lv >= it.max) btn = `<button class="buy equipped o" disabled>Maxed</button>`
    }
    if (it.type === 'emote' && owns('emotes', it.emote)) btn = `<button class="buy equipped o" disabled>Owned</button>`
    if (!btn) btn = `<button class="buy ${profile.coins >= it.price ? 'price' : 'cant'} o" data-buy="${it.id}">${coinImg()}${fmtN(it.price)}</button>`
    return `<div class="card"><div class="pic"><img class="icon" alt="" src="${svgData(STORE_ICON[it.icon] || SVG.coin)}"></div><div class="nm o">${it.name}</div><div class="desc">${it.desc}</div>${state}${btn}</div>`
  }).join('')
  const win = frame('Store', `<div class="grid">${cards}</div><div class="hint">Everything here is bought with coins you earn by playing.</div>`)
  win.querySelectorAll('[data-buy]').forEach((b) => b.addEventListener('click', () => bought(buyStoreItem(b.dataset.buy))))
}

function charactersWindow() {
  const cards = Object.entries(OPERATIVES)
    .map(([id, o]) => {
      const own = owns('operatives', id)
      const eq = profile.loadout.operative === id
      let btn
      if (eq) btn = `<button class="buy equipped o" disabled>Selected</button>`
      else if (own) btn = `<button class="buy owned o" data-equip="${id}">Select</button>`
      else btn = `<button class="buy ${profile.coins >= o.price ? 'price' : 'cant'} o" data-buy="${id}">${coinImg()}${fmtN(o.price)}</button>`
      return `<div class="card${eq ? ' sel' : ''}"><div class="opface o" style="background:linear-gradient(160deg, ${o.color}, #1b1f2e)">${o.name[0]}</div><div class="nm o" style="text-align:center">${o.name}</div><div class="sub" style="text-align:center">${o.role}</div><div class="desc"><b style="color:${o.color}">${o.ability} (Q)</b><br>${o.desc}</div>${btn}</div>`
    })
    .join('')
  const win = frame('Characters', `<div class="grid">${cards}</div><div class="hint">Your operative's ability charges over time and faster when you deal damage. Press Q (or the diamond) when it glows.</div>`)
  win.querySelectorAll('[data-buy]').forEach((b) =>
    b.addEventListener('click', () => {
      const ok = buyOperative(b.dataset.buy)
      if (ok) equipOperative(b.dataset.buy)
      bought(ok)
    }),
  )
  win.querySelectorAll('[data-equip]').forEach((b) =>
    b.addEventListener('click', () => {
      equipOperative(b.dataset.equip)
      sfx.equip()
      charactersWindow()
    }),
  )
}

function inventoryWindow() {
  const lo = profile.loadout
  const gun = (id) => `<div class="card sel"><div class="pic"><img alt="" src="${weaponIcon(id, skinFor(id))}"></div><div class="nm o">${WEAPONS[id].name}</div><div class="sub">${SKINS[skinFor(id)].name} skin</div><button class="buy owned o" data-go="weapons">Change</button></div>`
  const op = OPERATIVES[lo.operative]
  const emotes = profile.owned.emotes.map((e) => `<button class="pill o${lo.emote === e ? ' on' : ''}" data-emote="${e}">${e[0].toUpperCase() + e.slice(1)}</button>`).join('')
  const ups = STORE.filter((s) => s.type === 'upgrade').map((s) => `<div><span>${s.name}</span><b class="o">Lv ${upgradeLevel(s.id)}/${s.max}</b></div>`).join('')
  const st = profile.stats
  const r = rankOf()
  const body = `
    <div class="section-t o">Loadout</div>
    <div class="grid">${gun(lo.primary)}${gun(lo.secondary)}
      <div class="card sel"><div class="opface o" style="background:linear-gradient(160deg, ${op.color}, #1b1f2e)">${op.name[0]}</div><div class="nm o" style="text-align:center">${op.name}</div><div class="sub" style="text-align:center">${op.ability}</div><button class="buy owned o" data-go="characters">Change</button></div>
    </div>
    <div class="section-t o">Emote (Z)</div><div class="pillsel">${emotes}</div>
    <div class="section-t o">Supplies</div>
    <div class="kv">${ups}</div>
    <div class="section-t o">Career</div>
    <div class="kv"><div><span>Rank</span><b class="o" style="color:${r.color}">${r.name}</b></div><div><span>Rank points</span><b class="o">${profile.rp}</b></div><div><span>Matches</span><b class="o">${st.matches}</b></div><div><span>Wins</span><b class="o">${st.wins}</b></div><div><span>Eliminations</span><b class="o">${st.eliminations}</b></div><div><span>Damage</span><b class="o">${fmtN(st.damage)}</b></div><div><span>Best match</span><b class="o">${st.best}</b></div><div><span>K/D</span><b class="o">${(st.eliminations / Math.max(1, st.deaths)).toFixed(2)}</b></div></div>
  `
  const win = frame('Inventory', body)
  win.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => open(b.dataset.go)))
  win.querySelectorAll('[data-emote]').forEach((b) =>
    b.addEventListener('click', () => {
      equipEmote(b.dataset.emote)
      cb.onEmote?.(b.dataset.emote)
      sfx.equip()
      inventoryWindow()
    }),
  )
}

function settingsWindow() {
  const q = cb.getQuality?.() ?? 'High'
  const sens = cb.getSensitivity?.() ?? 1
  const vol = Number(localStorage.getItem('ffz.volume') ?? 0.8)
  const body = `
    <div class="setting"><span>Sound</span><div class="row"><input type="range" min="0" max="1" step="0.05" value="${vol}" data-k="vol"><button class="pill o${isMuted() ? ' on' : ''}" data-k="mute">${isMuted() ? 'Muted' : 'Mute'}</button></div></div>
    <div class="setting"><span>Graphics</span><div class="pillsel">${Object.keys(GRAPHICS_PRESETS).map((k) => `<button class="pill o${k === q ? ' on' : ''}" data-q="${k}">${k}</button>`).join('')}</div></div>
    <div class="setting"><span>Look sensitivity</span><input type="range" min="0.2" max="3" step="0.05" value="${sens}" data-k="sens"></div>
    <div class="section-t o">Controls</div>
    <div class="keys">
      <div><kbd>WASD</kbd>Move</div><div><kbd>Mouse</kbd>Look (click to grab)</div><div><kbd>LMB</kbd>Fire</div><div><kbd>RMB</kbd>Aim / scope</div>
      <div><kbd>Shift</kbd>Sprint</div><div><kbd>Space</kbd>Jump</div><div><kbd>C</kbd>Crouch</div><div><kbd>R</kbd>Reload</div>
      <div><kbd>1-4</kbd>/ wheel Weapons</div><div><kbd>G</kbd>Frost wall</div><div><kbd>T</kbd>Frag grenade</div><div><kbd>X</kbd>Medkit</div>
      <div><kbd>F</kbd>Dash</div><div><kbd>Q</kbd>Ability</div><div><kbd>E</kbd>Open / hold to revive</div><div><kbd>Z</kbd>Emote</div>
      <div><kbd>M</kbd>Map</div><div><kbd>Tab</kbd>Scoreboard</div><div><kbd>Esc</kbd>Free the cursor / menu</div>
    </div>
    <div class="hint">On phones: left thumb moves, drag on the right to look, hold FIRE (drag it to aim while shooting). ${account.saved ? 'Progress is saved to your Bloxity account.' : 'Sign in to Bloxity to keep your progress.'}</div>`
  const win = frame('Settings', body)
  win.querySelector('[data-k="vol"]').addEventListener('input', (e) => {
    setVolume(Number(e.target.value))
    try {
      localStorage.setItem('ffz.volume', e.target.value)
    } catch {
      // Storage blocked.
    }
  })
  win.querySelector('[data-k="mute"]').addEventListener('click', () => {
    setMuted(!isMuted())
    settingsWindow()
  })
  win.querySelector('[data-k="sens"]').addEventListener('input', (e) => cb.setSensitivity?.(Number(e.target.value)))
  win.querySelectorAll('[data-q]').forEach((b) =>
    b.addEventListener('click', () => {
      cb.setQuality?.(b.dataset.q)
      settingsWindow()
    }),
  )
}

function modeWindow() {
  const cards = Object.entries(MATCH_MODES)
    .map(([id, m]) => `<div class="card${profile.mode === id ? ' sel' : ''}"><div class="opface o" style="background:linear-gradient(160deg,#ffcf3d,#c77d00);color:#fff">${m.teamSize}v${m.teamSize}</div><div class="nm o" style="text-align:center">${m.name}</div><div class="desc" style="text-align:center">${m.desc}<br>${Math.round(m.duration / 60)} min · first to ${m.scoreToWin}</div><button class="buy ${profile.mode === id ? 'equipped' : 'owned'} o" data-mode="${id}">${profile.mode === id ? 'Selected' : 'Select'}</button></div>`)
    .join('')
  const win = frame('Game Mode', `<div class="grid">${cards}</div>`)
  win.querySelectorAll('[data-mode]').forEach((b) =>
    b.addEventListener('click', () => {
      setMode(b.dataset.mode)
      sfx.equip()
      close()
    }),
  )
}

// --- Waiting / map vote (after PLAY) ----------------------------------------------------------------
// info: { phase, left, ready, need, votes[], mine, maps[] } from the room (main.js queueInfo).
let queueKey = ''
function showQueue(info) {
  const key = JSON.stringify([info.phase, Math.ceil(info.left), info.ready, info.votes, info.mine])
  if (current?.kind === 'queue' && modal.classList.contains('on') && key === queueKey) return
  queueKey = key
  const voting = info.phase === 'vote'
  const art = (m) => `linear-gradient(180deg, ${m.tint}cc, #0b1222cc), url(${cb.mapThumb?.() || ''})`
  let body
  if (voting) {
    body = `<div class="vote"><div class="maps">${info.maps
      .map((m, i) => `<button class="map${i === info.mine ? ' sel' : ''}" data-i="${i}"><div class="art" style="background-image:${art(m)}"></div><div class="nm o">${m.name}</div><div class="vc o">${info.votes[i]} vote${info.votes[i] === 1 ? '' : 's'}</div></button>`)
      .join('')}</div><div class="hint">Vote for the time of day · the round starts in ${Math.max(0, Math.ceil(info.left))} s · ${info.ready} players ready</div></div>`
  } else if (info.phase === 'results' || info.phase === 'intro' || info.phase === 'countdown' || info.phase === 'playing' || info.phase === 'ending') {
    body = `<div class="queue"><div class="big o">Next round soon</div><div class="hint">A round is finishing on this server. You'll be in the next one.</div></div>`
  } else {
    const missing = Math.max(0, info.need - info.ready)
    body = `<div class="queue"><div class="spinner"></div><div class="big o">Waiting for players</div><div class="hint">${info.ready} / ${info.need} ready — the round starts as soon as ${missing === 1 ? 'one more player joins' : `${missing} more players join`}. Real players only: invite friends from the Bloxity menu.</div></div>`
  }
  current = { kind: 'queue' }
  const win = frame(voting ? 'Map Voting' : 'Online Match', `${body}<button class="buy owned o leaveq">Back to lobby</button>`)
  modal.dataset.locked = '1'
  win.querySelector('.win-x').style.visibility = 'hidden'
  win.querySelectorAll('.map').forEach((b) =>
    b.addEventListener('click', () => {
      sfx.equip()
      cb.onVote?.(Number(b.dataset.i))
    }),
  )
  win.querySelector('.leaveq').addEventListener('click', () => cb.onLeaveQueue?.())
}

function hideQueue() {
  if (current?.kind === 'queue' && modal.classList.contains('on')) close()
  queueKey = ''
}

// --- Loading screen ---------------------------------------------------------------------------------
let loadingEl = null
const TIPS = [
  'Frost walls (G) block bullets — throw one before you heal.',
  'Hold E next to a knocked teammate to revive them.',
  'Headshots deal double damage. Helmets cut it down.',
  'Supply drops land with a red beam: they hold level 3 armour.',
  'The zone shrinks in phases — watch the timer under the score.',
  'Crouching (C) tightens your spread.',
]
export function showLoading(on, step = '', progress = 0) {
  if (!loadingEl) {
    loadingEl = h('div', 'loading')
    loadingEl.innerHTML = `<div class="box"><div class="title o">${GAME_TITLE.replace(/Zone$/, '<span>Zone</span>')}</div><div class="bar"><i></i></div><div class="step o"></div><div class="tip o"></div></div>`
    document.body.appendChild(loadingEl)
  }
  loadingEl.classList.toggle('on', on)
  loadingEl.querySelector('.step').textContent = step
  loadingEl.querySelector('.bar i').style.width = `${Math.round(progress * 100)}%`
  if (on && !loadingEl.dataset.tip) loadingEl.dataset.tip = loadingEl.querySelector('.tip').textContent = `Tip: ${TIPS[Math.floor(Math.random() * TIPS.length)]}`
  if (!on) delete loadingEl.dataset.tip
}

const lobby = {
  show(on) {
    root.classList.toggle('on', on)
    if (on) refresh()
    else if (modal.classList.contains('on')) close()
  },
  refresh,
  close,
  showQueue,
  hideQueue,
  setRoster,
  status: setStatus,
  squad: () => roomPlayers.filter((m) => !m.me),
}
export default lobby
