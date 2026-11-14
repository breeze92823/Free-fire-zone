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
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'
import {
  Color,
  DoubleSide,
  FrontSide,
  Matrix3,
  Matrix4,
  Vector3,
  MeshStandardMaterial,
  NearestFilter,
  NearestMipmapLinearFilter,
  SRGBColorSpace,
} from 'three'
import { MATERIAL_PBR, PLAYER_DIMS, PROPORTIONS, RIG_HEIGHT, clamp } from '../config.js'
import { AVATAR_SLOTS, assetUrl, composedSkinUrl, describeItem, isEquipped, itemUrls, partUrl, skinUrl } from './cdn.js'
import { loadBaseCharacter, ownMaterialCopies } from './character.js'
import { PRIO, loadGLTF, loadOBJ, loadTexture } from './assets.js'
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
    // The procedural stand-in (player.glb failed) has the wrong rest pose: do not keep it.
    if (!root.nodes?.default_torso) restPromise = null
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
async function applySkin(root, equipped, skinTextureUrl, ctx) {
  const id = equipped.skinId
  const wanted = isEquipped(id)
  let plain = skinUrl(wanted ? id : 0)
  if (wanted) {
    const item = await describeItem(id, ctx.prio)
    plain = assetUrl(item?.assetPaths?.texture) || plain
  }
  // The portal's composed skin (face/shirt/pants drawn on) first, then the bare one.
  const composed = skinTextureUrl || composedSkinUrl(equipped)
  const candidates = [composed, plain].filter(Boolean)
  let texture = null
  let used = -1
  for (let i = 0; i < candidates.length; i++) {
    try {
      texture = await loadTexture(candidates[i], 'skin', configureSkinTexture, { prio: ctx.prio })
      used = i
      break
    } catch {
      // try the next candidate
    }
  }
  // Incomplete: no skin at all (the rig's embedded texture stays), or the bare one where the face /
  // shirt / pants were wanted. The caller retries the whole look later; the texture cache makes that cheap.
  if (!texture || (composed && used > 0)) ctx.failed++
  if (!texture) return
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
async function applyPart(root, slot, id, ctx) {
  const item = await describeItem(id, ctx.prio)
  const pathKey = slot.side ? `mesh${slot.side}` : 'mesh'
  const url = assetUrl(item?.assetPaths?.[pathKey]) || partUrl(slot, id)
  let gltf
  try {
    gltf = await loadGLTF(url, { prio: ctx.prio })
  } catch {
    ctx.failed++
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
    // Without skin weights the geometry would follow whichever bone the GPU defaults to (a torn-off
    // or vanished limb): only take it if it carries its own weights, else keep the default part.
    if (plainSource.geometry.getAttribute('skinIndex') && plainSource.geometry.getAttribute('skinWeight')) target.geometry = plainSource.geometry
    else console.warn('[avatarLoader] body part has no skin weights, keeping the default', url)
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

async function loadItemObject(mesh, texture, ctx) {
  let proto = null
  try {
    proto = await loadOBJ(mesh, { prio: ctx.prio })
  } catch (err) {
    console.warn('[avatarLoader] accessory failed to load', mesh, err)
  }
  if (!proto) {
    ctx.failed++
    return null
  }
  let map = null
  try {
    if (texture) map = await loadTexture(texture, 'item', configureItemTexture, { prio: ctx.prio })
  } catch {
    // An untextured accessory still reads better than skipping it outright (but the look is retried).
    ctx.failed++
  }
  const object = proto.clone()
  object.traverse((o) => {
    if (!o.isMesh) return
    o.castShadow = true
    // Like the portal's renderer: alpha cut-outs (hair strands, mask holes) and both faces (OBJ items
    // are not consistently wound, so one-sided ones lose faces).
    o.material = new MeshStandardMaterial({ ...(map ? { map } : { color: '#cccccc' }), ...MATERIAL_PBR.PLAYER, transparent: true, alphaTest: 0.5, side: DoubleSide })
  })
  return object
}

async function itemUrlsFor(slot, id, ctx) {
  const item = await describeItem(id, ctx.prio)
  const sdk = accessoryUrls(slot.field, id)
  const fallback = slot.dir ? itemUrls({ type: slot.dir }, id) : {}
  return {
    mesh: assetUrl(item?.assetPaths?.mesh) || sdk?.mesh || fallback.mesh,
    texture: assetUrl(item?.assetPaths?.texture) || sdk?.texture || fallback.texture,
  }
}

// Places one slot's item on the rig. place(boneName, mirrored) -> the item's local Matrix4.
async function attachSlot(root, slot, id, place, ctx) {
  const urls = await itemUrlsFor(slot, id, ctx)
  if (!urls.mesh) return
  const object = await loadItemObject(urls.mesh, urls.texture, ctx)
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
    // Neck / chest / waist items widen with the torso (applyProportions), the back item does not.
    const torsoRest = ctx.rest?.[boneName]
    if (torsoRest && !mirrored && slot.inheritScale !== false && slot.field !== 'backId' && (boneName === 'Spine1' || boneName === 'Spine2')) {
      obj.userData.restInverse = torsoRest
      obj.userData.rest = torsoRest.clone().invert()
      ;(root.userData.torsoItems ||= []).push(obj)
    }
    obj.updateMatrixWorld(true)
    bone.add(obj)
  })
}

async function applyItems(root, equipped, place, ctx) {
  const slots = itemSlots().filter((slot) => isEquipped(equipped[slot.field]))
  await Promise.all(
    slots.map((slot) =>
      attachSlot(root, slot, equipped[slot.field], place, ctx).catch((err) => {
        ctx.failed++
        console.warn('[avatarLoader] slot failed', slot.field, err)
      }),
    ),
  )
}

// A hat can insist on a head ('-1' = the stock one) because it is modelled
// around it; a custom head would poke through. The portal applies this when
// the hat is equipped, but looks reaching us another way (e.g. a remote
// player's saved JSON) may predate it, so enforce it here too.
async function withForcedHead(equipped, ctx) {
  for (const key of ['hatId', 'hairId', 'maskId']) {
    if (!isEquipped(equipped[key])) continue
    const item = await describeItem(equipped[key], ctx.prio)
    const forced = item?.forceHeadId
    if (forced !== undefined && forced !== null) return { ...equipped, headId: forced }
  }
  return equipped
}

// `equipped` is the shape SDK.avatar.getEquipped() returns. `root` is a
// character from avatar/character.js, whose `nodes` map names every rig node.
// `signal` (optional AbortSignal) lets a caller cancel a stale load.
// Resolves true when everything equipped loaded, false when some slot / skin did not (it is skipped
// and the caller may retry the look). Never throws.
export async function attachEquippedAccessories(root, equipped, { signal, skinTextureUrl, prio = PRIO.normal } = {}) {
  if (!root || !equipped) return true
  const ctx = { prio, failed: 0 }
  try {
    ownMaterials(root)
    equipped = await withForcedHead(equipped, ctx)
    if (signal?.aborted) return false
    // Skin, body parts and accessories load in parallel (the shared rest pose too); each one swallows
    // and counts its own failure.
    const restReady = restInverses()
    const skinDone = applySkin(root, equipped, skinTextureUrl, ctx)
    const rest = await restReady
    ctx.rest = rest
    if (signal?.aborted) return false
    // Body parts and accessories load in parallel; each one swallows its own failure.
    const at = (boneName, mirrored, slot) => {
      const m = (rest[boneName] || new Matrix4()).clone()
      if (mirrored) m.multiply(MIRROR_X)
      return m.multiply(tmpM.makeTranslation(slot.origin?.[0] ?? 0, slot.origin?.[1] ?? 0, slot.origin?.[2] ?? 0))
    }
    await Promise.all([
      skinDone,
      ...AVATAR_SLOTS.filter((slot) => slot.kind === 'part' && isEquipped(equipped[slot.key])).map((slot) => applyPart(root, slot, equipped[slot.key], ctx)),
      applyItems(root, equipped, at, ctx),
    ])
  } catch (err) {
    ctx.failed++
    console.warn('[avatarLoader] equipping avatar failed', err)
  }
  return ctx.failed === 0
}

// --- Custom characters --------------------------------------------------------------------------
// A character (SDK getCharacterFor) is its own GLB with player.glb's 22 bone names and rest
// rotations, 6.4 units tall: same scale, same animator, texture embedded (no skin, no body parts,
// no proportions). Head / torso items use the SDK's characterAccessoryMatrix(character, bone);
// hands and shoes, and any bone it has no matrix for, scale(rig.anchors[bone]) x the player.glb
// placement.
export async function loadCharacterRig(character, { prio = PRIO.normal } = {}) {
  const url = character?.glbUrl
  if (!url) return null
  let gltf = null
  try {
    gltf = await loadGLTF(url, { prio, tries: 3, timeout: 15000 })
  } catch (err) {
    console.warn('[avatarLoader] character failed to load', url, err)
  }
  if (!gltf) return null
  const root = cloneSkeleton(gltf.scene)
  root.name = 'character'
  ownMaterialCopies(root) // players wearing the same character must not share fades
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

export async function attachCharacterAccessories(root, character, equipped, { prio = PRIO.normal } = {}) {
  if (!root || !character || !equipped) return true
  const ctx = { prio, failed: 0 }
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
    await applyItems(root, equipped, at, ctx)
  } catch (err) {
    ctx.failed++
    console.warn('[avatarLoader] character accessories failed', err)
  }
  return ctx.failed === 0
}

function prop(proportions, key) {
  const spec = PROPORTIONS[key]
  const raw = Number(proportions?.[key])
  return clamp(Number.isFinite(raw) ? raw : spec.def, spec.min, spec.max)
}

// The rig's bind pose, read once per root before any proportion touches it: each bone's local
// position / scale, its model-space position (rig units) and the inverse of its parent's model-space
// matrix (to turn a model-space shift into the parent's frame).
const SPREAD = 0.8 // the portal moves limbs by 80 % of the slider's offset (Bloxity's reference rig)
function bindOf(root) {
  if (root.userData.bind) return root.userData.bind
  // Model-space bind matrices: from the skeleton (exact even if the rig is posed right now), else
  // (the procedural stand-in has no skin) from the hierarchy with the root's own transform undone.
  const bindModel = {}
  let skinned = null
  root.traverse((o) => {
    if (!skinned && o.isSkinnedMesh && o.skeleton && !o.userData.platformOutfit) skinned = o
  })
  if (skinned) {
    skinned.skeleton.bones.forEach((b, i) => (bindModel[b.name] = skinned.skeleton.boneInverses[i].clone().invert()))
  } else {
    root.updateMatrixWorld(true)
    const toModel = root.matrixWorld.clone().invert()
    root.traverse((o) => o.name && (bindModel[o.name] = toModel.clone().multiply(o.matrixWorld)))
  }
  const bones = {}
  for (const [name, node] of Object.entries(root.nodes || {})) {
    if (!bindModel[name] || !/^(Rig1|Spine|Arm|Leg|Neck)/.test(name)) continue
    const parent = (node.parent && bindModel[node.parent.name]) || new Matrix4()
    bones[name] = {
      node,
      position: node.position.clone(),
      scale: node.scale.clone(),
      model: new Vector3().setFromMatrixPosition(bindModel[name]),
      toParent: new Matrix3().setFromMatrix4(parent.clone().invert()),
    }
  }
  root.userData.bind = { bones }
  return root.userData.bind
}

// Torso width widens the Spine1 / Spine2 skin only (Bloxity scales those two bones' skinning
// matrices along x): scaling the bones themselves would squash the arms, neck and head with them.
const widened = new WeakSet()
function widenTorsoSkin(root) {
  root.traverse((o) => {
    const skel = o.isSkinnedMesh ? o.skeleton : null
    if (!skel || widened.has(skel)) return
    widened.add(skel)
    const spine = []
    skel.bones.forEach((b, i) => (b.name === 'Spine1' || b.name === 'Spine2') && spine.push(i * 16))
    if (!spine.length) return
    const update = skel.update.bind(skel)
    skel.update = function () {
      update()
      const w = root.userData.torsoScaleX ?? 1
      if (w === 1) return
      const m = this.boneMatrices
      for (const at of spine) for (let k = 0; k < 4; k++) m[at + k] *= w
    }
  })
}

// Moves a bone by `dx` rig units along the model's x axis (in bind space), from its bind position.
const tmpV = new Vector3()
function shiftX(b, dx) {
  if (!b) return
  b.node.position.copy(b.position)
  if (dx) b.node.position.add(tmpV.set(dx, 0, 0).applyMatrix3(b.toParent))
}

// Rescales an already-built character per SDK.avatar.getProportions(), the way the portal and
// Bloxity's reference rig draw it (so the body looks the same as on the player's profile). Safe to
// call repeatedly (e.g. from onProportionsChanged): it always starts from the bind pose. A null
// `proportions` resets to the defaults. Not for custom characters, nor for a kit-dressed rig (the
// kit shapes the body from the outfit key itself).
export function applyProportions(root, proportions) {
  if (!root) return
  const unitScale = PLAYER_DIMS.height / RIG_HEIGHT
  if (root.userData.customCharacter || root.userData.kitProportions) {
    root.scale.setScalar(unitScale)
    return
  }
  const p = {}
  for (const key of Object.keys(PROPORTIONS)) p[key] = prop(proportions, key)
  const { bones } = bindOf(root)

  // Bind pose first, then the sliders.
  for (const b of Object.values(bones)) {
    b.node.position.copy(b.position)
    b.node.scale.copy(b.scale)
  }
  // Arm length: every arm bone stretches along its own y (the stretch compounds down the arm).
  for (const [name, b] of Object.entries(bones)) if (name.startsWith('Arm')) b.node.scale.y = b.scale.y * p.armLength
  // Height stretches the whole body vertically; the head keeps its shape (Neck1 undoes the stretch).
  const neck = bones.Neck_Offset
  if (neck) neck.node.position.y = neck.position.y + (p.height - p.headScale) * neck.position.y + neck.model.y * (p.neckHeight - 1) * SPREAD
  const head = bones.Neck1
  if (head) head.node.scale.set(head.scale.x * p.headScale, head.scale.y * (p.headScale / p.height), head.scale.z * p.headScale)
  // Shoulder width and torso width move the arms out; leg spacing moves the legs.
  const spineX = bones.Spine1?.model.x ?? 0
  for (const side of ['L', 'R']) {
    const arm = bones[`Arm${side}_Offset`]
    if (arm) shiftX(arm, arm.model.x * (p.shoulderWidth - 1) * SPREAD + (arm.model.x - spineX) * (p.torsoScaleX - 1) * SPREAD)
    const leg = bones[`Leg${side}_Offset`]
    if (leg) shiftX(leg, leg.model.x * (p.legOffsetX - 1) * SPREAD)
  }
  root.userData.torsoScaleX = p.torsoScaleX
  widenTorsoSkin(root)
  widenTorsoItems(root, p.torsoScaleX)

  // Rig units -> metres uniformly, then the height proportion as a vertical stretch only.
  root.scale.set(unitScale, unitScale * p.height, unitScale)
  keepItemSizes(root)
}

// Items worn on the torso (neck, chest, waist, back) widen with it, like the portal's.
function widenTorsoItems(root, w) {
  for (const obj of root.userData.torsoItems || []) {
    obj.matrix.copy(obj.userData.baseMatrix)
    if (w !== 1) obj.matrix.premultiply(obj.userData.restInverse.clone().multiply(new Matrix4().makeScale(w, 1, 1)).multiply(obj.userData.rest))
    obj.matrixWorldNeedsUpdate = true
  }
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
