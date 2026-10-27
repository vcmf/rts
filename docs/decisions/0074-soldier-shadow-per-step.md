---
status: accepted
date: 2026-10-27
---

# 0074 The soldiers' shadow from their pose up close, baked per animation step; no contact oval

Amends 0062 (the simple shadow at every zoom) and supersedes 0071's contact oval as the default. 0071's other parts
stay: no part of a soldier's shadow darker than the ground's painted cast shadow (the shade k), the shade's hue turned
toward its grey, the gain 1. Accepted by the owner on 2026-10-27: the per-step shadow without the oval, then variant B
for the feet. The plan and its measurements: `docs/plans/active/step-shadows.md`; as built: `docs/systems/look.md`
("The armies"). #229.

## Context

- 0062's shape is one bake a role and a facing, averaged over each clip, so a marching man's feet leave it. 0071
  held them with an oval under the feet, which carpets the ground under dense marching and firing formations.
- The owner, 2026-10-27: a "basically correct" shadow, the shadow of each man's actual pose, crisp at the foot and
  blurred on top, cheap. Then, of the per-step shadow without the oval: "make the shadow at feet sharper and darker".
- Measured (the plan): from the figure's data, the shadow touches 93 % of the marching feet and 73 % of the running
  ones at 8 bins and 8 facings, against 47 % and 14 % for the averaged shape. The rest of the running feet are in the
  air. The frame cost was within the bench's spread at every zoom.

## Decision

- **Per step up close.** The shape is baked per clip step bin and facing: 8 bins a clip (a clip of fewer steps gets
  a bin a step), 8 facings, each bin the average of its own steps (`shadowShape`'s `steps`, `stepBin`). The decal's
  vertex shader picks the man's bin from his step, the rule `units.vert` poses him by, so his shadow steps with his
  legs at 12 fps; the bin is held, not blended (`?ushstep=…,blend` is the alternative).
- **Only in the near material.** It is read within the contact's old band, whole to 60 m and drawn to 100 m from the
  camera's focus (`nearWeight`, `nearOn`). Past 100 m the far material draws 0062's averaged shape, as before. Two
  atlases, RG8 with mips: the averaged one (1792 × 640, 2.9 MB) and the per-step one (1792 × 2560, 11.7 MB).
- **The feet darker and crisper, never past k.** In the per-step material the shape's share of the samples is
  tripled at the soles and behind them, back to 1 by 0.6 m along the shadow (`footSharpen`, `FOOT_SHARP`). The share is
  capped at 1, so the feet go at most to the shade k, 0071's ceiling; the soft fade toward the tip is 0062's.
- **No contact oval by default.** The oval stays behind `?ushcontact=1` (0071's), or `<pad>,<dark>[,<soft>]`.
- **Switches:** `?ushstep=<steps>[,<facings>[,hold|blend]]` (0: the averaged shape at every zoom),
  `?ushfootk=<boost>[,<reach m>]` (1: none). **`?ushstep=0&ushcontact=1` is 0071's page** (main at 1093fdc3).

## Consequences

- Each man's shadow shows his pose and moves with his legs up close; the boots stand on their own small, dark shadows.
- No oval carpet under dense formations.
- 14.6 MB of shape atlases instead of 2.9 MB; the two bakes take 243 to 272 ms at load against main's 155 to 160 (the plan).
- Frame cost: within the noise of main at 20, 40, 63, 125 and 250 m (the Metal bench, four usable tries; at 20 m
  11.56–11.60 ms of GPU against 11.50–11.58; the plan's table, with the load of each run).
- At 100 m the near material gives way to the far one in one frame. The change is a scatter of foot pixels (the plan,
  "The 100 m edge"); a fade of the foot boost over the band would remove it at no shader cost.
- With 8 facings a man's shadow between two baked facings is a per-pixel blend of the two, so a turning man's shadow
  cross-fades rather than jumps.

## Alternatives considered

- **More bins or facings:** `12` or 16 facings gain little over `8,8` (the plan's feet table) for up to 32 MB.
- **Blending two bins:** softens the march's two leg stripes into one wedge; four reads instead of two.
- **Keeping the oval with the per-step shape:** the owner preferred it without.
- **Variants A and C for the feet:** A was barely darker; C was a solid stroke at k along the lower legs.
- **The per-figure shadow map** (0047, 0049): costlier (0.3 to 2 ms) and flakier in motion (0062).
