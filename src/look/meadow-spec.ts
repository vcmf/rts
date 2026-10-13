// The meadow's numbers both the scatter and the meadow read (src/look/nature.ts, src/look/meadow.ts;
// docs/plans/done/l5c-meadow.md), apart so the scatter does not load the meadow's shaders
// the grass's height, m: typical, and the most any clump reaches (well under a soldier's knee to hip: a formation
// standing in the meadow is never hidden, docs/art-bible.md pillar 1)
export const HEIGHT = 0.62, HEIGHT_MAX = 0.85
// how far a clump's blades reach from its root, m, at most: the outer ring's (Grass_Small's 0.26 m radius × its
// spread 4.2 × the jitter 1.2, and its lean); the growth keeps roots this far from the formation zones and the banks
export const CLUMP_REACH = 1.45
// how far a clump's root sinks under the meadow map's height, m: where grass grows that 1 m bilinear height is within
// 5.2 cm of the drawn tile's triangles (measured 2026-10-13: tools/look-check.js checks no clump floats)
export const MEADOW_SINK = 0.06
