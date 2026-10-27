---
status: accepted
date: 2026-10-27
---

# 0072 Battle threads: no PR 6; the look page's placing goes to the men worker instead

Closes the battle threads plan's PR 6 (rendering in a worker, or the soldier layer in WebAssembly) against its own
decision rule, which tripped. The plan and its measurement: `docs/plans/active/battle-threads.md` ("PR 5 and PR 6",
its Outcome); the next step: its "PR 4c".

## Context

The plan (written before the measurement) said PR 6 goes ahead if, on the look page at `?sim`, the main thread's work
outside rendering (the page's sim tick, the placing of the men, their uploads) is over 1 ms a frame at p95, or long
tasks fall in over 1 % of frames. Measured (the look bench, three traced rounds, one clean): 0.72 to 0.93 ms at p95
close, 0.98 to 1.51 at the default view, 1.18 to 1.37 wide; long tasks in 0.02 % of the frames. The rule tripped at
the default and wide views, on the placing alone (0.51 to 0.60 ms a frame of it); the page's sim tick was 0.01 to
0.02 ms.

## Decision

The owner, 2026-10-27: "record pr 6 as not needed and do pr 4 step 3". PR 6 is not done: neither of its options
removes what tripped the rule (rendering in a worker carries the placing with it; the soldier layer already runs in
the men worker since PR 5). The placing's work moves to the men worker instead (PR 4c: each man's way and gait worked
out there and published, the page reading them).

## Consequences

- The look page's frame stays on the main thread; its remaining cost is its rendering, the script's page alike (#215,
  decision 0050, Track E).
- Not measured: the page's handling of the workers' messages (its own task between frames; the long-task observer
  sees only tasks over 50 ms). Should a trace show the page's frames missed between them, PR 6's question reopens.

## Alternatives considered

- **PR 6 as the rule said** (OffscreenCanvas): the frame's work moves off the main thread whole, placing included, so
  the frame is no shorter; it pays only when the page's own other work (input, the HUD) costs frames, which this
  page's does not, measured.
- **The layer in WebAssembly**: it runs in the men worker already; the page's cost is not the layer's.
