---
status: active
last_reviewed: 2026-10-23
---

# Plan: a first lit map view in the staff map prototype (paper, grain, arrows, raised blocks)

## Problem

Decision 0051 (proposed) wants one map view with a 3D feel for the editor and the game; the owner's reference is a
frame of Epic History TV's Waterloo (its source note arrives with PR #135, beside decision 0051). Before building the
renderer, the owner wants to see a first pass of the feel: a warmer paper, grain, better order arrows and army blocks
that stand off the ground. The one place that already has paper, terrain, blocks and arrows together is the staff map
prototype (`prototypes/staff-map.html`), in the ink style of `docs/proposals/staff-map/design.md`.

## Scope

A `?style=lit` mode in `prototypes/staff-map.html`; without it the page is unchanged (the ink style stays for
comparison). In the lit mode:
1. **Paper:** a warmer yellow-brown, aged toward the map's edges.
2. **Grain:** coarser and at more scales (fibres, blotches, fine noise), over the whole map, terrain included.
3. **Order arrows:** one tapered shape along a smoothed path (wide at the tail, narrow at the neck, the head part of
   the same outline), a notched tail, a thin dark edge, a lighter inner line and a soft cast shadow.
4. **Blocks:** a top face lit from the north-west (a lighter NW edge, a darker SE edge), a side face 3–4 px deep in a
   darker shade of the army colour, and a short soft shadow on the ground toward the south-east. Hatching for morale
   and the routing pulse stay on the top face (the shadow and the sides are clipped out under it); selection and
   hover rings stay around the top face, the block's footprint.

5. **Relief as contours** (the owner's choice, 2026-10-23, over the hachures): minor contours every 5 m and index
   contours every 25 m, drawn in the terrain shader from the height, about a pixel wide at any zoom, each set fading
   where its lines crowd, and fading with the rest of the ink toward the painted world.

Out of scope: lit relief (shading), woods as canopy, roofs (decision 0051's bake, a later step); the game's staff map
(`src/render/map.ts`); the map engine's draft page; season tuning beyond keeping each season readable.

## Approach

- One `LIT` flag from the URL; every change branches on it, so the default page draws exactly as before.
- Paper and grain in the terrain shader's paper term (the paper texture is the default's, sampled at a finer scale too);
  the lit palette as its own season table.
- Arrows and blocks on the 2D ink canvas (`drawOrders`, `drawBlock`): every block's shadow and side faces first, then
  every top face and its edges, so no shadow falls on a neighbour's top. One light, the world's north-west seen on
  screen each frame (it turns with the camera), sets the side faces and every shadow.
- Readability (art bible §4, decision 0051's guards): the army colours stay the most saturated marks; the paper and
  grain stay below them in chroma; every block keeps an outline.

## Acceptance

- `?style=lit` screenshots at the map zoom and at mid zoom, in summer and winter, side by side with the default style
  and the reference, shown to the owner.
- The default page is unchanged: at fixed URL parameters (`?R=…&x=…&z=…&simto=…`, the page's headless hooks), its
  screenshots from main and from the branch are pixel-identical (`tools/png.mjs`), at the map zoom and at mid zoom.
  `tools/golden.mjs` knows only the look page's cameras, so it does not apply here.
- No console errors in either mode (`tools/shot.mjs` exit 0).

## Review rounds

- **Round 1** (`/code-review high`): severe: the outline strokes after `litEdges` drew one stray segment (the canvas's
  current path), the dark slab under every block filled the morale hatching and the hollow square's hole, an arrow
  could be drawn backwards while its reveal trailed the troops. Fixed, with the moderate ones: shadows and side faces in
  a pass of their own before every top face, clipped out under it; one light, the world's north-west on screen each
  frame; arrow sampling capped, a short arrow keeps its head; one paper term per style in the shader.
- **Round 2**: moderate and light only, so the review stops. Fixed: shadow offsets and blur in device pixels (canvas
  shadows ignore the transform), the ageing a band inside the frame (no seam at the border), the interface's paper,
  the light set before the arrows, the arrowhead continuous and on its base-to-tip axis, the arrows at 0.6 so the
  ground under a route reads and the blocks stay the strongest marks, one fill for a block's sides. Left: the corners
  projected twice per unit (74 units).

- **After the owner's test** (2026-10-23): a group order's arrow could start in empty ground, away from every block.
  It started at the group's average progress along one route laid from its centre, which a spread group or one whose
  battalions dropped out does not stand on (the ink style does the same, faintly). In the lit style the arrow's tail now
  starts at the centre of the battalions still on the order, where they stand, and joins the route where it passes
  nearest them.

## Results

- Lit screenshots (1600×900, Windows Chrome over CDP, SwiftShader): the map in summer, mid zoom in summer and winter
  with French orders, close zoom with a wavering, a routing, a square and a selected block. Shown to the owner.
- The default page against main at `?season=0&speed=0` (1280×720, the status bar masked): 456 differing channel
  values, the same as main against itself (456) and the branch against itself (456): the page's own run-to-run noise
  (an animated swatch and readouts in the lower part), so no change shows. Not a strict proof: the page has no
  `?frozen`.
- Not settled for v2: the notched tail reads as a fishtail; the blocks' depth is fixed in pixels (thin up close);
  Russian green on the summer olive has less contrast than French blue; the relief's light and shade (decision
  0051's bake) under the contours; height labels on the index contours; the summer wash's blocky noise, already in
  the ink style, shows more under the ageing.
