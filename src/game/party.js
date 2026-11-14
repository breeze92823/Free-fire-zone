// The lobby team (squad): the "Players online" dock on the right (tap + to invite someone in this
// server), incoming invitations with Accept / Decline, the team banner, the names + status over the
// teammates on the 3D platform, and the messages ("Mike is currently in a game ...").
// The server (backend MatchRoom) owns all of it: invites, answers, the 3-player limit, the leader.
// Synced per player: `squad` (id, "" = solo) and `squadLead`; messages: `invite`, `inviteEnd`,
// `squadNote` (see the backend's docs/protocol.md "Squad").
import './party.css'
import { MATCH_MODES, NET } from '../config.js'
import * as bloxity from '../bloxity.js'
import { onNet, send } from '../net.js'
import { sfx } from '../audio/index.js'
import { portrait } from './characters.js'
import { outfitForId } from './online.js'
import { profile } from './save.js'

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const SIZE = () => NET.teamMax || 3
const INVITE_WAIT_MS = 21000 // a little over the server's INVITE_TTL_S, then the + comes back

// What a squadNote says (the server sends { kind, name }).
const NOTES = {
  sent: (n) => `Invitation sent to ${n}.`,
  busy: (n) => `${n} is currently in a game and cannot view invitations at this time.`,
  youBusy: () => "You can't invite players while you are in the queue.",
  inTeam: (n) => `${n} is already in another team.`,
  sameTeam: (n) => `${n} is already in your team.`,
  full: () => `Your team is full (${SIZE()} players max).`,
  dup: (n) => `You already invited ${n}.`,
  declined: (n) => `${n} declined your invitation.`,
  expired: (n) => `${n} did not answer your invitation.`,
  joined: (n) => `${n} joined your team!`,
  welcome: (n) => `You joined ${n}'s team!`,
  left: (n) => `${n} left the team.`,
  kicked: (n) => `${n} was removed from the team.`,
  youKicked: () => 'You were removed from the team.',
  disbanded: (n) => `${n} left. The team was disbanded.`,
  leader: () => 'You are now the team leader.',
  notLeader: () => 'Only the team leader can start the match.',
  gone: () => 'That invitation is no longer valid.',
  youInTeam: () => 'You are already in a team.',
  teamFull: () => 'That team is already full.',
}
// Which notes mean "this invite did not go through" (the + comes back at once).
const REFUSED = new Set(['busy', 'inTeam', 'sameTeam', 'full', 'dup', 'declined', 'expired', 'joined'])
const GOOD = new Set(['sent', 'joined', 'welcome', 'leader'])

let under = null // dock, banner, plates (below the lobby windows)
let over = null // invitations + messages (above them)
let dock = null
let rootEl = null
let list = [] // the roster: [{ id, name, pfp, inMatch, team, squad, squadLead, me, ... }]
let open = false // the "Players online" list is expanded
let dockKey = ''
let platesKey = ''
let bannerKey = ''
const pending = new Map() // sessionId -> ms until which my invite waits for an answer
const invites = new Map() // id -> { id, from, name, pfp, size, until }

const statusOf = (m) => (m.inMatch ? (m.team ? 'playing' : 'queue') : 'lobby')
const STATUS_TEXT = { playing: 'Playing', queue: 'In queue', lobby: 'In the lobby' }
const now = () => performance.now()

export function initParty(root) {
  rootEl = root
  under = document.createElement('div')
  under.className = 'pt-under'
  under.innerHTML = `<div class="pt-banner o"></div><div class="pt-plates"></div><div class="pt-dock"></div>`
  over = document.createElement('div')
  over.className = 'pt-over'
  over.innerHTML = `<div class="pt-invites"></div><div class="pt-toasts"></div>`
  root.insertBefore(under, root.querySelector('.lb-modal'))
  root.appendChild(over)
  dock = under.querySelector('.pt-dock')
  dock.addEventListener('click', onDockClick)
  over.querySelector('.pt-invites').addEventListener('click', onInviteClick)

  onNet('invite', (m) => {
    if (!m || typeof m.id !== 'number') return
    invites.set(m.id, { id: m.id, from: m.from, name: m.name || 'Player', pfp: m.pfp || '', size: m.size || 1, until: now() + (m.ttl || 20) * 1000 })
    sfx.equip?.()
    renderInvites()
  })
  onNet('inviteEnd', (m) => {
    if (invites.delete(m?.id)) renderInvites()
  })
  onNet('squadNote', (m) => {
    const text = NOTES[m?.kind]?.(m?.name || 'Player')
    if (!text) return
    if (REFUSED.has(m.kind) && m.name) for (const [sid] of [...pending]) if (list.find((x) => x.id === sid)?.name === m.name) pending.delete(sid)
    if (m.kind === 'youBusy') pending.clear()
    toast(text, GOOD.has(m.kind) ? 'good' : 'info')
    GOOD.has(m.kind) ? sfx.equip?.() : sfx.deny?.()
    dockKey = ''
    render()
  })
}

// --- State from the roster ----------------------------------------------------------------------------
function derive() {
  const mine = list.find((m) => m.me) || null
  const squad = mine?.squad || ''
  const mates = squad ? list.filter((m) => !m.me && m.squad === squad) : []
  return { mine, squad, mates, size: squad ? mates.length + 1 : 0, lead: !!(mine && mine.squadLead), busy: !!mine?.inMatch }
}

// { size (0 = solo), lead, busy, mates } for the lobby (PLAY / Leave the team) and the platform.
export function info() {
  return derive()
}

// The room (online.js roster()), about 4 times a second while the lobby shows.
export function setRoster(next) {
  list = next || []
  const t = now()
  for (const [sid, until] of [...pending]) if (until < t || !list.some((m) => m.id === sid)) pending.delete(sid)
  for (const [id, inv] of [...invites]) if (inv.until < t) invites.delete(id)
  render()
  renderInvites()
}

// --- Dock: the strip of portraits and the "Players online" list ----------------------------------------
function face(m) {
  const src = m.me && bloxity.getPfp() ? bloxity.getPfp() : m.pfp
  return src ? esc(src) : portrait(outfitForId(m.id))
}

function render() {
  if (!dock) return
  const d = derive()
  const others = list.filter((m) => !m.me && !(d.squad && m.squad === d.squad))
  const canInvite = !d.busy && d.size < SIZE()
  const mode = MATCH_MODES[profile.mode] ?? MATCH_MODES.clash

  // Banner.
  const banner = d.size ? `You are in a team · MODE: ${mode.name} · ${d.size}/${SIZE()}` : ''
  if (banner !== bannerKey) {
    bannerKey = banner
    const b = under.querySelector('.pt-banner')
    b.textContent = banner
    b.classList.toggle('on', !!banner)
  }
  rootEl.classList.toggle('in-team', d.size > 0)

  const plus = (m) => {
    if (!canInvite) return ''
    if (pending.has(m.id)) return `<span class="pt-sent o">Sent</span>`
    return `<button class="pt-add" data-inv="${esc(m.id)}" title="Invite ${esc(m.name || 'Player')} to your team" aria-label="Invite ${esc(m.name || 'Player')}">+</button>`
  }
  const kick = (m) => (d.lead && !d.busy ? `<button class="pt-kick" data-kick="${esc(m.id)}" title="Remove from the team" aria-label="Remove ${esc(m.name || 'Player')} from the team">&times;</button>` : '')
  const dot = (m) => `<i class="pt-dot s-${statusOf(m)}" title="${STATUS_TEXT[statusOf(m)]}"></i>`

  // Collapsed strip: me, the team, then the others with a +.
  const tiles = []
  if (d.mine) tiles.push(`<div class="pt-tile me${d.lead ? ' lead' : ''}"><img alt="" src="${face(d.mine)}">${d.lead ? '<b class="pt-crown" title="Team leader">&#9819;</b>' : ''}</div>`)
  if (d.mates.length) tiles.push(`<div class="pt-lbl o">In your team</div>`)
  for (const m of d.mates) tiles.push(`<div class="pt-tile mate${m.squadLead ? ' lead' : ''}" title="${esc(m.name)} · ${STATUS_TEXT[statusOf(m)]}"><img alt="" src="${face(m)}">${dot(m)}${m.squadLead ? '<b class="pt-crown">&#9819;</b>' : ''}${kick(m)}</div>`)
  for (const m of others.slice(0, 4)) tiles.push(`<div class="pt-tile" title="${esc(m.name)} · ${STATUS_TEXT[statusOf(m)]}"><img alt="" src="${face(m)}">${dot(m)}${plus(m)}</div>`)
  if (others.length > 4) tiles.push(`<div class="pt-more o">+${others.length - 4}</div>`)

  // Expanded list: everyone in this server.
  const row = (m, extra = '') =>
    `<div class="pt-row${m.me ? ' me' : ''}"><img alt="" src="${face(m)}"><div class="nm"><b>${esc(m.name || 'Player')}${m.me ? ' (you)' : ''}${m.squadLead ? ' <em title="Team leader">&#9819;</em>' : ''}</b><small class="s-${statusOf(m)}">${STATUS_TEXT[statusOf(m)]}</small></div>${extra}</div>`
  const rows = []
  if (d.mine) rows.push(row(d.mine))
  for (const m of d.mates) rows.push(row(m, kick(m) || '<span class="pt-tag">In your team</span>'))
  for (const m of others) rows.push(row(m, plus(m)))
  if (!others.length && !d.mates.length) rows.push(`<div class="pt-empty">No other players online yet. Share the game with friends!</div>`)

  const key = JSON.stringify([open, tiles, rows, canInvite])
  if (key === dockKey) return
  dockKey = key
  dock.classList.toggle('open', open)
  dock.innerHTML = `<div class="pt-tiles">${tiles.join('')}</div>
    <div class="pt-list"><div class="pt-h o">Players online</div><div class="pt-rows">${rows.join('')}</div></div>
    <button class="pt-toggle" aria-label="${open ? 'Hide' : 'Show'} players online" aria-expanded="${open}"><span></span></button>`
  renderPlates(d)
}

function onDockClick(e) {
  const btn = e.target.closest('button')
  if (!btn) return
  if (btn.classList.contains('pt-toggle')) {
    open = !open
    sfx.click?.()
    dockKey = ''
    return render()
  }
  if (btn.dataset.inv) return invite(btn.dataset.inv)
  if (btn.dataset.kick) {
    send('kick', { t: btn.dataset.kick })
    sfx.deny?.()
  }
}

function invite(sid) {
  const m = list.find((x) => x.id === sid)
  if (!m || pending.has(sid)) return
  if (!send('invite', { to: sid })) return toast('Not connected to the game server.', 'info')
  pending.set(sid, now() + INVITE_WAIT_MS)
  sfx.equip?.()
  dockKey = ''
  render()
}

// --- Incoming invitations -------------------------------------------------------------------------------
let invKey = ''
function renderInvites() {
  if (!over) return
  const cards = [...invites.values()].slice(0, 3)
  const key = cards.map((c) => c.id).join(',')
  if (key === invKey) return
  invKey = key
  over.querySelector('.pt-invites').innerHTML = cards
    .map(
      (c) => `<div class="pt-inv" data-id="${c.id}" style="--ttl:${Math.max(1, Math.round((c.until - now()) / 1000))}s">
        <img alt="" src="${c.pfp ? esc(c.pfp) : portrait(outfitForId(c.from))}">
        <div class="tx"><b class="o">${esc(c.name)}</b><span>invited you to their team${c.size > 1 ? ` (${c.size}/${SIZE()})` : ''}</span></div>
        <div class="acts"><button class="yes o" data-yes="${c.id}">Accept</button><button class="no o" data-no="${c.id}">Decline</button></div>
        <i class="bar"></i></div>`,
    )
    .join('')
}

function onInviteClick(e) {
  const btn = e.target.closest('button')
  if (!btn) return
  const id = Number(btn.dataset.yes ?? btn.dataset.no)
  if (!invites.has(id)) return
  const accept = btn.dataset.yes !== undefined
  send('inviteReply', { id, accept })
  invites.delete(id)
  sfx.click?.()
  renderInvites()
}

// --- Messages -------------------------------------------------------------------------------------------
export function toast(text, kind = 'info') {
  if (!over) return
  const box = over.querySelector('.pt-toasts')
  const el = document.createElement('div')
  el.className = `pt-toast ${kind}`
  el.textContent = text
  box.appendChild(el)
  while (box.children.length > 4) box.firstChild.remove()
  setTimeout(() => el.classList.add('out'), 4200)
  setTimeout(() => el.remove(), 4700)
}

// --- Names over the teammates on the platform -----------------------------------------------------------
// anchors: [{ x, y, on }] in px for [me, ...mates in the platform's order] (lobbyScene.anchors()).
function renderPlates(d) {
  const box = under.querySelector('.pt-plates')
  const people = d.size ? [d.mine, ...d.mates] : []
  const key = people.map((m) => `${m.id}|${m.name}|${statusOf(m)}|${m.squadLead}|${m.me}`).join(';')
  if (key === platesKey) return
  platesKey = key
  box.innerHTML = people
    .map((m) =>
      m.me
        ? `<div class="pt-plate me"><div class="in">${m.squadLead ? '<div class="pt-lead o">LEADER</div>' : ''}</div></div>`
        : `<div class="pt-plate"><div class="in">${m.squadLead ? '<div class="pt-lead o">LEADER</div>' : ''}<div class="card"><b class="o">${esc(m.name || 'Player')}</b><small class="s-${statusOf(m)}">${STATUS_TEXT[statusOf(m)]}</small></div></div></div>`,
    )
    .join('')
}

export function placePlates(anchors) {
  if (!under || !platesKey) return
  const els = under.querySelector('.pt-plates').children
  for (let i = 0; i < els.length; i++) {
    const a = anchors?.[i]
    const el = els[i]
    if (!a || !a.on) {
      el.style.display = 'none'
      continue
    }
    el.style.display = ''
    const t = `translate(${a.x.toFixed(1)}px, ${a.y.toFixed(1)}px)`
    if (el.dataset.t !== t) {
      el.dataset.t = t
      el.style.transform = t
    }
  }
}

export default { initParty, setRoster, info, toast, placePlates }
