// Procedural animator for every character (the player and the others), ported from Clean
// Leaves for Loot and extended for the shooter. Lower body: states idle / run /
// airborne / landing blended through pose buffers; the walk and run are ONE
// cycle at two depths, its phase advancing with distance travelled. On top of
// that an upper-body layer holds the weapon (aim pitch, recoil kick, reload,
// melee swing, punches, grenade throw), a crouch layer bends the legs, and
// whole-body overrides play emotes, the knocked-down crawl and the death fall.
// Writes only to bones and the avatar root's rotation / position.y.
import { ANIM } from '../config.js'
import { BONE_INDEX, PlayerRig, PoseBuffer } from './rig.js'

const TAU = Math.PI * 2
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)
const lerp = (a, b, t) => a + (b - a) * t
const ease = (t) => t * t * (3 - 2 * t)
const smoothstep = (e0, e1, v) => ease(clamp((v - e0) / (e1 - e0 || 1), 0, 1))
const kneeCurve = (phase) => {
  const raw = Math.sin(phase - Math.PI / 2.6)
  return raw > 0 ? raw * raw : 0
}
const deg = (d) => (d * Math.PI) / 180

const PORTAL_CLIPS = new Map()
const CLIP_BONES = { ArmR_Offset: 'ArmR1', ArmL_Offset: 'ArmL1', LegR_Offset: 'LegR1', LegL_Offset: 'LegL1' }
// Makes a catalogue emote playable as actor.emote = 'portal:<id>'.
export function registerEmoteClip(id, clip) {
  if (clip && clip.tracks && typeof clip.tracks === 'object') PORTAL_CLIPS.set(`portal:${id}`, clip)
}
export const hasEmoteClip = (id) => PORTAL_CLIPS.has(`portal:${id}`)

// Seconds an emote plays before it ends by itself: `ANIM.emotes[name].duration` for the built-in
// ones, the clip's own length for a catalogue emote (a looping clip runs `ANIM.emoteLoopMax`).
export function emoteLength(name) {
  const own = ANIM.emotes[name]
  if (own) return own.duration
  const clip = PORTAL_CLIPS.get(name)
  if (!clip) return ANIM.emoteLoopMax
  return clip.loop ? ANIM.emoteLoopMax : Math.max(0.5, clip.len || 0) + 0.2
}

const L = ANIM.locomotion
const LIE_RAISE = 0.22 // m the root lifts so a lying body rests on the ground

export function makeAnimator(root) {
  if (!root) return null
  return new PlayerAnimator(root)
}

export function disposeAnimator(animator) {
  animator?.dispose()
}

// Default upper-body input, so callers can pass only what they use.
const NO_INPUT = { grounded: true, speed: 0, verticalVelocity: 0, turn: 0 }

class PlayerAnimator {
  constructor(root) {
    this.root = root
    this.rig = new PlayerRig(root)
    this.target = new PoseBuffer()
    this.from = new PoseBuffer()
    this.output = new PoseBuffer()
    this.scratch = new PoseBuffer()
    this.state = 'idle'
    this.stateTime = 0
    this.blendTime = 0
    this.blendDuration = 0
    this.phase = 0
    this.idleTime = 0
    this.airTime = 0
    this.bank = 0
    this.crouch = 0
    this.sit = 0 // eased: seated in a vehicle
    this.lie = 0 // eased: + face down (knocked), - face up (dead)
    this.ready = 0 // eased weapon-raise weight
    this.time = 0
    this.crawl = 0
  }

  dispose() {
    this.rig.resetToBindPose()
    this.root.rotation.set(0, 0, 0)
    this.root.position.y = 0
  }

  // input: { grounded, speed, verticalVelocity, turn (-1..1),
  //   hold: 'rifle'|'pistol'|'melee'|'fist'|null, pitch (rad, + = down), ready (0..1),
  //   kick (0..1 recoil), reload (0..1 or -1), swing (0..1 or -1), throwing (0..1 or -1),
  //   crouch (bool), life: 'alive'|'knocked'|'dead', emote: name|null, emoteTime (s),
//   sit (bool: in a vehicle seat), drive (bool: hands on the wheel), steer (-1..1) }
  update(dt, input = NO_INPUT) {
    if (!(dt > 0)) return
    this.time += dt
    this.stateTime += dt
    this.resolveState(dt, input)
    this.writePose(dt, input)
    this.blend(dt)
    this.applyLayers(dt, input)
    this.rig.applyPose(this.output)
    this.applyVisual(dt, input)
  }

  resolveState(dt, input) {
    if (!input.grounded) {
      this.airTime += dt
      if (this.airTime > ANIM.airborneDelay) this.setState('airborne', ANIM.transitions.toAirborne)
      return
    }
    this.airTime = 0
    if (this.state === 'airborne') {
      this.setState('landing', ANIM.transitions.toLanding)
      return
    }
    if (this.state === 'landing' && this.stateTime < ANIM.landing.duration) return
    this.setState(input.speed < L.idleSpeed ? 'idle' : 'run', ANIM.transitions.toLocomotion)
  }

  setState(next, duration) {
    if (next === this.state) return
    this.from.copyFrom(this.output)
    this.state = next
    this.stateTime = 0
    this.blendTime = 0
    this.blendDuration = duration
  }

  writePose(dt, input) {
    const t = this.target
    switch (this.state) {
      case 'idle': {
        const goal = this.phase > Math.PI ? TAU : 0
        this.phase += (goal - this.phase) * (1 - Math.exp(-8 * dt))
        if (this.phase >= TAU - 1e-4) this.phase = 0
        this.idleTime += dt
        const breath = Math.sin(this.idleTime * ANIM.idle.breathFrequency * TAU)
        t.applyDefinition(ANIM.idle.basePose)
        t.add('Spine1', breath * ANIM.idle.breathAmount)
        t.add('Neck1', -breath * ANIM.idle.breathAmount * 0.6)
        t.bobY = breath * ANIM.idle.breathBob
        break
      }
      case 'run': {
        const frequency = clamp(input.speed / L.strideDistance, L.minFrequency, L.maxFrequency)
        this.phase = (this.phase + frequency * TAU * dt) % TAU
        this.writeLocomotion(t, input.speed)
        break
      }
      case 'airborne': {
        const rising = clamp(input.verticalVelocity / ANIM.airborne.velocityReference, -1, 1)
        t.applyDefinition(ANIM.airborne.fall)
        this.scratch.applyDefinition(ANIM.airborne.rise)
        t.lerpBetween(t, this.scratch, clamp(0.5 + rising * 0.5, 0, 1))
        t.bobY = 0
        break
      }
      case 'landing': {
        const depth = 1 - ease(clamp(this.stateTime / ANIM.landing.duration, 0, 1))
        t.applyDefinition(ANIM.landing.pose, depth)
        t.bobY = ANIM.landing.bobY * depth
        break
      }
    }
  }

  writeLocomotion(out, speed) {
    const run = smoothstep(L.walkSpeed, L.runSpeed, speed)
    const sprint = smoothstep(L.runSpeed, L.sprintSpeed, speed) * 0.4
    const depth = (d) => lerp(lerp(d.walk, d.run, run), d.sprint, sprint)
    const phase = this.phase
    const swing = Math.sin(phase)
    const opposite = -swing
    const hip = depth(L.hipSwing)
    const knee = depth(L.kneeBend)
    const arm = depth(L.armSwing)
    const elbow = depth(L.elbowBend)
    const twist = depth(L.torsoTwist)
    const lean = depth(L.torsoLean)
    const headTwist = depth(L.headCounterTwist)
    const roll = depth(L.torsoRoll)
    const bob = depth(L.bob)

    out.reset()
    const back = 1 + sprint * 0.35
    out.set('LegL1', hip * (swing > 0 ? swing : swing * back))
    out.set('LegR1', hip * (opposite > 0 ? opposite : opposite * back))
    out.set('LegL2', knee * kneeCurve(phase))
    out.set('LegR2', knee * kneeCurve(phase + Math.PI))
    out.set('ArmL1', arm * opposite - sprint * 0.25, 0, sprint * 0.12)
    out.set('ArmR1', arm * swing - sprint * 0.25, 0, -sprint * 0.12)
    out.set('ArmL2', elbow + elbow * 0.35 * Math.max(0, opposite))
    out.set('ArmR2', elbow + elbow * 0.35 * Math.max(0, swing))
    out.set('Spine1', lean, twist * opposite, roll * Math.sin(phase * 2))
    out.set('Spine2', lean * 0.4, twist * 0.5 * opposite, 0)
    out.set('Neck1', -lean * 0.7, headTwist * swing, 0)
    out.bobY = -bob * Math.cos(phase * 2)
  }

  blend(dt) {
    if (this.blendDuration > 0) {
      this.blendTime += dt
      const t = clamp(this.blendTime / this.blendDuration, 0, 1)
      this.output.lerpBetween(this.from, this.target, ease(t))
      if (t >= 1) this.blendDuration = 0
    } else {
      this.output.copyFrom(this.target)
    }
  }

  // Writes bone (x, y, z) into the output with weight w over what is there.
  mix(bone, x, y, z, w) {
    const o = this.output
    const at = boneIndex(bone)
    if (at < 0) return
    const r = o.rotations
    r[at] = lerp(r[at], x, w)
    r[at + 1] = lerp(r[at + 1], y, w)
    r[at + 2] = lerp(r[at + 2], z, w)
  }
  addTo(bone, x, y = 0, z = 0) {
    const at = boneIndex(bone)
    if (at < 0) return
    const r = this.output.rotations
    r[at] += x
    r[at + 1] += y
    r[at + 2] += z
  }

  applyLayers(dt, input) {
    const life = input.life || 'alive'
    const k = (rate) => 1 - Math.exp(-rate * dt)

    // Crouch: legs fold, the torso leans a touch.
    const wantCrouch = life === 'alive' && input.crouch && input.grounded ? 1 : 0
    this.crouch += (wantCrouch - this.crouch) * k(12)
    if (this.crouch > 0.01) {
      const P = ANIM.crouch.pose
      const moving = clamp(input.speed / 3, 0, 1)
      for (const bone in P) {
        const p = P[bone]
        const at = boneIndex(bone)
        const r = this.output.rotations
        // Moving crouched keeps a little of the stride on top of the bent legs.
        r[at] = lerp(r[at], (p.x ?? 0) + r[at] * 0.5 * moving, this.crouch)
      }
    }

    // Seated (a vehicle): thighs forward, knees bent; the driver's hands go to the wheel.
    const wantSit = life === 'alive' && input.sit ? 1 : 0
    this.sit += (wantSit - this.sit) * k(14)
    if (this.sit > 0.01) {
      const P = ANIM.sit.pose
      const r = this.output.rotations
      for (const bone in P) {
        const at = boneIndex(bone)
        r[at] = lerp(r[at], P[bone].x ?? 0, this.sit)
      }
      if (input.drive && life === 'alive') {
        const D = ANIM.sit.drive
        const st = (input.steer || 0) * deg(14)
        this.mix('ArmR1', D.ArmR1.x - st, D.ArmR1.y ?? 0, D.ArmR1.z ?? 0, this.sit)
        this.mix('ArmR2', D.ArmR2.x, 0, 0, this.sit)
        this.mix('ArmL1', D.ArmL1.x + st, D.ArmL1.y ?? 0, D.ArmL1.z ?? 0, this.sit)
        this.mix('ArmL2', D.ArmL2.x, 0, 0, this.sit)
        this.addTo('Spine1', 0, st * 0.5)
        return
      }
    }

    // Whole-body overrides first.
    if (life !== 'alive') {
      this.writeDown(dt, input, life)
      return
    }
    if (input.emote) {
      this.writeEmote(input.emote, input.emoteTime || 0)
      return
    }

    // Upper body: weapon hold.
    const hold = input.hold
    if (!hold) return
    const wantReady = input.ready ?? 1
    this.ready += (wantReady - this.ready) * k(10)
    const pitch = (input.pitch || 0) * ANIM.aim.pitchFollow
    const kick = input.kick || 0

    if (hold === 'rifle' || hold === 'pistol') {
      const P = ANIM.aim[hold]
      // Low ready (running, not shooting) carries the gun across the chest.
      const lowX = deg(-38)
      const w = 0.65 + 0.35 * this.ready
      const aimX = (b) => lerp(lowX + (b.x ?? 0) * 0.35, (b.x ?? 0) + pitch, this.ready) - kick * deg(9)
      this.mix('ArmR1', aimX(P.ArmR1), P.ArmR1.y ?? 0, P.ArmR1.z ?? 0, w)
      this.mix('ArmR2', P.ArmR2.x ?? 0, 0, 0, w)
      if (input.reload >= 0 && input.reload < 1) {
        // Left hand drops to the magazine and back, the gun tilts.
        const r = input.reload
        const down = Math.sin(clamp(r / 0.85, 0, 1) * Math.PI)
        this.mix('ArmL1', lerp(aimX(P.ArmL1), deg(-20), down), lerp(P.ArmL1.y ?? 0, deg(-15), down), 0, w)
        this.mix('ArmL2', lerp(P.ArmL2.x ?? 0, deg(-70), down), 0, 0, w)
      } else {
        this.mix('ArmL1', aimX(P.ArmL1), P.ArmL1.y ?? 0, P.ArmL1.z ?? 0, w)
        this.mix('ArmL2', P.ArmL2.x ?? 0, 0, 0, w)
      }
      this.addTo('Spine2', pitch * 0.3 * this.ready, deg(-6) * this.ready)
      this.addTo('Neck1', pitch * 0.45, deg(6) * this.ready)
    } else if (hold === 'melee') {
      const P = ANIM.aim.melee
      const s = input.swing ?? -1
      if (s >= 0 && s < 1) {
        // Wind up high, slash across and down.
        const a = s < 0.3 ? ease(s / 0.3) : 1 - ease((s - 0.3) / 0.7)
        this.mix('ArmR1', lerp(deg(-40), deg(-150), a) + pitch * 0.5, lerp(deg(30), deg(-20), a), deg(-20), 1)
        this.mix('ArmR2', deg(-30), 0, 0, 1)
        this.addTo('Spine1', 0, lerp(deg(-25), deg(20), a))
      } else {
        this.mix('ArmR1', (P.ArmR1.x ?? 0) + pitch * 0.4, 0, P.ArmR1.z ?? 0, 0.9)
        this.mix('ArmR2', P.ArmR2.x ?? 0, 0, 0, 0.9)
      }
      this.addTo('Neck1', pitch * 0.45)
    } else if (hold === 'fist') {
      const P = ANIM.aim.fist
      const s = input.swing ?? -1
      const right = (input.swingSide ?? 0) === 0
      this.mix('ArmR1', P.ArmR1.x + pitch * 0.4, 0, P.ArmR1.z, 0.9)
      this.mix('ArmR2', P.ArmR2.x, 0, 0, 0.9)
      this.mix('ArmL1', P.ArmL1.x + pitch * 0.4, 0, P.ArmL1.z, 0.9)
      this.mix('ArmL2', P.ArmL2.x, 0, 0, 0.9)
      if (s >= 0 && s < 1) {
        const a = Math.sin(s * Math.PI)
        const arm = right ? 'ArmR' : 'ArmL'
        this.mix(`${arm}1`, deg(-92) + pitch, right ? deg(14) : deg(-14), 0, a)
        this.mix(`${arm}2`, deg(-4), 0, 0, a)
        this.addTo('Spine1', 0, (right ? 1 : -1) * deg(18) * a)
      }
      this.addTo('Neck1', pitch * 0.45)
    }

    // Grenade throw: right arm winds back over the shoulder, then whips forward.
    const th = input.throwing ?? -1
    if (th >= 0 && th < 1) {
      const a = th < 0.45 ? ease(th / 0.45) : 1 - ease((th - 0.45) / 0.55)
      this.mix('ArmR1', lerp(deg(-60), deg(-170), a), 0, deg(-10), 1)
      this.mix('ArmR2', lerp(deg(-20), deg(-80), a), 0, 0, 1)
      this.addTo('Spine1', deg(-6) * a, deg(-20) * a)
    }
  }

  writeDown(dt, input, life) {
    // Knocked: face down, crawling with the arms. Dead: flat on the back.
    const o = this.output
    o.reset()
    if (life === 'knocked') {
      this.crawl += clamp(input.speed, 0, 3) * dt * 3.2
      const c = Math.sin(this.crawl)
      o.set('ArmR1', deg(-150) + c * deg(25), 0, deg(-15))
      o.set('ArmL1', deg(-150) - c * deg(25), 0, deg(15))
      o.set('ArmR2', deg(-30))
      o.set('ArmL2', deg(-30))
      o.set('LegR1', deg(-10) + c * deg(12))
      o.set('LegL1', deg(-10) - c * deg(12))
      o.set('LegR2', deg(40) + Math.max(0, c) * deg(30))
      o.set('LegL2', deg(40) + Math.max(0, -c) * deg(30))
      o.set('Neck1', deg(-55))
    } else {
      o.set('ArmR1', deg(-100), 0, deg(-50))
      o.set('ArmL1', deg(-120), 0, deg(40))
      o.set('LegR1', deg(-8), 0, deg(-8))
      o.set('LegL1', deg(-20), 0, deg(10))
      o.set('LegL2', deg(30))
      o.set('Neck1', deg(-10), deg(25))
    }
  }

  writeEmote(name, t) {
    const o = this.output
    const s = Math.sin
    switch (name) {
      case 'wave': {
        this.mix('ArmR1', deg(-165), 0, deg(-15) + s(t * 9) * deg(22), 1)
        this.mix('ArmR2', deg(-25), 0, 0, 1)
        this.addTo('Neck1', 0, deg(-10))
        break
      }
      case 'dance': {
        const b = t * 7
        o.set('ArmR1', deg(-90) + s(b) * deg(60), 0, deg(-30))
        o.set('ArmL1', deg(-90) - s(b) * deg(60), 0, deg(30))
        o.set('ArmR2', deg(-60))
        o.set('ArmL2', deg(-60))
        o.set('Spine1', 0, s(b * 0.5) * deg(25), s(b) * deg(8))
        o.set('LegR1', Math.max(0, s(b)) * deg(-40))
        o.set('LegL1', Math.max(0, -s(b)) * deg(-40))
        o.set('LegR2', Math.max(0, s(b)) * deg(60))
        o.set('LegL2', Math.max(0, -s(b)) * deg(60))
        o.set('Neck1', 0, -s(b * 0.5) * deg(20), s(b) * deg(10))
        o.bobY = Math.abs(s(b)) * 0.08
        break
      }
      case 'salute': {
        const up = ease(clamp(t / 0.3, 0, 1))
        this.mix('ArmR1', deg(-118), deg(40), deg(-30), up)
        this.mix('ArmR2', deg(-118), 0, 0, up)
        o.set('ArmL1', 0, 0, deg(4))
        break
      }
      case 'flex': {
        const p = 0.5 + 0.5 * s(t * 4)
        o.set('ArmR1', deg(-10), 0, deg(-85))
        o.set('ArmL1', deg(-10), 0, deg(85))
        o.set('ArmR2', deg(-110) - p * deg(20))
        o.set('ArmL2', deg(-110) - p * deg(20))
        o.set('Spine1', deg(-6))
        o.set('Neck1', deg(-8), s(t * 2) * deg(15))
        break
      }
      case 'cheer': {
        const j = Math.abs(s(t * 6))
        o.set('ArmR1', deg(-170), 0, deg(-25) - j * deg(10))
        o.set('ArmL1', deg(-170), 0, deg(25) + j * deg(10))
        o.set('LegR2', j * deg(40))
        o.set('LegL2', j * deg(40))
        o.set('LegR1', j * deg(-20))
        o.set('LegL1', j * deg(-20))
        o.bobY = j * 0.12
        break
      }
      default: {
        // A Bloxity catalogue emote registered with registerEmoteClip (name 'portal:<id>').
        const clip = PORTAL_CLIPS.get(name)
        if (clip) this.writeClip(clip, t)
        break
      }
    }
  }

  // Catalogue clip { len, loop, tracks: { bone: [[sec, xDeg, yDeg, zDeg], ...] } }: degree deltas
  // over the bind pose, smoothstep between keys, clamped outside them (wrapped when looping).
  // Bones this rig does not have are ignored; the portal's *_Offset limb bones drive the first
  // joint of the same limb.
  writeClip(clip, t) {
    const len = clip.len > 0 ? clip.len : 1
    const time = clip.loop ? t % len : Math.min(t, len)
    for (const track in clip.tracks) {
      const bone = CLIP_BONES[track] ?? track
      if (!(bone in BONE_INDEX) || bone === 'Rig1') continue
      const keys = clip.tracks[track]
      if (!Array.isArray(keys) || !keys.length) continue
      let a = keys[0]
      let b = keys[keys.length - 1]
      for (let i = 0; i < keys.length - 1; i++) {
        if (time >= keys[i][0] && time <= keys[i + 1][0]) {
          a = keys[i]
          b = keys[i + 1]
          break
        }
      }
      const s = time <= keys[0][0] ? 0 : time >= b[0] ? 1 : ease((time - a[0]) / (b[0] - a[0] || 1))
      const at = time <= keys[0][0] ? keys[0] : time >= keys[keys.length - 1][0] ? keys[keys.length - 1] : null
      const x = at ? at[1] : lerp(a[1], b[1], s)
      const y = at ? at[2] : lerp(a[2], b[2], s)
      const z = at ? at[3] : lerp(a[3], b[3], s)
      this.output.set(bone, deg(x), deg(y), deg(z))
    }
  }

  applyVisual(dt, input) {
    const life = input.life || 'alive'
    const wantBank = this.state === 'run' && life === 'alive' ? -(input.turn || 0) * L.bankAngle * 0.6 : 0
    this.bank += (wantBank - this.bank) * (1 - Math.exp(-L.bankRate * dt))
    const wantLie = life === 'knocked' ? 1 : life === 'dead' ? -1 : 0
    this.lie += (wantLie - this.lie) * (1 - Math.exp(-(life === 'dead' ? 7 : 9) * dt))
    this.root.rotation.set(this.lie * Math.PI * 0.47, 0, this.bank)
    this.root.position.y = this.output.bobY * (1 - Math.abs(this.lie)) + Math.abs(this.lie) * LIE_RAISE - this.crouch * ANIM.crouch.drop
  }
}

function boneIndex(name) {
  const i = BONE_INDEX[name]
  return i === undefined ? -1 : i * 3
}
