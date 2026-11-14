// Combat effects: bullet tracers, muzzle flashes (with a small pool of real
// point lights), two GPU point-particle systems (additive sparks/fire/glow and
// alpha-blended smoke/dust), physical shell casings, bullet-hole decals,
// explosions (fireball, shock ring, smoke column, debris, light flash), spawn
// beams and heal/ability rings. Everything is pooled: nothing is allocated
// per shot, and the number of lights never changes (no shader recompiles).
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NormalBlending,
  PlaneGeometry,
  PointLight,
  Points,
  Quaternion,
  RingGeometry,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
} from 'three'
import { BULLET } from '../config.js'

const rnd = (a, b) => a + Math.random() * (b - a)
const v1 = new Vector3()
const v2 = new Vector3()
const q1 = new Quaternion()
const q2 = new Quaternion()
const m1 = new Matrix4()
const Z = new Vector3(0, 0, 1)

function canvasTex(size, draw) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  draw(c.getContext('2d'), size)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  return t
}

const softDot = () =>
  canvasTex(64, (g, s) => {
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
    grad.addColorStop(0, 'rgba(255,255,255,1)')
    grad.addColorStop(0.35, 'rgba(255,255,255,0.7)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, s, s)
  })
const smokeTex = () =>
  canvasTex(128, (g, s) => {
    for (let i = 0; i < 14; i++) {
      const x = s / 2 + rnd(-22, 22)
      const y = s / 2 + rnd(-22, 22)
      const r = rnd(22, 44)
      const grad = g.createRadialGradient(x, y, 0, x, y, r)
      grad.addColorStop(0, 'rgba(255,255,255,0.35)')
      grad.addColorStop(1, 'rgba(255,255,255,0)')
      g.fillStyle = grad
      g.fillRect(0, 0, s, s)
    }
  })
const flashTex = () =>
  canvasTex(128, (g, s) => {
    g.translate(s / 2, s / 2)
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, s / 2)
    grad.addColorStop(0, 'rgba(255,255,240,1)')
    grad.addColorStop(0.25, 'rgba(255,220,120,0.95)')
    grad.addColorStop(0.6, 'rgba(255,140,40,0.35)')
    grad.addColorStop(1, 'rgba(255,100,20,0)')
    g.fillStyle = grad
    for (let i = 0; i < 7; i++) {
      g.rotate((Math.PI * 2) / 7)
      g.beginPath()
      g.moveTo(-6, 0)
      g.lineTo(0, -s / 2 + rnd(0, 14))
      g.lineTo(6, 0)
      g.fill()
    }
    g.beginPath()
    g.arc(0, 0, s * 0.2, 0, Math.PI * 2)
    g.fill()
  })
const holeTex = () =>
  canvasTex(64, (g, s) => {
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
    grad.addColorStop(0, 'rgba(10,10,10,0.95)')
    grad.addColorStop(0.3, 'rgba(25,22,20,0.8)')
    grad.addColorStop(0.6, 'rgba(40,35,30,0.25)')
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, s, s)
    g.strokeStyle = 'rgba(0,0,0,0.5)'
    g.lineWidth = 1.5
    for (let i = 0; i < 6; i++) {
      const a = rnd(0, Math.PI * 2)
      g.beginPath()
      g.moveTo(s / 2 + Math.cos(a) * 6, s / 2 + Math.sin(a) * 6)
      g.lineTo(s / 2 + Math.cos(a) * rnd(14, 26), s / 2 + Math.sin(a) * rnd(14, 26))
      g.stroke()
    }
  })
const beamTex = () =>
  canvasTex(64, (g, s) => {
    const grad = g.createLinearGradient(0, 0, 0, s)
    grad.addColorStop(0, 'rgba(255,255,255,0)')
    grad.addColorStop(0.7, 'rgba(255,255,255,0.55)')
    grad.addColorStop(1, 'rgba(255,255,255,1)')
    g.fillStyle = grad
    g.fillRect(0, 0, s, s)
  })

// --- Particle system (one draw call each) ---------------------------------------------------
const PVERT = /* glsl */ `
  attribute float size;
  attribute vec4 color;
  varying vec4 vColor;
  uniform float scale;
  void main() {
    vColor = color;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * scale / max(0.1, -mv.z);
    gl_Position = projectionMatrix * mv;
  }`
const PFRAG = /* glsl */ `
  uniform sampler2D map;
  varying vec4 vColor;
  void main() {
    vec4 t = texture2D(map, gl_PointCoord);
    gl_FragColor = vec4(vColor.rgb * t.rgb, vColor.a * t.a);
    if (gl_FragColor.a < 0.01) discard;
  }`

class Particles {
  constructor(count, map, additive) {
    this.n = count
    this.pos = new Float32Array(count * 3)
    this.col = new Float32Array(count * 4)
    this.size = new Float32Array(count)
    this.vel = new Float32Array(count * 3)
    this.life = new Float32Array(count) // remaining
    this.max = new Float32Array(count)
    this.grow = new Float32Array(count)
    this.base = new Float32Array(count * 4) // rgb + start alpha
    this.grav = new Float32Array(count)
    this.drag = new Float32Array(count)
    this.size0 = new Float32Array(count)
    this.cursor = 0
    const geo = new BufferGeometry()
    this.aPos = new BufferAttribute(this.pos, 3).setUsage(DynamicDrawUsage)
    this.aCol = new BufferAttribute(this.col, 4).setUsage(DynamicDrawUsage)
    this.aSize = new BufferAttribute(this.size, 1).setUsage(DynamicDrawUsage)
    geo.setAttribute('position', this.aPos)
    geo.setAttribute('color', this.aCol)
    geo.setAttribute('size', this.aSize)
    this.mat = new ShaderMaterial({
      uniforms: { map: { value: map }, scale: { value: 600 } },
      vertexShader: PVERT,
      fragmentShader: PFRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? AdditiveBlending : NormalBlending,
    })
    this.points = new Points(geo, this.mat)
    this.points.frustumCulled = false
    this.points.renderOrder = additive ? 6 : 5
    this.active = 0
  }

  // o: { x,y,z, vx,vy,vz, life, size, grow (size/s), color: Color, alpha, gravity, drag }
  emit(x, y, z, vx, vy, vz, life, size, color, alpha = 1, gravity = 0, drag = 0, grow = 0) {
    const i = this.cursor
    this.cursor = (this.cursor + 1) % this.n
    this.pos[i * 3] = x
    this.pos[i * 3 + 1] = y
    this.pos[i * 3 + 2] = z
    this.vel[i * 3] = vx
    this.vel[i * 3 + 1] = vy
    this.vel[i * 3 + 2] = vz
    this.life[i] = life
    this.max[i] = life
    this.size0[i] = size
    this.size[i] = size
    this.grow[i] = grow
    this.base[i * 4] = color.r
    this.base[i * 4 + 1] = color.g
    this.base[i * 4 + 2] = color.b
    this.base[i * 4 + 3] = alpha
    this.grav[i] = gravity
    this.drag[i] = drag
  }

  update(dt) {
    const { pos, vel, life, max, col, base, size, size0, grow, grav, drag } = this
    for (let i = 0; i < this.n; i++) {
      if (life[i] <= 0) {
        if (col[i * 4 + 3] !== 0) col[i * 4 + 3] = 0
        continue
      }
      life[i] -= dt
      const k = Math.max(0, life[i] / max[i])
      const dk = Math.max(0, 1 - drag[i] * dt)
      vel[i * 3] *= dk
      vel[i * 3 + 1] = vel[i * 3 + 1] * dk + grav[i] * dt
      vel[i * 3 + 2] *= dk
      pos[i * 3] += vel[i * 3] * dt
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt
      size[i] = size0[i] + grow[i] * (max[i] - life[i])
      col[i * 4] = base[i * 4]
      col[i * 4 + 1] = base[i * 4 + 1]
      col[i * 4 + 2] = base[i * 4 + 2]
      // Fade in fast, out smoothly.
      const fadeIn = Math.min(1, (max[i] - life[i]) / 0.04)
      col[i * 4 + 3] = base[i * 4 + 3] * k * fadeIn
    }
    this.aPos.needsUpdate = true
    this.aCol.needsUpdate = true
    this.aSize.needsUpdate = true
  }
}

// --- The effects singleton ---------------------------------------------------------------------
const C = {
  spark: new Color(4, 2.6, 1.1),
  ember: new Color(3.2, 1.2, 0.3),
  fire: new Color(2.6, 0.85, 0.18),
  dust: new Color('#b9a68a'),
  sand: new Color('#f3e7cc'), // wheel dust (vehicles.js): pale, to show against sand and dirt
  dirt: new Color('#7a6248'),
  smoke: new Color('#8a8a8a'),
  darkSmoke: new Color('#3d3b39'),
  ice: new Color(1.4, 2.6, 3.4),
  heal: new Color(0.6, 3, 1.2),
  white: new Color(2.5, 2.5, 2.5),
  red: new Color(3, 0.5, 0.4),
  gold: new Color(3, 2.2, 0.6),
  faint: new Color(0.9, 0.9, 0.85),
}
// Casing colours (instance colours of the one casing mesh) and sizes.
const CASING = {
  brass: { color: new Color('#d9a640'), scale: [1, 1, 1] },
  big: { color: new Color('#d4a23a'), scale: [1.9, 1.35, 1.35] },
  shell: { color: new Color('#b3262a'), scale: [1.7, 1.9, 1.9] },
}
export const FX_COLORS = C

let add = null // additive particles
let blend = null // smoke/dust particles
const tracers = []
const flashes = []
const lights = []
let casings = null
const casingState = []
let holes = null
const holeState = []
const fireballs = []
const rings = []
const beams = []
let quality = 1

export function initFx(scene, preset) {
  quality = preset?.particles ?? 1
  const dot = softDot()
  add = new Particles(Math.round(1600 * Math.max(0.5, quality)), dot, true)
  blend = new Particles(Math.round(900 * Math.max(0.5, quality)), smokeTex(), false)
  scene.add(add.points, blend.points)

  // Tracers: a thin glowing box, stretched along the shot.
  const tgeo = new CylinderGeometry(0.018, 0.018, 1, 5, 1, true)
  tgeo.rotateX(Math.PI / 2)
  tgeo.translate(0, 0, -0.5)
  for (let i = 0; i < 48; i++) {
    const m = new Mesh(tgeo, new MeshBasicMaterial({ color: new Color(5, 3.6, 1.6), transparent: true, opacity: 0.9, blending: AdditiveBlending, depthWrite: false }))
    m.visible = false
    m.frustumCulled = false
    scene.add(m)
    tracers.push({ mesh: m, from: new Vector3(), to: new Vector3(), dir: new Vector3(), dist: 0, travelled: 0, active: false })
  }

  // Muzzle flashes
  const ftex = flashTex()
  for (let i = 0; i < 16; i++) {
    const s = new Sprite(new SpriteMaterial({ map: ftex, color: new Color(3, 2.4, 1.6), transparent: true, blending: AdditiveBlending, depthWrite: false, fog: false }))
    s.visible = false
    scene.add(s)
    flashes.push({ sprite: s, t: 0 })
  }
  // A fixed pool of point lights (never added/removed: no shader recompiles).
  for (let i = 0; i < 3; i++) {
    const l = new PointLight('#ffb35a', 0, 9, 2)
    scene.add(l)
    lights.push({ light: l, t: 0, dur: 0.06, peak: 0 })
  }

  // Shell casings: instanced brass.
  const cgeo = new CylinderGeometry(0.012, 0.012, 0.045, 6)
  cgeo.rotateZ(Math.PI / 2)
  casings = new InstancedMesh(cgeo, new MeshStandardMaterial({ color: '#ffffff', metalness: 0.9, roughness: 0.3 }), 80)
  casings.instanceMatrix.setUsage(DynamicDrawUsage)
  casings.frustumCulled = false
  for (let i = 0; i < 80; i++) {
    casingState.push({ p: new Vector3(), v: new Vector3(), r: new Vector3(), w: new Vector3(), life: 0, floor: 0, s: new Vector3(1, 1, 1) })
    casings.setMatrixAt(i, m1.makeScale(0, 0, 0))
    casings.setColorAt(i, CASING.brass.color)
  }
  scene.add(casings)

  // Bullet holes
  holes = new InstancedMesh(new PlaneGeometry(0.16, 0.16), new MeshBasicMaterial({ map: holeTex(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }), 90)
  holes.instanceMatrix.setUsage(DynamicDrawUsage)
  holes.frustumCulled = false
  holes.renderOrder = 2
  for (let i = 0; i < 90; i++) {
    holeState.push({ life: 0, m: new Matrix4() })
    holes.setMatrixAt(i, m1.makeScale(0, 0, 0))
  }
  scene.add(holes)

  // Fireballs + shock rings + beams pools
  const fgeo = new SphereGeometry(1, 16, 12)
  for (let i = 0; i < 4; i++) {
    const m = new Mesh(fgeo, new MeshBasicMaterial({ color: new Color(4, 1.8, 0.5), transparent: true, blending: AdditiveBlending, depthWrite: false }))
    m.visible = false
    scene.add(m)
    fireballs.push({ mesh: m, t: 0, dur: 0.5, r: 3 })
  }
  const rgeo = new RingGeometry(0.85, 1, 48)
  rgeo.rotateX(-Math.PI / 2)
  for (let i = 0; i < 8; i++) {
    const m = new Mesh(rgeo, new MeshBasicMaterial({ color: '#ffffff', transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }))
    m.visible = false
    scene.add(m)
    rings.push({ mesh: m, t: 0, dur: 0.5, r0: 0.5, r1: 6, follow: null, rise: 0 })
  }
  const bgeo = new CylinderGeometry(1, 1, 1, 24, 1, true)
  bgeo.translate(0, 0.5, 0)
  const btex = beamTex()
  for (let i = 0; i < 6; i++) {
    const m = new Mesh(bgeo, new MeshBasicMaterial({ map: btex, color: '#ffffff', transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, fog: false }))
    m.visible = false
    scene.add(m)
    beams.push({ mesh: m, t: 0, dur: 1, follow: null })
  }
}

export function setFxScale(px) {
  // Point sizes are in pixels at 1 m: scale with the viewport height.
  if (add) add.mat.uniforms.scale.value = px
  if (blend) blend.mat.uniforms.scale.value = px
}

// --- Emitters --------------------------------------------------------------------------------
export function tracer(from, to, color = null) {
  const t = tracers.find((x) => !x.active) || tracers[0]
  t.active = true
  t.from.copy(from)
  t.to.copy(to)
  t.dir.subVectors(to, from)
  t.dist = t.dir.length()
  t.dir.divideScalar(t.dist || 1)
  t.travelled = 0
  t.mesh.material.color.copy(color || C.spark).multiplyScalar(color ? 1 : 1.2)
  t.mesh.visible = true
  q1.setFromUnitVectors(Z, t.dir)
  t.mesh.quaternion.copy(q1)
}

// style: 'small' (pistols, SMGs, rifles), 'big' (shotguns, snipers, revolvers, LMGs), 'suppressed'
// (no flash: a wisp of gas), 'none', 'puff' (a launcher's thump of smoke), 'rocket' (flash +
// a big back-blast of smoke behind the tube). `true` / `false` mean 'big' / 'small'.
export function muzzleFlash(pos, dir, style = 'small', withLight = true) {
  if (style === true) style = 'big'
  else if (style === false) style = 'small'
  if (style === 'none') return
  if (style === 'suppressed') {
    blend.emit(pos.x + dir.x * 0.1, pos.y + dir.y * 0.1, pos.z + dir.z * 0.1, dir.x * 0.8, 0.25, dir.z * 0.8, rnd(0.4, 0.7), 0.12, C.smoke, 0.25, 0.2, 2, 0.6)
    return
  }
  const big = style === 'big' || style === 'rocket'
  if (style !== 'puff') {
    const f = flashes.find((x) => x.t <= 0) || flashes[0]
    f.t = style === 'rocket' ? 0.09 : 0.05
    f.sprite.visible = true
    f.sprite.position.copy(pos).addScaledVector(dir, 0.08)
    const s = (style === 'rocket' ? 1.4 : big ? 0.85 : 0.55) * rnd(0.8, 1.2)
    f.sprite.scale.set(s, s, 1)
    f.sprite.material.rotation = rnd(0, Math.PI * 2)
  }
  if (withLight) {
    const l = lights.reduce((a, b) => (a.t < b.t ? a : b))
    l.t = l.dur
    l.peak = style === 'rocket' ? 30 : big ? 14 : style === 'puff' ? 4 : 8
    l.light.position.copy(pos).addScaledVector(dir, 0.08)
  }
  // A puff of smoke and a few sparks.
  const n = Math.round((big ? 5 : 3) * quality)
  if (style !== 'puff') for (let i = 0; i < n; i++) add.emit(pos.x, pos.y, pos.z, dir.x * rnd(4, 9) + rnd(-1, 1), dir.y * rnd(4, 9) + rnd(-1, 1), dir.z * rnd(4, 9) + rnd(-1, 1), rnd(0.05, 0.12), rnd(0.03, 0.06), C.spark, 1, 0, 6)
  const puffs = style === 'puff' ? 5 : big ? 2 : 1
  for (let i = 0; i < puffs; i++) blend.emit(pos.x + dir.x * 0.2, pos.y + dir.y * 0.2, pos.z + dir.z * 0.2, dir.x * rnd(0.8, 2) + rnd(-0.3, 0.3), 0.4 + rnd(0, 0.3), dir.z * rnd(0.8, 2) + rnd(-0.3, 0.3), rnd(0.35, 0.8), style === 'puff' ? 0.3 : 0.18, C.smoke, 0.4, 0.3, 2, 0.9)
  if (style === 'rocket') {
    // Back-blast: a cone of fire and a wall of smoke out of the back of the tube (1.6 m behind).
    const bx = pos.x - dir.x * 1.6
    const by = pos.y - dir.y * 1.6
    const bz = pos.z - dir.z * 1.6
    // (Pushed out fast and thin, so the shooter's own camera behind the tube is not buried in it.)
    for (let i = 0; i < Math.round(12 * quality) + 4; i++) add.emit(bx, by, bz, -dir.x * rnd(6, 12) + rnd(-1.5, 1.5), -dir.y * rnd(4, 10) + rnd(-1, 1.5), -dir.z * rnd(6, 12) + rnd(-1.5, 1.5), rnd(0.08, 0.2), rnd(0.2, 0.42), C.fire, 1, 0, 4, 1)
    for (let i = 0; i < Math.round(10 * quality) + 4; i++) blend.emit(bx, by, bz, -dir.x * rnd(4, 8) + rnd(-1.2, 1.2), rnd(0.2, 1.2), -dir.z * rnd(4, 8) + rnd(-1.2, 1.2), rnd(1.2, 2.2), rnd(0.5, 0.9), i % 2 ? C.smoke : C.darkSmoke, 0.38, 0.1, 2.2, 1.1)
  }
}

// type: 'brass' (default), 'big' (rifle case), 'shell' (red shotgun shell).
export function shellCasing(pos, right, up, type = 'brass') {
  const c = CASING[type] || CASING.brass
  const i = casingState.findIndex((x) => x.life <= 0)
  const k = i >= 0 ? i : Math.floor(Math.random() * casingState.length)
  const s = casingState[k]
  s.p.copy(pos)
  s.v.copy(right).multiplyScalar(rnd(1.6, 2.6)).addScaledVector(up, rnd(1.4, 2.4))
  s.r.set(rnd(0, 6), rnd(0, 6), rnd(0, 6))
  s.w.set(rnd(-25, 25), rnd(-25, 25), rnd(-25, 25))
  s.life = type === 'brass' ? 2.2 : 3.2
  s.floor = pos.y - 1.3
  s.s.set(...c.scale)
  casings.setColorAt(k, c.color)
  casings.instanceColor.needsUpdate = true
}

// The frying pan clanging: a spray of bright sparks off the point (dir: the blow / bullet).
export function panSparks(point, dir) {
  for (let i = 0; i < Math.round(14 * quality) + 4; i++) add.emit(point.x, point.y, point.z, -dir.x * rnd(1, 4) + rnd(-2.5, 2.5), rnd(0.5, 4), -dir.z * rnd(1, 4) + rnd(-2.5, 2.5), rnd(0.15, 0.4), rnd(0.03, 0.05), C.spark, 1, -14, 1.5)
}

// A short bright light at a point (stun flashes) from the fixed light pool.
export function flashLight(pos, peak = 60, dur = 0.25) {
  const l = lights.reduce((a, b) => (a.t < b.t ? a : b))
  l.t = l.dur = dur
  l.peak = peak
  l.light.position.copy(pos).y += 1
}

// Bullet hitting the world: sparks, dust, a decal.
export function impact(point, normal, material = 'stone', decal = true) {
  const n = Math.round(rnd(5, 9) * quality)
  for (let i = 0; i < n; i++) {
    const sx = normal.x * rnd(2, 6) + rnd(-2.5, 2.5)
    const sy = normal.y * rnd(2, 6) + rnd(0, 3)
    const sz = normal.z * rnd(2, 6) + rnd(-2.5, 2.5)
    add.emit(point.x, point.y, point.z, sx, sy, sz, rnd(0.12, 0.3), rnd(0.025, 0.05), material === 'metal' ? C.spark : C.ember, 1, -14, 1.5)
  }
  const dustC = material === 'grass' || material === 'dirt' ? C.dirt : C.dust
  for (let i = 0; i < Math.round(2 * quality) + 1; i++) blend.emit(point.x, point.y, point.z, normal.x * rnd(0.6, 1.6) + rnd(-0.4, 0.4), normal.y * rnd(0.6, 1.6) + rnd(0, 0.6), normal.z * rnd(0.6, 1.6) + rnd(-0.4, 0.4), rnd(0.5, 0.9), rnd(0.18, 0.28), dustC, 0.55, -0.6, 2.5, 0.8)
  // Decal
  if (!decal) return
  const h = holeState.reduce((a, b) => (a.life < b.life ? a : b))
  h.life = 12
  v1.copy(point).addScaledVector(normal, 0.01)
  q1.setFromUnitVectors(Z, normal)
  const sc = rnd(0.7, 1.2)
  h.m.compose(v1, q1, v2.set(sc, sc, sc))
}

// Hitting a character: a bright puff + chips in the outfit colours (no gore).
export function hitPuff(point, dir, head = false) {
  const n = Math.round((head ? 12 : 7) * quality)
  for (let i = 0; i < n; i++) add.emit(point.x, point.y, point.z, -dir.x * rnd(1, 3) + rnd(-2, 2), rnd(0.5, 3), -dir.z * rnd(1, 3) + rnd(-2, 2), rnd(0.15, 0.35), rnd(0.04, 0.07), head ? C.gold : C.red, 1, -9, 2)
  blend.emit(point.x, point.y, point.z, 0, 0.4, 0, 0.4, 0.3, C.smoke, 0.3, 0, 2, 1.2)
}

// size: extra scale for the particle counts and the fireball (rockets 1.35).
export function explosion(pos, radius = 6, size = 1) {
  const q0 = quality
  quality *= size
  explosionInner(pos, radius)
  quality = q0
}
function explosionInner(pos, radius) {
  const fb = fireballs.find((x) => x.t <= 0) || fireballs[0]
  fb.t = fb.dur = 0.55
  fb.r = radius * 0.62
  fb.mesh.position.copy(pos).y += radius * 0.18
  fb.mesh.visible = true
  ring(pos, 0.5, radius * 1.4, 0.45, '#ffcf8a')
  const l = lights.reduce((a, b) => (a.t < b.t ? a : b))
  l.t = l.dur = 0.35
  l.peak = 60
  l.light.position.copy(pos).y += 1
  const nf = Math.round(50 * quality) + 14
  for (let i = 0; i < nf; i++) {
    const a = rnd(0, Math.PI * 2)
    const s = rnd(2, 10)
    add.emit(pos.x, pos.y + 0.5, pos.z, Math.cos(a) * s, rnd(1.5, 10), Math.sin(a) * s, rnd(0.3, 0.8), rnd(0.6, 1.5), C.fire, 1, -2, 3, 1.6)
  }
  // Core flash
  for (let i = 0; i < 2; i++) add.emit(pos.x + rnd(-0.3, 0.3), pos.y + 1 + rnd(0, 0.6), pos.z + rnd(-0.3, 0.3), 0, rnd(1, 2), 0, rnd(0.08, 0.12), rnd(2, 2.8), C.ember, 1, 0, 0, 4)
  for (let i = 0; i < Math.round(30 * quality) + 6; i++) {
    const a = rnd(0, Math.PI * 2)
    const s = rnd(5, 16)
    add.emit(pos.x, pos.y + 0.3, pos.z, Math.cos(a) * s, rnd(3, 13), Math.sin(a) * s, rnd(0.5, 1.3), rnd(0.04, 0.08), C.spark, 1, -16, 0.8)
  }
  for (let i = 0; i < Math.round(18 * quality) + 5; i++) {
    const a = rnd(0, Math.PI * 2)
    const s = rnd(0.5, 3)
    blend.emit(pos.x + Math.cos(a) * rnd(0, 1.5), pos.y + rnd(0.3, 1.5), pos.z + Math.sin(a) * rnd(0, 1.5), Math.cos(a) * s, rnd(1.2, 3.5), Math.sin(a) * s, rnd(1.8, 3.2), rnd(1, 1.8), i % 3 ? C.darkSmoke : C.smoke, 0.75, 0.2, 0.8, 1.4)
  }
  for (let i = 0; i < Math.round(14 * quality); i++) blend.emit(pos.x, pos.y + 0.2, pos.z, rnd(-6, 6), rnd(3, 9), rnd(-6, 6), rnd(0.8, 1.4), rnd(0.08, 0.14), C.dirt, 1, -18, 0.5)
}

// Expanding ground ring. follow: an object whose position the ring tracks.
export function ring(pos, r0, r1, dur, color = '#ffffff', follow = null, rise = 0) {
  const r = rings.find((x) => x.t <= 0) || rings[0]
  r.t = r.dur = dur
  r.r0 = r0
  r.r1 = r1
  r.follow = follow
  r.rise = rise
  r.mesh.material.color.set(color).multiplyScalar(2.2)
  r.mesh.position.copy(pos).y += 0.08
  r.mesh.visible = true
}

// Vertical light beam (spawn / revive / airdrop landing).
export function beam(pos, color = '#9fd8ff', dur = 1.2, radius = 0.9, height = 14, follow = null) {
  const b = beams.find((x) => x.t <= 0) || beams[0]
  b.t = b.dur = dur
  b.follow = follow
  b.mesh.position.copy(pos)
  b.mesh.scale.set(radius, height, radius)
  b.mesh.material.color.set(color).multiplyScalar(1.6)
  b.mesh.visible = true
}

export function healSparkles(pos, color = C.heal, n = 18) {
  for (let i = 0; i < Math.round(n * quality) + 4; i++) {
    const a = rnd(0, Math.PI * 2)
    const r = rnd(0.3, 0.7)
    add.emit(pos.x + Math.cos(a) * r, pos.y + rnd(0, 1.6), pos.z + Math.sin(a) * r, 0, rnd(0.6, 1.6), 0, rnd(0.6, 1.1), rnd(0.06, 0.12), color, 1, 0.3, 0.5)
  }
}

export function iceBurst(pos, n = 30) {
  for (let i = 0; i < Math.round(n * quality) + 6; i++) {
    const a = rnd(0, Math.PI * 2)
    const s = rnd(1, 6)
    add.emit(pos.x, pos.y + rnd(0.2, 2), pos.z, Math.cos(a) * s, rnd(1, 6), Math.sin(a) * s, rnd(0.4, 0.9), rnd(0.06, 0.14), C.ice, 1, -12, 1)
  }
  for (let i = 0; i < Math.round(8 * quality) + 2; i++) blend.emit(pos.x + rnd(-1.5, 1.5), pos.y + rnd(0.2, 2), pos.z + rnd(-1.5, 1.5), rnd(-0.5, 0.5), rnd(0.2, 0.8), rnd(-0.5, 0.5), rnd(0.8, 1.4), rnd(0.6, 1), new Color('#d8f4ff'), 0.5, 0, 1, 1)
}

export function poof(pos, color = C.white, n = 24) {
  for (let i = 0; i < Math.round(n * quality) + 4; i++) {
    const a = rnd(0, Math.PI * 2)
    const s = rnd(0.5, 3)
    add.emit(pos.x, pos.y + rnd(0.2, 1.6), pos.z, Math.cos(a) * s, rnd(0.5, 3), Math.sin(a) * s, rnd(0.4, 0.8), rnd(0.08, 0.16), color, 1, -2, 1.5)
  }
  for (let i = 0; i < 6; i++) blend.emit(pos.x + rnd(-0.6, 0.6), pos.y + rnd(0.2, 1.4), pos.z + rnd(-0.6, 0.6), rnd(-0.3, 0.3), rnd(0.3, 0.9), rnd(-0.3, 0.3), rnd(0.8, 1.2), rnd(0.6, 0.9), C.smoke, 0.45, 0, 1, 1)
}

// Dust kicked up by a landing or a dash.
export function dustKick(pos, n = 6) {
  for (let i = 0; i < Math.round(n * quality) + 1; i++) blend.emit(pos.x + rnd(-0.4, 0.4), pos.y + 0.1, pos.z + rnd(-0.4, 0.4), rnd(-1, 1), rnd(0.2, 0.8), rnd(-1, 1), rnd(0.5, 0.9), rnd(0.3, 0.5), C.dust, 0.4, 0, 2, 0.6)
}

export function emitAdd(...args) {
  add?.emit(...args)
}
export function emitBlend(...args) {
  blend?.emit(...args)
}

export function updateFx(dt) {
  if (!add) return
  add.update(dt)
  blend.update(dt)
  for (const t of tracers) {
    if (!t.active) continue
    t.travelled += BULLET.tracerSpeed * dt
    const head = Math.min(t.travelled, t.dist)
    const len = Math.min(BULLET.tracerLength, head)
    t.mesh.position.copy(t.from).addScaledVector(t.dir, head)
    t.mesh.scale.set(1, 1, Math.max(0.01, len))
    if (t.travelled - BULLET.tracerLength > t.dist) {
      t.active = false
      t.mesh.visible = false
    }
  }
  for (const f of flashes) {
    if (f.t <= 0) continue
    f.t -= dt
    if (f.t <= 0) f.sprite.visible = false
  }
  for (const l of lights) {
    if (l.t <= 0) {
      if (l.light.intensity !== 0) l.light.intensity = 0
      continue
    }
    l.t -= dt
    l.light.intensity = l.peak * Math.max(0, l.t / l.dur)
  }
  // Casings
  let any = false
  for (let i = 0; i < casingState.length; i++) {
    const s = casingState[i]
    if (s.life <= 0) continue
    any = true
    s.life -= dt
    s.v.y -= 22 * dt
    s.p.addScaledVector(s.v, dt)
    if (s.p.y < s.floor) {
      s.p.y = s.floor
      s.v.y = Math.abs(s.v.y) * 0.35
      s.v.x *= 0.6
      s.v.z *= 0.6
      s.w.multiplyScalar(0.6)
    }
    s.r.addScaledVector(s.w, dt)
    q1.setFromAxisAngle(v1.set(1, 0, 0), s.r.x).multiply(q2.setFromAxisAngle(v2.set(0, 1, 0), s.r.y))
    const sc = s.life > 0 ? Math.min(1, s.life * 3) : 0
    casings.setMatrixAt(i, m1.compose(s.p, q1, v1.copy(s.s).multiplyScalar(sc)))
  }
  if (any) casings.instanceMatrix.needsUpdate = true
  // Holes fade by shrinking at the end of their life.
  let anyHole = false
  for (let i = 0; i < holeState.length; i++) {
    const h = holeState[i]
    if (h.life <= 0) continue
    anyHole = true
    h.life -= dt
    if (h.life <= 0) holes.setMatrixAt(i, m1.makeScale(0, 0, 0))
    else holes.setMatrixAt(i, h.m)
  }
  if (anyHole) holes.instanceMatrix.needsUpdate = true
  for (const f of fireballs) {
    if (f.t <= 0) continue
    f.t -= dt
    const k = 1 - f.t / f.dur
    const s = f.r * (0.35 + Math.sqrt(k) * 0.9)
    f.mesh.scale.set(s, s * 0.85, s)
    f.mesh.material.opacity = Math.max(0, 1 - k * 1.1)
    f.mesh.material.color.setRGB(2.6 - k * 1.2, 1.0 - k * 0.7, 0.22 - k * 0.18)
    if (f.t <= 0) f.mesh.visible = false
  }
  for (const r of rings) {
    if (r.t <= 0) continue
    r.t -= dt
    const k = 1 - r.t / r.dur
    const s = r.r0 + (r.r1 - r.r0) * (1 - (1 - k) * (1 - k))
    r.mesh.scale.set(s, 1, s)
    r.mesh.material.opacity = Math.max(0, 1 - k)
    if (r.follow) r.mesh.position.set(r.follow.x, r.follow.y + 0.08 + r.rise * k, r.follow.z)
    if (r.t <= 0) r.mesh.visible = false
  }
  for (const b of beams) {
    if (b.t <= 0) continue
    b.t -= dt
    const k = b.t / b.dur
    b.mesh.material.opacity = Math.min(1, k * 2) * 0.8
    if (b.follow) b.mesh.position.set(b.follow.x, b.follow.y, b.follow.z)
    if (b.t <= 0) b.mesh.visible = false
  }
}

// Long-lived beam over a loot crate / airdrop (managed by its owner).
export function makeLootBeam(color = '#ffd34d', height = 40, radius = 0.5) {
  const geo = new CylinderGeometry(radius, radius * 1.6, height, 16, 1, true)
  geo.translate(0, height / 2, 0)
  const m = new Mesh(geo, new MeshBasicMaterial({ map: beamTex(), color: new Color(color).multiplyScalar(1.8), transparent: true, opacity: 0.7, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, fog: false }))
  m.material.map.rotation = Math.PI
  m.material.map.center.set(0.5, 0.5)
  m.renderOrder = 4
  return m
}

