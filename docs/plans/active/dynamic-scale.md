---
status: active
last_reviewed: 2026-10-17
---

# Plan: an automatic render scale by zoom

The owner (2026-10-16): after the 8-bit target and the meadow by zoom, the widest zoom reached 108 fps on their
screen; the armies are still to come. The research's render-scale item (`docs/research/frame-rate-120.md`): the 3D
scene drawn at fewer pixels where they buy the least, the interface at full resolution.

## Scope

- **Render scale "Auto"**, the panel's new default (the fixed 0.75×, 1×, 1.5× stay): by zoom, 1 up to a camera radius
  of 180 m, easing to 0.85 at 260 m (the widest), in steps of 0.05 (each change resizes the frame's targets: three
  over the whole range). The interface is HTML over the canvas and stays sharp. As built (review rounds 1 and 2):
  four levels by the radius, 1 / 0.95 / 0.9 / 0.85, their edges at 72, 78 and 85 % of the SPEC's zoom range (about
  200, 213 and 228 m), each changed only 4 m past its edge (no flicker); under Auto the paper grain kept to the
  screen's pixels (the fixed scales as before).
- **The check tools pin it to 1** (`tools/look-page.mjs`'s prep step, `tools/check-negatives.mjs`), so their pixels
  compare as before; the bench measures Auto (what a player gets).
- Not a frame-time controller (it would oscillate and resize mid-play): a later step, with the armies.
- Docs: `docs/systems/look.md`, the research note.

## Acceptance

- The owner's screen at the widest zoom (the readout); a capture of the widest view at Auto against 1×.
- The bench against main; the goldens, the guard and the other checks: once, at the end (pinned to 1, so unchanged).
- `npm test`, `node tools/check-docs.mjs`.

## Results

- **The owner's screen** at the widest zoom: 108 fps at 1×, **120 at Auto** ("it achieve 120fps not bad").
- **The scale by zoom, as first built** (a smooth curve, before review round 1): radius 125, 180, 200 → 1; 220 → 0.95;
  240 and 260 → 0.85.
- **The widest view at Auto against 1×:** a little softer at the crowns' edges and the river's highlights.
- **The levels** (the radius out, then back): 125, 198, 202 → 1; 206, 216 → 0.95; 230 → 0.9; 260 → 0.85; back in, 228
  → 0.85, 222 and 212 → 0.9, 202 → 0.95, 195 → 1: each level holds 4 m past its edge.
- **Owed to the armies** (review round 1): units at the widest zoom are a few pixels; a lower render scale costs them
  sharpness (AGENTS.md: readable first). When units land, either their pass draws at full resolution or Auto's floor
  becomes frame-time driven (it lowers the scale only when the frame needs it): decided with the unit work, measured.

## Review

- **Round 1:** the render check run alone (its header's way, without the tools' prep step) read the frame at its
  old size once Auto shrank it at the wide view: it pins the scale itself now. The scale flipped at a level's edge
  with nothing to hold it (each flip a resize): four levels with 4 m of hysteresis. The paper grain was sampled in
  render pixels (coarser and jumping at each level): in screen pixels now. The bench records each run's frame size.
  The widest from the SPEC; the panel follows a scale set elsewhere. Noted for the armies: above.
- **Round 2** (moderate and light: the last round): the render check puts the page's scale back when done; the
  bench samples the page's frame before its cameras (a wide one draws smaller) and its file format is version 4 (each
  run's frame size); the panel's element cached; the edges as shares of the zoom range. **A level change's cost:** a
  frame that changes level 12.0 ms against 10.7 for one that does not (each waited on, so inflated): about 1.3 ms
  once at each of three crossings over a full zoom. Accepted: the card fade's dither stays in render pixels (it jumps
  slightly at a level; at the widest zoom the cards are past the fade).
- **The checks** (after a fix the first run found: round 2's edit had put a comment mid-line in `post.ts`, which
  turned off the bloom's strength, the grain's switch and its texture; the owner's 120 fps was measured on that page,
  without the bloom, about 0.1 to 0.3 ms): the goldens against main match at every view (the scale pinned to 1);
  the guard (the default, cover and crops views, three seasons), the coat check: exit 0; the negatives, the water and
  macro checks: exit 0 (their run had the bug, which they do not see: geometry and the water). The bench was not
  clean (another program held the load at 14 to 21): the owner's screen, with the readout, is the measure.
