// The meadow's numbers both the scatter and the meadow read (src/look/nature.ts, src/look/meadow.ts;
// docs/plans/done/l5c-meadow.md), apart so the scatter does not load the meadow's shaders
// the grass's height, m: typical, and the most any clump reaches (well under a soldier's knee to hip: a formation
// standing in the meadow is never hidden, docs/art-bible.md pillar 1)
export const HEIGHT = 0.62
export const HEIGHT_MAX = 0.85
// how far a clump's blades reach from its root, m, at most: the outer ring's (Grass_Small's 0.26 m radius × its
// spread 4.2 × the jitter 1.2, and its lean); the growth keeps roots this far from the formation zones and the banks
export const CLUMP_REACH = 1.45
// the combed meadow's clumps (?grass=flow, docs/plans/done/grass-flow.md; meadow.vert reads these as defines): how
// much wider and taller than the default's, and the flow's lean at the tip as a share of the height (from upright to
// combed flat), with the hash's jitter
export const GRASS_WIDE = 1.4
export const GRASS_TALL = 1.15
export const LEAN_MIN = 0.18
export const LEAN_MAX = 0.75
export const LEAN_JITTER = 0.12
// their reach, from those: the outer ring's footprint (Grass_Small's 0.26 m radius × its spread 4.2 × the jitter 1.2)
// widened, and the lean and its jitter at the tallest (HEIGHT_MAX), with 5 cm to spare
export const CLUMP_REACH_FLOW =
  0.26 * 4.2 * 1.2 * GRASS_WIDE + (LEAN_MAX + LEAN_JITTER * Math.SQRT1_2) * HEIGHT_MAX + 0.05
export const grassDefinesForClumps = (): string[] =>
  [
    ['GRASS_WIDE', GRASS_WIDE],
    ['GRASS_TALL', GRASS_TALL],
    ['LEAN_MIN', LEAN_MIN],
    ['LEAN_MAX', LEAN_MAX],
    ['LEAN_JITTER', LEAN_JITTER],
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
