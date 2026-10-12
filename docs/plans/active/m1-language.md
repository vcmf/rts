---
status: active
last_reviewed: 2026-10-12
---

# Plan: M1, the map language and the draft view

Track M's first build phase (`docs/proposals/map-engine.md` §10), on the `epic/map-engine` branch (decision 0020).
Two PRs into the epic: **M1a**, the language (schema, catalogue, validator, resolution, the map CLI), and **M1b**,
the draft view (applying features into 2 m grids, a draft raster, the page that redraws on save).

## Problem

There is no map language yet. Maps are TypeScript formulas (`maps/battlefield.ts`, `src/look/world/author.ts`),
so a map can't be checked, diffed as data, or seen without building the sim or the 3D world. Before the
compilers (M2) and the generators (M3) can exist, the language needs a schema, a validator that names the feature
and the field at fault, a catalogue of kinds, and a fast way to see a map.

## Scope

**M1a: the language**
- **`src/map/`**, a new module that imports only from itself and `src/sim/num.ts`. The determinism lint rules of
  `src/sim/` (banned `Math` functions, `**`) apply to it, so every result is exact across machines.
- **The schema** (`src/map/schema.ts`): TypeScript types for the map file and its features (proposal §3.1),
  closed objects. The shapes are point, line, area, circle and ellipse; the reference fields are `on`, `carries`,
  `crosses`, `near`, `along` and `follow`. Also `seasons`, `state` and `priority`.
- **The catalogue** (`maps/kinds.json`). It declares the attributes (name, type, unit, range, which categories
  may set them) and the essential kinds of every category (§3.3), as presets along dotted paths, with the state
  overlays (`@burnt`, `@breached`). Values come from `docs/research/terrain-taxonomy.md` §4, and each one is marked
  sourced or tuned.
- **The validator** (`src/map/validate.ts`). It reports every error, each with the feature's id and the field
  (a JSON path). It checks:
  - **schema:** unknown fields, unknown kinds, attributes the kind's category may not set, types, units and
    ranges, at most 2 decimals (1 cm) on coordinates;
  - **ids:** unique, of the form `[a-z0-9-]+`;
  - **references:** each resolves to an existing feature of a compatible kind (a bridge `carries` a `way.*` and
    `crosses` a `water.*`), and the dependency graph has no cycle;
  - **geometry:** rings of at least 3 points, no self-intersection, everything inside the extent;
  - **barriers:** points on the 2 m lattice, 8 directions, an even thickness of at least 2 (§3.6);
  - **generators:** `gen` names a known generator. Expanding one fails with "arrives in M3", since there are no
    generators until then.
- **Resolution** (`src/map/resolve.ts`): a feature's effective attributes, in the order catalogue path → map
  preset → own fields → season → state overlay (§3.5).
- **Expansion, M1 version:** the identity for maps without `gen`, written in the expanded form (sorted by id, no
  `gen`). This sets up the golden-expansion tests, so M3's generators only add to them.
- **The map CLI** (`tools/map.ts`):
  - `check <map>`: validate, and print the errors;
  - `expand <map>`: write `<map>.expanded.json`;
  - `resolve <map> <id>`: print one feature fully resolved.
- **The example maps:** `maps/two-ridges.map.json` is §9's example written with exact shapes (no `gen`); the
  test map in `test/map-language.test.ts` exercises every category.
- **The proposal updated** where M1a settles something: the catalogue's path (`maps/kinds.json`, not
  `data/kinds.json`, since `data/` holds built outputs), and anything the schema had to make precise.

**M1b: the draft view**
- **Apply** (`src/map/apply.ts`): the expanded features into the five layers on the 2 m grid over the map's
  extent (§4's apply order). Relief comes from the landforms (`hill`, `ridge`, `valley`, `plateau`, `scarp`, with
  profiles from polynomials, which are exact) and the edits (`raise`, `lower`, `level`, `cut`, `ditch`). Ground and
  vegetation are an index per cell into the map's attribute table, by priority, plus a density for ramps. Barriers
  come from the cell rule of §3.6, with their gaps. Water, ways and buildings are cells marked from their shapes;
  water levels and carving come in M2.
- **The draft raster** (`src/map/draft.ts`): a pure function from the grids to an RGBA buffer. It draws hill
  shading, contours every 2.5 m, flat category colours, barrier cells, water, ways and footprints. The same code
  runs in Node, for PNGs and tests, and in the browser.
- **The page** (app/map.html and src/app/map/, new in M1b):
  - It picks a map from `maps/`, compiles it in a worker, and draws the raster with pan and zoom.
  - It overlays the feature outlines with their ids, and hovering a cell shows its layers and the feature that
    wrote each.
  - It shows the validator's errors in a panel and keeps drawing the last good map.
  - It reloads on save through Vite's hot update of the map files (`import.meta.glob`).
- **The CLI's `draft <map> [out.png]`**, for headless checks and PR images.

**Out of scope:**
- the sim compiler and format 3, water levels and carving (M2);
- every generator, `noise` included (M3);
- the rendered 3D view (M4);
- editing on the page;
- the JSON Schema file for editors, which can come once the schema settles (end of M2).

## Approach

- **The catalogue drives the validator.** Attributes are declared once, with type, unit, range and the
  categories allowed to set them. The validator is generic over that, so adding a kind or an attribute is a data
  change that comes with its tests.
- **Errors are values, not exceptions.** `validate(map, kinds) → Issue[]` with
  `{ id, path, message }`; the CLI and the page print the same list.
- **Integers where geometry must be exact:** barrier points are checked on the 2 m lattice, and the cell rule
  uses squared distances in whole numbers, as tested in M0. Landform profiles use only `+ − × /` and `sqrt`.
- **One function per decision:** the barrier cell rule, the resolution order and the apply order each live in
  exactly one function, which the CLI, the worker and the tests all call.

## Acceptance

M1a:
1. `node tools/map.ts check maps/two-ridges.map.json` exits 0, and `expand` writes an expanded file that is
   committed as a golden.
2. One negative test per validator rule (each a change to one small valid map, in `test/map-language.test.ts`),
   each asserting the feature id and the JSON path in the error.
3. Resolution tests: path inheritance, map preset, a season override, a state overlay that wins over the
   feature's own field.
4. Lint: a `Math.sin` in `src/map/` fails `npm run lint`, like a negative test in `test/lint.test.ts`.
5. `npm test`, `npm run check:docs` and `npm run check:data` pass, with full output and exit codes in the PR.

M1b:
1. Barrier tests: an axis barrier is 2 cells; a diagonal one is a 3-cell staircase with no 8-connected path
   across it; a 2-cell gate between two walls is open; an L-shaped corner is sealed; `gaps` open the right steps.
2. Determinism: applying twice gives the same grids (hashed), and a committed hash of the grids and of the draft
   raster of `two-ridges` matches.
3. Locality: moving one wood changes only the cells within its old and new outlines and their edge band.
4. `node tools/map.ts draft maps/two-ridges.map.json` writes a PNG. It is attached to the PR and looked at: the
   ridges, the brook, the road and bridge, the wood, the field with its hedge and the hamlet are all visible.
5. The page: editing `two-ridges.map.json` and saving redraws in under a second (measured, number in the PR); a
   broken file shows its errors and keeps the last good drawing.
6. The same checks as M1a, plus `npm run build`.

## Review rounds

**M1a, round 1** (`/code-review high`, 10 findings, 1 severe):
- **Severe:** resolution applied the catalogue's season overrides before the feature's own fields, so a field
  given its own crop height kept it in winter. A season now beats a fixed value; the proposal (§3.5) and the
  system doc say so.
- **Moderate:**
  - attributes, states and presets named like object builtins (`constructor`) crashed the validator or passed;
    every lookup is now `Object.hasOwn`;
  - string or infinite radii passed;
  - holes were checked only by their corners;
  - the extent was unchecked: it must be a multiple of 4 m, so the 2 m grid's corners are the barrier lattice.
- **Light:**
  - zero-area rings and lines that fold back passed;
  - `expand` could overwrite a file not ending in `.json`;
  - the `src/map/` import rule had a gap;
  - `along` past its line's end, and all-gap barriers, passed.

  The per-category test maps were replaced by the test map, which covers every category.

**M1a, round 2** (10 findings, none severe: stop and fix what is worth it):
- the `src/map/` lint block copied only part of the sim's rules; the exact-number rules are now shared constants
  in `eslint.config.js`, and the import rule rejects any path that climbs out;
- the CLI's `resolve` checks its season and takes `none` for no state;
- the all-gap check moved into the catalogue's object check (`less`), so presets are covered;
- references name a target shape (`water:line`), so a bridge cannot cross a ford, nor a ford sit on a pond;
- ramp inputs must fit the shape and be distances of at least 0;
- a barrier line that ends where it starts is closed (a walled yard, proposal §3.6), and repeated points get
  their own message;
- the catalogue check covers attribute types, reference targets and optional references;
- `along` metres keep the 1 cm rule;
- barriers stay 8 m inside the extent;
- small clean-ups in the loop check and the state lookup.
