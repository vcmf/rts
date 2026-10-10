---
status: active
last_reviewed: 2026-10-10
---

# Plan: W2, river banks (cut banks and point bars)

Water phase W2 (`docs/plans/active/prototype-plan.md` §4.3), the first water step after L2 in Track E's
stage 1 (`docs/plans/active/track-e-look.md`). Research: `docs/research/stylized-water.md` §2.4–2.5.

## Problem

- **The channel is symmetric** (`src/look/world/author.ts`, `carve`): a parabola under the water and
  the same bank rise on both sides. A meander's outer bank should be a steep cut bank with the deep
  water against it, and its inner bank a long, low point bar. The river already carries the asymmetry
  per sample (`RIVER.A`, + where the outer bank is on the +n side), unused.
- **The banks are coarser than the grid can show.** The heightfield's cells are 1.79 m (decision 0012,
  `src/look/spec.ts`), and the channel is 4–11 m wide: 2 to 6 cells. A steep bank cannot exist in that
  geometry, and where a curved bank crosses the grid diagonally, the per-vertex normals shade it as a
  sawtooth (stair-steps).

## Scope

- The asymmetric cross-section in the carve (the heightfield changes along the river; the far ring
  does not: it has no channel).
- **A fine bank normal map,** built offline with the look data: the authored surface's normal at
  0.5 m over the river corridor, which the tile's terrain shades with there. The heightfield stays
  the authority for height (decision 0012); the map changes shading only.
- Checks: the shape (cut bank steeper than the bar) and the shading (the drawn normals match the
  authored surface at the banks; per-vertex normals, the sabotage, do not).

**Not in W2:** the shoreline where the water meets the bank (W4: the ribbon and the bed shader), bank
colours and materials (W5), the water-data bake (W3).

## Approach

### The cross-section

Research §2.4's `section(n, hw, A, D, bankH)`, ground height relative to the local water surface at
signed offset `n`:
- the thalweg (the deepest line) shifts toward the outer bank by `0.35·|A|·hw`;
- **outer half:** the bed rises steeply to the water's edge at `hw`, then a scarp to the floodplain
  whose width shrinks as `|A|` grows (a near-vertical cut bank on the sharpest bends);
- **inner half:** the water's edge moves in (the bar is dry sooner), then the bar rises slowly over
  up to 1.35 `hw` to the floodplain.

It replaces the symmetric profile in `carve`, still taken as a minimum with the trough (the carve never
raises the land). The parameters stay in `author.ts` beside the river's.

### The fine bank normal map

- **Built** by `tools/build-look-data.ts` from the authored height `H` (the same function the heightfield
  samples): central differences at 0.5 m, on a grid over the tile, only in the corridor within a set
  distance of the river (beyond the floodplain's edge the grid's own normals are good enough).
- **Stored** in the look data as rows of spans (a row's covered runs only), three bytes a texel: the
  normal's x and z (signed, y derived) and a weight that fades the map out at the corridor's edge.
  The corridor is a small share of the tile, so the data grows by about 1 MB, not the 7.7 MB of a full
  grid. The look data's format version goes up.
- **Read** by the tile's terrain material (`src/look/shaders/terrain.frag`): `N = normalize(mix(vN,
  fineN, w))`, before `paint()`. One fetch. The far ring and the apron keep their vertex normals (the
  corridor ends inside the tile).
- **Uploaded** as an RGBA8 texture over the tile at 0.5 m (1600², 10 MB with mips; counted in the
  SPEC's bake budget, `minSpec.bakeMB`). Its texel size is a SPEC value.

### Checks (`tools/river-check.js` and a new page check)

- **Asymmetry:** on bends with `|A| > 0.5`, the outer bank's slope from the water's edge to the
  floodplain is at least 2× the inner bank's, on the authored surface and on the drawn heightfield.
- **Existing checks hold:** no floating banks, the water never rises downstream, no water under the bed,
  no cliffs on the floodplain (its limit may need to exclude the scarp itself, which is the point: if
  so, the cliff check keeps the floodplain and gains its own scarp limit), the channel in its
  floodplain.
- **Bank shading:** the terrain writes its shading normal in a debug view (`DETAIL_DEBUG_N`); at points
  sampled along both banks of the tile's river (inside the corridor, on screen, at the default and the
  closest zoom), the angle between the drawn normal and the authored surface's normal (central
  differences on `H` at 0.5 m in Node) has a 95th percentile under a limit set from the map's own
  quantisation. **Sabotage:** without the map (vertex normals only), it fails.
- **Goldens:** the differences are the river's corridor; shown in the PR.
- **Readability guard:** no block that passes on the base fails.
- **Bench:** the terrain pass's cost against the base (one more fetch), reported.

## Acceptance

From the prototype plan (W2: "Cut banks steep, point bars shallow; no terrain stair-steps at banks"):
- the asymmetry check passes; the screenshots at three zooms show cut banks and bars (owner's eye);
- the bank-shading check passes and its sabotage fails;
- every existing river and render check passes;
- `npm run check:data` passes with the new look data; `npm test` passes.

## Risks

- **The scarp on a 1.79 m grid:** the heightfield can only slope a 1.1 m scarp over a cell; the light
  map and the sun's shadow see that slope. The fine normals carry the steepness in the shading; if
  the scarp still reads soft at the closest zoom, the research's bank strip mesh is the next step.
- **The medial axis on the inside of tight bends** (where the nearest segment switches): the bar's
  crest sits there and may show a ridge. Judged on screenshots; the research suggests blending the two
  nearest segments if it shows as a seam.
- **The water ribbon over a lower bar:** the ribbon is flat at the water level out to 1.35 half-widths;
  where the inner bar now stays under that level farther out, the water reaches farther across the bar.
  The ribbon's width rule may need the section's water's edge per side (checked by `waterUnderBed` and
  on screenshots).

## Results (dev Mac, against L2b as the base)

- **Shape** (`tools/river-check.js`): on 97 bends with |A| > 0.5 the inner bar takes a median 2.25×
  the cut bank's distance to climb (limit 2); the steepest bank step 2.08 m per metre (limit 3); the
  floodplain beyond the section 0.69 m per metre (limit 1.2); no floating banks, no water under the
  wet bed. The wet channel is measured from one grid cell inside `wetEdges()`: within a cell of a
  shallow bar's edge the drawn ground can sit above the water (the shoreline, W4). The sabotage (every
  bend's cut bank on the wrong side) fails `cutBankVsBar`.
- **Bank shading** (`tools/detail-check.mjs`, `banks`): the drawn normal against the authored surface's
  at 1,210 points on both banks of the sharpest bend: median 0.9° / 1.1°, 95th percentile 9.2° / 13.9°
  (closest / middle zoom). Without the bank normals (the sabotage): 9.0° / 10.6° and 32.8° / 34.1°.
  Limits: median 3°, 95th percentile 20°. The tail is on the scarps, which turn faster than 0.5 m texels.
- **The detail checks** pass unchanged; the seam check runs with the bank normals off (a cut bank is a
  real crease the grain follows, sub-pixel at the wide zooms).
- **Goldens:** the differences lie along the river's corridor (cameras without the river match).
- **Readability guard:** no block that passes on the base fails.
- **Bench** (Metal, a proxy): the terrain pass +0.01 to +0.09 ms against the base.
- **Look data:** 1.75 MB (was 1.28 MB): the bank normals, 0.47 MB.
