// Sample objects for the shader warm-up (../warmup.js): one of each kind of thing a round creates on
// the fly (characters with their name tags, every gun, grenades, the medkit, frost walls, airdrops). Boot
// draws them once with the island so their shaders and textures are ready before the first round, and
// the kit is then kept (never disposed) so those shaders stay alive between rounds.
import { Group } from 'three'
import { WEAPONS } from '../config.js'
import { Actor } from './actor.js'
import { randomOutfit } from './characters.js'
import { buildGrenade, buildMedkit } from './weaponModels.js'
import { warmSamples as itemSamples } from './items.js'
import { warmSamples as lootSamples } from './loot.js'

export function buildWarmKit() {
  const kit = new Group()
  kit.name = 'warmKit'
  const guns = Object.keys(WEAPONS).filter((id) => WEAPONS[id].slot === 'primary' || WEAPONS[id].slot === 'secondary')
  // Two guns per stand-in character (held + back); the knife comes with every actor.
  for (let i = 0; i < guns.length; i += 2) {
    const a = new Actor({ name: 'warm', team: (i / 2) % 2 ? 'orange' : 'blue', outfit: randomOutfit(), scene: kit, loadout: { primary: guns[i], secondary: guns[i + 1] ?? guns[0] } })
    kit.add(a.group)
    for (const m of a.weaponModels) if (m && !m.parent) kit.add(m)
  }
  kit.add(buildGrenade('frag'), buildGrenade('pulse'), buildGrenade('breach'), buildGrenade('ice'), buildMedkit(), ...itemSamples(), ...lootSamples())
  return kit
}
