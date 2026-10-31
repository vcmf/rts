---
status: proposed
date: 2026-10-31
---

# 0098 The far trees' cards fade into their crown meshes over time, not over a band of distance

The plan: `docs/plans/active/crown-speckle.md`; as built: `docs/systems/look.md` (the far trees, "Culled per
instance"), `src/look/tree-fade.ts`.

## Context

A far tree swaps its leaf cards for its crown mesh at 220 m from the camera. The swap was cross-faded over a band of
distance (190 to 250 m), both drawn and split pixel by pixel by a screen-door dither. The camera's widest zoom is
260 m, so from about 190 m out most trees near the focus stood in the band at rest, half of each. The two looks differ
(the crown mesh smoother and lighter, the cards standing out of it), and the render scale and a Retina screen enlarge
the dither's cells: the owner saw a dotted speckle over the crowns (2026-10-31).

## Decision

We will fade the far trees' swap over time: each tree keeps a side (its cards nearer than 220 m, its crown mesh
farther, changed only 5 m past the line), and when it changes side it dissolves into the other over 0.3 s. At rest
every tree is wholly one or the other; the dither shows only while a fade runs. A frozen clock (`?frozen`), the first
pack and a tree coming back into view snap.

It differs from the figures' cross-fade (decision 0066, `src/look/lod-fade.ts`), which stays a band, by the figure's
height on screen: there each man fades over his own short share of the band, so few men are half drawn at once, the
two LODs are close in look, and a man covers a few pixels; a crown is a large area, its two looks differ, and the
camera rests at the zooms where the band sat, so any tree left half dithered at rest shows.

## Consequences

- No speckle on the crowns at rest; at rest fewer pixels drawn than before (the band's trees drew both meshes).
- The swap at 220 m shows as a 0.3 s dissolve while the camera moves; if it reads as a pop, the crown mesh's look is
  what to bring nearer the cards'.
- The culler re-packs a group every frame while one of its fades runs; a tree's side depends a little on the camera's
  path (the hysteresis), so the tools' views use the frozen clock.
