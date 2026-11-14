// Draw-call savers for the many-part models (characters, weapons): plain
// coloured parts are merged into one mesh whose colours live in the vertices,
// so a whole limb or a whole gun is one draw call. Parts that need their own
// material (a texture map, an emissive glow) are kept as they are.
import { BufferAttribute, Group, Matrix4, Mesh, MeshStandardMaterial } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

const rel = new Matrix4()

const special = (m) => Array.isArray(m) || !!m.map || (m.emissiveIntensity > 0 && m.emissive && m.emissive.getHex() !== 0) || m.transparent

function coloured(mesh, matrix) {
  const g = mesh.geometry.clone().applyMatrix4(matrix)
  const n = g.attributes.position.count
  const c = new Float32Array(n * 3)
  const col = mesh.material.color
  for (let i = 0; i < n; i++) {
    c[i * 3] = col.r
    c[i * 3 + 1] = col.g
    c[i * 3 + 2] = col.b
  }
  g.setAttribute('color', new BufferAttribute(c, 3))
  for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(name)) g.deleteAttribute(name)
  if (!g.attributes.uv) g.setAttribute('uv', new BufferAttribute(new Float32Array(n * 2), 2))
  if (!g.index) {
    const idx = new Uint32Array(n)
    for (let i = 0; i < n; i++) idx[i] = i
    g.setIndex(new BufferAttribute(idx, 1))
  }
  g.clearGroups()
  return g
}

// Merges the plain meshes that are direct children of `parent` into one vertex-coloured mesh.
export function mergeChildren(parent, material, { castShadow = true } = {}) {
  const plain = parent.children.filter((c) => c.isMesh && !special(c.material))
  if (plain.length < 2) {
    for (const m of plain) {
      const merged = mergeGeometries([coloured(m, rel.compose(m.position, m.quaternion, m.scale))])
      const mesh = new Mesh(merged, material)
      mesh.castShadow = castShadow
      mesh.receiveShadow = true
      mesh.userData.ownGeometry = true
      parent.remove(m)
      parent.add(mesh)
    }
    return
  }
  const geos = plain.map((m) => {
    m.updateMatrix()
    return coloured(m, m.matrix)
  })
  const merged = mergeGeometries(geos)
  for (const g of geos) g.dispose()
  for (const m of plain) parent.remove(m)
  if (!merged) return
  const mesh = new Mesh(merged, material)
  mesh.castShadow = castShadow
  mesh.receiveShadow = true
  mesh.userData.ownGeometry = true
  parent.add(mesh)
}

// A whole weapon (any depth) -> one vertex-coloured mesh + its special parts, in the root's frame.
// Moving parts (groups with userData.part, see weaponModels.js part()) are baked on their own into
// a child group named `part:<name>` that keeps the part's pivot transform, so it can be animated.
export function bakeWeapon(root, { metal = false, material = null } = {}) {
  root.updateMatrixWorld(true)
  const inv = root.matrixWorld.clone().invert()
  const out = new Group()
  const geos = []
  const keep = new Map() // material -> geometries
  const parts = []
  const inPart = (o) => {
    for (let p = o.parent; p && p !== root; p = p.parent) if (p.userData.part) return true
    return false
  }
  root.traverse((o) => {
    if (o !== root && o.userData.part && !inPart(o)) parts.push(o)
    if (!o.isMesh || inPart(o)) return
    rel.multiplyMatrices(inv, o.matrixWorld)
    if (special(o.material)) {
      if (!keep.has(o.material)) keep.set(o.material, [])
      const g = o.geometry.clone().applyMatrix4(rel)
      for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name)
      if (!g.index) {
        const n = g.attributes.position.count
        const idx = new Uint32Array(n)
        for (let i = 0; i < n; i++) idx[i] = i
        g.setIndex(new BufferAttribute(idx, 1))
      }
      g.clearGroups()
      keep.get(o.material).push(g)
    } else geos.push(coloured(o, rel))
  })
  const mat = material || new MeshStandardMaterial({ vertexColors: true, roughness: metal ? 0.3 : 0.5, metalness: metal ? 0.85 : 0.4 })
  if (geos.length) {
    const m = new Mesh(mergeGeometries(geos), mat)
    m.castShadow = true
    out.add(m)
  }
  for (const [material, list] of keep) {
    const m = new Mesh(mergeGeometries(list), material)
    m.castShadow = true
    out.add(m)
  }
  for (const g of geos) g.dispose()
  for (const p of parts) {
    const baked = bakeWeapon(p, { metal, material: mat })
    baked.name = `part:${p.userData.part}`
    // The part's pivot in the root's frame.
    rel.multiplyMatrices(inv, p.matrixWorld)
    rel.decompose(baked.position, baked.quaternion, baked.scale)
    out.add(baked)
  }
  return out
}
