---
status: current
last_reviewed: 2026-10-11
code: [prototypes/painted-cinematic.html, src/look/river.ts, src/look/world/author.ts, tools/build-look-data.ts, src/look/terrain.ts, tools/river-check.js, tools/render-check.js, tools/detail-check.mjs]
decisions: [0004-lowland-meander-river, 0012-heightfield-authority]
---

# River (lowland meander)

One meandering channel generated once at load into dense per-sample arrays. Every consumer
(terrain carve, terrain colours, water mesh, scatter, reflections, far-ring line) asks one query,
`riverQuery()`; nothing re-derives the river from a formula. Built in W1 and W1b
(`docs/plans/done/w1-river-shape.md`, `docs/plans/done/w1b-river-width.md`) in the prototype, ported to the look
page in L0 (generated offline, `src/look/world/author.ts`), with cut banks and point bars since W2
(`docs/plans/active/w2-river-banks.md`, the look page only).

## Goals / non-goals

- **Goals:** bends that turn back on themselves; visibly varying width (4–11 m, stretches differ);
  pools at bends and riffles between them; a flat floodplain in a valley; water level that never
  rises downstream; nothing in the water except stones (`docs/art-bible.md` §6c).
- **Non-goals (later):** the shoreline where the water meets the bank (W4); the water-data bake and the
  painted water shader (W3–W4); river networks, ponds and dams (W6).

## Design

- **Centre line:** a Kinoshita curve in a valley frame (axis slightly sinuous, west of the hill),
  with per-bend jitter and a cubic restoring term so bends double back without crossing.
- **Per-sample arrays** (`RIVER`): position, tangent, arc length `s`, curvature, width `W`, depth
  `D`, bank asymmetry `A` (+ where the outer bank is on the +n side), riffle 0..1, water level `zw`, speed.
- **Width rule:** each stretch of 2–3 bends has its own scale (slow noise), bends narrow, straight
  riffles widen; soft limits 4 and 11 m; smoothed over about two widths so banks never notch.
- **Pools and riffles:** riffles spaced in local widths; depth and speed derived from the smoothed
  riffle value.
- **Query:** `riverQuery(x, z, wantLevel)` returns the nearest segment (index, parameter, signed
  distance, `s`) through a bucket grid; the blended water level only when asked for (the
  trough needs it where two passes of a bend meet).
- **Terrain:** valley trough and floodplain, then the channel carve, on the detail tile. On the look
  page (W2) the carve is an asymmetric section (`section()` in `src/look/river.ts`, continuous where a bend
  reverses): the deepest line shifts
  toward the outer bank, which rises steeply to a scarp (the cut bank, near vertical on the sharpest
  bends); on the inner side the water's edge comes in and a long, low bar rises to the floodplain (the
  point bar). `wetEdges()` and `bankReach()` give each side's water's edge and the bank's end; the water
  ribbon dives past the water's edge on each side, and the bank colours start from it. The prototype keeps
  W1's symmetric carve.
- **Bank normals (W2):** the heightfield's 1.79 m cells cannot hold a scarp, so the look data also
  carries the authored surface's normal over the river's corridor (`SPEC.bank`: the texel, the corridor, its
  fades, one toward the tile's edge so the apron meets it without a seam), and the tile's
  terrain shades with it there (`BANKN` in `src/look/shaders/terrain.frag`). Heights stay the
  heightfield's (decision 0012); only the shading is finer.
  The coarse far ring has the trough only and shows the river as a painted line from a mask
  texture; an apron stitches the two grids vertex for vertex (sizes: `docs/proposals/engine-design.md` §4).
- **Water mesh:** a flat ribbon at `zw` reaching 1.35 half-widths each side of the centre line
  (1.35 widths in all, wider than the channel: the outer columns dive under the bank),
  clamped onto the tile edge where the painted line takes over.
- **Placement:** `placeable` keeps every instance's footprint out of the water and the formation
  zones; stones may sit on riffles; willows line the banks; wheat stays off the floodplain.

## Tunables

All values live in `prototypes/painted-cinematic.html` (RIVER section): `RIVER.P` (base width,
depth, floodplain and belt widths, valley shape, sinuosity, seed), the width rule, the riffle
spacing, the query grid and the valley axis `axisX`. This doc names them; it does not copy them.

## Verification

- On the look page (W2), `tools/river-check.js` also checks the cut banks against the bars on the
  sharper bends (`cutBankVsBar`, its limits there), measures the wet channel from `wetEdges()`, and keeps
  the cliff limit for the floodplain beyond each bank (`bankReach()`; the banks get their own); `tools/detail-check.mjs` (`banks`) compares the drawn shading
  normal at the banks with the authored surface's. Both have sabotages (`tools/check-negatives.mjs`,
  `--selftest`).
- `tools/river-check.js`: shape (backtracking bends, width range and per-stretch contrast, width
  steps, riffle steps), terrain (no floating banks, no cliffs, water above the bed, exact stitch),
  placement (nothing in the water or zones, population).
- `tools/render-check.js`: differential render (river visible, banks dry, far-ring line), camera
  bounds, shadow-box coverage.
- Every check has had a negative run (see the plans).

## Open questions

- The prototype still evaluates its heightfield in the page; the look page reads it from the look data
  (decision 0012, L0).
- The shoreline follows the 1.79 m geometry, so where a bar is shallow it shows the grid (W4).
