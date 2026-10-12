---
status: current
last_reviewed: 2026-10-12
code: [src/map/schema.ts, src/map/catalogue.ts, src/map/validate.ts, src/map/resolve.ts, src/map/expand.ts, src/map/format.ts, src/map/geometry.ts, maps/kinds.json, tools/map.ts, test/map-language.test.ts]
decisions: [0015-era-generic-engine, 0020-track-m-on-an-epic-branch, 0021-two-metre-map-cell]
---

# The map language (Track M, M1a)

A map is a strict JSON file (`maps/<id>.map.json`): a list of features, each with an id, a dotted kind from the
kinds catalogue (`maps/kinds.json`), one shape and attribute overrides. This system checks such a file, resolves
any feature's effective attributes, and writes its expanded form. The design is `docs/proposals/map-engine.md`;
the drawing of maps (M1b) and the compilers (M2 on) come next.

```
maps/kinds.json ──► checkCatalogue ─┐
<map>.map.json ──► validate ────────┼──► resolve (one feature, a season, a state) ──► attributes
                                    └──► expand (M1: sort; generators in M3) ──► formatMap ──► <map>.expanded.json
```

## Goals / non-goals

- Every problem is reported with the feature's id and a JSON path, as a list, never as a thrown error.
- The catalogue is the only place attributes, units, ranges and kinds are declared. Adding a kind or an attribute
  is a data change.
- Not yet: generators (M3: a `gen` is validated but reported by `expand`), shared edges (`follow`, M3), drawing
  (M1b), compiling to the sim's or the look's data (M2, M4).

## Constraints

- **Exact:** `src/map/` follows the sim's number rules (decision 0006, lint in `eslint.config.js`) and imports only
  itself and `src/sim/num.ts`, so the compilers built on it give the same bytes in Node and in browsers.
- **Resolution-independent, except barriers:** coordinates are metres with at most 2 decimals. Barrier lines lie on
  the 2 m lattice in 8 directions (decision 0021, proposal §3.6).

## Design

- **The catalogue** (`maps/kinds.json`, types in `src/map/schema.ts`):
  - `layers`, and `categories` that say which layers a category's kinds may set;
  - `attributes`, each with its layers, type (number, int, enum, string, object), unit, range, and whether it may
    change with the season or be a ramp;
  - `kinds` as presets along dotted paths. A kind inherits its shapes, references, priority and states from the
    deepest preset along its path that sets them (`kindMeta` in `src/map/catalogue.ts`).
- **Validation** (`src/map/validate.ts`):
  - the map's own fields, sources and presets;
  - ids, then each feature's kind, shape and geometry (`src/map/geometry.ts`): rings that do not cross
    themselves, holes inside, everything inside the extent, barriers on the lattice;
  - references and their target categories, attributes against the catalogue, seasons, states and generator
    names;
  - finally, loops in the references.
- **Resolution** (`src/map/resolve.ts`): the catalogue along the path, the map preset, the feature's own fields,
  the season's overrides (the catalogue's, then the feature's), the state's overlay. This is the one place the order
  lives.
- **Expansion** (`src/map/expand.ts`): in M1 it sorts the features by id and reports any `gen`.
- **The layout** (`src/map/format.ts`): one feature per line, so diffs show which features changed.
- **The CLI** (`tools/map.ts`): `check`, `expand` (`--check` compares with the committed file), `resolve`.
  `npm run check:data` runs `expand --check` on the example map.

## Tunables

The kinds' values and the attributes' ranges: `maps/kinds.json`. Its note says which values are sourced
(`docs/research/terrain-taxonomy.md` §4) and which are tuned.

## Verification

`test/map-language.test.ts`:
- the catalogue checks clean, and a broken one is reported;
- the base map and `maps/two-ridges.map.json` validate;
- one negative test per validator rule, each asserting the id and the path;
- resolution in its order, including a state's overlay over the feature's own field;
- expansion and the layout;
- the committed expanded example;
- the lint rules on `src/map/`, with a negative fixture.

## Open questions

- Which kinds the first catalogue carries beyond today's essentials (proposal §14).
- Whether references between kinds that can loop (a stream joining a stream) are needed; the loop check is tested
  with a catalogue that allows one.
