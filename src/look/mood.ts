// The light's moods (docs/plans/active/track-e-look.md §LC, docs/plans/done/lc1a-moods.md): every colour of the
// light in one table, read by the painter, the foliage, the meadow and the post pass. A mood is per map; ?mood=
// picks one on the look page.
import { Color3 } from '@babylonjs/core/Maths/math.color.js'

export interface Mood {
  sun: Color3                 // the sun's colour (paint(): the lit band, the mid band's warm share, the rim)
  winterSun: Color3           // the sun's colour toward winter (season 2 to 3)
  shadow: Color3              // the shadow band's colour (shadowOf)
  shadowTurn: Color3          // the hue the shadow band turns toward, at the same value (shadowOf)
  shadowLift: Color3          // added to the shadow band (shadowOf)
  midCool: Color3             // the mid band's cool share (paint(): the mid is this mixed 30 % toward the sun)
  litLift: Color3             // added to the lit band (paint())
  rim: Color3                 // the warm rim's tint, × the sun
  back: Color3                // the sun through the leaves' tint, × the sun (the foliage's backlight)
  mistShade: Color3           // the valley mist's air where it is in shadow
  mistLit: Color3             // the valley mist's air where it is sunlit
  hazeCool: Color3            // the distance's haze away from the sun (atmos()), and the clear colour
  hazeWarm: Color3            // the distance's haze toward the sun (atmos())
  waterSky: Color3            // the painted sky the water shows at a grazing view (water.frag; no sky is drawn)
  glint: Color3               // the sun's dabs on the water, × the sun (water.frag)
  farRiver: Color3            // the far ring's river line: the river's mid tone after its sky tint, so it meets the
                              // river at the tile's edge (terrain.frag, FARRING): follows waterSky
  earth: {                    // the world's own colours turned toward earth tones (earthOf in src/look/shaders/painter.glsl,
                              // on the albedo before the light; not units)
    tint: Color3              // a colour's value × this (its luma near 1)
    chroma: number            // how much of a colour's own chroma is kept
    amt: number               // how far (0: the albedo as painted)
  }
  bounce: number              // the ground's bounce on units and crowns (LC4: paint(), BOUNCE), 0..1
  units: {                    // how much of the light units take (the painter's KEEP_HUE path: the army blocks, the figures)
    tint: number              // of the sun's hue, 0..1 (its value always): the eye's white balance
    mist: number              // the valley mist's most over them (0..0.42, the ground's most)
    grade: number             // of the grade, 0..1
    bounce: number            // of the ground's bounce (LC4), 0..1: less than the trees, so a coat keeps its value against its ground
  }
  grade: {                    // the grade (gradeOf in src/look/shaders/painter.glsl, the last step of every painted material)
    greenTint: Color3         // a green's value turned toward this
    greenChroma: number       // how much of a green's chroma is kept
    greenAmt: number          // how far greens go to the muted green
    sat: number               // the saturation kept overall
    splitLo: Color3           // the split tone in the darks
    splitHi: Color3           // the split tone in the lights
    lift: Color3              // added to the darks
    topHaze: Color3           // the haze toward the frame's top (depth by painting)
    topAmt: number            // how much of it at the top
    vignette: Color3          // the frame's corners × this
  }
}

const c = (r: number, g: number, b: number) => new Color3(r, g, b)

export const MOODS = {
  // golden morning: the look up to LC3 (?mood=golden), the default before it
  golden: {
    sun: c(1.00, 0.84, 0.60), winterSun: c(0.98, 0.95, 0.88),
    shadow: c(0.45, 0.57, 0.76), shadowTurn: c(0.34, 0.45, 0.80), shadowLift: c(0.02, 0.04, 0.07),
    midCool: c(0.86, 0.92, 0.98), litLift: c(0.03, 0.025, 0.0), rim: c(1.0, 0.86, 0.6), back: c(1.0, 0.78, 0.45),
    mistShade: c(0.42, 0.53, 0.68), mistLit: c(1.0, 0.86, 0.63),
    hazeCool: c(0.60, 0.69, 0.78), hazeWarm: c(0.95, 0.80, 0.58),
    waterSky: c(0.62, 0.74, 0.86), glint: c(1.0, 0.86, 0.58), farRiver: c(0.40, 0.55, 0.58),
    earth: { tint: c(1, 1, 1), chroma: 1, amt: 0 },
    bounce: 0.7,
    units: { tint: 0.4, mist: 0.08, grade: 0.2, bounce: 0.35 },
    grade: {
      greenTint: c(1.03, 1.0, 0.88), greenChroma: 0.5, greenAmt: 0.85, sat: 0.9,
      splitLo: c(0.92, 0.99, 1.06), splitHi: c(1.08, 1.0, 0.85), lift: c(0.03, 0.02, 0.0),
      topHaze: c(0.72, 0.76, 0.82), topAmt: 0.20, vignette: c(0.80, 0.87, 0.98),
    },
  },
  // temperate, the default (LC3, docs/plans/done/lc3-temperate.md; the owner's pick of LC2's candidates: golden "a
  // bit cooler, less colourful, but not grey"): a paler, less warm sun, a bluer air, the world at 60 % of its chroma
  temperate: {
    sun: c(1.00, 0.93, 0.82), winterSun: c(0.96, 0.96, 0.94),
    shadow: c(0.48, 0.57, 0.68), shadowTurn: c(0.38, 0.47, 0.72), shadowLift: c(0.02, 0.03, 0.04),
    midCool: c(0.92, 0.93, 0.94), litLift: c(0.02, 0.018, 0.005), rim: c(1.0, 0.90, 0.72), back: c(1.0, 0.85, 0.60),
    mistShade: c(0.48, 0.57, 0.68), mistLit: c(0.92, 0.88, 0.78),
    hazeCool: c(0.60, 0.68, 0.78), hazeWarm: c(0.86, 0.80, 0.68),
    waterSky: c(0.62, 0.73, 0.84), glint: c(1.0, 0.92, 0.75), farRiver: c(0.40, 0.54, 0.58),
    earth: { tint: c(1.02, 1.0, 0.94), chroma: 0.6, amt: 1 },
    bounce: 0.7,
    units: { tint: 0.3, mist: 0.05, grade: 0.1, bounce: 0.35 },
    grade: {
      greenTint: c(1.0, 1.0, 0.92), greenChroma: 0.6, greenAmt: 0.85, sat: 0.86,
      splitLo: c(0.94, 0.99, 1.05), splitHi: c(1.04, 1.0, 0.93), lift: c(0.02, 0.02, 0.015),
      topHaze: c(0.70, 0.76, 0.83), topAmt: 0.25, vignette: c(0.80, 0.86, 0.96),
    },
  },
} satisfies Record<string, Mood>
export type MoodName = keyof typeof MOODS

// the mood in use: set once, before any material is made (src/look/main.ts); a material copies its colours when it
// is made, so a later change would apply only in part: lockMood() (the first material) refuses it
export let MOOD: Mood = MOODS.temperate
let locked = false
export const lockMood = (): void => { locked = true }
export function setMood(name: string): void {
  if (locked) throw new Error('setMood: the materials are made: the mood is set before them')
  if (!Object.hasOwn(MOODS, name)) throw new Error(`?mood must be one of ${Object.keys(MOODS).join(', ')}, not ${name}`)
  MOOD = MOODS[name as MoodName]
}
// ?bounce=<0..2> on the look page: the ground's bounce at a strength, set on load (LC4), on a copy of the mood
export function setBounce(v: number): void {
  if (locked) throw new Error('setBounce: the materials are made: set it before them')
  if (!(v >= 0 && v <= 2)) throw new Error(`?bounce must be 0 to 2, not ${v}`)
  MOOD = { ...MOOD, bounce: v }
}

// the grade (gradeOf, src/look/shaders/painter.glsl) of one colour at a height in the frame (0 bottom, 1 top), for what
// no material draws: the clear colour, which shows only at the frame's top
export function gradeColour(c: Color3, m: Mood, y: number): Color3 {
  const g = m.grade, L = (v: Color3) => 0.2126 * v.r + 0.7152 * v.g + 0.0722 * v.b, l = L(c)
  const sstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
  const green = Math.min(1, Math.max(0, (c.g - Math.max(c.r, c.b)) * 3)) * g.greenAmt
  let o = Color3.Lerp(c, new Color3(l * g.greenTint.r + (c.r - l) * g.greenChroma, l * g.greenTint.g + (c.g - l) * g.greenChroma, l * g.greenTint.b + (c.b - l) * g.greenChroma), green)
  const lo = L(o); o = Color3.Lerp(new Color3(lo, lo, lo), o, g.sat)
  o = o.multiply(Color3.Lerp(g.splitLo, g.splitHi, sstep(0.08, 0.75, l))).add(g.lift.scale(1 - l))
  return Color3.Lerp(o, g.topHaze.scale(0.85 + l * 0.35), sstep(0.60, 1.0, y) * g.topAmt)
}
