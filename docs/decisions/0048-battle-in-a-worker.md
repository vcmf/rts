---
status: proposed
date: 2026-10-22
---

# 0048 The battle runs in a worker, its soldiers at a fixed step, drawn by interpolation

**Experimental**: if the measurements in `docs/plans/active/battle-threads.md` fail, this decision is rejected and the
design (`docs/proposals/battle-threads.md`) thrown away (the owner, 2026-10-22).

## Context

At 120 fps (decision 0036's soft target) a frame has 8.33 ms, and the main thread also renders. The soldier layer
(`src/render/soldiers.ts`) costs 10.6 ms at 16,000 men (decision 0018) and is paid at least once per displayed frame
(`src/app/main.ts` steps it `ceil(dt·speed / MEN_DT)` times a frame, `MEN_DT = 0.2 s` being the longest step), so its
cost grows with the frame rate. The sim's 20 Hz tick costs about 5 ms at 40 battalions of 400 (issue #36) and lands
whole in one frame. `docs/proposals/sim-design.md` §16 already planned a worker posting a snapshot per frame; the 3D
crowd renderer (branch `look/armies`) writes every moving man's matrix on the CPU. Large-battle games separate logic
from rendering (Total War: Warhammer, Age of Empires IV) and tick slowly while drawing fast with interpolation
(Planetary Annihilation, Supreme Commander).

## Decision

- **The sim and the soldier layer run in one Web Worker**; the main thread renders, takes input and reads, and never
  ticks. Commands cross by `postMessage` and are stamped with their tick by the worker.
- **The soldier layer steps at a fixed rate** (`MEN_HZ`, 30 to start), independent of the display, its battalions
  staggered so each step's cost is flat. It stays cosmetic: its own RNG, never read by the sim.
- **The worker publishes** the soldier frames (per man: position, yaw, clip and phase), a formation snapshot per tick
  and an event ring, in `SharedArrayBuffer`s with a three-slot `Atomics` protocol, no locks; the main thread never
  waits. Without cross-origin isolation, the same slots go by transferred buffers.
- **The renderer draws one soldier step behind** and the GPU interpolates each man between the last two steps
  (`prev`/`cur` per-instance attributes and `uAlpha`); formation anchors interpolate between ticks as now.
- **The sim's code is unchanged** (decisions 0005, 0006, 0013 hold: commands only; restricted float64 in any realm);
  no WebAssembly or native code for the sim now.
- Picking, line of sight queries, the staff map and the HUD read the shared buffers on the main thread.

## Consequences

- Good: the main thread's sim and soldier cost goes to about 0 and ticks stop hitching frames; the soldier layer's cost
  follows game time, not the frame rate; the 3D upload shrinks 2–4× (est.); replays unchanged.
- Bad: about 33 ms more visual latency for the men (one step, est.); the pages need cross-origin isolation (COOP/COEP;
  Electron pinned past the 41.0.0 regression, issue electron/electron#50242) or the slower transfer fallback; the UI
  reads data one step old; a second code path (worker vs headless tests) to keep identical (a replay check).
- Unknowns measured by the plan: Babylon's own main-thread cost, efficiency cores, `bufferSubData` with shared views.

## Alternatives considered

- **Keep everything on the main thread, cheaper** (the soldier layer in typed arrays only): plan PR 2 does it, but it
  cannot remove the tick's hitch nor fit 10.6 ms under 8.33 ms with rendering.
- **A full GPU soldier simulation** (Ultimate Epic Battle Simulator 2): no CPU-readable state for picking, line of sight,
  the staff map or replays; the steering does not port to shaders; no compute shaders in WebGL2. Rejected.
- **WebAssembly or a native addon for the sim**: not needed for the gain; native code risks fused multiply-adds and
  determinism. Rejected for now.
- **Rendering in a worker** (OffscreenCanvas): input and resize forwarding, reported WebGPU issues; only if main-thread
  jank is measured to matter.
- **Snapshots posted per frame** (`docs/proposals/sim-design.md` §16): shared slots avoid the per-frame copies and the
  lost events; transfers remain the fallback.
