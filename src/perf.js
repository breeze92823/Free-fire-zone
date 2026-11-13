// Auto graphics. 1) detectTier(): a starting tier guessed before the renderer exists, from
// the GPU name, memory, CPU cores and whether this is a phone/tablet. 2) createGovernor():
// during a round it averages the frame rate and walks AUTO_GRAPHICS.ladder one rung down
// when the game runs slow, and back up when it has been smooth for a while. The rung it
// settles on is remembered per GPU, so the next visit starts there (and the load-time
// settings, texture resolution and model detail, follow it).
import { AUTO_GRAPHICS, COARSE_POINTER, GRAPHICS_PRESETS } from './config.js'

const TIERS = Object.keys(GRAPHICS_PRESETS) // Low .. Ultra
const STORE_KEY = 'ffz.auto'
const lower = (a, b) => TIERS[Math.min(TIERS.indexOf(a), TIERS.indexOf(b))]

// The GPU's name ('' when the browser hides it), read from a throwaway WebGL context.
export function gpuName() {
  try {
    const c = document.createElement('canvas')
    const gl = c.getContext('webgl2') || c.getContext('webgl')
    if (!gl) return ''
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) || '')
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return name
  } catch {
    return ''
  }
}

function tierFromGpu(gpu) {
  const g = gpu.toLowerCase()
  if (!g) return COARSE_POINTER ? 'Medium' : 'High'
  if (/swiftshader|llvmpipe|softpipe|software|basic render/.test(g)) return 'Low'
  if (COARSE_POINTER) {
    // Phones and tablets (the mobile cap still applies on top).
    if (/apple|adreno[^\d]*(7[3-9]\d|[89]\d\d)|immortalis|mali-g7[1-9]\d|xclipse 9/.test(g)) return 'High'
    if (/adreno[^\d]*(6[4-9]\d|7\d\d)|mali-g(7[6-9]|6[1-9]|71\d|61\d)|xclipse/.test(g)) return 'Medium'
    return 'Low' // older Adreno / Mali / PowerVR / unknown mobile parts
  }
  if (/rtx|rx ?[67]\d{3}|rx ?9\d{3}|apple m\d (pro|max|ultra)|arc a7/.test(g)) return 'Ultra'
  if (/gtx|radeon rx|rx ?[45]\d{2,3}|radeon pro|apple m\d|apple gpu|arc|quadro|nvidia/.test(g)) return 'High'
  if (/iris|uhd|radeon|vega|adreno|mali|apple/.test(g)) return 'Medium' // integrated graphics
  if (/intel.*hd graphics|hd graphics/.test(g)) return 'Low'
  return 'High'
}

// { tier, gpu, why }: the tier this device should start on before any frame has been timed.
export function detectTier() {
  const gpu = gpuName()
  let tier = tierFromGpu(gpu)
  const why = [`gpu "${gpu || 'hidden'}" -> ${tier}`]
  const mem = navigator.deviceMemory
  if (mem && mem <= 2) tier = lower(tier, 'Low')
  else if (mem && mem <= 4) tier = lower(tier, 'Medium')
  if (mem) why.push(`${mem} GB`)
  const cores = navigator.hardwareConcurrency
  if (cores && cores <= 2) tier = lower(tier, 'Low')
  else if (cores && cores <= 4) tier = lower(tier, 'Medium')
  if (cores) why.push(`${cores} cores`)
  return { tier, gpu, why: why.join(', ') }
}

const rungOf = (tier) => AUTO_GRAPHICS.ladder.findIndex((r) => r.tier === tier)

function loadSaved(gpu) {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null')
    if (s && s.gpu === gpu && Number.isInteger(s.rung) && AUTO_GRAPHICS.ladder[s.rung]) return s.rung
  } catch {
    // Storage blocked / bad JSON.
  }
  return -1
}

/**
 * The frame-rate governor. onChange(rung) is called with the ladder entry ({ tier, dpr? }) on every move.
 * @param {(rung: { tier: string, dpr?: number }, index: number) => void} onChange
 */
export function createGovernor(onChange) {
  const A = AUTO_GRAPHICS
  const detected = detectTier()
  const saved = loadSaved(detected.gpu)
  let rung = saved >= 0 ? saved : Math.max(0, rungOf(detected.tier))
  const kind = COARSE_POINTER ? 'touch' : 'desktop'
  let enabled = false
  let settle = A.settle
  let acc = 0
  let frames = 0
  let good = 0
  let clock = 0
  let lastFps = 0
  const blockedUntil = new Array(A.ladder.length).fill(0)
  const strikes = new Array(A.ladder.length).fill(0)

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ gpu: detected.gpu, rung }))
    } catch {
      // Storage blocked.
    }
  }

  function reset() {
    acc = 0
    frames = 0
    settle = A.settle
  }

  function move(to) {
    rung = to
    good = 0
    reset()
    save()
    onChange(A.ladder[rung], rung)
  }

  return {
    detected,
    remembered: saved >= 0,
    get rung() {
      return A.ladder[rung]
    },
    get index() {
      return rung
    },
    get fps() {
      return lastFps
    },
    get enabled() {
      return enabled
    },
    setEnabled(on) {
      enabled = on
      reset()
    },
    // A fresh start (phase change, resize): the next few frames are not representative.
    hold() {
      reset()
    },
    // Called every frame with the real (unscaled) frame time; active = a round is on screen.
    update(dt, active) {
      clock += dt
      if (!enabled || !active || document.hidden) {
        reset()
        return
      }
      if (settle > 0) {
        settle -= dt
        return
      }
      acc += dt
      frames++
      if (acc < A.window) return
      const fps = frames / acc
      lastFps = fps
      acc = 0
      frames = 0
      if (fps < A.down[kind]) {
        good = 0
        if (rung < A.ladder.length - 1) {
          // Leaving this rung for being too slow: don't come back to it for a while.
          strikes[rung]++
          blockedUntil[rung] = clock + A.cooldown * 2 ** (strikes[rung] - 1)
          move(rung + 1)
        }
      } else if (fps >= A.up[kind]) {
        good += A.window
        if (good >= A.upAfter && rung > 0 && clock >= blockedUntil[rung - 1]) move(rung - 1)
      } else good = 0
    },
  }
}
