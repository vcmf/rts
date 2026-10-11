---
status: proposed
date: 2026-10-11
---

# 0019 Shading data finer than the heightfield comes from the authored surface

## Context

Decision 0012 makes one heightfield (1.79 m cells on the tile) the authority for height: the meshes, the
simulation, placement and checks read it. The river's banks and shoreline need detail the 1.79 m grid cannot hold:
W2's bank normals (a scarp narrower than a cell) and W3's water data (the shoreline, `docs/plans/active/w3-water-data.md`).
Both are baked at 0.5 m. Baked from the heightfield, they could only repeat its rounding; baked from the authoring
surface `H()`, they disagree with the drawn mesh within a cell: 2.4% of the water data's wet texels have the drawn
ground above the water, at most 0.56 m from the shore.

## Decision

Data that only shades or paints the ground (the bank normals, the water data, and later bakes of that kind) is
baked offline from the authoring surface at its own resolution, beside the heightfield in the look data. Height
itself stays the heightfield's (0012): nothing in the simulation, placement or a mesh's position reads this data.

## Consequences

The drawn shoreline can come from the water data rather than from where the water plane cuts the 1.79 m mesh, so
W4 paints the shore from the data and must hide the mesh's own crossing (where the drawn ground stands above the
data's water). The look data grows (the water data 0.88 MB). A future elevation import (W6) must keep an authoring
surface finer than the heightfield, or these bakes fall back to the heightfield's detail.

## Alternatives considered

Baking from the heightfield (no detail beyond its cells: the scarps and the shoreline stay stair-stepped); a finer
heightfield on the tile (4× the data and the triangles for a detail only the river needs).

See: decision 0012, `docs/plans/active/w2-river-banks.md`, `docs/plans/active/w3-water-data.md`.
