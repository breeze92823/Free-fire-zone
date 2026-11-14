# `src/avatar/`: the character pipeline

Turns a player's Bloxity look (ids only) into a dressed, animated character root, the same way for the local player, remote players and the lobby platform.

| File | Role |
| --- | --- |
| `rig.js` | `PoseBuffer` (flat pose array) and `PlayerRig` (binds bones, applies a pose). |
| `animator.js` | Procedural animation: locomotion states + weapon / crouch / down / emote layers. |
| `character.js` | The base character: bundled `player.glb`, or a procedural stand-in. |
| `assets.js` | Download gate, timeouts, retries, promise caches. |
| `cdn.js` | Bloxity CDN / catalogue URL builders, `isEquipped`. |
| `loader.js` | Dresses a rig by hand: skin, body parts, accessories, proportions; custom-character rigs. |
| `look.js` | Chooses how a look is built, `streamLook`, `prewarmLook`, replication JSON. |

A "root" everywhere below is an `Object3D` named `character` with `root.nodes` (name -> node for every named descendant), `root.animations` and a scale of `PLAYER_DIMS.height / RIG_HEIGHT` (1.8 m / 6.4 rig units).

## 1. The rig

### `player.glb`
`public/avatars/player.glb` is the shared Bloxity base rig, bundled so it never depends on the CDN. `loadBaseCharacter()` loads it through `loadGLTF` (`PRIO.local`, 3 tries, 15 s), clones it with `SkeletonUtils.clone`, sets `castShadow` and `frustumCulled = false` on meshes and fills `root.nodes`. Origin at the feet, 6.4 units tall (`RIG_HEIGHT`).

Hierarchy and bind positions (parent-relative, copied into `character.js buildRig`):

| Bone | Parent | Position |
| --- | --- | --- |
| `Rig1` | root | 0, 0, 0 |
| `Spine1` | `Rig1` | 0, 2.4, 0 |
| `Spine2` | `Spine1` | 0, 1.8, 0 |
| `ArmR_Offset` / `ArmL_Offset` | `Spine2` | -2 / +2, 0.6, 0.4 |
| `ArmR1` / `ArmL1` | the offset bone | 0, 0, 0 |
| `Neck_Offset` -> `Neck1` | `Spine2` | 0, 0.6, 0 |
| `LegR_Offset` / `LegL_Offset` | `Rig1` | -0.6 / +0.6, 2.4, 0 |
| `LegR1` / `LegL1` | the offset bone | 0, 0, 0 |

`player.glb` additionally has the second joints `ArmL2`, `ArmR2`, `LegL2`, `LegR2` and the leaf bones `ArmL2_leaf`, `ArmR2_leaf`, `LegL2_leaf`, `LegR2_leaf` (referenced by `loader.js` slots and `actor.js`), and six `SkinnedMesh`es bound to one skeleton sharing one material: `default_head`, `default_torso`, `default_arm_L`, `default_arm_R`, `default_leg_L`, `default_leg_R`.

### The procedural stand-in (`buildDefaultCharacter`)
Used only when `player.glb` fails to load. Same bone names and bind positions, but no elbows, knees or leaf bones, and rigid boxes parented to bones instead of skinned meshes (only the arm meshes are named, `default_arm_L` / `default_arm_R`). It has no `default_torso`, which is how `isBloxityRig` and `restInverses` tell it apart.

### Pose space (`rig.js`)
Poses are authored in character space: the character faces +Z, **+X pitch swings a limb backward** (negative X raises an arm forward), +Y yaws, +Z rolls about the forward axis. `PlayerRig` resolves these axes into each bone's parent space once, at construction, so the twisted limb frames of `player.glb` and the identity frames of the stand-in pose identically.

- `BONE_NAMES` (12 animated bones): `Rig1`, `Spine1`, `Spine2`, `Neck1`, `ArmL1`, `ArmL2`, `ArmR1`, `ArmR2`, `LegL1`, `LegL2`, `LegR1`, `LegR2`. `BONE_INDEX` maps name -> index.
- `PoseBuffer`: `rotations` (`Float32Array`, 3 radians per bone) + `bobY`. Methods: `reset()`, `set(bone, x, y, z)`, `add(bone, x, y, z)`, `copyFrom(other)`, `lerpBetween(from, to, t)`, `applyDefinition({ Bone: { x, y, z } }, weight)` (resets first). `set` / `add` do not validate the bone name.
- `PlayerRig(root)`: must be created while the rig is in its bind pose. Per bone it stores `rest` (bind quaternion) and the three character axes in parent space. `applyPose(pose)` writes `Rz * Ry * Rx * rest` to each bound bone (all-zero rotations copy `rest`); nothing accumulates between frames. `resetToBindPose()`. Bones missing from `root.nodes` are skipped.

There are no anchors in `rig.js`. "Anchors" in this pipeline are (a) accessory slot `origin`s in `loader.js`, (b) `character.rig.anchors` from the SDK for custom characters, (c) the right-hand leaf `ArmR2_leaf` used by `actor.js` for held weapons.

## 2. Looks

A look is `{ equipped, proportions, outfitKey, skinTextureUrl? }`; any field may be missing. `equipped` is the object `SDK.avatar.getEquipped()` returns (`skinId`, `faceId`, `shirtId`, `pantsId`, `headId`, `torsoId`, `armLId`, `armRId`, `legLId`, `legRId`, `hatId`, `backId`, accessory fields, `characterId`). `skinTextureUrl` exists only for the local player (`main.js localLook`) and is never replicated.

### Decision order (`look.js build`, behind `buildLook`)

| # | Kind | Condition | Steps | `complete` |
| --- | --- | --- | --- | --- |
| 1 | `character` | `isEquipped(equipped.characterId)` | `bloxity.getCharacterFor(equipped)` (12 s) -> `loadCharacterRig` -> `attachCharacterAccessories` | false when an accessory failed |
| 2 | `kit` | `bloxity.characterKit()` exists, a key exists (`look.outfitKey` or `getOutfitKeyFor(equipped)`), `kit.canDress(key)` is true | `loadBaseCharacter()` -> `kit.dress({ THREE, GLTFLoader, root, outfitKey })` (12 s; default `proportions: 'kit'`: the kit shapes the body from the proportions in the key, exactly like the portal) -> `root.userData.kitProportions = true`, `applyProportions` (unit scale only) -> `root.userData.lookHandle = handle` | always true |
| 3 | `manual` | otherwise, or 1 / 2 failed | `loadBaseCharacter()` -> `attachEquippedAccessories` (when `equipped`) -> `applyProportions` | false when a skin / part / accessory failed |

Each step falls through to the next on failure. `buildLook` resolves `{ root, kind, handle, complete }`, or `null` only if something outside the per-step guards threw. `buildLook` runs through `buildGate` (`makeGate(3)`: three looks assembled at once, ordered by `prio`).

### Manual path details (`loader.js attachEquippedAccessories`)
1. `ownMaterials(root)`: the clone shares one material with every other clone, so each instance gets its own `MeshStandardMaterial` copies before a skin is painted on.
2. `withForcedHead`: if the hat / hair / mask catalogue item has `forceHeadId`, `headId` is overridden.
3. In parallel: `applySkin`, `applyPart` per equipped body-part slot, `applyItems`.
   - **Skin**: candidates are the composed skin (`skinTextureUrl` argument, else `composedSkinUrl(equipped)`), then the plain skin (catalogue `assetPaths.texture`, else `skinUrl(id)`, id 0 when none is equipped). The texture is set as `map` on every `SkinnedMesh`. Counts as failed when no texture loaded or when the plain one had to stand in for a composed one.
   - **Parts** (`AVATAR_SLOTS` in `cdn.js`): URL from the catalogue (`assetPaths.mesh` / `meshL` / `meshR`), else `partUrl`. The geometry of the matching `default_*` mesh is replaced; `skinIndex` is remapped by bone name into the base skeleton's order; the part's own material is dropped. A part file without a skinned mesh is used only if its geometry has `skinIndex` / `skinWeight`, otherwise the default part stays (unweighted geometry follows a random bone).
   - **Items** (`itemSlots()`): `HAT_BACK_SLOTS` plus the SDK's `getAccessorySlots()` list, or `FALLBACK_SLOTS` when the SDK has none. URLs: catalogue `assetPaths` -> SDK `accessoryUrls(field, id)` -> pattern `itemUrls({ type: slot.dir }, id)`. The OBJ is cloned, given a `MeshStandardMaterial` like the portal's (`transparent`, `alphaTest: 0.5`, `DoubleSide`; grey when its texture failed) and attached to `slot.bone` with a fixed local matrix `restInverse(bone) x translate(origin)`; `mirrorBone` gets a second copy with `x MIRROR_X`. Un-mirrored items on `Spine1` / `Spine2` other than the back item are listed in `root.userData.torsoItems` and widen with the torso.

Built-in slots (origins in rig units, model space of `player.glb`):

| Field | Bone | CDN dir | Origin | Notes |
| --- | --- | --- | --- | --- |
| `hatId` | `Neck1` | `hats` | 0, 5.6, 0 | always present (`HAT_BACK_SLOTS`) |
| `backId` | `Spine2` | `back` | 0, 4.2, 0 | always present |
| `hairId`, `maskId` | `Neck1` | `hats` | 0, 5.6, 0 | fallback list |
| `neckId` | `Spine2` | `neck` | 0, 4.8, 0 | fallback list |
| `chestId` | `Spine2` | `chest` | 0, 3.6, 0 | fallback list |
| `waistId` | `Spine1` | `waist` | 0, 2.4, 0 | fallback list |
| `handId` | `ArmL2_leaf` + mirror `ArmR2_leaf` | `hand` | 0, 0, 0 | `inheritScale: false` |
| `shoesId` | `LegL2_leaf` + mirror `LegR2_leaf` | `shoes` | 0, 0, 0 | `inheritScale: false` |

`restInverses()` reads the inverse world matrix of every named node of an unscaled `player.glb` once (cached promise; not kept if only the stand-in loaded).

### Custom characters (`loader.js`)
`loadCharacterRig(character, { prio })` loads `character.glbUrl` (3 tries, 15 s), clones it, requires `Rig1` or `Neck1`, sets `root.userData.customCharacter = character.id || true` and the standard scale. Its texture is embedded: no skin, no body parts, no proportions. `attachCharacterAccessories` places items with `bloxity.characterAccessoryMatrix(character, bone) x translate(origin)` for un-mirrored `Neck1` / `Spine1` / `Spine2`, otherwise `scale(character.rig.anchors[bone]) x restInverse(bone) [x MIRROR_X] x translate(origin)` (`anchorScale` accepts a number, `[x, y, z]` or `{ x, y, z }`).

### Proportions (`loader.js applyProportions(root, proportions)`)
Clamped per `PROPORTIONS` in `config.js`; `null` resets to defaults; safe to call repeatedly. The formulas are the ones of Bloxity's reference rig (`bloxity.io/test-game.html`) and the SDK's character kit, so a body looks the same as on the player's profile. On a custom character or a kit-dressed rig (`userData.kitProportions`) it only sets the unit scale.

`bindOf(root)` captures once (in `root.userData.bind`) each bone's bind local position / scale, its model-space bind position (from `skeleton.boneInverses`, or the hierarchy for the stand-in) and its parent's inverse bind matrix. Every call starts from that bind pose, then (`p` = clamped values, `SPREAD` = 0.8):

| Key | Applied to |
| --- | --- |
| `armLength` | `.scale.y` of every bone whose name starts with `Arm` (compounds down the arm, like the portal) |
| `height` | `root.scale.y` (x and z stay at the unit scale) |
| `headScale` | `Neck1.scale` = (`hs`, `hs / height`, `hs`): the head keeps its shape on a tall body |
| `neckHeight` | `Neck_Offset.position.y` = bind y + (`height` - `headScale`) x bind y + model y x (`neckHeight` - 1) x `SPREAD` |
| `shoulderWidth` | `ArmL_Offset` / `ArmR_Offset` moved along model x by model x x (value - 1) x `SPREAD` |
| `torsoScaleX` | the arm offsets also move by (model x - `Spine1` x) x (value - 1) x `SPREAD`; the `Spine1` / `Spine2` skinning matrices are scaled along x (`widenTorsoSkin` patches each skeleton's `update`, reading `root.userData.torsoScaleX`), so arms, neck and head are not squashed; `torsoItems` get `restInverse x scale(value, 1, 1) x rest` in front of their base matrix |
| `legOffsetX` | `LegL_Offset` / `LegR_Offset` moved along model x by model x x (value - 1) x `SPREAD` |

Finally `keepItemSizes` counter-scales every item in `root.userData.fixedScaleItems` (hands, shoes) from its `userData.baseMatrix`. The local player's slider changes (`main.js onProportionsChanged`) call it again, or `lookHandle.update(getOutfitKey())` on a kit-dressed avatar (a refused update rebuilds the look).

### Replication
- Out: `lookToJson({ equipped, proportions, outfitKey })` -> a JSON string of ids only, cut to 4000 characters; `''` when there is neither `equipped` nor `outfitKey`. `main.js` sends it in the join options (`avatar`, `outfitKey`) and in the `avatar` message (`sendAvatar`, on every avatar or proportions change).
- In: `lookFromJson(json, outfitKey)` parses (bad JSON -> `{}`), deletes any string value of `equipped` containing `/` or `:` (a URL never travels in a look), and lets the server's `outfitKey` argument win over the one inside the JSON. Callers: `online.js loadRemoteAvatar` (`p.avatar`, `p.outfitKey` from room state), `main.js showMates`.
- The whole `equipped` object is sent, so new slots and `characterId` reach other clients without code changes.

### `streamLook`, `prewarmLook`, `disposeLook`
- `streamLook(look, { prio, isStale, onBuilt, attempts = 4 })`: builds up to `attempts` times with waits of 1.5 s, 4 s, 10 s (`RETRY_DELAYS`). The first usable build (`isBloxityRig(root)`) is handed to `onBuilt(built)` even if incomplete; later builds are delivered only when `complete`. Stops when a complete build was delivered, when `isStale()` returns true, or when attempts run out. Builds that are stale, unusable or no better are passed to `disposeLook`. The caller owns each delivered root and must free the one it replaces.
- `prewarmLook(look)`: no-op without the SDK or without `equipped` / `outfitKey`. Deduplicated by `lookKey(look)` (a `Set` capped at 200), queued, built one at a time at `PRIO.warm`, then disposed, with a 50 ms pause between builds. Only purpose: warm the caches in `assets.js` and the kit.
- `disposeLook(root)`: calls `root.userData.lookHandle.dispose()` (the kit outfit) and clears the field. It does not dispose geometry, materials or textures.
- `isBloxityRig(root)`: `root.nodes.default_torso` or `root.userData.customCharacter`.

Callers: `main.js loadAvatar` (local player, `PRIO.local`, stale by generation counter, `wearAvatar` disposes the old root), `main.js showMates` (lobby platform: the lobby team's mates, up to two, via `streamLook`; everyone else in the room via `prewarmLook`), `online.js loadRemoteAvatar` (remote actors; `a.setAvatar`, `a.refreshHeld`, `disposeLook(old)`), `actor.js dispose` and `lobbyScene.js setMateAvatar` (`disposeLook`). With `VITE_DEV_MODE=true`, `main.js` wears `loadBaseCharacter()` directly and remote players keep their blocky outfit.

## 3. Asset gate (`assets.js`, `cdn.js`)

| Piece | Behaviour |
| --- | --- |
| `PRIO` | `{ local: 0, normal: 1, warm: 2 }`; lower runs first. |
| `makeGate(limit)` | `run(fn, prio)`: at most `limit` jobs active; the waiting job with the lowest `prio` starts next (first queued wins a tie). |
| `netGate` | `makeGate(6)`: every download below. |
| `withTimeout(promise, ms, label)` | Rejects after `ms`; the underlying work is not aborted, its result is dropped. |
| `retrying(fn, { tries = 2, timeout = 9000, backoff = 500, label })` | Each attempt has its own timeout; waits `backoff * 2^i` + up to 150 ms between attempts. |
| caches (`cacheOf`) | One promise per key; a rejected promise is evicted so the next look retries; successes are kept for the session. |
| `loadGLTF(url, { prio, tries = 2, timeout = 12000 })` | Cached by url. |
| `loadOBJ(url, { prio })` | Cached by url; 2 tries, 9 s. |
| `loadTexture(url, kind, configure, { prio })` | Cached by `kind|url`; `configure(texture)` runs once per cache entry. `loader.js` uses kind `'skin'` (`flipY = false`) and `'item'`, both sRGB with nearest magnification. Shared and never disposed. |
| `loadJSON(url, { prio })` | 2 tries, 6 s; resolves `null` on failure (not cached) and on HTTP 404 (cached as a real answer). |
| `sleep(ms)` | Promise timer. |

The timeout covers only the time inside a gate slot, not the time spent queued. Cache keys ignore `prio`, `tries` and `timeout`: the first request for a URL decides them.

`cdn.js` builds URLs under `https://static.bloxity.io/avatars`: `partUrl(slot, id)` (`/parts/<type>/<id>[_L|_R].glb`), `itemUrls(slot, id)` (`/items/<type>/<id>.obj`, `/textures/<type>/<id>.png`), `skinUrl(id)` (`/skins/<id>.png`), `composedSkinUrl(equipped)` (`https://api.bloxity.io/v1/avatar/skin-texture/s<skin>[_pn<pants>][_sh<shirt>][_fc<face>].png`, `null` when no pants / shirt / face), `describeItem(id, prio)` (`loadJSON` of `https://api.bloxity.io/v1/avatar/items/<id>`; `null` for an unequipped id), `assetUrl(path)` (host-relative -> absolute). `isEquipped(id)` is false for `null`, `undefined`, `-1`, `'-1'`, `''`, `'undefined'`, `'null'`.

## 4. The animator (`animator.js`)

`makeAnimator(root)` returns a `PlayerAnimator` (or `null` without a root); `disposeAnimator(animator)` resets bones to the bind pose and zeroes `root.rotation` and `root.position.y`. The animator writes only bone quaternions, `root.rotation` and `root.position.y`, so facing and world position belong on the parent (`actor.group`).

### `update(dt, input)` pipeline
`resolveState` -> `writePose` (base pose into `target`) -> `blend` (`from` -> `target` into `output`) -> `applyLayers` (edits `output`) -> `rig.applyPose(output)` -> `applyVisual` (root tilt / height).

| Input field | Type | Used by |
| --- | --- | --- |
| `grounded`, `speed` (m/s, horizontal), `verticalVelocity` | bool, number, number | base states |
| `turn` | -1..1 | bank while running |
| `hold` | `'rifle'` / `'pistol'` / `'melee'` / `'fist'` / falsy | which upper-body layer |
| `pitch` | radians, + = down | arms, spine, neck follow (`ANIM.aim.pitchFollow`) |
| `ready` | 0..1 | weapon raised (1) vs low ready (0) |
| `kick` | 0..1 | recoil |
| `reload` | 0..1, or -1 | reload progress |
| `swing`, `swingSide` | 0..1 or -1; 0 = right, else left | knife slash / punch |
| `throwing` | 0..1, or -1 | grenade throw |
| `crouch` | bool | crouch layer |
| `life` | `'alive'` / `'knocked'` / `'dead'` | whole-body override |
| `emote`, `emoteTime` | name or null, seconds | emote override |

Defaults (`NO_INPUT`) are grounded, idle. `actor.js updateModel` is the only caller and passes every field (`turn` is always 0).

### Base states (lower body and default arms)

| State | Entered when | Pose |
| --- | --- | --- |
| `idle` | grounded and `speed < idleSpeed` (0.6) | `ANIM.idle.basePose` + breathing on `Spine1` / `Neck1` and `bobY`; the gait phase eases back to 0. |
| `run` | grounded and faster | `writeLocomotion`: one cycle, phase advances with `speed / strideDistance` (clamped to `minFrequency`..`maxFrequency`); depths blend walk -> run -> sprint by speed. Legs, knees (`kneeCurve`), arm swing, elbows, torso twist / lean / roll, head counter-twist, `bobY`. |
| `airborne` | not grounded for more than `ANIM.airborneDelay` (0.07 s) | blend of `ANIM.airborne.fall` and `.rise` by `verticalVelocity / velocityReference`. |
| `landing` | first grounded frame after `airborne`, for `ANIM.landing.duration` (0.16 s) | `ANIM.landing.pose` fading out, with a `bobY` dip. |

`setState` snapshots `output` into `from` and cross-fades over `ANIM.transitions` (`toLocomotion` 0.14, `toAirborne` 0.12, `toLanding` 0.06) with smoothstep easing.

### Layers (`applyLayers`, in this order)

| Layer | Trigger | What it writes |
| --- | --- | --- |
| Crouch | `life === 'alive' && crouch && grounded`; weight `this.crouch` eased at rate 12 | Blends the X rotation of each bone in `ANIM.crouch.pose` toward the crouched value, keeping half of the stride while moving. `applyVisual` lowers the root by `crouch * ANIM.crouch.drop`. |
| Down (`writeDown`) | `life !== 'alive'`; **returns after it** | Resets `output`. `knocked`: face-down crawl, arms and legs driven by `this.crawl` (advances with speed). `dead`: static sprawl. |
| Emote (`writeEmote`) | `input.emote` truthy; **returns after it** | `wave`, `salute`: mixed over the base pose. `dance`, `flex`, `cheer`: set specific bones (others keep the base pose), `dance` / `cheer` add `bobY`. Any other name: portal clip lookup. |
| Weapon hold | `hold` truthy (a falsy `hold` returns here, before the throw layer) | See below. |
| Throw | `0 <= throwing < 1` | Right arm winds back to about -170 deg and whips forward (peak at 0.45), `Spine1` twists. Full weight, overrides the hold pose on `ArmR1` / `ArmR2`. |

Weapon hold variants:
- `rifle` / `pistol`: `this.ready` eases toward `input.ready` (rate 10). Arm X = lerp(low ready `-38 deg + 0.35 x pose`, `pose + pitch`, ready) minus `kick x 9 deg`; mix weight `0.65 + 0.35 x ready`. **Reload** (`0 <= reload < 1`): the left arm drops toward the magazine and back along `sin(pi x reload / 0.85)`. `Spine2` and `Neck1` follow the pitch.
- `melee`: idle guard pose from `ANIM.aim.melee` at weight 0.9; during a swing (`0 <= swing < 1`) the right arm winds up for the first 30 % then slashes, `Spine1` yaws.
- `fist`: both arms in guard (`ANIM.aim.fist`); a punch extends the arm chosen by `swingSide` along `sin(pi x swing)` and twists `Spine1`.

`mix(bone, x, y, z, w)` lerps the output toward absolute values; `addTo(bone, x, y, z)` adds. Both ignore unknown bones.

### `applyVisual`
- `bank`: roll into turns, only in `run` and alive: `-turn x bankAngle x 0.6`, eased at `bankRate`.
- `lie`: eased toward +1 (`knocked`, face down), -1 (`dead`, face up), 0. `root.rotation = (lie x 0.47 pi, 0, bank)`.
- `root.position.y = bobY x (1 - |lie|) + |lie| x LIE_RAISE (0.22 m) - crouch x ANIM.crouch.drop`.

### Portal emote clips
- `registerEmoteClip(id, clip)` stores a catalogue clip under `portal:<id>` (ignored unless `clip.tracks` is an object); `hasEmoteClip(id)`. `main.js playPortalEmote` fetches the clip with `bloxity.getEmoteClip`, registers it and calls `playEmote('portal:<id>')`.
- `writeClip(clip, t)`: clip is `{ len, loop, tracks: { bone: [[sec, xDeg, yDeg, zDeg], ...] } }`. Time is `t % len` when looping, else clamped to `len` (`len <= 0` counts as 1). Track names `ArmR_Offset`, `ArmL_Offset`, `LegR_Offset`, `LegL_Offset` drive `ArmR1`, `ArmL1`, `LegR1`, `LegL1` (`CLIP_BONES`); tracks for bones outside `BONE_INDEX`, and `Rig1`, are skipped. Between two keys the value is smoothstepped; before the first / after the last key it is clamped. The result **replaces** that bone's rotation in `output` (degrees converted to radians, same character-space axes).
- Emote time is owned by the caller: `actor.emoteT` is advanced in `match.js` (which ends the player's emote after `emoteLength(name)`: `ANIM.emotes[name].duration`, a catalogue clip's length + 0.2 s, or `ANIM.emoteLoopMax` 8 s for a looping or missing clip) and `results.js`. Other players' catalogue clips are fetched the first time their emote is seen (`online.js loadPortalClip` -> `registerEmoteClip`).

### Held weapons (in `actor.js`, not in the animator)
`Actor.setAvatar(root)` creates the animator and finds the hand: `root.nodes.ArmR2_leaf`, or a generated `ArmR2_leaf_gen` under `ArmR2` (y -1.15) or under `ArmR1` when there is no elbow (y -2.3), which it also registers as `root.nodes.ArmR2_leaf`. The held model is not parented to the bone: it lives in the scene and `updateModel` places it every frame at the hand's world position, pointing along the aim direction (blended by `ready`; a fixed chest-carry direction when lowered; the forearm for melee), with a roll during reload. It is shown only while `life === 'alive'`, with no emote, no throw in progress and `actor.hidden` false (and not when the actor's opacity drops to 0.2 or less). The other gun rides in `backModel` under `actor.group`. After swapping an avatar, callers must call `actor.refreshHeld()`.

## 5. Exports per file

| File | Exports |
| --- | --- |
| `rig.js` | `BONE_NAMES`, `BONE_INDEX`, `PoseBuffer`, `PlayerRig` |
| `animator.js` | `makeAnimator(root)`, `disposeAnimator(animator)`, `registerEmoteClip(id, clip)`, `hasEmoteClip(id)` |
| `character.js` | `buildDefaultCharacter()`, `loadBaseCharacter()` (async, never rejects), `ownMaterialCopies(root)` |
| `assets.js` | `PRIO`, `sleep`, `withTimeout`, `makeGate`, `retrying`, `loadGLTF`, `loadOBJ`, `loadTexture`, `loadJSON` |
| `cdn.js` | `isEquipped`, `AVATAR_SLOTS`, `partUrl`, `itemUrls`, `skinUrl`, `composedSkinUrl`, `describeItem`, `assetUrl`, `hatObjUrl`, `hatTextureUrl`, `backObjUrl`, `backTextureUrl` |
| `loader.js` | `attachEquippedAccessories(root, equipped, { signal, skinTextureUrl, prio })` -> `Promise<boolean>`, `loadCharacterRig(character, { prio })`, `attachCharacterAccessories(root, character, equipped, { prio })` -> `Promise<boolean>`, `applyProportions(root, proportions)` |
| `look.js` | `buildLook(look, { prio })`, `isBloxityRig(root)`, `disposeLook(root)`, `streamLook(look, opts)`, `lookKey(look)`, `prewarmLook(look)`, `lookToJson(look)`, `lookFromJson(json, outfitKey)` |

## 6. Recipes

### Add an animation layer or pose
1. Put the pose data in `ANIM` (`config.js`) as `{ Bone: { x, y, z } }` in radians, character space (negative X raises a limb forward).
2. Add an input field (document it in the comment above `update`) and pass it from `actor.js updateModel`; for remote players the value must come from replicated state in `online.js applyRemote`.
3. Write the layer in `applyLayers`. Decide its place in the order: before the `life` check if it must apply in every life state (like crouch, which `writeDown` then wipes), after the emote return if it is an upper-body action that emotes and being down should cancel. Use `mix` for absolute targets with a weight and `addTo` for offsets; ease any persistent weight on `this` with `1 - exp(-rate x dt)` like `crouch` and `ready`.
4. A new base state goes in `resolveState` / `writePose` with a transition time in `ANIM.transitions`.
5. A new built-in emote is a `case` in `writeEmote`; the name must also be sellable / equippable in the game's emote lists (outside this folder).
6. Only the 12 bones of `BONE_NAMES` can be posed. A new bone needs an entry there (the buffer size follows) and must exist in `player.glb`.

### Add an accessory slot
1. If the SDK's `getAccessorySlots()` already returns it, nothing is needed: `itemSlots()` uses that list.
2. Otherwise add `{ field, bone, dir, origin, inheritScale, mirrorBone? }` to `FALLBACK_SLOTS` (or `HAT_BACK_SLOTS` if the SDK list will never contain it). `field` is the key in `equipped`, `dir` the CDN folder, `origin` the model-space point on `player.glb` in rig units.
3. If the item constrains the head, add its field to the list in `withForcedHead`.
4. Nothing changes for replication: the whole `equipped` object is sent.
5. A new body-part slot (geometry swap) goes in `AVATAR_SLOTS` in `cdn.js` with the `default_*` mesh it replaces.

### Change how looks are replicated
1. Edit `lookToJson` and `lookFromJson` together; keep ids only and keep the URL filter. Mind the 4000-character cut: a longer string is truncated into invalid JSON, which `lookFromJson` turns into an empty look.
2. `main.js` builds the payload (`lookJson`, `sendAvatar`, `setJoinOptions`); the backend stores and relays `avatar` and `outfitKey`, so a new top-level field needs the server to carry it.
3. Change detection uses string keys: `online.js loadRemoteAvatar` (`outfitKey|avatar`), `main.js showMates`, `look.js lookKey`. A new field must be part of those keys or the look will not rebuild.

## 7. Gotchas

- Create the animator while the rig is in its bind pose; `Actor.setAvatar` disposes the old animator (which restores it) before building the new one.
- The animator overwrites `root.rotation` and `root.position.y` every frame.
- Never paint on a clone's material before `ownMaterials`; the kit and custom-character paths do not call it.
- `disposeLook` only releases a kit handle. Roots replaced by `streamLook` upgrades are otherwise left to garbage collection; cached textures and geometries are shared and must not be disposed.
- `complete: false` is not an error: the look is shown and retried. The kit path reports `complete: true` unconditionally.
- When `kit.dress` times out, the manual path builds on a fresh base; the timed-out call may still finish on the dropped root.
- `withTimeout` frees the gate slot without aborting the request, so more than 6 connections can be open after timeouts.
- `applyProportions` resets `root.scale` and the arm / neck / leg bones' positions and scales; anything else scaling the root must reapply afterwards. It is not applied to custom characters or kit-dressed rigs.
- Every clone of `player.glb` or of a custom character gets its own material copies (`character.js ownMaterialCopies`): a fade (`characters.js setOpacity`: cloak, spawn shimmer, the results screen hiding players outside the lineup) must never reach another player. `setOpacity` remembers each material's own `transparent` / `opacity` / `depthWrite` (and each mesh's `castShadow`) and restores them at 1; it records the fade in `root.userData.opacity`, and `Actor.setAvatar` resets a still-faded root to 1. The local player's root is reused by the lobby and every round: without that reset a player hidden at the results stayed invisible in the lobby.
- Items are attached with `matrixAutoUpdate = false`; move them through `obj.matrix`, not `position`.
- The stand-in has no elbows, knees or skinned meshes; code touching `ArmR2`, `*_leaf` or `default_*` must tolerate their absence.

## Observations

- Fixed 2026-11-14: other players' portal emotes now play (their clip is fetched on first sight) and an emote's length comes from `emoteLength`.
- **Bank is inert**: `actor.js` always passes `turn: 0`.
- **The throw layer needs a `hold`**: `applyLayers` returns before it when `hold` is falsy.
- **Unused exports**: `cdn.js` `hatObjUrl`, `hatTextureUrl`, `backObjUrl`, `backTextureUrl`; `look.js` `lookKey` is only used inside the file. `attachEquippedAccessories`' `signal` option is never passed. `root.animations` is set but never read.
- **Stale comments**: `animator.js` and `actor.js` still say "player and bots" (`CLAUDE.md`: no bots); `character.js` says "blue outfit, brown hair" (`CHARACTER_COLORS.suit` is `#2b2f3a`) and that the animator "falls back" from `root.animations`; `cdn.js` says `loader.js` is its sole consumer (`look.js` imports `isEquipped`) and describes only hat / back items; `loader.js` mentions React.
- **`CLAUDE.md` says accessories are placed via `rig.anchors`**: that is the SDK character's `rig.anchors` field, not something in `rig.js`. Its description of the gate (6 at once, local first, prewarm last, 12 s SDK timeout, `complete`, `streamLook`, `prewarmLook`) matches the code.
- `loadJSON`'s comment says failures are never cached; an HTTP 404 is cached as `null` for the session by design.
