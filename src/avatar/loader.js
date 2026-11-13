// Dresses the game's Bloxity base rig (avatar/character.js) with a player's
// equipped cosmetics (the local player's or another player's replicated ids):
// skin texture (face / shirt / pants drawn on), replaced body parts
// (head/torso/arms/legs) and every bone-attached accessory (hat, back, hair,
// mask, neck, chest, waist, hands, shoes: the SDK's getAccessorySlots()).
// Also dresses custom characters' own rigs with accessories. Any slot that
// 404s or fails to parse is skipped, leaving the rig's own default mesh. Framework-free (no React) so it can be reused outside
// a framework.
//
// Same rule as bloxity.js: nothing here may throw outward. A blocked
// CDN or a failed slot is logged and skipped. Approach ported from
// Ice-Skate's systems/avatarModel.js, which targets the same base rig.
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'
import {
  Color,
  DoubleSide,
  FrontSide,
  Matrix4,
  Vector3,
  MeshStandardMaterial,
  NearestFilter,
  NearestMipmapLinearFilter,
  SRGBColorSpace,
  TextureLoader,
} from 'three'
import { MATERIAL_PBR, PLAYER_DIMS, PROPORTIONS, RIG, RIG_HEIGHT, clamp } from '../config.js'
import { AVATAR_SLOTS, assetUrl, composedSkinUrl, describeItem, isEquipped, itemUrls, partUrl, skinUrl } from './cdn.js'
import { loadBaseCharacter } from './character.js'
import { accessorySlots, accessoryUrls, characterAccessoryMatrix } from '../bloxity.js'

// Bone-attached accessory slots. Origins are model-space points on player.glb (rig units, feet at
// y 0); an item mesh is authored around its origin and rides on `bone` with the local matrix
// restInverse(bone) x translate(origin) (docs: not skeleton.boneInverses, 90 deg off on the leaf
// bones). mirrorBone: the same mesh mirrored onto the other side. inheritScale false: the item keeps
// its size when the body proportions stretch the limb. The SDK's getAccessorySlots() list wins
// (new slot types appear without code changes); hat and back are not in it.
const HAT_BACK_SLOTS = [
  { field: 'hatId', bone: 'Neck1', dir: 'hats', origin: [0, 5.6, 0], inheritScale: true },
  { field: 'backId', bone: 'Spine2', dir: 'back', origin: [0, 4.2, 0], inheritScale: true },
]
const FALLBACK_SLOTS = [
  { field: 'hairId', bone: 'Neck1', dir: 'hats', origin: [0, 5.6, 0], inheritScale: true },
  { field: 'maskId', bone: 'Neck1', dir: 'hats', origin: [0, 5.6, 0], inheritScale: true },
  { field: 'neckId', bone: 'Spine2', dir: 'neck', origin: [0, 4.8, 0], inheritScale: true },
  { field: 'chestId', bone: 'Spine2', dir: 'chest', origin: [0, 3.6, 0], inheritScale: true },
  { field: 'waistId', bone: 'Spine1', dir: 'waist', origin: [0, 2.4, 0], inheritScale: true },
  { field: 'handId', bone: 'ArmL2_leaf', mirrorBone: 'ArmR2_leaf', dir: 'hand', origin: [0, 0, 0], inheritScale: false },
  { field: 'shoesId', bone: 'LegL2_leaf', mirrorBone: 'LegR2_leaf', dir: 'shoes', origin: [0, 0, 0], inheritScale: false },
]
const itemSlots = () => [...HAT_BACK_SLOTS, ...(accessorySlots() || FALLBACK_SLOTS)]

// player.glb's rest pose in model space: bone name -> inverse world matrix (read once).
let restPromise = null
function restInverses() {
  restPromise ||= loadBaseCharacter().then((root) => {
    root.position.set(0, 0, 0)
    root.rotation.set(0, 0, 0)
    root.scale.set(1, 1, 1)
    root.updateMatrixWorld(true)
    const inv = {}
    root.traverse((o) => {
      if (o.name) inv[o.name] = o.matrixWorld.clone().invert()
    })
    return inv
  })
  return restPromise
}

const MIRROR_X = new Matrix4().makeScale(-1, 1, 1)
const tmpM = new Matrix4()
const tmpS = new Vector3()

// rig.anchors[bone] may be a number, [x, y, z] or { x, y, z }.
function anchorScale(anchor) {
  if (typeof anchor === 'number' && Number.isFinite(anchor)) return new Matrix4().makeScale(anchor, anchor, anchor)
  if (Array.isArray(anchor) && anchor.length >= 3) return new Matrix4().makeScale(anchor[0], anchor[1], anchor[2])
  if (anchor && typeof anchor === 'object' && 'x' in anchor) return new Matrix4().makeScale(anchor.x, anchor.y, anchor.z)
  return new Matrix4()
}

const gltfLoader = new GLTFLoader()
const objLoader = new OBJLoader()
const textureLoader = new TextureLoader()

// The bundled player.glb shares one material between every clone of the base
// rig, so painting a skin onto it would leak onto every other character.
// Give this instance its own copies first; meshes that shared a material
// keep sharing one (the rig's six body meshes all use a single `char`).
function ownMaterials(root) {
  const converted = new Map()
  root.traverse((o) => {
    if (!o.isMesh && !o.isSkinnedMesh) return
    const source = Array.isArray(o.material) ? o.material[0] : o.material
    if (!source) return
    let own = converted.get(source.uuid)
    if (!own) {
      own = new MeshStandardMaterial({
        map: source.map || null,
        color: source.color ? source.color.clone() : new Color(0xffffff),
        side: source.side ?? FrontSide,
        transparent: !!source.transparent,
        alphaTest: source.alphaTest || 0,
        roughness: source.roughness ?? MATERIAL_PBR.PLAYER.roughness,
        metalness: source.metalness ?? MATERIAL_PBR.PLAYER.metalness,
        normalMap: source.normalMap || null,
        roughnessMap: source.roughnessMap || null,
        metalnessMap: source.metalnessMap || null,
      })
      converted.set(source.uuid, own)
    }
    o.material = own
  })
}

// Skins are pixel art and glTF UVs are not flipped, so a plain PNG has to
// match the base rig's convention explicitly.
function configureSkinTexture(texture) {
  texture.flipY = false
  texture.colorSpace = SRGBColorSpace
  texture.magFilter = NearestFilter
  texture.minFilter = NearestMipmapLinearFilter
  texture.anisotropy = 1
  return texture
}

function configureItemTexture(texture) {
  texture.colorSpace = SRGBColorSpace
  texture.magFilter = NearestFilter
  texture.minFilter = NearestMipmapLinearFilter
  texture.anisotropy = 1
  return texture
}

// With no skin equipped the portal still dresses the body in its default skin
// (skins/0.png), so do the same rather than keeping the rig's embedded map.
async function applySkin(root, equipped, skinTextureUrl) {
  const id = equipped.skinId
  const wanted = isEquipped(id)
  let plain = skinUrl(wanted ? id : 0)
  if (wanted) {
    const item = await describeItem(id)
    plain = assetUrl(item?.assetPaths?.texture) || plain
  }
  // The portal's composed skin (face/shirt/pants drawn on) first, then the bare one.
  const candidates = [skinTextureUrl || composedSkinUrl(equipped), plain].filter(Boolean)
  let texture = null
  for (const url of candidates) {
    try {
      texture = configureSkinTexture(await textureLoader.loadAsync(url))
      break
    } catch {
      // try the next candidate
    }
  }
  if (!texture) return // keep the rig's embedded texture
  root.traverse((o) => {
    if (o.isSkinnedMesh && o.material) {
      o.material.map = texture
      o.material.needsUpdate = true
    }
  })
}

// The base rig ships six SkinnedMeshes (default_head, default_torso,
// default_arm_L/R, default_leg_L/R) bound to one shared skeleton. Equipping a
// part swaps *that mesh's geometry* in place, keeping its skeleton binding
// and its (skin-painted) material — the part GLB's own material is dropped.
// The part's skinIndex values are remapped bone-name-by-bone-name into the
// base skeleton's order first, since its own export order usually differs.
async function applyPart(root, slot, id) {
  const item = await describeItem(id)
  const pathKey = slot.side ? `mesh${slot.side}` : 'mesh'
  const url = assetUrl(item?.assetPaths?.[pathKey]) || partUrl(slot, id)
  let gltf
  try {
    gltf = await gltfLoader.loadAsync(url)
  } catch {
    return // slot unavailable: the default_* mesh stays visible
  }
  const target = root.nodes[slot.replaces]
  if (!target || !target.isSkinnedMesh) return

  let skinnedSource = null
  let plainSource = null
  gltf.scene.traverse((o) => {
    if (o.isSkinnedMesh && !skinnedSource) skinnedSource = o
    else if (o.isMesh && !plainSource) plainSource = o
  })
  if (!skinnedSource && !plainSource) return

  if (!skinnedSource) {
    target.geometry = plainSource.geometry
    return
  }

  const geometry = skinnedSource.geometry.clone()
  if (skinnedSource.skeleton) {
    const baseIndexByName = new Map()
    target.skeleton.bones.forEach((bone, i) => baseIndexByName.set(bone.name, i))
    const remap = new Map()
    skinnedSource.skeleton.bones.forEach((bone, i) => {
      const baseIndex = baseIndexByName.get(bone.name)
      if (baseIndex !== undefined) remap.set(i, baseIndex)
    })
    const skinIndex = geometry.getAttribute('skinIndex')
    if (skinIndex) {
      const array = skinIndex.array
      for (let i = 0; i < array.length; i += 1) {
        const mapped = remap.get(array[i])
        if (mapped !== undefined) array[i] = mapped
      }
      skinIndex.needsUpdate = true
    }
  }
  target.geometry = geometry
}

const objectCache = new Map()
async function loadItemObject(mesh, texture) {
  let request = objectCache.get(mesh)
  if (!request) {
    request = objLoader.loadAsync(mesh).catch((err) => {
      console.warn('[avatarLoader] accessory failed to load', mesh, err)
      objectCache.delete(mesh)
      return null
    })
    objectCache.set(mesh, request)
  }
  const proto = await request
  if (!proto) return null
  let map = null
  try {
    if (texture) map = configureItemTexture(await textureLoader.loadAsync(texture))
  } catch {
    // An untextured accessory still reads better than skipping it outright.
  }
  const object = proto.clone()
  object.traverse((o) => {
    if (!o.isMesh) return
    o.castShadow = true
    o.material = new MeshStandardMaterial(map ? { map, ...MATERIAL_PBR.PLAYER } : { color: '#cccccc', ...MATERIAL_PBR.PLAYER })
  })
  return object
}

async function itemUrlsFor(slot, id) {
  const item = await describeItem(id)
  const sdk = accessoryUrls(slot.field, id)
  const fallback = slot.dir ? itemUrls({ type: slot.dir }, id) : {}
  return {
    mesh: assetUrl(item?.assetPaths?.mesh) || sdk?.mesh || fallback.mesh,
    texture: assetUrl(item?.assetPaths?.texture) || sdk?.texture || fallback.texture,
  }
}

// Places one slot's item on the rig. place(boneName, mirrored) -> the item's local Matrix4.
async function attachSlot(root, slot, id, place) {
  const urls = await itemUrlsFor(slot, id)
  if (!urls.mesh) return
  const object = await loadItemObject(urls.mesh, urls.texture)
  if (!object) return
  const targets = [[slot.bone, false]]
  if (slot.mirrorBone) targets.push([slot.mirrorBone, true])
  // Copies first: clone() serialises userData, which must not hold the bone yet.
  const copies = targets.map((_, i) => (i === 0 ? object : object.clone()))
  targets.forEach(([boneName, mirrored], i) => {
    const bone = root.nodes?.[boneName]
    if (!bone) return
    const obj = copies[i]
    if (mirrored) {
      // A mirrored copy turns its faces inside out: draw both sides.
      obj.traverse((o) => {
        if (o.isMesh) {
          o.material = o.material.clone()
          o.material.side = DoubleSide
        }
      })
    }
    obj.matrixAutoUpdate = false
    obj.matrix.copy(place(boneName, mirrored, slot))
    obj.userData.baseMatrix = obj.matrix.clone()
    obj.userData.bone = bone
    if (slot.inheritScale === false) (root.userData.fixedScaleItems ||= []).push(obj)
    obj.updateMatrixWorld(true)
    bone.add(obj)
  })
}

async function applyItems(root, equipped, place) {
  const slots = itemSlots().filter((slot) => isEquipped(equipped[slot.field]))
  await Promise.all(slots.map((slot) => attachSlot(root, slot, equipped[slot.field], place).catch((err) => console.warn('[avatarLoader] slot failed', slot.field, err))))
}

// A hat can insist on a head ('-1' = the stock one) because it is modelled
// around it; a custom head would poke through. The portal applies this when
// the hat is equipped, but looks reaching us another way (e.g. a remote
// player's saved JSON) may predate it, so enforce it here too.
async function withForcedHead(equipped) {
  for (const key of ['hatId', 'hairId', 'maskId']) {
    if (!isEquipped(equipped[key])) continue
    const item = await describeItem(equipped[key])
    const forced = item?.forceHeadId
    if (forced !== undefined && forced !== null) return { ...equipped, headId: forced }
  }
  return equipped
}

// `equipped` is the shape SDK.avatar.getEquipped() returns. `root` is a
// character from avatar/character.js, whose `nodes` map names every rig node.
// `signal` (optional AbortSignal) lets a caller cancel a stale load.
export async function attachEquippedAccessories(root, equipped, { signal, skinTextureUrl } = {}) {
  if (!root || !equipped) return
  try {
    ownMaterials(root)
    equipped = await withForcedHead(equipped)
    if (signal?.aborted) return
    await applySkin(root, equipped, skinTextureUrl)
    if (signal?.aborted) return
    const rest = await restInverses()
    if (signal?.aborted) return
    // Body parts and accessories load in parallel; each one swallows its own failure.
    const at = (boneName, mirrored, slot) => {
      const m = (rest[boneName] || new Matrix4()).clone()
      if (mirrored) m.multiply(MIRROR_X)
      return m.multiply(tmpM.makeTranslation(slot.origin?.[0] ?? 0, slot.origin?.[1] ?? 0, slot.origin?.[2] ?? 0))
    }
    await Promise.all([
      ...AVATAR_SLOTS.filter((slot) => slot.kind === 'part' && isEquipped(equipped[slot.key])).map((slot) => applyPart(root, slot, equipped[slot.key])),
      applyItems(root, equipped, at),
    ])
  } catch (err) {
    console.warn('[avatarLoader] equipping avatar failed', err)
  }
}

// --- Custom characters --------------------------------------------------------------------------
// A character (SDK getCharacterFor) is its own GLB with player.glb's 22 bone names and rest
// rotations, 6.4 units tall: same scale, same animator, texture embedded (no skin, no body parts,
// no proportions). Head / torso items use the SDK's characterAccessoryMatrix(character, bone);
// hands and shoes, and any bone it has no matrix for, scale(rig.anchors[bone]) x the player.glb
// placement.
const characterCache = new Map()
export async function loadCharacterRig(character) {
  const url = character?.glbUrl
  if (!url) return null
  let request = characterCache.get(url)
  if (!request) {
    request = gltfLoader.loadAsync(url).catch((err) => {
      console.warn('[avatarLoader] character failed to load', url, err)
      characterCache.delete(url)
      return null
    })
    characterCache.set(url, request)
  }
  const gltf = await request
  if (!gltf) return null
  const root = cloneSkeleton(gltf.scene)
  root.name = 'character'
  root.nodes = {}
  root.traverse((o) => {
    if (o.isMesh || o.isSkinnedMesh) {
      o.castShadow = true
      o.frustumCulled = false
    }
    if (o.name) root.nodes[o.name] = o
  })
  if (!root.nodes.Rig1 && !root.nodes.Neck1) return null // not a Bloxity rig
  root.userData.customCharacter = character.id || true
  root.scale.setScalar(PLAYER_DIMS.height / RIG_HEIGHT)
  return root
}

export async function attachCharacterAccessories(root, character, equipped) {
  if (!root || !character || !equipped) return
  try {
    const rest = await restInverses()
    const anchors = character.rig?.anchors || {}
    const at = (boneName, mirrored, slot) => {
      const origin = tmpM.makeTranslation(slot.origin?.[0] ?? 0, slot.origin?.[1] ?? 0, slot.origin?.[2] ?? 0).clone()
      const fit = !mirrored && (boneName === 'Neck1' || boneName === 'Spine1' || boneName === 'Spine2') ? characterAccessoryMatrix(character, boneName) : null
      if (fit) return new Matrix4().fromArray(fit).multiply(origin)
      const m = anchorScale(anchors[boneName]).multiply(rest[boneName] || new Matrix4())
      if (mirrored) m.multiply(MIRROR_X)
      return m.multiply(origin)
    }
    await applyItems(root, equipped, at)
  } catch (err) {
    console.warn('[avatarLoader] character accessories failed', err)
  }
}

function prop(proportions, key) {
  const spec = PROPORTIONS[key]
  const raw = Number(proportions?.[key])
  return clamp(Number.isFinite(raw) ? raw : spec.def, spec.min, spec.max)
}

// Rescales an already-built character per SDK.avatar.getProportions(). Safe
// to call repeatedly (e.g. from onProportionsChanged) since it only mutates
// existing node transforms, no reload needed. A null `proportions` resets to
// the defaults.
export function applyProportions(root, proportions) {
  if (!root) return
  const n = root.nodes || {}
  const p = {}
  for (const key of Object.keys(PROPORTIONS)) p[key] = prop(proportions, key)

  if (n.ArmL_Offset) n.ArmL_Offset.position.x = RIG.armOffsetX * p.shoulderWidth
  if (n.ArmR_Offset) n.ArmR_Offset.position.x = -RIG.armOffsetX * p.shoulderWidth
  if (n.ArmL1) n.ArmL1.scale.y = p.armLength
  if (n.ArmR1) n.ArmR1.scale.y = p.armLength
  if (n.LegL_Offset) n.LegL_Offset.position.x = RIG.legOffsetX * p.legOffsetX
  if (n.LegR_Offset) n.LegR_Offset.position.x = -RIG.legOffsetX * p.legOffsetX
  if (n.Spine1) n.Spine1.scale.x = p.torsoScaleX
  if (n.Neck_Offset) n.Neck_Offset.position.y = RIG.neckOffsetY * p.neckHeight
  if (n.Neck1) n.Neck1.scale.setScalar(p.headScale)

  // Rig units -> metres uniformly (must not distort), then the portal's
  // height proportion as a vertical stretch only — a taller character isn't
  // proportionally wider, just taller.
  const unitScale = PLAYER_DIMS.height / RIG_HEIGHT
  root.scale.set(unitScale, unitScale * p.height, unitScale)
  keepItemSizes(root)
}

// inheritScale false items (hands, shoes): undo the stretch their bone picked up from the
// proportions, so a long arm does not make a long glove.
function keepItemSizes(root) {
  const items = root.userData.fixedScaleItems
  if (!items?.length) return
  const s = root.scale.clone()
  root.scale.set(1, 1, 1)
  root.updateMatrixWorld(true)
  const inv = tmpM.copy(root.matrixWorld).invert()
  for (const obj of items) {
    const rel = new Matrix4().multiplyMatrices(inv, obj.userData.bone.matrixWorld)
    rel.decompose(new Vector3(), new (obj.quaternion.constructor)(), tmpS)
    obj.matrix.copy(obj.userData.baseMatrix).premultiply(new Matrix4().makeScale(1 / (tmpS.x || 1), 1 / (tmpS.y || 1), 1 / (tmpS.z || 1)))
  }
  root.scale.copy(s)
  root.updateMatrixWorld(true)
}
