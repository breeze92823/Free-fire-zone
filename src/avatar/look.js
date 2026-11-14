// A player's whole Bloxity look -> a dressed character root, the same way for the local player and
// for every other player (their look arrives as replicated ids + outfit key, never URLs):
//   1. a custom character (equipped.characterId): its own GLB rig + accessories;
//   2. the Bloxity character kit (Legion.SDK.character.dress with the outfit key), when this game
//      has it on: Bloxity binds skin, body parts and every accessory onto our player.glb rig;
//   3. the manual path: skin texture (face / shirt / pants drawn on), body parts, accessories.
// Each step falls back to the next; null only when even the base rig failed (the caller keeps the
// game's blocky outfit). Never throws, and never waits forever: every SDK / network step has a timeout.
//
// Reliability: buildLook() reports `complete` (false when a skin / part / accessory could not be
// fetched); streamLook() hands the caller the first usable build at once and keeps retrying in the
// background, upgrading it when a complete one is ready. prewarmLook() fills the asset caches (and the
// kit's own) for players who are not on screen yet, so the round starts with everyone already cached.
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { loadBaseCharacter } from './character.js'
import { applyProportions, attachCharacterAccessories, attachEquippedAccessories, loadCharacterRig } from './loader.js'
import { isEquipped } from './cdn.js'
import { PRIO, makeGate, sleep, withTimeout } from './assets.js'
import * as bloxity from '../bloxity.js'
import { warmObject } from '../warmup.js'

const SDK_TIMEOUT = 12000 // getCharacterFor / kit.dress: the portal must answer within this
const buildGate = makeGate(3) // looks being assembled at once (each one fans out into many requests)

// look: { equipped, proportions, outfitKey } (any may be missing). Returns { root, kind, handle, complete }.
export function buildLook(look = {}, { prio = PRIO.normal } = {}) {
  return buildGate.run(() => build(look, prio), prio)
}

async function build(look, prio) {
  const equipped = look.equipped && typeof look.equipped === 'object' ? look.equipped : null
  try {
    // 1. Custom character.
    if (equipped && isEquipped(equipped.characterId)) {
      try {
        const character = await withTimeout(bloxity.getCharacterFor(equipped), SDK_TIMEOUT, 'getCharacterFor')
        const root = character ? await loadCharacterRig(character, { prio }) : null
        if (root) {
          const complete = await attachCharacterAccessories(root, character, equipped, { prio })
          return { root, kind: 'character', handle: null, complete }
        }
      } catch (err) {
        console.warn('[look] custom character failed, trying the standard rig', err)
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
          handle = await withTimeout(kit.dress({ THREE, GLTFLoader, root: base, outfitKey: key, proportions: 'game' }), SDK_TIMEOUT, 'character.dress')
        } catch (err) {
          console.warn('[look] character kit failed, drawing the look by hand', err)
        }
        if (handle) {
          applyProportions(base, look.proportions || null)
          base.userData.lookHandle = handle
          return { root: base, kind: 'kit', handle, complete: true }
        }
      }
    }
    // 3. By hand.
    const base = await loadBaseCharacter()
    let complete = true
    if (equipped) complete = await attachEquippedAccessories(base, equipped, { skinTextureUrl: look.skinTextureUrl || bloxity.getSkinTextureUrlFor(equipped), prio })
    applyProportions(base, look.proportions || null)
    return { root: base, kind: 'manual', handle: null, complete }
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

const RETRY_DELAYS = [1500, 4000, 10000] // ms before attempts 2, 3, 4

// Builds a look and delivers it through onBuilt(built): the first usable build immediately (even if
// some accessory is missing), then a better one if a retry completes the look. The caller owns every
// root it is handed (and frees the one it replaces). isStale() -> true stops the work (the look was
// replaced, the actor left): a build that finishes after that is freed here. Resolves when done.
export async function streamLook(look, { prio = PRIO.normal, isStale = () => false, onBuilt, attempts = RETRY_DELAYS.length + 1 } = {}) {
  let delivered = false
  for (let i = 0; i < attempts; i++) {
    if (isStale()) return
    const built = await buildLook(look, { prio })
    const usable = !!built && isBloxityRig(built.root)
    // Shaders compiled and textures uploaded before it is shown (the old look stays on meanwhile):
    // otherwise the first frame that draws a new look stalls while the GPU catches up.
    if (usable && !isStale() && !(delivered && !built.complete)) await warmObject(built.root)
    if (isStale() || !usable || (delivered && !built.complete)) {
      disposeLook(built?.root) // stale, the blocky stand-in, or no better than what is already shown
    } else {
      delivered = true
      try {
        onBuilt(built)
      } catch (err) {
        console.warn('[look] onBuilt threw', err)
      }
      if (built.complete) return
    }
    if (i < attempts - 1) await sleep(RETRY_DELAYS[Math.min(i, RETRY_DELAYS.length - 1)])
  }
}

// --- Prewarming ---------------------------------------------------------------------------------
// Everyone in the room is known in the lobby, long before the round: build their looks one at a time
// at the lowest priority and throw the result away, so the skin / part / accessory downloads, the
// catalogue lookups and the kit's own caches are warm when the round creates the real characters.
const warmed = new Set()
const warmQueue = []
let warming = false

export const lookKey = (look) => `${look?.outfitKey || ''}|${look?.equipped ? JSON.stringify(look.equipped) : ''}`

export function prewarmLook(look) {
  if (!bloxity.hasSdk() || (!look?.equipped && !look?.outfitKey)) return
  const key = lookKey(look)
  if (warmed.has(key)) return
  warmed.add(key)
  if (warmed.size > 200) warmed.delete(warmed.values().next().value) // a long session: forget the oldest
  warmQueue.push(look)
  if (!warming) drainWarmQueue()
}

async function drainWarmQueue() {
  warming = true
  try {
    while (warmQueue.length) {
      const built = await buildLook(warmQueue.shift(), { prio: PRIO.warm })
      disposeLook(built?.root)
      await sleep(50) // let frames through between builds
    }
  } finally {
    warming = false
  }
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
