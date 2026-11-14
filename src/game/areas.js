// Grenade effects that linger or reach further than a blast:
// - fire pools (the Firebottle): flames, embers, smoke and a glowing patch for `burn` s. The
//   server applies the burn damage (MatchRoom fires); in the offline test range this module ticks
//   it onto the dummies through combat's local hit handler.
// - smoke clouds (the Smoke Grenade): thick rolling smoke for `cloud` s; smokeBlocks() tells
//   whether a sight line passes through one (actor.js hides enemy name tags behind smoke).
// - the stun flash (the Stun Grenade): a blinding white burst; the local player is blinded for up
//   to `blind` s when it goes off in sight and in front of them (the `flashed` event: hud.js).
// Everything is drawn with the pooled particles of fx.js plus a small pool of glow discs.
import { CanvasTexture, CircleGeometry, Color, Mesh, MeshBasicMaterial, SRGBColorSpace, Vector3 } from 'three'
import { G, emit } from './state.js'
import { castWorld, lineOfSight, localHitHandler } from './combat.js'
import * as fx from './fx.js'
import { sfx, spatial } from '../audio/index.js'

const fires = []
const smokes = []
const tmp = new Vector3()
const tmp2 = new Vector3()
const DOWN = new Vector3(0, -1, 0)
const rnd = (a, b) => a + Math.random() * (b - a)
// Flames: solid orange-red bodies (alpha-blended, so they read in daylight) with white-hot
// additive cores and embers.
const FLAME = new Color(1.6, 0.55, 0.08)
const FLAME_DEEP = new Color(1.2, 0.25, 0.04)
const FLAME_CORE = new Color(3.6, 2.2, 0.7)
const EMBER = new Color(3.4, 1.4, 0.3)
const SOOT = new Color('#2e2c2a')
const SMOKE_A = new Color('#e3e5e0')
const SMOKE_B = new Color('#c3c7bf')

// Burning ground under the fires: a scorched ring with a bright orange heart (pooled; one material
// each so they can fade on their own).
const discGeo = new CircleGeometry(1, 28)
discGeo.rotateX(-Math.PI / 2)
let burnTex = null
function burnTexture() {
  if (burnTex) return burnTex
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grad.addColorStop(0, 'rgba(255,190,80,0.95)')
  grad.addColorStop(0.35, 'rgba(255,110,20,0.85)')
  grad.addColorStop(0.7, 'rgba(90,30,8,0.75)')
  grad.addColorStop(0.9, 'rgba(25,14,8,0.5)')
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  // Patchy: darker blotches of burnt fuel.
  for (let i = 0; i < 18; i++) {
    const a = Math.random() * Math.PI * 2
    const r = 20 + Math.random() * 34
    const x = 64 + Math.cos(a) * r
    const y = 64 + Math.sin(a) * r
    const b = g.createRadialGradient(x, y, 0, x, y, 12)
    b.addColorStop(0, 'rgba(20,10,4,0.45)')
    b.addColorStop(1, 'rgba(20,10,4,0)')
    g.fillStyle = b
    g.fillRect(0, 0, 128, 128)
  }
  burnTex = new CanvasTexture(c)
  burnTex.colorSpace = SRGBColorSpace
  return burnTex
}
const discMat = () => new MeshBasicMaterial({ map: burnTexture(), color: new Color(1.25, 1.05, 1), transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })
const discs = []
function disc() {
  let d = discs.find((x) => !x.parent)
  if (!d) {
    if (discs.length >= 6) d = discs[0]
    else {
      d = new Mesh(discGeo, discMat())
      d.renderOrder = 3
      discs.push(d)
    }
  }
  return d
}

// Shader warm-up (warmup.js): the burning ground is only built when a fire starts.
export function warmSamples() {
  return [new Mesh(discGeo, discMat())]
}

// The floor under a point (or the point itself).
function ground(pos, out) {
  tmp2.copy(pos).y += 0.3
  const h = castWorld(tmp2, DOWN, 6)
  return out.copy(h ? h.point : pos)
}

// --- Fire ---------------------------------------------------------------------------------------
// owner: the thrower (its team is not burnt in the test range). gdef: GRENADES.molotov.
export function fireArea(pos, gdef, owner = null) {
  const at = ground(pos, new Vector3())
  const d = disc()
  d.position.copy(at).y += 0.04
  d.scale.setScalar(gdef.radius)
  d.material.opacity = 0
  G.scene?.add(d)
  fires.push({ pos: at, r: gdef.radius, t: 0, life: gdef.burn, dps: gdef.damage, owner, disc: d, emit: 0, tick: 0, sound: 0 })
  // The bottle bursts: a rolling fireball, glass shards.
  for (let i = 0; i < 22; i++) {
    const a = rnd(0, Math.PI * 2)
    const s = rnd(1.5, 5)
    fx.emitBlend(at.x, at.y + 0.4, at.z, Math.cos(a) * s, rnd(1.5, 4), Math.sin(a) * s, rnd(0.45, 0.8), rnd(0.7, 1.3), i % 3 ? FLAME : FLAME_DEEP, 0.95, -1, 2.5, 1.4)
    fx.emitAdd(at.x, at.y + 0.4, at.z, Math.cos(a) * s * 0.7, rnd(1, 3), Math.sin(a) * s * 0.7, rnd(0.2, 0.4), rnd(0.4, 0.7), FLAME_CORE, 1, 0, 2.5, 1)
  }
  for (let i = 0; i < 12; i++) fx.emitAdd(at.x, at.y + 0.2, at.z, rnd(-3, 3), rnd(1, 4), rnd(-3, 3), rnd(0.4, 0.8), 0.04, fx.FX_COLORS.white, 0.8, -16, 0.5)
  fx.flashLight(at, 20, 0.4)
  sfx.molotov(spatial(at.x, at.y, at.z))
}

function updateFires(dt) {
  const local = localHitHandler()
  const q = Math.max(0.5, G.preset?.particles ?? 1)
  for (let i = fires.length - 1; i >= 0; i--) {
    const f = fires[i]
    f.t += dt
    const fade = Math.min(1, f.t / 0.25) * Math.min(1, (f.life - f.t) / 0.8)
    f.disc.material.opacity = 0.9 * Math.max(0, fade) * (0.88 + 0.12 * Math.sin(f.t * 23))
    // Tongues of flame across the patch (orange bodies + hot cores), embers, black smoke above.
    f.emit += dt * 40 * q * Math.max(0, fade)
    while (f.emit > 1) {
      f.emit--
      const a = rnd(0, Math.PI * 2)
      const r = Math.sqrt(Math.random()) * f.r * 0.85
      const x = f.pos.x + Math.cos(a) * r
      const z = f.pos.z + Math.sin(a) * r
      const tall = 1 - (r / f.r) * 0.5 // taller in the middle
      fx.emitBlend(x, f.pos.y + 0.15, z, rnd(-0.25, 0.25), rnd(1.6, 2.8) * tall, rnd(-0.25, 0.25), rnd(0.45, 0.75), rnd(0.55, 0.9), Math.random() < 0.35 ? FLAME_DEEP : FLAME, 0.9, 0.6, 1, -0.45)
      fx.emitAdd(x, f.pos.y + 0.1, z, rnd(-0.15, 0.15), rnd(1.2, 2.2) * tall, rnd(-0.15, 0.15), rnd(0.25, 0.45), rnd(0.3, 0.5), FLAME_CORE, 1, 0.5, 1.2, -0.3)
      if (Math.random() < 0.25) fx.emitAdd(x, f.pos.y + 0.4, z, rnd(-0.6, 0.6), rnd(2, 4.5), rnd(-0.6, 0.6), rnd(0.8, 1.5), 0.05, EMBER, 1, -0.5, 0.6)
      if (Math.random() < 0.22) fx.emitBlend(x, f.pos.y + 1.4, z, rnd(-0.2, 0.2), rnd(1, 1.8), rnd(-0.2, 0.2), rnd(1.8, 2.8), rnd(0.8, 1.2), SOOT, 0.6, 0.2, 0.6, 0.9)
    }
    f.sound -= dt
    if (f.sound <= 0) {
      f.sound = rnd(0.25, 0.45)
      sfx.fireCrackle(spatial(f.pos.x, f.pos.y, f.pos.z))
    }
    // Offline test range only: burn the dummies standing in it (online, the server burns players).
    if (local) {
      f.tick -= dt
      if (f.tick <= 0) {
        f.tick = 0.5
        for (const a of G.actors) {
          if (a.life === 'dead' || a.untargetable || (f.owner && a.team === f.owner.team)) continue
          if (Math.hypot(a.pos.x - f.pos.x, a.pos.z - f.pos.z) > f.r || Math.abs(a.pos.y - f.pos.y) > 2) continue
          local(a, { weapon: 'molotov', n: 1, h: 0, d: 0, heal: 0, explosive: true, damage: f.dps * 0.5 })
        }
      }
    }
    if (f.t >= f.life) {
      f.disc.removeFromParent()
      fires.splice(i, 1)
    }
  }
}

// --- Smoke --------------------------------------------------------------------------------------
export function smokeCloud(pos, gdef) {
  const at = ground(pos, new Vector3())
  smokes.push({ pos: at, r: gdef.radius, t: 0, life: gdef.cloud, emit: 0 })
  // The pop: a burst of grey rolling out along the ground.
  for (let i = 0; i < 30; i++) {
    const a = rnd(0, Math.PI * 2)
    const s = rnd(1.5, 4.5)
    fx.emitBlend(at.x, at.y + 0.3, at.z, Math.cos(a) * s, rnd(0.4, 1.4), Math.sin(a) * s, rnd(3.5, 5), rnd(1.6, 2.4), i % 2 ? SMOKE_A : SMOKE_B, 1, 0.02, 0.9, 0.8)
  }
  sfx.smokePop(spatial(at.x, at.y, at.z))
}

function updateSmokes(dt) {
  const q = Math.max(0.5, G.preset?.particles ?? 1)
  for (let i = smokes.length - 1; i >= 0; i--) {
    const s = smokes[i]
    s.t += dt
    const left = s.life - s.t
    // Keep the cloud thick: big slow puffs that fill the radius, thinning out at the end.
    const rate = (s.t < 1.5 ? 50 : 26) * q * Math.min(1, Math.max(0, left - 1.5) / 2)
    s.emit += dt * rate
    while (s.emit > 1) {
      s.emit--
      const a = rnd(0, Math.PI * 2)
      const r = Math.sqrt(Math.random()) * s.r * Math.min(1, 0.4 + s.t * 0.6)
      fx.emitBlend(s.pos.x + Math.cos(a) * r, s.pos.y + rnd(0.3, 3), s.pos.z + Math.sin(a) * r, rnd(-0.25, 0.25), rnd(0.02, 0.18), rnd(-0.25, 0.25), rnd(3.5, 5), rnd(2.6, 3.6), Math.random() < 0.5 ? SMOKE_A : SMOKE_B, 1, 0, 0.2, 0.25)
    }
    if (s.t < 1 && Math.random() < dt * 20) sfx.smokeHiss(spatial(s.pos.x, s.pos.y, s.pos.z))
    if (left <= -3) smokes.splice(i, 1) // the last puffs fade on their own
  }
}

// Does the sight line a -> b pass through a smoke cloud that is thick right now?
export function smokeBlocks(a, b) {
  for (const s of smokes) {
    if (s.t < 0.7 || s.life - s.t < 1.2) continue
    // Distance from the cloud's centre (1.4 m up) to the segment.
    tmp.subVectors(b, a)
    const len2 = tmp.lengthSq()
    if (len2 < 1e-6) continue
    tmp2.set(s.pos.x, s.pos.y + 1.4, s.pos.z).sub(a)
    const k = Math.max(0, Math.min(1, tmp2.dot(tmp) / len2))
    tmp2.set(s.pos.x - (a.x + tmp.x * k), s.pos.y + 1.4 - (a.y + tmp.y * k), s.pos.z - (a.z + tmp.z * k))
    if (tmp2.length() < s.r * 0.8) return true
  }
  return false
}

// Is a point inside (or within `margin` m of) a smoke cloud that is still thick?
export function smokeInside(pos, margin = 0) {
  for (const s of smokes) {
    if (s.t < 0.7 || s.life - s.t < 1.2) continue
    if (Math.hypot(pos.x - s.pos.x, pos.z - s.pos.z) < s.r + margin && Math.abs(pos.y - s.pos.y) < 4) return true
  }
  return false
}

// --- Stun flash ---------------------------------------------------------------------------------
export function flashBang(pos, owner, gdef) {
  // A white-hot burst and a sharp bang for everyone around.
  for (let i = 0; i < 2; i++) fx.emitAdd(pos.x, pos.y + 0.3, pos.z, 0, 0.2, 0, 0.12, 4.5, fx.FX_COLORS.white, 1, 0, 0, 10)
  for (let i = 0; i < 30; i++) {
    const a = rnd(0, Math.PI * 2)
    const s = rnd(4, 12)
    fx.emitAdd(pos.x, pos.y + 0.3, pos.z, Math.cos(a) * s, rnd(1, 8), Math.sin(a) * s, rnd(0.2, 0.5), 0.06, fx.FX_COLORS.white, 1, -14, 1)
  }
  for (let i = 0; i < 8; i++) fx.emitBlend(pos.x + rnd(-0.5, 0.5), pos.y + rnd(0.2, 1), pos.z + rnd(-0.5, 0.5), rnd(-0.4, 0.4), rnd(0.3, 0.9), rnd(-0.4, 0.4), rnd(1.5, 2.5), rnd(0.8, 1.3), SMOKE_A, 0.5, 0, 1, 0.8)
  fx.ring(pos, 0.3, 7, 0.35, '#ffffff')
  fx.flashLight(pos, 90)
  sfx.flashBang(spatial(pos.x, pos.y, pos.z))
  emit('explosion', { pos: pos.clone(), radius: 4 }) // camera shake
  // How hard it hits the local player: in range, in sight, and how directly they were looking.
  const p = G.player
  if (!p || p.life === 'dead' || !G.camera) return
  p.eye(tmp)
  const d = tmp.distanceTo(pos)
  if (d > gdef.radius) return
  tmp2.copy(pos).y += 0.25
  if (!lineOfSight(tmp, tmp2)) return
  tmp2.sub(G.camera.position).normalize()
  G.camera.getWorldDirection(tmp)
  const dot = tmp.dot(tmp2)
  const facing = dot > 0.55 ? 1 : dot > 0 ? 0.65 : dot > -0.4 ? 0.35 : 0.15
  const amount = facing * Math.pow(1 - d / gdef.radius, 0.5)
  if (amount < 0.05) return
  const dur = gdef.blind * amount
  emit('flashed', { amount, dur })
  sfx.tinnitus(dur)
}

// --- Per frame / reset --------------------------------------------------------------------------
export function updateAreas(dt) {
  if (fires.length) updateFires(dt)
  if (smokes.length) updateSmokes(dt)
}

export function clearAreas() {
  for (const f of fires) f.disc.removeFromParent()
  fires.length = 0
  smokes.length = 0
}
