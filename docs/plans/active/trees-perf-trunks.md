---
status: active
last_reviewed: 2026-10-16
---

# Plan: the same trees everywhere, the trunks' shadows, and the frame toward 120 fps

The owner (2026-10-16), in one PR: "use same tree generation everywhere; spawn deep research to see how to optimize
and achieve 120fps with current settings without compromising much; add trunk". The far woods (#99) were low-detail
stand-ins the camera can come within reach of (they read as plain blobs up close); the trees' shadows had no trunk
("at close it's a bit weird"); and the frame targets are now 60 fps hard, 120 fps soft.

## Scope

- **The far woods as the near trees:** each far item its species' generated model with its leaf cards, its leaf fall
  and its twigs (the near scatter's `drawGroup`), sized as the stand-ins were (the larger of its reach and its height
  over 1.8 fills `Bush_1`'s footprint at the item's scale); two of each species' four models. The stand-ins
  (`farModel`) go. In winter the far broadleaves now go bare as the near ones do (#98).
- **Their cost:** one mesh a model holds every far instance; each frame the view moves, the instances in the view's
  frustum are packed to the front of its buffers (`farCuller`), those within 220 m of the camera with their cards,
  the farther ones with the model's own crown mesh (no alpha test, a few pixels wide there). The shadow pass bakes
  with every far tree and its cards. As built, after the owner saw the switch pop ("there's some clear visual change"):
  a dithered cross-fade over 190 to 250 m, and the crown mesh lit as the cards (their volume light per clump).
- **The trunks' shadows:** a trunk is thinner than two of the shadow map's texels (0.33 m) and the soft filter washed
  it out. Each drawn tree's trunk is drawn into the light map's sun after the terrain, once, as a quad on the ground
  from its root away from the sun to its crown's base: crisp at the root, softening along it, fading where the
  crown's shadow starts. Baked: nothing a frame.
- **Toward 120 fps:** the research (`docs/research/frame-rate-120.md`); A/Bs of its cheapest items, kept where they
  pay without a visible change. As built: the grain's anisotropic filtering (4 to 2 or 1) and the ground drawn after
  the other opaque meshes were tried and dropped (results); one of the two macro bakes is read only where it has
  weight (the same pixels). Judged by the frame interval beside the GPU timer (the timer over-reports on this Mac).
- Docs: `docs/systems/look.md`, the track plan (L7's table, the frame targets), the research note.

## Acceptance

- Captures: the far woods at the far-edge and wide views and up close, summer and winter; a trunk's shadow in sun.
- The frame (`tools/bench-look.mjs`, Metal, the frame interval and the timer, against main, twice each side).
- The guard against main (the default, cover and crops views, three seasons), `tools/coat-check.mjs`,
  `tools/check-negatives.mjs`, `tools/water-look-check.mjs`, `tools/macro-check.mjs`: exit 0.
- `npm test`, `node tools/check-docs.mjs`.
