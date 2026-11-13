/**
 * The Ocean's sky through the day. Each time of day is a palette for the sky, the water and
 * its dots, and where the sun or moon hangs. By default the sky follows the local clock; you
 * can also pin the one you like.
 */

type RGB = [number, number, number]

export type SkyTime = 'dawn' | 'morning' | 'noon' | 'afternoon' | 'golden' | 'sunset' | 'dusk' | 'night' | 'midnight'
export type SkyChoice = SkyTime | 'auto'

export interface Sky {
  dark: number // 1: a dark surface, with pale dots that print the light
  sky: RGB // top of the sky
  horizon: RGB // the sky at the waterline
  water: RGB // the sea's paper
  ink: RGB // its dots
  glint: RGB // light on the water
  muted: RGB // secondary text at the surface
  weight: number // how heavy the dots print (1 = as the scene's light says)
  sun: number // 1: the sun, 0: the moon
  disc: number // 0: it's below the horizon
  at: [number, number] // across the screen (0..1), and how far above the waterline (px)
  stars: number
}

export const SKY_TIMES: { value: SkyTime; label: string }[] = [
  { value: 'dawn', label: 'Dawn' },
  { value: 'morning', label: 'Morning' },
  { value: 'noon', label: 'Noon' },
  { value: 'afternoon', label: 'Afternoon' },
  { value: 'golden', label: 'Golden hour' },
  { value: 'sunset', label: 'Sunset' },
  { value: 'dusk', label: 'Dusk' },
  { value: 'night', label: 'Night' },
  { value: 'midnight', label: 'Midnight' },
]
export const skyLabel = (t: SkyTime) => SKY_TIMES.find((s) => s.value === t)!.label

const INK: RGB = [30, 35, 29]
const GOLD: RGB = [181, 138, 53]

export const SKIES: Record<SkyTime, Sky> = {
  // The sun just up; cool above, peach at the waterline.
  dawn: { dark: 0, sky: [206, 216, 234], horizon: [250, 220, 208], water: [240, 234, 234], ink: [70, 62, 88], glint: [214, 150, 128], muted: [118, 108, 124], weight: 0.32, sun: 1, disc: 1, at: [0.8, 16], stars: 0 },
  morning: { dark: 0, sky: [232, 240, 248], horizon: [255, 255, 255], water: [244, 243, 238], ink: INK, glint: GOLD, muted: [119, 115, 106], weight: 0.28, sun: 1, disc: 1, at: [0.8, 135], stars: 0 },
  // Overhead, so its glitter lies close in, at the bottom of the screen.
  noon: { dark: 0, sky: [255, 255, 255], horizon: [255, 255, 255], water: [246, 247, 245], ink: INK, glint: GOLD, muted: [119, 115, 106], weight: 0.22, sun: 1, disc: 1, at: [0.5, 190], stars: 0 },
  afternoon: { dark: 0, sky: [238, 243, 250], horizon: [252, 249, 242], water: [244, 242, 236], ink: [34, 38, 32], glint: GOLD, muted: [119, 115, 106], weight: 0.3, sun: 1, disc: 1, at: [0.64, 165], stars: 0 },
  golden: { dark: 0, sky: [246, 232, 210], horizon: [252, 212, 158], water: [246, 232, 210], ink: [112, 70, 38], glint: [214, 150, 70], muted: [140, 104, 72], weight: 0.34, sun: 1, disc: 1, at: [0.72, 58], stars: 0 },
  // Going down, half into the sea.
  sunset: { dark: 0, sky: [196, 168, 186], horizon: [248, 168, 112], water: [238, 204, 178], ink: [118, 52, 46], glint: [250, 184, 96], muted: [112, 76, 82], weight: 0.4, sun: 1, disc: 1, at: [0.7, 12], stars: 0 },
  // The sun is gone; its afterglow lingers where it went down.
  dusk: { dark: 1, sky: [26, 25, 46], horizon: [118, 74, 98], water: [26, 24, 42], ink: [228, 192, 186], glint: [242, 162, 112], muted: [170, 158, 180], weight: 2.2, sun: 1, disc: 0, at: [0.72, 6], stars: 0.45 },
  night: { dark: 1, sky: [8, 10, 18], horizon: [24, 30, 46], water: [9, 12, 17], ink: [245, 227, 191], glint: [232, 194, 122], muted: [134, 146, 160], weight: 2.4, sun: 0, disc: 1, at: [0.74, 150], stars: 1 },
  // The moon high, silver on black.
  midnight: { dark: 1, sky: [2, 3, 6], horizon: [10, 12, 22], water: [3, 4, 8], ink: [196, 206, 224], glint: [236, 240, 250], muted: [120, 130, 146], weight: 2, sun: 0, disc: 1, at: [0.56, 178], stars: 1 },
}

/** Hours (local) at which each time of day begins. */
const STARTS: [number, SkyTime][] = [
  [0, 'midnight'],
  [4, 'night'],
  [5, 'dawn'],
  [7, 'morning'],
  [11, 'noon'],
  [14, 'afternoon'],
  [17, 'golden'],
  [18.5, 'sunset'],
  [19.5, 'dusk'],
  [21, 'night'],
  [23, 'midnight'],
]

export function skyTimeAt(d = new Date()): SkyTime {
  const h = d.getHours() + d.getMinutes() / 60
  let t: SkyTime = 'midnight'
  for (const [start, time] of STARTS) if (h >= start) t = time
  return t
}

const KEY = 'commonplace.oceanSky'
export function loadSkyChoice(): SkyChoice {
  try {
    const v = localStorage.getItem(KEY)
    return v && (v === 'auto' || v in SKIES) ? (v as SkyChoice) : 'auto'
  } catch {
    return 'auto'
  }
}
export function saveSkyChoice(c: SkyChoice) {
  try {
    localStorage.setItem(KEY, c)
  } catch {
    // Private mode: the choice lasts until the page closes.
  }
}

/** Ease one sky toward another, in place; `k` is the fraction of the way to go this frame. */
export function easeSky(cur: Sky, to: Sky, k: number) {
  const l = (a: number, b: number) => a + (b - a) * k
  for (const key of ['sky', 'horizon', 'water', 'ink', 'glint', 'muted'] as const) cur[key] = cur[key].map((v, i) => l(v, to[key][i])) as RGB
  for (const key of ['dark', 'weight', 'sun', 'disc', 'stars'] as const) cur[key] = l(cur[key], to[key])
  cur.at = [l(cur.at[0], to.at[0]), l(cur.at[1], to.at[1])]
}

export const copySky = (s: Sky): Sky => ({ ...s, at: [...s.at], sky: [...s.sky], horizon: [...s.horizon], water: [...s.water], ink: [...s.ink], glint: [...s.glint], muted: [...s.muted] })
