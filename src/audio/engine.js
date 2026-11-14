// Vehicle engine: one continuous voice on the engine bus (core.js A.engine) for the vehicle the
// player sits in. Two detuned sawtooth oscillators an octave apart through a low-pass, plus a brown-noise
// rumble; pitch follows `rpm`, brightness and level follow `load` (the throttle). Built on first use,
// faded out (not stopped) when the player gets out, so getting back in is instant.
import { A } from './core.js'

const KIND = {
  jeep: { base: 34, span: 92, cutoff: 520, gain: 0.34 }, // a low diesel thrum
  buggy: { base: 52, span: 150, cutoff: 900, gain: 0.3 }, // a raspier small engine
}

let v = null
function build(ctx) {
  const out = ctx.createGain()
  out.gain.value = 0
  out.connect(A.engine)
  const filt = ctx.createBiquadFilter()
  filt.type = 'lowpass'
  filt.Q.value = 3
  filt.connect(out)
  const o1 = ctx.createOscillator()
  o1.type = 'sawtooth'
  const o2 = ctx.createOscillator()
  o2.type = 'sawtooth'
  o2.detune.value = 9
  const g2 = ctx.createGain()
  g2.gain.value = 0.55
  o1.connect(filt)
  o2.connect(g2).connect(filt)
  // amplitude flutter: the firing pulses
  const lfo = ctx.createOscillator()
  lfo.type = 'square'
  const lfoGain = ctx.createGain()
  lfoGain.gain.value = 0.18
  lfo.connect(lfoGain).connect(out.gain)
  const rumble = ctx.createBufferSource()
  rumble.buffer = A.noise.brown
  rumble.loop = true
  const rf = ctx.createBiquadFilter()
  rf.type = 'lowpass'
  rf.frequency.value = 160
  const rg = ctx.createGain()
  rg.gain.value = 0.5
  rumble.connect(rf).connect(rg).connect(out)
  for (const s of [o1, o2, lfo, rumble]) s.start()
  return { out, filt, o1, o2, lfo, rg, level: 0 }
}

// state: { rpm (0..1), load (0..1), kind: 'jeep' | 'buggy' } or null (silence).
export function setEngine(state) {
  const ctx = A.ctx
  if (!ctx || !A.engine) return
  if (!state) {
    if (v && v.level > 0) {
      v.out.gain.setTargetAtTime(0, ctx.currentTime, 0.15)
      v.level = 0
    }
    return
  }
  v ??= build(ctx)
  const k = KIND[state.kind] ?? KIND.jeep
  const t = ctx.currentTime
  const rpm = Math.max(0, Math.min(1, state.rpm))
  const load = Math.max(0, Math.min(1, state.load))
  const f = k.base + k.span * rpm + 8 * load
  v.o1.frequency.setTargetAtTime(f, t, 0.06)
  v.o2.frequency.setTargetAtTime(f * 2, t, 0.06)
  v.lfo.frequency.setTargetAtTime(f / 2, t, 0.06)
  v.filt.frequency.setTargetAtTime(k.cutoff * (0.6 + rpm * 0.9 + load * 0.8), t, 0.08)
  const level = k.gain * (0.55 + 0.25 * rpm + 0.35 * load)
  v.out.gain.setTargetAtTime(level, t, 0.08)
  v.rg.gain.setTargetAtTime(0.35 + 0.4 * load, t, 0.1)
  v.level = level
}
