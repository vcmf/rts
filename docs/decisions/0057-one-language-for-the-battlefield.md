---
status: accepted
date: 2026-10-22
---

# 0057 One language for the battlefield and one for the armies; every system reads them

## Context

The same battlefield is described several times over, each time for one consumer:
- the sim's ground: `maps/battlefield.ts` and the formation field's terrain (`prototypes/formation-core.js`), built
  into `.simdata` by `tools/build-sim-data.ts`;
- the painted world: a terrain formula and one river in `src/look/world/author.ts`, the ground's cover in
  `src/look/world/cover.ts`, the buildings in `src/look/world/buildings.ts`, trees placed at load in
  `src/look/nature.ts`;
- the map engine (Track M, its proposal on `epic/map-engine`): a map language with a catalogue of
  kinds, generators and compilers, which compiles to the sim today and was meant to compile to the look (M4);
- two drawings of it from above: the map engine's draft view and the game's staff map (`src/render/map.ts`), each
  from its own data (decision 0058).

The armies are TypeScript (`src/scenarios/*.ts`); the order of battle is sketched in `docs/proposals/sim-design.md`
§14, and `docs/proposals/map-format.md` leaves scenarios to "a scenario file that references a map".

Each copy drifts from the others. A review of the epic against main (2026-10-22) found main's world now holds what
the language cannot yet say (buildings as models, tree species, furrow direction, green crops, bare earth), while the
language holds what the world cannot draw (ponds, marsh, hedges, walls, fords, earthworks), and two of everything that
generates (meanders, noise, woods, villages).

## Decision

We will have **one language for the battlefield** and **one for the armies**, and every system reads them, never a
copy of its own:
- **The map language** (the map engine's) is the only description of the ground. The sim (movement, pathfinding,
  sight, cover, the roundshot's bounce), the painted world, the map view and the tools compile from one map file. No
  system authors ground in code: the hand-made worlds above are ported into map files, and a feature the look needs
  that the language lacks is added to the language, not to the look.
- **The armies' language** is a scenario file that references a map: the order of battle, the starting positions, the
  plans and the rules of victory, in the same manner as the map (strict JSON, kinds from the ruleset's data, a
  validator that names the id and the path of every problem, stable ids). The scenarios in `src/scenarios/` become such
  files. It is designed in its own proposal, before S3 (`docs/proposals/sim-design.md` §14).
- **One way per need.** A second way to describe or draw the same thing is a defect to remove, not an option to keep.
- **The way there.** What already describes ground in code (the look's world, `maps/battlefield.ts`, the formation
  field) stays until its port lands, with the map engine's look compiler (M4) and the legacy maps' moves; new ground
  content goes into the language from now on. How each part is carried (which world is canonical, buildings as models
  or footprints, the river's shape, the grid's size, the season) is decided in M4's plan, under this record.
  Decision 0012's one heightfield then comes from the map's compiled heights, not from a formula.

## Consequences

- Good: a change to the battlefield is made once and reaches every system; the sim and the painted world cannot
  disagree about where a road or a bank is.
- Good: new game logic (pathfinding, sight, the AI's influence maps) builds on one data model, already validated.
- Good: a battle is two reviewable files, a map and a scenario.
- Bad: the look compiler (M4) becomes a prerequisite of further look work on the world's content; the hand-made world
  is frozen in the meantime, and porting it changes its pixels (goldens re-baselined, as decision 0034 did).
- Bad: the legacy maps (the formation field, S1e's battlefield) and their goldens have to move, with the data version.
- Bad: the language must grow to carry what the look needs (models, species, field strips), each an owner's choice in
  M4's plan.

## Alternatives considered

- **Each system keeps its own description, kept in step by hand:** what we have; the review shows it drifting within
  ten days.
- **The look's world as the source and the sim derived from it:** the look's data is float, resolution-bound and has
  no ids, references or validation; the sim needs exact, checkable data (decision 0006).
- **Armies stay code:** a scenario as code cannot be validated, diffed by id or written by an editor, and ties the
  armies to the engine's internals.
