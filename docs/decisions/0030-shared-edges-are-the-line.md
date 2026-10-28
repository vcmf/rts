---
status: accepted
date: 2026-10-13
---

# 0030 A shared edge is the line itself; the area keeps off the line's cells

## Context

An area's edge may follow part of a line (`docs/proposals/map-engine.md` §3.2): a wood along a stream's bank, a
field along a road. The first design computed the edge as an offset curve, at the line's painted reach plus an
offset, so that the area's cells would start exactly where the line's stop. Three review rounds of M3d found the
same class of fault each time (`docs/plans/done/m3d-follow.md`): the curve folded on inner bends, cut into the
line at sharp corners, missed the line's other legs past its ends, and rounding put it millimetres inside the
line's reach. The cells, not the curve, are what the sim and the draft read; an exact curve that matches a raster
rule everywhere is the wrong problem.

## Decision

We will make the shared edge the line itself and settle the boundary on the cells:
- **`follow { id, offset?, from, to, at? }`** puts the line's centreline between the points nearest `from` and `to`
  into the area's outer ring. No offset geometry; the ring's other points decide the side.
- **`clear: [{ id, offset? }]`**, recorded by expansion (or written by hand): the area paints none of the cells the
  line takes, computed by the very rule that paints the line, nor any cell within `offset` m past the line's reach.
- So no cell is both the line's and the area's, and none between them is left out, by construction, at any angle
  and on any seed.

## Consequences

- **The expanded ring overlaps the line's band geometrically.** Only the cells are clean. A reader of the ring
  (the look, M4; a scatter in a following region) must honour `clear` too: a scatter passes it to its children.
- **No "bends too tightly" error:** a hairpin or a sharp corner needs nothing special.
- **Apply measures the area's cells against its lines** (a mask per line, made once, plus a distance test when
  there is an offset).

## Alternatives considered

- **An exact offset curve** (mitred, then the standard offset with arcs and loop removal): three rounds of severe
  findings, each a new geometric corner case.
- **An offset of 0 only:** the same geometry, with the same risk.
