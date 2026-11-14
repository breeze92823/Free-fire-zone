---
canDie: true
hasScore: true
rewards: false
distDir: dist
buildCommand: npm run build
notApplicable:
  - gems: Nothing is sold for premium currency (project rule); every shop uses match-earned coins, bought on the server. The game's own in-game "Gems" (earned by eliminations, never sold) are unrelated to Bloxity Gems.
  - rewarded-ads: No rewards are granted for watching ads (rewards: false); ad breaks and screen ads are implemented.
  - music-volume: The game has no music track, only SFX and ambience (master_volume is supported).
serverDir: ../Free-fire-zone-backend
---

# Free Fire Zone: Bloxity integration notes

Docs: https://docs.bloxity.io/#html5. All SDK calls go through `src/bloxity.js` and never throw when the SDK is missing
(`VITE_DEV_MODE=true` or a blocked CDN leaves the game playable offline).

| Feature | Where |
| --- | --- |
| `init({ gameSlug })`, loading overlay, `gameplayStart/End` per match | `bloxity.js`, `main.js` |
| Auth (`onUserChanged`), avatar, proportions, customizer | `bloxity.js`, `avatar/` |
| Settings: `graphics_quality`, `camera_sensitivity`, `show_fps`, `fullscreen`, `master_volume` | `config.js` `SETTINGS`, `main.js` `applySetting` |
| Ad breaks: simulation frozen + audio muted | `bloxity.js` `initAds`, `main.js` `frame`, `audio/core.js` `setBreakMuted` |
| Screen ads: `declareScreens` + `screen(lobby / panel / results / gameplay)` | `config.js` `AD_SCREENS`, `bloxity.js` `showAdScreen` |
| Leaderboards (4 boards) declared in the browser, scores reported by the server at round end | `config.js` `LEADERBOARDS`, backend `reporters.ts` |
| Death screen (Respawn button waits for the portal countdown) | `bloxity.js`, `game/hud.js` `setDeath`, `main.js` |
| Emotes (`registerFeature('emotes')`, catalogue clips) | `bloxity.js`, `avatar/animator.js` `writeClip`, `main.js` `playPortalEmote` |
| Chat bubbles over the player (`chat.onMessage` + `attachBubble`) | `bloxity.js`, `main.js` |
| Reserved HUD areas, portal pause menu (`showMenu`), `respawn_request` | `bloxity.js`, `game/hud.js`, `game/lobby.js` |
| Multiplayer: `net.resolveEndpoint` per connect, new Client each time, backoff up to 60 s, token in join options | `net.js` |
| Server identity: token verified with `/v1/auth/game-token/verify`, only `user._id` used, guest ids server-made, `carriedFrom` | backend `auth.ts`, `db.ts` |
| Open Rooms: room reporter; `?roomId=` joins that room (falls back to matchmaking) | backend `reporters.ts`, `net.js`, `bloxity.js locateRoom` |
| Friends: `updateRoom(relay~roomId, team)`, `playerJoined` / `playerInRoom` | `net.js reportRoom`, `game/online.js trackRoster` |
| Party play: `party.enable`, launch roomKey in join options (same team), `party.joined` / `party.failed('room-full')` | `bloxity.js`, `net.js`, backend `pickTeam` |
| Play with friends: `?instantMultiplayer=true` creates a private room; `registerFeature('play_with_friends')` after a join | `net.js`, backend `onCreate` |
| Server stats + server-side leaderboard reports (verified `legion_` ids, batched) | backend `reporters.ts` |
| Chat bubbles over other players (`uid` in the roster matches chat `userId`) | `game/online.js` |
