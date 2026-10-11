---
status: active
last_reviewed: 2026-10-11
---

# Plan: W5, the banks, stones and reeds (W5a) and the river's seasons (W5b)

Water phase W5 (`docs/plans/active/prototype-plan.md` §4.3), after W4 (`docs/plans/done/w4-water-surface.md`) in
Track E's stage 1 (`docs/plans/active/track-e-look.md`). Art direction: `docs/art-bible.md` §6c. Research:
`docs/research/stylized-water.md` §2.9, §4.4, §4.8, §4.10.

Two PRs: **W5a** the banks, the stones and their foam, the reeds; **W5b** the seasons on the water (pools freeze
first, riffles stay open, autumn leaves in pools). This plan covers both; W5b's section is refined when W5a merges.

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
  and snow on the banks' rims; autumn leaves drifting in pools along the flow.

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

- **Placement** (`src/look/nature.ts`): a seeded pass along the river samples: in riffles (riffle over 0.5) a stone
  or two mid-channel every few widths, and at the foot of the sharper cut banks (|A| over 0.5) one at the water's
  edge. Each must pass the placement rule as a stone (in a riffle or on dry land) and stay out of the formation
  zones. The existing random stones stay.
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
- **Readable from 260 m** (§6c): at the widest zoom, along the centre line on screen, every sample's pixel is water
  (no gaps or dashes).
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
