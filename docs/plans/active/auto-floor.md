---
status: active
last_reviewed: 2026-10-17
---

# Plan: Auto's floor at 0.75 (and why Auto stays by zoom)

The owner (2026-10-17): with Auto by zoom (#105, 0.85 at the widest) the widest zoom ran at about 111 fps; a fixed
0.75× reached the 120 cap. Asked how Auto should adapt once a scale driven by missed frames had failed review three
times, the owner chose: "Zoom-based, lower floor".

## Scope

- Auto's levels by the camera's radius: 1, 0.9, 0.8 and **0.75** at the widest, the edges at 72, 80 and 88 % of the
  SPEC's zoom range, 4 m of hysteresis each way: three changes over the whole zoom.
- Decision 0036 (the frame-rate targets, Auto by zoom). Docs: `docs/systems/look.md`, the research note.
- **Owed to the armies** (carried from `docs/plans/done/dynamic-scale.md`): units at the widest zoom will be a few
  pixels; a full-resolution pass for units, or the GPU-timed scale, so the widest zoom does not cost them their
  readability.

## Acceptance

- The owner's screen at the widest zoom (the readout). The goldens against main: a match (the check tools pin the
  scale to 1). `npm test`, `node tools/check-docs.mjs`.

## Why not a scale driven by missed frames (tried, not merged)

The branch `look/autoscale-ft` (2026-10-17, local, not merged) drove the scale by the display refreshes the frames
missed. A page cannot see its display: it infers misses from when its callbacks run, and three review rounds each
found a new way that inference fails: a late callback read as a miss; one short interval lowering the measured
refresh for good (every frame then "missed", the scale at its floor); a refresh measured under startup work at two
slots (nothing ever missed); a power-saving browser at 30 fps read as a 60 Hz display always late; displays at rates
outside the snapping list (85, 360 Hz); a window moved to another monitor; one stall (even the resize itself) taken
for load; CPU-bound frames lowering the resolution for nothing; and a freeze switching the panel back to Auto. If
adaptivity is wanted later (with the armies), the sounder signal is the GPU's own frame time (the timer extension:
calibrated per platform, with the zoom curve as its fallback), decided then by measurement.

## Results

- The levels (the radius out, then back): 125, 198 → 1; 206, 220 → 0.9; 232 → 0.8; 240, 260 → 0.75; back in, 236 →
  0.75, 228 → 0.8, 212 → 0.9, 195 → 1.

## Review

- **Round 1** (light and moderate): the readability debt carried forward (above); the reasoning in decision 0036, not
  only here; the source comment cites the decision (a stable path); metre values out of the prose (the code derives
  them). The steps double to 0.1 (three changes instead of six): a softer jump at each, accepted for fewer resizes.
