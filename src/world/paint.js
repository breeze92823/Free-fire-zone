// Island-specific canvas painters (the shared ones live in ../textures.js).
// All tile seamlessly unless noted, are at most 512 px, and return
// { color, normal? } canvases. Many are painted light/neutral on purpose so a
// material's vertex colours can tint one texture many ways (stucco, shingles,
// corrugated metal, boards).
import { fbm, heightToNormal, mulberry32 } from '../textures.js'

function canvas(w, h = w) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

function rgb(hex) {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)

// Fill a canvas pixel by pixel: fn(x, y, i) -> writes into out[0..2] (0..255).
function pixels(size, fn) {
  const c = canvas(size)
  const ctx = c.getContext('2d')
  const img = ctx.createImageData(size, size)
  const out = [0, 0, 0]
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x
      fn(x, y, i, out)
      img.data[i * 4] = out[0]
      img.data[i * 4 + 1] = out[1]
      img.data[i * 4 + 2] = out[2]
      img.data[i * 4 + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return c
}

// Draw at (x, y) and the wrapped copies so a stroke crossing an edge tiles.
function wrapped(size, x, y, r, draw) {
  for (const ox of [-size, 0, size]) {
    for (const oy of [-size, 0, size]) {
      if (x + ox + r < 0 || x + ox - r > size || y + oy + r < 0 || y + oy - r > size) continue
      draw(x + ox, y + oy)
    }
  }
}

// --- Ground --------------------------------------------------------------------------

// Bright cartoon grass: mottled base + thousands of short blade strokes.
export function paintGrassTop(size = 512, seed = 71) {
  const rand = mulberry32(seed)
  const mott = fbm(size, 6, 4, seed + 1)
  const a = rgb('#4caf34')
  const b = rgb('#72cf48')
  const c = pixels(size, (x, y, i, o) => {
    const t = mott[i]
    for (let k = 0; k < 3; k++) o[k] = a[k] + (b[k] - a[k]) * t
  })
  const ctx = c.getContext('2d')
  const greens = ['#3e9d2a', '#4fb434', '#5cbf3c', '#6ccc46', '#82d85a', '#47a530', '#93e06a']
  ctx.lineCap = 'round'
  for (let i = 0; i < 14000; i++) {
    const x = rand() * size
    const y = rand() * size
    const len = 3 + rand() * 7
    const lean = (rand() - 0.5) * 4
    ctx.strokeStyle = greens[Math.floor(rand() * greens.length)]
    ctx.lineWidth = 1 + rand() * 1.2
    wrapped(size, x, y, len + 5, (px, py) => {
      ctx.beginPath()
      ctx.moveTo(px, py)
      ctx.lineTo(px + lean, py - len)
      ctx.stroke()
    })
  }
  // a few tiny clover / daisy dots
  for (let i = 0; i < 90; i++) {
    const x = rand() * size
    const y = rand() * size
    ctx.fillStyle = rand() < 0.5 ? 'rgba(255,255,255,0.55)' : 'rgba(255,236,120,0.5)'
    wrapped(size, x, y, 3, (px, py) => {
      ctx.beginPath()
      ctx.arc(px, py, 1.3, 0, Math.PI * 2)
      ctx.fill()
    })
  }
  return { color: c }
}

// Warm beach sand with ripples.
export function paintBeachSand(size = 256, seed = 88) {
  const f = fbm(size, 8, 5, seed)
  const rand = mulberry32(seed + 3)
  const a = rgb('#e2c48a')
  const b = rgb('#f7e2b0')
  const h = new Float32Array(size * size)
  const c = pixels(size, (x, y, i, o) => {
    const ripple = 0.5 + 0.5 * Math.sin((y / size) * Math.PI * 2 * 6 + f[i] * 5)
    const t = clamp01(f[i] * 0.75 + rand() * 0.18 + ripple * 0.12)
    h[i] = ripple * 0.5 + f[i] * 0.5
    for (let k = 0; k < 3; k++) o[k] = a[k] + (b[k] - a[k]) * t
  })
  return { color: c, normal: heightToNormal(h, size, 1.2) }
}

// Ploughed soil / dirt track.
export function paintSoil(size = 256, seed = 99, furrows = 0) {
  const f = fbm(size, 8, 5, seed)
  const g = fbm(size, 32, 2, seed + 1)
  const a = rgb('#6a4a2f')
  const b = rgb('#9c7550')
  const h = new Float32Array(size * size)
  const c = pixels(size, (x, y, i, o) => {
    let t = f[i] * 0.7 + g[i] * 0.3
    if (furrows) {
      const s = 0.5 + 0.5 * Math.cos((y / size) * Math.PI * 2 * furrows)
      t = t * 0.6 + s * 0.4
      h[i] = s * 0.7 + g[i] * 0.3
    } else h[i] = f[i] * 0.4 + g[i] * 0.6
    for (let k = 0; k < 3; k++) o[k] = a[k] + (b[k] - a[k]) * t
  })
  return { color: c, normal: heightToNormal(h, size, 2) }
}

// Rounded cobblestones (tileable Voronoi) in mortar.
export function paintCobble(size = 512, cells = 9, seed = 123) {
  const rand = mulberry32(seed)
  const pts = []
  for (let gy = 0; gy < cells; gy++) {
    for (let gx = 0; gx < cells; gx++) {
      const shade = rand()
      const warm = rand()
      pts.push({ x: (gx + 0.2 + rand() * 0.6) / cells, y: (gy + 0.2 + rand() * 0.6) / cells, shade, warm })
    }
  }
  const grain = fbm(size, 16, 3, seed + 1)
  const h = new Float32Array(size * size)
  const cool = rgb('#8f9399')
  const warmC = rgb('#b3a898')
  const light = rgb('#c9c4b9')
  const mortar = rgb('#5a564f')
  const c = pixels(size, (x, y, i, o) => {
    const u = x / size
    const v = y / size
    const cx = Math.floor(u * cells)
    const cy = Math.floor(v * cells)
    let d1 = 9
    let d2 = 9
    let own = null
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const gx = cx + ox
        const gy = cy + oy
        const p = pts[((gy + cells) % cells) * cells + ((gx + cells) % cells)]
        const px = p.x + Math.floor(gx / cells)
        const py = p.y + Math.floor(gy / cells)
        const d = Math.hypot(u - px, v - py)
        if (d < d1) {
          d2 = d1
          d1 = d
          own = p
        } else if (d < d2) d2 = d
      }
    }
    const edge = (d2 - d1) * cells // 0 at the seam
    const stone = clamp01((edge - 0.06) / 0.25)
    const dome = Math.sqrt(stone)
    h[i] = dome * 0.8 + grain[i] * 0.15
    const g = grain[i]
    for (let k = 0; k < 3; k++) {
      const base = cool[k] + (warmC[k] - cool[k]) * own.warm
      const s = base + (light[k] - base) * own.shade * 0.6
      const lit = s * (0.82 + g * 0.3) * (0.8 + dome * 0.2)
      o[k] = mortar[k] + (lit - mortar[k]) * stone
    }
  })
  return { color: c, normal: heightToNormal(h, size, 3) }
}

// Dark road asphalt: speckle, patches and a few hairline cracks.
export function paintAsphalt(size = 512, seed = 222) {
  const rand = mulberry32(seed)
  const f = fbm(size, 8, 4, seed)
  const g = fbm(size, 64, 2, seed + 1)
  const h = new Float32Array(size * size)
  const c = pixels(size, (x, y, i, o) => {
    const s = rand()
    let v = 64 + f[i] * 22 + g[i] * 22 + (s > 0.985 ? 40 : s < 0.02 ? -18 : 0)
    h[i] = g[i] * 0.7 + s * 0.3
    o[0] = v
    o[1] = v + 2
    o[2] = v + 6
  })
  const ctx = c.getContext('2d')
  ctx.strokeStyle = 'rgba(25,25,28,0.55)'
  ctx.lineWidth = 1.2
  for (let k = 0; k < 7; k++) {
    let x = rand() * size
    let y = rand() * size
    let a = rand() * Math.PI * 2
    ctx.beginPath()
    ctx.moveTo(x, y)
    for (let s = 0; s < 30; s++) {
      a += (rand() - 0.5) * 0.9
      x += Math.cos(a) * 4
      y += Math.sin(a) * 4
      ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
  return { color: c, normal: heightToNormal(h, size, 1.5) }
}

// Poured concrete: soft stains, pores and slab joints (joints x joints per tile).
export function paintConcrete(size = 512, joints = 2, seed = 314, base = '#bdbbb5') {
  const rand = mulberry32(seed)
  const f = fbm(size, 4, 5, seed)
  const g = fbm(size, 32, 2, seed + 1)
  const col = rgb(base)
  const h = new Float32Array(size * size)
  const cell = size / joints
  const c = pixels(size, (x, y, i, o) => {
    const dx = Math.min(x % cell, cell - (x % cell))
    const dy = Math.min(y % cell, cell - (y % cell))
    const joint = Math.min(dx, dy) < 1.6
    const pore = rand() < 0.01
    const k = (0.86 + f[i] * 0.18 + g[i] * 0.06) * (joint ? 0.62 : 1) * (pore ? 0.8 : 1)
    h[i] = joint ? 0 : 0.6 + g[i] * 0.2 - (pore ? 0.2 : 0)
    o[0] = col[0] * k
    o[1] = col[1] * k
    o[2] = col[2] * k
  })
  return { color: c, normal: heightToNormal(h, size, 1.6) }
}

// --- Walls ------------------------------------------------------------------------

// Grey slate stone wall: irregular courses of rounded stones, light mortar.
export function paintStoneWall(size = 512, seed = 515) {
  const rand = mulberry32(seed)
  const rows = []
  let y = 0
  const sc = size / 512
  while (y < size) {
    let rh = Math.round((46 + Math.floor(rand() * 30)) * sc)
    if (size - (y + rh) < 40 * sc) rh = size - y
    const stones = []
    let x = Math.floor(rand() * 60 * sc)
    const start = x
    while (x < start + size) {
      let w = Math.round((60 + Math.floor(rand() * 80)) * sc)
      if (start + size - (x + w) < 50 * sc) w = start + size - x
      stones.push({ x0: x, x1: x + w, shade: rand(), hue: rand() })
      x += w
    }
    rows.push({ y0: y, y1: y + rh, start, stones })
    y += rh
  }
  const grain = fbm(size, 16, 4, seed + 1)
  const blot = fbm(size, 4, 3, seed + 2)
  const h = new Float32Array(size * size)
  const pal = [rgb('#5b6168'), rgb('#6c727a'), rgb('#4d535a'), rgb('#7b8087'), rgb('#626a70')]
  const mortar = rgb('#a19d94')
  const c = pixels(size, (x, yy, i, o) => {
    const row = rows.find((r) => yy >= r.y0 && yy < r.y1)
    let lx = x
    if (lx < row.start) lx += size
    const st = row.stones.find((s) => lx >= s.x0 && lx < s.x1) || row.stones[0]
    const dx = Math.min(lx - st.x0, st.x1 - 1 - lx)
    const dy = Math.min(yy - row.y0, row.y1 - 1 - yy)
    // rounded-corner distance to the stone edge
    const r = 9 * sc
    let e
    if (dx < r && dy < r) e = r - Math.hypot(r - dx, r - dy)
    else e = Math.min(dx, dy)
    const m = 3.2 * sc + 0.4 // mortar half width
    const inside = clamp01((e - m) / (6 * sc))
    h[i] = inside * (0.7 + grain[i] * 0.3)
    const p = pal[Math.floor(st.hue * pal.length)]
    const k = (0.78 + st.shade * 0.3) * (0.85 + grain[i] * 0.3) * (0.9 + blot[i] * 0.2)
    for (let ch = 0; ch < 3; ch++) {
      const s = p[ch] * k * (0.85 + inside * 0.15)
      o[ch] = mortar[ch] * (0.9 + grain[i] * 0.15) + (s - mortar[ch]) * inside
    }
  })
  return { color: c, normal: heightToNormal(h, size, 3.2) }
}

// Red brick (rows x 4 bricks per tile, alternate rows offset).
export function paintBrick(size = 256, rows = 8, seed = 616) {
  const rand = mulberry32(seed)
  const shades = Array.from({ length: rows * 5 }, () => rand())
  const g = fbm(size, 16, 3, seed + 1)
  const h = new Float32Array(size * size)
  const rh = size / rows
  const bw = size / 4
  const a = rgb('#9b3f2a')
  const b = rgb('#c66345')
  const mortar = rgb('#d3cabd')
  const c = pixels(size, (x, y, i, o) => {
    const r = Math.floor(y / rh)
    const off = r % 2 ? bw / 2 : 0
    const lx = (x + off) % size
    const k = Math.floor(lx / bw)
    const dx = Math.min(lx % bw, bw - (lx % bw))
    const dy = Math.min(y % rh, rh - (y % rh))
    const inside = clamp01((Math.min(dx, dy) - 1.6) / 1.5)
    h[i] = inside * (0.75 + g[i] * 0.25)
    const t = shades[r * 5 + k] * 0.7 + g[i] * 0.3
    for (let ch = 0; ch < 3; ch++) {
      const s = a[ch] + (b[ch] - a[ch]) * t
      o[ch] = mortar[ch] + (s - mortar[ch]) * inside
    }
  })
  return { color: c, normal: heightToNormal(h, size, 2.5) }
}

// Smooth painted render (stucco), near white so vertex colours tint it.
export function paintStucco(size = 256, seed = 717) {
  const f = fbm(size, 8, 5, seed)
  const g = fbm(size, 48, 2, seed + 1)
  const h = new Float32Array(size * size)
  const c = pixels(size, (x, y, i, o) => {
    const v = 236 + (f[i] - 0.5) * 22 + (g[i] - 0.5) * 16
    h[i] = g[i] * 0.6 + f[i] * 0.4
    o[0] = v
    o[1] = v
    o[2] = v - 3
  })
  return { color: c, normal: heightToNormal(h, size, 0.8) }
}

// Light wooden boards along U (siding, floors, furniture), tinted by vertex colour.
export function paintBoards(size = 512, boards = 6, seed = 818, base = '#e9dccb', gap = 2) {
  const rand = mulberry32(seed)
  const warp = fbm(size, 4, 3, seed + 1)
  const bh = size / boards
  const offs = Array.from({ length: boards }, () => rand() * 40)
  const tints = Array.from({ length: boards }, () => 0.84 + rand() * 0.2)
  const cuts = Array.from({ length: boards }, () => Math.floor(rand() * size))
  const col = rgb(base)
  const h = new Float32Array(size * size)
  const c = pixels(size, (x, y, i, o) => {
    const r = Math.floor(y / bh)
    const ly = y - r * bh
    const seam = ly < gap || ly > bh - gap || Math.abs(x - cuts[r]) < 1.2
    const grain = 0.5 + 0.5 * Math.sin((y * 2.2 + warp[i] * 20) * 0.9 + offs[r] + Math.sin(x * 0.03 + r) * 1.5)
    const k = seam ? 0.42 : tints[r] * (0.88 + grain * 0.1)
    h[i] = seam ? 0 : 0.7 + grain * 0.1
    o[0] = col[0] * k
    o[1] = col[1] * k
    o[2] = col[2] * k
  })
  return { color: c, normal: heightToNormal(h, size, 1.6) }
}

// Roof shingles: staggered rows, each tab its own shade, shadowed lower edge.
export function paintShingles(size = 512, rows = 8, perRow = 8, seed = 919) {
  const rand = mulberry32(seed)
  const shades = Array.from({ length: rows * (perRow + 1) }, () => 0.78 + rand() * 0.22)
  const g = fbm(size, 16, 3, seed + 1)
  const h = new Float32Array(size * size)
  const rh = size / rows
  const tw = size / perRow
  const c = pixels(size, (x, y, i, o) => {
    const r = Math.floor(y / rh)
    const off = r % 2 ? tw / 2 : 0
    const lx = (x + off) % size
    const k = Math.floor(lx / tw)
    const ly = y - r * rh // 0 at top of the row, rh at the exposed lower edge
    const dx = Math.min(lx % tw, tw - (lx % tw))
    const t = ly / rh
    const gapv = dx < 1.4 ? 0.45 : 1
    const lip = t > 0.9 ? 0.6 : 1
    const v = 255 * shades[r * (perRow + 1) + k] * (0.82 + t * 0.18) * gapv * lip * (0.9 + g[i] * 0.18)
    h[i] = (dx < 1.4 ? 0.2 : 0.3 + t * 0.6) + g[i] * 0.08
    o[0] = v
    o[1] = v
    o[2] = v
  })
  return { color: c, normal: heightToNormal(h, size, 3) }
}

// Corrugated sheet metal: ridges along V (vertical on a wall), near white for tinting.
export function paintCorrugated(size = 256, ridges = 8, seed = 1010) {
  const rand = mulberry32(seed)
  const streak = fbm(size, 8, 3, seed)
  const h = new Float32Array(size * size)
  const rust = new Uint8Array(size * size)
  for (let k = 0; k < 18; k++) {
    const sx = rand() * size
    const sy = rand() * size
    const sr = 2 + rand() * 6
    for (let y = Math.floor(sy - sr / 0.6); y <= sy + sr / 0.6; y++) {
      for (let x = Math.floor(sx - sr); x <= sx + sr; x++) {
        if (x < 0 || y < 0 || x >= size || y >= size) continue
        const dx = x - sx
        const dy = (y - sy) * 0.6
        if (dx * dx + dy * dy < sr * sr) rust[y * size + x] = 1
      }
    }
  }
  const c = pixels(size, (x, y, i, o) => {
    const s = Math.cos((x / size) * Math.PI * 2 * ridges)
    h[i] = s * 0.5 + 0.5
    const v = 222 + s * 26 - (streak[i] > 0.62 ? (streak[i] - 0.62) * 120 : 0)
    if (rust[i]) {
      o[0] = v * 0.82 + 30
      o[1] = v * 0.78
      o[2] = v * 0.7
    } else {
      o[0] = o[1] = o[2] = v
    }
  })
  return { color: c, normal: heightToNormal(h, size, 2.6) }
}

// Diamond (tread) plate for catwalks, stairs and container floors.
export function paintTreadPlate(size = 256, n = 8, seed = 1111) {
  const g = fbm(size, 16, 3, seed)
  const h = new Float32Array(size * size)
  const cell = size / n
  const c = pixels(size, (x, y, i, o) => {
    const lx = (x % cell) / cell - 0.5
    const ly = (y % cell) / cell - 0.5
    // two crossed lozenges per cell
    const a = Math.abs(lx + ly) * 0.35 + Math.abs(lx - ly) * 1.8
    const b = Math.abs(lx - ly) * 0.35 + Math.abs(lx + ly) * 1.8
    const bump = Math.max(clamp01(1 - a / 0.5), clamp01(1 - b / 0.5)) > 0.35 ? 1 : 0
    h[i] = bump * 0.7 + g[i] * 0.1
    const v = 150 + g[i] * 40 + bump * 25
    o[0] = v
    o[1] = v + 2
    o[2] = v + 6
  })
  return { color: c, normal: heightToNormal(h, size, 2.4) }
}

// Hedge / leafy mass: overlapping leaf ellipses.
export function paintLeaves(size = 256, seed = 1212) {
  const rand = mulberry32(seed)
  const c = canvas(size)
  const ctx = c.getContext('2d')
  const hc = canvas(size)
  const hx = hc.getContext('2d')
  ctx.fillStyle = '#2f7a26'
  ctx.fillRect(0, 0, size, size)
  hx.fillStyle = '#000'
  hx.fillRect(0, 0, size, size)
  const greens = ['#3c8f2c', '#4aa233', '#56b23b', '#6cc248', '#2f7f24', '#7fd055']
  for (let i = 0; i < 1500; i++) {
    const x = rand() * size
    const y = rand() * size
    const r = 4 + rand() * 6
    const a = rand() * Math.PI
    const col = greens[Math.floor(rand() * greens.length)]
    const lift = Math.floor(80 + rand() * 175)
    wrapped(size, x, y, r + 2, (px, py) => {
      ctx.fillStyle = col
      ctx.beginPath()
      ctx.ellipse(px, py, r, r * 0.55, a, 0, Math.PI * 2)
      ctx.fill()
      hx.fillStyle = `rgb(${lift},${lift},${lift})`
      hx.beginPath()
      hx.ellipse(px, py, r, r * 0.55, a, 0, Math.PI * 2)
      hx.fill()
    })
  }
  const hd = hx.getImageData(0, 0, size, size).data
  const h = new Float32Array(size * size)
  for (let i = 0; i < h.length; i++) h[i] = hd[i * 4] / 255
  return { color: c, normal: heightToNormal(h, size, 2) }
}

// Straw (hay bales, thatch): directional golden strokes along V.
export function paintStraw(size = 256, seed = 1313, long = false) {
  const rand = mulberry32(seed)
  const c = canvas(size)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#c99b3c'
  ctx.fillRect(0, 0, size, size)
  const cols = ['#e2bb57', '#d4a646', '#b8862f', '#f0cf6e', '#a87a2a', '#e8c463']
  ctx.lineCap = 'round'
  for (let i = 0; i < (long ? 2600 : 3600); i++) {
    const x = rand() * size
    const y = rand() * size
    const len = long ? 18 + rand() * 30 : 6 + rand() * 14
    const ang = Math.PI / 2 + (rand() - 0.5) * (long ? 0.25 : 1.2)
    ctx.strokeStyle = cols[Math.floor(rand() * cols.length)]
    ctx.lineWidth = 1 + rand() * 1.4
    wrapped(size, x, y, len + 2, (px, py) => {
      ctx.beginPath()
      ctx.moveTo(px, py)
      ctx.lineTo(px + Math.cos(ang) * len, py + Math.sin(ang) * len)
      ctx.stroke()
    })
  }
  return { color: c }
}

// Vertical stripes (awnings, umbrellas, deck chairs).
export function paintStripes(a = '#e8413a', b = '#ffffff', n = 2, size = 128) {
  const c = canvas(size)
  const ctx = c.getContext('2d')
  ctx.fillStyle = b
  ctx.fillRect(0, 0, size, size)
  ctx.fillStyle = a
  const w = size / (n * 2)
  for (let k = 0; k < n; k++) ctx.fillRect(k * 2 * w, 0, w, size)
  return c
}

// Book spines on shelves (2 shelves per tile), for bookcase fronts.
export function paintBooks(size = 256, seed = 1414) {
  const rand = mulberry32(seed)
  const c = canvas(size)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#4a2f1c'
  ctx.fillRect(0, 0, size, size)
  const cols = ['#b23a3a', '#2f5fa8', '#e0b23a', '#3f8a4a', '#7a3fa0', '#d0d0c8', '#1e2a3a', '#c66a2a', '#4fa3c0']
  const shelfH = size / 2
  for (let s = 0; s < 2; s++) {
    let x = 4
    const y1 = (s + 1) * shelfH - 8
    while (x < size - 6) {
      const w = 6 + rand() * 12
      const hgt = shelfH * (0.55 + rand() * 0.35)
      const lean = rand() < 0.08
      ctx.fillStyle = cols[Math.floor(rand() * cols.length)]
      if (lean) {
        ctx.save()
        ctx.translate(x, y1)
        ctx.rotate(-0.25)
        ctx.fillRect(0, -hgt, w, hgt)
        ctx.restore()
        x += w + 8
      } else {
        ctx.fillRect(x, y1 - hgt, w, hgt)
        ctx.fillStyle = 'rgba(255,255,255,0.35)'
        ctx.fillRect(x + 1, y1 - hgt * 0.8, w - 2, 2)
        ctx.fillRect(x + 1, y1 - hgt * 0.25, w - 2, 2)
        x += w + 1
      }
    }
    ctx.fillStyle = '#6b4528'
    ctx.fillRect(0, y1, size, 8)
  }
  return c
}

// Rug with a border and a simple diamond motif (not tiled: one per rug).
export function paintRug(base = '#a8323a', border = '#f0d9a0', accent = '#2a3f6a', size = 256) {
  const c = canvas(size)
  const ctx = c.getContext('2d')
  ctx.fillStyle = border
  ctx.fillRect(0, 0, size, size)
  ctx.fillStyle = base
  ctx.fillRect(14, 14, size - 28, size - 28)
  ctx.strokeStyle = accent
  ctx.lineWidth = 6
  ctx.strokeRect(26, 26, size - 52, size - 52)
  ctx.fillStyle = accent
  ctx.beginPath()
  ctx.moveTo(size / 2, 50)
  ctx.lineTo(size - 50, size / 2)
  ctx.lineTo(size / 2, size - 50)
  ctx.lineTo(50, size / 2)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = border
  ctx.beginPath()
  ctx.arc(size / 2, size / 2, 22, 0, Math.PI * 2)
  ctx.fill()
  return c
}

// Black/white kitchen/café checker with grout.
export function paintCheckerTiles(size = 256, n = 4, a = '#f2efe8', b = '#2a2c30') {
  const g = fbm(size, 16, 2, 1515)
  const cell = size / n
  const pa = rgb(a)
  const pb = rgb(b)
  return pixels(size, (x, y, i, o) => {
    const k = (Math.floor(x / cell) + Math.floor(y / cell)) % 2
    const dx = Math.min(x % cell, cell - (x % cell))
    const dy = Math.min(y % cell, cell - (y % cell))
    const grout = Math.min(dx, dy) < 1.5
    const p = k ? pb : pa
    for (let ch = 0; ch < 3; ch++) o[ch] = grout ? 150 : p[ch] * (0.94 + g[i] * 0.08)
  })
}

// Helipad: concrete square with a yellow ring, white H and edge dashes (one image, not tiled).
export function paintHelipad(size = 512) {
  const { color } = paintConcrete(size, 1, 2020, '#8f9294')
  const ctx = color.getContext('2d')
  const m = size / 2
  ctx.strokeStyle = '#f2c230'
  ctx.lineWidth = size * 0.045
  ctx.beginPath()
  ctx.arc(m, m, size * 0.36, 0, Math.PI * 2)
  ctx.stroke()
  ctx.fillStyle = '#ffffff'
  const w = size * 0.07
  ctx.fillRect(m - size * 0.16, m - size * 0.2, w, size * 0.4)
  ctx.fillRect(m + size * 0.16 - w, m - size * 0.2, w, size * 0.4)
  ctx.fillRect(m - size * 0.16, m - w / 2, size * 0.32, w)
  ctx.fillStyle = '#ffffff'
  const dash = size / 16
  for (let k = 0; k < 16; k += 2) {
    ctx.fillRect(k * dash + dash * 0.5, size * 0.02, dash, size * 0.025)
    ctx.fillRect(k * dash + dash * 0.5, size * 0.955, dash, size * 0.025)
    ctx.fillRect(size * 0.02, k * dash + dash * 0.5, size * 0.025, dash)
    ctx.fillRect(size * 0.955, k * dash + dash * 0.5, size * 0.025, dash)
  }
  return color
}

// Soft foam blobs as an alpha mask (white = foam), tiling along U.
export function paintFoam(size = 256, seed = 2121) {
  const f = fbm(size, 8, 4, seed)
  return pixels(size, (x, y, i, o) => {
    const edge = 1 - y / size // strongest at v=0 (the shore side)
    const v = clamp01((f[i] - 0.42) * 3) * edge + (y < size * 0.12 ? 0.6 * (1 - y / (size * 0.12)) : 0)
    const k = clamp01(v) * 255
    o[0] = o[1] = o[2] = k
  })
}

// Horizontal gradient strip used as an alpha ramp (opaque at u=0 -> clear at u=1).
export function paintRamp(size = 128) {
  const c = canvas(size, 4)
  const ctx = c.getContext('2d')
  const g = ctx.createLinearGradient(0, 0, size, 0)
  g.addColorStop(0, '#ffffff')
  g.addColorStop(0.35, '#b0b0b0')
  g.addColorStop(1, '#000000')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, 4)
  return c
}

// Sign board: text on a coloured panel with a border (w x h px, not tiled).
export function paintSign(text, { bg = '#1f4f8f', fg = '#ffffff', border = '#ffffff', w = 512, h = 128, font = '700 72px Fredoka, "Arial Black", sans-serif', outline = null, sub = null } = {}) {
  const c = canvas(w, h)
  const draw = () => {
    const ctx = c.getContext('2d')
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, w, h)
    if (border) {
      ctx.strokeStyle = border
      ctx.lineWidth = Math.max(4, h * 0.06)
      ctx.strokeRect(ctx.lineWidth, ctx.lineWidth, w - ctx.lineWidth * 2, h - ctx.lineWidth * 2)
    }
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    let px = parseInt(font.match(/(\d+)px/)[1], 10)
    let f = font
    ctx.font = f
    const maxW = w * 0.86
    while (ctx.measureText(text).width > maxW && px > 10) {
      px -= 4
      f = font.replace(/\d+px/, `${px}px`)
      ctx.font = f
    }
    const y = sub ? h * 0.4 : h * 0.53
    if (outline) {
      ctx.lineJoin = 'round'
      ctx.lineWidth = px * 0.16
      ctx.strokeStyle = outline
      ctx.strokeText(text, w / 2, y)
    }
    ctx.fillStyle = fg
    ctx.fillText(text, w / 2, y)
    if (sub) {
      ctx.font = f.replace(/\d+px/, `${Math.round(px * 0.42)}px`)
      ctx.fillText(sub, w / 2, h * 0.78)
    }
  }
  draw()
  return { canvas: c, draw }
}

// Chain-link mesh: diagonal wires on a transparent background (alpha-tested).
export function paintChainLink(size = 128, cells = 4) {
  const c = canvas(size)
  const ctx = c.getContext('2d')
  ctx.clearRect(0, 0, size, size)
  ctx.strokeStyle = '#c9ced4'
  ctx.lineWidth = 3
  const step = size / cells
  for (let k = -cells; k <= cells * 2; k++) {
    ctx.beginPath()
    ctx.moveTo(k * step, 0)
    ctx.lineTo(k * step + size, size)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(k * step, size)
    ctx.lineTo(k * step + size, 0)
    ctx.stroke()
  }
  return c
}

// Billboard posters (original art, invented brands), 512 x 224, redrawable once
// the web font loads. kind: 'cola' | 'energy' | 'beach' | 'coffee'
export function paintPoster(kind, w = 512, h = 224) {
  const c = canvas(w, h)
  const title = (ctx, text, x, y, px, fill, stroke, rot = 0) => {
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(rot)
    ctx.font = '700 ' + px + 'px Fredoka, "Arial Black", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineJoin = 'round'
    ctx.lineWidth = px * 0.18
    ctx.strokeStyle = stroke
    ctx.strokeText(text, 0, 0)
    ctx.fillStyle = fill
    ctx.fillText(text, 0, 0)
    ctx.restore()
  }
  const draw = () => {
    const ctx = c.getContext('2d')
    ctx.clearRect(0, 0, w, h)
    const rand = mulberry32(kind.length * 977)
    if (kind === 'cola') {
      const g = ctx.createRadialGradient(w * 0.3, h * 0.5, 10, w * 0.3, h * 0.5, w * 0.8)
      g.addColorStop(0, '#ff5a4a')
      g.addColorStop(1, '#a8121c')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)
      for (let i = 0; i < 26; i++) {
        ctx.strokeStyle = 'rgba(255,255,255,0.55)'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(rand() * w * 0.45, rand() * h, 3 + rand() * 9, 0, Math.PI * 2)
        ctx.stroke()
      }
      ctx.save()
      ctx.translate(w * 0.2, h * 0.52)
      ctx.rotate(-0.18)
      ctx.fillStyle = '#f4f4f4'
      ctx.fillRect(-34, -78, 68, 156)
      ctx.fillStyle = '#d8261c'
      ctx.fillRect(-34, -50, 68, 100)
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.moveTo(-34, 10)
      ctx.bezierCurveTo(-10, -20, 10, 30, 34, 0)
      ctx.lineTo(34, 12)
      ctx.bezierCurveTo(10, 42, -10, -8, -34, 22)
      ctx.fill()
      ctx.fillStyle = '#bdbdbd'
      ctx.fillRect(-30, -86, 60, 10)
      ctx.restore()
      title(ctx, 'FIZZ COLA', w * 0.64, h * 0.4, 70, '#ffffff', '#5a0a10', -0.05)
      title(ctx, 'ICE COLD SINCE 1999', w * 0.64, h * 0.74, 26, '#ffe08a', '#5a0a10')
    } else if (kind === 'energy') {
      const g = ctx.createLinearGradient(0, 0, w, h)
      g.addColorStop(0, '#1d2b6b')
      g.addColorStop(1, '#5a1d8a')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)
      ctx.strokeStyle = 'rgba(125,255,90,0.35)'
      ctx.lineWidth = 3
      for (let i = 0; i < 14; i++) {
        const y = 12 + rand() * (h - 24)
        ctx.beginPath()
        ctx.moveTo(w * 0.35 + rand() * 40, y)
        ctx.lineTo(w * 0.35 + 80 + rand() * 120, y)
        ctx.stroke()
      }
      ctx.fillStyle = '#7dff5a'
      ctx.strokeStyle = '#0b1530'
      ctx.lineWidth = 6
      const bx = w * 0.17
      ctx.beginPath()
      ctx.moveTo(bx + 30, 18)
      ctx.lineTo(bx - 30, h * 0.56)
      ctx.lineTo(bx + 4, h * 0.56)
      ctx.lineTo(bx - 18, h - 16)
      ctx.lineTo(bx + 46, h * 0.4)
      ctx.lineTo(bx + 10, h * 0.4)
      ctx.closePath()
      ctx.stroke()
      ctx.fill()
      title(ctx, 'ZOOM', w * 0.62, h * 0.36, 84, '#7dff5a', '#0b1530', -0.06)
      title(ctx, 'ENERGY  -  RUN FASTER', w * 0.62, h * 0.74, 28, '#ffffff', '#0b1530')
    } else if (kind === 'beach') {
      const g = ctx.createLinearGradient(0, 0, 0, h)
      g.addColorStop(0, '#ff7a3d')
      g.addColorStop(0.55, '#ffd27a')
      g.addColorStop(0.56, '#2fb3d8')
      g.addColorStop(1, '#1a6fa8')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = '#fff3c4'
      ctx.beginPath()
      ctx.arc(w * 0.78, h * 0.55, 46, Math.PI, 0)
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'
      ctx.lineWidth = 4
      for (let k = 0; k < 4; k++) {
        ctx.beginPath()
        for (let x = 0; x <= w; x += 8) ctx.lineTo(x, h * 0.66 + k * 16 + Math.sin(x * 0.05 + k) * 4)
        ctx.stroke()
      }
      ctx.fillStyle = '#5a2a10'
      ctx.fillRect(w * 0.1, h * 0.2, 10, h * 0.5)
      for (let k = 0; k < 6; k++) {
        ctx.save()
        ctx.translate(w * 0.1 + 5, h * 0.2)
        ctx.rotate(-2.6 + k * 0.85)
        ctx.beginPath()
        ctx.ellipse(34, 0, 36, 8, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }
      title(ctx, 'SUNSET BEACH', w * 0.45, h * 0.26, 58, '#ffffff', '#b04a10')
      title(ctx, 'THIS WAY  >>>', w * 0.45, h * 0.47, 26, '#fff3c4', '#b04a10')
    } else {
      ctx.fillStyle = '#3a2418'
      ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = '#f2e3c6'
      ctx.fillRect(10, 10, w - 20, h - 20)
      ctx.fillStyle = '#2f6f4f'
      ctx.beginPath()
      ctx.moveTo(w * 0.1, h * 0.38)
      ctx.lineTo(w * 0.3, h * 0.38)
      ctx.lineTo(w * 0.27, h * 0.85)
      ctx.lineTo(w * 0.13, h * 0.85)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(w * 0.13, h * 0.52, w * 0.14, 14)
      ctx.strokeStyle = 'rgba(90,60,40,0.6)'
      ctx.lineWidth = 6
      for (let k = 0; k < 3; k++) {
        const sx = w * 0.15 + k * 18
        ctx.beginPath()
        ctx.moveTo(sx, h * 0.32)
        ctx.bezierCurveTo(sx - 12, h * 0.24, sx + 12, h * 0.18, sx, h * 0.08)
        ctx.stroke()
      }
      title(ctx, 'CAFE AROMA', w * 0.63, h * 0.36, 58, '#6b3a1f', '#f2e3c6')
      title(ctx, 'FRESH COFFEE  -  PLAZA', w * 0.63, h * 0.68, 26, '#2f6f4f', '#f2e3c6')
    }
  }
  draw()
  return { canvas: c, draw }
}
