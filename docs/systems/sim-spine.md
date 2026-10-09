---
status: current
last_reviewed: 2026-10-09
code: [src/sim, tools/build-sim-data.ts, maps/formation-field.ts, src/scenarios/s0-fight.ts, test]
decisions: [0005-sim-render-split, 0006-restricted-float64, 0012-heightfield-authority, 0013-single-player-first, 0016-typescript-toolchain]
---

# Simulation spine (S0)

The deterministic core every simulation system plugs into: a 20 Hz tick that changes the world only
through stamped commands, state in typed arrays, exact-ops maths, one seeded random stream, a state
hash, saves and replays. It runs in Node with no renderer. In S0 the only gameplay is a stand-in: blocks
of men that walk waypoints over the cost grid and lose men when opposing blocks meet.

```
issue(cmd) ──► stamped for tick+1 (seq, 1 cm) ──► pending ──┐   external commands also go to the log
                                                           ▼
advanceTick: 1 commands · 6 movement · 8 fight · 11 casualties · 14 reap · tick++ · 15 hash (every 20)
                                                           │
            serialize(world) ── saves, the state hash, per-section hashes for replay diagnostics
```

## Goals / non-goals

- Goals: bit-identical results for the same scenario, seed and command log; saves that continue
  exactly; a replay that names the first tick and table that differ; rules enforced by lint.
- Non-goals (later phases): the worker and snapshots (S2), cross-browser replays (S2 nightly), formations,
  drill, fire, morale, pathfinding (S1), the renderer.

## Constraints

- **Determinism (0006):** in `src/sim/` only `+ − × /`, `Math.sqrt` and rounding helpers. ESLint bans:
  - `Math.sin`-like functions and `Math.random`, directly, destructured, computed (`Math[k]`), aliased
    (`const M = Math`), through `globalThis` or `Reflect`;
  - `**` and `**=`;
  - `Date`, `performance`, `process`, `crypto`;
  - `Float32Array`, `Float16Array`, `DataView` float32 access;
  - `Map`, `Set`, `WeakRef`, `FinalizationRegistry`;
  - every import that does not start with `./`, and dynamic `import()` (0005).

  `sin`, `cos` and `atan2` are polynomials of exact operations (`num.ts`), within 1e-12 of `Math`.
  `sin` and `cos` are exact for |x| ≤ 1e5 and throw beyond that (a bug: headings stay in (−π, π]).
  `atan2` returns values in (−π, π] with no −0. Decision 0006 names tables; `docs/proposals/sim-design.md`
  §2 allows tables or polynomials, and polynomials need no data file.
- **Order:** every loop runs in slot order; the fight reads start-of-step strengths, so a formation's
  slot never decides a result.
- **Budget:** `docs/proposals/sim-design.md` §16 targets ≤ 2 ms per tick. Measured in `test/spine.test.ts` on the
  S0 fight (8–9 blocks): about 0.02 ms per tick on a dev Mac.

## Design

- **Time** (`time.ts`): `TICK_HZ = 20`, one hash every 20 ticks; data in seconds.
- **World** (`world.ts`): `meta` (tick, free slots, data version, command sequence), the RNG state,
  the formation table (structure of arrays, 128 slots), its free-slot stack, the waypoint pool, and the
  commands stamped for the next tick. The build-time data is attached but is not state: its version is.
- **Handles** (`handle.ts`): `kind:3 | index:9 | gen:19`, non-negative. Reaping a formation moves its
  generation on, so old handles go stale (`formationSlot` returns −1).
- **Pools** (`pool.ts`): typed arrays with a free list in index order; a list is freed node by node.
- **Commands** (`commands.ts`): `move` (waypoints, replace or append), `halt`, `debug-spawn`,
  `debug-kill`. `issue` stamps `tick + 1` and a sequence number and quantises positions to 1 cm.
  `applyCommands` validates at the start of that tick and drops an invalid command with a reason
  (returned by `advanceTick`), never throwing and changing nothing. It checks: an unknown type, a stale
  tick, an alive handle, the side, the men, inside the map, at most 64 waypoints, and pool room
  (checked before a replacing move frees the old route).
- **RNG** (`rng.ts`): `xoshiro128**` with `Math.imul`, seeded by splitmix32; `sampleCount` draws an
  integer around an expected value from 12 uniforms (no `log` or `cos`).
- **Serializer** (`serialize.ts`): named sections (meta, RNG, formations, free list, waypoint pool,
  pending commands), little-endian. A table's columns are written in name order (`columns`), so a new
  column is saved and hashed with no list to update. `hashWorld` is FNV-1a over all of it; `sectionHashes` per section.
  `deserialize` refuses a save made with other data.
- **Replays** (`replay.ts`):
  - `record` runs a scenario (`{ name, setup }`) with external commands and keeps the log and the
    hashes.
  - `play` checks the scenario name and that the log is in tick order within the replay, re-issues it
    at its ticks (checking sequence numbers), and returns the first mismatch: the hash point (every 20
    ticks, so within 20 ticks of the divergence), the expected and actual hash, and the first differing
    section.
- **Metering**: `advanceTick(world, meter)` times each step through an injected clock (`Meter` in
  `tick.ts`); the sim reads none.
- **Data** (`data.ts`, `tools/build-sim-data.ts`): the heightfield on 1.79 m nodes and the cost grid on
  7.16 m cells, built in Node from a map definition and committed as `data/formation-field.simdata`; its
  FNV-1a is the data version. The map definition loads `prototypes/formation-core.js` in Node, so the sim
  and the prototype read the same terrain. A cost cell is the harmonic mean of its passable ground
  samples (at least half passable, else 0) times the slope factor of its steepest rise; a stand-in until
  pathfinding brings clearance and explicit bridges (`docs/proposals/sim-design.md` §7).

## Tunables

`S0` in `src/sim/tick.ts` (stand-in speed, contact distance, loss rate); `MAX_FORMATIONS` and
`MAX_WAYPOINTS` in `world.ts`; the cell sizes in `tools/build-sim-data.ts`.

## Verification

`npm test`: lint, typecheck, then Vitest (`test/`):
- the S0 fight's 180 hashes against `test/golden/s0-fight.json`, with the data version the tests pin
  (regenerate with `UPDATE_GOLDEN=1 npx vitest run` and say why in the commit);
- replay from the log (one logged order is dropped: its target was destroyed), a changed command caught
  at the next hash point in `formations`, a log out of order or past its end, another scenario;
- save at tick 1800 with a logged command pending, load, continue: the same hashes;
- the hash covers every typed array in the world (found by walking it) and the pending commands;
- bad commands are dropped with a reason and change nothing; a pending command crosses a save unchanged;
- lint: `src/sim/` clean, and every construct in `test/fixtures/banned-in-sim.ts` reported on its line;
- data version: another map gives another version, refused by saves, replays and `loadSimData`;
- data: truncated files are refused;
- units: RNG reference outputs, trig accuracy and domain, stale handles, pool, stamping, the
  finite-state assert.

`node tools/build-sim-data.ts --check` rebuilds the data and compares it with the committed file.

Negative runs (each guard broken on purpose fails its check):
- the RNG left out of saves;
- pending commands not saved;
- commands stamped for the current tick;
- no quantisation;
- the `**` lint rule removed;
- saves accepting other data;
- the fight reading strengths mid-step.

Each fails at least one test. The last is caught only by the golden hashes.

## Open questions

- Cross-browser replays: Node only until the S2 nightly runs Firefox and WebKit.
- The committed data depends on the Node that built it (`Math` in the prototype's terrain); `--check`
  reports drift rather than hiding it.
