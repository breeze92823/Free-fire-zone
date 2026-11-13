// Everything between the districts: forest clumps, single trees, bushes,
// rocks (and boulders along the NE cliffs and the north shore), flower
// patches, grass tufts, fallen logs, plus low stone walls, hedges, hay and
// crate stacks so the open fields always have cover. Spawn circles stay clear.
import { Batch } from './geom.js'
import { M } from './materials.js'
import { beachW, cliffMask, isFree, occupy, occupyCircle, polar, shoreR } from './layout.js'
import { crate, hedge, stoneWall } from './kit.js'
import { mulberry32 } from '../textures.js'

// Metres inland of the beach (grass) at (x, z); negative = on sand / in the sea.
function grassDepth(x, z) {
  const { r, a } = polar(x, z)
  return shoreR(a) - beachW(a) - r
}

function hayBale(B, x, y, z, yaw = 0, round = false) {
  if (round) {
    B.cyl(M.hay, 0.75, 0.75, 1.3, x, y + 0.75, z, { rz: Math.PI / 2, ry: yaw, seg: 14, tint: 0xffffff })
    B.push(x, y, z, yaw)
    B.solid(0.65, 0.72, 0.72, 0, 0.72, 0)
    B.pop()
  } else {
    B.push(x, y, z, yaw)
    B.span(M.hay, -0.6, 0, -0.4, 0.6, 0.55, 0.4, { tint: 0xffffff, solid: true })
    B.span(M.paint, -0.61, 0.0, -0.18, 0.61, 0.56, -0.15, { tint: 0x8a6a3a })
    B.span(M.paint, -0.61, 0.0, 0.15, 0.61, 0.56, 0.18, { tint: 0x8a6a3a })
    B.pop()
  }
}
export { hayBale }

export function scatter(ctx) {
  const { nature: N, ground, q } = ctx
  const rand = mulberry32(777)
  const B = new Batch('fields')

  // --- cover in the open fields -------------------------------------------------------
  const walls = [
    // blue fields (SW): an arc of cover just outside the spawn circle
    ['wall', -50, 56, -42, 62], ['hedge', -88, 58, -86, 68], ['wall', -58, 90, -50, 94], ['hay', -84, 84], ['crates', -46, 80],
    // orange fields (NE): same idea
    ['wall', 48, -50, 56, -46], ['hedge', 86, -84, 92, -78], ['hay', 62, -94], ['crates', 90, -60],
    // south-east meadow
    ['wall', 28, 68, 40, 66], ['hedge', 46, 88, 46, 98], ['hay', 70, 60], ['wall', 22, 92, 30, 98], ['crates', 84, 50],
    // north-west slope + west meadow
    ['wall', -30, -58, -22, -66], ['hedge', -70, -40, -60, -38], ['crates', -58, -18], ['wall', -66, -8, -66, 2],
    // north between relay and the ring
    ['hedge', -26, -64, -16, -64], ['hay', 22, -54],
    // east between Maple Row and the ring / beach
    ['wall', 60, 48, 70, 50], ['hedge', 24, 58, 18, 66],
  ]
  for (const [kind, x0, z0, x1, z1] of walls) {
    if (kind === 'wall') {
      const y = Math.min(ground(x0, z0), ground(x1, z1))
      stoneWall(B, x0, z0, x1, z1, 1.1, y)
      occupy(Math.min(x0, x1) - 1, Math.min(z0, z1) - 1, Math.max(x0, x1) + 1, Math.max(z0, z1) + 1)
    } else if (kind === 'hedge') {
      const y = Math.min(ground(x0, z0), ground(x1, z1))
      hedge(B, x0, z0, x1, z1, 1.4, y)
      occupy(Math.min(x0, x1) - 1, Math.min(z0, z1) - 1, Math.max(x0, x1) + 1, Math.max(z0, z1) + 1)
    } else if (kind === 'hay') {
      const y = ground(x0, z0)
      hayBale(B, x0, y, z0, 0.3, true)
      hayBale(B, x0 + 1.8, ground(x0 + 1.8, z0 + 0.4), z0 + 0.4, 1.2, true)
      hayBale(B, x0 + 0.9, y, z0 - 1.5, 0.2, false)
      hayBale(B, x0 + 0.9, y + 0.55, z0 - 1.5, 0.25, false)
      occupyCircle(x0 + 0.9, z0 - 0.4, 3)
      ctx.loot({ x: x0 + 0.9, y: ground(x0 + 0.9, z0 + 2.8), z: z0 + 2.8 })
    } else if (kind === 'crates') {
      const y = ground(x0, z0)
      crate(B, x0, y, z0, 1.1, 0.2)
      crate(B, x0 + 1.2, y, z0 + 0.1, 1.1, -0.1)
      crate(B, x0 + 0.6, y + 1.1, z0, 1.0, 0.4)
      crate(B, x0 - 0.2, y, z0 + 1.3, 0.9, 0.7)
      occupyCircle(x0 + 0.5, z0 + 0.5, 3)
    }
  }
  B.build(ctx.root, true)

  const ok = (x, z, r, extra = {}) => isFree(x, z, r, { spawns: true, ...extra }) && grassDepth(x, z) > 1.5

  // --- trees ---------------------------------------------------------------------------
  const clumps = [
    [-82, -80, 22, 26], [-100, -60, 12, 10], [-62, -100, 10, 8], [-30, -86, 6, 3],
    [56, 72, 16, 12], [80, 76, 10, 6], [-34, 86, 14, 10], [-96, 74, 10, 5],
    [104, -46, 10, 7], [96, 40, 8, 4], [-30, 52, 6, 4], [30, -46, 6, 3], [-44, -40, 8, 5], [40, 44, 6, 3],
  ]
  for (const [cx, cz, r, n] of clumps) {
    let placed = 0
    for (let k = 0; k < n * 6 && placed < n; k++) {
      const a = rand() * Math.PI * 2
      const d = Math.sqrt(rand()) * r
      const x = cx + Math.cos(a) * d
      const z = cz + Math.sin(a) * d
      if (!ok(x, z, 2.2) || cliffMask(Math.atan2(z, x)) * 0 > 0) continue
      N.tree(x, z, { s: 0.85 + rand() * 0.5 })
      occupyCircle(x, z, 2.2)
      placed++
      if (rand() < 0.5 && ok(x + 2, z + 1, 1)) N.bush(x + 2, z + 1, 0.6 + rand() * 0.4, rand() < 0.4 ? null : false)
    }
  }
  // singles across the island
  for (let k = 0, placed = 0; k < 600 && placed < 55; k++) {
    const x = (rand() - 0.5) * 240
    const z = (rand() - 0.5) * 240
    if (!ok(x, z, 4)) continue
    if (rand() < 0.08) N.cherry(x, z, 0.9 + rand() * 0.3)
    else N.tree(x, z, { s: 0.8 + rand() * 0.55 })
    occupyCircle(x, z, 2.5)
    placed++
  }
  // fallen logs in the woods
  for (const [x, z, yaw] of [[-78, -74, 0.4], [-90, -86, 1.9], [60, 78, 2.6], [-30, 90, 0.9], [-98, -58, 2.2], [100, -40, 1.2]]) {
    if (isFree(x, z, 2, { spawns: true })) {
      N.log(x, z, yaw)
      occupyCircle(x, z, 2.2)
    }
  }

  // --- bushes ----------------------------------------------------------------------------
  for (let k = 0, placed = 0; k < 900 && placed < 120; k++) {
    const x = (rand() - 0.5) * 240
    const z = (rand() - 0.5) * 240
    if (!ok(x, z, 1.2)) continue
    N.bush(x, z, 0.55 + rand() * 0.6, rand() < 0.55 ? null : false)
    occupyCircle(x, z, 1.2)
    placed++
  }

  // --- rocks -------------------------------------------------------------------------------
  for (let k = 0, placed = 0; k < 500 && placed < 45; k++) {
    const x = (rand() - 0.5) * 250
    const z = (rand() - 0.5) * 250
    if (!isFree(x, z, 1.5, { spawns: true }) || grassDepth(x, z) < -6) continue
    const s = 0.4 + rand() * rand() * 1.4
    N.rock(x, z, s)
    occupyCircle(x, z, s + 0.8)
    placed++
    if (rand() < 0.5) N.rock(x + s + 0.4, z + 0.3, s * 0.45)
  }
  // NE cliff boulders: along the face and at its foot
  for (let k = 0; k < 140; k++) {
    const a = (-62 + rand() * 42) * (Math.PI / 180)
    const cm = cliffMask(a)
    if (cm < 0.3) continue
    const R = shoreR(a)
    const d = rand() < 0.7 ? 2.5 + rand() * 4 : -1 - rand() * 3
    const x = Math.cos(a) * (R - d)
    const z = Math.sin(a) * (R - d)
    N.rock(x, z, (1.3 + rand() * 2.0) * (0.6 + cm * 0.4), ground(x, z))
  }
  // a few boulders where the north shore meets the beach
  for (let k = 0; k < 18; k++) {
    const a = (-150 + rand() * 90) * (Math.PI / 180)
    const R = shoreR(a)
    const x = Math.cos(a) * (R + 1 - rand() * 4)
    const z = Math.sin(a) * (R + 1 - rand() * 4)
    if (x < -112 && z > -48 && z < 20) continue // dock
    N.rock(x, z, 0.6 + rand() * 1.1)
  }

  // --- flowers + grass -------------------------------------------------------------------------
  const nf = Math.round(240 * q * q)
  for (let k = 0, placed = 0; k < nf * 6 && placed < nf; k++) {
    const x = (rand() - 0.5) * 240
    const z = (rand() - 0.5) * 240
    if (!isFree(x, z, 0.6) || grassDepth(x, z) < 1) continue
    N.flower(x, z)
    placed++
  }
  const nt = Math.round(2600 * q * q)
  for (let k = 0, placed = 0; k < nt * 4 && placed < nt; k++) {
    const x = (rand() - 0.5) * 246
    const z = (rand() - 0.5) * 246
    if (!isFree(x, z, 0.3) || grassDepth(x, z) < 0.5) continue
    N.tuft(x, z, 0.8 + rand() * 0.7)
    placed++
  }
}
