---
status: active
last_reviewed: 2026-10-22
---

# Plan: the battle's threads

**Experimental.** The design is `docs/proposals/battle-threads.md`; decision 0048 (proposed) adopts it. The owner
(2026-10-22): the logic track is paused for this work, so this track owns the sim side, with nothing in parallel;
"well document our plan and our design ... we throw away once implemented and tested if it does not work out"; and
soldiers move **stepped at 12 fps**, poses and positions together (the art bible). Each PR states its measurement and
its stop criterion: if one is met, the work stops, the PRs merged so far are reverted if they cost more than they
gave, and decision 0048 is rejected.

**Depends on** the armies PR (branch `look/armies`: the 3D crowd renderer) for PR 4, and on the sim driving the 3D
armies for the end-to-end goal. PRs 1–3 stand on the sim page alone.

## The goal and how everything is measured

- **Overall goal**: the frame interval's **p99 ≤ 8.33 ms** with 16,000 men at 120 Hz on the dev Mac (M1 Pro),
  production build, at 1× and 8× speed; the min-spec RTX 3060 laptop measured when available (decision 0011).
- **Baselines** (dev Mac, release world, 40×400; `docs/plans/active/s1c5-cost.md`, `docs/plans/active/s1d1-unit-types.md`):
  the soldier layer's step 4.2–5.4 ms; the sim's tick 0.6–1.8 ms (about 2.0 under vitest, `TICK_BUDGET` 3);
  marching, sim and layer, about 4.5 ms per 1/60 s frame (issue #36); the state hash 2.7–4.1 ms every 20 ticks
  (issue #38).
- **Every metric as mean and p99**, at **1× and 8×**: main-thread busy time per frame (sim, layer, hash, reading the
  buffers); frame intervals from `requestAnimationFrame` on the production build (`vite build` + `vite preview`);
  long tasks (a `PerformanceObserver`); garbage collection (a Chrome trace); the worker's step and tick times.
- **Determinism**: replay hashes identical in the worker and on the main thread (PR 3 adds the browser harness).

## PR 1: the soldier step at 12 Hz of real time, staggered

- **Scope**: the soldier layer steps at `MEN_HZ = 12` per real second (tied to the figures' 12 fps bake), at most one
  step per 1/12 s of real time; above 1× each step covers more game time (larger dt, the existing longest-step cap
  kept); paused: no steps; its battalions in four groups, a group per 1/48 s sub-step. The sim page draws the latest
  step as is (no interpolation). Still on the main thread.
- **Acceptance** (16,000 men, 120 Hz, 1× and 8×): the layer's main-thread cost per frame **mean ≤ 1.4 ms** (est.: a
  quarter of 4.2–5.4 ms on 48 of every 120 frames ≈ 0.5 ms mean) and **p99 ≤ 1.5 ms** (one sub-step: a quarter of
  5.4 ms); at 8× the same (the real-time cap); the steering's goldens (`slotError`, the wood and halt tests) within
  their limits; the owner's eye on the 12 fps step at 1× and 8×.
- **Stop** (measurable): if the layer's p99 per frame at 120 Hz exceeds 2.0 ms, or the goldens fail at the stepped rate
  and cannot be re-tuned, revert PR 1 and re-plan.

## PR 2: the soldier layer in structure-of-arrays typed arrays

- **Scope**: `Man` objects and the per-unit `Map`s replaced by typed arrays at stable per-man indices (no compaction;
  the fallen kept with a state bit), no per-frame allocations.
- **Acceptance**: the step's mean 1.5–3× cheaper (est.: 4.2–5.4 → ≤ 3 ms full step), its p99 likewise; no GC pause from
  the layer in a 60 s trace at 1× and 8×; the goldens unchanged.
- **Stop**: under 1.3× and no measurable GC gain: keep it only if PR 3's shared frame needs its layout, else revert.

## PR 3: the battle worker, the shared buffers, the browser replay harness

- **Scope**: the sim (with the hash) and the soldier layer in one Web Worker; commands posted, validated and stamped by
  the worker; the soldier frame, the world mirror (per tick) and the event ring in `SharedArrayBuffer`s with the
  three-slot protocol (`docs/proposals/battle-threads.md` §5); the main thread's read-only `World` view for `map.ts`,
  the HUD and `formationHandle`; the worker's game-time clock; COOP/COEP on Vite's dev and preview servers, the
  `crossOriginIsolated` check and the transfer fallback; **a browser replay harness** (headless Chrome running a
  replay in the worker and on the main thread, comparing the hashes; Firefox later, sim-design's S2).
- **Acceptance** (16,000 men, 120 Hz, 1× and 8×): the main thread's sim + layer + hash time **mean ≤ 0.3 ms, p99 ≤ 0.5
  ms** per frame (reading the buffers and the uploads only); **no long task** from a tick or the hash; the frame
  interval's **p99 ≤ 8.33 ms** on the sim page; the worker's tick mean ≤ 1.8 ms and the hash's form chosen (amortised
  or incremental) with its p99 per tick stated; replay hashes identical worker vs main; the fallback's cost stated; the
  min-spec laptop measured if available.
- **Stop**: if the main-thread frame p99 is no better than after PRs 1–2, revert PR 3 and reject decision 0048; if more
  than 1 % of the worker's sub-steps run late while a tick or the hash runs, go to PR 5.

## PR 4: the 3D renderer reads the soldier frame

- **Scope** (needs the armies PR and the sim driving the 3D armies): `src/look/units.ts` reads the shared soldier frame
  (x, y, z, yaw, the pose from the state word) instead of writing matrices: per-instance attributes uploaded for the
  battalions that moved, once per 12 Hz step; stepped, no interpolation.
- **Acceptance**: the upload about 3 MB/s at 16,000 men moving (est.) against about 12 MB/s today (64 B × 12 Hz per
  man); the 3D men match the staff map (a headless check); GPU time unchanged; the look page's frame p99 ≤ 8.33 ms at
  16,000 men, 120 Hz, 1× and 8× (the overall goal).
- **Stop**: if the attributes cost more GPU than the matrices did, keep the matrices built on the main thread from the
  shared frame, and say so.

## PR 5 and PR 6: only if measured

- **PR 5**, a separate soldier worker fed by the per-tick mirror, if PR 3 shows over 1 % late sub-steps. Acceptance:
  late sub-steps under 1 %; three threads checked on a 6-core laptop.
- **PR 6**, rendering in a worker (OffscreenCanvas), or the layer in WebAssembly with f32x4 SIMD (cosmetic, so
  determinism does not apply), only if main-thread jank is measured to cost frames after PR 3.

## Open questions

- The stagger's grouping (four groups of battalions, or every battalion with a share of the separation pass).
- Whether Chrome's WebGL2 `bufferSubData` accepts `SharedArrayBuffer`-backed views (else a copy, about 0.05 ms).
- Whether macOS puts the worker on efficiency cores under load.
- The hash in the worker: amortised over 20 ticks or incremental.
