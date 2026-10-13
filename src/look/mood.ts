// The light's moods (docs/plans/active/track-e-look.md §LC, docs/plans/active/lc1a-moods.md): every colour of the
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
  grade: {                    // the post pass's grade (src/look/shaders/uber.frag)
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

export const MOODS: Record<string, Mood> = {
  // golden morning: the look up to LC1a (docs/art-bible.md §4, "golden morning (default)")
  golden: {
    sun: c(1.00, 0.84, 0.60), winterSun: c(0.98, 0.95, 0.88),
    shadow: c(0.45, 0.57, 0.76), shadowTurn: c(0.34, 0.45, 0.80), shadowLift: c(0.02, 0.04, 0.07),
    midCool: c(0.86, 0.92, 0.98), litLift: c(0.03, 0.025, 0.0), rim: c(1.0, 0.86, 0.6), back: c(1.0, 0.78, 0.45),
    mistShade: c(0.42, 0.53, 0.68), mistLit: c(1.0, 0.86, 0.63),
    hazeCool: c(0.60, 0.69, 0.78), hazeWarm: c(0.95, 0.80, 0.58),
    grade: {
      greenTint: c(1.03, 1.0, 0.88), greenChroma: 0.5, greenAmt: 0.85, sat: 0.9,
      splitLo: c(0.92, 0.99, 1.06), splitHi: c(1.08, 1.0, 0.85), lift: c(0.03, 0.02, 0.0),
      topHaze: c(0.72, 0.76, 0.82), topAmt: 0.20, vignette: c(0.80, 0.87, 0.98),
    },
  },
}

// the mood in use: set once, before any material is made (src/look/main.ts)
export let MOOD: Mood = MOODS.golden
export function setMood(name: string): void {
  const m = MOODS[name]
  if (!m) throw new Error(`?mood=${name}: no such mood (${Object.keys(MOODS).join(', ')})`)
  MOOD = m
}
