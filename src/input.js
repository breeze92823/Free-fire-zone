// Keyboard + mouse for the shooter. WASD/arrows move (camera-relative,
// consumed by player.js), mouse look while pointer-locked (the first click
// grabs the cursor, Esc releases it; where the lock is refused, dragging
// looks instead), left button fires, right button aims, wheel switches
// weapons. One-shot keys register with onKey; held keys are read with isHeld.
// Touch controls (touch.js) write the same inputState fields.
export const inputState = {
  move: { x: 0, z: 0 }, // x = strafe (+ right), z = forward (+ forward)
  look: { dx: 0, dy: 0 }, // raw pixels since the camera last read them
  sprint: false,
  jump: false, // edge: cleared by player.js
  fire: false, // held
  aim: false, // held (mouse) or toggled (touch)
  wheel: 0, // weapon-switch notches since last read (+ = next)
  crouch: false, // toggled
}

const held = new Set()
const keyActions = new Map() // code -> fn, for one-shot keys
let orbiting = false // drag-to-look fallback where pointer lock is refused
let canvas = null
let enabled = true // false while a menu owns the screen
const touch = { x: 0, z: 0, sprint: false }

export const isLocked = () => !!canvas && document.pointerLockElement === canvas
export const isHeld = (code) => held.has(code)
export function requestLock() {
  if (!canvas || isLocked() || !enabled) return
  const r = canvas.requestPointerLock?.()
  if (r instanceof Promise) r.catch(() => {})
}
export function releaseLock() {
  if (isLocked()) document.exitPointerLock?.()
}

// Menus take the screen: no shooting, no looking, the cursor is free.
export function setGameInput(on) {
  enabled = on
  if (!on) {
    releaseLock()
    clearHeld()
  }
}
export const gameInputEnabled = () => enabled

export function onKey(code, fn) {
  keyActions.set(code, fn)
}

function recomputeMove() {
  let x = 0
  let z = 0
  if (held.has('KeyW') || held.has('ArrowUp')) z += 1
  if (held.has('KeyS') || held.has('ArrowDown')) z -= 1
  if (held.has('KeyD') || held.has('ArrowRight')) x += 1
  if (held.has('KeyA') || held.has('ArrowLeft')) x -= 1
  inputState.move.x = Math.max(-1, Math.min(1, x + touch.x))
  inputState.move.z = Math.max(-1, Math.min(1, z + touch.z))
  inputState.sprint = held.has('ShiftLeft') || held.has('ShiftRight') || touch.sprint
}

export function setTouchMove(x, z) {
  touch.x = x
  touch.z = z
  recomputeMove()
}

export function setTouchSprint(on) {
  touch.sprint = on
  recomputeMove()
}

function clearHeld() {
  held.clear()
  orbiting = false
  inputState.jump = false
  inputState.fire = false
  inputState.aim = false
  recomputeMove()
}

export function install(showMenu, canvasEl) {
  canvas = canvasEl
  document.addEventListener('pointerlockchange', () => {
    if (isLocked()) orbiting = false
    else {
      inputState.fire = false
      inputState.aim = false
    }
  })
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return
    if (e.code === 'Space' || e.code.startsWith('Arrow') || e.code === 'Tab') e.preventDefault()
    if (e.repeat) return
    if (e.code === 'Escape') {
      showMenu()
      return
    }
    held.add(e.code)
    if (enabled) {
      if (e.code === 'Space') inputState.jump = true
      keyActions.get(e.code)?.()
    } else if (e.code === 'KeyM' || e.code === 'Tab') keyActions.get(e.code)?.()
    recomputeMove()
  })
  window.addEventListener('keyup', (e) => {
    held.delete(e.code)
    recomputeMove()
  })
  window.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse') return
    const onWorld = e.target === canvas
    if (!enabled || !onWorld) return
    if (e.button === 0) {
      if (isLocked()) inputState.fire = true
      else {
        requestLock()
        orbiting = true
      }
    } else if (e.button === 2) inputState.aim = true
  })
  window.addEventListener('pointerup', (e) => {
    if (e.pointerType !== 'mouse') return
    if (e.button === 0) {
      inputState.fire = false
      orbiting = false
    } else if (e.button === 2) inputState.aim = false
  })
  window.addEventListener('pointermove', (e) => {
    if (!enabled || e.pointerType !== 'mouse') return
    if (!orbiting && !isLocked()) return
    inputState.look.dx += e.movementX || 0
    inputState.look.dy += e.movementY || 0
  })
  window.addEventListener(
    'wheel',
    (e) => {
      if (e.target !== canvas || !enabled) return
      e.preventDefault()
      inputState.wheel += Math.sign(e.deltaY)
    },
    { passive: false },
  )
  window.addEventListener('contextmenu', (e) => e.preventDefault())
  window.addEventListener('blur', clearHeld)
}
