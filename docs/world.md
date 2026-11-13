# World: the island (`src/world/`)

Reference for everything under `src/world/` plus the dev harness `world-test.html`. The island ("Coral Key") is fully procedural: terrain, shore, roads, eight districts, vegetation, the boundary fence and all static physics are generated at load by `buildIsland`. Nothing here is loaded from a file.

Written from a full read of the code. Numbers such as the loot-spot count are derived by reading, not measured at runtime, unless stated.

| File | Role |
|---|---|
| `index.js` | `buildIsland`: orchestrates the build, owns the `ctx` handed to districts, returns the island API |
| `layout.js` | Pure maths/data (no three.js): outline, districts, roads, flat zones, dirt, `terrainHeight`, occupancy registry |
| `terrain.js` | Height grid, terrain mesh + splat shader, `groundHeight`, shallow rim + foam, boundary fence |
| `geom.js` | UV helpers, custom geometries, collider soups, `Batch` (the builder everything draws into) |
| `materials.js` | The shared material set `M`, `TINT` palette |
| `paint.js` | Canvas texture painters specific to the island |
| `kit.js` | Building + prop catalogue (walls, slabs, stairs, roofs, furniture, street props, vehicles) |
| `nature.js` | Instanced trees, palms, bushes, rocks, flowers, grass, logs |
| `roads.js` | Asphalt, markings, sidewalks, pads, street furniture |
| `fields.js` | `scatter`: cover and vegetation between the districts; `hayBale` |
| `villa.js` `maple.js` `plaza.js` `relay.js` `dock.js` `beach.js` `farm.js` `lookout.js` | One district each, each exports `build(ctx)` |
| `devview.js` + `world-test.html` | Stand-alone harness: free-fly camera, walk mode, `window.__wv` helpers |

## 1. Overview

### 1.1 Coordinates and units

- Metres. `+X` east, `-Z` north, `+Y` up. The island is centred on the origin.
- Polar angle `a = atan2(z, x)`: 0 = east, +90 deg = south, -90 deg = north.
- Grass plateau is `y = 0`. Sea level is `WATER.level` (`-0.6`, `src/config.js`). Seabed bottoms out at `-5`. The Lookout hill tops out around `6.2`.
- Waterline radius is `shoreR(a)`: about 119 to 135 m. The nominal `radius` returned by `buildIsland` is the literal `125`.
- Yaw is a rotation about `+Y` (`Matrix4.makeRotationY`). In a frame with yaw `t`, local `+z` points to world `(sin t, 0, cos t)` and local `+x` to `(cos t, 0, -sin t)`. Kit props face local `+z`. For a segment `(x0,z0) -> (x1,z1)`, `yaw = atan2(-(z1 - z0), x1 - x0)` makes local `+x` run along it (used by every fence, railing and wall helper).
- Extents: terrain grid `-160..160` (`EXTENT`), `bounds` returned to the game `-150..150`, boundary fence about `shoreR + 5`.

### 1.2 `buildIsland(scene, { lighting, preset = {}, maxLamps })` (async)

Precondition: the Rapier world exists (`initPhysics()` from `src/physics.js`). The game also calls `setTextureQuality` (`src/textures.js`) first so painted textures are downscaled per preset. Stages, in order (`await tick()` = a `setTimeout(0)` yield so the loading screen can paint):

| # | Stage | What happens |
|---|---|---|
| 0 | setup | `detail = clamp(preset.detail ?? preset.particles ?? 1, 0.2, 1)`; `setGeomDetail(detail)`; `MAX_LAMPS = maxLamps ?? (detail < 0.5 ? 8 : 16)`; `root = new Group()` named `island` added to `scene`; `resetOccupancy()`; `initMaterials()` (fills `M`) |
| 1 | context | `createNature()` collector; `ctx` object (below) |
| 2 | terrain | `buildTerrain(root)` (mesh + terrain triangles into the collider grid), `buildShore(root)` (returns the foam updater), `buildBoundary()` (invisible fence boxes). Yield |
| 3 | districts | `villa, maple, plaza, relay, dock, beach, farm, lookout`, each `build(ctx)`, yield after each. This order fixes the loot-spot indexes |
| 4 | roads | `buildRoads(root, ctx)`: road surfaces, sidewalks, then street furniture (registers lamps and one loot spot) |
| 5 | scatter | `scatter(ctx)`: field cover (walls, hedges, hay, crates), then trees/bushes/rocks/flowers/tufts into the nature collector, honouring the occupancy registry |
| 6 | nature | `nature.build(root, groundHeight, preset)`: one `InstancedMesh` per plant/rock kind, trunk/rock colliders |
| 7 | colliders | `flushColliders()`: every static collider registered so far becomes one trimesh per 32 m grid cell. Yield |
| 8 | lamps | If `lighting.addLamp` exists: sort lamp candidates by priority (descending), take up to `MAX_LAMPS` that are more than 16 m from every lamp already taken, call `lighting.addLamp(x, y, z, M.bulb)` |
| 9 | return | Build `landmarks` from `DISTRICTS`, return the API |

`ctx` (the only thing a district's `build` receives):

| Field | Meaning |
|---|---|
| `root` | The island `Group`. Batches and loose meshes are added here |
| `M` | The material set (same object as the `M` export of `materials.js`) |
| `preset` | The graphics preset passed in |
| `q` | Detail factor 0.2..1 |
| `nature` | The collector from `createNature()`: `tree`, `cherry`, `cypress`, `palm`, `bush`, `rock`, `flower`, `tuft`, `log` |
| `ground(x, z)` | `groundHeight` (terrain surface only, not floors) |
| `loot(p)` / `loot(x, y, z)` | Register a supply-crate spot. The object form copies `x, y, z` rounded to 2 decimals and drops any other field |
| `lamp(p, prio = 1)` | Register a point-light candidate at world point `p = { x, y, z }` |
| `anim(fn)` | Register `fn(dt, elapsed)` to run every frame from `island.update` |

Returned object:

| Field | Value | Consumers |
|---|---|---|
| `radius` | `125` (literal) | `main.js` frame loop (shore ambience mix), `game/zone.js` (zone-centre clamp; falls back to 125) |
| `bounds` | `{ minX: -150, maxX: 150, minZ: -150, maxZ: 150 }` | `game/navgrid.js buildNav`, `game/mapimage.js renderMapImage` |
| `groundHeight(x, z)` | Terrain height on the collision triangulation | `main.js` (player reset, `teleport`, `renderMapShot`), `game/loot.js` (airdrops), `game/navgrid.js`, `game/match.js`, `game/results.js`, `devview.js` |
| `lootSpots` | `{ x, y, z }[]` | `main.js` -> `game/loot.js buildLoot(scene, spots)`; the array index is the crate index sent to the server |
| `spawnAreas` | `{ blue, orange }`, copies of `SPAWNS` (`{ x, z, r }`) | `main.js` (initial player position), `game/match.js spawnActor`, `game/results.js` |
| `landmarks` | `{ name, x, z }[]` in `DISTRICTS` order | `renderMapImage` labels, `devview.js` digit keys |
| `update(dt, elapsed)` | Foam pulse, wind uniform, water ripple offset, flag time, then every `anim` callback | `main.js` frame loop, `devview.js` |
| `dispose()` | Removes the trimesh colliders, removes `root`, disposes mesh geometries | Not called anywhere at present |
| `root` | The `Group` | Nobody outside `index.js` |
| `colliders` | Number of trimesh colliders created | Dev only |
| `timings` | ms per stage: `materials, terrain, villa ... lookout, roads, scatter, nature, colliders` | Dev only (`__wv.island.timings`) |

### 1.3 What the graphics preset changes

Presets are `GRAPHICS` in `src/config.js` (`detail`: Low 0.4, Medium 0.65, High/Ultra 1).

| Effect | Where | Rule |
|---|---|---|
| Round-part sides | `cylGeo` via `setGeomDetail` | Cylinders asked for with `seg >= 10` get `max(6, round(seg * detail))` sides (detail clamped to >= 0.3) |
| Point lights | `buildIsland` | 8 when `detail < 0.5`, else 16, unless `maxLamps` is given |
| Flowers / grass tufts | `scatter` | `round(240 * q^2)` flower patches, `round(2600 * q^2)` tufts |
| Lawn tufts | `villa.js`, `maple.js yard` | `round(160 * q^2)`, `round(16 * q^2)` per lot |
| Fountain droplets | `plaza.js fountain` | `max(16, round(70 * q))` instances |
| Rock and log shadows | `nature.build` | Cast only when `preset.detail >= 0.9` |
| Texture resolution | `toTexture` in `src/textures.js` | Downscaled by `texScale` if `setTextureQuality` ran before `initMaterials` |

Nothing that carries a collider or a loot spot depends on `q`: trees, bushes, rocks, cover and crates are identical on every preset. Keep it that way (see section 6).

## 2. Data: `layout.js`

No three.js imports. Everything below is read by other modules through named imports.

### 2.1 Outline

- `CTRL`: 12 waterline radii, one every 30 deg from east. `shoreR(a)` = periodic Catmull-Rom through them plus three small harmonics.
- `beachW(a)`: beach width, 11 m in the north to 18 m in the south.
- `cliffMask(a)`: 0..1 mask for the north-east cliffs, centred at -42 deg, half-width 18 deg (`CLIFF_A`, `CLIFF_HALF`).
- `polar(x, z)` -> `{ r, a }`; `inlandOf(x, z)` -> metres inland of the waterline; `smooth(e0, e1, x)` (smoothstep); `lerp`.

### 2.2 Districts and spawns

| Key | `name` | `x, z` | Note |
|---|---|---|---|
| `villa` | The Villa | 0, 0 | centre |
| `maple` | Maple Row | 84, 0 | east |
| `plaza` | Fountain Plaza | 41, -76 | north-east; also the fountain centre |
| `relay` | Relay Station | -10, -92 | north |
| `dock` | Dockyard | -98, -14 | west |
| `beach` | Sunset Beach | 0, 112 | south |
| `farm` | Old Farm | -66, 34 | south-west |
| `lookout` | Lookout | -62, -72 | north-west hill; also the tower position |

`DISTRICTS` only supplies map labels (`landmarks`) and, for `plaza` and `lookout`, the build anchor. All other districts hard-code their coordinates (section 3.9).

- `SPAWNS = { blue: { x: -70, z: 70, r: 15 }, orange: { x: 70, z: -70, r: 15 } }`.
- `RING = { r: 48, half: 4.5, walk: 2.6 }`: ring road centreline radius, half-width, sidewalk width.
- `DOCK = { x0: -120, x1: -76, z0: -42, z1: 14, pier: { z0: -12, z1: -6, x1: -146 } }`: quay line `x0`, landward edge `x1`, the pier strip and its seaward end. Read by `terrainHeight`, `buildTerrain` (sand weight), `buildBoundary`, `dock.js`.

### 2.3 Roads

`ROADS` entries: `{ id, pts: [[x, z], ...], half, kind: 'asphalt' | 'dirt', walk, closed? }`.

| `id` | Path | `half` | `walk` | Kind |
|---|---|---|---|---|
| `ring` | circle r 48, 160 segments | 4.5 | 2.6 | asphalt |
| `north` | (0,-48) -> (0,-77) | 4 | 2.4 | asphalt |
| `east` | (48,0) -> (100,0) | 4 | 2.4 | asphalt |
| `west` | (-48,0) -> (-77,0) | 4 | 2.4 | asphalt |
| `south` | (0,48) -> (0,84) | 4 | 2.4 | asphalt |
| `plazaLink` | (0,-66) -> (25,-66) | 3.5 | 2 | asphalt |
| `farmTrack` | (-36.4,31.3) -> (-46,31) | 2.6 | 0 | dirt |

`PADS`: `{ x: 107, z: 0, r: 8 }` (Maple Row cul-de-sac) and `{ rect: [-18, 84, 18, 100] }` (beach car park).

`roadDist(x, z, withWalk = true)`: signed distance to the nearest road edge or pad (negative = on it). The ring is evaluated analytically from `RING.r`, not from its points.

### 2.4 Flat zones, dirt, height

- `FLAT_RECTS` (`[x0, z0, x1, z1, margin]`): Maple Row `[50,-40,116,40,6]`, Fountain Plaza `[22,-104,60,-58,6]`, Relay `[-46,-106,24,-74,6]`, Dockyard `[-122,-44,-74,16,5]`, Old Farm `[-102,12,-34,60,6]`, beach car park `[-20,80,20,104,6]`. `FLAT_CIRCLES` (`[x, z, r, margin]`): `[0,0,58,8]` (villa + ring).
- `flatMask(x, z)`: 1 inside a flat zone, fading over the margin; also 1 within 2 m of any road edge, fading out by 8 m.
- `DIRT_PATHS` (polylines with `half`) and `DIRT_RECTS`: terrain paint only (`dirtMask`). Paths: up to the Lookout, the farmyard, footpaths to both spawn fields. Rects: crop field, farmyard.
- `terrainHeight(x, z)`: the analytic surface. Shore profile (seabed `max(-5, -0.6 + 0.2 d)` for `d < 0`, sand rising from -0.6 to 0 across the beach, 0 inland) plus `(hills + undulate * inland) * (1 - flat) * inland`. Then the cliff override (land rises to 4.4 m toward the coast and drops sheer) blended by `cliffMask`, then the dock override (apron forced to 0 east of `DOCK.x0`, -4.5 west of it).
- `hills(x, z)` (private): four Gaussians, `7 @ (-62,-72) s15` (Lookout, soft plateau above 6.2), `4.5 @ (-92,-48) s11`, `2.2 @ (58,74) s12`, `1.6 @ (-28,80) s10`. `undulate` adds about +/-0.6 m of rolling ground.

### 2.5 Occupancy registry

Module-level state shared by districts and `scatter`:

- `occupy(x0, z0, x1, z1)`: reserve a rectangle. `occupyCircle(x, z, r)`: reserve a circle (10 m hash grid; `r > 6` goes to a linear list).
- `isFree(x, z, r = 0, { roads = true, spawns = false })`: false if the circle touches a reserved shape, a road + sidewalk (0.8 m clearance) when `roads`, or a spawn circle when `spawns`.
- `resetOccupancy()`: called at the start of `buildIsland`.

## 3. Per-file reference

### 3.1 `index.js`

Exports only `buildIsland` (section 1.2). Called by `src/main.js` and `devview.js`. Internal: `tick()`, `lap(name)` timing helper, the `districts` object literal (import namespace per district file).

### 3.2 `terrain.js`

| Export | Signature / meaning |
|---|---|
| `EXTENT` | `160`, half-size of the height grid |
| `groundHeight(x, z)` | Height by interpolating the same two triangles per cell that the mesh and the collider use (diagonal `(x1,z0)-(x0,z1)`). Before `buildTerrain` it returns `terrainHeight`; outside the grid it returns `-5` |
| `buildTerrain(scene)` | Samples `terrainHeight` on a 2 m grid (161 x 161 vertices), builds one mesh with per-vertex splat weights `aW = (grass, sand, rock, dirt)` and a tint colour, skips cells whose four corners are below `-3.2`, and feeds the same triangles to `staticTris`. Returns the mesh |
| `buildShore(scene)` | Shallow-water rim (ribbon from 3 m inside to 22 m outside the waterline) and the foam strip. Returns `update(elapsed)` |
| `buildBoundary()` | Invisible fence: 0.6 m thick boxes from `y = -3.5` to `8.5` along a 240-sample loop at `shoreR + 5` on beaches and `shoreR - 7.5` on the cliffs; the dock arc is replaced by the quay line `DOCK.x0 + 0.25` with a notch around the pier. Returns `{ loop, count }` |
| `GRID_CELLS`, `GRID_CELL`, `Vector2` | 160, 2, and a three.js re-export (unused) |

Splat rules in `buildTerrain`: sand by distance from the waterline (`beachW`), reduced to 20% inside the dock; rock where slope exceeds about 0.5..0.9 or on the cliff face; dirt from `dirtMask`; grass is the remainder. The material is a `MeshStandardMaterial` patched in `onBeforeCompile` (cache key `islandTerrain`) that samples four world-space textures (`paintGrassTop`, `paintBeachSand`, `paintRock`, `paintSoil`).

### 3.3 `geom.js`

| Export | Signature / meaning |
|---|---|
| `projectUV(g, ox = 0, oy = 0, oz = 0)` | Box-projects UVs in metres from each vertex normal; offsets align neighbouring pieces |
| `boxGeo(w, h, d, ox, oy, oz)` | `BoxGeometry` + `projectUV` |
| `setGeomDetail(k)` | Sets the module-wide detail (clamped 0.3..1) used by `cylGeo` |
| `cylGeo(rTop, rBot, h, seg = 12, open = false)` | Cylinder/cone with metre UVs; side count reduced by detail when `seg >= 10` |
| `prismGeo(w, h, t, apexX = 0)` | Triangular prism (gable end): base `w` on `y = 0`, apex `h` up, `t` thick along z |
| `ribbonGeo(pts, a, b, y = 0)` | Flat strip along polyline `pts` spanning offsets `a..b` to the left of travel at height `y`; `u` = metres along, `v` = offset |
| `ColliderSoup` | `box(hx, hy, hz, matrix)`, `prism(r, h, x, y, z, n = 8)`, `build()` -> one Rapier trimesh via `addFixed` |
| `staticBox(hx, hy, hz, m)` | World-space cuboid into the soup of the 32 m cell containing its centre |
| `staticPrism(r, h, x, y, z, n = 8)` | Upright n-gon prism (cylinder stand-in) |
| `staticTris(pos, idx)` | Raw world triangles, binned by centroid |
| `flushColliders()` | Builds every pending soup, clears the grid, returns the colliders |
| `Batch` | See section 4.1 |
| `yawQ(yaw)`, `Y_AXIS` | Rapier-style yaw quaternion, `+Y` vector (unused) |

### 3.4 `materials.js`

- `M` (live binding, `null` until `initMaterials()`), `initMaterials()` (builds and returns `M`), `TINT` (named hex colours: `white, cream, mint, sky, peach, pink, lemon, sand, terracotta, slate, darkSlate, red, barn, trim, frame, wood, darkWood, lightWood, steel, yellow`), `color(hex)` (unused helper).
- Internal: `tex(canvas, tile, srgb)` (texture with `repeat = 1 / tile`), `mk(name, params, userData)`, `textured(name, painted, tile, { vc, normal, rough, metal, rotate, extra })`.
- The material table is in section 4.2.

### 3.5 `paint.js`

Canvas painters, all seeded (`mulberry32`) and tileable unless noted. Helpers: `canvas`, `rgb`, `clamp01`, `pixels(size, fn)`, `wrapped(size, x, y, r, draw)` (draws wrapped copies so strokes tile).

| Returns | Painters |
|---|---|
| `{ color, normal }` | `paintBeachSand`, `paintSoil(size, seed, furrows)`, `paintCobble`, `paintAsphalt`, `paintConcrete(size, joints, seed, base)`, `paintStoneWall`, `paintBrick`, `paintStucco`, `paintBoards(size, boards, seed, base, gap)`, `paintShingles`, `paintCorrugated`, `paintTreadPlate`, `paintLeaves` |
| `{ color }` | `paintGrassTop`, `paintStraw(size, seed, long)` |
| bare canvas | `paintStripes(a, b, n)`, `paintBooks`, `paintRug(base, border, accent)` (not tiled), `paintCheckerTiles`, `paintHelipad` (not tiled), `paintFoam` (alpha mask), `paintRamp` (alpha ramp), `paintChainLink` (transparent background) |
| `{ canvas, draw }` | `paintSign(text, { bg, fg, border, w, h, font, outline, sub })`, `paintPoster(kind)` with `kind` in `cola, energy, beach, coffee` (anything else draws the coffee poster). `draw()` repaints, used after the web font loads |

Stucco, boards, shingles and corrugated metal are painted near white on purpose so vertex colours can tint them.

### 3.6 `kit.js`

The catalogue is section 4.3. Also exports `DOOR_W = 2.0`, `DOOR_H = 2.6`, `lighten(hex, k = 1.15)`, `darken(hex, k = 0.7)`. Private: `openingTrim` (frames, door leaf, sash, glass, sill, shutters, flower box), `flagStrip`. Imported by every district, `roads.js` and `fields.js`.

### 3.7 `nature.js`

- `createNature()` returns the collector. Placement calls only record data; nothing is created until `build`.

| Method | Parameters |
|---|---|
| `tree(x, z, o = {})` | `o.s` scale, `o.v` canopy variant 0..2 (default: hash of position), `o.c` canopy colour, `o.r` rotation |
| `cherry(x, z, s = 1)` | Pink-canopy tree (variant 0, darker trunk) |
| `cypress(x, z, s = 1)` | Cone tree |
| `palm(x, z, s = 1, r = null)` | `r` rotation |
| `bush(x, z, s = 1, flowers = null)` | `flowers`: `false` = no buds, `null` = default bud colours, hex = that colour |
| `rock(x, z, s = 1, y = null)` | `y` overrides the ground height |
| `flower(x, z, c = null)` | Patch of 5 flowers, `c` head colour |
| `tuft(x, z, s = 1)` | Grass tuft |
| `log(x, z, yaw = 0)` | Fallen log |
| `build(scene, ground, preset)` | Creates the `InstancedMesh`es (up to 15: `canopy0-2`, `trunk0-2`, `cypress`, `palmTrunk`, `palmLeaves`, `bush`, `buds`, `rock0-1`, `flowerHeads`, `flowerLeaves`, `tufts`, `logs`) and returns them |

- Colliders created in `build`: tree trunk prism (`r 0.24 s`, `h 3.2 s`), cypress prism (`r 0.55 s`, `h 2.8`), palm prism (`r 0.24 s`, `h 4`), a box for rocks with `s > 0.7`, a box per log. Bushes, small rocks, flowers and tufts have none.
- `updateNature(elapsed)` sets the shared wind uniform. `windify(mat, amount, pivot, key)` patches a material so vertices above `pivot` sway (canopies, cypresses, palm leaves, tufts).
- Also re-exports `Matrix4` (unused).

### 3.8 `roads.js` and `fields.js`

`buildRoads(scene, { lamp, loot })` -> `{ group, street }`:

- Batch `roads` (built with `castShadow = false`): for each asphalt road, a ribbon at `y = 0.065` (ring) or `0.04` (others), edge lines, centre line (dashed white for `ring` and `plazaLink`, double yellow otherwise), sidewalks 0.14 m high on both sides when `walk > 0` with kerbs and one thin collider box per about 3 m. `runs()` cuts lines and sidewalks where another road or pad covers them; roads earlier in `ROADS` also claim their sidewalk area at junctions. Zebra crossings on the four spokes, 10 m from each road's first point. The circular pad gets a sidewalk ring open to the west; the car park gets kerbs and bay lines.
- Batch `street` (casts shadows): 12 ring lamps (priority 2) on the inner sidewalk, spoke lamps (priority 1) via `spoke(id, every)`, three `utilityPole` lines with `cable`s, parked `car`s, the beach car park cars plus one loot spot at `(4.2, 0.05, 92)`, STOP signs, hydrants, bins, a bus stop, two billboards.
- Private helpers: `segDist`, `centreDist`, `covered`, `resample`, `offsetAt`, `runs`, `wallStrip`, `sidewalk`, `markings`, `zebra`.

`fields.js`:

- `hayBale(B, x, y, z, yaw = 0, round = false)`: square bale (box collider) or round bale. Also used by `farm.js`.
- `scatter(ctx)`: (1) a hand-placed `walls` list of `wall`, `hedge`, `hay` (bales + a loot spot), `crates` entries, each reserving its footprint; these are placed unconditionally, without an `isFree` test. (2) Tree `clumps` `[cx, cz, radius, count]`, up to 55 single trees (8% cherry), 6 fallen logs, up to 120 bushes and 45 rocks, cliff and north-shore boulders, then flowers and tufts. Uses one `mulberry32(777)` stream. Trees, logs, bushes and rocks pass `spawns: true` so spawn circles stay clear; flowers and tufts only avoid reserved shapes and roads.

### 3.9 Districts

Each file exports `build(ctx)`. All geometry goes into one or two `Batch`es built with `B.build(ctx.root, true)`; moving parts get their own batch inside a `Group`.

| File | Where the coordinates come from | Reserved footprint | Loot | Lamps (prio) | Animated |
|---|---|---|---|---|---|
| `villa.js` | Constants `X = 20`, `Z = 14` around the origin; floors `Y0 = 0.3`, `Y1 = 4.3`, roof `RT = 8.55` | `occupy(-28,-26,28,30)` | 9 | 2 avenue lamps (1) | none |
| `maple.js` | `LOTS` table (x 61/79/97, `side` -1 north / +1 south, type A two-storey or B bungalow, colours, optional car), `SET = 11.5` | per lot `x-8..x+11`, `abs(z)` 6.6..30 | 9 | none | none |
| `plaza.js` | `PX0..PZ1 = 25, 57, -92, -60`; fountain at `DISTRICTS.plaza`; cafe north of the square | `occupy(24,-103,58,-59)` | 4 | 4 square lamps (3) | fountain jet + droplets |
| `relay.js` | Apron `AX0..AZ1 = -44, 20, -104, -78`; helipad centre (-20,-92); mast (11,-99.5) | `occupy(-45,-105,21,-78)` | 5 | 2 floodlights (2) | mast lights and helipad beacons blink, windsock swings |
| `dock.js` | `DOCK` from `layout.js` for the apron, quay and pier; warehouse, container yard, gantry and gate are absolute numbers | `occupy(-150,-44,-75,15)` | 9 | 2 light towers (2), 1 pier lamp (1) | gantry trolley, moored boat bobs |
| `beach.js` | Boardwalk `z = 106.5`, `x` +/-38; items placed by distance from the waterline with `zAt(x, inland)` and `grassEdge(x)` | `occupy(-56,100,56,140)` plus circles | 4 | 2 boardwalk lamps (2) | none |
| `farm.js` | Barn `(-70,24)-(-54,36)`, silo (-48.5,20.5), crop field `(-98,20)-(-76,44)`, windmill (-92,53) | `occupy(-103,14,-34,60)` plus circles | 5 | none | windmill sails |
| `lookout.js` | `DISTRICTS.lookout`; heights from `ctx.ground` (platform at ground + 6) | `occupyCircle(cx, cz, 9)` | 2 | none | none |

Private builders worth knowing: `villa.js gazebo`; `maple.js houseA`, `houseB`, `garage`, `yard` (the north and south rows are mirrored with `X = (v) => v * gs`, not with a negative scale); `plaza.js fountain`, `cafe`, `flowerCart`, `bikeRack`, `ringGeo`; `relay.js helicopter`, `mast`, `controlBuilding`, `fuelDepot`; `dock.js pier`, `boatModel`, `warehouse`, `gantry`, `forklift`; `beach.js boardwalk`, `lampPost`, `umbrella`, `lounger`, `towel`, `kayakGeo`, `shack`, `lifeguard`; `farm.js barn`, `silo`, `cropField`, `windmill`, `tractor`, `well`, `coop`.

Loot index order at the time of writing (52 spots): villa 0-8, maple 9-17, plaza 18-21, relay 22-26, dock 27-35, beach 36-39, farm 40-44, lookout 45-46, roads 47, scatter hay 48-51.

### 3.10 `devview.js` and `world-test.html`

`world-test.html` is a bare page (a `#hud` div) that loads `src/world/devview.js`. It is served by the dev server only; the production build has `index.html` as its single entry. `devview.js` creates a renderer, `initPhysics()`, lighting, the sea (`createWorld`), runs `buildIsland`, then drives a free-fly camera and a Rapier character controller. See section 5.9.

## 4. Shared building blocks

### 4.1 `Batch`: merged geometry + frames + colliders

A `Batch` collects transformed vertices per material into flat arrays ("buckets"). `build` emits exactly one mesh per material used, so a district costs one draw call per material (plus one per material in the shadow pass when it casts).

| Member | Meaning |
|---|---|
| `new Batch(name)` | `name` becomes the group name; meshes are named `name:material` |
| `push(x, y, z, yaw)` / `pop()` | Enter / leave a local frame (translation + yaw, nested) |
| `top`, `yaw` | Current frame matrix, accumulated yaw |
| `P(x, y, z)` | Local point -> world point as a plain `{ x, y, z }` |
| `add(mat, g, local = null, tint = 0xffffff)` | Raw add of a `BufferGeometry` with an optional local `Matrix4` |
| `geo(mat, g, x, y, z, o)` | Geometry at a position; `o`: `rx, ry, rz` (Euler order `YXZ`), `s` or `sx, sy, sz`, `tint` |
| `box(mat, w, h, d, x, y, z, o)` | Centred box with metre UVs. `o`: `rx, ry, rz, tint, solid, faceUV`. Fast path writes 24 vertices directly; scale options are ignored unless `faceUV` (which uses a plain `BoxGeometry` with 0..1 UVs per face) |
| `span(mat, x0, y0, z0, x1, y1, z1, o)` | Axis-aligned box from two corners; silently skipped when any side is below 1e-4 |
| `cyl(mat, rTop, rBot, h, x, y, z, o)` | `cylGeo` at a position; `o.seg` (default 12), `o.open`, `o.solid`, plus the `geo` options |
| `solid(hx, hy, hz, x, y, z, o)` | Cuboid collider in the current frame (half extents, centre, `rx, ry, rz`) |
| `solidSpan(x0, y0, z0, x1, y1, z1)` | Cuboid collider from two corners |
| `solidCyl(r, h, x, y, z)` | Upright 8-sided prism collider; ignores any rotation |
| `build(parent, castShadow = true)` | Creates the meshes (`matrixAutoUpdate = false`, 16-bit indices up to 65535 vertices), adds a `Group` to `parent`, clears the buckets, returns the group |
| `colliders`, `tris` | Counters (informational) |

Rules that follow from the implementation:

- Vertices are baked in the coordinates of `parent`. A batch built into `ctx.root` is static. To move something, build a separate batch into its own `Group` and move the group.
- `tint` only has an effect on materials with `vertexColors` (it is written as a vertex colour). On the others it is ignored.
- A material with `userData.alias` is swapped for its alias at add time (and takes `userData.aliasTint` when no tint was given). This merges near-identical looks into one bucket.
- Per-material flags read by `build`: `userData.noShadow` (never casts), `userData.noReceive`, `userData.renderOrder`.
- `box`/`span` UVs are continuous within one frame for unrotated boxes, so adjacent wall pieces line up; rotated boxes project from their own centre.
- Colliders are registered into the global soup grid at the moment `solid*` is called, not at `build`.

### 4.2 Materials and textures

`initMaterials()` builds every shared material once per island build. UVs are in metres, so each texture's `repeat` is `1 / tile`. Painted canvases go through `toTexture` (`src/textures.js`), which tracks anisotropy and applies `texScale`.

| Group | Materials (tile size in m) |
|---|---|
| Textured, tintable by vertex colour | `stucco` 2.4, `plaster` 2.4 (interior, warm emissive lift), `stone` 2.6, `brick` 1.4, `siding` 2.4 (horizontal boards), `boardsV` 2.4 (same texture rotated 90 deg), `wood` 1.0, `floorWood` 2.0, `tiles` 2.4, `checker` 1.6, `concrete` 4, `shingle` 2.2, `metal` 1.6 (corrugated), `metalH` 1.6 (rotated, unused), `plate` 0.8 (tread plate), `hay` 1.2, `thatch` 1.6, `soil` 2.2, `hedge` 1.3, `rockTex` 3 (unused) |
| Textured, not tintable | `asphalt` 6, `sidewalk` 3, `cobble` 2.4, `chain` 0.6 (alpha-tested, double-sided), `crate`, `books`, `helipad`, `awningRed/Blue/Teal/Yellow` 1.2 (double-sided) |
| Plain, vertex-coloured | `paint`, `gloss`, `chrome`, `leaf` (flat-shaded), `rock` (flat-shaded), `marking` (polygon offset -2), `flag` (waving vertex shader, double-sided) |
| Aliases | `rubber` -> `paint` (tint 0x1c1d20), `cloth` -> `paint`, `dark` -> `gloss`, `decal` -> `marking` |
| Fixed colour | `glass` (transparent, render order 2), `bulb` (emissive, handed to `lighting.addLamp`), `lightRed` (unused), `lightGreen`, `lightAmber`, `water` (ripple normal map, render order 1), `spray`, `sprayCone` (`MeshBasicMaterial`) |
| Factories (cached per `initMaterials`) | `M.sign(text, opts)` (one material + `CanvasTexture` per text and options; `opts.glow` makes it emissive), `M.poster(kind)`, `M.rug(a, b, c)` |

- `noShadow` is set on: `plaster, tiles, checker, floorWood, books, leaf, soil, chrome, thatch, plate, asphalt, sidewalk, cobble, chain, helipad, marking, decal, glass, bulb, light*, water`, posters and rugs.
- Animated material state lives in `userData`: `M.water.userData.ripple` (texture whose offset `update` scrolls) and `M.flag.userData.time` (uniform object).
- Signs and posters are repainted when `fontReady` (`src/propkit.js`) resolves, because the first paint may happen before Fredoka has loaded.
- Per-building colour comes from `tint`, never from a new material. Use `TINT` or a hex literal.

### 4.3 The kit catalogue (`kit.js`)

Every function takes the batch `B` first and draws in its current frame. "solid" = registers a collider.

Structure:

| Builder | Parameters and behaviour |
|---|---|
| `wall(B, x0, x1, z, y0, h, t, o)` | Wall along local x at `z`, from `y0` up `h`, thickness `t`. `o.openings` (sorted, non-overlapping), `o.out` (+1/-1: which z side is outside), `o.mat`, `o.tint`, `o.inner: { mat, tint }` (two layers), `o.plinth: { mat, tint, h }`, `o.solid` (false = no colliders), trim options `noTrim, frameTint, inside, leaf, leafTint, sashTint, noTransom, glass, sillTint, shutters, flowerBox` |
| `wallZ(B, z0, z1, x, y0, h, t, o)` | Same along local z at `x`; opening positions are z values; `o.out = +1` means outside toward `+x` |
| `room(B, x0, z0, x1, z1, y0, h, t, sides, o)` | Four walls on the rectangle's edges. `sides.n / s / e / w` = openings array or `false` to omit. `n`/`s` openings use x, `e`/`w` use z |
| `door(x, w = 2.0, h = 2.6, extra)` | Opening descriptor, kind `door`: an open passage with frame, threshold and an open leaf drawn against the inside wall (`leaf: false` to omit, `leafTint`) |
| `win(x, w = 1.4, y = 0.95, h = 1.4, extra)` | Kind `window`: frame, sash, glass pane and sill. The pane has a collider unless the wall has `glass: false` or `solid: false` |
| `gap(x, w, h)` | Kind `open`: a bare hole, no trim |
| `slab(B, x0, z0, x1, z1, yTop, th, holes, o)` | Floor with its top at `yTop`, minus rectangular `holes` `[[x0, z0, x1, z1], ...]`, split into strips, each solid. `o.mat`, `o.tint`, `o.under: { mat, tint }` (ceiling finish), `o.solid` |
| `stairs(B, x, y0, z, yaw, w, rise, run, o)` | Flight rising along local `+z`. Visual steps of about 0.27 m plus one ramp collider. `o.style: 'open'` (treads + stringers), `o.base`, `o.nosing`, `o.mat/tint`, `o.stringerMat/Tint`, `o.rails: ['left' | 'right']` (left = local `-x`; each rail is solid), `o.railTint`. Returns `{ n, sh, tr }` |
| `railing(B, x0, z0, x1, z1, y, o)` | Posts + top rail standing on `y`. `o.h` (1.0), `o.style` (`'glass'`, `'bars'`, default mid-rail), `o.spacing`, `o.mat`, `o.tint`, `o.solid`, `o.colliderH` |
| `gableRoof(B, x0, z0, x1, z1, y, rise, o)` | Ridge along local x, eaves at `y`. Both planes solid. `o.mat/tint`, `o.ov` overhang (0.55), `o.t` wall thickness, `o.wallMat/wallTint` and `o.gables` for the gable triangles, `o.trimTint`, `o.gutter`, `o.gutterTint`, `o.groundY`, `o.ridgeTint`, `o.vent`, `o.chimney: { x, z, above, w, d }`. For a ridge along z, wrap the call in a frame with yaw `PI / 2` |
| `chimney(B, x, z, y0, h, w, d)` | Brick stack with cap and pots, no collider |
| `pyramidRoof(B, mat, x, y, z, hx, hz, rise, tint, solid = true)` | Four-sided cone; collider is a low box |
| `flatRoof(B, x0, z0, x1, z1, y, o)` | Slab with its top at `y + 0.25`, parapet with coping (`o.parapet` height, 0 = none; `parapetMat/Tint`, `copingTint`), fascia (`o.fascia`, `fasciaTint`), `o.holes`, `o.mat/tint`, `o.under` |
| `sign(B, text, x, y, z, w, h, opts, yaw)` | Text panel facing `+z` on a backing board; `opts` = `paintSign` options plus `glow`, `board` (false = no board), `boardTint`, `back` (second face). Returns the material |

Props (all `(B, x, y, z, ...)` with `y` = the surface they stand on):

| Group | Builders |
|---|---|
| Exterior | `acUnit(.., yaw)` solid, `wallAC(.., yaw)`, `waterTank` solid, `solarPanel(.., yaw)`, `antenna(.., h = 3)`, `sconce` |
| Seating / tables | `sofa(.., yaw, tint, len = 2.2)` solid, `armchair(.., yaw, tint)` solid, `chair(.., yaw, tint)`, `table(.., yaw, w, d, { h, tint, mat, legTint, solid })`, `diningSet(.., yaw, n, tint)`, `coffeeTable(.., yaw)`, `stool(.., tint)`, `cafeTable(.., { top, chairs, chair, rot, umbrella })` solid, `bench(.., yaw, { len, tint, back })` solid |
| Rooms | `bed(.., yaw, tint, double = true)` solid, `bookshelf(.., yaw, w, h)` solid, `wardrobe(.., yaw, w, tint)` solid, `kitchen(.., yaw, len, { tint, upper })` solid, `fridge(.., yaw)` solid, `tvUnit(.., yaw)` solid, `desk(.., yaw, { tint, chairTint })` solid, `counter(.., yaw, len, { mat, tint, topTint })` solid, `plant(.., s, tint)`, `floorLamp`, `rug(B, x, y, z, w, d, mat, yaw)` |
| Industrial | `shelfRack(.., yaw, len, h, { tint, seed })` solid, `lockers(.., yaw, n)` solid, `consoleDesk(.., yaw, len)` solid, `serverRack(.., yaw)` solid, `crate(.., s = 1, yaw, solid = true)`, `barrel(.., tint, solid = true)`, `pallet(.., yaw, load, seed)` (`load` 0 empty, 1 boxes, 2 barrels) solid, `container(.., yaw, { len: 6.06 or 12.19, color, open, logo })` (closed = one box collider; `open` = walkable floor, walls and roof) |
| Street | `trashBin(.., tint)` solid, `planter(.., w, d, { mat, tint, flowers })` solid, `mailbox(.., yaw, tint)`, `hydrant`, `streetLamp(.., yaw, { h, tint })` solid pole, returns the bulb's world position, `utilityPole(.., yaw)` solid, returns 3 insulator world points, `cable(B, a, b, sag, segs, tint)` between two world points (call it at the batch's root frame), `billboard(.., yaw, text, { w, h, lift, poster, backPoster, ...sign opts })` solid posts |
| Linear, `(B, x0, z0, x1, z1, ...)` | `hedge(.., h = 1.3, y = 0)`, `stoneWall(.., h = 1.1, y = 0, { tint, cap })`, `picketFence(.., { h, tint, y, solid })`, `railFence(.., { tint, y, solid })`, `boardFence(.., { h, tint, y })`, `chainFence(.., { h, y, wire })`; all solid |
| Other | `car(.., yaw, color, type, { stripe, roofRack })` with `type` in `sedan, hatch, suv, van, pickup`, one box collider; `flag(B, x, y, z, bands, w, h, yaw)` waving flag hanging toward local `+x` |

### 4.4 Colliders

- All static physics goes through `staticBox`, `staticPrism` or `staticTris` (usually via `Batch.solid*` or a kit option). Each lands in the `ColliderSoup` of the 32 m cell (`SOUP_CELL`) that contains its centre.
- `flushColliders()` turns each soup into one fixed Rapier trimesh (`addFixed`, friction 0.8). The terrain triangles, the boundary fence, buildings, props and trunks all share these trimeshes. A box costs 12 triangles, a prism `4n - 4`.
- Reason (from the code comments): thousands of small fixed colliders cost Rapier about 2.5 ms per step and a heightfield makes the character controller 3 to 10 times slower per query; the merged layout steps in about 0.1 ms.
- Consequences: individual static colliders cannot be removed or moved after the flush; anything registered after `flushColliders()` is never created in that build.
- Walkability: the player's controller (`src/config.js PHYSICS`) autosteps 0.45 m and climbs slopes up to 50 deg. Kerbs, plinths and single steps up to 0.45 m need no stairs. `stairs` uses a ramp, so keep `rise / run` well under `tan(50 deg)` = 1.19 (existing flights are about 0.5 to 0.8).

### 4.5 Registries

| What | How to register | When it is consumed |
|---|---|---|
| Loot spot | `ctx.loot({ x, y, z })`; inside a frame use `ctx.loot(B.P(x, y, z))`. `y` is the surface the crate stands on | Returned as `lootSpots`; `game/loot.js` builds one crate per entry |
| Spawn area | Edit `SPAWNS` in `layout.js` (keys must stay `blue` and `orange`) | Returned as `spawnAreas`; `match.js` picks a walkable nav cell within `r` |
| Landmark | Add to `DISTRICTS` | Map labels, devview digit keys |
| Lamp | `ctx.lamp(point, prio)`; `streetLamp` returns a suitable point | Stage 8 picks by priority and spacing |
| Animation | `ctx.anim((dt, elapsed) => { ... })` | Every frame in `island.update` |
| Scatter exclusion | `occupy(...)` / `occupyCircle(...)` from `layout.js` | `isFree` in `scatter` (stage 5) |
| Vegetation | `ctx.nature.tree(...)` etc. | `nature.build` (stage 6) |

With the current candidates the 16 light slots are filled by the priority-3 plaza lamps and priority-2 lamps (relay, dock, beach, then ring lamps in registration order); priority-1 lamps only glow through `M.bulb`.

## 5. Recipes

### 5.1 Add a new district

1. `layout.js`: add `DISTRICTS.<id> = { name, x, z }` (map label, devview key). If the site is not already flat, add a `FLAT_RECTS` or `FLAT_CIRCLES` entry covering the footprint with a margin, and check it does not flatten a hill you want (`hills`).
2. Create `src/world/<id>.js` exporting `build(ctx)`. Create `const B = new Batch('<id>')`, draw with `B.span/box/cyl` and kit builders, finish with `B.build(ctx.root, true)` and `occupy(x0, z0, x1, z1)` for the whole footprint.
3. `index.js`: import the module and append it to the `districts` object. Append, do not insert: the position decides the loot indexes of everything after it.
4. Register loot (`ctx.loot`), lamps (`ctx.lamp`) and animations (`ctx.anim`).
5. Connect it: a `ROADS` entry and/or a `DIRT_PATHS` entry (5.7).
6. Check the hand-placed lists in `fields.js scatter` (`walls`, `clumps`, logs): `walls` entries are not tested against `isFree` and will be built through your district.
7. If it should be a votable map, that is outside this folder: `MAPS` in `src/config.js` and `MAP_FOCUS` in the backend's `rules.ts`.
8. Test (5.9): jump to it, walk through every door and stair with `walkTest`, compare `probe` against expected floor heights.

### 5.2 Add a prop or building to a district

1. Find the district's `build` (or the private builder for the right building) and add the call there. Positions are world coordinates unless the code is inside a `B.push(...)` frame.
2. Buildings: `slab` for the floor, `wall`/`wallZ`/`room` with `door`/`win`/`gap` openings, `flatRoof` or `gableRoof`, `stairs` for upper floors. Give exterior walls `inner: { mat: M.plaster, tint }` so interiors are finished.
3. On sloped ground take `y` from `ctx.ground(x, z)` (see `lookout.js`, `beach.js`); on the flat zones `y = 0` plus the local paving height.
4. If it falls outside the district's existing `occupy` rectangle, reserve it, otherwise scatter may plant a tree inside it.
5. Give cover-sized things colliders (`solid: true`, or the kit prop's built-in one); leave small decor without.

### 5.3 Add a kit piece

1. Add an exported function in `kit.js` with the shape `(B, x, y, z, yaw, ...opts)`. Wrap the body in `B.push(x, y, z, yaw)` / `B.pop()` and model it facing `+z` with its base at local `y = 0`.
2. Use existing `M.*` materials and colour with `tint`. A new material adds a draw call (and a shadow-pass draw call) to every batch that uses it.
3. Round parts: `B.cyl` with an explicit `seg`. Use `seg >= 10` only where the silhouette matters, so lower presets can reduce it.
4. Add one collider that approximates the whole prop (`B.solid(...)` or `solid: true` on the main box), not one per part.
5. If callers need a point on it (a bulb, a cable anchor), compute it with `B.P(...)` before `B.pop()` and return it.

### 5.4 Add loot spots or change spawn areas

- Loot: call `ctx.loot` where the crate should stand. Put new calls at the end of the build order when you can (a new district appended last, or after existing calls) so existing indexes do not shift. The backend accepts crate indexes `0..199` (`LOOT.crates` in `rules.ts`).
- Spawns: edit `SPAWNS`. Then (a) make sure the circle is walkable open ground, (b) move the cover in `scatter`'s `walls` list that was placed "just outside the spawn circle", (c) check `DIRT_PATHS` footpaths that lead to the old fields. The initial player position (`main.js`), first spawns (`match.js spawnActor`) and the results line-up (`results.js`) read `spawnAreas`; no copy of these coordinates was found in the backend's `rules.ts`.

### 5.5 Move or resize a district

`DISTRICTS` alone moves only the label (except `plaza`'s fountain and `lookout`'s tower). To really move one, change every item in its row:

| District | Change |
|---|---|
| Villa | `villa.js` is written around the origin: wrap the body in a `B.push`/`G.push` frame or shift the constants; `occupy`; `FLAT_CIRCLES`; the avenue ends at the ring road (`z = 41.4`) |
| Maple Row | `LOTS[].x`, `SET`, the street sign and street trees in `maple.js`; `occupy` is derived per lot; `ROADS.east`, `PADS[0]`, `FLAT_RECTS[0]`; parked cars, poles and hydrants in `roads.js` |
| Fountain Plaza | `PX0..PZ1` in `plaza.js`, `DISTRICTS.plaza` (fountain), cafe call, `occupy`; `ROADS.plazaLink`; `FLAT_RECTS[1]` |
| Relay Station | `AX0..AZ1`, helipad/mast/building/fuel-depot numbers in `relay.js`, `occupy`; `ROADS.north` ends at the apron; `FLAT_RECTS[2]` |
| Dockyard | `DOCK` (moves the apron, quay, pier, terrain cut and boundary notch together); absolute numbers in `dock.js` (warehouse, yard list, gantry, gate); `occupy`; `FLAT_RECTS[3]`; the dock exclusion in `scatter`'s north-shore boulder loop |
| Sunset Beach | `BZ`, the x lists and `occupy` in `beach.js`; `PADS[1]`; `FLAT_RECTS[5]`; car park cars in `roads.js` |
| Old Farm | Rectangles passed to `barn`, `silo`, `cropField`, `windmill` and the prop coordinates in `farm.js`; `occupy`; `DIRT_RECTS`, `DIRT_PATHS[1]`; `ROADS.farmTrack`; `FLAT_RECTS[4]` |
| Lookout | `DISTRICTS.lookout` and the first Gaussian in `hills` (the hill must stay under the tower); `DIRT_PATHS[0]` |

If the district is a votable map, also update `MAPS[].focus` (`src/config.js`) and `MAP_FOCUS` (backend).

### 5.6 Change terrain height or shape

- Coastline: edit `CTRL` (radius every 30 deg) or the harmonics in `shoreR`. Beach width: `beachW`. Cliffs: `CLIFF_A`, `CLIFF_HALF`, the `4.4` height in `terrainHeight`.
- Hills: add or edit a Gaussian in `hills` (`amplitude * gauss(x, z, cx, cz, sigma)`). Rolling ground: `undulate`.
- Flatten an area: `FLAT_RECTS` / `FLAT_CIRCLES`.
- Ground colour: `DIRT_PATHS` / `DIRT_RECTS`; sand, rock and grass follow from the shape automatically.
- The mesh, the collider and `groundHeight` all derive from `terrainHeight` sampled every 2 m, so features narrower than about 4 m are lost. Districts drawn at fixed heights must stay inside flat zones. Slopes above 50 deg are not walkable.
- If the island grows, also check `EXTENT` (160), `bounds` (150), the returned `radius` and the backend's `ISLAND_RADIUS`.

### 5.7 Add a road

1. Append `{ id, pts, half, kind: 'asphalt', walk }` to `ROADS`. Earlier entries win junction corners, so put minor roads last.
2. Terrain flattens under it and scatter avoids it automatically (`roadDist`). The ribbon is drawn at a fixed height, so the road must lie on the `y = 0` plateau (inland of the beach, off the hills, or the hills must be flattened by the road's own `flatMask` term).
3. `buildRoads` draws the asphalt, edge lines, double-yellow centre line and sidewalks. For a dashed centre line add the id to the test in `markings`. For a zebra crossing add the id to the zebra loop. For lamps add `spoke('<id>', spacing)`; `spoke` assumes a straight road and uses only its first and last points.
4. A dirt road: `kind: 'dirt'` in `ROADS` gives flattening and scatter clearance only; nothing is drawn. Paint it with a `DIRT_PATHS` entry.
5. A new pad: add to `PADS`; `buildRoads` handles circles (with a sidewalk ring whose gap faces west) and rects (kerbs with an entrance at `abs(x) < 4.2` on the north side, bay lines) with those specifics hard-coded.

### 5.8 Add something animated

1. Build the moving part in its own batch and group: `const T = new Batch('name'); ...; const g = new Group(); T.build(g, true); g.position.set(...); ctx.root.add(g)`. Model it around the group's pivot (see `windmill`, `gantry`, the windsock).
2. `ctx.anim((dt, elapsed) => { g.rotation.x += dt * 0.6 })`. Do not allocate in the callback.
3. For blinking, toggle `group.visible` (relay beacons). For many small movers use one `InstancedMesh` and update matrices (fountain droplets; set `frustumCulled = false` if instances move outside the initial bounds).
4. For shader motion reuse the existing uniforms: `M.flag` waves on its own, `M.water` ripples, `windify` materials sway.
5. Moving parts have no physics: only static colliders exist. Put a static collider where the part rests if it must block (the gantry legs are solid, the trolley is not).

### 5.9 Test with `world-test.html`

Run `npm run dev` and open `/world-test.html` on the dev server. `?q=Low|Medium|High|Ultra` picks the preset (default `High`).

| Key | Action |
|---|---|
| W A S D | Fly (or walk in walk mode) |
| Drag | Look |
| Shift | Fast (60 m/s instead of 16) |
| Q / E or Space | Down / up |
| 1..8 | Jump to district `landmarks[n - 1]` (villa, maple, plaza, relay, dock, beach, farm, lookout) |
| 0 | Top-down view from 260 m |
| B | Drop a 1.8 m reference box where the camera looks |
| N | Toggle day/night |
| F | Toggle walk mode: the game's capsule dropped under the camera; Space jumps |

The HUD shows fps, draw calls, triangles, build time, collider count, camera position and ground height.

`window.__wv`:

| Member | Use |
|---|---|
| `island` | The `buildIsland` result (`island.timings`, `island.colliders`, `island.lootSpots`, ...) |
| `camera`, `scene`, `renderer`, `world`, `lighting` | Raw handles (`world` is the Rapier world) |
| `setView(x, y, z, yaw, pitch)`, `lookFrom(x, y, z, tx, ty, tz)`, `jump(i)` | Camera placement; `jump` takes a 0-based landmark index |
| `dropBox(x?, z?)` | Reference box at a point, or at the view centre |
| `probe(x, z, from = 60)` | Ray straight down onto the colliders; returns the hit height or `null`. Compare with `island.groundHeight(x, z)` to find floors, roofs and holes |
| `walkTest(start, waypoints, { speed = 6, maxSteps = 4000, tol = 0.6 })` | Walks the capsule from `start` (`{ x, z, y? }`) through `waypoints` (`{ x, z, y? }`); returns `{ reached, of, end, steps, trace }`. `reached < of` means it got stuck |
| `placeWalker(x, y, z)`, `walkStep(vx, vz, dt, jumpNow)` | Manual control of the same capsule; `walkStep` returns the feet position |
| `info()` | `renderer.info.render` plus geometry and texture counts and `buildMs` |

Notes: the render loop is `renderer.setAnimationLoop`, so in a hidden browser pane frames stop; call `__wv.renderer.render(__wv.scene, __wv.camera)` yourself after `setView`. The renderer has `preserveDrawingBuffer: true`, so `renderer.domElement.toDataURL()` captures work. `walkTest` and `probe` step physics themselves and do not need rendering. Checks to run after a change: draw calls and triangles for the affected district view, `island.colliders`, `walkTest` through new doors and stairs, and a `?q=Low` pass.

## 6. Gotchas and invariants

Ordering:

- `M` is `null` until `initMaterials()`. Never read `M.something` at module top level in a world file; only inside functions called from `build`.
- The physics world must exist before `buildIsland`. After it returns, a `world.step()` is needed before ray casts and the character controller see the new colliders (`devview.js` does this explicitly).
- Districts must run before `scatter` (occupancy), all `ctx.nature.*` calls before `nature.build`, and every static collider before `flushColliders()`. A collider registered later (for example from an `anim` callback) silently never exists.
- `ctx.ground` returns grid heights only after `buildTerrain`; that is always the case inside district builds.
- District order and the order of `ctx.loot` calls define crate indexes. Clients must agree on them: the crate index is what `open` messages and the server's opened-crate map carry.
- `ROADS` order is junction priority. `ROADS[0]` must stay the ring: several functions special-case `id === 'ring'` and compute it from `RING.r`.

Determinism across clients:

- `scatter` draws from one seeded stream and rejection-samples against the occupancy registry. Any change to a district footprint, a road, a spawn circle or the hand-placed lists changes which candidates are accepted and therefore moves trees, bushes and rocks everywhere after that point in the stream.
- The `q`-dependent draws (flowers, tufts) are the last block of `scatter`, so they do not disturb the collider-bearing placements before them. Do not add `q`-dependent random draws anywhere before that block, and do not make anything with a collider or a loot spot depend on `q` or on `Math.random()`.

Mirrored outside this folder:

| Here | Elsewhere |
|---|---|
| `radius: 125` in `buildIsland`'s return | Backend `ISLAND_RADIUS = 125` (`rules.ts`), client fallback in `game/zone.js` |
| `DISTRICTS.villa / farm / dock` positions | `MAPS[].focus` in `src/config.js` and `MAP_FOCUS` in the backend (same order) |
| `lootSpots.length` (52) | Backend `LOOT.crates = 200` upper bound for crate indexes |
| Capsule and controller numbers in `devview.js` | `PLAYER_DIMS` and `PHYSICS` in `src/config.js` (hard-coded copies) |
| `WATER.level` | Imported from `src/config.js` by `terrain.js`; `layout.js` hard-codes the matching `-0.6` shore profile |

Geometry and physics:

- `groundHeight` is terrain only. Floors, roofs and decks are colliders; use the physics world (nav grid, `probe`) for standing height.
- Windows block movement and shots: every `win` gets a thin pane collider unless `glass: false`. Doors (`door`) and `gap`s are open.
- `room` and `wallZ` take opening positions along z for the east/west walls.
- `Batch.solidCyl` is always an upright prism. A lying cylinder marked `solid` gets the wrong shape; use `B.solid` (see the round `hayBale`).
- `Batch.box` ignores `s/sx/sy/sz` unless `faceUV` is set.
- `slab` holes and wall openings must lie inside the slab/wall; openings must not overlap.
- Terrain cells deeper than -3.2 have no triangles (no seabed collider out at sea). The boundary fence is what keeps players out; it is 8.5 m high and follows the quay and pier in the dock.
- Roads, sidewalks, district paving and ground floors are drawn at fixed heights (0.04 to 0.4 m above the plateau) and rely on the flat zones.
- The moored boat and all moving parts have no colliders.

Rendering cost:

- One mesh per material per batch, each with a bounding sphere covering the whole district, so a district is drawn in full whenever any of it is in view. Splitting a district into several batches adds draw calls; adding a material to a batch adds one (two with shadows).
- Vegetation must go through `ctx.nature` (instanced), not through a `Batch`.
- Only `MAX_LAMPS` point lights exist; every extra `PointLight` is paid by all lit fragments. All bulbs share `M.bulb`.
- `island.update` runs every frame: keep `anim` callbacks allocation-free and cheap.
- Transparent materials (`glass`, `water`, shallow rim, foam, spray) depend on their `renderOrder`; keep new transparent surfaces on existing materials.

State and disposal:

- Module-level state: the height grid in `terrain.js`, the soup grid and detail in `geom.js`, the occupancy registry in `layout.js`, `M` in `materials.js`, the wind uniform in `nature.js`. Only one island can exist at a time; a second `buildIsland` replaces `M` and the height grid.
- `dispose()` removes the trimesh colliders and geometries only. Materials, textures (including every sign texture), the point lights added through `lighting.addLamp` and the loot crates built by `game/loot.js` are not released.
- `M.sign` caches by text + options. Mutating the returned material affects every sign with the same key (`container` sets `transparent` and `alphaTest` on its logo material).

## 7. Observations

Things noticed while reading; none were changed.

Stale or inconsistent comments:

- `index.js` header says the lamp cap is 8 "when particles < 0.5"; the code tests `detail < 0.5` (`detail` falls back to `particles`). The JSDoc type for `preset` omits `detail`.
- `buildIsland` clamps detail to 0.2..1, `setGeomDetail` to 0.3..1, and `nature.build` reads `preset?.detail ?? 1` without the `particles` fallback.
- `roads.js` comments mention a zebra crossing "on the ring at the villa gate"; only the four spoke crossings are built.
- `paint.js` header says all painters return `{ color, normal? }`; eight return a bare canvas and two return `{ canvas, draw }`.
- `game/loot.js` header says "~45" crates; the island registers 52 spots by count of the calls.
- `src/lighting.js` labels its lamp list "none placed right now", but the island adds up to 16.
- The frontend `CLAUDE.md` summary of the return value omits `colliders`. Its "~80 trimeshes" figure was not measured here.

Dead or unused code:

- `fields.js scatter`: `cliffMask(Math.atan2(z, x)) * 0 > 0` is always false.
- `ROADS[].closed` is never read. `ROADS.farmTrack` (dirt) is never drawn; it only feeds `roadDist`.
- `roads.js` has its own copy of `segDist` (also in `layout.js`).
- Unused exports: `geom.js` `boxGeo`, `yawQ`, `Y_AXIS` (and `ColliderSoup` is only used inside the file); `terrain.js` `EXTENT` (internal only), `GRID_CELLS`, `GRID_CELL`, the `Vector2` import/re-export, plus a second separate `import { Matrix4 }` line; `nature.js` re-export of `Matrix4`; `materials.js` `color`; `layout.js` `inlandOf`; `kit.js` `DOOR_W`, `DOOR_H`, `lighten` are only used inside `kit.js`.
- Unused materials: `M.metalH`, `M.rockTex`, `M.lightRed`.
- Unused return values: `buildTerrain`, `buildBoundary`, `buildRoads`, `nature.build`. The numeric form `ctx.loot(x, y, z)` has no callers.
- `island.dispose()` and `island.root` have no callers outside `index.js`.

Behaviour worth a second look:

- `ctx.loot` keeps only `x, y, z`, while `game/loot.js` reads an optional `s.yaw` and otherwise uses `Math.random()`. Crate rotation, and the crate's box collider, therefore differ per client.
- `devview.js` jumps at 8.5 m/s while the game's `PHYSICS.jumpSpeed` is 7.6, so jump reachability in walk mode is optimistic. It also does not call `setTextureQuality`, so `texScale` is not exercised in the harness.
- Most districts ignore `DISTRICTS` for placement (section 5.5), so editing `layout.js` alone moves labels, not buildings.
- `kit.js utilityPole` adds a transformer when `yaw % 2 > 1`, which depends on the numeric yaw value (true for `PI / 2`, false for `0` and `0.2`).
- `relay.js` creates its mast-light material with `neon()` from `src/propkit.js`, the only world material not in `M`.
- `maple.js houseA` passes `chimney` to `gableRoof` and also calls `chimney()` at the same spot (a lower stack inside the house plus the roof stack); looks intentional.
- Lamp selection gives every light slot to priority 2 and 3 candidates, so the spoke, villa-avenue and pier lamps registered with priority 1 never receive a point light at the current cap.
- Nothing in `src/world/` touches currency or purchases; the brand names on signs and posters (FIZZ COLA, ZOOM ENERGY, CAFE AROMA, OCEANIX, BLUWAVE) are invented, consistent with `CLAUDE.md`.
