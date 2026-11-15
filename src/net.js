// The connection to the game server (backend repo, Colyseus room "match"). Docs:
// https://docs.bloxity.io/#html5 "Multiplayer".
// - On Bloxity: every connect resolves an endpoint with Legion.SDK.net.resolveEndpoint (never a
//   socket to <id>.host.bloxity.io) and builds a NEW Client from it; failures retry with backoff
//   for up to NET.connectTimeout s (a cold pod can take ~45 s).
// - ?roomId= (Open Rooms Join, friend invites) joins that room, falling back to matchmaking when it
//   is gone or full; ?instantMultiplayer=true creates a private room (Play with friends).
// - Party play: the party's roomKey rides in the join options; the room it lands in is reported.
// - The game token goes in the join options; the server verifies it (it never trusts an id).
// - Without the SDK (VITE_DEV_MODE / local dev) it connects to NET.devServer or ws://<host>:2567.
// Nothing here throws outward: the lobby stays usable while offline.
import { Client } from '@colyseus/sdk'
import { DEV_MODE, NET } from './config.js'
import * as bloxity from './bloxity.js'

export const net = {
  room: null,
  state: null,
  sessionId: '',
  status: 'idle', // idle | connecting | online | offline
  error: '',
  relayRoomId: '',
}

// Server close code: this account joined again elsewhere (backend constants.ts REPLACED_CODE).
const REPLACED_CODE = 4100

const handlers = new Map()
// fn(data) for a server message type, or one of the local events: 'status', 'joined', 'left'.
export function onNet(type, fn) {
  if (!handlers.has(type)) handlers.set(type, new Set())
  handlers.get(type).add(fn)
  return () => handlers.get(type)?.delete(fn)
}
function fire(type, data) {
  const set = handlers.get(type)
  if (!set) return
  for (const fn of set) {
    try {
      fn(data)
    } catch (err) {
      console.warn(`[net] ${type} handler threw`, err)
    }
  }
}

export function send(type, msg) {
  const room = net.room
  if (!room || net.status !== 'online') return false
  try {
    room.send(type, msg)
    return true
  } catch {
    return false
  }
}

export const online = () => net.status === 'online' && !!net.room
export const me = () => (net.state?.players && net.sessionId ? net.state.players.get(net.sessionId) ?? null : null)

// Every server message the client handles (server MatchRoom): forwarded to onNet listeners.
const MESSAGES = ['profile', 'shop', 'rewards', 'reward', 'healed', 'serverError', 'round', 'spawn', 'dmg', 'knock', 'elim', 'revive', 'shot', 'throw', 'boom', 'blast', 'wall', 'ult', 'opened', 'openFail', 'matchEnd', 'invite', 'inviteEnd', 'squadNote', 'heart', 'react', 'playerProfile', 'claimed', 'vboom', 'ram']

function setStatus(status, error = '') {
  net.status = status
  net.error = error
  fire('status', status)
}

// A stable per-browser id for local development only (the server accepts it when not in production).
function devUser() {
  if (!import.meta.env.DEV && !DEV_MODE) return undefined
  try {
    // ?devUser=dev-xyz: a second tab can be a second player.
    const fromUrl = new URLSearchParams(location.search).get('devUser')
    if (fromUrl && /^dev-[a-z0-9-]{4,40}$/.test(fromUrl)) return fromUrl
    let id = localStorage.getItem('ffz.devUser')
    if (!id) {
      id = `dev-${Math.random().toString(36).slice(2, 12)}`
      localStorage.setItem('ffz.devUser', id)
    }
    return id
  } catch {
    return undefined
  }
}

let joinExtras = () => ({})
// fn() -> extra join options (name, pfp, avatar) from the game.
export function setJoinOptions(fn) {
  joinExtras = fn
}

function joinOptions(party) {
  return {
    token: bloxity.getToken() || undefined,
    devUser: devUser(),
    party: party?.roomKey || undefined,
    ...joinExtras(),
  }
}

async function resolve() {
  // VITE_SERVER_URL wins (local testing with the real SDK loaded); otherwise Bloxity's matchmaker.
  if (bloxity.canResolveServer() && !NET.devServer) return bloxity.resolveServerEndpoint(bloxity.userId())
  const url = NET.devServer || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname || 'localhost'}:${NET.devPort}`
  return { endpoint: url, relayRoomId: '' }
}

let launchTried = false
let privateTried = false

async function joinOnce() {
  const party = bloxity.partyLaunch()
  const options = joinOptions(party)
  // A room the page was opened for (Open Rooms / invite): only on the first connect.
  const launch = !launchTried ? bloxity.launchRoomId() : ''
  launchTried = true
  if (launch) {
    try {
      const at = await bloxity.locateRoom(launch)
      if (at) {
        const room = await new Client(at.endpoint).joinById(at.roomId, options)
        return { room, relayRoomId: at.relayRoomId || '', party }
      }
    } catch (err) {
      console.info('[net] launch room unavailable, matchmaking instead', err?.message ?? err)
    }
  }
  const { endpoint, relayRoomId } = await resolve()
  const client = new Client(endpoint)
  if (!privateTried && bloxity.wantsPrivateRoom()) {
    privateTried = true
    const room = await client.create(NET.room, { ...options, private: true })
    return { room, relayRoomId, party }
  }
  try {
    const room = await client.joinOrCreate(NET.room, options)
    return { room, relayRoomId, party }
  } catch (err) {
    if (party && /full|locked/i.test(String(err?.message ?? err))) bloxity.partyFailed('room-full')
    throw err
  }
}

let connecting = null
let leaving = false

// Connects (or reconnects) with backoff. Resolves true once in a room, false after giving up.
export function connect() {
  if (net.room && net.status === 'online') return Promise.resolve(true)
  if (connecting) return connecting
  connecting = (async () => {
    setStatus('connecting')
    const start = performance.now()
    let wait = 1000
    while (performance.now() - start < NET.connectTimeout * 1000) {
      try {
        const { room, relayRoomId, party } = await joinOnce()
        attach(room, relayRoomId)
        if (party) bloxity.partyJoined(room.roomId)
        return true
      } catch (err) {
        console.warn('[net] connect failed, retrying', err?.message ?? err)
        await new Promise((r) => setTimeout(r, wait))
        wait = Math.min(wait * 1.6, 8000)
      }
    }
    setStatus('offline', 'Could not reach the game server')
    return false
  })().finally(() => {
    connecting = null
  })
  return connecting
}

function attach(room, relayRoomId) {
  net.room = room
  net.state = room.state
  net.sessionId = room.sessionId
  net.relayRoomId = relayRoomId
  for (const type of MESSAGES) room.onMessage(type, (msg) => fire(type, msg))
  room.onDrop?.((code, reason) => {
    console.info('[net] connection dropped, reconnecting', code, reason ?? '')
    setStatus('connecting', 'Reconnecting')
  })
  room.onReconnect?.(() => {
    console.info('[net] reconnected')
    setStatus('online')
  })
  room.onLeave((code) => {
    if (net.room !== room) return
    net.room = null
    net.state = null
    net.sessionId = ''
    const replaced = code === REPLACED_CODE
    fire('left', code)
    setStatus('offline', replaced ? 'You are playing in another tab' : 'Disconnected')
    // Replaced by another tab of the same account: rejoining would kick that one back.
    if (!leaving && !replaced) setTimeout(() => connect(), 1500)
  })
  setStatus('online')
  reportRoom()
  fire('joined', room)
  // Private rooms + rejoin by id work: tell the portal (registered last, per the docs).
  bloxity.registerFeature('play_with_friends')
}

// Invites, Open Rooms and the portal's Esc menu "In this server" list use this room. It must be the
// plain Colyseus room id: the one Bloxity's room directory lists (api.bloxity.io/v1/games/<slug>/rooms)
// and puts in ?roomId= links (the "<relay>~<roomId>" form is only for CrazyGames invites, and does not
// match the directory, which left the Esc menu list empty). `locateRoom` finds the room by this id.
// `team` is passed as the game's own team id.
export function reportRoom(team = '') {
  if (!net.room) return bloxity.updateRoom('')
  bloxity.updateRoom(net.room.roomId, team)
}

export function disconnect() {
  leaving = true
  try {
    net.room?.leave(true)
  } catch {
    // Already gone.
  }
}
