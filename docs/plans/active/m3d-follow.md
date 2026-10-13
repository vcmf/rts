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
3. A cycle through `follow` (an area following a line that reads the area) is the chain's error.
4. The validator reports a bad reference, a non-line target, bad fields, and `follow` on a non-area.
5. `npm test`, `check:data`, the build, the docs check and the page check pass; the valley's sim data is
   unchanged.

## Review rounds

(none yet)
