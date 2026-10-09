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

- **Determinism (0006):** in `src/sim/` only `+ − × /`, `Math.sqrt` and rounding helpers. ESLint bans
  `Math.sin`-like functions, `Math.random`, `**`, `Date`, `performance`, `Float32Array`, `Map`, `Set`,
  and imports from outside `src/sim/` (0005). `sin`, `cos`, `atan2` are polynomials of exact
  operations (`num.ts`, within 1e-12 of `Math`). Decision 0006 names tables; `docs/proposals/sim-design.md` §2 allows
  tables or polynomials, and polynomials need no data file.
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
  `debug-kill`. `issue` stamps `tick + 1` and a sequence number and quantises positions to 1 cm;
  `applyCommands` validates at the start of that tick (alive handle, side, men, inside the map, pool room)
  and drops invalid ones with a reason (returned by `advanceTick`), never throwing.
- **RNG** (`rng.ts`): `xoshiro128**` with `Math.imul`, seeded by splitmix32; `sampleCount` draws an
  integer around an expected value from 12 uniforms (no `log` or `cos`).
- **Serializer** (`serialize.ts`): named sections (meta, RNG, formations, free list, waypoint pool,
  pending commands), little-endian. `hashWorld` is FNV-1a over all of it; `sectionHashes` per section.
  `deserialize` refuses a save made with other data.
- **Replays** (`replay.ts`): `record` runs a scenario with external commands and keeps the log and the
  hashes; `play` re-issues the log at its ticks (checking sequence numbers) and returns the first
  mismatch: tick, expected and actual hash, and the first differing section.
- **Metering**: `advanceTick(world, meter)` times each step through an injected clock; the sim reads none.
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
- the S0 fight's 180 hashes against `test/golden/s0-fight.json` (regenerate with
  `UPDATE_GOLDEN=1 npx vitest run` and say why in the commit);
- replay from the log, and a changed command caught at its tick in `formations`;
- save at tick 1800, load, continue: the same hashes;
- the hash covers the RNG, the pools and free lists, the pending commands;
- lint: `src/sim/` clean, and every construct in `test/fixtures/banned-in-sim.ts` reported on its line;
- data version: another map gives another version, refused by saves, replays and `loadSimData`;
- units: RNG reference outputs, trig accuracy, stale handles, pool, stamping, the finite-state assert.

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
