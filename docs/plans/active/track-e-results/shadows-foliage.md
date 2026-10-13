---
status: active
last_reviewed: 2026-10-13
---

# Results: the shadows and the leaf-card crowns (2026-10-12/13)

The measurements of four PRs in one place, for `docs/plans/active/track-e-look.md`: the shadow look (#59,
`docs/plans/done/shadow-look.md`), the soft shadows (#60, `docs/plans/done/soft-shadows.md`), the leaf-card crowns
(L7a, #58, `docs/plans/active/l7a-canopy-cards.md`) and their volume light (L7b, #61,
`docs/plans/active/l7b-crown-volume.md`). Every number is from the dev Mac (Apple M1 Pro, ANGLE Metal, headless
Chrome, 1920×1080): a proxy that passes no gate. The min-spec laptop's run is still owed (owner question 1).

## The cost of the stack

`node tools/bench-look.mjs <page> --gpu metal --hold 4`, run back to back; GPU frame p50 in ms, the mean of the
bench's three yaws at each zoom. The JSON files beside this one, `shadows-foliage-2026-10-13-*-mac-proxy.json`.

| Zoom | main before (923db25) | main after #58–#60 (0ed259f) | the same, `?trees=cards` | L7b (e41e38c), `?trees=cards` |
|---|---|---|---|---|
| Close | 6.17 | 5.53 | 5.53 | 5.67 |
| Default | 8.26 | 7.73 | 7.79 | 7.98 |
| Widest | 13.09 | 12.14 | 12.31 | 12.62 |
| Draw calls, triangles | 39, 2.02 M | 39, 2.02 M | 51, 1.97 M | 51, 1.97 M |

- "Before" came out slower than "after", though the shadow work only adds GPU work: the run-to-run noise on this
  machine is about ±0.5 ms. Within it, the whole stack costs nothing measurable; the cards add about 0.1–0.2 ms
  and the volume light 0.15–0.3 ms at the widest zoom (L7a's and L7b's own benches agree: `?bench=trees`,
  `?bench=volume`).
- **Nothing per frame from the soft shadows:** they are baked on load, about 45 ms more (the sky's occlusion
  25–32 ms on the CPU, the light-map bake 1.3 to 14 ms on the GPU).
- **Not measured yet:** a battlefield forest (the bench's woods are small; the cards' cost grows with the trees on
  screen: `?wood` is a dense wood to bench it), the min-spec laptop, the foliage overdraw (L7's acceptance).

## The shadows

| Measured | before | after |
|---|---|---|
| A tree's cast shadow ÷ the lit ground beside it, in the valley (luma) | 0.98 | 0.78 |
| The same on the slope | 0.69 | 0.70 (cooler) |
| Shadow edges in the light map, 20→80 % width: the crispest 10 %, median, 90th percentile | 0.24, 0.31, 0.62 m | 0.24, 0.37, 1.06 m |
| A dense wood's floor between trunks (luma, `?wood`, mid view) | 62.6 | 40.9 |

## The crowns

| One lone crown (near view) | pack crowns | L7a cards | L7b volume |
|---|---|---|---|
| Luma, 5th–95th percentile | – | 131–170 | 84–182 |
| Value levels (4-luma bins over 1 % of it) | – | 13 | 29 |

## The readability guard (`node tools/guard.mjs`)

- `wheat.France` in summer (a dark blue block in a tree's cast shadow) is the one block near the threshold
  (0.10): 0.100 on main before, **0.098** after the shadow look (waived by the owner, 2026-10-13: a stand-in, judged
  again with the real figures in L3 and L4), the same with the soft shadows; **0.071** with the leaf cards
  (#63, to fix before the cards become the default). Every other block passes against its base.
- The guard has no block inside a wood, where the floor is now darkest (above).
