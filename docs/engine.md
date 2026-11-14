# Engine layer reference

Scope: the root-of-`src/` "engine" modules: `physics.js`, `player.js`, `camera.js`, `input.js`, `touch.js` + `touch.css`, `lighting.js`, `postfx.js`, `perf.js`, `world.js` (sea + clouds), `textures.js`, `propkit.js`, `bake.js`, `modes.js`, and `index.html`. Everything below was read from those files, plus `src/main.js` and `src/config.js` for how they are wired. Gameplay (`src/game/`), the island (`src/world/`), networking and the Bloxity SDK are documented elsewhere and only named here as callers.

All of these modules are singletons with module-level state (one physics world, one player body, one camera state, one `inputState`). The factory-style ones (`createLighting`, `createPostFx`, `createWorld`, `createGovernor`) return plain objects of closures.

## 1. How the modules fit together

### Boot order (`main.js`, top level, engine parts only)

1. `createGovernor(onChange)` (perf.js) runs first, before a renderer exists: it detects the device tier and loads the remembered rung. `currentPreset()` turns the choice (`ffz.quality` or Auto's rung) into a preset through `graphicsPreset(name, dprCap)`.
2. `WebGLRenderer({ antialias: preset.antialias })`, sRGB output, ACES tone mapping, `PCFSoftShadowMap`, pixel ratio `min(devicePixelRatio, preset.dpr)`.
3. `installInput(() => bloxity.showMenu(), renderer.domElement)` (input.js `install`).
4. Scene + `PerspectiveCamera(CAMERA.fov, 1, CAMERA.near, CAMERA.far)`; `postfx = createPostFx(renderer, scene, camera)`; `postfx.configure(preset)`; `resize()`.
5. SDK settings are applied through `applySetting` (all keys except `graphics_quality`; `master_volume` only with the SDK).
6. `await initPhysics()` -> `createLighting(scene, renderer, preset)` -> `setTextureQuality({ texScale, anisotropy })` -> `createWorld(scene, preset)` -> `buildIsland(scene, { lighting, preset })` -> loot -> `createPlayerBody()`, `body.frozen = true`, `resetPlayer(blueSpawn, 0)` -> nav grid, fx, map pictures (each map's mood is set with `setMood` for its vote card, then reset to `MAPS[0]`).
7. `hud.init`, `hud.touch = installTouch({ reload, crouch })`, `bindKeys(hud)` (controller.js registers the `onKey` handlers).
8. Lobby scene + a second post-fx instance `lobbyFx = createPostFx(renderer, lobbyScene.scene, lobbyScene.camera)`.
9. `setGameInput(false)`, `setTouchActive(false)` (menus own the screen), then `renderer.setAnimationLoop(() => frame(min(clock.getDelta(), 0.1)))`.

### Per frame (`frame(dt)` -> `gameFrame(dt)`)

`frame(dt)`: FPS readout; `governor.hold()` when `G.phase` changed; `governor.update(dt, phase is 'playing' or 'countdown')`; during an ad break only a render; `syncFlow()`; in `lobby`/`queue` only `lobbyScene.update`, `pumpWarmup()` (the shader warm-up, see `warmup.js`) + `lobbyFx.render()` (skipped while `lobbyHold` waits for new lobby shaders); otherwise `gameFrame(dt)`:

1. `gdt = dt * G.slowmo` (physics and gameplay use `gdt`; camera, lighting, sea use real `dt`).
2. Server state (`reconcile`, `applyState`, `syncClock`).
3. `updateController(gdt, hud)`: reads `inputState` and last frame's `aimRay`; writes `body.moveSpeed`, `body.frozen`, `body.canJump`, `body.impulse`, may call `addRecoil` / `addShake`. Then `body.frozen = true` is forced in `intro`, `countdown`, `results`.
4. `stepPhysics(gdt)`: for each fixed tick, tick listeners (the player's `step`, which reads `inputState.move`, `inputState.jump`, `getYaw()`), then `world.step()`.
5. `interpolatePlayer()`; `body.renderPosition`, `velocity`, `grounded`, `facing` are copied onto the player's Actor.
6. Pose to the server, match update, actor models, fx.
7. `updateCamera(camera, dt, opts)`: consumes `inputState.look`, applies recoil/FOV/collision, writes `aimRay`. Mode is chosen here (see camera.js).
8. `setControlsReleased(dead)` / `setTouchActive(...)` on death state changes; HUD; lock hint.
9. `updateView()` (view distance), `world.update(dt, elapsed, camera.position)`, `island.update`, `lighting.update(dt, focus)`, ambience, `postfx.render()`.

Consequences of this order: look input moves the view one frame after it arrives; the controller fires along the aim ray of the previous camera update; the player tick uses the yaw of the previous camera update.

### Module dependency graph

`player.js` -> `input.js`, `camera.js`, `physics.js`. `camera.js` -> `input.js`, `physics.js`. `touch.js` -> `input.js`. `lighting.js`, `world.js`, `propkit.js` -> `textures.js`. `propkit.js` -> `physics.js`. All read `config.js`. `postfx.js`, `perf.js`, `bake.js`, `modes.js` depend only on `config.js` / three.

## 2. Per-file reference

### physics.js

Rapier world (`@dimforge/rapier3d-compat`) with a fixed-step accumulator and render interpolation for mesh-bound bodies.

| Export | Signature | Notes |
|---|---|---|
| `RAPIER` | re-export | The Rapier namespace; import it from here. |
| `world` | `let`, `null` until `initPhysics()` | Live binding. Game code uses it directly (`castRay`, `createCollider`, `removeCollider`). |
| `alpha` | `let` number 0..1 | Fraction between the last tick and the next; live binding read by `player.interpolate`. |
| `initPhysics()` | `async () => World` | `RAPIER.init()`, gravity `(0, PHYSICS.gravity, 0)`, `world.timestep = PHYSICS.fixedStep`. |
| `onTick(fn)` | `fn(dt)` | Runs before every `world.step()` with `dt = PHYSICS.fixedStep`. No removal. Only user: `player.js`. |
| `stepPhysics(frameDt)` | returns ticks run | Accumulator capped at `fixedStep * maxSubSteps`; per tick: save prev transforms, listeners, `world.step()`, read bodies; then sets `alpha` and lerps/slerps bound meshes. |
| `bindMesh(body, mesh)` / `unbindMesh(mesh)` | returns the sync record | Mesh follows a body, interpolated. |
| `addDynamic(mesh, shape, opts)` | returns body | Dynamic body at the mesh transform; opts `density 1, friction 0.6, restitution 0.1, linearDamping 0.05, angularDamping 0.1, ccd false`; calls `bindMesh`. |
| `addFixed(shape, position, rotation?, { friction 0.8, restitution 0 })` | returns Collider | Static collider with no rigid body. Mutates the passed `ColliderDesc`. |
| `addFixedBoxFor(mesh, opts)` | returns Collider | Cuboid from a `BoxGeometry` mesh's parameters, scale, position, quaternion. |
| `removeBody(body)` | | `world.removeRigidBody`. |
| `segmentClear(ax, ay, az, bx, by, bz)` | returns 0..1 | Fraction of the segment up to the first static hit (1 = clear, also when `world` is null or the segment is shorter than 1e-4). |
| `bodyCount()` | number | `world.bodies.len()`. |

Collision groups and filters: there are no collision groups or interaction groups anywhere; every collider uses Rapier's defaults. Filtering is done only with `QueryFilterFlags`:
- `segmentClear`: `EXCLUDE_DYNAMIC | EXCLUDE_KINEMATIC | EXCLUDE_SENSORS` (static only). `game/combat.js` and `game/navgrid.js` define the same mask themselves for their own `world.castRay*` calls.
- The player's character controller: `EXCLUDE_SENSORS | EXCLUDE_KINEMATIC` (static and dynamic bodies block, other kinematic bodies do not).

How static colliders get added (all end in `world.createCollider(desc)` without a body):
- `addFixed` directly: `world/geom.js` merges the island's boxes and prisms into trimesh "soups" per 32 m grid cell and registers each with `addFixed(ColliderDesc.trimesh(...), origin)` (`flushColliders()`).
- `propkit.solidBox` / `solidPole` (wrappers over `addFixed`); `game/loot.js` uses `solidBox` for supply crates.
- `game/items.js` creates and removes frost-wall cuboids with `world.createCollider` / `world.removeCollider(c, false)` directly.
- `navgrid.js` and `devview.js` call `world.step()` once after building so the query pipeline sees the new colliders (their comments); in a match the next tick does that.

Config: `PHYSICS.gravity`, `fixedStep`, `maxSubSteps`.

### player.js

The local player's body: a kinematic position-based Rapier capsule moved by `KinematicCharacterController`. Gravity, jump, acceleration are computed here; collision resolution is Rapier's.

Exports:
- `player` (singleton object, mutated in place; `main.js` and `controller.js` import it as `body`).
- `createPlayerBody()`: creates body + capsule (`capsule(height/2 - radius, radius)`, friction 0) at `SPAWN`, the controller (offset 0.02, up +Y, autostep `PHYSICS.stepHeight` with min width 0.15 and not onto dynamic bodies, snap-to-ground `PHYSICS.snapToGround`, max climb `PHYSICS.maxSlope` degrees, slide from `maxSlope + 5`, impulses to dynamic bodies on, mass `PHYSICS.pushMass`), calls `resetPlayer()` and registers `step` with `onTick`. Requires `initPhysics()` first. Called once.
- `resetPlayer(spawn = SPAWN, facing = SPAWN_FACING)`: teleports feet to `spawn` (position, previous position and `renderPosition`), zeroes velocity, `grounded = true`, sets `facing`, clears `push`, moves the body. Does not touch `frozen`, `moveSpeed`, `impulse`, the jump timers or the camera. Callers: `main.js` (boot, `spawn` event, dev `teleport`), `game/results.js`.
- `respawn()`: `resetPlayer()` + `syncYawToPlayer()`. Only used as the fallback when `onFellOut` is null.
- `interpolate()`: once per frame after `stepPhysics`; writes `renderPosition = lerp(prev, position, alpha)`.

`player` fields:

| Field | Type | Written by | Meaning |
|---|---|---|---|
| `position` | `{x,y,z}` | `step`, `resetPlayer` | Feet at the latest tick. |
| `renderPosition` | `{x,y,z}` | `interpolate`, `resetPlayer` | Interpolated feet for this frame; `main.js` copies it to the Actor. |
| `velocity` | `{x,y,z}` | `step` | m/s. |
| `grounded` | bool | `step` | `controller.computedGrounded()` and not on the jump tick. |
| `facing` | radians | `step` (`yaw + PI` every tick), `resetPlayer` | Model yaw; 0 = +Z, PI = -Z. Not wrapped. |
| `dims` | copy of `PLAYER_DIMS` | never | Not read anywhere. |
| `moveSpeed` | m/s | `controller.updateController` | Target horizontal speed (walk / sprint / aim / crouch / crawl, x1.3 during one operative's ability, 0 while reviving). Default `PHYSICS.walkSpeed`. |
| `frozen` | bool | controller, `main.js` | Move input is treated as zero and jumps are not queued. Gravity, `push` and `impulse` still apply. |
| `canJump` | bool | controller (`alive && !crouch`) | Gate for queuing a jump. |
| `push` | `{x, z, t}` or null | controller (dash: the object returned by `items.dash`) | While `t > 0` the horizontal velocity is overwritten with `(x, z)` and `t` counts down. Cleared by `resetPlayer`. |
| `impulse` | `{x, z}` (the Actor's `Vector3`) | controller sets the reference each frame; `combat.js` adds to it | Added to velocity once per tick, then its x/y/z are zeroed. |
| `onFellOut` | fn or null | `main.js` (sends `fell`, at most once per second, only while alive in `playing`) | Called when `position.y < PHYSICS.killY`; without it `respawn()` runs. |
| `jumped`, `landed` | bool edges | `step` sets, controller clears | For sounds / dust. `landed` needs a fall speed below -6 m/s. |

`step(dt)` per tick, in order:
1. Save previous position. Basis from `getYaw()`: forward `(-sin, -cos)`, right `(cos, -sin)`; wish direction = `inputState.move` (x strafe, z forward), normalised only when longer than 1.
2. Horizontal velocity approaches `wish * moveSpeed` at `PHYSICS.airAccel` (airborne), `accel` (input held) or `decel` (no input), unless `push` is active. Then `impulse` is applied.
3. Jump: `inputState.jump` is always cleared; it sets `jumpQueued = PHYSICS.jumpBuffer` only if `!frozen && canJump`. A queued jump fires while `sinceGrounded <= PHYSICS.coyoteTime` (velocity y = `jumpSpeed`; `sinceGrounded` is then pushed past the coyote window so it cannot fire twice).
4. Gravity; while grounded the downward speed is held at -2 m/s (keeps the snap working).
5. `controller.computeColliderMovement(collider, velocity * dt, EXCLUDE_SENSORS | EXCLUDE_KINEMATIC)`; `grounded` updated; a blocked upward move (less than half the desired rise) zeroes the upward velocity.
6. `body.setNextKinematicTranslation`; `position` = body centre minus half height.
7. Below `killY`: `onFellOut()` or `respawn()`, and the tick returns before `facing` is updated.

Config: `PHYSICS` (`walkSpeed`, `accel`, `airAccel`, `decel`, `jumpSpeed`, `coyoteTime`, `jumpBuffer`, `gravity`, `stepHeight`, `snapToGround`, `maxSlope`, `pushMass`, `killY`), `PLAYER_DIMS` (`radius`, `height`), `SPAWN`, `SPAWN_FACING`. The speeds `sprintSpeed`, `aimSpeed`, `crouchSpeed`, `crawlSpeed` are chosen in `controller.js`.

### camera.js

Over-the-shoulder camera that owns yaw and pitch (the body faces where it looks). State: `state.yaw`, `state.pitch` (radians, pitch + = down), `sensitivity`, eased `aimK` (0..1) and `fovNow`, `clearance` (0..1 boom fraction), `recoilPending`, `recoilRecover`, `shakeAmt`, `followed` (smoothed target) and `initialised`. Scratch vectors are module-level.

| Export | Signature | Notes |
|---|---|---|
| `setCameraSensitivity(v)` / `getCameraSensitivity()` | number | Multiplier, default 1. Set from the SDK setting `camera_sensitivity` and the lobby slider. |
| `getYaw()` / `getPitch()` | radians | Yaw 0 looks toward -Z. |
| `setView(yaw, pitch = CAMERA.startPitch)` | | Hard-sets the view. |
| `syncYawToPlayer(facing = null)` | | `yaw = facing + PI`; does nothing without an argument. |
| `addRecoil(degUp, degSide = 0)` | | Adds to `recoilPending`; the side kick is applied to yaw at once with a random sign and size (up to half of `degSide`). |
| `addShake(amount)` | | Adds to `shakeAmt`, capped at 1.2. |
| `snapFollow()` | | Next update jumps to the target instead of smoothing (also resets `clearance`). |
| `aimRay` | `{ origin: Vector3, dir: Vector3 }` | Camera position + forward of the last `update`. Read by `controller.js` for firing and the crosshair. |
| `update(camera, dt, opts)` | | Called once per frame from `main.js` as `updateCamera`. |

`update` opts: `mode` (`'play'` default, `'scope'`, `'spectate'`, `'orbit'`, `'look'`), `target` (feet `{x,y,z}`), `aim` (bool), `zoomFov` (degrees), `crouch`, `knocked`, `noLook`, and for the fixed modes `from`, `lookAt`, `distance`, `height`, `time`.

Steps common to every mode, in order:
1. Look: `k = CAMERA.lookSensitivity * sensitivity * zoomScale`, where `zoomScale = CAMERA.aimSensitivity * (fovNow / CAMERA.fov)` while `opts.aim`, else 1. `yaw -= look.dx * k`, `pitch += look.dy * k`, skipped in `look`/`orbit` and with `noLook`. `inputState.look` is zeroed in every case.
2. Recoil: pending recoil is fed into pitch over a few frames (`min(pending, pending * dt * 30 + 0.002)` per frame, upward), half of it is stored and drifts back at 0.6 rad/s once nothing is pending. Pitch is clamped to `CAMERA.minPitch..maxPitch`.
3. `aimK` and `fovNow` ease with `CAMERA.aimEase`; FOV target is `opts.zoomFov || CAMERA.aimFov` while aiming, else `CAMERA.fov`; `camera.fov` is updated when it differs by more than 0.01.

Modes:

| Mode | Used by `main.js` when | Behaviour |
|---|---|---|
| `play` | alive (also dead with nobody to spectate) | Pivot at `followed + height`, shifted right by the shoulder offset, boom back along the view. `aim` is not a mode: `opts.aim` blends `distance -> aimDistance`, `shoulder -> aimShoulder`, `height -> aimHeight` by `aimK` and narrows the FOV. Height is `knockedHeight` when knocked, `crouchHeight + 0.3` when crouched. |
| `scope` | `view.scoped` in `playing` | Camera at the eye: `followed.y + 1.58` (1.3 crouched), 0.25 m forward. No collision test. `main.js` hides the player's model. |
| `spectate` | dead with `G.spectating` | Same boom maths with `CAMERA.spectateDistance` and a 0.3 m shoulder, target = the teammate. `main.js` passes `noLook: true`, so the view direction stays as it was. |
| `orbit` | `intro` flyover | Position `(cos(time * 0.12) * distance, height, sin(time * 0.12) * distance)` around the world origin (defaults 120 / 70), `lookAt(opts.lookAt)`. Returns early. |
| `look` | `results` | `camera.position = opts.from`, `lookAt(opts.lookAt)`. Returns early. |

Follow smoothing: x and z follow the target exactly; y eases with `CAMERA.followLerp`. A jump of more than 15 m (or `snapFollow()`) snaps.

Collision (play/spectate): `segmentClear(pivot -> shoulder point)` pulls the shoulder offset in (to `hit - 0.15` of it), then `segmentClear(shoulder point -> wanted position)` gives the boom fraction (`hit - 0.06`, minimum 0.05). `clearance` shortens instantly and eases back out with `CAMERA.clearEase`. Only static colliders block.

Shake: random offset of up to `shakeAmt * 0.125` per axis on the position, decaying with `CAMERA.shakeDecay`. Not applied or decayed in `orbit`/`look`.

Config: `CAMERA` (`fov`, `startPitch`, `minPitch`, `maxPitch`, `distance`, `aimDistance`, `shoulder`, `aimShoulder`, `height`, `aimHeight`, `crouchHeight`, `knockedHeight`, `aimFov`, `aimEase`, `followLerp`, `lookSensitivity`, `aimSensitivity`, `clearEase`, `shakeDecay`, `spectateDistance`). `CAMERA.near` / `far` are used by `main.js`. Callers: `main.js` (`update`, `setView`, `snapFollow`, `syncYawToPlayer`, `getYaw`, sensitivity), `player.js` (`getYaw`), `controller.js` (`aimRay`, `addRecoil`, `addShake`), `results.js` (`syncYawToPlayer`).

### input.js

Keyboard + mouse. Touch writes the same `inputState`.

`inputState` (the full shape):

| Field | Type | Written by | Read / cleared by |
|---|---|---|---|
| `move.x`, `move.z` | -1..1 (x + = right, z + = forward) | `recomputeMove()` = held WASD/arrows + touch joystick (`setTouchMove`), clamped | `player.step` (movement), `controller.js` (sprint test, dash direction, emote cancel) |
| `look.dx`, `look.dy` | pixels since last read | mouse `pointermove` (locked or drag-look), `touch.js` look pads (`* TOUCH.lookScale`) | `camera.update` reads and zeroes; `setControlsReleased(true)` zeroes |
| `sprint` | bool | `recomputeMove()`: either Shift or touch sprint | `controller.js` |
| `jump` | edge | Space keydown (when enabled and not released), touch JUMP | `player.step` clears it every tick; also `clearHeld`, `setControlsReleased` |
| `fire` | held | left mouse button while locked, touch FIRE buttons | `controller.js`; cleared on mouse up, lock loss, `clearHeld`, `setControlsReleased`, `setTouchActive(false)` |
| `aim` | held (mouse) / toggled (touch) | right mouse button, touch AIM | `controller.js` (`p.aiming`); cleared on mouse up, lock loss, `clearHeld`, `setControlsReleased`, and by `main.js` (`closeMatch`, own elimination) |
| `wheel` | notches (+ = next weapon) | `wheel` event on the canvas | `controller.updateController` reads and zeroes |
| `crouch` | toggled | `controller.bindKeys` (C, Left Ctrl), touch CROUCH via `main.js` callback | `controller.js` (`p.crouch`); reset in `main.closeMatch` |

Exports:
- `install(showMenu, canvasEl)`: stores the canvas and adds the listeners (see below). Called once.
- `onKey(code, fn)`: one handler per `KeyboardEvent.code` (a `Map`; a second registration replaces the first). Fires on keydown, not on repeats.
- `isHeld(code)`: whether a code is down.
- `isLocked()`, `requestLock()`, `releaseLock()`: pointer lock on the canvas. `requestLock` does nothing when input is disabled or controls are released.
- `setGameInput(on)` / `gameInputEnabled()`: `false` while a menu owns the screen: releases the lock, clears held keys, fire, aim, jump.
- `setControlsReleased(on)` / `controlsReleased()`: dead/spectating: lock released, no look, fire, aim, jump or re-grab; keys still work.
- `setTouchMove(x, z)`, `setTouchSprint(on)`: touch joystick input, summed with the keyboard.

Listeners (`install`):
- `keydown` (window): ignored when the target is an `<input>`; `preventDefault` for Space, arrows and Tab; repeats ignored; `Escape` calls `showMenu()` and stops; otherwise the code is added to `held`, then if enabled Space sets `jump` and the `onKey` handler runs; if disabled only the `KeyM` and `Tab` handlers run.
- `keyup`: removes the code. `blur`: `clearHeld()`.
- Mouse buttons: Pointer Events send `pointerdown` only for the first button pressed and `pointerup` only for the last one released. A second button pressed or released while another is held arrives as a `pointermove` with `button >= 0` and a new `buttons` mask, so all three handlers go through `press(e)` / `releaseButtons(e)`. Without this, firing while holding RMB, or aiming while holding LMB, was lost.
- Press (`pointerdown`, or a chorded `pointermove` whose button is now in `buttons`; mouse only, target must be the canvas, enabled, not released): left button fires when locked, otherwise requests the lock and starts drag-look (`orbiting`); right button sets `aim` and requests the lock.
- Release (`pointerup`, or a chorded `pointermove` whose button left `buttons`): clears `fire` and `orbiting` when bit 1 is gone and `aim` when bit 2 is gone.
- `pointermove` (mouse, enabled, not released): also adds `movementX/Y` to `look` while locked or drag-looking.
- `wheel` on the canvas while enabled: `preventDefault`, `wheel += sign(deltaY)`.
- `contextmenu`: always prevented. `pointerlockchange`: gaining the lock ends drag-look; losing it clears `fire` and `aim`.

Key bindings (built in here, or registered by `controller.bindKeys`):

| Key (`code`) | Action | Where |
|---|---|---|
| `KeyW`/`ArrowUp`, `KeyS`/`ArrowDown`, `KeyA`/`ArrowLeft`, `KeyD`/`ArrowRight` | Move | input.js |
| `ShiftLeft`, `ShiftRight` | Sprint | input.js |
| `Space` | Jump | input.js |
| `Escape` | `showMenu()` (portal menu; the browser frees the cursor) | input.js |
| Left mouse | First click grabs the cursor; then fire | input.js |
| Right mouse | Aim / scope | input.js |
| Wheel | Next / previous weapon | input.js -> controller |
| `Digit1`..`Digit4` | Weapon slot | controller |
| `KeyR` | Reload | controller |
| `KeyC`, `ControlLeft` | Toggle crouch | controller |
| `KeyG` | Frost wall; Respawn while dead | controller |
| `KeyT` / `KeyX` / `KeyF` / `KeyZ` | Frag / medkit / dash / emote | controller |
| `KeyQ` | Ability | controller |
| `KeyE` | Open crate (press), revive (held via `isHeld`) | controller |
| `KeyM` | Map (also works while input is disabled) | controller |
| `Tab` | Scoreboard while held (keyup listener in controller) | controller |

`KeyP` is unbound and must stay unbound. `KeyN` toggles day/night only in the dev harness (`world/devview.js`).

### touch.js / touch.css

Touch layer built in JS and appended to `<body>`. Shown when `body.touch-ui` is set: initially `COARSE_POINTER`; any finger/pen `pointerdown` turns it on, any mouse `pointerdown` turns it off (window capture listener).

Exports:
- `installTouch(actions)`: `actions = { reload(), crouch(on) }`. Builds the DOM and returns `{ syncAim(), syncCrouch(on) }` (stored as `hud.touch`; used when the keyboard or the game changes aim/crouch so the buttons' `on` state matches).
- `setTouchActive(on)`: `visibility` of the whole layer (menus, results, death hide it); hiding zeroes the joystick and `fire`.
- `touchShown()`: whether `body.touch-ui` is on (HUD prompt text, lock hint).

Controls:

| Control | Element | Effect |
|---|---|---|
| Joystick | `.touch-zone.touch-left` (in the pads layer) takes the touches; `.joy-base` > `.joy-knob` is drawn in `.touch-zone.touch-left.touch-ghost` (same rectangle, top layer, `pointer-events: none`) | Floating: the base jumps to the first finger. `setTouchMove(x, z)` with `TOUCH.deadZone` removed and rescaled; `setTouchSprint(true)` when pushed past `TOUCH.sprintPush` of the radius and mostly forward (`-dy > abs(dx) * 0.6`). One finger only. |
| Look pad | `.touch-zone.touch-right` | Every finger's drag adds `delta * TOUCH.lookScale` to `inputState.look`. |
| FIRE (main) | `.touch-btn.fire.main` in `.touch-cluster` | `inputState.fire = true` while any FIRE is held (counter); it is also a look pad, so dragging it turns the view. |
| FIRE (second) | `.touch-btn.fire.left`, child of `.touch-root` | Same, placed for the left index finger. |
| AIM | `.touch-btn.aim` | Toggles `inputState.aim`. |
| JUMP | `.touch-btn.jump` | `inputState.jump = true`. |
| CROUCH | `.touch-btn.crouch` | Toggles a local flag and calls `actions.crouch(on)` (`main.js` writes `inputState.crouch`). |
| RELOAD | `.touch-btn.reload` | `actions.reload()` (`startReload(G.player)`). |

Buttons are icon-only (inline SVG from `ICONS`). Weapons, items, ability, map, interact and respawn are HUD buttons in `game/hud.js`, not part of this layer.

Internals: `lookPad(zone, onDown, onUp)` tracks fingers in a `Map`, captures the pointer and stops propagation; `button(className, html, fn)` fires `fn` on `pointerdown` (not filtered by pointer type); `isFinger` = `touch` or `pen`.

Layers: `installTouch` appends two `.touch-root` elements to `<body>`. `.touch-root.touch-pads` (`z-index: 14`) holds the two pads and sits under the HUD (`z-index: 15`), so HUD buttons take their own taps and every other touch falls through to a pad. The plain `.touch-root` (`z-index: 20`) holds the buttons and the joystick's picture, above the HUD. `setTouchActive` sets `visibility` on both.

Layout (`touch.css`): each `.touch-root` is fixed, `inset: 0`, `pointer-events: none`, and `display: none` unless `.touch-ui`; children get `touch-action: none` and no selection/callout. Custom properties: `--pad` (`clamp(10px, 2.6vmin, 22px)`), `--safe-l/r/t/b` (safe-area insets). Zones span from 18% of the height to the bottom: left 42% wide, right 58%. `.joy-base` uses `--size: clamp(100px, 26vmin, 146px)`, with `.active` and `.sprint` states. `.touch-cluster` (bottom-right) defines `--fire: clamp(78px, 21vmin, 108px)` and `--side: clamp(48px, 12.5vmin, 64px)`; aim and jump are `--side` wide, crouch `0.86 * --side`, reload `0.8 * --side`. The second FIRE sets its own `--fire: clamp(58px, 15vmin, 76px)` at `left: safe-l + 41vw; top: 40%`. `@media (orientation: portrait)` shrinks the cluster (`--fire: clamp(70px, 19vmin, 92px)`, `--side: clamp(44px, 11vmin, 56px)`) and moves the second FIRE to `top: 52%; left: safe-l + 64px`. `.touch-btn.on` / `:active` is the highlighted state.

Config: `COARSE_POINTER`, `TOUCH.deadZone`, `TOUCH.lookScale`, `TOUCH.sprintPush`.

### lighting.js

`createLighting(scene, renderer, preset)` builds all scene lighting and returns its controls. Called by `main.js` (stored as `lighting` and `G.lighting`) and `world/devview.js`.

What it creates:
- Sky: a `BackSide` sphere of radius 500 with a gradient shader (uniforms `top`, `bottom`, `sunDir`, `sunColor`; sun disc + halo), `renderOrder -2`, no fog, no depth write, not frustum culled. Stars: 1400 additive points on the upper hemisphere at 0.9 of the radius, opacity from the mood.
- `scene.fog = new Fog(horizon colour, FOG.near, FOG.far)`.
- `HemisphereLight` and one `DirectionalLight` (`sun`) with a square orthographic shadow box (half-width `preset.shadowRange ?? LIGHT.shadowRange`, near 1, far 220, bias -0.0004, normalBias 0.03, map `preset.shadowMap`, `castShadow = preset.shadows`).
- Image-based lighting: the sky is baked with `PMREMGenerator.fromScene` into `scene.environment`; the previous target is disposed.
- Lamps: `PointLight(LIGHT.lampColor, 0, LIGHT.lampDistance, 2)` added through `addLamp`, each paired with a bulb material.

Moods: two slots, `D` and `N`, and a blend `night` (0 = `D`, 1 = `N`) that moves toward `target` over `TIME_OF_DAY.transition` seconds. `apply()` blends: sky zenith/horizon, sun colour, fog colour (= horizon), hemisphere colours, sun and hemisphere intensity, `scene.environmentIntensity`, `renderer.toneMappingExposure`, star opacity, the sun direction (normalised lerp of the two directions from `sunElevation`/`sunAzimuth`), and the lamp level (`lampIntensity`; bulb `emissiveIntensity = 0.3 + level / N.lampIntensity * 3`). A mood object has 13 keys: `zenith`, `horizon`, `sunColor`, `sunIntensity`, `sunElevation`, `sunAzimuth`, `hemiSky`, `hemiGround`, `hemiIntensity`, `envIntensity`, `lampIntensity`, `stars`, `exposure`.

In the game `target` never changes, so the scene always shows slot `D`. `main.js setMood(map)` calls `setMoods({ day: TIME_OF_DAY[map.mood] ?? TIME_OF_DAY.day, night: TIME_OF_DAY.night })`: the map's mood (`day`, `sunset` or `night`, from `MAPS`) goes into the day slot. It is called per map at boot (vote cards), in `enterRound` and in `closeMatch` (back to `MAPS[0]`).

Returned object:

| Member | Notes |
|---|---|
| `sun` | The directional light (`game/mapimage.js` widens its shadow camera for the map render). |
| `addLamp(x, y, z, bulbMaterial)` | Adds a point light, re-applies the blend, returns the light. No removal. Called by `world/index.js` for the highest-priority lamps (16, or 8 when detail < 0.5, or `maxLamps`). |
| `isNight()` | `target === 1`. |
| `setMoods({ day, night })` | Swaps both slots, `apply()`, re-bakes the environment. No-op when both objects are identical (by reference) to the current ones. |
| `toggleDayNight()` | Flips `target`; the blend then runs in `update`. Dev harness only. |
| `setShadows(preset)` | `castShadow`, shadow map size (disposes the old map), shadow box range. Toggling `castShadow` changes every material's shader: `main.applyGraphics` only does that between rounds. |
| `setShadowsActive(on)` | Shadows off/on without a shader change: `sun.shadow.intensity` 0/1 and `renderer.shadowMap.autoUpdate` (the shadow pass is skipped). Used when the graphics drop mid-round. |
| `setView(near, far, skyMax = Infinity)` | Fog distances; sky and stars scaled by `min(1, skyMax / 500)` so they stay inside the far plane. |
| `update(dt, focus)` | Every frame: advances the blend (re-bakes the environment when it moved more than 0.08 since the last bake or reached the target), centres sky and stars on `(focus.x, 0, focus.z)`, puts the sun 90 m from `focus` along the sun direction with its target on `focus`. |

Config: `TIME_OF_DAY` (moods + `transition`), `FOG`, `LIGHT`, preset fields `shadows`, `shadowMap`, `shadowRange`. Uses `mulberry32` from textures.js.

### postfx.js

`createPostFx(renderer, scene, camera)` -> `{ bloom, configure(preset), setBloomActive(on), sceneTarget(), setSize(w, h), render() }`. Two instances exist: `postfx` (match scene) and `lobbyFx` (lobby scene).

- `setBloomActive(on)`: enables / disables only the bloom pass (the scene still goes through the HDR target, so no shader changes). Used when the graphics drop mid-round.
- `sceneTarget()`: the render target the scene itself is drawn into (the composer's read buffer), or null when it is drawn straight to the screen. Materials drawn into a render target get a different shader (no tone mapping, linear output) than the same materials drawn to the screen, so turning bloom on or off recompiles the whole scene; `warmup.js` compiles for this target.

- `configure(preset)`: `preset.bloom` false -> composer disposed, `render()` falls back to `renderer.render(scene, camera)`. True -> the composer is rebuilt: a `HalfFloatType` render target with `samples = preset.antialias ? 4 : 0`, then `RenderPass` -> `UnrealBloomPass(BLOOM.strength, BLOOM.radius, BLOOM.threshold)` -> `OutputPass` (tone mapping + sRGB), pixel ratio and size taken from the renderer.
- `setSize(w, h)`: re-reads the renderer's pixel ratio; called from `main.js resize()`.
- `bloom` getter: the bloom pass (or null), for tuning from the console.

Bloom only picks up pixels brighter than `BLOOM.threshold` in linear HDR, so materials opt in by being emissive or scaled above 1 (see `propkit.neon`). `graphicsPreset()` forces `bloom: false` on coarse-pointer devices.

### perf.js

Auto graphics: a starting tier, then a frame-rate governor.

| Export | Signature | Notes |
|---|---|---|
| `gpuName()` | string | `UNMASKED_RENDERER_WEBGL` (or `RENDERER`) from a throwaway WebGL context; `''` when hidden or failed. |
| `detectTier()` | `{ tier, gpu, why }` | Tier from regexes on the GPU name (software renderers -> Low; separate tables for coarse-pointer devices and desktop; hidden name -> Medium on touch, High on desktop), then lowered by `navigator.deviceMemory` (<= 2 GB -> Low, <= 4 GB -> at most Medium) and `hardwareConcurrency` (<= 2 -> Low, <= 4 -> at most Medium). |
| `createGovernor(onChange)` | governor object | `onChange(rung, index)` on every move. |

Governor object: `detected`, `remembered` (a saved rung was loaded), getters `rung` (`{ tier, dpr? }`), `index`, `fps` (last window average), `enabled`; methods `setEnabled(on)`, `hold()` (restart the settle time), `update(dt, active)`.

- Ladder: `AUTO_GRAPHICS.ladder`, best first (Ultra, High, High dpr 1.5, Medium, Medium dpr 1, Low, Low dpr 0.85, Low dpr 0.7). Start rung = the saved one, else the first ladder entry of the detected tier.
- `update(dt, active)`: does nothing (and resets its window) when disabled, not `active`, or the document is hidden. After `AUTO_GRAPHICS.settle` seconds it averages FPS over `window` seconds. Below `down[kind]` -> one rung down, and the rung it left is blocked for `cooldown * 2^(strikes - 1)` seconds. At or above `up[kind]` for `upAfter` seconds -> one rung up if that rung is not blocked. `kind` is `touch` or `desktop` from `COARSE_POINTER`.
- Storage: `localStorage['ffz.auto'] = { gpu, rung }`, written on every move, read only when the stored `gpu` equals the current GPU name and the rung index exists. Strikes and blocks live in memory only.

`main.js` wiring: the governor is enabled only when the choice is Auto (`localStorage['ffz.quality']` absent or `'Auto'`); `onChange` calls `applyGraphics(currentPreset())`; `governor.hold()` on resize and phase change; `update` is active only in `playing`/`countdown`; `currentPreset()` = `graphicsPreset(rung.tier, rung.dpr)`. Because the rung is remembered, load-time fields follow it on the next visit.

Preset fields (`GRAPHICS_PRESETS`: Low, Medium, High, Ultra) and where they apply:

| Field | Applied by | Live |
|---|---|---|
| `shadows` | `renderer.shadowMap.enabled`, `lighting.setShadows` | between rounds; mid-round only `lighting.setShadowsActive` (fade off, no shader change) |
| `shadowMap`, `shadowRange` | `lighting.setShadows` | yes |
| `dpr` | `renderer.setPixelRatio`, composers via `resize()` | yes |
| `bloom` | `postfx.configure`, `lobbyFx.configure`, `setNeonBloom` | between rounds; mid-round only `postfx.setBloomActive` (pass off, no shader change) |
| `view { near, far }` | `main.updateView()` -> `lighting.setView`, `camera.far`, `world.setViewFit` | yes |
| `anisotropy` | `setTextureQuality` at boot, `setAnisotropy` | between rounds (it re-uploads every texture) |

Why "between rounds": shadows on/off and bloom on/off change the shader of every material in the scene, and on an Intel iGPU (ANGLE / D3D11) a full recompile measured 8-10 s of frozen game. `main.applyGraphics(next)` therefore splits a change: when a round is on (`G.match`) and `shadows`, `bloom` or `anisotropy` differ from the applied preset (`appliedGraphics`), it applies dpr, view distance and shadow map size / range at once, fades shadows and bloom off (or keeps them off) without a shader change, and keeps `next` in `pendingGraphics`. `closeMatch()` applies the pending preset; the lobby then compiles its new shaders in parallel and skips its own redraw until they are ready (`lobbyHold`), and the game scene is re-warmed in the background (see `warmup.js`).

### warmup.js

Shader and texture warm-up, so nothing compiles or uploads the first time it comes into view. three.js compiles a material's shader on its first draw and uploads a texture on its first use; a program is cached by its feature set (material type, maps, skinning, instancing, fog, lights, shadows, render target, ...), so warming one variant covers every later material with the same features.

| Export | Notes |
|---|---|
| `initWarmup(renderer)`, `addWarmTarget(scene, camera, fx)` | `main.js` registers the game scene first (with `postfx`), then the lobby scene (with `lobbyFx`). `fx.sceneTarget()` decides which shader variant is compiled. |
| `warmScene(target, { draw, extra })` | `compileAsync` of every material in the scene (parallel compile through `KHR_parallel_shader_compile`; the promise resolves when the driver reports every program ready, at most 8 s), every texture uploaded with `initTexture` (6 ms budget per slice), then optionally the forced draw. `extra`: objects added to the scene only for this call. |
| `drawWarm(target, extra)` | The forced draw on its own: every object shown and not culled (lights keep their real visibility, since the light count is part of every shader), drawn once into a 1x1 scissor of the target the game uses, shadow pass included. Compiles the shadow-depth shaders and does the driver's first-draw work. Call it inside a frame, right before that frame's real render, so the scissored clear never reaches the screen. |
| `warmObject(root)` | Compile (for every registered scene) + texture upload for a model built later. `avatar/look.js streamLook` awaits it before `onBuilt`, so a streamed look is swapped in only when it is ready (the old one stays on meanwhile); `main.js` does the same for the no-SDK base character. |
| `compileNow(target)` | Synchronous compile for the right target; `enterRound()` keeps it as a safety net (about 12 ms when everything is already compiled). |
| `keepAlive(object)` | three.js frees a program when the last material using it is disposed (a round's actors are freed at its end), so the warm kit is kept here for good. |

Flow (`main.js`): at the end of boot the lobby scene is compiled behind the loading screen ("Preparing graphics"), then `scheduleWarmup()`. In `lobby` / `queue` frames `pumpWarmup()` runs before the lobby render: it starts `warmScene` for the game scene (plus the warm kit) and the lobby without the draw, and once that resolves does one `drawWarm` of the game scene with the warm kit and the local avatar (borrowed from the lobby platform for that one draw). A graphics change that changes shaders schedules the same again. The warm kit (`game/warmkit.js buildWarmKit`) holds what a round creates on the fly: stand-in characters with name tags (real `Actor`s), every gun, both grenades, the medkit, a frost-wall slab and crystal (`items.js warmSamples`), an airdrop (`loot.js warmSamples`).

Measured on an Intel Iris Plus (ANGLE D3D11), Medium preset: round start 3.4 s -> 0.36 s (render part); first frag / frost wall / shot 0.15-0.53 s -> none over 90 ms; a mid-round tier change 8-10 s -> 10 ms; returning to the lobby after it 2.3 s -> 0.2-0.3 s frames. High preset: first lobby frame 5.5 s -> 0.74 s.

Other work moved off the round's frames (found with the hitch profiler, `src/prof.js`, `__game.hitches`):

- HUD icons (`game/icons.js prewarmIcons`): weapon icons are drawn on demand by a second WebGL context and PNG-encoded (30-170 ms each the first time). `main.js prewarmHudIcons()` queues every gun as the kill feed shows it (160x70, standard skin) and the loadout with its skins (160x70 slots, 256x110 weapon card), at boot and on PLAY; one is drawn per idle callback. Before: 120-270 ms in `hud.begin` at round start, 510 ms on the first `hud.update`, and a stall on each weapon's first elimination in the kill feed.
- Other players' stand-ins (`game/online.js prebuildRemotes`): in `queue` the roster tick builds the blocky character of every other queued player, for both teams (the armband is baked into the merged mesh), one per idle callback; `makeRemote` takes the matching one, players who left are freed. Before: ~60 ms per player in the round's first frame (about 300 ms in a full 3 v 3).

Round start after all of this: worst frame 91 ms (was 0.3-1 s of CPU plus 3.4 s of shader compiles). Checked and left alone: the network (456 messages in a round sample, 0.11 ms average, 5.6 ms max), garbage collection (no hitch in 1200 frames of moving and firing; about 2.5 ms of CPU per frame), and textures (95, about 31 MB, largest 1024x512, all canvas-drawn at load: compressed formats such as KTX2 do not apply).
| `antialias` | `WebGLRenderer` constructor; MSAA samples of the bloom target | renderer: load time |
| `texScale` | `setTextureQuality` before textures are made | load time |
| `particles` | `game/fx.js initFx` | load time |
| `detail` | `world.js` (sea material, cloud puffs), `world/` (geometry, lamp count, small-prop shadows) | load time |

`graphicsPreset(name, dprCap)` also applies `MOBILE_GRAPHICS_CAP` on coarse-pointer devices (dpr, shadowMap, particles, anisotropy capped; bloom off).

### world.js

`createWorld(scene, preset = {})` -> `{ setSeaColor(color), setViewFit(s), update(dt, elapsed, eye) }`.

- Sea: one `PlaneGeometry(WATER.size, WATER.size)` at `y = WATER.level`, receiving shadows. `preset.detail >= 0.5`: `MeshPhysicalMaterial` with the ripple normal map twice (normal map at `WATER.size / 14` repeats, clearcoat normal at `WATER.size / 37`). Below 0.5: `MeshStandardMaterial` with one normal map. Both are transparent (opacity 0.94).
- Clouds: 22 clouds merged into one mesh named `clouds` (seed 2024, 240 to 410 m from the origin, 30 to 100 m high, no fog, `matrixAutoUpdate = false`); puffs use icosahedron detail 2 when `detail >= 0.9`, else 1.
- `update`: scrolls the two normal maps; when `eye` is given, scales the clouds toward the eye by the fit factor.
- `setViewFit(s)`: fit factor `min(1, s)`; `main.updateView()` passes `skyMax / 600`.

Config: `WATER.level`, `size`, `color`; preset `detail`.

### textures.js

Procedural canvases, no image files. Painters are deterministic (fixed seeds) and are not cached: every call repaints, so callers keep the result (`world/materials.js` does).

Helpers and quality control:

| Export | Notes |
|---|---|
| `mulberry32(seed)` | Deterministic PRNG `() => [0, 1)`. Used widely outside this file. |
| `fbm(size, baseCells, octaves, seed)` | Tileable value-noise field, `Float32Array(size * size)`, 0..1. |
| `heightToNormal(heights, size, strength = 2)` | Sobel over a wrapped height field -> tangent-space normal-map canvas. |
| `toTexture(canvas, { repeat = 1, srgb = false })` | `CanvasTexture` with `RepeatWrapping`, tracked for anisotropy; `srgb: true` for colour maps, data maps stay linear. Uploads a downscaled copy when `texScale < 1`. |
| `setTextureQuality({ texScale = 1, anisotropy = 8 })` | Sets the scale for later `toTexture` calls and applies anisotropy. |
| `setAnisotropy(n)` | Live: updates every tracked texture that differs (`needsUpdate`). |
| `trackTexture(t)` | Registers a texture made elsewhere so anisotropy follows the preset. |

Scaling: painters always draw at full size. `fit()` (inside `toTexture`) returns a copy scaled by `texScale` (minimum 32 px, high-quality smoothing) when `texScale < 1` and the canvas is at least 128 px on its longer side; the copy is cached per source canvas in a `WeakMap`.

Painters:

| Painter | Returns | Used by |
|---|---|---|
| `paintRock(size = 256)` | `{ color, normal }` | `world/materials.js`, `world/terrain.js` |
| `paintTiles(size = 512, perSide = 4)` | `{ color, normal, roughness }` | `world/materials.js` |
| `paintCrate(size = 256)` | `{ color }` (uses `paintPlanks`) | `world/materials.js` |
| `paintPavement({ base, alt, joint }, size = 512, slabs = 4, seed = 505)` | `{ color, normal }` | `world/materials.js` |
| `paintWaterNormal(size = 256)` | normal canvas | `world.js`, `world/materials.js` |
| `paintPlanks(size = 512, planks = 6, seed = 9)` | `{ color, normal }` | `paintCrate` only |
| `paintText(text, opts)` | `{ canvas, draw }` (`draw()` repaints after the font loads) | `propkit.label` only |
| `paintGrass(512)` -> `{ color, height }`, `paintSand(256)` -> `{ color, normal }`, `paintCrackedSand(512, 9, 404)` -> `{ color, normal }`, `paintFacade(glass, 512, 8, 4, 606)` -> `{ color, lit }` | | not used |
| `paintBrushed`, `paintChevrons`, `paintFade`, `paintFlag`, `paintWaterfall`, `paintSoftDot`, `paintSparkle`, `paintLaneWater`, `paintQuilt`, `paintChecker` | one canvas each | not used |
| `toonGradient()` | 3x1 `DataTexture` | not used |

The island has more painters of its own in `src/world/paint.js` (built on `fbm`, `heightToNormal`, `mulberry32`).

### propkit.js

Small building blocks for props.
- `std(color, extra)`: `MeshStandardMaterial` (roughness 0.6, metalness 0). `glow(color, opacity = 0.85)`: additive unlit material.
- `put(parent, geo, mat, x, y, z, shadows = true)`: creates and adds a mesh, returns it.
- `yawQuat(yaw)`: quaternion object for a Y rotation. `solidBox(hx, hy, hz, x, y, z, yaw = 0)` and `solidPole(radius, height, x, z)`: fixed colliders through `addFixed`.
- `neon(color, k = NEON.k, extra)`: unlit material whose colour is `base * k` with bloom on and `base * min(k, NEON.plainMax)` with bloom off; registered in a set and removed on `dispose`. `setNeonBloom(on)`: re-applies every neon material; `main.applyGraphics` calls it with `preset.bloom`.
- `fontReady`: promise for `document.fonts.load('700 96px Fredoka')` (started at import). `label(text, height, opts)`: outlined text `Sprite` from `paintText`, repainted when the font is ready.

Used outside: `solidBox` (`game/loot.js`), `neon` (`world/relay.js`), `fontReady` (`world/materials.js`), `setNeonBloom` (`main.js`, `devview.js`).

### bake.js

`bake(root, castShadow = false)` -> `Group`: merges every mesh under `root` that shares a look (material type, colours, flags, opacity, blending, map, roughness, metalness, `userData.k`) into one mesh per look, in `root`'s local space; multi-material meshes are kept as they are. Not imported by any file.

### modes.js

Player-mode switch (`MODES = ['character', 'player']`, `START_MODE`): `getMode()`, `isFirstPerson()`, `setMode(next)`, `toggleMode()`, `onModeChanged(fn)` (returns an unsubscribe). Not imported by any file; the shooter's first-person view is the camera's `scope` mode.

### index.html

Viewport meta with `user-scalable=no` and `viewport-fit=cover`, theme colour, inline SVG favicon, Fredoka 500/600/700 from Google Fonts, base CSS (`overflow: hidden`, background `#0b1222`, `overscroll-behavior: none`, canvas `display: block; touch-action: none`, no text selection). Scripts: the Bloxity Legion SDK (`https://sdk.bloxity.io/v1/legion-sdk.min.js`, classic script, before the module) and `./src/main.js` as a module. The body has no other markup: the canvas, HUD, lobby and touch layer are created in JS.

## 3. Recipes

### Add a key binding and its touch control
1. Pick a `KeyboardEvent.code` that is not in the bindings table (never `KeyP`; `Escape` is reserved; a second `onKey` for the same code replaces the first).
2. One-shot action: `onKey('KeyV', () => canAct() && doIt())` in `controller.bindKeys`. Held action: `isHeld('KeyV')` inside `updateController`. Shared state (like crouch or aim): add a field to `inputState`, and clear it in `clearHeld()` and `setControlsReleased()` if it must drop on blur, menus and death.
3. Touch: in `touch.js` add an icon to `ICONS` and a `button('myaction', ICONS.myaction, fn)` in the `cluster.append(...)` list. If it needs game code, pass a callback through `actions` (the `installTouch({ ... })` call in `main.js`), as `reload` and `crouch` do. If the button shows a toggled state that other inputs can change, add a `syncX` method to the returned object and call it through `hud.touch?.syncX()`.
4. `touch.css`: add `.touch-btn.myaction` with `right`/`bottom` built from `--fire` and `--side`, and a size of at least 44 px; check portrait.
5. Actions that are HUD buttons (items, weapons) belong in `game/hud.js` instead.
6. Update the controls list in `game/lobby.js settingsWindow` and CLAUDE.md.

### Add a camera mode
1. In `camera.update`, read it from `opts.mode`. A fixed or cinematic mode goes next to `look`/`orbit` as an early-return branch: set `camera.position`, call `lookAt`, and update `aimRay`; add it to the look-input guard if the player must not turn it. A follow-type mode goes in the boom branch (choose `dist` and `shoulder`, like `spectate`); collision then works unchanged.
2. Put new tunables in `CAMERA` (config.js); use the module's scratch vectors, no allocations.
3. Select it in the camera block of `main.js gameFrame` and pass any new opts.
4. When the target or view jumps on entry or exit, call `snapFollow()` and `setView(yaw, pitch)`.

### Add a graphics preset field and make it apply live
1. Add the field to all four entries of `GRAPHICS_PRESETS`; if phones need a limit, extend `MOBILE_GRAPHICS_CAP` and `graphicsPreset()`.
2. Apply it where the system is created (it receives `preset`).
3. Add a setter on the module and call it from `main.js applyGraphics(next)`. Keep it cheap when the value did not change: `applyGraphics` runs on every governor move and every quality change. If the field changes shaders (a define, a material flag, a light, fog, a render target) or re-uploads textures, add it to `shaderChange()` so it waits for the round's end, and give it a no-recompile fallback for mid-round if lowering it should help at once.
4. If it cannot be changed live, note it as load-time in the comment above `GRAPHICS_PRESETS`; with Auto it follows the remembered rung on the next load.
5. Ladder rungs only carry `tier` and an optional `dpr`; a field the governor should vary on its own needs a new rung property handled in `currentPreset()` / `graphicsPreset()`.

### Add a lighting mood
1. Add an entry to `TIME_OF_DAY` with all 13 keys (copy `sunset`).
2. Use it as `mood: '<name>'` on a `MAPS` entry (`main.js setMood` looks it up, falling back to `day`), or call `lighting.setMoods({ day: X, night: Y })` yourself.
3. The object in the `night` slot must have `lampIntensity > 0` (it is a divisor for the bulb glow).
4. Check the map's vote card (rendered at boot in that mood) and the lamps (`lampIntensity`).

### Add a procedural texture
1. Write `export function paintX(size = 256, ...)` in `textures.js` (island-only painters go in `world/paint.js`) using `canvas`, `mulberry32(seed)`, `fbm`, `tintCanvas`, `fieldCanvas`, `heightToNormal`. Make it tile (wrap strokes, periodic noise) and return canvases, e.g. `{ color, normal, roughness }`.
2. Wrap each canvas once with `toTexture(c, { repeat, srgb })` (`srgb: true` only for colour) and keep the texture; do not repaint per use.
3. Create textures after `setTextureQuality` has run (after `createLighting` in `main.js`), otherwise `texScale` is not applied.
4. A `CanvasTexture` you build yourself should go through `trackTexture(t)`. Text canvases must be repainted after `fontReady`.

### Add a setting that affects one of these modules
1. Add the key to `SETTINGS` in config.js (`def` as a string, `type` `number`/`bool`/`enum`, `min`/`max` or `values`); `bloxity.js` then listens to it and coerces values with `coerceSetting`.
2. Give the module a setter with module-level state (pattern: `setCameraSensitivity`).
3. Handle the key in `main.js applySetting(key, value)`. The boot loop applies every key from `bloxity.settings` once.
4. For a lobby control, add `getX` / `setX` callbacks to the `initLobby({ ... })` call and a row in `lobby.js settingsWindow`. Persist under an `ffz.*` localStorage key if it must survive without the SDK (quality and volume do; look sensitivity does not).

## 4. Gotchas and invariants

- Never bind `KeyP` (the portal's pause key). `Escape` belongs to the portal menu.
- Pointer lock does not exist on touch: nothing may depend on `isLocked()` for touch play. Mouse listeners are Pointer Events filtered to `pointerType === 'mouse'`; touch input comes only from `touch.js` and HUD buttons.
- `inputState.look` is consumed by `camera.update` every call, in every mode. `inputState.jump` is consumed by the next physics tick even when the jump is refused. `inputState.wheel` is consumed only while `updateController` runs.
- `onKey` handlers run only while `setGameInput(true)` (except `KeyM` and `Tab`); held keys are still recorded while disabled.
- The first left click on the canvas only grabs the cursor; it never fires.
- `setTouchActive` (layer visibility) and `body.touch-ui` (touch layout on/off) are independent switches.
- `initPhysics()` must finish before anything touches `world` (`createPlayerBody`, `addFixed`, the island build). New colliders are visible to ray queries after a `world.step()`.
- `physics.world` and `physics.alpha` are live `let` exports: import them by name, do not copy them into module-level constants.
- `addFixed` mutates the `ColliderDesc` it is given; do not reuse a desc.
- `player.frozen` only stops input: a frozen player still falls and can be pushed.
- `player.facing` is `yaw + PI`; `syncYawToPlayer(facing)` and `setView(facing + PI)` are the same conversion. After teleporting the player call `snapFollow()`.
- Camera and lighting run on real `dt`; physics and gameplay on `dt * G.slowmo`.
- `renderer.toneMappingExposure` is set by `lighting.apply()` from the mood and is shared by every scene drawn with the renderer.
- `lighting.setMoods` re-bakes the PMREM environment: do not call it per frame. It compares mood objects by reference, so editing a mood object in place is not picked up.
- Lamps cannot be removed (`island.dispose()` leaves them).
- `applyGraphics` rebuilds both bloom composers each time it fully applies with bloom on, and ends with `resize()` so their pixel ratio follows `dpr`. Never set `renderer.shadowMap.enabled`, `castShadow`, fog type, the light count or the composer on/off during a round: each one recompiles every material (see "Why between rounds" above). `viewFar = -1` forces `updateView()` to re-apply fog and far plane on the next match frame.
- `antialias` is fixed when the renderer is created; `texScale`, `particles` and `detail` when the island and effects are built.
- On coarse-pointer devices `graphicsPreset()` always turns bloom off, so the composer path is never taken there.
- Per-frame allocation: `camera.js`, `lighting.js` and `main.js gameFrame` use module-level scratch vectors; keep new per-frame code allocation-free. Existing exceptions: `segmentClear` builds a `RAPIER.Ray` and two literals per call (twice per frame from the camera), and `player.step` builds two small literals per tick.
- `textures.js` keeps every tracked texture in a `Set` for the life of the page (there is no untrack).
- `fontReady` and `COARSE_POINTER` are evaluated at import time.

## 5. Observations

Dead code and unused exports (no importer found under `src/`):
- `bake.js` and `modes.js` are not imported at all. The header of `modes.js` describes a V key and wheel-zoom switching that do not exist. `MODES` / `START_MODE` in config.js are only read by `modes.js`.
- `physics.js`: `bindMesh`, `unbindMesh`, `addDynamic`, `addFixedBoxFor`, `removeBody`, `bodyCount` are unused outside the file. No dynamic body is ever created, so the mesh-sync/interpolation list stays empty and the controller's impulse-to-dynamic-bodies setting and `PHYSICS.pushMass` have nothing to act on.
- `player.js`: `player.dims` is never read; `respawn()` is only the fallback for a missing `onFellOut`, and its `syncYawToPlayer()` call passes no argument, which is a no-op. `PLAYER_DIMS.crouchHeight` is not used by the capsule (it never shrinks) and `PHYSICS.turnSpeed` is not used anywhere.
- `camera.js`: `getPitch` is unused. `CAMERA.results` in config.js is not read anywhere.
- `input.js`: `requestLock`, `releaseLock`, `gameInputEnabled`, `controlsReleased` are not imported elsewhere (the first two are used internally).
- `lighting.js`: `isNight` is unused; `toggleDayNight` is used only by the dev harness.
- `world.js`: `setSeaColor` is unused; `WATER.shallow` is not read.
- `perf.js`: `gpuName` and `detectTier` are only used inside the file.
- `propkit.js`: `std`, `glow`, `put`, `solidPole`, `label` are unused outside the file (`game/characters.js` and `game/lobbyScene.js` define their own local `std`).
- `textures.js`: 14 painters plus `toonGradient` are unused (listed in the table above); `paintText` is reachable only through the unused `label`.

Stale comments in the files:
- `postfx.js` header mentions "neon lane rails, the waterfall, the VIP gate" (not this game).
- `lighting.js` says "Lamps (none placed right now)" although `world/index.js` adds them, and the `setMoods` comment refers to `WORLDS`, which does not exist.
- `physics.js` `segmentClear` comment mentions "crates, balls".
- `main.js` says the FPS readout is in the bottom-right corner; its CSS places it bottom-left.
- config.js says "the rest of src/ holds no theme values", but these modules contain tuning constants of their own (scope eye heights 1.58 / 1.3, spectate shoulder 0.3, the 15 m snap distance, recoil and shake factors in `camera.js`; sky radius 500, sun distance 90 and shadow biases in `lighting.js`; the -2 and -6 m/s thresholds in `player.js`; the cloud layout in `world.js`).
- `FOG` and `RENDER.exposure` are only initial values: the preset's `view` and the mood's `exposure` replace them.

Things that differ from CLAUDE.md or look like bugs:
- CLAUDE.md lists `bake.js` among the root modules in use; nothing imports it.
- "Every action needs a touch path": the scoreboard (`hud.showBoard`) is reached only from the `Tab` key. (Opening a supply crate from touch was fixed on 2026-11-14: `main.js` now passes `onInteract: () => interactPress()` to `hud.init`.)
- "Tap targets >= 44px": the touch RELOAD and CROUCH buttons are `0.8` and `0.86` of `--side`, whose minimum is 48 px (44 px in portrait), so they can be about 35 to 41 px on small screens.
- "Avoid per-frame allocations": see the exceptions under Gotchas.
- CLAUDE.md's Bloxity section still calls multiplayer / rooms "not applicable (single player)", which contradicts the online design described in the same file (outside this layer, noted in passing).
- The camera's `orbit` mode circles the world origin, not `opts.lookAt`; the intro passes a `lookAt` that moves from the voted map's district to the player, so the flyover circles the island centre while looking at that point.
- `setTouchActive(false)` clears the joystick and `fire` but not the touch sprint flag or a toggled `aim`; `main.js` clears `aim` itself in `closeMatch` and on elimination.
- Look sensitivity from the lobby slider is not saved (only the SDK setting persists it), and its range (0.2 to 3) differs from `SETTINGS.camera_sensitivity` (0.1 to 5).
- A `graphics_quality` change from the portal sets the in-memory choice but does not write `ffz.quality`; the portal's stored value is ignored at boot by design (`bootDone`).
- The combat, navgrid and camera code each define the same static-only query filter separately.
