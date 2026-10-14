---
status: active
last_reviewed: 2026-10-14
---

# Plan: a procedural tree generator (prototype)

## Problem

Every tree on the field is a pack model (`CommonTree_*`, `BirchTree_*`, `Willow_*`, `PineTree_*`, `Bush_*`,
`src/look/nature.ts`). The art bible asks for more species than the pack has (oak, lime, birch, willow, alder,
orchards, a copper-beech accent, conifers that stay green, hedgerow bushes: `docs/art-bible.md` §4b, §6c, §11), and
L7 still owes bare winter trees and pines that are not pack meshes (`docs/plans/active/track-e-look.md` L7). A
generator gives every species as data, any number of seeded variants, and the bare branches for free, since
it grows the branches before it adds the crown.

## Scope

- A research note on the standard algorithms and how they fit our look: `docs/research/procedural-trees.md`.
- A single-file prototype, `prototypes/tree-gen.html`: space colonization in a per-species crown envelope,
  pipe-model radii, tube branches, the tips clustered into 3–6 crown clumps with crown-volume normals, a
  season slider (autumn mix, leaf loss, bare winter, snow) and a GLB export of one tree.
- Species: oak, lime, beech, copper beech, birch, willow, alder, apple (orchards), Scots pine, Norway spruce,
  hawthorn (hedgerow bush) and Lombardy poplar (proposed: not in the art bible yet).

- The generator in one plain script, `prototypes/tree-core.js` (shared like `prototypes/formation-core.js`): the prototype
  loads it with a script tag, the look page imports it.
- A look-page arm, `?trees=gen,cards` (`src/look/nature.ts`): the pack's trees drawn as generated species (oak,
  lime and beech for the broadleaves, birch, willow and alder on the banks, Scots pine and spruce), sized to their
  pack class, plus an orchard, a hedgerow and a row of poplars. They take the page's whole look: the leaf atlas
  and L7a's cards, L7b's crown volume, the crowns' cast shadows, the soft shadows and the contact under each crown.
  The default arm is unchanged.
- On that arm, what the generator's data allows (decision 0031, proposed; the owner, 2026-10-14: the official page
  lacked both the prototype's thinning canopy and its branches):
  - **one volume per clump:** each card lit in its clump's ellipsoid, not the crown's (`?clumpvol=off` for the A/B);
  - **leaf fall:** deciduous cards drop and shrink from late autumn to winter, in the cards drawn and in the shadow
    pass, a few tufts left; conifers keep theirs;
  - **twigs:** each model's twigs as their own mesh, drawn and casting from late autumn;
  - **the season baked:** the shadows, the sky's occlusion and the contact under each crown follow the season the
    page opens in; releasing the slider re-bakes the shadows.
- The design docs: the art bible (§4b leaf fall, §5 a volume per clump), the look system doc, decision 0031.
- To judge it on the page (the owner, 2026-10-14): more trees under `?trees=gen` (a forest, a wood, lone field trees),
  and RTS controls on the look page's camera (the arrows or WASD pan, Q and E turn, a trackpad swipes to pan and
  pinches to zoom, a mouse wheel zooms). The controls change no frame the goldens render.

Out of scope: the game's loader, wind, impostors, LODs, a twig-mass shadow for twigs thinner than a shadow texel.

## Approach

The prototype is a design spike for the owner's judgement. If the owner accepts the look, a later plan moves
the generator to `tools/` as a seeded offline bake (species data in, GLB and crown ellipsoids out).

## Acceptance

- Every species above builds on load with no page error (`tools/shot.mjs` exits 0).
- Deterministic: the same species and seed give the same geometry hash twice in one page.
- Each tree within the art bible's budget (`docs/art-bible.md` §5: about 2–8k triangles), printed per species.
- Screenshots at the near, mid and far zoom in summer, autumn and winter, judged by the owner.
- The look page with `?trees=gen,cards` against `?trees=cards` from the same cameras, judged by the owner; the
  default arm's golden screenshots unchanged (`tools/golden.mjs` against origin/main).
- On the look page in winter (`?season=3`), the generated deciduous trees are bare branches with a few tufts, and
  their shadows are the tufts' and limbs' only (a screenshot); `?clumpvol=off` against the default, judged by the owner.
- The cost: `tools/bench-look.mjs` paired A/B of `?trees=gen,cards` against `?trees=cards`, summer and winter, on a
  quiet machine (load average under 4), recorded in `docs/plans/active/track-e-results/shadows-foliage.md`.

## Review rounds
