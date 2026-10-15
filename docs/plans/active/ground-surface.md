---
status: active
last_reviewed: 2026-10-14
---

# Plan: the ground's surface (bare earth, the autumn turn, #88)

Track E, the ground's refinement (the owner, 2026-10-14), its second PR of three: the light on the ground
(`docs/plans/done/ground-light.md`), then this, then the default map (a large wheat field, ploughed land, bare
earth). The owner: "dirt terrain is also green (weird) … during autumn I still see only green grass"; and a dirt
texture of their own (free to commit), which as the paint grain averaged away at this scale but suits bare earth.

## Scope

- **Bare ground has a dirt surface:** tracks, the village's trodden ground, ploughed land, the worn ground by the
  lines (`wear`), and a new class, **bare** (`COVER.bare`), for trodden or dry earth with no grass: its own brown,
  no grass, no crops, no stripes. The map places it in PR 3.
- **The dirt texture** (`data/ground-dirt-v1.png`, the owner's, made seamless), read at the terrain's fragment at
  about 15 m a repeat where the ground is bare: its scratches, drag marks and splats in the value.
- **The autumn turn:** the meadow's ground (and so its blades) turns further toward straw and olive at season 1.
- **#88:** the winter shimmer at the widest view (the snow's small dark bits), and the cut bank's warmth under the
  temperate earth.
- Not in scope: placing bare earth and fields on the map (PR 3), but for one small gateway (the cover test asks for
  every class on the map).

## Approach

- **Bareness** at a terrain pixel, from the cover it already reads (`coverAt` through `coverWarp`): 1 on track,
  village (where trodden), ploughed and bare; the road a little (dust); the wear zone by its weight. The dirt texture
  multiplies the albedo's value there (around 1, so the class colour holds on average), mipmapped, so its fine marks
  average out at far zoom instead of flickering.
- **`COVER.bare` = 10**, kept out of `isField` (no id, no stripes); its colour in `classColour` (a dry brown between
  the track and ploughed, darker than the white coat, lighter than the dark coats: the guard).
- **Autumn:** `groundSeason`'s autumn target and share, weighted by how green the colour is (review round 2).
- **#88 shimmer:** the snow's edge noise at far zoom (`snowAt`'s per-texel grain) faded to the soft blotches as a
  pixel spans more ground; measured with `tools/water-look-check.mjs --only shimmer`.
- **#88 banks:** the bank's bare earth a little warmer, so the earth leaves it warmer than the meadow.

## Acceptance

- Pairs at the close and default views, summer and autumn, on a track, the village and the ploughed field: a dirt
  surface, not green; autumn reads autumn. The owner judges them before review.
- `tools/water-look-check.mjs`: shimmer and banks pass (#88); the rest as on main.
- `tools/guard.mjs --base` main, start, cover and crops, three seasons: no new failure; `tools/coat-check.mjs`.
- The bench against main; `npm test`; `node tools/check-docs.mjs`; the look data rebuilt (`COVER` changed) and
  `--check` clean.

## Results

Main at 32a138d (the temperate mood). Sheets in `scratch/compare/ground-surface/` (git-ignored): the ploughed field,
the village and a track close, the default view in summer and autumn, the ploughed field in autumn.

- **The look:** the ploughed field, the track and the village's trodden ground carry the dirt texture's scratches,
  drag marks and smears; read once, its dark smear repeated in rows every 15 m, so two reads at unrelated scales and a
  turn are mixed. The autumn meadow turns to straw and olive (`groundSeason`'s autumn share 0.45 to 0.78). On main the
  ploughed field melted into the autumn meadow, the season turning it too: bare ground now takes a quarter of the
  turn.
- **#88, the banks:** the cut bank's bare earth covered few of the check's cut-bank pixels (painted pure red, its
  warmth rose only to 0.094): the earth now starts on gentler slopes (`ny` 0.985 to 0.85) and is a little warmer. The
  bank check passes, its part failing on main too (the cut bank warmer than the meadow by 0.035, no lighter).
- **#88, the shimmer** (not fixed here): at the widest view near the water main measures 3.77 % in summer (limit 3.5;
  golden 2.88 %), this branch 3.79 %; in winter main 11.38 %, this branch 11.14 % (the snow edge's per-texel noise
  fades to the blotches as a pixel spans more than half a metre). Bisected over temperate's groups (the sun +0.24,
  the shadow +0.04, the air +0.01, the grade -0.08 on golden's 2.88): no one group; the check's mask also changes with
  the mood. Its own PR.
- **The guard** against main, start, cover and crops, three seasons: ok. **The coat check:** ok. **The water
  checks:** band, seam, pools, banks, foam, winter and leaves ok; shimmer as above.
- **The frame's cost** (`tools/bench-look.mjs`, Metal, the GPU frame's median, one run each side after the early
  return on grass; main's own spread between runs up to 0.85 ms at the widest under a load average of 9): +0.14 to
  +0.25 ms at the close and default zooms, +0.38 to +0.54 at the widest. Mostly the one extra cover read a terrain
  pixel; the macro bake's alpha (the snow's lie) leaves no channel to bake the bareness in.
- **After review round 2** (the season by greenness, with the green test loosened so a yellow-green counts as green):
  - The guard is ok at start and crops. At cover, the Austrian white on the village ground in autumn is at 0.094
    against main's 0.127 (bound 0.10): the village's grass patches turn to light straw. It is recorded on #78 under
    the owner's standing call on the Austrian white.
  - The banks are ok (0.043). The coat check is ok.
  - The macro check's class contrast between the road and the grass fails on main too, from the temperate mood
    (6.7 against 8, here 7.1; recorded on #88). Its shimmer on the fields, determinism and bake are ok.
- **The look data** rebuilt: one bare patch, a trampled gateway where the track meets the fields (44, -52), so the
  cover test's "every class the macro colour paints is on the map" holds; bare earth carries no field id. The map's
  larger bare ground comes in PR 3. `--check` matches.
- **`npm test`:** after review round 1, exit 1 on the soldier layer's timing budget alone under load; run alone it
  passes (12 of 12). The PR changes no sim code.
- **After review round 1:** the guard ok at start and crops; at cover the Austrian white on the village ground in
  autumn fell to 0.097 (main 0.127; the village now keeps its earth through the autumn), so the village's earth is a
  little darker: 0.104. The water checks as before (banks ok, shimmer as main's).

## Review

- **Round 1** (several severe):
  - **The worn ground by the lines kept out of the season:** this left a green band along every road in autumn,
    which is the owner's complaint. It now takes the dirt's marks only (`wearOf`); `pBare` is the class's bareness.
  - **A straw halo outside bare edges:** the early return read only the unwarped cell. Three cheap reads now cover the
    warp's reach.
  - **The shore band's land:** it had no dirt and the full season turn, a seam at fords. It now takes `dirtOn` and
    `seasonOf` as the terrain does.
  - **The bank earth's top edge** went over 1 at far zoom: the colour of flat shores changed with zoom.
  - **The snow edge's footprint fade read `fwidth` inside a branch** (undefined derivatives). It is reverted, since it
    did not fix the shimmer anyway.
  - **The dirt texture's mean is 0.458:** the value is centred there.
  - **The rotated second read** had its derivatives in the wrong frame. Now it is a scale and an offset.
  - **Bare earth:** kept clear of trees and stones (`TRODDEN`), and of the formation zones and the floodplain.
  - **The dirt's load error** is reported, not a bake's.
- **Round 2** (one severe):
  - **The stronger autumn turn hit all non-grass paint** at full strength (the #88 cut bank's earth, gravel, steep
    stone), so in autumn the bank melted into the meadow. The bareness flag, a hidden global with a hard edge, is gone:
    `groundSeason` itself weights the turn by how green a colour is. That is smooth across every edge, and the same for
    the ground's bounce under trees and the meadow's blades.
  - **The dirt's pre-check reads the four corners** (one diagonal missed edges along the other), with a margin on the
    wear distance.
  - **No dirt on the flat arm** and under the class check's sabotage.
  - **The gateway appended to the fields:** inserted, it renumbered the later fields' ids and moved their shade and
    stripes.
  - **The marks fade out at far zoom,** saving the reads where they average to the mean.
  - **The cover test checks bare earth** off the floodplain and the formation zones.
