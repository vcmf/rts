---
status: current
last_reviewed: 2026-10-08
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
| At 40 battalions of 400 (decision 0018) the sim and the soldier layer are over budget on the dev Mac: the formation step about 5 ms a tick marching (target 2 ms, so 8× fits), sim and soldier layer 14 ms a frame marching and 6 ms firing (budget 4 ms), the hash about 5 ms every 20 ticks (it writes the trail ring of all 128 slots, 512 points each). The cost tests hold temporary budgets (8 ms a tick, 20 ms a frame) | `src/sim/formation.ts` (per-man sampling and gates), `src/render/soldiers.ts`, `src/sim/serialize.ts` (hash), since S1c-4 | S1c-5 (`docs/plans/active/s1c4-battalion-scale.md`, Next): cheaper per-man work in the formation step and the layer, the hash, and the S2 worker |
| ~~Casualty re-packing in the sim (the fill rule after losses) moves men sideways without the footprint gate~~ | `src/sim/formation.ts` (`occupied`), since S1a | **Fixed in S1c-3** (#18): every loss goes through `removeMan`, which moves it to another company when the re-pack would put a man newly on impassable ground (`docs/plans/active/s1c3-repack-gate.md`) |
