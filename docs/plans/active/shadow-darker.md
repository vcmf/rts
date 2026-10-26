---
status: active
last_reviewed: 2026-10-26
---

# Plan: the soldiers' simple shadows darker

Asked by the owner (2026-10-26), of the simple shadows shipped in #175 (decision 0062,
`docs/plans/done/soft-shadows-all.md`): "i still do think the new shadow good but a bit too weak, can we make it
darker pls". Everything else the owner chose stays: soft, small, darker at the feet than at the tip, the cheap decal
at every zoom, no figure shadow map. Only the strength changes.

## Scope

In:

- **One strength gain** on the decal's darkening, `?ushgain=<close>[,<far>]` (1 to 3; 1 is the shadow as #175
  shipped it), part of the look (`ShadowLook.gain` in `src/look/shadow-look.ts`), so it turns from the close value to
  the far one over the look's band (45 to 85 m) like the other settings.
- A comparison sheet for the owner (gains 1, 1.25, 1.5, 1.75 and 2 at the close, default and wide zooms, a tree's
  cast shadow in frame as the reference) and the shadow's contrast measured at each.
- Then, once the owner picks: the chosen gain as the default in `SHADOW_LOOK`, a Metal bench, and the system doc
  (`docs/systems/look.md`). **The owner's choice (2026-10-26): 2 up close, 1.5 far** (`?ushgain=2,1.5`), turned
  from one to the other over the band (1.75 at its middle, about 65 m), the bench showing no cost (below).

Out: the shadow's shape, size, softness, length and foot gradient (decision 0062's, unchanged); a figure shadow map.

## Approach

- Today the decal darkens a covered sample toward the ground's shade `k` (the ratio of its painted cast shadow to its
  light, `src/look/shaders/unitshade.frag`) by `f` (the zoom's cross-fade share, the shadows on, the look's darkest
  value): `d = max(mix(1, k, f), 0)`. So far the darkest it gets is about the ground's own cast shadow.
- **The gain** (decision 0067) raises the full darkening's luminance to its power, the three channels scaled alike:
  `d · L(d)^(gain - 1)` (`L`: Rec. 709 luminance; `src/look/shaders/unitdecal.frag`, mirrored by `shadowShade` in
  `src/look/shadow-look.ts`). Only that full darkness (the one every covered sample takes) is raised; a shadow's
  lighter parts take it on fewer samples (alpha to coverage) or by their share `a` (without, `?msaa=1|2`: the gained
  darkening mixed toward none by `a`, so both paths give a pixel the same result; `decalPixel`). It can go past the
  ground's own shadow without the problems of extrapolating the `mix` past `k`: never below 0 (no black), the hue of
  the ground's shadow kept wherever `max(…, 0)` clamps no channel (the channels' ratios do not change), nothing
  darkened where the ground already lies in full shadow (`k` 1, `d` 1), and exactly today's shadow at 1. The foot
  and the tip both get darker (the foot's full darkness raised, the tip's lighter coverage spreading it), so the
  gradient keeps its order. The switch takes 1 to 3: below 1 the power would brighten a channel.
- **Overlaps**: the gain is one uniform for every shadow (`uShGain`), applied to the darkness, not to the coverage; so
  decision 0062's rule holds at any gain (every shadow darkens a covered sample alike, the stencil lets the first
  through, the darkest share wins whatever the draw order). The tests resolve each sample's colour through the gain
  and check the rule on it.
- Cost: a dot, a `pow` and a multiply a fragment, no reads; measured on Metal below (no measurable cost).

## Measurements (2026-10-26, before the default changes)

The look page's production build, `?armies=20`, Metal, 1600 × 900, the same camera (alpha −1.92, beta 0.8, target
(142, 4.7, −96): the front of the battalion nearest the armies' focus, beside a clump of trees) at 20, 63 and 125 m,
each gain the same close and far (`?ushgain=<g>,<g>`). Linear luminance of the frame with the soldiers' shadows over the same frame with `?unitshadow=0`, over the pixels the shadow darkens at gain 1 (more than
3 %): the median and the darkest 10 %. The tree's cast shadow: two patches in it against lit ground beside them.

| zoom | tree shadow | gain 1 (today) | 1.25 | 1.5 | 1.75 | 2 |
|---|---|---|---|---|---|---|
| close, 20 m | 0.18 | 0.58 / 0.37 | 0.53 / 0.30 | 0.48 / 0.25 | 0.44 / 0.21 | 0.41 / 0.18 |
| default, 63 m | 0.17 | 0.55 / 0.38 | 0.49 / 0.31 | 0.45 / 0.25 | 0.41 / 0.21 | 0.38 / 0.18 |
| wide, 125 m | 0.17 | 0.43 / 0.29 | 0.36 / 0.22 | 0.30 / 0.17 | 0.26 / 0.13 | 0.22 / 0.10 |

(median / darkest 10 %, the shadowed ground's luminance as a share of the same ground unshadowed.) Today even the
darkest tenth of a soldier's shadow keeps about twice the light of a tree's shadow (0.29 to 0.38 against 0.17). The
darkest tenth reaches the tree's at about gain 1.5 at the wide zoom and 2 up close (where the look is lighter at the
tip by design). The sheets: `output/armies-review/18-shadow-darker/` in the main checkout (not in git). The chosen
2 up close and 1.5 far match the tree's shadow in their darkest tenth at those zooms.

### The cost (Metal, 2026-10-26)

`node tools/bench-look.mjs <url> <json> --gpu metal`, production builds (main aae9c97 against this branch), both
`?armies=20&benchr=40,63,125,250`, the arms alternated, 2 rounds; each value the mean over the three yaws of the
default arm's (`l2`) p50, ms, the two rounds in brackets.

| zoom | main frame | main GPU | 1.5 frame | 1.5 GPU | 2,1.5 frame | 2,1.5 GPU |
|---|---|---|---|---|---|---|
| 40 m | 9.11 (9.02, 9.20) | 13.29 (13.15, 13.43) | 9.14 (9.03, 9.25) | 13.32 (13.07, 13.56) | 9.09 (9.10, 9.08) | 13.23 (13.26, 13.21) |
| 63 m | 10.09 (9.80, 10.38) | 14.49 (13.90, 15.08) | 9.89 (9.75, 10.03) | 14.06 (13.85, 14.27) | 9.93 (9.95, 9.90) | 14.11 (14.11, 14.11) |
| 125 m | 10.65 (10.35, 10.95) | 14.16 (13.53, 14.78) | 10.57 (10.38, 10.77) | 13.79 (13.49, 14.09) | 10.58 (10.42, 10.75) | 13.89 (13.70, 14.07) |
| 250 m | 6.68 (6.63, 6.72) | 9.78 (9.59, 9.97) | 6.91 (6.85, 6.97) | 9.88 (9.69, 10.07) | 7.03 (6.68, 7.37) | 10.46 (9.75, 11.17) |

A first two-arm run (main against 1.5, the same way) gave GPU p50s of 13.24 / 13.60, 14.12 / 14.25, 14.05 / 13.93
and 10.00 / 9.85 ms. Every difference lies within the run-to-run spread (main's own two rounds differ by up to
1.25 ms of GPU p50); no arm is consistently slower. At 250 m both gained arms draw the same (the far gain 1.5), so
their 0.6 ms gap there, one round at 11.17 ms, is the spread.

### The moods and seasons (2026-10-26, the default 2 / 1.5 against `?ushgain=1,1`)

The same camera and measure, the soldiers' shadows' share of the unshadowed ground's luminance: median / darkest
10 % / darkest 2 % (the contact). Winter shot at 1280 × 720 (at 1600 × 900 its frame passes DevTools' 4 MiB message
limit). Sheets: `moods-close.jpg`, `moods-default.jpg`, `moods-wide.jpg` beside the others.

| mood, zoom | `?ushgain=1,1` | 2 / 1.5 |
|---|---|---|
| epic summer, 20 m | 0.58 / 0.37 / 0.29 | 0.41 / 0.18 / 0.12 |
| epic summer, 63 m | 0.55 / 0.38 / 0.27 | 0.41 / 0.21 / 0.10 |
| epic summer, 125 m | 0.43 / 0.29 / 0.28 | 0.30 / 0.17 / 0.15 |
| epic winter (snow), 20 m | 0.69 / 0.37 / 0.30 | 0.57 / 0.19 / 0.14 |
| epic winter (snow), 63 m | 0.60 / 0.42 / 0.31 | 0.45 / 0.25 / 0.13 |
| epic winter (snow), 125 m | 0.47 / 0.33 / 0.31 | 0.34 / 0.20 / 0.18 |
| golden, 20 m | 0.67 / 0.50 / 0.43 | 0.50 / 0.30 / 0.22 |
| golden, 63 m | 0.65 / 0.50 / 0.40 | 0.51 / 0.33 / 0.22 |
| golden, 125 m | 0.55 / 0.43 / 0.40 | 0.44 / 0.30 / 0.27 |
| temperate, 20 m | 0.64 / 0.46 / 0.38 | 0.47 / 0.25 / 0.19 |
| temperate, 63 m | 0.62 / 0.47 / 0.36 | 0.48 / 0.29 / 0.18 |
| temperate, 125 m | 0.52 / 0.40 / 0.37 | 0.40 / 0.26 / 0.23 |

The contact's darkest 2 % stays at 0.10 or more everywhere (the darkest half per cent 0.07 to 0.08 at 20 m, under
the men themselves); on snow it is lighter than on summer grass (0.13 to 0.18), a blue-grey, not black. No floor is
needed. (The page has three moods, golden, temperate and epic, the default with the dark water; no dusk.)

## Acceptance

- `?ushgain=1,1` (both values: one alone sets only the close one): the frame as #175 shipped it (the shader's gain
  step is exact at 1).
- Darker at every gain above 1, at every zoom, the hue kept, no black, the foot still darker than the tip.
- Overlapping shadows no darker than the darker one alone (the rule's tests in `test/shadow-look.test.ts`).
- The owner picks the gain from the sheet (done: 2 up close, 1.5 far); then the default, the Metal bench (done: no
  measurable cost) and the system doc.
- The goldens against main: only the soldiers' shadows darker.
