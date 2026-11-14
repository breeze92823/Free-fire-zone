// Every one-shot sound in the shooter, synthesised from physical recipes
// (synth.js): no audio files. Nothing here throws or plays before the first
// gesture: each export returns quietly when audio isn't running or the voice
// budget is spent. Positional sounds take { dist, pan } (metres, -1..1) and
// fall off with distance (far shots are quieter, duller and wetter).
import { AUDIO, COARSE_POINTER } from '../config.js'
import { A, isMuted, now, voice } from './core.js'
import { burst, crinkle, modal, rnd, tone, vary } from './synth.js'

const METAL = [[1, 1, 0.09], [2.41, 0.6, 0.06], [3.93, 0.4, 0.04], [5.4, 0.2, 0.025]]
const PLASTIC = [[1, 1, 0.026], [2.31, 0.5, 0.016], [3.93, 0.28, 0.01]]
const GLASS = [[1, 1, 0.45], [2.32, 0.5, 0.28], [4.25, 0.28, 0.16], [6.63, 0.14, 0.1]]
const BELL = [[1, 1, 0.9], [2.05, 0.5, 0.6], [3.1, 0.34, 0.4], [4.33, 0.2, 0.25]]
const COIN = [[1, 1, 0.5], [1.504, 0.6, 0.36], [2.24, 0.45, 0.26], [2.71, 0.3, 0.18], [3.47, 0.22, 0.12]]

const lastAt = new Map()
function limit(name, ms) {
  const t = performance.now()
  if (t - (lastAt.get(name) ?? -1e9) < ms) return false
  lastAt.set(name, t)
  return true
}

function buzz(pattern) {
  if (!COARSE_POINTER || isMuted()) return
  try {
    navigator.vibrate?.(pattern)
  } catch {
    // Not allowed in this frame.
  }
}

// Distance -> { gain, lp (Hz), verb } for positional sounds.
function falloff(dist = 0) {
  const k = Math.max(0, 1 - dist / AUDIO.hearing)
  return { gain: k * k * (dist < 3 ? 1 : 0.55 + 0.45 * Math.min(1, 12 / dist)), lp: 900 + 15000 * k * k, verb: 0.15 + (1 - k) * 0.6 }
}

// --- Guns --------------------------------------------------------------------------
// kind: rifle smg pistol shotgun lmg dmr sniper, and mpistol (machine pistols), hsmg (heavy .45
// SMG), revolver, lever, silenced, crossbow, launcher, rocket. Own shots are full and dry; others
// by distance.
const GUN = {
  rifle: { crack: 2100, body: 150, gain: 0.55, tail: 0.32, d: 0.09 },
  smg: { crack: 2900, body: 190, gain: 0.42, tail: 0.22, d: 0.06 },
  pistol: { crack: 3200, body: 210, gain: 0.45, tail: 0.24, d: 0.06 },
  shotgun: { crack: 1300, body: 95, gain: 0.75, tail: 0.6, d: 0.16 },
  lmg: { crack: 1800, body: 120, gain: 0.58, tail: 0.36, d: 0.1 },
  dmr: { crack: 2300, body: 120, gain: 0.66, tail: 0.5, d: 0.12 },
  sniper: { crack: 2600, body: 80, gain: 0.85, tail: 0.9, d: 0.16 },
  mpistol: { crack: 3500, body: 230, gain: 0.38, tail: 0.18, d: 0.045 },
  hsmg: { crack: 2200, body: 140, gain: 0.5, tail: 0.3, d: 0.08 },
  revolver: { crack: 2500, body: 110, gain: 0.72, tail: 0.6, d: 0.13 },
  lever: { crack: 2200, body: 95, gain: 0.74, tail: 0.75, d: 0.14 },
}
export function shot(kind, { dist = 0, pan = 0, own = false } = {}) {
  if (SPECIAL[kind]) return SPECIAL[kind](dist, pan, own)
  const g = GUN[kind] ?? GUN.rifle
  const f = falloff(dist)
  if (f.gain < 0.01 || !voice(0.6, own ? 3 : 1)) return
  const t = now()
  const lvl = g.gain * f.gain * (own ? 1 : 0.85)
  const bus = A.sfx
  // A revolver rings: the cylinder gap spits and the frame sings for a moment.
  if (kind === 'revolver') modal({ t, f: vary(1900, 0.04), modes: METAL, gain: lvl * 0.12, decay: 1.4, pan })
  // The crack: a very short bright noise slap.
  burst({ t, noise: 'white', type: 'bandpass', f: Math.min(f.lp, vary(g.crack, 0.08)), q: 0.7, a: 0.0006, d: g.d * 0.5, gain: lvl * 0.9, bus, pan })
  // The body: a pitched thump that drops fast.
  tone({ t, type: 'triangle', f: vary(g.body * 2.2, 0.05), f2: g.body * 0.5, glide: 0.08, a: 0.001, d: g.d * 1.5, gain: lvl * 0.9, bus, pan })
  // Muzzle blast: low noise.
  burst({ t, noise: 'brown', type: 'lowpass', f: Math.min(f.lp, 900), q: 0.6, a: 0.001, d: g.d * 2, gain: lvl * 1.1, bus, pan })
  // Tail: the shot echoing off the island.
  burst({ t: t + 0.01, noise: 'pink', type: 'lowpass', f: Math.min(f.lp, 2200), f2: 400, q: 0.5, a: 0.01, d: g.tail, gain: lvl * 0.25, bus, pan, verb: f.verb })
  if (own && (kind === 'sniper' || kind === 'shotgun' || kind === 'revolver' || kind === 'lever')) buzz(18)
}

// Shots that are not a powder crack: a suppressed rifle, a crossbow, the launchers.
const SPECIAL = {
  // Suppressed: a dull cough plus the action cycling (that clack is most of what you hear).
  silenced(dist, pan, own) {
    const f = falloff(dist * 3)
    if (f.gain < 0.01 || !voice(0.3, own ? 3 : 1)) return
    const t = now()
    const lvl = 0.42 * f.gain
    burst({ t, noise: 'pink', type: 'bandpass', f: Math.min(f.lp, vary(900, 0.1)), q: 1.1, a: 0.001, d: 0.05, gain: lvl, pan })
    tone({ t, type: 'triangle', f: vary(260, 0.05), f2: 90, glide: 0.05, d: 0.06, gain: lvl * 0.6, pan })
    modal({ t: t + 0.012, f: vary(1700, 0.05), modes: METAL, gain: lvl * 0.35, strike: lvl * 0.4, pan })
    modal({ t: t + 0.05, f: vary(1250, 0.05), modes: METAL, gain: lvl * 0.25, pan })
  },
  // Crossbow: the string slaps forward and the limbs thrum.
  crossbow(dist, pan, own) {
    const f = falloff(dist * 3)
    if (f.gain < 0.01 || !voice(0.5, own ? 3 : 1)) return
    const t = now()
    const lvl = 0.5 * f.gain
    burst({ t, noise: 'white', type: 'bandpass', f: 2600, q: 1.5, a: 0.0006, d: 0.025, gain: lvl * 0.8, pan })
    tone({ t, type: 'triangle', f: vary(190, 0.04), f2: 120, glide: 0.3, a: 0.002, d: 0.32, gain: lvl * 0.7, pan })
    tone({ t, type: 'sine', f: vary(95, 0.04), d: 0.25, gain: lvl * 0.5, pan })
    modal({ t, f: vary(620, 0.05), modes: PLASTIC, gain: lvl * 0.5, pan })
    burst({ t: t + 0.01, noise: 'pink', type: 'bandpass', f: 1800, f2: 600, q: 2, a: 0.01, d: 0.18, gain: lvl * 0.3, pan })
  },
  // Grenade launcher: the hollow "thoonk" of the round leaving a fat tube.
  launcher(dist, pan, own) {
    const f = falloff(dist * 0.8)
    if (f.gain < 0.01 || !voice(0.6, own ? 3 : 1)) return
    const t = now()
    const lvl = 0.7 * f.gain
    tone({ t, type: 'sine', f: vary(150, 0.04), f2: 55, glide: 0.12, a: 0.002, d: 0.22, gain: lvl, pan })
    tone({ t, type: 'triangle', f: vary(320, 0.04), f2: 140, glide: 0.08, d: 0.12, gain: lvl * 0.4, pan })
    burst({ t, noise: 'brown', type: 'lowpass', f: Math.min(f.lp, 700), a: 0.002, d: 0.2, gain: lvl * 0.9, pan })
    burst({ t: t + 0.01, noise: 'pink', type: 'lowpass', f: 1600, f2: 300, a: 0.01, d: 0.4, gain: lvl * 0.2, pan, verb: f.verb })
    modal({ t: t + 0.02, f: vary(700, 0.05), modes: METAL, gain: lvl * 0.15, pan })
    if (own) buzz(22)
  },
  // Rocket: ignition crack, then the motor roaring away.
  rocket(dist, pan, own) {
    const f = falloff(dist * 0.6)
    if (f.gain < 0.01 || !voice(1.4, own ? 3 : 2)) return
    const t = now()
    const lvl = 0.8 * f.gain
    burst({ t, noise: 'white', type: 'bandpass', f: Math.min(f.lp, 1800), q: 0.6, a: 0.001, d: 0.1, gain: lvl * 0.8, pan })
    tone({ t, type: 'sine', f: 80, f2: 40, d: 0.4, gain: lvl * 0.7, pan })
    burst({ t: t + 0.02, noise: 'pink', type: 'bandpass', f: 500, f2: 2600, sweep: 0.25, q: 0.8, a: 0.04, hold: 0.25, d: 0.9, gain: lvl * 0.55, pan, verb: f.verb })
    burst({ t: t + 0.02, noise: 'brown', type: 'lowpass', f: 500, a: 0.03, hold: 0.3, d: 0.8, gain: lvl * 0.6, pan })
    crinkle({ t: t + 0.05, n: 18, dur: 0.6, gain: 0.08 * f.gain, f0: 1500, f1: 6000, width: 0.4 })
    if (own) buzz([30, 20, 40])
  },
}

// Working the action after a shot: 'pump' (shotgun slide back and forward), 'bolt' (lift, back,
// forward, lock), 'lever' (lever down and up, a quick double clack).
export function bolt(kind) {
  if (!voice(0.6, 2)) return
  if (kind === 'lever') {
    const t = now() + 0.1
    modal({ t, f: vary(1150, 0.05), modes: METAL, gain: 0.14, strike: 0.2 })
    burst({ t: t + 0.06, noise: 'pink', f: 2200, q: 1.2, d: 0.05, gain: 0.07 })
    modal({ t: t + 0.22, f: vary(1500, 0.05), modes: METAL, gain: 0.16, strike: 0.25 })
    return
  }
  if (kind === 'bolt' || kind === 'sniper') {
    const t = now() + 0.24
    modal({ t, f: vary(1400, 0.05), modes: METAL, gain: 0.1, strike: 0.15 }) // lift
    burst({ t: t + 0.1, noise: 'pink', f: 1800, f2: 900, q: 1.5, d: 0.12, gain: 0.07 }) // slide back
    modal({ t: t + 0.24, f: vary(900, 0.05), modes: METAL, gain: 0.14, strike: 0.2 })
    burst({ t: t + 0.32, noise: 'pink', f: 900, f2: 1800, q: 1.5, d: 0.1, gain: 0.07 }) // forward
    modal({ t: t + 0.46, f: vary(1300, 0.05), modes: METAL, gain: 0.16, strike: 0.25 }) // lock
    return
  }
  const t = now() + 0.28
  modal({ t, f: vary(900, 0.05), modes: METAL, gain: 0.12, strike: 0.15 })
  burst({ t: t + 0.02, noise: 'pink', f: 1200, f2: 600, q: 1, d: 0.08, gain: 0.06 })
  modal({ t: t + 0.12, f: vary(1300, 0.05), modes: METAL, gain: 0.14, strike: 0.2 })
}

export function dryFire() {
  if (!limit('dry', 160) || !voice(0.1, 2)) return
  modal({ t: now(), f: 2400, modes: METAL, gain: 0.12, strike: 0.2 })
}

// Reload, spread over `time` s. style: 'mag' (mag out, mag in, charging handle), 'drum' (a heavy
// drum slapped in), 'revolver' (cylinder out, cases tinkling down, rounds in, snap shut), 'shells'
// (rounds pushed in one by one), 'break' (barrels drop open, shells out and in, slam shut),
// 'string' (a crank ratcheting the string back), 'tube' (breech open, a 40 mm round in, close),
// 'rocket' (a rocket slid into the tube and latched).
export function reload(time = 2, style = 'mag') {
  if (!voice(time, 2)) return
  const t = now()
  if (RELOADS[style]) return RELOADS[style](t, time)
  modal({ t: t + time * 0.12, f: vary(700, 0.05), modes: METAL, gain: 0.14, strike: 0.25 })
  burst({ t: t + time * 0.14, f: 900, q: 1, d: 0.05, gain: 0.08 })
  modal({ t: t + time * 0.55, f: vary(560, 0.05), modes: METAL, gain: 0.2, strike: 0.3 })
  burst({ t: t + time * 0.56, noise: 'brown', type: 'lowpass', f: 600, d: 0.06, gain: 0.2 })
  modal({ t: t + time * 0.82, f: vary(1150, 0.05), modes: METAL, gain: 0.16, strike: 0.25 })
  modal({ t: t + time * 0.9, f: vary(1500, 0.05), modes: METAL, gain: 0.14, strike: 0.2 })
}

const RELOADS = {
  drum(t, time) {
    modal({ t: t + time * 0.12, f: vary(520, 0.05), modes: METAL, gain: 0.16, strike: 0.3 })
    burst({ t: t + time * 0.13, noise: 'brown', type: 'lowpass', f: 500, d: 0.08, gain: 0.2 })
    for (let i = 0; i < 4; i++) modal({ t: t + time * 0.4 + i * 0.05, f: vary(2400, 0.1), modes: METAL, gain: 0.04 }) // rounds rattling
    modal({ t: t + time * 0.58, f: vary(430, 0.05), modes: METAL, gain: 0.24, strike: 0.35 })
    burst({ t: t + time * 0.585, noise: 'brown', type: 'lowpass', f: 450, d: 0.08, gain: 0.26 })
    modal({ t: t + time * 0.86, f: vary(1100, 0.05), modes: METAL, gain: 0.16, strike: 0.25 })
  },
  revolver(t, time) {
    modal({ t: t + time * 0.06, f: vary(1700, 0.05), modes: METAL, gain: 0.12, strike: 0.2 }) // latch
    burst({ t: t + time * 0.12, noise: 'pink', f: 1500, f2: 3000, q: 1.5, d: 0.06, gain: 0.06 }) // swing out
    for (let i = 0; i < 6; i++) modal({ t: t + time * 0.24 + Math.random() * 0.18, f: vary(3200, 0.15), modes: COIN, gain: 0.05 }) // brass falling
    for (let i = 0; i < 6; i++) modal({ t: t + time * (0.4 + i * 0.065), f: vary(2100, 0.05), modes: METAL, gain: 0.06, strike: 0.1 }) // rounds in
    modal({ t: t + time * 0.86, f: vary(1300, 0.05), modes: METAL, gain: 0.18, strike: 0.3 }) // snap shut
    burst({ t: t + time * 0.86, noise: 'brown', type: 'lowpass', f: 700, d: 0.05, gain: 0.14 })
  },
  shells(t, time) {
    const n = 5
    for (let i = 0; i < n; i++) {
      const at = t + time * (0.12 + (i / n) * 0.72)
      modal({ t: at, f: vary(1800, 0.06), modes: METAL, gain: 0.08, strike: 0.15 })
      burst({ t: at + 0.02, noise: 'pink', f: 1200, q: 1, d: 0.04, gain: 0.05 })
    }
    modal({ t: t + time * 0.92, f: vary(1300, 0.05), modes: METAL, gain: 0.14, strike: 0.2 })
  },
  break(t, time) {
    modal({ t: t + time * 0.04, f: vary(1500, 0.05), modes: METAL, gain: 0.14, strike: 0.25 }) // lever
    modal({ t: t + time * 0.12, f: vary(650, 0.05), modes: METAL, gain: 0.16, strike: 0.2 }) // barrels drop
    for (let i = 0; i < 2; i++) modal({ t: t + time * 0.26 + i * 0.07, f: vary(900, 0.1), modes: PLASTIC, gain: 0.08 }) // shells out
    for (let i = 0; i < 2; i++) burst({ t: t + time * (0.5 + i * 0.12), noise: 'pink', f: 1100, q: 1.2, d: 0.05, gain: 0.08 }) // shells in
    modal({ t: t + time * 0.84, f: vary(520, 0.05), modes: METAL, gain: 0.24, strike: 0.35 }) // slam shut
    burst({ t: t + time * 0.845, noise: 'brown', type: 'lowpass', f: 600, d: 0.07, gain: 0.22 })
  },
  string(t, time) {
    // A ratcheting crank, faster as it goes, then the latch.
    const n = 12
    for (let i = 0; i < n; i++) modal({ t: t + time * (0.08 + 0.55 * Math.sqrt(i / n)), f: vary(2600, 0.06), modes: METAL, gain: 0.05, strike: 0.08 })
    tone({ t: t + time * 0.1, type: 'triangle', f: 90, f2: 160, glide: time * 0.55, d: time * 0.55, gain: 0.03 })
    modal({ t: t + time * 0.68, f: vary(1500, 0.05), modes: METAL, gain: 0.16, strike: 0.25 }) // latch
    burst({ t: t + time * 0.8, noise: 'pink', f: 1600, f2: 900, q: 2, d: 0.12, gain: 0.05 }) // bolt slid onto the rail
  },
  tube(t, time) {
    modal({ t: t + time * 0.08, f: vary(1400, 0.05), modes: METAL, gain: 0.12, strike: 0.2 })
    modal({ t: t + time * 0.18, f: vary(480, 0.05), modes: METAL, gain: 0.18, strike: 0.25 }) // breaks open
    modal({ t: t + time * 0.32, f: vary(1600, 0.1), modes: COIN, gain: 0.06 }) // spent case out
    burst({ t: t + time * 0.5, noise: 'pink', f: 700, f2: 300, q: 1, d: 0.12, gain: 0.1 }) // round in
    modal({ t: t + time * 0.66, f: vary(600, 0.05), modes: METAL, gain: 0.14, strike: 0.2 })
    modal({ t: t + time * 0.86, f: vary(420, 0.05), modes: METAL, gain: 0.24, strike: 0.35 }) // close
  },
  rocket(t, time) {
    burst({ t: t + time * 0.15, noise: 'pink', f: 500, f2: 1400, q: 0.9, a: 0.05, d: time * 0.35, gain: 0.1 }) // slides in
    modal({ t: t + time * 0.55, f: vary(380, 0.05), modes: METAL, gain: 0.2, strike: 0.3 })
    modal({ t: t + time * 0.7, f: vary(1800, 0.05), modes: METAL, gain: 0.14, strike: 0.25 }) // latch
    modal({ t: t + time * 0.88, f: vary(1200, 0.05), modes: METAL, gain: 0.12, strike: 0.2 }) // hammer cocked
  },
}

export function swap() {
  if (!limit('swap', 80) || !voice(0.3, 2)) return
  const t = now()
  burst({ t, f: 1800, f2: 600, q: 0.8, d: 0.12, gain: 0.08 })
  modal({ t: t + 0.08, f: vary(1000, 0.05), modes: METAL, gain: 0.12, strike: 0.2 })
}

// A melee swing through the air; heavier tools whoosh lower and longer.
export function swing(kind = 'knife') {
  if (!voice(0.3, 2)) return
  const t = now()
  if (kind === 'crowbar' || kind === 'pan') burst({ t, noise: 'pink', f: 380, f2: 1400, q: 1.2, a: 0.05, d: 0.22, gain: 0.32 })
  else if (kind === 'machete' || kind === 'sword') {
    burst({ t, noise: 'pink', f: 900, f2: 3200, q: 1.6, a: 0.04, d: 0.18, gain: 0.3 })
    burst({ t: t + 0.03, noise: 'white', f: 5200, q: 3, a: 0.02, d: 0.08, gain: 0.05 })
  } else burst({ t, noise: 'pink', f: 700, f2: 2400, q: 1.4, a: 0.03, d: 0.16, gain: 0.25 })
}

// A melee blow landing. kind: the weapon's `kind`; surface 'ice' for a frost wall.
const PAN_MODES = [[1, 1, 0.9], [2.32, 0.55, 0.6], [3.71, 0.35, 0.45], [5.1, 0.2, 0.3], [6.8, 0.12, 0.2]]
export function meleeHit(kind = 'knife', { dist = 0, pan = 0 } = {}, surface = 'body') {
  const f = falloff(dist * 2)
  if (f.gain < 0.02 || !voice(1, 2)) return
  const t = now()
  const g = f.gain
  if (surface === 'ice') {
    for (let i = 0; i < 6; i++) modal({ t: t + i * 0.02, f: rnd(2000, 5000), modes: GLASS, gain: 0.06 * g, decay: 0.4, pan })
    burst({ t, noise: 'white', type: 'highpass', f: 2500, d: 0.12, gain: 0.25 * g, pan })
  }
  if (kind === 'pan') {
    // BONG: cast iron ringing like a bell.
    modal({ t, f: vary(560, 0.03), modes: PAN_MODES, gain: 0.32 * g, strike: 0.4 * g, beat: 6, pan, verb: f.verb })
    burst({ t, noise: 'brown', type: 'lowpass', f: 600, d: 0.08, gain: 0.4 * g, pan })
    return
  }
  if (kind === 'crowbar') {
    modal({ t, f: vary(1250, 0.05), modes: METAL, gain: 0.2 * g, strike: 0.3 * g, decay: 2, pan })
    burst({ t, noise: 'brown', type: 'lowpass', f: 650, d: 0.1, gain: 0.55 * g, pan })
    tone({ t, f: 120, f2: 60, d: 0.1, gain: 0.3 * g, pan })
    return
  }
  if (kind === 'machete') {
    burst({ t, noise: 'white', type: 'bandpass', f: 3000, f2: 1200, q: 1.5, d: 0.08, gain: 0.25 * g, pan })
    burst({ t, noise: 'brown', type: 'lowpass', f: 700, d: 0.08, gain: 0.45 * g, pan })
    modal({ t: t + 0.01, f: vary(2400, 0.05), modes: METAL, gain: 0.06 * g, pan })
    return
  }
  burst({ t, noise: 'brown', type: 'lowpass', f: 700, d: 0.08, gain: 0.5 * g, pan })
  tone({ t, f: 140, f2: 70, d: 0.08, gain: 0.3 * g, pan })
}

// A bullet from behind ringing off the frying pan on someone's back.
export function panBlock({ dist = 0, pan = 0 } = {}) {
  const f = falloff(dist * 1.5)
  if (f.gain < 0.02 || !limit('panb', 50) || !voice(1, 2)) return
  const t = now()
  modal({ t, f: vary(640, 0.05), modes: PAN_MODES, gain: 0.26 * f.gain, strike: 0.35 * f.gain, beat: 6, pan, verb: f.verb })
  burst({ t, noise: 'white', type: 'highpass', f: 3000, d: 0.04, gain: 0.15 * f.gain, pan })
}

// A crossbow bolt thudding into a wall ('wood') or a player ('flesh').
export function boltHit({ dist = 0, pan = 0 } = {}, kind = 'wood') {
  const f = falloff(dist * 2)
  if (f.gain < 0.02 || !voice(0.4, 1)) return
  const t = now()
  burst({ t, noise: 'brown', type: 'lowpass', f: kind === 'flesh' ? 500 : 900, d: 0.07, gain: 0.45 * f.gain, pan })
  if (kind === 'wood') {
    modal({ t, f: vary(420, 0.05), modes: PLASTIC, gain: 0.25 * f.gain, pan })
    tone({ t, type: 'triangle', f: vary(170, 0.05), d: 0.2, gain: 0.12 * f.gain, pan }) // the shaft quivering
  }
}

// --- Hits -------------------------------------------------------------------------
// Feedback for the shooter: a dry tick, a metal ping for headshots.
export function hitmarker(head = false) {
  if (!limit('hm', 35) || !voice(0.3, 3)) return
  const t = now()
  if (head) {
    modal({ t, f: vary(2600, 0.02), modes: BELL, gain: 0.16, decay: 0.35, strike: 0.2 })
    tone({ t, f: 3300, d: 0.05, gain: 0.08 })
  } else {
    burst({ t, f: 3800, q: 2, d: 0.018, gain: 0.22 })
    tone({ t, type: 'square', f: 1800, d: 0.02, gain: 0.04, lp: 4000 })
  }
}

export function knock() {
  if (!voice(0.6, 3)) return
  const t = now()
  tone({ t, type: 'sine', f: 180, f2: 60, d: 0.3, gain: 0.4 })
  modal({ t, f: 880, modes: BELL, gain: 0.12, decay: 0.4 })
}

export function elimination(streak = 1) {
  if (!voice(1.2, 4)) return
  const t = now()
  const base = 660 * Math.pow(2, Math.min(streak - 1, 4) / 12)
  modal({ t, f: base, modes: BELL, gain: 0.22, decay: 0.8, strike: 0.15 })
  modal({ t: t + 0.09, f: base * 1.5, modes: BELL, gain: 0.2, decay: 0.9, strike: 0.15 })
  tone({ t, type: 'sine', f: 110, f2: 55, d: 0.35, gain: 0.35 })
  buzz([20, 30, 20])
}

// Taking damage: a body thump and a short ringing.
export function hurt(heavy = false) {
  if (!limit('hurt', 90) || !voice(0.4, 3)) return
  const t = now()
  burst({ t, noise: 'brown', type: 'lowpass', f: 500, d: heavy ? 0.22 : 0.12, gain: heavy ? 0.55 : 0.35 })
  tone({ t, type: 'sine', f: heavy ? 90 : 120, f2: 50, d: 0.18, gain: 0.3 })
  if (heavy) buzz(30)
}

// Bullet hitting the world near the listener.
export function impact(material = 'stone', { dist = 0, pan = 0 } = {}) {
  if (dist > 30 || !limit('imp', 25)) return
  const f = falloff(dist * 3)
  if (!voice(0.2, 1)) return
  const t = now()
  if (material === 'metal') modal({ t, f: vary(1700, 0.2), modes: METAL, gain: 0.12 * f.gain, strike: 0.2, pan })
  else burst({ t, noise: 'white', f: vary(material === 'wood' ? 1200 : 2400, 0.2), q: 1, d: 0.04, gain: 0.18 * f.gain, pan })
}

// A bullet passing close by the listener's head.
export function whiz(pan = 0) {
  if (!limit('whiz', 60) || !voice(0.2, 2)) return
  const t = now()
  burst({ t, noise: 'white', type: 'bandpass', f: 5200, f2: 1600, q: 3, a: 0.02, d: 0.09, gain: 0.16, pan })
}

export function punch() {
  if (!voice(0.3, 2)) return
  const t = now()
  burst({ t, noise: 'brown', type: 'lowpass', f: 700, d: 0.08, gain: 0.5 })
  tone({ t, f: 140, f2: 70, d: 0.08, gain: 0.3 })
}

// --- Explosives / utility --------------------------------------------------------------
// size: 1 for a grenade, more for a rocket (longer, deeper), less for a 40 mm round.
export function explosion({ dist = 0, pan = 0 } = {}, size = 1) {
  const f = falloff(dist * 0.6 / size)
  if (f.gain < 0.01 || !voice(2.5, 4)) return
  const t = now()
  const g = f.gain * Math.min(1.15, size)
  burst({ t, noise: 'brown', type: 'lowpass', f: Math.min(f.lp, 400), f2: 60, q: 0.7, a: 0.004, d: 1.6 * size, gain: 1.1 * g, pan, verb: f.verb })
  burst({ t, noise: 'white', type: 'bandpass', f: Math.min(f.lp, 1800), q: 0.5, a: 0.001, d: 0.12, gain: 0.7 * g, pan })
  tone({ t, type: 'sine', f: 70 / size, f2: 28, d: 1 * size, gain: 0.8 * g, pan })
  crinkle({ t: t + 0.25, n: Math.round(26 * size), dur: 1.1 * size, gain: 0.12 * f.gain, f0: 900, f1: 4500, width: 0.7 })
  if (dist < 20) buzz([60, 40, 90])
}

// The Firebottle shattering into flames.
export function molotov({ dist = 0, pan = 0 } = {}) {
  const f = falloff(dist * 1.2)
  if (f.gain < 0.02 || !voice(1.5, 3)) return
  const t = now()
  for (let i = 0; i < 9; i++) modal({ t: t + Math.random() * 0.08, f: rnd(2500, 6500), modes: GLASS, gain: 0.07 * f.gain, decay: 0.35, pan })
  burst({ t, noise: 'white', type: 'highpass', f: 3000, d: 0.12, gain: 0.3 * f.gain, pan })
  burst({ t: t + 0.03, noise: 'pink', type: 'bandpass', f: 300, f2: 1500, q: 0.7, a: 0.08, d: 0.7, gain: 0.45 * f.gain, pan, verb: f.verb }) // whoomph
  burst({ t: t + 0.03, noise: 'brown', type: 'lowpass', f: 300, a: 0.05, d: 0.6, gain: 0.4 * f.gain, pan })
}

// Fire burning: a few pops and a breathy roar (called every ~0.35 s while a fire burns).
export function fireCrackle({ dist = 0, pan = 0 } = {}) {
  const f = falloff(dist * 2)
  if (f.gain < 0.02 || !voice(0.5, 0.5)) return
  const t = now()
  burst({ t, noise: 'brown', type: 'lowpass', f: 380, a: 0.1, d: 0.35, gain: 0.16 * f.gain, pan })
  const n = 3 + Math.floor(Math.random() * 4)
  for (let i = 0; i < n; i++) burst({ t: t + Math.random() * 0.35, noise: 'white', type: 'bandpass', f: rnd(1200, 5000), q: 2, a: 0.0005, d: rnd(0.004, 0.012), gain: 0.16 * f.gain, pan: pan + rnd(-0.2, 0.2) })
}

// A smoke canister popping, then hissing out its cloud.
export function smokePop({ dist = 0, pan = 0 } = {}) {
  const f = falloff(dist * 1.5)
  if (f.gain < 0.02 || !voice(1.5, 2)) return
  const t = now()
  modal({ t, f: vary(900, 0.05), modes: METAL, gain: 0.12 * f.gain, strike: 0.2, pan })
  burst({ t, noise: 'brown', type: 'lowpass', f: 500, d: 0.15, gain: 0.35 * f.gain, pan })
  burst({ t: t + 0.05, noise: 'white', type: 'highpass', f: 2200, a: 0.05, hold: 0.6, d: 0.8, gain: 0.18 * f.gain, pan })
}
export function smokeHiss({ dist = 0, pan = 0 } = {}) {
  const f = falloff(dist * 2)
  if (f.gain < 0.02 || !limit('hiss', 180) || !voice(0.4, 0.5)) return
  burst({ t: now(), noise: 'white', type: 'highpass', f: 2600, a: 0.05, d: 0.3, gain: 0.07 * f.gain, pan })
}

// The stun grenade: a deafening crack with a hard edge.
export function flashBang({ dist = 0, pan = 0 } = {}) {
  const f = falloff(dist * 0.4)
  if (f.gain < 0.01 || !voice(1.5, 4)) return
  const t = now()
  burst({ t, noise: 'white', type: 'highpass', f: 900, a: 0.0005, d: 0.18, gain: 0.95 * f.gain, pan })
  burst({ t, noise: 'brown', type: 'lowpass', f: Math.min(f.lp, 500), a: 0.002, d: 0.9, gain: 0.8 * f.gain, pan, verb: f.verb })
  tone({ t, type: 'sine', f: 90, f2: 40, d: 0.5, gain: 0.5 * f.gain, pan })
  if (dist < 15) buzz([80, 30, 60])
}

// Blinded and deafened: every other sound drops away under a high ring for `dur` s.
let sfxBase = null
export function tinnitus(dur = 2) {
  if (!voice(dur, 4) || !A.sfx) return
  const t = now()
  tone({ t, type: 'sine', f: vary(3600, 0.03), a: 0.02, hold: dur * 0.3, d: dur * 0.9, gain: 0.07, bus: A.ui })
  tone({ t, type: 'sine', f: vary(5100, 0.03), a: 0.02, hold: dur * 0.2, d: dur * 0.7, gain: 0.025, bus: A.ui })
  if (sfxBase === null) sfxBase = A.sfx.gain.value
  const g = A.sfx.gain
  g.cancelScheduledValues(t)
  g.setTargetAtTime(sfxBase * 0.15, t, 0.02)
  g.setTargetAtTime(sfxBase, t + dur * 0.5, dur * 0.3)
  if (A.world) {
    A.world.gain.cancelScheduledValues(t)
    A.world.gain.setTargetAtTime(0.1, t, 0.02)
    A.world.gain.setTargetAtTime(1, t + dur * 0.5, dur * 0.3)
  }
}

// A sticky charge slapping onto something, then beeping faster and faster.
export function stick({ dist = 0, pan = 0 } = {}) {
  const f = falloff(dist * 2)
  if (f.gain < 0.02 || !voice(0.3, 2)) return
  const t = now()
  burst({ t, noise: 'brown', type: 'lowpass', f: 600, d: 0.06, gain: 0.4 * f.gain, pan })
  burst({ t, noise: 'pink', type: 'bandpass', f: 1400, q: 2, d: 0.05, gain: 0.12 * f.gain, pan })
}
export function stickyBeep({ dist = 0, pan = 0 } = {}, urgent = false) {
  const f = falloff(dist * 2.5)
  if (f.gain < 0.02 || !voice(0.1, 1)) return
  tone({ t: now(), type: 'square', f: urgent ? 2400 : 1900, d: 0.05, gain: 0.05 * f.gain, lp: 5000, pan })
}

export function pinPull() {
  if (!voice(0.3, 2)) return
  const t = now()
  modal({ t, f: 2800, modes: METAL, gain: 0.12, strike: 0.2 })
  modal({ t: t + 0.18, f: 1900, modes: METAL, gain: 0.08 })
}

export function bounce({ dist = 0, pan = 0 } = {}) {
  if (dist > 40 || !limit('bounce', 70) || !voice(0.2, 1)) return
  modal({ t: now(), f: vary(1100, 0.1), modes: METAL, gain: 0.14 * falloff(dist * 2).gain, strike: 0.3, pan })
}

export function frostWall({ dist = 0, pan = 0 } = {}) {
  const f = falloff(dist * 1.5)
  if (f.gain < 0.02 || !voice(1.2, 3)) return
  const t = now()
  burst({ t, noise: 'pink', type: 'highpass', f: 1500, q: 0.6, a: 0.02, d: 0.5, gain: 0.25 * f.gain, pan })
  for (let i = 0; i < 6; i++) modal({ t: t + i * 0.04, f: rnd(1800, 4200), modes: GLASS, gain: 0.06 * f.gain, decay: 0.6, pan })
  tone({ t, type: 'sine', f: 220, f2: 90, d: 0.3, gain: 0.25 * f.gain, pan })
}

export function iceShatter({ dist = 0, pan = 0 } = {}) {
  const f = falloff(dist * 1.5)
  if (f.gain < 0.02 || !voice(1, 3)) return
  const t = now()
  burst({ t, noise: 'white', type: 'highpass', f: 2500, d: 0.25, gain: 0.3 * f.gain, pan })
  for (let i = 0; i < 10; i++) modal({ t: t + Math.random() * 0.25, f: rnd(2000, 6000), modes: GLASS, gain: 0.05 * f.gain, decay: 0.4, pan })
}

export function heal() {
  if (!voice(1, 2)) return
  const t = now()
  ;[0, 4, 7, 12].forEach((s, i) => modal({ t: t + i * 0.07, f: 880 * Math.pow(2, s / 12), modes: BELL, gain: 0.1, decay: 0.6 }))
  burst({ t, noise: 'pink', type: 'highpass', f: 3000, a: 0.1, d: 0.5, gain: 0.08 })
}

export function bandage(time = 2) {
  if (!voice(time, 1)) return
  crinkle({ t: now(), n: Math.round(18 * time), dur: time * 0.9, gain: 0.1, f0: 1500, f1: 6000, width: 0.3 })
}

export function dash() {
  if (!voice(0.4, 2)) return
  const t = now()
  burst({ t, noise: 'pink', type: 'bandpass', f: 400, f2: 3000, q: 1, a: 0.02, d: 0.25, gain: 0.35 })
}

export function ultimate() {
  if (!voice(1.5, 4)) return
  const t = now()
  tone({ t, type: 'sawtooth', f: 110, f2: 880, glide: 0.6, a: 0.05, d: 0.8, gain: 0.12, lp: 2400 })
  burst({ t, noise: 'pink', type: 'bandpass', f: 300, f2: 4000, q: 1, a: 0.3, d: 0.6, gain: 0.2 })
  modal({ t: t + 0.55, f: 1320, modes: BELL, gain: 0.18, decay: 1 })
  buzz([30, 20, 60])
}

// --- Movement ----------------------------------------------------------------------
export function footstep({ dist = 0, pan = 0, surface = 'grass', own = false } = {}) {
  if (dist > 28) return
  const f = falloff(dist * 4)
  if (!voice(0.12, own ? 1 : 0.5)) return
  const t = now()
  const lvl = (own ? 0.13 : 0.16) * f.gain
  const fc = surface === 'wood' ? 600 : surface === 'stone' ? 1400 : surface === 'sand' ? 900 : 1100
  burst({ t, noise: surface === 'grass' || surface === 'sand' ? 'pink' : 'white', f: vary(fc, 0.15), q: 0.9, a: 0.004, d: 0.06, gain: lvl, pan })
  burst({ t, noise: 'brown', type: 'lowpass', f: 300, d: 0.05, gain: lvl * 1.3, pan })
}

export function land() {
  if (!limit('land', 120) || !voice(0.2, 1)) return
  burst({ t: now(), noise: 'brown', type: 'lowpass', f: 450, d: 0.12, gain: 0.35 })
}

export function jump() {
  if (!voice(0.15, 1)) return
  burst({ t: now(), noise: 'pink', f: 900, q: 0.8, d: 0.06, gain: 0.08 })
}

// --- Loot ---------------------------------------------------------------------------
export function crateOpen() {
  if (!voice(1, 2)) return
  const t = now()
  modal({ t, f: 220, modes: [[1, 1, 0.12], [2.6, 0.5, 0.06]], gain: 0.3, strike: 0.2 })
  burst({ t: t + 0.05, f: 500, f2: 200, q: 2, a: 0.05, d: 0.3, gain: 0.12 })
  ;[0, 5, 9].forEach((s, i) => modal({ t: t + 0.25 + i * 0.06, f: 1320 * Math.pow(2, s / 12), modes: COIN, gain: 0.08 }))
}

export function pickup() {
  if (!limit('pick', 60) || !voice(0.3, 2)) return
  const t = now()
  modal({ t, f: 1568, modes: COIN, gain: 0.12 })
  modal({ t: t + 0.06, f: 2093, modes: COIN, gain: 0.1 })
}

export function airdrop() {
  if (!voice(2, 3)) return
  const t = now()
  tone({ t, type: 'triangle', f: 660, d: 0.3, gain: 0.15 })
  tone({ t: t + 0.35, type: 'triangle', f: 880, d: 0.4, gain: 0.15 })
}

// --- Match flow / UI ----------------------------------------------------------------
export function click(pan = 0) {
  if (!limit('click', 30) || !voice(0.1, 2)) return
  const t = now()
  burst({ t, f: vary(4200, 0.1), q: 1.2, d: 0.006, gain: 0.18, bus: A.ui, pan })
  modal({ t, f: vary(1250, 0.06), modes: PLASTIC, gain: 0.14, bus: A.ui, pan })
  tone({ t, f: vary(170, 0.05), f2: 85, d: 0.04, gain: 0.2, bus: A.ui, pan })
}

export function hover() {
  if (!limit('hover', 50) || !voice(0.05, 0.5)) return
  tone({ t: now(), f: 1800, d: 0.02, gain: 0.03, bus: A.ui })
}

export function purchase() {
  if (!voice(1, 3)) return
  const t = now()
  for (let i = 0; i < 6; i++) modal({ t: t + i * 0.045, f: vary(1900, 0.12), modes: COIN, gain: 0.11, bus: A.ui })
  modal({ t: t + 0.3, f: 1568, modes: BELL, gain: 0.12, decay: 0.7, bus: A.ui })
}

export function deny() {
  if (!limit('deny', 150) || !voice(0.3, 2)) return
  const t = now()
  tone({ t, type: 'square', f: 180, d: 0.09, gain: 0.08, lp: 1200, bus: A.ui })
  tone({ t: t + 0.11, type: 'square', f: 140, d: 0.12, gain: 0.08, lp: 1200, bus: A.ui })
}

export function equip() {
  if (!voice(0.3, 2)) return
  const t = now()
  modal({ t, f: 900, modes: METAL, gain: 0.15, strike: 0.2, bus: A.ui })
  modal({ t: t + 0.07, f: 1350, modes: METAL, gain: 0.13, strike: 0.2, bus: A.ui })
}

export function countdown(final = false) {
  if (!voice(1, 4)) return
  const t = now()
  if (final) {
    tone({ t, type: 'sawtooth', f: 440, d: 0.6, gain: 0.12, lp: 2000, bus: A.ui })
    tone({ t, type: 'sawtooth', f: 660, d: 0.6, gain: 0.1, lp: 2000, bus: A.ui })
    tone({ t, type: 'sine', f: 110, f2: 55, d: 0.5, gain: 0.3, bus: A.ui })
  } else tone({ t, type: 'triangle', f: 880, d: 0.18, gain: 0.16, bus: A.ui })
}

export function streak(level = 2) {
  if (!voice(1.4, 4)) return
  const t = now()
  burst({ t, noise: 'pink', type: 'bandpass', f: 600, f2: 4000, q: 0.8, a: 0.05, d: 0.35, gain: 0.2, bus: A.ui })
  const root = 523 * Math.pow(2, Math.min(level - 2, 4) / 12)
  ;[0, 4, 7, 12].forEach((s, i) => tone({ t: t + 0.1 + i * 0.07, type: 'triangle', f: root * Math.pow(2, s / 12), d: 0.35, gain: 0.1, bus: A.ui }))
}

export function victory() {
  if (!voice(3, 5)) return
  const t = now()
  const notes = [[0, 0], [4, 0.14], [7, 0.28], [12, 0.42], [7, 0.62], [12, 0.76]]
  for (const [s, at] of notes) {
    tone({ t: t + at, type: 'sawtooth', f: 392 * Math.pow(2, s / 12), d: 0.5, gain: 0.08, lp: 2500, bus: A.ui })
    tone({ t: t + at, type: 'triangle', f: 196 * Math.pow(2, s / 12), d: 0.5, gain: 0.08, bus: A.ui })
  }
  modal({ t: t + 0.76, f: 1568, modes: BELL, gain: 0.2, decay: 1.5, bus: A.ui })
}

export function defeat() {
  if (!voice(2.5, 5)) return
  const t = now()
  ;[[0, 0], [-3, 0.3], [-7, 0.6]].forEach(([s, at]) => tone({ t: t + at, type: 'sawtooth', f: 330 * Math.pow(2, s / 12), d: 0.7, gain: 0.08, lp: 1400, bus: A.ui }))
  tone({ t, type: 'sine', f: 82, d: 1.4, gain: 0.25, bus: A.ui })
}

export function zoneWarning() {
  if (!limit('zone', 900) || !voice(1, 2)) return
  const t = now()
  tone({ t, type: 'square', f: 420, d: 0.25, gain: 0.06, lp: 1500, bus: A.ui })
  tone({ t: t + 0.3, type: 'square', f: 420, d: 0.25, gain: 0.06, lp: 1500, bus: A.ui })
}

export function zoneTick() {
  if (!limit('ztick', 500) || !voice(0.3, 1)) return
  burst({ t: now(), noise: 'white', type: 'highpass', f: 3000, d: 0.12, gain: 0.08 })
}

export function heartbeat() {
  if (!limit('heart', 700) || !voice(0.5, 1)) return
  const t = now()
  tone({ t, f: 62, f2: 45, d: 0.12, gain: 0.35 })
  tone({ t: t + 0.18, f: 58, f2: 42, d: 0.14, gain: 0.25 })
}

export function revive() {
  if (!voice(1, 3)) return
  const t = now()
  ;[0, 7, 12, 16].forEach((s, i) => modal({ t: t + i * 0.08, f: 660 * Math.pow(2, s / 12), modes: BELL, gain: 0.12, decay: 0.7 }))
}

export function coins() {
  if (!voice(1, 2)) return
  const t = now()
  for (let i = 0; i < 8; i++) modal({ t: t + i * 0.05 + Math.random() * 0.02, f: vary(2000, 0.15), modes: COIN, gain: 0.09, bus: A.ui })
}
