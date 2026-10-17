---
status: accepted
date: 2026-10-17
---

# 0036 Frame rate: 60 fps hard, 120 fps soft; the render scale by zoom

## Context

Decision 0011 set 60 fps at 1080p on an RTX 3060 laptop. The owner (2026-10-16): "60fps is hard target, 120fps is
soft target". The look page measured on the dev Mac (the frame interval: `docs/research/frame-rate-120.md`): close and
default zooms well above 120 fps, the widest zoom short of it. After the 8-bit MSAA target and the meadow by zoom
(`docs/plans/done/wide-perf.md`) the owner's screen showed 108 fps at the widest zoom; an automatic render scale by zoom
(`docs/plans/done/dynamic-scale.md`) 111; a fixed 0.75× the 120 cap. A render scale driven by the frames that miss
the display's refresh was built and failed three review rounds (`docs/plans/active/auto-floor.md` says how: a page
infers its display from when its callbacks run, and the refresh rate, the CPU, stalls and monitor changes corrupt
that).

## Decision

- **60 fps is the hard target** (decision 0011's: at the worst zoom, on the min-spec laptop, with 4× MSAA and the
  armies); **120 fps is a soft target**: met at the close and default zooms, and at the widest by the render scale.
- **The render scale's Auto goes by zoom**: 1, 0.9, 0.8 and 0.75 as the camera's radius passes 72, 80 and 88 % of its
  range, with 4 m of hysteresis; the interface stays at full resolution. Not driven by missed frames.
- If adaptivity is needed later (with the armies, on the min-spec laptop), its signal is the GPU's own frame time
  (the timer extension, calibrated per platform), with the zoom curve as the fallback; decided then by measurement.

## Consequences

- Good: deterministic, no hunting, three resolution changes over a full zoom, measurable; the widest zoom reaches the
  soft target on the owner's screen.
- Bad: the widest zoom draws the scene at 0.75 of the page's pixels (the page renders at CSS pixels: on a Retina
  screen 1× is already half the device's). Units there will be a few pixels: **owed to the armies**, a full-resolution
  pass for units (or the GPU-timed scale) so the widest zoom does not cost them their readability (AGENTS.md,
  readable first).
- The check tools pin the scale to 1 (their pixels compare across changes).

## Alternatives considered

- A scale driven by missed frames: dropped (above).
- 2× MSAA at the widest zoom: about 1 ms, edges a little noisier: kept for a future quality preset.
- Far-tree impostors: at most 0.6 ms (the whole far woods measured): later, if ever.
