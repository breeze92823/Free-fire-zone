// Touch controls for the shooter, shown on coarse-pointer devices (and
// whenever a finger touches the screen; a mouse click hides them again).
// Everything feeds inputState via input.js:
//   left zone   - floating joystick -> move (pushed to the rim = sprint)
//   right zone  - one-finger drag -> look
//   FIRE        - two of them (right thumb + left index); held = shoot, and
//                 dragging a held FIRE button also turns the view
//   AIM, JUMP, CROUCH, RELOAD on rings round the right FIRE (touch.css); the HUD puts its
//   item buttons on the same outer ring and its weapon bar above the health bar.
//   In a vehicle (body.driving): the stick drives and steers, the FIRE cluster gives way to a held
//   BRAKE (handbrake) button, and the HUD's interact button gets out.
import './touch.css'
import { COARSE_POINTER, TOUCH } from './config.js'
import { inputState, setTouchMove, setTouchSprint } from './input.js'

const ICONS = {
  fire: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>',
  aim: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4"/></svg>',
  jump: '<svg viewBox="0 0 24 24"><path d="M12 19V6M6 11l6-6 6 6"/></svg>',
  crouch: '<svg viewBox="0 0 24 24"><path d="M12 5v13M6 13l6 6 6-6"/></svg>',
  reload: '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v5h5"/></svg>',
  brake: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><path d="M3 12h2.5M18.5 12H21"/></svg>',
}

function el(tag, className, html = '') {
  const e = document.createElement(tag)
  e.className = className
  e.innerHTML = html
  return e
}

const isFinger = (e) => e.pointerType === 'touch' || e.pointerType === 'pen'

function capture(zone, id) {
  try {
    zone.setPointerCapture(id)
  } catch {
    // Ignore.
  }
}

// Two layers: the move / look pads sit UNDER the HUD, so its buttons (items, weapons, ability,
// the interact prompt, the map) take their own taps and every other touch falls through to a
// pad; the buttons and the joystick's picture sit above it.
let root = null
let pads = null
let shown = false
function setVisible(on) {
  shown = on
  document.body.classList.toggle('touch-ui', on)
  if (!on) setTouchMove(0, 0)
}
export const touchShown = () => shown

// Show / hide the whole layer (menus hide it).
export function setTouchActive(on) {
  for (const layer of [pads, root]) if (layer) layer.style.visibility = on ? 'visible' : 'hidden'
  if (!on) {
    setTouchMove(0, 0)
    inputState.fire = false
  }
}

// zone takes the touches; holder (the same rectangle, in the top layer) shows the stick.
function installJoystick(zone, holder = zone) {
  const base = el('div', 'joy-base')
  const knob = el('div', 'joy-knob')
  base.appendChild(knob)
  holder.appendChild(base)
  let id = null
  let cx = 0
  let cy = 0
  let radius = 1
  const release = () => {
    id = null
    base.classList.remove('active')
    base.style.left = base.style.top = ''
    knob.style.transform = ''
    setTouchMove(0, 0)
    setTouchSprint(false)
  }
  zone.addEventListener('pointerdown', (e) => {
    if (!isFinger(e) || id !== null) return
    e.preventDefault()
    id = e.pointerId
    capture(zone, id)
    const zr = zone.getBoundingClientRect()
    radius = base.offsetWidth / 2
    cx = e.clientX
    cy = e.clientY
    base.style.left = `${cx - zr.left}px`
    base.style.top = `${cy - zr.top}px`
    base.classList.add('active')
  })
  zone.addEventListener('pointermove', (e) => {
    if (e.pointerId !== id) return
    let dx = e.clientX - cx
    let dy = e.clientY - cy
    const len = Math.hypot(dx, dy)
    if (len > radius) {
      dx *= radius / len
      dy *= radius / len
    }
    knob.style.transform = `translate(${dx}px, ${dy}px)`
    const mag = Math.min(len / radius, 1)
    const live = mag < TOUCH.deadZone ? 0 : (mag - TOUCH.deadZone) / (1 - TOUCH.deadZone)
    const k = len > 0 ? live / Math.min(len, radius) : 0
    setTouchMove(dx * k, -dy * k)
    const sprint = len / radius > TOUCH.sprintPush && -dy > Math.abs(dx) * 0.6
    setTouchSprint(sprint)
    base.classList.toggle('sprint', sprint)
  })
  zone.addEventListener('pointerup', (e) => e.pointerId === id && release())
  zone.addEventListener('pointercancel', (e) => e.pointerId === id && release())
}

// A pad that turns finger drags into look input.
function lookPad(zone, onDown = null, onUp = null) {
  const fingers = new Map()
  zone.addEventListener('pointerdown', (e) => {
    if (!isFinger(e)) return
    e.preventDefault()
    e.stopPropagation()
    capture(zone, e.pointerId)
    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    onDown?.(e)
  })
  zone.addEventListener('pointermove', (e) => {
    const f = fingers.get(e.pointerId)
    if (!f) return
    inputState.look.dx += (e.clientX - f.x) * TOUCH.lookScale
    inputState.look.dy += (e.clientY - f.y) * TOUCH.lookScale
    f.x = e.clientX
    f.y = e.clientY
  })
  const lift = (e) => {
    if (!fingers.delete(e.pointerId)) return
    onUp?.(e, fingers.size)
  }
  zone.addEventListener('pointerup', lift)
  zone.addEventListener('pointercancel', lift)
}

function button(className, html, fn) {
  const b = el('button', `touch-btn ${className}`, html)
  b.type = 'button'
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    e.stopPropagation()
    fn(b)
  })
  return b
}

// actions: { reload, crouch(on) }
export function installTouch(actions) {
  root = el('div', 'touch-root')
  pads = el('div', 'touch-root touch-pads')
  const left = el('div', 'touch-zone touch-left')
  const right = el('div', 'touch-zone touch-right')
  const stick = el('div', 'touch-zone touch-left touch-ghost')
  installJoystick(left, stick)
  lookPad(right)
  pads.append(left, right)

  // Fire buttons: held = fire, and they double as look pads.
  let firing = 0
  const fireBtn = (cls) => {
    const b = el('div', `touch-btn fire ${cls}`, ICONS.fire)
    lookPad(
      b,
      () => {
        firing++
        inputState.fire = true
        b.classList.add('on')
      },
      () => {
        firing = Math.max(0, firing - 1)
        b.classList.remove('on')
        if (!firing) inputState.fire = false
      },
    )
    return b
  }
  const cluster = el('div', 'touch-cluster')
  let crouched = false
  cluster.append(
    fireBtn('main'),
    button('aim t-ring', ICONS.aim, (b) => {
      inputState.aim = !inputState.aim
      b.classList.toggle('on', inputState.aim)
    }),
    button('jump t-ring', ICONS.jump, () => {
      inputState.jump = true
    }),
    button('crouch t-ring', ICONS.crouch, (b) => {
      crouched = !crouched
      b.classList.toggle('on', crouched)
      actions.crouch?.(crouched)
    }),
    button('reload t-ring', ICONS.reload, () => actions.reload?.()),
  )
  // Handbrake while driving (touch.css shows it only under body.driving).
  const brake = el('div', 'touch-btn brake', `${ICONS.brake}<span>BRAKE</span>`)
  const brakeUp = () => {
    inputState.brake = false
    brake.classList.remove('on')
  }
  brake.addEventListener('pointerdown', (e) => {
    if (!isFinger(e)) return
    e.preventDefault()
    e.stopPropagation()
    capture(brake, e.pointerId)
    inputState.brake = true
    brake.classList.add('on')
  })
  brake.addEventListener('pointerup', brakeUp)
  brake.addEventListener('pointercancel', brakeUp)
  // A driver with a gun shoots with this one, beside BRAKE (touch.css: body.driving.drive-shoot).
  root.append(stick, fireBtn('left'), cluster, brake, fireBtn('drive'))
  document.body.append(pads, root)

  setVisible(COARSE_POINTER)
  window.addEventListener(
    'pointerdown',
    (e) => {
      if (isFinger(e)) setVisible(true)
      else if (e.pointerType === 'mouse') setVisible(false)
    },
    { capture: true },
  )
  return {
    syncAim() {
      cluster.querySelector('.aim')?.classList.toggle('on', inputState.aim)
    },
    syncCrouch(on) {
      crouched = on
      cluster.querySelector('.crouch')?.classList.toggle('on', on)
    },
  }
}
