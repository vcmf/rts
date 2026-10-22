---
status: active
last_reviewed: 2026-10-22
---

# Plan: 32,000 soldiers at 120 fps

**Experimental.** Asked by the owner on 2026-10-22: can the look page hold about 32,000 soldiers (40 battalions a
side) at 120 fps, 8.33 ms a frame, on the dev Mac? Decision 0050 (proposed) adopts the order of the steps below and
their rule: **if a step's measurement fails its bar, the step is reverted and the plan and the decision say so.** It
builds on the armies demo (`docs/plans/active/armies-demo.md`, decision 0047, `docs/systems/look.md`, "The armies")
and must stay compatible with the battle's threads (decision 0048 and its plan, PR #128, not yet merged) and with the
simple shadows in progress (issue #131).

## Problem, measured

The coordinator's runs (Metal, the production build, 1080p, `?benchat=162.5,-2.5`, 20 a side = 16,560 figures;
p50 / p95 ms):

| Camera | main, no soldiers | the armies, still | the armies, panning |
|---|---|---|---|
| wide | 6.05 / 6.90 | 8.95 / 10.70 | 8.40 / 9.90 |
| default | 9.55 / 11.20 | 10.30 / 11.45 | 10.55 / 11.90 |
| close | 8.70 / 9.40 | 9.10 / 10.40 | 10.10 / 11.50 |

- A traced pan (`?benchtrace=1`) records the frame's JavaScript at p50 9.10 ms, p95 11.50 ms: JavaScript and GL
  submission take about the whole frame. **The frame is CPU- and submit-bound**, not GPU-bound.
- Earlier scaling (older code, before the shadow fix; p50 wide / default / close ms): main 6.65 / 9.33 / 8.80; 5 a side
  8.68 / 10.82 / 10.87, 10 a side 9.48 / 11.30 / 11.30, 20 a side 11.33 / 12.63 / 12.53; without the figures' shadows
  7.47 / 9.73 / 9.35, 7.78 / 9.73 / 9.32, 8.47 / 9.87 / 9.43. So the shadows cost the most and grew with the count;
  without them the soldiers cost about 1 ms at wide at 20 a side.
- **Main alone is already over 8.33 ms at the default and close zooms** (9.55 and 8.70): the soldiers are not the only
  gap; the landscape's frame must shrink too (step 4).

## Scope

In: the 40-a-side baseline (the page's cap and the layout), then four steps, each measured against its bar and kept or
reverted: GPU-placed soldiers, the simple shadows (issue #131, its own PR), a third, tiny LOD, the ground-colour cache.
Out: the sim driving the armies (decision 0048's PR 4), the laptop (measured when available), smoke, casualties as
art, other arms.

## How everything is measured

- **Metal, the production build** (`npm run build`, `npx vite preview`), 1080p, `node tools/bench-look.mjs <url>
  out.json --gpu metal`, `?benchat=162.5,-2.5` (the fight's middle at 20 and at 40 a side: the lines are the same),
  still and `?benchpan=1`. **Three interleaved rounds** (main, the branch at 20, the branch at 40, then again), the
  median of the three rounds' p50 and p95 per camera. Never while another bench runs on the GPU.
- **The CPU's share** from a separate traced run (`?benchtrace=1`: `cpuMs`, place()'s and the uploads' ms); timings
  come from untraced runs only.
- **No visible change** means: a contact sheet (wide, default, close; `?frozen` and two later fixed times) from
  `tools/shot.mjs` on Metal, before and after, compared side by side by eye and by `tools/golden.mjs`'s diff, and the
  readability guard (`node tools/guard.mjs <url?armies=40> --figures`) within 10 % of before on its luma contrast and
  coat share.
- Every number below is labelled **measured** (with its run) or **est.** (an estimate, to be replaced by a measurement).

## Step 0: the baseline at 40 a side (built)

- **Scope**: `?armies` up to 40 (`src/look/main.ts`); the layout (`src/look/world/armies.ts`, `layout`) fields 40 a
  side on the demo map. Today's lines and reserves could not: room for 33 of 40 on the south side (the river and the
  south-west wood). When the reserves leave a side short, **close reserves** fill in: more columns of companies on a
  2.5 m grid, 6 m apart men to men, a line's footprint taken as its shape (a T: its ranks' full width, its approach only
  as wide as its column), so they stand behind a line's flanks, never ahead of a line they overlap across; still at
  least 40 m behind the front and within the play area (±235 m). At 20 a side and fewer the layout is unchanged (the
  close reserves never run there: `test/armies.test.ts` hashes the layouts for 1 to 20 on three grounds, the demo
  map's among them, against the code before this plan). Measured on the page (SwiftShader): 40 a side lay out, 4 and 3
  battalions in line, 73 in column, **33,120 figures**; the 0.5 m sample of the demo map's blocked ground
  (`test/fixtures/demo-map-blocked.bin.gz`) holds 44 a side.
- **Bar**: none; it is the reference. It records p50 / p95 for wide, default and close, still and panning, at 20 and
  40 a side against main, and a traced pan's `cpuMs` at 40.
- **Expectation** (est.): from 5 → 10 → 20 a side the older code grew about +0.8, then +1.85 ms at wide; at 40 about
  +2 to +4 ms more at wide over 20, so about 11 to 13 ms wide. If the trace's `cpuMs` grows with the count, the CPU's
  per-man work dominates (step 1); if it stays and the frame grows, the GPU's triangles do (step 3).
- **Measured** (2026-10-22, Metal, production builds, `benchat=162.5,-2.5`, three interleaved rounds, all 18 runs exit
  0; medians of p50 / p95, ms):

  | Run | Wide | Default | Close |
  |---|---|---|---|
  | main, still | 6.05 / 7.50 | 8.75 / 10.00 | 8.50 / 9.80 |
  | main, pan | 6.05 / 7.45 | 8.80 / 10.10 | 8.50 / 9.85 |
  | 20 a side, still | 8.85 / 10.40 | 10.15 / 11.50 | 9.80 / 10.95 |
  | 20 a side, pan | 8.85 / 10.10 | 10.25 / 11.60 | 9.70 / 10.35 |
  | 40 a side, still | 9.75 / 11.45 | 11.00 / 11.65 | 9.75 / 10.80 |
  | 40 a side, pan | 9.70 / 11.55 | 10.20 / 11.60 | 9.70 / 10.25 |

  The expectation was wrong: 40 a side costs only about +0.9 ms over 20 at wide, +0.85 / 0 at default (still / pan)
  and nothing at close. Over main, 40 a side costs +3.7 wide, +1.4 to 2.25 default, +1.2 close. The bench's wide camera
  at this point draws 13,248 of the 33,120 figures (the rest are culled), so the cost of the whole army in view is not
  yet measured: a camera framing every battalion is the stress case still to bench. The traced pan's `cpuMs` at 40 is
  still to run. Main's default here is 8.75, not the 9.55 of the earlier round (a cooler machine: the protocol's three
  rounds per arm are what compare).
- **The stress point** (measured 2026-10-23): no allowed camera frames the whole army. Probing the widest camera
  (rMax, betaMax) on a 5 × 5 grid of focus points, the most figures drawn is **24,012 of 33,120** at (62.5, −102.5)
  (13,248 at the fight's middle). Three rounds there, all exit 0 (p50 / p95, ms):

  | Run | Wide | Default | Close |
  |---|---|---|---|
  | main, still | 6.85 / 7.50 | 8.40 / 8.80 | 8.30 / 8.75 |
  | 40 a side, still | 12.60 / 23.75 | 10.45 / 11.55 | 8.65 / 10.05 |
  | 40 a side, pan | 12.75 / 14.15 | 10.05 / 11.50 | 9.10 / 10.10 |

  24,012 far figures in view cost **+5.8 ms at wide**, with spikes (p95 23.75 still). This is the goal's hard case;
  the bars of steps 1 and 3 are judged here as well as at the fight's middle (`benchat=62.5,-102.5`).
- **The trace at 40** (pan, fight's middle): `cpuMs` is about the whole frame (8–10 ms a frame), the frame waits on
  JavaScript and GL submission. The frames that place men and upload their buffers (`placed`, `tiUploads`, 12 a
  second) run 1.4 ms slower at wide (9.48 against 8.07) and 0.6 at close; the frames that redraw the shadow map
  (`sm`) 1.0 ms slower at wide and 0.4–0.7 at default. So step 1 (placement and uploads) and the shadow redraws
  (step 2) are where the trace points.

## Step 1: GPU-placed soldiers

- **Today**: for every man of a moving battalion the CPU computes his place (`manAt`) and writes a 16-float matrix and
  his clip's settings, once a 1/12 s step, then uploads every LOD's buffers (`src/look/units.ts`, `place()`): at
  16,560 men about 1 MB of matrices a step; at 33,120 about 2 MB (est.: 64 B a man, the moving share of them).
- **The change**: in formation a man's place is his battalion's transform plus his slot (in line or in column, from
  `slots()`, the same for every battalion of a drill) plus his fixed jitter. Upload **one record per battalion** (its
  place, heading, phase, the phase's start and the deployment's progress: tens of bytes; KB for all), keep the slots
  and each man's jitter in static textures written once, and let the vertex shader place each man (the script's moves
  are lines between the column and line slots at a known speed: the same arithmetic as `manAt`, in float32, render
  only). The CPU's per-man loop and the per-man uploads go; the trodden mask, which reads every man's place, takes
  the same formula on the CPU at its own 0.25 s rate or reads it per battalion.
- **The sim** (when it drives the armies): men leave their slots (stragglers, skirmishers, the fallen, a disordered
  battalion). A per-man **override buffer** carries those men only: a flag and a place, uploaded partially
  (`bufferSubData` of the changed ranges). A man on the override reads it; the rest are placed from the battalion. The
  sim stays unchanged and render-only arithmetic stays out of it (decisions 0005, 0006).
- **Decision 0048**: the worker keeps the sim and the soldier layer; with this step the frame it publishes can shrink
  to a battalion record plus the off-slot men, and the render half of the worker's per-man publish (16 B a man in
  0048's design) shrinks to the overrides. Whether the soldier layer's steering keeps men exactly on their slots
  closely enough to use the formula is 0048's PR 4's question; this step does not depend on it.
- **Bar**: **kept if**, at 40 a side, panning, the wide camera's p50 falls by **≥ 1.0 ms**, the default's and close's
  by ≥ 0.5 ms, no camera's p95 is worse by more than 0.2 ms, the traced `place()` and upload time falls by ≥ 70 %, and
  the contact sheet shows no visible change. **Else reverted.** (The saving is est.: the CPU writing and uploading
  about 2 MB a step, 12 times a second, against a few KB.)

## Step 2: the simple shadows beyond close zoom (issue #131)

- Built separately (issue #131, the decision it proposes, number 0049): beyond the close zoom the figures' shadow map
  gives way to a cheaper shadow. This plan does not change it; it measures it at 40 a side.
- **Expected** (from measurements of older code, not of #131): the figures' shadows cost about 0.3 to 0.65 ms at 20 a
  side after the shadow fix (batch C's run) and 1.4 to 3.9 ms before it; at 40 a side the casters double (est.: 0.6 to
  1.3 ms).
- **Bar** (here): **kept at 40 a side if** it saves ≥ 0.5 ms p50 at wide and default, panning, with no visible change
  beyond what #131's own review accepts. Else #131's own outcome stands and this plan says so.

## Step 3: a third, tiny LOD

- **Today**: the far LOD is 243 triangles; at the widest zoom nearly every figure is a few pixels tall (the LOD switch
  is at 48 px). At 40 a side about 33,000 × 243 ≈ 8 million triangles a frame at wide (est.), plus the proxy's 56 a
  caster in the shadow map.
- **The change**: a third LOD for figures under about 12 px tall (the switch's value to be tuned by eye): 20 to 40
  triangles (a few boxes on the bones, posed from the baked animation as the far LOD is) or a camera-facing card from
  an impostor atlas; its colours by role so the far palette and the flags still read.
- **Bar**: **kept if**, at 40 a side, the wide camera's p50 falls by **≥ 0.5 ms** still and panning, the default's is
  no worse, the readability guard's figures' contrast and coat share at the widest zoom stay within 10 %, and the
  contact sheet at wide shows no visible change at 100 %. **Else reverted.** The frame is submit-bound, so a triangle
  cut may save little: the measurement decides.

## Step 4: the ground-colour cache

- **Why**: main alone is 9.55 / 8.70 ms at default / close (measured, above): the landscape needs at least 1.2 ms off
  at default for 120 fps even with free soldiers.
- **The change**: the ground's painted colour (its many texture reads in `painter.glsl`) cached in a texture around the
  view and refreshed as the view moves, the ground's fragment stage reading it instead. **Est. 2 to 2.7 ms** at default
  and close (an earlier estimate, not measured). It gets its own plan when started.
- **Bar**: **kept if** main (no soldiers) falls by **≥ 1.5 ms** p50 at default and close, still and panning, with the
  goldens (`tools/golden.mjs`) and the look checks passing or re-baselined by a decision. **Else reverted.**

## The goal and how close it is

- **The goal**: at 40 a side, every camera's **p50 ≤ 8.33 ms** still and panning (it averages 120 fps); a **p95
  ≤ 8.33 ms** holds it.
- **The arithmetic** (est., to be replaced by the measurements): at default main is 9.55; step 4 takes off 2 to 2.7
  (6.9 to 7.6 left), leaving 0.7 to 1.4 ms for 33,000 soldiers. At 20 a side they cost 0.75 ms still at default today
  (10.30 against 9.55); at 40 about twice that before steps 1 to 3 (est.). So the goal needs step 4 and most of steps 1
  to 3; wide has the most room (main 6.05) and default the least.
- If, after every step that holds its bar, the goal is not met, the plan says by how much per camera and stops; the
  next options are in decision 0050's alternatives.

## Acceptance (this plan's first PR: step 0 and the documents)

- `?armies=40` lays out 40 a side on the demo map within ±235 m (33,120 figures); 20 a side and fewer unchanged (the
  hashes); `npm test` passes; `node tools/check-docs.mjs` passes.
- A SwiftShader wide view of 40 a side reviewed (`output/armies-review/8-armies-32k/`, not committed).
- The bench script ready (main, 20 and 40 a side, still and panning, three rounds); the baseline table above filled
  with the 40-a-side run when the GPU is free.

## Open questions

- Whether 2 MB a step of thin-instance uploads (est.) or the per-man JavaScript is the larger CPU share at 40 a side:
  the trace at 40 answers it, and step 1's bar uses it.
- The close reserves stand 6 m apart: closer than the reserves at 20 a side (10 m); the owner's eye on the wide view.
- The near meadow and the trees' crowns over the reserves (bushes are walked through, as at 20 a side).
