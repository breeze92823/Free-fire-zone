// The player's profile: coins, rank points, owned items, loadout, career stats. It lives on the
// game server (backend MatchRoom + MongoDB, per verified Bloxity account); this module mirrors the
// last copy the server sent and asks it for every purchase and equip. Purchases are applied here
// at once (so the shop feels instant) and replaced by the server's answer; a refused one resyncs.
// Everything is bought with coins earned by playing; there is no premium currency.
import { OPERATIVES, RANKS, SKINS, START_PROFILE, STORE, WEAPONS } from '../config.js'
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
function purchase(kind, id, price, apply) {
  if (!online() || !account.loaded || profile.coins < price) return false
  profile.coins -= price
  apply()
  send('buy', { kind, id })
  notify()
  return true
}

export function buyWeapon(id) {
  const w = WEAPONS[id]
  if (!w || owns('weapons', id)) return false
  return purchase('weapon', id, w.price, () => profile.owned.weapons.push(id))
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
export function equipEmote(id) {
  if (!owns('emotes', id)) return
  equip('emote', id, () => (profile.loadout.emote = id))
}
export function setMode(id) {
  equip('mode', id, () => (profile.mode = id))
}
export const skinFor = (weaponId) => profile.loadout.skin[weaponId] || 'standard'
