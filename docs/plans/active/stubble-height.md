---
status: active
last_reviewed: 2026-10-13
---

# Plan: taller stubble

After L5d (`docs/plans/done/l5d-crops.md`). The owner (2026-10-13), of the stubble that barely showed from the RTS
camera: "yeah a bit taller pls".

## Approach

- Stubble from 0.22 m to 0.45 m: the stubble fields, and the wheat cut to stubble through autumn
  (`cropLook` in `src/look/shaders/meadow.vert`). Its footprint follows (grass proportions under the grass height).
- Its tips a paler straw, over the darker soil: at 0.38 m the stalks were the field's own orange and still did not
  read (tried, pairs below).

## Acceptance

- Pairs against main: a stubble field in summer, the wheat field in autumn.
- `node tools/guard.mjs` against main, the default and the cover views: no block worse than main's.
- river-check and look-check pass; `npm test`.

## Results (2026-10-13)

- **Look** (pairs not committed; `scratch/compare/stubble/` in the main checkout): at 0.38 m the stubble added only a
  faint texture in the field's own colour. At `STUBBLE_HEIGHT` (0.45 m) with pale straw tips (`stubbleTip`) the
  stalks read over the soil, on the stubble fields and on the wheat cut in autumn.
- **No clipping toward the white coats:** the tips' red is no higher than the standing wheat's. Pixels with a
  channel at 245 or more, stubble field in summer: 1,322 against main's 1,843. Wheat field in autumn: 27,490 on both.
- **Guard** against main: passes at the default and the cover views.
- **Cost** (`?bench=meadow&benchat=100,140`, over the stubble field; Metal proxy, two runs an arm, the machine at a
  load of about 11): the meadow arm at 5.08 and 5.08 / 5.52 and 5.62 / 6.77 and 6.82 ms (close / default / wide)
  against main's 5.22 and 5.07 / 5.48 and 5.10 / 6.77 and 6.65 ms. That is within main's own run-to-run spread
  (0.4 ms at the default zoom): no measurable cost.
- **Checks:** river-check and look-check pass.
- **`npm test`:** exit 0 (19 files, 256 tests). Three earlier full runs under load failed the soldiers' cost budget
  (`test/soldiers.test.ts`, 12 ms; 15.3, 16.3 and 12.04 ms), a sim timing test this change does not touch. Main's
  full run passed at a load of 16.

## Review (`/code-review high`)

- **Round 1** (the first commit): two severe findings, both fixed.
  - The wheat cut to stubble in autumn kept the wheat's orange tips, so it did not read. It now takes the stubble's
    pale straw (`stubbleTip`, shared).
  - The pale tips' red (0.80) could clip toward white in the sun, against the white coats. It is now 0.72, the
    standing wheat's, which is measured above.

  Also fixed:
  - the height is one constant (`STUBBLE_HEIGHT` in `src/look/meadow-spec.ts`), not two literals;
  - the doc links it instead of copying it, and records the colour;
  - stale comments;
  - the cost and `npm test` measured (above).

  Left: at the top of its range the stubble's footprint meets the 0.7 cap (grass proportions under the grass
  height), which flattens a little of its width jitter.
