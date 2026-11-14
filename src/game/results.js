// End of match: the top three of the winning team line up on the island and
// celebrate under a VICTORY / DEFEAT banner with name plates, then the
// summary (eliminations, damage, coins, rank points, deaths) and the Lobby button.
import { Vector3 } from 'three'
import { G } from './state.js'
import { topPlayers } from './match.js'
import { resetPlayer } from '../player.js'
import { syncYawToPlayer } from '../camera.js'
import { sfx } from '../audio/index.js'
import { SVG, svgData } from './icons.js'
import { rankOf } from './save.js'

const h = (tag, cls = '', html = '') => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (html) e.innerHTML = html
  return e
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

let root = null
let lineup = []
let plates = []
const center = new Vector3()
const camFrom = new Vector3()
const camAt = new Vector3()
const tmp = new Vector3()
let t = 0
let summaryShown = false
let onDone = null
let rewards = null

export function showResults(winner, reward, done) {
  onDone = done
  rewards = reward
  t = 0
  summaryShown = false
  if (!root) {
    root = h('div', 'results')
    document.body.appendChild(root)
  }
  const won = reward.won
  root.innerHTML = `<div class="banner ${won ? 'win' : ''}">${won ? 'VICTORY' : 'DEFEAT'}</div><div class="plates"></div>
    <div class="summary"><div class="head">SUMMARY</div><div class="body">
      <div>Eliminations: ${reward.eliminations}</div>
      <div>Damage inflicted: ${Math.round(reward.damage)}</div>
      <div>Coins earned: <span class="plus">+${reward.coins}</span> <img alt="" src="${svgData(SVG.coin)}" style="height:0.9em;vertical-align:-0.1em"></div>
      ${reward.gems > 0 ? `<div>Gems earned: <span class="plus gem">+${reward.gems}</span> <img alt="" src="${svgData(SVG.gem)}" style="height:0.9em;vertical-align:-0.1em"></div>` : ''}
      <div>Rank points: <span class="plus">${reward.rp >= 0 ? '+' : ''}${reward.rp}</span> <span class="small">(${rankOf().name})</span></div>
      <div class="small">Knocks ${reward.knocks} · Assists ${reward.assists} · Headshots ${reward.headshots} · Times eliminated ${reward.deaths}</div>
      <div class="small">Final score: Blue ${reward.score.blue} — Orange ${reward.score.orange}${reward.mvp ? ' · <b style="color:#ffd34d">MATCH MVP</b>' : ''}</div>
    </div></div>
    <button class="lobbybtn o">Lobby</button>`
  root.classList.add('on')
  root.querySelector('.lobbybtn').addEventListener('click', () => {
    root.classList.remove('on')
    onDone?.()
  })
  root.addEventListener('pointerdown', () => {
    if (t > 1.2 && !summaryShown) revealSummary()
  })
  if (won) sfx.victory()
  else sfx.defeat()

  // Stage: the winners' start field, everyone else hidden.
  const area = G.island.spawnAreas[winner]
  center.set(area.x, G.island.groundHeight(area.x, area.z), area.z)
  const toMid = Math.atan2(-center.x, -center.z) // face the island centre
  lineup = topPlayers(winner, 3)
  for (const a of G.actors) a.hidden = !lineup.includes(a)
  const rightX = Math.cos(toMid)
  const rightZ = -Math.sin(toMid)
  const offsets = [0, -2.2, 2.2]
  const emotes = ['cheer', 'flex', 'dance']
  const plateWrap = root.querySelector('.plates')
  plates = []
  lineup.forEach((a, i) => {
    const p = tmp.set(center.x + rightX * offsets[i] - Math.sin(toMid) * (i ? 0.8 : 0), center.y + 0.05, center.z + rightZ * offsets[i] - Math.cos(toMid) * (i ? 0.8 : 0))
    a.life = 'alive'
    a.hp = a.maxHp
    a.protectedUntil = 0
    a.cloakUntil = 0
    a.crouch = false
    a.aiming = false
    a.facing = toMid
    a.pos.copy(p)
    a.ready = 0.3
    if (a.isPlayer) {
      resetPlayer({ x: p.x, y: p.y, z: p.z }, toMid)
      syncYawToPlayer(toMid)
    } else a.snaps && (a.snaps.length = 0)
    a.emote = won || !a.isPlayer || a.team === winner ? emotes[i] : null
    a.emoteT = 0
    a.refreshHeld()
    const plate = h('div', 'plate')
    plate.innerHTML = `${i === 0 ? '<span class="mvp">MVP</span>' : ''}<div class="pn o">${esc(a.name)}</div><div class="o">${a.stats.eliminations} eliminations</div><div class="o">${Math.round(a.stats.damage)} damage</div>`
    plateWrap.appendChild(plate)
    plates.push(plate)
  })
  // Camera in front of the line, looking back at them.
  camFrom.set(center.x + Math.sin(toMid) * 7.4, center.y + 1.9, center.z + Math.cos(toMid) * 7.4)
  camAt.set(center.x, center.y + 1.25, center.z)
}

function revealSummary() {
  summaryShown = true
  root.querySelector('.summary').classList.add('on')
  root.querySelector('.lobbybtn').classList.add('on')
  sfx.coins()
}

// Per frame: camera pose for camera.update('look') and the plates.
export function updateResults(dt, camera) {
  t += dt
  if (t > 4.2 && !summaryShown) revealSummary()
  for (const a of lineup) if (a.emote) a.emoteT += dt
  plates.forEach((p, i) => {
    const a = lineup[i]
    if (!a) return
    tmp.set(a.pos.x, a.pos.y + 2.2, a.pos.z).project(camera)
    const x = (tmp.x * 0.5 + 0.5) * window.innerWidth
    const y = (-tmp.y * 0.5 + 0.5) * window.innerHeight
    p.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px) translate(-50%, -100%)`
    p.style.opacity = t > 0.8 + i * 0.3 ? 1 : 0
  })
  // Slow push-in.
  const k = Math.min(1, t / 6)
  return { from: tmp.lerpVectors(camFrom, camAt, 0.12 * k).clone(), lookAt: camAt }
}

export function hideResults() {
  root?.classList.remove('on')
  lineup = []
  plates = []
}
