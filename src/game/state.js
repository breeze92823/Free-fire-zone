// Shared game context: one object every game module reads instead of passing
// a dozen references around, plus a tiny event bus for match events
// (damage, knock, elimination, streak...) that the HUD and audio listen to.
export const G = {
  scene: null,
  camera: null,
  renderer: null,
  lighting: null,
  island: null, // buildIsland() result
  actors: [], // every character in the match (player first)
  player: null, // the local player's Actor
  match: null, // match.js state
  nav: null, // navgrid
  preset: null, // graphics preset
  time: 0, // match clock (s since FIGHT)
  slowmo: 1, // time scale (end of match)
  phase: 'boot', // boot | lobby | vote | intro | countdown | playing | ending | results
  spectating: null, // Actor the camera follows while dead
}

const listeners = new Map()
export function on(type, fn) {
  if (!listeners.has(type)) listeners.set(type, new Set())
  listeners.get(type).add(fn)
  return () => listeners.get(type).delete(fn)
}
export function emit(type, data) {
  const set = listeners.get(type)
  if (!set) return
  for (const fn of set) {
    try {
      fn(data)
    } catch (err) {
      console.warn(`[event ${type}]`, err)
    }
  }
}

export const enemiesOf = (a) => G.actors.filter((b) => b.team !== a.team)
export const alliesOf = (a) => G.actors.filter((b) => b.team === a.team && b !== a)
