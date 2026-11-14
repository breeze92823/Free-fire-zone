// Hitch profiler (dev server, or any build opened with ?debug): parts of the frame time themselves with
// span()/spanEnd(); when a whole frame takes longer than HITCH ms, its slowest parts are logged and kept
// in `hitches` (window.__game.hitches), with whether the JS heap shrank during it (a garbage collection).
// Costs one boolean check per span when off. Section names are fixed strings: nothing is allocated per
// frame unless a hitch is recorded.
const ON = import.meta.env.DEV || (typeof location !== 'undefined' && location.search.includes('debug'))
const HITCH = 50 // ms
const KEEP = 60 // hitches kept

const totals = new Map() // section -> ms this frame
let frameT0 = 0
let label = ''
let heapAt = 0
export const hitches = []
// Allocation estimate: the heap growth per frame between collections (Chrome's performance.memory only).
export const heap = { perFrame: 0, gcs: 0, frames: 0 }

const mem = () => (typeof performance !== 'undefined' && performance.memory ? performance.memory.usedJSHeapSize : 0)

export const profOn = () => ON

export function frameStart(name) {
  if (!ON) return
  frameT0 = performance.now()
  label = name
  totals.clear()
  heapAt = mem()
}

export function span() {
  return ON ? performance.now() : 0
}

export function spanEnd(name, t0) {
  if (!ON) return
  totals.set(name, (totals.get(name) || 0) + performance.now() - t0)
}

export function frameEnd() {
  if (!ON) return
  const ms = performance.now() - frameT0
  const h = mem()
  const grew = h - heapAt
  heap.frames++
  if (grew < 0) heap.gcs++
  else if (heapAt) heap.perFrame += (grew - heap.perFrame) * 0.02 // smoothed bytes per frame
  if (ms < HITCH) return
  const parts = [...totals].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `${k} ${v.toFixed(0)}`)
  const rec = { at: Math.round(frameT0), phase: label, ms: Math.round(ms), parts, gc: grew < -1e6 ? Math.round(-grew / 1e6) + ' MB freed' : '' }
  hitches.push(rec)
  if (hitches.length > KEEP) hitches.shift()
  console.warn(`[hitch] ${rec.ms} ms (${label}): ${parts.join(', ')}${rec.gc ? ` · GC ${rec.gc}` : ''}`)
}
