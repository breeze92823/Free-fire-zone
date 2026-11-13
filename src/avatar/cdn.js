// Bloxity avatar CDN — asset URL builders for the hat/back .obj accessories
// the game attaches to its own character. Mirrors the path convention the
// Legion SDK's own customizer uses, so an item id resolves to the exact asset
// it would load. Pure string-building only — avatar/loader.js is the
// sole consumer. Ported from Clean Leaves for Loot.

import { loadJSON } from './assets.js'

const AVATAR_CDN = 'https://static.bloxity.io/avatars'

// The SDK's own "nothing equipped" sentinels — '' / 'undefined' (as literal
// strings) / null for hats/back items — collapsed to one check so callers
// don't need to know which sentinel a given slot uses.
export function isEquipped(id) {
  return id != null && id !== '-1' && id !== -1 && id !== '' && id !== 'undefined' && id !== 'null'
}

// Body-part slots, keyed like SDK.avatar.getEquipped(): each swaps the geometry
// of the matching default_* SkinnedMesh in the base rig.
export const AVATAR_SLOTS = [
  { key: 'headId', kind: 'part', type: 'head', replaces: 'default_head' },
  { key: 'torsoId', kind: 'part', type: 'torso', replaces: 'default_torso' },
  { key: 'armLId', kind: 'part', type: 'arms', side: 'L', replaces: 'default_arm_L' },
  { key: 'armRId', kind: 'part', type: 'arms', side: 'R', replaces: 'default_arm_R' },
  { key: 'legLId', kind: 'part', type: 'legs', side: 'L', replaces: 'default_leg_L' },
  { key: 'legRId', kind: 'part', type: 'legs', side: 'R', replaces: 'default_leg_R' },
  // Bone-attached items (hat, back, hair, mask, neck, chest, waist, hands, shoes) are placed by
  // loader.js from the SDK's getAccessorySlots() list.
]

export function partUrl(slot, id) {
  const suffix = slot.side ? `_${slot.side}` : ''
  return `${AVATAR_CDN}/parts/${slot.type}/${id}${suffix}.glb`
}

export function itemUrls(slot, id) {
  return {
    mesh: `${AVATAR_CDN}/items/${slot.type}/${id}.obj`,
    texture: `${AVATAR_CDN}/textures/${slot.type}/${id}.png`,
  }
}

export function skinUrl(id) {
  return `${AVATAR_CDN}/skins/${id}.png`
}

// The skin with the worn face, shirt and pants drawn on, built by hand for
// players whose SDK we can't ask (the docs' pattern). Null when none of the
// four is equipped, so the plain skin path is used.
export function composedSkinUrl(equipped) {
  if (!equipped) return null
  const { skinId, pantsId, shirtId, faceId } = equipped
  if (!isEquipped(pantsId) && !isEquipped(shirtId) && !isEquipped(faceId)) return null
  let name = `s${isEquipped(skinId) ? skinId : 0}`
  if (isEquipped(pantsId)) name += `_pn${pantsId}`
  if (isEquipped(shirtId)) name += `_sh${shirtId}`
  if (isEquipped(faceId)) name += `_fc${faceId}`
  return `https://api.bloxity.io/v1/avatar/skin-texture/${name}.png`
}

// --- Catalogue ---------------------------------------------------------
// The portal's own renderer resolves each item through the public catalogue
// (`assetPaths` per item) rather than a URL pattern, so an item stored
// somewhere unexpected still loads. Cached by id; a failed lookup resolves to
// null so callers fall back to the pattern URLs above.
const AVATAR_API = 'https://api.bloxity.io'

// Timeout + retry + dedupe live in assets.js; a failed lookup is not cached (the next look retries)
// and resolves null, so callers fall back to the pattern URLs above.
export function describeItem(id, prio) {
  if (!isEquipped(id)) return Promise.resolve(null)
  return loadJSON(`${AVATAR_API}/v1/avatar/items/${encodeURIComponent(String(id))}`, { prio })
}

// `assetPaths` entries are host-relative ('/avatars/...') or absolute.
export function assetUrl(path) {
  if (!path) return null
  return path.startsWith('http') ? path : `https://static.bloxity.io${path}`
}

export function hatObjUrl(id) {
  return isEquipped(id) ? `${AVATAR_CDN}/items/hats/${id}.obj` : null
}

export function hatTextureUrl(id) {
  return isEquipped(id) ? `${AVATAR_CDN}/textures/hats/${id}.png` : null
}

export function backObjUrl(id) {
  return isEquipped(id) ? `${AVATAR_CDN}/items/back/${id}.obj` : null
}

export function backTextureUrl(id) {
  return isEquipped(id) ? `${AVATAR_CDN}/textures/back/${id}.png` : null
}
