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

- Pairs (not committed; `scratch/compare/stubble/` in the main checkout): at 0.38 m the stubble added a faint texture
  in the field's own colour; at 0.45 m with pale tips the stalks read over the soil.
- Guard against main: passes at the default and the cover views.
- river-check and look-check pass.
- `npm test`: on this machine (load about 10) the soldiers' cost test (`test/soldiers.test.ts`, a sim timing budget)
  failed in the full parallel run, at 15.3 and 16.3 ms against a 12 ms budget. It passed alone on this branch and on
  main. This change touches only a shader and a doc; CI is the judge.
