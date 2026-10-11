---
status: active
last_reviewed: 2026-10-11
---

# Plan: S1c-5, the cost of 16,000 men

S1c-4 (`docs/plans/active/s1c4-battalion-scale.md`) made the battalion 400 men and left the sim and the
soldier layer over budget at 40 battalions (`docs/known-issues.md`). This plan brings them back under it
before S1d adds cavalry and guns, and keeps the 800-man ceiling in reach (decision 0018).

## Measured (dev Mac, M1 Pro, before)

`tools/bench-cost.ts` (new): the cost benches outside vitest, split by part, on a release world (no
debug checks, as the page runs).

| Bench, 40 battalions | 400 men | 800 men |
|---|---|---|
| Marching through every shape, per 1/60 s frame, early (changing shape) / later (marching) | 8.4 / 10.2 ms | 17.0 / 21.3 ms |
| of which the soldier layer's step | 8.0 / 8.8 ms | 16.2 / 17.9 ms |
| the sim, per tick | 1.2 / 4.2 ms | 2.4 / 10.3 ms |
| Firing at the halt, per frame | 4.0 ms | – |
| of which the soldier layer's step | 3.7 ms | – |
| The hash (every 20 ticks) | 5.1–5.6 ms | 8.3–8.8 ms |

Where the time goes (CPU profiles of both benches):
- **The soldier layer:** three tree searches per man per frame (`eachObstacle`, a closure over the 3×3
  cells around him, 16% alone), though most of the field has no trees; an array allocated per place
  (`slotRC`); the neighbour search through `Man` objects; and settled men whose places have not moved
  still recompute them every frame.
- **The sim, marching:** the per-man passes (`sampleBins` every tick, `wetBins` up to 9 times a tick near
  impassable ground) ask `occupied` for each of the 414 slots and compute `sin`/`cos` per man where the
  value is per bin; the debug world's `assertFinite` also scans the trail rings every tick.
- **The hash:** the serializer writes every number through a `DataView` with a bounds check, 1 MB of
  trail rings, mostly zeros.

## Design

Nothing the sim decides may change: every golden and replay hash stays as it is, which is the test that
the refactors are pure. The soldier layer is cosmetic, so it may differ in detail; its tests (slot error,
nobody in the water, Face about) must hold.

### The sim

- **Filled slots, once:** a per-world cache of each battalion's filled slots (the list `occupied` would
  give), rebuilt only when what decides them changes (the men per company, the target shape, the lean).
  `sampleBins`, `wetBins` and the re-packing gate walk the list instead of every slot.
- **Per-bin direction:** in a straight shape a man's direction of travel is his bin's; `sampleBins` takes
  `sin`/`cos` once per bin (the same values, so the same results). Trail shapes keep the per-man value.
- **Companies clear of the water:** `wetBins` skips a company whose block lies wholly farther from
  impassable ground than its own reach (the distance field `impd`, as `clearOfImpassable` does for the
  whole battalion), so the gate's halvings only sample companies near the bank.
- **The debug checks:** `assertFinite` skips the trail rings (they are written only from checked
  positions).

### The hash and saves

The serializer copies each typed array as bytes on a little-endian machine (every browser and Node
target) and keeps the per-number path for a big-endian one. Same bytes, so the same hashes and saves.
The trail rings stay in the save; shrinking them (only live points) changes the save format and is left
until a save needs to be small (S2).

### The soldier layer

- **Trees:** a per-cell flag "a trunk within reach" from the scene's obstacle grid; a man away from trees
  skips all three searches, and the searches near trees become plain loops, not closures.
- **Places without allocation:** each slot's company, rank and file come from tables built once.
- **Settled men stay put:** a battalion that is halted and whose pose, lags and fill did not change this
  frame leaves its settled men alone (their places cannot have moved).
- **The neighbour search:** positions in typed arrays (x, z per man in the grid order, as the frame
  began), so the inner loop reads numbers, not objects.

If the marching frame is still over 4 ms after these, the layer moves its per-man step to a stride (half
the men a frame, alternating, at twice the step) behind a measured comparison, or the plan says what the
worker (S2) must take; the decision is recorded in the results.

### Budgets

The cost tests go back to the targets they can meet, measured on the dev Mac: 2 ms a tick for the sim,
4 ms a frame for sim and layer marching at 40 × 400, with 40 × 800 reported. Whatever is still over
stays in `docs/known-issues.md` with its measured number.

## Acceptance

- Every golden and replay hash unchanged; lint, typecheck, `check:data`, `check:docs`, the tests and
  `check:app` pass.
- The cost benches report before and after; the budgets in the tests are the targets or, where a
  target is missed, the measured cost with a known issue.

## Non-goals

- The S2 worker (the sim off the main thread); this plan measures what it would save.
- A smaller save format.
- GPU soldiers (the layer's positions computed in a shader).

## Results (2026-10-11)

Every golden and replay hash is unchanged, so the sim decides exactly what it did. `test/shortcuts.test.ts`
checks the two shortcuts against the computation they replace: the cached filled slots against `occupied`
(through losses, changes of shape and Face about), and the gate's wet bins against a scan of every man on
17,280 trial poses at the stream, 400 and 810 men, every shape and during changes (a margin too small fails
it).

**Cost** (dev Mac, M1 Pro, `node tools/bench-cost.ts`, the page's release world; the same tool on main for
before):

| Bench, 40 battalions | 400 men, before → after | 800 men, before → after |
|---|---|---|
| Marching, per frame, early / later | 8.4 → 4.4 / 10.2 → 6.0 ms | 17.0 → 9.5 / 21.3 → 12.1 ms |
| of which the soldier layer's step | 8.0 → 4.2 / 8.8 → 5.4 ms | 16.2 → 9.2 / 17.9 → 11.0 ms |
| the sim, per tick | 1.2 → 0.7 / 4.2 → 1.8 ms | 2.4 → 1.1 / 10.3 → 3.2 ms |
| Firing at the halt, per frame | 4.0 → 0.7 ms | – |
| The hash (every 20 ticks) | 5.1–5.6 → 2.8 ms | 8.3–8.8 → 4.5–4.8 ms |

Under vitest the same code runs about 40% slower (the tick 5.3 → 2.0 ms, the marching frame 13.8 → 7.9 ms,
firing 6.2 → 0.7 ms, 40 × 800 27 → 15 ms). The tests now hold: the 4 ms frame budget firing; 2.5 ms a tick
(the target 2 ms is met on the release world); 10 ms for the marching frame, with the known issue.

**What changed from the design:**
- **The sim's marching tick** was mostly the footprint gate placing every man of a battalion near the
  stream up to 9 times a tick; skipping the companies far from the water halved it (3.2 → 1.7 ms). The
  trail shapes also reuse the trail point of the last man at the same distance back (a rank of a bin).
- **The hash** stays at 2 ms: FNV-1a is bound by its byte-by-byte multiply, and a faster hash (by words)
  would change every recorded hash for 1.5 ms a second. The serializer's copy is the part that went (4.8 →
  0.5 ms).
- **Tried and dropped:** pushing pairs of neighbours once (each pair from one side) cost as much marching
  and twice as much at the halt, where it cannot skip the settled men; skipping the push for men near their
  places saves little, since a marching man aims 0.6 s ahead and is never near.
- **Not done:** the stride (half the men a frame). With every battalion marching at once the frame is still
  4.4–6 ms; the layer's step is 5 ms of it, about 1.5 ms each for placing, for the neighbours and for the
  rest. Whether a stride shows is a question for the 3D look, so it waits for the S2 worker and the look.

## Review

**Round 1** (`/code-review high`, 10 findings, none severe; no second round):
- **Fixed:**
  - the trunk lookup lost the trunks for a man just outside the obstacle grid: the grid has a ring of
    cells outside the scene's;
  - the re-packing gate's per-company scan went through the battalion's cached list, rebuilt on every
    trial loss: it asks `occupied` of the company again;
  - the layer computed each battalion's anchors twice a frame, and the impassable grid for places it did
    not test;
  - `sampleBins` inlined `onRoad` and `groundQ`: they have cell-index forms beside `groundGAt`;
  - unused `slotR`/`slotF`; the bench's own copy of the ceiling ruleset (now in
    `src/rulesets/napoleonic.ts`), its `meta[1]` and unchecked spawns;
  - `docs/systems/sim-page.md` copied the grid size; the tick budget is 3 ms (half again over vitest's
    2.0).
- **Kept:** `eachObstacle` in `src/render/scene.ts`, which the layer no longer calls, for the 3D renderer.

## Next

- **S2:** the sim and its hash in a worker (2–3 ms of the frame when marching, the hash spike every second).
- **The layer:** a stride or a worker of its own, decided with the 3D renderer that reads it.
