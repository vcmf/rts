---
status: active
last_reviewed: 2026-10-25
---

# Plan: the buildings from Tripo's own low-poly models

The owner (2026-10-25) regenerated the buildings in Tripo with a target of about 1,000 faces and finds the meshes good:
the windmill keeps its lattice sails, which our cut could not keep (`docs/plans/done/buildings.md`: the import cut
Tripo's 7,800-8,300-triangle models to 2,300 with Blender's decimation and rebuilt the sails as solid blades). Four new
models in the git-ignored `assets/buildings/`: `windmill-low-poly.zip`, `house-low-poly.zip` (the same two buildings),
`building-low-poly.zip` and `building-2-low-poly.zip` (two new ones). This bears on #138 (the buildings flat and faceted
at the closest zoom, 15 m).

## Scope

- The windmill and the house drawn from the new models in place of the decimated ones.
- The two new models, if they hold up as houses of the village, added to its houses; the map's layout otherwise kept.
- Not in scope: a nearer level of detail or painted wall detail (#138's planned fix), turning sails.

## Approach

- **Inspect** each model (triangles, UVs, texture, scale and orientation against today's, open edges and loose parts,
  how it reads) and name the reference image each was made from.
- **Import** (`tools/building-to-js.py`): a model may skip the cut (`'tris': None`: the mesh kept as Tripo made it,
  triangulated) and the sails' rebuild (no `'sails'`: the lattice kept). The roles by colour as today, each model's
  reference colours from its texture's clusters (`--analyse`), checked with `--render`. The light UVs, their gap check
  and the detail texture as today, so the light bake (#127) and the paving keep working.
- **Page** (`src/look/buildings.ts`, `src/look/world/buildings.ts`): the new models' palettes, footprints and yards; the
  village's houses as today, two of them turned into the new types where their yards fit (`PAVE_GAP`).

## Acceptance

- Contact sheets main against the branch (production builds, Metal), at 15 m, 30 m, 45 m and the default or wide zoom:
  the windmill with its sails, a house, the village; a crop of the windmill's sail grid. To the owner (not committed:
  the main checkout's `output/armies-review/16-tripo-lowpoly/`).
- The bench's draws and triangles a frame, and a short Metal bench main against the branch at the village's default
  and closest views (three interleaved rounds): the cost equal or lower, or stated.
- `npm test`, `npm run check:data`, the docs check; the golden against main reported (it differs where the buildings
  are: expected).

## Open questions

- The lattice sails at the far zooms: a lattice thinner than a pixel may shimmer (the owner's eye).

## Status (2026-10-25)

- The models (Blender, `tools/building-to-js.py`; each one mesh, one 2048² JPG, normalised to a unit box as before, the
  front toward −y, as the first models): `windmill-low-poly` 1,794 triangles (the first export 7,842), the same windmill
  (`10-reference-windmill`) with its lattice sails as geometry (about 900 of its triangles); `house-low-poly` 1,572
  (8,277), the same stone cottage (`01-stone-cottage`: the dormer, the porch, the chimney pots; the first plan named
  `06-reference-stone-house`, but both exports are the cottage); `building-low-poly` 1,523, the village farmhouse
  (`02-village-farmhouse`: red tiles, shutters, a lean-to); `building-2-low-poly` 1,454, the small country manor
  (`03-small-country-manor`: three gables, mullioned windows). Like the first exports, open meshes of loose parts
  (38-88 parts, 480-600 open edges): nothing seen through at the page's angles.
- Kept as made (`'tris': None`; the windmill's sails not rebuilt). Fitted as before (the windmill 15 m high, the
  cottage 11 m long) and the new ones at 13 m (the farmhouse) and 15 m (the manor) long.
- The low-poly models paint their windows and shutters in the texture across larger faces, so a role per face lost
  them (half a window black, half wall). The roles now from each face's texels (the most common other than opening and
  accent), and a wall's or timber's opening and accent texels kept as inlays in the detail texture's G and B (only
  near-rectangular parts: a blotch of shade on a face Tripo textured as roof was read as a window), which
  `building.frag` paints over the face's role.
- The village: the farmhouse in place of the house at (208, −30), its door to the road, and the manor in place of the
  house at (240, 18); the other four cottages and every position and turn as before; the yards at least 5.2 m apart
  (`PAVE_GAP` 4). One mesh a model: four building draws in place of two.
- Measured (Metal, production builds, `?bench&benchat=222,-8&benchclosest=1`, interleaved; the GPU frame's p50, the
  median of the six cameras a zoom, the l2 arm): the branch equal or lower. Rounds 1 and 2 (a quiet machine): closest
  7.70 / 7.51 ms main against 7.52 / 7.58, default 10.00 / 9.76 against 9.74 / 9.81, wide 10.55 / 10.36 against 10.27 /
  10.43. Rounds 3 and 4 were disturbed by another agent's test run (outliers of 12-17 ms on both sides) and dropped;
  rounds 5 and 6 under a lighter load: closest 8.35 / 8.78 against 8.61 / 7.63, default 10.98 / 11.13 against 9.91 /
  9.75. A frame: two draws more (four building meshes, 106 → 108 at the closest), about 5,000 triangles fewer
  (868,574 → 863,539 at the closest; 939,266 → 934,231 at the default).
- Checks: `npm test` (lint, format, typecheck, Vitest; three timing tests failed under the other agent's load and
  passed on a rerun), `npm run check:data` and the docs check pass; the golden against main differs only where the
  windmill and its shadow are (the start view 1.29 % of a region, the winter one 1.26 %: expected).
- Review round 1 (2026-10-25): the inlays painted only on wall and timber faces (`building.frag` gates by the role;
  the tool drops a mask's texel any face of another role covers: a manor's roof showed dark smudges at the default
  zoom); the B inlay a shutter of its own (a class no face takes, its colour the model's `shutter`, the farmhouse's
  alone), not the accent (the cottage's terracotta pots: its walls now take no B inlay); the farmhouse without a
  timber class (its window frames and sills were timber and tiles: its walls any way up now, the sills stone; the
  manor's slates are too near its shaded stone for that, its sills stay slate); the masks closed by two texels and
  their holes filled (the shutters' planks, the door); the detail's local mean without the inlays and 1 on them (a
  painted window darkened the mean and left a pale rim); `--render` paints the inlays; one UV layer; the cut, the sails'
  rebuild and the shader's sails branch removed (git history keeps them); the vote vectorised. The farmhouse's
  shutters and green door still read mottled at 15 m: the painter's grain on a colour near its band's edge, as the
  roofs (the paint, not the mask: the mask is whole there).
