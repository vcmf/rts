---
status: active
last_reviewed: 2026-10-31
---

# Plan: no dotted speckle on the far crowns

The owner's still (`output/crown-speckle/owner-report.png`, not committed: "i still see some artifacts in the crown at
high zoom"): from a far camera the tree crowns carry a regular dotted speckle, over their lit parts and at their edges.
The system: `docs/systems/look.md` (the far trees, "Culled per instance").

## Cause (measured)

Not the leaf alpha cut, the shadow map or the leaf texture: the far trees' **cross-fade from their leaf cards to their
crown meshes** (`farCuller` in `src/look/nature.ts`). It was by distance: nearer than 190 m the cards, past 250 m the
crown mesh, and in the 60 m band between both, split pixel by pixel by a screen-door dither (`dither` in
`src/look/shaders/painter.glsl`). The camera's widest zoom is 260 m, so from 190 m out most trees near the focus stood
in the band at rest, half of each. The two looks differ (the crown mesh smoother and lighter, the cards standing out of
it by about a card, so at the edge the cards' share shows the ground), and the render scale (0.75 there) and a
Retina screen enlarge the dither's cells: a dotted speckle.

Measured on the demo map (Metal, a production build): with the band's trees drawn as they are, the speckle; with their
crown meshes hidden, the cards alone with the dither's holes in their share; with their far cards hidden, the crown
meshes alone with the complementary holes. Nearer than the band (radius 150 m) no speckle.

## Approach

Fade over time, not over distance (`src/look/tree-fade.ts`): each tree keeps a side (its cards nearer than
`CARDS_M` 220 m, its crown mesh farther, changed only past `HYST_M` 5 m either side, so no flicker on the line) and a
fade that runs to its side over `FADE_S` 0.3 s. Both are drawn, dithered, only while a fade runs; at rest every tree is
wholly one or the other. The culler re-packs every frame while a fade runs (it already re-packs every frame the view
moves), only the groups with a fade running when the view holds. A tree out of view does no work and snaps to its
side (with the hysteresis) when it comes back; the first pack and a frozen clock (`?frozen`, the tools' views) snap
too; a tree drawn with its cards at every distance (past the leaf fall) keeps its state at its cards. The shaders are
unchanged. Decision 0098 records it, and why the figures' cross-fade (decision 0066) stays a band.

Cost: no per-pixel work added; at rest fewer pixels than before (the band's trees drew both meshes, each discarding
half). On the CPU a few operations a far tree in the frames the culler already runs, and up to 0.3 s of packs after
the camera stops. No bench: the per-pixel work only shrinks.

## Acceptance

- Before and after at the same views (demo, radius 200, 240 and 250 m): no dotted speckle at rest after
  (the compare page in the output folder `output/crown-speckle/`, not committed).
- `test/tree-fade.test.ts`: no tree half faded at rest wherever it stands (the old band too), the hysteresis, the
  fade's pace and its cap, the snap, the frozen clock, the cards-only trees, the trees out of view, the hysteresis on a snap, the two
  dithers complementary.
- `npm test` passes.

## Open questions

- At 220 m the crown mesh now meets the cards with no band: its smoother look shows as the tree's swap (a 0.3 s
  dissolve). If it reads as a pop, the crown mesh's look is the thing to bring nearer the cards', not the band.
