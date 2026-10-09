---
status: active
last_reviewed: 2026-10-09
---

# Plan: S0, the simulation spine

The first game code. A deterministic simulation core in TypeScript that runs in Node without a
renderer: the tick loop, commands, entity tables, numbers, randomness, hashing, saves and replays.
Scope and acceptance come from `docs/proposals/sim-design.md` §17; the rules from decisions 0005,
0006, 0013 and 0015, and `docs/architecture.md` §2–§4.

No gameplay beyond what the acceptance test needs: S1 (the fun slice) ports the formation and
terrain prototypes (`prototypes/formation-core.js`) onto this spine.

## Scope

**Toolchain** (the repo's first `package.json`):
- TypeScript strict, Vitest, ESLint (flat config with typescript-eslint);
- exact pinned versions; Node ≥ 22;
- `npm test` runs lint, typecheck and the tests; `npm run check:data` rebuilds the sim data and
  compares it with the committed file.

The prototypes stay as they are (plain scripts from `file://`).

**`src/sim/`**:
- `time.ts`: `TICK_HZ = 20`, `TICK_MS`, seconds-to-ticks helpers (data is authored in seconds).
- `num.ts`: the allowed maths:
  - our own `sin`, `cos`, `atan2`, as polynomials built from `+ − × /` only;
  - `wrapAngle`;
  - quantisation to 1 cm for command positions;
  - `assertFinite`.
- `rng.ts`: `xoshiro128**` on 32-bit integers (`Math.imul`), state stored in the world; integer
  and unit-interval draws; an integer-only casualty sampler (sum of uniforms).
- `handle.ts`: handles `kind:3 | index:9 | gen:19` (always ≥ 0); validity check against the
  table's generation.
- `pool.ts`: typed-array pools with free lists for variable-length data (waypoints, order queues).
  Pool state, free lists included, lives in arrays the hash covers.
- `world.ts`: the world. Tick, RNG state, the formation table (structure of arrays, `Float64Array`
  and `Int32Array`, no `Float32Array`), pools, the loaded sim data. S0 formation fields:
  - side and type;
  - position and facing;
  - men;
  - a speed state;
  - an order and waypoint pool handle;
  - alive and generation.
- `commands.ts`: command types (`move`, `halt`, `debug-spawn`, `debug-kill`); the sim stamps
  `tick + 1` on receipt, quantises positions, validates (alive, side, legal) and drops invalid
  commands with a logged reason, never throws; only external commands are logged.
- `tick.ts`: `advanceTick(world)` in the `docs/proposals/sim-design.md` §16 order. S0 implements:
  1. apply stamped commands;
  2. movement: blocks walk their waypoints at a speed scaled by the cost grid, facing by `atan2`;
  3. a stand-in fight: opposing blocks within a radius lose men by RNG draws;
  4. reap empty formations, freeing their slots (generation increments);
  5. a hash every 20 ticks;
  6. tick++.
  
  The rest of the steps stay as named, empty slots. Debug builds assert no NaN or Infinity in state
  at the end of each tick.
- `hash.ts`: 32-bit FNV-1a over every table's bytes in index order, with the pools, free lists and
  RNG state.
- `serialize.ts`: one serializer for saves, hashes and debug dumps: world → bytes → world.
- `replay.ts`: a replay is the sim version, data version, scenario, seed and external command log;
  playback reproduces every hash, and a mismatch reports the first differing tick and table.
- `metering.ts`: time per tick step, injected from outside the sim so `sim/` never reads a clock.

**Build-time data** (`tools/build-sim-data.ts`, Node, outside `sim/`):
- reads a map definition (`maps/formation-field.ts`: the formation test map's heights, stream,
  woods and classes, ported from `prototypes/formation-core.js`);
- writes the sim heightfield (1.79 m grid), the cost grid (7.16 m cells, from slope and terrain
  class; deep water impassable) and a manifest to `data/`;
- hashes all of it into the **data version**, which the runtime asserts on load.

The build may use `Math.sin` and the like: it runs once, in Node, and its output is data.

**Lint** (`eslint.config.js`). In `src/sim/` it bans:
- `Math.sin/cos/tan/asin/acos/atan/atan2/exp/log/pow/hypot/cbrt/random`;
- the `**` operator;
- `Date` and `performance`;
- `Float32Array`;
- iterating a `Map` or `Set`;
- imports of `@babylonjs/*` or anything outside `src/sim/`.

**Docs:**
- `docs/systems/sim-spine.md`: the system doc;
- `docs/engine-map.md`: S0 statuses;
- a decision record for the toolchain;
- `AGENTS.md` and `docs/INDEX.md`: the new commands and paths.

## Acceptance

1. **Golden hashes:** a scripted 3-minute fight of 8 moving blocks (3600 ticks) gives the hash
   sequence committed in the repo, in Node.
2. **Replay:**
   - a live run with external commands at irregular ticks, replayed from its log, reproduces every
     hash;
   - a changed log entry is reported at the first differing tick and table.
3. **Save and load:** saving at tick 1800, loading into a fresh world and continuing gives the same
   hashes as the uninterrupted run.
4. **Lint:**
   - `src/sim/` is clean;
   - a fixture with each banned construct fails, one error per construct (checked by a test that
     runs ESLint).
5. **Units:**
   - RNG matches the published `xoshiro128**` reference outputs;
   - trig error ≤ 1e-12 over the full circle (against `Math` in the test, not in the sim);
   - a stale handle is rejected after its slot is reused;
   - the pool free list round-trips;
   - stamping, quantisation and validation drops behave as specified;
   - the NaN assert fires on a poisoned state.
6. **Data version:** changing the map definition changes the data version, and a world built with
   the old version refuses the new data.
7. **Budget, measured not asserted:** time per tick for the fight. The `docs/proposals/sim-design.md` §16 target
   is ≤ 2 ms per tick.
8. **Negative runs:** each guard (hash coverage of pools and RNG, stamping, the lint rules, the data
   version check) broken on purpose makes its check fail.

Out of scope: the worker and snapshots (S2), cross-browser replays (S2 nightly), pathfinding,
formations and drill, fire, morale (S1), the renderer.

## Results

- `npm test` passes: lint, typecheck, 19 Vitest tests (Node 22.22, dev Mac).
- **Golden:** the S0 fight gives 180 hashes, committed in `test/golden/s0-fight.json`. Data version
  `0xb06639cc`; `npm run check:data` rebuilds it identically.
- **The fight:** after 3 minutes, two blocks are destroyed and reaped, the survivors hold 18–68 men,
  and all 6 external orders apply.
- **Replay:** reproduces all 180 hashes. A command changed by one man is reported at the next hash
  tick, in `formations`.
- **Save and load:** saving at tick 1800 and continuing gives the same 90 later hashes.
- **Lint:** all 22 banned constructs in the fixture are reported, each on its own line.
- **Trig:** within 1e-12 of `Math`.
- **RNG:** matches the reference outputs.
- **Budget:** 0.022 ms per tick (target ≤ 2 ms).
- **Negative runs:** each of these makes at least one test fail:
  - the RNG left out of saves;
  - pending commands not saved;
  - commands stamped for the current tick;
  - no quantisation;
  - the `**` lint rule removed;
  - saves accepting other data;
  - the fight reading strengths mid-step (only the golden hashes catch this one).
