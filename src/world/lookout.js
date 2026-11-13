// Lookout (north-west hill): a timber watchtower on the summit. Four braced
// legs carry a railed platform 6 m up under a shingled pyramid roof with a
// flag; two flights of steps with a landing climb the south and east sides.
// Around it: a picnic table, benches, a fire ring, a coin viewer and a sign.
import { IcosahedronGeometry } from 'three'
import { Batch } from './geom.js'
import { M, TINT } from './materials.js'
import { DISTRICTS, occupyCircle } from './layout.js'
import { bench, flag, pyramidRoof, railing, sign, slab, stairs, table } from './kit.js'

const WOOD = 0x8a6040
const DARK = 0x6a4a30

export function build(ctx) {
  const { x: cx, z: cz } = DISTRICTS.lookout
  const g = ctx.ground
  const gy = g(cx, cz)
  const B = new Batch('lookout')
  const P = gy + 6 // platform level
  const L1 = gy + 3 // mid landing
  const S = 2.5 // leg offset
  B.push(cx, 0, cz, 0)
  const lg = (x, z) => g(cx + x, cz + z)

  // legs + X bracing
  for (const [x, z] of [[-S, -S], [S, -S], [-S, S], [S, S]]) {
    const y0 = lg(x, z) - 0.4
    B.span(M.wood, x - 0.2, y0, z - 0.2, x + 0.2, P + 2.7, z + 0.2, { tint: WOOD, solid: true })
    B.span(M.concrete, x - 0.4, y0, z - 0.4, x + 0.4, lg(x, z) + 0.25, z + 0.4, { tint: 0xbdbdbd })
  }
  const brace = (ax, az, bx, bz, ya, yb) => {
    const L = Math.hypot(bx - ax, yb - ya, bz - az)
    const yaw = Math.atan2(-(bz - az), bx - ax)
    const pitch = Math.atan2(yb - ya, Math.hypot(bx - ax, bz - az))
    B.box(M.wood, L, 0.14, 0.12, (ax + bx) / 2, (ya + yb) / 2, (az + bz) / 2, { ry: yaw, rz: pitch, tint: DARK })
  }
  for (const [ax, az, bx, bz] of [[-S, -S, S, -S], [S, -S, S, S], [S, S, -S, S], [-S, S, -S, -S]]) {
    brace(ax, az, bx, bz, gy + 0.4, gy + 2.9)
    brace(bx, bz, ax, az, gy + 0.4, gy + 2.9)
    brace(ax, az, bx, bz, gy + 3.1, P - 0.3)
    brace(bx, bz, ax, az, gy + 3.1, P - 0.3)
    brace(ax, az, bx, bz, gy + 3.0, gy + 3.0)
  }

  // platform + east landing extension
  slab(B, -S - 0.3, -S - 0.3, S + 0.3, S + 0.3, P, 0.22, [], { mat: M.floorWood, tint: 0xc9a06a, under: { mat: M.wood, tint: DARK } })
  slab(B, S + 0.3, -S - 0.3, 4.4, -0.95, P, 0.22, [], { mat: M.floorWood, tint: 0xc9a06a, under: { mat: M.wood, tint: DARK } })
  B.span(M.wood, 4.2, lg(4.3, -1.8) - 0.3, -1.95, 4.4, P - 0.22, -1.75, { tint: WOOD, solid: true })
  const rt = { mat: M.wood, tint: WOOD, h: 1.05, spacing: 1.0, style: 'bars' }
  railing(B, -S - 0.25, -S - 0.25, 4.35, -S - 0.25, P, rt)
  railing(B, -S - 0.25, -S - 0.25, -S - 0.25, S + 0.25, P, rt)
  railing(B, -S - 0.25, S + 0.25, S + 0.25, S + 0.25, P, rt)
  railing(B, S + 0.25, S + 0.25, S + 0.25, -0.95, P, rt)
  railing(B, 4.35, -S - 0.25, 4.35, -1.0, P, rt)
  // roof on corner posts + flag
  for (const [x, z] of [[-S, -S], [S, -S], [-S, S], [S, S]]) B.span(M.wood, x - 0.12, P, z - 0.12, x + 0.12, P + 2.7, z + 0.12, { tint: WOOD })
  B.span(M.wood, -S - 0.2, P + 2.6, -S - 0.2, S + 0.2, P + 2.8, S + 0.2, { tint: DARK })
  pyramidRoof(B, M.shingle, 0, P + 2.8, 0, 3.4, 3.4, 1.8, TINT.terracotta)
  B.cyl(M.chrome, 0.04, 0.05, 2.6, 0, P + 4.5 + 1.3, 0, { tint: 0xdddddd, seg: 6 })
  flag(B, 0, P + 6.4, 0, [0x2fae5a, 0xffffff], 1.5, 0.95)
  // coin viewer on the platform
  B.cyl(M.paint, 0.06, 0.08, 1.1, -1.6, P + 0.55, -1.6, { tint: 0x2c3138, seg: 6 })
  B.box(M.gloss, 0.5, 0.3, 0.3, -1.6, P + 1.25, -1.6, { ry: 0.8, rx: 0.15, tint: 0x2f6fd0 })
  ctx.loot(B.P(0.8, P, 0.6))

  // flight 1: south side, rising east to the mid landing
  const fz = S + 1.25
  const x0 = -3.3
  const y0 = lg(x0, fz) - 0.02
  stairs(B, x0, y0, fz, Math.PI / 2, 1.4, L1 - y0, 3.3 + 2.95, { mat: M.floorWood, tint: 0xc9a06a, style: 'open', stringerMat: M.wood, stringerTint: DARK, rails: ['left', 'right'], railTint: WOOD })
  // mid landing at the south-east corner
  slab(B, 2.9, S + 0.45, 4.35, S + 2.0, L1, 0.2, [], { mat: M.floorWood, tint: 0xc9a06a })
  for (const [x, z] of [[4.25, S + 1.9], [3.0, S + 1.9], [4.25, S + 0.55]]) B.span(M.wood, x - 0.1, lg(x, z) - 0.3, z - 0.1, x + 0.1, L1 - 0.2, z + 0.1, { tint: WOOD, solid: true })
  railing(B, 2.95, S + 1.95, 4.3, S + 1.95, L1, rt)
  railing(B, 4.3, S + 0.5, 4.3, S + 1.95, L1, rt)
  // flight 2: east side, rising north to the platform extension
  stairs(B, 3.62, L1, S + 0.45, Math.PI, 1.4, P - L1, 3.9, { mat: M.floorWood, tint: 0xc9a06a, style: 'open', stringerMat: M.wood, stringerTint: DARK, rails: ['left', 'right'], railTint: WOOD })
  B.pop()

  // hilltop furniture
  const T = new Batch('lookoutProps')
  const place = (x, z) => ({ x: cx + x, y: g(cx + x, cz + z), z: cz + z })
  {
    const p = place(-6.5, 3)
    table(T, p.x, p.y, p.z, 0.3, 1.8, 0.8, { tint: 0xb07a4a })
    bench(T, p.x - 0.3, p.y, p.z - 0.95, 0.3, { back: false, tint: 0xb07a4a })
    bench(T, p.x + 0.3, p.y, p.z + 0.95, 0.3 + Math.PI, { back: false, tint: 0xb07a4a })
  }
  {
    const p = place(5.5, -6)
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2
      T.geo(M.rock, new IcosahedronGeometry(0.22, 0), p.x + Math.cos(a) * 0.65, p.y + 0.1, p.z + Math.sin(a) * 0.65, { tint: 0x8a8a8a })
    }
    T.box(M.wood, 1.0, 0.14, 0.14, p.x, p.y + 0.15, p.z, { ry: 0.5, tint: 0x5a3a24 })
    T.box(M.wood, 1.0, 0.14, 0.14, p.x, p.y + 0.2, p.z, { ry: -0.6, tint: 0x5a3a24 })
    for (const yaw of [0.3, 2.4]) {
      const q = place(5.5 + Math.cos(yaw) * 2.2, -6 + Math.sin(yaw) * 2.2)
      T.box(M.wood, 1.6, 0.4, 0.4, q.x, q.y + 0.2, q.z, { ry: -yaw + Math.PI / 2, tint: 0x7a5232, solid: true })
    }
  }
  {
    // trail sign at the foot of the climb
    const p = place(10, 10)
    T.span(M.wood, p.x - 0.07, p.y, p.z - 0.07, p.x + 0.07, p.y + 2.0, p.z + 0.07, { tint: 0x6e4f34 })
    sign(T, 'LOOKOUT', p.x, p.y + 1.75, p.z + 0.1, 1.6, 0.45, { bg: '#6e4f34', fg: '#fff3d0', border: '#fff3d0', w: 512, h: 144, back: true }, Math.PI / 4)
  }
  {
    const q = place(-3, -6.5)
    ctx.loot(q)
  }
  T.build(ctx.root, true)
  B.build(ctx.root, true)
  occupyCircle(cx, cz, 9)
  for (const [x, z, s] of [[-9, -6, 1.3], [8, 5, 0.9], [-4, 9, 1.0], [9, -9, 1.4], [-10, 4, 0.8]]) ctx.nature.rock(cx + x, cz + z, s)
  for (const [x, z] of [[-8, -2], [7, 8], [0, -10], [-6, 8], [10, -3]]) ctx.nature.bush(cx + x, cz + z, 0.7)
}
