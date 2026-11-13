# UI and presentation (`src/game/`)

Covers `hud.js`, `hud.css`, `lobby.js`, `lobby.css`, `lobbyScene.js`, `results.js`, `save.js`, `icons.js`, `mapimage.js`, `characters.js`, `weaponModels.js`. Other files (`main.js`, `config.js`, `online.js`, `match.js`, `net.js`, `controller.js`, `touch.js`, `bloxity.js`) are named only where they feed or call the UI. Written from a full read of the eleven files on 2026-11-14; section 8 lists what the code contradicts or leaves dead.

## 1. Overview

### 1.1 Layers

Everything is plain DOM appended to `document.body` over the WebGL canvas. There is no framework and no shared UI library: each module builds its own root with `innerHTML`, keeps element references in module variables, and exposes a small object. The two stylesheets are imported by their modules (`hud.js` imports `hud.css`, `lobby.js` imports `lobby.css`); `results.js` imports no CSS and relies on `lobby.css`.

| z-index | Root | Owner | Styles | Notes |
| --- | --- | --- | --- | --- |
| (canvas) | `renderer.domElement` | `main.js` | `index.html` | one canvas for both the game scene and the lobby scene |
| 15 | `div.hud` | `hud.js` `initHud` | `hud.css` | shown with `.hud.on` |
| 16 | `div.lobby` | `lobby.js` `initLobby` | `lobby.css` | shown with `.lobby.on`; contains `.lb-modal` (all windows + the queue / vote panel) |
| 16 | `div.results` | `results.js` `showResults` (created lazily) | `lobby.css` (`.results`, `.plate`, `.summary`) | shown with `.results.on` |
| 17 | lock hint ("Click to aim") | `main.js` inline style | inline | desktop only, during `playing` |
| 14 | `div.touch-root.touch-pads` | `touch.js` | `touch.css` | the move / look pads, under the HUD so its buttons take their own taps (see 7.1) |
| 20 | `div.touch-root` | `touch.js` | `touch.css` | FIRE cluster, second FIRE and the joystick's picture; above the HUD |
| 30 | `div.loading` | `lobby.js` `showLoading` (created lazily) | `lobby.css` | the only root with `pointer-events: auto` on itself |
| 30 | FPS readout | `main.js` `fpsEl` | inline | bottom-left; not part of `hud.js` |
| portal | Bloxity toolbar + chat (top-left) | the platform | n/a | never drawn by the game; both UIs move out of its rectangles (`bloxity.onReservedAreas`) |

Common root rules (`.hud`, `.lobby`, `.results`, `.loading`): `position: fixed; inset: 0; display: none; pointer-events: none; user-select: none; font-family: 'Fredoka'`. Interactive children opt back in (`.hud button`, `.lobby button`, `.results button`, plus individual panels such as `.hud-minimap-wrap`, `.hud-prompt`, `.hud-bigmap`, `.chip`, `.lb-modal`). The class `.o` (eight-direction black `text-shadow`, the chunky outlined text) is defined globally in both stylesheets with the same value.

### 1.2 Phases

`G.phase` (`state.js`) is driven by `main.js` (`startMatchFlow`, `syncFlow`, `enterRound`, `toResults`, `nextRound`, `backToLobby`). The UI modules never read the server's phase themselves, except that `hud.update` checks `G.phase === 'playing'` for the crosshair and the spectate panel.

| Phase | Rendered scene | Visible UI | Toggled by |
| --- | --- | --- | --- |
| `boot` | none | `.loading` (`showLoading(true, step, progress)`) | `main.js` top level |
| `lobby` | lobby scene via `lobbyFx` | `.lobby` (top bar, menu, squad list, PLAY, stats, net line, windows) | `lobby.show(true)` at boot end and in `backToLobby` |
| `queue` | lobby scene | `.lobby.queued` + the queue / vote panel in `.lb-modal.q` | `lobby.showQueue(queueInfo())` every frame from `syncFlow`; `lobby.hideQueue()` on leaving the queue |
| `intro` | game scene (orbit flyover) | `.hud.on`, but `hud.update` is not called | `enterRound`: `lobby.hideQueue()`, `lobby.show(false)`, `hud.begin(map.name)`, `hud.show(true)` |
| `countdown` | game scene | HUD updating, `hud.countdown('3'..'FIGHT!')` | `gameFrame` |
| `playing` | game scene | HUD, touch layer, lock hint; spectate panel while dead | `gameFrame` |
| `ending` | game scene, `G.slowmo = 0.3` | HUD (still updating), `hud.announce('VICTORY!' / 'TIME!')` | bus `matchEnd`, `syncFlow` |
| `results` | game scene, camera from `updateResults` | `.results` (banner, plates, then summary + Lobby button) | `toResults`: `hud.show(false)`; `showResults(...)` once the `rewards` message has arrived |

After `results` the server moves to `vote` / `waiting`; `nextRound()` calls `closeMatch()` (which calls `hideResults()` and `hud.show(false)`), sets `G.phase = 'queue'` and shows the lobby with the queue panel again. The Lobby buttons (results screen, spectate panel, "Leave the team") all end in `leaveMatch()` = `send('leave')` + `backToLobby()`.

### 1.3 Where the UI gets its data

| Source | Used by | How |
| --- | --- | --- |
| `G` (`state.js`): `G.player`, `G.actors`, `G.match` (`score`, `duration`, `mvp`, `zone`, `drops`), `G.time`, `G.phase`, `G.spectating`, `G.island` | `hud.js`, `results.js` | read every frame in `hud.update`; `results.js` reads `G.island.spawnAreas` and `G.actors` |
| Event bus `on(type, fn)` (`state.js`) | `hud.js` `wireEvents` | `damage`, `knock`, `elimination`, `loot`, `shot` (emitters: `online.js`, `loot.js`, `combat.js`) |
| `save.js` `profile` + `onProfile(fn)` | `lobby.js` (`refresh`), `results.js` (`rankOf`), `main.js` (`loadoutForActor`), `match.js` (`upgradeLevel`), `controller.js` (`profile.loadout.emote`) | the profile object is mutated in place; listeners are told after every change |
| Server messages (`net.js` `onNet`) | `save.js`: `profile`, `shop`, `joined`; `main.js`: `rewards`, `status`, `left` | `main.js` turns `net.state` into plain objects for the UI: `queueInfo()` for `lobby.showQueue`, `roster()` (`online.js`) for `lobby.setRoster` and `showMates` |
| Callback objects | `initHud(callbacks)`, `initLobby(callbacks)`, `showResults(winner, reward, done)` | the UI never imports `main.js`; every action leaves through a callback (tables in 2.2 and 3.2) |
| `config.js` tables | `hud.js`: `HEALTH`, `ITEMS`, `OPERATIVES`, `TEAMS`, `WEAPONS`; `lobby.js`: `MATCH_MODES`, `OPERATIVES`, `SKINS`, `STORE`, `WEAPONS`, `GAME_TITLE`, `QUALITY_OPTIONS` (`NET` is imported but unused); `save.js`: `OPERATIVES`, `RANKS`, `SKINS`, `START_PROFILE`, `STORE`, `WEAPONS`; `lobbyScene.js`: `RANKS`; `characters.js`: `OUTFITS`, `PLAYER_DIMS`, `RIG_HEIGHT`, `TEAMS`; `weaponModels.js`: `SKINS`; `icons.js`: `WEAPONS`; `mapimage.js`: `FONT_FAMILY` | static lookups |
| `bloxity.js` | `hud.js` and `lobby.js`: `onReservedAreas`; `lobby.js`: `displayName()`, `getPfp()`; `main.js` passes the death handle to `hud.setDeath` | see 2.8 and 3.9 |

Frame order relevant to the UI (`main.js` `frame`): `syncFlow()`; once a second `lobby.setRoster(roster(), net.status)` and `showMates(list)`; then either `lobbyScene.update(dt)` + `lobbyFx.render()` (phases `lobby`, `queue`) or `gameFrame(dt)`, which ends with `hud.update(...)` when the phase is `playing`, `countdown` or `ending`.

## 2. `hud.js`

### 2.1 Exports and the HUD object

The default export is the object `hud`; some of its methods are also named exports. `main.js` imports `hud` and `mapOpen` only.

| Member | Signature | What it does | Called by |
| --- | --- | --- | --- |
| `hud.init` / `initHud` | `(callbacks) -> hud` | builds `div.hud`, fills the `el` map, sets the bolt / heart icons, subscribes to `bloxity.onReservedAreas` and `resize` (`layoutReserved`), wires buttons, creates the damage-number (24) and direction (6) pools, calls `wireEvents()` | `main.js`, once at boot |
| `hud.begin` | `(mapName)` | new match: clears the write cache, sets the map name (score bar and big-map title), empties feed, toasts, pings and waypoint, rebuilds weapons, items, armour and squad rows from `G.player` / `G.actors`, sets `--opc` and the tooltip of the ability button from `OPERATIVES[G.player.operative]`, closes map and scoreboard | `main.js` `enterRound` (after `createMatch` and `reconcile`) |
| `hud.show` | `(on)` | toggles `.hud.on`; turning off also closes the big map and the scoreboard | `enterRound`, `toResults`, `closeMatch` |
| `hud.update` | `(dt, camera, info)` | per-frame refresh of everything (2.3) | `main.js` `gameFrame` |
| `hud.countdown` | `(text)` | sets `.hud-countdown` and restarts its `pop` animation | `gameFrame` during `countdown` |
| `hud.announce` / `announce` | `(big, small = '', ms = 2600)` | centre announcement, auto-hides | `main.js`: mode name on entering a round, "ZONE SHRINKING", "VICTORY!" / "TIME!", bus `announce` |
| `hud.toast` / `toast` | `(text)` | pickup toast (right edge, max 5, 2.6 s) | only internally, from the `loot` event |
| `hud.toggleMap` / `toggleMap` | `(force?)` | opens / closes `.hud-bigmap`, then `cb.onMapOpen(on)` | `controller.js` `bindKeys` (KeyM), minimap tap, map close button / backdrop, `begin`, `show(false)` |
| `mapOpen` (named only) | `() -> boolean` | is the big map open | `main.js` (lock hint) |
| `hud.showBoard` / `showBoard` | `(on)` | scoreboard; rebuilt from `G.actors` each time it is called with `true` | `bindKeys`: Tab keydown / keyup |
| `hud.setMapImage` / `setMapImage` | `(img)` | stores the `renderMapImage` result `{ clean, labelled, bounds, span, size }` | `main.js` at boot |
| `hud.setDeath` | `(handle or null)` | portal death screen mode of the spectate panel (2.7) | `main.js` bus `elimination` handler, `clearDeath` |
| `hud.pressRespawn` | `()` | same as clicking the Respawn button: `cb.onRespawn(death)` | `bindKeys`: KeyG while dead |
| `hud.interactHeld` | boolean | true while a pointer is down on `.hud-prompt` | read by `controller.js` `updateController` (revive hold) |
| `hud.touch` | set by `main.js` | the object returned by `installTouch` (`syncAim()`, `syncCrouch(on)`); not created by `hud.js` | `controller.js`, `main.js` |

Internal helpers worth knowing: `set(key, value, fn)` is the write cache (runs `fn` only when `value` differs from `cache[key]`; `begin` clears it); `h(tag, cls, html)` creates elements; `esc` escapes player names before they go into `innerHTML`; `fmt(seconds)` formats `m:ss`.

### 2.2 Callbacks (`initHud(callbacks)`)

| Key | Fired by | `main.js` handler |
| --- | --- | --- |
| `onSlot(i)` | `.wslot` button `pointerdown` | `selectSlot(G.player, i)` |
| `onReload()` | `.wcard .rl` `pointerdown` | `startReload(G.player)` |
| `onItem(id)` | `.item` button; ids `emote`, `frostWall`, `frag`, `medkit`, `dash` | `useItem(id)` |
| `onUlt()` | `.ult` | `useUlt()` |
| `onLobby()` | `.hud-spectate .lobby` `click` | `leaveMatch()` |
| `onRevive()` | `.hud-spectate .revive` `click` (button is hidden by CSS) | `sfx.deny()` |
| `onRespawn(death)` | `.hud-spectate .respawn` `click`, `hud.pressRespawn()` | respawns via `requestRespawn(true)` when `death.respawn()` is true (portal) or `G.time >= p.respawnAt` (no portal); else `sfx.deny()` |
| `onSpectate(dir)` | `.arrow.prev` / `.arrow.next` | `cycleSpectate(dir)` |
| `onMapOpen(open)` | `toggleMap` | `document.exitPointerLock()` when opening |
| `onInteract()` | `.hud-prompt` `pointerdown` | `controller.js interactPress()` (opens the supplies in reach; the revive hold uses `hud.interactHeld`) |
| `coinsPerElim` | read in the `elimination` handler for the "+N coins" notice | literal `12` |

### 2.3 `hud.update(dt, camera, info)`

`info` as passed by `gameFrame`: `{ scoped, spread, onEnemy, prompt, yaw, hearts, touch }`. `scoped`, `spread` (degrees of cone), `onEnemy` and `prompt` (`{ t1, t2, progress }` or `null`) come from `controller.js` `view`; `yaw` is `camera.js` `getYaw()`; `hearts` is always `0`; `touch` is `touchShown()`.

Returns immediately without `G.player`. String keys built from the displayed values go through `set`, so most DOM writes happen only on change. Written every frame regardless: `.wcard .prog i` width, `.hud-zonetint.on`, `.hud-vignette` opacity, the crosshair gap, damage numbers and direction arcs, the prompt progress ring, and both map canvases (`drawMinimap()` always, `drawBigMap()` while open).

### 2.4 Widgets

All selectors are under `div.hud`. "Built" says when the inner DOM is created: `init` = once in `initHud`, `begin` = per match.

| Widget | Root | Built | Updated by | Notes |
| --- | --- | --- | --- | --- |
| Score bar | `.hud-score` (`.team.blue`, `.mid`, `.team.orange`) | init | `update`: `G.match.score`, `duration - G.time` (`.clock.low` under 30 s), `.mapname` from `begin`, MVP pictures from `G.match.mvp[team]` (`actor.portrait` or `portrait(actor.outfit)`) | moved by `--res-top` and `--score-shift` |
| Zone timer | `.hud-zone` | init | `update`: `G.match.zone.info(G.time)` gives `{ label, time, shrinking }`; prefix "OUTSIDE ZONE" when `zone.outside(player)`; `.warn` when shrinking or outside | `.hud-zonetint.on` (blue edge tint) while outside and not dead |
| Streak banner | `.hud-banner` (`.emb` SVG emblem, `.txt`) | init | `elimination` event when the killer is the player and `streak >= 2`; `STREAK_TEXT` (2 Double, 3 Triple, 4 Rampage, 5 Unstoppable, 6+ Godlike); 2.2 s | emblem colour changes at streak 4 |
| Announcement | `.hud-announce` (`.big`, `.small`) | init | `announce()` | |
| Squad list | `.hud-squad` > `.sq` rows | begin (`buildSquad`: `G.actors` with the player's team at that moment) | `update`: bar = `hp / maxHp` (knocked: `downHp / HEALTH.knockedHp`), row class = `life`, status "HELP!" or respawn seconds | top = `--res-bottom + 8px`; rows are not added or removed mid-round (7.6) |
| Minimap | `.hud-minimap-wrap` > `canvas` 220 x 220 | init | `drawMinimap()` every frame | tap opens the big map; "M" label |
| Big map | `.hud-bigmap` (`.frame` > `canvas` 900 x 900, `.title`, `.close`, `.legend`) | init | `drawBigMap()` while `.on` | tap on the canvas sets the waypoint; tap on the backdrop or the close button closes |
| Waypoint marker | `.hud-ping` | init | `update`: waypoint projected to the screen with the distance in metres; cleared within 4 m | not shown while dead |
| Kill feed | `.hud-feed` > `.kf` | init, emptied in `begin` | `knock` and `elimination` events via `feed(killer, victim, kind, weapon, streak)`; newest first, max 3, fades at 5 s | icon = `weaponIcon(weapon, 'standard', 160, 70)` or the skull / frag SVG; name colours by `teamClass` (`me`, `ally`, `enemy`) |
| Weapon panel | `.hud-weapons`: `.wcard` + one `.wslot` per `G.player.slots` entry | begin (`buildWeapons`) | `update`: active slot, ammo / magazine, reserve on the Reload button, reload countdown (`.reloading`, `.rtime`), progress bar; per-slot total and bar | slots are buttons (`onSlot`); the fists slot has `.fistslot` (hidden under `body.touch-ui`) |
| Health and armour | `.hud-health`: `.armor` (`.pc.helm`, `.pc.vest`), `.hpwrap` (`.hpv`, `.hpbar` > `.lag`, `.fill`, `.shield`), `.ult` | init; armour pieces in `begin` (`buildArmor`) | `update`: hp fraction (knocked: bleed pool), `.hpbar.low` under 30 % or knocked, armour levels and durability vs `HEALTH.armorDurability`, `.shield` width = vest level / 3 | `.lag` trails with a CSS transition |
| Ability diamond | `button.ult` inside `.hud-health` | init | `update`: `p.ult / operativeDef.charge` as `--k`; `.ready` at 100 % | colour `--opc` from the operative; key label Q |
| Items | `.hud-items` > `button.item` x 5 | begin (`buildItems`) | `update`: counts (`.c`), `.empty`, medkit `.busy` while healing, dash cooldown `--cd` + seconds from `ITEMS.dash.cooldown` | order: emote Z, frost wall G, frag T, medkit X, dash F |
| Crosshair | `.hud-cross` (`i.t/.b/.l/.r/.d`) | init | `update`: gap `--s` from `info.spread` and `camera.fov`, min 5 px; `.enemy` (red) when `info.onEnemy`; `.hide` unless alive, not scoped, `playing`, not spectating | |
| Hit marker | `.hud-hit` | init | `damage` event by the player (`head` variant), `elimination` by the player (`kill`, 380 ms) | |
| Damage numbers | `.hud-nums` > 24 pooled `.dmgnum` | init | `damage` event when `attacker === G.player`, the target is someone else and `point` is set; animated in `update` (0.9 s, projected with `camera`) | `.head` variant |
| Damage direction | `.hud-dirs` > 6 pooled `.dmgdir` | init | `damage` event when the player is hit by another actor and not by the zone; rotated in `update` using `info.yaw` (1.2 s) | |
| Low-health vignette | `.hud-vignette` | init | `update`: opacity `max(0, 0.75 - hpFraction * 2.2)` while alive | |
| Interact prompt | `.hud-prompt` (`.key`, `.t1`, `.t2`) | init | `update` from `info.prompt`; `.key` shows "E" or a hand glyph when `info.touch`; ring `--p` = `progress` | doubles as a hold button: sets `hud.interactHeld` |
| Pickup toasts | `.hud-toasts` > `.toast` | init, emptied in `begin` | `loot` event for the player (one toast per item, or "Nothing new") | |
| Kill notice | `.hud-notice` (`.line1`, `.line2`) | init | `knock` / `elimination` by the player ("Knocked X", "Eliminated X" + "+N coins"); 2.2 s | |
| Knocked overlay | `.hud-knocked` (`.bleed i`) | init | `update`: `.on` while `p.life === 'knocked'`; bar = `downHp / HEALTH.knockedHp` | |
| Spectate panel | `.hud-spectate` (`.info .l1/.l2`, `.respawn`, `.who`, `.btns .lobby`, plus hidden `.hearts`, `.revive`) | init | `update`: `.on` while dead and `playing`; spectated name from `G.spectating`; "Eliminated by" from `p.lastKilledBy`; "Respawning in Ns" from `p.respawnAt` | see 2.7 |
| Scope overlay | `.hud-scope` (`.lens`, `.h`, `.v`, `.ticks`, `.dot`) | init | `update`: `.on` = `info.scoped` | `z-index: -1` inside the HUD's stacking context |
| Countdown | `.hud-countdown` | init | `hud.countdown(text)` | |
| Scoreboard | `.hud-board` | init | `showBoard(true)`: two tables (own team first) sorted by eliminations then damage; columns Player, Elims, Ast, Deaths, Damage | a snapshot, not live |
| FPS | not in `hud.js` | | `main.js` `fpsEl`, toggled by the `show_fps` setting | |

### 2.5 Bus events

| Event | Payload fields used | Effect |
| --- | --- | --- |
| `damage` | `target, attacker, amount, head, point, zone` | damage number + hit marker (player is the attacker); direction arc (player is the target, not zone damage) |
| `knock` | `target, attacker, weapon` | kill-feed row; notice when the attacker is the player |
| `elimination` | `target, killer, weapon, head, streak` | kill-feed row (kind `zone`, `frag`, `head` or `elim`); for the player's own: kill marker, notice, streak banner |
| `loot` | `actor, items` | toasts for the player |
| `shot` | `actor` | enemy gunfire ping on the maps (2.5 s, max 24) |

Timers and transient state (`bannerTimer`, `announceTimer`, `noticeTimer`, `hitTimer`, feed / toast `setTimeout`s) are module-level; `begin` does not cancel them.

### 2.6 Minimap and big map

Both draw from the `mapImg` set with `setMapImage`: the minimap crops `mapImg.clean` to a 55 m radius around the viewed actor (`G.spectating || G.player`), north up (the map does not rotate); the big map draws `mapImg.labelled` whole. `drawOverlay(g, W, H, toPx, scale, viewCone)` is shared and paints, in order: the blue tint outside the current zone and its white circle (`G.match.zone.state`), the dashed next circle plus a dashed yellow route line when the player is outside it, unopened airdrops (`G.match.drops()`), gunfire pings, the green waypoint, squadmates (blue arrows, red dot when knocked) and the viewed actor (yellow arrow; a white view cone on the minimap only). World to map: `u = (x - bounds.minX) / span`, `v = (z - bounds.minZ) / span`. The waypoint is local only (not sent to the server).

### 2.7 Death, spectate, respawn

- On the player's `elimination`, `main.js` calls `cycleSpectate(1)` and, when `bloxity.hasDeathScreen()`, `hud.setDeath(bloxity.showDeathScreen())`.
- `setDeath(handle)` stores the handle, toggles `.hud-spectate.portal` (shows the centred `.respawn` button), disables the button and subscribes `handle.onCountdown(n)`: the button shows `n` while `n > 0`, then "RESPAWN (G)" (or "RESPAWN" under `body.touch-ui`) and becomes enabled. `setDeath(null)` unsubscribes and returns to the timer text ("Respawning in Ns" from `p.respawnAt`, which `online.js` sets to `G.time + NET.respawnFallback`).
- Respawn itself is `main.js`: the button / KeyG path goes through `cb.onRespawn`; without the portal `gameFrame` sends `respawn` automatically when the timer is up. The `spawn` bus event calls `clearDeath()` (`hud.setDeath(null)` + `bloxity.hideDeathScreen()`).
- While dead `main.js` hides the touch layer (`setTouchActive(false)`) so it cannot cover the Respawn and Lobby buttons.
- `.hearts` and `.revive` are hidden by CSS in every mode; `info.hearts` is always 0 (leftovers, see 8).

### 2.8 Reserved areas (`layoutReserved`)

`bloxity.onReservedAreas(areas)` delivers rectangles `{ left, top, width, height }` (the SDK's, or `bloxity.js`'s own estimate, which re-fires on `resize`). `layoutReserved()` also runs on window `resize` and sets four custom properties on `div.hud`:

| Variable | Computed as | Consumed by |
| --- | --- | --- |
| `--res-bottom` | lowest bottom edge of the areas whose `left < 40` (toolbar + chat column) | `.hud-squad` `top` |
| `--res-top` | pushed-down offset for the top-centre group: an area that overlaps the score bar's band by 90 px or more, or that reaches past the screen centre, moves the group below it | `.hud-score`, `.hud-zone`, `.hud-banner`, portrait `.hud-right` |
| `--score-shift` | a small overlap (under 90 px including an 8 px gap, area ending left of centre) slides the score bar right by that amount instead | `.hud-score`, `.hud-zone` `left` |
| `--res-rtop` | lowest bottom edge of areas reaching into the right 260 px | `.hud-right` `top` |

The score bar's width and height are re-derived in JS from the same `clamp()` formulas as the CSS (`sw`, `sh`); change both together.

### 2.9 `hud.css`

Structure, top to bottom: root + `.o`; score bar and zone timer; banners; squad list; right column (minimap, weapon card, slots); kill feed; health / armour / ability; items (with the first `.touch-ui` overrides); crosshair, hit marker, damage numbers / arcs, vignettes; prompt, toasts, notice; knocked, spectate, big buttons (`.bigbtn`, `.arrow`), countdown; scope; big map and scoreboard; waypoint; `@keyframes pulse`; media queries; touch block; portrait block.

Custom properties on `.hud`:

| Variable | Default | Meaning |
| --- | --- | --- |
| `--safe-l`, `--safe-r`, `--safe-t`, `--safe-b` | `env(safe-area-inset-*, 0px)` | notch insets; every edge-anchored widget adds them |
| `--pad` | `clamp(8px, 1.6vmin, 16px)` | edge padding |
| `--res-bottom` | `70px` | set from JS (2.8) |
| `--res-top`, `--score-shift` | `0px` | set from JS |
| `--res-rtop` | not declared; used as `var(--res-rtop, 0px)` | set from JS |
| `--blue`, `--orange`, `--panel`, `--panel-b` | colours | team colours, glass panel fill and border |

Per-widget variables written from JS: `--s` (`.hud-cross`, crosshair gap), `--k` and `--opc` (`.ult`, charge and operative colour), `--cd` (`.item .cd`, dash cooldown), `--p` (`.hud-prompt .key`, hold progress).

Sizing is `clamp(min, N vmin, max)` almost everywhere, so the HUD scales with the smaller screen dimension. Desktop layout: score top-centre, squad top-left under the platform chat, minimap + weapons top-right, items bottom-right, health bottom-centre, feed above the health bar, toasts at the right edge at 52 %.

`body.touch-ui` (set by `touch.js` `setVisible`, i.e. on coarse-pointer devices or after a finger touches the screen; a mouse `pointerdown` removes it): items move to a centred row above the bottom edge (a left-edge column in portrait), key labels (`.item .k`, `.wslot .k`, `.wname`) are hidden, the minimap, weapon card and slots shrink, the fists slot is hidden, the kill feed moves up.

Media queries:

| Query | Effect |
| --- | --- |
| `(max-height: 500px)` | `.hud-spectate .info` lower (30 %) |
| `(max-aspect-ratio: 4/3)` | big-map legend moves to the bottom |
| `(max-width: 560px)` | scoreboard becomes one column |
| `(max-height: 460px)` | narrower weapons block; only the first 3 squad rows |
| `(orientation: portrait) and (max-width: 600px)` | squad 128 px wide, health 62vw (both then overridden by the portrait block below) |
| `(max-width: 980px)` + `body:not(.touch-ui)` | health bar slides to `left: 40%` so the item row fits beside it |
| `(max-height: 520px)` + `.touch-ui` | squad rows shrink to picture + health bar chips (no name / status), max 4 rows |
| `(orientation: portrait)` | right column starts below the score bar (`max(--res-rtop, --res-top)` + offset); squad rows are the same chips; health sits above the joystick (`bottom: clamp(190px, 27vh, 230px)`), ability button hangs off its right end; feed above the health bar; toasts at 40 %; touch items in a column on the left edge at 42 % |

## 3. `lobby.js`

### 3.1 Exports

| Export | Signature | Notes |
| --- | --- | --- |
| `initLobby` | `(callbacks) -> lobby` | builds `div.lobby`, wires the static buttons, subscribes `bloxity.onReservedAreas` and `onProfile(refresh)` |
| `close` | `()` | closes whatever is in `.lb-modal` (also `lobby.close`); no outside caller |
| `showLoading` | `(on, step = '', progress = 0)` | the boot loading screen (3.8) |
| default `lobby` | object | `show(on)`, `refresh()`, `close()`, `showQueue(info)`, `hideQueue()`, `setRoster(list, status)`, `status(text)`, `squad()` |

| `lobby` method | What it does | Called by |
| --- | --- | --- |
| `show(on)` | toggles `.lobby.on`; on: `refresh()`; off: closes an open window | `main.js` boot, `enterRound`, `nextRound`, `backToLobby` |
| `refresh()` | repaints the top bar, mode chip and stats line from `profile`, calls `cb.onRank(rankIndex)`, and re-renders the open window (unless it is the queue panel) | `onProfile`, `show(true)`, `main.js` on sign-in change |
| `showQueue(info)` | queue / vote panel and the queued PLAY button (3.6) | `startMatchFlow`, `syncFlow` every frame in `queue`, `nextRound` |
| `hideQueue()` | closes the panel and resets the queued state and button | `enterRound`, `backToLobby` |
| `setRoster(list, status)` | squad list (`.lb-squad`, other players only, first 5 + "+N more") and the net line | `main.js` `frame`, once a second |
| `status(text)` | overrides the net line text (`''` returns to the automatic text) | `main.js` connect / reconnect paths |
| `squad()` | other players in the room | no caller |

### 3.2 Callbacks (`initLobby(callbacks)`)

| Key | Fired by | `main.js` handler |
| --- | --- | --- |
| `onPlay()` | PLAY button when not queued | `startMatchFlow()` |
| `onLeaveQueue()` | `.lb-leave` ("Leave the team") | `leaveMatch()` |
| `onVote(i)` | a map card | `send('vote', { map: i })` |
| `onRank(index)` | every `refresh()` | `lobbyScene.setRank(index)` |
| `onWindow(open)` | `open()`, `buildQueue()`, `close()` | `setDucked(open)`; in `lobby` phase `bloxity.showAdScreen('panel' or 'lobby')` |
| `onLoadout()` | applying an already owned skin | `lobbyScene.setPlayerAvatar(avatar, loadoutForActor())` |
| `onEmote(id)` | picking an emote in Inventory | not supplied (no-op) |
| `getQuality()`, `setQuality(q)`, `getAutoTier()` | Settings graphics row | `qualityChoice()`; stores `ffz.quality`, toggles the governor, `applyGraphics`; `governor.rung.tier` |
| `getSensitivity()`, `setSensitivity(v)` | Settings slider | `camera.js` getters / setters |
| `mapShots()`, `mapThumb()` | vote cards | arrays / data URL rendered at boot with `renderMapShot` / from `mapImg.clean` |

### 3.3 Static layout (children of `div.lobby`)

| Element | Content | Behaviour |
| --- | --- | --- |
| `.lb-top` | `.chip.profile` (picture + name from `bloxity.getPfp()` / `displayName()`, fallback `portrait(...)`), `.chip.coins`, `.chip.rank` (shield SVG tinted with the rank colour, name, progress bar; tooltip with RP to the next rank), spacer, `.iconbtn.settings` | profile chip opens Inventory; gear opens Settings; `.compact` hides the profile chip and the rank text |
| `.lb-menu` | four `.menubtn[data-open]`: `weapons` (gold), `store`, `characters`, `inventory` | `open(kind)` |
| `.lb-squad` | `.mate` rows from `setRoster` | status text: "In a round" (`inMatch` and `team`), "Ready" (`inMatch`), "In the lobby"; empty-room and connecting placeholders |
| `.lb-play` | `.lb-mode` (team-size badge, name, description from `MATCH_MODES[profile.mode]`), `.playbtn` | mode chip opens the mode window; PLAY see 3.6 |
| `.lb-stats` | "Matches / Wins / Eliminations / Best" from `profile.stats` | hidden in portrait, short landscape and while queued |
| `.lb-leave` | "Leave the team" | only visible under `.lobby.queued` |
| `.lb-net` | connection line | text from `paintNet()`: explicit `status(text)`, else by `net.status` (`online`: "Online - N players in this server", `connecting`, `offline`); `.warn` unless online |
| `.lb-modal` | host for windows and the queue panel | backdrop `pointerdown` closes unless `modal.dataset.locked` |

Every `button` in the root gets a `pointerenter` handler that plays `sfx.hover()` (buttons created later inside windows do not).

### 3.4 Windows and navigation

`open(kind, opt)` records `current = { kind, opt }`, calls `cb.onWindow(true)` and dispatches to a window function; each one builds HTML and calls `frame(title, bodyHtml, tabs, activeTab)`, which replaces `.lb-modal`'s content with a `.win` (`.win-h` gold header with title, coin balance and the red `.win-x`; optional `.tabs`; scrolling `.win-b`) and adds `.lb-modal.on`. There is no window stack: opening a window replaces the previous one. `reopen()` re-renders `current`; it is how the UI repaints after a purchase and after every `profile` change (`refresh`). `close()` clears the modal, removes `on` / `q` and the `locked` flag, and calls `cb.onWindow(false)`.

| `kind` | Function | Content | Actions |
| --- | --- | --- | --- |
| `weapons` (tab `weapons`) | `weaponsWindow` | a card per `WEAPONS` entry with `slot` `primary` or `secondary`: icon (`weaponIcon(id, skinFor(id))`), name, kind, four stat bars scaled by `statLimits` (`damage * pellets` / 165, `1 / interval` / 14, `range` / 400, `mag` / 60) | `data-buy` -> `buyWeapon`; `data-equip` -> `equipWeapon`; equipped cards get the `PRIMARY` / `SECONDARY` tag |
| `weapons` (tab `skins`) | `skinsWindow` | pills for the owned guns (`skinWeapon`, default the equipped primary), a card per `SKINS` entry previewed on that gun | `data-buy` -> `buySkin` then `equipSkin(skinWeapon, id)`; `data-equip` -> `equipSkin` + `cb.onLoadout()` |
| `store` | `storeWindow` | a card per `STORE` entry; icon from `STORE_ICON[item.icon]` (`medkit`, `wall`, `frag`, `armor`, `emote`; fallback coin); upgrades show level pips and "Maxed", owned emotes "Owned" | `data-buy` -> `buyStoreItem` |
| `characters` | `charactersWindow` | a card per `OPERATIVES` entry: initial on a colour tile (`.opface`), role, ability, description | `data-buy` -> `buyOperative` then `equipOperative`; `data-equip` -> `equipOperative` |
| `inventory` | `inventoryWindow` | loadout (two guns with skin name, operative; "Change" jumps to the shop via `data-go`), emote pills (`profile.owned.emotes`), supply upgrade levels, career stats (rank, RP, matches, wins, eliminations, damage, best, K/D) | `data-emote` -> `equipEmote` + `cb.onEmote` |
| `settings` | `settingsWindow` | Sound (range + Mute pill), Graphics (`QUALITY_OPTIONS` pills + note; Auto shows the running tier), Look sensitivity (range), the key list, the phone hint and the save notice (`account.saved`) | see 3.7 |
| `mode` | `modeWindow` | a card per `MATCH_MODES` entry (team size, description, minutes, score to win) | `data-mode` -> `setMode(id)`, then `close()` |

Tabs exist only in the Weapons Store; `wireTabs` sets `current = { kind: 'weapons', opt: tab }` so `reopen()` returns to the same tab.

Button states (`.buy` + modifier): `price` (affordable, gold), `cant` (not enough coins, grey; still clickable, the purchase then fails), `owned` (blue: Equip / Apply / Select / Change), `equipped` (dark with gold border, disabled).

### 3.5 Purchase and equip flow

1. A click calls a `save.js` function (`buyWeapon`, `buySkin`, `buyOperative`, `buyStoreItem`, `equip*`, `setMode`).
2. `purchase(kind, id, price, apply)` refuses (returns `false`) when not `online()`, the profile has not loaded (`account.loaded`), or `profile.coins < price`. Otherwise it subtracts the price, applies the ownership change locally, sends `buy { kind, id }` and notifies listeners; it returns `true`.
3. `lobby.js` `bought(ok)`: `true` plays `sfx.purchase()` and `reopen()`s; `false` plays `sfx.deny()` and, when the cause is the connection, shows "The shop needs the game server" on the net line.
4. The `onProfile` notification also runs `refresh()`, which repaints the top bar and re-renders the open window.
5. The server answers `shop { ok, kind, id, error }` and, on success, a fresh `profile`, which replaces the local copy. On `ok: false` `save.js` sends `getProfile`, and the returned `profile` undoes the optimistic change.
6. Equips (`equip(kind, id, apply, extra)`) are applied and sent as `equip { kind, id, ...extra }` with no local preconditions beyond ownership; a refusal comes back as `shop { ok: false }` and resyncs the same way.

Skins and operatives are bought-and-equipped in one click (two messages: `buy`, then `equip`). The 3D platform is refreshed only by `cb.onLoadout()` in the "Apply skin" path; other loadout changes reach `lobbyScene` the next time `main.js` rebuilds the player actor.

### 3.6 PLAY button, queue panel, map vote

`main.js` `startMatchFlow` sends `play { mode: profile.mode }`, sets `G.phase = 'queue'` and from then on calls `lobby.showQueue(info)` every frame with `info = { phase, left, ready, need, votes, voters, mine, maps }` (`queueInfo()`; `votes` is not read by the lobby).

- `queueKindOf(info.phase)`: `'vote'` -> `vote`, `'waiting'` -> `wait`, anything else -> `busy` (a round is running or finishing).
- `setQueued(true, kind)` adds `.lobby.queued` and relabels the PLAY button: "Map voting...", "Finding players..." or "Next round...". While queued a click on it calls `reopenQueue()` instead of `cb.onPlay`.
- `buildQueue(kind, info)` builds the panel once per kind inside `.lb-modal.on.q` with `dataset.locked` (backdrop taps do not close it): `div.mv` with the inline SVG frame (`FRAME_SVG`), the hex pattern (`--hex`), `.mv-time`, `.mv-t` (title per kind) and either `.mv-maps` (three `button.mv-card` with `.art` background from `cb.mapShots()[i]`, falling back to `cb.mapThumb()`; `.voters`; `.nm`) or `.mv-wait` (spinner, `.big`, `.sub`).
- `patchQueue(info)` updates in place: the clock (vote only), `.sel` on the player's card, voter heads (up to 4 + "+N"; `pfp` or a generated `portrait`), or the waiting texts ("R / N ready", how many more players are needed).
- Clicking a card patches `mine` locally at once and calls `cb.onVote(i)`.
- The X (`.mv-x`) calls `close()`. Because `close()` sets `queueHidden` whenever `.lobby.queued` is present, closing the panel, or any shop window opened while queued, keeps the panel hidden until a new vote starts or the player presses the PLAY button. An open shop window also suppresses the panel (`otherWindow`).
- `hideQueue()` resets `queueState`, `queuedPhase`, `queueHidden`, `lastInfo` and restores "PLAY".

### 3.7 Settings rows

| Row | Control | Effect | Persistence |
| --- | --- | --- | --- |
| Sound | range 0..1 step 0.05 | `setVolume(v)` (`audio/index.js`) | `localStorage['ffz.volume']` (read at boot by `main.js`) |
| Sound | Mute pill | `setMuted(!isMuted())`, then the window re-renders | by the audio module (`AUDIO.storageKey`) |
| Graphics | one pill per `QUALITY_OPTIONS` | `cb.setQuality(q)`, re-render | `localStorage['ffz.quality']` (written by `main.js`) |
| Look sensitivity | range 0.2..3 step 0.05 | `cb.setSensitivity(v)` | not stored by the lobby |

The portal's own settings (`SETTINGS` in `config.js`, applied by `main.js` `applySetting`) are separate from this window.

### 3.8 Loading screen and notifications

`showLoading(on, step, progress)` lazily creates `div.loading` (title from `GAME_TITLE` with "Zone" highlighted, progress bar, step text, a random entry of `TIPS` chosen once per showing). `main.js` calls it between boot stages and `showLoading(false)` before the first frame.

The lobby has no toast or badge system. Its only message channels are the net line (`lobby.status`, `setRoster`), the squad list and the denial sound. Friend-join notifications are portal notifications raised by `online.js` `trackRoster`, not lobby DOM.

### 3.9 `lobby.css`

Structure: shared root rules for `.lobby`, `.results`, `.loading` + `.o`; top bar (`.lb-top`, `.chip`, `.iconbtn`); left menu (`.lb-menu`, `.menubtn`); right side (`.lb-squad`, `.lb-play`, `.lb-mode`, `.playbtn`); `.lb-stats`, `.lb-net`; modal and window parts (`.lb-modal`, `.win`, `.win-h`, `.win-x`, `.tabs`, `.tab`, `.win-b`, `.grid`, `.card`, `.stat`, `.buy`, `.pips`, `.tag`, `.opface`, `.row`, `.pillsel`, `.pill`, `.qnote`, `.section-t`, `.kv`, `.setting`, `.keys`, `.hint`); map vote (`.mv*`); queued state (`.lobby.queued ...`, `.lb-leave`); loading; results (`.results .banner`, `.plate`, `.summary`, `.lobbybtn`); two closing media queries.

| Variable | Default | Meaning |
| --- | --- | --- |
| `--safe-l/r/t/b` | `env(safe-area-inset-*, 0px)` | notch insets |
| `--pad` | `clamp(8px, 1.8vmin, 18px)` | edge padding |
| `--res-right` | `0px` | right edge of the platform toolbar; `.lb-top` starts at `--res-right + 10px` |
| `--res-bottom` | `0px` | bottom of toolbar + chat; `.lb-menu` `top: max(--res-bottom + 10px, 20vh)` |
| `--gold` | `#ffcf3d` | accent |
| `--hex` | set inline on `.mv` | the vote plate's hex pattern image |

Reserved areas (`initLobby`): for areas with `top < 20` (the toolbar) take the rightmost edge `right`; for areas with `left < 40` take the lowest edge `bottom`. With `room = innerWidth - right`: `.lb-top.compact` when `room < 440`; when `room < 230` the bar drops under the toolbar and chat (`--res-right: 0px`, inline `top = bottom + 6px`), otherwise `--res-right = right`. `--res-bottom = bottom` always. The lobby adds no `resize` listener of its own; it depends on `onReservedAreas` firing again.

Responsive rules:

- Sizes are `clamp(..., vmin, ...)`; window grids are `repeat(auto-fill, minmax(clamp(150px, 26vmin, 220px), 1fr))`; `.win` is `min(96vw, 1040px)` by `max-height: min(92vh, 760px)` with a scrolling body.
- The vote panel `.mv` is a size container (`container-type: inline-size`): width `min(94vw, 900px, (100dvh - safe insets - 28px) * 1.66)`, and everything inside uses `cqw` with pixel floors (`max(4.2cqw, 17px)` etc.), so it scales like a picture and always fits the height.
- `(orientation: portrait)`: `.lb-leave` moves into the PLAY column above the mode chip; the queued net line is hidden; `.summary` is centred; `.lb-menu` is 46vw wide; `.lb-squad` and `.lb-stats` are hidden.
- `(max-height: 460px)`: the menu becomes a 2 x 2 grid in the bottom-left corner with shorter buttons; `.lb-stats` hidden.
- Touch: buttons use `touch-action: manipulation`; there are no `.touch-ui` rules in this file. All lobby handlers are `click` or `pointerdown`; hover effects (`.menubtn:hover`, `.playbtn:hover`, `.mv-card:hover`, the hover sound) are cosmetic only.

## 4. `save.js`

The profile lives on the server (per verified Bloxity account); this module holds the last copy and sends every change request. No `localStorage` is used here. (UI-related keys elsewhere: `ffz.volume` in `lobby.js` / `main.js`, `ffz.quality` in `main.js`.)

### 4.1 Profile shape (`START_PROFILE` in `config.js`, mirrored in the backend `catalog.ts`)

| Field | Type | Start value | Meaning |
| --- | --- | --- | --- |
| `coins` | number | 600 | the only currency |
| `rp` | number | 0 | rank points; `rankOf` maps them onto `RANKS` |
| `owned.weapons` | string[] | `striker`, `viper`, `knife`, `fists` | `WEAPONS` ids |
| `owned.skins` | string[] | `standard` | `SKINS` ids; a skin is owned per account and can be applied to any gun |
| `owned.operatives` | string[] | `rook` | `OPERATIVES` ids |
| `owned.emotes` | string[] | `wave` | emote names (`STORE` items of type `emote` carry `emote`) |
| `loadout.primary`, `loadout.secondary` | string | `striker`, `viper` | equipped guns |
| `loadout.operative` | string | `rook` | |
| `loadout.emote` | string | `wave` | played by Z (`controller.js`) |
| `loadout.skin` | `{ [weaponId]: skinId }` | both `standard` | read with `skinFor(weaponId)` |
| `upgrades` | `{ [storeId]: level }` | `{}` | read with `upgradeLevel(id)`; `match.js` uses `walls`, `frags`, `medkits` |
| `stats` | `{ matches, wins, eliminations, deaths, damage, best }` | zeros | career totals shown in the lobby |
| `mode` | string | `clash` | `MATCH_MODES` id sent with `play` |

### 4.2 Exports

| Export | Signature | Notes |
| --- | --- | --- |
| `profile` | object | a single long-lived object; `replace(next)` empties it and refills it (`START_PROFILE` defaults, then the server's copy), so references stay valid |
| `account` | `{ loaded, saved }` | `loaded`: a `profile` message has arrived; `saved`: the server stores progress for this identity |
| `onProfile` | `(fn) -> unsubscribe` | `fn(profile)` after every local or server change |
| `rankOf` | `(rp = profile.rp) -> { index, name, rp, color, next, progress }` | `next` is the next `RANKS` entry or `undefined`; `progress` 0..1 |
| `owns` | `(kind, id)` | `kind` is the key in `profile.owned`: `weapons`, `skins`, `operatives`, `emotes` |
| `upgradeLevel` | `(id) -> number` | |
| `buyWeapon`, `buySkin`, `buyOperative`, `buyStoreItem` | `(id) -> boolean` | message kinds `weapon`, `skin`, `operative`, `store`; `false` = not sent |
| `equipWeapon`, `equipOperative`, `equipEmote` | `(id)` | message kinds `weapon`, `operative`, `emote`; `equipWeapon` picks the loadout slot from `WEAPONS[id].slot` |
| `equipSkin` | `(weaponId, skinId)` | `equip { kind: 'skin', id: skinId, weapon: weaponId }` |
| `setMode` | `(id)` | `equip { kind: 'mode', id }`; no local validation |
| `skinFor` | `(weaponId) -> skinId` | defaults to `standard` |

### 4.3 Server messages

| Message | Direction | Handling |
| --- | --- | --- |
| `joined` (local `net.js` event) | | sends `getProfile` |
| `profile { profile, saved }` | in | sets `account.loaded = true`, `account.saved`, `replace(msg.profile)` |
| `shop { ok, ... }` | in | when `ok` is false, sends `getProfile` |
| `buy { kind, id }` | out | from `purchase` |
| `equip { kind, id, weapon? }` | out | from `equip` |
| `getProfile` | out | resync |

Prices used for the local affordability check come from `config.js`; the server decides with its own table, so a mismatch shows up as an optimistic purchase that is rolled back.

## 5. Other modules

### 5.1 `lobbyScene.js`

`createLobbyScene()` builds a self-contained `Scene` (background and fog `#0b1222`) and `PerspectiveCamera`, and returns `{ scene, camera, rebuildSquad, setMateAvatar, setPlayerAvatar, playerActor (getter), releasePlayer, setRank, resize, update }`. It creates no renderer and no composer: `main.js` builds a second post-processing chain for it (`lobbyFx = createPostFx(renderer, lobbyScene.scene, lobbyScene.camera)`) and renders it in the `lobby` and `queue` phases.

- Set: hex floor (two canvas textures, emissive seams), a U of ribbed wall panels with gold / cyan neon strips, a bay window showing a painted sky / sea / island picture, five ceiling arches with lamps, crates, two weapon racks (bars only), hemisphere + ambient + shadow-casting key + rim + warm point light.
- Squad platform: a hexagonal base with a gold rim and an inner disc with a pulsing cyan ring. The player stands at `(0, 0.32, 0.4)`; three mate spots `[x, z, yaw]`: `[-2.1, -0.8, 0.3]`, `[2.1, -0.8, -0.3]`, `[3.7, -2.5, -0.45]`.
- Rank shield: an extruded shield with a star on a pedestal at the left, spinning and bobbing; `setRank(index)` tints it with `RANKS[index].color`.
- `rebuildSquad(loadout, nextMates = mates)`: disposes the mate actors and creates one `Actor` per mate (`{ outfit, primary, secondary }`, at most as many as there are spots) as a blocky stand-in (`buildCharacter` inside `Actor`) holding its weapons with standard skins; then re-creates the player actor if an avatar is known.
- `setMateAvatar(i, root)`: swaps a built Bloxity look onto spot `i`, refreshes the held weapon and frees the previous look with `disposeLook`.
- `setPlayerAvatar(avatar, loadout)`: disposes the previous player `Actor` and creates a new one wearing `avatar` (the avatar itself survives: `Actor.dispose` keeps the player's avatar). `releasePlayer()` drops the actor so the match can use the avatar.
- `resize(w, h)`: aspect; when `w / h < 1.2` the camera steps back (`z` 11, `y` 2.3, fov 52) so the squad still fits. `update(dt)`: camera sway, shield, ring pulse, `updateModel` for every actor.

`showMates(list)` and `resetMates()` are in `main.js`, not here. `showMates` (called once a second with the roster, only in `lobby` / `queue`) takes the first three other players, calls `rebuildSquad` only when the set of `id:primary:secondary` changes, then streams each mate's Bloxity look (`streamLook` -> `setMateAvatar`) when its look key changed, and prewarms the looks of everyone beyond the third. `resetMates()` clears that bookkeeping after `main.js` has rebuilt the platform (`nextRound`, `backToLobby`) so every spot is dressed again. With `DEV_MODE` the mates stay blocky.

### 5.2 `results.js`

| Export | Signature | Notes |
| --- | --- | --- |
| `showResults` | `(winner, reward, done)` | builds the screen and stages the lineup |
| `updateResults` | `(dt, camera) -> { from, lookAt }` | per frame in `results`; the pose goes to `updateCamera(..., { mode: 'look' })` |
| `hideResults` | `()` | removes `.on`, clears the lineup |

`reward` is the server's `rewards` message; fields read: `won`, `eliminations`, `damage`, `coins`, `rp`, `knocks`, `assists`, `headshots`, `deaths`, `score.blue`, `score.orange`, `mvp`.

- DOM: `.banner` ("VICTORY" with `.win`, or "DEFEAT"), `.plates` (one `.plate` per lineup member: name, eliminations, damage; "MVP" tag on the first), `.summary` (eliminations, damage, coins with the coin SVG, rank points with `rankOf().name`, a line of knocks / assists / headshots / deaths, the final score and "MATCH MVP"), `button.lobbybtn`.
- Stage: `G.island.spawnAreas[winner]`; `topPlayers(winner, 3)` (`match.js`) stand in a line facing the island centre, everyone else gets `hidden = true`; they are set alive at full health with emotes `cheer`, `flex`, `dance`; if the local player is in the lineup its physics body is moved too (`resetPlayer`, `syncYawToPlayer`).
- Timeline: plates fade in from 0.8 s (0.3 s apart) and follow their actor's projected position; the summary and the Lobby button appear at 4.2 s (`revealSummary`, with `sfx.coins()`); the camera pushes in slowly over 6 s.
- Buttons: only "Lobby", which hides the screen and calls `done` (`main.js` passes `leaveMatch`, i.e. `send('leave')` and back to the menus). Doing nothing keeps the player in the room: when the server starts the next vote, `nextRound()` hides the results.

### 5.3 `mapimage.js`

| Export | Signature | Returns |
| --- | --- | --- |
| `renderMapImage` | `(renderer, scene, lighting, bounds, landmarks = [], size = 1024)` | `{ clean, labelled, bounds, span, size }` (two canvases) |
| `renderMapShot` | `(renderer, scene, lighting, map, groundHeight, w = 360, h = 416)` | JPEG data URL |

Both render on the main canvas into a scissored viewport and copy the pixels out immediately with `drawImage` (no render target, no post-processing), then restore the viewport.

- `renderMapImage`: orthographic camera straight down over the square `bounds` (north, -Z, at the top); fog off and the sun's shadow camera widened to the whole island for the render, then restored. `clean` feeds the minimap; `labelled` adds an 8 x 8 grid (columns A-H, rows 1-8) and the `landmarks` names and feeds the big map. The on-screen render size is `min(innerWidth, innerHeight)` CSS pixels times the pixel ratio, scaled to `size`.
- `renderMapShot`: perspective camera at `map.focus + map.shot[0..2]` (height above the ground at the focus), fov `map.shot[3]`, looking at the focus; it uses whatever lighting mood is active, so `main.js` calls `setMood(m)` before each of the `MAPS` and restores `MAPS[0]` afterwards. The results are the vote card pictures (`cb.mapShots()`).

### 5.4 `icons.js`

| Export | Signature | Notes |
| --- | --- | --- |
| `weaponIcon` | `(id, skin = 'standard', w = 256, h = 110) -> data URL` | renders `buildWeapon(WEAPONS[id].model, skin)` side-on; `model: 'fists'` returns the fist SVG; cached by `id:skin:WxH` |
| `itemIcon` | `(kind, size = 96) -> data URL` | `frag`, `frost` (the ice grenade), `medkit`; no caller |
| `svgData` | `(svg) -> data URL` | for `img.src` / CSS |
| `SVG` | object of SVG strings | below |

PNG rendering uses its own small `WebGLRenderer` (a second WebGL context: alpha, antialias, `preserveDrawingBuffer`, ACES tone mapping), one scene with three lights and an orthographic camera fitted to the model's bounding box (`snapshot`). If the context cannot be created the icon URL is an empty string. Sizes in use: 256 x 110 (shop cards, weapon card) and 160 x 70 (HUD slots, kill feed).

`SVG` icon names: `heart`, `coin`, `helmet`, `vest`, `wall`, `frag`, `medkit`, `dash`, `emote`, `fist`, `skull`, `head`, `shield`, `bolt`, `eye`, `map`, `gear`. Most have baked colours; `shield` and `gear` use `currentColor` (only meaningful when inlined as markup, as the lobby does with `gear`). Unused: `head`, `shield`, `eye`, `map`.

### 5.5 `characters.js`

The blocky stand-in character: rigid boxes parented to bones with the same names and bind positions as the Bloxity base rig (`Rig1`, `Spine1`, `Spine2`, `Neck_Offset` / `Neck1`, `ArmR_Offset` / `ArmR1` / `ArmR2`, `ArmL...`, `LegR_Offset` / `LegR1` / `LegR2`, `LegL...`), so the shared animator drives it. There are no bots any more; it is still used for: the local player until the Bloxity rig loads (`main.js` `buildCharacter(playerOutfit, 'blue')`), any `Actor` created without an `avatar` (remote players before their look arrives, lobby mates), and 2D portraits wherever a player has no profile picture.

| Export | Signature | Notes |
| --- | --- | --- |
| `randomOutfit` | `(rand = Math.random) -> outfit` | `online.js` `outfitForId` passes a generator seeded by the session id so a player's stand-in is stable |
| `buildCharacter` | `(outfit, team = null) -> Group` | `root.nodes` (name -> node), `root.userData.mats`, scaled by `PLAYER_DIMS.height / RIG_HEIGHT`; `team` colours the armband with `TEAMS[team].tag` |
| `portrait` | `(outfit, size = 96) -> PNG data URL` | 2D head + hair / hat + shirt strip; cached by outfit JSON + size |
| `paintFace` | `(ctx, outfit, x, y, s)` | used by the face texture and `portrait`; no outside caller |
| `setFlash` | `(root, k, color = '#ff3030')` | hit flash through `userData.mats` (`actor.js`) |
| `setOpacity` | `(root, opacity)` | cloak / fade (`actor.js`) |

Outfit fields: `skin`, `shirt`, `shirt2`, `shirtStyle`, `pants`, `hair`, `hairStyle`, `hat`, `hatColor`, `shoes`, `accent`, `face`, `glasses`, `backpack`, `mask`; colours come from `OUTFITS`.

| Option | Values |
| --- | --- |
| `shirtStyle` | `jacket`, `hoodie`, `vest`, `tee`, `suit`, `tactical`, `striped` (`tee` and `vest` have bare forearms) |
| `face` | `smile`, `grin`, `smirk`, `serious`, `happy`, `cool`, `wink` (`cool` or `glasses` draws sunglasses; `mask` covers the mouth) |
| `hairStyle` | `short`, `spiky`, `long`, `bowl`, `bun`, `mohawk`, `curly`, `none` (not built under a `helmet` or `beanie`) |
| `hat` | `none` (weighted), `cap`, `beanie`, `helmet`, `bandana`, `headphones` |

After building, the boxes of each bone are merged into one vertex-coloured mesh (`mergeChildren` from `merge.js`), leaving about 12 draw calls: ten bone meshes plus the textured shirt-front and face planes.

### 5.6 `weaponModels.js`

Local frame of every model: grip at the origin, barrel along +Z, up +Y, metres.

| Export | Signature | Notes |
| --- | --- | --- |
| `buildWeapon` | `(modelId, skinId = 'standard') -> Group` | `userData.muzzle`, `userData.ejector` (marker `Object3D`s) and `userData.length`; an unknown id (including `fists`) returns an empty group with markers |
| `skinMaterials` | `(skinId) -> { body, accent, furniture, steel, dark, lens, glow, blade }` | cached per skin and shared by every weapon; no outside caller |
| `buildGrenade` | `(kind = 'frag')` | `'frag'`, anything else builds the ice canister; used by `actor.js`, `items.js`, `icons.js` |
| `buildMedkit` | `()` | only referenced by `itemIcon` |

Model id mapping: `WEAPONS[id].model` selects the builder in `BUILDERS`.

| `model` | Builder | `WEAPONS` id | Distinguishing parts |
| --- | --- | --- | --- |
| `ar` | `buildAR` | `striker` | vented handguard, curved magazine, stock, red dot |
| `smg` | `buildSMG` | `viper` | short handguard, fat muzzle, straight magazine, folding stock |
| `pistol` | `buildPistol` | `hornet` | slide with serrations |
| `shotgun` | `buildShotgun` | `thunder` | barrel over tube magazine, pump, side shells |
| `lmg` | `buildLMG` | `tempest` | feed cover, finned barrel, box magazine with belt, bipod, red dot |
| `dmr` | `buildDMR` | `marksman` | long handguard, scope |
| `sniper` | `buildSniper` | `hawk` | bolt handle, long barrel with brake, thumbhole stock, bipod, large scope |
| `knife` | `buildKnife` | `knife` | handle, guard, blade |
| `fists` | none | `fists` | empty group |

Shared part helpers: `rail` (notched strip), `scope`, `redDot`; geometry is cached by dimensions (`box`, `cyl`).

Skins: a `SKINS` entry supplies `body`, `accent`, `furniture` colours and optional `camo` (array of colours: base first, the rest as blobs in a generated texture), `glow` (adds an emissive strip on every model) and `metal` (shinier body and accent). Current ids: `standard`, `desert`, `jungle`, `arctic`, `crimson`, `neon`, `gold`.

In a match the models are not used directly: `actor.js` `weaponMesh` bakes each `model:skin` once (`bakeWeapon`), clones it per actor and scales it by `WEAPON_SCALE`.

## 6. Recipes

### 6.1 Add a HUD widget

1. Add the markup to the template in `initHud` and a reference in the `Object.assign(el, ...)` block.
2. Style it in `hud.css` under `.hud`, anchored with `--safe-*` and `--pad`; if it sits near the top-left, top-centre or top-right, add the matching reserved-area variable (2.8).
3. Feed it: per-frame values in `hud.update` through `set(key, value, fn)`; one-off events in `wireEvents` with `on(...)`; data that only `main.js` has through a new field of `info` or a new `hud` method.
4. If it holds per-match DOM (depends on the loadout, the team or the map), build it in a `build*` function called from `begin`.
5. If it is interactive: `pointerdown` with `preventDefault()` + `stopPropagation()`, report through a new `cb.on*` key and supply the handler in `main.js` `hud.init({...})`. Check 7.1 for how it stacks with the touch layers.
6. Reset any transient state in `begin`, and hide it in `hud.show(false)` if it is an overlay.

### 6.2 Add a lobby panel or tab

1. Write `fooWindow()` that builds HTML and calls `frame('Title', body)`; wire its buttons on the returned `.win`.
2. Add `if (kind === 'foo') return fooWindow()` in `open()`, and an entry point: a `.menubtn[data-open="foo"]` in the template (the `[data-open]` loop wires it) or an explicit listener.
3. Re-render with `reopen()` after local changes; `refresh()` already re-renders on every profile change, so the window must be cheap to rebuild and must keep its own sub-state in module variables (as `skinWeapon` does).
4. A tab: pass `tabs` and `activeTab` to `frame`, and make `wireTabs` (currently hard-wired to `kind: 'weapons'`) set the right `current`.
5. Reuse `.grid`, `.card`, `.buy` (+ `price` / `cant` / `owned` / `equipped`), `.pill`, `.kv`, `.section-t`, `.hint`. Check 375 x 812 and 740 x 360: `.lb-menu` is a 2 x 2 grid on short landscape screens, so a fifth menu button needs a layout change there.

### 6.3 Add a purchasable item category (coins only)

1. `config.js`: a new table (or new `STORE` `type`) with `price` in coins, and the new fields in `START_PROFILE` (`owned.<kind>`, `loadout.<slot>`). Never add a premium-currency price; reference images showing one get a fair coin price instead.
2. Backend `catalog.ts`: the same prices and profile fields (`START_PROFILE`, `normalizeProfile`), and a new `kind` branch in its `buy` and `equip` functions. The server decides every purchase; without this the client's optimistic purchase is rolled back.
3. `save.js`: `buyThing(id)` using `purchase('thing', id, price, apply)` and `equipThing(id)` using `equip('thing', id, apply)`; keep `owns('<owned key>', id)` checks.
4. `lobby.js`: a window (6.2) with the standard button states, calling `bought(buyThing(id))`.
5. Wherever the item has an effect (`match.js`, `actor.js`, the server's loadout), read it from the server state for other players and from `profile` only for local presentation.

### 6.4 Add a weapon model and its icon

1. `weaponModels.js`: write `buildFoo(g, m)` from `add`, `box`, `cyl`, `rail`, `scope`, `redDot`, using `m.body` / `m.accent` / `m.furniture` for skinnable parts and `m.steel` / `m.dark` / `m.lens` for fixed ones; add the `if (m.glow)` strip; return `{ muzzle: [x, y, z], ejector: [x, y, z], length }`. Register it in `BUILDERS`.
2. `config.js` `WEAPONS`: a new entry with `model: 'foo'`, a `slot`, stats and a coin `price`; mirror slot and price in the backend `catalog.ts` (`WEAPON_PRICES`) and its rules.
3. The icon needs no extra work: `weaponIcon(id, skin)` renders the model and every UI (shop card, HUD card and slots, kill feed) picks it up. Check the side view at 256 x 110 and 160 x 70.
4. The shop's stat bars are normalised by `statLimits` in `lobby.js`; raise a limit if the new weapon exceeds it.

### 6.5 Add a weapon skin

1. `config.js` `SKINS`: `{ name, body, accent, furniture, price }` plus optional `camo`, `glow`, `metal`.
2. Backend `catalog.ts` `SKIN_PRICES`: the same id and price.
3. Nothing else: the Skins tab lists every `SKINS` entry, `skinMaterials` builds the materials, icons are cached per skin.

### 6.6 Add a setting row

1. `settingsWindow()`: add a `.setting` block (`<span>` label + control with a `data-k` or `data-*` attribute) and a listener after `frame(...)`. Range inputs should apply on `input`; pill groups should re-call `settingsWindow()` to repaint.
2. Read and write the value through new `cb.getX` / `cb.setX` callbacks supplied in `main.js` `initLobby({...})`; persist in `localStorage` under an `ffz.*` key inside `try / catch` (storage can be blocked).
3. If the portal should also control it, add it to `SETTINGS` in `config.js` and handle it in `main.js` `applySetting`.

### 6.7 Reserved areas, touch and small screens

- Reserved areas: do not hard-code offsets for the portal toolbar. In the HUD use `--res-bottom` (left column), `--res-top` / `--score-shift` (top centre), `--res-rtop` (right column); in the lobby `--res-right` and `--res-bottom`. If a new element needs a different rule, compute it in `layoutReserved` (HUD) or the `onReservedAreas` callback (lobby) and expose a new variable.
- Safe areas: add `var(--safe-*)` to every edge offset.
- Touch: use Pointer Events (`pointerdown`, or `click` for menu buttons); no hover-only behaviour; at least 44 px targets (`clamp(44px, ...)`); `touch-action: none` on in-match controls (already set for `.hud button`), `manipulation` in menus. In a match, HUD buttons sit above the move / look pads but below the touch buttons (7.1): keep them clear of the FIRE cluster and the second FIRE.
- Small screens: size with `clamp()` and `vmin`; test 375 x 812 (portrait: the HUD's portrait block and the lobby's portrait rules apply), 740 x 360 (the `max-height: 460px` / `520px` rules apply) and desktop. Names and long labels need `white-space: nowrap` + ellipsis or a compact variant.
- Resizing: CSS handles most of it; anything computed in JS from the window size must listen to `resize` (as `layoutReserved` does).

## 7. Gotchas and invariants

1. Touch layers and the HUD. `touch.js` builds two fixed layers: `.touch-root.touch-pads` (`z-index: 14`) holds the move / look pads (`.touch-zone`, `pointer-events: auto`, from 18 % of the height to the bottom), and `.touch-root` (`z-index: 20`) holds the FIRE / AIM / JUMP / CROUCH / RELOAD buttons and the joystick's picture. The HUD (`z-index: 15`) sits between them, so a HUD element with `pointer-events: auto` takes its own taps and every other touch falls through to a pad. Consequences: a tappable HUD element must not sit under a touch button (the buttons win), and any HUD element given `pointer-events: auto` blocks looking / moving over its whole box, so keep that to real buttons. Until 2026-11-14 the pads were in the top layer and covered the HUD buttons. A mouse `pointerdown` removes `body.touch-ui`, so test taps with `pointerType: 'touch'` events, not mouse clicks.
2. `results.js` has no stylesheet of its own; its classes live in `lobby.css`, which is loaded because `main.js` imports `lobby.js`.
3. `.o` is global and defined twice (identical). Class names such as `.card`, `.row`, `.tag`, `.buy`, `.pill`, `.stat`, `.grid`, `.hint`, `.toast`, `.item`, `.arrow`, `.bigbtn`, `.plate`, `.summary` are not scoped under a root.
4. `hud.update` is not called in `intro` or `results`. During the intro flyover the HUD is visible with whatever `begin` left: new weapons / squad DOM, but score, clock and crosshair state from the previous round's last update (or the initial template).
5. The write cache (`set`) hides DOM changes made outside it: if code changes an element directly, the next `set` with an unchanged key will not repaint it. `begin` clears the cache; `cache.slot = -1` and `cache.prompt = ''` are the two manual invalidations.
6. Squad rows are built once per round in `begin` from the actors present at that moment. A teammate who joins the round later is not listed, and a row keeps pointing at an actor that left.
7. Player names and chat-derived strings must go through `esc` before `innerHTML` (both modules define their own copy). `pfp` URLs are escaped for the attribute but otherwise trusted.
8. Lobby windows are rebuilt from scratch on every profile notification; scroll position and focus inside `.win-b` are lost on each rebuild (for example after every purchase).
9. `close()` while queued sets `queueHidden`; a shop window opened during a vote hides the vote until the next one unless the player presses the "Map voting..." button.
10. `profile` must only be mutated through `save.js`. Replacing the object reference would break every importer; `replace` deliberately mutates in place.
11. Optimistic purchases are only as correct as the price tables: `config.js` and the backend `catalog.ts` are kept in step by hand.
12. `icons.js` owns a second WebGL context. Icons are rendered synchronously on first use (first open of a shop tab, first `hud.begin` with a new loadout) and cached for the session; cache keys include the pixel size, so new sizes mean new renders.
13. `renderMapImage` / `renderMapShot` draw on the visible canvas and assume the renderer is sized to the window; they run at boot behind the loading screen. Map resolution depends on the window size and pixel ratio at boot.
14. The JS copy of the score-bar size in `layoutReserved` must match the `clamp()` values in `hud.css`.
15. The HUD's map canvases are redrawn every frame (`drawMinimap` always), and `toPx` allocates a point object per call; keep overlay additions cheap.
16. `lobbyScene`'s player `Actor` and the match's player `Actor` share one avatar root: call `releasePlayer()` before `createMatch` and `setPlayerAvatar` when returning (as `enterRound`, `nextRound`, `backToLobby` do).
17. Skin materials and weapon geometry are cached and shared; never dispose or mutate a material taken from `skinMaterials` for one weapon.
18. KeyG is both "frost wall" (alive) and "Respawn" (dead); the binding lives in `controller.js` and calls `hud.pressRespawn()`.

## 8. Observations

Dead code, leftovers and contradictions found while reading. None of this was changed.

Functional gaps

- Fixed 2026-11-14: `main.js` now supplies `onInteract` (`controller.js interactPress`), so tapping the prompt opens supplies, and the touch pads moved under the HUD (7.1), so the item / weapon / ability buttons take taps. Checked in a two-player round at 740 x 360 with synthetic touch events; not tried on a real phone.
- `cb.onEmote` (Inventory emote pills) is not supplied by `main.js`.
- Equipping a weapon, or buying a skin (which also equips it), does not call `cb.onLoadout`; only "Apply" on an owned skin does. The lobby platform keeps showing the old weapon / skin until `main.js` next rebuilds the player actor (roster change, avatar reload, return from a round).
- `results.js`: the root's `pointerdown` handler meant to reveal the summary early cannot fire before the summary is shown, because `.results` and its non-button children have `pointer-events: none` and the only button is hidden until the reveal. The handler is also added again on every `showResults` call (the root element is reused), so listeners accumulate across rounds.
- Sub-44 px touch targets: `.buy` and `.pill` (40 px high), `.mv-x` (min 40 px), `.tab` (one text line + 16 px padding), `.touch-ui .item` (min 40 px), `.touch-ui .wslot` (min 32 px), `.arrow` (min 34 px), `.wcard .rl` (text-sized).

Leftovers from single-player / bots

- Hearts and revive in the spectate panel: `.hearts`, `.revive`, `SVG.heart`, `cb.onRevive` (bound to `sfx.deny`), `info.hearts` (always 0) and the "uses 1 heart" texts remain; CSS hides both elements in every mode.
- `hudCb` duplicates `cb` in `hud.js`.
- `newSquad()` in `lobby.js` is an empty function that is still called; `toolbarBottom` is computed and discarded (`void toolbarBottom`); the import of `NET` is unused; the `.lb-mode .mi` template text "6v6" is a placeholder overwritten by `refresh()`.
- `characters.js` header comment and the `OUTFITS` comment in `config.js` still say "bots"; `paintShirtFront(o, teamColor)` never receives or uses `teamColor`; `void side` in the arm loop.
- `main.js` listens for a bus event `announce`, but nothing emits it.

Unused exports and styles

- `icons.js`: `itemIcon` has no caller, which makes `buildMedkit` and the ice-grenade branch of `buildGrenade` unreachable from the UI; `SVG.head`, `SVG.shield`, `SVG.eye`, `SVG.map` are unused. `weaponIcon` has a ternary with identical branches for the yaw.
- `hud.js`: named exports `initHud`, `announce`, `toast`, `toggleMap`, `showBoard`, `setMapImage` are only used through the default object; `hud.toast` has no outside caller. The `knock` handler destructures `head` without using it.
- `lobby.js`: named export `close`, `lobby.close` and `lobby.squad` have no outside caller; `info.votes` from `queueInfo()` is never read.
- `characters.js` `paintFace` and `weaponModels.js` `skinMaterials` are exported but used only inside their own files.
- `WEAPONS[*].icon` (short text codes) and `MAPS[*].tint` in `config.js` are not read by any UI code.
- CSS with no matching markup: `.wslot.hidden`, `.dmgnum.armor`, `.bigbtn.orange` (`hud.css`); `.menubtn .badge`, `.tag.blue`, `.queue`, `.queue .big`, `.queue .spinner`, `.win .leaveq` (`lobby.css`; the `.queue*` rules predate the `.mv` vote panel).

Statements the code contradicts

- `CLAUDE.md`, Bloxity integrations: "with the SDK the 10 s timer and hearts are bypassed, without it the old timer works". The fallback timer is `NET.respawnFallback` = 5 s (the same file says 5 s elsewhere), and hearts are never shown.
- `CLAUDE.md`, same paragraph: "multiplayer/party/rooms/friends/server stats (single player)" is listed as not applicable, while the game is online-only.
- `CLAUDE.md` says `icons.js` renders weapons, grenades and the medkit to PNG icons; only weapons are rendered in practice, items use the SVG set.
- `main.js` comment on the FPS readout says "bottom-right corner"; its style places it bottom-left.
- `state.js` lists the phases as `boot | lobby | vote | intro | ...`; the client phase is `queue` (`vote` is a server phase).
- `config.js` comment on `MATCH_MODES` says the round's mode is voted by the players; the lobby has no mode vote, only the mode window (`setMode`) and `play { mode }`.
- `coinsPerElim: 12` in `main.js` duplicates `REWARDS.perElimination`; the "+12 coins" notice will be wrong if only the config value changes.
