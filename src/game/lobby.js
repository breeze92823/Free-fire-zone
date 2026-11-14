// The lobby UI over the 3D hangar: profile, coins, Gems and rank on top; Weapons
// Store, Store, Characters and Inventory on the left; the squad and the
// mode + PLAY button on the right; and the windows behind them. Skins, operatives
// and the Store cost coins; the Weapons Store (weapons, grenades, the pass) costs the
// game's own Gems. Both are earned in matches only (never premium currency).
// Also the waiting / map-vote panel after PLAY (the room's server runs the
// rounds: real players only) and the loading screen.
import './lobby.css'
import { GRENADES, MATCH_MODES, NET, OPERATIVES, PASSES, SKINS, STORE, WEAPONS, WEAPON_CATS, GAME_TITLE, QUALITY_OPTIONS } from '../config.js'
import * as bloxity from '../bloxity.js'
import { sfx, setVolume, isMuted, setMuted } from '../audio/index.js'
import { SVG, itemIcon, svgData, weaponIcon } from './icons.js'
import { portrait, randomOutfit } from './characters.js'
import party, { initParty } from './party.js'
import { account, buyGrenade, buyOperative, buyPass, buySkin, buyStoreItem, buyWeapon, equipEmote, equipGrenade, equipOperative, equipSkin, equipWeapon, onProfile, owns, profile, rankOf, setMode, skinFor, upgradeLevel } from './save.js'

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
      <div class="chip gems" title="Gems: earned by eliminating and knocking enemies (never sold)"><img alt="" src="${svgData(SVG.gem)}"><span class="v o">0</span></div>
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
    <div class="lb-play">
      <button class="lb-mode"><span class="mi">6v6</span><span><div class="mt o"></div><div class="md"></div></span></button>
      <button class="playbtn o">PLAY</button>
    </div>
    <div class="lb-stats"></div>
    <button class="lb-leave o"><span>Leave the team</span></button>
    <div class="lb-net o"></div>
    <div class="lb-modal"></div>
  `
  document.body.appendChild(root)
  modal = root.querySelector('.lb-modal')
  root.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => open(b.dataset.open)))
  root.querySelector('.settings').addEventListener('click', () => open('settings'))
  root.querySelector('.lb-mode').addEventListener('click', () => open('mode'))
  initParty(root)
  root.querySelector('.playbtn').addEventListener('click', () => {
    if (root.classList.contains('queued')) return reopenQueue()
    // In a team only its leader starts the match (the server enforces it too).
    if (party.info().size > 0 && !party.info().lead) return party.toast('Only the team leader can start the match.')
    cb.onPlay?.()
  })
  root.querySelector('.chip.profile').addEventListener('click', () => open('inventory'))
  // "Leave the team": out of the team (and its queue); alone it just leaves the queue.
  root.querySelector('.lb-leave').addEventListener('click', () => (party.info().size > 0 ? cb.onLeaveTeam?.() : cb.onLeaveQueue?.()))
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
    bar.classList.toggle('dropped', room < 230)
    if (room < 230) {
      root.style.setProperty('--res-right', '0px')
      bar.style.top = `${bottom + 6}px`
    } else {
      root.style.setProperty('--res-right', `${right}px`)
      bar.style.top = ''
    }
    void toolbarBottom
    root.style.setProperty('--res-bottom', `${bottom}px`)
    // The Weapons Store fills the screen: it starts under the toolbar when the toolbar spans the top.
    root.style.setProperty('--res-tool', `${room < 230 ? toolbarBottom : 0}px`)
  })
  onProfile(refresh)
  refresh()
  return lobby
}

// Everyone in the room (online.js roster()) and the connection state, a few times a second. The
// "Players online" dock and the team are drawn by party.js.
function setRoster(list, status) {
  roomPlayers = list || []
  netStatus = status || netStatus
  if (!root) return
  party.setRoster(roomPlayers)
  syncPlayButton()
  paintNet()
}

// A team member who is not the leader waits for them: PLAY reads "Waiting for leader...".
const waitsForLeader = () => {
  const i = party.info()
  return i.size > 0 && !i.lead
}
function syncPlayButton() {
  const queued = root.classList.contains('queued')
  const wait = !queued && waitsForLeader()
  root.classList.toggle('member-wait', wait)
  if (!queued) setQueued(false)
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
  root.querySelector('.chip.gems .v').textContent = fmtN(profile.gems || 0)
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
  modal.classList.remove('wsm')
  modal.innerHTML = `<div class="win"><div class="win-h"><div class="t o">${title}</div><div class="coins">${coinImg()}<span class="o">${fmtN(profile.coins)}</span></div><button class="win-x o">&times;</button></div>${
    tabs ? `<div class="tabs">${tabs.map(([id, name]) => `<button class="tab o${id === activeTab ? ' on' : ''}" data-tab="${id}">${name}</button>`).join('')}</div>` : ''
  }<div class="win-b">${bodyHtml}</div></div>`
  modal.querySelector('.win-x').addEventListener('click', close)
  modal.classList.add('on')
  return modal.querySelector('.win')
}

export function close() {
  // Closing any window while queued keeps the vote panel shut until the next vote (or the
  // "Map voting..." button).
  if (root?.classList.contains('queued')) queueHidden = true
  if (current?.kind === 'queue') queueState = ''
  modal.classList.remove('on', 'q', 'wsm')
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

// --- Weapons Store (Gems) -------------------------------------------------------------------------
// Categories on the left, the category's items, then the selected item: name, description, a big
// picture, stat bars, TEST (the offline test range) and BUY / EQUIP. Weapons, grenades and the pass
// cost the game's own Gems (earned by playing, never sold). Skins (coins) are one button away.
const gemImg = () => `<img alt="" src="${svgData(SVG.gem)}">`
let wsCat = 'all'
let wsSel = null // { type: 'weapon' | 'grenade', id }
const shopGuns = () => Object.keys(WEAPONS).filter((id) => WEAPONS[id].cat)
function wsItems(cat) {
  const guns = shopGuns()
    .filter((id) => cat === 'all' || WEAPONS[id].cat === cat)
    .sort((a, b) => WEAPONS[a].price - WEAPONS[b].price)
    .map((id) => ({ type: 'weapon', id }))
  const nades = cat === 'all' || cat === 'grenade' ? Object.keys(GRENADES).map((id) => ({ type: 'grenade', id })) : []
  return cat === 'grenade' ? nades : [...guns, ...nades]
}
const wsDef = (it) => (it.type === 'weapon' ? WEAPONS[it.id] : GRENADES[it.id])
// Tile colour: starters / basic grey, the dearer guns purple, specials gold.
function rarity(it) {
  const d = wsDef(it)
  if (it.type === 'weapon' && d.cat === 'special') return 'gold'
  if (d.price >= 1800) return 'epic'
  return 'std'
}
function wsOwned(it) {
  return it.type === 'weapon' ? owns('weapons', it.id) : owns('grenades', it.id)
}
function wsEquipped(it) {
  if (it.type === 'grenade') return (profile.loadout.grenade || 'frag') === it.id
  return profile.loadout.primary === it.id || profile.loadout.secondary === it.id
}
function wsPic(it, w, h) {
  return it.type === 'weapon' ? weaponIcon(it.id, skinFor(it.id), w, h) : itemIcon(it.id, h)
}
function bar(label, v, cls = '') {
  return `<div class="wst${cls ? ` ${cls}` : ''}"><span class="o">${label}</span><i><b style="width:${Math.round(Math.max(0.04, Math.min(1, v)) * 100)}%"></b></i></div>`
}
function wsStats(it) {
  const d = wsDef(it)
  if (it.type === 'grenade') return bar('Damage', d.damage / 240) + bar('Blast radius', d.radius / 9) + bar('Fuse speed', 1 - d.fuse / 3)
  if (d.melee) return bar('Damage', d.damage / 100) + bar('Reach', d.range / 4) + bar('Swing speed', 1 / d.interval / 2.6) + bar('Mobility', (d.speedMul || 1) / 1.2)
  const dmg = d.damage * (d.pellets || 1)
  let html = bar('Damage', dmg / 220) + bar('Fire rate', 1 / d.interval / 17) + bar('Range', d.range / 400)
  if (d.heal) html += bar('Healing', d.heal / 15, 'heal')
  html += bar('Reload speed', 1 - (d.reload - 1) / 3) + bar('Accuracy', 1 - Math.min(1, (d.spread?.[1] ?? 1) / 1.6))
  if (!d.heal) html += bar('Magazine', d.mag / 60)
  return html
}

function weaponsWindow(tab) {
  if (tab === 'skins') return skinsWindow()
  const items = wsItems(wsCat)
  if (!wsSel || !items.some((x) => x.type === wsSel.type && x.id === wsSel.id)) wsSel = items[0]
  const sel = wsSel
  const d = wsDef(sel)
  const own = wsOwned(sel)
  const eq = wsEquipped(sel)
  const pass = PASSES.basic
  const passOwned = owns('passes', 'basic')
  const cats = WEAPON_CATS.map((c) => `<button class="wsc o${c.id === wsCat ? ' on' : ''}" data-cat="${c.id}">${c.name}</button>`).join('')
  const tiles = items
    .map((it) => {
      const on = it.type === sel.type && it.id === sel.id
      const badge = wsEquipped(it) ? '<span class="wb eq o">EQUIPPED</span>' : wsOwned(it) ? '<span class="wb ok o">OWNED</span>' : `<span class="wb pr o">${gemImg()}${fmtN(wsDef(it).price)}</span>`
      return `<button class="wsi ${rarity(it)}${on ? ' on' : ''}" data-type="${it.type}" data-id="${it.id}" title="${esc(wsDef(it).name)}"><img alt="" src="${wsPic(it, 256, 110)}">${badge}<span class="wn o">${esc(wsDef(it).name)}</span></button>`
    })
    .join('')
  let act
  if (eq) act = `<button class="wsb eqd o" disabled>EQUIPPED</button>`
  else if (own) act = `<button class="wsb equip o" data-act="equip">EQUIP${sel.type === 'weapon' ? `<small>${d.slot}</small>` : ''}</button>`
  else act = `<button class="wsb buy o${profile.gems >= d.price ? '' : ' cant'}" data-act="buy"><span class="wsp o">${gemImg()}${fmtN(d.price)}</span>BUY</button>`
  const canTest = sel.type === 'weapon' || sel.type === 'grenade'
  const slotLine = sel.type === 'weapon' ? `${d.slot === 'primary' ? 'Primary' : 'Secondary'} slot${d.tier === 'basic' ? ` · in the ${pass.name}` : ''}` : 'Throwable (T)'
  modal.innerHTML = `<div class="ws">
    <div class="ws-h">
      <div class="ws-gems" title="Gems: earned in matches, never sold">${gemImg()}<span class="o">${fmtN(profile.gems || 0)}</span></div>
      <div class="ws-t o">Weapons Store</div>
      <button class="ws-skins o" data-skins>Skins</button>
      <button class="ws-x o" aria-label="Close">&times;</button>
    </div>
    <div class="ws-pass${passOwned ? ' owned' : ''}">
      <div class="pi o"><svg viewBox="0 0 24 24"><path d="M12 2l2.9 6.2 6.8.8-5 4.6 1.3 6.7L12 17l-6 3.3 1.3-6.7-5-4.6 6.8-.8z" fill="#2a1a00"/></svg>PASS</div>
      <div class="pt"><b class="o">${pass.name}</b><span>${pass.desc}</span></div>
      ${passOwned ? '<span class="pb own o">Owned</span>' : `<button class="pb o${profile.gems >= pass.price ? '' : ' cant'}" data-pass="basic">${gemImg()}${fmtN(pass.price)}</button>`}
    </div>
    <div class="ws-cats">${cats}</div>
    <div class="ws-list">${tiles}</div>
    <div class="ws-main">
      <div class="ws-name o">${esc(d.name)}</div>
      <div class="ws-sub">${slotLine}</div>
      <div class="ws-desc">${esc(d.desc || '')}</div>
      <div class="ws-pic ${rarity(sel)}"><img alt="" src="${wsPic(sel, sel.type === 'weapon' ? 720 : 300, sel.type === 'weapon' ? 310 : 300)}"></div>
      <div class="ws-stats">${wsStats(sel)}</div>
      <div class="ws-act">${canTest ? '<button class="wsb test o" data-act="test">TEST</button>' : ''}${act}</div>
    </div>
  </div>`
  modal.classList.add('on', 'wsm')
  const win = modal.querySelector('.ws')
  win.querySelector('.ws-x').addEventListener('click', close)
  win.querySelector('[data-skins]').addEventListener('click', () => {
    current = { kind: 'weapons', opt: 'skins' }
    skinsWindow()
  })
  win.querySelectorAll('[data-cat]').forEach((b) =>
    b.addEventListener('click', () => {
      wsCat = b.dataset.cat
      wsSel = null
      sfx.click?.()
      weaponsWindow('weapons')
    }),
  )
  win.querySelectorAll('.wsi').forEach((b) =>
    b.addEventListener('click', () => {
      wsSel = { type: b.dataset.type, id: b.dataset.id }
      weaponsWindow('weapons')
    }),
  )
  win.querySelector('[data-pass]')?.addEventListener('click', () => bought(buyPass('basic')))
  win.querySelector('[data-act="buy"]')?.addEventListener('click', () => {
    const ok = sel.type === 'weapon' ? buyWeapon(sel.id) : buyGrenade(sel.id)
    if (ok) {
      if (sel.type === 'weapon') equipWeapon(sel.id)
      else equipGrenade(sel.id)
      cb.onLoadout?.()
    }
    bought(ok)
  })
  win.querySelector('[data-act="equip"]')?.addEventListener('click', () => {
    if (sel.type === 'weapon') equipWeapon(sel.id)
    else equipGrenade(sel.id)
    sfx.equip()
    cb.onLoadout?.()
    weaponsWindow('weapons')
  })
  win.querySelector('[data-act="test"]')?.addEventListener('click', () => {
    close()
    cb.onTestWeapon?.(sel.type === 'weapon' ? sel.id : null, sel.type === 'grenade' ? sel.id : null)
  })
  // Keep the chosen tile in view after a rebuild.
  win.querySelector('.wsi.on')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
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
  const q = cb.getQuality?.() ?? 'Auto'
  const sens = cb.getSensitivity?.() ?? 1
  const vol = Number(localStorage.getItem('ffz.volume') ?? 0.8)
  const body = `
    <div class="setting"><span>Sound</span><div class="row"><input type="range" min="0" max="1" step="0.05" value="${vol}" data-k="vol"><button class="pill o${isMuted() ? ' on' : ''}" data-k="mute">${isMuted() ? 'Muted' : 'Mute'}</button></div></div>
    <div class="setting"><span>Graphics</span><div><div class="pillsel">${QUALITY_OPTIONS.map((k) => `<button class="pill o${k === q ? ' on' : ''}" data-q="${k}">${k}</button>`).join('')}</div><div class="qnote">${q === 'Auto' ? `Matches view distance, textures and detail to this device and keeps the game smooth. Running: <b>${cb.getAutoTier?.() ?? 'High'}</b>` : 'Fixed quality. Texture and detail changes apply after a reload.'}</div></div></div>
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
// info: { phase, left, ready, need, votes[], voters[][], mine, maps[] } from the room (main.js
// queueInfo), every frame while queued. The panel is built once per state (waiting / vote / busy)
// and then patched in place (timer, picks, voter heads) so the map pictures never flicker.
// The X hides it (still queued: the lobby's "Map voting..." button brings it back); a new vote
// opens it again unless another window is up. "Leave the team" (bottom centre) leaves the queue.
const X_SVG = `<svg viewBox="0 0 24 24"><path d="M4 4L20 20M20 4L4 20" stroke="#fff" stroke-width="1.6" stroke-linecap="square"/></svg>`
const HEX = `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="42" height="72.75" viewBox="0 0 42 72.75"><path d="M21 1L40 12v24L21 47 2 36V12zM21 47v26M2 36L-17 47M40 36l19 11M21 1V-25" fill="none" stroke="#ffffff" stroke-opacity="0.05" stroke-width="1.4"/></svg>')}")`
// The frame: dark plate with bevelled corners, an inner gold line and gold glow bars (viewBox 885 x 525).
const FRAME_SVG = `<svg class="mv-frame" viewBox="0 0 885 525" preserveAspectRatio="none" aria-hidden="true">
  <defs>
    <linearGradient id="mvGold" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7d5f1a"/><stop offset=".5" stop-color="#f7d873"/><stop offset="1" stop-color="#7d5f1a"/></linearGradient>
    <linearGradient id="mvGoldV" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6e5316"/><stop offset=".5" stop-color="#f2cc5c"/><stop offset="1" stop-color="#6e5316"/></linearGradient>
    <linearGradient id="mvPlate" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b1c20"/><stop offset="1" stop-color="#111215"/></linearGradient>
    <filter id="mvGlow" x="-20%" y="-300%" width="140%" height="700%"><feGaussianBlur stdDeviation="3"/></filter>
  </defs>
  <path d="M30 2H330l14 9H541l14-9H855l28 28V495l-28 28H555l-14-9H344l-14 9H30L2 495V30z" fill="url(#mvPlate)" stroke="#4a3f27" stroke-width="4" vector-effect="non-scaling-stroke"/>
  <path d="M38 16H332l12 7H541l12-7H847l22 22V487l-22 22H553l-12-7H344l-12 7H38l-22-22V38z" fill="none" stroke="url(#mvGold)" stroke-width="2.4" vector-effect="non-scaling-stroke"/>
  <path d="M344 4H541" stroke="#ffd65a" stroke-width="6" filter="url(#mvGlow)" vector-effect="non-scaling-stroke"/>
  <path d="M352 5.5H533" stroke="#ffe9a0" stroke-width="3" vector-effect="non-scaling-stroke"/>
  <path d="M344 521H541" stroke="#ffd65a" stroke-width="6" filter="url(#mvGlow)" vector-effect="non-scaling-stroke"/>
  <path d="M352 519.5H533" stroke="#ffe9a0" stroke-width="3" vector-effect="non-scaling-stroke"/>
  <path d="M6 150V450M879 150V450" stroke="url(#mvGoldV)" stroke-width="5" vector-effect="non-scaling-stroke"/>
</svg>`

let queueState = '' // 'vote' | 'wait' | 'busy' while the panel is built
let queueHidden = false // closed with X (or another window): stays shut until the next vote
let queuedPhase = ''
let lastInfo = null
const fmtClock = (s) => {
  const t = Math.max(0, Math.ceil(s))
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
}

function queueKindOf(phase) {
  if (phase === 'vote') return 'vote'
  if (phase === 'waiting') return 'wait'
  return 'busy'
}

function showQueue(info) {
  lastInfo = info
  const kind = queueKindOf(info.phase)
  setQueued(true, kind)
  if (kind !== queuedPhase) {
    // A new vote opens the panel again (unless the player is in a shop window).
    if (kind === 'vote') queueHidden = false
    queuedPhase = kind
  }
  const otherWindow = modal.classList.contains('on') && current && current.kind !== 'queue'
  if (otherWindow || queueHidden) return
  if (current?.kind !== 'queue' || !modal.classList.contains('on') || queueState !== kind) buildQueue(kind, info)
  patchQueue(info)
}

function buildQueue(kind, info) {
  queueState = kind
  current = { kind: 'queue' }
  cb.onWindow?.(true)
  let body
  if (kind === 'vote') {
    const shots = cb.mapShots?.() || []
    body = `<div class="mv-maps">${info.maps
      .map(
        (m, i) => `<button class="mv-card" data-i="${i}">
          <span class="art" style="background-image:url(${shots[i] || cb.mapThumb?.() || ''})"></span>
          <span class="shade"></span>
          <span class="voters"></span>
          <span class="nm">${esc(m.name)}</span>
        </button>`,
      )
      .join('')}</div>`
  } else {
    body = `<div class="mv-wait"><div class="spinner"></div><div class="big"></div><div class="sub"></div></div>`
  }
  modal.innerHTML = `<div class="mv" style='--hex:${HEX}'>${FRAME_SVG}<div class="mv-in">
      <div class="mv-time"></div>
      <div class="mv-t">${kind === 'vote' ? 'Vote for the map' : kind === 'wait' ? 'Waiting for players' : 'Round in progress'}</div>
      ${body}
    </div><button class="mv-x" title="Close">${X_SVG}</button></div>`
  modal.classList.add('on', 'q')
  modal.dataset.locked = '1'
  modal.querySelector('.mv-x').addEventListener('click', () => {
    sfx.click?.()
    close()
  })
  modal.querySelectorAll('.mv-card').forEach((b) =>
    b.addEventListener('click', () => {
      const i = Number(b.dataset.i)
      if (lastInfo?.mine === i) return
      sfx.equip()
      // Show the pick at once; the server's vote follows in the room state.
      if (lastInfo) patchQueue({ ...lastInfo, mine: i })
      cb.onVote?.(i)
    }),
  )
}

function patchQueue(info) {
  const box = modal.querySelector('.mv')
  if (!box) return
  const time = box.querySelector('.mv-time')
  const t = info.phase === 'vote' ? fmtClock(info.left) : ''
  if (time.textContent !== t) time.textContent = t
  if (queueState === 'vote') {
    box.querySelectorAll('.mv-card').forEach((b, i) => {
      b.classList.toggle('sel', i === info.mine)
      const list = info.voters?.[i] || []
      const key = list.map((v) => v.id).join(',')
      const el = b.querySelector('.voters')
      if (el.dataset.k === key) return
      el.dataset.k = key
      el.innerHTML =
        list
          .slice(0, 4)
          .map((v) => `<img alt="" title="${esc(v.name || 'Player')}" class="${v.me ? 'me' : ''}" src="${v.pfp ? esc(v.pfp) : portrait(outfitFor(v.id))}">`)
          .join('') + (list.length > 4 ? `<b class="o">+${list.length - 4}</b>` : '')
    })
  } else {
    const missing = Math.max(0, info.need - info.ready)
    const big = queueState === 'wait' ? `${info.ready} / ${info.need} ready` : 'Next round soon'
    const sub =
      queueState === 'wait'
        ? `The map vote starts as soon as ${missing === 1 ? 'one more player joins' : `${missing} more players join`}. Real players only: invite friends from the Bloxity menu.`
        : "A round is finishing on this server. You'll vote for the next map with everyone."
    const b = box.querySelector('.mv-wait .big')
    const s2 = box.querySelector('.mv-wait .sub')
    if (b.textContent !== big) b.textContent = big
    if (s2.textContent !== sub) s2.textContent = sub
  }
}

// The lobby's own queue controls: the PLAY button turns into "Map voting..." (reopens the panel)
// and "Leave the team" shows at the bottom.
function setQueued(on, kind = '') {
  if (!root) return
  root.classList.toggle('queued', on)
  const wait = !on && waitsForLeader()
  root.classList.toggle('member-wait', wait)
  const label = wait ? 'Waiting for<br>leader...' : !on ? 'PLAY' : kind === 'vote' ? 'Map<br>voting...' : kind === 'wait' ? 'Finding<br>players...' : 'Next<br>round...'
  const btn = root.querySelector('.playbtn')
  if (btn.dataset.label !== label) {
    btn.dataset.label = label
    btn.innerHTML = on || wait ? `<span class="pq">${label}</span>` : label
  }
}

function reopenQueue() {
  if (!lastInfo) return
  if (modal.classList.contains('on') && current?.kind !== 'queue') close()
  queueHidden = false
  queueState = ''
  showQueue(lastInfo)
}

function hideQueue() {
  if (current?.kind === 'queue' && modal.classList.contains('on')) close()
  queueState = ''
  queuedPhase = ''
  queueHidden = false
  lastInfo = null
  setQueued(false)
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
  // Back to the Weapons Store (after the Weapon Test).
  openStore: () => open('weapons', 'weapons'),
  showQueue,
  hideQueue,
  setRoster,
  status: setStatus,
  // Teammates (the lobby team), and the names over them on the platform.
  squad: () => party.info().mates,
  placePlates: party.placePlates,
}
export default lobby
