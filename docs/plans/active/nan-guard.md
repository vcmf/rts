---
status: active
last_reviewed: 2026-10-17
---

# Plan: no dark block from a pixel that is not a number

The owner (2026-10-17) saw a black square in the far woods, rarely, "hard to reproduce", twice with the depth of
field on. A pixel that is not a number (a NaN some material writes: its source is not found yet) survives in the
half-float target the depth of field uses; the half-resolution downsample averages it into a block and the blur
spreads it. Without the depth of field it is at most one black pixel (the 8-bit target writes it as 0), and the bloom
spreads it to its taps.

## Scope

- The downsample (`dofdown.frag`) leaves a NaN pixel out of its average; the bloom leaves a NaN tap out; the finishing
  pass (`uber.frag`) gives a NaN pixel its neighbours' mean.
- `?nanmark`: a NaN pixel shows magenta instead, so its source can be found when it happens (then fixed at the
  source, in its own PR).
- Docs: `docs/systems/look.md` (the finishing pass).

## Acceptance

- The passes compile with and without the depth of field and `?nanmark`; the goldens against main match (no NaN in
  the captures: nothing else changes). `npm test`, `node tools/check-docs.mjs`.

## Results

- Compiled and ready: `?nanmark`, `?dof=1&nanmark`, `?dof=1`, `?dof=0&nanmark`. The goldens against main: match.
- Not reproduced here (about 200 views at 1× and 0.75×, time advancing, every frame scanned for black): the source
  stays open; `?nanmark` is how to catch it.
