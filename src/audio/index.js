// Game audio, the one import the rest of the game uses:
//   import { sfx, installAudio, updateAmbience, spatial } from './audio/index.js'
// installAudio() once at boot (waits for the first gesture to start). Every
// button press anywhere gets its click here (one capture-phase listener).
import { A, installAudio as installCore, onStart, setBreakMuted, setDucked, setMuted, setVolume, isMuted } from './core.js'
import * as sfx from './sfx.js'

export { sfx, setVolume, setMuted, setBreakMuted, isMuted, setDucked }
export { setEngine } from './engine.js'

function onPress(e) {
  if (e.button > 0) return
  const b = e.target.closest?.('button, [role="button"]')
  if (!b || b.disabled || b.classList.contains('silent')) return
  const pan = Math.max(-0.6, Math.min(0.6, (e.clientX / window.innerWidth - 0.5) * 1.2))
  sfx.click(pan)
}

// Listener pose for positional sounds: set every frame by the camera owner.
const ear = { x: 0, y: 0, z: 0, rx: 1, rz: 0 }
export function setListener(x, y, z, yaw) {
  ear.x = x
  ear.y = y
  ear.z = z
  ear.rx = Math.cos(yaw)
  ear.rz = -Math.sin(yaw)
}
// { dist, pan } of a world point relative to the listener.
const out = { dist: 0, pan: 0 }
export function spatial(x, y, z) {
  const dx = x - ear.x
  const dy = y - ear.y
  const dz = z - ear.z
  const d = Math.hypot(dx, dy, dz)
  out.dist = d
  out.pan = d > 0.5 ? Math.max(-0.85, Math.min(0.85, (dx * ear.rx + dz * ear.rz) / d)) : 0
  return { dist: out.dist, pan: out.pan }
}

// Ambient bed: wind through the island and the surf, two looping noise layers.
let amb = null
function buildAmbience(ctx) {
  const mk = (buffer, type, f, q, gain) => {
    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.loop = true
    const filt = ctx.createBiquadFilter()
    filt.type = type
    filt.frequency.value = f
    filt.Q.value = q
    const g = ctx.createGain()
    g.gain.value = gain
    src.connect(filt).connect(g).connect(A.amb)
    src.start()
    return { src, filt, g }
  }
  amb = {
    wind: mk(A.noise.pinkStereo, 'bandpass', 500, 0.4, 0.12),
    surf: mk(A.noise.brownStereo, 'lowpass', 380, 0.7, 0.0),
    t: 0,
  }
}

// level: 0..1 overall (0 in menus), shore: 0..1 how close to the water.
export function updateAmbience(dt, level = 1, shore = 0) {
  if (!amb || !A.ctx) return
  amb.t += dt
  const ct = A.ctx.currentTime
  const gust = 0.09 + 0.05 * Math.sin(amb.t * 0.21) + 0.03 * Math.sin(amb.t * 0.57)
  amb.wind.g.gain.setTargetAtTime(gust * level, ct, 0.4)
  amb.wind.filt.frequency.setTargetAtTime(420 + 220 * Math.sin(amb.t * 0.17), ct, 0.6)
  const swell = 0.5 + 0.5 * Math.sin(amb.t * 0.55)
  amb.surf.g.gain.setTargetAtTime((0.05 + 0.3 * shore * swell) * level, ct, 0.3)
}

export function installAudio() {
  installCore()
  window.addEventListener('pointerdown', onPress, { capture: true, passive: true })
  onStart(buildAmbience)
}
