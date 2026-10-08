---
status: current
last_reviewed: 2026-10-08
code: [prototypes/painted-cinematic.html, tools/river-check.js, tools/render-check.js]
decisions: [0004-lowland-meander-river, 0012-heightfield-authority]
---

# River (lowland meander)

One meandering channel generated once at load into dense per-sample arrays. Every consumer
(terrain carve, terrain colours, water mesh, scatter, reflections, far-ring line) asks one query,
`riverQuery()`; nothing re-derives the river from a formula. Built in W1 and W1b
(`docs/plans/done/w1-river-shape.md`, `docs/plans/done/w1b-river-width.md`).

## Goals / non-goals

- **Goals:** bends that turn back on themselves; visibly varying width (4–11 m, stretches differ);
  pools at bends and riffles between them; a flat floodplain in a valley; water level that never
  rises downstream; nothing in the water except stones (`docs/art-bible.md` §6c).
- **Non-goals (later):** asymmetric cut banks and point bars (W2); the water-data bake and the
  painted water shader (W3–W4); river networks, ponds and dams (W6).

## Design

- **Centre line:** a Kinoshita curve in a valley frame (axis slightly sinuous, west of the hill),
  with per-bend jitter and a cubic restoring term so bends double back without crossing.
- **Per-sample arrays** (`RIVER`): position, tangent, arc length `s`, curvature, width `W`, depth
  `D`, bank asymmetry `A` (for W2), riffle 0..1, water level `zw`, speed.
- **Width rule:** each stretch of 2–3 bends has its own scale (slow noise), bends narrow, straight
  riffles widen; soft limits 4 and 11 m; smoothed over about two widths so banks never notch.
- **Pools and riffles:** riffle phase about 6 local widths apart; depth and speed derived from the
  smoothed riffle value.
- **Query:** `riverQuery(x, z, wantLevel)` returns the nearest segment (index, parameter, signed
  distance, `s`) through a 16 m bucket grid; the blended water level only when asked for (the
  trough needs it where two passes of a bend meet).
- **Terrain:** valley trough and floodplain (84 m), then a symmetric channel carve, on the 800 m
  detail tile (1.79 m grid). The far ring (14.3 m grid) has the trough only and shows the river as a
  painted line from a mask texture; an apron stitches the two grids vertex for vertex.
- **Water mesh:** a flat ribbon at `zw`, 1.35 half-widths wide (outer columns dive under the bank),
  clamped onto the tile edge where the painted line takes over.
- **Placement:** `placeable` keeps every instance's footprint out of the water and the formation
  zones; stones may sit on riffles; willows line the banks; wheat stays off the floodplain.

## Tunables

`RIVER.P` and the width rule in `prototypes/painted-cinematic.html` (RIVER section); valley axis
`axisX`.

## Verification

- `tools/river-check.js`: shape (backtracking bends, width range and per-stretch contrast, width
  steps, riffle steps), terrain (no floating banks, no cliffs, water above the bed, exact stitch),
  placement (nothing in the water or zones, population).
- `tools/render-check.js`: differential render (river visible, banks dry, far-ring line), camera
  bounds, shadow-box coverage.
- Every check has had a negative run (see the plans).

## Open questions

- The heightfield is still evaluated in the page; it moves to a build step in E0-lite (decision 0012).
