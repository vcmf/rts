---
status: active
last_reviewed: 2026-10-16
---

# Plan: a frame readout on the look page

The owner (2026-10-16) saw about 110 fps at a close, near top-down view and found it strange. On this Mac the bench
measures about 5 to 6 ms a frame at such views (the frame interval), and a half-resolution bloom tried for it did
not pay (the bloom costs 0.1 to 0.3 ms on the frame interval; a timing that waits on every frame had made it look
like 1.5 ms). The page's only number was Babylon's fps, capped by the display's refresh rate and silent on why.

## Scope

- The top right readout: over the last 120 frames, the frame interval's median (and as fps) and its slowest 5 %,
  the render's CPU time (the JavaScript of `scene.render`), and the share of frames past 8.3 ms (120 fps). With vsync
  on, the interval is the display's slots: frames that miss one show as the slow share.
- `?bloom=0`: open with the bloom off (the A/B that showed its cost).
- Docs: `docs/systems/look.md` (the page's controls), the research note (the bloom's cost, the waited-on timing's
  error).

## Acceptance

- The readout on the page (headless at 60 Hz: 16.7 ms, the CPU's share), the owner's screen.
- The goldens against main: no change (the readout is hidden in captures). `npm test`, `node tools/check-docs.mjs`.
