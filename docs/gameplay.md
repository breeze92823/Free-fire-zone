# Gameplay systems

Reference for the match logic on the client: `src/config.js`, `src/game/state.js`, `actor.js`, `combat.js`, `controller.js`, `items.js`, `loot.js`, `zone.js`, `match.js`, `online.js`, `fx.js`, `navgrid.js`, `merge.js`.

Related: [README.md](README.md) (boot, frame loop, phases), [ui.md](ui.md) (HUD, lobby, models), [engine.md](engine.md) (player body, camera, input), and the backend's `docs/protocol.md` (every network message) and `docs/server.md` (what the server decides).

## 1. Who decides what

The game is online only. The split matters for every change:

| Decided by the server (`MatchRoom.ts`) | Decided by this client |
| --- | --- |
| Round phases and the clock, team, score, winner | Its own movement (bounded by the server) |
| Damage numbers, armour, knock / eliminate / assist / streak | What a shot hit (`hit` report), spread, recoil, tracers |
| Health, regen, bleed-out, zone damage, spawn protection | Ammo, reloads, weapon slot, utility counts (walls, frags, medkits) |
| Revive completion, respawn permission | Ability charge (`ult`), dash cooldown, where it respawns (`spawnActor`) |
| Which crates / drops are open, crate refill, drop positions, armour from crates | Ammo and utility a crate gives (`grant`) |
| Coins, rank points, purchases, the saved profile | Frost wall hit points and lifetime (per client, not synced) |

A client-side number that the server also uses (weapon damage, health, zone, rewards, prices) exists twice. Changing only one side produces wrong HUD numbers at best and rejected hits at worst. See section 14.

## 2. `src/config.js`: every tunable

Units: metres, seconds, radians unless noted. Axes: +X east, +Z south, +Y up.

| Export | Used by | Mirrored on server |
| --- | --- | --- |
| `GAME_SLUG`, `GAME_TITLE`, `DEV_MODE` (`VITE_DEV_MODE === 'true'`) | `bloxity.js`, `net.js`, `online.js`, `main.js` | no |
| `WATER`, `SPAWN`, `SPAWN_FACING` | sea, nav grid, `player.js` | no |
| `PHYSICS` (gravity, speeds, accel, jump, step, slope, `killY`) | `physics.js`, `player.js`, `controller.js` | server only bounds speed (`MAX_SPEED` 32) |
| `PLAYER_DIMS` | `player.js`, `actor.js` (`CAPSULE`) | no |
| `RENDER`, `FOG`, `TIME_OF_DAY` (`day`, `sunset`, `night`, `transition`), `LIGHT` | `main.js`, `lighting.js` | no |
| `GRAPHICS_PRESETS`, `QUALITY_OPTIONS`, `AUTO_GRAPHICS`, `BLOOM`, `NEON`, `COARSE_POINTER`, `DEFAULT_GRAPHICS`, `MOBILE_GRAPHICS_CAP`, `graphicsPreset(name, dprCap)` | `main.js`, `perf.js`, `postfx.js`, `propkit.js`, world build | no |
| `TOUCH`, `CAMERA` | `touch.js`, `camera.js`, `main.js` | no |
| `AUDIO` | `audio/` | no |
| `SETTINGS`, `coerceSetting` | `bloxity.js`, `main.js applySetting` | no |
| `LEADERBOARDS` | `bloxity.js` | `reporters.ts` `BOARDS` |
| `NET` (`room`, `roomSize` (unread), `teamMax`, `minPlayers`, `devServer`, `devPort`, `poseHz`, `interpDelay`, `connectTimeout`, `respawnFallback`, `autoRespawn`) | `net.js`, `online.js`, `main.js` | `constants.ts` (`ROOM_MAX_CLIENTS`, `TEAM_MAX`, `MIN_PLAYERS`) |
| `AD_SCREENS`, `NO_AD_SCREENS` | `bloxity.js` | no |
| `RIG_HEIGHT`, `RIG`, `PROPORTIONS`, `ANIM`, `CHARACTER_COLORS`, `MATERIAL_PBR` | `avatar/` | no |
| `WEAPONS`, `SCOPE_FOV`, `WEAPON_SCALE`, `BULLET` | combat, actor, HUD, lobby, models, test range | `rules.ts` `WEAPONS`, `FALLOFF_START`; Gem prices in `catalog.ts` `WEAPON_PRICES` |
| `WEAPON_CATS` | the Weapons Store's category column | no |
| `GRENADES` (`frag`, `pulse`, `breach`: `damage`, `radius`, `fuse`, Gem `price`, `model`, `desc`) | `items.js` (the throwable the loadout picks), lobby, test range | `rules.ts` `GRENADES`, `catalog.ts` `GRENADE_PRICES` |
| `PASSES` (`basic`: name, desc, Gem `price`), `passWeapons(id)` (the weapons whose `tier` is the pass id) | lobby, `save.js buyPass` | `catalog.ts` `PASSES` (its own weapon list: keep it equal to the `tier: 'basic'` weapons) |
| `SKINS` | `weaponModels.js`, lobby | `catalog.ts` `SKIN_PRICES` |
| `OPERATIVES`, `ULT_CHARGE` | `items.js`, `actor.js`, lobby, HUD | `rules.ts` `OPERATIVES`, `ROOK_DAMAGE_TAKEN`, `JIN_HEAL`, `ULT_MIN_GAP_S`; prices in `catalog.ts` |
| `ITEMS` (`frostWall`, `frag`, `medkit`, `dash`) | `items.js`, `loot.js`, `match.js`, HUD | `rules.ts` `ITEMS` (frag damage / radius / fuse, medkit heal / time) |
| `HEALTH` | `actor.js`, `controller.js`, HUD | `rules.ts` `HEALTH` (plus server-only `reviveRange`, `spawnProtection`) |
| `MATCH_MODES`, `MATCH` (only `introFlyover` and `spawnSafeDistance` are read) | `match.js`, `main.js`, lobby | `rules.ts` `MODES`, `PHASES`, `STREAK_WINDOW` |
| `MAPS` (`id`, `name`, `mood`, `tint`, `focus`, `shot`) | `main.js`, `mapimage.js`, lobby vote, `zone.js` | `rules.ts` `MAP_FOCUS` (same order) |
| `ZONE` | `zone.js`, HUD | `rules.ts` `ZONE`, `ISLAND_RADIUS` |
| `LOOT` | `loot.js` | `rules.ts` `LOOT` |
| `NAV` (`cell` 1.25 m) | `navgrid.js` | no |
| `MISSIONS` (`daily`, `weekly`: `{ id, stat, goal, coins, gems }`; `text`: how each stat reads) | `save.js`, `lobby.js`, `results.js` | `progress.ts` `MISSIONS` (ids, goals, rewards) |
| `OUTFITS`, `TEAMS` | `characters.js`, HUD, actor name tags | no |
| `RANKS`, `START_PROFILE`, `STORE` | `save.js`, lobby, `lobbyScene.js` | `catalog.ts` `START_PROFILE`, `STORE` (ranks exist only on the client; the server stores `rp`) |
| `REWARDS` | not read by any client code; kept as a copy of the server's table (the HUD's kill popup shows the amounts the server sends in `reward`) | `rules.ts` `REWARDS` |
| `GEMS` | not read by any client code; a copy of the server's Gems table (`perElimination` 12, `perKnock` 3, `headshot` +3, `streak` +4 per elimination past the first, counted up to `streakCap` 5; at the results `win` 40, `loss` 15, `mvp` 25). Gems are the game's own currency, earned only by playing, never sold; they buy weapons, grenades and the pass | `rules.ts` `GEMS` |
| `clamp` | everywhere | no |

### Weapon definition fields (`WEAPONS[id]`)

`name`, `cat` (Weapons Store category: `pistol`, `rifle`, `shotgun`, `smg`, `special`; knife and fists have none and are not sold), `tier` (`basic` = in the Field Arsenal Pass), `slot` (`primary` / `secondary` / `melee` / `fists`), `kind` (`rifle`, `smg`, `pistol`, `shotgun`, `lmg`, `dmr`, `sniper`, `sword`, `medic`, `knife`, `fists`: selects the shot sound and some effects), `sound` (overrides `kind` for `sfx.shot`), `hold` (`rifle` / `pistol` / `melee` / `fist`: the animator's arm pose in `ANIM.aim`), `melee` (a blow, not a shot: knife, fists, the Ronin Blade), `damage` (per bullet or pellet, against 200 HP), `pellets` (shotguns), `interval` (s between shots), `mag`, `reserve`, `reload` (s), `spread` `[hip, aimed]` in degrees, `recoil` (degrees per shot), `range` (m), `headMul`, `auto`, `zoom` (aimed FOV), `scope` (draws the scope overlay when `zoom <= SCOPE_FOV + 6`), `pierce` (share of the armour cut ignored, server-side: Kestrel 0.5), `heal` (HP a hit gives a teammate: the Mender's shots also land on allies), `speedMul` (move speed while held: the Ronin Blade 1.15, `controller.js`), `price` (Gems), `model` (key for `weaponModels.js buildWeapon`), `icon` (short label), `desc` (the store's description).

The arsenal (store category: ids): Pistols `hornet`, `talon` (heavy .50); Rifles `striker` (starter), `ridgeback` (battle rifle), `kestrel` (armour-piercing bullpup), `tempest` (LMG), `marksman` (DMR), `hawk` (sniper); Shotguns `thunder` (pump), `breaker` (2-shot double barrel), `cyclone` (full auto); SMGs `viper` (starter), `wasp`; Specials `ronin` (blade, secondary slot), `mender` (medic pistol, secondary slot).

A gun is "anything with `mag`": `controller.js` uses `!!def.mag` to allow aiming and auto-reload; `combat.fire` sends any `melee` weapon to `melee`.

## 3. Shared state and the event bus (`state.js`)

`G` is the one shared context object:

| Field | Meaning | Set by |
| --- | --- | --- |
| `scene`, `camera`, `renderer`, `lighting` | three.js objects of the game world | `main.js` boot |
| `island` | `buildIsland()` result | `main.js` |
| `nav` | nav grid | `main.js` (`buildNav`) |
| `preset` | current graphics preset object | `main.js applyGraphics` |
| `actors` | every `Actor` in the round, local player first | `match.js`, `online.js` |
| `player` | the local player's `Actor` (null outside a round) | `match.js` |
| `match` | `{ mode, modeId, map, duration, score: { blue, orange }, zone, mvp, drops, winner, round }` (null outside a round; the test range makes one with `test: true`) | `match.js createMatch`, `testRange.js startTest` |
| `test` | true while the offline Weapon Test range runs (`phase` is then `playing`; no server) | `main.js enterTest` / `exitTest` |
| `time` | round clock in seconds, follows the server | `online.js syncClock` |
| `slowmo` | time scale (0.3 while `ending`) | `main.js` |
| `phase` | `boot`, `lobby`, `queue`, `intro`, `countdown`, `playing`, `ending`, `results` (the comment in `state.js` still lists `vote`; the real value while voting is `queue`) | `main.js` |
| `spectating` | the player the camera watches while dead (the killer first, then any player who is up) | `main.js spectateActor` / `cycleSpectate` |

`on(type, fn)` returns an unsubscribe function; `emit(type, data)` calls listeners inside try/catch. Helpers `enemiesOf(a)` and `alliesOf(a)` exist but nothing imports them.

| Event | Payload | Emitted by | Listeners |
| --- | --- | --- | --- |
| `shot` | `{ actor, pos, recoil }` | `combat.fire` (local), `online.js` `shot` handler (remote) | `hud.js` |
| `damage` | `{ target, attacker, amount, head, point, dir, zone, explosive }` | `online.js` (`dmg`) | `hud.js`, `controller.js` (hurt sound, shake) |
| `knock` | `{ target, attacker, weapon, head }` | `online.js` (`knock`) | `hud.js` |
| `elimination` | `{ target, killer, weapon, head, streak }` | `online.js` (`elim`) | `hud.js`, `main.js` (spectate, death screen) |
| `reward` | `{ kind: 'elim' \| 'knock', target, gems, coins, rp, head, streak, bonus }`: what the server granted the local player for a knock / elimination (`bonus` = the streak's extra Gems) | `online.js` (`reward`) | `hud.js` (kill popup, multi-kill banner) |
| `revive` | `{ target, by }` | `online.js` (`revive`) | none |
| `heart` | `{ from, target }`: a spectator liked `target`'s play | `online.js` (`heart`) | `hud.js` (floating hearts, toast for the target) |
| `react` | `{ from, target, reaction }` (a `REACTIONS` id) | `online.js` (`react`) | `hud.js` (glyph over the target's head, toast for the target) |
| `playerProfile` | the server's `playerProfile` message + `actor` | `online.js` (`playerProfile`) | `hud.js` (profile window) |
| `spawn` | `{ actor, first, pos, facing }` | `match.js spawnActor` | `main.js` (moves the body and camera, clears the death screen) |
| `matchEnd` | `{ winner }` | `online.js` (`matchEnd`) | `main.js` (slow motion, banner) |
| `explosion` | `{ pos, radius }` | `combat.explodeVisual` | `controller.js` (shake) |
| `loot` | `{ actor, items, rich }` | `loot.openCrate` | `hud.js` (pickup toast) |
| `airdrop` | the drop object | `loot.spawnDrop` | none |
| `slot` | the actor | `combat.selectSlot` | none |
| `wall` | `{ wall }` | `FrostWall` constructor | none |
| `ultimate` | `{ actor, op }` | `items.ultVisual` | none |
| `healed` | the actor | `items.updateActorItems` | none |

Events with no listener are safe hooks for new HUD or audio features.

## 4. `Actor` (`actor.js`)

One character in a round: the local player (`isPlayer`) or another player (`remote = true`, `netId` = their Colyseus session id). Movement is not in the actor: the local player's position is copied from `player.js` each frame in `main.js gameFrame`, a remote actor's from interpolated server poses in `online.js applyRemote`.

Constructor options: `{ name, team, isPlayer, outfit, loadout: { primary, secondary, skins }, operative, avatar?, scene?, noTag? }`. `scene` overrides where the held weapon is added (the lobby hangar passes its own scene). A name tag sprite is created for every non-player actor unless `noTag`.

Gameplay fields:

| Field | Notes |
| --- | --- |
| `id` | local counter, not the network id |
| `netId`, `remote`, `uid`, `snaps`, `lookKey`, `avatarGen` | added by `online.js` / `match.js`; `uid` is the Bloxity user id used to attach chat bubbles |
| `hp`, `maxHp`, `vest`, `helmet`, `vestDur`, `helmetDur` | mirrored from the server every frame (`vestDur` / `helmetDur` are not synced) |
| `life` | `alive`, `knocked`, `dead`; server-driven |
| `downHp` | bleed-out pool while knocked |
| `protectedUntil` | round-clock time spawn protection ends (shimmer) |
| `respawnAt` | without the portal death screen: when Revive starts to work (`NET.respawnFallback`) |
| `autoRespawnAt` | without the portal: when the player is put back in without pressing Revive (`NET.autoRespawn`) |
| `level`, `rp`, `hearts`, `watchers` | from the server (`copyPublic`, `applyState`): level, rank points, hearts from spectators this round, players spectating this one now |
| `revivedBy`, `reviveProgress`, `reviveSent` | local revive hold state |
| `pos`, `vel`, `facing`, `pitch`, `crouch`, `grounded`, `aiming` | pose |
| `impulse` | knockback vector the player body consumes (`body.impulse = p.impulse`) |
| `ready` | 0..1 weapon raised amount (drives the arm pose and the held gun direction) |
| `slots` | 4 entries `{ id, def, ammo, reserve, skin }`: 0 primary, 1 secondary, 2 knife, 3 fists |
| `slot`, `fireCooldown`, `reloadT`, `swingT`, `swingSide`, `throwT`, `throwKind`, `healT`, `kick`, `spreadBloom`, `pendingMelee` | weapon timers; `-1` means "not running" for the `*T` fields |
| `emote`, `emoteT` | emote name (`wave`, ... or `portal:<id>`) and its clock |
| `items` | `{ frostWall, frag, medkit }` counts |
| `dashReadyAt`, `ult`, `ultActiveUntil`, `cloakUntil` | ability state on the round clock |
| `stats` | `{ eliminations, knocks, deaths, damage, assists, headshots }`, copied from the server (`kills` -> `eliminations`) |
| `streak`, `lastElimAt`, `damagers`, `lastHitBy`, `lastKilledBy` | partly legacy; the server tracks streaks and assists |
| `bot` | always null (bots were removed) |

Getters: `def` (held weapon's definition), `weapon` (held slot), `alive`, `operativeDef`.

Methods:

| Method | What it does |
| --- | --- |
| `setAvatar(root)` | swaps the character model, rebuilds the animator, finds `ArmR2` and the hand leaf (`ArmR2_leaf`, generated when the rig lacks it) |
| `buildWeapons()` | builds one baked mesh per slot (`weaponMesh`, cached per `model:skin`, scaled by `WEAPON_SCALE`), then `refreshHeld()` |
| `refreshHeld()` | puts the current slot's model in the scene (it is not a child of the character: it is positioned in world space each frame) and the other gun on the back |
| `addToScene(scene)` / `removeFromScene()` | group, held weapon, grenade model |
| `makeNameTag()` / `drawTag()` | canvas sprite with name + health bar; redrawn only when life / health / armour change (`tagState`) |
| `hitTest(o, d, maxDist)` | ray vs body capsule (radius 0.42, feet+0.35 to feet+1.18, 0.25 lower when crouched) and head sphere (radius 0.25 at 1.58); knocked actors use a flat capsule + head along `facing`. Returns `{ t, head }` or null. Dead and `hidden` actors never hit |
| `eye(out)`, `chest(out)`, `head(out)` | world points for cameras, line of sight, effects |
| `updateModel(dt, aimDir, speed)` | feeds the animator, places the held weapon and grenade, fades the hit flash, applies cloak / spawn shimmer opacity, updates the name tag (teammates through walls; enemies within 45 m with depth test) |
| `hitFlash()` | white flash on damage |
| `dispose()` | removes from the scene; for non-player actors also disposes the look, own geometries, materials, tag. The local player's avatar is kept (the lobby reuses it) |

Module exports besides `Actor`: `raySphere`, `rayCapsule`, `CAPSULE`.

## 5. The local player's frame (`controller.js`)

`bindKeys(hud)` registers the keys once (see the controls list in CLAUDE.md). `G` is the respawn shortcut while dead. `Tab` shows the scoreboard while held.

`updateController(dt, hud)` runs before physics, every frame of a round except `results`:

1. Mouse wheel cycles slots.
2. Moving or firing cancels an emote (`send('emote', { emote: '' })`); `match.js` also ends it after `emoteLength(name)` (`ANIM.emotes[name].duration`, a catalogue clip's own length, `ANIM.emoteLoopMax` for a looping one) and tells the server, so other players' copies stop too.
3. Sets `p.aiming`, `p.crouch`, sprint, and the body's `moveSpeed` (`PHYSICS.walkSpeed` / `sprintSpeed` / `aimSpeed` / `crouchSpeed` / `crawlSpeed`; Nova's Overdrive multiplies by 1.3), `frozen`, `canJump`, `impulse`.
4. Aim: copies `camera.js aimRay`, casts the world (300 m), then tests enemy hitboxes; writes `view.aimPoint`, `view.onEnemy`, `view.scoped`, `view.spread`. `p.pitch` comes from the aim direction.
5. Fire: `inputState.fire` held, alive, `playing`. Automatic weapons repeat; others fire once per press. A shot adds camera recoil (`addRecoil`) and shake for sniper / shotgun.
6. Resolves a pending melee blow 0.14 s into the swing (`resolveMelee`).
7. Auto-reloads an empty gun when fire is released.
8. Interact: nearest knocked teammate within 2.2 m becomes `reviveTarget`; holding E (or the HUD button, `hud.interactHeld`) sends `reviving` once, counts `reviveProgress` locally and sends `revive` at `HEALTH.reviveTime`. Otherwise a crate in range sets the "Open" prompt. `view.prompt` is what the HUD draws.
9. Footstep, landing and jump sounds; heartbeat under 50 HP.

Exports: `view` (`{ aimDir, aimPoint, scoped, spread, onEnemy, prompt, interactHeld }`), `bindKeys`, `useItem(id)` (`frostWall`, `frag`, `medkit`, `dash`, `emote`), `playEmote(name)`, `useUlt()`, `updateController`, `getReviveTarget`.

All actions are gated by `canAct()`: player alive and `G.phase === 'playing'`.

## 6. Combat (`combat.js`)

Hitscan. `fire(actor, origin, dir, speed)`:

1. Refuses while dead, cooling down, reloading, throwing or healing. Knife / fists go to `melee`. Empty magazine: dry-fire sound and `startReload`.
2. Cooldown = `def.interval` (x0.77 during Nova's Overdrive). Firing breaks Shade's cloak.
3. For each pellet: a direction inside the spread cone (`coneDir`), a world ray from the camera origin (`castWorld`, static colliders only), then `castActors` up to that distance. A second ray from the muzzle to the end point catches a wall right in front of the gun: if blocked, the pellet hits that wall instead and no player.
4. Hits are grouped per target: `{ n pellets, h head pellets, d nearest distance }` and sent as `hit { t, w, s, n, h, d }` with `s` = this client's shot number (`shotSeq`, shared by all targets of one shot; the server uses it for the fire-rate check). The shot itself is sent as `shot { w, o: muzzle, e: up to 12 end points }` for the others' tracers and sound.
5. A world hit on a frost wall collider (`wallColliders` map: collider handle -> wall) damages that wall locally; other surfaces get an impact effect.
6. Local feedback: tracers, muzzle flash, shell casing, sound, `spreadBloom`, `emit('shot')`.

Damage is never applied here. The server answers with `dmg` / `knock` / `elim`.

Other exports:

| Export | Purpose |
| --- | --- |
| `castWorld(o, d, maxDist)` | nearest static hit; returns a shared object `{ dist, point, normal, collider }` (copy what you keep). Rejects zero / NaN directions because Rapier traps on them |
| `lineOfSight(a, b)` | true when no static collider is between two points |
| `muzzleOf(actor, out)` | muzzle world position, or a point in front of the chest when no gun is visible |
| `currentSpread(actor, speed)` | hip / aimed spread, worse airborne and moving, better crouched, plus bloom |
| `damageFalloff(def, dist)` | 100% up to `BULLET.falloffStart` of range, down to 60% at full range (the server applies the same formula in `rules.ts`; the client's copy has no caller) |
| `melee(actor)` / `resolveMelee(actor)` | starts the swing; then picks the nearest enemy within `def.range + 0.5`, within about 63 degrees of the facing direction and 1.6 m of height, and sends a `hit` |
| `startReload(actor)`, `selectSlot(actor, i)` | reload start; slot switch (0.35 s minimum cooldown, cancels reload and aim) |
| `finishReload(actor)` | unused; `match.js updateMatch` completes reloads inline |
| `explode(pos, attacker, damage, radius)` | the local player's frag: visual + `boom { x, y, z, t: [netIds in radius with line of sight] }`; self-knockback impulse |
| `explodeVisual(pos, radius, damage)` | fireball, sound, `explosion` event, damages nearby frost walls (x1.5) |
| `wallColliders` | registry frost walls add themselves to |
| `operativeOf(a)` | unused helper |

## 7. Items and abilities (`items.js`)

| Item | Flow |
| --- | --- |
| Frost wall (G) | `deployWall(actor)`: 2.4 m ahead on the floor found by a down ray; refused when a wall is closer than 1.2 m ahead. Builds a `FrostWall`: 5 slab segments on an arc, one Rapier cuboid collider each, registered in `wallColliders`. `hp` 450, `life` 12 s, grows in 0.22 s and melts in the last second. Sends `wall { x, y, z, yaw }`; other clients build the same wall with `remoteWall`. Wall health is per client |
| Frag (T) | `startThrow` starts `throwT`; `updateActorItems` releases at 0.3 s (`release`): spawns a `Grenade` from the eye with `throwSpeed` + 4 m/s up + half the thrower's velocity, sends `throw { p, v }`. The grenade integrates with gravity 22, bounces off `castWorld` hits (x0.55 energy), and after `fuse` calls `combat.explode` for local grenades only; remote grenades (`remoteThrow`) just vanish and the blast arrives as `boom` |
| Medkit (X) | `startHeal`: `healT` runs for `ITEMS.medkit.time` (movement at crouch speed, no aiming); on completion the count drops, local `hp` rises and `heal` is sent |
| Dash (F) | `dash(actor, dirX, dirZ)` returns `{ x, z, t }` for `body.push` or null on cooldown (`dashReadyAt`). Purely local |
| Ability (Q) | `useUltimate(actor)` when `ult >= operativeDef.charge`: resets the charge, sends `ult`, calls `ultVisual`. `ultVisual(actor, opId)` also runs for other players' `ult` broadcasts: Jin heals locally for display (+90 self, +60 allies within 10 m; the server is authoritative), Shade sets `cloakUntil`, Rook / Nova set `ultActiveUntil` |

Charge: `ULT_CHARGE.perSecond` in `updateActorItems`, `perDamage` per damage dealt in the `dmg` handler of `online.js`, +20 or full from crates. Operative effects on the client: Nova speed x1.3 (`controller.js`) and interval x0.77 (`combat.fire`); Shade opacity 0.08 for enemies / 0.35 for the team (`Actor.updateModel`) and silent shots. Rook's damage cut is server-side.

Per-frame entry points (called from `match.js updateMatch`): `updateActorItems(actor, dt, aimDir)` for non-remote actors, `updateItems(dt)` for walls and grenades. `clearItems()` at round start and teardown. `activeGrenades()` and `ultReady(actor)` are accessors.

## 8. Loot (`loot.js`)

- `buildLoot(scene, island.lootSpots)` runs once at boot: every crate part is one `InstancedMesh` across all crates (plus a floating icon mesh), and each crate gets a static box collider (`propkit.solidBox`). The crate index `i` in that array is the id used on the wire, so the order of `island.lootSpots` must be identical on every client (it is deterministic from the island build).
- `crateNear(actor)` returns the closest unopened crate within `LOOT.interactRange`, or a landed drop.
- `openCrate(actor, c)` marks it open locally, sends `open { c: index }` or `open { d: dropId }`, and calls `grant`: ammo for both guns (2 mags, 4 for a drop, capped at twice the base reserve), then one random utility (35% medkit, 25% +2 walls, 20% frag, 20% +20 ability charge); a drop gives +3 frags, +3 walls, +2 medkits and a full ability. Armour is rolled by the server and arrives through the synced `vest` / `helmet` fields.
- Server sync: `markOpened(c, d)` for the `opened` broadcast, `syncCrates(map)` on entering a round (`net.state.crates`: index -> refill time), `syncDrops(list)` every frame (`net.state.drops`: spawns unseen drops with their age, marks opened ones).
- `spawnDrop(at, id, age)` builds the parachute crate and its light beam; it falls 80 m in `LOOT.airdropFall` s.
- `updateLoot(dt, t)` animates lids, refills (`refillAt` on the round clock), drops. `resetLoot()` closes everything and removes drops.

## 9. Safe zone (`zone.js`)

`createZone(scene)` returns `{ state, reset(seed, focus), info(t), outside(x, z, margin), distanceInside(x, z), update(t, dt), setVisible(on) }`. `state` = `{ center (Vector2: x, y = world x, z), radius, from, fromR, next, nextR, phase, shrinking, damage }`.

The circles are deterministic: `reset(seed, focus)` seeds `mulberry32` with the server's `zoneSeed`; `planNext(i)` draws exactly two random numbers per phase (angle, then distance), aims at the voted map's `focus` with jitter, never leaves the previous circle (85% of the slack), and keeps the centre within `island.radius - radius * 0.6`. The server's `zone.ts` runs the same planner for zone damage. Any change to the number or order of `rand()` calls, to `ZONE`, to the island radius (125) or to a map's `focus` must be made on both sides.

`update(t, dt)` advances phases from the round clock `G.time`, so a late joiner gets the right circle by replaying from the seed (`createMatch` calls `zone.update(G.time, 0)`; note that a join after phase 1 has finished only replays one step per frame, which catches up within a few frames).

## 10. The round on this client (`match.js`)

- `initMatchSystems(scene)`: creates the zone once at boot.
- `createMatch({ st, me, map, playerAvatar, playerName, playerPortrait, netId })`: builds the local `Actor` from the server's `PlayerState` (team, operative, loadout, skins), sets `G.actors = [player]`, `G.player`, `G.match`, `G.time = st.clock`, resets zone / loot / items, gives the starting kit and spawns in the team's start area.
- `kit(a, first)`: utility counts = `ITEMS.*.start` + store upgrades (`walls` x2, `frags` x1, `medkits` x1 per level via `save.js upgradeLevel`), full ammo. Runs on every respawn too. Starter armour comes from the server.
- `spawnActor(a, first)`: first spawn = random walkable cell in `island.spawnAreas[team]`; respawn = best of 24 candidates (half near living teammates, half anywhere in the zone), rejecting spots outside the zone and penalising enemies within `MATCH.spawnSafeDistance`. Resets the actor's transient state and emits `spawn`. Also used by the portal's "Respawn" menu button for a stuck player.
- `updateMatch(dt)`: zone, cooldowns, spread bloom decay, swing / emote clocks for everyone; reload completion and item timers for non-remote actors; walls, grenades, loot while `playing` / `ending`.
- `teardownMatch()`: disposes every actor, clears items / loot, hides the zone, nulls `G.player` / `G.match`.
- `updateMvp()` (most eliminations, then damage, per team) and `topPlayers(team, n)` (results lineup).

## 11. Server glue (`online.js`)

Full message tables are in the backend's `docs/protocol.md`. In short:

- `reconcile()` (every frame): makes `G.actors` match the room's players that are `inMatch` with a team; creates remote actors (`makeRemote`: blocky outfit seeded by session id until `streamLook` delivers the Bloxity look) and removes leavers.
- `applyState(dt)` (every frame, skipped in `results`): copies score and duration to `G.match`; for the local player copies `life` (except dead -> alive, which waits for `spawn`; if the state has said alive for `NET.missedSpawnGrace` s and `spawn` never came, the message was lost, so it respawns the player locally with `spawnActor`; a `dead` that arrives without an `elim` sets `respawnAt`), `hp`, `downHp`, `vest`, `helmet`, `protectedUntil`, team and stats; for remote actors `applyRemote` interpolates pose snapshots `NET.interpDelay` behind, decodes `flags`, rebuilds weapons when the loadout changed, and copies everything else. Also `updateMvp` every 0.5 s and `syncDrops`.
- `syncClock(dt)`: `G.time` follows `st.clock` (hard snap beyond 0.4 s of error, otherwise eased).
- `sendPose(dt)`: `pose { x, y, z, yaw, pitch, speed, flags, slot }` at `NET.poseHz`. `FLAG` = crouch 1, aim 2, grounded 4, reload 8, heal 16, throw 32, swing 64, sprint 128 (the sprint bit is defined but never set).
- `initOnline()`: wires the server events (`dmg`, `knock`, `elim`, `revive`, `spawn`, `shot`, `throw`, `boom`, `wall`, `ult`, `opened`, `matchEnd`) to the bus and effects, and chat bubbles for other players.
- `roster()`, `trackRoster()`, `syncLoot()`, `outfitForId(sid)`, `byNet(id)`, `remoteAimDir(a, out)`.

## 12. Effects (`fx.js`)

Everything is pooled at `initFx(scene, preset)`; nothing allocates per shot and the light count never changes (no shader recompiles). Pool sizes: additive particles `1600 x max(0.5, preset.particles)`, blended particles `900 x ...`, 48 tracers, 16 flash sprites, 3 point lights, 80 casings, 90 bullet holes, 4 fireballs, 8 rings, 6 beams. When a pool is full an existing entry is reused, so an effect can be cut short but never fails.

| Function | Effect |
| --- | --- |
| `tracer(from, to, color?)` | travelling streak at `BULLET.tracerSpeed` |
| `muzzleFlash(pos, dir, big, withLight)` | sprite + optional pooled light |
| `shellCasing(pos, right, up)` | instanced brass with simple physics |
| `impact(point, normal, material)` | sparks / dust + bullet hole; `material` is `stone`, `grass`, `dirt` (callers pass these) or `metal` (brighter sparks) |
| `hitPuff(point, dir, head)` | hit on a character |
| `explosion(pos, radius)` | fireball, ring, smoke, debris, light |
| `ring(pos, r0, r1, dur, color, follow?, rise?)`, `beam(pos, color, dur, radius, height, follow?)` | ground ring, light column |
| `healSparkles`, `iceBurst`, `poof`, `dustKick` | particle bursts |
| `emitAdd(...)`, `emitBlend(...)` | raw particle: `x, y, z, vx, vy, vz, life, size, color, alpha, gravity, drag, grow` |
| `makeLootBeam(color, height, radius)` | a persistent beam mesh (airdrops); the caller owns it |
| `setFxScale(px)` | point-size scale from the viewport height, called every frame |
| `updateFx(dt)` | advances all pools |
| `FX_COLORS` | HDR colours (values above 1 feed bloom) |

## 13. Support modules

- `navgrid.js`: `buildNav(island)` rasterises walkability from the physics world at `NAV.cell` (1.25 m): a floor ray per cell and a character-sized box overlap test; flood fill marks the largest connected component as `main`. The game only uses `randomWalkable(nav, x, z, r, ok?, tries?)` for spawn points. `cellOf`, `cellX`, `cellZ` and `nearestWalkable` have no callers outside the file (the bots' A* pathfinding was removed).
- `merge.js`: `mergeChildren(parent, material)` merges plain coloured child meshes into one vertex-coloured mesh; `bakeWeapon(root, { metal })` flattens a weapon model into one mesh plus one mesh per "special" material (textured, emissive, transparent). Used by `actor.js weaponMesh` and `characters.js`.

## 14. Recipes

### Add a weapon

1. `src/config.js` `WEAPONS`: new entry with every field from section 2. `slot` must be `primary` or `secondary` to be equippable; `cat` puts it in a store category; `tier: 'basic'` adds it to the Field Arsenal Pass (then also add it to `PASSES.basic.weapons` in the backend `catalog.ts`).
2. Backend `src/rules.ts` `WEAPONS` (slot, damage, interval, range, headMul, pellets, melee, pierce, heal) and `src/catalog.ts` `WEAPON_PRICES` (slot, Gem price). Without the first the server ignores its hits; without the second it cannot be bought or equipped.
3. Model: a new `model` key needs a builder in `src/game/weaponModels.js` exposing `userData.muzzle`, `userData.ejector`, `userData.length` (see [ui.md](ui.md)); reuse an existing key to skip this.
4. Sound: `sfx.shot(kind)` is keyed by `kind`; a new kind needs a branch in `src/audio/sfx.js` (see [audio.md](audio.md)).
5. A new `hold` value needs an arm pose in `ANIM.aim` and animator support ([avatar.md](avatar.md)).
6. Check the Weapons Store (tile, big picture, stat bars), the HUD weapon panel and the icon ([ui.md](ui.md)), and try it with the store's TEST button: the test range picks its three steps from `heal` / `melee` / everything else (section 17).

### Change weapon balance

Edit the number in `config.js` `WEAPONS` and the same number in backend `rules.ts` `WEAPONS`. `interval` matters most: a client faster than the server's value (beyond `FIRE_RATE_SLACK`) gets its hits dropped.

### Add an operative

`config.js` `OPERATIVES` (name, role, ability, desc, duration, charge, color, price); backend `rules.ts` `OPERATIVES` and `catalog.ts` `OPERATIVE_PRICES`; the effect in `items.js ultVisual` (visual / local timers) and, when it changes damage or health, in the server's `ult` handler; any passive hooks where Nova / Shade are checked today (`controller.js`, `combat.fire`, `Actor.updateModel`); portrait / card in the lobby.

### Add a utility item

`config.js` `ITEMS`; a count in `Actor.items` and `match.js kit`; an action in `items.js` plus a branch in `controller.js useItem` and a key in `bindKeys` (never P); a HUD button (touch path is mandatory); crate contents in `loot.js grant`; a network message if other players must see it (client `send`, server relay, `online.js` handler, and the type added to `MESSAGES` in `net.js`).

### Add a map to the vote

`config.js` `MAPS`: `{ id, name, mood, tint, focus: [x, z], shot: [x, y, z, fov] }` (`mood` is a `TIME_OF_DAY` key). Backend `rules.ts` `MAP_FOCUS`: the same `focus` at the same index. The vote card picture is rendered at boot by `mapimage.js renderMapShot`. A new mood needs a `TIME_OF_DAY` entry.

### Change the zone

`config.js` `ZONE` and backend `rules.ts` `ZONE` together. Do not add or reorder `rand()` calls in `planNext` without doing the same in backend `zone.ts`.

### Change round length, score target, team size

Mode `duration` / `scoreToWin`: backend `rules.ts` `MODES` is what counts (the client reads `st.duration` / `st.scoreToWin`); keep `config.js` `MATCH_MODES` in step for the lobby text. Team or room size (`teamMax` = players per side in a round, round = 2 x teamMax = 6; `roomSize` = lobby connections, 18, the surplus queues): `NET.roomSize` / `teamMax` here, `ROOM_MAX_CLIENTS` / `TEAM_MAX` in backend `constants.ts` (the backend deploy sends `roomSize` from it).

### React to a game event

Subscribe with `on('elimination', fn)` etc. from `state.js`. To add an event, `emit` it where it happens and add a row to the table in section 3.

### Add something only other players need to see

Send a message, relay it on the server, and handle it in `online.js initOnline`. Add the type to `MESSAGES` in `net.js` or the handler never fires.

## 15. Gotchas

- `castWorld` returns one shared result object. A second call overwrites it; copy `point` / `normal` first (see how `fire` copies into `tmpN` / `tmpO`).
- Module-level temp vectors (`tmpA`, `tmpP`, ...) are reused everywhere to avoid per-frame allocation. Do not hold a reference across calls.
- `G.time` is the server's round clock, not wall time. Timers such as `dashReadyAt`, `cloakUntil`, `refillAt`, `protectedUntil` are on it.
- The held weapon is a scene-level object, not a child of the character. After changing `slot`, `slots` or the avatar, call `refreshHeld()` (and `buildWeapons()` when the loadout changed).
- A remote actor's `ammo` / `reserve` are meaningless (0).
- New server message types must be listed in `MESSAGES` (`net.js`).
- `send()` silently returns false when offline; nothing queues.
- Frost wall health is simulated independently on each client, so a wall can break at slightly different moments for different players.
- `byNet` resolves the local session id to `G.player` (its `netId` is set). The server's relays skip the sender, and the `ult` handler also ignores the player's own id, because `useUltimate` already ran `ultVisual` locally. A new relay handler should do the same.
- The server refuses an ability used less than 18 s after the last one (`ULT_MIN_GAP_S`) without telling the client, which has already spent its charge.
- Crate rotation is not shared: loot spots carry no `yaw`, so `buildLoot` picks a random one per client (the crate and its box collider can face a different way for each player).
- The client grants a crate's ammo and items before the server answers; a refused open (`openFail`) is not handled.

## 16. Leftovers from the single-player / bot version

Safe to remove, kept for now: `Actor.streak`, `lastElimAt`, `damagers`; `combat.finishReload`, `combat.operativeOf`; `state.js enemiesOf` / `alliesOf`; `online.js mapOf`; `loot.js allCrates`; the `vote` phase name in the `state.js` comment; `FLAG.sprint`; `MATCH.endSlowmo`, `MATCH.streakWindow`, `MATCH.countdown` and `MATCH.voteTime` (nothing reads them: the server's `PHASES` / `STREAK_WINDOW` rule, and only `MATCH.introFlyover` and `MATCH.spawnSafeDistance` are used).

## 17. The Weapon Test range (`testRange.js`)

The Weapons Store's TEST button (any weapon or grenade, owned or not) opens an offline practice field: `main.js enterTest(weaponId, grenadeId)` hides the lobby, sets `G.test = true` and `G.phase = 'playing'`, calls `startTest`, starts the HUD in test mode (`hud.setTest(true)`: no score, zone timer, zone tint or minimap) and emits `spawn` to place the body and camera. `exitTest(toStore)` (EXIT, or walking into the portal once the steps are done) calls `endTest`, then `backToLobby()` and reopens the store (`lobby.openStore()`). If the team leader presses PLAY meanwhile, `syncFlow` ends the test and follows the queue.

- **The field**: a grass disc (radius 38 m) out at sea at `ARENA` (0, 420), with a cliff skirt, bushes, an invisible fence of fixed colliders round the rim and a portal (`PORTAL`) back to the lobby. Built once, hidden between tests; its colliders are added and removed per test. Falling out (`body.onFellOut`) puts the player back at the start.
- **People**: the player (blue; the tested weapon in its slot and held, the loadout's other gun, the tested or equipped grenade), an Instructor (blue, `untargetable`, holds the same weapon, demonstrates each step with visual-only shots or swings, then says "Now it's your turn!"), orange target dummies and, for the Mender, two blue allies. Dummies are `Actor`s with no `netId`; parked ones are `hidden` and `untargetable` until a step places them.
- **No server**: `gameFrame` skips `reconcile`, `applyState`, `syncClock` and `sendPose` and advances `G.time` itself; `combat.setLocalHits(onLocalHit)` routes this client's hits on net-less actors (shots, melee blows, grenade blasts) to `testRange.js`, which applies the same damage maths as the server (falloff, head multiplier, melee damage, blast falloff; no armour), emits `damage`, `heal` and `elimination` for the HUD, and counts progress. `player.offline` stops `throw` from being sent. Nothing is rewarded.
- **Steps** (`buildSteps`, by weapon type): guns: hit the target 5 times (scoped weapons stand 40 m off, shotguns 7 m), 2 headshots, then eliminate a strafing dummy at full health; the blade: 3 strikes, sprint to a ring (shows the speed bonus), eliminate the strafing dummy; the Mender: heal an ally from 30 to 100 HP, heal a knocked ally 3 times (its bleed-out pool), sting an enemy 5 times; grenades (6, refilled when empty): land a blast on the dummy, catch two dummies in one blast, eliminate the dummy. A step finishes with an "OK!" pop; after the third the card reads "Test complete!" and the portal is labelled "Back to the lobby".
- **UI** (`testRange.css`): the step card at the top centre (step n/3, title, text, progress bar, EXIT; below the platform toolbar when they would overlap; on short landscape phones narrower, without the step line, text clamped to two lines), floating labels projected over actors (the instructor's line, HP / knocked counters, hit counters, the portal label).

## 18. Missions, rank rewards and the first-round tips

Long-term goals. The server owns all of it (backend `src/progress.ts`, `docs/server.md` 5.13); the client shows it.

- **Missions**: each UTC day the profile gets 3 random daily missions from `MISSIONS.daily`, each week (Monday 00:00 UTC) 3 weekly ones from `MISSIONS.weekly`. Stats: `play` / `win` (rounds played to the results; leaving early does not count), `elims`, `knocks`, `damage`, `headshots` (headshot hits), `assists`, `revives`. The server adds a round's numbers in `grant` and lists the missions that round finished in `rewards.missions`. A finished mission is claimed in the lobby's Missions window (`save.js claimMission` -> `claim { m, i }` -> `claimed`) and pays its coins and Gems. Unclaimed rewards are lost when the set rolls over.
- **Rank rewards**: `RANKS[i].coins` / `.gems`, paid once by the server the first time `rp` reaches that rank (`profile.rankReward` = the highest rank paid; saves from before this existed count their current rank as paid). Shown on the results (`rewards.rankUp`) and in the Missions window's Rank rewards tab.
- **Gems** from missions and ranks are earned by playing like every other Gem; nothing here can be bought.
- **First-round tips** (`tutorial.js` / `tutorial.css`): while `profile.tutorial` is false, `main.js enterRound` calls `startTutorial()`. A card under the score bar shows 7 tips (move, fire, aim, crates, utility, ability, zone and revive); each waits for its action (`done(state)`) or moves on after `max` s (20 by default). Desktop and touch have their own text (`body.touch-ui`). The last tip or "Skip tips" calls `finishTutorial()` (`tutorialDone` to the server). Tips not finished come back next round; `closeMatch` hides them. The server marks players who finished rounds before the tips existed as done.

Recipe, add a mission: append `{ id, stat, goal, coins, gems }` to the list in both `config.js MISSIONS` and `progress.ts MISSIONS` (same id). A new `stat` also needs a `MISSIONS.text` line, a key in `progress.ts MissionStat`, its number in `MatchRoom.grant`'s `countRound` call and an icon in `lobby.js MISSION_ICON`.
