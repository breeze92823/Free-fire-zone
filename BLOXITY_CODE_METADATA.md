---
canDie: true
hasScore: true
rewards: false
distDir: dist
buildCommand: npm run build
notApplicable:
  - gems: Nothing is sold for premium currency (project rule); every shop uses match-earned coins.
  - rewarded-ads: No rewards are granted for watching ads (rewards: false); ad breaks and screen ads are implemented.
  - multiplayer: Single player against bots, no networking (the Colyseus backend is not connected to this client yet).
  - party-play: No multiplayer rooms to seat a party in.
  - open-rooms: No rooms to list or join (?roomId= is ignored).
  - friends-and-invites: Portal-drawn; nothing to invite friends into without rooms.
  - play-with-friends: Needs private multiplayer rooms.
  - server-auth: No game server in use, so no token verification or server-side leaderboard/stats reporting.
  - server-stats: No game server in use.
  - music-volume: The game has no music track, only SFX and ambience (master_volume is supported).
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
| Leaderboards (4 boards) submitted when a match ends or is left | `config.js` `LEADERBOARDS`, `bloxity.js` `submitMatchScores` |
| Death screen (Respawn button waits for the portal countdown) | `bloxity.js`, `game/hud.js` `setDeath`, `main.js` |
| Emotes (`registerFeature('emotes')`, catalogue clips) | `bloxity.js`, `avatar/animator.js` `writeClip`, `main.js` `playPortalEmote` |
| Chat bubbles over the player (`chat.onMessage` + `attachBubble`) | `bloxity.js`, `main.js` |
| Reserved HUD areas, portal pause menu (`showMenu`), `respawn_request` | `bloxity.js`, `game/hud.js`, `game/lobby.js` |
