// One online round on this client: the local player's actor, the zone and the match record the
// HUD reads. Everyone else is a real player (online.js adds them from the server roster). The
// server runs the rules: phases, clock, score, damage, knocks, eliminations, respawns, airdrops
// and rewards; this module keeps the local timers (reload, emotes, items) and picks spawn points.
import { Vector3 } from 'three'
import { ITEMS, MATCH, MATCH_MODES } from '../config.js'
import { G, emit } from './state.js'
import { Actor } from './actor.js'
import { randomOutfit } from './characters.js'
import { createZone } from './zone.js'
import { clearItems, updateActorItems, updateItems } from './items.js'
import { activeDrops, resetLoot, updateLoot } from './loot.js'
import { randomWalkable } from './navgrid.js'
import { profile, upgradeLevel } from './save.js'
import * as fx from './fx.js'
import { send } from '../net.js'
import { emoteLength } from '../avatar/animator.js'

const rnd = (a, b) => a + Math.random() * (b - a)
const tmp = new Vector3()

let zone = null
export const getZone = () => zone
export function initMatchSystems(scene) {
  zone = createZone(scene)
  zone.setVisible(false)
}

// me: the local player's server PlayerState (team, loadout); st: the room state (mode, map, seed).
export function createMatch({ st, me, map, playerAvatar, playerName, playerPortrait, netId }) {
  const mode = MATCH_MODES[st.mode] ?? MATCH_MODES.clash
  const player = new Actor({
    name: playerName,
    team: me.team,
    isPlayer: true,
    outfit: randomOutfit(),
    operative: me.operative,
    loadout: { primary: me.primary, secondary: me.secondary, grenade: profile.loadout?.grenade || 'frag', skins: { [me.primary]: me.skinPrimary || 'standard', [me.secondary]: me.skinSecondary || 'standard' } },
    avatar: playerAvatar,
  })
  player.portrait = playerPortrait
  player.netId = netId
  G.actors = [player]
  G.player = player
  player.addToScene(G.scene)

  const m = {
    mode: { ...mode, duration: st.duration, scoreToWin: st.scoreToWin },
    modeId: st.mode,
    map,
    duration: st.duration,
    score: { blue: st.blue, orange: st.orange },
    zone,
    mvp: { blue: null, orange: null },
    drops: activeDrops,
    winner: null,
    round: st.round,
  }
  G.match = m
  G.time = st.clock
  zone.reset(st.zoneSeed, map?.focus)
  zone.setVisible(true)
  zone.update(G.time, 0)
  resetLoot()
  clearItems()
  kit(player, true)
  spawnActor(player, true)
  return m
}

// Starting utility: the defaults plus the player's bought upgrades. Armour comes from the server.
export function kit(a, first) {
  a.items.frostWall = ITEMS.frostWall.start + upgradeLevel('walls') * 2
  a.items.frag = ITEMS.frag.start + upgradeLevel('frags')
  a.items.medkit = ITEMS.medkit.start + upgradeLevel('medkits')
  for (const s of a.slots) {
    s.ammo = s.def.mag ?? 0
    s.reserve = s.def.reserve ?? 0
  }
  if (first) {
    a.ult = rnd(0, 15)
    a.slot = 0
    a.refreshHeld()
  }
}

// Picks a safe spawn point for the local player and places them there (the server has already
// set them alive). First spawns land in the team's start field.
export function spawnActor(a, first = false) {
  const area = G.island.spawnAreas[a.team] ?? G.island.spawnAreas.blue
  let spot = null
  if (first) {
    spot = randomWalkable(G.nav, area.x, area.z, area.r)
  } else {
    const z = zone.state
    let best = null
    let bestScore = -Infinity
    for (let i = 0; i < 24; i++) {
      // Half the tries near teammates, half anywhere in the zone.
      const ally = G.actors.find((o) => o.team === a.team && o !== a && o.life === 'alive' && Math.random() < 0.5)
      const c = ally && i % 2 === 0 ? randomWalkable(G.nav, ally.pos.x, ally.pos.z, 30) : randomWalkable(G.nav, z.center.x, z.center.y, Math.max(8, z.radius - 6))
      if (!c) continue
      if (zone.outside(c.x, c.z, 5)) continue
      let minEnemy = Infinity
      let nearAlly = Infinity
      for (const o of G.actors) {
        if (o.life === 'dead' || o === a) continue
        const d = Math.hypot(o.pos.x - c.x, o.pos.z - c.z)
        if (o.team !== a.team) minEnemy = Math.min(minEnemy, d)
        else nearAlly = Math.min(nearAlly, d)
      }
      let score = Math.min(minEnemy, 80)
      if (minEnemy < MATCH.spawnSafeDistance) score -= 100
      if (nearAlly < 40) score += 15
      if (score > bestScore) {
        bestScore = score
        best = c
      }
    }
    spot = best || randomWalkable(G.nav, area.x, area.z, area.r)
  }
  if (!spot) spot = { x: area.x, y: G.island.groundHeight(area.x, area.z), z: area.z }
  const p = tmp.set(spot.x, spot.y + 0.05, spot.z)
  const facing = Math.atan2(-p.x, -p.z) + rnd(-0.4, 0.4)
  a.life = 'alive'
  a.hp = a.maxHp
  a.downHp = 0
  a.reloadT = -1
  a.throwT = -1
  a.healT = -1
  a.emote = null
  a.crouch = false
  a.aiming = false
  a.reviveProgress = 0
  a.lastHitBy = null
  a.facing = facing
  a.pitch = 0
  a.pos.copy(p)
  if (!first) {
    kit(a, false)
    fx.beam(p, a.team === 'blue' ? '#7fc8ff' : '#ffb27a', 1.4, 0.9, 16)
    fx.ring(p, 0.3, 2.6, 0.7, a.team === 'blue' ? '#7fc8ff' : '#ffb27a')
  }
  a.refreshHeld()
  // main.js listens: teleports the body and the camera.
  emit('spawn', { actor: a, first, pos: p.clone(), facing })
}

export function updateMvp() {
  const m = G.match
  if (!m) return
  for (const team of ['blue', 'orange']) {
    let best = null
    for (const a of G.actors) {
      if (a.team !== team) continue
      if (!best || a.stats.eliminations > best.stats.eliminations || (a.stats.eliminations === best.stats.eliminations && a.stats.damage > best.stats.damage)) best = a
    }
    m.mvp[team] = best && best.stats.eliminations > 0 ? best : null
  }
}

// --- Per frame -----------------------------------------------------------------------------
// Local timers for everyone (weapon cooldowns, reloads, swings, emotes) and the player's items.
export function updateMatch(dt) {
  const m = G.match
  if (!m) return
  zone.update(G.time, dt)
  const live = G.phase === 'playing' || G.phase === 'ending'
  for (const a of G.actors) {
    if (a.fireCooldown > 0) a.fireCooldown -= dt
    a.spreadBloom = Math.max(0, a.spreadBloom - dt * 4.5)
    if (a.swingT >= 0) {
      a.swingT += dt
      if (a.swingT > 0.5) a.swingT = -1
    }
    if (a.emote) a.emoteT += dt
    if (a.remote) continue
    if (a.reloadT >= 0 && a.life === 'alive') {
      a.reloadT += dt
      if (a.reloadT >= a.def.reload) {
        const w = a.weapon
        const take = Math.min(w.def.mag - w.ammo, w.reserve)
        w.ammo += take
        w.reserve -= take
        a.reloadT = -1
      }
    }
    // The player's emote ends after its own length; the server clears it so others stop too.
    if (a.emote && a.emoteT > emoteLength(a.emote)) {
      a.emote = null
      if (a === G.player) send('emote', { emote: '' })
    }
    if (live) updateActorItems(a, dt, tmp.set(Math.sin(a.facing) * Math.cos(a.pitch), -Math.sin(a.pitch), Math.cos(a.facing) * Math.cos(a.pitch)))
  }
  if (live) {
    updateItems(dt)
    updateLoot(dt, performance.now() / 1000)
  }
}

export function teardownMatch() {
  for (const a of G.actors) a.dispose()
  clearItems()
  resetLoot()
  zone.setVisible(false)
  G.actors = []
  G.player = null
  G.match = null
  G.spectating = null
}

export const topPlayers = (team, n = 3) =>
  G.actors
    .filter((a) => !team || a.team === team)
    .sort((a, b) => b.stats.eliminations - a.stats.eliminations || b.stats.damage - a.stats.damage)
    .slice(0, n)

