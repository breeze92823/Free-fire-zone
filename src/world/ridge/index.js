// Dustline Ridge: the big arid island (see layout.js). Built after Coral Key (it reuses Coral Key's
// material set M and the shared terrain shader), at the same coordinates, hidden and with its
// colliders switched off until src/world/worlds.js activates it for a round.
// Returns the same API as buildIsland (world/index.js) plus setActive(on), navCell and id.
import { Group } from 'three'
import { world } from '../../physics.js'
import { flushColliders } from '../geom.js'
import { buildShore } from '../terrain.js'
import { createNature, updateNature } from '../nature.js'
import { mulberry32 } from '../../textures.js'
import { BOUNDS, PLACES, RADIUS, SPAWNS, resetOccupancy, shoreR } from './layout.js'
import { buildRidgeFence, buildRidgeTerrain } from './terrain.js'
import { camp, depot, mesa, mills, quarry, roadside, town } from './places.js'

import { nextTask as tick } from '../../nextTask.js'

export async function buildRidge(scene, { preset = {} } = {}) {
  const root = new Group()
  root.name = 'ridge'
  root.visible = false
  scene.add(root)
  resetOccupancy()
  const timings = {}
  let t = performance.now()
  const lap = (name) => {
    const now = performance.now()
    timings[name] = Math.round(now - t)
    t = now
  }

  const { groundHeight } = await buildRidgeTerrain(root)
  const shore = buildShore(root, shoreR, 480)
  buildRidgeFence()
  lap('terrain')
  await tick()

  const lootSpots = []
  const anims = []
  const nature = createNature({ rockTint: [1.55, 1.08, 0.82] })
  const ctx = {
    root,
    ground: groundHeight,
    nature,
    rand: mulberry32(9137),
    loot: (p) => lootSpots.push({ x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2) }),
    anim: (fn) => anims.push(fn),
  }
  t = performance.now()
  for (const [name, build] of [['town', () => town(ctx)], ['west', () => camp(ctx, 'west')], ['east', () => camp(ctx, 'east')], ['quarry', () => quarry(ctx)], ['mesa', () => mesa(ctx)], ['depot', () => depot(ctx)], ['mills', () => mills(ctx)]]) {
    build()
    lap(name)
    await tick()
    t = performance.now()
  }
  roadside(ctx)
  lap('roadside')
  nature.build(root, groundHeight, preset)
  lap('nature')
  const colliders = flushColliders()
  for (const c of colliders) c.setEnabled(false)
  lap('colliders')

  let active = false
  return {
    id: 'ridge',
    root,
    timings,
    colliders: colliders.length,
    radius: RADIUS,
    bounds: { ...BOUNDS },
    navCell: 2, // m per nav cell (Coral Key: NAV.cell 1.25); the island is ~4x larger
    navProbe: 'rays', // navgrid.js: five down rays per cell instead of the slower box test
    groundHeight,
    lootSpots,
    spawnAreas: { blue: { ...SPAWNS.blue }, orange: { ...SPAWNS.orange } },
    landmarks: Object.values(PLACES).map((p) => ({ name: p.name, x: p.x, z: p.z })),
    lamps: [],
    // Shown with its colliders on (the round's world), or hidden with them off.
    setActive(on) {
      if (on === active) return
      active = on
      root.visible = on
      for (const c of colliders) if (world.getCollider(c.handle)) c.setEnabled(on)
    },
    isActive: () => active,
    update(dt, elapsed) {
      shore(elapsed)
      updateNature(elapsed)
      for (let i = 0; i < anims.length; i++) anims[i](dt, elapsed)
    },
    dispose() {
      for (const c of colliders) if (world.getCollider(c.handle)) world.removeCollider(c, false)
      colliders.length = 0
      scene.remove(root)
      root.traverse((o) => {
        if (o.isMesh) o.geometry.dispose()
      })
    },
  }
}
