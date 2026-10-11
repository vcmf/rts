---
status: current
last_reviewed: 2026-10-11
---

# Known issues

Grave findings in code that already exists on main, recorded with a planned fix instead of blocking
an unrelated PR (`AGENTS.md`, workflow). Fixed issues stay listed, struck through, with the PR.

| Issue | Where | Planned fix |
|---|---|---|
| ~~Camera pans in view space; the target can climb without limit~~ | main, camera setup | **Fixed in W1** (#1): ground-plane pan + focus clamp, checked by render-check |
| ~~Reflection canvas uses a canvas blur filter (the context-loss pattern)~~ | main, reflection bake | **Fixed in L0a** on the look page: a JS Gaussian (`src/look/water.ts`); the prototype keeps the filter as the reference |
| Up/down pans move the map cos(pitch) as fast as left/right (0.56× at the steepest pitch) | main, Babylon panning | Own camera controller: drag keeps the grabbed ground point under the cursor (`docs/proposals/engine-design.md` §5) |
| The formation prototype's 20 Hz layer uses `Math.sin`, `cos`, `atan2`, `hypot` and `exp` (decision 0006 bans transcendental functions in the simulation); replays match within one browser only | main and PR #9, `prototypes/formation-core.js` | S0 sim spine: table-based or fixed-point trigonometry per decision 0006; the prototype stays the reference for behaviour, not for determinism |
| ~~At 40 battalions of 400 the formation step is over its 2 ms a tick and the hash costs 5 ms~~ | `src/sim/formation.ts`, `src/sim/serialize.ts`, since S1c-4 | **Fixed in S1c-5**: 1.8 ms a tick marching, the hash 2.8 ms every 20 ticks (`docs/plans/active/s1c5-cost.md`) |
| With all 40 battalions of 400 marching, sim and soldier layer take 4.4–6 ms a frame on the dev Mac (budget 4 ms; at the halt and firing, 0.7 ms). The marching test holds 10 ms (vitest, about 8 ms there) | `src/render/soldiers.ts`, since S1c-4 | The S2 worker takes the sim and the hash off the main thread; the layer's own per-man step (5 ms of it) needs a worker of its own or a stride (half the men a frame), measured against the look then (`docs/plans/active/s1c5-cost.md`, Next) |
| The footprint gate does not treat ground beyond the map's edge as impassable (a place off the map reads the edge cell): a column of route or a line deployed near the edge stands partly off the map. At 400 men a regiment's line is 157 m and its column of route 190 m on a 360 m field, so it shows | `src/sim/formation.ts`, `src/sim/terrain.ts`, since S1a | S1e (the larger map and its edges): the cells beyond the edge count as impassable for every kind. Until then the scenarios keep every shape they are drilled into on the map (`src/scenarios/s1d-arms.ts`) |
| The hash costs 4.1 ms every 20 ticks at 40 battalions (2.7 ms before S1d-1): the trail ring is sized for the deepest trail shape of any type (960 points for the regiment's column of route, 512 for the battalion's), for every slot | `src/sim/world.ts`, `src/sim/serialize.ts`, since S1d-1 | The S2 worker takes the hash off the main thread; a save of only the live trail points (S2) shrinks it (`docs/plans/active/s1d1-unit-types.md`) |
| ~~Casualty re-packing in the sim (the fill rule after losses) moves men sideways without the footprint gate~~ | `src/sim/formation.ts` (`occupied`), since S1a | **Fixed in S1c-3** (#18): every loss goes through `removeMan`, which moves it to another company when the re-pack would put a man newly on impassable ground (`docs/plans/active/s1c3-repack-gate.md`) |
| Baked shadow edges shimmer slightly in a slow pan: the light map's painted edge is decided per texel (0.26 m), so up close it is a speckled step; on the terrain the band ramp's widening (L2b) softens it to 0.48% of pixels per quarter-pixel shift (`tools/detail-check.mjs`, shimmer), from 3.1% with the L0 grain | main, `src/look/shaders/bake.frag` | L5 (bakes): a smoother painted edge in the bake, or a softer read of it; the shimmer limit then tightens (`docs/plans/active/l2-detail.md`) |
