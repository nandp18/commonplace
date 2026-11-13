/**
 * Dot-matrix icons: each glyph is a small grid where `#` is a dot.
 * Rendered as SVG circles, so they stay crisp and take `currentColor`.
 */
const glyphs = {
  camera: `
    ..##.....
    #########
    #..###..#
    #.#...#.#
    #..###..#
    #########`,
  retake: `
    ..###....
    #########
    #.......#
    #.##.##.#
    #.......#
    #########`,
  photos: `
    #########
    #.......#
    #.....#.#
    #..#....#
    #.#.#.#.#
    ##...#.##
    #########`,
  search: `
    .###...
    #...#..
    #...#..
    #...#..
    .###...
    .....#.
    ......#`,
  sparkle: `
    ...#...
    ...#...
    .......
    ##...##
    .......
    ...#...
    ...#...`,
  plus: `
    ...#...
    ...#...
    ...#...
    ###.###
    ...#...
    ...#...
    ...#...`,
  settings: `
    .#.....
    #######
    .#.....
    .......
    ....#..
    #######
    ....#..`,
  share: `
    ...#...
    ..###..
    .#.#.#.
    ...#...
    #..#..#
    #.....#
    #######`,
  copy: `
    ..#####
    ..#...#
    #####.#
    #...#.#
    #...###
    #...#..
    #####..`,
  trash: `
    ..###..
    #######
    .#...#.
    .#.#.#.
    .#.#.#.
    .#...#.
    ..###..`,
  book: `
    .##...##.
    #..#.#..#
    #...#...#
    #...#...#
    #...#...#
    #...#...#
    .###.###.`,
  check: `
    .......
    ......#
    .....#.
    #...#..
    .#.#...
    ..#....
    .......`,
  close: `
    #.....#
    .#...#.
    ..#.#..
    ...#...
    ..#.#..
    .#...#.
    #.....#`,
  back: `
    ...#
    ..#.
    .#..
    #...
    .#..
    ..#.
    ...#`,
  note: `
    ......#
    .....#.
    ....#..
    ...#...
    ..#....
    .#.....
    ##.....`,
  tag: `
    ###....
    #..#...
    #...#..
    .#...#.
    ..#...#
    ...#.#.
    ....#..`,
  page: `
    ######
    #....#
    #.##.#
    #....#
    #.##.#
    #....#
    ######`,
  quote: `
    .......
    ##..##.
    ##..##.
    .#...#.
    #...#..
    .......`,
  barcode: `
    #.##.#.##
    #.##.#.##
    #.##.#.##
    #.##.#.##
    #.##.#.##
    .........
    #.#.#.#.#`,
  box: `
    #.#.#.#
    .......
    #.....#
    .......
    #.....#
    .......
    #.#.#.#`,
} as const

export type IconName = keyof typeof glyphs

const parsed = Object.fromEntries(
  Object.entries(glyphs).map(([name, art]) => {
    const rows = art.split('\n').map((r) => r.trim()).filter(Boolean)
    const cols = Math.max(...rows.map((r) => r.length))
    const dots: [number, number][] = []
    rows.forEach((r, y) => [...r].forEach((c, x) => c === '#' && dots.push([x, y])))
    return [name, { cols, rows: rows.length, dots }]
  }),
) as Record<IconName, { cols: number; rows: number; dots: [number, number][] }>

/**
 * `animate` makes the dots assemble from the center outward. Changing `name`
 * remounts the glyph, so swapping icons (copy → check) replays it.
 */
export function Icon({ name, size = 20, animate = false }: { name: IconName; size?: number; animate?: boolean }) {
  const g = parsed[name]
  const n = Math.max(g.cols, g.rows, 7)
  // Square viewBox so every glyph sits on the same optical grid, centered.
  const ox = (n - g.cols) / 2, oy = (n - g.rows) / 2
  const cx = g.cols / 2 - 0.5, cy = g.rows / 2 - 0.5
  return (
    <svg
      key={name}
      className={`icon ${animate ? 'assemble' : ''}`}
      width={size}
      height={size}
      viewBox={`0 0 ${n} ${n}`}
      fill="currentColor"
      aria-hidden
    >
      {g.dots.map(([x, y]) => (
        <circle
          key={`${x},${y}`}
          className="dot"
          cx={x + ox + 0.5}
          cy={y + oy + 0.5}
          r={0.4}
          style={animate ? ({ '--i': Math.round(Math.hypot(x - cx, y - cy) * 2) } as React.CSSProperties) : undefined}
        />
      ))}
    </svg>
  )
}
