---
status: active
last_reviewed: 2026-10-22
---

# Plan: the battle's threads

**Experimental.** The design is `docs/proposals/battle-threads.md`; decision 0048 (proposed) adopts it. The owner
(2026-10-22): the logic track is paused for this work, so this track owns the sim side, with nothing in parallel;
"well document our plan and our design ... we throw away once implemented and tested if it does not work out". Each
PR below states its measurement and its stop criterion: if a stop criterion is met, the work stops, the PRs merged so
far are reverted if they cost more than they gave, and decision 0048 is rejected.

**Depends on** the armies PR (branch `look/armies`: the 3D crowd renderer, `src/look/units.ts`) for PR 4, and on the
sim driving the 3D armies (the PR after it) for the end-to-end measurement. PRs 1–3 stand on the sim page alone.

## How everything is measured

- **CPU per second of game time and per frame** for the sim and the soldier layer, separately: the cost tests in
  `test/soldiers.test.ts` and `test/formations.test.ts` report ms per second of game time (new) besides ms per frame.
- **Frame intervals p50/p95/p99** from `requestAnimationFrame` on the production build (`vite build` + `vite preview`;
  the dev server lies about frame rates), at 60 and 120 Hz, on the sim page and later the look page with the armies.
- **Long tasks** (a `PerformanceObserver` for `longtask`) and **garbage collection** (a Chrome trace: GC events, the
  heap) on the main thread.
- **Determinism**: a replay's hashes identical run in the worker and on the main thread, and across Chrome and Firefox
  (the existing replay tests).
- Benchmarks on the dev Mac (M1 Pro) and, before PR 3 is accepted, the min-spec RTX 3060 laptop (decision 0011).

## PR 1: a fixed soldier step, staggered, interpolated by the GPU

- **Scope**: the soldier layer steps at a fixed `MEN_HZ` (30, est.) of game time, independent of the display
  (today it steps at least once a frame, `MEN_DT = 0.2 s` being only the longest step); its battalions staggered so
  each step's cost is flat; the sim page interpolates the men between steps for drawing; the 3D page (on top of the
  armies PR) uploads `prev`/`cur` per-instance attributes when a step is published and lerps with `uAlpha` in
  `units.vert`. Still on the main thread.
- **Acceptance**: the soldier layer's cost per frame at 120 fps about a quarter of today's (10.6 → ≤ 3 ms at 16,000
  men, est. 2.7); its cost per second of game time unchanged or lower; the steering's goldens (`slotError`, the wood and
  halt tests) within their limits; no visible stiffness (the owner's eye on a 30 Hz step, at 1× and 8×).
- **Stop**: if a 30 Hz step reads stiff and only ≥ 60 Hz looks right, PR 1 still lands (it decouples from the display)
  but its gain is halved: re-estimate PRs 2–3 before going on.

## PR 2: the soldier layer in structure-of-arrays typed arrays

- **Scope**: `Man` objects and the per-unit `Map`s replaced by typed arrays (x, z, vx, vz, slot, flags...), no per-frame
  allocations (the `[x, z, h]` tuples, `filter`); the same behaviour.
- **Acceptance**: 1.5–3× cheaper per step (est.); no garbage collection pauses from the soldier layer in a 60 s trace;
  the goldens unchanged (bit-identical where the arithmetic order is kept).
- **Stop**: if under 1.3× and no measurable GC gain, keep it only if it simplifies PR 3's shared buffers, else revert.

## PR 3: the battle worker and the shared buffers

- **Scope**: the sim and the soldier layer in one Web Worker; commands over `postMessage`, stamped by the worker;
  the soldier frames, the formation snapshot and the event ring in `SharedArrayBuffer`s with the three-slot
  `Atomics` protocol (`docs/proposals/battle-threads.md` §5); COOP/COEP on Vite's dev and preview servers; a
  `crossOriginIsolated` check and the transferred-buffer fallback; the sim page reads the buffers (picking, the staff
  map, the HUD).
- **Acceptance**: the main thread's sim and soldier time about 0; no frame over 8.33 ms at 120 Hz caused by a tick (long
  tasks gone); a replay's hashes identical worker vs main thread and across browsers; the fallback measured (its cost
  stated); on the min-spec laptop too.
- **Stop**: if the worker's step misses its 30 Hz deadline while a tick runs (more than 1 % late steps at 16,000 men),
  go to PR 5; if the transfer fallback is the common case in the browsers we ship (Electron included), re-weigh.
  If the main thread's frame is no better than after PR 1–2, revert PR 3 and reject decision 0048.

## PR 4: the 3D renderer reads the soldier frame

- **Scope** (needs the armies PR and the sim driving the 3D armies): `src/look/units.ts` reads the shared soldier frames
  (positions, yaw, clip and phase) instead of writing matrices: the `prev`/`cur` attributes from PR 1, the battalions'
  bounds and culling from the range table.
- **Acceptance**: the upload 2–4× smaller (est.); smooth motion at 120 fps; the 3D men match the staff map (a headless
  check); the GPU time unchanged; golden screenshots.
- **Stop**: if the upload or the lerp costs more GPU than the matrices did, keep the matrices (built on the main thread
  from the shared frame) and say so.

## PR 5 and PR 6: only if measured

- **PR 5**, a separate soldier worker fed by per-tick snapshots (three slots), if PR 3 shows late soldier steps during
  ticks. Acceptance: late steps under 1 %; the snapshot copy measured; three threads checked on a 6-core laptop.
- **PR 6**, rendering in a worker (OffscreenCanvas), or the soldier layer in WebAssembly with f32x4 SIMD (cosmetic, so
  determinism does not apply), only if main-thread jank (DOM, GC) is measured to cost frames after PR 3.

## Open questions

- The best `MEN_HZ`, and the stagger (a share of the battalions per step, or every battalion with a share of the
  separation pass).
- Whether Chrome's WebGL2 `bufferSubData` accepts `SharedArrayBuffer`-backed views (else a copy, about 0.05 ms).
- Whether macOS puts the worker on efficiency cores under load.
