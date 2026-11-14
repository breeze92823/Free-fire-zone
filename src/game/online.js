// The online match, client side: turns the server's room state (net.state) and broadcasts into
// the game's actors and event bus. Other players are Actors with `remote` set, drawn
// NET.interpDelay behind their newest pose; the server decides their health, life and score.
// The local player sends its pose ~NET.poseHz times a second (sendPose).
import { Vector3 } from 'three'
import { DEV_MODE, MAPS, NET, ULT_CHARGE, WEAPONS } from '../config.js'
import { G, emit } from './state.js'
import { Actor } from './actor.js'
import { buildCharacter, portrait, randomOutfit } from './characters.js'
import { me, net, onNet, send } from '../net.js'
import { muzzleOf, explodeVisual } from './combat.js'
import { remoteThrow, remoteWall, ultVisual } from './items.js'
import { markOpened, syncCrates, syncDrops } from './loot.js'
import { mulberry32 } from './zone.js'
import { spawnActor, updateMvp } from './match.js'
import { disposeLook, lookFromJson, streamLook } from '../avatar/look.js'
import { hasEmoteClip, registerEmoteClip } from '../avatar/animator.js'
import { sfx, spatial } from '../audio/index.js'
import * as fx from './fx.js'
import * as bloxity from '../bloxity.js'

// Pose flags (server MatchState FLAG).
export const FLAG = { crouch: 1, aim: 2, grounded: 4, reload: 8, heal: 16, throw: 32, swing: 64, sprint: 128 }

const tmp = new Vector3()
const tmp2 = new Vector3()
const TAU = Math.PI * 2

export const byNet = (id) => (id ? G.actors.find((a) => a.netId === id) : null) || null

// Another player's catalogue emote ('portal:<id>'): fetch and register its clip the first time it
// is seen, so the animator can play it here too. A failed fetch is retried the next time.
const clipLoads = new Set()
function loadPortalClip(id) {
  if (!id || hasEmoteClip(id) || clipLoads.has(id)) return
  clipLoads.add(id)
  bloxity
    .getEmoteClip(id)
    .then((clip) => registerEmoteClip(id, clip))
    .catch(() => {})
    .finally(() => {
      if (!hasEmoteClip(id)) clipLoads.delete(id)
    })
}

function hash(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

const loadoutOf = (p) => ({ primary: p.primary, secondary: p.secondary, skins: { [p.primary]: p.skinPrimary || 'standard', [p.secondary]: p.skinSecondary || 'standard' } })

// --- Roster -> actors ---------------------------------------------------------------------------
// The blocky look a player wears without a Bloxity avatar: the same on every client.
export const outfitForId = (sid) => randomOutfit(mulberry32(hash(sid)))

// --- Stand-ins built ahead ----------------------------------------------------------------------
// Building a player's blocky stand-in (buildCharacter: merged meshes, painted face and shirt) took
// ~60 ms per player on a slow laptop, all in the round's first frame. The players queued for the next
// round are known in the queue, so prebuildRemotes() (main.js, every roster tick in `queue`) builds
// theirs there, one per idle slice, for both teams (the armband colour is baked into the merged mesh);
// makeRemote takes the matching one. Players who left are freed.
const prebuilt = new Map() // `${sid}|${team}` -> character root
const buildQueue = []
let building = false
const idle = (fn) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 500 }) : setTimeout(fn, 30))

function freeCharacter(root) {
  root.traverse((n) => {
    if (n.isMesh) n.geometry.dispose()
  })
  for (const m of root.userData.mats || []) {
    m.map?.dispose()
    m.dispose()
  }
}

export function prebuildRemotes() {
  const st = net.state
  if (!st?.players) return
  const want = new Set()
  st.players.forEach((p, sid) => {
    if (sid === net.sessionId || !p.inMatch) return
    for (const team of ['blue', 'orange']) {
      const key = `${sid}|${team}`
      want.add(key)
      if (!prebuilt.has(key) && !buildQueue.includes(key)) buildQueue.push(key)
    }
  })
  for (const [key, root] of prebuilt) {
    if (want.has(key)) continue
    prebuilt.delete(key)
    freeCharacter(root)
  }
  if (building || !buildQueue.length) return
  building = true
  const step = () => {
    const key = buildQueue.shift()
    if (key && !prebuilt.has(key)) {
      const [sid, team] = key.split('|')
      prebuilt.set(key, buildCharacter(outfitForId(sid), team))
    }
    if (buildQueue.length) idle(step)
    else building = false
  }
  idle(step)
}

function takePrebuilt(sid, team) {
  const key = `${sid}|${team}`
  const root = prebuilt.get(key)
  prebuilt.delete(key) // the actor owns it now (and frees it with itself)
  return root
}

function makeRemote(sid, p) {
  const outfit = outfitForId(sid)
  const a = new Actor({ name: p.name || 'Player', team: p.team, outfit, operative: p.operative, loadout: loadoutOf(p), avatar: takePrebuilt(sid, p.team) })
  a.netId = sid
  a.remote = true
  a.snaps = []
  a.lookKey = null
  a.avatarGen = 0
  a.portrait = p.pfp || portrait(outfit)
  a.uid = p.uid || ''
  a.life = p.life
  a.pos.set(p.x, p.y, p.z)
  a.facing = p.yaw
  a.addToScene(G.scene)
  G.actors.push(a)
  loadRemoteAvatar(a, p)
  return a
}

function removeActor(a) {
  a.dispose()
  const i = G.actors.indexOf(a)
  if (i >= 0) G.actors.splice(i, 1)
  if (G.spectating === a) G.spectating = null
}

// Another player's Bloxity look -> their character, dressed (avatar/look.js: custom character, the
// character kit, or skin + parts + accessories by hand). Until it loads they wear a blocky outfit
// seeded by their session id. Rebuilt whenever their look changes.
async function loadRemoteAvatar(a, p) {
  const key = `${p.outfitKey}|${p.avatar}`
  if (a.lookKey === key) return
  a.lookKey = key
  if (DEV_MODE) return // VITE_DEV_MODE: no Bloxity CDN
  const gen = ++a.avatarGen
  // The first usable build is worn at once; a look with a missing accessory / skin is retried in the
  // background (asset caches make that cheap) and swapped for the complete one. Stale = the look
  // changed again or the player left.
  await streamLook(lookFromJson(p.avatar, p.outfitKey), {
    isStale: () => gen !== a.avatarGen || !G.actors.includes(a),
    onBuilt: (built) => {
      const old = a.avatar
      a.setAvatar(built.root)
      a.refreshHeld()
      disposeLook(old)
    },
  })
}

// Adds / removes remote actors so G.actors matches the players in this round.
export function reconcile() {
  const st = net.state
  if (!st?.players || !G.match) return
  const seen = new Set()
  st.players.forEach((p, sid) => {
    if (sid === net.sessionId || !p.inMatch || (p.team !== 'blue' && p.team !== 'orange')) return
    seen.add(sid)
    const a = byNet(sid)
    if (!a) makeRemote(sid, p)
    else if (a.team !== p.team) {
      a.team = p.team
      a.tagState = ''
    }
  })
  for (const a of [...G.actors]) if (a.remote && !seen.has(a.netId)) removeActor(a)
}

// --- Server state -> actors, every frame -----------------------------------------------------------
function angleLerp(a, b, k) {
  let d = (b - a) % TAU
  if (d > Math.PI) d -= TAU
  if (d < -Math.PI) d += TAU
  return a + d * k
}

function applyRemote(a, p, dt, now) {
  // Pose snapshots in arrival order; draw interpDelay behind the newest.
  const last = a.snaps[a.snaps.length - 1]
  if (!last || last.x !== p.x || last.y !== p.y || last.z !== p.z || last.yaw !== p.yaw) {
    if (last && Math.hypot(p.x - last.x, p.z - last.z) > 15) a.snaps.length = 0 // teleport (respawn)
    a.snaps.push({ t: now, x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch })
    if (a.snaps.length > 12) a.snaps.shift()
  }
  const rt = now - NET.interpDelay * 1000
  const s = a.snaps
  let from = s[0]
  let to = s[s.length - 1]
  for (let i = s.length - 1; i > 0; i--) {
    if (s[i - 1].t <= rt) {
      from = s[i - 1]
      to = s[i]
      break
    }
  }
  const k = to === from ? 1 : Math.max(0, Math.min(1, (rt - from.t) / (to.t - from.t || 1)))
  const px = a.pos.x
  const pz = a.pos.z
  a.pos.set(from.x + (to.x - from.x) * k, from.y + (to.y - from.y) * k, from.z + (to.z - from.z) * k)
  a.facing = angleLerp(from.yaw, to.yaw, k)
  a.pitch = from.pitch + (to.pitch - from.pitch) * k
  if (dt > 0) a.vel.set((a.pos.x - px) / dt, 0, (a.pos.z - pz) / dt)
  if (a.vel.lengthSq() > 30 * 30) a.vel.set(0, 0, 0)

  a.name = p.name || a.name
  a.uid = p.uid || ''
  a.life = p.life
  a.hp = p.hp
  a.downHp = p.downHp
  a.vest = p.vest
  a.helmet = p.helmet
  a.protectedUntil = p.protectedUntil
  copyPublic(a, p)
  const f = p.flags
  a.crouch = !!(f & FLAG.crouch)
  a.aiming = !!(f & FLAG.aim)
  a.grounded = !!(f & FLAG.grounded) || p.flags === 0
  const timer = (on, t, max) => (on ? Math.min(max, t < 0 ? 0 : t + dt) : -1)
  a.reloadT = timer(f & FLAG.reload, a.reloadT, (a.def.reload || 1) * 0.98)
  a.healT = timer(f & FLAG.heal, a.healT, 10)
  a.throwT = timer(f & FLAG.throw, a.throwT, 0.54)
  if (f & FLAG.swing && a.swingT < 0) a.swingT = 0
  a.ready += ((a.aiming || G.time - a.lastShotAt < 1.4 ? 1 : 0.35) - a.ready) * Math.min(1, dt * 8)
  if (a.slots[0].id !== p.primary || a.slots[1].id !== p.secondary || a.slots[0].skin !== p.skinPrimary || a.slots[1].skin !== p.skinSecondary) {
    const lo = loadoutOf(p)
    a.slots[0] = { id: lo.primary, def: WEAPONS[lo.primary] || WEAPONS.striker, ammo: 0, reserve: 0, skin: lo.skins[lo.primary] }
    a.slots[1] = { id: lo.secondary, def: WEAPONS[lo.secondary] || WEAPONS.viper, ammo: 0, reserve: 0, skin: lo.skins[lo.secondary] }
    a.buildWeapons()
  }
  if (a.slot !== p.slot) {
    a.slot = Math.min(3, p.slot)
    a.refreshHeld()
  }
  a.operative = p.operative
  if (p.operative === 'shade') a.cloakUntil = p.ultUntil
  else a.ultActiveUntil = p.ultUntil
  const emote = p.emote || null
  if (emote !== a.emote) {
    a.emote = emote
    a.emoteT = 0
    if (emote?.startsWith('portal:')) loadPortalClip(emote.slice(7))
  }
  copyStats(a, p)
  if (`${p.outfitKey}|${p.avatar}` !== a.lookKey) loadRemoteAvatar(a, p)
}

// Public profile bits (spectate card) and this round's hearts from spectators.
function copyPublic(a, p) {
  a.level = p.level || 1
  a.rp = p.rp || 0
  a.hearts = p.hearts || 0
}

function copyStats(a, p) {
  a.stats.eliminations = p.kills
  a.stats.deaths = p.deaths
  a.stats.assists = p.assists
  a.stats.knocks = p.knocks
  a.stats.damage = p.damage
  a.stats.headshots = p.headshots
}

let mvpT = 0
// Mirrors the server onto the actors; skipped during the results lineup (staged locally).
let missedSpawnT = 0 // s the server has had us alive while we still show dead

export function applyState(dt) {
  const st = net.state
  const m = G.match
  if (!st?.players || !m) return
  m.score.blue = st.blue
  m.score.orange = st.orange
  m.duration = st.duration
  if (G.phase === 'results') return
  const now = performance.now()
  st.players.forEach((p, sid) => {
    if (sid === net.sessionId) {
      const pl = G.player
      if (!pl) return
      // Knocks, revives and eliminations follow the server; a respawn arrives with 'spawn' (it moves the player).
      if (pl.life === 'dead' && p.life === 'alive') {
        // The 'spawn' message normally lands before the state patch that says alive. If we are still
        // dead well after the server respawned us, the message was lost (a connection blip): respawn
        // locally, otherwise the player is stuck on "Respawning…" and the server ignores `respawn`.
        missedSpawnT += dt
        if (missedSpawnT > NET.missedSpawnGrace) {
          missedSpawnT = 0
          pl.life = 'alive'
          spawnActor(pl, false)
        }
      } else {
        missedSpawnT = 0
        if (pl.life !== p.life) {
          pl.life = p.life
          // A lost 'elim' message: still give the dead player a respawn timer.
          if (p.life === 'dead') {
            pl.respawnAt = G.time + NET.respawnFallback
            pl.autoRespawnAt = G.time + NET.autoRespawn
          }
        }
      }
      pl.hp = p.hp
      pl.downHp = p.downHp
      pl.vest = p.vest
      pl.helmet = p.helmet
      pl.protectedUntil = p.protectedUntil
      copyPublic(pl, p)
      if (pl.team !== p.team && p.team) pl.team = p.team
      copyStats(pl, p)
      return
    }
    const a = byNet(sid)
    if (a) applyRemote(a, p, dt, now)
  })
  // Spectators per player (the spectate panel's eye counter).
  for (const a of G.actors) a.watchers = 0
  st.players.forEach((p) => {
    if (!p.watch) return
    const w = p.watch === net.sessionId ? G.player : byNet(p.watch)
    if (w) w.watchers++
  })
  mvpT -= dt
  if (mvpT <= 0) {
    mvpT = 0.5
    updateMvp()
  }
  syncDrops(st.drops)
}

// The round clock (zone, airdrops, respawn protection) follows the server's.
export function syncClock(dt) {
  const st = net.state
  if (!st) return
  if (G.phase !== 'playing' && G.phase !== 'ending') {
    G.time = st.clock
    return
  }
  G.time += dt * (G.phase === 'ending' ? 0 : 1)
  const err = st.clock - G.time
  if (Math.abs(err) > 0.4) G.time = st.clock
  else G.time += err * Math.min(1, dt * 2)
}

// --- Local player -> server ------------------------------------------------------------------------
let poseAcc = 0
export function sendPose(dt) {
  const p = G.player
  if (!p || !G.match) return
  poseAcc += dt
  if (poseAcc < 1 / NET.poseHz) return
  poseAcc = 0
  const f =
    (p.crouch ? FLAG.crouch : 0) |
    (p.aiming ? FLAG.aim : 0) |
    (p.grounded ? FLAG.grounded : 0) |
    (p.reloadT >= 0 ? FLAG.reload : 0) |
    (p.healT >= 0 ? FLAG.heal : 0) |
    (p.throwT >= 0 ? FLAG.throw : 0) |
    (p.swingT >= 0 ? FLAG.swing : 0)
  send('pose', {
    x: round(p.pos.x),
    y: round(p.pos.y),
    z: round(p.pos.z),
    yaw: round(p.facing, 1000),
    pitch: round(p.pitch, 1000),
    speed: round(Math.hypot(p.vel.x, p.vel.z)),
    flags: f,
    slot: p.slot,
  })
}
const round = (v, k = 100) => Math.round(v * k) / k

// The direction a remote actor's gun points (from its pose yaw + pitch).
export function remoteAimDir(a, out) {
  return out.set(Math.sin(a.facing) * Math.cos(a.pitch), -Math.sin(a.pitch), Math.cos(a.facing) * Math.cos(a.pitch))
}

// --- Server events -> game events -------------------------------------------------------------------
let wired = false
export function initOnline() {
  if (wired) return
  wired = true

  onNet('dmg', ({ t, a, n, h, z, e }) => {
    const target = byNet(t) || (t === net.sessionId ? G.player : null)
    if (!target || !G.match) return
    const attacker = byNet(a) || (a === net.sessionId ? G.player : null)
    target.hitFlash()
    target.emote = null
    if (attacker) target.lastHitBy = attacker
    const point = h ? target.head(new Vector3()) : target.chest(new Vector3())
    const dir = attacker ? tmp2.subVectors(point, attacker.pos).normalize().clone() : null
    emit('damage', { target, attacker, amount: n, head: !!h, point, dir, zone: !!z, explosive: !!e })
    if (target === G.player && z) sfx.zoneTick()
    // Dealing damage charges the ability.
    if (attacker === G.player && target !== G.player) G.player.ult = Math.min(G.player.operativeDef.charge, G.player.ult + n * ULT_CHARGE.perDamage)
  })
  onNet('knock', ({ t, a, w, h }) => {
    const target = byNet(t) || (t === net.sessionId ? G.player : null)
    if (!target || !G.match) return
    target.life = 'knocked'
    target.reviveProgress = 0
    target.revivedBy = null
    target.reviveSent = false
    target.reloadT = target.healT = target.throwT = -1
    target.aiming = false
    const attacker = byNet(a) || (a === net.sessionId ? G.player : null)
    emit('knock', { target, attacker, weapon: w, head: !!h })
    if (target === G.player) sfx.hurt(true)
    else if (attacker === G.player) sfx.knock()
  })
  onNet('elim', ({ t, k, w, h, s }) => {
    const target = byNet(t) || (t === net.sessionId ? G.player : null)
    if (!target || !G.match) return
    const killer = byNet(k) || (k === net.sessionId ? G.player : null)
    target.life = 'dead'
    target.aiming = false
    target.reloadT = -1
    if (target === G.player) {
      target.lastKilledBy = killer
      target.respawnAt = G.time + NET.respawnFallback
      target.autoRespawnAt = G.time + NET.autoRespawn
    }
    fx.poof(target.pos, fx.FX_COLORS.white, 20)
    emit('elimination', { target, killer, weapon: w || null, head: !!h, streak: s || 0 })
    // The player's own eliminations: a bell that climbs with the streak, plus a fanfare from 2 on.
    if (killer === G.player && target !== G.player) {
      sfx.elimination(Math.max(1, s | 0))
      if (s >= 2) sfx.streak(s)
    }
  })
  // What the server granted this player for a knock / elimination (Gems now, coins + rank points
  // counted into the round's rewards): the HUD's popup and multi-kill banner.
  onNet('reward', ({ k, t, gems, coins, rp, h, s, b }) => {
    if (!G.match) return
    sfx.pickup()
    emit('reward', { kind: k === 'knock' ? 'knock' : 'elim', target: byNet(t), gems: gems | 0, coins: coins | 0, rp: rp | 0, head: !!h, streak: s | 0, bonus: b | 0 })
  })
  onNet('revive', ({ t, b }) => {
    const target = byNet(t) || (t === net.sessionId ? G.player : null)
    if (!target || !G.match) return
    target.life = 'alive'
    target.reviveProgress = 0
    target.revivedBy = null
    target.reviveSent = false
    fx.healSparkles(target.pos)
    fx.ring(target.pos, 0.3, 2.2, 0.6, '#7dffb0')
    if (target === G.player || target.pos.distanceTo(G.player?.pos ?? target.pos) < 30) sfx.revive()
    emit('revive', { target, by: byNet(b) || (b === net.sessionId ? G.player : null) })
  })
  // Spectators: a heart / reaction for a player (from an eliminated player watching them), and the
  // public profile asked for with `profileOf` (spectate "View profile").
  const actorOf = (id) => byNet(id) || (id === net.sessionId ? G.player : null)
  onNet('heart', ({ f, t }) => {
    const target = actorOf(t)
    if (target && G.match) emit('heart', { from: actorOf(f), target })
  })
  onNet('react', ({ f, t, e }) => {
    const target = actorOf(t)
    if (target && G.match && typeof e === 'string') emit('react', { from: actorOf(f), target, reaction: e })
  })
  onNet('playerProfile', (msg) => {
    if (msg && typeof msg.t === 'string') emit('playerProfile', { ...msg, actor: actorOf(msg.t) })
  })
  onNet('spawn', ({ id, first }) => {
    if (!G.match) return
    if (id === net.sessionId) {
      // The round's first spawn is placed by createMatch; respawns pick a safe spot here.
      if (!first || G.player.life !== 'alive') {
        G.player.life = 'alive'
        spawnActor(G.player, !!first)
      }
      return
    }
    const a = byNet(id)
    if (a) {
      a.snaps.length = 0
      a.life = 'alive'
    }
  })
  onNet('shot', ({ id, w, o, e }) => {
    const a = byNet(id)
    if (!a || !G.match || a.life !== 'alive') return
    const def = WEAPONS[w]
    if (!def) return
    const muzzle = muzzleOf(a, new Vector3())
    a.lastShotAt = G.time
    a.ready = 1
    a.kick = 1
    if (a.slots[a.slot]?.id !== w) {
      const i = a.slots.findIndex((s) => s.id === w)
      if (i >= 0) {
        a.slot = i
        a.refreshHeld()
      }
    }
    const aim = remoteAimDir(a, tmp)
    fx.muzzleFlash(muzzle, aim, def.kind === 'shotgun' || def.kind === 'sniper' || def.kind === 'lmg', Math.random() < 0.5)
    const ends = Array.isArray(e) ? e : []
    ends.forEach((pt, i) => {
      if (i < 3 || Math.random() < 0.4) fx.tracer(muzzle, tmp2.set(pt[0], pt[1], pt[2]), def.kind === 'sniper' ? fx.FX_COLORS.white : null)
    })
    if (def.melee) a.swingT = 0
    else if (!(G.time < a.cloakUntil)) sfx.shot(def.sound || def.kind, { ...spatial(muzzle.x, muzzle.y, muzzle.z), own: false })
    emit('shot', { actor: a, pos: muzzle, recoil: def.recoil })
    // A near miss whizzes past the player's head.
    const pl = G.player
    if (pl && pl.life === 'alive' && a.team !== pl.team && Array.isArray(o) && ends.length) {
      pl.eye(tmp)
      const ox = o[0]
      const oy = o[1]
      const oz = o[2]
      const ex = ends[0]
      const dx = ex[0] - ox
      const dy = ex[1] - oy
      const dz = ex[2] - oz
      const len = Math.hypot(dx, dy, dz) || 1
      const along = ((tmp.x - ox) * dx + (tmp.y - oy) * dy + (tmp.z - oz) * dz) / len
      if (along > 0 && along < len) {
        const cx = ox + (dx / len) * along - tmp.x
        const cy = oy + (dy / len) * along - tmp.y
        const cz = oz + (dz / len) * along - tmp.z
        if (Math.hypot(cx, cy, cz) < 1.6) sfx.whiz(spatial(ox, oy, oz).pan)
      }
    }
  })
  onNet('throw', ({ id, p, v, k }) => {
    const a = byNet(id)
    if (a && G.match) remoteThrow(a, p, v, k)
  })
  // A medic weapon healed someone: { t: target, a: healer, n: HP }.
  onNet('healed', ({ t, a, n }) => {
    if (!G.match) return
    const target = byNet(t) || (t === net.sessionId ? G.player : null)
    const by = byNet(a) || (a === net.sessionId ? G.player : null)
    if (target) emit('heal', { target, by, amount: n })
  })
  onNet('boom', ({ x, y, z }) => {
    if (G.match) explodeVisual(new Vector3(x, y, z))
  })
  onNet('wall', ({ id, x, y, z, yaw }) => {
    const a = byNet(id)
    if (a && G.match) remoteWall(new Vector3(x, y, z), yaw, a)
  })
  onNet('ult', ({ id, op }) => {
    // The player's own ability already played its effect locally (items.js useUltimate).
    const a = byNet(id)
    if (a && a !== G.player && G.match) ultVisual(a, op)
  })
  onNet('opened', ({ c, d, by }) => {
    if (!G.match || by === net.sessionId) return
    markOpened(c, d)
  })
  onNet('matchEnd', ({ winner }) => {
    if (G.match) emit('matchEnd', { winner })
  })

  // Chat bubbles over other players too (the portal draws the chat itself).
  bloxity.onChatMessage((m) => {
    if (!m || m.isLocalPlayer || !G.match) return
    const a = G.actors.find((x) => x.remote && x.uid && x.uid === m.userId)
    if (!a) return
    a.chatBubble?.remove?.()
    a.chatBubble = bloxity.attachChatBubble(threeRef, a.group, m)
  })
}
let threeRef = null
// main.js hands over its three.js namespace (the SDK draws bubbles with the game's own three).
export function setThree(THREE) {
  threeRef = THREE
}

// Applies the room's opened crates (late join / new round).
export function syncLoot() {
  if (net.state) syncCrates(net.state.crates)
}

// --- Roster notifications (friend joins) -----------------------------------------------------------
let known = null
export function trackRoster() {
  const st = net.state
  if (!st?.players) {
    known = null
    return
  }
  const now = new Set()
  st.players.forEach((p, sid) => {
    if (sid === net.sessionId) return
    now.add(sid)
    if (!known) bloxity.playerInRoom(p.name)
    else if (!known.has(sid) && p.name) bloxity.playerJoined(p.name)
  })
  known = now
}

// Everyone in the room right now (lobby "Players online" + team): [{ id, name, pfp, inMatch, team, squad, squadLead, ... }].
export function roster() {
  const st = net.state
  if (!st?.players) return []
  const out = []
  st.players.forEach((p, sid) =>
    out.push({ id: sid, name: p.name, pfp: p.pfp, inMatch: p.inMatch, team: p.team, primary: p.primary, secondary: p.secondary, avatar: p.avatar, outfitKey: p.outfitKey, squad: p.squad, squadLead: p.squadLead, me: sid === net.sessionId }),
  )
  return out
}

export const mapOf = (i) => MAPS[i] ?? MAPS[0]
export { me, buildCharacter }
