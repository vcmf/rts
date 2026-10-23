---
status: proposed
date: 2026-10-23
---

# 0051 The closest zoom at 15 m, held over high ground, with the full figure for the men nearest

## Context

The owner asked to zoom closer to see the soldiers (#133). The closest zoom was 45 m (`src/look/spec.ts`), where a
figure in the middle of the frame stands about 60 px tall at 1080 lines; the near LOD (1,197 triangles) shows its
facets from about 14 m. The camera's focus stays 8 m up (`focusY`) while the demo map's battlefield lies about 3 m up,
so a soldier is farther from the eye than the radius: at 20 m he stood about 105 px tall, not yet showing his detail.
The spec's camera check assumed every allowed view's eye above the tile's highest ground; at 15 m and the most oblique
pitch the eye is 8.4 m above the focus, lower than the tile's highest ground (20.3 m). The full figure (9,274
triangles) existed, but a battalion of 414 men drawn with it would be 3.8 M triangles.

## Decision

- **The closest zoom is 15 m** (`rMin`, tuned by eye from the owner's "about 20 m": a soldier in the middle of the
  frame about 125 px tall at 1080 lines), the RTS camera unchanged otherwise (pitch, yaw, field of view: no new horizon, decision 0002).
- **The eye is held `clearance` (6 m) above the ground under it**: nearer, the zoom is held out (`clearRadius`,
  `src/look/spec.ts`, applied in `src/look/post.ts`), and the spec's reach checks use the held radius (a view held past
  `rMax` is refused). From 41 m out the eye clears the spec's highest ground at every pitch, so the hold never reads
  the ground at the zooms the page had.
- **A figure may have a nearest LOD** (its data lists its LODs nearest first; the page names none, decision 0015): a
  battalion whose bounds are in the view and whose nearest point is within 90 % of the switch is split, each man in
  the view and taller on screen than the switch (100 px, ±10 %) drawn at the nearest LOD, the others at the near one.
  Skinned from the bones' texture like the near LOD: its posed vertices would be a texture of 2 × 13,739 texels a row
  (over the min-spec's 8,192) and some 100 MB as float32 over the 242 baked steps.
- **What was tuned at 45 m stays there**: the depth of field's zoom ease (decision 0040's look) and the render scale's
  Auto edges (decision 0045) are reckoned from 45 m, holding their closest values nearer; the bench's `close` camera
  stays at 45 m (`?benchclosest=1` adds the closest).

## Consequences

- At the zooms the page had, nothing is drawn differently: the hold does not run, no man is drawn at the nearest LOD
  (the nearest in view at 45 m stand under 90 px).
- At 15 m about a hundred men are drawn at the full figure (those in the view and close; 91 to 108 of a battalion
  in the review views); the cost is measured in `docs/plans/active/close-zoom.md`.
- The figure's data grows from 0.76 MB to 1.43 MB (0.47 MB gzipped).
- The checks that view the closest zoom (`tools/macro-check.mjs`, `tools/water-look-check.mjs`,
  `tools/detail-check.mjs`, `tools/water-check.mjs`, the ablation kit) now view it at 15 m.
- The cinematic camera without the RTS limits (for the history videos) remains a separate mode.
