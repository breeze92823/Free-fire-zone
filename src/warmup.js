// Shader and texture warm-up. three.js compiles a material's shader the first time something using it
// is drawn, and uploads a texture the first time it is sampled. On some GPUs (Intel / ANGLE on Windows
// measured 250+ ms per shader) that turns "a new thing came into view" into a visible freeze. Here
// everything is compiled and uploaded ahead of time, while a loading screen or the lobby is up:
//  - warmScene(): every material in a scene, for the exact render path the game uses (straight to the
//    screen, or into the bloom composer's HDR target: they are different shader variants), compiled in
//    parallel (KHR_parallel_shader_compile via compileAsync), every texture uploaded on a time budget,
//    then (optionally) one forced draw of the whole scene with culling off and hidden objects shown, so
//    the shadow-depth shaders, vertex buffers and the driver's own first-draw work are done too.
//  - warmObject(): the same compile + upload for a model built later (a streamed avatar look), for every
//    scene it can appear in, before it is put on screen.
//  - keepAlive(): three.js frees a shader when the last material using it is disposed (a round's
//    actors are freed when it ends), so a few sample objects are kept here to hold the common shaders.
// Every program three.js builds is cached by its feature set, so warming a variant once covers every
// later material with the same features.
import { Vector4 } from 'three'

let R = null
const targets = [] // { scene, camera, fx }: the scenes models can appear in
const kept = []
const TIMEOUT = 8000 // ms: never wait longer than this for the driver to report programs ready
const BUDGET = 6 // ms of texture uploads before yielding

export function initWarmup(renderer) {
  R = renderer
}

// fx: the postfx object that draws this scene (its sceneTarget() says where the scene is rendered).
export function addWarmTarget(scene, camera, fx) {
  targets.push({ scene, camera, fx })
}

export function keepAlive(object) {
  kept.push(object)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const withTimeout = (p) => Promise.race([p, sleep(TIMEOUT)])

function materialsOf(root, out = new Set()) {
  root.traverse((o) => {
    const m = o.material
    if (!m) return
    if (Array.isArray(m)) for (const x of m) out.add(x)
    else out.add(m)
  })
  return out
}

function texturesOf(materials) {
  const out = new Set()
  const add = (v) => {
    if (v?.isTexture && !v.isRenderTargetTexture && !v.isVideoTexture && v.version > 0) out.add(v)
  }
  for (const m of materials) {
    for (const k in m) add(m[k])
    if (m.uniforms) {
      for (const k in m.uniforms) {
        const v = m.uniforms[k]?.value
        if (Array.isArray(v)) v.forEach(add)
        else add(v)
      }
    }
  }
  return out
}

// Compiles `object`'s materials as they will be drawn in `scene` (its lights, fog, environment, and the
// render target the scene is drawn into). Returns the promise of every program being ready.
function compileFor({ scene, camera, fx }, object = scene) {
  const prev = R.getRenderTarget()
  R.setRenderTarget(fx?.sceneTarget?.() ?? null)
  try {
    return object === scene ? R.compileAsync(scene, camera) : R.compileAsync(object, camera, scene)
  } catch (err) {
    console.warn('[warmup] compile failed', err)
    return Promise.resolve()
  } finally {
    R.setRenderTarget(prev)
  }
}

async function uploadTextures(root) {
  let t0 = performance.now()
  for (const t of texturesOf(materialsOf(root))) {
    R.initTexture(t) // a no-op for a texture that is already on the GPU
    if (performance.now() - t0 > BUDGET) {
      await sleep(0)
      t0 = performance.now()
    }
  }
}

const scissor = new Vector4()
// One draw of everything in the scene, hidden or not, in view or not, into a 1x1 pixel of the target the
// game draws it into (so nothing shows and the fill cost is nil). Lights keep their real visibility: the
// light count is part of every shader, and a light that is off must stay off.
function drawAll({ scene, camera, fx }) {
  const lit = new Set()
  scene.traverseVisible((o) => {
    if (o.isLight) lit.add(o)
  })
  const touched = []
  scene.traverse((o) => {
    if (o.isLight) {
      if (!lit.has(o) && o.visible) {
        touched.push(o, o.visible, o.frustumCulled)
        o.visible = false
      }
      return
    }
    if (!o.visible || o.frustumCulled) {
      touched.push(o, o.visible, o.frustumCulled)
      o.visible = true
      o.frustumCulled = false
    }
  })
  const rt = fx?.sceneTarget?.() ?? null
  const prev = R.getRenderTarget()
  const sm = R.shadowMap
  const smUpdate = sm.needsUpdate
  let saved
  if (rt) {
    saved = [rt.scissor.clone(), rt.scissorTest]
    rt.scissor.set(0, 0, 1, 1)
    rt.scissorTest = true
  } else {
    saved = [R.getScissor(scissor).clone(), R.getScissorTest()]
    R.setScissor(0, 0, 1, 1)
    R.setScissorTest(true)
  }
  try {
    sm.needsUpdate = true // also when the shadow pass is paused (shadows faded out mid-round)
    R.setRenderTarget(rt)
    R.render(scene, camera)
  } catch (err) {
    console.warn('[warmup] draw failed', err)
  } finally {
    sm.needsUpdate = smUpdate
    if (rt) {
      rt.scissor.copy(saved[0])
      rt.scissorTest = saved[1]
    } else {
      R.setScissor(saved[0])
      R.setScissorTest(saved[1])
    }
    R.setRenderTarget(prev)
    for (let i = 0; i < touched.length; i += 3) {
      touched[i].visible = touched[i + 1]
      touched[i].frustumCulled = touched[i + 2]
    }
  }
}

// Compiles and uploads everything in a registered scene (or the given one); draw = also the forced draw.
// extra: objects that are not in the scene yet but will be (added only for the draw).
export async function warmScene(target, { draw = true, extra = [] } = {}) {
  if (!R) return
  const t0 = performance.now()
  const n0 = R.info.programs?.length ?? 0
  // extra objects are in the scene only during the synchronous steps: a round may start while this
  // waits, and they must never be drawn in it.
  const ready = withExtra(target, extra, () => compileFor(target))
  await uploadTextures(target.scene)
  for (const o of extra) await uploadTextures(o)
  await withTimeout(ready)
  if (draw) withExtra(target, extra, () => drawAll(target))
  return { ms: Math.round(performance.now() - t0), programs: (R.info.programs?.length ?? 0) - n0 }
}

function withExtra(target, extra, fn) {
  for (const o of extra) target.scene.add(o)
  try {
    return fn()
  } finally {
    for (const o of extra) target.scene.remove(o)
  }
}

// The forced draw on its own (call it inside the frame loop, right before the frame's real render, so
// nothing can reach the screen). extra: as for warmScene.
export function drawWarm(target, extra = []) {
  if (!R || !target) return
  withExtra(target, extra, () => drawAll(target))
}

// Compiles whatever in a scene is not compiled yet, right now (blocking), for the right render target.
// A safety net for a round that starts before the background warm-up finished.
export function compileNow(target) {
  if (!R || !target) return
  compileFor(target).catch?.(() => {})
}

// A model built after boot (a streamed avatar look): compiled for every scene it may appear in and its
// textures uploaded, before it is shown. Resolves even if the driver never reports the programs ready.
export async function warmObject(root) {
  if (!R || !root) return
  const ready = targets.map((t) => compileFor(t, root))
  await uploadTextures(root)
  await withTimeout(Promise.all(ready))
}

export const warmTargets = () => targets
