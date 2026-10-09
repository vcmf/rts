---
status: active
last_reviewed: 2026-10-09
---

# Plan: S1a, formations on the spine

S1 is the fun slice (`docs/proposals/sim-design.md` §17): a 20-minute fight of about six battalions per side that is
fun at 2× speed. It is too large for one reviewable PR, so it is split:

| Part | Scope | Ends with |
|---|---|---|
| **S1a** (this plan) | The formation prototype's 20 Hz layer ported onto the spine, deterministic: shapes and timed changes, the terrain lag model, the footprint gate, Face about, Retire, wheels; the Napoleonic ruleset as TypeScript data; terrain data v2 | The prototype's formation-level checks pass headless in Vitest, with golden hashes and replays |
| S1b | A Vite page that draws the sim (the staff-map style of the formation map, with the cosmetic soldier layer), selection, multi-selection orders, speed controls | Playing S1a's drill with the mouse |
| S1c | Fire (musketry calibrated on time to break), cohesion and morale, standing behaviour (return fire) | Two lines exchange fire and one breaks in 6–10 min |
| S1d | Cavalry (charges, squares) and one battery (roundshot rays) | Cavalry catches a forming square; a square holds; artillery punishes columns |
| S1e | The 6v6 scenario, an end condition, playtests | The S1 acceptance |

## Goals

- The formation layer of `prototypes/formation-core.js` runs on `src/sim/` with the spine's rules: commands
  only, typed-array state, exact-ops maths, no transcendental functions, hashed and replayable.
- Behaviour is the prototype's (its checks are the spec), re-measured, not copied number for number:
  terrain is now read from build-time data and maths is exact-ops, so values may move slightly.
- The era stays in data (decision 0015): shapes, change times, paces, terrain factors and drill
  presets come from a ruleset the world is created with; `src/sim/` names no formation.

Non-goals: rendering (S1b), fire and morale (S1c), cavalry and artillery (S1d), pathfinding
(automatic manoeuvres stay out, as in the prototype's redesign 2).

## Design

### What is state, and what is drawn (decision 0007)

The battalion is the unit. The sim holds per formation:
- the shape;
- the change in progress (from and to placements, start tick, durations);
- the anchor and heading;
- the march trail (a pool);
- the 12 bin lags and their rates;
- disorder, status and the stall count;
- the order queue (a pool);
- the **men per company**.

**Which slots are filled is a function of the shape and the company counts:**
- files from the centre outward;
- ranks front first;
- a line closing toward the colours across company boundaries (the prototype's `closeAcross`).

So `closeRanks` and `rebalance` become that rule: no per-soldier state in the sim. **Who** falls, and
which man stands in which slot, is the renderer's (S1b), with a cosmetic RNG. The gate, sampling and
Face about read the filled slots from the rule, so they stay deterministic.

### The ruleset as TypeScript data

`src/rulesets/napoleonic.ts` replaces `prototypes/ruleset-napoleonic.js`. It holds:
- paces, q and the terrain table;
- slope, water, orders presets and disorder;
- formation kinds, trail and `closeAcross`;
- start and passage shapes;
- **shapes**: company placements built from the block geometry;
- **change times**;
- the face and dress times.

Shape and change-time data moves out of the core here, closing the era-names note from #9. The
ruleset is passed to `makeWorld`, so the sim never imports it (decision 0005), and the same lint rules
apply to `src/rulesets/`.

### Terrain data v2 (build-time)

The data file adds, on the 1 m grid of the formation field:
- the terrain class (u8);
- the water depth (u16, mm).

The sim derives the slope from the 1.79 m heightfield, and builds per-kind impassable grids and their
distance fields at load, from the data and the ruleset. The data version covers the file; a world
records the ruleset hash too.

### Maths

`num.ts` gains an exact-ops `exp` (range reduction by powers of two). Tobler's slope factor needs it;
the slope table is built at load from exact operations. Everything the prototype did with `Math.hypot`,
`atan2`, `sin`, `cos` and `exp` goes through `num.ts`.

### Commands

The sim gains these commands:
- `move` (waypoints, replace or append), `form` (shape), `wheel` (angle), `face`, `retire` (metres),
  `halt`, `style` (order preset);
- the debug ones: spawn, kill (men lost per company, drawn by the sim RNG).

They are validated and dropped with reasons, as in S0.

### Tick

These fill the S0 tick slots:
- 5 orders → formation state: changes, face, dress;
- 6 movement: the lag model, the accordion, the gate and halts;
- 11 casualties: company counts and the fill rule.

S0's stand-in fight stays, in a test scenario only.

## Acceptance

1. **Ported checks (Vitest, headless).** Every formation-level check of `tools/formation-measure.js`
   whose subject is the formation layer is re-expressed against the sim's places, and passes:
   - the thicket table and its tolerances (mean lag ≤ Lmean, max ≤ Lmax at every step);
   - deep water: the oblique and whole-front approaches, the march column halt;
   - turns at the bank for every target angle, wheels and changes refused at the water;
   - thinned lines at the bank, the narrow ditch, ground impassable for one kind;
   - Face about in every shape, with a held file, refused at the water; Retire, also cut short;
   - the accordion: the column, the bend, the square;
   - the bridge and the ford;
   - the empty bin;
   - cost for 40 battalions.
   
   Checks about the soldier layer stay with S1b: settling in the wood and slot error.
2. **Golden hashes and replays:** a scripted drill scenario covers moves through terrain, every shape
   change, Face about, Retire, a wheel and casualties. It gives committed hashes, replays from its log,
   and survives a save and load mid-change.
3. **Era genericity:** `src/sim/` names no formation, pace or class. A test builds a second minimal
   ruleset with other shape names and runs a move and a change with it.
4. **Lint:** `src/sim/` and `src/rulesets/` clean under the determinism rules.
5. **Budget:** 40 battalions under the 2 ms per tick target (measured).
6. **Negative runs** for the gate, the change-path check, Face about's lag keeping, the fill rule and the
   ruleset injection.

## Results

- `npm test`: lint, typecheck, 50 Vitest tests pass (dev Mac, Node 22.22). Golden: the S1a drill's 300
  hashes, data `0x6ae782ed` (format 2).
- **Ported checks** (`test/formations.test.ts`): every formation-level check of the prototype passes
  against the sim's places. The thicket table matches the prototype's but one cell (keep 3/12: 7.4 s,
  prototype 7.5 s). Thinned lines at the bank: 15 accepted, 30 refused, nobody in the water. Details:
  `docs/systems/formations.md`.
- **Spine** (`test/spine.test.ts`): golden hashes, a replay from the log, a changed command caught at the
  next hash point, save and load in the middle of a change with an order pending, every typed array in
  the hash, bad commands dropped with reasons, data and ruleset versions refused.
- **Era genericity:** `src/sim/` names no Napoleonic shape, pace, preset or class (a test reads the
  sources), and a two-company test ruleset with its own shapes, paces and presets drills on the same
  engine.
- **Budget:** 40 battalions of every shape, moving: 1.2 ms per tick.
- **Negative runs**, each failing its tests:
  - the gate off;
  - the change-path check off;
  - Face about dropping lags;
  - the fill rule not centring;
  - no turning-circle stop.
- **Found on the way:** `import { type X }` still loads its module. It made an import cycle that left
  `formation.ts` reading `TRAIL` before `world.ts` set it (zero-length trail buffers, NaN places). Lint now
  requires `import type` for type-only imports.
- **Known and recorded:** casualty re-packing is not gated (`docs/known-issues.md`; S1c).

