---
status: current
last_reviewed: 2026-10-09
code: [src/sim, tools/build-sim-data.ts, maps/formation-field.ts, src/scenarios/s1a-drill.ts, test]
decisions: [0005-sim-render-split, 0006-restricted-float64, 0012-heightfield-authority, 0013-single-player-first, 0015-era-generic-engine, 0016-typescript-toolchain]
---

# Simulation spine

The deterministic core every simulation system plugs into: a 20 Hz tick that changes the world only
through stamped commands, state in typed arrays, exact-ops maths, one seeded random stream, a state
hash, saves and replays. It runs in Node with no renderer. Built in S0; since S1a it runs the formation
layer (`docs/systems/formations.md`) with an era ruleset passed in at creation (decision 0015).

```
issue(cmd) ──► stamped for tick+1 (seq, 1 cm) ──► pending ──┐   external commands also go to the log
                                                           ▼
advanceTick: 1 commands · 5–6 formations · 14 reap · tick++ · 15 hash (every 20)
                                                           │
            serialize(world) ── saves, the state hash, per-section hashes for replay diagnostics
```

## Goals / non-goals

- Goals: bit-identical results for the same scenario, seed and command log; saves that continue
  exactly; a replay that names the first tick and table that differ; rules enforced by lint.
- Non-goals (later phases): the worker and snapshots (S2), cross-browser replays (S2 nightly), fire,
  morale, pathfinding (S1c and later), the renderer (S1b).

## Constraints

- **Determinism (0006):** in `src/sim/` only `+ − × /`, `Math.sqrt` and rounding helpers. ESLint bans:
  - `Math.sin`-like functions and `Math.random`, directly, destructured, computed (`Math[k]`), aliased
    (`const M = Math`), through `globalThis` or `Reflect`;
  - `**` and `**=`;
  - `Date`, `performance`, `process`, `crypto`;
  - `Float32Array`, `Float16Array`, `DataView` float32 access;
  - `Map`, `Set`, `WeakRef`, `FinalizationRegistry`;
  - every import that does not start with `./`, and dynamic `import()` (0005).

  `src/rulesets/` follows the same rules and may import only from `src/sim/`. Everywhere, type-only
  imports are written `import type`: `import { type X }` still loads its module, and once made an import
  cycle that left `formation.ts` reading a constant of `world.ts` before it was set.

  `sin`, `cos` and `atan2` are polynomials of exact operations (`num.ts`), within 1e-12 of `Math`.
  `sin` and `cos` are exact for |x| ≤ 1e5 and throw beyond that (a bug: headings stay in (−π, π]).
  `atan2` returns values in (−π, π] with no −0. Decision 0006 names tables; `docs/proposals/sim-design.md`
  §2 allows tables or polynomials, and polynomials need no data file.
- **Order:** every loop runs in slot order.
- **Budget:** `docs/proposals/sim-design.md` §16 targets ≤ 2 ms per tick. Measured in `test/formations.test.ts`:
  40 battalions of 400 of every shape, moving, about 5 ms per tick on a dev Mac (1.2 ms at 100 men; over
  the target since S1c-4, `docs/known-issues.md`).

## Design

- **Time** (`time.ts`): `TICK_HZ = 20`, one hash every 20 ticks; data in seconds.
- **World** (`world.ts`): `meta` (tick, free slots, data version, command sequence, ruleset hash), the
  RNG state, the formation table (structure of arrays, 128 slots; per company and per bin columns are
  flattened), its free-slot stack, the order pool, and the commands stamped for the next tick. The
  build-time data, the compiled ruleset and the terrain derived from them are attached but are not state:
  their versions are.
- **Handles** (`handle.ts`): `kind:3 | index:9 | gen:19`, non-negative. Reaping a formation moves its
  generation on, so old handles go stale (`formationSlot` returns −1).
- **Pools**: typed arrays with a free list in index order: the order pool (`world.ts`, `formation.ts`)
  holds every formation's order list.
- **Scratch** (`world.scratch`): per-world working buffers (places, the trail arc cache), never state and
  never shared between worlds.
- **Commands** (`commands.ts`):
  - `move` (waypoints, replace or append), `form` (a shape by name), `wheel` (an angle), `face`, `retire`
    (metres), `halt`, `style` (an order preset by name);
  - `debug-spawn`, `debug-kill` (men drawn by company with the sim RNG). Malformed waypoints are dropped,
    not thrown.

  `issue` stamps `tick + 1` and a sequence number, and quantises positions to 1 cm and angles to 0.1 mrad.
  `applyCommands` validates at the start of that tick and drops an invalid command with a reason
  (returned by `advanceTick`), never throwing and changing nothing. It checks: an unknown type, a stale
  tick, an alive handle, the side, the shape and preset names, the men, inside the map, at most 64
  waypoints, and order-pool room (checked before a replacing order frees the old ones). Reaping clears
  every column of a formation's row and moves its generation on.
- **RNG** (`rng.ts`): `xoshiro128**` with `Math.imul`, seeded by splitmix32; `sampleCount` draws an
  integer around an expected value from 12 uniforms (no `log` or `cos`).
- **Serializer** (`serialize.ts`): named sections (meta, RNG, formations, free list, order pool, pending
  commands), little-endian; commands are written field by field from a table per type. A table's columns are written in name order (`columns`), so a new
  column is saved and hashed with no list to update. `hashWorld` is FNV-1a over all of it; `sectionHashes` per section.
  `deserialize` refuses a save made with other data or another ruleset.
- **Replays** (`replay.ts`):
  - `record` runs a scenario (`{ name, setup }`) with external commands and keeps the log and the
    hashes.
  - `play` checks the ruleset, the scenario name and that the log is in tick order within the replay, re-issues it
    at its ticks (checking sequence numbers), and returns the first mismatch: the hash point (every 20
    ticks, so within 20 ticks of the divergence), the expected and actual hash, and the first differing
    section.
- **Metering**: `advanceTick(world, meter)` times each step through an injected clock (`Meter` in
  `tick.ts`); the sim reads none.
- **Data** (`data.ts`, `tools/build-sim-data.ts`, format 2): the heightfield on 1.79 m nodes, the cost
  grid on 7.16 m cells, and the terrain class and water depth on the 1 m grid, with the class names,
  built in Node from a map definition and committed as `data/formation-field.simdata`; its
  FNV-1a is the data version. The map definition loads `prototypes/formation-core.js` in Node, so the sim
  and the prototype read the same terrain. A cost cell is the harmonic mean of its passable ground
  samples (at least half passable, else 0) times the slope factor of its steepest rise; a stand-in until
  pathfinding brings clearance and explicit bridges (`docs/proposals/sim-design.md` §7).

## Tunables

The ruleset (`src/rulesets/napoleonic.ts`); `MAX_FORMATIONS` and `MAX_ORDERS` in `world.ts`; `MAX_COMPANIES`
and the trail ring's bounds in `ruleset.ts`;
the cell sizes in `tools/build-sim-data.ts`.

## Verification

`npm test`: lint, typecheck, then Vitest (`test/`):
- the S1a drill's 300 hashes against `test/golden/s1a-drill.json`, with the data version and ruleset hash
  the tests pin (regenerate with `UPDATE_GOLDEN=1 npx vitest run` and say why in the commit);
- replay from the log (one logged order is dropped: no such battalion), a changed command caught at the
  next hash point, a log out of order or past its end, another scenario, another ruleset;
- save in the middle of a shape change with a logged order pending, load, continue: the same hashes;
- the hash covers every typed array in the world (found by walking it) and the pending commands;
- bad commands are dropped with a reason and change nothing; a pending command crosses a save unchanged;
- lint: `src/sim/` clean, and every construct in `test/fixtures/banned-in-sim.ts` reported on its line;
- data version: another map gives another version, refused by saves, replays and `loadSimData`;
- era genericity: `src/sim/` names no shape, pace, preset or class of the Napoleonic ruleset, and a
  second ruleset (two companies, other shapes, paces and presets) drills on the same engine;
- data: truncated files are refused;
- units: RNG reference outputs, trig accuracy and domain, stale handles, pool, stamping, the
  finite-state assert.

`node tools/build-sim-data.ts --check` rebuilds the data and compares it with the committed file.

Negative runs from S0 (each guard broken on purpose fails its check; S1a's are in `docs/systems/formations.md`):
- the RNG left out of saves;
- pending commands not saved;
- commands stamped for the current tick;
- no quantisation;
- the `**` lint rule removed;
- saves accepting other data;
- the S0 stand-in fight reading strengths mid-step (S0 only; the stand-in is gone since S1a).

Each failed at least one test. The last was caught only by the golden hashes.

## Open questions

- Cross-browser replays: Node only until the S2 nightly runs Firefox and WebKit.
- The committed data depends on the Node that built it (`Math` in the prototype's terrain); `--check`
  reports drift rather than hiding it.
