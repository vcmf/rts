---
status: done
last_reviewed: 2026-10-13
---

# Plan: M3c, trees and paved roads

Track M, on `epic/map-engine` (decision 0020). One PR into the epic. Shared edges (`follow`), first planned as M3c
in `docs/plans/active/m3-generators.md`, become M3d.

## Problem

The catalogue has only woods: every tree belongs to an area of growth. A Napoleonic battlefield also has lone
trees, twos and threes of tall narrow poplars beside a farm, and poplar rows along the roads
(`docs/research/terrain-taxonomy.md` §4: "poplar lines roads", "tree line / avenue", deferred to B). They are the
landmarks a player reads the ground by. The way surfaces lack brick: a road is paved, metalled or earth.

## Scope

- **Free-standing trees**, a new growth: `growth: "tree"` on the veg layer, with attributes:
  - `form`: `round`, `columnar` or `conical` (the silhouette);
  - `crown`: the crown's radius, m;
  - `spacing`: a row's distance between trees, m.

  `height`, `crownBase` and `leaf` are the existing veg attributes.
- **Kinds** (`maps/kinds.json`), each taking a point (one tree) or a line (a row):
  - `veg.tree`: a round broadleaf, 15 m, crown 4 m;
  - `veg.tree.poplar`: columnar, 25 m, crown 1.5 m, rows every 8 m;
  - `veg.tree.conifer`: conical, needle, 18 m, crown 2.5 m;
  - `veg.tree.willow`: round, low, wide (banks), 9 m, crown 4 m.
- **`group`**, a generator on a tree point: `count` trees (2–5, default 3) within `spread` m of the point (default
  3 crowns), trunks a crown's width apart, clear of water, ways, buildings and barriers, seeded. The point leaves the map; the trees are its children.
- **Apply:** trees are not painted into the cells (a poplar in a wheat field leaves the wheat). They are a list on
  the layers, `trees: { x, z, k }` (`k`: the feature in the table): a point gives one, a line as many as whole
  spacings fit (at least one), evenly.
- **Sim:** no change. A tree changes no cell, so no terrain class and no sim data move. Sight through rows is for
  when the sim has sight.
- **Draft:** each tree as a disc of its crown, darker for conifers and poplars.
- **Roads:** `surface` gains `brick`; kinds `way.road.paved` (setts and cobbles, 6 m) and `way.road.brick` (5 m).
  The draft colours a way by its surface. The ruleset reads both as `road`.
- **Maps:** `maps/generated.map.json` gains a poplar row along the high road, two groups of poplars by the village
  and a lone oak; its expansion is regenerated (its sim data is not committed; the valley's stays unchanged).

**Out of scope:** the look of trees (M4); trees placed by `scatter`; rows offset from a road by reference (that is
`follow`, M3d); sight.

## Acceptance

1. The validator takes tree kinds on points and lines only, and the new attributes in their ranges.
2. `group` gives `count` trees, each within `spread` of its point and at least a crown from the others, the same
   on every run; five seeds give different groups.
3. `apply` lists one tree per point and a row every `spacing` m; no cell's layers change because of a tree.
4. The valley's sim data hash is unchanged; `npm test`, `check:data`, the build and the page check pass.
5. The draft shows trees and paved and brick roads (a PNG in the PR).

## Review rounds

**Round 1** (8 findings, none severe: stop and fix what is worth it):
- **Moderate:**
  - `growth: "tree"` on an area (or a tree kind overridden to another growth) validated and then painted nothing;
    the validator now keeps trees their own kinds, and `form`, `crown` and `spacing` belong to trees only;
  - a group's trunks stood one crown radius apart, so crowns overlapped: now a crown's width;
  - a row shorter than half a spacing gave no tree, and longer rows sat unevenly: now as many as whole spacings
    fit, at least one, evenly;
  - a group could put a tree in a stream, on a road or in a house: its crowns now keep clear of water, ways,
    buildings and barriers (it reads them, so it runs after a village).
- **Light, taken:** the draft's minimum crown is stated as a radius (2 m), and its dead test is gone; the fields a
  child takes from its parent are one helper for scatter and group.
- **Light, left:** the page's hover does not name trees (no cell holds one); the draft's crowns do not take the
  hill shading or a zone's tint. Both are for the page and the look (M4).
