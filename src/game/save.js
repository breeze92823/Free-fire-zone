// The player's profile: coins, rank points, owned items, loadout, stats.
// Saved to localStorage (per browser) until the backend save is rebuilt.
// Everything is bought with coins earned by playing; there is no premium currency.
import { MATCH, OPERATIVES, RANKS, SAVE_KEY, SKINS, START_PROFILE, STORE, WEAPONS } from '../config.js'

const clone = (o) => JSON.parse(JSON.stringify(o))

function load() {
  let raw = null
  try {
    raw = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null')
  } catch {
    raw = null
  }
  const p = clone(START_PROFILE)
  if (raw && typeof raw === 'object') {
    for (const k of Object.keys(p)) {
      if (raw[k] === undefined) continue
      if (typeof p[k] === 'object' && !Array.isArray(p[k])) p[k] = { ...p[k], ...raw[k] }
      else p[k] = raw[k]
    }
    // Owned lists always contain the starter items.
    for (const k of Object.keys(START_PROFILE.owned)) p.owned[k] = [...new Set([...(START_PROFILE.owned[k] || []), ...(raw.owned?.[k] || [])])]
  }
  return p
}

export const profile = load()
const listeners = new Set()

export function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(profile))
  } catch {
    // Storage blocked: this session only.
  }
  for (const fn of listeners) fn(profile)
}
export function onProfile(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
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

// Returns true when bought.
export function spend(price) {
  if (profile.coins < price) return false
  profile.coins -= price
  return true
}

export function buyWeapon(id) {
  const w = WEAPONS[id]
  if (!w || owns('weapons', id) || !spend(w.price)) return false
  profile.owned.weapons.push(id)
  save()
  return true
}

// Skins are per account and apply to any weapon.
export function buySkin(id) {
  const s = SKINS[id]
  if (!s || owns('skins', id) || !spend(s.price)) return false
  profile.owned.skins.push(id)
  save()
  return true
}

export function buyOperative(id) {
  const o = OPERATIVES[id]
  if (!o || owns('operatives', id) || !spend(o.price)) return false
  profile.owned.operatives.push(id)
  save()
  return true
}

export function buyStoreItem(id) {
  const item = STORE.find((s) => s.id === id)
  if (!item) return false
  if (item.type === 'upgrade' && upgradeLevel(id) >= item.max) return false
  if (item.type === 'emote' && owns('emotes', item.emote)) return false
  if (!spend(item.price)) return false
  if (item.type === 'hearts') profile.hearts += item.amount
  else if (item.type === 'upgrade') profile.upgrades[id] = upgradeLevel(id) + 1
  else if (item.type === 'emote') profile.owned.emotes.push(item.emote)
  save()
  return true
}

export function equipWeapon(id) {
  const w = WEAPONS[id]
  if (!w || !owns('weapons', id)) return
  if (w.slot === 'primary') profile.loadout.primary = id
  else if (w.slot === 'secondary') profile.loadout.secondary = id
  save()
}
export function equipSkin(weaponId, skinId) {
  if (!owns('skins', skinId)) return
  profile.loadout.skin[weaponId] = skinId
  save()
}
export function equipOperative(id) {
  if (!owns('operatives', id)) return
  profile.loadout.operative = id
  save()
}
export function equipEmote(id) {
  if (!owns('emotes', id)) return
  profile.loadout.emote = id
  save()
}
export function setMode(id) {
  profile.mode = id
  save()
}
export const skinFor = (weaponId) => profile.loadout.skin[weaponId] || 'standard'

// The hearts available in a match: the free ones plus the bought ones.
export const freeHearts = () => MATCH.hearts
export function useBoughtHeart() {
  if (profile.hearts <= 0) return false
  profile.hearts--
  save()
  return true
}

// Applies a finished match. Returns the reward breakdown for the summary screen.
export function applyMatchResult(r) {
  profile.coins += r.coins
  profile.rp = Math.max(0, profile.rp + r.rp)
  const s = profile.stats
  s.matches++
  if (r.won) s.wins++
  s.eliminations += r.eliminations
  s.deaths += r.deaths
  s.damage += Math.round(r.damage)
  s.best = Math.max(s.best, r.eliminations)
  save()
}
