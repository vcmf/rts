---
status: current
last_reviewed: 2026-10-11
---

# Known issues

Known issues are tracked as GitHub issues labelled
[`known-issue`](https://github.com/vcmf/rts/issues?q=label%3Aknown-issue), each with a phase label for its planned fix (`AGENTS.md`,
workflow). The plan and the code they are about cite them as `#N`; the PR that fixes one says `Fixes #N`.

The issues fixed before the move (2026-10-11), kept for the plans that cite this file:

| Issue | Where | Planned fix |
|---|---|---|
| ~~Camera pans in view space; the target can climb without limit~~ | main, camera setup | **Fixed in W1** (#1): ground-plane pan + focus clamp, checked by render-check |
| ~~Reflection canvas uses a canvas blur filter (the context-loss pattern)~~ | main, reflection bake | **Fixed in L0a** on the look page: a JS Gaussian (`src/look/water.ts`); the prototype keeps the filter as the reference |
| ~~At 40 battalions of 400 the formation step is over its 2 ms a tick and the hash costs 5 ms~~ | `src/sim/formation.ts`, `src/sim/serialize.ts`, since S1c-4 | **Fixed in S1c-5**: 1.8 ms a tick marching, the hash 2.8 ms every 20 ticks (`docs/plans/active/s1c5-cost.md`) |
| ~~Casualty re-packing in the sim (the fill rule after losses) moves men sideways without the footprint gate~~ | `src/sim/formation.ts` (`occupied`), since S1a | **Fixed in S1c-3** (#18): every loss goes through `removeMan`, which moves it to another company when the re-pack would put a man newly on impassable ground (`docs/plans/active/s1c3-repack-gate.md`) |
