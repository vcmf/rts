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
| Reflection canvas uses a canvas blur filter (the context-loss pattern) | main, reflection bake | E0-lite bake rules (`docs/proposals/engine-design.md` §10 step 3) |
| Up/down pans move the map cos(pitch) as fast as left/right (0.56× at the steepest pitch) | main, Babylon panning | Own camera controller: drag keeps the grabbed ground point under the cursor (`docs/proposals/engine-design.md` §5) |
| The formation prototype's 20 Hz layer uses `Math.sin`, `cos`, `atan2`, `hypot` and `exp` (decision 0006 bans transcendental functions in the simulation); replays match within one browser only | main and PR #9, `prototypes/formation-core.js` | S0 sim spine: table-based or fixed-point trigonometry per decision 0006; the prototype stays the reference for behaviour, not for determinism |
| Casualty re-packing in the sim (the fill rule after losses) moves men sideways without the footprint gate: at a bank parallel to a line, a closing file could stand on impassable ground | `src/sim/formation.ts` (`occupied`), since S1a | Gate casualty re-packing with the casualty system (S1c): refuse or shift the repack like any other pose change |
