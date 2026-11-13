// Relay Station (north): a concrete apron with a raised helipad (H marking,
// edge lights, a parked helicopter), a 30 m lattice radio mast with blinking
// aircraft lights inside a chain-link enclosure, a two-door control building
// (consoles, server racks) with an external stair to its roof, a fuel depot
// with bunded tanks, floodlights, a windsock and a parked service van.
import { BoxGeometry, Group, Mesh } from 'three'
import { Batch, cylGeo } from './geom.js'
import { M } from './materials.js'
import { occupy } from './layout.js'
import {
  acUnit, antenna, barrel, car, chainFence, consoleDesk, container, crate, desk, door, flatRoof, lockers, pallet, railing, room, serverRack, sign, slab, stairs, table,
  chair, win,
} from './kit.js'
import { neon } from '../propkit.js'

const AX0 = -44
const AX1 = 20
const AZ0 = -104
const AZ1 = -78
const TOP = 0.08

export function build(ctx) {
  const B = new Batch('relay')
  // --- apron + markings ---
  B.span(M.concrete, AX0, -0.3, AZ0, AX1, TOP, AZ1, { tint: 0xd2d0ca })
  B.solidSpan(AX0, -0.3, AZ0, AX1, TOP, AZ1)
  const line = (x0, z0, x1, z1) => B.span(M.marking, x0, TOP, z0, x1, TOP + 0.004, z1, { tint: 0xf2c230 })
  line(-1.2, -84, 1.2, AZ1) // road entry
  line(-10.6, -85.2, 3, -84.8)
  line(-1.2, -96, -0.8, -85.2)
  for (let x = AX0 + 1; x < AX1 - 1; x += 3) line(x, AZ1 + 0.3, x + 1.6, AZ1 + 0.42)

  // --- helipad ---
  const HX = -20
  const HZ = -92
  const HS = 8
  const HY = 0.4
  B.span(M.concrete, HX - HS, TOP, HZ - HS, HX + HS, HY, HZ + HS, { tint: 0x9a9da0, solid: true })
  const pad = new BoxGeometry(HS * 2 - 0.2, 0.02, HS * 2 - 0.2)
  B.geo(M.helipad, pad, HX, HY + 0.005, HZ)
  // steps on the east and south faces
  for (const [x0, z0, x1, z1] of [[HX + HS, HZ - 2, HX + HS + 0.5, HZ + 2], [HX - 2, HZ + HS, HX + 2, HZ + HS + 0.5]]) B.span(M.concrete, x0, TOP, z0, x1, TOP + 0.17, z1, { tint: 0xb8b8b8, solid: true })
  for (let k = 0; k < 8; k++) {
    const t = -HS + 1 + k * 2
    for (const [x, z] of [[HX + t, HZ - HS + 0.15], [HX + t, HZ + HS - 0.15], [HX - HS + 0.15, HZ + t], [HX + HS - 0.15, HZ + t]]) B.span(M.lightGreen, x - 0.1, HY, z - 0.1, x + 0.1, HY + 0.1, z + 0.1)
  }
  helicopter(B, HX + 0.5, HY, HZ - 0.3, 0.2)
  ctx.loot({ x: HX + 5.5, y: HY, z: HZ + 5.5 })
  // blinking corner beacons
  const beaconMat = M.lightAmber
  const beacons = new Batch('relayBeacons')
  for (const [x, z] of [[HX - HS, HZ - HS], [HX + HS, HZ - HS], [HX - HS, HZ + HS], [HX + HS, HZ + HS]]) beacons.cyl(beaconMat, 0.14, 0.14, 0.25, x, HY + 0.125, z, { seg: 8 })
  const beaconGroup = beacons.build(ctx.root, false)

  // windsock (animated) + floodlights
  B.cyl(M.paint, 0.07, 0.09, 5.2, -6, TOP + 2.6, -101.5, { tint: 0xd8d8d8, seg: 8, solid: true })
  const sockB = new Batch('windsock')
  for (let k = 0; k < 5; k++) {
    const r0 = 0.42 - k * 0.06
    sockB.geo(M.cloth, cylGeo(r0 - 0.06, r0, 0.5, 10, true), 0.25 + k * 0.5, 0, 0, { rz: Math.PI / 2, tint: k % 2 ? 0xffffff : 0xff6a1a })
  }
  sockB.cyl(M.chrome, 0.44, 0.44, 0.04, 0.0, 0, 0, { rz: Math.PI / 2, tint: 0xcccccc, seg: 10 })
  const sock = new Group()
  sockB.build(sock, true)
  sock.position.set(-6, TOP + 5.0, -101.5)
  ctx.root.add(sock)
  for (const [x, z, yaw] of [[-29.6, -82.6, -0.6], [-9.0, -101.2, 2.5]]) {
    B.cyl(M.paint, 0.12, 0.16, 7, x, TOP + 3.5, z, { tint: 0x5b6670, seg: 8, solid: true })
    B.push(x, TOP + 7, z, yaw)
    B.span(M.paint, -0.9, -0.05, -0.05, 0.9, 0.05, 0.05, { tint: 0x5b6670 })
    for (const lx of [-0.6, 0.6]) {
      B.box(M.paint, 0.5, 0.4, 0.3, lx, 0.15, 0.2, { rx: 0.5, tint: 0x3a3f45 })
      B.box(M.bulb, 0.42, 0.32, 0.02, lx, 0.1, 0.36, { rx: 0.5 })
    }
    B.pop()
    ctx.lamp({ x, y: TOP + 6.6, z }, 2)
  }

  // --- control building ---
  controlBuilding(B, ctx, 3, -92, 15, -84)

  // --- radio mast in its fenced compound ---
  const MX = 11
  const MZ = -99.5
  const top = mast(B, MX, TOP, MZ)
  chainFence(B, MX - 4.5, MZ - 4, MX + 4.5, MZ - 4)
  chainFence(B, MX + 4.5, MZ - 4, MX + 4.5, MZ + 4)
  chainFence(B, MX - 4.5, MZ - 4, MX - 4.5, MZ + 4)
  chainFence(B, MX - 4.5, MZ + 4, MX - 1.2, MZ + 4)
  chainFence(B, MX + 1.2, MZ + 4, MX + 4.5, MZ + 4)
  B.span(M.metal, MX + 2.0, TOP, MZ - 3.4, MX + 3.8, TOP + 1.6, MZ - 1.8, { tint: 0xb8c0c8, solid: true })
  sign(B, 'DANGER  HIGH VOLTAGE', MX, 1.4, MZ + 4.06, 1.6, 0.45, { bg: '#f2c230', fg: '#1a1a1a', border: '#1a1a1a', w: 512, h: 144, font: '700 56px Fredoka, sans-serif' })
  const red = neon('#ff2a1a', 4)
  const lights = new Group()
  for (const y of [top.y + 0.3, top.y * 0.5]) {
    const m = new Mesh(cylGeo(0.16, 0.16, 0.3, 8), red)
    m.position.set(MX, y, MZ)
    lights.add(m)
  }
  ctx.root.add(lights)

  // --- fuel depot (bunded tanks, pump, pipes) ---
  fuelDepot(B, ctx, -43, -104, -31, -87)

  // service van, site container, clutter
  car(B, -3.5, TOP, -88, Math.PI / 2, 0xf4f4f4, 'van', { stripe: 0xd8402a })
  container(B, -6.5, TOP, -97.5, Math.PI / 2, { len: 6.06, color: 0x2f7fd8, logo: 'RELAY' })
  crate(B, -2.4, TOP, -100.5, 1.0, 0.2)
  crate(B, -1.3, TOP, -100.6, 1.0, 0.0)
  crate(B, -1.9, TOP + 1.0, -100.5, 0.9, 0.5)
  pallet(B, 0.6, TOP, -102, 0, 1, 7)
  ctx.loot({ x: -3.6, y: TOP, z: -102.2 })
  for (let i = 0; i < 3; i++) barrel(B, -11.5 + i * 0.8, TOP, -82, [0x2f6db5, 0xd8402a, 0x3f8a4a][i])

  B.build(ctx.root, true)
  occupy(AX0 - 1, AZ0 - 1, AX1 + 1, AZ1)

  ctx.anim((dt, t) => {
    const on = t % 1.4 < 0.5
    lights.visible = on
    beaconGroup.visible = (t + 0.7) % 1.2 < 0.6
    sock.rotation.y = 0.6 + Math.sin(t * 0.37) * 0.45
    sock.rotation.z = -0.12 + Math.sin(t * 1.9) * 0.05
  })
}

// Low-poly helicopter, nose toward local +x.
function helicopter(B, x, y, z, yaw) {
  B.push(x, y, z, yaw)
  const c = 0xd23b3b
  // skids
  for (const s of [-1, 1]) {
    B.box(M.chrome, 4.2, 0.08, 0.1, 0.1, 0.06, s * 1.05, { tint: 0x3a3f45 })
    B.box(M.chrome, 0.08, 0.8, 0.08, -0.9, 0.42, s * 0.85, { rx: s * 0.3, tint: 0x3a3f45 })
    B.box(M.chrome, 0.08, 0.8, 0.08, 1.0, 0.42, s * 0.85, { rx: s * 0.3, tint: 0x3a3f45 })
  }
  // cabin + nose
  B.box(M.gloss, 3.0, 1.6, 1.8, 0.0, 1.6, 0, { tint: c })
  const nose = new BoxGeometry(1.4, 1.3, 1.6)
  const p = nose.attributes.position
  for (let i = 0; i < p.count; i++) {
    if (p.getX(i) > 0) {
      p.setY(i, p.getY(i) * 0.55 - 0.15)
      p.setZ(i, p.getZ(i) * 0.6)
    }
  }
  nose.computeVertexNormals()
  B.geo(M.dark, nose, 2.15, 1.5, 0, { tint: 0x203848 })
  B.span(M.dark, -0.6, 1.75, -0.91, 0.9, 2.2, 0.91, { tint: 0x203848 })
  B.span(M.gloss, -1.5, 2.4, -0.7, 0.9, 2.75, 0.7, { tint: 0xe8e8e8 })
  // tail boom + fins + tail rotor
  B.box(M.gloss, 4.6, 0.45, 0.45, -3.6, 2.0, 0, { rz: 0.06, tint: c })
  B.box(M.gloss, 0.9, 1.3, 0.08, -5.75, 2.55, 0, { rz: -0.4, tint: c })
  B.box(M.gloss, 0.8, 0.06, 1.3, -5.4, 2.05, 0, { tint: 0xe8e8e8 })
  B.cyl(M.paint, 0.08, 0.08, 0.2, -5.9, 2.4, 0.15, { rx: Math.PI / 2, tint: 0x333333, seg: 6 })
  B.box(M.paint, 0.08, 1.1, 0.04, -5.9, 2.4, 0.26, { rz: 0.4, tint: 0x222222 })
  // main rotor
  B.cyl(M.paint, 0.12, 0.16, 0.45, -0.2, 2.98, 0, { tint: 0x333333, seg: 8 })
  for (let k = 0; k < 4; k++) B.box(M.paint, 4.6, 0.04, 0.26, -0.2 + Math.cos((k * Math.PI) / 2 + 0.3) * 2.3, 3.2, Math.sin((k * Math.PI) / 2 + 0.3) * 2.3, { ry: -((k * Math.PI) / 2 + 0.3), tint: 0x2a2a2a })
  // stripe + number
  B.span(M.paint, -1.5, 1.05, -0.92, 1.5, 1.2, 0.92, { tint: 0xffffff })
  B.solid(1.6, 1.0, 1.0, 0.2, 1.4, 0)
  B.solid(2.3, 0.35, 0.3, -3.6, 2.0, 0)
  B.pop()
}

// Triangular lattice mast; returns the top point.
function mast(B, x, y, z) {
  const H = 30
  const rb = 1.7
  const rt = 0.45
  const legAt = (k, h) => {
    const r = rb + (rt - rb) * (h / H)
    const a = (k / 3) * Math.PI * 2 + Math.PI / 2
    return [x + Math.cos(a) * r, y + h, z + Math.sin(a) * r]
  }
  const bar = (p, q, w = 0.07, tint = 0xd8402a) => {
    const dx = q[0] - p[0]
    const dy = q[1] - p[1]
    const dz = q[2] - p[2]
    const L = Math.hypot(dx, dy, dz)
    const yaw = Math.atan2(-dz, dx)
    const pitch = Math.atan2(dy, Math.hypot(dx, dz))
    B.box(M.paint, L, w, w, (p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2, { ry: yaw, rz: pitch, tint })
  }
  const sec = 2.5
  for (let h = 0; h < H; h += sec) {
    const band = Math.floor(h / 5) % 2 ? 0xffffff : 0xd8402a
    for (let k = 0; k < 3; k++) {
      const a0 = legAt(k, h)
      const a1 = legAt(k, h + sec)
      const b0 = legAt((k + 1) % 3, h)
      const b1 = legAt((k + 1) % 3, h + sec)
      bar(a0, a1, 0.12, band)
      bar(a1, b1, 0.06, 0xd8d8d8)
      bar(a0, b1, 0.05, 0xd8d8d8)
      bar(b0, a1, 0.05, 0xd8d8d8)
    }
  }
  // platforms + dishes + top antennas
  for (const h of [12, 22]) {
    const r = rb + (rt - rb) * (h / H) + 0.6
    B.cyl(M.plate, r, r, 0.08, x, y + h, z, { seg: 6, tint: 0xb8bec4 })
  }
  B.cyl(M.paint, 0.55, 0.55, 0.45, x + 1.3, y + 20, z, { rz: Math.PI / 2, tint: 0xf2f2f2, seg: 14 })
  B.cyl(M.paint, 0.5, 0.5, 0.4, x - 0.7, y + 24.5, z + 1.0, { rx: Math.PI / 2, tint: 0xf2f2f2, seg: 14 })
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2
    B.box(M.paint, 0.3, 1.6, 0.12, x + Math.cos(a) * 0.75, y + H - 1.2, z + Math.sin(a) * 0.75, { ry: -a, tint: 0xeeeeee })
  }
  B.cyl(M.chrome, 0.04, 0.06, 3.5, x, y + H + 1.75, z, { tint: 0xcccccc, seg: 6 })
  // concrete footings + colliders on the legs
  for (let k = 0; k < 3; k++) {
    const [lx, , lz] = legAt(k, 0)
    B.span(M.concrete, lx - 0.4, y - 0.1, lz - 0.4, lx + 0.4, y + 0.35, lz + 0.4, { tint: 0xbdbdbd })
    B.solidCyl(0.2, 8, lx, y + 4, lz)
  }
  return { x, y: y + H, z }
}

function controlBuilding(B, ctx, x0, z0, x1, z1) {
  const y0 = 0.3
  const H = 3.6
  const T = 0.3
  const RT = y0 + H + 0.25
  slab(B, x0, z0, x1, z1, y0, y0 - TOP + 0.02, [], { mat: M.tiles, tint: 0xe8ecef })
  B.span(M.concrete, x0 - 0.25, TOP, z0 - 0.25, x1 + 0.25, y0 - 0.02, z1 + 0.25, { tint: 0xb8b8b8 })
  const o = { mat: M.concrete, tint: 0xeceae4, inner: { mat: M.plaster, tint: 0xeef2f4 }, frameTint: 0x5b6670, sashTint: 0x2c3138, leafTint: 0x5b6670 }
  room(B, x0, z0, x1, z1, y0, H, T, {
    s: [door(x0 + 3, 2.0, 2.6), win(x0 + 7, 2.4, 1.0, 1.4), win(x0 + 10, 1.4, 1.0, 1.4)],
    n: [win(x0 + 2.5, 1.6, 1.0, 1.4), win(x0 + 6, 2.6, 1.0, 1.4), win(x0 + 9.5, 1.6, 1.0, 1.4)],
    w: [win(z0 + 2, 1.6, 1.0, 1.4), door(z0 + 5.4, 2.0, 2.6)],
    e: [win(z0 + 4, 1.4, 1.0, 1.4)],
  }, o)
  flatRoof(B, x0 - T / 2, z0 - T / 2, x1 + T / 2, z1 + T / 2, y0 + H, { parapet: 0, tint: 0x8f9296, under: { mat: M.plaster, tint: 0xf6f8fa }, fasciaTint: 0x2f6fd0 })
  // roof railing with a gap at the stair landing (north-east corner)
  railing(B, x0, z0 + 0.05, x1 - 1.6, z0 + 0.05, RT, { tint: 0xf2c230 })
  railing(B, x0 + 0.05, z0, x0 + 0.05, z1, RT, { tint: 0xf2c230 })
  railing(B, x0, z1 - 0.05, x1, z1 - 0.05, RT, { tint: 0xf2c230 })
  railing(B, x1 - 0.05, z0 + 1.6, x1 - 0.05, z1, RT, { tint: 0xf2c230 })
  // external steel stair up the east side, landing at the north-east corner
  stairs(B, x1 + 0.95, TOP, z1 - 0.4, Math.PI, 1.3, RT - TOP, 6.6, { style: 'open', mat: M.plate, tint: 0xb8bec4, stringerMat: M.paint, stringerTint: 0x2f6fd0, rails: ['left'], railTint: 0xf2c230 })
  slab(B, x1 + 0.1, z0 - 0.3, x1 + 1.65, z1 - 7.0, RT, 0.15, [], { mat: M.plate, tint: 0xb8bec4 })
  for (const [px, pz] of [[x1 + 1.6, z0 - 0.25], [x1 + 1.6, z1 - 7.05]]) B.span(M.paint, px - 0.06, TOP, pz - 0.06, px + 0.06, RT - 0.15, pz + 0.06, { tint: 0x2f6fd0 })
  railing(B, x1 + 1.6, z0 - 0.25, x1 + 1.6, z1 - 7.0, RT, { tint: 0xf2c230 })
  railing(B, x1 + 0.1, z0 - 0.25, x1 + 1.6, z0 - 0.25, RT, { tint: 0xf2c230 })
  // roof equipment
  antenna(B, x0 + 2, RT, z0 + 2, 4)
  antenna(B, x0 + 4, RT, z0 + 1.5, 2.6)
  B.cyl(M.paint, 0.75, 0.6, 0.15, x0 + 8, RT + 1.3, z1 - 2, { rx: 1.0, tint: 0xf4f4f4, seg: 14 })
  B.span(M.paint, x0 + 7.95, RT, z1 - 2.05, x0 + 8.05, RT + 1.2, z1 - 1.95, { tint: 0x777777 })
  acUnit(B, x0 + 5, RT, z1 - 1.5)
  ctx.loot({ x: x0 + 9.5, y: RT, z: z0 + 2.5 })
  sign(B, 'RELAY CONTROL', x0 + 7.5, y0 + H - 0.2, z1 + 0.16, 3.6, 0.5, { bg: '#2f6fd0', fg: '#ffffff', border: '#ffffff', w: 512, h: 72, font: '700 52px Fredoka, sans-serif' })
  // interior
  const f = y0
  consoleDesk(B, x0 + 6, f, z0 + 0.9, 0, 4.8)
  for (const cx of [x0 + 4.5, x0 + 6.5]) chair(B, cx, f, z0 + 2.0, Math.PI, 0x2c3e50)
  for (let i = 0; i < 3; i++) serverRack(B, x1 - 0.7, f, z0 + 1.5 + i * 0.85, -Math.PI / 2)
  lockers(B, x0 + 0.5, f, z1 - 1.8, Math.PI / 2, 3)
  table(B, x0 + 7.5, f, z1 - 2.6, 0, 1.8, 1.0, { tint: 0xd8dde2 })
  chair(B, x0 + 6.8, f, z1 - 1.8, Math.PI, 0x2f6fd0)
  chair(B, x0 + 8.2, f, z1 - 1.8, Math.PI, 0x2f6fd0)
  desk(B, x1 - 1.5, f, z1 - 1.6, Math.PI, { tint: 0xd8dde2, chairTint: 0x2c3e50 })
  sign(B, 'ISLAND GRID', x0 + 0.17, f + 1.8, (z0 + z1) / 2 + 2.6, 1.8, 1.0, { bg: '#1f4f8f', fg: '#9fe0ff', border: '#9fe0ff', w: 256, h: 144, font: '700 40px Fredoka, sans-serif' }, Math.PI / 2)
  ctx.loot({ x: x0 + 9.5, y: f, z: z1 - 4.5 })
}

function fuelDepot(B, ctx, x0, z0, x1, z1) {
  const y = TOP
  // bund wall with an opening on the east side
  const h = 0.7
  const t = 0.3
  B.span(M.concrete, x0, y, z0, x1, y + h, z0 + t, { tint: 0xc8c6c0, solid: true })
  B.span(M.concrete, x0, y, z1 - t, x1, y + h, z1, { tint: 0xc8c6c0, solid: true })
  B.span(M.concrete, x0, y, z0 + t, x0 + t, y + h, z1 - t, { tint: 0xc8c6c0, solid: true })
  B.span(M.concrete, x1 - t, y, z0 + t, x1, y + h, z0 + 6.5, { tint: 0xc8c6c0, solid: true })
  B.span(M.concrete, x1 - t, y, z0 + 10.5, x1, y + h, z1 - t, { tint: 0xc8c6c0, solid: true })
  // two horizontal tanks on saddles
  for (const tx of [x0 + 3.0, x0 + 7.6]) {
    const tz = (z0 + z1) / 2
    for (const sz of [-2.4, 2.4]) B.span(M.concrete, tx - 1.2, y, tz + sz - 0.35, tx + 1.2, y + 0.9, tz + sz + 0.35, { tint: 0xbdbbb5 })
    B.cyl(M.gloss, 1.4, 1.4, 7.2, tx, y + 2.1, tz, { rx: Math.PI / 2, tint: 0xf2f2f2, seg: 16 })
    for (const sz of [-3.6, 3.6]) B.cyl(M.gloss, 1.25, 1.4, 0.3, tx, y + 2.1, tz + sz + Math.sign(sz) * 0.15, { rx: Math.PI / 2, tint: 0xe8e8e8, seg: 16 })
    B.span(M.paint, tx - 1.42, y + 1.9, tz - 3.2, tx + 1.42, y + 2.3, tz + 3.2, { tint: 0xd8402a })
    B.cyl(M.chrome, 0.2, 0.2, 0.4, tx, y + 3.6, tz + 1.5, { tint: 0xa0a6ad, seg: 8 })
    B.solid(1.4, 1.4, 3.75, tx, y + 2.1, tz)
    sign(B, 'FUEL', tx, y + 2.1, tz + 3.9, 1.3, 0.6, { bg: '#d8402a', fg: '#ffffff', border: '#ffffff', w: 256, h: 128 })
  }
  // pipes to a pump unit
  B.span(M.chrome, x0 + 3.0, y + 0.5, z0 + 7.6, x1 - 0.5, y + 0.66, z0 + 7.76, { tint: 0x9aa3ad })
  B.span(M.paint, x1 - 2.2, y, z0 + 6.8, x1 - 0.9, y + 1.6, z0 + 8.4, { tint: 0x2f6fd0, solid: true })
  B.span(M.dark, x1 - 2.1, y + 1.0, z0 + 8.4, x1 - 1.0, y + 1.4, z0 + 8.42, { tint: 0x0d1b2a })
  ctx.loot({ x: x1 - 1.6, y, z: z0 + 11.5 })
  // vertical tank outside the bund
  const vx = x0 + 4
  const vz = z1 + 3.2
  B.cyl(M.metal, 1.8, 1.8, 5.2, vx, y + 2.6, vz, { tint: 0xe2e6ea, seg: 16, solid: true })
  B.cyl(M.paint, 0.2, 1.85, 0.5, vx, y + 5.45, vz, { tint: 0xd0d4d8, seg: 16 })
  for (let k = 0; k < 9; k++) B.span(M.chrome, vx + 1.8, y + 0.4 + k * 0.55, vz - 0.25, vx + 1.92, y + 0.44 + k * 0.55, vz + 0.25, { tint: 0x9aa3ad })
  for (const dz of [-0.25, 0.25]) B.span(M.chrome, vx + 1.82, y, vz + dz - 0.03, vx + 1.9, y + 5.2, vz + dz + 0.03, { tint: 0x9aa3ad })
}

