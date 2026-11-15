# `src/bloxity.js`: the Bloxity (Legion) SDK wrapper

Single facade over `window.Legion.SDK`. Every SDK call in the game goes through this file (the avatar modules import it too). Two rules hold for almost every export:

- **No SDK, no throw.** `sdk()` returns `null` when `DEV_MODE` is true or `window.Legion.SDK` is missing; exports then return `null` / `''` / `false` / a no-op unsubscribe. The only exports that can reject are `resolveServerEndpoint` (dereferences `sdk()` without a guard) and `locateRoom` (un-caught `fetch`); `net.js` guards both.
- **Optional chaining on every SDK member** (`sdk()?.x?.y?.()`), so an older SDK build without a feature degrades the same way as no SDK.

SDK docs: https://docs.bloxity.io/#html5. The SDK script is a static tag in `index.html` (`https://sdk.bloxity.io/v1/legion-sdk.min.js`).

## 1. Environment and URL inputs

| Input | Read where | Effect in this file |
| --- | --- | --- |
| `VITE_DEV_MODE` (`.env`, `.env.example`; default `false`) | `config.js` `DEV_MODE = import.meta.env.VITE_DEV_MODE === 'true'` | `sdk()` always returns `null`, so every export takes its no-SDK path. `init()` logs `VITE_DEV_MODE=true: skipping SDK/CDN`. The script tag in `index.html` is still present; it is just ignored. |
| `VITE_SERVER_URL` (commented out in `.env.example`) | `config.js` `NET.devServer` | Not read here. `net.js resolve()` uses it instead of `resolveServerEndpoint` even when the SDK is loaded. |
| `?roomId=` | `launchRoomId()` | Launch room for Open Rooms / friend invites. |
| `?instantMultiplayer=true` | `wantsPrivateRoom()` | Create a private room. |
| `location.hostname` | `init()` | On `localhost` / `127.0.0.1` `SDK.init` also gets `portalUrl: 'https://bloxity.io'`. |

`bloxity.js` contains no `import.meta.env` read itself; it imports `DEV_MODE`, `GAME_SLUG`, `GAME_TITLE`, `SETTINGS`, `coerceSetting`, `AD_SCREENS`, `NO_AD_SCREENS`, `LEADERBOARDS`, `NET` from `config.js`.

Hard-coded fallbacks used when `SDK.environment()` is missing: `https://static.bloxity.io` (`getPfp`), `https://api.bloxity.io` (`getEmoteClip`). `locateRoom` has no fallback for `playUrl` and returns `null`.

## 2. Module state

| Name | Exported | Meaning |
| --- | --- | --- |
| `settings` | yes | `{ [key]: coercedValue }` for every key of `SETTINGS`, initialised to the coerced defaults at import time. |
| `authState` | yes | `{ ready, user, guest }`. `user` is only written in `onUser` (from `SDK.auth.getUser()`); `ready` flips once auth has settled. |
| `latestEquipped`, `latestProportions` | no | Last payloads of `avatar.onAvatarChanged` / `onProportionsChanged`; cleared on every user change. |
| `adBreakActive`, `adScreenType`, `inGameplay`, `initialised`, `announcedFirstFrame`, `emoteCatalog`, `featureDone` | no | Dedupe / latch flags described per export below. |
| `unsubscribers` | no | Unsubscribe functions collected by `init` and `onChatMessage`; run by `teardown`. |
| listener sets (`avatar`, `proportion`, `auth`, `setting`, `respawn`, `adBreak`, `emote`) | no | Fed by `emit(listeners, ...args)`, which catches and logs a throwing listener. |

## 3. Exports

Columns: wrapped SDK call, result without the SDK, callers (found by Grep in `src/`).

### 3.1 Core, init, loading

| Export | Wraps | Without SDK | Called by |
| --- | --- | --- | --- |
| `sdk()` | `window.Legion.SDK` | `null` | this file only |
| `hasSdk()` | `!!sdk()` | `false` | `main.js` (`localLook`, `loadAvatar`, initial settings loop), `avatar/look.js prewarmLook` |
| `init()` | see below | sets `authState.ready = true`, notifies auth listeners, returns | `main.js`, once, after registering `onSetting` and `onAdBreak` |
| `loadingStep(text)` | `game.loadingStep(text)` | no-op | `main.js` ("Starting physics", "Building the island") |
| `notifyFirstFrame()` | `game.loadingEnd()`, once | no-op (latch still set) | `main.js frame()`, when `avatarReady` or 5 s of frames have passed |
| `gameplayStart()` | `game.gameplayStart()`, only when not already in gameplay | flips `inGameplay` only | `main.js enterRound`, `syncFlow` (phase becomes `playing`) |
| `gameplayEnd()` | `game.gameplayEnd()`, only when in gameplay | flips `inGameplay` only | `main.js endGameplay` (results, match end, leaving), `teardown` |
| `teardown()` | runs every collected unsubscribe, then `gameplayEnd()` | same | `main.js` `beforeunload` |

`init()` is idempotent (`initialised`). With the SDK, in order, all inside one `try` (a throw logs, sets `authState.ready = true` and notifies auth listeners):

1. `SDK.init({ gameSlug: GAME_SLUG })` (plus `portalUrl` on localhost), `game.loadingStep('Loading Free Fire Zone')`.
2. `settings.listen(key, cb)` for every key of `SETTINGS`, then `settings.triggerAll?.()`.
3. `auth.onUserChanged(onUser)`.
4. `avatar.onAvatarChanged` and `avatar.onProportionsChanged` when they exist.
5. `player.onEvent((event, data) => ...)`: `respawn_request` -> respawn listeners; `play_emote` with a string -> emote listeners with the id; `stop_emote` -> emote listeners with `null`.
6. `initAds(SDK)`, `initLeaderboards(SDK)`.
7. `party.enable({ maxPartySize: NET.teamMax })` (3).
8. `game.registerFeature('emotes')`.
9. `game.loadingStep('Building the island')`.

### 3.2 Auth and identity

| Export | Wraps | Without SDK | Called by |
| --- | --- | --- | --- |
| `subscribeAuth(fn)` | internal; `fn(authState)` immediately and on every change; returns unsubscribe | called once at subscribe and once from `init` with `ready: true, user: null` | `main.js` (loads the avatar on sign-in change, calls `net.connect()` the first time `ready` is true, sends `auth` when the user id changes later) |
| `displayName()` | `user.displayName / username / name`, else the guest's, else `'Guest'` | `'Offline'` | `main.js` (join options map `'Offline'` to `'Guest'`), `lobby.js` profile chip |
| `getPfp()` | `user.pfp` or `guest.pfp` resolved against `environment().staticUrl`; only `http(s)` URLs pass | `''` | `main.js` (join options, `auth` message, HUD portrait), `lobby.js` |
| `getToken()` | `auth.getToken()` (non-empty string) | `null` | `net.js joinOptions`, `main.js` `auth` message |
| `userId()` | `authState.user._id` | `null` | `net.js resolve()` |

Auth settling (`onUser`, private): the SDK calls `onUserChanged` at once with a null user and again after the portal handshake. A non-null user settles `ready` immediately; a null user starts one `GUEST_SETTLE_MS` (2500 ms) timer and `settleAuth` sets `ready` when it fires. Once `ready` is true it never goes back. Each `onUser` clears `latestEquipped` / `latestProportions`, re-reads `getUser()` and `getGuest()` (when the function exists and there is no user), and notifies auth listeners.

### 3.3 Settings

| Export | Wraps | Without SDK | Called by |
| --- | --- | --- | --- |
| `settings` | live values written by the `settings.listen` callbacks | stays at the coerced defaults | `main.js` (applies each key after the renderer exists) |
| `onSetting(fn)` | `fn(key, value)` on every change, already coerced; returns unsubscribe | never fires | `main.js applySetting` |
| `requestFullscreen(on)` | `portal.requestFullscreen()` / `portal.exitFullscreen()` | no-op | `main.js applySetting('fullscreen')` |

Keys (`config.js SETTINGS`): `graphics_quality` (enum `QUALITY_OPTIONS`, default `Auto`), `camera_sensitivity` (number 0.1..5, default 1), `show_fps` (bool), `fullscreen` (bool), `master_volume` (number 0..100, default 80).

Propagation: portal -> `SDK.settings.listen(key)` callback -> `coerceSetting(key, raw)` -> skipped when equal to `settings[key]` -> `settings[key] = next` -> `emit(settingListeners, key, next)` -> `main.js applySetting`: `camera_sensitivity` -> `setCameraSensitivity`; `fullscreen` -> `requestFullscreen`; `master_volume` -> `setVolume(value / 100)`; `show_fps` -> the FPS readout; `graphics_quality` -> governor + `applyGraphics` (ignored until `renderer && bootDone`).

Because a value equal to the default never emits, `main.js` also loops over `bloxity.settings` once after the renderer is created and calls `applySetting` for each key, skipping `graphics_quality` (Auto or the lobby's own choice) and, without the SDK, `master_volume` (the lobby slider's `ffz.volume` is kept).

### 3.4 Reserved areas and portal UI

| Export | Wraps | Without SDK | Called by |
| --- | --- | --- | --- |
| `onReservedAreas(fn)` | `ui.onReservedAreasChange(cb)`; `fn` gets `[{ id, left, top, width, height }]` in CSS px (a non-array becomes `[]`); returns the SDK's unsubscribe | `fn(estimatedReservedAreas(innerWidth, innerHeight))` now and on every `resize`; returns a function removing that listener | `hud.js` (`layoutReserved` -> `--res-bottom`, `--res-top`, `--res-rtop`, `--score-shift`), `lobby.js` (`--res-right`, top bar position / `compact`) |
| `showMenu()` | `portal.showMenu(true)` | no-op | `main.js` via `installInput(() => bloxity.showMenu(), ...)` (Esc) |
| `onRespawnRequest(fn)` | `player.onEvent` `respawn_request` (the portal pause menu's Respawn button) | never fires | `main.js`: while `playing` and alive, `spawnActor(G.player)` |

`estimatedReservedAreas(w, h)` (private) mirrors the SDK's own estimate: a `toolbar` rectangle at the top-left (full width under 480 px, else 330 px wide; height 16 + 32 / 40 / 44 by width) and a `chat` rectangle under it (140 px high when `w < 640 || h <= 500`, else 180 px). The fallback is also used when the SDK call throws or returns no function.

### 3.5 Ads

| Export | Wraps | Without SDK | Called by |
| --- | --- | --- | --- |
| `isAdBreak()` | flag set by `ads.onBreakStart` / `ads.onBreakEnd` | `false` | `main.js frame()`: while true it only re-renders and returns (no `syncFlow`, no simulation) |
| `onAdBreak(fn)` | `fn(true)` at break start, `fn(false)` at break end | never fires | `main.js` -> `setBreakMuted(on)` in `audio/core.js` |
| `showAdScreen(type)` | `ads.screen(type)` when `type` is truthy and not in `NO_AD_SCREENS`, otherwise `ads.hideScreen()`; a repeat of the last type is ignored | no-op (the last type is still remembered) | `main.js`: `'lobby'` (boot, `nextRound`, `backToLobby`), `'panel'` (a lobby window opens), `'results'`, `'gameplay'` |

`initAds` (private) also calls `ads.declareScreens(AD_SCREENS)`. As configured today every screen in `AD_SCREENS` is `{ show: false }` and `NO_AD_SCREENS` lists all four types, so `showAdScreen` always ends in `hideScreen()`.

### 3.6 Leaderboards

`initLeaderboards` (private) calls `leaderboard.define(LEADERBOARDS)` (four boards: `eliminations`, `wins`, `best_match`, `weekly_elims`). The client submits no scores: the server's `reporters.ts` does.

### 3.7 Death screen and respawn

| Export | Wraps | Without SDK | Called by |
| --- | --- | --- | --- |
| `hasDeathScreen()` | `typeof deathScreen.show === 'function'` | `false` | `main.js` `on('elimination')` |
| `showDeathScreen()` | `deathScreen.show()` -> handle `{ onCountdown(fn) -> unsubscribe, respawn() -> boolean, ready }` | `null` | `main.js` `on('elimination')` |
| `hideDeathScreen()` | `deathScreen.hide()` | no-op | `main.js clearDeath` (on `spawn`, `endGameplay`) |

Flow with the SDK: the local player is eliminated while `G.phase === 'playing'` -> `showDeathScreen()` -> `portalDeath = !!handle`, `hud.setDeath(handle)` (the spectate panel's Revive button shows the portal's countdown and stays disabled until it reaches 0) -> button press (or G) -> `main.js onRespawn(death)` -> `death.respawn()` returns true -> `requestRespawn(true)` -> `send('respawn')`. Without the SDK (`portalDeath` false): Revive works once `G.time >= p.respawnAt` (`NET.respawnFallback`, 5 s) and `gameFrame` sends `respawn` by itself at `p.autoRespawnAt` (`NET.autoRespawn`, 20 s). Meanwhile the player spectates (ui.md 2.7).

### 3.8 Emotes

| Export | Wraps | Without SDK | Called by |
| --- | --- | --- | --- |
| `onPortalEmote(fn)` | `fn(emoteId)` on `play_emote`, `fn(null)` on `stop_emote` | never fires | `main.js playPortalEmote` |
| `getEmoteClip(id)` (async) | `fetch(<apiUrl>/v1/avatar/emotes)` once, cached as `Map(id -> clip)`; clip is `{ len, loop, tracks }` | would still fetch `https://api.bloxity.io` (no `sdk()` guard), but nothing calls it without the SDK | `main.js playPortalEmote` -> `registerEmoteClip(id, clip)` in `avatar/animator.js` |

The catalogue response may be an array or `{ emotes: [...] }`. A non-OK response or a throw returns `null` and leaves the cache empty, so the next call retries. There is no timeout on this fetch.

### 3.9 Chat

| Export | Wraps | Without SDK | Called by |
| --- | --- | --- | --- |
| `onChatMessage(fn)` | `chat.onMessage(fn)`; `fn({ userId, username, text, isGif, at, isLocalPlayer })`; the unsubscribe is also queued for `teardown` | returns `() => {}` | `main.js` (own messages), `online.js initOnline` (other players, matched by `actor.uid === m.userId`) |
| `attachChatBubble(THREE, root, message, height = 2.3)` | `chat.attachBubble(THREE, root, chat.bubbleText(message), { height })` | `null` | `main.js` (`G.player.group`), `online.js` (`a.group`); both call `.remove?.()` on the previous bubble |

The portal draws the chat UI; the game only floats bubbles. `THREE` is passed in because the SDK builds the sprite with the game's own three.js (`online.js setThree`).

### 3.10 Avatar accessors (consumed by `main.js` and `src/avatar/`)

| Export | Wraps | Without SDK | Called by |
| --- | --- | --- | --- |
| `onAvatarChanged(fn)` | `avatar.onAvatarChanged`; no arguments passed to `fn`; may fire twice (optimistic, confirmed) | never fires | `main.js` -> `loadAvatar` |
| `onProportionsChanged(fn)` | `avatar.onProportionsChanged` | never fires | `main.js` -> `applyProportions` (not on custom characters) + `sendAvatar` |
| `getEquippedAvatar()` | `latestEquipped` (event payload wins), else `avatar.getEquipped()` | `null` | `main.js localLook` |
| `getProportions()` | `avatar.getProportions()` merged with `latestProportions` | `null` | `main.js localLook`, proportions handler |
| `getSkinTextureUrl()` | `avatar.getSkinTextureUrl()` (composed skin of the local player) | `null` | `main.js localLook` |
| `getSkinTextureUrlFor(equipped)` | `avatar.getSkinTextureUrlFor(equipped)` | `null` | `avatar/look.js build` (manual path) |
| `getOutfitKey()` | `avatar.getOutfitKey()` | `null` | `main.js` (`localLook`, `sendAvatar`, join options) |
| `getOutfitKeyFor(equipped)` | `avatar.getOutfitKeyFor(equipped)` | `null` | `avatar/look.js build` |
| `characterKit()` | `SDK.character` when it has `dress` and `canDress` | `null` | `avatar/look.js build` |
| `getCharacterFor(equipped)` (async) | `avatar.getCharacterFor(equipped)` -> `{ id, name, glbUrl, textureUrl, rig: { joints, anchors, height, fit } }` | `null` | `avatar/look.js build` |
| `characterAccessoryMatrix(character, bone)` | `avatar.characterAccessoryMatrix`; only a 16-number array passes | `null` | `avatar/loader.js attachCharacterAccessories` |
| `accessorySlots()` | `avatar.getAccessorySlots()` -> `[{ field, bone, dir, origin, inheritScale, mirrorBone? }]`; empty arrays become `null` | `null` | `avatar/loader.js itemSlots` |
| `accessoryUrls(field, id)` | `avatar.getAccessoryUrls(field, id)` | `null` | `avatar/loader.js itemUrlsFor` |

### 3.11 Game server, rooms, party, friends

| Export | Wraps | Without SDK | Called by |
| --- | --- | --- | --- |
| `canResolveServer()` | `typeof net.resolveEndpoint === 'function'` | `false` | `net.js resolve()` |
| `resolveServerEndpoint(userId)` (async) | `net.resolveEndpoint(GAME_SLUG, { userId }?)` -> `{ endpoint, roomId, cold }`; returns `{ endpoint, relayRoomId: roomId }`; logs when `cold` | rejects (TypeError) | `net.js resolve()`, only when `canResolveServer() && !NET.devServer` |
| `launchRoomId()` | `?roomId=` of the page URL | `''` when absent | `net.js joinOnce` (first connect only) |
| `locateRoom(id)` (async) | `environment().playUrl`. `"<relay>~<room>"` -> `{ endpoint: ws(s)://.../v1/ws/<relay>, roomId, relayRoomId }`. Bare id -> `GET <playUrl>/v1/dir/<slug>/list`, the entry with that `colyseusRoomId`, not `locked`, `players < maxPlayers` -> `{ endpoint: joinUrl, roomId, relayRoomId }` | `null` | `net.js joinOnce` (in a `try`; failure falls back to matchmaking) |
| `updateRoom(roomId, partyId)` | `game.updateRoom(roomId[, partyId])`; `''` = not in a joinable room | no-op | `net.js reportRoom` (`"<relay>~<roomId>"`, team as `partyId`) |
| `wantsPrivateRoom()` | `?instantMultiplayer=true` | `false` when absent | `net.js joinOnce` |
| `registerFeature(name)` | `game.registerFeature(name)`, once per name | marks the name done without calling anything | `net.js attach` (`'play_with_friends'`, after each join) |
| `partyLaunch()` | `party.getLaunch()` (`net.js` reads `.roomKey`) | `null` | `net.js joinOnce` |
| `partyJoined(roomId)` | `party.joined(roomId)` | no-op | `net.js connect` |
| `partyFailed(reason)` | `party.failed(reason)` | no-op | `net.js joinOnce` (`'room-full'` when the join error matches `full|locked`) |
| `playerJoined(name)` | `game.playerJoined(name)` | no-op | `online.js trackRoster` (a player who arrived after us, reported once, as soon as they have a name) |
| `playerInRoom(name)` | `game.playerInRoom(name)` | no-op | `online.js trackRoster` (players already in the room when we joined, once each when named; the portal's Esc menu "In this lobby" list is built from these; tracking restarts in every room) |

How `net.js` strings these together (`joinOnce`): `partyLaunch()` -> join options (`token`, `devUser`, `party: roomKey`, plus `main.js` `setJoinOptions`: `name`, `pfp`, `avatar`, `outfitKey`) -> launch room via `locateRoom` + `joinById` -> else `resolve()` -> a new Colyseus `Client(endpoint)` -> `create(..., { private: true })` when `wantsPrivateRoom()` (first time only) or `joinOrCreate`. After `attach`: `reportRoom()`, `registerFeature('play_with_friends')`; `partyJoined` when a party launch was present.

## 4. Recipes

### Integrate a new SDK feature

1. Add the wrapper here, never a direct `Legion.SDK` access elsewhere. Shape it like its neighbours: `try { return sdk()?.area?.method?.(args) ?? fallback } catch { return fallback }`.
2. Decide the no-SDK result first (`null`, `''`, `false`, a no-op unsubscribe) and keep the caller's fallback path working with it; `VITE_DEV_MODE=true` exercises exactly that path.
3. Subscriptions: subscribe inside `init()`'s `try`, push the returned unsubscribe into `unsubscribers`, fan out through a private listener `Set` + `emit`, and export an `onX(fn)` that returns an unsubscribe. If the SDK fires synchronously during `init` (as `settings.triggerAll` does), the game must register its listener before `bloxity.init()`; `main.js` does this for `onSetting` and `onAdBreak`.
4. One-shot registrations (`registerFeature`, `declareScreens`, `define`) go in `init()` in their own `try` so one failure does not skip the rest; latched calls keep a module flag (`inGameplay`, `featureDone`).
5. Anything that needs data from `config.js` (ids, limits) gets a constant there, imported at the top.
6. Add the row to `BLOXITY_CODE_METADATA.md` and to the list in `CLAUDE.md` ("Bloxity integrations").
7. Project rule: nothing may be sold or granted for premium currency (Bloxity Gems / Robux) or for watching ads; do not wrap purchase or rewarded-ad calls. The game's own Gems (`profile.gems`, earned by eliminations) are a separate in-game currency and must never be sold through the SDK either.

### Add a new portal setting

1. Add the key to `SETTINGS` in `config.js`: `{ def: '<string default>', type: 'bool' | 'number' | 'enum', min, max, values }`. `init()` iterates `Object.keys(SETTINGS)`, so the listener and the entry in `settings` appear without changes here.
2. `coerceSetting` handles the three types; add a branch there only for a new type.
3. Handle the key in `main.js applySetting(key, value)`. It is called for live changes (`onSetting`) and once at boot for every key except `graphics_quality`; make it safe to run before the systems it touches exist (the `graphics_quality` branch checks `renderer && bootDone`).
4. If the lobby Settings window has its own control for the same thing, decide which wins without the SDK (see the `master_volume` skip in `main.js`).
5. Register the setting on the Bloxity dashboard under the same key and list it in `BLOXITY_CODE_METADATA.md`.

## 5. Gotchas

- `subscribeAuth` invokes `fn` synchronously during the call; `main.js` relies on that to start the first avatar load.
- `onAvatarChanged` can fire twice per edit; handlers must be idempotent (`main.js loadAvatar` uses a generation counter).
- `getEquippedAvatar()` prefers the last event payload over `getEquipped()`; it is reset on every user change so one account's look never leaks into another.
- `showAdScreen(null)` and `showAdScreen('')` both store `''` and hide, but the dedupe compares the raw argument with the stored string: `''` is deduped, `null` never is (each call re-sends `hideScreen()`).
- `registerFeature` records a name as done even when the SDK is absent at that moment; a later-loaded SDK would not get it. `init()` registers `'emotes'` directly and does not use this cache.
- With the SDK, `onReservedAreas` does not call `fn` itself; the first layout comes from the SDK invoking the callback. Its unsubscribe is returned to the caller and is not queued for `teardown`.
- `locateRoom` and `getEmoteClip` use plain `fetch` with no timeout.

## Observations

- Removed 2026-11-14: `submitMatchScores` (scores are reported by the server's `reporters.ts`), `enableParty`, `canCustomize`, `toggleCustomizer`.
- `authState` and `sdk` are exported but only used inside this file.
- **`CLAUDE.md` contradicts the code on multiplayer.** Its "Bloxity integrations" paragraph lists "multiplayer/party/rooms/friends/server stats (single player)" as not applicable, but this file wraps `net.resolveEndpoint`, `party.*`, `game.updateRoom`, `game.playerJoined` / `playerInRoom` and `registerFeature('play_with_friends')`, all called from `net.js` / `online.js`. `BLOXITY_CODE_METADATA.md` is correct (its `notApplicable` list is only gems, rewarded ads, music volume).
- **Screen ads never show.** `BLOXITY_CODE_METADATA.md` describes "`declareScreens` + `screen(lobby / panel / results / gameplay)`", but every `AD_SCREENS` entry is `show: false` and all four types are in `NO_AD_SCREENS`, so `ads.screen()` is unreachable and `showAdScreen` only ever calls `hideScreen()`. The comment in `main.js enterRound` ("this just reports the screen") is inaccurate for the same reason.
- **Respawn timer wording.** `CLAUDE.md` mentions both "a 5 s timer without the SDK" and "the 10 s timer and hearts are bypassed"; the code has only `NET.respawnFallback = 5` and `main.js` passes `hearts: 0` to the HUD.
- **`.env.example` says dev mode "skips" the SDK**, but the script tag in `index.html` is unconditional; `DEV_MODE` only makes `sdk()` ignore it. The checked-in `.env` also contains `VITE_DEV_WORLDS`, which nothing in `src/` reads.
- `displayName()` returns `'Offline'` without the SDK and `main.js` special-cases that string for the join options; a change to the literal must be made in both places.
