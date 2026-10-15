---
status: active
last_reviewed: 2026-10-15
---

# Plan: the default map's fields (a large wheat field, bare earth)

Track E, the ground's refinement (the owner, 2026-10-14), its third PR: after the light on the ground
(`docs/plans/done/ground-light.md`) and the ground's surface (`docs/plans/done/ground-surface.md`). The owner: "update
the default map for it to contain a large wheat field, dirt terrain… during autumn I still see only green grass and no
terrain". The start view held one small wheat field (32 × 25 m) at its lower left; the ploughed field sat past its
right edge.

## Scope

- **A large wheat field** in the start view: about 90 × 56 m at (50, 48), its drill along x (at (80, 12), tried
  first, it sat past the view's right edge). The
  formation zones and the floodplain clip it as any field (`authorCover`).
- **A bare-earth drove** between the wheat and the ploughed field (about 90 × 8 m at (80, -23)).
- **Trees off fields and bare ground:** a tree or a stone that falls on a field or bare earth is placed but not drawn
  (rejected, it drew a new candidate and shifted the scatter's stream: a moved bush hid a guard block). Bushes and
  grass already keep to grass.
- The look data rebuilt.
- Not in scope: new lines (roads, tracks), the village, the river.

## Approach

`FIELDS` in `src/look/world/cover.ts` (appended, so the existing fields keep their ids), `coverAllows` in
`src/look/nature.ts`, then `node tools/build-look-data.ts`. The crops grow on the new wheat by the meadow's slots
(`Nature.crop`), and in autumn it is cut to stubble, then ploughed under (L5d).

## Acceptance

- Pairs at the start view in summer and autumn and at the wide view: the wheat and the bare drove in view, no tree
  in them.
- `tools/guard.mjs --base` main, start, cover and crops, three seasons: the coats on the new ground measured; a new
  failure is the owner's call.
- `tools/river-check.js` (the crops' counts: `cropsInSceneField`), `npm test` (the cover test), `--check` of the look
  data, `node tools/check-docs.mjs`.
- The bench against main (more crop clumps in view).

## Results

Main at f3b69df. Sheets in `scratch/compare/default-map/` (git-ignored): the start view in summer, autumn and late
autumn, the wide view.

- **The look:** the wheat sits in the start view's upper right, cut to pale stubble in autumn and ploughed under after
  (L5d), the drove between it and the ploughed field. The scatter still re-rolls round the new field: the grass tufts
  and flowers retry where the cover changed and shift the stream after them, so trees elsewhere stand differently than
  on main (the scatter's own behaviour; the trees in the field are placed, then not drawn).
- **The guard** against main: ok at cover and crops. At start one block falls under the bound: the Austrian white at
  "open-low" (45, 15), now on the wheat's southern edge, in autumn when the wheat is pale stubble, 0.068 against
  main's 0.105. It is the case of #78 (recorded there, the owner's standing call). In winter the same block now
  separates (0.108, main 0.035).
- **The river check:** no crops on the floodplain or in the zones, 463 crop clumps in the scene's field (≥ 150), no
  instance over the water or in the zones.
- **`npm test`:** the soldier timing budget alone under load (14.5 ms against 12); alone it passes (12 of 12). The
  cover test passes. The look data's `--check` matches.
- **The frame's cost** (`tools/bench-look.mjs`, Metal, one run each, a load average of 6 to 15): -0.51 to +0.24 ms
  across the 9 cameras, within noise.
