---
status: done
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

- **`follow`** on an area feature (decision 0030, after redesign): one shared edge, or a list of them:
  `{ "id", "offset"?: m, "from": [x, z], "to": [x, z], "at"?: n }`.
  - `id`: a feature drawn as a line (a stream, a road, a hedge, a ditch…), generated or not;
  - `from`, `to`: points snapped to the nearest point of that line as expanded (like a ford's `near`), so the edge
    moves with a meander; the edge is the line's centreline between them, either way;
  - `offset`: metres past where the line stops painting cells, default 0;
  - `at`: where the edge's points go in the area's outer ring (before the ring's point `at`), default 0.

  The area's own outer ring holds the rest of the boundary, and so decides the side; with a `follow` it may hold a
  single point.
- **Expansion:** a feature with `follow` reads the ids it follows, so it runs after them in the chain (decision
  0028): after a meander. Its ring takes the centrelines, it records `clear: [{ id, offset? }]`, and `follow`
  leaves the expanded map. If it also has a generator (a scatter's region), the ring is built first, and a
  scatter's children carry `clear`.
- **Apply:** an area with `clear` paints none of the cells the line takes (by the line's own painting rule) nor any
  within `offset` past its reach. `clear` may be written by hand too.
- **Validation** before expansion: the reference names a line feature; the fields' types and ranges; `follow`
  only on area features; `at` within the ring; edges in a list at distinct `at`s; `clear`'s fields and lines.
- **Maps:** `maps/generated.map.json` gains a wood along the brook's north bank and a field along the high road,
  each sharing its edge.

**Out of scope:** areas sharing edges with other areas (a field's ring shared by its neighbour): lines are the
shared arcs for now; the draft page drawing shared edges specially.

## Acceptance

1. A wood following a line (a meandered stream, a road, a hedge, a wall, a path, a ditch, a cut; sharp corners and
   a hairpin) shares no cell with it and leaves none between, on any seed (offset 0).
2. `from`/`to` in either order give the same ring, reversed; `offset` keeps the area that far further off; `at`
   places the edge.
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

**Round 3** (10 findings, 2 severe): **stop** (the third round with a severe finding, the same class each time).
- **Severe:** the edge was measured only against the followed stretch, so past `from` or `to` it could sit inside
  another leg of the line (a hairpin); and rounding to centimetres put it millimetres inside the line's reach, so
  a cell could be both (10 of 180 meander runs).
- **Moderate:** ditches and cuts gave no reach; inner corners left a meadow cell.
- The user chose **the edge is the line itself**.

### Redesign: the line itself, and `clear` (decision 0030)

- The ring takes the line's centreline between `from` and `to`; no offset geometry (`side`, the mitre, the arcs,
  the loop removal and the chord check are gone).
- Expansion records `clear: [{ id, offset? }]`; apply paints none of the area's cells that the line takes, by the
  line's own rule (`paintLine` with `lineReach`, `barrierCells`, a cut's or a ditch's mark), nor any within
  `offset` past its reach. `clear` may be written by hand.
- Tests check the invariant on every case (each cell inside the ring is the line's or the area's, never both,
  never neither): straight banks; meandered streams and bent roads over 15 seeds, three widths, both sides;
  corners of 100° to 170° on both sides and a hairpin; hedges, walls, paths, ditches and cuts; a scatter's region.
- Taken with it from round 3: errors on an expanded ring say they count it as expanded; a failing edge names
  `follow[n]`; an expanded line that is no line is an error, not a JavaScript one; `lineReach` takes the kind, so
  cuts and ditches have their reach; the one-or-list helper is shared.

The round count restarts.

**Redesign, round 1** (10 findings, 1 severe):
- **Severe:** a hand-written `clear` as one object passed validation but apply ignored it (it read a list); a
  wood shared 120 cells with a road. Apply now takes one or a list.
- **Moderate:**
  - a ramp's `edge` counted from the centreline; it now counts from where the cells begin (the ring, or a cleared
    line's reach plus offset);
  - a mix scatter could not follow (its check refused `follow`); now it can, and every mix child takes `clear`;
  - `follow` and `clear` on relief edits or water were accepted and ignored; now refused (ground, vegetation,
    buildings and zones only);
  - a sunken way's cut marks cells a little wider than its way: its mask includes them;
  - masks are bytes, one per line and offset, made once over the line's box; the cut and ditch weight is one
    helper (`editWeight`) for the edit pass and the masks; the water painter takes its cells' reach from
    `lineReach`.
- **Not taken:** other readers of the ring (scatter `avoid`/`within`, a village's keep-clear) see it reach the
  centreline; recorded as an open question in the system doc (an avoid is only more careful; a within a little
  more generous).
- **Light:** `at: null` is refused; one offset check for `follow` and `clear`; the system doc lists 0030.

**Redesign, round 2** (10 findings, none severe: stop and fix what is worth it):
- **Moderate:** on a closed line the edge took the long way round; now the shorter way, across the line's first
  point when that is shorter. An offset widens each line's own rule (a hedge's gates stay gates, a stream's ends
  get no caps), not a plain distance. A mix entry that cannot keep off a line is refused when its region follows.
- **Light, taken:** earthworks may keep off lines; a ramp counts from a sunken way's cut marks and never goes
  below 0; the one-or-list helper and `Clear` live in `util.ts`; `KEEPS_OFF` is one list for the validator and
  the scatter.
- **Light, left:** a mask is a full grid of bytes per line and offset (memory, not time: about 4 MB per mask on a
  4 km map); measured when a large map arrives.
