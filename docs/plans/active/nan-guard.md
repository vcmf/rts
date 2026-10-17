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
  pass (`uber.frag`) gives a NaN pixel its neighbours' mean. As built (review round 1): one test, a value's absolute
  below the half float's largest (it rejects infinities too, and no compiler folds it away as it may x == x); under
  the depth of field its one guard is the downsample (all four out: the ring two pixels round), and a bad sharp pixel
  takes the clean blur; without it the finishing pass gives a bad pixel its ring's mean (the 8-bit default cannot
  hold one); `?nanmark` turns the half-float target on (an 8-bit target stores a NaN as 0, which nothing can mark).
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
- **Review round 1** (moderate): x == x missed infinities and may be folded away; `?nanmark` could not see a NaN in the
  8-bit target; three guards where one per path does; a hard grey fallback. Reworked as above.
- **The guards exercised** (a NaN forced into every far crown, `uRim` set to NaN, 1280×720): `?dof=1&nanmark` 455
  magenta pixels and no black; `?dof=0&nanmark` 452 and no black: the mark finds them. Without the mark, a whole
  surface of bad pixels has no good neighbour to take (3,904 black under the depth of field): an isolated pixel, the
  owner's case, is repaired; a whole bad surface stays dark, and `?nanmark` shows where.
