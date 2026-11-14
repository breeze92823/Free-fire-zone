// Vehicle engine: one continuous voice on the engine bus (core.js A.engine) for the vehicle the
// player sits in. Built when the player gets in; faded out, stopped and dropped when they get out.
//
// The sound sits where small laptop / phone speakers can play it (about 100-900 Hz, a soft top): a warm
// engine tone (a PeriodicWave at the firing frequency, plus a soft half-order "lope") through a
// high-pass (no sub-bass for a small speaker to choke on) and an rpm / throttle-tracking low-pass,
// and a breath of band-passed noise for the exhaust. The rpm comes from a small gearbox model (the
// revs climb through each gear and drop at each shift), smoothed here so it never jumps.
// No amplitude LFO: tremolo on a low tone is what made the old one sound broken.
import { A } from './core.js'

// idle / red: rpm; cyl: firings per two crank turns (firing frequency = rpm / 60 * cyl / 2);
// gears: the top of each gear as a share of top speed; hp: high-pass (Hz); lp: low-pass at idle and
// at the red line (Hz); harm: the tone's harmonic weights; gain: output level.
const KIND = {
  jeep: {
    idle: 760, red: 3900, cyl: 6, gears: [0.2, 0.42, 0.68, 1], hp: 85, lp: [300, 720], gain: 0.5,
    harm: [1, 0.75, 0.5, 0.33, 0.22, 0.15, 0.1, 0.07, 0.05, 0.035, 0.025, 0.018],
  },
  buggy: {
    idle: 1000, red: 5600, cyl: 4, gears: [0.17, 0.36, 0.58, 0.8, 1], hp: 95, lp: [340, 820], gain: 0.45,
    harm: [1, 0.6, 0.62, 0.34, 0.36, 0.2, 0.2, 0.11, 0.1, 0.06, 0.05, 0.03],
  },
}

let v = null
const waves = {}
function wave(ctx, kind) {
  if (waves[kind]) return waves[kind]
  const h = KIND[kind].harm
  const real = new Float32Array(h.length + 1)
  const imag = new Float32Array(h.length + 1)
  // Fixed, spread phases: a smoother waveform (lower peaks) than all-sine for the same spectrum.
  h.forEach((a, i) => {
    const ph = (i * i * 0.61) % (Math.PI * 2)
    real[i + 1] = a * Math.cos(ph)
    imag[i + 1] = a * Math.sin(ph)
  })
  return (waves[kind] = ctx.createPeriodicWave(real, imag))
}

// tone + lope -> high-pass -> low-pass x2 (a steep 24 dB/oct roll-off: no shrill top) -> out;
// exhaust noise -> band-pass -> its level -> the same low-passes.
// `out` is the level: 0 = silent (nothing else feeds it).
function build(ctx) {
  const out = ctx.createGain()
  out.gain.value = 0
  out.connect(A.engine)
  const lp2 = ctx.createBiquadFilter()
  lp2.type = 'lowpass'
  lp2.Q.value = 0.5
  lp2.connect(out)
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.Q.value = 0.5
  lp.connect(lp2)
  const hp = ctx.createBiquadFilter()
  hp.type = 'highpass'
  hp.Q.value = 0.7
  hp.connect(lp)
  const tone = ctx.createOscillator()
  const tg = ctx.createGain()
  tg.gain.value = 1
  tone.connect(tg).connect(hp)
  const lope = ctx.createOscillator() // half the firing frequency: the uneven beat of a real engine
  lope.type = 'triangle'
  const lg = ctx.createGain()
  lg.gain.value = 0.22
  lope.connect(lg).connect(hp)
  const noise = ctx.createBufferSource()
  noise.buffer = A.noise.pink
  noise.loop = true
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.Q.value = 0.8
  const ng = ctx.createGain()
  ng.gain.value = 0
  noise.connect(bp).connect(ng).connect(lp)
  for (const s of [tone, lope, noise]) s.start()
  return { out, lp, lp2, hp, tone, lope, noise, bp, ng, kind: '', rpm: 0, gear: 0, at: 0, sent: null, level: 0 }
}

// The rpm the gearbox wants: through each gear from about 45 % (just after the shift) to the red
// line (top gear: to 80 %); standing still, the throttle revs it.
function targetRpm(k, s, throttle, gear) {
  const lo = gear ? k.gears[gear - 1] : 0
  const hi = k.gears[gear]
  const f = Math.max(0, Math.min(1, (s - lo) / (hi - lo)))
  const start = gear ? 0.42 : 0.08
  const top = gear === k.gears.length - 1 ? 0.8 : 1 // top gear cruises below the red line
  let r = start + (top - start) * f
  if (s < 0.04) r = Math.max(r, 0.05 + 0.55 * throttle) // revving in place / wheelspin
  return k.idle + (k.red - k.idle) * Math.min(1, r) * (0.82 + 0.18 * throttle)
}

const set = (p, x, t, tc) => p.setTargetAtTime(x, t, tc)

// state: { speed: 0..1 (|speed| / top speed), throttle: 0..1, kind: 'jeep' | 'buggy' } or null
// (fade out).
export function setEngine(state) {
  const ctx = A.ctx
  if (!ctx || !A.engine || !A.noise.pink) return
  const t = ctx.currentTime
  if (!state) {
    // Out of the vehicle: a quick fade, then the voice is stopped and dropped (rebuilt on the next
    // ride). Stopping it, not just turning it down, means nothing can keep it audible afterwards,
    // e.g. a long main-thread freeze right after (the lobby's shader warm-up on a weak GPU).
    if (v) {
      const o = v
      o.out.gain.cancelScheduledValues(t)
      o.out.gain.setTargetAtTime(0, t, 0.06)
      for (const s of [o.tone, o.lope, o.noise]) s.stop(t + 0.5)
      o.noise.onended = () => o.out.disconnect()
      v = null
    }
    return
  }
  v ??= build(ctx)
  const kind = KIND[state.kind] ? state.kind : 'jeep'
  const k = KIND[kind]
  const s = Math.max(0, Math.min(1, state.speed))
  const thr = Math.max(0, Math.min(1, state.throttle))
  const dt = Math.min(0.1, Math.max(0, t - v.at))
  v.at = t
  if (v.kind !== kind) {
    v.kind = kind
    v.tone.setPeriodicWave(wave(ctx, kind))
    v.hp.frequency.value = k.hp
    v.rpm = k.idle
    v.gear = 0
  }
  // Gearbox: shift up past the top of a gear, down a little below the one under it (no hunting).
  while (v.gear < k.gears.length - 1 && s > k.gears[v.gear]) v.gear++
  while (v.gear > 0 && s < k.gears[v.gear - 1] - 0.04) v.gear--
  // Revs: climb at most ~5000 rpm/s, fall at ~9000 rpm/s (a shift drops them in about 0.2 s).
  const want = targetRpm(k, s, thr, v.gear)
  const step = (want > v.rpm ? 5000 : 9000) * dt
  v.rpm += Math.max(-step, Math.min(step, want - v.rpm))
  const n = (v.rpm - k.idle) / (k.red - k.idle) // 0 idle .. 1 red line
  const f = (v.rpm / 60) * (k.cyl / 2)
  const level = k.gain * (0.42 + 0.28 * n + 0.3 * thr)
  const cut = k.lp[0] + (k.lp[1] - k.lp[0]) * Math.min(1, n * (0.55 + 0.45 * thr) + 0.25 * thr)
  // Send at most ~30 times a second and only on a real change: short automation timelines.
  const p = v.sent
  if (p && t - p.t < 0.033 && Math.abs(f - p.f) < f * 0.004 && Math.abs(level - p.level) < 0.005) return
  v.sent = { t, f, level }
  set(v.tone.frequency, f, t, 0.03)
  set(v.lope.frequency, f / 2, t, 0.03)
  set(v.lp.frequency, cut, t, 0.05)
  set(v.lp2.frequency, cut * 1.15, t, 0.05)
  set(v.bp.frequency, Math.min(600, f * 3), t, 0.05)
  set(v.ng.gain, 0.04 + 0.14 * thr * (0.4 + 0.6 * n), t, 0.06)
  set(v.out.gain, level, t, 0.06)
  v.level = level
}
