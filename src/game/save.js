// The player's profile: coins, rank points, owned items, loadout, career stats. It lives on the
// game server (backend MatchRoom + MongoDB, per verified Bloxity account); this module mirrors the
// last copy the server sent and asks it for every purchase and equip. Purchases are applied here
// at once (so the shop feels instant) and replaced by the server's answer; a refused one resyncs.
// Everything is bought with coins earned by playing; there is no premium currency. Gems (`gems`)
// are the game's own currency, earned only by eliminations (the server's `reward` message) and
// never bought with real money or Bloxity Gems.
import { GRENADES, OPERATIVES, PASSES, RANKS, SKINS, START_PROFILE, STORE, WEAPONS, passWeapons } from '../config.js'
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
