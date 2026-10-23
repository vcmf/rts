---
status: proposed
date: 2026-10-22
---

# 0050 32,000 soldiers at 120 fps: four steps, each kept only if measured

**Experimental**: if a step's measurement fails its bar, the step is reverted and this record says so (the owner,
2026-10-22). The plan, with the bars and the measurements, is `docs/plans/active/armies-32k.md`.

## Context

The owner asks whether the look page can hold about 32,000 soldiers (40 battalions a side) at 120 fps (8.33 ms; the
soft target of decision 0036, kept by 0045) on the dev Mac. Measured (Metal, the production build, 1080p, 20 a side,
p50 ms; the plan has the p95s): main without soldiers 6.05 / 9.55 / 8.70 at wide / default / close; with the armies
8.95 / 10.30 / 9.10 still and 8.40 / 10.55 / 10.10 panning. A traced pan's JavaScript is 9.10 ms at p50: the frame is
CPU- and submit-bound (step 1's bench corrected this: that time is the CPU waiting on GL and the GPU, and the wide
view is GPU vertex-bound). Main alone is already over budget at the default and close zooms. The figures' renderer
(`src/look/units.ts`, decision 0047) writes a matrix per man on the CPU at every 12 fps step; the far LOD is 243
triangles at every distance; the figures' shadow map is the costliest part at the widest zoom.

## Decision

We will raise the demo's cap to 40 a side (its layout adds close reserves only when a side would be short, so 20 a
side and fewer lay out as before) and then try four steps in this order, each in its own PR, each with a bar written
before it is built:

1. **GPU-placed soldiers**: one record per battalion uploaded, the vertex shader placing each man from his slot and
   his jitter; men out of formation (the sim's) in a per-man override buffer updated partially. **Reverted**
   (2026-10-23, built in `ae86faf`, reverted in `d11da23`): at 40 a side, panning, wide got 1.15 ms slower at the
   fight's middle (9.55 → 10.70 p50) and 1.45 at the stress point (12.65 → 14.10), default 0.25 to 0.45 slower,
   close 0.1 to 0.25; the bar asked for 1.0 / 0.5 / 0.5 faster. The per-man JavaScript and uploads it removed were
   already at most 0.04 ms a frame; the frame's CPU time near the frame time is waiting on GL and the GPU, and the wide
   view is GPU vertex-bound, so the extra fetches and trigonometry a vertex cost more than they saved. The override
   buffer stays a design note for decision 0048 (the plan's step 1).
2. **Simple shadows beyond close zoom** (issue #131, its own decision): measured here at 40 a side.
3. **A third, tiny LOD** (20 to 40 triangles or a card) for figures a few pixels tall. **Kept by the owner's
   judgement** (2026-10-23): built as boxes on the figure's parts (112 vertices against the far LOD's 616), wide 1.4 to
   2.35 ms faster and its p95 spikes gone, default and close within ±0.3 ms; the readability guard's 10 % bar is not
   met (the white side −17 % luma, its coat share 27 → 11 %), and the owner judged the look acceptable ("more neat",
   the formations will not stay in perfect shape). Per-man variety was tried and dropped (the plan's step 3). It
   confirms the wide view is vertex-bound; the far LOD with shared vertices (371, measured) waits as the next option.
   Later LOD steps add the owner's check of the look at a wide crop to their bars. Recalibrated by itself on the
   rebaked figure (decision 0051's close-zoom PR, 2026-10-23): the guard's white side −19 % luma at the widest zoom,
   the blue side within 10 %; with decision 0049's simple shadows each tiny man keeps his own.
4. **The ground-colour cache** for the landscape (est. 2 to 2.7 ms at default and close, not measured; corrected
   2026-10-23 to about 2.3 at default and 1.1 at close at most, after the road split took 1.1 of the same work: the
   plan's step 4, designed, not built).

A step is kept only if its bar holds (Metal, the production build, three interleaved rounds against main); else it is
reverted and this record lists it as reverted with its numbers. No step changes the simulation (decisions 0005,
0006, 0013) or names an era's unit (decision 0015).

## Consequences

- The page shows 33,120 figures at `?armies=40`; the bench measures 20 and 40 a side against main the same way.
- Step 1, reverted: the figures are still placed by the CPU; its measurement shows the wide view GPU vertex-bound, so
  step 3 (fewer vertices for small figures) is the main lever there. Decision 0048's soldier frame keeps its per-man
  publish; the plan keeps the override buffer's design should a battalion record ever be used.
- Step 3 adds a third LOD switch, with its pop to tune and the readability guard to keep.
- Step 4 is a change to the landscape, not the soldiers: it gets its own plan and may re-baseline the goldens.
- The goal may not be met: the plan's arithmetic (est.) needs step 4 and most of steps 1 to 3 at the default zoom. The
  record then says by how much it falls short per camera.

## Alternatives considered

- **Render in a worker** (OffscreenCanvas): moves the frame's JavaScript off the main thread but not its cost; decision
  0048 keeps it as a later, measured option.
- **WebGPU** (compute culling and placement, indirect draws): the likely end state for draw submission, but decision
  0046 makes WebGL2 the minimum and Babylon's WebGPU path is a port; not now.
- **Fewer figures drawn** (a battalion as one impostor at the widest zoom): cheapest, but the art bible's armies are
  men, not blocks; kept as the fallback if step 3 fails.
- **A lower render scale**: the frame was thought CPU-bound (step 1's bench showed the wide view vertex-bound, not
  pixel-bound), so fewer pixels save little (decision 0045 already sets it by
  zoom).
