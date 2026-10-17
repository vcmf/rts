// The meadow's numbers both the scatter and the meadow read (src/look/nature.ts, src/look/meadow.ts;
// docs/plans/done/l5c-meadow.md), apart so the scatter does not load the meadow's shaders
// the grass's height, m: typical, and the most any clump reaches (well under a soldier's knee to hip: a formation
// standing in the meadow is never hidden, docs/art-bible.md pillar 1)
export const HEIGHT = 0.62, HEIGHT_MAX = 0.85
// how far a clump's blades reach from its root, m, at most: the outer ring's (Grass_Small's 0.26 m radius × its
// spread 4.2 × the jitter 1.2, and its lean); the growth keeps roots this far from the formation zones and the banks
export const CLUMP_REACH = 1.45
// the combed meadow's (?grass=flow, docs/plans/active/grass-flow.md): the outer ring's footprint 1.4 times (1.83 m), the
// flow's lean at the tip (at most 0.75 × HEIGHT_MAX, 0.64 m) and its jitter (0.07 m)
export const CLUMP_REACH_FLOW = 2.6
// how far a clump's root sinks under the meadow map's height, m: where grass grows that 1 m bilinear height is within
// 5.2 cm of the drawn tile's triangles (measured 2026-10-13: tools/look-check.js checks no clump floats)
export const MEADOW_SINK = 0.06
// the standing crop's height, m, at most (decision 0026): under a soldier's chest, so a formation in a field reads;
// the pre-modern cereals stood 1.2 to 1.8 m (the map's catalogue), the look keeps them lower
export const WHEAT_HEIGHT_MAX = 1.2
// the stubble's height, m, after the harvest (stubble fields, and the wheat cut in autumn): tall enough to read from
// the RTS camera (the owner, 2026-10-13: 0.22 m did not); and the green crop's, m, through the year
export const STUBBLE_HEIGHT = 0.45, GREEN_HEIGHT = 0.45
