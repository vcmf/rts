---
status: draft
last_reviewed: 2026-10-22
---

# The battle's threads: a worker, soldiers stepped at 12 fps

**Experimental.** Decision 0048 (proposed) adopts this design; the plan is `docs/plans/active/battle-threads.md`. If
the plan's measurements fail, the decision is rejected and this design thrown away (the owner, 2026-10-22). It
refines `docs/proposals/sim-design.md` §16 (the worker and the snapshot); where they differ, this proposal says why.

## 1. The problem, measured

The frame budget at the soft target of 120 fps (decision 0036) is 8.33 ms, and the main thread also draws. Figures on
the dev Mac (M1 Pro), release build of the world, 40 battalions of 400 (`docs/plans/active/s1c5-cost.md` after its
optimisations, `docs/plans/active/s1d1-unit-types.md`):

- **The soldier layer's step** (`src/render/soldiers.ts`, `SoldierLayer.step`: each man steered to his slot, the
  separation grid, the trunks): **4.2–5.4 ms**, changing shape to marching. It is paid at least once per displayed
  frame: the sim page (`src/app/main.ts`) steps it `ceil(dt·speed / MEN_DT)` times a frame (`MEN_DT = 0.2 s` is only
  the longest step, `MEN_STEPS = 4` the most), so its cost grows with the frame rate.
- **The sim's tick** (`advanceTick`, 20 Hz): **0.6–1.8 ms** (about 2.0 ms under vitest, against `TICK_BUDGET = 3` in
  `test/formations.test.ts`).
- **Marching, sim and layer together**: about **4.5 ms per 1/60 s frame** (issue #36 tracks this combined per-frame
  cost, not a per-tick one).
- **The state hash** (every 20 ticks): **2.7–4.1 ms** (issue #38), landing whole in one frame: **the biggest single-frame
  hitch**, more than a tick.
- **The 3D armies** (`src/look/units.ts`): every man of a moving battalion has its 16-float
  matrix written on the CPU at 12 Hz; the 3D page does not run the sim yet (its moves are scripted). When it does, the
  costs above join the renderer's on one thread.

So at 120 fps the main thread spends about 4.5 ms of every frame on the men and the sim, plus a 2.7–4.1 ms hash every
second: with the renderer it cannot hold 8.33 ms at the 99th percentile.

## 2. What the industry does (sources at the end)

- **Separate the game's logic from the render's work.** Total War: Warhammer split "game draw" (logic, AI, object
  tracking) and graphics onto separate threads (their optimisation blog). Age of Empires IV multithreaded its sim
  while keeping it deterministic, with tools that check it gives the same result on one core or many (GDC, The MAW).
- **Tick slowly, draw fast.** Planetary Annihilation (and Supreme Commander) tick at 10 Hz while clients draw at 60
  (ChronoCam). Age of Empires sent commands, never unit state, in lockstep (1500 Archers).
- **A full GPU simulation** (Ultimate Epic Battle Simulator 2: every unit's AI on the GPU) leaves no CPU-readable
  state: no picking, line of sight, staff map or replays. Rejected for us (§9).

## 3. The threads

```
 main thread (display rate)                      battle worker
 ───────────────────────────                     ─────────────────────────────────────────────
 input, HUD, DOM                                 sim: advanceTick at 20 Hz of game time
 commands ─────── postMessage (a few 100 B) ───▶   (the speed's multiple, capped: §4), command log,
 Babylon render, staff map                         stamping, the state hash (§7)
   reads, never writes:                          soldier layer: a step at 12 Hz of real time,
   ◀── soldier frame   (SharedArrayBuffer, ──────   battalions staggered over the step
   ◀── world mirror + event ring ────────────────  per tick: the World's arrays mirrored
 picking, line of sight queries, staff map,       publishes with Atomics
   HUD: a read-only World view on the mirror
```

- **The main thread never ticks** and never steps the men: per frame it reads the latest published soldier frame (one
  `Atomics.load` of a slot index), uploads the battalions that moved when a new step was published, and draws.
- **One battle worker** at first: the sim and the soldier layer together, because the layer reads the live `World`
  (`w.f.*`, `placesCtx`) as it does today.
- **Later, only if measured** (plan PR 5): a separate soldier worker fed by the per-tick mirror.

## 4. The stepped soldiers: 12 fps, and the speed

**The owner's decision (2026-10-22), per the art bible** (`docs/art-bible.md`: "Units animated at 12 fps, with the
camera always smooth"): **soldiers move stepped at 12 fps, poses and positions together**, with no display-rate
interpolation. So the soldier layer steps at `MEN_HZ = 12`, tied to the figures' bake rate (the animation baked at
12 fps by the figure bake), and the renderer draws the latest published step as is. The camera
stays smooth (it is the main thread's, at display rate).

- **The rate is per real second**, not per game second: at 8× speed a fixed rate per game second would multiply the
  steps by 8. The layer takes at most one step per 1/12 s of real time; at speeds above 1× each step covers more game
  time (a larger dt, as `main.ts` does today with `MEN_DT` and `MEN_STEPS`: the layer catches up with longer steps,
  its existing cap on a step's length kept). **Paused** (speed 0): no steps.
- **Staggered**: the 40 battalions are split into four groups; each 1/12 s real-time step is done as four sub-steps a
  1/48 s apart, one group each, each covering its group's 1/12 s. Per sub-step the work is a quarter of a full step:
  at 16,000 men about 4.2–5.4 / 4 ≈ **1.1–1.4 ms** (est.), 48 times a second in the worker; on the main thread
  nothing. The published frame is the latest full set (each battalion at most 1/12 s behind its last step). Average
  and peak per sub-step are both a quarter; without the stagger the peak is the full 4.2–5.4 ms twelve times a second.
- **The tick** runs at 20 Hz of game time, its count per real second the speed's multiple (capped: at most 20 ticks
  per real frame as `main.ts` caps today; a busy worker falls behind rather than spiralling).

## 5. The shared buffers

All in `SharedArrayBuffer`s (cross-origin isolation, §8); sizes at 16,000 men (est.).

- **The soldier frame**: per man, at a **stable index for the battle** (assigned when the man is placed, never
  compacted): `x, z, yaw` (Float32), `y` (the ground's height, filled by the worker which has the terrain), and a state
  word (Uint32: alive or fallen, the clip and its phase start for decision 0037, the formation index). **The fallen
  stay** (a state bit; the staff map draws crosses as `map.ts` does today). Yaw is stored, not interpolated (no ±π wrap
  issue now; one would arise if smoothing were ever added). About 20 B a man, **320 KB a slot**, plus a battalion
  table (first man, count, moved this step).
- **The slot protocol** (three slots, exactly): an Int32 header holds `latest` (the newest complete slot, written by
  the worker), `held` (the slot the reader is using, written by the reader) and `seq` (the step number). The worker
  writes into the one slot that is neither `latest` nor `held`, then `Atomics.store(latest, that)` and increments
  `seq`. The reader, at frame start: `s = Atomics.load(latest)`; `Atomics.store(held, s)`; then re-reads `latest`: if it
  changed meanwhile it may use either (both are complete and neither is being written, since the writer avoids `held`
  and `latest`). The reader holds one slot for the whole frame; the main thread never calls `Atomics.wait`.
- **The world mirror**: per tick, the worker copies the `World`'s typed arrays (the formation table `w.f.*`, `w.meta`
  incl. `M_TICK`) into a shared mirror (three slots, the same protocol), about 1.5 MB: **0.1–0.2 ms a copy** (est.;
  "snapshots are a buffer copy", `docs/architecture.md`). The main thread builds a **read-only `World` view** over it,
  so `map.ts`, the HUD, `issue`'s validation and `formationHandle` keep working unchanged. What they read today:
  `layer.place`, `layer.frame`, the anchors, `placesCtx`, each man's slot (`m.s`), `w.f.*` (incl. `foe`, `chPhase`,
  `blownUntil`), `w.meta[M_TICK]`, and the dropped orders (`r.dropped`, now in the event ring).
- **The event ring**: volleys, departures, casualties, morale breaks, dropped orders since the last read, with a write
  index (no events lost when a frame is long: the risk §16's review raised).

## 6. The tick and the frame

- **The soldiers**: the renderer draws the latest published frame as is, stepped at 12 fps. Per frame: one slot read;
  the upload only when a new step was published, and only for the battalions that moved (the battalion table's flag).
- **The upload**: 16 B a man (`x, y, z, yaw`; the pose from the state word) for moving battalions, 12 times a second:
  at 16,000 men all moving about **3 MB/s** (est.), against today's 64 B a man (a 16-float matrix) × 12 Hz ≈ 12 MB/s:
  **about 4× less**.
- **The formation anchors** (if the HUD or the staff map still interpolates them between ticks, as today): the worker
  publishes a **game-time clock** in the mirror's header: the tick, and the wall time of that tick in
  `performance.timeOrigin + performance.now()` milliseconds (the same epoch in the worker and the main thread), plus
  the speed; alpha = (now − tick time) · speed / tick length, clamped to [0, 1].
- **Commands**: `issue()` on the main thread becomes a `postMessage` of the command; the worker validates, stamps it
  with the tick it applies on (`docs/proposals/sim-design.md` §16), logs it; `formationHandle` and selection read the
  mirror. A replay is the stamped command log, as today.

## 7. The state hash

The hash (2.7–4.1 ms every 20 ticks, issue #38) is the biggest single-frame hitch today. It **moves to the worker**
with the sim, off the main thread's frames entirely. In the worker it still delays one tick's soldier sub-steps;
the plan measures whether to amortise it (hash a share of the arrays each tick, combining over 20 ticks) or compute it
incrementally (hash only what a tick changed), keeping the same digest definition for replays.

## 8. Determinism, cross-origin isolation, Electron

- **The sim's code and ruleset are unchanged**; only commands cross into the worker. Restricted float64
  (decision 0006) holds in any JavaScript realm; replays match across browsers (decision 0013) for the same reason
  they do now. **The soldier layer stays cosmetic** (its own RNG, never written back), so its rate and thread are free.
- **Tests**: the headless tests keep importing `src/sim` directly; the worker is tested in Node with `worker_threads`
  (the same `SharedArrayBuffer` and `Atomics` API). There is no browser replay harness today: plan PR 3 adds one (a
  headless Chrome replay comparing the hashes in the worker and on the main thread; Firefox later, as sim-design's S2
  lists).
- **No WebAssembly or native code now.** WebAssembly's f64 matches JavaScript's (only NaN bit patterns differ), but
  relaxed SIMD gives up cross-architecture determinism, and a native Electron addon risks fused multiply-adds (est.).
- **Shared memory needs cross-origin isolation**: `Cross-Origin-Opener-Policy: same-origin` and
  `Cross-Origin-Embedder-Policy: require-corp` on the pages (Vite's dev and preview servers configured to send them),
  `crossOriginIsolated` checked at startup. **The fallback** when it is false: the same slots by transferred
  `ArrayBuffer`s (ping-pong). COEP blocks cross-origin assets that do not opt in: the game's are same-origin; keep it so.
- **Electron**: COOP/COEP on the `protocol.handle` responses; 41.0.0 stopped honouring them (issue
  electron/electron#50242, fixed by PR #50789): pin a fixed version, assert `crossOriginIsolated` at startup; the same
  Web Worker as the browser, no `worker_threads` or native addons for the sim.

## 9. What stays on the CPU, and what was rejected

- **On the CPU, from the shared buffers**: picking, line of sight queries, the staff map, the HUD.
- **Rejected by the owner: soldiers' positions smoothed at display rate** (interpolating each man between steps, with
  `prev`/`cur` attributes and an alpha): the art bible steps units at 12 fps; positions and poses step together.
- **Rejected: a full GPU soldier simulation** (UEBS-style, or the steering in shaders or transform feedback): the
  steering does not port to shaders; the CPU would lose the positions it needs; no compute shaders in WebGL2.
- **Rejected for now: WebAssembly or native code** (§8); **rendering in a worker** (OffscreenCanvas: input and resize
  forwarded by hand, reported WebGPU issues): only if main-thread jank is measured to matter (plan PR 6).

## 10. Unknowns to measure, not assume

- Babylon's own main-thread CPU per frame with 16,000 figures drawn.
- Whether macOS schedules the worker on efficiency cores (the M1 Pro and the min-spec laptop under load).
- Whether WebGL2 `bufferSubData` takes a `SharedArrayBuffer`-backed view in Chrome (else a copy, about 0.05 ms for
  320 KB, est.).
- The hash's best form in the worker (amortised or incremental, §7).
- Garbage collection from the `Man` objects and per-frame temporaries (plan PR 2).

## Sources

- Total War optimisation blog: https://wiki.totalwar.com/w/Optimisation_Blog
- Age of Empires IV, The MAW (GDC): https://gdcvault.com/play/1027610/The-MAW-Safely-Multithreading-the
- 1500 Archers on a 28.8: https://www.gamedeveloper.com/programming/1500-archers-on-a-28-8-network-programming-in-age-of-empires-and-beyond
- Planetary Annihilation, ChronoCam: https://forrestthewoods.com/the-tech-of-planetary-annihilation-chronocam/
- Ultimate Epic Battle Simulator 2 (developer posts): https://steamcommunity.com/app/1468720/discussions/0/3110267314129208740
- Is postMessage slow? (Surma): https://surma.dev/things/is-postmessage-slow/
- Cross-origin isolation guide: https://web.dev/cross-origin-isolation-guide/
- Babylon.js OffscreenCanvas: https://doc.babylonjs.com/features/featuresDeepDive/scene/offscreenCanvas
- WebAssembly f64 and nondeterminism: https://developer.mozilla.org/en-US/docs/WebAssembly/Reference/Value_types/f64, https://www.webassembly.org/docs/nondeterminism/
- Deterministic Wasm (relaxed SIMD): https://docs.wasmtime.dev/examples-deterministic-wasm-execution.html
- Electron cross-origin isolation regression: https://github.com/electron/electron/issues/50242
- V8 parallel scavenger and concurrent marking: https://v8.dev/blog/orinoco-parallel-scavenger, https://v8.dev/blog/concurrent-marking
