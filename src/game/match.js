// One match: two teams (the player's squad of bots in blue vs bots in orange),
// a flyover intro, a 3-2-1 countdown, the timed fight with respawns, the
// shrinking zone, supply drops, scoring/streaks/MVPs, and the end (slow
// motion, then results). Owns the actor list; main.js drives the frame.
import { Vector3 } from 'three'
import { BOT_NAMES, HEALTH, ITEMS, LOOT, MATCH, MATCH_MODES, OPERATIVES, REWARDS, SKINS } from '../config.js'
import { G, emit, on } from './state.js'
import { Actor } from './actor.js'
import { randomOutfit } from './characters.js'
import { createBot, removeAllBots } from './bots.js'
import { createZone } from './zone.js'
import { applyDamage, eliminate } from './combat.js'
import { clearItems, updateActorItems, updateItems } from './items.js'
import { activeDrops, resetLoot, spawnDrop, updateLoot } from './loot.js'
import { randomWalkable } from './navgrid.js'
import { profile, upgradeLevel, useBoughtHeart } from './save.js'
import { sfx } from '../audio/index.js'
import * as fx from './fx.js'

const rnd = (a, b) => a + Math.random() * (b - a)
const pick = (list) => list[Math.floor(Math.random() * list.length)]
const tmp = new Vector3()

let zone = null
export function initMatchSystems(scene) {
  zone = createZone(scene)
  zone.setVisible(false)
}

function botLoadout() {
  const r = Math.random()
  const primary = r < 0.42 ? 'striker' : r < 0.58 ? 'thunder' : r < 0.74 ? 'tempest' : r < 0.88 ? 'marksman' : 'hawk'
  const secondary = Math.random() < 0.7 ? 'viper' : 'hornet'
  const skinIds = Object.keys(SKINS)
  const skins = { [primary]: Math.random() < 0.5 ? 'standard' : pick(skinIds), [secondary]: Math.random() < 0.6 ? 'standard' : pick(skinIds) }
  return { primary, secondary, skins }
}

// mode: MATCH_MODES key, map: MAPS entry. playerAvatar: the player's character root.
export function createMatch({ modeId, map, playerAvatar, playerName, playerPortrait }) {
  const mode = MATCH_MODES[modeId] ?? MATCH_MODES.clash
  const names = [...BOT_NAMES].sort(() => Math.random() - 0.5)
  const actors = []
  // The player.
  const lo = profile.loadout
  const player = new Actor({
    name: playerName,
    team: 'blue',
    isPlayer: true,
    outfit: randomOutfit(),
    operative: lo.operative,
    loadout: { primary: lo.primary, secondary: lo.secondary, skins: { [lo.primary]: lo.skin[lo.primary] || 'standard', [lo.secondary]: lo.skin[lo.secondary] || 'standard' } },
    avatar: playerAvatar,
  })
  player.portrait = playerPortrait
  actors.push(player)
  for (const team of ['blue', 'orange']) {
    const count = team === 'blue' ? mode.teamSize - 1 : mode.teamSize
    for (let i = 0; i < count; i++) {
      const a = new Actor({ name: names.pop() || `Bot${i}`, team, outfit: randomOutfit(), operative: pick(Object.keys(OPERATIVES)), loadout: botLoadout() })
      actors.push(a)
    }
  }
  G.actors = actors
  G.player = player
  for (const a of actors) a.addToScene(G.scene)
  for (const a of actors) if (!a.isPlayer) createBot(a)

  const m = {
    mode,
    modeId,
    map,
    duration: mode.duration,
    score: { blue: 0, orange: 0 },
    zone,
    mvp: { blue: null, orange: null },
    hearts: MATCH.hearts,
    heartsUsed: 0,
    drops: activeDrops,
    nextDrop: 0,
    winner: null,
    endAt: 0,
    phaseT: 0,
    reviveTarget: null,
    events: [],
  }
  G.match = m
  G.time = 0
  zone.reset()
  zone.setVisible(true)
  zone.update(0, 0)
  resetLoot()
  clearItems()

  // Starting gear: everyone gets the defaults; the player adds bought upgrades.
  for (const a of actors) kit(a, true)
  // Spawn both teams in their areas.
  for (const a of actors) spawnActor(a, true)
  return m
}

function kit(a, first) {
  a.items.frostWall = ITEMS.frostWall.start
  a.items.frag = ITEMS.frag.start
  a.items.medkit = ITEMS.medkit.start
  a.vest = a.helmet = a.isPlayer ? 0 : Math.random() < 0.5 ? 1 : 0
  if (a.isPlayer) {
    a.items.medkit += upgradeLevel('medkits')
    a.items.frostWall += upgradeLevel('walls') * 2
    a.items.frag += upgradeLevel('frags')
    const armorLv = upgradeLevel('armor')
    if (armorLv) a.vest = a.helmet = 1 + armorLv
  }
  a.vestDur = HEALTH.armorDurability[a.vest]
  a.helmetDur = HEALTH.armorDurability[a.helmet]
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

// Picks a safe spawn point and places the actor there.
export function spawnActor(a, first = false) {
  const area = G.island.spawnAreas[a.team]
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
  // Face the middle of the island.
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
  a.protectedUntil = G.time + (first ? 0 : 2.5)
  a.facing = facing
  a.pitch = 0
  a.pos.copy(p)
  if (!first) {
    kit(a, false)
    // Respawns keep one level of armour.
    a.vest = Math.max(a.vest, 1)
    a.helmet = Math.max(a.helmet, 1)
    a.vestDur = HEALTH.armorDurability[a.vest]
    a.helmetDur = HEALTH.armorDurability[a.helmet]
    fx.beam(p, a.team === 'blue' ? '#7fc8ff' : '#ffb27a', 1.4, 0.9, 16)
    fx.ring(p, 0.3, 2.6, 0.7, a.team === 'blue' ? '#7fc8ff' : '#ffb27a')
  }
  a.refreshHeld()
  if (a.bot) a.bot.spawn(p, facing)
  emit('spawn', { actor: a, first, pos: p.clone(), facing })
}

// --- Events --------------------------------------------------------------------------------
let wired = false
function wire() {
  if (wired) return
  wired = true
  on('elimination', ({ target, killer }) => {
    const m = G.match
    if (!m || G.phase !== 'playing') return
    const scorer = killer ? killer.team : target.team === 'blue' ? 'orange' : 'blue'
    m.score[scorer]++
    target.respawnAt = G.time + (target.isPlayer ? MATCH.playerAutoRespawn : MATCH.botRespawn)
    if (target.isPlayer) target.lastKilledBy = killer
    fx.poof(target.pos, fx.FX_COLORS.white, 20)
    updateMvp()
    if (m.score[scorer] >= m.mode.scoreToWin) end(scorer)
    // A team with nobody standing loses its knocked players.
    checkWipe(target.team)
  })
  on('knock', ({ target }) => {
    checkWipe(target.team)
    if (target.isPlayer) sfx.hurt(true)
  })
  on('revive', ({ target }) => {
    if (target.isPlayer || target.pos.distanceTo(G.player.pos) < 30) sfx.revive()
  })
}

function checkWipe(team) {
  const members = G.actors.filter((a) => a.team === team)
  if (members.some((a) => a.life === 'alive')) return
  for (const a of members) if (a.life === 'knocked') eliminate(a, a.lastHitBy, {})
}

function updateMvp() {
  const m = G.match
  for (const team of ['blue', 'orange']) {
    let best = null
    for (const a of G.actors) {
      if (a.team !== team) continue
      if (!best || a.stats.eliminations > best.stats.eliminations || (a.stats.eliminations === best.stats.eliminations && a.stats.damage > best.stats.damage)) best = a
    }
    m.mvp[team] = best && best.stats.eliminations > 0 ? best : null
  }
}

function end(winner) {
  const m = G.match
  if (G.phase !== 'playing') return
  m.winner = winner
  G.phase = 'ending'
  m.endAt = 0
  emit('matchEnd', { winner })
}

// --- Per frame -----------------------------------------------------------------------------
// Advances the match clock + everything that is not the player's input.
export function updateMatch(dt) {
  wire()
  const m = G.match
  if (!m) return
  if (G.phase === 'playing') {
    G.time += dt
    zone.update(G.time, dt)
    if (G.time >= m.duration) {
      const w = m.score.blue === m.score.orange ? (Math.random() < 0.5 ? 'blue' : 'orange') : m.score.blue > m.score.orange ? 'blue' : 'orange'
      end(w)
    }
    // Supply drops
    if (m.nextDrop < LOOT.airdropAt.length && G.time >= LOOT.airdropAt[m.nextDrop]) {
      m.nextDrop++
      const z = zone.state
      const p = randomWalkable(G.nav, z.center.x, z.center.y, Math.max(10, z.radius * 0.6))
      if (p) {
        spawnDrop(new Vector3(p.x, p.y, p.z))
        emit('announce', { big: 'SUPPLY DROP INCOMING', small: 'Look for the red beam' })
      }
    }
  }
  if (G.phase === 'ending') {
    m.endAt += dt
  }
  const live = G.phase === 'playing' || G.phase === 'ending'

  for (const a of G.actors) {
    // Weapon timers
    if (a.fireCooldown > 0) a.fireCooldown -= dt
    a.spreadBloom = Math.max(0, a.spreadBloom - dt * 4.5)
    if (a.swingT >= 0) {
      a.swingT += dt
      if (a.swingT > 0.5) a.swingT = -1
    }
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
    if (a.emote) {
      a.emoteT += dt
      if (a.emoteT > 4.5) a.emote = null
    }
    if (G.time - a.lastShotAt > 1.2 && !a.aiming && a.life === 'alive' && !a.isPlayer) a.ready = Math.max(0, a.ready - dt)
    if (!live) continue
    updateActorItems(a, dt, tmp.set(Math.sin(a.facing) * Math.cos(a.pitch), -Math.sin(a.pitch), Math.cos(a.facing) * Math.cos(a.pitch)))

    if (a.life === 'alive') {
      // Regen after a while out of combat.
      if (G.time - a.lastDamageAt > HEALTH.regenDelay && a.hp < HEALTH.regenCap) a.hp = Math.min(HEALTH.regenCap, a.hp + HEALTH.regen * dt)
    } else if (a.life === 'knocked') {
      a.downHp -= HEALTH.bleed * dt
      if (a.reviveProgress > 0 && (!a.revivedBy || a.revivedBy.life !== 'alive' || a.revivedBy.pos.distanceTo(a.pos) > 2.4)) a.reviveProgress = Math.max(0, a.reviveProgress - dt * 2)
      if (a.downHp <= 0) eliminate(a, a.lastHitBy, {})
    } else if (a.life === 'dead' && G.phase === 'playing' && m.mode.respawn) {
      if (!a.isPlayer && G.time >= a.respawnAt) spawnActor(a)
    }
    // Zone damage (ignores armour).
    if (a.life !== 'dead' && G.phase === 'playing' && zone.outside(a.pos.x, a.pos.z)) {
      a.zoneTick = (a.zoneTick || 0) + dt
      if (a.zoneTick >= 1) {
        a.zoneTick = 0
        applyDamage(a, zone.state.damage, null, { zone: true })
        if (a.isPlayer) sfx.zoneTick()
      }
    } else a.zoneTick = 0
    if (a.fellOut && a.life !== 'dead') {
      a.fellOut = false
      eliminate(a, a.lastHitBy, { zone: true })
    }
  }
  if (live) {
    updateItems(dt)
    updateLoot(dt, performance.now() / 1000)
  }
}

// Player respawn (auto, with a heart, or `approved` by the portal's death screen, which owns the
// wait). Returns false when not allowed now.
export function respawnPlayer(useHeart, approved = false) {
  const p = G.player
  const m = G.match
  if (!p || p.life !== 'dead' || G.phase !== 'playing') return false
  if (approved) {
    // The portal said go.
  } else if (useHeart) {
    if (m.hearts > 0) m.hearts--
    else if (!useBoughtHeartSafe()) return false
    m.heartsUsed++
  } else if (G.time < p.respawnAt) return false
  spawnActor(p)
  return true
}

function useBoughtHeartSafe() {
  return useBoughtHeart()
}
export const heartsAvailable = () => (G.match ? G.match.hearts + profile.hearts : 0)

// Rewards for the summary screen.
export function matchRewards() {
  const m = G.match
  const p = G.player
  const won = m.winner === p.team
  const sorted = [...G.actors].sort((a, b) => b.stats.eliminations - a.stats.eliminations || b.stats.damage - a.stats.damage)
  const mvp = sorted[0] === p
  const coins = Math.round(p.stats.eliminations * REWARDS.perElimination + p.stats.knocks * REWARDS.perKnock + p.stats.damage * REWARDS.perDamage + (won ? REWARDS.win : REWARDS.loss) + (mvp ? REWARDS.mvp : 0))
  const rp = (won ? REWARDS.rpWin : REWARDS.rpLoss) + p.stats.eliminations * REWARDS.rpPerElim
  return { won, mvp, coins, rp, eliminations: p.stats.eliminations, knocks: p.stats.knocks, assists: p.stats.assists, damage: p.stats.damage, deaths: p.stats.deaths, headshots: p.stats.headshots, score: { ...m.score } }
}

export function teardownMatch() {
  for (const a of G.actors) a.dispose()
  removeAllBots()
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

