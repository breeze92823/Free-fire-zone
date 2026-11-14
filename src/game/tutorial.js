// First-round tips: a short card under the score bar that teaches the controls during a player's
// first online round. Each tip waits for the action it names (move, fire, aim, open a crate, use
// the ability) or moves on by itself after a while, so nobody gets stuck; "Skip tips" ends them.
// When the last tip is done (or skipped) the account remembers it (save.js finishTutorial -> the
// server's `tutorialDone`), so the tips show once per account. Desktop and touch get their own text.
import './tutorial.css'
import { G, on } from './state.js'
import { inputState } from '../input.js'
import { account, finishTutorial, profile } from './save.js'
import { sfx } from '../audio/index.js'

// done(state) is polled each frame; `min` s before a tip may complete, `max` s before it moves on anyway.
const TIPS = [
  {
    key: 'Move with <b>W A S D</b>. Hold <b>Shift</b> to sprint, <b>Space</b> to jump.',
    touch: 'Move with the <b>left stick</b>. Push it to the edge to sprint.',
    done: (s) => s.moved > 5,
  },
  {
    key: 'Look with the mouse and press <b>Left click</b> to fire.',
    touch: 'Drag the right side of the screen to look. Hold <b>FIRE</b> to shoot.',
    done: () => inputState.fire,
  },
  {
    key: 'Hold <b>Right click</b> to aim: tighter shots and a scope on snipers.',
    touch: 'Tap <b>AIM</b> (or drag while holding FIRE) for tighter shots.',
    done: () => !!G.player?.aiming,
  },
  {
    key: 'Supply crates give ammo, armour and gear. Walk up to one and press <b>E</b>.',
    touch: 'Supply crates give ammo, armour and gear. Walk up to one and tap the prompt.',
    done: (s) => s.looted,
    max: 30,
  },
  {
    key: '<b>G</b> frost wall · <b>T</b> grenade · <b>X</b> medkit · <b>F</b> dash. Walls stop bullets!',
    touch: 'The small buttons round FIRE: frost wall, grenade, medkit and dash. Walls stop bullets!',
    done: () => false,
    max: 9,
  },
  {
    key: 'Damage charges your ability. Press <b>Q</b> when the diamond glows.',
    touch: 'Damage charges your ability. Tap the <b>diamond</b> when it glows.',
    done: (s) => s.ulted,
    max: 12,
  },
  {
    key: 'Stay inside the safe zone. Hold <b>E</b> by a knocked teammate to revive them.',
    touch: 'Stay inside the safe zone. Hold the prompt by a knocked teammate to revive them.',
    done: () => false,
    max: 9,
  },
]
const MIN = 1.2 // s a tip stays up even when its action is already done
const MAX = 20 // s before a tip moves on by itself

let root = null
let active = false
let index = 0
let tipT = 0
const st = { moved: 0, looted: false, ulted: false, lastX: 0, lastZ: 0, ult: 0 }

function build() {
  root = document.createElement('div')
  root.className = 'tut'
  root.innerHTML = `<div class="tut-card"><div class="tut-n o"></div><div class="tut-t"></div><button class="tut-skip o">Skip tips</button></div>`
  document.body.appendChild(root)
  root.querySelector('.tut-skip').addEventListener('click', () => end())
  on('loot', ({ actor }) => {
    if (actor === G.player) st.looted = true
  })
}

const touchUi = () => document.body.classList.contains('touch-ui')
function show() {
  const tip = TIPS[index]
  root.querySelector('.tut-n').textContent = `Tip ${index + 1} / ${TIPS.length}`
  root.querySelector('.tut-t').innerHTML = touchUi() ? tip.touch : tip.key
  root.classList.remove('pop')
  void root.offsetWidth // restart the pop-in animation
  root.classList.add('on', 'pop')
}

// A round began (main.js enterRound): the tips start when this account has not finished them.
export function startTutorial() {
  if (!account.loaded || profile.tutorial || G.test) return
  if (!root) build()
  active = true
  index = 0
  tipT = 0
  st.moved = 0
  st.looted = st.ulted = false
  st.lastX = G.player?.pos.x ?? 0
  st.lastZ = G.player?.pos.z ?? 0
  st.ult = G.player?.ult ?? 0
  show()
}

// The round is over (main.js closeMatch): hide; unfinished tips come back next round.
export function stopTutorial() {
  active = false
  root?.classList.remove('on')
}

function end() {
  active = false
  root?.classList.remove('on')
  finishTutorial()
}

// Per frame while a round runs (main.js gameFrame).
export function updateTutorial(dt) {
  if (!active) return
  const p = G.player
  const live = G.phase === 'playing' && p && p.life === 'alive'
  root.classList.toggle('dim', !live)
  if (!live) return
  st.moved += Math.hypot(p.pos.x - st.lastX, p.pos.z - st.lastZ)
  st.lastX = p.pos.x
  st.lastZ = p.pos.z
  const charge = p.operativeDef?.charge ?? 1
  if (st.ult >= charge && p.ult < charge) st.ulted = true
  st.ult = p.ult
  tipT += dt
  const tip = TIPS[index]
  if ((tipT > MIN && tip.done(st)) || tipT > (tip.max ?? MAX)) {
    index++
    tipT = 0
    if (index >= TIPS.length) return end()
    sfx.click?.()
    show()
  }
}
