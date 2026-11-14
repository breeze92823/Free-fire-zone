# Free Fire Zone: code documentation

Start here. This folder documents the client (this repo); the server is documented in the backend repo. Read the page for the area you are changing before editing.

| Page | Covers |
| --- | --- |
| this page | Workspace layout, run / debug, architecture, boot order, frame loop, round phases, storage keys, where to change what |
| [gameplay.md](gameplay.md) | `config.js` tables, shared state `G` and the event bus, `Actor`, combat, controller, items and abilities, loot, zone, match, effects, recipes for weapons / operatives / items / maps, vehicles and the Test Drive (section 19) |
| [ui.md](ui.md) | HUD, lobby and shops, results, the profile mirror (`save.js`), lobby 3D scene, icons, weapon and character models |
| [engine.md](engine.md) | Physics, player body, camera, input, touch, lighting, post-processing, Auto graphics, textures, sea and clouds |
| [world.md](world.md) | The island: `buildIsland`, layout data, districts, the building kit, colliders, loot spots, spawn areas |
| [avatar.md](avatar.md) | Bloxity rig, looks (custom character / kit / by hand), asset gate, animator |
| [audio.md](audio.md) | Audio engine, synth, the sound effect list, ambience |
| [bloxity.md](bloxity.md) | The SDK wrapper `bloxity.js`: every portal integration |
| `../../Free-fire-zone-backend/docs/server.md` | Game server: room lifecycle, round machine, hit checks, shop, persistence, deploy |
| `../../Free-fire-zone-backend/docs/protocol.md` | Every network message, synced state, mirrored constants |

The short rules that apply to every change are in `CLAUDE.md` (this repo), the backend's `CLAUDE.md`, and the workspace `CLAUDE.md` one level up (coins only, never premium currency; public GitHub repos).

## 1. Workspace layout

```
C:\ThreeJS\Free-fire-zone\            workspace root (not a git repo)
  CLAUDE.md                           project rules (currency, GitHub)
  .claude\launch.json                 preview servers: "ffz" (dev, port 5225), "ffz-preview" (built dist, 5226)
  Free-fire-zone\                     client, its own git repo (branch main)
    index.html                        loads the Bloxity SDK script, then src/main.js
    world-test.html                   island-only dev harness (src/world/devview.js)
    vite.config.js                    base './', es2022, the /__shot debug endpoint
    public\avatars\player.glb         the only imported model (Bloxity base rig)
    src\                              all game code (see section 3)
    docs\                             this folder
    .shots\                           debug screenshots (git-ignored)
    dist\                             build output (git-ignored)
    BLOXITY_CODE_METADATA.md          portal integration checklist
  Free-fire-zone-backend\             server, its own git repo (branch main)
    src\                              Colyseus room, rules, shop, auth, db, reporters
    test\                             mocha tests
    docs\                             server.md, protocol.md
```

Stack: three.js 0.171 (vanilla, no framework), Vite 5, Rapier 0.14 (`@dimforge/rapier3d-compat`, wasm inlined, top-level await), `@colyseus/sdk` 0.18. Everything visual and audible is procedural (canvas textures, box models, synthesized sound). The UI is plain DOM + CSS over the canvas. Font: Fredoka (Google Fonts).

## 2. Run, build, debug

| Task | How |
| --- | --- |
| Client dev server | `npm run dev` in `Free-fire-zone`, or the `ffz` preview config (sets `VITE_DEV_MODE=true`, port 5225) |
| Game server | `npm start` in `Free-fire-zone-backend` (port 2567). `ROUND_SECONDS=30 npm start` for short rounds. No env var is required locally: without `MONGODB_URI` progress lasts only for the connection (see `server.md`) |
| Two local players | A second tab with `?devUser=dev-someone2`; a round needs 2 players who pressed PLAY |
| Production build | `npm run build` (`build:dev` for the dev channel) -> `dist/` |
| Real SDK against a local server | `VITE_DEV_MODE=false VITE_SERVER_URL=ws://localhost:2567` |
| Deploy | Push to `main` (prod) or `dev` (dev channel): `.github/workflows/deploy.yml` zips `dist/` and uploads it to Bloxity Hosting. Needs `LEGION_GAME_ID` and `LEGION_DEPLOY_TOKEN` |

Environment (`.env`, see `.env.example`): `VITE_DEV_MODE` (`true` = treat the Bloxity SDK and avatar CDN as unavailable, connect straight to the dev server), `VITE_SERVER_URL` (overrides the server address).

### Debug hooks

On the dev server, or any build opened with `?debug` in the URL, `window.__game` exposes:

| Member | Use |
| --- | --- |
| `G` | the shared game state (section 5) |
| `step(n, dt, draw)` | run `n` frames synchronously, returns `G.phase`. Required when the browser pane is hidden, because `requestAnimationFrame` stops |
| `play()` | press PLAY |
| `net` | the connection object (`net.state` is the room state) |
| `teleport(x, z, facing)` | move the player |
| `shot(name, width, cam)` | render a frame and save `.shots/<name>.jpg` through the dev server's `/__shot` endpoint. `cam = { from: [x, y, z], at: [x, y, z], rel }` overrides the camera |
| `scene`, `renderer`, `camera`, `body`, `island`, `lobbyScene`, `hud`, `combat`, `profile`, `sfx`, `inputState`, `WEAPONS`, `governor`, `applyGraphics`, `currentPreset`, `setView`, `useItem`, `avatar`, `avatarReady` | direct access for inspection |
| `hitches`, `heap` | the hitch profiler (`src/prof.js`): every frame over 50 ms with its slowest parts (`net`, `controller`, `physics`, `match`, `models`, `fx`, `hud`, `world`, `render`, `syncFlow`, `roster`, `lobbyScene`, `warmup`, `enter:*` for round entry), also logged as `[hitch]` console warnings; `heap` = smoothed JS heap growth per frame and the number of collections seen. Add `span()` / `spanEnd(name, t)` around anything new you suspect |

There are no automated tests in the client. Verification is: run it, drive it with `__game`, look at `.shots`. UI changes must be checked at 375x812, a landscape phone (about 740x360 with touch) and desktop.

## 3. Module map

Dependencies point downward. `main.js` is the only module that knows everything.

```
main.js                      boot, phase flow, frame loop, dev hooks
  game/lobby.js  party.js  lobbyScene.js  results.js  hud.js   UI (DOM) and the hangar scene
  game/match.js  controller.js  online.js                the round on this client
  game/testRange.js                                      the offline Weapon Test range (store's TEST)
  game/driveTest.js  vehicles.js  vehicleModels.js       the offline Test Drive; vehicles (lobby's TEST DRIVE)
  game/vehicleNet.js                                     vehicles in an online round (seats, authority, poses)
  game/combat.js items.js loot.js zone.js fx.js          gameplay systems
  game/projectiles.js areas.js                           flying rounds; fire / smoke / stun effects
  game/actor.js  characters.js weaponModels.js merge.js icons.js mapimage.js   models
  game/state.js (G + bus)   game/save.js (profile)   net.js (Colyseus)   bloxity.js (SDK)
  avatar/*   audio/*                                     character pipeline, sound
  player.js camera.js input.js touch.js physics.js       engine
  lighting.js postfx.js perf.js warmup.js prof.js textures.js propkit.js world.js
  world/*                                                the island
  config.js                                              every tunable
```

| Folder / file | Role |
| --- | --- |
| `src/config.js` | Every tunable constant. Tables that the server copies are listed in [gameplay.md](gameplay.md) section 2 |
| `src/main.js` | Boot sequence, settings, graphics application, the phase machine, `gameFrame`, lobby squad display, dev hooks |
| `src/net.js` | Connection with backoff, join options, `send`, `onNet`, `me`, room reporting |
| `src/bloxity.js` | The only place that touches `Legion.SDK`; every function is a no-op without it |
| `src/game/` | Match logic, UI, models, the Weapon Test range |
| `src/avatar/` | Rig loading, looks, animator |
| `src/audio/` | Web Audio engine and synthesized effects |
| `src/world/` | Island builder and districts |
| root engine files | `physics.js`, `player.js`, `camera.js`, `input.js`, `touch.js`, `lighting.js`, `postfx.js`, `perf.js`, `warmup.js` (shader / texture warm-up), `textures.js`, `propkit.js`, `world.js` (sea + clouds). |

## 4. Boot sequence (`main.js`, top to bottom)

1. Read the saved graphics choice (`ffz.quality`), create the Auto governor (`perf.js`).
2. `bloxity.onSetting`, `bloxity.onAdBreak`, `bloxity.init()`.
3. Renderer (ACES tone mapping, soft shadows), `installInput`, `installAudio`, scene, camera, `createPostFx`.
4. Apply portal settings (except `graphics_quality`; `master_volume` only with the SDK).
5. `await initPhysics()` (Rapier wasm).
6. `createLighting`, `setTextureQuality`, `createWorld` (sea + clouds).
7. `await buildIsland(scene, { lighting, preset })` -> `G.island` (Coral Key, the default world; `G.world = 'coral'`).
8. `buildLoot(scene, island.lootSpots, 'coral')`, `createPlayerBody()` (frozen at the blue spawn).
9. `buildNav(island)`, `initFx`, `initMatchSystems` (the zone).
10. `renderMapImage` (top-down map for the minimap) and one `renderMapShot` per Coral Key `MAPS` entry (vote cards), each in its own mood; maps on another world get a placeholder card until it is built.
11. `hud.init`, `installTouch`, `bindKeys`, `createLobbyScene` + its own post-fx composer, `initLobby`.
12. Avatar: a blocky stand-in first; `loadAvatar()` streams the Bloxity look in (`streamLook`).
13. `bloxity.subscribeAuth`: the first settled auth state calls `net.connect()`; later sign-in changes send `auth`.
14. Portal hooks: avatar / proportion changes, respawn request, emotes, chat bubbles; `initOnline()`.
15. Bus listeners (`spawn`, `elimination`, `matchEnd`), `body.onFellOut`.
16. "Preparing graphics": the lobby scene's shaders compile in parallel behind the loading screen; the warm kit is built and the game scene's warm-up is scheduled for the lobby frames ([engine.md](engine.md), `warmup.js`).
17. `G.phase = 'lobby'`, `renderer.setAnimationLoop(frame)`. 2.5 s later (or at once on PLAY) `loadWorld('ridge')` builds Dustline Ridge in the background (section 4.1).

### 4.1 Worlds (`main.js`, "Worlds" section)

A map is played on a world (`MAPS[i].world`, `WORLDS` in `config.js`): **Coral Key** (`src/world/`, built at boot) or **Dustline Ridge** (`src/world/ridge/`, the big desert island, about 4x the area; [world.md](world.md) section 8). Both are built at the origin; only one is active at a time.

| Function | Does |
| --- | --- |
| `activateWorld(id)` | Shows world `id` and hides the others (`setActive`: mesh root visibility + every static collider `setEnabled`; Coral Key's lamps muted through `lighting.setLampsOn`), switches the crate set (`loot.js useLoot`), sets `G.island`, `G.world`, `G.nav` and the HUD map picture. Synchronous and cheap; `enterRound` calls it for the round's map, `enterTest` for Coral Key |
| `loadWorld(id)` | Builds a world once (`WORLD_BUILDERS`) and resolves to it. The build is sliced (`nextTask.js`: MessageChannel yields, not clamped in background tabs); its nav grid is built a few rows per task with `navgrid.js buildNavAsync` (the world's colliders switched in for each slice, paused while `G.match` / `G.test`); then, outside a round, one synchronous switch renders its map picture (`mapImg`, 1536 px) and its vote cards. Sets `w.ready`, schedules a warm-up, logs `[world] ridge: built in ... ms` |
| `enterRound()` | If the round's world is not `ready` it calls `loadWorld`, keeps the queue panel up with "Loading <map>…" (`info.loading`) and returns; `syncFlow` retries every frame |

Measured on an Intel Iris Plus laptop (Auto: Low): Ridge build ~2.1 s, nav ~2.3 s, pictures ~0.3 s, all in slices; the longest single block is the picture render (~0.3 s), then the collider flush (~0.12 s). A built world stays in memory (hidden, colliders off) for the rest of the session.

Load-time vs live graphics: texture resolution (`texScale`), model `detail`, particle pool sizes and antialias are fixed by the preset active at boot. Pixel ratio, view distance and shadow map size change live; shadows on/off, bloom on/off and anisotropy recompile or re-upload everything, so during a round they only fade (no shader change) and the real switch waits for the round to end (`applyGraphics`, [engine.md](engine.md)).

## 5. Frame loop

`frame(dt)` (dt capped at 0.1 s):

1. FPS readout; the Auto governor samples frames only while `playing` / `countdown`.
2. During a portal ad break: render the current scene and return. Nothing else advances.
3. `syncFlow()`: follow the server's phase (section 6).
4. Four times a second in the lobby / queue (once a second otherwise): `roster()` -> `lobby.setRoster` (which feeds `party.js`: the Players online dock, invites, the lobby team) and `showMates` (the hangar's team); every lobby frame `lobby.placePlates(lobbyScene.anchors())` puts the teammates' names over their heads.
5. `lobby` / `queue`: `lobbyScene.update`, `pumpWarmup()` (background shader / texture warm-up of the game scene), `lobbyFx.render()`. Otherwise `gameFrame(dt)`.

`gameFrame(dt)` order (it matters: later steps read what earlier ones wrote):

1. Intro / countdown timers.
2. `reconcile()`, `applyState(dt)`, `syncClock(dt)`: the server's view first.
3. `updateController(gdt, hud)`: input -> actions and the body's speed.
4. `stepPhysics(gdt)`, `interpolatePlayer()`; copy the body's position / velocity / facing into `G.player`.
5. `sendPose(dt)`.
6. `updateMatch(gdt)` while `playing` / `ending`: zone, timers, items, loot.
7. Zone announcements.
8. `updateModel` for every actor (aim direction from the camera for the player, from the pose for others); nearby footsteps.
9. `updateFx(gdt)`.
10. Camera: `orbit` (intro flyover), `look` (results), `play` / `scope` / `spectate`.
11. Audio listener, dead-state control release, `hud.update`, the "click to aim" hint.
12. `updateView` (fog + far plane), `world.update`, `island.update`, `lighting.update`, ambience, `postfx.render()`.

`gdt = dt * G.slowmo` (0.3 during `ending`).

## 6. Round phases

`G.phase` on the client follows `net.state.phase` on the server:

| Client `G.phase` | Server phase(s) | What is on screen | Entered by |
| --- | --- | --- | --- |
| `boot` | - | loading screen | initial value |
| `lobby` | any | hangar + menus | boot end, `backToLobby()` |
| `queue` | `waiting`, `vote`, or a running round not yet entered | hangar + waiting / map vote panel | `startMatchFlow()` (PLAY, sends `play`), `nextRound()` |
| `intro` | `intro` | flyover from the voted map's `focus` to the player | `enterRound()` |
| `countdown` | `countdown` | 3, 2, 1, FIGHT; player frozen | `syncFlow` |
| `playing` | `playing` | the round | `syncFlow` or `enterRound` (late join) |
| `ending` | `ending` | slow motion | `syncFlow` / the `matchEnd` event |
| `results` | `results` | lineup + rewards | `toResults()`; the panel appears when the `rewards` message has arrived |

Transitions out: `results` -> `queue` when the server goes back to `vote` / `waiting` (`nextRound`, same room), or -> `lobby` via the Lobby button (`leaveMatch` sends `leave`). During a round the HUD's exit button (beside the minimap, while up) and the spectate panel's Lobby (while eliminated) open "Leave the match?" first (`main.js askLeave`, [ui.md](ui.md) 2.10): before the fight leaving is free; in `playing` it costs the round reward (half the fighting coins, -12 rank points, the kills' Gems stay) and a knocked or just-hit player counts as eliminated (backend `server.md` 5.4). The penalty arrives as `rewards { left: true }` and is shown as a lobby toast. A dropped connection keeps the seat for 20 s while the SDK reconnects (the HUD says "Connection lost — reconnecting…"). Losing the room (`left` event) or `me().inMatch` turning false returns to the lobby. In `queue`, 3 s without the server marking the player `inMatch` also returns to the lobby.

`enterRound()` is the one place a round is built on the client: `createMatch`, `reconcile`, `syncLoot`, `compileNow` (a safety net: the lobby's warm-up normally compiled everything), HUD on, input on. `closeMatch()` is the one place it is torn down.

## 7. Persistent browser storage

| Key | Content | Owner |
| --- | --- | --- |
| `ffz.quality` | graphics choice (`Auto`, `Low`, ...) | `main.js` |
| `ffz.volume` | master volume 0..1 from the lobby slider (written by `lobby.js`, read at boot by `main.js`; the portal's `master_volume` wins when the SDK is present) | `lobby.js` / `main.js` |
| `ffz.devUser` | dev-only account id (`dev-...`) | `net.js` |
| `ffz.auto2` | Auto graphics: `{ gpu, rung }` remembered per GPU (`STORE_KEY` in `perf.js`) | `perf.js` |
| `free-fire-zone.sound` | `muted` or `on` (`AUDIO.storageKey`) | `audio/core.js` |

Progress (coins, rank, items, loadout, stats) is not stored in the browser: the server owns it and sends it as `profile`. Every storage access is wrapped in try/catch because the portal iframe can block storage.

## 8. Where to change what

| I want to... | Go to |
| --- | --- |
| Tune a number (speed, damage, prices, zone, camera) | `src/config.js`; if the table is mirrored, the backend too ([gameplay.md](gameplay.md) section 2) |
| Add / balance a weapon, operative, item, map | [gameplay.md](gameplay.md) section 14 |
| Add a shop item or price | `config.js` + backend `catalog.ts`; [ui.md](ui.md) for the card. Skins, operatives and the Store cost coins; the Weapons Store (weapons, grenades, the pass) costs the game's own Gems ([ui.md](ui.md) 3.10). Both are earned only |
| Change the Weapon Test range (TEST button) | `src/game/testRange.js`; [gameplay.md](gameplay.md) section 17 |
| Tune or add a vehicle, change the Test Drive | `VEHICLES` / `DRIVE` in `config.js`, `src/game/vehicles.js`, `vehicleModels.js`, `driveTest.js`; [gameplay.md](gameplay.md) section 19 |
| Vehicle health, damage, ramming, the mounted gun | `VEHICLES[type].hp`, `MOUNTS`, `VEHICLE_DAMAGE` in `config.js` and the backend's `rules.ts` (`VEHICLE_TYPES`, `MOUNTS`, `VEHICLE_DAMAGE`: the server decides); `vehicles.js` (hulls, wrecks, rams), `combat.js` (`shootBullets`, `fireMounted`), `vehicleNet.js`; [gameplay.md](gameplay.md) section 19 "Combat" |
| Change the HUD or a menu | [ui.md](ui.md); respect reserved areas, touch and small screens |
| Add a key or touch control | [engine.md](engine.md) (`input.js`, `touch.js`), `controller.js bindKeys`. Never bind P |
| Change the island | [world.md](world.md); data in `src/world/layout.js` (Coral Key) or `src/world/ridge/layout.js` (Dustline Ridge) |
| Add a world (a new island) | README section 4.1, [gameplay.md](gameplay.md) "Add a map to the vote", [world.md](world.md) section 8 |
| Change how characters look or animate | [avatar.md](avatar.md) |
| Add a sound | [audio.md](audio.md) |
| Change missions, rank rewards or the first-round tips | [gameplay.md](gameplay.md) section 18; `MISSIONS` / `RANKS` in `config.js` and the backend's `progress.ts` |
| Use another portal feature | [bloxity.md](bloxity.md); update `BLOXITY_CODE_METADATA.md` |
| Add a network message | backend `docs/protocol.md`; client: `send(...)`, a handler in `online.js`, the type in `MESSAGES` (`net.js`) |
| Change a server rule (hit checks, rewards, round length) | backend `docs/server.md` |
| Add a graphics option | [engine.md](engine.md); `GRAPHICS_PRESETS`, `applyGraphics` in `main.js` |

## 9. Known issues found while documenting (2026-11-14)

Nothing here was fixed; the docs describe the code as it is. Each page ends with a fuller "Observations" section. Marked (verified) = checked again in the code or the running game after the page was written; the rest come from one careful read.

Gameplay and touch:

- Fixed the same day: touch players could not open supply crates (`main.js` now passes `onInteract` to `hud.init`), and the touch pads covered the HUD's item / weapon / reload / ability buttons (the pads now sit in their own layer under the HUD; see [ui.md](ui.md) 7.1). Both checked in a two-player round at 740x360 with synthetic touch events, not on a real phone.
- The scoreboard is reachable only with Tab. Several touch targets are under 44 px ([engine.md](engine.md), [ui.md](ui.md)).
- Fixed 2026-11-14: crates face the same way on every client (`loot.js spotYaw` hashes the spot's position); the server no longer echoes `ult` to its sender and the client ignores its own id, so the ability effect plays once; other players' catalogue emotes are fetched when first seen (`online.js loadPortalClip`) and an emote lasts its own length (`animator.js emoteLength`); knocks, eliminations, kill streaks and kill rewards have sounds.
- The results screen's tap-to-skip does nothing (`pointer-events: none`); the HUD squad list is built once per round ([ui.md](ui.md)).
- `serverError`, `openFail` and `round` have no client handler: a failed profile load or refused crate open shows nothing.

Server validation (details and which ones were reproduced by test: backend `docs/server.md` section 12):

- Repeating the same shot number in `hit` messages skips the fire-rate check. (verified in `MatchRoom.onHit`)
- `hit` trusts the client's headshot / pellet / distance fields within clamps; there is no line-of-sight check.
- A round whose opponent leaves pays a full win, which a second guest tab can farm.
- A session replaced by a newer one (code 4100) can still write its stale profile after the reconnect window.
- `heal` is not counted against medkits; `open` has no distance check; no message rate limit is set.

Dead or stale code removed on 2026-11-14: `src/bake.js`, `src/modes.js`, `bloxity.js submitMatchScores` / `enableParty` / `canCustomize` / `toggleCustomizer`, `BOTS` (now `NAV.cell`), `MODES` / `START_MODE` / `GROUND_Y`, the A* pathfinding in `navgrid.js`, `toggleMuted`, the unused `announce` listener and the bot comments; the backend's `build/` was rebuilt from its own `src/`. Still listed per page: unused painters and smaller exports.

## 10. Rules that apply to every change

- Coins only in the shops. Nothing is purchasable with premium currency (Bloxity Gems, real money), and prices are enforced by the server. The game's own Gems (`profile.gems`) are earned by knocks and eliminations only and must never be sold.
- Mobile and small screens are required: every action has a touch path (Pointer Events, targets >= 44 px), layouts react to resize, and the Bloxity reserved areas stay clear.
- Never bind P. Esc frees the mouse and opens the portal menu.
- No per-frame allocation in hot paths; effects and lights are pooled.
- A rule or price change goes into both repos.
- Art, names and UI are original; reference screenshots were only a quality bar.
