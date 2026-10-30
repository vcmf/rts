---
status: done
last_reviewed: 2026-10-30
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
  `docs/proposals/engine-design.md` §6 gave a range (0.26–0.5 m); decision 0082 records the new target.
- A test: the light map's texel is within the target and coarser than 0.5 m is still refused past it.
- The bake budget (`bakesMB`) counts the soldiers' shade beside the light map (review); decision 0082 records the target.
- Docs: `docs/systems/look.md` (the light map's texel, the shade at its texels), the proposal's table.

## Acceptance

- The golden screenshots against main: small differences only, a sheet of the closest zoom on a tree's foot, a
  building and the default view (main | branch) in `output/lightmap-half/`; the guard against main.
- The page's texture memory estimate (the bench's) about 108 MiB lower with `?armies`; the bake time measured over
  a few loads; one bench round main against branch on the production build.
- `npm test`, `npm run check:data`, `node tools/check-docs.mjs`, the build: once, at the end.

## Results

- **Memory** (`?armies=20`, Metal): the page's texture estimate (colour only, the bench's `textureMB`) 309.7 → 255.7
  MB, 322.7 → 268.7 MiB counted in the page: 54 MiB less, and as much again in the two targets' depth buffers (not in
  the estimate), 108 MiB in all.
- **The bake** (the light map's own bake and those it sets off in the same frame: the bounce map, the buildings'
  light and, with `?armies`, the soldiers' shade; not the shadow map). Its light map's refresh counter reset before a
  render, waited on by reading the bounce map back (it bakes last but the shade, in the same frame), against the same
  frame without the reset; the median of 11 pairs, three loads each, main and branch alternated, load ≤ 3:
  36.4–36.8 ms on main, 24.3–24.5 on the branch, with 10.3–10.5 ms of a frame without it: **about 26 → 14 ms**. In
  the page's console (`?armies=20`, once loaded):

  ```js
  (async () => {
    const lm = __look.lightMap, gb = __look.groundBounce, s = __proto.scene, t = { bake: [], none: [] }
    for (let i = 0; i < 11; i++)
      for (const k of ['bake', 'none']) {
        await gb.readPixels()
        const t0 = performance.now()
        if (k === 'bake') lm.resetRefreshCounter()
        s.render()
        await gb.readPixels()
        t[k].push(performance.now() - t0)
      }
    const med = a => a.sort((x, y) => x - y)[a.length >> 1]
    return { bake: med(t.bake), none: med(t.none) }
  })()
  ```

- **The bench** (one round each, production build, Metal, `?armies=20`): the frame's p50 within the noise (close 8.60
  → 8.55 ms, default 10.40 → 10.05, wide 8.20 → 8.05; main's default views were contended mid-run).
- **The goldens** against main: differ at every camera, a mean of 0.7–1.4 of 255 at worst per region; the sheet of a
  tree's foot, a house, the village and the default view (`output/lightmap-half/`): the trunk's strip and the
  buildings' shadows kept, the strip's edge a little softer.
- **The guard** against main: ok, no block that separates on main fails (the 7 that fail fail on main too).
