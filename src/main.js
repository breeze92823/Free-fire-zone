import * as THREE from 'three'
import { ACESFilmicToneMapping, Clock, PCFSoftShadowMap, PerspectiveCamera, Scene, SRGBColorSpace, Vector3, WebGLRenderer } from 'three'
import { CAMERA, graphicsPreset, MATCH, MAPS, NET, RENDER, TIME_OF_DAY, WEAPONS } from './config.js'
import * as bloxity from './bloxity.js'
import { install as installInput, isLocked, setGameInput, inputState } from './input.js'
import { installTouch, setTouchActive, touchShown } from './touch.js'
import { createPlayerBody, interpolate as interpolatePlayer, player as body, resetPlayer } from './player.js'
import { getYaw, setCameraSensitivity, getCameraSensitivity, snapFollow, syncYawToPlayer, update as updateCamera, setView } from './camera.js'
import { initPhysics, stepPhysics } from './physics.js'
import { createLighting } from './lighting.js'
import { createWorld } from './world.js'
import { createPostFx } from './postfx.js'
import { setNeonBloom } from './propkit.js'
import { loadBaseCharacter } from './avatar/character.js'
import { applyProportions, attachEquippedAccessories } from './avatar/loader.js'
import { buildIsland } from './world/index.js'
import { installAudio, setBreakMuted, setListener, setVolume, setDucked, sfx, spatial, updateAmbience } from './audio/index.js'
import { hasEmoteClip, registerEmoteClip } from './avatar/animator.js'
import { G, on } from './game/state.js'
import { initFx, setFxScale, updateFx } from './game/fx.js'
import { buildLoot } from './game/loot.js'
import { buildNav } from './game/navgrid.js'
import { createMatch, initMatchSystems, spawnActor, teardownMatch, updateMatch } from './game/match.js'
import { bindKeys, playEmote, updateController, useItem, useUlt, view } from './game/controller.js'
import * as combat from './game/combat.js'
import { selectSlot, startReload } from './game/combat.js'
import hud, { mapOpen } from './game/hud.js'
import { renderMapImage } from './game/mapimage.js'
import { createLobbyScene } from './game/lobbyScene.js'
import lobby, { initLobby, showLoading } from './game/lobby.js'
import { hideResults, showResults, updateResults } from './game/results.js'
import { profile } from './game/save.js'
import { connect, disconnect, me, net, onNet, online, reportRoom, send, setJoinOptions } from './net.js'
import { applyState, initOnline, outfitForId, reconcile, remoteAimDir, roster, sendPose, setThree, syncClock, syncLoot, trackRoster } from './game/online.js'
import { buildCharacter, portrait, randomOutfit } from './game/characters.js'

// Boot: Bloxity SDK -> renderer -> Rapier -> lighting, sea, island, loot, nav
// grid, effects, map picture -> HUD + lobby -> avatar (async) -> game server -> loop.
// Online: the room's server runs the rounds. Phases (G.phase): lobby (menus) -> queue (pressed
// Play: waiting for players / map vote) -> intro (flyover) -> countdown -> playing -> ending (slow
// motion) -> results -> queue (next round, same room) | lobby (left).
let lighting = null
let renderer = null
let postfx = null
let lobbyFx = null
let quality = null
try {
  quality = localStorage.getItem('ffz.quality')
} catch {
  quality = null
}

// show_fps: a small frame-rate readout in the bottom-right corner (the top-left belongs to the portal).
const fpsEl = document.createElement('div')
fpsEl.style.cssText = 'position:fixed;left:max(6px,env(safe-area-inset-left));bottom:max(4px,env(safe-area-inset-bottom));z-index:30;font:600 12px Fredoka,sans-serif;color:#fff;background:rgba(10,14,22,.6);padding:2px 8px;border-radius:8px;pointer-events:none;display:none'
document.body.appendChild(fpsEl)
let showFps = false
let fpsAcc = 0
let fpsFrames = 0

function applySetting(key, value) {
  if (key === 'camera_sensitivity') setCameraSensitivity(value)
  else if (key === 'fullscreen') bloxity.requestFullscreen(value)
  else if (key === 'master_volume') setVolume(value / 100)
  else if (key === 'show_fps') {
    showFps = !!value
    fpsEl.style.display = showFps ? 'block' : 'none'
  } else if (key === 'graphics_quality' && renderer) {
    const next = graphicsPreset(value)
    G.preset = next
    renderer.shadowMap.enabled = next.shadows
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, next.dpr))
    lighting?.setShadows(next)
    postfx?.configure(next)
    lobbyFx?.configure(next)
    setNeonBloom(next.bloom)
    resize()
  }
}
bloxity.onSetting(applySetting)
// Ad breaks (the portal can start one at any time): audio goes silent here, frame() freezes the game.
bloxity.onAdBreak((on) => setBreakMuted(on))
bloxity.init()

// --- Renderer ---------------------------------------------------------------
const preset = graphicsPreset(quality || bloxity.settings.graphics_quality)
G.preset = preset
renderer = new WebGLRenderer({ antialias: preset.antialias, powerPreference: 'high-performance' })
renderer.outputColorSpace = SRGBColorSpace
renderer.toneMapping = ACESFilmicToneMapping
renderer.toneMappingExposure = RENDER.exposure
renderer.shadowMap.enabled = preset.shadows
renderer.shadowMap.type = PCFSoftShadowMap
renderer.setPixelRatio(Math.min(window.devicePixelRatio, preset.dpr))
document.body.appendChild(renderer.domElement)
installInput(() => bloxity.showMenu(), renderer.domElement)
installAudio()
try {
  const v = localStorage.getItem('ffz.volume')
  if (v !== null) setVolume(Number(v))
} catch {
  // Storage blocked.
}

const scene = new Scene()
const camera = new PerspectiveCamera(CAMERA.fov, 1, CAMERA.near, CAMERA.far)
G.scene = scene
G.camera = camera
G.renderer = renderer
postfx = createPostFx(renderer, scene, camera)
postfx.configure(preset)
let lobbyScene = null

function resize() {
  const w = window.innerWidth
  const h = window.innerHeight
  renderer.setSize(w, h)
  postfx.setSize(w, h)
  lobbyFx?.setSize(w, h)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  lobbyScene?.resize(w, h)
}
window.addEventListener('resize', resize)
resize()
for (const key of Object.keys(bloxity.settings)) {
  if (key === 'graphics_quality' && quality) continue // the lobby's own choice wins
  if (key === 'master_volume' && !bloxity.hasSdk()) continue // no portal: keep the lobby slider's saved volume
  applySetting(key, bloxity.settings[key])
}

// --- World -------------------------------------------------------------------
showLoading(true, 'Starting physics', 0.05)
bloxity.loadingStep('Starting physics')
await initPhysics()
showLoading(true, 'Lighting the island', 0.15)
lighting = createLighting(scene, renderer, preset)
G.lighting = lighting
const world = createWorld(scene) // the sea + clouds
showLoading(true, 'Building the island', 0.25)
bloxity.loadingStep('Building the island')
await new Promise((r) => setTimeout(r, 0))
const island = await buildIsland(scene, { lighting, preset })
G.island = island
showLoading(true, 'Placing supplies', 0.6)
buildLoot(scene, island.lootSpots)
createPlayerBody()
body.frozen = true
resetPlayer({ x: island.spawnAreas.blue.x, y: island.groundHeight(island.spawnAreas.blue.x, island.spawnAreas.blue.z) + 0.1, z: island.spawnAreas.blue.z }, 0)
showLoading(true, 'Mapping routes', 0.7)
await new Promise((r) => setTimeout(r, 0))
G.nav = buildNav(island)
initFx(scene, preset)
initMatchSystems(scene)
showLoading(true, 'Drawing the map', 0.8)
const mapImg = renderMapImage(renderer, scene, lighting, island.bounds, island.landmarks)
const mapThumb = (() => {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  c.getContext('2d').drawImage(mapImg.clean, 0, 0, 256, 256)
  return c.toDataURL('image/jpeg', 0.8)
})()

// --- UI ------------------------------------------------------------------------------
hud.init({
  onSlot: (i) => G.player && selectSlot(G.player, i),
  onReload: () => G.player && startReload(G.player),
  onItem: (id) => useItem(id),
  onUlt: () => useUlt(),
  onLobby: () => leaveMatch(),
  onRevive: () => sfx.deny(),
  // The portal's death screen owns the wait: respawn only when it says go (respawn() === true).
  onRespawn: (death) => {
    if (death?.respawn?.()) requestRespawn(true)
    else sfx.deny()
  },
  onSpectate: (dir) => cycleSpectate(dir),
  onMapOpen: (open) => {
    if (open) document.exitPointerLock?.()
  },
  coinsPerElim: 12,
})
hud.setMapImage(mapImg)
hud.touch = installTouch({
  reload: () => G.player && startReload(G.player),
  crouch: (on) => (inputState.crouch = on),
})
bindKeys(hud)

lobbyScene = createLobbyScene()
lobbyScene.rebuildSquad(null, [])
lobbyFx = createPostFx(renderer, lobbyScene.scene, lobbyScene.camera)
lobbyFx.configure(G.preset)
resize()
initLobby({
  onPlay: () => startMatchFlow(),
  onLeaveQueue: () => leaveMatch(),
  onVote: (map) => send('vote', { map }),
  onRank: (i) => lobbyScene.setRank(i),
  onWindow: (open) => {
    setDucked(open)
    if (G.phase === 'lobby') bloxity.showAdScreen(open ? 'panel' : 'lobby')
  },
  onLoadout: () => lobbyScene.setPlayerAvatar(avatar, loadoutForActor()),
  getQuality: () => quality || bloxity.settings.graphics_quality,
  setQuality: (q) => {
    quality = q
    try {
      localStorage.setItem('ffz.quality', q)
    } catch {
      // Storage blocked.
    }
    applySetting('graphics_quality', q)
  },
  getSensitivity: () => getCameraSensitivity(),
  setSensitivity: (v) => setCameraSensitivity(v),
  mapThumb: () => mapThumb,
})

// Lock hint for desktop: the first click grabs the mouse.
const lockHint = document.createElement('div')
lockHint.style.cssText = 'position:fixed;left:50%;top:58%;transform:translateX(-50%);z-index:17;font:600 16px Fredoka,sans-serif;color:#fff;background:rgba(10,14,22,.7);padding:8px 18px;border-radius:20px;pointer-events:none;display:none;text-shadow:0 1px 2px #000'
lockHint.textContent = 'Click to aim · Esc frees the mouse'
document.body.appendChild(lockHint)

// --- Player avatar -----------------------------------------------------------------
// The Bloxity rig (player.glb; procedural fallback), dressed with the signed-in
// player's cosmetics. It stands in the lobby and is lent to the player's Actor in a match.
const playerOutfit = randomOutfit()
// Until (or unless) the Bloxity rig loads, the player wears one of the game's own blocky outfits.
let avatar = buildCharacter(playerOutfit, 'blue')
let generation = 0
let avatarReady = false
function loadoutForActor() {
  const lo = profile.loadout
  return { primary: lo.primary, secondary: lo.secondary, skins: { [lo.primary]: lo.skin[lo.primary] || 'standard', [lo.secondary]: lo.skin[lo.secondary] || 'standard' } }
}
function placeAvatarInLobby() {
  if (G.phase === 'lobby' || G.phase === 'queue' || G.phase === 'boot') lobbyScene.setPlayerAvatar(avatar, loadoutForActor())
}
async function loadAvatar() {
  const mine = ++generation
  try {
    const group = await loadBaseCharacter()
    if (mine !== generation) return
    const equipped = bloxity.authState.user ? bloxity.getEquippedAvatar() : null
    await attachEquippedAccessories(group, equipped, { skinTextureUrl: bloxity.getSkinTextureUrl() })
    if (mine !== generation) return
    applyProportions(group, bloxity.authState.user ? bloxity.getProportions() : null)
    // player.glb failed and the loader fell back to its plain procedural figure: keep our outfit.
    if (!group.nodes?.default_torso) return
    avatar = group
    placeAvatarInLobby()
    sendAvatar()
  } catch (err) {
    console.warn('[avatar] load failed, keeping the default outfit', err)
  } finally {
    if (mine === generation) avatarReady = true
  }
}
// The look the others draw: equipped ids + proportions only (never asset URLs).
function lookJson() {
  const equipped = bloxity.authState.user ? bloxity.getEquippedAvatar() : null
  if (!equipped) return ''
  try {
    return JSON.stringify({ equipped, proportions: bloxity.getProportions() || null }).slice(0, 4000)
  } catch {
    return ''
  }
}
function sendAvatar() {
  send('avatar', { avatar: lookJson() })
}
setJoinOptions(() => ({ name: bloxity.displayName() === 'Offline' ? 'Guest' : bloxity.displayName(), pfp: bloxity.getPfp(), avatar: lookJson() }))

let signedIn = null
let userKey = null
bloxity.subscribeAuth((s) => {
  const now = !!s.user
  if (now !== signedIn) {
    signedIn = now
    loadAvatar()
    lobby.refresh()
  }
  if (!s.ready) return
  // Connect once auth has settled; a later sign-in / sign-out switches the server-side profile.
  const key = s.user?._id || ''
  if (userKey === null) {
    userKey = key
    connect()
  } else if (key !== userKey) {
    userKey = key
    send('auth', { token: bloxity.getToken(), name: bloxity.displayName(), pfp: bloxity.getPfp() })
  }
})
bloxity.onAvatarChanged(loadAvatar)
bloxity.onProportionsChanged(() => applyProportions(avatar, bloxity.getProportions()))
// The portal menu's "Respawn" button: in a match, a stuck player is moved to a fresh spawn point.
bloxity.onRespawnRequest(() => {
  if (G.phase === 'playing' && G.player?.life === 'alive') spawnActor(G.player)
})

// Emotes from the portal's emote button play on the player's character during a match. A later
// movement/fire input (controller.js) or the portal's stop ends them.
async function playPortalEmote(id) {
  const p = G.player
  if (id === null) {
    if (p?.emote?.startsWith('portal:')) playEmote('')
    return
  }
  if (!p || G.phase !== 'playing' || p.life !== 'alive') return
  if (!hasEmoteClip(id)) registerEmoteClip(id, await bloxity.getEmoteClip(id))
  if (!hasEmoteClip(id) || G.player !== p || p.life !== 'alive' || G.phase !== 'playing') return
  playEmote(`portal:${id}`)
}
bloxity.onPortalEmote(playPortalEmote)
initOnline()
setThree(THREE)

// The portal draws the chat; the player's own messages also float over their head in a match.
let chatBubble = null
bloxity.onChatMessage((m) => {
  const root = G.player?.group
  if (!m?.isLocalPlayer || !root) return
  chatBubble?.remove?.()
  chatBubble = bloxity.attachChatBubble(THREE, root, m)
})
placeAvatarInLobby()

// --- Match flow (online) ----------------------------------------------------------------
let introT = 0
let countdownT = 0
let lastCount = 0
let lastZonePhase = -1
let currentMap = MAPS[0]
let rewards = null // this round's rewards from the server
let resultsShown = false
let queuedAt = 0 // when PLAY was sent: the server's answer (inMatch) takes a moment
const RUNNING = new Set(['intro', 'countdown', 'playing', 'ending'])

function setMood(map) {
  lighting.setMoods({ day: TIME_OF_DAY[map.mood] ?? TIME_OF_DAY.day, night: TIME_OF_DAY.night })
}

// PLAY: join the room's next round (or the running one). The server waits for NET.minPlayers.
async function startMatchFlow() {
  if (G.phase !== 'lobby') return
  if (!online()) {
    lobby.status('Connecting to the game server…')
    if (!(await connect())) {
      lobby.status('Could not reach the game server — try again.')
      return
    }
  }
  lobby.status('')
  G.phase = 'queue'
  queuedAt = performance.now()
  send('play', { mode: profile.mode })
  lobby.showQueue(queueInfo())
}

// What the waiting / vote panel shows.
function queueInfo() {
  const st = net.state
  const votes = MAPS.map(() => 0)
  let ready = 0
  st?.players?.forEach((p) => {
    if (!p.inMatch) return
    ready++
    if (p.vote >= 0 && p.vote < votes.length) votes[p.vote]++
  })
  return { phase: st?.phase ?? 'waiting', left: st?.phaseLeft ?? 0, ready, need: NET.minPlayers, votes, mine: me()?.vote ?? -1, maps: MAPS }
}

// The server put this player in a running round: build it here.
function enterRound() {
  const st = net.state
  const mine = me()
  currentMap = MAPS[st.map] ?? MAPS[0]
  lobby.hideQueue()
  lobby.show(false)
  setMood(currentMap)
  lobbyScene.releasePlayer()
  createMatch({ st, me: mine, map: currentMap, playerAvatar: avatar, playerName: mine.name || 'You', playerPortrait: bloxity.getPfp() || portrait(playerOutfit), netId: net.sessionId })
  reconcile()
  syncLoot()
  renderer.compile(scene, camera)
  hud.begin(currentMap.name)
  hud.show(true)
  bloxity.showAdScreen('gameplay') // gameplay banners are declared off; this just reports the screen
  setGameInput(true)
  setTouchActive(true)
  setDucked(false)
  lastZonePhase = -1
  G.slowmo = 1
  rewards = null
  resultsShown = false
  if (st.phase === 'intro') {
    G.phase = 'intro'
    introT = Math.max(0, MATCH.introFlyover - st.phaseLeft)
  } else if (st.phase === 'countdown') {
    G.phase = 'countdown'
    countdownT = st.phaseLeft
    lastCount = 0
  } else {
    G.phase = 'playing'
    bloxity.gameplayStart()
  }
  reportRoom(mine.team)
  hud.announce(G.match.mode.name.toUpperCase(), `${G.match.mode.desc}`, 3000)
}

// Follows the server's round: phase changes, the end, the next round, leaving.
function syncFlow() {
  trackRoster()
  const st = net.state
  const mine = me()
  if (!st || !mine) {
    if (G.phase === 'queue') backToLobby()
    return
  }
  if (G.phase === 'queue') {
    if (!mine.inMatch) {
      if (performance.now() - queuedAt > 3000) backToLobby()
      return
    }
    if (RUNNING.has(st.phase) && mine.team) return enterRound()
    lobby.showQueue(queueInfo())
    return
  }
  if (!G.match) return
  if (!mine.inMatch) return backToLobby()
  const sp = st.phase
  if (G.phase === 'intro' && sp === 'countdown') {
    G.phase = 'countdown'
    countdownT = st.phaseLeft
    lastCount = 0
    snapFollow()
    setView(G.player.facing + Math.PI, CAMERA.startPitch)
  } else if ((G.phase === 'intro' || G.phase === 'countdown') && (sp === 'playing' || sp === 'ending')) {
    if (G.phase === 'intro') {
      snapFollow()
      setView(G.player.facing + Math.PI, CAMERA.startPitch)
    }
    G.phase = 'playing'
    bloxity.gameplayStart()
  }
  if (sp === 'ending' && G.phase === 'playing') {
    G.phase = 'ending'
    G.slowmo = 0.3
  }
  if (sp === 'results' && G.phase !== 'results') toResults()
  else if ((sp === 'vote' || sp === 'waiting') && G.phase === 'results') nextRound()
  else if ((sp === 'vote' || sp === 'waiting') && RUNNING.has(G.phase)) nextRound()
}

function toResults() {
  G.phase = 'results'
  G.slowmo = 1
  endGameplay()
  hud.show(false)
  setTouchActive(false)
  setGameInput(false)
  bloxity.showAdScreen('results')
  if (rewards) showRoundResults()
}

function showRoundResults() {
  if (resultsShown || !G.match) return
  resultsShown = true
  showResults(net.state?.winner || G.player.team, rewards, leaveMatch)
}

onNet('rewards', (r) => {
  rewards = r
  if (G.phase === 'results') showRoundResults()
})

// The round is over and this player stays for the next one.
function nextRound() {
  closeMatch()
  G.phase = 'queue'
  lobbyScene.rebuildSquad(loadoutForActor())
  lobbyScene.setPlayerAvatar(avatar, loadoutForActor())
  lobby.showQueue(queueInfo())
  bloxity.showAdScreen('lobby')
}

// Back to the menus (Lobby buttons): costs half the round's coins if it is still running.
function leaveMatch() {
  send('leave')
  backToLobby()
}

// The match is over (or left): tell the portal gameplay stopped and drop any death screen.
function endGameplay() {
  bloxity.gameplayEnd()
  clearDeath()
}

function clearDeath() {
  portalDeath = false
  hud.setDeath(null)
  bloxity.hideDeathScreen()
}
let portalDeath = false // the portal's death screen is up: it, not the timer, decides when we respawn

let respawnAskedAt = 0
function requestRespawn(force = false) {
  const now = performance.now()
  if (!force && now - respawnAskedAt < 1000) return
  respawnAskedAt = now
  send('respawn')
}

function closeMatch() {
  endGameplay()
  hideResults()
  hud.show(false)
  if (G.match) teardownMatch()
  setGameInput(false)
  setTouchActive(false)
  setMood(MAPS[0])
  inputState.crouch = false
  inputState.aim = false
  G.slowmo = 1
  lockHint.style.display = 'none'
  reportRoom()
}

function backToLobby() {
  closeMatch()
  bloxity.showAdScreen('lobby')
  G.phase = 'lobby'
  lobby.hideQueue()
  lobbyScene.rebuildSquad(loadoutForActor())
  lobbyScene.setPlayerAvatar(avatar, loadoutForActor())
  lobby.show(true)
}

// The lobby platform shows up to three other players in this room.
let matesKey = ''
function showMates(list) {
  const others = list.filter((m) => !m.me).slice(0, 3)
  const key = others.map((m) => `${m.id}:${m.primary}`).join(',')
  if (key === matesKey || (G.phase !== 'lobby' && G.phase !== 'queue')) return
  matesKey = key
  lobbyScene.rebuildSquad(loadoutForActor(), others.map((m) => ({ outfit: outfitForId(m.id), primary: m.primary, secondary: m.secondary })))
}

function cycleSpectate(dir) {
  const mates = G.actors.filter((a) => a.team === G.player.team && a !== G.player && a.life !== 'dead')
  if (!mates.length) {
    G.spectating = null
    return
  }
  const i = mates.indexOf(G.spectating)
  G.spectating = mates[(i + dir + mates.length) % mates.length]
}

// Lost the room mid-round (the SDK's own reconnect failed): back to the menus; net.js reconnects.
onNet('left', () => {
  if (G.phase !== 'lobby') backToLobby()
  lobby.status('Reconnecting to the game server…')
})
onNet('status', (st) => {
  if (st === 'online') lobby.status('')
  else if (st === 'offline') lobby.status(net.error || 'Offline')
})

on('spawn', ({ actor, pos, facing }) => {
  if (!actor.isPlayer) return
  resetPlayer({ x: pos.x, y: pos.y, z: pos.z }, facing)
  syncYawToPlayer(facing)
  setView(facing + Math.PI, CAMERA.startPitch)
  snapFollow()
  G.spectating = null
  clearDeath()
})
on('elimination', ({ target }) => {
  if (target === G.player) {
    cycleSpectate(1)
    inputState.aim = false
    hud.touch?.syncAim()
    // Required death screen: the portal counts down, the centred Respawn button waits for it.
    if (G.phase === 'playing' && bloxity.hasDeathScreen()) {
      const handle = bloxity.showDeathScreen()
      portalDeath = !!handle
      hud.setDeath(handle)
    }
  }
  if (G.spectating === target) cycleSpectate(1)
})
on('matchEnd', ({ winner }) => {
  G.slowmo = 0.3
  if (G.phase === 'playing') G.phase = 'ending'
  endGameplay()
  hud.announce(winner === G.player.team ? 'VICTORY!' : 'TIME!', winner === G.player.team ? 'Your squad wins the clash' : 'The other squad takes it', 2400)
})
on('announce', ({ big, small }) => hud.announce(big, small))
let fellAt = 0
body.onFellOut = () => {
  if (!G.player || G.player.life === 'dead' || G.phase !== 'playing' || performance.now() - fellAt < 1000) return
  fellAt = performance.now()
  send('fell')
}

// --- Loop -----------------------------------------------------------------------------------
const clock = new Clock()
let rosterT = 0
let shownLoading = true
let readySince = 0
const aimDir = new Vector3()
const focus = new Vector3()
const stepAcc = new Map()
const introLook = new Vector3()
let ambLevel = 0
let skipRender = false // dev stepping without drawing

showLoading(false)
G.phase = 'lobby'
lobby.show(true)
bloxity.showAdScreen('lobby')
setGameInput(false)
setTouchActive(false)

function gameFrame(dt) {
  const phase = G.phase
  const p = G.player
  const gdt = dt * G.slowmo
  if (phase === 'intro') {
    introT = Math.min(MATCH.introFlyover, introT + dt)
  } else if (phase === 'countdown') {
    countdownT -= dt
    const n = Math.ceil(countdownT - 1)
    if (n !== lastCount) {
      lastCount = n
      if (n >= 1) {
        hud.countdown(String(n))
        sfx.countdown(false)
      } else {
        hud.countdown('FIGHT!')
        sfx.countdown(true)
      }
    }
  }

  // The server's view of everyone (other players, health, score, clock) first.
  reconcile()
  applyState(dt)
  syncClock(dt)

  // Player input -> physics -> our pose to the server -> local timers
  if (p && G.phase !== 'results') updateController(gdt, hud)
  if (G.phase === 'intro' || G.phase === 'countdown' || G.phase === 'results') body.frozen = true
  stepPhysics(gdt)
  interpolatePlayer()
  if (p) {
    const r = body.renderPosition
    if (p.life !== 'dead' || G.phase === 'results') p.pos.set(r.x, r.y, r.z)
    p.vel.set(body.velocity.x, body.velocity.y, body.velocity.z)
    p.grounded = body.grounded
    if (p.life !== 'dead' && G.phase !== 'results') p.facing = body.facing
  }
  if (p && G.phase !== 'results') sendPose(dt)
  if (G.phase === 'playing' || G.phase === 'ending') updateMatch(gdt)

  // Zone phase announcements
  const zs = G.match?.zone.state
  if (zs && zs.phase !== lastZonePhase && G.phase === 'playing') {
    if (lastZonePhase !== -1 || zs.phase >= 0) {
      if (zs.phase >= 0) {
        hud.announce('ZONE SHRINKING', 'Move into the white circle')
        sfx.zoneWarning()
      }
    }
    lastZonePhase = zs.phase
  }

  // Models
  for (const a of G.actors) {
    let dir
    if (a.isPlayer) {
      dir = aimDir.subVectors(view.aimPoint, a.chest(focus)).normalize()
      a.group.visible = !view.scoped
    } else dir = remoteAimDir(a, aimDir)
    const speed = Math.hypot(a.vel.x, a.vel.z)
    a.updateModel(gdt, dir, speed)
    // Footsteps of others nearby.
    if (!a.isPlayer && a.life === 'alive' && a.grounded && speed > 2 && p) {
      const acc = (stepAcc.get(a.id) || 0) + speed * gdt
      if (acc > 1.9) {
        stepAcc.set(a.id, 0)
        if (a.pos.distanceTo(p.pos) < 24) sfx.footstep(spatial(a.pos.x, a.pos.y, a.pos.z))
      } else stepAcc.set(a.id, acc)
    }
  }
  updateFx(gdt)

  // Camera
  const watching = p && p.life === 'dead' && G.spectating ? G.spectating : p
  if (G.phase === 'intro') {
    const k = introT / MATCH.introFlyover
    introLook.set(p.pos.x * k, 0, p.pos.z * k)
    updateCamera(camera, dt, { mode: 'orbit', time: introT * 2 + 1, distance: 150 - 110 * k, height: 95 - 70 * k, lookAt: introLook })
  } else if (G.phase === 'results') {
    const pose = updateResults(dt, camera)
    updateCamera(camera, dt, { mode: 'look', from: pose.from, lookAt: pose.lookAt })
  } else if (p) {
    const scoped = view.scoped && G.phase === 'playing'
    updateCamera(camera, dt, {
      mode: p.life === 'dead' ? (G.spectating ? 'spectate' : 'play') : scoped ? 'scope' : 'play',
      target: watching.pos,
      aim: p.aiming && G.phase === 'playing',
      zoomFov: p.def.zoom,
      crouch: watching.crouch,
      knocked: watching.life === 'knocked',
    })
  }
  setFxScale(renderer.domElement.height / 2 / Math.tan((camera.fov * Math.PI) / 360))
  setListener(camera.position.x, camera.position.y, camera.position.z, getYaw())

  if (p && (G.phase === 'playing' || G.phase === 'countdown' || G.phase === 'ending')) {
    // Without the portal's death screen a short timer respawns the player; with it, only its button does.
    if (p.life === 'dead' && G.phase === 'playing' && !portalDeath && G.time >= p.respawnAt) requestRespawn()
    hud.update(dt, camera, { scoped: view.scoped && G.phase === 'playing', spread: view.spread, onEnemy: view.onEnemy, prompt: view.prompt, yaw: getYaw(), hearts: 0, touch: touchShown() })
  }
  lockHint.style.display = G.phase === 'playing' && !isLocked() && !touchShown() && p?.life !== 'dead' && !mapOpen() ? 'block' : 'none'

  focus.copy(watching ? watching.pos : camera.position)
  if (G.phase === 'intro') focus.set(0, 0, 0)
  world.update(dt, clock.elapsedTime)
  island.update?.(dt, clock.elapsedTime)
  lighting.update(dt, focus)
  const shore = Math.max(0, Math.min(1, (Math.hypot(focus.x, focus.z) - (island.radius - 35)) / 30))
  ambLevel += (1 - ambLevel) * Math.min(1, dt)
  updateAmbience(dt, ambLevel, shore)
  if (!skipRender) postfx.render()
}

function frame(dt) {
  if (showFps && dt > 0) {
    fpsAcc += dt
    fpsFrames++
    if (fpsAcc >= 0.5) {
      fpsEl.textContent = `${Math.round(fpsFrames / fpsAcc)} FPS`
      fpsAcc = 0
      fpsFrames = 0
    }
  }
  // Ad break: nothing advances (simulation, bots, match clock, audio is muted) until it ends.
  // The room keeps running on the server: only this client's drawing and input pause.
  if (bloxity.isAdBreak()) {
    if (!skipRender) (G.phase === 'lobby' || G.phase === 'queue' ? lobbyFx : postfx).render()
    return
  }
  syncFlow()
  rosterT -= dt
  if (rosterT <= 0) {
    rosterT = 1
    const list = roster()
    lobby.setRoster(list, net.status)
    showMates(list)
  }
  if (G.phase === 'lobby' || G.phase === 'queue') {
    lobbyScene.update(dt)
    lobbyFx.render()
    ambLevel = 0
    updateAmbience(dt, 0, 0)
  } else gameFrame(dt)

  if (shownLoading) {
    readySince += dt
    if (avatarReady || readySince > 5) {
      shownLoading = false
      bloxity.notifyFirstFrame()
    }
  }
}
renderer.setAnimationLoop(() => frame(Math.min(clock.getDelta(), 0.1)))

window.addEventListener('beforeunload', () => {
  disconnect() // a deliberate leave: the server drops the seat at once instead of holding it
  bloxity.teardown()
})

// Dev-only console hook.
if (import.meta.env.DEV || location.search.includes('debug')) {
  window.__game = {
    G, scene, renderer, camera, body, island, lobbyScene, WEAPONS, profile, sfx, inputState, setView, useItem, hud, combat,
    get avatar() {
      return avatar
    },
    get avatarReady() {
      return avatarReady
    },
    // Headless testing: run n frames of dt seconds synchronously; start a match without the vote.
    step: (n = 1, dt = 1 / 60, draw = false) => {
      skipRender = !draw
      try {
        for (let i = 0; i < n; i++) frame(dt)
      } finally {
        skipRender = false
      }
      return G.phase
    },
    // Press Play (the round starts once a second player has too).
    play: () => startMatchFlow(),
    net,
    teleport: (x, z, facing = 0) => {
      resetPlayer({ x, y: island.groundHeight(x, z) + 0.3, z }, facing)
      if (G.player) G.player.pos.set(x, island.groundHeight(x, z), z)
      setView(facing + Math.PI, CAMERA.startPitch)
      snapFollow()
    },
    // Draw one frame and save it (scaled) through the dev server's /__shot endpoint.
    // cam: optional { from: [x, y, z], at: [x, y, z] } (relative to the player when rel is true).
    shot: async (name = 'shot', width = 1100, cam = null) => {
      skipRender = false
      frame(1 / 60)
      if (cam) {
        const o = cam.rel && G.player ? G.player.pos : { x: 0, y: 0, z: 0 }
        camera.position.set(o.x + cam.from[0], o.y + cam.from[1], o.z + cam.from[2])
        camera.lookAt(o.x + cam.at[0], o.y + cam.at[1], o.z + cam.at[2])
        if (G.phase === 'lobby' || G.phase === 'queue') lobbyFx.render()
        else postfx.render()
      }
      const src = renderer.domElement
      const c = document.createElement('canvas')
      c.width = width
      c.height = Math.round((width * src.height) / src.width)
      c.getContext('2d').drawImage(src, 0, 0, c.width, c.height)
      await fetch(`./__shot?name=${encodeURIComponent(name)}`, { method: 'POST', body: c.toDataURL('image/jpeg', 0.85) })
      return name
    },
  }
}
