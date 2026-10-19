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
  shadowAutumn: Color3        // the shadow band's colour in autumn (it turns from shadow as the leaves do: shadowOf)
  shadowTurnAutumn: Color3    // the hue the shadow band turns toward in autumn
  shadowWinter: Color3        // the shadow band's colour in winter (from late autumn, as the snow comes)
  shadowTurnWinter: Color3    // the hue the shadow band turns toward in winter
  cloudSnow: Color3           // a cloud's shade on snow (× the snow: paint())
  midCool: Color3             // the mid band's cool share (paint(): the mid is this mixed 30 % toward the sun)
  litLift: Color3             // added to the lit band (paint())
  rim: Color3                 // the warm rim's tint, × the sun
  back: Color3                // the sun through the leaves' tint, × the sun (the foliage's backlight)
  mistShade: Color3           // the valley mist's air where it is in shadow
  mistLit: Color3             // the valley mist's air where it is sunlit
  mist: number                // the valley mist's amount (1: LC3's; mist() in painter.glsl)
  autumn: number              // how far autumn goes to one family of warm pastels (0: the mixed wood; foliage(), groundSeason)
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
  bounce: number              // the ground's bounce on units and crowns (LC4: paint(), BOUNCE), 0..2 (0.7 in the moods)
  groundBounce: number        // the ground's bounce on the ground (LC5: the bounce map, paint(), GROUND_BOUNCE), 0..2
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
    contrast: number          // the values spread about a mid grey, colour kept (0: none; gradeOf)
    greenHue: number          // degrees the greens turn toward teal in summer (0: none; gradeOf)
    summerSat: number         // the saturation kept outside autumn, × sat (1: as autumn; gradeOf)
  }
}

const c = (r: number, g: number, b: number) => new Color3(r, g, b)

export const MOODS = {
  // golden morning: the look up to LC3 (?mood=golden), the default before it
  golden: {
    sun: c(1.00, 0.84, 0.60), winterSun: c(0.98, 0.95, 0.88),
    shadow: c(0.45, 0.57, 0.76), shadowTurn: c(0.34, 0.45, 0.80), shadowLift: c(0.02, 0.04, 0.07), shadowAutumn: c(0.45, 0.57, 0.76), shadowTurnAutumn: c(0.34, 0.45, 0.80), shadowWinter: c(0.45, 0.57, 0.76), shadowTurnWinter: c(0.34, 0.45, 0.80), cloudSnow: c(0.68, 0.75, 0.94),
    midCool: c(0.86, 0.92, 0.98), litLift: c(0.03, 0.025, 0.0), rim: c(1.0, 0.86, 0.6), back: c(1.0, 0.78, 0.45),
    mistShade: c(0.42, 0.53, 0.68), mistLit: c(1.0, 0.86, 0.63), mist: 1, autumn: 0,
    hazeCool: c(0.60, 0.69, 0.78), hazeWarm: c(0.95, 0.80, 0.58),
    waterSky: c(0.22, 0.32, 0.38), glint: c(1.0, 0.86, 0.58), farRiver: c(0.15, 0.26, 0.29),
    earth: { tint: c(1, 1, 1), chroma: 1, amt: 0 },
    bounce: 0.7, groundBounce: 0.5,
    units: { tint: 0.4, mist: 0.08, grade: 0.2, bounce: 0.35 },
    grade: {
      greenTint: c(1.03, 1.0, 0.88), greenChroma: 0.5, greenAmt: 0.85, sat: 0.9,
      splitLo: c(0.92, 0.99, 1.06), splitHi: c(1.08, 1.0, 0.85), lift: c(0.03, 0.02, 0.0),
      topHaze: c(0.72, 0.76, 0.82), topAmt: 0.20, vignette: c(0.80, 0.87, 0.98), contrast: 0, greenHue: 0, summerSat: 1,
    },
  },
  // temperate, the default (LC3, docs/plans/done/lc3-temperate.md; the owner's pick of LC2's candidates: golden "a
  // bit cooler, less colourful, but not grey"): a paler, less warm sun, a bluer air, the world at 60 % of its chroma
  temperate: {
    sun: c(1.00, 0.93, 0.82), winterSun: c(0.96, 0.96, 0.94),
    shadow: c(0.48, 0.57, 0.68), shadowTurn: c(0.38, 0.47, 0.72), shadowLift: c(0.02, 0.03, 0.04), shadowAutumn: c(0.48, 0.57, 0.68), shadowTurnAutumn: c(0.38, 0.47, 0.72), shadowWinter: c(0.48, 0.57, 0.68), shadowTurnWinter: c(0.38, 0.47, 0.72), cloudSnow: c(0.68, 0.75, 0.94),
    midCool: c(0.92, 0.93, 0.94), litLift: c(0.02, 0.018, 0.005), rim: c(1.0, 0.90, 0.72), back: c(1.0, 0.85, 0.60),
    mistShade: c(0.48, 0.57, 0.68), mistLit: c(0.92, 0.88, 0.78), mist: 1, autumn: 0,
    hazeCool: c(0.60, 0.68, 0.78), hazeWarm: c(0.86, 0.80, 0.68),
    waterSky: c(0.22, 0.32, 0.38), glint: c(1.0, 0.92, 0.75), farRiver: c(0.15, 0.26, 0.29),
    earth: { tint: c(1.02, 1.0, 0.94), chroma: 0.6, amt: 1 },
    bounce: 0.7, groundBounce: 0.5,
    units: { tint: 0.3, mist: 0.05, grade: 0.1, bounce: 0.35 },
    grade: {
      greenTint: c(1.0, 1.0, 0.92), greenChroma: 0.6, greenAmt: 0.85, sat: 0.86,
      splitLo: c(0.94, 0.99, 1.05), splitHi: c(1.04, 1.0, 0.93), lift: c(0.02, 0.02, 0.015),
      topHaze: c(0.70, 0.76, 0.83), topAmt: 0.25, vignette: c(0.80, 0.86, 0.96), contrast: 0, greenHue: 0, summerSat: 1,
    },
  },
  // epic (docs/plans/active/epic-palette.md; the owner, 2026-10-18: "an 'epic version' of tiny glade"; the first pass
  // "over contrasted"): temperate's air thinner, a warmer sun against cooler shade, a little more of the world's own
  // colour, the values barely spread; autumn one family of warm pastels (Tiny Glade's)
  epic: {
    sun: c(0.98, 0.98, 0.93), winterSun: c(0.95, 0.96, 0.98),
    shadow: c(0.40, 0.52, 0.70), shadowTurn: c(0.24, 0.42, 0.80), shadowLift: c(0.0, 0.01, 0.02),
    shadowAutumn: c(0.50, 0.45, 0.43), shadowTurnAutumn: c(0.52, 0.34, 0.26),
    shadowWinter: c(0.46, 0.44, 0.50), shadowTurnWinter: c(0.46, 0.42, 0.52), cloudSnow: c(0.74, 0.73, 0.80),
    midCool: c(0.94, 0.97, 0.98), litLift: c(0.03, 0.022, 0.0), rim: c(1.0, 0.86, 0.62), back: c(1.0, 0.80, 0.50),
    mistShade: c(0.62, 0.56, 0.52), mistLit: c(0.96, 0.86, 0.70), mist: 0.4, autumn: 1,
    hazeCool: c(0.56, 0.65, 0.76), hazeWarm: c(0.92, 0.78, 0.60),
    waterSky: c(0.22, 0.32, 0.38), glint: c(1.0, 0.88, 0.62), farRiver: c(0.15, 0.26, 0.29),
    earth: { tint: c(1.0, 1.0, 0.97), chroma: 0.75, amt: 0.45 },
    bounce: 0.7, groundBounce: 0.5,
    units: { tint: 0.3, mist: 0.05, grade: 0.1, bounce: 0.35 },
    grade: {
      greenTint: c(0.84, 0.92, 0.92), greenChroma: 0.66, greenAmt: 0.85, sat: 0.85,
      splitLo: c(0.97, 0.99, 1.02), splitHi: c(1.02, 1.0, 0.96), lift: c(0.012, 0.012, 0.014),
      topHaze: c(0.66, 0.73, 0.82), topAmt: 0.14, vignette: c(0.78, 0.84, 0.94), contrast: 0, greenHue: 25, summerSat: 0.85,
    },
  },
} satisfies Record<string, Mood>

export type MoodName = keyof typeof MOODS

// the mood in use: set once, before any material is made (src/look/main.ts); a material copies its colours when it
// is made, so a later change would apply only in part: lockMood() (the first material) refuses it
export let MOOD: Mood = MOODS.epic   // the default (decision 0043)
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
// ?gbounce=<0..2> on the look page: the ground's bounce on the ground (LC5), as setBounce
export function setGroundBounce(v: number): void {
  if (locked) throw new Error('setGroundBounce: the materials are made: set it before them')
  if (!(v >= 0 && v <= 2)) throw new Error(`?gbounce must be 0 to 2, not ${v}`)
  MOOD = { ...MOOD, groundBounce: v }
}

// the grade (gradeOf, src/look/shaders/painter.glsl) of one colour at a height in the frame (0 bottom, 1 top), for what
// no material draws: the clear colour, which shows only at the frame's top
// The mood's light by the season (docs/plans/active/epic-palette.md), the one source for every material's initial
// values (src/look/materials.ts) and the per-frame update (src/look/main.ts): the shadow band's colour and turn from
// summer's to autumn's as the leaves turn (season 0.3 to 0.8), then to winter's (2.2 to 3); the grade's saturation
// (summerSat outside autumn); the greens' teal turn as a matrix about the grey axis, muted to greenChroma (column-
// major for GLSL), and its share (greenK: none in autumn); the ground's season (sooner in the warm autumn); the grass
// tips' lime, warmed in the warm autumn. Writes into `out` (no allocation a frame)
export interface SeasonLight { shadow: Color3; turn: Color3; sat: number; greenK: number; greenRot: Float32Array; ground: number; tip: Color3; tipWarm: number }
export const newSeasonLight = (): SeasonLight => ({ shadow: new Color3(), turn: new Color3(), sat: 1, greenK: 0, greenRot: new Float32Array(9), ground: 0, tip: new Color3(), tipWarm: 0 })
const TIP_LIME = new Color3(1.04, 1.08, 0.80), TIP_WARM = new Color3(1.06, 1.0, 0.86)
const lumaW = (c: Color3) => 0.3 * c.r + 0.59 * c.g + 0.11 * c.b
const unitTurns = new WeakMap<Mood, [Color3, Color3, Color3]>()
export function seasonLight(m: Mood, s: number, out: SeasonLight): SeasonLight {
  const st = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
  const ak = st(0.3, 0.8, s) * (1 - st(2.2, 3, s)), wk = st(2.2, 3, s)
  Color3.LerpToRef(m.shadow, m.shadowAutumn, ak, out.shadow); Color3.LerpToRef(out.shadow, m.shadowWinter, wk, out.shadow)
  let u = unitTurns.get(m); if (!u) unitTurns.set(m, u = [m.shadowTurn, m.shadowTurnAutumn, m.shadowTurnWinter].map(c => c.scale(1 / lumaW(c))) as [Color3, Color3, Color3])
  Color3.LerpToRef(u[0], u[1], ak, out.turn); Color3.LerpToRef(out.turn, u[2], wk, out.turn)
  out.sat = m.grade.sat * (m.grade.summerSat + (1 - m.grade.summerSat) * ak)
  out.greenK = m.grade.greenHue > 0 ? 1 - ak : 0
  const a = m.grade.greenHue * Math.PI / 180 * out.greenK, k = 1 / Math.sqrt(3), co = Math.cos(a), si = Math.sin(a), t = 1 - co, g = m.grade.greenChroma, kk = k * k * t, ks = k * si, r = out.greenRot
  // R[row][col] = (row === col ? co : 0) + kk + (skew), stored column-major
  r[0] = (co + kk) * g; r[1] = (kk + ks) * g; r[2] = (kk - ks) * g
  r[3] = (kk - ks) * g; r[4] = (co + kk) * g; r[5] = (kk + ks) * g
  r[6] = (kk + ks) * g; r[7] = (kk - ks) * g; r[8] = (co + kk) * g
  out.ground = Math.min(s, 1) + (st(0, 0.8, s) - Math.min(s, 1)) * m.autumn
  out.tipWarm = m.autumn * st(0.3, 1, s); Color3.LerpToRef(TIP_LIME, TIP_WARM, out.tipWarm, out.tip)
  return out
}
// the season's light in use (src/look/main.ts updates it as the season moves; the finishing pass reads its saturation)
export const SEASON: SeasonLight = newSeasonLight()

export function gradeColour(c: Color3, m: Mood, y: number, sat = m.grade.sat): Color3 {
  const g = m.grade, L = (v: Color3) => 0.2126 * v.r + 0.7152 * v.g + 0.0722 * v.b, l = L(c)
  const sstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
  const green = Math.min(1, Math.max(0, (c.g - Math.max(c.r, c.b)) * 3)) * g.greenAmt
  let o = Color3.Lerp(c, new Color3(l * g.greenTint.r + (c.r - l) * g.greenChroma, l * g.greenTint.g + (c.g - l) * g.greenChroma, l * g.greenTint.b + (c.b - l) * g.greenChroma), green)
  const lo = L(o); o = Color3.Lerp(new Color3(lo, lo, lo), o, sat)
  o = o.multiply(Color3.Lerp(g.splitLo, g.splitHi, sstep(0.08, 0.75, l))).add(g.lift.scale(1 - l))
  return Color3.Lerp(o, g.topHaze.scale(0.85 + l * 0.35), sstep(0.60, 1.0, y) * g.topAmt)
}
