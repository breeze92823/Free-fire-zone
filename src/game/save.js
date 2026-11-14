// The player's profile: coins, rank points, owned items, loadout, career stats. It lives on the
// game server (backend MatchRoom + MongoDB, per verified Bloxity account); this module mirrors the
// last copy the server sent and asks it for every purchase and equip. Purchases are applied here
// at once (so the shop feels instant) and replaced by the server's answer; a refused one resyncs.
// Everything is bought with coins earned by playing; there is no premium currency. Gems (`gems`)
// are the game's own currency, earned only by playing (knocks / eliminations: the server's `reward`
// message; round results, missions and rank rewards) and never bought with real money or Bloxity Gems.
import { GRENADES, MISSIONS, OPERATIVES, PASSES, RANKS, SKINS, START_PROFILE, STORE, WEAPONS, passWeapons } from '../config.js'
import { onNet, online, send } from '../net.js'

const clone = (o) => JSON.parse(JSON.stringify(o))

export const profile = clone(START_PROFILE)
export const account = { loaded: false, saved: false } // saved: progress is stored for this identity
const listeners = new Set()

function notify() {
  for (const fn of listeners) fn(profile)
}
export function onProfile(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function replace(next) {
  for (const k of Object.keys(profile)) delete profile[k]
  Object.assign(profile, clone(START_PROFILE), clone(next))
  notify()
}

onNet('profile', (msg) => {
  if (!msg?.profile) return
  account.loaded = true
  account.saved = !!msg.saved
  replace(msg.profile)
})
onNet('shop', (msg) => {
  if (msg && !msg.ok) send('getProfile') // refused: the local guess was wrong, take the server's copy
})
onNet('joined', () => send('getProfile'))
// A knock / elimination by this player: the server already added the Gems; mirror its total.
onNet('reward', (msg) => {
  if (!msg || !(msg.gems > 0)) return
  profile.gems = Number.isFinite(msg.total) ? msg.total : (profile.gems || 0) + msg.gems
  notify()
})

// --- Missions (backend progress.ts) -------------------------------------------------------------
const MISSION_DEFS = new Map([...MISSIONS.daily, ...MISSIONS.weekly].map((m) => [m.id, m]))
export const missionDef = (id) => MISSION_DEFS.get(id)
export const missionText = (def) => MISSIONS.text[def.stat].replace('{n}', def.goal.toLocaleString('en-US'))

// The current sets as [{ kind, i, def, n, done, claimed }] (unknown ids skipped).
export function missionList(kind) {
  return (profile.missions?.[kind] || [])
    .map((s, i) => {
      const def = MISSION_DEFS.get(s.id)
      return def && { kind, i, def, n: Math.min(def.goal, s.n | 0), done: (s.n | 0) >= def.goal, claimed: !!s.claimed }
    })
    .filter(Boolean)
}
// How many finished missions wait for their Claim (the lobby's badge).
export const claimable = () => [...missionList('daily'), ...missionList('weekly')].filter((m) => m.done && !m.claimed).length

// Ms until the daily set (next UTC midnight) and the weekly set (next Monday 00:00 UTC) roll over.
export function missionResets(now = Date.now()) {
  const d = new Date(now)
  const midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)
  const toMonday = (8 - d.getUTCDay()) % 7 || 7
  const monday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + toMonday)
  return { daily: midnight - now, weekly: monday - now }
}

// Asks the server for a finished mission's reward; its answer (`claimed`) goes to onClaimed listeners.
export function claimMission(kind, i) {
  if (!online() || !account.loaded) return false
  send('claim', { m: kind, i })
  return true
}
const claimListeners = new Set()
export function onClaimed(fn) {
  claimListeners.add(fn)
  return () => claimListeners.delete(fn)
}
onNet('claimed', (msg) => {
  if (!msg) return
  for (const fn of claimListeners) fn(msg)
})

// The lobby's announcement window (NEWS) was closed: never shown again. Saved on the account by the
// server (profile.newsSeen); this browser keeps a copy too, for guests (nothing saved), a tab closed
// before the server answered, or a save that failed. A newer local copy is sent back to the account.
const NEWS_KEY = 'ffz.newsSeen'
function localNews() {
  try {
    return Number(localStorage.getItem(NEWS_KEY)) || 0
  } catch {
    return 0
  }
}
export function newsSeen() {
  const local = localNews()
  if (local > (profile.newsSeen || 0) && account.loaded) markNewsSeen(local)
  return Math.max(profile.newsSeen || 0, local)
}
export function markNewsSeen(id) {
  if (!(id > (profile.newsSeen || 0))) return
  profile.newsSeen = id
  send('newsSeen', { id })
  try {
    localStorage.setItem(NEWS_KEY, String(id))
  } catch {
    // Storage blocked: the server copy is enough for signed-in players.
  }
}

// The first-round tips are finished or skipped: remembered on the account.
export function finishTutorial() {
  if (profile.tutorial) return
  profile.tutorial = true
  send('tutorialDone')
}

export function rankOf(rp = profile.rp) {
  let i = 0
  for (let r = 0; r < RANKS.length; r++) if (rp >= RANKS[r].rp) i = r
  const cur = RANKS[i]
  const next = RANKS[i + 1]
  return { index: i, ...cur, next, progress: next ? (rp - cur.rp) / (next.rp - cur.rp) : 1 }
}

export const owns = (kind, id) => profile.owned[kind]?.includes(id)
export const upgradeLevel = (id) => profile.upgrades[id] || 0

// Optimistic purchase: true when sent (and applied locally), false when it cannot be bought.
// currency: 'coins' (skins, operatives, Store) or 'gems' (weapons, grenades, passes).
function purchase(kind, id, price, apply, currency = 'coins') {
  if (!online() || !account.loaded || (profile[currency] || 0) < price) return false
  profile[currency] -= price
  apply()
  send('buy', { kind, id })
  notify()
  return true
}

export function buyWeapon(id) {
  const w = WEAPONS[id]
  if (!w || owns('weapons', id)) return false
  return purchase('weapon', id, w.price, () => profile.owned.weapons.push(id), 'gems')
}

export function buyGrenade(id) {
  const g = GRENADES[id]
  if (!g || owns('grenades', id)) return false
  return purchase('grenade', id, g.price, () => profile.owned.grenades.push(id), 'gems')
}

// A pass unlocks every weapon of its tier for good.
export function buyPass(id) {
  const pass = PASSES[id]
  if (!pass || owns('passes', id)) return false
  return purchase('pass', id, pass.price, () => {
    profile.owned.passes.push(id)
    for (const w of passWeapons(id)) if (!profile.owned.weapons.includes(w)) profile.owned.weapons.push(w)
  }, 'gems')
}

// Skins are per account and apply to any weapon.
export function buySkin(id) {
  const s = SKINS[id]
  if (!s || owns('skins', id)) return false
  return purchase('skin', id, s.price, () => profile.owned.skins.push(id))
}

export function buyOperative(id) {
  const o = OPERATIVES[id]
  if (!o || owns('operatives', id)) return false
  return purchase('operative', id, o.price, () => profile.owned.operatives.push(id))
}

export function buyStoreItem(id) {
  const item = STORE.find((s) => s.id === id)
  if (!item) return false
  if (item.type === 'upgrade' && upgradeLevel(id) >= item.max) return false
  if (item.type === 'emote' && owns('emotes', item.emote)) return false
  return purchase('store', id, item.price, () => {
    if (item.type === 'upgrade') profile.upgrades[id] = upgradeLevel(id) + 1
    else if (item.type === 'emote') profile.owned.emotes.push(item.emote)
  })
}

function equip(kind, id, apply, extra = {}) {
  apply()
  send('equip', { kind, id, ...extra })
  notify()
}

export function equipWeapon(id) {
  const w = WEAPONS[id]
  if (!w || !owns('weapons', id)) return
  equip('weapon', id, () => {
    if (w.slot === 'primary') profile.loadout.primary = id
    else if (w.slot === 'secondary') profile.loadout.secondary = id
    else if (w.slot === 'melee') profile.loadout.melee = id
  })
}
export function equipSkin(weaponId, skinId) {
  if (!owns('skins', skinId)) return
  equip('skin', skinId, () => (profile.loadout.skin[weaponId] = skinId), { weapon: weaponId })
}
export function equipOperative(id) {
  if (!owns('operatives', id)) return
  equip('operative', id, () => (profile.loadout.operative = id))
}
export function equipGrenade(id) {
  if (!owns('grenades', id)) return
  equip('grenade', id, () => (profile.loadout.grenade = id))
}
export function equipEmote(id) {
  if (!owns('emotes', id)) return
  equip('emote', id, () => (profile.loadout.emote = id))
}
export function setMode(id) {
  equip('mode', id, () => (profile.mode = id))
}
export const skinFor = (weaponId) => profile.loadout.skin[weaponId] || 'standard'
