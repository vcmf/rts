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

- **One strength gain** on the decal's darkening, `?ushgain=<close>[,<far>]` (0.5 to 3; 1 is the shadow as #175
  shipped it), part of the look (`ShadowLook.gain` in `src/look/shadow-look.ts`), so it turns from the close value to
  the far one over the look's band (45 to 85 m) like the other settings.
- A comparison sheet for the owner (gains 1, 1.25, 1.5, 1.75 and 2 at the close, default and wide zooms, a tree's
  cast shadow in frame as the reference) and the shadow's contrast measured at each.
- Then, once the owner picks: the chosen gain as the default in `SHADOW_LOOK`, a Metal bench, and the system doc
  (`docs/systems/look.md`).

Out: the shadow's shape, size, softness, length and foot gradient (decision 0062's, unchanged); a figure shadow map.

## Approach

- Today the decal darkens a covered sample toward the ground's shade `k` (the ratio of its painted cast shadow to its
  light, `src/look/shaders/unitshade.frag`) by `f` (the zoom's cross-fade share, the shadows on, the look's darkest
  value): `d = max(mix(1, k, f), 0)`. So far the darkest it gets is about the ground's own cast shadow.
- **The gain** raises the darkening's luminance to its power, the three channels scaled alike:
  `d · L(d)^(gain - 1)` (`L`: Rec. 709 luminance; `src/look/shaders/unitdecal.frag`, mirrored by `shadowShade` in
  `src/look/shadow-look.ts`). It can go past the ground's own shadow without the problems of extrapolating the `mix`
  past `k`: never below 0 (no black, no clamped channel), the hue of the ground's shadow kept (the channels' ratios do
  not change), nothing darkened where the ground already lies in full shadow (`k` 1, `d` 1), and exactly today's
  shadow at 1. It applies to the whole darkening, so the foot and the tip both get stronger and the gradient keeps its
  shape (in luminance, each point's ratio to the lit ground raised to the same power).
- **Overlaps**: the gain is one uniform for every shadow (`uShGain`), applied to the darkness, not to the coverage; so
  decision 0062's rule holds at any gain (every shadow darkens a covered sample alike, the stencil lets the first
  through, the darkest share wins whatever the draw order). `decalFragment` takes the gain and its tests check the
  rule with it.
- Cost: a dot, a `pow` and a multiply a fragment, no reads (an estimate: ALU only; the Metal bench comes with the
  default).

## Measurements (2026-10-26, before the default changes)

The look page's production build, `?armies=20`, Metal, 1600 × 900, the same camera (alpha −1.92, beta 0.8, target
(142, 4.7, −96): the front of the battalion nearest the armies' focus, beside a clump of trees) at 20, 63 and 125 m. Linear luminance of the frame with the
soldiers' shadows over the same frame with `?unitshadow=0`, over the pixels the shadow darkens at gain 1 (more than
3 %): the median and the darkest 10 %. The tree's cast shadow: two patches in it against lit ground beside them.

| zoom | tree shadow | gain 1 (today) | 1.25 | 1.5 | 1.75 | 2 |
|---|---|---|---|---|---|---|
| close, 20 m | 0.18 | 0.58 / 0.37 | 0.53 / 0.30 | 0.48 / 0.25 | 0.44 / 0.21 | 0.41 / 0.18 |
| default, 63 m | 0.17 | 0.55 / 0.38 | 0.49 / 0.31 | 0.45 / 0.25 | 0.41 / 0.21 | 0.38 / 0.18 |
| wide, 125 m | 0.17 | 0.43 / 0.29 | 0.36 / 0.22 | 0.30 / 0.17 | 0.26 / 0.13 | 0.22 / 0.10 |

(median / darkest 10 %, the shadowed ground's luminance as a share of the same ground unshadowed.) Today even the
darkest tenth of a soldier's shadow keeps about twice the light of a tree's shadow (0.29 to 0.38 against 0.17). The
darkest tenth reaches the tree's at about gain 1.5 at the wide zoom and 2 up close (where the look is lighter at the
tip by design). The sheets: `output/armies-review/18-shadow-darker/` in the main checkout (not in git).

## Acceptance

- `?ushgain` absent or 1: the frame as #175 shipped it (the shader's gain step is exact at 1).
- Darker at every gain above 1, at every zoom, the hue kept, no black, the foot still darker than the tip.
- Overlapping shadows no darker than the darker one alone (the rule's tests in `test/shadow-look.test.ts`).
- The owner picks the gain from the sheet; then the default, the Metal bench (no measurable cost expected) and the
  system doc.

## Open questions

- One gain at every zoom, or a different one close and far (the switch takes both)?
