// Every tunable constant lives here; the rest of src/ holds no theme values.
// (The island's own layout data lives with its builder in src/world/.)

// --- Identity -------------------------------------------------------------
export const GAME_SLUG = 'free-fire-zone' // slug registered on bloxity.io
export const GAME_TITLE = 'Free Fire Zone'

// Forces the Bloxity SDK and avatar CDN to be treated as unavailable (see .env.example).
export const DEV_MODE = import.meta.env.VITE_DEV_MODE === 'true'

// --- World (metres: +X east, +Z south, +Y up) -------------------------------
export const WATER = { level: -0.6, size: 1400, color: '#12a9e6', shallow: '#7ff0ff' }
export const SPAWN = { x: 0, y: 0.05, z: 8 }
export const SPAWN_FACING = Math.PI // yaw the character faces on spawn (PI = toward -Z)

// --- Physics (physics.js, player.js, actors) ----------------------------------
export const PHYSICS = {
  gravity: -22, // m/s^2 for dynamic bodies and the characters
  fixedStep: 1 / 60, // s per physics tick; rendering interpolates between ticks
  maxSubSteps: 5, // a long frame never runs more ticks than this
  walkSpeed: 6.2, // m/s running (the default pace)
  sprintSpeed: 8.6, // m/s with Shift held / RUN on
  aimSpeed: 3.6, // m/s while aiming down sights
  crouchSpeed: 3, // m/s crouched
  crawlSpeed: 1.3, // m/s knocked down
  accel: 60, // m/s^2 toward the target velocity on the ground
  airAccel: 18, // m/s^2 steering while airborne
  decel: 55, // m/s^2 when no key is held
  turnSpeed: 14, // rad/s the body turns toward its heading
  jumpSpeed: 7.6, // m/s
  coyoteTime: 0.1, // s after leaving a ledge a jump still counts
  jumpBuffer: 0.12, // s a jump pressed before landing is remembered
  stepHeight: 0.45, // m autostep
  maxSlope: 50, // degrees a character can walk up
  snapToGround: 0.4, // m the controller stays glued to downward steps and slopes
  pushMass: 80, // kg the character weighs when shoving crates
  killY: -6, // sank this far: back to a spawn point
}
export const PLAYER_DIMS = { radius: 0.45, height: 1.8, crouchHeight: 1.25 } // capsule the character controller moves

// --- Look ------------------------------------------------------------------
export const RENDER = { exposure: 1.0 }
export const FOG = { near: 160, far: 620 }
// The lighting moods (lighting.js blends `day` <-> `night`; the map vote swaps the day slot).
export const TIME_OF_DAY = {
  transition: 2.5, // s to blend day <-> night
  day: {
    zenith: '#1576f0',
    horizon: '#a9e2ff',
    sunColor: '#fff4de',
    sunIntensity: 2.5,
    sunElevation: 52, // degrees above the horizon
    sunAzimuth: 35, // degrees, 0 = from +Z
    hemiSky: '#e4f2ff',
    hemiGround: '#a4c48a',
    hemiIntensity: 0.85,
    envIntensity: 0.5,
    lampIntensity: 0,
    stars: 0,
    exposure: 0.98,
  },
  sunset: {
    zenith: '#2e4fa8',
    horizon: '#ffb47a',
    sunColor: '#ffc283',
    sunIntensity: 2.2,
    sunElevation: 13,
    sunAzimuth: 74,
    hemiSky: '#ffd6b8',
    hemiGround: '#6f5a46',
    hemiIntensity: 0.62,
    envIntensity: 0.45,
    lampIntensity: 14,
    stars: 0.1,
    exposure: 1.0,
  },
  // Dustline Ridge: a hot, hazy afternoon (sandy horizon and fog, warm sun, ochre bounce light).
  desert: {
    zenith: '#2a78d0',
    horizon: '#f1d7ae',
    sunColor: '#ffe6bf',
    sunIntensity: 2.6,
    sunElevation: 44,
    sunAzimuth: 128,
    hemiSky: '#fbe9cf',
    hemiGround: '#c49a68',
    hemiIntensity: 0.8,
    envIntensity: 0.5,
    lampIntensity: 0,
    stars: 0,
    exposure: 0.96,
  },
  night: {
    zenith: '#050b22',
    horizon: '#24345e',
    sunColor: '#9fb4ff', // the moon
    sunIntensity: 0.75,
    sunElevation: 38,
    sunAzimuth: -60,
    hemiSky: '#3a4c80',
    hemiGround: '#1a1a22',
    hemiIntensity: 0.45,
    envIntensity: 0.3,
    lampIntensity: 30,
    stars: 1,
    exposure: 1.25,
  },
}
export const LIGHT = {
  shadowRange: 45, // half-width of the sun's shadow box around the player
  lampColor: '#ffb35c',
  lampDistance: 22,
}

// Default (fallback) character look, used only when player.glb cannot load.
export const CHARACTER_COLORS = { skin: '#f2c79a', suit: '#2b2f3a', hair: '#3a2416' }

export const MATERIAL_PBR = {
  PLAYER: { roughness: 0.7, metalness: 0 },
  GROUND: { roughness: 0.95, metalness: 0 },
}

// --- Graphics presets, picked by the lobby / Bloxity graphics_quality setting ----
// Live (any time): shadows, shadowMap, shadowRange (m, half-width of the sun's shadow
// box), dpr, bloom, view (fog near/far in m; the camera draws no further than far),
// anisotropy. Load time (the island is built once): antialias, particles (effect
// pools), texScale (world texture resolution), detail (vegetation density, curve
// segments, lamp lights, small-prop shadows).
export const GRAPHICS_PRESETS = {
  Low: { shadows: false, shadowMap: 512, shadowRange: 30, antialias: false, dpr: 1, bloom: false, particles: 0.35, view: { near: 70, far: 240 }, anisotropy: 1, texScale: 0.5, detail: 0.4 },
  Medium: { shadows: true, shadowMap: 1024, shadowRange: 35, antialias: false, dpr: 1.25, bloom: false, particles: 0.6, view: { near: 110, far: 380 }, anisotropy: 4, texScale: 1, detail: 0.65 },
  High: { shadows: true, shadowMap: 2048, shadowRange: 45, antialias: true, dpr: 2, bloom: true, particles: 1, view: { near: 160, far: 620 }, anisotropy: 8, texScale: 1, detail: 1 },
  Ultra: { shadows: true, shadowMap: 4096, shadowRange: 60, antialias: true, dpr: 2, bloom: true, particles: 1, view: { near: 200, far: 800 }, anisotropy: 16, texScale: 1, detail: 1 },
}
// What the lobby's Graphics row offers; 'Auto' is the default.
export const QUALITY_OPTIONS = ['Auto', ...Object.keys(GRAPHICS_PRESETS)]

// Auto graphics (perf.js): a starting level guessed from the device, then a frame-rate
// governor that walks LADDER (best first) one rung at a time during a round.
export const AUTO_GRAPHICS = {
  // tier + an optional pixel-ratio cap on top of the tier's own dpr.
  ladder: [
    { tier: 'Ultra' },
    { tier: 'High' },
    { tier: 'High', dpr: 1.5 },
    { tier: 'Medium' },
    { tier: 'Medium', dpr: 1 },
    { tier: 'Low' },
    { tier: 'Low', dpr: 0.85 },
    { tier: 'Low', dpr: 0.7 },
  ],
  // Phones and tablets: the same idea with finer pixel-ratio steps. Resolution is what the governor gives up
  // first (view distance, textures and the tier's other settings stay), because a phone's screen is 2-3 px per
  // CSS px and the cheap way to stay smooth is to render fewer of them, not to draw a shorter world.
  touchLadder: [
    { tier: 'High' },
    { tier: 'High', dpr: 1.75 },
    { tier: 'Medium' },
    { tier: 'Medium', dpr: 1.75 },
    { tier: 'Medium', dpr: 1.5 },
    { tier: 'Low', dpr: 1.5 },
    { tier: 'Low', dpr: 1.25 },
    { tier: 'Low', dpr: 1 },
    { tier: 'Low', dpr: 0.85 },
  ],
  window: 3, // s of frames averaged per decision
  settle: 2.5, // s ignored after a change / a phase change (shader compiles hitch)
  down: { desktop: 45, touch: 28 }, // average FPS below this: one rung down
  up: { desktop: 57, touch: 50 }, // at or above this for upAfter seconds: one rung up
  upAfter: 12,
  cooldown: 45, // s before retrying a rung the governor had to leave (doubles each time)
  introFar: 460, // m the intro flyover always sees, whatever the tier
}

// Bloom (postfx.js): only HDR-bright pixels (above threshold, linear, before
// tone mapping) glow: muzzle flashes, tracers, explosions, neon, loot beams.
export const BLOOM = { strength: 0.65, radius: 0.4, threshold: 1.6 }
// Neon materials (propkit.js): k = HDR colour multiplier with bloom on; with
// bloom off they are capped at plainMax so they stay coloured, not white.
export const NEON = { k: 3.5, plainMax: 1.2 }

// Phones and tablets default to a lighter preset when the portal sends no value,
// and any preset is capped there.
export const COARSE_POINTER = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
export const DEFAULT_GRAPHICS = COARSE_POINTER ? 'Medium' : 'High'
// dpr: phones render at up to 2x (a 3x screen at 1.5x looked blurry and jagged); every tier starts there and
// Auto's touchLadder lowers it when the frame rate asks. antialias: MSAA on the screen's own framebuffer is
// cheap on a phone's tiled GPU (no bloom composer there), and it removes most of the stair-stepping.
export const MOBILE_GRAPHICS_CAP = { dpr: 2, shadowMap: 1024, particles: 0.6, anisotropy: 4 }

// The preset to render with on this device. dprCap: an extra pixel-ratio cap (Auto's lower rungs).
export function graphicsPreset(name, dprCap = Infinity) {
  let p = GRAPHICS_PRESETS[name] ?? GRAPHICS_PRESETS[DEFAULT_GRAPHICS]
  if (COARSE_POINTER) {
    const cap = MOBILE_GRAPHICS_CAP
    p = { ...p, dpr: p === GRAPHICS_PRESETS.Low ? 1.5 : cap.dpr, antialias: true, shadowMap: Math.min(p.shadowMap, cap.shadowMap), bloom: false, particles: Math.min(p.particles, cap.particles), anisotropy: Math.min(p.anisotropy, cap.anisotropy) }
  }
  return dprCap < p.dpr ? { ...p, dpr: dprCap } : p
}

// --- Touch controls (touch.js) --------------------------------------------------
export const TOUCH = {
  deadZone: 0.12, // fraction of the joystick radius that does nothing
  lookScale: 1.35, // touch drag pixels -> look, relative to a mouse pixel
  sprintPush: 0.92, // joystick pushed past this fraction of its radius sprints
}

// --- Camera (camera.js): over-the-shoulder shooter cam ---------------------------
export const CAMERA = {
  fov: 72,
  near: 0.08,
  far: 1200,
  startPitch: 0.14, // radians, + = looking down
  minPitch: -1.25,
  maxPitch: 1.2,
  distance: 4.6, // boom length, m
  aimDistance: 2.3, // boom length while aiming down sights
  shoulder: 0.9, // m the camera sits to the right of the character
  aimShoulder: 0.78,
  height: 2.12, // m above the feet the boom pivots (over the head: the crosshair clears the character)
  aimHeight: 1.86,
  crouchHeight: 1.15,
  knockedHeight: 0.9,
  aimFov: 52, // degrees when aiming without a scope
  fitAspect: 0.9, // narrower screens (portrait) widen every FOV so the sides stay in view (camera.js fitFov)
  fitMax: 98, // degrees: the widest the normal view gets on a tall screen
  aimEase: 14, // 1/s the aim zoom glides
  followLerp: 22, // 1/s smoothing on the followed point
  lookSensitivity: 0.0024, // rad per pixel of mouse movement
  aimSensitivity: 0.6, // look multiplier while aiming (scopes scale further by their zoom)
  clearEase: 8, // 1/s the boom eases back out once a wall stops blocking it
  shakeDecay: 7, // 1/s camera shake fades
  spectateDistance: 5.2,
  spectateEase: 7, // 1/s: how fast the spectate camera turns to the watched player's view
  results: { distance: 7.5, height: 1.6 },
}

// --- Audio (audio/) -------------------------------------------------------------
export const AUDIO = {
  volume: 0.8,
  storageKey: 'free-fire-zone.sound',
  buses: { ui: 0.8, sfx: 0.95, amb: 0.5, engine: 0.4 },
  duck: 0.45, // world level while a menu is open
  maxVoices: 56,
  maxVoicesTouch: 28,
  latency: 0.04,
  latencyTouch: 0.07,
  lead: 0.015,
  reverb: { seconds: 1.6, preDelay: 0.01, early: [[17, 0.45], [29, 0.32], [43, 0.25], [67, 0.18], [91, 0.1]], decay: 1.2, tail: 0.16, darken: 1.8, send: 0.7 },
  hearing: 140, // m beyond which other players' shots are silent
}

// --- Bloxity (bloxity.js, avatar/) -------------------------------------------------
export const SETTINGS = {
  graphics_quality: { def: 'Auto', type: 'enum', values: QUALITY_OPTIONS },
  camera_sensitivity: { def: '1', type: 'number', min: 0.1, max: 5 },
  show_fps: { def: 'false', type: 'bool' },
  fullscreen: { def: 'false', type: 'bool' },
  master_volume: { def: '80', type: 'number', min: 0, max: 100 },
}

// Leaderboards (declared by bloxity.js initLeaderboards; the server's reporters.ts submits the
// scores). Ids are permanent once the portal has created a board; later edits here are ignored
// (the dashboard owns them). `sum` boards receive only what a match added. Up to 10 boards.
export const LEADERBOARDS = [
  { id: 'eliminations', label: 'Total eliminations', order: 'desc', mode: 'sum', format: 'compact', reset: 'none' },
  { id: 'wins', label: 'Match wins', order: 'desc', mode: 'sum', format: 'number', reset: 'none' },
  { id: 'best_match', label: 'Best match (eliminations)', order: 'desc', mode: 'best', format: 'number', reset: 'none' },
  { id: 'weekly_elims', label: 'Eliminations this week', order: 'desc', mode: 'sum', format: 'compact', reset: 'weekly' },
]

// Online play (net.js, online.js). The game server is the backend repo's MatchRoom ("match").
// Keep roomSize / teamMax / minPlayers / respawn in step with its src/constants.ts.
export const NET = {
  room: 'match',
  roomSize: 6, // connections per room (the lobby) = a round's seats (2 x teamMax): nobody queues, the matchmaker opens another room
  teamMax: 3, // players per side in a round (a round has 6)
  minPlayers: 2, // a round starts once this many have pressed Play
  // Local development without the Bloxity SDK: the backend's `npm start`.
  devServer: import.meta.env.VITE_SERVER_URL || '',
  devPort: 2567,
  poseHz: 20, // pose messages per second
  interpDelay: 0.1, // s other players are drawn behind their newest pose
  connectTimeout: 60, // s of retrying before giving up (cold start can take ~45 s)
  respawnFallback: 5, // s before the Revive button works when there is no portal death screen
  autoRespawn: 20, // s after an elimination without the portal: respawn even if Revive was not pressed (AFK)
  missedSpawnGrace: 0.7, // s the server may show us alive before a lost 'spawn' message is assumed and we respawn locally
}

// Ad screens declared once after init (bloxity.js). All in-game banners stay off (they covered the
// 3D hangar view); ads only appear on the Bloxity portal's own loading screen.
export const AD_SCREENS = {
  lobby: { show: false },
  panel: { show: false },
  results: { show: false },
  gameplay: { show: false },
}
// Screens that must never show an ad: showAdScreen hides any ad instead of requesting one.
export const NO_AD_SCREENS = ['lobby', 'panel', 'results', 'gameplay']

// The base rig, measured from player.glb: origin at the feet, 6.4 units tall at bind pose.
export const RIG_HEIGHT = 6.4
export const RIG = { armOffsetX: 2, legOffsetX: 0.6, neckOffsetY: 0.6 }
export const PROPORTIONS = {
  height: { def: 1, min: 0.5, max: 1.6 },
  shoulderWidth: { def: 1, min: 0.5, max: 1.5 },
  armLength: { def: 1, min: 0.05, max: 3 },
  legOffsetX: { def: 1, min: -0.7, max: 5 },
  torsoScaleX: { def: 1, min: 0.3, max: 2 },
  neckHeight: { def: 1, min: 0.94, max: 1.2 },
  headScale: { def: 1, min: 0.3, max: 2.6 },
}

// Procedural animation (avatar/animator.js).
// Rotations are radians in CHARACTER space: +X swings a limb backward, +Y yaws, +Z rolls.
const deg = (d) => (d * Math.PI) / 180
export const ANIM = {
  airborneDelay: 0.07,
  locomotion: {
    minFrequency: 0.7,
    maxFrequency: 3.4,
    strideDistance: 3.4, // m per cycle
    idleSpeed: 0.6,
    walkSpeed: 2.5,
    runSpeed: 6.2,
    sprintSpeed: 8.6,
    hipSwing: { walk: deg(22), run: deg(40), sprint: deg(54) },
    kneeBend: { walk: deg(30), run: deg(58), sprint: deg(72) },
    armSwing: { walk: deg(18), run: deg(36), sprint: deg(52) },
    elbowBend: { walk: deg(14), run: deg(44), sprint: deg(70) },
    torsoTwist: { walk: deg(4), run: deg(7), sprint: deg(9) },
    torsoLean: { walk: deg(3), run: deg(9), sprint: deg(16) },
    headCounterTwist: { walk: deg(2), run: deg(4), sprint: deg(5) },
    torsoRoll: { walk: deg(2), run: deg(3), sprint: deg(3) },
    bob: { walk: 0.03, run: 0.06, sprint: 0.08 },
    bankAngle: deg(8),
    bankRate: 8,
  },
  idle: {
    breathFrequency: 0.35,
    breathAmount: deg(1.8),
    breathBob: 0.007,
    basePose: {
      ArmL1: { x: deg(-4), z: deg(8) },
      ArmL2: { x: deg(12) },
      ArmR1: { x: deg(-4), z: deg(-8) },
      ArmR2: { x: deg(12) },
      LegL1: { x: deg(-4) },
      LegR1: { x: deg(4) },
    },
  },
  airborne: {
    rise: {
      LegL1: { x: deg(-38) }, LegR1: { x: deg(8) }, LegL2: { x: deg(62) }, LegR2: { x: deg(40) },
      ArmL1: { x: deg(-40), z: deg(34) }, ArmR1: { x: deg(-30), z: deg(-34) },
      ArmL2: { x: deg(30) }, ArmR2: { x: deg(30) }, Spine1: { x: deg(6) },
    },
    fall: {
      LegL1: { x: deg(-14) }, LegR1: { x: deg(10) }, LegL2: { x: deg(22) }, LegR2: { x: deg(18) },
      ArmL1: { x: deg(-70), z: deg(40) }, ArmR1: { x: deg(-60), z: deg(-40) },
      ArmL2: { x: deg(20) }, ArmR2: { x: deg(20) }, Spine1: { x: deg(-4) },
    },
    velocityReference: 8,
  },
  landing: {
    duration: 0.16,
    pose: {
      LegL1: { x: deg(-34) }, LegR1: { x: deg(-34) }, LegL2: { x: deg(58) }, LegR2: { x: deg(58) },
      ArmL1: { x: deg(-18), z: deg(20) }, ArmR1: { x: deg(-18), z: deg(-20) }, Spine1: { x: deg(14) },
    },
    bobY: -0.2,
  },
  // Crouched legs (blended in by crouch weight) and how far the body sinks (m).
  crouch: {
    pose: { LegL1: { x: deg(-62) }, LegR1: { x: deg(-30) }, LegL2: { x: deg(96) }, LegR2: { x: deg(70) }, Spine1: { x: deg(12) } },
    drop: 0.25,
  },
  // Upper body while holding a weapon (overrides the arm swing).
  aim: {
    rifle: { ArmR1: { x: deg(-82), y: deg(18) }, ArmR2: { x: deg(-10) }, ArmL1: { x: deg(-86), y: deg(-42) }, ArmL2: { x: deg(-8) } },
    pistol: { ArmR1: { x: deg(-88), y: deg(10) }, ArmR2: { x: deg(-2) }, ArmL1: { x: deg(-84), y: deg(-30) }, ArmL2: { x: deg(-4) } },
    melee: { ArmR1: { x: deg(-30), z: deg(-12) }, ArmR2: { x: deg(-40) } },
    fist: { ArmR1: { x: deg(-60), z: deg(-8) }, ArmR2: { x: deg(-70) }, ArmL1: { x: deg(-60), z: deg(8) }, ArmL2: { x: deg(-70) } },
    pitchFollow: 0.85, // share of the view pitch the arms follow
  },
  emotes: {
    wave: { duration: 2.4 },
    dance: { duration: 4 },
    salute: { duration: 2.2 },
    flex: { duration: 2.6 },
    cheer: { duration: 2.6 },
  },
  emoteLoopMax: 8, // s a looping catalogue emote (or one whose clip has not loaded) plays; see emoteLength in animator.js
  transitions: { toLocomotion: 0.14, toAirborne: 0.12, toLanding: 0.06 },
}

export const FONT_FAMILY = 'Fredoka'

// --- Weapons -------------------------------------------------------------------
// slot: primary / secondary / melee. damage per bullet (pellets for shotguns) vs 200 HP.
// interval = s between shots; spread = degrees of cone (hip / aimed); recoil = degrees of kick per shot;
// zoom = aimed FOV (scoped weapons draw the scope overlay when zoom <= scopeFov);
// price in COINS (earned by playing). Nothing is ever sold for premium currency.
export const WEAPONS = {
  striker: { name: 'Striker AR', cat: 'rifle', slot: 'primary', kind: 'rifle', hold: 'rifle', damage: 34, interval: 0.1, mag: 30, reserve: 150, reload: 2.1, spread: [2.4, 0.55], recoil: 0.7, range: 140, headMul: 2, auto: true, zoom: 52, price: 0, model: 'ar', icon: 'AR', desc: 'The all-round starter rifle: steady full-auto fire that works at most ranges.' },
  ridgeback: { name: 'Ridgeback', cat: 'rifle', tier: 'basic', slot: 'primary', kind: 'rifle', hold: 'rifle', damage: 41, interval: 0.125, mag: 30, reserve: 150, reload: 2.4, spread: [2.8, 0.7], recoil: 1, range: 150, headMul: 2, auto: true, zoom: 50, price: 1500, model: 'ridge', icon: 'RB', desc: 'Hard-hitting battle rifle: fewer shots to drop a target, but it kicks. Tap-fire it at range.' },
  kestrel: { name: 'Kestrel BP', cat: 'rifle', slot: 'primary', kind: 'rifle', hold: 'rifle', damage: 33, interval: 0.095, mag: 30, reserve: 150, reload: 2.2, spread: [2, 0.45], recoil: 0.6, range: 160, headMul: 2, auto: true, zoom: 46, pierce: 0.5, price: 1800, model: 'bullpup', icon: 'KBP', desc: 'Fast, stable bullpup with armour-piercing rounds: vests and helmets stop half as much of its damage.' },
  tempest: { name: 'Tempest LMG', cat: 'rifle', slot: 'primary', kind: 'lmg', hold: 'rifle', damage: 31, interval: 0.085, mag: 60, reserve: 180, reload: 3.4, spread: [3.2, 1.3], recoil: 0.6, range: 130, headMul: 1.8, auto: true, zoom: 52, price: 2400, model: 'lmg', icon: 'LMG', desc: 'A 60-round belt for holding a lane. Long reload: pick your moment.' },
  marksman: { name: 'Marksman DMR', cat: 'rifle', slot: 'primary', kind: 'dmr', hold: 'rifle', damage: 72, interval: 0.32, mag: 10, reserve: 60, reload: 2.4, spread: [3.5, 0.15], recoil: 2.4, range: 260, headMul: 2.2, auto: false, zoom: 30, scope: true, price: 2200, model: 'dmr', icon: 'DMR', shells: 'big', desc: 'Scoped semi-auto rifle: quick follow-up shots at long range.' },
  hawk: { name: 'Hawk-50 Sniper', cat: 'rifle', slot: 'primary', kind: 'sniper', hold: 'rifle', damage: 165, interval: 1.25, mag: 5, reserve: 30, reload: 3, spread: [6, 0], recoil: 5, range: 400, headMul: 2.5, auto: false, zoom: 20, scope: true, price: 3500, model: 'sniper', icon: 'SNP', cycle: 'bolt', shells: 'big', desc: 'The longest reach and the biggest hit: a headshot drops anyone, helmet or not. Aim (right click) to scope in.' },
  viper: { name: 'Viper SMG', cat: 'smg', slot: 'secondary', kind: 'smg', hold: 'rifle', damage: 23, interval: 0.072, mag: 35, reserve: 175, reload: 1.7, spread: [2.8, 1.2], recoil: 0.45, range: 70, headMul: 1.8, auto: true, zoom: 58, price: 0, model: 'smg', icon: 'SMG', desc: 'The starter SMG: a fast-firing backup for close fights.' },
  wasp: { name: 'Wasp', cat: 'smg', tier: 'basic', slot: 'secondary', kind: 'smg', hold: 'rifle', damage: 19, interval: 0.058, mag: 32, reserve: 160, reload: 1.6, spread: [3, 1.4], recoil: 0.35, range: 60, headMul: 1.7, auto: true, zoom: 58, price: 900, model: 'wasp', icon: 'WSP', desc: 'A compact bullet hose: the highest fire rate in the arsenal, best up close.' },
  hornet: { name: 'Hornet P9', cat: 'pistol', tier: 'basic', slot: 'secondary', kind: 'pistol', hold: 'pistol', damage: 42, interval: 0.2, mag: 12, reserve: 96, reload: 1.3, spread: [2, 0.6], recoil: 1.2, range: 80, headMul: 2, auto: false, zoom: 58, price: 600, model: 'pistol', icon: 'P9', desc: 'Light, accurate sidearm with a quick reload.' },
  talon: { name: 'Talon .50', cat: 'pistol', tier: 'basic', slot: 'secondary', kind: 'pistol', hold: 'pistol', damage: 68, interval: 0.42, mag: 7, reserve: 49, reload: 1.6, spread: [2.4, 0.4], recoil: 2.6, range: 90, headMul: 2.2, auto: false, zoom: 54, price: 1200, model: 'heavy', icon: 'T50', desc: 'A hand cannon: seven heavy rounds that hit like a rifle. Make each one count.' },
  thunder: { name: 'Thunder 12', cat: 'shotgun', tier: 'basic', slot: 'primary', kind: 'shotgun', hold: 'rifle', damage: 19, pellets: 8, interval: 0.8, mag: 6, reserve: 36, reload: 2.6, spread: [6.5, 4.5], recoil: 4, range: 28, headMul: 1.5, auto: false, zoom: 60, price: 1200, model: 'shotgun', icon: 'SG', cycle: 'pump', shells: 'shell', desc: 'Pump shotgun: six shells of close-range stopping power.' },
  breaker: { name: 'Breaker-2', cat: 'shotgun', tier: 'basic', slot: 'primary', kind: 'shotgun', hold: 'rifle', damage: 24, pellets: 9, interval: 0.3, mag: 2, reserve: 30, reload: 2.2, spread: [7, 5.5], recoil: 5, range: 22, headMul: 1.5, auto: false, zoom: 60, price: 1500, model: 'double', icon: 'B2', reloadStyle: 'break', shells: 'none', desc: 'Two barrels, two shots: the deadliest blast up close. Past 10 m it falls off fast.' },
  cyclone: { name: 'Cyclone Auto', cat: 'shotgun', slot: 'primary', kind: 'shotgun', hold: 'rifle', damage: 14, pellets: 7, interval: 0.28, mag: 10, reserve: 40, reload: 2.8, spread: [6, 4.2], recoil: 2.6, range: 24, headMul: 1.4, auto: true, zoom: 60, price: 2600, model: 'autoshot', icon: 'CYC', shells: 'shell', desc: 'Full-auto shotgun with a 10-shell box: hold the trigger and sweep a room.' },
  ronin: { name: 'Ronin Blade', cat: 'special', slot: 'secondary', kind: 'sword', hold: 'melee', melee: true, damage: 70, interval: 0.6, range: 3.2, speedMul: 1.15, price: 2500, model: 'blade', icon: 'RON', desc: 'A long blade for your secondary slot: wider reach than the knife, and you run 15% faster while you hold it.' },
  mender: { name: 'Mender HP-2', cat: 'special', slot: 'secondary', kind: 'medic', hold: 'pistol', damage: 12, heal: 10, interval: 0.25, mag: 10, reserve: 60, reload: 2.4, spread: [1.6, 0.4], recoil: 0.4, range: 35, headMul: 1.5, auto: true, zoom: 56, price: 3000, model: 'mender', icon: 'MND', sound: 'pistol', desc: 'Every shot HEALS a teammate 10 HP up to 35 m, even a knocked one (it keeps them alive longer but does not revive). Enemies take a light sting.' },
  // --- Second arsenal wave -------------------------------------------------------------------------
  // Pistols (secondary)
  gnat: { name: 'Gnat AP', cat: 'pistol', slot: 'secondary', kind: 'mpistol', hold: 'pistol', damage: 17, interval: 0.062, mag: 18, reserve: 126, reload: 1.4, spread: [3.6, 1.8], recoil: 0.55, range: 50, headMul: 1.7, auto: true, zoom: 58, price: 1100, model: 'gnat', icon: 'GAP', desc: 'A pistol that fires full-auto: 18 rounds gone in a second. Wild at range, vicious up close.' },
  mantis: { name: 'Mantis MP', cat: 'pistol', slot: 'secondary', kind: 'mpistol', hold: 'pistol', damage: 21, interval: 0.08, mag: 20, reserve: 140, reload: 1.6, spread: [2.6, 1], recoil: 0.45, range: 65, headMul: 1.8, auto: true, zoom: 56, price: 1300, model: 'mantis', icon: 'MNT', desc: 'Compact machine pistol with a folding stock: steadier and longer-reaching than the Gnat.' },
  drifter: { name: 'Drifter .38', cat: 'pistol', slot: 'secondary', kind: 'revolver', hold: 'pistol', damage: 62, interval: 0.38, mag: 6, reserve: 42, reload: 2.6, spread: [1.4, 0.15], recoil: 2, range: 110, headMul: 2.4, auto: false, zoom: 50, price: 800, model: 'revolver', icon: 'D38', reloadStyle: 'revolver', shells: 'none', desc: 'Six-shot revolver: pin-point accurate with a big headshot bonus, but a slow reload.' },
  // Rifles (primary)
  falcon: { name: 'Falcon F25', cat: 'rifle', slot: 'primary', kind: 'rifle', hold: 'rifle', damage: 27, interval: 0.07, mag: 25, reserve: 150, reload: 2.2, spread: [2.8, 0.7], recoil: 0.85, range: 120, headMul: 2, auto: true, zoom: 50, price: 2000, model: 'falcon', icon: 'F25', desc: 'Bullpup with the fastest rifle trigger in the store. A 25-round magazine empties quickly: control the climb.' },
  sentinel: { name: 'Sentinel B3', cat: 'rifle', slot: 'primary', kind: 'rifle', hold: 'rifle', damage: 38, interval: 0.34, burst: 3, burstGap: 0.06, mag: 30, reserve: 150, reload: 2.3, spread: [2.2, 0.35], recoil: 0.5, range: 170, headMul: 2, auto: false, zoom: 46, price: 1900, model: 'sentinel', icon: 'B3', desc: 'Three-round burst rifle: every pull of the trigger sends a tight three-shot group downrange.' },
  sparrow: { name: 'Sparrow DMR', cat: 'rifle', slot: 'primary', kind: 'dmr', hold: 'rifle', damage: 52, interval: 0.2, mag: 20, reserve: 100, reload: 2.2, spread: [3, 0.2], recoil: 1.3, range: 220, headMul: 2.1, auto: false, zoom: 38, scope: true, price: 2000, model: 'sparrow', icon: 'SPR', desc: 'Light marksman rifle: lower damage than the Marksman, but you can tap it as fast as you can click.' },
  whisper: { name: 'Whisper SD', cat: 'rifle', slot: 'primary', kind: 'dmr', sound: 'silenced', hold: 'rifle', damage: 46, interval: 0.16, mag: 15, reserve: 90, reload: 2.4, spread: [2.6, 0.3], recoil: 0.9, range: 120, headMul: 2.1, auto: false, zoom: 40, scope: true, silenced: true, price: 2300, model: 'whisper', icon: 'WSD', desc: 'Integrally silenced rifle: no tracers, no muzzle flash, no map pings, and a whisper of a shot.' },
  osprey: { name: 'Osprey Bolt', cat: 'rifle', slot: 'primary', kind: 'sniper', hold: 'rifle', damage: 132, interval: 1.05, mag: 5, reserve: 30, reload: 2.8, spread: [5, 0], recoil: 4.2, range: 330, headMul: 2.5, auto: false, zoom: 24, scope: true, price: 2600, model: 'osprey', icon: 'OSP', cycle: 'bolt', shells: 'big', desc: 'Classic bolt-action sniper: cycles faster than the Hawk-50 and a headshot drops anyone without a heavy helmet.' },
  ranger: { name: 'Ranger Lever', cat: 'rifle', slot: 'primary', kind: 'lever', hold: 'rifle', damage: 88, interval: 0.6, mag: 8, reserve: 40, reload: 3, spread: [2.2, 0.1], recoil: 2.6, range: 200, headMul: 2.3, auto: false, zoom: 46, price: 1400, model: 'ranger', icon: 'RGR', cycle: 'lever', reloadStyle: 'shells', shells: 'big', desc: 'Lever-action rifle with iron sights: rack, fire, rack. Heavy rounds, no scope needed.' },
  // SMGs (secondary)
  bulldog: { name: 'Bulldog Drum', cat: 'smg', slot: 'secondary', kind: 'hsmg', hold: 'rifle', damage: 26, interval: 0.085, mag: 50, reserve: 150, reload: 2.9, spread: [3, 1.3], recoil: 0.55, range: 65, headMul: 1.8, auto: true, zoom: 56, price: 1600, model: 'bulldog', icon: 'BDG', reloadStyle: 'drum', desc: 'Heavy .45 rounds from a 50-round drum: hold the trigger and keep holding it.' },
  swarm: { name: 'Swarm P50', cat: 'smg', slot: 'secondary', kind: 'smg', hold: 'rifle', damage: 18, interval: 0.06, mag: 50, reserve: 200, reload: 2.4, spread: [2.6, 1.1], recoil: 0.3, range: 70, headMul: 1.7, auto: true, zoom: 56, price: 1700, model: 'swarm', icon: 'P50', desc: 'Top-loading 50-round bullpup SMG: barely kicks, never seems to run dry.' },
  // Shotguns
  sawback: { name: 'Sawback', cat: 'shotgun', slot: 'secondary', kind: 'shotgun', hold: 'pistol', damage: 20, pellets: 8, interval: 0.25, mag: 2, reserve: 24, reload: 1.9, spread: [8.5, 7], recoil: 4.5, range: 16, headMul: 1.4, auto: false, zoom: 60, price: 1300, model: 'sawback', icon: 'SAW', reloadStyle: 'break', shells: 'none', desc: 'A sawn-off double barrel for your SECONDARY slot: two point-blank blasts in your back pocket.' },
  rattler: { name: 'Rattler S8', cat: 'shotgun', slot: 'primary', kind: 'shotgun', hold: 'rifle', damage: 17, pellets: 8, interval: 0.36, mag: 5, reserve: 30, reload: 2.4, spread: [6, 4], recoil: 3, range: 26, headMul: 1.5, auto: false, zoom: 60, price: 1800, model: 'rattler', icon: 'S8', shells: 'shell', desc: 'Semi-auto shotgun fed by a 5-shell box magazine: no pumping, just pull the trigger again.' },
  // Melee (the melee slot: replaces the Combat Knife)
  machete: { name: 'Machete', cat: 'melee', slot: 'melee', kind: 'machete', hold: 'melee', melee: true, damage: 78, interval: 0.7, range: 2.9, speedMul: 1.05, price: 700, model: 'machete', icon: 'MCH', desc: 'A long heavy blade for your melee slot: hits harder and reaches further than the knife.' },
  crowbar: { name: 'Crowbar', cat: 'melee', slot: 'melee', kind: 'crowbar', hold: 'melee', melee: true, damage: 64, interval: 0.6, range: 2.6, wallMul: 4, price: 600, model: 'crowbar', icon: 'CRW', desc: 'Pries anything open: two swings smash an enemy Frost Wall to pieces.' },
  pan: { name: 'Frying Pan', cat: 'melee', slot: 'melee', kind: 'pan', hold: 'melee', melee: true, damage: 58, interval: 0.62, range: 2.4, block: 0.65, price: 900, model: 'pan', icon: 'PAN', desc: 'Carried on your back, it stops 65% of the damage from body shots that hit you from behind. And it rings like a bell.' },
  // Heavy (primary)
  quill: { name: 'Quill Crossbow', cat: 'heavy', slot: 'primary', kind: 'crossbow', hold: 'rifle', damage: 120, interval: 0.4, mag: 1, reserve: 20, reload: 1.9, spread: [1.8, 0], recoil: 1.4, range: 160, headMul: 2.2, auto: false, zoom: 40, silenced: true, projectile: { speed: 78, gravity: 9, model: 'bolt' }, price: 2100, model: 'crossbow', icon: 'XBW', reloadStyle: 'string', shells: 'none', desc: 'Silent bolts that drop over distance: lead your target. A headshot is a knockout, helmet or not.' },
  thumper: { name: 'Thumper GL', cat: 'heavy', slot: 'primary', kind: 'launcher', hold: 'rifle', damage: 165, blast: 4.5, interval: 0.5, mag: 1, reserve: 8, reload: 2.4, spread: [1.5, 0.6], recoil: 3.5, range: 120, headMul: 1, auto: false, zoom: 50, projectile: { speed: 38, gravity: 14, model: 'shell40' }, price: 3200, model: 'thumper', icon: 'GL', reloadStyle: 'tube', shells: 'none', desc: 'Lobs a 40 mm grenade that bursts on impact: arc it over cover. Keep your distance.' },
  rhino: { name: 'Rhino RPG', cat: 'heavy', slot: 'primary', kind: 'rocket', hold: 'rifle', damage: 210, blast: 5.2, interval: 0.5, mag: 1, reserve: 4, reload: 3.4, spread: [2, 0.3], recoil: 5, range: 220, headMul: 1, auto: false, zoom: 44, projectile: { speed: 58, gravity: 0.8, model: 'rocket' }, price: 4000, model: 'rhino', icon: 'RPG', reloadStyle: 'rocket', shells: 'none', desc: 'One rocket, one huge blast. Flies almost flat and leaves a smoke trail they will remember.' },
  knife: { name: 'Combat Knife', cat: 'melee', slot: 'melee', kind: 'knife', hold: 'melee', melee: true, damage: 60, interval: 0.55, range: 2.7, price: 0, model: 'knife', icon: 'KNF', desc: 'The standard-issue blade: quick swings, always with you.' },
  fists: { name: 'Fists', slot: 'fists', kind: 'fists', hold: 'fist', melee: true, damage: 22, interval: 0.42, range: 2.1, price: 0, model: 'fists', icon: 'FST' },
}
// Weapons Store categories (WEAPONS[id].cat; `grenade` lists GRENADES). Weapons, grenades and
// passes are priced in the game's own Gems (earned by playing, never sold); the backend's
// catalog.ts holds the same prices and decides every purchase.
export const WEAPON_CATS = [
  { id: 'all', name: 'All' },
  { id: 'pistol', name: 'Pistols' },
  { id: 'rifle', name: 'Rifles' },
  { id: 'shotgun', name: 'Shotguns' },
  { id: 'smg', name: 'SMGs' },
  { id: 'heavy', name: 'Heavy' },
  { id: 'melee', name: 'Melee' },
  { id: 'grenade', name: 'Grenades' },
  { id: 'special', name: 'Specials' },
]
// Throwables (T): the loadout picks one; frag is the starter. price in Gems. Mirrored by the
// backend's rules.ts GRENADES (damage, radius, fuse) and catalog.ts GRENADE_PRICES.
export const GRENADES = {
  frag: { name: 'Frag Grenade', damage: 170, radius: 6.5, fuse: 1.9, price: 0, model: 'frag', desc: 'The classic: bounces, then goes off after 1.9 s. Big damage in a 6.5 m radius.' },
  pulse: { name: 'Pulse Grenade', damage: 120, radius: 8.5, fuse: 1.2, price: 800, model: 'pulse', desc: 'A short fuse and the widest blast (8.5 m): less damage, but hard to run from.' },
  breach: { name: 'Breacher Charge', damage: 230, radius: 5, fuse: 2.4, price: 1200, model: 'breach', desc: 'Slow 2.4 s fuse, tight 5 m blast, and the heaviest damage of any throwable.' },
  // effect: what goes off. 'sticky' = a blast that sticks to the first thing it touches (a player
  // too); 'fire' = bursts on impact into a burning patch (damage = HP per second, burn = s);
  // 'smoke' = a thick cloud (cloud = s) that hides players and their name tags; 'flash' = a
  // blinding, deafening bang (radius = how far it blinds).
  leech: { name: 'Leech Charge', effect: 'sticky', damage: 185, radius: 5, fuse: 2, price: 1000, model: 'leech', desc: 'Sticks to walls, floors and players, beeps, then goes off 2 s later. Nobody shakes it off.' },
  molotov: { name: 'Firebottle', effect: 'fire', damage: 24, radius: 3.6, fuse: 5, burn: 7, price: 1100, model: 'molotov', desc: 'Shatters on impact into a 7-second pool of fire: 24 damage a second to anyone standing in it.' },
  smoke: { name: 'Smoke Grenade', effect: 'smoke', damage: 0, radius: 6, fuse: 1.4, cloud: 13, price: 500, model: 'smoke', desc: 'A thick 13-second cloud: blocks sight lines and hides name tags. Cover for a revive or a push.' },
  flash: { name: 'Stun Grenade', effect: 'flash', damage: 0, radius: 15, fuse: 1.6, blind: 3.5, price: 700, model: 'flash', desc: 'A deafening flash: anyone looking at it within 15 m is blinded for up to 3.5 s. Turn away!' },
}
// The lobby's "new arrivals" window (lobby.js newsWindow): shown once to every player after they
// reach the lobby, until they close it; the newest id they closed is saved on their account
// (profile.newsSeen, backend `newsSeen` message). To announce a new batch, raise `id` and list it.
export const NEWS = {
  id: 1,
  title: 'New Arsenal!',
  tagline: '23 new weapons and throwables just landed in the Weapons Store',
  weapons: ['rhino', 'thumper', 'quill', 'osprey', 'whisper', 'falcon', 'sentinel', 'sparrow', 'ranger', 'bulldog', 'swarm', 'rattler', 'sawback', 'gnat', 'mantis', 'drifter', 'machete', 'crowbar', 'pan'],
  grenades: ['leech', 'molotov', 'smoke', 'flash'],
  // One line under each new item's name.
  blurb: {
    rhino: 'Rocket launcher', thumper: 'Grenade launcher', quill: 'Silent crossbow', osprey: 'Bolt-action sniper', whisper: 'Silenced rifle', falcon: 'Fast bullpup', sentinel: '3-round burst', sparrow: 'Light DMR', ranger: 'Lever-action', bulldog: '50-round drum', swarm: '50-round SMG', rattler: 'Semi-auto shotgun', sawback: 'Sawn-off (secondary)', gnat: 'Full-auto pistol', mantis: 'Machine pistol', drifter: 'Revolver', machete: 'Melee', crowbar: 'Melee: breaks walls', pan: 'Melee: blocks shots from behind',
    leech: 'Sticky charge', molotov: 'Fire pool', smoke: 'Smoke cover', flash: 'Stun grenade',
  },
}

// Weapon passes: unlock a set of weapons for good (and any added to the set later), in Gems.
// The set is every weapon whose `tier` is the pass id (backend catalog.ts PASSES lists the same).
export const PASSES = {
  basic: { name: 'Field Arsenal Pass', desc: 'All basic weapons, forever', price: 3500 },
}
export const passWeapons = (id) => Object.keys(WEAPONS).filter((w) => WEAPONS[w].tier === id)
export const SCOPE_FOV = 34 // aimed FOV at or below this draws the scope overlay
export const WEAPON_SCALE = 1.3 // held/back weapon models vs their real-world size
export const BULLET = { tracerSpeed: 420, tracerLength: 3.2, falloffStart: 0.6 } // falloff from this share of range down to 60% damage at full range

// Weapon skins: colours applied to the procedural models. price in coins.
export const SKINS = {
  standard: { name: 'Standard', body: '#2b2f36', accent: '#4a505a', furniture: '#1d2025', price: 0 },
  desert: { name: 'Desert Tan', body: '#c9b07a', accent: '#8a7550', furniture: '#2d2a24', price: 600 },
  jungle: { name: 'Jungle Camo', body: '#55703f', accent: '#3a4a2a', furniture: '#2a2f22', camo: ['#6d8a4a', '#3b4b2c', '#8c7a4c'], price: 900 },
  arctic: { name: 'Arctic Frost', body: '#dfeef7', accent: '#7fb6d8', furniture: '#5d7d93', price: 1100 },
  crimson: { name: 'Crimson Fang', body: '#8f1d24', accent: '#1d1d22', furniture: '#2a0e10', glow: '#ff3b3b', price: 1500 },
  neon: { name: 'Neon Pulse', body: '#1b1f3b', accent: '#28e0ff', furniture: '#121426', glow: '#29e7ff', price: 1800 },
  gold: { name: 'Royal Gold', body: '#e6b53a', accent: '#fff1a8', furniture: '#5a3c10', metal: true, price: 2600 },
}

// --- Operatives (Characters menu): Q ability. price in coins. ---------------------
export const OPERATIVES = {
  rook: { name: 'Rook', role: 'Tank', ability: 'Iron Skin', desc: 'Takes 45% less damage for 6 s.', duration: 6, charge: 50, color: '#ff9f1c', price: 0 },
  nova: { name: 'Nova', role: 'Assault', ability: 'Overdrive', desc: '+30% move speed and fire rate for 6 s.', duration: 6, charge: 45, color: '#ff3d7f', price: 1200 },
  jin: { name: 'Jin', role: 'Medic', ability: 'Pulse Heal', desc: 'Heals you 90 HP and squadmates nearby 60 HP.', duration: 0, charge: 40, color: '#3ddc84', price: 1500 },
  shade: { name: 'Shade', role: 'Scout', ability: 'Ghost Step', desc: 'Near-invisible and silent for 5 s.', duration: 5, charge: 55, color: '#9b5cff', price: 2000 },
}
export const ULT_CHARGE = { perSecond: 1, perDamage: 0.045 } // charge points gained (the ability needs `charge`)

// --- Utility items (G, T, X, F) --------------------------------------------------
export const ITEMS = {
  frostWall: { name: 'Frost Wall', key: 'G', start: 4, max: 12, hp: 450, life: 12, width: 4.6, height: 2.6 },
  frag: { name: 'Frag Grenade', key: 'T', start: 2, max: 6, damage: 170, radius: 6.5, fuse: 1.9, throwSpeed: 19 },
  medkit: { name: 'Medkit', key: 'X', start: 2, max: 8, heal: 80, time: 2.2 },
  dash: { name: 'Dash', key: 'F', cooldown: 6, speed: 20, time: 0.18 },
}

// --- Health / armour --------------------------------------------------------------
export const HEALTH = {
  max: 200,
  regenDelay: 6, // s without damage before slow regen starts
  regen: 4, // HP/s
  regenCap: 120, // regen never heals past this
  knockedHp: 80, // a knocked character's bleed-out pool
  bleed: 5, // HP/s the pool drains
  reviveTime: 3, // s holding to revive
  reviveHp: 70,
  // armour levels reduce damage taken on that hit zone (fraction kept = 1 - value)
  vest: [0, 0.18, 0.28, 0.38],
  helmet: [0, 0.22, 0.36, 0.5],
  armorDurability: [0, 180, 260, 340], // damage soaked before the piece drops a level
}

// --- Match modes ---------------------------------------------------------------------
export const MATCH_MODES = {
  // Online: up to NET.teamMax per side, real players only. Picked in the lobby's mode window (play { mode }).
  clash: { name: 'Team Clash', desc: 'Up to 3 v 3 · respawns · most eliminations wins', teamSize: 3, duration: 240, scoreToWin: 45, respawn: true },
  squad: { name: 'Squad Showdown', desc: 'Up to 3 v 3 · respawns · first to 25', teamSize: 3, duration: 180, scoreToWin: 25, respawn: true },
}
export const MATCH = {
  countdown: 4, // s frozen at the start (3, 2, 1, FIGHT)
  introFlyover: 3.2, // s of camera sweep before the countdown
  voteTime: 15, // s of map voting (the server's PHASES.vote)
  spawnSafeDistance: 38, // m from any enemy a respawn point must be
  endSlowmo: 2.4, // s of slow motion after the final elimination / time up
  streakWindow: 6, // s between eliminations that still count as a streak
}
// The maps players vote for: a district of Coral Key at a time of day. The safe zone closes in on
// `focus` (same planner + MAP_FOCUS on the server, same order); `shot` is the vote card's camera
// (offset from focus: [x, y, z], fov) rendered once at boot.
// `world` is the island it is played on (WORLDS); Dustline Ridge is its own, larger island (built in
// the background after boot, src/world/ridge/), so its zone covers the whole of it.
export const MAPS = [
  { id: 'villa', world: 'coral', name: 'THE VILLA', mood: 'day', tint: '#3fb6ff', focus: [0, 0], shot: [34, 30, 46, 50] },
  { id: 'farm', world: 'coral', name: 'Old Farm', mood: 'sunset', tint: '#ff9a3c', focus: [-66, 34], shot: [40, 42, 52, 52] },
  { id: 'dock', world: 'coral', name: 'Dockyard', mood: 'night', tint: '#5866ff', focus: [-98, -14], shot: [52, 30, 36, 52] },
  { id: 'ridge', world: 'ridge', name: 'Dustline Ridge', tag: 'BIG MAP', mood: 'desert', tint: '#e0a35a', focus: [0, 0], shot: [-60, 46, 84, 56] },
]

// --- Safe zone ---------------------------------------------------------------------
// Phases run on match time: hold, then shrink to radius over `shrink` s.
export const ZONE = {
  start: 150, // m radius at the start (covers the whole island)
  phases: [
    { at: 35, shrink: 30, radius: 105 },
    { at: 95, shrink: 30, radius: 72 },
    { at: 160, shrink: 30, radius: 46 },
  ],
  damage: [4, 7, 11], // HP/s outside, per phase reached
  wallHeight: 90,
  color: '#7ec8ff',
}

// --- Worlds ------------------------------------------------------------------------
// The islands a map can be played on. `radius`: the land the zone stays over (a circle never centres
// further out than radius - 0.6 x its own radius); `zone`: that world's plan (start radius, phases,
// damage; ZONE's wallHeight / color are shared). Mirrored by the backend's rules.ts WORLDS: the zone
// planner runs on both sides from the same seed, so these numbers must match there.
export const WORLDS = {
  coral: { name: 'Coral Key', radius: 125, zone: ZONE },
  ridge: {
    name: 'Dustline Ridge',
    radius: 250,
    zone: {
      start: 330, // covers the whole island
      phases: [
        { at: 30, shrink: 35, radius: 190 },
        { at: 95, shrink: 35, radius: 115 },
        { at: 160, shrink: 30, radius: 60 },
      ],
      damage: [4, 7, 11],
    },
  },
}

// --- Loot --------------------------------------------------------------------------
export const LOOT = {
  respawn: 40, // s before an opened supply crate refills
  interactRange: 2.6, // m
  airdropAt: [70, 150], // match seconds a supply drop falls
  airdropFall: 9, // s from the sky to the ground
}

// --- Navigation grid (navgrid.js: walkable cells for spawn points) ---
export const NAV = {
  cell: 1.25, // m per grid cell
}

// Stand-in outfits (characters.js, worn until a Bloxity look loads): mixed at random.
export const OUTFITS = {
  skins: ['#f2c79a', '#e0ac7e', '#c68b5e', '#8d5a3b', '#ffd9b3', '#f7e07a'],
  shirts: ['#1d1f26', '#2a3f6b', '#7a1f2a', '#2f5d3a', '#e5e5e5', '#b85c1e', '#3b2a5c', '#14636b', '#c9a227', '#4b4f58'],
  pants: ['#14161b', '#2b3a55', '#3d3326', '#47513a', '#5a5d66', '#1f2b44'],
  hair: ['#2a1a10', '#5a3418', '#c97a2b', '#e8c25a', '#101010', '#8a2f1c', '#6b6b6b'],
  shoes: ['#f2f2f2', '#16171b', '#7a4b26', '#c93a3a'],
  accents: ['#ffcc33', '#2ec4ff', '#ff5a5a', '#7cff6b', '#ff8ad8', '#ffffff'],
}

// --- Teams -------------------------------------------------------------------------
export const TEAMS = {
  blue: { name: 'Blue', color: '#2f9bff', dark: '#0d4fa8', tag: '#9fd3ff' },
  orange: { name: 'Orange', color: '#ff8a1f', dark: '#b84a00', tag: '#ffd29f' },
}

// --- Progression, rewards and shops (coins; Gems are earned only) ---------------------
export const REWARDS = {
  perElimination: 12,
  perKnock: 3,
  perDamage: 1 / 25, // coins per point of damage dealt
  win: 70,
  loss: 25,
  mvp: 30,
  rpWin: 40,
  rpLoss: -12,
  rpPerElim: 3,
  leavePenaltyRp: -12, // leaving a round in play: half the fighting coins, no result bonus, this rank change
  forfeitMinShare: 0.5, // the other side leaving before this share of the round: a no contest (no win bonus)
}
// Gems: the game's own currency, NOT Bloxity Gems and not premium currency. Earned only by playing
// (eliminations and knocks, granted by the server at once: backend rules.ts GEMS, the `reward`
// message), never sold for real money or Bloxity Gems. Shown by the HUD's kill popup and the lobby.
export const GEMS = {
  perElimination: 12,
  perKnock: 3,
  headshot: 3, // extra on a headshot elimination
  streak: 4, // extra per elimination beyond the first in a streak (Double +4, Triple +8, ...)
  streakCap: 5,
  win: 40, // at the results (none for leaving a running round)
  loss: 15,
  mvp: 25,
}
// coins / gems: paid once, the first time the player's rank points reach that rank (the server's
// progress.ts RANKS decides and pays; keep the numbers equal).
export const RANKS = [
  { name: 'Bronze', rp: 0, color: '#cd7f32', coins: 0, gems: 0 },
  { name: 'Silver', rp: 250, color: '#c0c7d1', coins: 300, gems: 30 },
  { name: 'Gold', rp: 650, color: '#ffc83d', coins: 500, gems: 50 },
  { name: 'Platinum', rp: 1200, color: '#4fe0d0', coins: 800, gems: 80 },
  { name: 'Diamond', rp: 2000, color: '#6fb6ff', coins: 1200, gems: 120 },
  { name: 'Heroic', rp: 3200, color: '#ff5a7a', coins: 1800, gems: 180 },
  { name: 'Grandmaster', rp: 5000, color: '#ffdf5a', coins: 3000, gems: 300 },
]

// Daily / weekly missions (the lobby's Missions window). The server (backend progress.ts MISSIONS)
// picks 3 of each list per UTC day / week (from Monday 00:00 UTC), counts progress from the rounds
// and pays the claim; this copy only names and shows them, so keep ids, goals and rewards equal.
// Gems from missions are earned by playing, like every other Gem.
export const MISSIONS = {
  daily: [
    { id: 'd_play', stat: 'play', goal: 3, coins: 120, gems: 15 },
    { id: 'd_win', stat: 'win', goal: 2, coins: 150, gems: 20 },
    { id: 'd_elims', stat: 'elims', goal: 10, coins: 150, gems: 20 },
    { id: 'd_knocks', stat: 'knocks', goal: 8, coins: 120, gems: 15 },
    { id: 'd_damage', stat: 'damage', goal: 2500, coins: 150, gems: 20 },
    { id: 'd_heads', stat: 'headshots', goal: 15, coins: 130, gems: 15 },
    { id: 'd_assists', stat: 'assists', goal: 5, coins: 120, gems: 15 },
    { id: 'd_revives', stat: 'revives', goal: 2, coins: 120, gems: 15 },
  ],
  weekly: [
    { id: 'w_play', stat: 'play', goal: 20, coins: 600, gems: 80 },
    { id: 'w_win', stat: 'win', goal: 10, coins: 800, gems: 100 },
    { id: 'w_elims', stat: 'elims', goal: 60, coins: 800, gems: 100 },
    { id: 'w_damage', stat: 'damage', goal: 15000, coins: 700, gems: 90 },
    { id: 'w_heads', stat: 'headshots', goal: 80, coins: 700, gems: 90 },
    { id: 'w_revives', stat: 'revives', goal: 10, coins: 600, gems: 80 },
  ],
  // How each stat reads in the window ({n} = the goal). "play" / "win" count rounds played to the end.
  text: {
    play: 'Finish {n} rounds',
    win: 'Win {n} rounds',
    elims: 'Eliminate {n} enemies',
    knocks: 'Knock down {n} enemies',
    damage: 'Deal {n} damage',
    headshots: 'Land {n} headshots',
    assists: 'Get {n} assists',
    revives: 'Revive {n} teammates',
  },
}
export const START_PROFILE = {
  coins: 600,
  gems: 0, // earned by eliminations; never bought
  rp: 0,
  owned: { weapons: ['striker', 'viper', 'knife', 'fists'], skins: ['standard'], operatives: ['rook'], emotes: ['wave'], grenades: ['frag'], passes: [] },
  loadout: { primary: 'striker', secondary: 'viper', melee: 'knife', operative: 'rook', emote: 'wave', grenade: 'frag', skin: { striker: 'standard', viper: 'standard' } },
  upgrades: {}, // id -> level
  stats: { matches: 0, wins: 0, eliminations: 0, deaths: 0, damage: 0, best: 0 },
  mode: 'clash',
  missions: { day: '', week: '', daily: [], weekly: [] }, // slots { id, n, claimed }: the server's
  rankReward: 0, // highest RANKS index whose reward was paid
  tutorial: false, // the first-round tips are done
  newsSeen: 0, // the newest NEWS id the player has closed (saved on the account)
}
// Store: permanent upgrades and emotes, all priced in coins. The server (backend catalog.ts) holds
// the same prices and decides every purchase; keep the two in step.
export const STORE = [
  { id: 'medkits', type: 'upgrade', max: 2, name: 'Field Medic Kit', desc: '+1 medkit at every match start (per level).', price: 900, icon: 'medkit' },
  { id: 'walls', type: 'upgrade', max: 2, name: 'Frost Wall Pack', desc: '+2 frost walls at every match start (per level).', price: 1000, icon: 'wall' },
  { id: 'frags', type: 'upgrade', max: 2, name: 'Grenadier Belt', desc: '+1 frag grenade at every match start (per level).', price: 1100, icon: 'frag' },
  { id: 'armor', type: 'upgrade', max: 2, name: 'Starter Armour', desc: 'Spawn with a level 2 (then 3) vest and helmet.', price: 2400, icon: 'armor' },
  { id: 'emote_dance', type: 'emote', emote: 'dance', name: 'Emote: Groove', desc: 'Show off after a win (Z).', price: 500, icon: 'emote' },
  { id: 'emote_salute', type: 'emote', emote: 'salute', name: 'Emote: Salute', desc: 'Respect the squad (Z).', price: 350, icon: 'emote' },
  { id: 'emote_flex', type: 'emote', emote: 'flex', name: 'Emote: Flex', desc: 'Pure confidence (Z).', price: 650, icon: 'emote' },
  { id: 'emote_cheer', type: 'emote', emote: 'cheer', name: 'Emote: Cheer', desc: 'Celebrate the team (Z).', price: 450, icon: 'emote' },
]

export function clamp(n, min, max) {
  return n < min ? min : n > max ? max : n
}

// Coerce one raw SDK string against its SETTINGS entry.
export function coerceSetting(key, raw) {
  const spec = SETTINGS[key]
  if (!spec) return raw
  const value = raw === '' || raw == null ? spec.def : raw
  if (spec.type === 'bool') return value === 'true' || value === true
  if (spec.type === 'enum') return spec.values.includes(value) ? value : spec.def
  const n = Number(value)
  return clamp(Number.isFinite(n) ? n : Number(spec.def), spec.min, spec.max)
}

// Spectating after an elimination: the camera starts on the killer and looks where they look.
// Spectators give hearts and reactions to the player they watch (server: constants.ts HEART_GAP_MS,
// HEARTS_PER_TARGET, REACT_GAP_MS; rules.ts REACTIONS = these ids).
export const SPECTATE = {
  retarget: 0.4, // s between checks for a new player to watch when the current one is gone
  heartGap: 0.4, // s between hearts from this spectator (server HEART_GAP_MS)
  reactGap: 1.2, // s between reactions (server REACT_GAP_MS)
}
export const REACTIONS = [
  { id: 'laugh', glyph: '\u{1F602}' },
  { id: 'fire', glyph: '\u{1F525}' },
  { id: 'clap', glyph: '\u{1F44F}' },
  { id: 'wow', glyph: '\u{1F62E}' },
  { id: 'gg', glyph: 'GG' },
]
