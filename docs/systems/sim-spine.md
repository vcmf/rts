---
status: current
last_reviewed: 2026-10-11
code: [src/sim, tools/build-sim-data.ts, maps/formation-field.ts, maps/battlefield.ts, src/scenarios/maps.ts, src/scenarios/s1a-drill.ts, test]
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
advanceTick: 1 commands · 3 the plan · 4 standing behaviour · 5–6 formations · 8 fire · 9 artillery · 10 charges and melee ·
             11–12 casualties and morale · 13 the end · 14 reap · tick++ · 15 hash (every 20)
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
  `atan2` returns values in (−π, π] with no −0 (#157: a zero result is made +0 at the return, whatever the sign of
  `y` or an underflowed ratio); `quantise` and the command angles' 0.1 mrad rounding give +0 for what rounds to
  zero. Decision 0006 names tables; `docs/proposals/sim-design.md` §2 allows tables or polynomials, and polynomials
  need no data file.
- **Order:** every loop runs in slot order.
- **Budget:** `docs/proposals/sim-design.md` §16 targets ≤ 2 ms per tick. Measured in `test/formations.test.ts`:
  40 battalions of 400 of every shape, moving, about 5 ms per tick on a dev Mac (1.2 ms at 100 men; over
  the target since S1c-4, [#36](https://github.com/vcmf/rts/issues/36)).

## Design

- **Time** (`time.ts`): `TICK_HZ = 20`, one hash every 20 ticks; data in seconds.
- **World** (`world.ts`): `meta` (tick, free slots, data version, command sequence, ruleset hash), the
  RNG state, the formation table (structure of arrays, 128 slots; each formation's unit type; per company
  and per bin columns are flattened, strided by the most companies and bins of any type), its free-slot stack, the order pool, and the commands stamped for the next tick. The
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
  - `debug-spawn` (a unit type, `unit`, the ruleset's first when left out; a shape, the type's start when
    left out), `debug-kill` (men drawn by company with the sim RNG). Malformed waypoints are dropped,
    not thrown.

  `issue` stamps `tick + 1` and a sequence number, and quantises positions to 1 cm and angles to 0.1 mrad.
  It never throws. One table per command type (`command-fields.ts`: its fields in save order and the kind of
  each) drives `normaliseCommand`, `quantiseCommand` and the save. `normaliseCommand` checks each command once
  against it (a handle or a count: an int32; a number: finite, |v| ≤ 1e9, so quantising stays exact and
  idempotent; a string; a flag; 1..64 `[x, z]` pairs of such numbers, read by index, the list's length a whole
  number; optional fields with their defaults), reading each field once, and quantises it: the result is canonical
  (normalising it again changes nothing) or `{ type: 'refused', reason }` (#155), with `unknown command` (no
  command, an unknown type, a `refused` with a reason that is not one of these), `malformed command` (a field of the
  wrong kind or out of bounds: a number given as a string, NaN or ∞, 2.9 men, or a read that throws), `malformed
  waypoints`, `no waypoints` or `too many waypoints`. Strings are made well-formed (a lone surrogate becomes U+FFFD).
  So every queued and logged command, `refused` included, is one a save writes and reads back as it was and a JSON
  log holds, and a replay re-issuing it gets the same command, sequence number and drop.
  `applyCommands` validates at the start of that tick and drops an invalid command with a reason
  (returned by `advanceTick`), never throwing and changing nothing. It trusts the queue's shapes and checks the
  rules: a `refused` command (its reason), an unknown type (a guard for a command pushed straight into `pending`), a stale
  tick, an alive handle, the side, the shape and preset names, the men, inside the map, and order-pool room (checked before a replacing order frees the old ones). Reaping clears
  every column of a formation's row and moves its generation on.
- **RNG** (`rng.ts`): `xoshiro128**` with `Math.imul`, seeded by splitmix32; `sampleCount` draws an
  integer around an expected value from 12 uniforms (no `log` or `cos`); an expected value ≤ 0 gives 0 and a NaN or
  infinite one gives NaN, both without a draw (#158): a bad value passes through as the sim's maths pass a NaN, for
  the debug finite-state check to catch where it lands in state.
- **Serializer** (`serialize.ts`): named sections (meta, RNG, formations, free list, order pool, pending
  commands), little-endian; commands are written field by field from a table per type. A table's columns are written in name order (`columns`), so a new
  column is saved and hashed with no list to update. `hashWorld` is FNV-1a over all of it; `sectionHashes` per section.
  A typed array is copied as its own bytes on a little-endian machine (every target), the same bytes as
  number by number (S1c-5: 0.5 ms for the 1.5 MB world of 40 battalions of 400; the hash itself, 2 ms, is
  FNV-1a's byte loop, kept so the hashes stay).
  `deserialize` refuses a save made with other data or another ruleset, and checks each pending command again with
  `normaliseCommand` (one that is not canonical, written by hand or by an older sim, is refused, not applied).
- **Replays** (`replay.ts`): `SIM_VERSION` is `u2.1` (from `s1e.4` with U2: morale is a bar, and the state and the
  rules change; `s1e.4` came from `s1e.3` with S1e-3b: the Napoleonic ruleset's
  `end.broken` is 0.65, so a replay's states and its battle's end change; `s1e.3` came from `s1e.2` with #155–#158: a
  zero that was −0 is +0, other bytes in some states, and a malformed command is stamped as `refused`), so `play`
  refuses an older replay cleanly rather than reporting a mismatch. `SAVE_FORMAT` is 14 (U2: the bar's fields replace
  morale's; 12 came with a pending command that may be `refused`, and that bump changed only the save's header, which `hashWorld` covers, so the goldens were regenerated with no state changed).
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
  built in Node from a map definition and committed as `data/<map>.simdata`; its FNV-1a is the data version.
  There are two maps:
  - `formation-field` (360 m, 1 m grid): its definition loads `prototypes/formation-core.js` in Node, so the
    sim and the prototype read the same terrain;
  - `battlefield` (1.2 km, 2 m grid, S1e-1): `maps/battlefield.ts`, build-time formulas.

  A scenario names its map (`Scenario.map`), and `src/scenarios/maps.ts` holds the version each was placed
  for. A cost cell is the harmonic mean of its passable ground
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
- bad commands are dropped with a reason and change nothing; a malformed one of every type is stamped as `refused`,
  saves, loads and drops the same (`test/saves.test.ts`); a pending command crosses a save unchanged;
- lint: `src/sim/` clean, and every construct in `test/fixtures/banned-in-sim.ts` reported on its line;
- data version: another map gives another version, refused by saves, replays and `loadSimData`;
- era genericity: `src/sim/` names no shape, pace, preset or class of the Napoleonic ruleset, and a
  second ruleset (two companies, other shapes, paces and presets) drills on the same engine;
- data: truncated files are refused;
- units: RNG reference outputs, trig accuracy and domain, stale handles, pool, stamping, the
  finite-state assert.

`node tools/build-sim-data.ts --check` rebuilds every map's data and compares it with the committed files.

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
