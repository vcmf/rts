---
status: current
last_reviewed: 2026-10-12
code: [prototypes/painted-cinematic.html, src/look/river.ts, src/look/world/author.ts, tools/build-look-data.ts, src/look/terrain.ts, tools/river-check.js, tools/render-check.js, tools/detail-check.mjs, src/look/world/water-data.ts, src/look/shaders/waterdata.glsl, tools/water-check.mjs, src/look/water.ts, src/look/shaders/water.frag, src/look/shaders/shore.glsl, tools/water-look-check.mjs]
decisions: [0004-lowland-meander-river, 0012-heightfield-authority, 0019-shading-data-from-authored-surface]
---

# River (lowland meander)

One meandering channel generated once at load into dense per-sample arrays. Every consumer
(terrain carve, terrain colours, water mesh, scatter, reflections, far-ring line) asks one query,
`riverQuery()`; nothing re-derives the river from a formula. Built in W1 and W1b
(`docs/plans/done/w1-river-shape.md`, `docs/plans/done/w1b-river-width.md`) in the prototype, ported to the look
page in L0 (generated offline, `src/look/world/author.ts`), with cut banks and point bars since W2
(`docs/plans/done/w2-river-banks.md`, the look page only), the water data baked for the water's shaders since
W3 (`docs/plans/done/w3-water-data.md`), the painted water, its shoreline from that data, since W4
(`docs/plans/done/w4-water-surface.md`), the banks, stones and reeds since W5a and the river's seasons since W5b
(`docs/plans/done/w5-banks.md`).

## Goals / non-goals

- **Goals:** bends that turn back on themselves; visibly varying width (4–11 m, stretches differ);
  pools at bends and riffles between them; a flat floodplain in a valley; water level that never
  rises downstream; nothing in the water except stones, and floating leaves in autumn (`docs/art-bible.md` §6c).
- **Non-goals (later):** weirs and fords as authored crossings, river networks, ponds and dams (W6, from the map
  format).

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
- **Water data (W3):** baked offline with the look data over the tile at `SPEC.water.texel`
  (`src/look/world/water-data.ts`): the signed depth (the nearest sample's water level, as the carve uses it, minus
  the authored height; its dry side is the height above the water), the signed distance to the shoreline (exact: the
  distance to the shoreline's segments, each crossing found by bisection on the authored surface, since a point bar
  meets the water nearly flat) and the flow (the river's direction × speed, easing to 0 over the last 1.5 m to the
  shore). An RGBA8 texture for the tile's terrain and the water (`uWater`, `WATERDATA`), made at load; the debug
  views (`?water=depth|sdf|flow`, `WATER_DEBUG` in `src/look/shaders/waterdata.glsl`) show it. Encoding ranges:
  `SPEC.water`. Baked from the authored surface, not the heightfield (proposed decision 0019).
- **Water mesh:** a flat ribbon at `zw` reaching 1.35 half-widths each side of the centre line
  (1.35 widths in all, wider than the channel: the outer columns dive under the bank),
  clamped onto the tile edge where the painted line takes over. Per vertex: across and along (m), the time of
  travel `tau` and the riffle (W4).
- **The shore band (W4):** the drawn shoreline (where the ribbon's plane cuts the 1.79 m heightfield) strays from
  the data's by up to 0.7 m, so the visible shore is painted, not geometric: within `SPEC.water.band` of the
  data's shoreline, on both sides, the terrain and the water paint one function (`shore()` in
  `src/look/shaders/shore.glsl`) from inputs both have at a world point (the water data, the bank normals, the
  light map, the grain). Where the two surfaces meet on screen they intersect, so they share the point, and the
  colours match. On land it is damp earth at the water's edge; in the water, the water's lower layers.
- **The painted water (W4):** opaque, layer by layer (`docs/research/stylized-water.md` §2.8): the bed seen through
  the water (silt in pools, gravel where it runs, weed in slow deep water; lit with the bank normals, no refraction
  offset), a painted absorption ramp from the data's depth, shadows and the shore foam (these in the band); then,
  faded in past the band, calm against rough water (the riffle, fast shallow water), the painted sky tint, the
  tree reflections, strokes on the time of travel (they stretch in fast water and never shear), glitter and riffle
  foam. Hard edges threshold the grain's soft blotches and are anti-aliased over a pixel (no shimmer). Dark water
  (`docs/plans/active/dark-water.md`, after the art bible's §6c and Tiny Glade): a deep teal from about half a metre,
  a dark painted sky tint, the trees' mirror a dark green, few light marks on calm water, the valley mist a third over
  the water.
- **The banks (W5a):** painted from the water data and the bank normals (`bankPaint()` in
  `src/look/shaders/shore.glsl`): damp grass near the water, bare earth where the bank is steep near it (cut banks),
  pale grey gravel on low gentle ground near it (point bars), and a wet line at the water, wider on gentle ground.
  The shore band's land side and the tile's terrain both paint it (the seam stays closed); within `SPEC.bank.edge`
  of the tile's edge the terrain hands back to the `aRiver` bands the apron and the far ring continue. Its edges widen
  with a pixel's footprint (no shimmer at the wide zooms).
- **Stones and their foam (W5a):** a seeded pass places stones in riffles and at the foot of the sharper cut banks,
  sized to stand 0.35–0.7 m out of the water; at most `SPEC.water.stones` of them go to the shaders (`uStones`),
  which paint a pillow upstream and a broken wake downstream of each, in the band function (so both surfaces agree).
- **Reeds (W5a):** clumps of the pack's grass blade, narrowed and set tall (the `Reed` model), on the land within
  about a metre of the water on slow inner bends, in their own role colour on the grass's sway.
- **The seasons on the water (W5b):** the ice forms where the water is slow (`iceAt()` in
  `src/look/shaders/shore.glsl`, from the water data's speed and depth, so both surfaces paint it alike): shelves
  along the banks and bars from late autumn, the pools closed over in winter, the riffles left open, dark and cold,
  with their foam (the stones' too); a broken white rime along the ice's edge and drifts of snow on it near the
  banks. The snow on the banks is the terrain's (the bank normals keep the cut banks' scarps bare). Autumn leaves
  drift on slow water past the band, from early autumn until the ice: an upper layer of the water in cells of the
  time of travel's coordinates, so they travel at the water's speed.
- **Placement:** `placeable` keeps every instance's footprint out of the water and the formation
  zones; stones may sit on riffles or at a cut bank's foot; reeds at the water's edge, on land; willows line the
  banks; wheat stays off the floodplain.

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
- `tools/water-check.mjs` (W3): the bake against the authoring step (depth exact to half an encoding step, the
  shore distance against a brute-force reference, the flow's direction) and the page's texture against the bake;
  sabotages under `--selftest`. It also reports where the drawn heightfield stands above the data's water (W4's
  shoreline).
- `tools/water-look-check.mjs` (W4): the band (the drawn surfaces disagree on the shore only within it; no
  z-fighting past it), the seam (the tile's ground drawn with each material: the same colour in the band), pools
  darker and calmer than riffles, and shimmer on the water (W4); the banks (wet line, cut bank, bar against the
  meadow) and the stones' foam (W5a); pools frozen and riffles open in winter, leaves in pools and not on riffles
  in autumn, none in summer or winter (W5b); each with a sabotage under `--selftest`.
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
