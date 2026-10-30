// The meadow's numbers both the scatter and the meadow read (src/look/nature.ts, src/look/meadow.ts;
// docs/plans/done/l5c-meadow.md), apart so the scatter does not load the meadow's shaders
// the grass's height, m: typical, and the most any clump reaches (well under a soldier's knee to hip: a formation
// standing in the meadow is never hidden, docs/art-bible.md pillar 1)
export const HEIGHT = 0.62
export const HEIGHT_MAX = 0.85
// how far a clump's blades reach from its root, m, at most: the outer ring's (Grass_Small's 0.26 m radius × its
// spread 4.2 × the jitter 1.2, and its lean); the growth keeps roots this far from the formation zones and the banks
export const CLUMP_REACH = 1.45
/** A ring of the meadow's clumps (src/look/meadow.ts) */
export interface Ring {
  /** its cell, m */
  cell: number
  /** its slots a side (of the square it is cut from) */
  n: number
  /** the clumps' spread: their footprint grows with the cell, their height does not (never over HEIGHT_MAX) */
  spread: number
  /** its band of distance from the focus, m: in from [0] to [1], out from [2] to [3] (the next ring fades in where this
   * one fades out) */
  band: [number, number, number, number]
  /** its clump (data/meadow-grass.json) */
  clump: 'Grass_Large' | 'Grass_Small'
}
export const RINGS: Ring[] = [
  { cell: 0.5, n: 104, spread: 1.6, band: [0, 0, 18, 25], clump: 'Grass_Large' }, // band[1] 0: no fade in
  { cell: 1.0, n: 104, spread: 2.85, band: [18, 25, 38, 50], clump: 'Grass_Small' },
  { cell: 2.0, n: 104, spread: 4.2, band: [38, 50, 80, 100], clump: 'Grass_Small' },
]
// the clumps' meshes' widest radius, m, in data/meadow-grass.json's units (the test measures them), and the largest
// size jitter (meadow.vert: mix(0.8, 1.2, h3))
export const CLUMP_RADIUS = { Grass_Large: 0.393, Grass_Small: 0.258 } as const
const SIZE_JITTER = 1.2
// the rings the combed look widens up close (meadow.vert: step(uCell, 1.5), the inner rings)
export const WIDENED_CELL = 1.5
// the combed meadow's clumps (?grass=flow, docs/plans/done/grass-flow.md; meadow.vert reads these as defines): how
// much wider and taller than the default's, and the flow's lean at the tip as a share of the height (from upright to
// combed flat), with the hash's jitter. These are main's clumps before the upright ones (GRASS_UP[0], below), and
// their reach bounds every variant's
export const GRASS_WIDE = 1.4
export const GRASS_TALL = 1.15
export const LEAN_MIN = 0.18
export const LEAN_MAX = 0.75
export const LEAN_JITTER = 0.12
/** A look of the combed clumps (?grassup, docs/plans/done/grass-upright.md) */
export interface GrassUp {
  /** up close (CLOSE_ZOOM, the inner rings): the footprint and the height times these */
  wide: number
  tall: number
  /** the height times this on every ring (a shorter carpet) */
  short: number
  /** the flow's lean at the tip, a share of the height, from upright to the flow's most, and the hash's jitter */
  leanMin: number
  leanMax: number
  leanJitter: number
  /** how much of the clump's own fan (its blades spreading up their height) is undone: 0 none, 1 parallel blades */
  fanUndo: number
  /** up close, the least a clump is kept between the patches (1: none thinned out: denser) */
  dense: number
  /** 1: the middle ring's look fades to the outer ring's plain clumps across its band out (no seam between a wide,
   * dense carpet and the sparse outer clumps); 0 as main's looked */
  ringFade: number
}
// the owner (2026-10-29): the blades "more straight up", standing instead of fanning out, a short dense carpet (Tiny
// Glade's grass). 0: main's clumps; 1: upright (the lean narrow round the vertical, the fan mostly undone); 2:
// upright, shorter and denser up close (the carpet)
export const GRASS_UP: readonly GrassUp[] = [
  {
    wide: GRASS_WIDE,
    tall: GRASS_TALL,
    short: 1,
    leanMin: LEAN_MIN,
    leanMax: LEAN_MAX,
    leanJitter: LEAN_JITTER,
    fanUndo: 0,
    dense: 0.8,
    ringFade: 0,
  },
  {
    wide: 1.4,
    tall: 1.15,
    short: 1,
    leanMin: 0.05,
    leanMax: 0.25,
    leanJitter: 0.06,
    fanUndo: 0.7,
    dense: 0.8,
    ringFade: 1,
  },
  {
    wide: 1.8,
    tall: 0.9,
    short: 0.8,
    leanMin: 0.05,
    leanMax: 0.25,
    leanJitter: 0.06,
    fanUndo: 0.7,
    dense: 1,
    ringFade: 1,
  },
]
// the default look (?grassup with no value)
export const GRASS_UP_DEFAULT = 2
// main's clumps' reach, m: the outer ring's footprint (Grass_Small's 0.26 m radius × its spread 4.2 × the jitter 1.2)
// widened, and the lean and its jitter at the tallest (HEIGHT_MAX), with 5 cm to spare; the growth keeps roots this
// far from the formation zones and the banks for every look (the meadow map is the same whichever look is drawn)
export const CLUMP_REACH_FLOW =
  0.26 * 4.2 * 1.2 * GRASS_WIDE + (LEAN_MAX + LEAN_JITTER * Math.SQRT1_2) * HEIGHT_MAX + 0.05
/** How far a combed clump of look g reaches from its root at most, m: the widest ring's footprint (its mesh's radius,
 * CLUMP_RADIUS, × its spread × the size jitter, the look's widening on the inner rings only), and the lean and its
 * jitter at the tallest, 5 cm to spare. Its fan undone is not counted (an upper bound) */
export const clumpReach = (g: GrassUp): number =>
  Math.max(...RINGS.map(r => CLUMP_RADIUS[r.clump] * r.spread * SIZE_JITTER * (r.cell <= WIDENED_CELL ? g.wide : 1))) +
  (g.leanMax + g.leanJitter * Math.SQRT1_2) * HEIGHT_MAX +
  0.05
/** The combed clumps' defines for look g (meadow.vert), each a float literal */
export const grassDefinesForClumps = (g: GrassUp = GRASS_UP[GRASS_UP_DEFAULT]): string[] =>
  [
    ['GRASS_WIDE', g.wide],
    ['GRASS_TALL', g.tall],
    ['GRASS_SHORT', g.short],
    ['LEAN_MIN', g.leanMin],
    ['LEAN_MAX', g.leanMax],
    ['LEAN_JITTER', g.leanJitter],
    ['GRASS_FAN_UNDO', g.fanUndo],
    ['GRASS_DENSE', g.dense],
    ['GRASS_RING_FADE', g.ringFade],
  ].map(([k, v]) => `#define ${k} ${(v as number).toFixed(3)}`)
// how far a clump's root sinks under the meadow map's height, m: where grass grows that 1 m bilinear height is within
// 5.2 cm of the drawn tile's triangles (measured 2026-10-13: tools/look-check.js checks no clump floats)
export const MEADOW_SINK = 0.06
// the standing crop's height, m, at most (decision 0026): under a soldier's chest, so a formation in a field reads;
// the pre-modern cereals stood 1.2 to 1.8 m (the map's catalogue), the look keeps them lower
export const WHEAT_HEIGHT_MAX = 1.2
// the stubble's height, m, after the harvest (stubble fields, and the wheat cut in autumn): tall enough to read from
// the RTS camera (the owner, 2026-10-13: 0.22 m did not); and the green crop's, m, through the year
export const STUBBLE_HEIGHT = 0.45
export const GREEN_HEIGHT = 0.45
// a crop's clump at its root, times the grass clump's spread (docs/plans/done/crop-depth.md)
export const CROP_WIDE = 1.5
// the wheat's fill (?wheatfill, decision 0085; the owner, 2026-10-29: bare earth showed between the clumps): the
// standing wheat's clumps (class 6, not the green crop nor stubble) WHEAT_FILL_WIDE times the grass clump's spread at
// the root, none thinned out by the clump field, and the ground under the near wheat painted in its own deep colour
// (shore.glsl, meadowUnder). 0 main's, 1 the fill (the default)
export const WHEAT_FILL_WIDE = 1.9
export const WHEAT_FILL_LOOKS = 2
export const WHEAT_FILL_DEFAULT = 1
