---
status: proposed
date: 2026-10-31
---

# 0096 A moved tile is built beside the last, then swapped; its parts are owned by what their builds add

## Context

G3b (`docs/plans/done/g3b-the-detail-follows.md`) moves the look page's one detailed tile with the camera: its trees,
bakes, flow, meadow map and roads are built again for the new place (G3b-2), from data a worker compiles (G3b-3). The
first design disposed each last part, then built its successor; a failure midway needed a rollback that rebuilt the
last tile, and three review rounds found bugs in that rollback (the wrong ground range restored, parts disposed twice).
The page's builders (`buildNature`, `buildBakes`, `buildMeadowMap`, `buildFlow`) were written to run once at load and
return no list of what they make.

## Decision

- **Build beside, then swap.** Every check first; then, in one task (no frame between), the tile's place (its centre,
  heightfield, ground meshes, covers) is set to the new tile's and every new part is built while the last ones stand.
  If a build throws, the new parts are taken away, the place is put back and each last part binds again what the new
  ones overwrote; the last tile is untouched. Else the last parts are disposed and the new take their place. Only the
  macro colour's GPU bake runs after the swap. One move at a time.
- **A part is owned by what its build adds** (`src/look/owned.ts`): the scene's lists (meshes, materials, textures,
  cameras, transform nodes) and its per-frame observables are diffed around the build, and the painted materials'
  list and bindings are marked (`Materials.mark`, by identity), so disposal takes away exactly that part's, whichever
  part goes first. A part built beside another is left out of what reads the whole scene (the bakes' shadow casters:
  `leaving`).

## Consequences

- No rollback rebuilds anything: a failed move is cheap and leaves the page as it was (checked: a move made to fail
  leaves the frame identical to a fresh page's).
- A move holds two tiles' parts for one task (memory for that instant: two sets of bakes).
- A builder must stay synchronous and add to the scene only through the recorded lists and observables; one that hooks
  elsewhere (an engine observable, a persistent mesh's) leaks. Builders returning explicit disposables would remove
  this assumption; not done (every builder would change).
- G3c can spread the building over frames while the last tile is drawn, the swap staying one step.
