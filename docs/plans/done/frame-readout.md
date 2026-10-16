---
status: done
last_reviewed: 2026-10-16
---

# Plan: a frame readout on the look page

The owner (2026-10-16) saw about 110 fps at a close, near top-down view and found it strange. On this Mac the bench
measures about 5 to 6 ms a frame at such views (the frame interval), and a half-resolution bloom tried for it did
not pay (the bloom costs 0.1 to 0.3 ms on the frame interval; a timing that waits on every frame had made it look
like 1.5 ms). The page's only number was Babylon's fps, capped by the display's refresh rate and silent on why.

## Scope

- The top right readout: over the last 120 frames, the frame interval's median (and as fps) and its slowest 5 %,
  the render's CPU time (the JavaScript of `scene.render`), and the share of frames that missed their slot (longer
  than one and a half of the median: as built, after review; past a fixed 8.3 ms, the timer's jitter counted half of
  the on-time frames at 120 Hz, and every frame at 60 Hz).
- `?bloom=0`: open with the bloom off (the A/B that showed its cost).
- Docs: `docs/systems/look.md` (the page's controls), the research note (the bloom's cost, the waited-on timing's
  error).

## Acceptance

- The readout on the page (headless at 60 Hz: 16.7 ms, the CPU's share), the owner's screen.
- The goldens against main: no change (the readout is hidden in captures). `npm test`, `node tools/check-docs.mjs`.

## Results

- The readout headless (vsync at 60 Hz, the default view): `60 fps · frame 16.7 ms (p95 17.7) · cpu 0.9 ms · 0%
  missed`: the page keeps up, the display sets the rate, the CPU takes under a millisecond.
- The goldens against main: match, every view (the readout is hidden in captures). `npm test`: exit 0, 256 tests.
  `node tools/check-docs.mjs`: exit 0.
- Review round 1 (moderate): the missed share's fixed 8.3 ms limit (timer jitter at 120 Hz, every frame at 60 Hz),
  a duplicated `?bloom=0` block, a second quantile helper (the bench's is shared now), a readout blank for the first
  120 frames. Fixed.
