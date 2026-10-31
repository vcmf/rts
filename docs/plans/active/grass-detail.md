---
status: active
last_reviewed: 2026-10-31
---

# Plan: a Grass detail setting, Full and Balanced (issue #257)

## Problem

On the Austerlitz windows the close camera costs about 9 ms of GPU on the dev Mac, over the 8.3 ms budget. Grass and
crops cover more of the screen at Kobelnitz than on the demo (#257).

The research note's first two experiments (the issue's comment of 2026-10-30):
- Fewer, wider blades past about 10 m (`thin`): 0.6–0.7 ms less at the close camera, but 0.3–0.5 ms more at the
  default zoom.
- Crops painted beyond 25 m: 0.1–0.2 ms less, and the 25 m line shows.

The owner (2026-10-30) chose a player option with two levels: **Full** (today's meadow) and **Balanced** (the thin
blades, tuned so the default zoom costs nothing). The crops experiment is dropped. Full was the default first; on
2026-10-31, having tried Balanced ("not bad"), the owner made **Balanced the default** (decision 0097, superseding
0095's default; `?grassdetail=full` for Full; Full without the meadow).

## Scope

- **`src/look/grass-detail.ts`** (pure):
  - the levels and `isGrassDetail`;
  - `?grassdetail=full|balanced` (anything else throws; Balanced reads as Full without the meadow);
  - where Balanced thins, its share and softness (`THIN_RAMP`, `BALANCED_DROP`, `THIN_SOFT`);
  - the share by distance and zoom (`dropShare`, `dropAtZoom`, `thinOn`), a clump's size (`thinKeep`), the share's ease
    (`ThinEase`), and the address's edit (`searchWithGrassDetail`).
- **`shaders/meadow.vert`**: the drop inside `#ifdef GRASS_THIN`. Without the define the shader is main's.
- **`src/look/meadow.ts`**:
  - `GRASS_THIN` toggled on the near ring's material, and its uniforms (`uThin`, `uThinRamp`);
  - `setDetail`;
  - the share eased (`ThinEase`);
  - a switch that waits for the new program (`src/look/define-switch.ts`).
- **The look page's settings panel**: a Grass detail select (Full | Balanced, Balanced selected by default), applied live
  and kept in the address (the key only off the default).
  The row is hidden without the meadow.
- **Docs**: `docs/systems/look.md` (the setting), decision 0095 (a player option over decision 0085's meadow) and
  decision 0097 (Balanced the default).
- **Tests**:
  - the parsing and the address;
  - the share by distance and zoom (none from 110 m: Balanced is Full);
  - the clumps shrinking continuously as the camera pans and zooms, and the share's ease around a switch;
  - the switch keeping the old defines until the new program is ready;
  - the drop on the grass branch only (the crops untouched);
  - the shader reading the same rule;
  - Full's shader free of `GRASS_THIN`.

Not in scope:
- the crops drawn as ground paint;
- per-clump work (the research note's option 3);
- the game's own settings menu.

## Approach

**What Balanced draws** (the redesign's Option A1, below; chosen by the owner, 2026-10-31). The near (0.5 m) ring
keeps its large clump, its cells and its crops. Up close, its material turns on `GRASS_THIN` (`setDefine`). Its grass
clumps (never its crops) then shrink away by a share, each picked by a hash of its own (not the growth's `h2`, so the
kept clumps grow as at Full):
- **The share by distance:** none inside 8 m; from 12 m half the clumps culled (`BALANCED_DROP`) and `THIN_SOFT`
  (a fifth) more shrunk; back to none across the near ring's own band out
  (18–25 m), so it meets the middle ring's full density without a step.
- **No pop:** below the share a clump shrinks away across `THIN_SOFT` of the hash rather than vanishing, so panning
  and zooming never pop one.
- **The share by zoom:** across `CLOSE_ZOOM` (70–110 m, shared with the combed clumps) it falls to none. From 110 m
  out, the default zoom included, the define is off: Full's program.
- **Switching:** the program is compiled as soon as Balanced is chosen. A switch waits until the new program is
  ready (the ring never blinks), and the share eases up from none after it and down to none before a switch off (no
  pop).

**Why ramp back out across 18–25 m rather than thin the middle ring there** (review round 1 of A1):
- The ramp touches only the near ring.
- Thinning the middle ring would put `GRASS_THIN` on its program too: more of every player's Balanced vertex work,
  and its own density step would move out to 38–50 m.
- The ramp loses the drop on half of 18–25 m. Most of the saving lies at 12–18 m, closest to the camera, where the
  clumps cover the most pixels.

A thinned clump stops after the meadow map's read, as an empty cell does, but still runs its vertices that far (the
Redesign's Option A, as built). There are no other rings and no world chunks. The per-frame CPU is the share's ease
and the switch's check.

**The tuning before the redesign.** Each step below is a single run on Kobelnitz on the dev Mac (M1 Pro, ANGLE
Metal), with the GPU frame p50 in ms. These designs are not built:

| Balanced tried | close | default | wide |
|---|---|---|---|
| every ring thinned, widened ×1.4, the inner rings cut from 60 m (the experiment's `thin`) | −0.6 to −0.7 | +0.3 to +0.5 | 0 |
| every ring thinned, not widened, main's 150 m cut | −0.7 to −0.85 | +0.05 to +0.12 | 0 |
| only the near ring's 8–25 m thinned, at every zoom | −0.8 to −1.0 | 0 to +0.1 (the demo: +0.4 to +0.7) | 0 |
| the same, its cut moving out from 70 to 110 m of radius, the crops thinned too (round 1's bug) | −1.1 to −1.2 | 0 | 0 |

Two notes on these results:
- **Why widening cost at the default zoom.** The wider clumps cover more pixels.
- **Why thinning the outer rings cost.** They show more ground, which costs more to shade than the grass that hid it
  (an inference from the numbers, not measured on its own).

## Acceptance

- **Benchmark.** Production build, Metal, `tools/bench-look.mjs`, Kobelnitz and the demo, Full against Balanced, in
  two alternated rounds under the bench lock. Each round starts at a 1-min load of 5 or less (the owner's rule,
  2026-10-30), and each run also waits for it.
  - Balanced: Kobelnitz's close cameras under 8.3 ms.
  - Default and wide: no worse than Full.
- **Goldens.** `?grassdetail=full` is identical to main's build (`tools/golden.mjs` pins it unless the URL sets the
  grass detail).
- **Stills.** Full and Balanced at close-up and default zoom on Kobelnitz and on the demo's meadow, in the main
  checkout's output/farmland-perf/compare.html (not committed).
- **Checks.** `npm test`, `check:data`, the docs check and the build pass.

## Outcome

**Reviews.** Rounds 1–3 (2026-10-31) found severe issues in the split-ring design, so by the owner's rule Balanced
was redesigned (the next section; Option A1 built). A1's own three rounds followed; the third found nothing severe.

**The final pass (2026-10-31).** Dev Mac (M1 Pro, ANGLE Metal), `vite build` + `vite preview`,
`tools/bench-look.mjs --gpu metal`, 1920×1080, the l2 arm.

Two alternated rounds under the bench lock, each run gated at a 1-min load of 5 or less:
- Round 1: Kobelnitz, its 90 m view (`?benchr=90`), then the demo, Full first. It started at a load of 4.12.
- Round 2: the reverse order, Balanced first. It started at 3.79.

Run start loads ranged from 3.79 to 4.98. Each cell is the mean of four runs, which agreed within 0.06 ms. Each
cell gives the GPU frame p50, then the frame-interval p50, in ms:

| camera | Kobelnitz Full | Balanced | Δ GPU | demo Full | Balanced | Δ GPU |
|---|---|---|---|---|---|---|
| close −45 | 8.84 / 5.83 | **8.19** / 5.55 | −0.66 | 7.07 / 5.45 | 6.74 / 4.86 | −0.33 |
| close 0 | 8.89 / 5.92 | **8.29** / 5.62 | −0.59 | 6.98 / 5.14 | 6.70 / 4.84 | −0.28 |
| close +45 | 9.02 / 6.13 | **8.34** / 5.64 | −0.69 | 6.60 / 4.70 | 6.48 / 4.71 | −0.12 |
| 90 m −45 | 8.67 / 6.10 | 8.68 / 5.69 | +0.01 | | | |
| 90 m 0 | 8.71 / 6.32 | 8.71 / 6.16 | 0.00 | | | |
| 90 m +45 | 8.79 / 6.11 | 8.78 / 6.47 | −0.01 | | | |
| default −45 | 8.49 / 6.50 | 8.50 / 6.50 | +0.01 | 9.07 / 7.05 | 9.09 / 7.08 | +0.02 |
| default 0 | 8.70 / 6.21 | 8.70 / 6.39 | 0.00 | 8.98 / 6.93 | 8.99 / 6.98 | +0.01 |
| default +45 | 8.63 / 6.23 | 8.64 / 6.34 | +0.01 | 9.36 / 7.08 | 9.38 / 7.11 | +0.02 |
| wide −45 | 8.93 / 5.42 | 8.92 / 5.41 | −0.01 | 12.43 / 7.18 | 12.42 / 7.21 | 0.00 |
| wide 0 | 9.05 / 5.42 | 9.04 / 5.42 | −0.02 | 13.64 / 8.26 | 13.65 / 7.98 | +0.02 |
| wide +45 | 8.78 / 5.39 | 8.78 / 5.39 | −0.01 | 12.30 / 7.22 | 12.33 / 7.29 | +0.03 |

**Results:**
- **Kobelnitz close.** 0.6–0.7 ms less. Two of the three yaws come under 8.3 ms (8.19, 8.29); the third is
  8.34, 0.04 over the budget.
- **The demo's close.** 0.1–0.35 ms less.
- **At 90 m** the share is about half of its whole (the zoom's ramp). Even with Full: the saving there is within the
  noise.
- **Default and wide.** Even with Full, within ±0.03 ms: Balanced is Full's program from 110 m.

**Goldens.** Full against origin/main's build, `tools/golden.mjs`, the demo and Kobelnitz: every region of all 8 views
matches (0.000 % differing, mean 0.000). After Balanced became the default, run again on `?grassdetail=full`: the same,
on both. The default page differs from main up close by design (the golden `close` view, at 80 m, is inside `CLOSE_ZOOM`), so
`tools/golden.mjs` now renders both pages with `?grassdetail=full` unless the URL sets it.

**After the last review.**
- The bench waits for the grass detail to settle before timing each camera, and records the level it measured
  (`grassDetail`, bench version 10).
- Balanced's program is compiled once the camera comes within 140 m (`THIN_WARM_RADIUS`), not at load. Its compile
  cost is an estimate, not measured (decision 0097).

**Stills** (main checkout, output/farmland-perf/compare.html, not committed), Full against Balanced at 20, 45, 90
and 125 m on Kobelnitz and the demo's meadow:
- **125 m:** identical (Kobelnitz 0 pixels differ; the demo 2, by a level).
- **20–45 m, past about 10 m:** a sparser and slightly darker carpet, with more ground and single strokes between
  the tufts. On the demo's meadow the thinner band around the focus (about 12–20 m) can be read.
- **The crops:** unchanged.

**The pan.** `pan45-full-balanced.gif`: 24 steps of 0.25 m at 45 m, Full against Balanced. The change from frame to
frame is even (Balanced 11.4–11.8 mean levels, Full 12.9–13.1), with no spike: no clump pops.

**Left as follow-ups:**
- **Kobelnitz's third yaw** is 0.04 ms over. If it must come under, the next lever is the vertex work of the dropped
  clumps (Redesign, Option A as built): leaving them out of the packed slot buffer.
- **The visible band** on the meadow is the owner's call on the stills.

## Redesign (2026-10-31: Option A1 chosen by the owner and built, as amended below)

Review round 3 found severe issues, so by the owner's rule Balanced is redesigned. Three rounds share one cause:
- Crops and grass share the near ring and its large clump, so changing only the grass meant extra rings around it:
  the cut ring, then the crop band, then the world rings.
- Each fix moved cost or complexity somewhere else, and in round 3 onto Full.

The options below keep the crops on the near ring as they are and do not add rings.

**Shared numbers.** All of these are estimates; nothing here is measured.

The zones of the near (0.5 m) ring, in cells (area / 0.25 m²):

| zone | cells |
|---|---|
| 0–8 m | 800 |
| 8–12 m | 1,000 |
| 12–25 m | 6,040 |

The clumps:
- Grass_Large: 150 vertices.
- Grass_Small: 80 vertices.
- Grass_Small thinned to every other blade: 44 vertices.

Cover:
- Kobelnitz: 0.40 meadow, 0.24 crops, 0.36 bare (the research note).
- The demo: 0.43 cover. Its split is not counted here, so a meadow view is taken as 0.8 grass.

What a slot costs in Full's vertex shader:
- A cell where something grows runs the whole per-clump logic on each of its 150 vertices.
- An empty cell stops after the band test and one meadow-map read, still on 150 vertices.

The research note's ablation (the demo, closest zoom) puts the meadow at 2.8 ms: 2.0 ms of fragment shading and 0.8 ms
of vertex work and binning. A blade cut is mostly a fragment saving.

### Option A: thin the near ring's grass inside its own shader, at Balanced only (chosen; A1 built)

**As built** (after A1's review rounds 1 and 2; Approach above):
- **The define.** At Balanced the near ring's own material turns on `GRASS_THIN` with `setDefine`. There is no
  second material.
- **The drop.** A grass clump below the share, by its own hash, shrinks away across `THIN_SOFT` (`grow` times
  `thinK`) and is culled below that. The share ramps in across 8–12 m and back out across 18–25 m.
- **The share's ease.** The share (`uThin.x`) eases from none after the program switches on, and down to none
  before it switches off (`ThinEase`, `THIN_EASE_S` 0.3 s), so a switch never pops. The look tools' frozen page
  snaps it.
- **The switch.** It happens in the near ring's own render, after every other define of the frame, and only once
  the mesh is ready with the new program (`switchDefineWhenReady`, `src/look/define-switch.ts`).
- **Compiling ahead.** While Balanced is chosen and the program is off (zoomed out, the ring maybe hidden), it is
  compiled from a scene hook, again whenever the material's other defines change (`warmDefine`). It is skipped while
  a switch is already asking for it.
- **The look tools.** They wait until the program asked for is in force and the share at its target
  (`__look.meadowSettled`, in `tools/look-page.mjs`'s `viewStep`). On their frozen page the share snaps on the frame the
  program lands, so a still is deterministic.
- **The default zoom.** From 110 m out the define is off: Full's program.

**How the crops stay identical to Full.** The thinning is only on the grass branch (`!crop`), after the crop
decision. Crop clumps take the same code, the same hashes and the same clump as in Full's shader.

**What Full costs against main** (stated as it is):
- **The same.** Full draws main's program: the shader with the `GRASS_THIN` blocks stripped is main's, checked by
  test and script, and the near ring keeps its material.
- **The differences, all CPU:**
  - The near ring's material declares two more uniforms (`uThin`, `uThinRamp`) and holds values for them. Each frame
    Babylon's bind asks for both, and the program has no location for them, so no GL call is made.
  - Each frame `ThinEase.step` runs (a few arithmetic operations).
  - The near ring's render runs a callback that returns at once at Full.
- **No uploads, no memory.** There are no uploads beyond main's, and no memory beyond two small vectors.
- **The goldens** decide the pixels in the final pass.

**Work at Balanced, up close.** Over 12–18 m, and tapering across 8–12 and 18–25 m:
- **Fragments:** half the grass clumps' fragments are gone (`BALANCED_DROP`, the clumps culled), and a fifth more
  are smaller (the soft band above it).
- **Vertices:** dropped clumps **still run their vertices**. Each is instanced, so all 58–108 of its vertices go
  through the band test, the view cull, the meadow map's read and the extra hash before the cull. Balanced therefore
  saves mostly fragments and the per-clump logic after the read, little of the vertex work itself: on Kobelnitz about
  1,200 dropped clumps still cost about 100k vertex invocations a frame.
- **If the final bench falls short:** a follow-up would leave the clumps below the steady share minus `THIN_SOFT` out
  of the packed slot buffer per chunk (`cullRing`), keeping only the soft edge in the shader. It is not built now.

The estimate of 0.3–0.6 ms at Kobelnitz's close camera stands until the final bench.

**Size.**
- `grass-detail.ts`: the rule, the ease and the address.
- `define-switch.ts`: about 20 lines.
- About 20 lines each in `meadow.ts` and in the shader's two `GRASS_THIN` blocks.

### Option B: a crop ring made once, so the grass rings can change freely

**What changes.** At Balanced the near ring is replaced by three ring-anchored rings on the same cells, with the
camera-snapped slots as main uses them:
- a crop ring: the large clump, crops only, 0–25 m;
- a grass ring: the large clump, grass only, 0–12 m;
- a thin-grass ring: the 44-vertex clump, grass only, 8–25 m, its hashes complementary across the cut.

Full keeps main's near ring. Switching enables one set and disables the other.

**How the crops stay identical to Full.** The crop ring is main's near ring with its grass branch cut. It has the
same cells, hashes, clump and band.

**Why Full costs nothing.** Full's ring and material are main's. The three Balanced rings are made at load, or on the
first switch, and are disabled at Full, so they are never drawn or culled.

**Work at Balanced, up close.**

| ring | vertex invocations |
|---|---|
| crop ring | Full's whole ring: 7,840 cells × 150 (grass and empty cells stop after the meadow read) |
| grass ring, 0–12 m | about 1,800 cells × 150 |
| thin ring, 8–25 m | about 7,000 cells × 44 |

That is about 1.18M + 0.27M + 0.31M vertex invocations, against Full's 1.18M. The per-clump logic and the fragments
fall as in Option A, with the grass beyond the cut 44-vertex clumps. **The vertex count rises**, and the per-frame
culling is that of three rings instead of one.

**Memory and CPU.**
- Three slot buffers of the near ring's size: about 170 KB.
- Three times the near ring's cull while at Balanced.
- No uploads beyond today's.

**Size.** Medium: the ring list per level, a crops-only and a grass-only define, the complementary hash. It is close
to round 1's design, with the crops moved off the thinned ring.

### Option C: a static instance set per play window, built once at load

**What changes.** At Balanced the grass beyond the cut is drawn from instance buffers made at load for the whole play
window:
- one mesh per 16 m chunk, with thin instances at the cells where grass grows, using the 44-vertex clump;
- Babylon's own frustum cull picks the chunks; no per-frame packing.

Crops and the inside of the cut stay on main's near ring. At Balanced that ring takes a band cut at 12 m, through a
second material.

**How the crops stay identical to Full.** They never leave the near ring.

**Why Full costs nothing.** The chunk meshes are made, or disabled, only for Balanced. Full keeps main's ring and
material.

**Work at Balanced, up close.**
- **Vertices:**
  - the near ring to 12 m: about 1,800 cells × 150;
  - the grass chunks in view: about 2,400 grass cells × 44 on Kobelnitz, about 4,800 on a demo meadow view (its 0.8
    grass);
  - the near ring's crops beyond 12 m stay on its full band (as Full).
- **Fragments:** the grass's beyond the cut halved.

The fewest vertex invocations of the three. **But** the crops keep the near ring running to 25 m, so the large
clump still runs on every cell there: the same coupling as rounds 1–3. It is worth it only with Option B's crop
ring.

**Memory, CPU and uploads.**
- The play window's grass cells: 2.6M cells × 0.40 meadow ≈ 1M cells × 8 bytes ≈ 8 MB on Kobelnitz.
- A build at load of about 100–300 ms.
- About 860 chunk meshes for Babylon to frustum-cull every frame: about 0.1–0.3 ms of CPU, an estimate.
- No uploads after load.

**Size.** Large: chunk meshes, a load-time build per window, its memory, its rebuild after a lost context.

### Option D: drop Balanced and close #257 with another lever

Two levers that leave the grass as it is:
- **Per-clump work once per clump** (the research note's option 3). It is for everyone, with the same pixels, and
  estimated at 0.3–0.7 ms close. It is large (1–2 weeks).
- **An antialiasing setting** (4× | 2× MSAA). It is a player option like Grass detail, and the 2× arm was measured at
  0.7 ms (`docs/plans/done/headroom.md`). It is small (a setting and a render target sample count), and it costs the
  default nothing. Its loss: rougher edges on the grass and the figures, the owner's call (docs/plans/done/headroom.md left it to him).

How each fares against the requirements:
- **The crops:** identical. **Full's path:** unchanged.
- **Option 3:** less vertex work, everywhere.
- **2× MSAA:** fewer fragment samples on edges, everywhere.

### Recommendation

**Option A (A1, with A2 as the knob).** It is the only option where Balanced changes nothing but a shader branch
that Full never compiles:
- the crops stay identical by construction (the drop sits behind the crop decision);
- Full's path is main's, byte for byte;
- there is no per-frame CPU, no memory and no upload;
- the change is the smallest, and it deletes most of what rounds 1–3 added.

Its risk is that the saving falls short of Kobelnitz's 8.3 ms. The first bench answers that with A1 alone, then
A1 + A2. If both fall short, **D's 2× MSAA setting** is the fallback: measured, small, and also free for Full.

If the owner takes A:
- reset the branch to its first commit's scope (the setting, `?grassdetail`, the panel);
- build A1;
- one review round, then the final pass's bench, stills and goldens.
