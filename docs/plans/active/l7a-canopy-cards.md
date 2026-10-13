---
status: active
last_reviewed: 2026-10-12
---

# Plan: L7a, tree crowns as leaf cards (an experiment)

Track E phase L7 (`docs/plans/active/track-e-look.md` §L7, foliage and edges), a first experiment ahead of
the phase itself. Art direction: `docs/art-bible.md` §3 (edge breakup), §4 (ramp), §5 (big readable masses).

## Problem

Our trees are the pack's crown meshes, painted by the shared painter with soft crown normals and a grain-driven
silhouette dissolve (`src/look/shaders/nature.frag`). Their outline is still the mesh's: smooth lobes with a
dissolved fringe. Tiny Glade's crowns read as painted leaf masses: the crown is a cloud of quads, each turned to
face the camera and drawn with an alpha-tested leaf-clump texture (Pontus Karlsson's "quadmesh to billboards"
technique, credited by Anastasia Opara; Tom Stachowiak's GPC 2024 talk confirms it ships). The question is
whether that reads better than ours **at the RTS camera**, under our painter.

## Scope

- A `?trees=cards` arm on the look page: every broadleaf, birch and willow crown drawn as leaf cards; trunks,
  pines, bushes and everything else unchanged.
- The cards are generated from each pack model's crown triangles (area-weighted samples), so placement, scale
  and composition stay exactly the same as the default arm.
- **Shadows** (first pass: the pack crowns cast and the cards did not; since the leafy shadows below): the
  crowns cast through their cards, and the trunks through a trunk-only mesh.
- The leaf atlas: four clumps, greyscale value plus alpha, read from a generated reference
  (`data/leaf-clumps-oak-v1.png`, the owner's generated reference oak-leaf-clumps-greyscale-v1, unchanged) or drawn procedurally
  (`?leaves=procedural`). A PNG dropped on the page while holding Shift replaces it (any layout of four clumps
  on black).
- Not in scope: depth offset in the pixel shader (Opara's trick against planar intersections; the top-down
  camera hides most of them, so it waits for evidence), wind, seasons beyond what the shared `foliage()` gives,
  hedges and bushes, the decision to adopt.

## Approach

1. `src/look/leaves.ts`: the atlas (2×2, 512² cells). From a picture: split at the empty gutters, crop each
   clump, fit it to its cell, alpha from brightness, value normalised. Or procedural: canvas leaf shapes.
2. `src/look/canopy.ts` + `shaders/canopy.vert|frag`: per model, a card mesh (four vertices per card, the card
   centre, a corner, a size, a rotation and an atlas cell). The vertex shader expands each card in view space
   around its centre (scaled with the instance). Normals are the crown's sphere normals, so the crown shades
   as one mass. The fragment shader alpha-tests the atlas with a mip-compensated alpha (so crowns do not thin
   out at distance) and paints through the shared `paint()` with the same palette (the inner, role-1 leaves
   darker, as on the pack crowns), rim and backlight as the default crowns. The expansion and the atlas cell are
   one include (`shaders/cards.glsl`) shared with the shadow pass.
3. `nature.ts`: under `cards`, a carded model is drawn as a trunk-only mesh (its triangles off the crown) and its
   card mesh; the whole pack model is disabled. `?bench=trees` switches between the two for GPU time.

## Leafy shadows (added 2026-10-12, owner: "the shadow work of our trees looks weak")

The pack crowns cast smooth, solid blobs that do not match the leafy crowns. Under cards, the crowns cast through
the cards instead: in the sun's shadow pass (`src/look/bakes.ts`, rendered once, so no runtime cost) each card is
expanded to face the sun and alpha-tested against the same leaf atlas, and the pack meshes cast only their
trunks. The crowns' own self-shadowing (`shadowAt` at each card's surface point) then reads the leafy map too.
The shadow colour, the mist over shadows and contact darkening are a separate branch (the
shadow-look plan).

## Acceptance

- `npm test` passes (lint, typecheck, Vitest), full output and exit code.
- Default arm unchanged: `node tools/golden.mjs <main's look page> <this branch's look page>` passes (both
  served by Vite: the look page needs its bundler).
- Side-by-side screenshots, default vs `?trees=cards` (oak atlas) vs `?trees=cards&leaves=procedural`, at the
  near, mid and far gameplay zooms and in winter, for the owner to judge.
- Leafy shadows: the cards arm's tree shadows have broken edges and gaps at near and mid zoom (screenshots); the
  default arm's shadow map is unchanged (the goldens).
- GPU frame time of both arms measured at the closest and widest zoom on the dev Mac (labelled as the Mac proxy).

## Results (2026-10-12, first pass)

Screenshots (not committed): `scratch/l7a/{near,mid,far,autumn}.png`, today's pack crowns beside the cards with
the oak picture and with the procedural atlas.

- **Near and mid zoom:** the cards read as painted leaf masses with a broken outline; the pack crowns read as
  faceted low-poly blobs. The oak picture and the procedural atlas look alike at these zooms.
- **Far zoom (260 m):** the cutout outline aliases into stair-steps (the page has no anti-aliasing). Raising the
  coverage with the mip level and fading the leaf value calms the inside; the outline needs L8 (MSAA with
  alpha-to-coverage, or TAA).
- **Two fixes found on the way:** a card inside the hidden pack crown fell in that crown's shadow, so each card
  now takes its shadow at its point on the crown surface (one light value per card, as in Tiny Glade); the
  rim and backlight are halved on cards, which turn much more of the crown edge-on than a mesh outline does.
- **Cost** (`node tools/bench-look.mjs '…/app/look.html?trees=cards&bench=trees' --gpu metal --hold 4`, M1 Pro
  proxy, machine under load, no gate): GPU frame p50 close 5.50–5.63 ms (cards) vs 5.53–5.65 (pack); widest
  12.39–13.15 vs 12.20–12.94, so +0.1 to +0.4 ms at the widest zoom; +12 draw calls and +8.9k triangles.
  The bench scene's woods are small; a battlefield forest needs its own measurement.
- **Leafy shadows:** the crowns cast through their cards and the trunks cast on their own. The first try cut the
  cards in the sun's pass with the screen's distance-boosted coverage, which filled every gap (the review's
  finding, not the shadow map's 0.33 m texel as first thought); with a plain cut two mips finer, the shadow's
  outline breaks into leaf lobes. Its inside stays solid where the crown is dense. The light-map bake filters
  edges over about 1.3 m for every shadow on the map; a tighter filter is the shadow-look plan's.
- **Tests:** `npm test` fails only the sim's cost tests when the machine is loaded; main fails the same tests
  under the same load (2026-10-13), and both pass when run alone. This branch touches neither the sim nor its
  tests.

## Review (`/code-review high`)

- **Round 1** (d9235ea): one severe finding, the shadow pass's alpha cut using the screen's coverage boost
  (no gaps in the shadows), and nine moderate or light ones (the inner-leaf tint missing on cards, trunks drawn
  as whole models with every crown fragment discarded, a stale shadow map after a dropped atlas, the atlas
  wrapping, contradictory comments, the system doc, duplicated card GLSL, a bench arm not labelled, a model with
  no crown triangle). All fixed in 4ab21f5.
- **Round 2**: no severe finding. Fixed: the procedural leaf path crossing itself, a flat picture giving NaN
  values, the shadow casters chosen by enable state, the dropped picture's errors and object URL, the dark
  fringe from the black around each clump (value over coverage in the shader), the trunks' duplicated instance
  buffers, the card switches ignored without `?trees=cards`. Left as they are (light): the pack models are still
  built under cards (the bench's other arm), and the crown centre and the backlight are computed twice, in the
  pack and the card shaders. Review stops here (no severe finding).
