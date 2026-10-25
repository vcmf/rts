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
