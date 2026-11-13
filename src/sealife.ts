/**
 * Life in the Ocean's shallows, all printed in dots like everything else: a coral reef along
 * the edges of the screen (clear of the quotes in the middle), gems and pearls tucked into
 * it, gems glowing down in the dark, sea turtles, and fish in colour.
 */

type RGB = [number, number, number]
type Dot = [number, number, number, RGB] // x, y, radius, colour (local to its piece)

export const CORALS: RGB[] = [
  [238, 124, 120], // coral pink
  [244, 152, 84], // orange
  [168, 112, 200], // purple
  [232, 198, 88], // yellow
  [80, 178, 168], // teal
]
export const FISH: RGB[] = [
  [245, 122, 70],
  [56, 168, 192],
  [238, 194, 56],
  [84, 112, 222],
  [222, 92, 142],
]
const GEMS: RGB[] = [
  [214, 38, 78], // ruby
  [34, 168, 108], // emerald
  [48, 92, 222], // sapphire
  [150, 82, 220], // amethyst
]
const ROCK: RGB = [128, 120, 110]

const seeded = (seed: number) => {
  let s = seed >>> 0 || 1
  return () => ((s = (s * 1103515245 + 12345) >>> 0) / 2 ** 32)
}
const mixC = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]

export interface Piece {
  x: number // where it's rooted, screen x
  y: number // world y
  dots: Dot[]
  sway: number // how much it moves with the water
  top: number // highest dot, local (for culling)
  bottom: number // lowest
}
export interface Treasure {
  kind: 'gem' | 'pearl'
  x: number
  y: number // world y
  color: RGB
  ph: number
}

/** Staghorn: branches that fork as they grow toward the light. */
function staghorn(side: number, c: RGB, rand: () => number): Dot[] {
  const out: Dot[] = []
  const grow = (x: number, y: number, ang: number, len: number, depth: number) => {
    const steps = Math.round(len / 3)
    for (let i = 0; i < steps; i++) {
      x += Math.cos(ang) * 3
      y += Math.sin(ang) * 3
      ang += (rand() - 0.5) * 0.2
      out.push([x, y, 1.7 - depth * 0.25, mixC(c, [255, 255, 255], i === steps - 1 ? 0.35 : 0)])
    }
    if (depth < 3) for (const turn of [-0.45, 0.45]) grow(x, y, ang + turn + (rand() - 0.5) * 0.3, len * 0.72, depth + 1)
  }
  grow(0, 0, -Math.PI / 2 + side * 0.45, 13 + rand() * 6, 0)
  return out
}

/** A sea fan: ribs radiating up from the root, joined by rings. */
function fan(side: number, c: RGB): Dot[] {
  const out: Dot[] = []
  const tilt = side * 0.35
  for (let k = 0; k <= 8; k++) {
    const a = -Math.PI / 2 + tilt + (k / 8 - 0.5) * 1.9
    for (let r = 4; r <= 24; r += 3.2) out.push([Math.cos(a) * r, Math.sin(a) * r, 1.05, c])
  }
  for (const r of [11, 18, 24])
    for (let k = 0; k <= 16; k++) {
      const a = -Math.PI / 2 + tilt + (k / 16 - 0.5) * 1.9
      out.push([Math.cos(a) * r, Math.sin(a) * r, 0.9, mixC(c, [255, 255, 255], 0.25)])
    }
  return out
}

/** Brain coral: a dome with its winding grooves. */
function brain(c: RGB): Dot[] {
  const out: Dot[] = []
  for (let x = -13; x <= 13; x += 3.1)
    for (let y = -12; y <= 0; y += 3.1) {
      if ((x / 13) ** 2 + (y / 12) ** 2 > 1) continue
      const groove = Math.sin(x * 0.55 + Math.sin(y * 0.5) * 2) > 0.3
      out.push([x, y, groove ? 1.15 : 1.6, groove ? mixC(c, [40, 30, 30], 0.35) : c])
    }
  return out
}

/** The reef's wall of rock along one edge, a few dots deep, its face uneven. */
function wall(side: number, height: number, rand: () => number): Dot[] {
  const out: Dot[] = []
  for (let y = 0; y < height; y += 3.2) {
    const depth = 6 + 7 * (0.5 + 0.5 * Math.sin(y * 0.045)) + 4 * Math.sin(y * 0.13 + 1)
    for (let d = -2; d < depth; d += 3.2) out.push([side * d, y, 1.4, mixC(ROCK, [96, 88, 80], rand() * 0.6)])
  }
  return out
}

/** The reef along both edges, between two world depths. Deterministic for a given width. */
export function buildReef(w: number, from: number, to: number): { pieces: Piece[]; treasure: Treasure[] } {
  const rand = seeded(Math.round(w) * 7 + 3)
  const pieces: Piece[] = []
  const treasure: Treasure[] = []
  let pearls = 0
  // Walls in stretches, so the reef is patchy, not a frame around the screen.
  for (const side of [1, -1])
    for (let y = from + (side > 0 ? 0 : 90); y < to; y += 420) {
      const height = 260 + rand() * 120
      pieces.push({ x: side > 0 ? 0 : w, y, dots: wall(side, height, rand), sway: 0, top: 0, bottom: height })
    }
  for (let y = from, i = 0; y < to; y += 22 + rand() * 22, i++) {
    const side = rand() < 0.5 ? 1 : -1 // 1: rooted on the left edge, growing right
    const x = side > 0 ? 6 + rand() * 8 : w - 6 - rand() * 8
    const kind = rand()
    const c = CORALS[Math.floor(rand() * CORALS.length)]
    const dots = kind < 0.4 ? staghorn(side, c, rand) : kind < 0.72 ? fan(side, c) : brain(c)
    pieces.push({ x, y, dots, sway: kind < 0.72 ? 1 : 0, top: Math.min(...dots.map((d) => d[1])), bottom: 4 })
    // Now and then something precious in among it.
    const r = rand()
    if (r < 0.32) treasure.push({ kind: 'gem', x: x + side * (10 + rand() * 10), y: y + 4, color: GEMS[Math.floor(rand() * GEMS.length)], ph: rand() * 6 })
    else if (r < 0.44 && pearls < 3) {
      pearls++
      treasure.push({ kind: 'pearl', x: x + side * 22, y: y + 6, color: [246, 240, 232], ph: rand() * 6 })
    }
  }
  return { pieces, treasure }
}

/** Gems lost in the deep, one every so often down the dark water; they glow. */
export function deepGemsBetween(w: number, y0: number, y1: number, from: number): Treasure[] {
  const out: Treasure[] = []
  const SPAN = 700
  for (let i = Math.max(0, Math.floor((y0 - from) / SPAN)); from + i * SPAN < y1; i++) {
    const rand = seeded(i * 7919 + 17)
    const left = rand() < 0.5
    out.push({ kind: 'gem', x: left ? 14 + rand() * 18 : w - 14 - rand() * 18, y: from + i * SPAN + rand() * SPAN * 0.8, color: GEMS[Math.floor(rand() * GEMS.length)], ph: rand() * 6 })
  }
  return out
}

type DotFn = (x: number, y: number, r: number) => void

export function drawPiece(ctx: CanvasRenderingContext2D, dot: DotFn, p: Piece, sy: number, t: number, alpha: number) {
  for (const [dx, dy, r, c] of p.dots) {
    // Taller parts sway more, like weed in a current.
    const s = p.sway * Math.sin(t * 0.9 + p.y * 0.01) * dy * -0.06
    ctx.fillStyle = `rgba(${c[0] | 0}, ${c[1] | 0}, ${c[2] | 0}, ${alpha})`
    dot(p.x + dx + s, sy + dy, r)
  }
}

/** A cut gem (a few dots in a diamond, glinting), or a pearl in an open clam. */
export function drawTreasure(ctx: CanvasRenderingContext2D, dot: DotFn, g: Treasure, sy: number, t: number, alpha: number, glow: number) {
  const [r, gg, b] = g.color
  if (g.kind === 'gem') {
    if (glow > 0.02) {
      const halo = ctx.createRadialGradient(g.x, sy, 0, g.x, sy, 16)
      halo.addColorStop(0, `rgba(${r}, ${gg}, ${b}, ${0.35 * glow * alpha})`)
      halo.addColorStop(1, `rgba(${r}, ${gg}, ${b}, 0)`)
      ctx.fillStyle = halo
      dot(g.x, sy, 16)
    }
    const facets: [number, number, number, number][] = [
      [0, -4.6, 1.2, 0.35], [-2.6, -2.3, 1.3, 0.2], [2.6, -2.3, 1.3, 0.1], [0, -1.6, 1.4, 0],
      [-4, 0, 1.2, 0], [4, 0, 1.2, -0.15], [-1.6, 1.6, 1.3, -0.1], [1.6, 1.6, 1.3, -0.25], [0, 3.8, 1.2, -0.3],
    ]
    for (const [dx, dy, rr, light] of facets) {
      const k = light > 0 ? light : 0, d = light < 0 ? -light : 0
      ctx.fillStyle = `rgba(${r + (255 - r) * k - r * d}, ${gg + (255 - gg) * k - gg * d}, ${b + (255 - b) * k - b * d}, ${alpha})`
      dot(g.x + dx, sy + dy, rr)
    }
    const spark = Math.pow(Math.max(0, Math.sin(t * 1.3 + g.ph)), 24)
    if (spark > 0.05) {
      ctx.fillStyle = `rgba(255, 255, 255, ${spark * alpha})`
      for (const [dx, dy] of [[0, -8], [0, -6.5], [-1.5, -7.2], [1.5, -7.2]]) dot(g.x + dx - 2, sy + dy + 2, 0.8)
    }
    return
  }
  // The clam: a bowl below, its lid tipped open above.
  ctx.fillStyle = `rgba(176, 160, 146, ${alpha})`
  for (let k = 0; k <= 8; k++) {
    const a = (k / 8) * Math.PI
    dot(g.x + Math.cos(a) * 9, sy + 1 + Math.sin(a) * 4.5, 1.25)
    dot(g.x + Math.cos(a) * 9, sy - 5 - Math.sin(a) * 3.2 - (Math.cos(a) + 1) * 1.6, 1.15)
  }
  const pearl = ctx.createRadialGradient(g.x - 1.4, sy - 2.6, 0.4, g.x, sy - 1.2, 4.2)
  pearl.addColorStop(0, `rgba(255, 255, 255, ${alpha})`)
  pearl.addColorStop(0.7, `rgba(${r}, ${gg}, ${b}, ${alpha})`)
  pearl.addColorStop(1, `rgba(206, 196, 214, ${alpha})`)
  ctx.fillStyle = pearl
  dot(g.x, sy - 1.2, 4.2)
  const shine = 0.5 + 0.5 * Math.sin(t * 0.8 + g.ph)
  const halo = ctx.createRadialGradient(g.x, sy - 1.2, 3, g.x, sy - 1.2, 14)
  halo.addColorStop(0, `rgba(255, 250, 240, ${0.35 * shine * alpha})`)
  halo.addColorStop(1, 'rgba(255, 250, 240, 0)')
  ctx.fillStyle = halo
  dot(g.x, sy - 1.2, 14)
}

/** Where a sea turtle is, as seen from above: shell, head, and four paddling flippers. Head toward −x. */
function turtleAt(x: number, y: number, t: number): 'shell' | 'scute' | 'skin' | null {
  if ((x / 20) ** 2 + (y / 14.5) ** 2 < 1) return Math.sin(x * 0.42 + 0.6) * Math.sin(y * 0.5 + 0.4) > 0.55 ? 'scute' : 'shell'
  if (((x + 26) / 7) ** 2 + (y / 5.4) ** 2 < 1) return 'skin'
  const beat = Math.sin(t * 2.2)
  for (const s of [-1, 1]) {
    // Front flippers: long, sweeping back and forth.
    const a = Math.PI * 0.78 + 0.38 * beat
    const fx = -9, fy = s * 11, L = 19
    const tx = fx + Math.cos(a) * L * -1, ty = fy + s * Math.sin(a) * L
    const dx = tx - fx, dy = ty - fy
    const u = Math.max(0, Math.min(1, ((x - fx) * dx + (y - fy) * dy) / (dx * dx + dy * dy)))
    if (Math.hypot(x - (fx + u * dx), y - (fy + u * dy)) < 3.6 - u * 2) return 'skin'
    // Back flippers: small paddles.
    const bx = 15, by = s * 9
    if (((x - bx - 4) / 5) ** 2 + ((y - by - s * 3) / 3) ** 2 < 1) return 'skin'
  }
  return null
}

export function drawTurtle(ctx: CanvasRenderingContext2D, dot: DotFn, x: number, y: number, dir: number, t: number, alpha: number) {
  const colors = { shell: [96, 112, 72], scute: [150, 156, 98], skin: [124, 146, 116] } as const
  for (let lx = -34; lx <= 26; lx += 3)
    for (let ly = -30; ly <= 30; ly += 3) {
      const part = turtleAt(lx, ly, t)
      if (!part) continue
      const c = colors[part]
      ctx.fillStyle = `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${alpha})`
      dot(x - dir * lx, y + ly, part === 'skin' ? 1.15 : 1.3)
    }
}
