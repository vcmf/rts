---
status: active
last_reviewed: 2026-10-17
---

# Plan: rutted dirt roads, and more of them on the demo map

The owner (2026-10-17), from a trailer's painted roads: a dirt road's texture ("more dirted rust road"), and "the demo
map should have more road to see the idea". After the first captures: "not curved, too straight", "black lines too
ugly, rough lines in beige", then "use rupture lines (a line is cut at multiple places)".

## Scope

- **More roads** (`src/look/world/cover.ts`): a road (8 m) across the valley south of the formation zones, fording the
  river at a riffle where it runs north–south, square across it (art bible §6c), to the village; a lane (5 m) north past the large wheat field; the village's trampled square where they meet;
  the old road widened to 8 m, the lane 5 m. Every line's corners rounded and a gentle meander laid across it (a few to
  15 m), its ends kept (the joins).
- **The roads as segments** (`tools/build-look-data.ts`, `roadGrid`; the look data's version 7): every line resampled
  every 8 m, its segments (the distance along the line at each start, its half width, its index), and a grid of 8 m
  cells over the tile listing up to 16 segments near each (the segment's three texels: its ends, its distance along, half width, line and free ends, its mitre tangents). The shader (`roadAt`) finds the nearest exactly: the
  signed distance across (a round cap past a dead end), the distance along, the half width, a junction weight (another
  line's side within 2.6 m, fading out by 6 m); its first and last segments flagged (the line's free ends). Nothing filtered: no ghost where two lines or two sides meet. About
  0.65 MB of textures (the grid, mostly empty slots; the busiest cell uses 15 of 16); the look data 4.3 MB (from 3.4); the build takes 6 s.
- **The road's paint** (`roadPaint`, `shore.glsl`; the tile's terrain and the water's land side): a warm beige earth,
  browner and wetter in late autumn; its edge ragged into the grass; wheel tracks of pale beige dust (a pair on a
  track, on a road a pair and a fainter outer one), rough-edged, wandering a little, cut into pieces of uneven length,
  each at its own places; trodden darker patches, pale dust, streaks along the road; at a junction trampled flat (no
  tracks); the grit of the owner's photo (`data/road-grit-v1.png`: greyscale, tileable, its lighting removed, ours to
  commit: the owner, "it's free to use") at two scales. The road class's base colour a brown beige (not the grey of
  #92: no blue near the French coat).
- Docs: `docs/systems/look.md`.

## Approach

The class grid (2 m cells) cannot hold a road's direction or its length, so each ground pixel near a road finds its
nearest segment in the shader, from a grid of the segments near each cell; everything is laid in that frame (across,
along). As built: a baked, filtered frame grid came first and failed two review rounds (ghost lines where the filter
blended two lines or two sides, holes, 39 MB): redesigned to segments (below).

## Acceptance

- Captures (close, the default view, the widest, the village square); the owner judges.
- The guard (a formation on a road), the coat, negatives, water and macro checks, the goldens; the bench: once, at the
  end. `npm test`, `node tools/check-docs.mjs`, `node tools/build-look-data.ts --check`.

## Results

- **The owner** (2026-10-17): "not bad much much better", then with the tracks broken: "it look good now".
- **Accepted by the owner** (2026-10-17): white Austrian coats on a winter road may not separate from it (the guard's
  `road.Austria` winter block, the pale road under snow light): "if it fails it's normal just note somewhere". A
  palette question for the armies' work, not a block on the roads; and in winter the Austrians wear grey greatcoats
  (the owner), so the white coat on a winter road is not the case the game shows.

## Review

- **Round 1** (severe): the along-road coordinate was rebuilt from the direction and jumped at every vertex (the
  tracks, breaks and edges stepped sideways every few metres): the distance along each line is baked now (a float
  frame). A ghost line about 4 m beside each road (the empty fill read as a centre line), and a stray line where a
  covered texel blended with an empty one across 0 (rejected: a half width none of the lines'). Holes outside every
  bend (no segment claimed them). The meander kinked beside its pinned ends and moved the joins (now faded over 45 m
  of each end and join). Square stubs at dead ends (a round cap now). A colour step at the tile's edge (faded, and the
  class colour the same earth). The grit read after early returns on WebGL1 (WebGL2 only). The data check and its
  version (6). The build took 87 s (each segment's own strip, the cover's lines skipped by their boxes: 5 s).
- **Round 2** (severe): ghost strips out of dead ends and junction corners (the filter blending +d and −d, or two
  lines), and the frame's 39 MB of float texture missing from the min-spec budget. **Redesigned** (the count restarts):
  the shader finds the nearest segment exactly from a grid of them (no filtering), 0.65 MB. Also: the road's colour
  turns with the season by the ground's own pass (it had its own darkening, unlike the class colour beyond the tile);
  the cross road fords at a riffle (art bible §6c), not in a pool.
- **Redesign round 1** (severe): the ford's riffle lay on an east–west reach, so the road ran 25 m along the bed: moved
  to a riffle on a north–south reach (−83, −42), the road square across it. Past a dead end the tracks looped round
  the cap (the across flips there): the across is the line's continuous side, the cap the distance, the tracks gone
  past the end. Seams at junctions where the along jumps from one line to the other: the patterns there laid in the
  world instead (the junction weight full within the paint's reach). Every tile pixel read the grid: one read of the
  cover's distance to a line first. The float textures need WebGL2 (the roads off on WebGL1). The segments trimmed to
  the tile's (and checked against the min-spec's texture size); the grit's rotated gradients; the grit's switch set
  before its load; the grid's z0 and slots checked; the segment distance shared with the cover's.
- **Redesign round 2** (severe): the paint ignored the flat arm and the class check's sabotage (`MACRO_FLAT`,
  `MACRO_SAB_ONECLASS`): it steps aside for both now. The tracks faded past every bend's outer side, read as a dead
  end: only a line's first and last segments are its free ends (flagged in the build). The paint's reach widened by the
  cover's 1.5 m warp, and the track class the road's earth (no step where the lane leaves the tile). WebGL1 makes no
  road textures. The plan's texture size (0.65 MB, not 0.2) and junction reach corrected; lines resampled every 8 m.
- **Redesign round 3** (one severe, the last round): the distance along was clamped segment by segment, so it stepped
  (up to 0.85 m) on the inside of the sharper bends (0.21 rad, where a meander fades in) and stood still across the
  outer wedge: each segment carries its mitre tangents now and the distance along is read between its two mitre lines,
  continuous round every bend (a unit test, `test/look-roads.test.ts`, with the grid's exact nearest segment against
  brute force and the free-end flags). The roads' reaches are spec values now (`SPEC.road`: reach, paint, junction,
  near; checked, with negative cases), the junction weight full out to the paint's reach (3.2 m); the road textures
  in the min-spec budget; the road uniforms bound through `bindAll`; the track pass skipped where it is zero; the
  system doc's track colour. Fixed without a fourth round: the fix is local, and the new test pins it.
- **The checks, then a second redesign** (the count restarts): the macro check's road and track contrast fell to 5.5
  (main 11.2, the gate 8): the road had two edges, the class cells' (warped by coverWarp, up to 1.5 m) and the paint's
  (the exact line), and the paint spilled onto the grass beside the class edge. The paint now finds the road at the
  cover's warped point (one edge, a gentle sway), its edge tighter (out to about 0.5 m past the side), the tracks'
  earth paler than the road's (it reads against the summer grass): road 9.2, track 9.3. The guard's Russian block and
  the cut bank failed with the scatter's layout: a tree or bush rejected on a new road drew a new candidate and moved
  every tree after it (four copses cross the new lines). Anything on a road, a track or the village is placed but
  hidden now (`src/look/nature.ts`), so the layout is main's but for what stands on the roads, and no road change
  moves it again.
