---
status: accepted
date: 2026-10-29
---

# 0082 The baked light map at about half a metre a texel

Accepted by the owner on 2026-10-29, from the light resolution test's sheets. The plan and its measurements:
`docs/plans/active/lightmap-half.md`; as built: `docs/systems/look.md`.

## Context

- The light map (sun visibility, sky occlusion, the valley mist mask, the trees' contact) was baked at 3072² over the
  800 m tile, 0.26 m a texel, the fine end of the engine design's range (0.26–0.5 m, `docs/proposals/engine-design.md`
  §6). The soldiers' shade is baked at its size.
- The light resolution test (branch `look/lightres-test`, a temporary switch for the light map's size; 400, 768, 1536
  and 3072 texels, every zoom, a tree's foot, the buildings, the woods, the armies): at 1536 (0.52 m) the look matched
  3072's, the trunks' shadow strips and the buildings' shadow corners kept; at 768 (1 m) the trunks' strips vanish.
- At 1536 the light map and the soldiers' shade free 54 MiB each (an RGBA8 colour and a 4-byte depth buffer), and the
  light map's bake with what follows it takes about half the time (measured in the plan).
- The light over a 6 km map (the owner's look-on-Austerlitz plan, not yet merged) needs a fine level near the camera;
  its least-work option already takes the fine level at 0.5 m.

## Decision

- **The light map is 1536² over the 800 m tile, 0.52 m a texel**; the light texel target (`SPEC.texel.light`, the
  largest texel the light map may have, checked on derive) is **0.53 m**.
- What is drawn finer than this into the light map stays a world-space shape (the trunks' strips), and the bake's
  softness stays in metres (the penumbra), so the look does not depend on the texel.
- The bake budget counts the soldiers' shade beside the light map.

## Consequences

- 108 MiB less GPU memory with the armies; the light map's bake and those after it about 26 → 14 ms (Apple M1 Pro).
- A shadow edge on the ground is a texel softer (0.52 m); in the captures, a small difference only.
- A finer light map again (a closer zoom, thinner casters) needs a new record.
