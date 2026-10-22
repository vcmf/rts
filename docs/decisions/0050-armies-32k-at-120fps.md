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
CPU- and submit-bound. Main alone is already over budget at the default and close zooms. The figures' renderer
(`src/look/units.ts`, decision 0047) writes a matrix per man on the CPU at every 12 fps step; the far LOD is 243
triangles at every distance; the figures' shadow map is the costliest part at the widest zoom.

## Decision

We will raise the demo's cap to 40 a side (its layout adds close reserves only when a side would be short, so 20 a
side and fewer lay out as before) and then try four steps in this order, each in its own PR, each with a bar written
before it is built:

1. **GPU-placed soldiers**: one record per battalion uploaded, the vertex shader placing each man from his slot and
   his jitter; men out of formation (the sim's) in a per-man override buffer updated partially.
2. **Simple shadows beyond close zoom** (issue #131, its own decision): measured here at 40 a side.
3. **A third, tiny LOD** (20 to 40 triangles or a card) for figures a few pixels tall.
4. **The ground-colour cache** for the landscape (est. 2 to 2.7 ms at default and close, not measured).

A step is kept only if its bar holds (Metal, the production build, three interleaved rounds against main); else it is
reverted and this record lists it as reverted with its numbers. No step changes the simulation (decisions 0005,
0006, 0013) or names an era's unit (decision 0015).

## Consequences

- The page shows 33,120 figures at `?armies=40`; the bench measures 20 and 40 a side against main the same way.
- Step 1 moves the figures' placement into the shader: the trodden mask and anything else that reads a man's place on
  the CPU must use the same formula (or the battalion's record), and decision 0048's soldier frame can shrink to a
  battalion record plus the men off their slots.
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
- **A lower render scale**: the frame is CPU-bound, so fewer pixels save little (decision 0045 already sets it by
  zoom).
