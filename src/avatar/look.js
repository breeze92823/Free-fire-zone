// A player's whole Bloxity look -> a dressed character root, the same way for the local player and
// for every other player (their look arrives as replicated ids + outfit key, never URLs):
//   1. a custom character (equipped.characterId): its own GLB rig + accessories;
//   2. the Bloxity character kit (Legion.SDK.character.dress with the outfit key), when this game
//      has it on: Bloxity binds skin, body parts and every accessory onto our player.glb rig;
//   3. the manual path: skin texture (face / shirt / pants drawn on), body parts, accessories.
// Each step falls back to the next; null only when even the base rig failed (the caller keeps the
// game's blocky outfit). Never throws.
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { loadBaseCharacter } from './character.js'
import { applyProportions, attachCharacterAccessories, attachEquippedAccessories, loadCharacterRig } from './loader.js'
import { isEquipped } from './cdn.js'
import * as bloxity from '../bloxity.js'

// look: { equipped, proportions, outfitKey } (any may be missing). Returns { root, kind, handle }.
export async function buildLook(look = {}) {
  const equipped = look.equipped && typeof look.equipped === 'object' ? look.equipped : null
  try {
    // 1. Custom character.
    if (equipped && isEquipped(equipped.characterId)) {
      const character = await bloxity.getCharacterFor(equipped)
      const root = character ? await loadCharacterRig(character) : null
      if (root) {
        await attachCharacterAccessories(root, character, equipped)
        return { root, kind: 'character', handle: null }
      }
    }
    // 2. The character kit.
    const kit = bloxity.characterKit()
    const key = look.outfitKey || (equipped ? bloxity.getOutfitKeyFor(equipped) : null)
    if (kit && key) {
      let can = false
      try {
        can = !!kit.canDress(key)
      } catch {
        can = false
      }
      if (can) {
        const base = await loadBaseCharacter()
        let handle = null
        try {
          // proportions 'game': our loader shapes the bones (applyProportions) and the outfit follows.
          handle = await kit.dress({ THREE, GLTFLoader, root: base, outfitKey: key, proportions: 'game' })
        } catch (err) {
          console.warn('[look] character kit failed, drawing the look by hand', err)
        }
        if (handle) {
          applyProportions(base, look.proportions || null)
          base.userData.lookHandle = handle
          return { root: base, kind: 'kit', handle }
        }
      }
    }
    // 3. By hand.
    const base = await loadBaseCharacter()
    if (equipped) await attachEquippedAccessories(base, equipped, { skinTextureUrl: look.skinTextureUrl || bloxity.getSkinTextureUrlFor(equipped) })
    applyProportions(base, look.proportions || null)
    return { root: base, kind: 'manual', handle: null }
  } catch (err) {
    console.warn('[look] building the look failed', err)
    return null
  }
}

// True when the root is a real Bloxity rig (player.glb dressed, or a custom character), not the
// procedural stand-in loadBaseCharacter() falls back to when player.glb cannot load.
export const isBloxityRig = (root) => !!(root?.nodes?.default_torso || root?.userData?.customCharacter)

// Frees a dressed root's kit outfit before the root is dropped.
export function disposeLook(root) {
  try {
    root?.userData?.lookHandle?.dispose?.()
  } catch {
    // Already gone.
  }
  if (root?.userData) root.userData.lookHandle = null
}

// The replicated form of a look: ids only (docs: never URLs). The whole getEquipped() object goes,
// so slots added later (and characterId) reach the others without code changes.
export function lookToJson(look) {
  if (!look?.equipped && !look?.outfitKey) return ''
  try {
    return JSON.stringify({ equipped: look.equipped || null, proportions: look.proportions || null, outfitKey: look.outfitKey || '' }).slice(0, 4000)
  } catch {
    return ''
  }
}

export function lookFromJson(json, outfitKey = '') {
  let look = null
  try {
    look = json ? JSON.parse(json) : null
  } catch {
    look = null
  }
  if (!look || typeof look !== 'object') look = {}
  // A url never comes in a look: drop any string value that looks like one.
  if (look.equipped && typeof look.equipped === 'object') {
    for (const [k, v] of Object.entries(look.equipped)) if (typeof v === 'string' && /[/:]/.test(v)) delete look.equipped[k]
  }
  // The server's key (verified by Bloxity at join, then the player's own updates) wins.
  look.outfitKey = outfitKey || (typeof look.outfitKey === 'string' ? look.outfitKey : '')
  return look
}
