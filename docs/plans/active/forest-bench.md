---
status: active
last_reviewed: 2026-10-13
---

# Plan: a forest bench (the leaf cards' cost where trees fill the frame)

Track E, L7 (`docs/plans/active/track-e-look.md`, what L7 still owes: foliage ≤ 3 ms in a battlefield forest).
The owner (2026-10-13), on the cards' cost: "is the performance cost dangerous?", then "do the forest bench".

## Problem

The bench's cameras orbit the camera's start (`START`, `src/look/post.ts`); its woods are small groves, and the
dense test wood (`?wood`, `docs/plans/done/soft-shadows.md`) is 95 m away, a corner of the widest view only. The
cards' cost grows with the crowns on screen (alpha-tested quads over each other), so no bench has measured them
where a forest fills the frame.

## Scope (tooling on the look page)

- `?wood=big`: a forest of about 150 m by 110 m west of the river (its own random stream, the placement rule as
  every tree; `?wood` alone keeps the small wood).
- `?benchat=<x>,<z>`: the bench's cameras orbit that point instead of the start (with `?bench` only); the JSON
  records it.

## Acceptance

- `npm test`; the default page unchanged (goldens against main: neither switch is on by default).
- The bench's views at the forest (screenshots: it fills them), then `?trees=cards&wood=big&benchat=…` with
  `?bench=trees` (cards against pack crowns) and `?bench=volume` (L7b against L7a), each arm interleaved on one page,
  the paired difference per camera reported with the repeat spread (Results, below).

## Results (2026-10-13, the dev Mac, a proxy)

The bench's views at the forest (`?trees=cards&wood=big`, focus −110, −25): it fills the closest and the default
views and much of the widest. Runs: `node tools/bench-look.mjs '…/app/look.html?trees=cards&wood=big&benchat=-110,-25&bench=…' --gpu metal`
(the JSON files in `docs/plans/active/track-e-results/`, named `forest-2026-10-13-…-mac-proxy.json`). Each camera runs both arms
twice, interleaved (A B B A), so the paired difference per camera holds the machine's state; the repeat spread is
the largest difference between the two runs of one arm at one camera.

| Cards against pack crowns, GPU frame p50 (ms) | close | default | widest |
|---|---|---|---|
| Run 1: cards, pack | 10.83, 9.62 | 21.48, 16.53 | 30.97, 28.03 |
| Run 1: paired difference per camera (3 yaws) | +1.62, +0.91, +1.10 | +6.51, +3.51, +4.82 | +2.43, +3.81, +2.57 |
| Run 1: repeat spread | 1.39 | 12.51 | 2.08 |
| Run 2 (`--hold 5`, a quieter machine): cards, pack | 19.27, 16.86 | 14.43, 11.32 | 15.65, 14.15 |
| Run 2: paired difference per camera | +7.11, +0.25, −0.13 | +3.30, +2.72, +3.30 | +1.48, +1.50, +1.51 |
| Run 2: repeat spread | 11.46 | 0.59 | 0.14 |

- **Where a forest fills the frame the cards cost about +3 ms at the default zoom and +1.5 ms at the widest**
  (run 2, its spread under 0.6 ms; run 1 agrees in sign at every camera, larger and noisier). The closest zoom's
  runs are too noisy to read. The scatter pass (all nature: trees, grass, flowers, wheat) goes from 5.58 to 6.89 ms
  at the default zoom, so the foliage alone is not separated by this bench.
- **The default frame in the forest:** 11.3 ms with the pack crowns, 14.4 ms with the cards, of the 16.7 ms a frame
  at 60 fps; before units, smoke and anti-aliasing.
- **The volume light (L7b against L7a, one run):** not readable: the machine changed during the run (the closest
  zoom took 20 ms against run 2's 10–19 ms) and the paired differences straddle zero (−3.1 to +2.5 ms). L7b's own
  bench on the normal scene put it within ±0.2 ms.
- Draw calls 51 against 39; triangles 2.62 M against 2.84 M here. L7a's plan counted +8.9k triangles for the cards
  on the normal scene; why the sign differs between the two scenes was not looked into.
