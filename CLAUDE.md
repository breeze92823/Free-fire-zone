# Free Fire Zone

An original third-person team shooter on a blocky island (Bloxity platform game). Two squads (blue = the player + bots, orange = bots) fight timed respawn matches on "Coral Key" with a shrinking safe zone, supply crates, airdrops, frost walls, grenades, operatives with Q abilities, knock-down + revive, and a lobby with shops. Single player against bots for now (no networking).

## Repos
- Frontend (this repo): `C:\ThreeJS\Free-fire-zone\Free-fire-zone`
- Backend: `C:\ThreeJS\Free-fire-zone\Free-fire-zone-backend` (Colyseus + MongoDB game server carried over from an older game, see its CLAUDE.md). The frontend does not talk to it yet: saves are in localStorage (`src/game/save.js`) and every other player is a bot.
- The user's reference screenshots (someone else's game) were only a quality/genre bar: the map, names, art and UI here are our own; do not copy that game.

## Rules
- Currency: only **coins**, earned in matches (eliminations, knocks, damage, win/loss, MVP). Nothing is ever sold for premium currency (see the root CLAUDE.md). Prices live in `src/config.js` (`WEAPONS`, `SKINS`, `OPERATIVES`, `STORE`).
- All tunables are in `src/config.js`; the island's own layout data is in `src/world/layout.js`.
- Never bind P (CrazyGames/Boxity pause). Esc frees the mouse and opens the portal menu.

Three.js (vanilla) + Vite + Rapier (`@dimforge/rapier3d-compat`, wasm inlined; top-level await, `build.target: 'es2022'`). Everything is procedural (canvas textures, box models, synthesized audio); the only imported model is the Bloxity base rig `public/avatars/player.glb`. Font: Fredoka.

- `npm run dev` / `npm run build`. `VITE_DEV_MODE=true` skips the Bloxity SDK/CDN. Deploy: `.github/workflows/deploy.yml` uploads `dist/` to Bloxity Hosting (main = prod, dev = dev channel).
- Dev hooks (dev server, or any build with `?debug` in the URL): `window.__game` has `G` (game state), `step(n, dt, draw)` (run frames synchronously), `quickStart(mapIndex)` (skip the vote), `teleport(x, z, facing)`, `shot(name, width, cam)` (render a frame and save it to `.shots/<name>.jpg` via the dev/preview server's `/__shot` endpoint in `vite.config.js`), `setView`, `useItem`, `combat`, `hud`, `profile`. A hidden browser pane stops `requestAnimationFrame` (and throttles timers), so drive frames with `step` and inspect them with `shot` + reading the JPEG.

## Game flow (`src/main.js`)
Boot: SDK -> renderer -> Rapier -> lighting, sea + clouds (`world.js`), island (`src/world/index.js` `buildIsland`), loot crates, player body, nav grid, effects, zone, map picture -> HUD + lobby -> avatar (async). Phases in `G.phase`: `lobby` -> `vote` (map = time of day: day / sunset / night) -> `intro` (flyover) -> `countdown` -> `playing` -> `ending` (slow motion) -> `results` -> `lobby`. The lobby has its own scene + bloom composer; the game world is only rendered in a match.

## Files (`src/game/`)
- `state.js` shared context `G` (scene, camera, island, actors, player, match, nav, phase, time) + event bus (`shot`, `damage`, `knock`, `elimination`, `revive`, `spawn`, `loot`, `airdrop`, `explosion`, `matchEnd`, ...).
- `actor.js` one character (player or bot): health/armour/life (`alive`/`knocked`/`dead`), 4 weapon slots (primary, secondary, knife, fists), items, ability charge, stats, the model (avatar + animator + baked held/back weapons + name tag) and hitboxes (capsule + head sphere, laid flat when knocked).
- `characters.js` blocky bot characters with the player.glb proportions + bone names (outfits, faces, hair, hats, team armband), portraits for the HUD. `weaponModels.js` procedural guns (AR, SMG, pistol, shotgun, LMG, DMR, sniper, knife) + skins, grenades, medkit. `icons.js` renders them to PNG icons + the SVG UI icons.
- `combat.js` hitscan from the camera (verified from the muzzle), spread, damage falloff, armour, knock/eliminate/revive, melee, explosions. `items.js` frost walls (real colliders that soak bullets), frag grenades, medkit, dash, operative abilities. `loot.js` instanced supply crates (E) + parachute airdrops. `zone.js` shrinking safe zone. `fx.js` pooled tracers, muzzle flashes (fixed light pool), GPU particles, shell casings, bullet holes, explosions, beams, rings.
- `bots.js` bot AI: own Rapier KCC each, perception (view cone + LOS + hearing), goals (fight, revive, investigate, loot, zone, hunt), strafing, bursts with settling aim error, utilities. `navgrid.js` walkability rasterised from the physics world + A* + string pulling.
- `match.js` teams, loadouts, spawns/respawns, scoring, streaks, MVPs, airdrop schedule, rewards. `controller.js` the player's input -> actions. `results.js` VICTORY/DEFEAT lineup + summary.
- `hud.js/.css` in-match HUD (score, zone timer, squad, minimap + big map (M), kill feed, weapon panel, health/armour, items, ability diamond, crosshair, damage numbers/directions, prompts, knocked/spectate/revive, scope, scoreboard (Tab)). `mapimage.js` renders the island top-down once for the maps.
- `lobby.js/.css` lobby UI (Weapons Store + skins, Store, Characters, Inventory, Settings, mode select, map vote, loading screen); `lobbyScene.js` the 3D hangar with the squad. `save.js` profile (coins, rank points, owned items, loadout, upgrades, stats).
- Root modules kept from the base: `player.js` (kinematic capsule + KCC; the shooter sets `moveSpeed`, `frozen`, `canJump`, `push`, `impulse`), `camera.js` (over-the-shoulder cam with aim zoom, scope, recoil, shake, spectate/orbit/look modes), `input.js` (mouse/keyboard incl. fire/aim/wheel), `touch.js` (joystick, look pad, two FIRE buttons, aim/jump/crouch/reload), `physics.js`, `lighting.js` (moods day/sunset/night via `setMoods`), `postfx.js`, `propkit.js`, `textures.js`, `bake.js`, `avatar/` (animator now has aim/recoil/reload/melee/throw/crouch/knocked/dead/emote layers), `audio/` (synthesized SFX in `sfx.js`, ambience in `index.js`).
- `src/world/` the island (terrain, roads, eight districts: The Villa (0,0), Maple Row (84,0), Fountain Plaza (41,-76), Relay Station (-10,-92), Dockyard (-98,-14), Sunset Beach (0,112), Old Farm (-66,34), Lookout (-62,-72)); `buildIsland(scene, { lighting, preset, maxLamps })` returns `{ radius, bounds, groundHeight, lootSpots, spawnAreas, landmarks, update, dispose, root, timings }`. Static colliders are merged into ~80 trimeshes on a 32 m grid (much faster for Rapier's character controller than thousands of cuboids); the nav grid and raycasts work on them unchanged. Dev harness: `world-test.html` (`src/world/devview.js`: free-fly camera, 1-8 districts, 0 top-down, `__wv.walkTest`, `__wv.probe`).

## Controls
WASD move, mouse look (click grabs the cursor), LMB fire, RMB aim/scope, Shift sprint, Space jump, C/Ctrl crouch, R reload, 1-4 / wheel weapons, G frost wall, T frag, X medkit, F dash, Q ability, E open crate / hold to revive, Z emote, M map, Tab scoreboard. Touch: left joystick (push to the rim to sprint), drag right side to look, FIRE (drag while holding to aim), AIM/JUMP/CROUCH/RELOAD buttons, HUD buttons for items, weapons, ability, map.

## Bloxity layout
Boxity draws its menu/chat/emotes/etc. in a toolbar in the top-left corner with the chat feed under it; the game never draws those and keeps HUD out of those rectangles. `bloxity.onReservedAreas` feeds `hud.js` (`--res-bottom`, `--res-top`, `--res-rtop`, `--score-shift`) and `lobby.js` (`--res-right`, `--res-bottom`, compact top bar).

## Bloxity integrations (docs.bloxity.io/#html5; checklist in `BLOXITY_CODE_METADATA.md`)
All SDK calls live in `src/bloxity.js` (never throw without the SDK). Done: init/loading/gameplayStart+End (per match), auth + avatar, settings (`graphics_quality`, `camera_sensitivity`, `show_fps`, `fullscreen`, `master_volume`), reserved areas, ad breaks (`main.js frame()` freezes, audio muted via `setBreakMuted`), screen ads (`AD_SCREENS`, `showAdScreen`), 4 leaderboards (`LEADERBOARDS`, `submitMatchScores` at match end / leave), the death screen (`hud.setDeath` Respawn button; with the SDK the 10 s timer and hearts are bypassed, without it the old timer works), portal emotes (`animator.writeClip`), chat bubbles. Not applicable (see the metadata file): Gems (never sold), rewarded ads, multiplayer/party/rooms/friends/server stats (single player). Deploy the backend with `roomSize`, never `seatCap`.

## Mobile & responsive (required for every change)
The game must play on phones and tablets (portrait and landscape) as well as desktop. Treat a feature as unfinished until it works on touch and on a small screen.
- **Input**: every action needs a touch path. Use Pointer Events, never mouse-only events. Everything feeds `inputState` in `src/input.js`. Pointer lock does not exist on touch.
- **Detection**: `matchMedia('(pointer: coarse)')` / touch events, not the user agent. `body.touch-ui` switches the HUD to its touch layout.
- **Layout/UI**: relative units, flex/grid, tap targets >= 44px, `env(safe-area-inset-*)`, readable at 360px, no hover-only interactions, `touch-action: none` on game controls.
- **Resize/orientation**: everything sized to the screen reacts to `resize`.
- **Performance**: respect the graphics presets (DPR, shadow map, bloom, particle counts); avoid per-frame allocations.
- **Testing**: check UI changes at 375x812, a landscape phone (e.g. 740x360, touch emulation) and desktop.
