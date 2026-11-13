/**
 * A drop, as a canvas path: round at the bottom, drawn to a point above, like the logo.
 * (x, y) is the centre of the round part; the point sits `tip` radii above it.
 */
export function dropPath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, tip = 2.2) {
  const d = r * tip
  const phi = Math.acos(r / d) // where the sides leave the circle, from straight up
  ctx.beginPath()
  ctx.moveTo(x, y - d)
  ctx.arc(x, y, r, -Math.PI / 2 + phi, (Math.PI * 3) / 2 - phi)
  ctx.closePath()
}
