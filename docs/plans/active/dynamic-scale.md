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
  over the whole range). The interface is HTML over the canvas and stays sharp.
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
- **The scale by zoom** (the render width at 1600 px): radius 125, 180, 200 → 1; 220 → 0.95; 240 and 260 → 0.85.
- **The widest view at Auto against 1×:** a little softer at the crowns' edges and the river's highlights.
