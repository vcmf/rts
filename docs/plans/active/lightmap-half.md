---
status: active
last_reviewed: 2026-10-29
---

# Plan: the light map at about 0.5 m a texel

The owner (2026-10-29) approved a coarser baked light map after the light resolution test (branch
`look/lightres-test`, a temporary `?lightmap=<texels>` switch): at 1536 texels over the 800 m tile (0.52 m a texel)
the look matches 3072 (0.26 m) at every zoom, the trunks' shadow strips and the buildings' shadow corners kept (at
1 m the trunk strips vanish). It frees about 54 MiB for the light map and as much again for the soldiers' shade, which
is sized from it (each an RGBA8 colour and a 4-byte depth buffer).

## Scope

- `SPEC.sizes.lightMap` 3072 → 1536 (`src/look/spec.ts`). Its consumers: the light map and the soldiers' shade
  (`src/look/bakes.ts`, `LM_N`), the bake budget (`shadowMapSize`). Nothing else is sized in its texels: the bake's
  penumbra is in metres (`uPenumbra`, the shadow map's `uSMGround`), the trunks' strips are world quads, the bounce
  map has its own 512 texels.
- The light texel target 0.5 → 0.53 m (`SPEC.texel.light`): 800 / 1536 = 0.521 m, the size the owner looked at.
  `docs/proposals/engine-design.md` §6 gave a range (0.26–0.5 m), no decision records it.
- A test: the light map's texel is within the target and coarser than 0.5 m is still refused past it.
- Docs: `docs/systems/look.md` (the light map's texel, the shade at its texels), the proposal's table.

## Acceptance

- The golden screenshots against main: small differences only, a sheet of the closest zoom on a tree's foot, a
  building and the default view (main | branch) in `output/lightmap-half/`; the guard against main.
- The page's texture memory estimate (the bench's) about 108 MiB lower with `?armies`; the bake time measured over
  a few loads; one bench round main against branch on the production build.
- `npm test`, `npm run check:data`, `node tools/check-docs.mjs`, the build: once, at the end.
