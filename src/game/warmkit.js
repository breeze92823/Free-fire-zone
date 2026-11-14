// Sample objects for the shader warm-up (../warmup.js): one of each kind of thing a round creates on
// the fly (characters with their name tags, every gun, grenades, the medkit, frost walls, airdrops). Boot
// draws them once with the island so their shaders and textures are ready before the first round, and
// the kit is then kept (never disposed) so those shaders stay alive between rounds.
import { Group } from 'three'
import { GRENADES, WEAPONS } from '../config.js'
import { Actor, weaponModel } from './actor.js'
import { randomOutfit } from './characters.js'
import { buildGrenade, buildMedkit, buildProjectile } from './weaponModels.js'
import { warmSamples as itemSamples } from './items.js'
import { warmSamples as lootSamples } from './loot.js'
import { warmSamples as areaSamples } from './areas.js'

export function buildWarmKit() {
  const kit = new Group()
  kit.name = 'warmKit'
  // A few stand-in characters (both teams, name tags, held + back guns); every other weapon is baked
  // and drawn on its own (the bake is cached, so a round never builds a weapon model itself).
  const guns = Object.keys(WEAPONS).filter((id) => WEAPONS[id].slot !== 'fists')
  for (let i = 0; i < 4; i++) {
    const a = new Actor({ name: 'warm', team: i % 2 ? 'orange' : 'blue', outfit: randomOutfit(), scene: kit, loadout: { primary: 'striker', secondary: 'viper' } })
    kit.add(a.group)
    for (const m of a.weaponModels) if (m && !m.parent) kit.add(m)
  }
  for (const id of guns) kit.add(weaponModel(id))
  const nades = [...new Set(Object.values(GRENADES).map((g) => g.model))]
  kit.add(...nades.map((k) => buildGrenade(k)), buildGrenade('ice'), buildMedkit(), buildProjectile('bolt'), buildProjectile('shell40'), buildProjectile('rocket'), ...itemSamples(), ...lootSamples(), ...areaSamples())
  return kit
}
