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
  - the presets;
  - the rings a preset draws, and a ring's band by zoom (`bandAt`);
  - the thinned clump (every other blade).
- **`src/look/meadow.ts`**: builds its rings and clumps from the preset. Full gives main's rings and clumps, with the
  same bands.
- **The look page's settings panel**: a Grass detail select (Full | Balanced). A change reloads the page with
  `?grassdetail`, because the meadow's rings are built once.
- **Docs**: `docs/systems/look.md` (the setting) and decision 0092 (a player option over decision 0085's meadow).
- **Tests**: the parsing, the presets' rings and bands, the thinned clump.

Not in scope:
- the crops drawn as ground paint;
- per-clump work (the research note's option 3);
- the game's own settings menu.

## Approach

**What Balanced draws.** It cuts the near (0.5 m) ring in two at 8–12 m from the focus:
- inside the cut, the large clump;
- outside the cut, on the same cells, the small clump with every other blade, scaled to the large clump's footprint.

The cut moves out to the ring's edge as the camera's radius goes from 70 to 110 m, the zoom over which the combed
clumps already widen up close (`CLOSE_ZOOM`). From 110 m out, which includes the default zoom of 125 m, the near ring
is Full's and the thinned ring is not drawn. The outer rings and the crops stay as at Full.

**The tuning.** Each step below is a single run on Kobelnitz on the dev Mac (M1 Pro, ANGLE Metal), with the GPU
frame p50 in ms:

| Balanced tried | close | default | wide |
|---|---|---|---|
| every ring thinned, widened ×1.4, the inner rings cut from 60 m (the experiment's `thin`) | −0.6 to −0.7 | +0.3 to +0.5 | 0 |
| every ring thinned, not widened, main's 150 m cut | −0.7 to −0.85 | +0.05 to +0.12 | 0 |
| only the near ring's 8–25 m thinned, at every zoom | −0.8 to −1.0 | 0 to +0.1 (the demo: +0.4 to +0.7) | 0 |
| the same, its cut moving out from 70 to 110 m of radius (built) | −1.1 to −1.2 | 0 | 0 |

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

**Measurement.** Dev Mac (M1 Pro, ANGLE Metal), `vite build` + `vite preview`, `tools/bench-look.mjs --gpu metal`,
1920×1080, the l2 arm, GPU frame p50 in ms.

**Rounds.** Two alternated rounds under the bench lock:
- Round 1: Kobelnitz then the demo, Full first. It started at a 1-min load of 4.92.
- Round 2: the demo then Kobelnitz, Balanced first. It started at 4.88.

Every run also waited for a load of 5 or less (4.56–4.95 at their starts). Each cell is the mean of four runs (two
per round). The runs agreed within 0.1 ms.

| camera | Kobelnitz Full | Balanced | Δ | demo Full | Balanced | Δ |
|---|---|---|---|---|---|---|
| close −45 | 8.85 | **7.76** | −1.09 | 7.07 | 6.51 | −0.56 |
| close 0 | 8.90 | **7.79** | −1.11 | 6.98 | 6.50 | −0.48 |
| close +45 | 9.03 | **7.80** | −1.23 | 6.60 | 6.33 | −0.27 |
| default −45 | 8.50 | 8.49 | −0.01 | 9.11 | 9.10 | −0.01 |
| default 0 | 8.71 | 8.72 | +0.01 | 9.03 | 9.00 | −0.03 |
| default +45 | 8.62 | 8.65 | +0.03 | 9.43 | 9.40 | −0.04 |
| wide −45 | 8.92 | 8.98 | +0.06 | 12.52 | 12.42 | −0.11 |
| wide 0 | 9.04 | 9.04 | −0.01 | 13.76 | 13.67 | −0.08 |
| wide +45 | 8.77 | 8.77 | 0.00 | 12.46 | 12.40 | −0.06 |

**Results:**
- **Close.** Balanced puts Kobelnitz's close cameras under 8.3 ms, at 7.8.
- **Default and wide.** Balanced is even with Full.
- **Stills.** At 125 m, Balanced's stills equal Full's pixel for pixel on Kobelnitz, and differ by one pixel by one
  level on the demo.
- **What it costs the eye.** Past about 10 m the close carpet is thinner and a little darker, with more ground
  between its strokes. Inside 8 m nothing changes.

**A bug found on the way.** A ring's slots were cut to its band when it was built. Once the near ring's band moved out
with the zoom, ground from 13 to 18 m showed bare. Each ring's slots now cover the widest band it takes at any zoom
(`slotBand`, with a regression test).
