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
- outside the cut, on the same cells, the small clump with every other blade, scaled to the large clump's footprint
  (by the thinned clump's own radius);
- the crops on the near ring out to its edge at both levels.

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

**Review round 1 (2026-10-31)** found that Balanced grew the crops with the thinned clump, and that the cut ring
popped at 110 m. Both are fixed:
- The crops stay the near ring's at both levels.
- The near ring and the cut ring hand over continuously, always adding to one.

The numbers measured before those fixes (Kobelnitz close about 1.1 ms less) no longer stand: part of that saving
was the crops. One final pass after the last review round will rebench (Kobelnitz close, default, wide and a 90 m
view, plus the demo, in two alternated rounds), reshoot the stills and redo the goldens.

**A bug found on the way.** A ring's slots were cut to its band when it was built. Once the near ring's band moved out
with the zoom, ground from 13 to 18 m showed bare. Each ring's slots now cover the widest band it takes at any level
and zoom (`slotBand`, with a regression test).
