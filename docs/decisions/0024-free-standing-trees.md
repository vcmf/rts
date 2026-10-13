---
status: accepted
date: 2026-10-13
---

# 0024 Free-standing trees stand on the cells, as a list

## Context

A map's vegetation is one growth per 2 m cell (decision 0021, `docs/systems/map.md`): grass, a crop, or a wood's
stand. A Napoleonic battlefield also has lone trees, twos and threes of poplars by a farm, and poplar rows along the
roads (`docs/research/terrain-taxonomy.md` §4). A tree's crown is often smaller than a cell (a poplar's is about
1.5 m across), and the ground under it stays what it was: a poplar in a wheat field is still a wheat field.

## Decision

We will keep free-standing trees as a list of positions, not in the cells:
- a kind with `growth: "tree"` takes a point (one tree) or a line (a row: as many trees as whole `spacing`s fit,
  at least one, evenly); no feature turns into a tree or out of one by overriding `growth`;
- a few trees around a point come from the `group` generator;
- `apply` lists them (`Layers.trees`) and paints no layer, so no cell, density or terrain class changes;
- a wood stays an area of growth (`stand`), painted into the cells.

## Consequences

- **The sim does not see trees** until it has sight: a row of poplars will then block or soften a line of sight,
  read from the list.
- **The look (M4) places each tree** from the list, with its form, height and crown.
- **The draft draws each tree** over the cells, its crown's radius at least 2 m so a poplar reads.

## Alternatives considered

- **Trees in the veg layer:** a tree would replace the field under it, and a 1.5 m crown cannot be one 2 m cell.
- **A tree layer per cell:** most cells hold none, and a cell cannot say where in it a trunk stands.
