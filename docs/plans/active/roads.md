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
  river to the village; a lane (5 m) north past the large wheat field; the village's trampled square where they meet;
  the old road widened to 8 m, the lane 5 m. Every line's corners rounded and a gentle meander laid across it (a few to
  15 m), its ends kept (the joins).
- **The road frame** (`tools/build-look-data.ts`, `roadFrame`): a span grid over the tile (0.5 m texels, out to 4 m
  past a road's side) of four floats: the signed distance across the nearest line (a round cap past a dead end), the
  distance along it, its half width, a junction weight; each segment rasterised over its own strip. About 2.1 MB in
  the look data (5.5 MB in all, from 3.4); the build takes 5 s.
- **The road's paint** (`roadPaint`, `shore.glsl`; the tile's terrain and the water's land side): a warm beige earth,
  browner and wetter in late autumn; its edge ragged into the grass; wheel tracks of pale beige dust (a pair on a
  track, on a road a pair and a fainter outer one), rough-edged, wandering a little, cut into pieces of uneven length,
  each at its own places; trodden darker patches, pale dust, streaks along the road; at a junction trampled flat (no
  tracks); the grit of the owner's photo (`data/road-grit-v1.png`: greyscale, tileable, its lighting removed, ours to
  commit: the owner, "it's free to use") at two scales. The road class's base colour a brown beige (not the grey of
  #92: no blue near the French coat).
- Docs: `docs/systems/look.md`.

## Approach

The class grid (2 m cells) cannot hold a road's direction, so a baked frame grid gives every point near a road its
place across it and its direction; the shader lays everything in that frame. Junctions are found where the frame's
direction disagrees with its neighbours'.

## Acceptance

- Captures (close, the default view, the widest, the village square); the owner judges.
- The guard (a formation on a road), the coat, negatives, water and macro checks, the goldens; the bench: once, at the
  end. `npm test`, `node tools/check-docs.mjs`, `node tools/build-look-data.ts --check`.

## Results

- **The owner** (2026-10-17): "not bad much much better", then with the tracks broken: "it look good now".

## Review

- **Round 1** (severe): the along-road coordinate was rebuilt from the direction and jumped at every vertex (the
  tracks, breaks and edges stepped sideways every few metres): the distance along each line is baked now (a float
  frame). A ghost line about 4 m beside each road (the empty fill read as a centre line), and a stray line where a
  covered texel blended with an empty one across 0 (rejected: a half width none of the lines'). Holes outside every
  bend (no segment claimed them). The meander kinked beside its pinned ends and moved the joins (now faded over 45 m
  of each end and join). Square stubs at dead ends (a round cap now). A colour step at the tile's edge (faded, and the
  class colour the same earth). The grit read after early returns on WebGL1 (WebGL2 only). The data check and its
  version (6). The build took 87 s (each segment's own strip, the cover's lines skipped by their boxes: 5 s).
