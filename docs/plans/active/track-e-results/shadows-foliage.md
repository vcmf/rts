---
status: active
last_reviewed: 2026-10-13
---

# Results: the shadows and the leaf-card crowns (2026-10-12/13)

The measurements of four PRs in one place, for `docs/plans/active/track-e-look.md`: the shadow look (#59,
`docs/plans/done/shadow-look.md`), the soft shadows (#60, `docs/plans/done/soft-shadows.md`), the leaf-card crowns
(L7a, #58, `docs/plans/done/l7a-canopy-cards.md`) and their volume light (L7b, #61,
`docs/plans/done/l7b-crown-volume.md`). Every number is from the dev Mac (Apple M1 Pro, ANGLE Metal, headless
Chrome): a proxy that passes no gate. The min-spec laptop's run is still owed (owner question 1). Each table says
its frame size and which arms it compares; the plans hold the full runs.

## The cost of the stack

**The reliable numbers are A/B runs on one page**, the two arms interleaved at each camera (A B B A), so the
machine's state is the same for both; the paired difference per camera is reported with the repeat spread (the
largest difference between two runs of one arm at one camera). On the normal scene:

| One-page A/B (`--gpu metal`) | close | default | widest | where |
|---|---|---|---|---|
| Cards against pack crowns (`?bench=trees`) | about 0 | — | +0.1 to +0.4 ms | `docs/plans/done/l7a-canopy-cards.md` |
| Volume light against L7a (`?bench=volume`) | within ±0.2 ms | within ±0.2 ms | within ±0.2 ms | `docs/plans/done/l7b-crown-volume.md` |

**Where a forest fills the frame** (`?wood=big`, the forest bench, `docs/plans/active/forest-bench.md`): the cards
cost about **+3 ms at the default zoom and +1.5 ms at the widest** against the pack crowns (the cleaner of two
runs, its repeat spread under 0.6 ms); the default frame goes from 11.3 to 14.4 ms of the 16.7 ms a frame at
60 fps, before units, smoke and anti-aliasing. The volume light's cost in the forest could not be read (the
machine changed during the run). **This is the cards' open cost:** L7 owes a cheaper forest (far crowns as fewer,
larger cards or the pack mesh; L7's depth pre-pass against overdraw) before the cards become the default.

**Across runs** (`node tools/bench-look.mjs <page> --gpu metal --hold 4` at 1920×1080, four separate runs back to
back on 2026-10-13; GPU frame p50 in ms, the mean of the three yaws, each run twice). Each bench has two arms of the
terrain's grain: **l2**, the detail layer the page ships, and **l0**, the L0 grain it replaced. The JSON files are
beside this one (`shadows-foliage-2026-10-13-*-mac-proxy.json`).

| Zoom, arm | main before (923db25) | main after #58–#60 (0ed259f) | the same, `?trees=cards` | L7b (e41e38c), `?trees=cards` |
|---|---|---|---|---|
| Close, l2 | 6.17 | 5.53 | 5.53 | 5.67 |
| Default, l2 | 8.26 | 7.73 | 7.79 | 7.98 |
| Widest, l2 | 13.09 | 12.14 | 12.31 | 12.62 |
| Widest, l0 | 9.75 | 9.01 | 9.28 | 9.91 |
| Draw calls, triangles | 39, 2.02 M | 39, 2.02 M | 51, 1.97 M | 51, 1.97 M |

- **These differences are not costs.** One camera run twice differs by up to 1.8 ms in the "before" run (the machine
  was busy), and by up to 0.9 ms (cards) and 1.1 ms (L7b) in the later ones, more than most of the differences
  between the columns. The one-page A/Bs above are the measurement; this table shows only that no column is far
  from the others on the normal scene.
- **Not measured:** the shadow look's per-frame cost (its extra shader operations: an unmeasured estimate of no
  visible cost; the "before" run is too noisy to show it); the min-spec laptop; the foliage overdraw.
- **Nothing per frame from the soft shadows:** they are baked on load, 38–45 ms more on the dev Mac (the sky's
  occlusion 25–32 ms on the CPU; the light-map bake from 1.1–1.4 ms to 14.1–14.2 ms on the GPU, about 13 ms
  more). A slower GPU takes longer (unmeasured: an estimate of a few times the Mac's on an integrated one).

## The shadows

From the plans; their frame size is 1600×900 and their crowns the leaf cards (`?trees=cards`).

| Measured | before | after | where |
|---|---|---|---|
| A tree's cast shadow ÷ the lit ground beside it, in the valley (luma) | 0.98 | 0.78 | #59 against main (the plan's target: at most 0.75) |
| The same on the slope | 0.69 | 0.70, cooler | #59 against main (target: about 0.55, not reached) |
| Shadow edges in the light map, 20→80 % width: the crispest 10 %, median, 90th percentile | 0.24, 0.31, 0.62 m | 0.24, 0.37, 1.06 m | #60, `?soft=off` against soft (both after #59) |
| A dense wood's floor between trunks (luma, `?wood`, mid view) | 62.6 | 40.9 | #60, `?soft=off` against soft |

Both of the shadow look's targets were missed: the valley by 0.03, the slope by much more (a deeper variant reached
0.65 and 0.62 but cost the guard more; `docs/plans/done/shadow-look.md`). Slope shadows are still the weaker ones.

## The crowns

At 1600×900, a box inside one crown of the near view (`docs/plans/done/l7b-crown-volume.md`).

| One lone crown | L7a cards (`?volume=off`) | L7b volume |
|---|---|---|
| Luma, 5th–95th percentile | 131–170 | 84–182 |
| Value levels (4-luma bins over 1 % of it) | 13 | 29 |

## The readability guard (`node tools/guard.mjs`)

- `wheat.France` in summer (a dark blue block in a tree's cast shadow) is the one block that regressed against
  its base (threshold 0.10): 0.100 on main before, **0.098** after the shadow look (waived by the owner,
  2026-10-13: a stand-in, judged again with the real figures in L3 and L4), the same with the soft shadows;
  **0.071** with the leaf cards (#63, to fix before the cards become the default).
- Some blocks fail on main already and still do (`fails*`, a palette question: `l2a-baseline.md`), among them
  `wheat.Britain` at 0.099; none of them got worse.
- The guard has no block inside a wood, where the floor is now darkest (above).
