// Every tunable constant lives here; the rest of src/ holds no theme values.
// (The island's own layout data lives with its builder in src/world/.)

// --- Identity -------------------------------------------------------------
export const GAME_SLUG = 'free-fire-zone' // slug registered on bloxity.io
export const GAME_TITLE = 'Free Fire Zone'

// Forces the Bloxity SDK and avatar CDN to be treated as unavailable (see .env.example).
export const DEV_MODE = import.meta.env.VITE_DEV_MODE === 'true'

// --- World (metres: +X east, +Z south, +Y up) -------------------------------
export const GROUND_Y = 0
export const WATER = { level: -0.6, size: 1400, color: '#12a9e6', shallow: '#7ff0ff' }
export const SPAWN = { x: 0, y: 0.05, z: 8 }
export const SPAWN_FACING = Math.PI // yaw the character faces on spawn (PI = toward -Z)

// --- Player modes (modes.js) -------------------------------------------------
// The shooter always plays over the shoulder; 'player' (first person) is only the scope view.
export const MODES = ['character', 'player']
export const START_MODE = 'character'

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

// --- Graphics presets, picked by the Bloxity graphics_quality setting ----------
export const GRAPHICS_PRESETS = {
  Low: { shadows: false, shadowMap: 512, antialias: false, dpr: 1, bloom: false, particles: 0.35 },
  Medium: { shadows: true, shadowMap: 1024, antialias: false, dpr: 1.25, bloom: false, particles: 0.6 },
  High: { shadows: true, shadowMap: 2048, antialias: true, dpr: 2, bloom: true, particles: 1 },
  Ultra: { shadows: true, shadowMap: 4096, antialias: true, dpr: 2, bloom: true, particles: 1 },
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
export const MOBILE_GRAPHICS_CAP = { dpr: 1.5, shadowMap: 1024, particles: 0.6 }

// The preset to render with on this device.
export function graphicsPreset(name) {
  const p = GRAPHICS_PRESETS[name] ?? GRAPHICS_PRESETS[DEFAULT_GRAPHICS]
  if (!COARSE_POINTER) return p
  const cap = MOBILE_GRAPHICS_CAP
  return { ...p, dpr: Math.min(p.dpr, cap.dpr), shadowMap: Math.min(p.shadowMap, cap.shadowMap), bloom: false, particles: Math.min(p.particles, cap.particles) }
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
  aimEase: 14, // 1/s the aim zoom glides
  followLerp: 22, // 1/s smoothing on the followed point
  lookSensitivity: 0.0024, // rad per pixel of mouse movement
  aimSensitivity: 0.6, // look multiplier while aiming (scopes scale further by their zoom)
  clearEase: 8, // 1/s the boom eases back out once a wall stops blocking it
  shakeDecay: 7, // 1/s camera shake fades
  spectateDistance: 5.2,
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
  graphics_quality: { def: DEFAULT_GRAPHICS, type: 'enum', values: ['Low', 'Medium', 'High', 'Ultra'] },
  camera_sensitivity: { def: '1', type: 'number', min: 0.1, max: 5 },
  show_fps: { def: 'false', type: 'bool' },
  fullscreen: { def: 'false', type: 'bool' },
  master_volume: { def: '80', type: 'number', min: 0, max: 100 },
}

// Leaderboards (bloxity.js defineLeaderboards / submitMatchScores). Ids are permanent once the
// portal has created a board; later edits here are ignored (the dashboard owns them). `sum` boards
// receive only what a match added. Up to 10 boards.
export const LEADERBOARDS = [
  { id: 'eliminations', label: 'Total eliminations', order: 'desc', mode: 'sum', format: 'compact', reset: 'none' },
  { id: 'wins', label: 'Match wins', order: 'desc', mode: 'sum', format: 'number', reset: 'none' },
  { id: 'best_match', label: 'Best match (eliminations)', order: 'desc', mode: 'best', format: 'number', reset: 'none' },
  { id: 'weekly_elims', label: 'Eliminations this week', order: 'desc', mode: 'sum', format: 'compact', reset: 'weekly' },
]

// Ad screens declared once after init (bloxity.js). Gameplay banners stay off.
export const AD_SCREENS = { lobby: {}, panel: {}, results: {}, gameplay: { show: false } }

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
  transitions: { toLocomotion: 0.14, toAirborne: 0.12, toLanding: 0.06 },
}

export const FONT_FAMILY = 'Fredoka'

// --- Weapons -------------------------------------------------------------------
// slot: primary / secondary / melee. damage per bullet (pellets for shotguns) vs 200 HP.
// interval = s between shots; spread = degrees of cone (hip / aimed); recoil = degrees of kick per shot;
// zoom = aimed FOV (scoped weapons draw the scope overlay when zoom <= scopeFov);
// price in COINS (earned by playing). Nothing is ever sold for premium currency.
export const WEAPONS = {
  striker: { name: 'Striker AR', slot: 'primary', kind: 'rifle', hold: 'rifle', damage: 34, interval: 0.1, mag: 30, reserve: 150, reload: 2.1, spread: [2.4, 0.55], recoil: 0.7, range: 140, headMul: 2, auto: true, zoom: 52, price: 0, model: 'ar', icon: 'AR' },
  viper: { name: 'Viper SMG', slot: 'secondary', kind: 'smg', hold: 'rifle', damage: 23, interval: 0.072, mag: 35, reserve: 175, reload: 1.7, spread: [2.8, 1.2], recoil: 0.45, range: 70, headMul: 1.8, auto: true, zoom: 58, price: 0, model: 'smg', icon: 'SMG' },
  hornet: { name: 'Hornet P9', slot: 'secondary', kind: 'pistol', hold: 'pistol', damage: 42, interval: 0.2, mag: 12, reserve: 96, reload: 1.3, spread: [2, 0.6], recoil: 1.2, range: 80, headMul: 2, auto: false, zoom: 58, price: 400, model: 'pistol', icon: 'P9' },
  thunder: { name: 'Thunder 12', slot: 'primary', kind: 'shotgun', hold: 'rifle', damage: 19, pellets: 8, interval: 0.8, mag: 6, reserve: 36, reload: 2.6, spread: [6.5, 4.5], recoil: 4, range: 28, headMul: 1.5, auto: false, zoom: 60, price: 1500, model: 'shotgun', icon: 'SG' },
  tempest: { name: 'Tempest LMG', slot: 'primary', kind: 'lmg', hold: 'rifle', damage: 31, interval: 0.085, mag: 60, reserve: 180, reload: 3.4, spread: [3.2, 1.3], recoil: 0.6, range: 130, headMul: 1.8, auto: true, zoom: 52, price: 2500, model: 'lmg', icon: 'LMG' },
  marksman: { name: 'Marksman DMR', slot: 'primary', kind: 'dmr', hold: 'rifle', damage: 72, interval: 0.32, mag: 10, reserve: 60, reload: 2.4, spread: [3.5, 0.15], recoil: 2.4, range: 260, headMul: 2.2, auto: false, zoom: 30, scope: true, price: 2200, model: 'dmr', icon: 'DMR' },
  hawk: { name: 'Hawk-50 Sniper', slot: 'primary', kind: 'sniper', hold: 'rifle', damage: 165, interval: 1.25, mag: 5, reserve: 30, reload: 3, spread: [6, 0], recoil: 5, range: 400, headMul: 2.5, auto: false, zoom: 20, scope: true, price: 3200, model: 'sniper', icon: 'SNP' },
  knife: { name: 'Combat Knife', slot: 'melee', kind: 'knife', hold: 'melee', damage: 60, interval: 0.55, range: 2.7, price: 0, model: 'knife', icon: 'KNF' },
  fists: { name: 'Fists', slot: 'fists', kind: 'fists', hold: 'fist', damage: 22, interval: 0.42, range: 2.1, price: 0, model: 'fists', icon: 'FST' },
}
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
  clash: { name: 'Team Clash', desc: '6 v 6 · respawns · most eliminations wins', teamSize: 6, duration: 240, scoreToWin: 45, respawn: true },
  squad: { name: 'Squad Showdown', desc: '4 v 4 · respawns · first to 25', teamSize: 4, duration: 180, scoreToWin: 25, respawn: true },
}
export const MATCH = {
  countdown: 4, // s frozen at the start (3, 2, 1, FIGHT)
  introFlyover: 3.2, // s of camera sweep before the countdown
  voteTime: 6, // s of map voting
  botRespawn: 7, // s an eliminated bot waits
  playerAutoRespawn: 10, // s before an eliminated player respawns on their own (Revive skips it)
  spawnSafeDistance: 38, // m from any enemy a respawn point must be
  endSlowmo: 2.4, // s of slow motion after the final elimination / time up
  streakWindow: 6, // s between eliminations that still count as a streak
  hearts: 3, // free revive hearts every match (owned hearts add to these); not used on Bloxity (the portal's death screen sets the respawn wait)
}
export const MAPS = [
  { id: 'day', name: 'Coral Key · Day', mood: 'day', tint: '#3fb6ff' },
  { id: 'sunset', name: 'Coral Key · Sunset', mood: 'sunset', tint: '#ff9a3c' },
  { id: 'night', name: 'Coral Key · Night', mood: 'night', tint: '#5866ff' },
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

// --- Loot --------------------------------------------------------------------------
export const LOOT = {
  respawn: 40, // s before an opened supply crate refills
  interactRange: 2.6, // m
  airdropAt: [70, 150], // match seconds a supply drop falls
  airdropFall: 9, // s from the sky to the ground
}

// --- Bots --------------------------------------------------------------------------
export const BOTS = {
  viewRange: 90, // m
  sniperRange: 160,
  fov: 220, // degrees of awareness cone
  hearRange: 70, // m within which a shot reveals the shooter
  reaction: [0.2, 0.45], // s before opening fire on a new target
  // aim error (degrees) at first sight; it shrinks while they keep tracking a target
  aimError: { start: 5, settle: 1.3, settleTime: 1.5 },
  burst: [3, 8], // shots per burst for automatic weapons
  burstPause: [0.25, 0.7],
  thinkInterval: 0.22, // s between perception passes
  repathInterval: 2.2,
  reviveRange: 30,
  medkitBelow: 0.55,
  wallBelow: 0.4, // HP share under which a bot in a fight may raise a frost wall
  grenadeChance: 0.18,
  navCell: 1.25, // m per nav grid cell
}
export const BOT_NAMES = [
  'BlazeRunner', 'nova_kid22', 'PixelSniper', 'TacoTactics', 'Zyrox', 'MintyMango', 'ColdBrewCarl', 'StormRider_7', 'LuckyLlama', 'xXViperXx',
  'Captain_Crunch', 'NoScopeNina', 'Bunny_Hop', 'IronMarta', 'Quickscope_Q', 'ToastyBoi', 'Mr_Wobbles', 'FrostByte', 'Kai_The_Great', 'SpicyNoodle',
  'RocketRaccoon9', 'Lil_Thunder', 'PotatoAim', 'GhostPanda', 'Sir_Sneaks', 'MegaMelon', 'Dr_Pickles', 'Zippy_Zoe', 'BigBoss_Bob', 'Turbo_Tina',
  'ShadowFox', 'WaffleWizard', 'ChillPenguin', 'Ace_Hunter', 'Pebbles_04', 'NightOwl_X', 'SaltyCrab', 'Vortex_V', 'DinoDan', 'Glitchy',
]

// Bot outfits (characters.js): mixed at random.
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

// --- Progression, rewards and shops (coins only) ------------------------------------
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
}
export const RANKS = [
  { name: 'Bronze', rp: 0, color: '#cd7f32' },
  { name: 'Silver', rp: 250, color: '#c0c7d1' },
  { name: 'Gold', rp: 650, color: '#ffc83d' },
  { name: 'Platinum', rp: 1200, color: '#4fe0d0' },
  { name: 'Diamond', rp: 2000, color: '#6fb6ff' },
  { name: 'Heroic', rp: 3200, color: '#ff5a7a' },
  { name: 'Grandmaster', rp: 5000, color: '#ffdf5a' },
]
export const START_PROFILE = {
  coins: 600,
  rp: 0,
  hearts: 0, // bought revive hearts (each match also grants MATCH.hearts)
  owned: { weapons: ['striker', 'viper', 'knife', 'fists'], skins: ['standard'], operatives: ['rook'], emotes: ['wave'] },
  loadout: { primary: 'striker', secondary: 'viper', operative: 'rook', emote: 'wave', skin: { striker: 'standard', viper: 'standard' } },
  upgrades: {}, // id -> level
  stats: { matches: 0, wins: 0, eliminations: 0, deaths: 0, damage: 0, best: 0 },
  mode: 'clash',
}
// Store: consumables and permanent upgrades, all priced in coins.
export const STORE = [
  { id: 'hearts3', type: 'hearts', amount: 3, name: '3 Revive Hearts', desc: 'Revive instantly after an elimination.', price: 450, icon: 'heart' },
  { id: 'hearts10', type: 'hearts', amount: 10, name: '10 Revive Hearts', desc: 'Best value pack of revives.', price: 1300, icon: 'heart' },
  { id: 'medkits', type: 'upgrade', max: 2, name: 'Field Medic Kit', desc: '+1 medkit at every match start (per level).', price: 900, icon: 'medkit' },
  { id: 'walls', type: 'upgrade', max: 2, name: 'Frost Wall Pack', desc: '+2 frost walls at every match start (per level).', price: 1000, icon: 'wall' },
  { id: 'frags', type: 'upgrade', max: 2, name: 'Grenadier Belt', desc: '+1 frag grenade at every match start (per level).', price: 1100, icon: 'frag' },
  { id: 'armor', type: 'upgrade', max: 2, name: 'Starter Armour', desc: 'Spawn with a level 2 (then 3) vest and helmet.', price: 2400, icon: 'armor' },
  { id: 'emote_dance', type: 'emote', emote: 'dance', name: 'Emote: Groove', desc: 'Show off after a win (Z).', price: 500, icon: 'emote' },
  { id: 'emote_salute', type: 'emote', emote: 'salute', name: 'Emote: Salute', desc: 'Respect the squad (Z).', price: 350, icon: 'emote' },
  { id: 'emote_flex', type: 'emote', emote: 'flex', name: 'Emote: Flex', desc: 'Pure confidence (Z).', price: 650, icon: 'emote' },
  { id: 'emote_cheer', type: 'emote', emote: 'cheer', name: 'Emote: Cheer', desc: 'Celebrate the team (Z).', price: 450, icon: 'emote' },
]
export const SAVE_KEY = 'free-fire-zone.profile.v1'

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
