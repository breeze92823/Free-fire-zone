// The island map: terrain, shore, roads, eight districts, vegetation and the
// boundary, built procedurally into `scene` with Rapier colliders registered
// in the existing physics world. See buildIsland() for the returned API.
//
//   The Villa (centre) · Maple Row (E) · Fountain Plaza (NE) · Relay Station (N)
//   Dockyard (W) · Sunset Beach (S) · Old Farm (SW) · Lookout (NW hill)
import { Group } from 'three'
import { initMaterials, M } from './materials.js'
import { buildBoundary, buildShore, buildTerrain, groundHeight } from './terrain.js'
import { flushColliders } from './geom.js'
import { world } from '../physics.js'
import { buildRoads } from './roads.js'
import { createNature, updateNature } from './nature.js'
import { DISTRICTS, SPAWNS, resetOccupancy } from './layout.js'
import { scatter } from './fields.js'
import * as villa from './villa.js'
import * as maple from './maple.js'
import * as plaza from './plaza.js'
import * as relay from './relay.js'
import * as dock from './dock.js'
import * as beach from './beach.js'
import * as farm from './farm.js'
import * as lookout from './lookout.js'

// Point lights are costly (every lit fragment loops over all of them, even by
// day), so only the best-placed lamps get one (16, or 8 when particles < 0.5,
// or opts.maxLamps); the rest only glow through the shared bulb material.
//
// Physics: every static collider (terrain triangles, walls, floors, stairs,
// props, trunks, the boundary fence) is merged into ~80 trimesh colliders on a
// 32 m grid. Thousands of small fixed colliders next to a big one cost Rapier
// ~2.5 ms per step, and its heightfield shape makes the character controller
// 3-10x slower per query; this layout steps in ~0.1 ms.

const tick = () => new Promise((r) => setTimeout(r, 0))

/**
 * Builds the island into `scene` (physics `world` must already exist).
 * @param {import('three').Scene} scene
 * @param {{ lighting?: object, preset?: { shadows: boolean, shadowMap: number, particles: number }, maxLamps?: number }} opts
 * @returns {Promise<{
 *   radius: number,
 *   bounds: { minX: number, maxX: number, minZ: number, maxZ: number },
 *   groundHeight: (x: number, z: number) => number,
 *   lootSpots: { x: number, y: number, z: number }[],
 *   spawnAreas: { blue: { x: number, z: number, r: number }, orange: { x: number, z: number, r: number } },
 *   landmarks: { name: string, x: number, z: number }[],
 *   update: (dt: number, elapsed: number) => void,
 *   dispose: () => void,
 *   root: Group,
 *   colliders: number,
 *   timings: Record<string, number>,
 * }>}
 */
export async function buildIsland(scene, { lighting, preset = {}, maxLamps } = {}) {
  const MAX_LAMPS = maxLamps ?? ((preset.particles ?? 1) < 0.5 ? 8 : 16)
  const root = new Group()
  root.name = 'island'
  scene.add(root)
  resetOccupancy()
  const t0 = performance.now()
  initMaterials()
  const tMaterials = Math.round(performance.now() - t0)

  const lootSpots = []
  const lampCandidates = []
  const anims = []
  const nature = createNature()
  const ctx = {
    root,
    M,
    preset,
    q: Math.max(0.2, Math.min(1, preset.particles ?? 1)),
    nature,
    ground: groundHeight,
    loot: (p, y, z) => lootSpots.push(typeof p === 'object' ? { x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2) } : { x: p, y, z }),
    lamp: (p, prio = 1) => lampCandidates.push({ ...p, prio }),
    anim: (fn) => anims.push(fn),
  }

  const timings = { materials: tMaterials }
  let t = performance.now()
  const lap = (name) => {
    const now = performance.now()
    timings[name] = Math.round(now - t)
    t = now
  }
  buildTerrain(root)
  const shore = buildShore(root)
  buildBoundary()
  lap('terrain')
  await tick()

  const districts = { villa, maple, plaza, relay, dock, beach, farm, lookout }
  for (const [name, d] of Object.entries(districts)) {
    t = performance.now()
    d.build(ctx)
    lap(name)
    await tick()
  }
  t = performance.now()
  buildRoads(root, ctx)
  lap('roads')
  scatter(ctx)
  lap('scatter')
  nature.build(root, groundHeight, preset)
  lap('nature')
  const colliders = flushColliders()
  lap('colliders')
  await tick()

  // Point lights: the highest-priority lamps, spread out (>= 16 m apart).
  if (lighting?.addLamp) {
    const picked = []
    lampCandidates.sort((a, b) => b.prio - a.prio)
    for (const c of lampCandidates) {
      if (picked.length >= MAX_LAMPS) break
      if (picked.every((p) => Math.hypot(p.x - c.x, p.z - c.z) > 16)) picked.push(c)
    }
    for (const p of picked) lighting.addLamp(p.x, p.y, p.z, M.bulb)
  }

  const landmarks = Object.values(DISTRICTS).map((d) => ({ name: d.name, x: d.x, z: d.z }))
  const ripple = M.water.userData.ripple
  const flagTime = M.flag.userData.time
  return {
    root,
    timings,
    colliders: colliders.length,
    radius: 125,
    bounds: { minX: -150, maxX: 150, minZ: -150, maxZ: 150 },
    groundHeight,
    lootSpots,
    spawnAreas: { blue: { ...SPAWNS.blue }, orange: { ...SPAWNS.orange } },
    landmarks,
    // Remove the island from the scene and the physics world (lamps added via
    // lighting.addLamp stay: lighting.js has no removal hook).
    dispose() {
      for (const c of colliders) if (world.getCollider(c.handle)) world.removeCollider(c, false)
      colliders.length = 0
      scene.remove(root)
      root.traverse((o) => {
        if (o.isMesh) o.geometry.dispose()
      })
    },
    update(dt, elapsed) {
      shore(elapsed)
      updateNature(elapsed)
      ripple.offset.set(elapsed * 0.05, elapsed * 0.035)
      flagTime.value = elapsed
      for (let i = 0; i < anims.length; i++) anims[i](dt, elapsed)
    },
  }
}
