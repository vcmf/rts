---
status: active
last_reviewed: 2026-10-30
---

# Plan: a Grass detail setting, Full and Balanced (issue #257)

## Problem

On the Austerlitz windows the close camera costs about 9 ms of GPU on the dev Mac, over the 8.3 ms budget. Grass and
crops cover more of the screen at Kobelnitz than on the demo (#257).

The research note's first two experiments (the issue's comment of 2026-10-30):
- Fewer, wider blades past about 10 m (`thin`): 0.6–0.7 ms less at the close camera, but 0.3–0.5 ms more at the
  default zoom.
- Crops painted beyond 25 m: 0.1–0.2 ms less, and the 25 m line shows.

The owner (2026-10-30) chose a player option with two levels: **Full** (today's meadow, the default everywhere) and
**Balanced** (the thin blades, tuned so the default zoom costs nothing). The crops experiment is dropped.

## Scope

- **`src/look/grass-detail.ts`** (pure):
  - the levels;
  - the `?grassdetail=full|balanced` parsing (anything else throws);
  - Balanced's cut and its zoom (`BALANCED_CUT`, `BALANCED_ZOOM`);
  - the rings of both levels, and what each draws at a level and zoom (`ringBands`);
  - the thinned clump (every other blade).
- **`src/look/meadow.ts`**: builds its rings and clumps from the preset. Full gives main's rings and clumps, with the
  same bands.
- **The look page's settings panel**: a Grass detail select (Full | Balanced), applied live and kept in the
  address. Both levels' rings are built; a level only sets what each draws. The row is hidden without the meadow, and
  `?grassdetail=balanced` without it is refused.
- **Docs**: `docs/systems/look.md` (the setting) and decision 0092 (a player option over decision 0085's meadow).
- **Tests**: the parsing, the presets' rings and bands, the thinned clump.

Not in scope:
- the crops drawn as ground paint;
- per-clump work (the research note's option 3);
- the game's own settings menu.

## Approach

**What Balanced draws.** It cuts the near (0.5 m) ring in two at 8–12 m from the focus:
- inside the cut, the large clump;
- beyond the cut, two rings anchored to the world, their slots only the cells where their kind grows: the grass with
  the small clump thinned to every other blade (scaled to the large clump's footprint by its own radius), the crops
  with the large clump as at Full;
- across the cut, complementary roots (one ring keeps a root by the hash, the other by 1 minus it).

As the camera's radius goes from 70 to 110 m (the zoom over which the combed clumps already widen up close,
`CLOSE_ZOOM`), the near ring's edge moves out to main's while the cut ring fades by as much, so the rings always add
to one. From 110 m out, which includes the default zoom of 125 m, Balanced draws Full. The outer rings and the crops stay as at Full.

**The tuning.** Each step below is a single run on Kobelnitz on the dev Mac (M1 Pro, ANGLE Metal), with the GPU
frame p50 in ms:

| Balanced tried | close | default | wide |
|---|---|---|---|
| every ring thinned, widened ×1.4, the inner rings cut from 60 m (the experiment's `thin`) | −0.6 to −0.7 | +0.3 to +0.5 | 0 |
| every ring thinned, not widened, main's 150 m cut | −0.7 to −0.85 | +0.05 to +0.12 | 0 |
| only the near ring's 8–25 m thinned, at every zoom | −0.8 to −1.0 | 0 to +0.1 (the demo: +0.4 to +0.7) | 0 |
| the same, its cut moving out from 70 to 110 m of radius (built; measured before review round 1's crop fix, to be remeasured) | −1.1 to −1.2 | 0 | 0 |

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
- **Goldens.** Full, the default, is identical to main's build.
- **Stills.** Full and Balanced at close-up and default zoom on Kobelnitz and on the demo's meadow, in the main
  checkout's output/farmland-perf/compare.html (not committed).
- **Checks.** `npm test`, `check:data`, the docs check and the build pass.

## Outcome

**Review rounds 1 and 2 (2026-10-31).** The numbers measured before them (Kobelnitz close about 1.1 ms less) no longer
stand: part of that saving was the crops, which Balanced had thinned.

What changed after round 2:
- The crops beyond the cut are a crop ring's, with the large clump.
- The grass beyond the cut is the cut ring's thinned clump. Both rings are anchored to the world: their slots are
  only the cells where their kind grows.
- The near ring is culled at the cut, in 2 m chunks.
- Across the cut, the near ring and the cut and crop rings keep complementary roots.

**Vertex work by zone** (Balanced against Full, up close; an estimate from the clumps' vertices: the large clump 150,
the thinned small one 44):

| zone | Full | Balanced |
|---|---|---|
| 0–8 m | the large clump on every cell | the same |
| 8–12 m (the cross-fade) | the large clump on every cell | the large clump on every cell, plus 44 a grass cell and 150 a crop cell (the crossfade's extra) |
| 12–25 m | the large clump on every cell, empty ones included (those stop after the meadow map's read) | 44 a grass cell, 150 a crop cell, nothing on an empty cell |

So Balanced does less vertex work wherever the band beyond the cut holds grass or empty ground: Kobelnitz (0.40
meadow, 0.36 bare) and the demo's meadow.

In a view all of standing crops it does about Full's work, plus the cross-fade's. There its saving can only come from
the fragments of the thinner grass, and there is little grass to thin.

The near ring's cull pads each side by its cells' and the clumps' reach. Slots in that margin stop at the band test,
before the meadow map's read.

**Final pass, after the last review round:**
- the two-round bench (Kobelnitz close, default, wide and a 90 m view, and the demo);
- the stills and the goldens;
- the full checks.

**A bug found on the way.** A ring's slots were cut to its band when it was built. Once the near ring's band moved out
with the zoom, ground from 13 to 18 m showed bare. Each ring-anchored ring's slots now cover the widest band it takes
at any level and zoom (`slotBand`, with a regression test).

## Redesign (proposal, 2026-10-31: not built)

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

### Option A: thin the near ring's grass inside its own shader, at Balanced only (recommended)

**What changes.** At Balanced the near ring's material is swapped for a variant compiled with one define
(`GRASS_THIN`). In that variant, a *grass* clump beyond the cut is dropped by its own hash:
- the share dropped ramps from 0 at 8 m to one half at 12 m;
- across `CLOSE_ZOOM` (70–110 m) it falls back to 0, so from 110 m out Balanced draws Full.

A dropped clump stops right after the meadow-map read that tells grass from crop. It costs about what an empty cell
costs Full. The kept grass clumps, the crops and everything inside 8 m are drawn as Full draws them. There are no
other rings, no world chunks and no per-frame CPU.

Two variants to choose between on stills:
- **A1, half the clumps:** the cheapest vertex work, but the carpet is sparser by whole 0.5 m tufts.
- **A2, half the blades of every clump:** each grass vertex reads a blade-parity attribute and the odd blades
  collapse. The texture is more even, but every vertex still runs, so the saving is fragments only.

A1 and A2 can be combined if one alone saves too little.

**How the crops stay identical to Full.** The drop applies only on the grass branch (`!crop`), after the crop
decision. Crop clumps take the same code, the same hashes and the same clump as in Full's shader.

**Why Full costs nothing.** Full keeps main's material, shader text and defines. The variant is a second material,
compiled on the first switch to Balanced. Switching only assigns the near ring's material, live. Full therefore
compiles, binds and draws exactly what main does: no new uniform, chunking, attribute or ring.

A2 adds a blade-parity vertex buffer to the large clump's mesh. Full's effect does not declare it, so it is never
bound, but it costs 600 bytes. A1 adds nothing.

**Work at Balanced (A1), up close.**

| zone | vertex invocations | per-clump logic | fragments |
|---|---|---|---|
| 0–8 m | as Full | as Full | as Full |
| 8–12 m | as Full | 0–50 % fewer grass clumps (the ramp) | as the logic |
| 12–25 m | as Full: 150 a cell | half the grass clumps stop early | the grass clumps' fragments halved |

On the 12–25 m zone, against Full:
- **Kobelnitz:** about 1,200 grass clumps of about 2,400 stop early. That is 31 % less per-clump logic over the
  growing cells (2,650 full clumps against 3,870).
- **The demo** (a meadow view, about 4,800 grass cells): about 2,400 stop early, half of the zone's work.

The saving is a guess: about 0.3–0.6 ms at the close camera on Kobelnitz, more on the demo's meadow. The earlier
variant that thinned the crops too measured 0.8–1.0 ms. **Risk:** A1 alone may not reach Kobelnitz's 8.3 ms (it
needs about 0.6 ms). A2 on top, or a larger dropped share, are the knobs.

**Memory, CPU and uploads.**
- One more material and effect: one compile on the first switch, a few tens of ms, avoidable by compiling it
  asynchronously at load.
- No per-frame CPU beyond one uniform (the drop share).
- No uploads.

**Size.**
- About 30 shader lines inside `#ifdef GRASS_THIN`.
- About 40 TypeScript lines: the second material, the swap, the drop share by zoom.
- Pure tests for the drop share by distance and zoom, and that Full's material is main's.
- It removes the cut, crop and world rings, `uBandMix`, `uRing`, `CHUNKS_NEAR` and `meadow-clump.ts`'s thinning: the
  branch gets smaller than main plus the current work.

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
