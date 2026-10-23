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
   and the routing pulse stay on the top face; selection and hover rings follow the raised block.

Out of scope: lit relief, woods as canopy, roofs (decision 0051's bake, a later step); the game's staff map
(`src/render/map.ts`); the map engine's draft page; season tuning beyond keeping each season readable.

## Approach

- One `LIT` flag from the URL; every change branches on it, so the default page draws exactly as before.
- Paper and grain in the terrain shader's paper term and `paperCanvas()`; the lit palette as its own season table.
- Arrows and blocks on the 2D ink canvas (`drawOrders`, `drawBlock`): the shadow first (a blurred offset copy), then
  the side face, the top face, the edges. The light direction is one constant shared by blocks and arrows.
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
