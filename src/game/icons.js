// Renders the procedural 3D models (weapons, grenades, medkit) into small
// PNG data URLs for the HUD and shops, with one tiny offscreen renderer.
// Also holds the hand-drawn SVG icons used across the UI.
import { AmbientLight, Box3, DirectionalLight, OrthographicCamera, Scene, SRGBColorSpace, Vector3, WebGLRenderer, ACESFilmicToneMapping } from 'three'
import { GRENADES, WEAPONS } from '../config.js'
import { buildGrenade, buildMedkit, buildWeapon } from './weaponModels.js'

let r = null
let scene = null
let cam = null
const cache = new Map()

function setup() {
  if (r) return true
  try {
    const canvas = document.createElement('canvas')
    r = new WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true })
    r.setPixelRatio(1)
    r.outputColorSpace = SRGBColorSpace
    r.toneMapping = ACESFilmicToneMapping
    r.toneMappingExposure = 1.15
    scene = new Scene()
    scene.add(new AmbientLight('#ffffff', 1.4))
    const key = new DirectionalLight('#ffffff', 2.6)
    key.position.set(2, 4, 3)
    const rim = new DirectionalLight('#9fd3ff', 1.4)
    rim.position.set(-3, 1, -2)
    scene.add(key, rim)
    cam = new OrthographicCamera(-1, 1, 1, -1, 0.01, 50)
    return true
  } catch {
    r = null
    return false
  }
}

function snapshot(obj, w, h, yaw = -Math.PI / 2, tilt = 0.12) {
  if (!setup()) return ''
  r.setSize(w, h, false)
  obj.rotation.set(0, yaw, tilt)
  obj.updateMatrixWorld(true)
  const box = new Box3().setFromObject(obj)
  const size = box.getSize(new Vector3())
  const c = box.getCenter(new Vector3())
  obj.position.sub(c)
  const aspect = w / h
  const half = Math.max(size.x / aspect, size.y) * 0.56
  cam.left = -half * aspect
  cam.right = half * aspect
  cam.top = half
  cam.bottom = -half
  cam.position.set(0, 0, 10)
  cam.lookAt(0, 0, 0)
  cam.updateProjectionMatrix()
  scene.add(obj)
  r.render(scene, cam)
  scene.remove(obj)
  return r.domElement.toDataURL('image/png')
}

export function weaponIcon(id, skin = 'standard', w = 256, h = 110) {
  const key = `w:${id}:${skin}:${w}x${h}`
  if (cache.has(key)) return cache.get(key)
  const def = WEAPONS[id]
  let url = ''
  if (def.model === 'fists') url = svgData(SVG.fist)
  else url = snapshot(buildWeapon(def.model, skin), w, h, -Math.PI / 2, def.melee ? 0.6 : 0.1)
  cache.set(key, url)
  return url
}

// Icons are drawn on demand by a second WebGL context (its own shaders) and PNG-encoded: 30-170 ms
// each the first time. The HUD asks for the loadout's icons when a round starts and the kill feed for
// each weapon's on its first elimination, so they are made ahead here, one per idle slice in the
// lobby. list: [id, skin, w, h] entries; already cached ones cost nothing.
const warmQueue = []
let warming = false
const idle = (fn) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 400 }) : setTimeout(fn, 30))
export function prewarmIcons(list) {
  for (const e of list) if (!cache.has(`w:${e[0]}:${e[1]}:${e[2]}x${e[3]}`)) warmQueue.push(e)
  if (warming || !warmQueue.length) return
  warming = true
  const step = () => {
    const e = warmQueue.shift()
    if (e) weaponIcon(...e)
    if (warmQueue.length) idle(step)
    else warming = false
  }
  idle(step)
}

export function itemIcon(kind, size = 96) {
  const key = `i:${kind}:${size}`
  if (cache.has(key)) return cache.get(key)
  let url = ''
  if (GRENADES[kind]) url = snapshot(buildGrenade(GRENADES[kind].model), size, size, 0.6, 0.2)
  else if (kind === 'frost') url = snapshot(buildGrenade('ice'), size, size, 0.6, 0.2)
  else if (kind === 'medkit') url = snapshot(buildMedkit(), size, size, 0.3, 0.1)
  cache.set(key, url)
  return url
}

export const svgData = (svg) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`

// Hand-drawn UI icons (white strokes / fills; colour via CSS).
export const SVG = {
  // a vehicle (kill feed: run over / blown up in a vehicle)
  car: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 24"><path d="M3 15v-4l3-1 3-4h9l4 4 5 1 2 2v2z" fill="#6f7b44" stroke="#1d2410" stroke-width="1.2" stroke-linejoin="round"/><path d="M10 7h7l3 3H9z" fill="#bfe3ff" stroke="#1d2410" stroke-width=".8"/><circle cx="9" cy="16.5" r="3.4" fill="#222" stroke="#000"/><circle cx="24" cy="16.5" r="3.4" fill="#222" stroke="#000"/><circle cx="9" cy="16.5" r="1.3" fill="#aaa"/><circle cx="24" cy="16.5" r="1.3" fill="#aaa"/></svg>',
  heart: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#ff3b5c" stroke="#7a0a1e" stroke-width="1.2" d="M12 21s-7.5-4.6-9.6-9.2C1 8.6 3 5 6.6 5c2.1 0 3.6 1.2 5.4 3.2C13.8 6.2 15.3 5 17.4 5 21 5 23 8.6 21.6 11.8 19.5 16.4 12 21 12 21z"/><path fill="#fff" opacity=".45" d="M6.5 7.2c-1.6.2-2.6 1.8-2 3.4.3-1.5 1-2.6 2.4-3 .5-.2.2-.5-.4-.4z"/></svg>',
  coin: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#ffc83d" stroke="#a86b00" stroke-width="1.6"/><circle cx="12" cy="12" r="6.8" fill="none" stroke="#e09a12" stroke-width="1.4"/><path d="M10 8.6h3.2a2 2 0 0 1 0 4H10.4h3.4a2 2 0 0 1 0 4H10z" fill="none" stroke="#a86b00" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  // Missions: a clipboard with a tick.
  missions: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="4" y="3.5" width="16" height="19" rx="2.5" fill="#f4ead2" stroke="#4a3412" stroke-width="1.4"/><rect x="8" y="1.8" width="8" height="4" rx="1.4" fill="#ffc83d" stroke="#4a3412" stroke-width="1.2"/><path d="M7.6 13.2l3 3 6-6.4" fill="none" stroke="#2a9d47" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  // Rounds played / won (missions): a flag on a pole.
  flag: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M5 22V2.5" stroke="#3a2a12" stroke-width="2" stroke-linecap="round"/><path d="M6 3.5h13l-3 4.2 3 4.3H6z" fill="#ff5a3c" stroke="#5a1408" stroke-width="1.3" stroke-linejoin="round"/></svg>',
  // The game's own Gems (earned, never sold): a mint hexagonal crystal.
  gem: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 1.6l8.6 5v10.8L12 22.4l-8.6-5V6.6z" fill="#1fd6b0" stroke="#053f37" stroke-width="1.4" stroke-linejoin="round"/><path d="M12 1.6v6.2l8.6-1.2M12 7.8L3.4 6.6M12 7.8l-4.6 8.4h9.2zM7.4 16.2l-4 1.2M16.6 16.2l4 1.2M12 22.4v-6.2" fill="none" stroke="#053f37" stroke-width=".9" stroke-linejoin="round" opacity=".75"/><path d="M12 7.8L3.4 6.6 12 1.6z" fill="#c4fff1" opacity=".9"/><path d="M12 7.8l-4.6 8.4-4-1.2V6.6z" fill="#7cf2d8" opacity=".55"/></svg>',
  // Rank points: a star over a chevron.
  rp: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 17.2l8-3.2 8 3.2v3.6l-8-3.2-8 3.2z" fill="#ff9f1f" stroke="#5a3200" stroke-width="1.2" stroke-linejoin="round"/><path d="M12 1.8l2.3 4.5 5 .7-3.6 3.5.9 4.9L12 13l-4.6 2.4.9-4.9L4.7 7l5-.7z" fill="#ffd84a" stroke="#5a3200" stroke-width="1.2" stroke-linejoin="round"/></svg>',
  helmet: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#ffd23f" stroke="#5a4300" stroke-width="1.2" d="M3 15c0-5.5 3.8-10 9.5-10S21 9 21 14v2h-6.5l-1.5 2H5c-1.2 0-2-1.3-2-3z"/><path fill="#1d1d1d" d="M14 12h7v3h-7z" opacity=".8"/><path fill="#fff" opacity=".4" d="M7 8c1.5-1.3 3.2-1.8 5-1.8-2.2.6-3.8 1.8-4.6 3.6z"/></svg>',
  vest: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#ffd23f" stroke="#5a4300" stroke-width="1.2" d="M8 3l2 3h4l2-3 3 2v15H5V5z"/><path stroke="#5a4300" stroke-width="1" fill="none" d="M7 11h10M7 15h10M12 6v14"/></svg>',
  wall: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#9fe6ff" stroke="#0b5a8a" stroke-width="1.1" d="M3 20l2-9 3 3 2-8 3 6 2-5 3 7 3-2 1 8z"/><path fill="#fff" opacity=".6" d="M10 6l1 7-2-1zM15 7l1 6-1.6-1z"/></svg>',
  frag: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><ellipse cx="11" cy="14" rx="6.5" ry="7" fill="#4f6b36" stroke="#1f2d14" stroke-width="1.2"/><path d="M5 12h12M5 16h12M11 7v14" stroke="#1f2d14" stroke-width=".9"/><rect x="9" y="4" width="4" height="3" fill="#c9b36a" stroke="#4a3d10"/><path d="M13 5l5 3" stroke="#c9b36a" stroke-width="1.6"/><circle cx="17.5" cy="4.5" r="2" fill="none" stroke="#c9b36a" stroke-width="1.2"/></svg>',
  medkit: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="14" rx="2" fill="#f4f4f4" stroke="#7a1c1c" stroke-width="1.2"/><path d="M9 6V4h6v2" fill="none" stroke="#7a1c1c" stroke-width="1.2"/><path fill="#e63b3b" d="M10.5 9h3v3h3v3h-3v3h-3v-3h-3v-3h3z"/></svg>',
  dash: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#fff" d="M3 12l7-6v4h11v4H10v4z"/><path stroke="#fff" stroke-width="1.6" d="M14 7h5M16 17h5" opacity=".6"/></svg>',
  emote: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.5" fill="#ffcf3d" stroke="#7a5300" stroke-width="1.3"/><circle cx="8.8" cy="10" r="1.4" fill="#3a2600"/><circle cx="15.2" cy="10" r="1.4" fill="#3a2600"/><path d="M7.5 13.5c1.4 3.4 7.6 3.4 9 0z" fill="#7a2e00"/></svg>',
  fist: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 40"><path fill="#f2f2f2" stroke="#333" stroke-width="2" d="M14 10h26c4 0 6 3 6 6v2h4c3 0 5 2 5 5v5c0 5-4 8-9 8H22c-6 0-10-4-10-10V14c0-2 1-4 2-4z"/><path d="M24 10v12M32 10v12M40 12v10" stroke="#333" stroke-width="2"/></svg>',
  skull: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#fff" d="M12 2C7 2 3.5 5.6 3.5 10.2c0 2.7 1.2 4.6 3 5.8V20h3v-2h1v2h3v-2h1v2h3v-4c1.8-1.2 3-3.1 3-5.8C20.5 5.6 17 2 12 2z"/><circle cx="8.6" cy="11" r="2.1" fill="#222"/><circle cx="15.4" cy="11" r="2.1" fill="#222"/><path d="M12 13.5l-1.2 2h2.4z" fill="#222"/></svg>',
  head: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="#ff4d4d" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="#ff4d4d"/><path d="M12 1v5M12 18v5M1 12h5M18 12h5" stroke="#ff4d4d" stroke-width="2"/></svg>',
  shield: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 2l8 3v6c0 5.2-3.4 9.4-8 11-4.6-1.6-8-5.8-8-11V5z" fill="currentColor"/></svg>',
  bolt: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#fff" d="M13 2L4 14h6l-1 8 9-12h-6z"/></svg>',
  // Leave the match: an open door with an arrow out.
  exit: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M13 3.5H5.5v17H13" fill="none" stroke="#fff" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/><path d="M10 12h10.5M16.5 7.8l4.2 4.2-4.2 4.2" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  eye: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#fff" d="M12 5C6 5 2 12 2 12s4 7 10 7 10-7 10-7-4-7-10-7z"/><circle cx="12" cy="12" r="4" fill="#2a7fff"/><circle cx="12" cy="12" r="1.8" fill="#111"/></svg>',
  map: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round" d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z M9 4v14 M15 6v14"/></svg>',
  gear: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M19.4 13a7.5 7.5 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.4 7.4 0 0 0-1.7-1L15 3.5h-4l-.4 2.5a7.4 7.4 0 0 0-1.7 1l-2.4-1-2 3.4L6.6 11a7.5 7.5 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.4 7.4 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7.4 7.4 0 0 0 1.7-1l2.4 1 2-3.4zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z"/></svg>',
}
