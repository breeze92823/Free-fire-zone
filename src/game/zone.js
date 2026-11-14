// The safe zone: a circle that holds, then shrinks toward a new centre each
// phase (ZONE.phases on the match clock). Outside it characters lose health
// every second. Drawn as a tall translucent energy wall with scrolling
// scan lines, plus a glowing ring where it meets the ground.
import { AdditiveBlending, Color, CylinderGeometry, DoubleSide, Mesh, ShaderMaterial, Vector2 } from 'three'
import { WORLDS, ZONE } from '../config.js'

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

// Seeded random numbers: the server (backend zone.ts) plans the same circles from the round's
// zoneSeed with this exact generator and call order (angle, then distance, per phase).
export function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

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

  let rand = Math.random
  const focus = new Vector2()
  // The round's world plan (WORLDS[id].zone: start, phases, damage) and its land radius.
  let plan = ZONE
  let landR = WORLDS.coral.radius
  function planNext(i) {
    const p = plan.phases[i]
    const slack = Math.max(0, z.radius - p.radius)
    // Head for the map's district (jittered), never leaving the last circle: same as zone.ts.
    const a = rand() * Math.PI * 2
    const j = Math.sqrt(rand()) * p.radius * 0.45
    const tx = focus.x + Math.cos(a) * j - z.center.x
    const tz = focus.y + Math.sin(a) * j - z.center.y
    const len0 = Math.hypot(tx, tz)
    const d = Math.min(len0, slack * 0.85)
    z.next.set(z.center.x + (len0 > 0 ? (tx / len0) * d : 0), z.center.y + (len0 > 0 ? (tz / len0) * d : 0))
    // Keep the zone over land.
    const maxC = Math.max(0, landR - p.radius * 0.6) // server: the same WORLDS radius
    if (z.next.length() > maxC) z.next.setLength(maxC)
    z.nextR = p.radius
  }

  return {
    state: z,
    // seed: the round's zoneSeed from the server, so every client agrees on the circles;
    // at: the voted map's focus [x, z] (MAPS[i].focus = the server's MAPS[i].focus);
    // world: the map's world id (WORLDS), whose zone plan and land radius are used.
    reset(seed, at = [0, 0], world = 'coral') {
      const w = WORLDS[world] ?? WORLDS.coral
      plan = w.zone
      landR = w.radius
      rand = seed === undefined ? Math.random : mulberry32(seed)
      focus.set(at[0], at[1])
      z.center.set(0, 0)
      z.radius = plan.start
      z.phase = -1
      z.shrinking = false
      z.damage = plan.damage[0]
      planNext(0)
    },
    // Seconds until the next shrink starts (or ends while shrinking), and a label.
    info(t) {
      const nextI = z.phase + 1
      if (z.shrinking) {
        const p = plan.phases[z.phase]
        return { label: 'Zone shrinking', time: Math.max(0, p.at + p.shrink - t), shrinking: true }
      }
      if (nextI < plan.phases.length) return { label: 'Zone shrinks in', time: Math.max(0, plan.phases[nextI].at - t), shrinking: false }
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
      if (!z.shrinking && nextI < plan.phases.length && t >= plan.phases[nextI].at) {
        z.phase = nextI
        z.shrinking = true
        z.from.copy(z.center)
        z.fromR = z.radius
        z.damage = plan.damage[Math.min(nextI, plan.damage.length - 1)]
      }
      if (z.shrinking) {
        const p = plan.phases[z.phase]
        const k = Math.min(1, (t - p.at) / p.shrink)
        z.center.lerpVectors(z.from, z.next, k)
        z.radius = z.fromR + (z.nextR - z.fromR) * k
        if (k >= 1) {
          z.shrinking = false
          if (z.phase + 1 < plan.phases.length) planNext(z.phase + 1)
        }
      }
      wall.position.set(z.center.x, -2, z.center.y)
      wall.scale.set(z.radius, ZONE.wallHeight, z.radius)
      mat.uniforms.circ.value = (z.radius * Math.PI * 2) / 4
      wall.visible = z.radius < plan.start - 2
    },
    setVisible(on) {
      wall.visible = on
    },
  }
}
