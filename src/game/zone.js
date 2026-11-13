// The safe zone: a circle that holds, then shrinks toward a new centre each
// phase (ZONE.phases on the match clock). Outside it characters lose health
// every second. Drawn as a tall translucent energy wall with scrolling
// scan lines, plus a glowing ring where it meets the ground.
import { AdditiveBlending, Color, CylinderGeometry, DoubleSide, Mesh, ShaderMaterial, Vector2 } from 'three'
import { ZONE } from '../config.js'
import { G } from './state.js'

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`
const FRAG = /* glsl */ `
  uniform float time;
  uniform float circ;
  uniform vec3 color;
  varying vec2 vUv;
  void main() {
    float h = vUv.y;
    // Strong at the ground, gone by a third of the way up, so from inside it never streaks the sky.
    float fade = (1.0 - smoothstep(0.0, 0.32, h)) * (0.4 + 0.6 * smoothstep(0.0, 0.01, h));
    float stripes = 0.5 + 0.5 * sin(vUv.x * circ * 1.2 + time * 1.5);
    float scan = smoothstep(0.9, 1.0, fract(h * 26.0 - time * 0.6)) * (1.0 - smoothstep(0.02, 0.12, h));
    float base = smoothstep(0.02, 0.0, h);
    float hexes = step(0.92, fract(vUv.x * circ * 0.25)) * 0.6;
    float a = fade * (0.12 + 0.08 * stripes + hexes * 0.08) + scan * 0.3 + base * 0.55;
    gl_FragColor = vec4(color * (1.1 + scan * 1.8 + base * 2.2), a);
  }`

export function createZone(scene) {
  const mat = new ShaderMaterial({
    uniforms: { time: { value: 0 }, circ: { value: 900 }, color: { value: new Color(ZONE.color) } },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    fog: false,
  })
  const geo = new CylinderGeometry(1, 1, 1, 160, 1, true)
  geo.translate(0, 0.5, 0)
  const wall = new Mesh(geo, mat)
  wall.renderOrder = 3
  wall.frustumCulled = false
  scene.add(wall)

  const z = {
    center: new Vector2(0, 0),
    radius: ZONE.start,
    from: new Vector2(),
    fromR: ZONE.start,
    next: new Vector2(),
    nextR: ZONE.start,
    phase: -1, // index of the last phase that started shrinking
    shrinking: false,
    damage: ZONE.damage[0],
  }

  function planNext(i) {
    const p = ZONE.phases[i]
    const slack = Math.max(0, z.radius - p.radius)
    const a = Math.random() * Math.PI * 2
    const d = Math.sqrt(Math.random()) * slack * 0.85
    z.next.set(z.center.x + Math.cos(a) * d, z.center.y + Math.sin(a) * d)
    // Keep the zone over land.
    const maxC = Math.max(0, (G.island?.radius ?? 120) - p.radius * 0.6)
    if (z.next.length() > maxC) z.next.setLength(maxC)
    z.nextR = p.radius
  }

  return {
    state: z,
    reset() {
      z.center.set(0, 0)
      z.radius = ZONE.start
      z.phase = -1
      z.shrinking = false
      z.damage = ZONE.damage[0]
      planNext(0)
    },
    // Seconds until the next shrink starts (or ends while shrinking), and a label.
    info(t) {
      const nextI = z.phase + 1
      if (z.shrinking) {
        const p = ZONE.phases[z.phase]
        return { label: 'Zone shrinking', time: Math.max(0, p.at + p.shrink - t), shrinking: true }
      }
      if (nextI < ZONE.phases.length) return { label: 'Zone shrinks in', time: Math.max(0, ZONE.phases[nextI].at - t), shrinking: false }
      return { label: 'Final zone', time: 0, shrinking: false }
    },
    outside(x, zPos, margin = 0) {
      return Math.hypot(x - z.center.x, zPos - z.center.y) > z.radius - margin
    },
    distanceInside(x, zPos) {
      return z.radius - Math.hypot(x - z.center.x, zPos - z.center.y)
    },
    update(t, dt) {
      mat.uniforms.time.value += dt
      const nextI = z.phase + 1
      if (!z.shrinking && nextI < ZONE.phases.length && t >= ZONE.phases[nextI].at) {
        z.phase = nextI
        z.shrinking = true
        z.from.copy(z.center)
        z.fromR = z.radius
        z.damage = ZONE.damage[Math.min(nextI, ZONE.damage.length - 1)]
      }
      if (z.shrinking) {
        const p = ZONE.phases[z.phase]
        const k = Math.min(1, (t - p.at) / p.shrink)
        z.center.lerpVectors(z.from, z.next, k)
        z.radius = z.fromR + (z.nextR - z.fromR) * k
        if (k >= 1) {
          z.shrinking = false
          if (z.phase + 1 < ZONE.phases.length) planNext(z.phase + 1)
        }
      }
      wall.position.set(z.center.x, -2, z.center.y)
      wall.scale.set(z.radius, ZONE.wallHeight, z.radius)
      mat.uniforms.circ.value = (z.radius * Math.PI * 2) / 4
      wall.visible = z.radius < 148
    },
    setVisible(on) {
      wall.visible = on
    },
  }
}
