---
status: done
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
- On that arm, what the generator's data allows (decision 0031, accepted 2026-10-14; the owner, 2026-10-14: the official page
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
  Done 2026-10-14 on a loaded machine (load average 8–49, not under 4): summer no cost (−0.3 to −0.4 ms), winter at
  most about +0.3 ms at the widest zoom; the numbers and caveats are in that file.

## Review rounds
- **Round 1** (`/code-review high`, 10 findings). Severe: the twig mesh dropped the thin end of every chain that
  started thick (fixed: the chains are built on the nodes of each radius range, starting at their parent outside
  it). Fixed too: the vertical swipe ran against the fingers; the sky occlusion thinned under `?trees=gen` without
  cards; a slider release re-baked when nothing changed; conifers had twig meshes; the mouse/trackpad test (now
  Chrome's 3 × deltaY trackpad signature, else wheelDeltaY steps of 120); sliders swallowed the keys; each model was
  grown twice. Kept: the re-bake on the slider's release, a judging aid of the look page as the grain's drop is (the
  game bakes the map's season once); the duplicated ellipsoid sizes in `cardOpts` (light).
- **Round 2** (`/code-review high`, 10 findings). Severe: round 1's fix stopped the slider's release from re-baking
  (the drag's input events had already taken the "changed" signal). Fixed: the page records what cast the shadows at
  each bake (`shadowState`, read after the shadow pass renders) and re-bakes on release when it differs; checked in the
  page (no bake while dragging, one on release, none on a second release). Fixed too: the arrows reached the Render
  scale list; the fallback mouse test lost its whole-pixel guard; the prototype re-baked its shadow canvas on every
  slider tick (now when a crown's shadow turns on or off); the default page loaded the generator (now a dynamic import
  under `?trees=gen`); `?season` was checked after the build; a cancelled touch left the zoom slider stuck; the bench's
  pack arm drew the twigs; the unused `chunk` key and a parameter that shadowed `leafLoss`.
- **Round 3** (`/code-review high`, 10 findings, none severe: fixed what was worth it, and stopped). Fixed: the contact
  core under a bare tree kept full strength with soft shadows on (now as strong as the crown is whole; the pack's
  trees keep theirs); under `gen` a tree the drawn footprint rejected shifted the scatter's random stream (now the
  placed model decides and the drawn tree shrinks to fit: the non-tree scatter checked identical to `?trees=cards`);
  Firefox's line-mode wheel barely zoomed; Ctrl + mouse wheel zoomed as a pinch; macOS kept a key held after a
  release under Cmd; the season was wired only when twigs existed; conifers' unused twigs were built; a dead wheel
  setting; the zoom slider rewritten every frame. Left: the duplicated crown sizes (light).
