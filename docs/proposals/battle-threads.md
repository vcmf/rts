---
status: draft
last_reviewed: 2026-10-22
---

# The battle's threads: a worker, a fixed soldier step, drawn by interpolation

**Experimental.** Decision 0048 (proposed) adopts this design; the plan is `docs/plans/active/battle-threads.md`. If
the plan's measurements fail, the decision is rejected and this design thrown away (the owner, 2026-10-22). It
refines `docs/proposals/sim-design.md` §16 (the worker and the snapshot) and `docs/architecture.md` §4 (fixed timestep
with interpolation); where they differ, this proposal says why.

## 1. The problem, measured

The frame budget at the soft target of 120 fps (decision 0036) is 8.33 ms, and the main thread also draws.

- **The soldier layer** (`src/render/soldiers.ts`, `SoldierLayer.step`: each man steered to his slot, the
  separation grid, the trunks) costs **10.6 ms at 16,000 men** on the dev Mac (decision 0018: the 4 ms budget broken;
  `test/soldiers.test.ts` 40×400 changing shape and marching, sim and men about 9–12 ms). It is paid **per displayed
  frame**: the sim page (`src/app/main.ts`) steps it `ceil(dt·speed / MEN_DT)` times a frame with `MEN_DT = 0.2 s` as
  the longest step, so at least once a frame. At 60 fps that is 10.6 ms a frame; at 120 fps the same 10.6 ms twice as
  often: the cost is per frame, not per second of game time.
- **The sim's tick** (`advanceTick`, 20 Hz) costs about **5 ms** at 40 battalions of 400 moving (`docs/systems/sim-spine.md`,
  issue #36; the target is ≤ 2 ms so 8× speed fits), and the hash about 2 ms every 20 ticks. A tick lands whole
  inside one frame's accumulator loop: at 120 fps one frame in six carries it, a visible hitch.
- **The 3D armies** (branch `look/armies`, `src/look/units.ts`): positions are written on the CPU as 16-float
  thin-instance matrices for every man of a moving battalion, 12 times a second; the 3D page does not run the sim
  yet (its moves are scripted). When it does, the two costs above join the renderer's on one thread.

So the main thread cannot hold 120 fps with 16,000 men while it also ticks and steps them: the work has to leave
the frame (a fixed step, independent of the display) and the thread (a worker).

## 2. What the industry does (sources at the end)

- **Separate the game's logic from the render's work.** Total War: Warhammer split "game draw" (logic, AI, object
  tracking) and graphics onto separate threads (their optimisation blog). Age of Empires IV multithreaded its sim
  while keeping it deterministic, with tools that check it gives the same result on one core or many (GDC, The MAW).
- **Tick slowly, draw fast, interpolate.** Planetary Annihilation (and Supreme Commander) tick at 10 Hz while clients
  draw at 60 and interpolate keyframes (ChronoCam). Age of Empires sent commands, never unit state, in lockstep
  (1500 Archers): sending state "would limit to 250 moving units".
- **A full GPU simulation** (Ultimate Epic Battle Simulator 2: every unit's AI on the GPU) is limited by video memory
  and leaves no CPU-readable state: no picking, line of sight, staff map or replays. Rejected for us (§8).

## 3. The threads

```
 main thread (display rate)                      battle worker
 ───────────────────────────                     ─────────────────────────────────────────────
 input, HUD, DOM                                 sim: advanceTick at 20 Hz (accumulator on the
 commands ─────── postMessage (a few 100 B) ───▶   worker's clock), command log, stamping (§6),
 Babylon render, staff map                         hash every 20 ticks
   reads, never writes:                          soldier layer: a fixed step MEN_HZ = 30,
   ◀── soldier frames  (SharedArrayBuffer, ──────   battalions staggered over the step
   ◀── formation snapshot + event ring  ─────────   writes the shared buffers, publishes with Atomics
 picking, line of sight queries, staff map:
   from the shared buffers
```

- **The main thread never ticks** and never steps the men: per frame it reads the latest published buffers (an
  `Atomics.load` of a slot index), uploads the soldiers' new step to the GPU only when one was published, and draws.
- **One battle worker** at first: the sim and the soldier layer together, because the layer reads the live `World`
  (`w.f.*`, `placesCtx`) as it does today; no snapshot of the world is needed between them.
- **Later, only if measured** (plan PR 5): a separate soldier worker fed by a per-tick copy of the world's formation
  arrays (three slots; "snapshots are a buffer copy", `docs/architecture.md`; about 0.1–0.2 ms for 1.5 MB, est.), so
  a 5 ms tick no longer delays soldier steps.

## 4. The fixed soldier step

The soldier layer runs at a fixed `MEN_HZ = 30` (est.; tuned by eye against the drill's speeds), decoupled from the
display: 30 steps per second of game time whatever the frame rate. Its battalions are **staggered**: each step
advances a quarter of the battalions by four steps' time (or each battalion every step with a quarter of the
separation pass: whichever keeps the steering stable; the plan measures both), so the per-step cost is flat instead
of a spike. The step is cosmetic (the sim never reads it): its own RNG and its own dt, so a fixed rate changes no
replay. At 120 fps that is about 10.6 ms × 30/120 ≈ **2.7 ms per frame on average** (est.) before the move to the
worker, and about 0 on the main thread after it.

## 5. The shared buffers

All in `SharedArrayBuffer`s (cross-origin isolation, §7), Float32 unless noted; sizes at 16,000 men (est.).

- **Soldier frames**: three slots (triple buffering). Each slot holds, per man, `x, y, z, yaw` (16 B) and a clip and
  phase word (Uint32: the role's clip and its start, decision 0037: the sim owns timing), plus a battalion range table
  (first man, count, LOD hints) and the step's game time. About **320 KB a slot**. `y` (the ground's height) is
  filled by the worker, which has the terrain.
- **The slot protocol**: the worker fills the slot the reader is not using, then `Atomics.store`s its index and its
  step number into a small Int32 header. The main thread `Atomics.load`s the latest at frame start and keeps the one
  before it for interpolation. No locks, no tearing: a slot is never written while it can be read (three slots: the
  reader's current, the reader's previous, the writer's). The main thread never calls `Atomics.wait`.
- **The formation snapshot**: per tick, what the main thread's UI, picking and the staff map need: anchors (and the
  previous tick's, for interpolation as today), facing, kind, transition progress, frontage, ranks and files, men,
  morale and cohesion states, phases (decision 0037). About 40–60 KB (`docs/proposals/sim-design.md` §16's estimate),
  in its own three slots.
- **The event ring**: volleys, departures, casualties, morale breaks since the last read, a ring with a write index
  (so events are not lost when a frame is long: the risk §16's review raised).

## 6. The tick and the frame

- **One soldier step behind.** The renderer draws between the last two published soldier steps: alpha =
  (now − time of step k−1) / soldier dt, from the timestamps the worker writes. That costs about **33 ms of visual
  latency** (one step at 30 Hz, est.): acceptable for an RTS (orders are acknowledged by the HUD at once).
- **The GPU interpolates the men.** The 3D renderer keeps two per-instance vec4 attributes, `prev` and `cur`
  (x, y, z, yaw), uploaded only when a new step is published (30 Hz), and a uniform `uAlpha`: `units.vert` lerps
  position and yaw. That replaces the CPU-built 16-float matrix with 4 + 4 floats: a 2–4× smaller upload, about 15 MB/s
  at 16,000 men (est.), and the main thread's per-frame soldier work becomes about one buffer swap.
- **Formation anchors** interpolate between ticks as they do now (`docs/architecture.md` §4).
- **Clip and pose** stay a function of sim state (decision 0037): the worker writes each company's or battalion's
  phase and its start time; the shader reads the baked animation; the per-man offsets are the existing jitter.
- **Command stamping** (`docs/proposals/sim-design.md` §16 and the determinism contract): a command posted by the main
  thread is stamped by the worker with the tick it applies on, never by the main thread's clock, so a replay is the
  stamped command log, as today.

## 7. Determinism and replays

- **The sim's code and ruleset are unchanged**; only commands cross into the worker. Restricted float64
  (decision 0006) holds in any JavaScript realm; replays match across browsers (decision 0013) for the same reason
  they do now.
- **The soldier layer stays cosmetic**: its own RNG, never written back to the sim, so its step rate and thread are
  free.
- **Tests**: the headless tests keep importing `src/sim` directly; the worker is tested in Node with `worker_threads`
  (the same `SharedArrayBuffer` and `Atomics` API); the acceptance includes a replay whose hash is identical run in the
  worker and on the main thread.
- **No WebAssembly or native code now.** WebAssembly's f64 matches JavaScript's (IEEE round to nearest; only NaN bit
  patterns are nondeterministic), but relaxed SIMD gives up cross-architecture determinism, and a native Electron
  addon risks fused multiply-adds (est., from clang's default contraction on ARM64). If ever: no relaxed SIMD, no
  fast-math, no native addon for the sim.

## 8. Cross-origin isolation, the fallback, Electron

- **Shared memory needs cross-origin isolation**: the page served with `Cross-Origin-Opener-Policy: same-origin` and
  `Cross-Origin-Embedder-Policy: require-corp` (Vite's dev and preview servers configured to send them), and
  `crossOriginIsolated` checked at startup.
- **The fallback** when it is false: the same slot protocol over transferred `ArrayBuffer`s (ping-pong: the worker
  transfers a filled slot, the main thread transfers the read one back). A transfer costs the same at any size.
- **Electron**: COOP/COEP added on the `protocol.handle` responses. Electron 41.0.0 stopped honouring them for cross-
  origin isolation (40.x worked; fixed by electron/electron PR #50789, issue #50242): pin a fixed version and assert
  `crossOriginIsolated` at startup. No `worker_threads` or native addons for the sim in Electron: the same Web Worker
  as the browser.
- COEP blocks cross-origin assets that do not opt in: everything the game loads is same-origin today; keep it so.

## 9. What stays on the CPU, and what was rejected

- **On the CPU, from the shared buffers**: picking (formations from their anchors), line of sight queries, the staff
  map (men from the soldier frame), the HUD. The worker owns the truth; the main thread reads.
- **Rejected: a full GPU soldier simulation** (UEBS-style, or the soldier steering in a vertex shader or transform
  feedback): `placeAtSlot` with transitions, lags and column trails, the separation pass and the trunk avoidance do not
  port well to shaders; the CPU would lose the positions it needs; Babylon has no compute shaders on WebGL2. Only the
  interpolation and the skinning move to the GPU.
- **Rejected for now: WebAssembly or native code** (§7); **rendering in a worker** (OffscreenCanvas: Babylon supports
  it since 4.1, but input and resize are forwarded by hand and WebGPU on OffscreenCanvas has reported failures): only
  if the main thread's own jank (DOM, garbage collection) is measured to matter (plan PR 6).

## 10. Unknowns to measure, not assume

- Babylon's own main-thread CPU per frame with 16,000 figures drawn.
- Whether macOS schedules the worker on efficiency cores: compare worker step times under load on the M1 Pro and the
  min-spec RTX 3060 laptop.
- Whether WebGL2 `bufferSubData` takes a `SharedArrayBuffer`-backed view in Chrome (else a copy into a private
  Float32Array: about 0.05 ms for 320 KB, est.).
- The best `MEN_HZ` (30 is an estimate) and the stagger that keeps the steering stable.
- Garbage collection: the `Man` objects (16,000 long-lived) and the per-frame temporaries; the SoA rewrite (plan
  PR 2) is expected to remove both (V8's young-generation scavenger still stops the world).

## Sources

- Total War optimisation blog: https://wiki.totalwar.com/w/Optimisation_Blog
- Three Kingdoms instancing (GDC, paywalled): https://gdcvault.com/play/1026177/Instancing-and-Order-Independent-Transparency
- Age of Empires IV, The MAW (GDC): https://gdcvault.com/play/1027610/The-MAW-Safely-Multithreading-the
- 1500 Archers on a 28.8 (Age of Empires networking): https://www.gamedeveloper.com/programming/1500-archers-on-a-28-8-network-programming-in-age-of-empires-and-beyond
- Planetary Annihilation, ChronoCam: https://forrestthewoods.com/the-tech-of-planetary-annihilation-chronocam/
- Ultimate Epic Battle Simulator 2 (developer posts): https://steamcommunity.com/app/1468720/discussions/0/3110267314129208740
- Is postMessage slow? (Surma): https://surma.dev/things/is-postmessage-slow/
- Cross-origin isolation guide: https://web.dev/cross-origin-isolation-guide/
- Babylon.js OffscreenCanvas: https://doc.babylonjs.com/features/featuresDeepDive/scene/offscreenCanvas
- WebGPU and OffscreenCanvas (Babylon forum): https://forum.babylonjs.com/t/babylon-webgpuengine-and-offscreencanvas-roadmap-for-support/47312
- Worker requestAnimationFrame (Chromium intent to ship): https://groups.google.com/a/chromium.org/g/blink-dev/c/hRZ_P2o-aEk/m/oPEmHWFLAwAJ
- WebAssembly f64 and nondeterminism: https://developer.mozilla.org/en-US/docs/WebAssembly/Reference/Value_types/f64, https://www.webassembly.org/docs/nondeterminism/
- Deterministic Wasm (relaxed SIMD): https://docs.wasmtime.dev/examples-deterministic-wasm-execution.html
- Electron cross-origin isolation regression: https://github.com/electron/electron/issues/50242
- V8 parallel scavenger and concurrent marking: https://v8.dev/blog/orinoco-parallel-scavenger, https://v8.dev/blog/concurrent-marking
