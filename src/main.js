import * as THREE from 'three'
import { ACESFilmicToneMapping, Clock, PCFSoftShadowMap, PerspectiveCamera, Scene, SRGBColorSpace, Vector3, WebGLRenderer } from 'three'
import { AUTO_GRAPHICS, CAMERA, DEV_MODE, graphicsPreset, MATCH, MAPS, NET, RENDER, REWARDS, SPECTATE, TIME_OF_DAY, WEAPONS } from './config.js'
import { createGovernor } from './perf.js'
import { setAnisotropy, setTextureQuality } from './textures.js'
import * as bloxity from './bloxity.js'
import { install as installInput, isLocked, setGameInput, setControlsReleased, inputState } from './input.js'
import { installTouch, setTouchActive, touchShown } from './touch.js'
import { createPlayerBody, interpolate as interpolatePlayer, player as body, resetPlayer } from './player.js'
import { getYaw, setCameraSensitivity, getCameraSensitivity, snapFollow, syncYawToPlayer, update as updateCamera, setView } from './camera.js'
import { initPhysics, stepPhysics } from './physics.js'
import { createLighting } from './lighting.js'
import { createWorld } from './world.js'
import { createPostFx } from './postfx.js'
import { addWarmTarget, compileNow, drawWarm, initWarmup, keepAlive, warmObject, warmScene, warmTargets } from './warmup.js'
import { buildWarmKit } from './game/warmkit.js'
import { frameEnd, frameStart, heap, hitches, span, spanEnd } from './prof.js'
import { prewarmIcons, SVG, svgData } from './game/icons.js'
import { toast as lobbyToast } from './game/party.js'
import { setNeonBloom } from './propkit.js'
import { loadBaseCharacter } from './avatar/character.js'
import { applyProportions } from './avatar/loader.js'
import { PRIO } from './avatar/assets.js'
import { disposeLook, lookFromJson, lookToJson, prewarmLook, streamLook } from './avatar/look.js'
import { buildIsland } from './world/index.js'
import { buildRidge } from './world/ridge/index.js'
import { installAudio, setBreakMuted, setEngine, setListener, setVolume, setDucked, sfx, spatial, updateAmbience } from './audio/index.js'
import { hasEmoteClip, registerEmoteClip } from './avatar/animator.js'
import { G, emit, on } from './game/state.js'
import { initFx, setFxScale, updateFx } from './game/fx.js'
import { buildLoot, useLoot } from './game/loot.js'
import { buildNav, buildNavAsync } from './game/navgrid.js'
import { createMatch, initMatchSystems, spawnActor, teardownMatch, updateMatch } from './game/match.js'
import { endTest, startTest, testStartPose, updateTest } from './game/testRange.js'
import { endDrive, startDrive, startPose as driveStartPose, updateDriveTest } from './game/driveTest.js'
import { clearVehicles, driveCamera, updateVehicles, vehicleFocus, vehicles } from './game/vehicles.js'
import { placeSeated, sendVehicles, syncVehicles } from './game/vehicleNet.js'
import { bindKeys, interactPress, playEmote, updateController, useItem, useUlt, view } from './game/controller.js'
import * as combat from './game/combat.js'
import { selectSlot, startReload } from './game/combat.js'
import hud, { mapOpen } from './game/hud.js'
import { renderMapImage, renderMapShot } from './game/mapimage.js'
import { createLobbyScene } from './game/lobbyScene.js'
import lobby, { initLobby, showLoading } from './game/lobby.js'
import { hideResults, showResults, updateResults } from './game/results.js'
import { startTutorial, stopTutorial, updateTutorial } from './game/tutorial.js'
import { profile } from './game/save.js'
import { connect, disconnect, me, net, onNet, online, reportRoom, send, setJoinOptions } from './net.js'
import { applyState, initOnline, outfitForId, prebuildRemotes, reconcile, remoteAimDir, roster, sendPose, setThree, syncClock, syncLoot, trackRoster } from './game/online.js'
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
// Graphics: 'Auto' (the default) or a preset name, chosen in the lobby (saved) or changed live
// in the portal's menu. Auto = the frame-rate governor's current rung (perf.js).
let quality = null
try {
  quality = localStorage.getItem('ffz.quality')
} catch {
  quality = null
}
const qualityChoice = () => quality || 'Auto'
let bootDone = false // portal graphics values before this are its stored default, not a choice
const governor = createGovernor(() => {
  if (qualityChoice() === 'Auto' && renderer) applyGraphics(currentPreset())
})
function currentPreset() {
  const q = qualityChoice()
  if (q !== 'Auto') return graphicsPreset(q)
  const r = governor.rung
  return graphicsPreset(r.tier, r.dpr)
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
  } else if (key === 'graphics_quality' && renderer && bootDone) {
    quality = value
    governor.setEnabled(qualityChoice() === 'Auto')
    applyGraphics(currentPreset())
  }
}

// Everything a preset can change while the game runs (texture resolution, model detail,
// particle pools and antialias stay as the island was built).
// Shadows on/off and bloom on/off change the shader of every material (bloom: the scene is drawn into
// an HDR target instead of the screen), and a new anisotropy re-uploads every texture. Done mid-round
// that froze the game for seconds (measured 8-10 s on an Intel iGPU), so during a round those parts only
// fade (shadow pass and bloom pass skipped, no shader change) and the real switch waits for the round to
// end (closeMatch), followed by a background warm-up in the lobby. Pixel ratio, view distance and the
// shadow map's size and range apply at once.
let appliedGraphics = null // the preset whose shader-affecting parts are live
let pendingGraphics = null // a preset waiting for the round to end
const shaderChange = (a, b) => !!a && (a.shadows !== b.shadows || a.bloom !== b.bloom || a.anisotropy !== b.anisotropy)
function applyGraphics(next) {
  G.preset = next
  const change = shaderChange(appliedGraphics, next)
  if (G.match && change) {
    const was = appliedGraphics
    pendingGraphics = next
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, next.dpr))
    lighting?.setShadows({ ...next, shadows: was.shadows })
    lighting?.setShadowsActive(was.shadows && next.shadows)
    postfx?.setBloomActive(was.bloom && next.bloom)
    setNeonBloom(was.bloom && next.bloom)
    viewFar = -1
    resize()
    return
  }
  pendingGraphics = null
  appliedGraphics = next
  renderer.shadowMap.enabled = next.shadows
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, next.dpr))
  lighting?.setShadows(next)
  lighting?.setShadowsActive(true)
  postfx?.configure(next)
  lobbyFx?.configure(next)
  setNeonBloom(next.bloom)
  setAnisotropy(Math.min(next.anisotropy, renderer.capabilities.getMaxAnisotropy()))
  viewFar = -1 // updateView() re-applies the view distance next frame
  resize()
  if (change) {
    scheduleWarmup()
    // The lobby scene needs the new shaders at once: compile them in parallel and skip its redraw until
    // they are ready (the menus keep working; a synchronous recompile froze it for ~2 s).
    const lobbyTarget = warmTargets()[1]
    if (lobbyTarget) {
      const hold = warmScene(lobbyTarget, { draw: false }).finally(() => {
        if (lobbyHold === hold) lobbyHold = null
      })
      lobbyHold = hold
    }
  }
}
let lobbyHold = null // a lobby redraw waits for its shaders after a graphics switch

// Shader / texture warm-up (warmup.js) of the game scene and the lobby, run from the lobby: in the
// background (parallel compile, textures on a time budget), then one forced draw of the game scene
// inside a lobby frame (frame() calls it right before the lobby's own render, so nothing shows).
let warmState = '' // '' | 'compile' (wanted) | 'busy' | 'draw' (compiled, the draw is next)
let warmKit = null // sample characters / guns / walls / drops (game/warmkit.js), kept for good
// Not in the first moments after a round or a test closes: without parallel shader compiles (Firefox)
// the warm-up can freeze the page for seconds, and the round's last sounds (the engine fading out,
// the exit click) must finish first or a stalled audio output can keep buzzing them.
let warmNotBefore = 0
function scheduleWarmup() {
  warmState = 'compile'
}
function pumpWarmup() {
  if (performance.now() < warmNotBefore) return
  if (warmState === 'compile') {
    warmState = 'busy'
    const [game, ...rest] = warmTargets()
    Promise.all([warmScene(game, { draw: false, extra: warmKit ? [warmKit] : [] }), ...rest.map((t) => warmScene(t, { draw: false }))])
      .catch((err) => console.warn('[warmup]', err))
      .then(() => {
        if (warmState === 'busy') warmState = 'draw'
      })
  } else if (warmState === 'draw' && !lobbyHold) {
    // (not while the lobby's redraw is held: nothing would cover the draw's cleared screen)
    warmState = ''
    // The local avatar (on the lobby platform) is borrowed for this one draw, then put back.
    const home = avatar?.parent
    drawWarm(warmTargets()[0], [warmKit, home ? avatar : null].filter(Boolean))
    if (home) home.add(avatar)
  }
}

// View distance: fog + camera far plane from the preset; the intro flyover always sees the island.
let viewFar = -1
function updateView() {
  const v = G.preset.view
  const intro = G.phase === 'intro'
  const far = intro ? Math.max(v.far, AUTO_GRAPHICS.introFar) : v.far
  if (far === viewFar) return
  viewFar = far
  const near = intro ? Math.max(v.near, far * 0.35) : v.near
  camera.far = intro ? CAMERA.far : Math.min(CAMERA.far, far * 1.05 + 10)
  camera.updateProjectionMatrix()
  const skyMax = intro ? Infinity : camera.far * 0.9
  lighting.setView(near, far, skyMax)
  world.setViewFit(skyMax / 600) // the farthest cloud is ~600 m from anywhere on the island
}
bloxity.onSetting(applySetting)
// Ad breaks (the portal can start one at any time): audio goes silent here, frame() freezes the game.
bloxity.onAdBreak((on) => setBreakMuted(on))
bloxity.init()

// --- Renderer ---------------------------------------------------------------
const preset = currentPreset()
G.preset = preset
governor.setEnabled(qualityChoice() === 'Auto')
console.info(`[graphics] ${qualityChoice()}${qualityChoice() === 'Auto' ? `: ${governor.rung.tier}${governor.remembered ? ' (remembered)' : ''}; device: ${governor.detected.why}` : ''}`)
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
appliedGraphics = preset
initWarmup(renderer)
addWarmTarget(scene, camera, postfx) // the first target is the game scene
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
window.addEventListener('resize', () => {
  resize()
  governor.hold()
})
resize()
for (const key of Object.keys(bloxity.settings)) {
  if (key === 'graphics_quality') continue // Auto or the lobby's own choice; later portal changes apply live
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
setTextureQuality({ texScale: preset.texScale, anisotropy: Math.min(preset.anisotropy, renderer.capabilities.getMaxAnisotropy()) })
const world = createWorld(scene, preset) // the sea + clouds
showLoading(true, 'Building the island', 0.25)
bloxity.loadingStep('Building the island')
await new Promise((r) => setTimeout(r, 0))
const island = await buildIsland(scene, { lighting, preset }) // Coral Key, the default world
G.island = island
G.world = 'coral'
island.ready = true
showLoading(true, 'Placing supplies', 0.6)
buildLoot(scene, island.lootSpots, 'coral')
createPlayerBody()
body.frozen = true
resetPlayer({ x: island.spawnAreas.blue.x, y: island.groundHeight(island.spawnAreas.blue.x, island.spawnAreas.blue.z) + 0.1, z: island.spawnAreas.blue.z }, 0)
showLoading(true, 'Mapping routes', 0.7)
await new Promise((r) => setTimeout(r, 0))
G.nav = island.nav = buildNav(island)
initFx(scene, preset)
initMatchSystems(scene)
showLoading(true, 'Drawing the map', 0.8)
const mapImg = renderMapImage(renderer, scene, lighting, island.bounds, island.landmarks)
island.mapImg = mapImg
const mapThumb = (() => {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  c.getContext('2d').drawImage(mapImg.clean, 0, 0, 256, 256)
  return c.toDataURL('image/jpeg', 0.8)
})()
// The map vote's cards: each map's district in its own mood, rendered once. Maps on a world that is
// not built yet (Dustline Ridge, built in the background after boot) show a plain card until it is.
const mapShots = MAPS.map((m) => {
  if (m.world !== 'coral') return placeholderShot(m)
  setMood(m)
  return renderMapShot(renderer, scene, lighting, m, island.groundHeight)
})
setMood(MAPS[0])

// --- Worlds -------------------------------------------------------------------------------------------
// Each map is played on a world (MAPS[i].world, WORLDS in config.js): Coral Key (built above) or
// Dustline Ridge (src/world/ridge/, built in the background after boot). Both sit at the origin; only
// the active one is shown and solid (setActive), with its own crates (useLoot), nav grid and map
// picture. G.island is always the active world.
const worlds = { coral: island }
const worldJobs = {}
const WORLD_BUILDERS = { ridge: () => buildRidge(scene, { preset: G.preset }) }
// A card for a map whose world is not built yet: the map's tint over a dusk gradient.
function placeholderShot(m) {
  const c = document.createElement('canvas')
  c.width = 360
  c.height = 416
  const g = c.getContext('2d')
  const sky = g.createLinearGradient(0, 0, 0, 416)
  sky.addColorStop(0, '#3b78c4')
  sky.addColorStop(0.55, '#f1d7ae')
  sky.addColorStop(1, m.tint || '#e0a35a')
  g.fillStyle = sky
  g.fillRect(0, 0, 360, 416)
  g.fillStyle = 'rgba(120, 60, 30, 0.55)'
  g.beginPath()
  g.moveTo(0, 300)
  for (const [x, y] of [[60, 250], [110, 250], [140, 280], [230, 280], [260, 230], [330, 230], [360, 270], [360, 416], [0, 416]]) g.lineTo(x, y)
  g.fill()
  return c.toDataURL('image/jpeg', 0.8)
}
// Shows world `id` (and hides the others) for the next round. Synchronous and cheap.
function activateWorld(id) {
  const w = worlds[id]
  if (!w) return false
  for (const k in worlds) worlds[k].setActive(k === id)
  useLoot(id)
  G.island = w
  G.world = id
  if (w.nav) G.nav = w.nav
  if (w.mapImg) hud.setMapImage(w.mapImg)
  return true
}
// Builds world `id` once (in the background: the builder yields between its stages), then, outside a
// round, switches it on for a moment for its nav grid, map picture and vote cards. Resolves to the world.
function loadWorld(id) {
  if (worlds[id]?.ready) return Promise.resolve(worlds[id])
  if (!WORLD_BUILDERS[id]) return Promise.resolve(null)
  worldJobs[id] ??= (async () => {
    const t0 = performance.now()
    const w = await WORLD_BUILDERS[id]()
    buildLoot(scene, w.lootSpots, id)
    worlds[id] = w
    const built = performance.now() - t0
    // The nav grid, a few rows per macrotask with this world's colliders switched in for each slice
    // (never during a round or the test range: those pause it).
    const t1 = performance.now()
    const busy = () => !!(G.match || G.test)
    const was = G.world
    w.nav = await buildNavAsync(w, { enter: () => activateWorld(id), leave: () => activateWorld(was), pause: busy })
    const tNav = performance.now() - t1
    // The pictures: one synchronous switch.
    while (busy()) await new Promise((r) => setTimeout(r, 400))
    const t2 = performance.now()
    activateWorld(id)
    const maps = MAPS.map((m, i) => [m, i]).filter(([m]) => m.world === id)
    setMood(maps[0]?.[0] ?? MAPS[0])
    w.mapImg = renderMapImage(renderer, scene, lighting, w.bounds, w.landmarks, 1536)
    for (const [m, i] of maps) {
      setMood(m)
      mapShots[i] = renderMapShot(renderer, scene, lighting, m, w.groundHeight)
    }
    setMood(MAPS[0])
    activateWorld(was)
    w.ready = true
    scheduleWarmup() // its textures and the forced draw, from the lobby
    console.info(`[world] ${id}: built in ${Math.round(built)} ms (${JSON.stringify(w.timings)}), nav ${Math.round(tNav)} ms (sliced), pictures ${Math.round(performance.now() - t2)} ms, ${w.lootSpots.length} crates, ${w.colliders} colliders`)
    return w
  })().catch((err) => {
    console.error(`[world] ${id} failed to build`, err)
    delete worldJobs[id]
    return null
  })
  return worldJobs[id]
}

// --- UI ------------------------------------------------------------------------------
hud.init({
  onSlot: (i) => G.player && selectSlot(G.player, i),
  onReload: () => G.player && startReload(G.player),
  onItem: (id) => useItem(id),
  onUlt: () => useUlt(),
  onInteract: () => interactPress(), // the prompt as a button (touch): open supplies; revives are a hold
  onLobby: () => askLeave(), // the exit button and the spectate panel's Lobby
  // Revive (the spectate panel's yellow button, or G): back into the round.
  // The portal's death screen owns the wait: respawn only when it says go (respawn() === true).
  onRespawn: (death) => {
    const p = G.player
    if (!p || p.life !== 'dead' || G.phase !== 'playing') return
    // Portal death screen: respawn only when it says go. Without it: once the short timer is up.
    if (death ? death.respawn?.() : G.time >= p.respawnAt) requestRespawn(true)
    else sfx.deny()
  },
  onSpectate: (dir) => cycleSpectate(dir),
  // Spectator social buttons: a heart / reaction for the watched player, and their public profile.
  onHeart: () => giveHeart(),
  onReact: (id) => sendReaction(id),
  onProfile: () => {
    const a = G.spectating
    if (a?.netId) send('profileOf', { t: a.netId })
  },
  onMapOpen: (open) => {
    if (open) document.exitPointerLock?.()
  },
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
addWarmTarget(lobbyScene.scene, lobbyScene.camera, lobbyFx)
resize()
initLobby({
  onPlay: () => startMatchFlow(),
  onLeaveQueue: () => leaveMatch(),
  // "Leave the team": out of the lobby team (the server also takes this player out of its queue).
  onLeaveTeam: () => {
    send('leaveSquad')
    if (G.phase === 'queue') backToLobby()
  },
  onVote: (map) => send('vote', { map }),
  onRank: (i) => lobbyScene.setRank(i),
  onWindow: (open) => {
    setDucked(open)
    if (G.phase === 'lobby') bloxity.showAdScreen(open ? 'panel' : 'lobby')
  },
  onLoadout: () => lobbyScene.setPlayerAvatar(avatar, loadoutForActor()),
  // The Weapons Store's TEST button: the offline test range.
  onTestWeapon: (weaponId, grenadeId) => enterTest(weaponId, grenadeId),
  onTestDrive: () => enterDrive(),
  getQuality: () => qualityChoice(),
  // What Auto is running right now (for the lobby's label).
  getAutoTier: () => governor.rung.tier,
  setQuality: (q) => {
    quality = q
    try {
      localStorage.setItem('ffz.quality', q)
    } catch {
      // Storage blocked.
    }
    governor.setEnabled(q === 'Auto')
    applyGraphics(currentPreset())
  },
  getSensitivity: () => getCameraSensitivity(),
  setSensitivity: (v) => setCameraSensitivity(v),
  mapThumb: () => mapThumb,
  mapShots: () => mapShots,
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
  return { primary: lo.primary, secondary: lo.secondary, melee: lo.melee || 'knife', skins: { [lo.primary]: lo.skin[lo.primary] || 'standard', [lo.secondary]: lo.skin[lo.secondary] || 'standard' } }
}
function placeAvatarInLobby() {
  if (G.phase === 'lobby' || G.phase === 'queue' || G.phase === 'boot') lobbyScene.setPlayerAvatar(avatar, loadoutForActor())
}
// The local player's Bloxity look (signed in or guest): equipped ids, proportions, outfit key.
function localLook() {
  if (!bloxity.hasSdk()) return {}
  return { equipped: bloxity.getEquippedAvatar(), proportions: bloxity.getProportions(), outfitKey: bloxity.getOutfitKey(), skinTextureUrl: bloxity.getSkinTextureUrl() }
}
// Wears a freshly built Bloxity root: the lobby platform and, mid-round, the player's actor.
function wearAvatar(root) {
  const old = avatar
  avatar = root
  placeAvatarInLobby()
  if (G.player && G.player.avatar === old) {
    G.player.setAvatar(avatar)
    G.player.refreshHeld()
  }
  if (old !== avatar) disposeLook(old)
  avatarReady = true
}
async function loadAvatar() {
  const mine = ++generation
  // The others only need the ids: tell them now, not after our own rig has downloaded (or if it never does).
  sendAvatar()
  try {
    if (!bloxity.hasSdk()) {
      const root = await loadBaseCharacter()
      await warmObject(root) // streamLook does this for the Bloxity looks
      wearAvatar(root)
      return
    }
    // The first usable build is shown at once; streamLook keeps retrying a look with a missing
    // accessory / skin in the background and swaps in the complete one.
    await streamLook(localLook(), { prio: PRIO.local, isStale: () => mine !== generation, onBuilt: (built) => wearAvatar(built.root) })
  } catch (err) {
    console.warn('[avatar] load failed, keeping the default outfit', err)
  } finally {
    if (mine === generation) avatarReady = true
  }
}
// The look the others draw: the whole equipped object (ids, incl. characterId), proportions and the
// outfit key; never asset URLs.
function lookJson() {
  const { equipped, proportions, outfitKey } = localLook()
  return lookToJson({ equipped, proportions, outfitKey })
}
function sendAvatar() {
  send('avatar', { avatar: lookJson(), outfitKey: bloxity.getOutfitKey() || '' })
}
setJoinOptions(() => ({ name: bloxity.displayName() === 'Offline' ? 'Guest' : bloxity.displayName(), pfp: bloxity.getPfp(), avatar: lookJson(), outfitKey: bloxity.getOutfitKey() || undefined }))

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
    send('auth', { token: bloxity.getToken(), name: bloxity.displayName(), pfp: bloxity.getPfp(), inv: bloxity.inviterId() || undefined })
  }
})
bloxity.onAvatarChanged(loadAvatar)
bloxity.onProportionsChanged(() => {
  // A kit-dressed body takes its shape from the outfit key (the new key carries the proportions);
  // custom characters keep their own shape (docs: no proportion sliders on them).
  const handle = avatar.userData?.lookHandle
  if (handle) {
    const gen = generation
    Promise.resolve(handle.update(bloxity.getOutfitKey()))
      .then((ok) => !ok && gen === generation && loadAvatar())
      .catch(() => gen === generation && loadAvatar())
  } else if (!avatar.userData?.customCharacter) applyProportions(avatar, bloxity.getProportions())
  sendAvatar()
})
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
let roundGems = 0 // Gems this round's knocks and eliminations granted (the leave dialog says they stay)
let queuedAt = 0 // when PLAY was sent: the server's answer (inMatch) takes a moment
const RUNNING = new Set(['intro', 'countdown', 'playing', 'ending'])

function setMood(map) {
  lighting.setMoods({ day: TIME_OF_DAY[map.mood] ?? TIME_OF_DAY.day, night: TIME_OF_DAY.night })
}

// PLAY: join the room's next round (or the running one). The server waits for NET.minPlayers.
// The icons a round's HUD and kill feed draw (icons.js prewarmIcons): every gun as the feed shows it,
// and the loadout with its skins as the weapon slots and the weapon card show it.
function prewarmHudIcons() {
  const list = Object.keys(WEAPONS).map((id) => [id, 'standard', 160, 70])
  const lo = profile.loadout
  for (const id of [lo.primary, lo.secondary, lo.melee || 'knife']) {
    if (!WEAPONS[id]) continue
    const skin = lo.skin?.[id] || 'standard'
    list.push([id, skin, 160, 70], [id, skin, 256, 110])
  }
  prewarmIcons(list)
}

async function startMatchFlow() {
  if (G.phase !== 'lobby') return
  prewarmHudIcons() // the loadout may have changed in the shops
  if (!online()) {
    lobby.status('Connecting to the game server…')
    if (!(await connect())) {
      lobby.status('Could not reach the game server — try again.')
      return
    }
  }
  lobby.status('')
  loadWorld('ridge') // usually done already; a round there waits for it
  G.phase = 'queue'
  queuedAt = performance.now()
  send('play', { mode: profile.mode })
  lobby.showQueue(queueInfo())
}

// What the waiting / vote panel shows.
function queueInfo() {
  const st = net.state
  const votes = MAPS.map(() => 0)
  const voters = MAPS.map(() => []) // who picked each map (their heads show on its card)
  let ready = 0
  st?.players?.forEach((p, sid) => {
    if (!p.inMatch) return
    ready++
    if (p.vote >= 0 && p.vote < votes.length) {
      votes[p.vote]++
      voters[p.vote].push({ id: sid, name: p.name, pfp: p.pfp, me: sid === net.sessionId })
    }
  })
  return { phase: st?.phase ?? 'waiting', left: st?.phaseLeft ?? 0, ready, need: NET.minPlayers, votes, voters, mine: me()?.vote ?? -1, maps: MAPS }
}

// The server put this player in a running round: build it here.
function enterRound() {
  const st = net.state
  const mine = me()
  const map = MAPS[st.map] ?? MAPS[0]
  // The round's world must be built here first (Dustline Ridge builds in the background after boot).
  if (!worlds[map.world]?.ready) {
    loadWorld(map.world)
    lobby.showQueue({ ...queueInfo(), loading: map.name })
    return
  }
  activateWorld(map.world)
  currentMap = map
  lobby.hideQueue()
  lobby.show(false)
  setMood(currentMap)
  lobbyScene.releasePlayer()
  let t = span()
  createMatch({ st, me: mine, map: currentMap, playerAvatar: avatar, playerName: mine.name || 'You', playerPortrait: bloxity.getPfp() || portrait(playerOutfit), netId: net.sessionId })
  spanEnd('enter:createMatch', t)
  t = span()
  reconcile()
  spanEnd('enter:reconcile', t)
  t = span()
  syncLoot()
  spanEnd('enter:loot', t)
  t = span()
  compileNow(warmTargets()[0]) // normally nothing left: the lobby's warm-up did it (warmup.js)
  spanEnd('enter:compile', t)
  t = span()
  hud.begin(currentMap.name)
  spanEnd('enter:hud', t)
  hud.show(true)
  startTutorial() // first-round tips, once per account
  bloxity.showAdScreen('gameplay') // gameplay banners are declared off; this just reports the screen
  setGameInput(true)
  setTouchActive(true)
  setDucked(false)
  lastZonePhase = -1
  G.slowmo = 1
  rewards = null
  resultsShown = false
  roundGems = 0
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
  if (G.test) {
    if (mine?.inMatch) exitTest(false) // the team leader pressed PLAY: off to the queue
    else return
  }
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
  // The team leader pressed PLAY: the server queued this player too.
  if (G.phase === 'lobby' && mine.inMatch && performance.now() - leftLobbyAt > 2500) {
    G.phase = 'queue'
    queuedAt = performance.now()
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
  if (G.phase === 'results' && !resultsShown && performance.now() - resultsAt > REWARDS_WAIT) showRoundResults() // no `rewards` came: never leave the player without the Lobby button
  if (sp === 'results' && G.phase !== 'results') toResults()
  else if ((sp === 'vote' || sp === 'waiting') && G.phase === 'results') nextRound()
  else if ((sp === 'vote' || sp === 'waiting') && RUNNING.has(G.phase)) nextRound()
}

let resultsAt = 0 // when the results phase began (the rewards message normally arrives before it)
const REWARDS_WAIT = 1500 // ms to wait for `rewards` before showing the screen with local numbers

// What the screen shows if the server never sent `rewards` (the player was not counted for the round):
// the server-mirrored stats; coins / gems / rank points are unknown here, so 0.
function fallbackRewards() {
  const s = G.player?.stats || {}
  const m = G.match
  return {
    won: net.state?.winner === G.player?.team,
    mvp: false,
    coins: 0,
    gems: 0,
    rp: 0,
    eliminations: s.eliminations || 0,
    knocks: s.knocks || 0,
    assists: s.assists || 0,
    damage: s.damage || 0,
    deaths: s.deaths || 0,
    headshots: s.headshots || 0,
    score: { blue: net.state?.blue ?? m?.score.blue ?? 0, orange: net.state?.orange ?? m?.score.orange ?? 0 },
  }
}

function toResults() {
  G.phase = 'results'
  resultsAt = performance.now()
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
  showResults(net.state?.winner || G.player.team, rewards || fallbackRewards(), leaveMatch)
}

onNet('rewards', (r) => {
  // Left a round in play: the server's penalty settlement arrives after we are back in the lobby.
  if (r?.left) return leaveSummary(r)
  rewards = r
  if (G.phase === 'results') showRoundResults()
})

// The lobby toast after leaving a round in play: what was kept and what it cost.
function leaveSummary(r) {
  const parts = []
  if (r.coins > 0) parts.push(`+${r.coins} coins`)
  if (r.gems > 0) parts.push(`+${r.gems} Gems kept`)
  parts.push(`${r.rp >= 0 ? '+' : ''}${r.rp} rank points`)
  lobbyToast(`You left the match: ${parts.join(', ')}.`, 'info')
}

// The round is over and this player stays for the next one.
function nextRound() {
  closeMatch()
  G.phase = 'queue'
  lobbyScene.rebuildSquad(loadoutForActor())
  resetMates()
  lobbyScene.setPlayerAvatar(avatar, loadoutForActor())
  lobby.show(true) // the vote panel lives in the lobby UI (hidden during the round)
  lobby.showQueue(queueInfo())
  bloxity.showAdScreen('lobby')
}

// Back to the menus (Lobby buttons). Leaving a round in play costs its reward (server leaveMatch);
// the results screen and the queue leave freely.
function leaveMatch() {
  send('leave')
  backToLobby()
}

// The exit button / the spectate panel's Lobby: say what leaving costs, then leave. The round keeps
// going behind the dialog (it is online), so the controls are released while it is open.
function askLeave() {
  const p = G.player
  const sp = net.state?.phase
  if (!G.match || !p || !(G.phase === 'playing' || G.phase === 'countdown' || G.phase === 'intro')) return leaveMatch()
  const coin = `<img alt="" src="${svgData(SVG.coin)}">`
  const gem = `<img alt="" src="${svgData(SVG.gem)}">`
  let lines
  if (sp !== 'playing') {
    lines = ['The round has not started yet, so leaving now costs nothing.']
  } else {
    lines = [
      `You keep the Gems from your knocks and eliminations${roundGems > 0 ? ` (<b>+${roundGems}</b> ${gem})` : ''}.`,
      `You lose the round reward: only half the coins ${coin} from your fighting, and <b>${REWARDS.leavePenaltyRp}</b> rank points.`,
    ]
    if (p.life === 'knocked') lines.push('<span class="warn">You are knocked down: leaving now counts as being eliminated.</span>')
    const mates = G.actors.filter((a) => a !== p && a.team === p.team).length
    lines.push(mates ? 'Your team plays on without you.' : 'You are the last player on your team, so the round ends for everyone.')
  }
  const resume = () => {
    if (!G.match || !(G.phase === 'playing' || G.phase === 'countdown')) return
    setGameInput(true)
    if (!deadControls) setTouchActive(true)
  }
  setGameInput(false)
  setTouchActive(false)
  hud.confirmLeave({ title: 'Leave the match?', lines }, () => leaveMatch(), resume)
}
on('reward', (r) => {
  if (G.match) roundGems += r.gems || 0
})

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

let deadControls = false // camera / touch controls are released while dead
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
  stopTutorial()
  clearVehicles() // a round's vehicles (online; the Test Drive clears its own), before the actors go
  setEngine(null) // (clearVehicles does too; also when there were none)
  warmNotBefore = performance.now() + 1200
  if (G.match) teardownMatch()
  // A graphics switch held back during the round (pendingGraphics) is NOT applied here: it recompiles
  // shaders and re-uploads textures (seconds on a weak GPU) and the lobby is not drawn meanwhile, which
  // left the last results frame frozen on screen. frame() applies it right after the lobby's first frame.
  setGameInput(false)
  setTouchActive(false)
  setMood(MAPS[0])
  inputState.crouch = false
  inputState.aim = false
  G.slowmo = 1
  lockHint.style.display = 'none'
  reportRoom()
}

// --- Weapon Test (offline): from the lobby's Weapons Store, back to it -----------------------------
function enterTest(weaponId, grenadeId) {
  if (G.phase !== 'lobby' || G.match) return
  lobby.show(false)
  lobbyScene.releasePlayer()
  setMood(MAPS[0])
  activateWorld('coral') // the range is out at sea off Coral Key
  G.test = true
  const name = bloxity.displayName() === 'Offline' ? 'You' : bloxity.displayName()
  const start = startTest({ weaponId, grenadeId, playerName: name, playerAvatar: avatar, playerPortrait: bloxity.getPfp() || portrait(playerOutfit), onExit: () => exitTest(true) })
  hud.begin('Test Range')
  hud.setTest(true)
  hud.show(true)
  setGameInput(true)
  setTouchActive(true)
  G.slowmo = 1
  G.phase = 'playing'
  emit('spawn', { actor: start.player, first: true, pos: start.pos, facing: start.facing })
}
function exitTest(toStore) {
  if (!G.test) return
  if (G.drive) return exitDrive()
  endTest()
  G.test = false
  hud.setTest(false)
  backToLobby()
  if (toStore) lobby.openStore()
}

// --- Test Drive (offline): the lobby's TEST DRIVE button, on Dustline Ridge (game/driveTest.js) -------
// G.test is set as for the Weapon Test (no server, local clock, round systems paused) plus G.drive.
let driveStarting = false
async function enterDrive() {
  if (G.phase !== 'lobby' || G.match || driveStarting) return
  driveStarting = true
  try {
    if (!worlds.ridge?.ready) {
      lobby.status('Preparing Dustline Ridge…')
      await loadWorld('ridge')
      lobby.status('')
      if (G.phase !== 'lobby' || G.match || !worlds.ridge?.ready) return
    }
  } finally {
    driveStarting = false
  }
  lobby.show(false)
  lobbyScene.releasePlayer()
  setMood(MAPS.find((m) => m.world === 'ridge') ?? MAPS[0])
  activateWorld('ridge')
  G.test = true
  G.drive = true
  const name = bloxity.displayName() === 'Offline' ? 'You' : bloxity.displayName()
  const start = startDrive({ playerName: name, playerAvatar: avatar, playerPortrait: bloxity.getPfp() || portrait(playerOutfit), onExit: () => exitDrive() })
  hud.begin('Test Drive')
  hud.setTest(true, 'drive')
  hud.show(true)
  setGameInput(true)
  setTouchActive(true)
  G.slowmo = 1
  G.phase = 'playing'
  emit('spawn', { actor: start.player, first: true, pos: start.pos, facing: start.facing })
}
function exitDrive() {
  if (!G.drive) return
  endDrive()
  G.test = false
  G.drive = false
  hud.setTest(false)
  backToLobby()
}

let leftLobbyAt = -1e9 // when this client last went back to the menus (the server's inMatch lags a moment)
function backToLobby() {
  closeMatch()
  bloxity.showAdScreen('lobby')
  G.phase = 'lobby'
  leftLobbyAt = performance.now()
  lobby.hideQueue()
  lobbyScene.rebuildSquad(loadoutForActor())
  resetMates()
  lobbyScene.setPlayerAvatar(avatar, loadoutForActor())
  lobby.show(true)
}

// The lobby platform shows up to three other players in this room. Who stands where (ids + weapons)
// rebuilds the platform; a look change only redresses that one spot, so nobody else flickers back to
// a blocky stand-in. Everyone else in the room is prewarmed for the round.
let matesStruct = ''
let matesEpoch = 0
const mateLooks = [] // per spot: the look key being drawn
function resetMates() {
  // The platform was rebuilt (round over): the spots hold blocky stand-ins again, redress them.
  matesStruct = ''
  mateLooks.length = 0
  matesEpoch++
}
function showMates(list) {
  if (G.phase !== 'lobby' && G.phase !== 'queue') return
  // Only the lobby team stands on the platform (players join it with an invite); the rest of the room
  // is just prewarmed.
  const mySquad = list.find((m) => m.me)?.squad || ''
  const others = list.filter((m) => !m.me && !(mySquad && m.squad === mySquad))
  const shown = mySquad ? list.filter((m) => !m.me && m.squad === mySquad).slice(0, NET.teamMax - 1) : []
  const struct = shown.map((m) => `${m.id}:${m.primary}:${m.secondary}`).join(',')
  if (struct !== matesStruct) {
    matesStruct = struct
    mateLooks.length = 0
    matesEpoch++
    lobbyScene.rebuildSquad(loadoutForActor(), shown.map((m) => ({ outfit: outfitForId(m.id), primary: m.primary, secondary: m.secondary })))
  }
  if (DEV_MODE) return // no Bloxity CDN
  const epoch = matesEpoch
  shown.forEach((m, i) => {
    const key = `${m.outfitKey}|${m.avatar || ''}`
    if (mateLooks[i] === key) return
    mateLooks[i] = key
    streamLook(lookFromJson(m.avatar, m.outfitKey), {
      prio: PRIO.normal,
      isStale: () => epoch !== matesEpoch || mateLooks[i] !== key,
      onBuilt: (built) => lobbyScene.setMateAvatar(i, built.root),
    })
  })
  for (const m of others) prewarmLook(lookFromJson(m.avatar, m.outfitKey))
}

// --- Spectating (eliminated: watch the killer first, then anyone with the arrows) -------------------
// Who can be watched: every other player in the round who is still up (either team), teammates
// first. The server is told (`spectate`) so the watched player's eye counter and hearts work.
function watchable() {
  const p = G.player
  const list = G.actors.filter((a) => a !== p && a.remote && a.life !== 'dead')
  return list.sort((a, b) => (a.team === p.team ? 0 : 1) - (b.team === p.team ? 0 : 1))
}
function spectateActor(a) {
  const next = a && a !== G.player ? a : null
  if (next === G.spectating) return
  G.spectating = next
  send('spectate', { t: next?.netId || '' })
}
function cycleSpectate(dir) {
  const list = watchable()
  if (!list.length) return spectateActor(null)
  const i = list.indexOf(G.spectating)
  spectateActor(list[i < 0 ? 0 : (i + dir + list.length) % list.length])
}
let spectCheckT = 0
// Every frame while dead: the watched player left or went down for good -> the next one.
function updateSpectate(dt) {
  const p = G.player
  if (!p || p.life !== 'dead' || G.phase !== 'playing') return
  spectCheckT -= dt
  const s = G.spectating
  if (s && G.actors.includes(s) && s.life !== 'dead') return
  if (spectCheckT > 0) return
  spectCheckT = SPECTATE.retarget
  cycleSpectate(1)
}
let heartAt = -1e9
function giveHeart() {
  const a = G.spectating
  const now = performance.now()
  if (!a?.netId || G.player?.life !== 'dead' || now - heartAt < SPECTATE.heartGap * 1000) return
  heartAt = now
  send('heart', { t: a.netId })
}
let reactAt = -1e9
function sendReaction(id) {
  const a = G.spectating
  const now = performance.now()
  if (!a?.netId || G.player?.life !== 'dead' || now - reactAt < SPECTATE.reactGap * 1000) return sfx.deny()
  reactAt = now
  send('react', { t: a.netId, e: id })
}

// Lost the room mid-round (the SDK's own reconnect failed): back to the menus; net.js reconnects.
onNet('left', () => {
  hud.setNet(false)
  if (G.phase !== 'lobby') backToLobby()
  lobby.status('Reconnecting to the game server…')
})
onNet('status', (st) => {
  // A drop mid-round: the SDK reconnects and the server keeps the seat for RECONNECT_SECONDS.
  hud.setNet(st === 'connecting' && !!G.match)
  if (st === 'online') lobby.status('')
  else if (st === 'offline') lobby.status(net.error || 'Offline')
})

on('spawn', ({ actor, pos, facing }) => {
  if (!actor.isPlayer) return
  resetPlayer({ x: pos.x, y: pos.y, z: pos.z }, facing)
  syncYawToPlayer(facing)
  setView(facing + Math.PI, CAMERA.startPitch)
  snapFollow()
  spectateActor(null)
  clearDeath()
})
on('elimination', ({ target, killer }) => {
  if (target === G.player) {
    // The camera starts on whoever eliminated us, looking where they look.
    if (killer && killer !== G.player && killer.remote && killer.life !== 'dead') spectateActor(killer)
    else cycleSpectate(1)
    inputState.aim = false
    hud.touch?.syncAim()
    // Required death screen: the portal counts down, the centred Respawn button waits for it.
    if (G.phase === 'playing' && bloxity.hasDeathScreen()) {
      const handle = bloxity.showDeathScreen()
      portalDeath = !!handle
      hud.setDeath(handle)
    }
  }
  // The watched player went down for good: follow whoever got them (a chain of fights), else the next.
  if (G.spectating === target) {
    if (killer && killer !== G.player && killer.remote && killer.life !== 'dead') spectateActor(killer)
    else cycleSpectate(1)
  }
})
on('matchEnd', ({ winner, forfeit, noContest }) => {
  G.slowmo = 0.3
  if (G.phase === 'playing') G.phase = 'ending'
  endGameplay()
  hud.closeLeave()
  if (noContest) hud.announce('NO CONTEST', 'The other team left the match', 2400)
  else if (forfeit && winner === G.player.team) hud.announce('VICTORY!', 'The other team left the match', 2400)
  else hud.announce(winner === G.player.team ? 'VICTORY!' : 'TIME!', winner === G.player.team ? 'Your squad wins the clash' : 'The other squad takes it', 2400)
})
let fellAt = 0
body.onFellOut = () => {
  if (G.test) {
    const s = G.drive ? driveStartPose() : testStartPose()
    resetPlayer({ x: s.pos.x, y: s.pos.y, z: s.pos.z }, s.facing)
    return
  }
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
const specView = { yaw: 0, pitch: 0, set(yaw, pitch) { this.yaw = yaw; this.pitch = pitch; return this } } // the watched player's view
let ambLevel = 0
let skipRender = false // dev stepping without drawing

// The lobby's shaders compile (in parallel) behind the loading screen, so its first frame does not stall;
// the round's shaders and textures are then prepared in the background while the lobby is up.
showLoading(true, 'Preparing graphics', 0.95)
await warmScene(warmTargets()[1], { draw: false })
warmKit = buildWarmKit()
keepAlive(warmKit)
scheduleWarmup()
prewarmHudIcons()
showLoading(false)
G.phase = 'lobby'
lobby.show(true)
// Dustline Ridge builds in the background once the lobby is up (or at once when PLAY is pressed).
setTimeout(() => loadWorld('ridge'), 2500)
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
  let t = span()
  if (G.test) G.time += dt
  else {
    reconcile()
    applyState(dt)
    syncClock(dt)
    syncVehicles() // Dustline Ridge rounds: vehicles, their authority, seats (vehicleNet.js)
  }
  spanEnd('net', t)

  // Player input -> physics -> our pose to the server -> local timers
  t = span()
  if (p && G.phase !== 'results') updateController(gdt, hud)
  spanEnd('controller', t)
  if (G.phase === 'intro' || G.phase === 'countdown' || G.phase === 'results') body.frozen = true
  t = span()
  stepPhysics(gdt)
  spanEnd('physics', t)
  interpolatePlayer()
  if (p) {
    const r = body.renderPosition
    if (p.life !== 'dead' || G.phase === 'results') p.pos.set(r.x, r.y, r.z)
    p.vel.set(body.velocity.x, body.velocity.y, body.velocity.z)
    p.grounded = body.grounded
    if (p.life !== 'dead' && G.phase !== 'results') p.facing = body.facing
  }
  if (p && G.phase !== 'results' && !G.test) {
    sendPose(dt)
    sendVehicles(dt)
  }
  if (G.test) updateTest(gdt, camera)
  if (vehicles.length) {
    updateVehicles(gdt)
    if (!G.test) placeSeated() // other players in seats sit on their vehicle's drawn seat
  }
  if (G.drive) updateDriveTest(gdt, camera)
  t = span()
  if (G.phase === 'playing' || G.phase === 'ending') updateMatch(gdt)
  spanEnd('match', t)

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
  t = span()
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
  spanEnd('models', t)
  t = span()
  updateFx(gdt)
  spanEnd('fx', t)

  // Camera
  const watching = p && p.life === 'dead' && G.spectating ? G.spectating : p
  if (G.phase === 'intro') {
    const k = introT / MATCH.introFlyover
    // The flyover opens on the voted map's district and sweeps in to the player.
    const [fx, fz] = currentMap.focus ?? [0, 0]
    introLook.set(fx + (p.pos.x - fx) * k, 0, fz + (p.pos.z - fz) * k)
    updateCamera(camera, dt, { mode: 'orbit', time: introT * 2 + 1, distance: 150 - 110 * k, height: 95 - 70 * k, lookAt: introLook })
  } else if (G.phase === 'results') {
    const pose = updateResults(dt, camera)
    updateCamera(camera, dt, { mode: 'look', from: pose.from, lookAt: pose.lookAt })
  } else if (p?.seat?.drive && p.life !== 'dead') {
    // Driving: the chase camera on the vehicle (camera.js opts.drive). Passengers keep the shooter camera.
    updateCamera(camera, dt, { mode: 'play', target: vehicleFocus(), drive: driveCamera() })
  } else if (p) {
    const scoped = view.scoped && G.phase === 'playing'
    updateCamera(camera, dt, {
      mode: p.life === 'dead' ? (G.spectating ? 'spectate' : 'play') : scoped ? 'scope' : 'play',
      target: watching.pos,
      aim: p.aiming && G.phase === 'playing',
      zoomFov: p.def.zoom,
      crouch: watching.crouch,
      knocked: watching.life === 'knocked',
      noLook: p.life === 'dead', // dead: camera control exits
      // Spectating: look where the watched player looks (their pose yaw + pitch).
      view: p.life === 'dead' && G.spectating ? specView.set(watching.facing + Math.PI, watching.pitch || 0) : null,
    })
  }
  setFxScale(renderer.domElement.height / 2 / Math.tan((camera.fov * Math.PI) / 360))
  setListener(camera.position.x, camera.position.y, camera.position.z, getYaw())

  // Dead: the camera / touch controls exit (cursor freed, touch layer hidden so it can't cover the
  // Respawn button); they come back when the player respawns.
  const deadNow = !!p && p.life === 'dead' && G.phase === 'playing'
  if (deadNow !== deadControls) {
    deadControls = deadNow
    setControlsReleased(deadNow)
    if (deadNow) setTouchActive(false)
    else if (G.phase === 'playing' || G.phase === 'countdown') setTouchActive(true)
  }

  if (p && (G.phase === 'playing' || G.phase === 'countdown' || G.phase === 'ending')) {
    // Without the portal the Revive button works after NET.respawnFallback; an idle player is put back
    // in after NET.autoRespawn anyway.
    if (p.life === 'dead' && G.phase === 'playing' && !portalDeath && G.time >= Math.max(p.respawnAt, p.autoRespawnAt || 0)) requestRespawn()
    updateSpectate(dt)
    t = span()
    hud.update(dt, camera, { scoped: view.scoped && G.phase === 'playing', spread: view.spread, onEnemy: view.onEnemy, prompt: view.prompt, yaw: getYaw(), touch: touchShown() })
    spanEnd('hud', t)
    updateTutorial(dt)
  }
  lockHint.style.display = G.phase === 'playing' && !isLocked() && !touchShown() && p?.life !== 'dead' && !mapOpen() ? 'block' : 'none'

  focus.copy(watching ? watching.pos : camera.position)
  if (G.phase === 'intro') focus.set(0, 0, 0)
  t = span()
  updateView()
  world.update(dt, clock.elapsedTime, camera.position)
  G.island.update?.(dt, clock.elapsedTime)
  lighting.update(dt, focus)
  const shore = Math.max(0, Math.min(1, (Math.hypot(focus.x, focus.z) - (G.island.radius - 35)) / 30))
  ambLevel += (1 - ambLevel) * Math.min(1, dt)
  updateAmbience(dt, ambLevel, shore)
  spanEnd('world', t)
  t = span()
  if (!skipRender) postfx.render()
  spanEnd('render', t)
}

let governedPhase = ''
function frame(dt) {
  if (showFps && dt > 0) {
    fpsAcc += dt
    fpsFrames++
    if (fpsAcc >= 0.5) {
      fpsEl.textContent = `${Math.round(fpsFrames / fpsAcc)} FPS${qualityChoice() === 'Auto' ? ` · Auto ${governor.rung.tier}` : ''}`
      fpsAcc = 0
      fpsFrames = 0
    }
  }
  // Auto graphics: time the frames of a round (not the menus, the intro or the results).
  if (G.phase !== governedPhase) {
    governedPhase = G.phase
    governor.hold()
  }
  governor.update(dt, G.phase === 'playing' || G.phase === 'countdown')
  // Ad break: nothing advances (simulation, match clock, audio is muted) until it ends.
  // The room keeps running on the server: only this client's drawing and input pause.
  if (bloxity.isAdBreak()) {
    if (!skipRender) (G.phase === 'lobby' || G.phase === 'queue' ? lobbyFx : postfx).render()
    return
  }
  frameStart(G.phase)
  let t = span()
  syncFlow()
  spanEnd('syncFlow', t)
  rosterT -= dt
  if (rosterT <= 0) {
    rosterT = G.phase === 'lobby' || G.phase === 'queue' ? 0.25 : 1 // the lobby's team + invites feel live
    t = span()
    const list = roster()
    lobby.setRoster(list, net.status)
    showMates(list)
    if (G.phase === 'queue') prebuildRemotes() // the next round's other players, built in idle time
    spanEnd('roster', t)
  }
  if (G.phase === 'lobby' || G.phase === 'queue') {
    t = span()
    lobbyScene.update(dt)
    spanEnd('lobbyScene', t)
    t = span()
    pumpWarmup()
    spanEnd('warmup', t)
    t = span()
    if (!lobbyHold) {
      lobbyFx.render()
      // The lobby is on the canvas now: a switch held back during the round can freeze it safely.
      if (pendingGraphics && !G.match && !skipRender) applyGraphics(pendingGraphics)
    }
    spanEnd('render', t)
    lobby.placePlates(lobbyScene.anchors())
    ambLevel = 0
    updateAmbience(dt, 0, 0)
  } else gameFrame(dt)
  frameEnd()

  if (shownLoading) {
    readySince += dt
    if (avatarReady || readySince > 5) {
      shownLoading = false
      bloxity.notifyFirstFrame()
    }
  }
}
bootDone = true
renderer.setAnimationLoop(() => frame(Math.min(clock.getDelta(), 0.1)))

window.addEventListener('beforeunload', () => {
  disconnect() // a deliberate leave: the server drops the seat at once instead of holding it
  bloxity.teardown()
})

// Dev-only console hook.
if (import.meta.env.DEV || location.search.includes('debug')) {
  window.__game = {
    G, scene, renderer, camera, body, governor, applyGraphics, currentPreset, lobbyScene, WEAPONS, profile, sfx, inputState, setView, useItem, hud, combat,
    get island() {
      return G.island
    },
    worlds,
    loadWorld,
    activateWorld,
    hitches, // frames over 50 ms with their slowest parts (prof.js); heap: allocation per frame + GC count
    heap,
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
    // The store's TEST button: the offline Weapon Test range with a weapon (or a grenade id).
    test: (weaponId, grenadeId = null) => enterTest(weaponId, grenadeId),
    drive: () => enterDrive(),
    exitDrive: () => exitDrive(),
    vehicles,
    exitTest: () => exitTest(false),
    net,
    teleport: (x, z, facing = 0) => {
      resetPlayer({ x, y: G.island.groundHeight(x, z) + 0.3, z }, facing)
      if (G.player) G.player.pos.set(x, G.island.groundHeight(x, z), z)
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
