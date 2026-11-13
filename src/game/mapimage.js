// The map picture used by the minimap and the big map: the real island,
// rendered once from straight above with an orthographic camera (north up),
// then dressed with a grid (A-H, 1-8) and district names.
import { OrthographicCamera, Vector3 } from 'three'
import { FONT_FAMILY } from '../config.js'

export function renderMapImage(renderer, scene, lighting, bounds, landmarks = [], size = 1024) {
  const span = bounds.maxX - bounds.minX
  const cx = (bounds.minX + bounds.maxX) / 2
  const cz = (bounds.minZ + bounds.maxZ) / 2
  const cam = new OrthographicCamera(-span / 2, span / 2, span / 2, -span / 2, 1, 600)
  cam.position.set(cx, 300, cz)
  cam.up.set(0, 0, -1) // north (-Z) at the top of the image
  cam.lookAt(cx, 0, cz)
  cam.updateProjectionMatrix()

  const fog = scene.fog
  scene.fog = null
  const sun = lighting.sun
  const sc = sun.shadow.camera
  const saved = { l: sc.left, r: sc.right, t: sc.top, b: sc.bottom, far: sc.far }
  lighting.update(0, new Vector3(cx, 0, cz))
  Object.assign(sc, { left: -span / 2, right: span / 2, top: span / 2, bottom: -span / 2, far: 400 })
  sc.updateProjectionMatrix()

  const dpr = renderer.getPixelRatio()
  const cssSize = Math.max(64, Math.min(window.innerWidth, window.innerHeight))
  renderer.setViewport(0, 0, cssSize, cssSize)
  renderer.setScissor(0, 0, cssSize, cssSize)
  renderer.setScissorTest(true)
  renderer.render(scene, cam)
  const out = document.createElement('canvas')
  out.width = out.height = size
  const g = out.getContext('2d')
  const src = renderer.domElement
  const px = Math.floor(cssSize * dpr)
  g.drawImage(src, 0, src.height - px, px, px, 0, 0, size, size)
  renderer.setScissorTest(false)
  renderer.setViewport(0, 0, window.innerWidth, window.innerHeight)

  scene.fog = fog
  Object.assign(sc, { left: saved.l, right: saved.r, top: saved.t, bottom: saved.b, far: saved.far })
  sc.updateProjectionMatrix()

  // Grid + labels on a copy (the minimap uses the clean one).
  const labelled = document.createElement('canvas')
  labelled.width = labelled.height = size
  const l = labelled.getContext('2d')
  l.drawImage(out, 0, 0)
  // Sea tint toward the edges reads as "map".
  l.strokeStyle = 'rgba(255,255,255,0.18)'
  l.lineWidth = 1.5
  const cells = 8
  for (let i = 1; i < cells; i++) {
    const p = (i / cells) * size
    l.beginPath()
    l.moveTo(p, 0)
    l.lineTo(p, size)
    l.moveTo(0, p)
    l.lineTo(size, p)
    l.stroke()
  }
  l.font = `600 ${Math.round(size / 40)}px ${FONT_FAMILY}, Arial`
  l.fillStyle = 'rgba(255,255,255,0.75)'
  l.textAlign = 'center'
  l.textBaseline = 'top'
  for (let i = 0; i < cells; i++) {
    l.fillText('ABCDEFGH'[i], ((i + 0.5) / cells) * size, 6)
    l.textAlign = 'left'
    l.fillText(String(i + 1), 8, ((i + 0.5) / cells) * size - size / 80)
    l.textAlign = 'center'
  }
  l.font = `700 ${Math.round(size / 46)}px ${FONT_FAMILY}, Arial`
  l.textBaseline = 'middle'
  for (const m of landmarks) {
    const x = ((m.x - bounds.minX) / span) * size
    const y = ((m.z - bounds.minZ) / span) * size
    l.lineWidth = 5
    l.strokeStyle = 'rgba(0,0,0,0.7)'
    l.strokeText(m.name, x, y)
    l.fillStyle = '#ffffff'
    l.fillText(m.name, x, y)
  }
  return { clean: out, labelled, bounds, span, size }
}
