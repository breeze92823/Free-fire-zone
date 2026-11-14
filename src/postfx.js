import { HalfFloatType, Vector2, WebGLRenderTarget } from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { BLOOM } from './config.js'

// Optional bloom, so neon signs, mast lights, muzzle flashes and the
// particles glow. The scene renders into a half-float
// target (HDR, before tone mapping); the bloom pass only picks up what is
// brighter than BLOOM.threshold, which ordinary sunlit surfaces stay under,
// so materials opt in by going HDR (emissive or a colour scaled above 1).
// OutputPass then applies the renderer's tone mapping + sRGB. Off on the
// lighter graphics presets: there the plain renderer.render path is used.
export function createPostFx(renderer, scene, camera) {
  let composer = null
  let bloom = null
  let enabled = false
  const size = new Vector2()

  function build(samples) {
    composer?.dispose()
    renderer.getSize(size)
    const target = new WebGLRenderTarget(size.x, size.y, { type: HalfFloatType, samples })
    composer = new EffectComposer(renderer, target)
    composer.addPass(new RenderPass(scene, camera))
    bloom = new UnrealBloomPass(new Vector2(size.x, size.y), BLOOM.strength, BLOOM.radius, BLOOM.threshold)
    composer.addPass(bloom)
    composer.addPass(new OutputPass())
    composer.setPixelRatio(renderer.getPixelRatio())
    composer.setSize(size.x, size.y)
  }

  return {
    get bloom() {
      return bloom // for tuning from the dev console
    },
    // preset: a graphicsPreset() result (bloom + antialias decide the setup).
    // Switching the composer on or off changes where the scene is drawn (an HDR target vs the screen),
    // and that is a different shader for every material: main.js only does it between rounds.
    configure(preset) {
      enabled = !!preset.bloom
      if (!enabled) {
        composer?.dispose()
        composer = null
        bloom = null
        return
      }
      build(preset.antialias ? 4 : 0)
    },
    // Bloom on/off without touching the setup (no shader changes): the scene still goes through the
    // HDR target, only the bloom pass is skipped. For lowering the graphics mid-round.
    setBloomActive(on) {
      if (bloom) bloom.enabled = on
    },
    // The render target the scene itself is drawn into (null = the screen): what warmup.js compiles for.
    sceneTarget() {
      return enabled && composer ? composer.readBuffer : null
    },
    setSize(w, h) {
      if (!composer) return
      composer.setPixelRatio(renderer.getPixelRatio())
      composer.setSize(w, h)
    },
    render() {
      if (enabled && composer) composer.render()
      else renderer.render(scene, camera)
    },
  }
}
