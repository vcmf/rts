---
status: active
last_reviewed: 2026-10-12
---

# Plan: M2, the sim compiler

Track M's second phase (`docs/proposals/map-engine.md` §10), on `epic/map-engine` (decision 0020). One PR into the
epic.

## Problem

A JSON map can be checked and drawn (M1), but the sim cannot play on it. The sim reads `.simdata` files that
only TypeScript map definitions produce (`maps/battlefield.ts`, `maps/formation-field.ts`). The map engine also has
no water yet: a stream is a band of cells with no level, no depth and no channel cut into the ground.

## Scope

- **Water in apply** (`src/map/apply.ts`, step 3; proposal §4):
  - a stream's or a river's level, set from the ground along its banks and falling downstream (a compiler rule, the
    line's order is the flow);
  - its channel carved from its width and depth, shallower toward the banks; a depth ramp `along` the line gives
    pools;
  - fords raise the bed where they sit, to their own depth;
  - ponds and lakes at their level, or at the lowest point of their shore;
  - a per-cell water depth layer.

  The draft draws water by depth, and the page's readout shows it.
- **The ground classes, in the ruleset's folder** (`src/rulesets/ground.ts`, `src/rulesets/napoleonic-ground.ts`):
  - the attributes of a cell, as plain data the sim's side can read without importing the map engine;
  - the Napoleonic ruleset's `classify`, from those attributes to its terrain classes (`open`, `crops`, `woods`,
    …).

  It is a separate module, not a field of the ruleset, so the ruleset's hash and every golden replay stay as they
  are.
- **The sim compiler** (`tools/build-sim-data.ts`):
  - map-engine maps compile to today's format 2: heights at 2 m, cost at 8 m, classes and depth at 2 m, over the
    map's play area (square);
  - no change to the sim or its loader, since format 2 stores each grid's cell;
  - `npm run check:data` covers the new file.
- **The valley map** (`maps/valley.map.json`): the S1e battlefield's layout as a JSON map, beside it:
  - two ridges about 560 m apart;
  - a stream along the valley, wadeable but in its pools on the flanks, with fords at x −260 and 330;
  - a road crossing it by a bridge, a marsh in a bend;
  - a wood on each side's flank, crops and ploughed fields with hedges, rough ground.
- **A scenario on it** (`m2-valley`): the S1e battle as it is (positions, plan, rules) on the valley map, offered on
  the S1b page. `maps/battlefield.ts`, S1e and their goldens stay untouched (the owner's choice: the new map beside
  the old, S1e moves later with Track S).
- **The proposal corrected:**
  - format 2 is enough for the sim (no format 3 yet);
  - the fine grid's nodes take their cells' values, one for one.

**Out of scope:**
- moving S1e or the formation field (later, with Track S);
- buildings as impassable, which needs a ruleset class (a ruleset change moves every golden); for now they classify
  as dense woods, and the valley map has none;
- works' earthworks (redoubt parapets and ditches);
- the generators (M3) and the look compiler (M4).

## Approach

- **Levels:** walk each stream every 2 m, take the lower of its two bank heights (3 m beyond each bank) less a 0.4 m
  freeboard, and keep the running minimum downstream. Carving only lowers the ground, so a level set from the
  ground before carving stays below both banks.
- **Fine nodes:** format 2's fine grid has nodes at even metres from the play area's corner, and the layers have
  cells. Node (i, j) takes cell (i, j), the cell north-east of it, so the class pattern is copied one for one. A
  barrier sealed in cells stays sealed in nodes.
- **Classify:** a pure function of a cell's attributes, decided in this order: bridge, water deeper than 0, road,
  barrier, building, marsh, trees (dense or not), crops, ploughed, stones, open.

  Walls and fences use the `hedge` class until the ruleset gains their own (a ruleset change, with Track S).

## Acceptance

1. **Levels:** along `valley`'s stream the level never rises downstream, and every water cell's depth is at least
   0. The depths match the design: a ford is 0.5 m, a pool about 1.4 m, the rest about 0.8 m, shallower at the
   banks.
2. **The data:** `data/valley.simdata` loads in the sim with its data version pinned in `src/scenarios/maps.ts`,
   and `npm run check:data` rebuilds it to the same bytes.
3. **The battle runs:** the `m2-valley` scenario runs 10 minutes in Node with no non-finite state. It replays to
   the same hashes, and those hashes are committed as a golden.
4. **Classes:** the cells under each kind classify as designed (a test per class).
5. **Everything else unchanged:** every existing golden, and `npm test`, `npm run check:data`,
   `npm run check:docs` and `npm run build`, pass with full output and exit codes in the PR.
6. **Seen:** the draft of `valley` shows the stream deeper in its pools and shallow at its fords. The S1b page
   plays `?scenario=m2-valley`, checked with `tools/app-check.mjs` or by hand, with a screenshot in the PR.

## Review rounds

(appended during review)
