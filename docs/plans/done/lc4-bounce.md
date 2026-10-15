---
status: done
last_reviewed: 2026-10-15
---

# Plan: LC4, bounced light on units and crowns

Track E, LC4 (`docs/plans/active/track-e-look.md` §LC). The owner's review (2026-10-13): "global illumination changes
a lot of things, like a blue coat in an orange light has an orange tilt". The look has no bounced light. Its one
stand-in, a 15 % tint of a tree's albedo toward the ground under it (L5), colours the leaves rather than lighting them,
and units have nothing.

## Scope

- **The ground's bounce** in `paint()`, for units (the army blocks, the figures to come) and the trees (`nature.frag`,
  `canopy.frag`): light from below, in the colour of the ground under the point, on faces that look down or sideways,
  in the shadow and mid bands (the sun's band is the sun's), times the occlusion.
- **It replaces the trees' albedo tint.** The grass blades keep theirs: they are painted from the ground.
- **Units take the bounce's full hue** (the eye white-balances on the sun, not on a bounce off coloured ground: a blue
  coat over wheat takes a warm underside, the owner's "orange tilt"), and a share of its strength (`units.bounce`,
  0.35), the owner's call after the guard.
- **The sky's part needs no new term:** the shadow band is already the sky's colour (`shadowOf`, the mood's).
- Not in scope: the ground's own bounce (LC5), buildings.

## Approach

- The caller sets `pBounce` before `paint()`: the ground's colour under the point (`groundBounce`, the class's
  colour, through `earthOf` and `groundSeason`). The painter includes no ground code, so it cannot read the ground
  itself. `block.frag` gains `#include<shore>` to read it.
- In `paint()`, under `BOUNCE`: `c += alb * pBounce * k * down * (1 - lit) * occ`, where `down = (1 - N.y) / 2` and
  `lit` is the sun band's share. `k` is the mood's `bounce` (0.7), units take `units.bounce` of it. `?bounce=<0..2>` on
  the look page tries a strength live. Winter's bounce goes toward the snow's white as it lies.
- The trees' `bw` tint goes.

## Acceptance

- Pairs: a coat block on wheat and on grass, close; a copse's crowns. A warm underside on the wheat, a green one on the
  meadow.
- `tools/coat-check.mjs` passes; `tools/guard.mjs --base` main, three views and seasons: no new failure.
- The goldens: they change on the trees (expected), the ground unchanged.
- The frame's cost: the bench against main.
- `npm test`, `node tools/check-docs.mjs`; `docs/systems/look.md`; decision 0027 extended if needed (a record).

## Results

Main at b657297.

- **The look:** crowns' undersides and shadow sides take the ground's colour (green over meadow, gold over wheat, pale
  in snow); the blocks' sides a little of it. Subtle at 0.7 on the flat blocks (their tops face the sky): figures,
  upright, will show it more. The owner tries strengths with `?bounce=`.
- **The guard** against main, start, cover and crops, three seasons, with units at 0.35 of the bounce (at the full
  bounce, four blocks fell under the bound, the worst the Austrian white in the valley at 0.053). At start, three fall
  just under: the Austrian white in the valley, 0.087 in summer and 0.099 in autumn (main 0.106 and 0.118), and the
  British red on the winter meadow, 0.099 (main 0.101). At cover, one: the Austrian white on the village ground in
  winter, 0.073 (main 0.101; the snow's bounce). The owner's call (2026-10-15): accept, recorded on #78. Crops: ok.
- **The coat check:** ok. **`npm test`:** exit 0, 256 tests (after round 1: the soldier timing budget alone under
  load; alone it passes).
- **The guard after round 1:** at start two blocks under the bound, the Austrian white in the valley in summer (0.088)
  and the British red on the winter meadow (0.098); the autumn valley white recovered. At cover the village white in
  winter at 0.086 (from 0.073). Crops ok. All accepted on #78.
- **The goldens** differ where trees are (the crowns' bounce in place of the tint): before review a mean difference of
  1 to 2/255 a region; after round 1 (the bounce lit by the ground's sun, faded with height) 0.09 to 0.34/255, the
  ground unchanged.
- **The frame's cost:** not measured reliably. Three bench runs swung by ±1 to ±6 ms on both sides, at a load average
  of 27 to 30 from macOS's own indexing and an install (`mds`, `installd`). The term costs one cover read a tree or
  block pixel and a few multiplies (an estimate: well under 0.1 ms). To measure on a quiet machine: #94.

## Review

- **Round 1** (severe): `block.frag` lacked the derivatives extension that `shore.glsl` needs (WebGL1 would not
  compile it). The design also changed:
  - **The bounce is lit:** the sun's colour and the ground's own light map (a third in shadow, the sky's); before, a
    shaded floor bounced as brightly as sunlit wheat.
  - **It fades with height** (gone by 8 m), as the old tint did.
  - **It whitens where snow lies** (`snowAt`), not by the season alone.
  - **Card crowns without the volume normal take none** (their card normals would speckle it).
  - Smaller: the trees' dead mix is gone, an empty `?bounce=` is an error, decision 0035 records the units' rule,
    and #94 tracks the bench.
- **Round 2** (severe): blocks compile with `NOSNOW`, so their bounce never whitened on snow (`snowAt` returned 0).
  The bounce now reads `snowLies`, the snow on the ground whatever the material. Also:
  - **A unit's own shadow:** the ground a unit's shadow side faces is in its own shadow, which neither map holds. Its
    bounce is the sky's (`shade` 1).
  - **One colour per block:** the block reads its centre's ground (`vRoot`), as a tree reads its root, with no seam
    across a class edge.
  - Smaller: the track plan's LC4 row describes what was built, and decision 0035's consequences match the plan.
- **After round 2:** the guard at start, the Austrian white in the valley in summer at 0.099 and the British red on
  the winter meadow at 0.099; at cover, the village white in winter at 0.091 (the snow's bounce now on); crops ok. All
  accepted on #78. The coat check ok; `npm test` exit 0, 256 tests.
