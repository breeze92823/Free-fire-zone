// Every shared island material, built once. Textured materials use metre UVs
// (geom.js), so texture.repeat = 1 / tile size in metres. Most have
// vertexColors on: one texture (stucco, shingles, sheet metal, boards) is
// tinted per building by vertex colour, which keeps the material count, and
// so the draw calls, low after batching.
import { AdditiveBlending, CanvasTexture, Color, DoubleSide, MeshBasicMaterial, MeshStandardMaterial, SRGBColorSpace, Vector2 } from 'three'
import { paintCrate, paintPavement, paintRock, paintTiles, paintWaterNormal, toTexture } from '../textures.js'
import { fontReady } from '../propkit.js'
import * as P from './paint.js'

function tex(canvas, tile, srgb = true) {
  const t = toTexture(canvas, { repeat: 1, srgb, anisotropy: 8 })
  t.repeat.set(1 / tile, 1 / tile)
  return t
}

function mk(name, o = {}, extra = {}) {
  const m = new MeshStandardMaterial({ roughness: 0.85, metalness: 0, ...o })
  m.name = name
  Object.assign(m.userData, extra)
  return m
}

// Textured + tinted: { color, normal } painter result -> material.
function textured(name, painted, tile, { vc = true, normal = 0.6, rough = 0.85, metal = 0, rotate = 0, extra = {} } = {}) {
  const map = tex(painted.color ?? painted, tile)
  if (rotate) map.rotation = rotate
  const o = { map, vertexColors: vc, roughness: rough, metalness: metal }
  if (painted.normal && normal > 0) {
    o.normalMap = tex(painted.normal, tile, false)
    if (rotate) o.normalMap.rotation = rotate
    o.normalScale = new Vector2(normal, normal)
  }
  return mk(name, o, extra)
}

// The shared set (live binding: valid after initMaterials()).
export let M = null

export function initMaterials() {
  M = {}
  const stucco = P.paintStucco()
  const boards = P.paintBoards(256, 6, 818)
  const fine = P.paintBoards(256, 4, 819, '#e6d6c2', 1)
  const floor = P.paintBoards(256, 8, 820, '#d9b98f', 1.5)
  const corr = P.paintCorrugated()
  const straw = P.paintStraw(256, 1313, false)
  const thatch = P.paintStraw(256, 1314, true)

  M.stucco = textured('stucco', stucco, 2.4, { normal: 0.35, rough: 0.92 })
  // Interior finishes get a warm emissive lift (fake bounce light) so rooms
  // out of the sun do not go blue-grey under the sky ambient.
  M.plaster = textured('plaster', stucco, 2.4, { normal: 0.3, rough: 0.95 })
  M.plaster.emissive.set('#4a3d2c')
  M.plaster.envMapIntensity = 0.35
  M.stone = textured('stone', P.paintStoneWall(256), 2.6, { normal: 0.9, rough: 0.95 })
  M.brick = textured('brick', P.paintBrick(), 1.4, { normal: 0.7, rough: 0.92 })
  M.siding = textured('siding', boards, 2.4, { normal: 0.6, rough: 0.85 })
  M.boardsV = textured('boardsV', boards, 2.4, { normal: 0.6, rough: 0.85, rotate: Math.PI / 2 })
  M.wood = textured('wood', fine, 1.0, { normal: 0.4, rough: 0.7 })
  M.floorWood = textured('floorWood', floor, 2.0, { normal: 0.4, rough: 0.6 })
  M.tiles = textured('tiles', paintTiles(256, 4), 2.4, { normal: 0.5, rough: 0.5 })
  for (const m of [M.floorWood, M.tiles]) {
    m.emissive.set('#33291b')
    m.envMapIntensity = 0.45
  }
  M.checker = textured('checker', P.paintCheckerTiles(), 1.6, { normal: 0, rough: 0.45 })
  M.concrete = textured('concrete', P.paintConcrete(256, 2), 4, { normal: 0.35, rough: 0.92 })
  M.asphalt = textured('asphalt', P.paintAsphalt(256), 6, { vc: false, normal: 0.5, rough: 0.92, extra: { noShadow: true } })
  M.sidewalk = textured('sidewalk', paintPavement({ base: '#cfccc5', alt: '#b9b6af', joint: '#8a8781' }, 256, 4, 505), 3, { vc: false, normal: 0.5, rough: 0.9, extra: { noShadow: true } })
  M.cobble = textured('cobble', P.paintCobble(256, 8), 2.4, { vc: false, normal: 0.9, rough: 0.9, extra: { noShadow: true } })
  M.shingle = textured('shingle', P.paintShingles(256), 2.2, { normal: 0.8, rough: 0.9 })
  M.metal = textured('metal', corr, 1.6, { normal: 0.7, rough: 0.5, metal: 0.35 })
  M.metalH = textured('metalH', corr, 1.6, { normal: 0.7, rough: 0.5, metal: 0.35, rotate: Math.PI / 2 })
  M.plate = textured('plate', P.paintTreadPlate(), 0.8, { normal: 0.6, rough: 0.45, metal: 0.55 })
  M.hay = textured('hay', straw, 1.2, { normal: 0, rough: 1 })
  M.thatch = textured('thatch', thatch, 1.6, { normal: 0, rough: 1 })
  M.soil = textured('soil', P.paintSoil(256, 99, 6), 2.2, { normal: 0.9, rough: 1 })
  M.hedge = textured('hedge', P.paintLeaves(), 1.3, { normal: 0.9, rough: 0.9 })
  M.rockTex = textured('rockTex', paintRock(256), 3, { normal: 0.9, rough: 0.95 })

  const chain = toTexture(P.paintChainLink(), { srgb: true })
  chain.repeat.set(1 / 0.6, 1 / 0.6)
  M.chain = mk('chain', { map: chain, alphaTest: 0.45, side: DoubleSide, roughness: 0.4, metalness: 0.5 }, { noShadow: true })
  M.crate = mk('crate', { map: toTexture(paintCrate(256).color, { srgb: true }), roughness: 0.85 })
  M.books = mk('books', { map: toTexture(P.paintBooks(), { srgb: true }), roughness: 0.8 })
  M.helipad = mk('helipad', { map: toTexture(P.paintHelipad(), { srgb: true }), roughness: 0.9 }, { noShadow: true })

  const stripe = (name, a, b) => {
    const t = toTexture(P.paintStripes(a, b, 2), { srgb: true })
    t.repeat.set(1 / 1.2, 1 / 1.2)
    return mk(name, { map: t, roughness: 0.9, side: DoubleSide })
  }
  M.awningRed = stripe('awningRed', '#e2403a', '#fff8ee')
  M.awningBlue = stripe('awningBlue', '#2f7fd8', '#fff8ee')
  M.awningTeal = stripe('awningTeal', '#22b3a3', '#fff8ee')
  M.awningYellow = stripe('awningYellow', '#f5b83a', '#fff8ee')

  // Plain (vertex-coloured) families.
  M.paint = mk('paint', { vertexColors: true, roughness: 0.6 })
  M.gloss = mk('gloss', { vertexColors: true, roughness: 0.28, metalness: 0.25 })
  M.chrome = mk('chrome', { vertexColors: true, roughness: 0.3, metalness: 0.85 })
  M.cloth = mk('cloth', { vertexColors: true, roughness: 0.95 })
  M.leaf = mk('leaf', { vertexColors: true, roughness: 0.8, flatShading: true })
  M.rock = mk('rock', { vertexColors: true, roughness: 0.95, flatShading: true })
  M.rubber = mk('rubber', { color: '#1c1d20', roughness: 0.9 })
  M.dark = mk('dark', { vertexColors: true, roughness: 0.4, metalness: 0.2 }) // screens, tinted car glass
  M.marking = mk('marking', { vertexColors: true, roughness: 0.75, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }, { noShadow: true })
  M.decal = mk('decal', { vertexColors: true, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }, { noShadow: true })

  // Aliases: near-identical looks share one batched bucket (fewer draw calls).
  // A Batch swaps them for their alias, using aliasTint when no tint is given.
  M.rubber.userData.alias = M.paint
  M.rubber.userData.aliasTint = 0x1c1d20
  M.cloth.userData.alias = M.paint
  M.dark.userData.alias = M.gloss
  M.decal.userData.alias = M.marking
  // Small, flat or interior-only materials don't cast shadows (shadow-pass draw calls).
  for (const m of [M.plaster, M.tiles, M.checker, M.floorWood, M.books, M.leaf, M.soil, M.chrome, M.thatch, M.plate]) m.userData.noShadow = true

  M.glass = mk('glass', { color: '#9fd3f2', roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.38, depthWrite: false, envMapIntensity: 1.6 }, { noShadow: true, renderOrder: 2 })
  M.bulb = mk('bulb', { color: '#fff3d6', emissive: '#ffcf7a', emissiveIntensity: 0.3, roughness: 0.4 }, { noShadow: true })
  M.lightRed = mk('lightRed', { color: '#ff3b30', emissive: '#ff2a1a', emissiveIntensity: 2.5 }, { noShadow: true })
  M.lightGreen = mk('lightGreen', { color: '#4dff7a', emissive: '#2aff5a', emissiveIntensity: 1.6 }, { noShadow: true })
  M.lightAmber = mk('lightAmber', { color: '#ffd04a', emissive: '#ffb020', emissiveIntensity: 1.6 }, { noShadow: true })

  // Water (fountain, pool, troughs): one material, ripples scrolled in update().
  const ripple = toTexture(paintWaterNormal(256), { repeat: 1 })
  ripple.repeat.set(1 / 2.5, 1 / 2.5)
  M.water = mk('water', { color: '#36b9ec', roughness: 0.06, metalness: 0.1, normalMap: ripple, normalScale: new Vector2(0.6, 0.6), transparent: true, opacity: 0.82, emissive: '#0b4a66', emissiveIntensity: 0.35 }, { noShadow: true, renderOrder: 1 })
  M.water.userData.ripple = ripple
  M.spray = new MeshBasicMaterial({ color: '#e9fbff', transparent: true, opacity: 0.7, depthWrite: false })
  M.spray.name = 'spray'
  M.sprayCone = new MeshBasicMaterial({ color: '#d8f6ff', transparent: true, opacity: 0.32, depthWrite: false, side: DoubleSide, blending: AdditiveBlending })
  M.sprayCone.name = 'sprayCone'

  // Flags: vertex-coloured cloth that waves (uv.x = 0 at the pole, 1 at the fly end).
  M.flag = mk('flag', { vertexColors: true, roughness: 0.9, side: DoubleSide })
  const flagTime = { value: 0 }
  M.flag.userData.time = flagTime
  M.flag.onBeforeCompile = (s) => {
    s.uniforms.uTime = flagTime
    s.vertexShader = 'uniform float uTime;\n' + s.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       float fk = uv.x;
       float fw = sin(uTime * 6.0 - uv.x * 7.0 + position.x * 0.13 + position.z * 0.11);
       transformed += normal * fw * fk * 0.22;
       transformed.y -= fk * fk * 0.08;`,
    )
  }
  M.flag.customProgramCacheKey = () => 'islandFlag'

  // Signs: one material per text (each its own texture).
  const cache = new Map()
  M.sign = (text, opts = {}) => {
    const key = 'sign:' + text + JSON.stringify(opts)
    if (cache.has(key)) return cache.get(key)
    const s = P.paintSign(text, opts)
    const t = new CanvasTexture(s.canvas)
    t.colorSpace = SRGBColorSpace
    t.anisotropy = 8
    fontReady.then(() => {
      s.draw()
      t.needsUpdate = true
    })
    const m = mk(`sign:${text}`, { map: t, roughness: 0.6, emissive: opts.glow ? '#ffffff' : '#000000', emissiveMap: opts.glow ? t : null, emissiveIntensity: opts.glow ? 0.35 : 0 })
    cache.set(key, m)
    return m
  }
  M.poster = (kind) => {
    const key = 'poster:' + kind
    if (cache.has(key)) return cache.get(key)
    const s = P.paintPoster(kind)
    const t = new CanvasTexture(s.canvas)
    t.colorSpace = SRGBColorSpace
    t.anisotropy = 8
    fontReady.then(() => {
      s.draw()
      t.needsUpdate = true
    })
    const m = mk(key, { map: t, roughness: 0.55, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0.12 }, { noShadow: true })
    cache.set(key, m)
    return m
  }
  M.rug = (a, b, c) => {
    const key = 'rug:' + a + b + c
    if (!cache.has(key)) cache.set(key, mk('rug', { map: toTexture(P.paintRug(a, b, c), { srgb: true }), roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }, { noShadow: true }))
    return cache.get(key)
  }

  return M
}

export const TINT = {
  white: 0xffffff,
  cream: 0xf6ead0,
  mint: 0xb9ecc9,
  sky: 0xbfe0f6,
  peach: 0xf9cfae,
  pink: 0xf6c2cf,
  lemon: 0xf6eaa0,
  sand: 0xe9d6ae,
  terracotta: 0xd0623f,
  slate: 0x56606c,
  darkSlate: 0x3f4752,
  red: 0xc0392b,
  barn: 0xb8352a,
  trim: 0xfaf8f2,
  frame: 0x2c3138,
  wood: 0xb07a4a,
  darkWood: 0x6e4528,
  lightWood: 0xd8b68a,
  steel: 0x9aa3ad,
  yellow: 0xf2c230,
}

export const color = (hex) => new Color(hex)
