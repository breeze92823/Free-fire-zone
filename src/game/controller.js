// The local player's actions each frame: movement speed (run / sprint / aim /
// crouch / crawl), firing along the camera's aim ray (auto or per click),
// aiming and scopes, reload, weapon switching (keys, wheel, HUD), items and
// the ability, the interact key (open supplies, hold to revive), emotes and
// spectating after an elimination.
import { Vector3 } from 'three'
import { HEALTH, PHYSICS, SCOPE_FOV } from '../config.js'
import { inputState, isHeld, onKey } from '../input.js'
import { player as body } from '../player.js'
import { aimRay, addRecoil, addShake } from '../camera.js'
import { sfx } from '../audio/index.js'
import { G, on } from './state.js'
import { castWorld, currentSpread, fire, resolveMelee, selectSlot, startReload } from './combat.js'
import { dash, deployWall, startHeal, startThrow, useUltimate } from './items.js'
import { crateNear, openCrate } from './loot.js'
import * as fx from './fx.js'
import { profile } from './save.js'
import { send } from '../net.js'

const aimPoint = new Vector3()
const aimDir = new Vector3()
let firedThisPress = false
let lastFireHeld = false
let stepAcc = 0
let reviveTarget = null

export const view = { aimDir, aimPoint, scoped: false, spread: 0, onEnemy: false, prompt: null, interactHeld: false }

function canAct() {
  const p = G.player
  return p && p.life === 'alive' && G.phase === 'playing'
}

export function bindKeys(hud) {
  const slot = (i) => () => canAct() && selectSlot(G.player, i)
  onKey('Digit1', slot(0))
  onKey('Digit2', slot(1))
  onKey('Digit3', slot(2))
  onKey('Digit4', slot(3))
  onKey('KeyR', () => canAct() && startReload(G.player))
  onKey('KeyC', () => {
    inputState.crouch = !inputState.crouch
    hud.touch?.syncCrouch(inputState.crouch)
  })
  onKey('ControlLeft', () => {
    inputState.crouch = !inputState.crouch
    hud.touch?.syncCrouch(inputState.crouch)
  })
  // G places a frost wall while alive; while dead it is the Respawn shortcut.
  onKey('KeyG', () => {
    if (G.player?.life === 'dead' && G.phase === 'playing') hud.pressRespawn()
    else useItem('frostWall')
  })
  // Spectating (eliminated): arrows switch the watched player, H gives them a heart.
  const spectating = () => G.player?.life === 'dead' && G.phase === 'playing'
  onKey('ArrowLeft', () => spectating() && hud.spectateStep(-1))
  onKey('ArrowRight', () => spectating() && hud.spectateStep(1))
  onKey('KeyH', () => spectating() && hud.giveHeart())
  onKey('KeyT', () => useItem('frag'))
  onKey('KeyX', () => useItem('medkit'))
  onKey('KeyF', () => useItem('dash'))
  onKey('KeyZ', () => useItem('emote'))
  onKey('KeyQ', () => useUlt())
  onKey('KeyE', () => interactPress())
  onKey('KeyM', () => G.match && hud.toggleMap())
  onKey('Tab', () => G.match && hud.showBoard(true))
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Tab') hud.showBoard(false)
  })
}

export function useItem(id) {
  const p = G.player
  if (!canAct()) return
  if (id === 'frostWall') {
    if (!deployWall(p)) sfx.deny()
  } else if (id === 'frag') {
    if (!startThrow(p, 'frag')) sfx.deny()
  } else if (id === 'medkit') {
    if (!startHeal(p)) sfx.deny()
  } else if (id === 'dash') {
    const mv = inputState.move
    const yaw = p.facing - Math.PI
    // Camera-relative move direction (same basis as player.js).
    const fx_ = -Math.sin(yaw)
    const fz = -Math.cos(yaw)
    const rx = Math.cos(yaw)
    const rz = -Math.sin(yaw)
    const d = dash(p, fx_ * mv.z + rx * mv.x, fz * mv.z + rz * mv.x)
    if (d) body.push = d
    else sfx.deny()
  } else if (id === 'emote') {
    playEmote(profile.loadout.emote || 'wave')
  }
}

// Plays an emote on the player and shows it to everyone (name, or 'portal:<id>').
export function playEmote(name) {
  const p = G.player
  if (!p || p.life !== 'alive') return
  p.emote = name
  p.emoteT = 0
  send('emote', { emote: name })
}

export function useUlt() {
  if (!canAct()) return
  if (!useUltimate(G.player)) sfx.deny()
}

// E, or a tap on the HUD's interact prompt: opens the supplies in reach.
export function interactPress() {
  const p = G.player
  if (!canAct()) return
  const c = crateNear(p)
  if (c) openCrate(p, c)
}

// Per frame while a match runs (before physics).
export function updateController(dt, hud) {
  const p = G.player
  if (!p) return
  const playing = G.phase === 'playing'
  const alive = p.life === 'alive'
  const def = p.def
  const isGun = !!def.mag
  view.prompt = null

  // Wheel switches weapons.
  if (inputState.wheel !== 0) {
    if (canAct()) {
      const n = p.slots.length
      selectSlot(p, (p.slot + (inputState.wheel > 0 ? 1 : -1) + n) % n)
    }
    inputState.wheel = 0
  }

  // Movement speed + state
  const moving = Math.hypot(inputState.move.x, inputState.move.z) > 0.1
  if (p.emote && (moving || inputState.fire)) {
    p.emote = null
    send('emote', { emote: '' })
  }
  p.aiming = alive && playing && inputState.aim && isGun && p.reloadT < 0 && p.healT < 0
  p.crouch = alive && inputState.crouch && !p.emote
  const sprint = alive && inputState.sprint && inputState.move.z > 0.3 && !p.aiming && !inputState.fire && !p.crouch && p.healT < 0
  let speed = PHYSICS.walkSpeed
  if (p.life === 'knocked') speed = PHYSICS.crawlSpeed
  else if (p.aiming) speed = PHYSICS.aimSpeed
  else if (p.crouch || p.healT >= 0) speed = PHYSICS.crouchSpeed
  else if (sprint) speed = PHYSICS.sprintSpeed
  if (G.time < p.ultActiveUntil && p.operative === 'nova') speed *= 1.3
  if (alive && p.def.speedMul) speed *= p.def.speedMul // the blade: lighter on your feet
  body.moveSpeed = speed
  body.frozen = !playing && G.phase !== 'ending' ? true : p.life === 'dead' || !!p.emote
  body.canJump = alive && !p.crouch
  body.impulse = p.impulse
  if (sprint && p.reloadT < 0) p.ready = Math.max(0, p.ready - dt * 4)

  // Aim ray -> what the crosshair covers.
  aimDir.copy(aimRay.dir)
  const wh = castWorld(aimRay.origin, aimRay.dir, 300)
  aimPoint.copy(aimRay.origin).addScaledVector(aimRay.dir, wh ? wh.dist : 300)
  view.onEnemy = false
  for (const a of G.actors) {
    if (a.team === p.team || a.life === 'dead') continue
    const h = a.hitTest(aimRay.origin, aimRay.dir, wh ? wh.dist : 300)
    if (h) {
      view.onEnemy = true
      aimPoint.copy(aimRay.origin).addScaledVector(aimRay.dir, h.t)
      break
    }
  }
  // Boolean: guns without a scope have def.scope undefined, and an undefined here made the
  // HUD's classList.toggle flip the scope overlay on every other frame while aiming.
  view.scoped = !!(p.aiming && def.scope && alive && def.zoom <= SCOPE_FOV + 6)
  const hspeed = Math.hypot(body.velocity.x, body.velocity.z)
  view.spread = isGun ? currentSpread(p, hspeed) : 0

  // Pitch for the arms: from the aim direction (+ = down).
  p.pitch = -Math.asin(Math.max(-1, Math.min(1, aimDir.y)))

  // Fire
  const fireHeld = inputState.fire && playing && alive
  if (fireHeld && !lastFireHeld) firedThisPress = false
  if (fireHeld && p.healT < 0 && p.throwT < 0) {
    if (def.auto || !firedThisPress) {
      p.ready = 1
      const shot = fire(p, aimRay.origin, aimRay.dir, hspeed)
      if (shot) {
        firedThisPress = true
        const kick = (def.recoil || 0) * (p.aiming ? 0.55 : 1) * (p.crouch ? 0.8 : 1)
        addRecoil(kick, kick * 0.6)
        if (def.kind === 'sniper' || def.kind === 'shotgun') addShake(0.25)
      }
    }
  }
  lastFireHeld = fireHeld
  if (p.aiming || G.time - p.lastShotAt < 1.4) p.ready = Math.min(1, p.ready + dt * 8)
  else if (!sprint) p.ready = Math.max(0.35, p.ready - dt * 1.5)
  if (p.pendingMelee && G.time >= p.pendingMelee) resolveMelee(p)

  // Auto-reload an empty gun.
  if (alive && isGun && p.weapon.ammo === 0 && p.reloadT < 0 && p.weapon.reserve > 0 && !inputState.fire) startReload(p)

  // Interact: supplies or reviving a teammate (hold).
  reviveTarget = null
  if (alive && playing) {
    let best = null
    let bd = 2.2
    for (const a of G.actors) {
      if (a.team !== p.team || a === p || a.life !== 'knocked') continue
      const d = a.pos.distanceTo(p.pos)
      if (d < bd) {
        bd = d
        best = a
      }
    }
    if (best) {
      reviveTarget = best
      const holding = isHeld('KeyE') || hud.interactHeld
      if (holding) {
        // The server checks the hold: `reviving` when it starts, `revive` when it is done.
        if (best.reviveProgress === 0 || best.revivedBy !== p) send('reviving', { t: best.netId })
        best.reviveProgress += dt
        best.revivedBy = p
        p.crouch = true
        body.moveSpeed = 0
        if (best.reviveProgress >= HEALTH.reviveTime && !best.reviveSent) {
          best.reviveSent = true
          send('revive', { t: best.netId })
        }
      } else if (best.revivedBy === p) {
        best.reviveProgress = 0
        best.revivedBy = null
        best.reviveSent = false
      }
      view.prompt = { t1: holding ? 'Reviving…' : 'Hold', t2: `Revive ${best.name}`, progress: best.reviveProgress / HEALTH.reviveTime }
    } else {
      const c = crateNear(p)
      if (c) view.prompt = { t1: c.rich ? 'Supply Drop' : 'Supplies', t2: 'Open', progress: 0 }
    }
  }

  // Footsteps / landing
  if (alive && body.grounded && hspeed > 1.5) {
    stepAcc += hspeed * dt
    const stride = sprint ? 2.1 : 1.7
    if (stepAcc > stride) {
      stepAcc = 0
      sfx.footstep({ own: true, surface: 'grass' })
    }
  }
  if (body.landed) {
    body.landed = false
    sfx.land()
    fx.dustKick(p.pos, 5)
  }
  if (body.jumped) {
    body.jumped = false
    sfx.jump()
  }

  // Low health heartbeat.
  if (alive && p.hp < 50) sfx.heartbeat()
}

export const getReviveTarget = () => reviveTarget

// Getting hit shakes the view; nearby explosions too.
on('damage', ({ target, amount, explosive }) => {
  if (target !== G.player) return
  sfx.hurt(amount > 40)
  addShake(explosive ? 0.9 : Math.min(0.35, amount / 120))
})
on('explosion', ({ pos }) => {
  const p = G.player
  if (!p) return
  const d = pos.distanceTo(p.pos)
  if (d < 25) addShake(Math.max(0, 1 - d / 25) * 1.1)
})
