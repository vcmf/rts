---
status: active
last_reviewed: 2026-10-11
---

# Plan: W5, the banks, stones and reeds (W5a) and the river's seasons (W5b)

Water phase W5 (`docs/plans/active/prototype-plan.md` §4.3), after W4 (`docs/plans/done/w4-water-surface.md`) in
Track E's stage 1 (`docs/plans/active/track-e-look.md`). Art direction: `docs/art-bible.md` §6c. Research:
`docs/research/stylized-water.md` §2.9, §4.4, §4.8, §4.10.

Two PRs: **W5a** the banks, the stones and their foam, the reeds (merged, #45); **W5b** the seasons on the water
(pools freeze first, riffles stay open, autumn leaves in pools). This plan covers both; W5b's sections follow W5a's
results.

## Problem

- **The banks are painted from the 1.79 m grid.** The terrain's bank colours (`albedo()` in
  `src/look/shaders/terrain.frag`) come from `aRiver`, a distance to the water's edge per grid vertex, interpolated
  over the triangles: a damp band, a dark green band and mud, in half-widths, the same on both banks. The cut bank's
  bare earth and the point bar's pale gravel (art bible §6c) are not painted at all, and since W4 the shore band
  (0.75 m) paints a uniform damp earth that these coarse bands then meet.
- **Nothing in the river makes foam.** Stones land in riffles only by chance (the scatter's random disc), and the
  water has no foam around them (§6c: "broken white foam lines on riffles and around stones").
- **No reeds** (§6c: "reeds and cattails at the water's edge"). The nature pack has no reed model.
- **Seasons on the water** (W5b): the whole river freezes at once and evenly; riffles should stay open longest, with
  frosty edges, and autumn leaves should drift in pools.

## Scope

**W5a**
- **Bank painting from the data:** the wet line at the water, damp darker grass on the floodplain near the water,
  bare earth on steep banks near the water (cut banks), pale gravel on low gentle ground near the water (point
  bars). One shared function, so the shore band (W4) is part of it and the seam stays closed.
- **Stones** placed on purpose: in riffles and at the foot of cut banks (§6c), a few per bend; their **foam** in the
  water (a pillow upstream, a wake downstream, research §4.4).
- **Reeds** at the water's edge on slow inner bends, from the pack's grass blades in a reed role colour.

**W5b**
- Ice that forms on slow water first (pools, the shallows by the bars) and leaves the riffles open, with frosty edges
  and snow on the banks' rims; autumn leaves drifting in pools along the flow (below, Approach (W5b)).

**Not in W5:** weirs and fords as authored crossings (they need features the map format describes, W6); ponds (W6);
the far ring's banks (it keeps its painted line).

## Approach (W5a)

### The banks

- **One function,** `bank()` in `src/look/shaders/shore.glsl`, from the water data and the bank normals at a world
  point: the land distance (`−sdf`), the height above the water (`−depth`, to 1 m), and the slope (the bank
  normal's `y`). Research §2.9:
  - **wet line:** darker, cooler, a touch more saturated; wider on gentle ground (up to 1.6 m on bars) than on steep
    (0.4 m on cut banks), its edge broken by the grain;
  - **bare earth:** where the bank is steep (normal `y` under about 0.8) within 4 m of the water;
  - **gravel:** low (under 0.6 m above the water), gentle ground within 3 m of the water: pale warm dabs;
  - **damp grass:** a darker, cooler meadow over the next few metres.
- **Who paints it:** the shore band's land side (`shoreLand`) becomes `bank()` lit, so both surfaces still paint the
  same colour in the band. The terrain paints `bank()` out to where it fades into the meadow (about 6 m from the
  water), replacing the `aRiver` bands there; within `SPEC.bank.edge` of the tile's edge it hands back to the
  `aRiver` bands, which the apron and the far ring's painted line continue (the band itself still stops at the
  tile's edge, as in W4).

### Stones and foam

- **Placement** (`src/look/nature.ts`): a seeded pass along the river samples (its own random stream, so the rest of
  the scatter keeps its places): in riffles (riffle over 0.62) a stone mid-channel every few widths, as a stone (the
  existing rule: in a riffle or on dry land); at the foot of the sharper cut banks (|A| over 0.55) one at the water's
  edge, as a new kind, `cutstone` (`atCutBank` in `src/look/river.ts`: the outer side of a bend sharper than |A| 0.5,
  the centre within 0.6 m of the water's edge, reaching at most 1.2 m). Sized from the depth to stand 0.35–0.7 m
  out of the water; skipped where that would need a rock over three times the pack's. The existing random stones
  stay; those that land in the water (on riffles) get foam too.
- **Foam:** the water reads a list of the stones in the water (position, radius, the flow direction there): a
  uniform array, at most `SPEC.water.stones` of them (the loop's cost is fixed). Per stone, in the flow's frame: a
  thin pillow arc upstream, and a wake of two broken streaks downstream, 4–8 radii long and widening, drifting
  with the strokes (research §4.4). Hard-edged and anti-aliased as W4's marks, faded with the pixel's footprint
  (W4). An upper layer (outside the band): stones at the bank's foot have their foam in the water side.
- **Their canopy shadow and reflection** stay what the scatter already gives stones.

### Reeds

- **Model:** the pack's `Grass` blades, scaled tall and narrow (about 1.2–1.8 m), in a new reed role colour (green-
  brown, straw in autumn), on the grass material (they sway with it).
- **Placement:** clumps on the land within 1 m of the water on slow inner bends (|A| over 0.4 on the bar's side,
  riffle under 0.4), from the water data (the scatter reads the data at a point, as the band check does). A new
  placement kind, `reed`: on dry land (shore distance under 0), at the water's edge; never in the formation zones.

## Checks

- **Banks** (page, `tools/water-look-check.mjs` gains `banks`): at the default and the closest zoom over a bend,
  pixels classed by the data (wet line, cut bank, bar, damp grass, the meadow beyond): the wet line darker than the
  meadow; the cut bank's hue warmer and its value lower than the meadow's; the bar paler than the meadow; each by a
  margin. Sabotage: the banks painted from `aRiver` as before (`WATER_SAB_BANKS`).
- **The seam** (W4's check) still passes: the band is the bank's function on both surfaces.
- **Stones' foam** (page): for each stone in the water on screen, foam-bright pixels in the pillow and wake sectors
  against the same sectors with the stone ignored: more by a margin. Sabotage: no stone foam (`WATER_SAB_NOFOAM`).
- **Placement** (`tools/river-check.js`): stones on purpose stand in riffles or on dry land at a cut bank's foot;
  reeds stand on dry land within 1 m of the water and never in the water; nothing else changes (`instancesOverWater`
  learns the reed kind).
- **Readable from 260 m** (§6c): the render check's far view (260 m) already requires the water to be what the
  camera sees at 80% of the centre line's points (and fails when the water is sunk); dashes and gaps are judged on
  the widest screenshots. No separate check (it could not fail where that one passes).
- **Shimmer** (W4's check) holds at both zooms; **existing checks** hold; **readability guard**: no new failing
  block; **goldens**: the river's corridor changes; **bench**: the terrain and water passes against main (Metal
  proxy; the laptop decides).

## Acceptance

From the prototype plan (W5: "Banks read wet/bare/gravel; foam around rocks; winter freezes ponds cleanly"):
- W5a: the banks, foam and placement checks pass and their sabotages fail; the seam, shimmer and existing checks
  hold; the screenshots show wet lines, bare cut banks, gravel bars, stones with foam and reeds (owner's eye).
- W5b: winter screenshots show pools frozen and riffles open; autumn shows leaves in pools (owner's eye); its checks
  are planned with it.

## Risks

- **Busy banks:** four bank treatments plus reeds and stones can crowd the river (art bible §11, "readable first").
  Each is held to a narrow band; judged on the screenshots at three zooms.
- **The terrain's cost:** the bank function on more terrain pixels (out to about 6 m from the water); the bench.
- **Stone foam's loop:** a fixed array, so its cost is fixed; if a world needs more stones than the array holds, a
  baked foam mask (research §2.6's second texture) replaces it.

## Results, W5a (dev Mac, against main with W4 as the base)

- **Banks** (`node tools/water-look-check.mjs <url> --selftest`, `banks`): at four views, against the meadow (luma
  0.531, red over green 0.031, chroma 0.329): the wet line luma 0.479; the cut bank's scarp red over green 0.067 and
  luma 0.498; the bar luma 0.605 and chroma 0.286. All past their margins. The cut bank's margin was planned at 0.08
  and set at 0.03 as built: its class takes every outer bank 0.3–1.2 m from the water, gentle bends' too, and main's
  old mud bands measured 0.075 there. Without the banks (the sabotage) the bar fails.
- **Stones' foam** (`foam`): 5 stones at the closest zoom, all with a pillow (3–39 points) and a wake (6–18 points)
  the foam brightens; without the foam, none. Placement: 10 stones in the water from the W5a pass and the scatter.
- **Reeds:** 131 blades in clumps; `tools/river-check.js` holds them within 1.2 m of the water's edge
  (`reedsAwayFromWater`, with a negative in `tools/check-negatives.mjs`).
- **Seam** (W4's): the two materials match exactly (largest 0/255). W4's gate allowed 0.1% of the pixels over 6/255:
  those were undefined derivatives at the shoreline (the land and water branches reached 1.5 fwidth past the
  shore, the blend 1.2 and a quad one more); with the margin at 2.5 they are gone, and the gate is back to the largest.
- **Shimmer:** closest 0.57% per frame pair, widest 2.9% (limit 3.5%; the bank edges widen with the pixel).
- **Pools and riffles:** 0.535 / 0.568, bright pixels 0.1% / 4.1%. The riffle foam's threshold stays W4's (0.66; a
  try at 0.70 cost the margin).
- **Existing checks:** `tools/check-negatives.mjs` (with the new reed case), `tools/water-check.mjs --selftest`,
  `tools/detail-check.mjs --selftest`, `npm test` (217), `npm run check:data`, the docs check: all pass.
- **Readability guard:** no block that separates on the base fails. **Goldens:** the view without the river matches;
  the others change along the river.
- **Bench** (Metal proxy, main against this branch, two runs each): frame time p50 −0.4 to +0.2 ms at the close and
  default zooms, up to +0.55 ms at the widest; the worst frame 6.9 ms. GPU terrain +0.1 to +0.45 ms, water +0.12 to
  +0.55 ms. The laptop decides.
- **Review:** round 1 (severe: the stones' foam under the water's upper layers; a step at the band's edge on cut
  banks; the foam loop's derivatives; cut-bank stones loosening the rule for every stone) fixed: the foam painted
  last, one ground under both surfaces' banks (which also took away a damp-earth ring), the loop's reach, a
  `cutstone` kind; and the banks only on land (under the water they matched the water's colour and failed the render
  check). Round 2 (nothing severe; fixed and stopped): the apron and the tile's rim keep their pre-W5 colours; the
  scatter's stones in the water get foam; the foam's radius from the stone's mean size; the foam skipped on land;
  one water read in the terrain; `atCutBank` shared by the page and the check; the SPEC checks the banks' reach;
  the shoreline's derivative margin (above).

## Approach (W5b)

The seasons run on `uSeason` (0 summer, 1 early autumn, 2 late autumn, 3 winter; `src/look/shaders/painter.glsl`).
Since W4 the ice is one amount over the whole water (`iceAmt()`, from 2.3 to 3) and it fades every upper layer.

### Ice where the water is slow

- **Measured first** (the water data at the river's samples, centre and ±0.3, ±0.6 half-widths): the speed (the
  flow's length, 0..1) is 0.40 in pools (riffle under 0.2), 0.62, 0.77, and 0.87 in riffles (0.6 and over); at
  0.6 half-widths out, pools run 0.13–0.26. The speed is in the water data, so the terrain's band and the water read
  the same value and the ice stays seamless; the ribbon's riffle is not (it is the ribbon's own attribute).
- **One function,** `iceAt(xz, sp, d)` in `shore.glsl`, 0..1, called by `shoreWater` (both surfaces) and by the
  water's upper layers and the stones' foam (they fade under the local ice instead of `iceAmt()`). The frost F
  grows from late autumn (2.0) to winter (3.0); water freezes where its speed, less a bonus in the shallows (under
  0.4 m deep) and jittered by the grain's blotches, is under a threshold that rises with F to 0.66 in full winter.
  So the ice starts as shelves along the banks and the bars in late autumn, closes over the pools in winter, and the
  riffles stay open (deep water from about 0.75; shallow riffle edges can freeze). The ice's edge is hard (`aastep`, wider than a pixel far out).
- **Frosty edges:** a thin rime of white along the ice's edge on the ice's side, broken by the grain; the open water
  in winter darker and colder (less sky tint, no glitter's warmth), its strokes and riffle foam kept: open riffles
  read as dark water with white foam between pale ice.
- **The ice:** W4's colour (pale, cracked, darker over deep water) with drifts of snow on it, thicker near the
  banks, broken by the grain, so the frozen river still reads as a river (not as the snowy meadow).
- **Snow on the banks' rims:** the band's land side already paints the terrain's snow through the bank normals
  (`paint()`, `snowAt`): the rims and the bars whiten, the cut banks' scarps stay bare earth. Kept and judged on the
  screenshots; no new code unless they show otherwise.

### Autumn leaves in the pools

- **An upper layer** of the water (past the band: it needs the ribbon's time of travel), from early autumn (season
  0.6, full from 1.3) to 2.5, on slow water (speed under 0.45, gone from 0.62); none under the ice.
- **Drifting with the current:** cells in the time of travel's coordinates, 4 along (the clock wrapped to a period of
  200 along, the hash's period too, so the wrap is seamless and the layout repeats only past 200 m of travel) by
  1.6 m across; most cells hold one leaf at a hashed place, angle and size, drawn in metres (along scaled by the
  section's speed, a new ribbon attribute, over the strokes' speed). Each pixel reads the 2×2 cells nearest it, so
  no leaf is cut at a cell's edge. Colours from the trees' autumn palette (orange, yellow, red, brown), late autumn
  browner.
- **Size, as built:** 0.5–0.75 m, larger than life (planned 0.10–0.18 m: at the closest zoom those were 2–3 pixels
  and read as specks; at the default zoom, nothing). Hard-edged, anti-aliased over 1.2 pixels in metres, faded as a
  pixel grows past 0.15–0.3 m (under a pixel they would shimmer).

## Checks (W5b)

- **Winter** (`tools/water-look-check.mjs` gains `winter`): the pools check's three reaches at season 3, pixels at
  the river's samples classed by the riffle there (as `pools`); a pixel is ice when it is pale (luma over the
  threshold set from the first run between the ice and the open water). Pools mostly ice (≥ WINTER_POOL), riffles
  mostly open (≥ WINTER_OPEN). Sabotage: the ice even over the whole water as in W4 (`WATER_SAB_EVENICE`).
- **Leaves** (`leaves`): the same reaches at season 1.5 against the same frames without the leaves
  (`WATER_SAB_NOLEAVES`): pixels the leaves change, on pools at least LEAF_MIN, on riffles at most a third of the
  pools'; in summer and winter, none. Sabotages: no leaves; leaves at any speed (`WATER_SAB_LEAFALL`).
- **Seam** (W4's) holds in winter: it gains a winter view (the ice is in the band).
- **Shimmer** holds at both zooms in autumn (the leaves) and in winter (the ice's edge, the rime and the cracks are
  hard edges; the water's own pixels, without the land's snow, held to the summer limits).
- **Existing checks; readability guard; goldens** (the winter view changes along the river); **bench** (Metal
  proxy).

## Acceptance (W5b)

The winter, leaves, seam and shimmer checks pass and their sabotages fail; the existing checks hold; the
screenshots show the pools frozen, the riffles open with frosty edges, snow on the banks' rims, and leaves in the
pools in autumn (owner's eye).
