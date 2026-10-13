---
status: active
last_reviewed: 2026-10-13
---

# Plan: M3d, shared edges (`follow`)

Track M, on `epic/map-engine` (decision 0020). One PR into the epic. The proposal's §3.2 ("an area's edge may
`follow` part of another feature's line") and `docs/research/map-language.md` §6 (neighbours share edges, as
TopoJSON's arcs).

## Problem

A wood bounded by a stream must today be drawn with its own ring along the bank. When the stream is meandered,
its channel moves with the seed, and the hand-drawn edge either overlaps the water (priority decides who wins the
cells) or leaves a strip of meadow between. Fields along a road have the same problem. Neighbours should share
an edge, stored once: the line itself.

## Scope

- **`follow`** on an area feature: one shared edge, or a list of them:
  `{ "id", "side": "left" | "right", "offset"?: m, "from": [x, z], "to": [x, z], "at"?: n }`.
  - `id`: a feature drawn as a line (a stream, a road, a hedge…), generated or not;
  - `from`, `to`: points snapped to the nearest point of that line's expanded shape (like a ford's `near`), so
    the edge stays put when a meander changes; the edge runs along the line from one to the other, either way;
  - `side`: left or right of the line, looking along its own direction;
  - `offset`: metres beyond the line's edge (half its width), default 0 (the bank itself);
  - `at`: where the edge's points go in the area's outer ring (before the ring's point `at`), default 0.

  The area's own outer ring holds the rest of the boundary; with a `follow` it may hold a single point.
- **Expansion:** a feature with `follow` reads the ids it follows, so it runs after them in the chain (decision
  0023): after a meander. Its outer ring is then built (the edge offset by vertex normals, mitred and capped, on
  whole centimetres), and `follow` leaves the expanded map, like `gen`. If it also has a generator (a scatter's
  region, a street village's own area), the ring is built first. The expanded map is validated as always, so a
  ring that crosses itself (an offset too large for a bend) is an error naming the feature.
- **Validation** before expansion: the reference names a line feature; the fields' types and ranges; `follow`
  only on area features; `at` within the ring; edges in a list at distinct `at`s.
- **Maps:** `maps/generated.map.json` gains a wood along the brook's north bank and a field along the high road,
  each sharing its edge.

**Out of scope:** areas sharing edges with other areas (a field's ring shared by its neighbour): lines are the
shared arcs for now; the draft page drawing shared edges specially.

## Acceptance

1. A wood following a meandered stream's bank keeps its ring at the bank (offset 0: no cell of the wood is the
   stream's, and none between them is meadow) for five seeds.
2. `from`/`to` in either order give the same ring, reversed; `side` and `offset` behave as stated; `at` places
   the edge.
3. A cycle through `follow` (an area following a line that reads the area) is the chain's error. (No generator
   that writes a line reads anything today, so no such cycle can be built yet; the error's path names `.follow`
   for a feature without a generator.)
4. The validator reports a bad reference, a non-line target, bad fields, and `follow` on a non-area.
5. `npm test`, `check:data`, the build, the docs check and the page check pass; the valley's sim data is
   unchanged.

## Review rounds

**Round 1** (7 findings, 1 severe):
- **Severe:** on the inner side of a bend the offset edge could fold (a loop, or a last point stepping back past
  a vertex), so a map that validated failed "crosses itself" when only the meander's seed changed, even at offset
  0. Points that step back against the line are dropped, walking from both ends, and loops are cut out where the
  curve meets itself. Tested: the reviewer's bend, and a meandered brook over ten seeds, offsets 0, 5 and 10, on
  both sides.
- **Moderate:** the bank was the line's `width` / 2, not where apply paints: a hedge's band, a path's minimum
  half-cell. `lineReach` (apply.ts) is now the one rule; tested on a stream, a path, a hedge and a wall (no shared
  cell, none between).
- **Light:** a cycle's path names `.follow` for a feature without a generator; an expanded map with a leftover
  `follow` is refused; points are deduplicated after rounding to centimetres; the ban on `follow` keys on a
  generator's `peers`, not on its name. Acceptance 3 is noted as not reachable yet.

**Round 2** (9 findings, 2 severe):
- **Severe**, both from the mitre's cap at sharp corners (over 120°): on the inner side the capped corner sat
  inside the line's reach, and on the outer side the chord from the capped point cut into it; the wood shared
  70 to 150 cells with a 10 m road. The mitre is gone: the edge is now the standard offset (points along each
  segment, arcs at outer corners with chords outside the distance, points too close dropped, loops cut out), and
  every chord is measured against the line, so a bend too tight is an error naming where. Tested: a 10 m road
  turning 100°, 120°, 135°, 150° and 170°, both sides: every chord at the distance, no shared cell; a hairpin is
  an error. (While rebuilding it, the test for an outer corner had its sign inverted: arcs went inside. The
  meander tests caught it.)
- **Moderate:** errors after expansion on a ring with shared edges say that they count the expanded ring; a
  failing edge in a list names `follow[n]`; a degenerate stretch is "no length", not a JavaScript error; apply's
  line painters take their reach from `lineReach`, the one rule the edge uses.
- **Light:** `forwardOnly` went with the mitre; rounding now happens before the loops are cut and again after.
  `meet` stays beside `segmentsMeet` (it needs the fraction; parallel folds cannot happen on an offset curve).
