---
status: active
last_reviewed: 2026-10-23
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
  submission take about the whole frame. ~~The frame is CPU- and submit-bound~~ (corrected by step 1: the CPU waits on GL and the GPU; the wide view is GPU vertex-bound).
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
- **The trace at 40** (pan, fight's middle): `cpuMs` is about the whole frame (8–10 ms a frame). The frames that place
  men and upload their buffers (`placed`, `tiUploads`, 12 a second) run 1.4 ms slower at wide (9.48 against 8.07)
  and 0.6 at close, but placement is not their cost: place() and its uploads take 0.004 / 0.035 / 0.024 ms and 0.001 /
  0.003 / 0.011 ms a frame (wide / default / close), and the placing frames are the frames that redraw the shadow map
  (`sm`, 1.0 ms slower at wide and 0.4–0.7 at default: the map is redrawn when men move). Corrected after step 1's
  bench: `cpuMs` near the frame time is the main thread waiting on GL and the GPU, not JavaScript work (the units' own
  `frame()` is about 0.1 ms a frame); the wide view is bound by the GPU's vertex work.

## Step 1: GPU-placed soldiers

(The design as planned; the outcome, reverted, is below.)

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

- **Built** (2026-10-23, commit `ae86faf`, reverted by `d11da23`): each man's instance matrix held his static record
  (his slots in line and column, his jitter, his fire lag, his battalion), each battalion a record of four RGBA32F
  texels in one texture (place, heading, phase, the phase's start, local time, each role's clip offset reduced in double
  precision, the cycle start's fraction of a step), the ground an R32F texture of the heightfield's nodes; the vertex
  shader did `manAt`'s arithmetic in float32 for the figures, the casters and the proxy (4 vertex textures at most).
  The CPU kept the bounds, the LOD's centre, the flag's bearer and the trodden mask's men. `?gpuplace=0` restored the
  CPU's path.
- **No visible change** (SwiftShader contact sheet, 12, 35 and 80 s, wide / default / close at both points and close
  on two battalions in line; `output/armies-review/9-gpu-placed/`, not committed): the same poses, at most 0.17 % of
  pixels over 8 / 255, single edge pixels (float32 against float64 placement).
- **Measured** (2026-10-23, Metal, the production build, 40 a side, three interleaved rounds, all 28 runs exit 0;
  medians of p50 / p95, ms; `gp0` the CPU's placement, `gp1` the GPU's):

  | Run | Wide | Default | Close |
  |---|---|---|---|
  | middle, gp0, pan | 9.55 / 11.45 | 10.20 / 11.65 | 9.70 / 10.20 |
  | middle, gp1, pan | 10.70 / 12.80 | 10.65 / 11.70 | 9.80 / 10.30 |
  | middle, gp0, still | 9.85 / 11.40 | 10.90 / 11.70 | 9.75 / 10.90 |
  | middle, gp1, still | 10.65 / 12.15 | 11.10 / 11.75 | 9.70 / 10.60 |
  | stress, gp0, pan | 12.65 / 14.40 | 10.05 / 11.55 | 8.95 / 10.10 |
  | stress, gp1, pan | 14.10 / 17.85 | 10.30 / 11.60 | 9.20 / 10.10 |
  | stress, gp0, still | 12.60 / 24.15 | 10.45 / 11.50 | 8.60 / 10.00 |
  | stress, gp1, still | 15.20 / 16.85 | 10.90 / 11.65 | 8.65 / 10.00 |

  Traced pans (per-frame means, wide / default / close): place() + uploads 0.004 / 0.041 / 0.031 → 0.002 / 0.009 /
  0.007 ms at the middle (−50 to −78 %), uploads 4.5 / 29.9 / 28.0 → 0.4 / 1.2 / 1.0 KB; the units' `frame()` about
  0.10–0.14 ms in both; `cpuMs` p50 9.6 / 10.0 / 9.5 → 10.1 / 10.4 / 9.5 at the middle, 12.1 / 9.8 / 8.6 → 13.65 /
  10.7 / 8.9 at the stress point.
- **Verdict: reverted, failed its bar.** Panning, wide got slower by 1.15 ms at the middle and 1.45 at the stress
  point (the bar asked for 1.0 faster), default 0.45 and 0.25 slower, close 0.1 and 0.25 slower; wide's p95 worse by
  1.35 and 3.45 ms. Only the trace's cut held, and not by 70 % everywhere.
- **The finding**: the per-man JavaScript and uploads were never the cost (≤ 0.04 ms a frame: only the 7 battalions in
  line move; the 73 reserves are written once a phase). `cpuMs` ≈ the frame time is the CPU waiting on GL and the GPU,
  not JavaScript; the wide view is **GPU vertex-bound**, which is why eight more texture fetches and a sine and cosine
  a vertex (about 24,000 far figures at the stress point, each vertex placing its man again) made it slower. So the
  step's premise ("CPU-bound", above) was wrong, and **step 3** (fewer vertices for small figures) is now the main
  lever at wide.
- **The override buffer** (a design note for decision 0048, not built): if men are ever placed on the GPU from a
  battalion record, the men off their slots go in a second per-man buffer a host (two vec4: place, turn, a flag; role
  and the clip's start), zero by default, written only for those men and sent as changed ranges
  (`thinInstancePartialBufferUpdate`); the shader reads it first, the bounds widen by those men, 32 B a man off his
  slot. Given the finding, placing men on the GPU only pays when the CPU's share is measured to matter.

## Step 2: the simple shadows beyond close zoom (issue #131)

- Built separately (issue #131, the decision it proposes, number 0049): beyond the close zoom the figures' shadow map
  gives way to a cheaper shadow. This plan does not change it; it measures it at 40 a side.
- **Expected** (from measurements of older code, not of #131): the figures' shadows cost about 0.3 to 0.65 ms at 20 a
  side after the shadow fix (batch C's run) and 1.4 to 3.9 ms before it; at 40 a side the casters double (est.: 0.6 to
  1.3 ms).
- **Bar** (here): **kept at 40 a side if** it saves ≥ 0.5 ms p50 at wide and default, panning, with no visible change
  beyond what #131's own review accepts. Else #131's own outcome stands and this plan says so.
- **Measured, the mask version** (PR #134 at 21782f2 merged into this branch at 7c437f1, worktree `rts-32k-s2`;
  2026-10-23, Metal, 40 a side, three rounds; 35 of 36 runs exit 0: one stress pan run lost Chrome mid-run, so that row
  has two rounds; medians of p50 / p95, ms; "map" = `?ushadowfar=map&smoothmove=0`, "simple" = `?smoothmove=0`,
  "smooth" = the defaults):

  | Run | Wide | Default | Close |
  |---|---|---|---|
  | middle, still: map / simple / smooth | 9.80 / 10.15 / 10.25 | 11.10 / 10.60 / 10.95 | 9.80 / 9.80 / 9.80 |
  | middle, pan: map / simple / smooth | 9.60 / 10.45 / 10.50 | 10.40 / 10.75 / 10.55 | 9.75 / 9.80 / 9.70 |
  | stress, still: map / simple / smooth | 12.75 / 13.20 / 13.40 | 10.55 / 10.55 / 10.65 | 8.75 / 8.75 / 8.70 |
  | stress, pan: map / simple / smooth | 12.80 / 13.13 / 13.15 | 10.10 / 11.20 / 11.20 | 9.10 / 9.43 / 9.40 |
  | stress, still, p95: map / smooth | 23.65 / 14.45 | 11.55 / 11.80 | 10.05 / 10.15 |

  **Fails its bar** at 40 a side: 0.3 to 0.9 ms *slower* at wide, up to 1.1 ms slower at default panning at the stress
  point. It removes the map's wide spikes (stress p95 23.65 → 14.45). Why (reasoned from the code, not timed per pass):
  the mask is a 2048² target redrawn every frame (positions move every frame) and again whenever a 12 fps step lands
  with smooth movement off, each man's shadow a blended quad of about 100–200 texels: fill that grows with the men in
  view, where the lazy map redraws at step rate from 56-triangle depth-only casters. The owner's reading: a simple shadow
  should be cheaper and redrawn less, not more. So #134 is reworked (2026-10-23) to a shadow quad drawn by each soldier
  in the main pass (4 vertices a man, multiply-blended, no target, no redraw); this step is re-measured with it.

## Step 3: a third, tiny LOD

- **Today**: the far LOD is 243 triangles; at the widest zoom nearly every figure is a few pixels tall (the LOD switch
  is at 48 px). At 40 a side about 33,000 × 243 ≈ 8 million triangles a frame at wide (est.), plus the proxy's 56 a
  caster in the shadow map.
- **What costs** (step 1's finding): the wide view is GPU vertex-bound. The far LOD is 243 triangles but **616
  vertices** (split by colour role), each posed by two texel fetches (`VAT_POS`) and grown and crossfaded (`FAR_SCALE`,
  `FAR`): at the stress point about 24,000 × 616 ≈ 14.8 million vertices a frame. The vertex count is the lever, not
  the triangle count.
- **The options weighed**:
  - **(a) a posed mesh of boxes** on the figure's parts: the parts the shadow proxy already finds (`boneParts`: a bone
    carrying enough vertices over 14 cm long; 10 to 16 on this figure), each a box of 8 shared corners (12
    triangles), each corner wholly on its bone and posed at every step like the far LOD (`posedMesh`, two fetches a
    vertex, the same shader path). About 112 vertices (−82 %) and 168 triangles (−31 %). Built at load from the far
    LOD, no bake; the same materials and switches (the far palette, its lift, `FAR_SCALE`, the masks, the flags
    untouched), so readability and the A/B are cheap to keep. From above it keeps the figure's mass and its shoulders,
    pack and headgear where they are.
  - **(b) a camera-facing card** from an impostor atlas (facings × the 242 baked steps, a role and a normal a texel so
    the uniform's colours, the far palette and the light still apply): 4 vertices a figure, the least vertex work, but
    an atlas baked at load from the far LOD (a render-target pass over about 2,000 cells), a fragment fetch and an
    alpha test a pixel, one camera elevation per cell while the view looks down at 30° to 60° across the screen, and a
    new look (no parallax, a card's silhouette): the "no visible change at 100 %" bar is the hardest for it, and its
    risk and size are a step of their own.
  - **(c) both**, the card only under about 6 px: worth it only if (a) passes and the trace still shows the tiny
    figures' vertices dominating.
- **Chosen: (a)**, smallest step that attacks the vertex count with no new look; (b) and (c) wait on its measurement.
- **The change** (`tinyMesh`, `src/look/units-data.ts`; `src/look/units.ts`): a fourth host a battalion (after the
  near LOD, the far LOD, the proxy), drawn instead of the far LOD when its figure falls under **12 px** tall (`tinyPx`,
  ±10 % like the LOD switch; `?tinypx=<px>` to tune by eye, `?tinylod=0` for the A/B), with its own material per
  uniform (the far LOD's, reading the tiny mesh's posed vertices: no new texture unit, the vertex stage reads two).
  Each corner's colour role is the role of the part's vertex nearest it, so the coat, the pack and the headgear show
  where they are; its normals are smooth from the box's centre (a figure a few pixels tall shows no facet). The
  shadows are unchanged: the proxy casts (the simple shadows of #131 decide beyond close zoom; the tiny LOD never
  casts). `drawn()` reports it as `tiny`.
- **Bar**: **kept if**, at 40 a side, the wide camera's p50 falls by **≥ 0.5 ms** still and panning, the default's is
  no worse, the readability guard's figures' contrast and coat share at the widest zoom stay within 10 %, and the
  contact sheet at wide shows no visible change at 100 %. **Else reverted.** Step 1's bench showed the wide view
  GPU vertex-bound (more vertex work made it 1.15 to 1.45 ms slower), so this is now the main lever at wide; the
  measurement decides.
- **Built** (2026-10-23; `tinyMesh`, `seenArea`, `src/look/units-data.ts`; `TINY` in `units.vert` / `units.frag`):
  14 boxes, **112 vertices, 168 triangles** (the far LOD: 616, 243). Colour: a corner's colour is a **mix of the
  roles** (three vec4 attributes, the shader sums `uPal[i] · w`, a few multiply-adds a vertex, no fetch): its eighth
  of the part's seen colour, a quarter of the part's, then 35 % of the whole figure's, then **calibrated** so the
  boxes' seen pixels hold each role in the far LOD's share (both meshes rasterised on the CPU at load from 8 sides at
  50° above the horizon, 96² each: 34 ms at load on this Mac, measured in Node). The single-role tries read wrong
  (each box one role: a white-coated battalion went brown under its packs; each corner its octant's role: red
  speckle of facings). Normals smooth from each box's centre. The guard's coat mask is dithered by the coat's weight.
  - A bug found on the way (fixed): `place()` marked only LODs 0 to 2 stale, so a fourth host drew its first
    frame's men for ever.
- **Checks** (SwiftShader, 1280 × 720; `output/armies-review/10-tiny-lod/`, not committed):
  - Contact sheet, wide, `?tinylod=0` against the default, the fight's middle and the stress point, 12 and 80 s: the
    same places and counts (at 720p nearly every wide figure is under 12 px: 23,598 of 24,012 at the stress point);
    11.8 % of pixels differ by over 8 / 255 at the stress point, 4.6 % at the middle. By eye at 100 %: the blue
    battalions read the same; the white-coated ones read browner, with less of the far LOD's white speckle.
  - Readability guard (`--figures`, summer; tiny / far): widest, side 0 (blue) luma 0.300 / 0.281 (+7 %), separation
    0.224 / 0.243 (−8 %); side 1 (white) luma 0.415 / 0.502 (−17 %), separation 0.207 / 0.120 (it stands out more);
    coat share 11.0 / 9.1 % and 11.1 / 27.1 %; within ΔE 25 of the coat 13.4 / 19.3 % and 4.6 / 23.7 % (a mixed
    colour is rarely near a pure one). **The guard's 10 % bar is not met** for side 1 and for the coat measures; the
    bench says whether the step is worth more work on the look.
- **Measured** (2026-10-23, Metal, the production build, 1080p, 40 a side, three interleaved rounds, all 28 runs exit 0;
  medians of p50 / p95, ms; `tl0` the far LOD, `tl1` the tiny LOD):

  | Run | Wide | Default | Close |
  |---|---|---|---|
  | middle, still, tl0 | 9.85 / 11.45 | 11.00 / 11.60 | 9.75 / 10.65 |
  | middle, still, tl1 | 8.45 / 9.70 | 10.85 / 11.75 | 9.80 / 10.65 |
  | middle, pan, tl0 | 10.10 / 11.90 | 10.25 / 11.65 | 9.70 / 10.25 |
  | middle, pan, tl1 | 8.30 / 9.85 | 10.55 / 11.80 | 9.40 / 10.45 |
  | stress, still, tl0 | 12.95 / 22.75 | 10.40 / 11.60 | 9.00 / 10.00 |
  | stress, still, tl1 | 10.95 / 13.60 | 10.45 / 11.70 | 8.95 / 10.00 |
  | stress, pan, tl0 | 12.75 / 14.00 | 10.10 / 11.55 | 8.95 / 10.10 |
  | stress, pan, tl1 | 10.40 / 12.75 | 10.10 / 11.60 | 9.15 / 10.10 |

  Traced pans: `cpuMs` p50 at wide 9.5 → 8.1 (middle), 12.1 → 11.7 (stress); place() and uploads unchanged (≤ 0.08 ms
  a frame). One traced run (stress, `tl1`, close) was slow throughout (p50 15 to 21 ms, with upload frames stalling 20
  to 38 ms) while the untraced runs at that point measure 9.15: a disturbed run, not extra uploads (the code uploads only
  the LOD drawn and the caster; its uploads a frame are higher only because its frames are longer).
- **Verdict** (the owner decides: keep with a new look, revert, or the route below): **the frame-time bar passes** at
  wide, −1.40 / −1.80 ms at the middle (still / pan) and −2.00 / −2.35 at the stress point, its p95 spikes gone
  (22.75 → 13.60 still); default within ±0.3 (the middle's pan +0.30, at the bar's edge); close within ±0.3. **The look
  bar fails**: the readability guard's white side −17 % luma, its coat share 27 → 11 %, browner at 100 %. The code
  stays on the branch until the owner decides.
- **The finding**: a strong confirmation that the wide view is **vertex-bound**: 616 → 112 vertices a figure saved 1.4
  to 2.35 ms at wide (and step 1's added vertex work cost 1.15 to 1.45).
- **Next** (the route that keeps the look, est.): make the **far LOD itself cheaper**. It is 243 triangles but 616
  vertices because the bake splits vertices by colour role (and normal seams); measured on this figure, its vertices
  stand on **179 distinct places** (with their skinning), 221 with distinct normals. One vertex set with the role
  carried flat (a `flat` varying, each triangle's role on its provoking vertex, duplicating only where a vertex is the
  last of triangles of two roles) and the normal taken from the screen derivatives (or kept where it is shared) would
  bring it to about **180 to 260 vertices (−58 to −71 %, est.)** and **one posed fetch a vertex instead of two**, with
  the same triangles and colours. From step 3's measurement (−82 % vertices: −1.4 to −2.35 ms) that is worth about 1
  to 2 ms at wide (est.), with no change to the look; the tiny LOD could then stay off or switch lower.
- **Checks before the bench** (as planned): `npm test` (the tiny mesh: under a quarter of the far LOD's vertices, each corner on one
  bone, a role each, wound outward, a figure tall posed); a SwiftShader contact sheet at wide (`?tinylod=0` against
  the default, the fight's middle and the stress point, a marching and a firing moment); the readability guard
  (`node tools/guard.mjs <url?armies=40> --figures`) at the widest zoom within 10 % of `?tinylod=0`.

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

- The close reserves stand 6 m apart: closer than the reserves at 20 a side (10 m); the owner's eye on the wide view.
- The near meadow and the trees' crowns over the reserves (bushes are walked through, as at 20 a side).
