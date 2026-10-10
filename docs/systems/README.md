---
status: current
last_reviewed: 2026-10-08
---

# Systems

One doc per **built** system, describing how it works **now** (template:
`docs/templates/system.md`). A system doc is written when a system first ships and updated in every
PR that changes it; the design that led to it stays in `docs/proposals/` and the decisions in
`docs/decisions/`.

| System | Doc | State |
|---|---|---|
| River (lowland meander) | `docs/systems/river.md` | built in the prototype (W1, W1b) |
| The look page: terrain, river, nature, bakes, passes | `docs/systems/look.md` | built (Track E L0c): the prototype ported to TypeScript |
| Terrain, bakes, camera | not yet: see `docs/proposals/engine-design.md` | prototype, to be documented at E0-lite |
| Painterly shading, vegetation, seasons | not yet: see `docs/art-bible.md` | prototype |
| Staff map | not yet: see `docs/proposals/staff-map/design.md` | feel prototype |
| Simulation spine (S0) | `docs/systems/sim-spine.md` | built (S0) |
| Formations (the 20 Hz layer) | `docs/systems/formations.md` | built (S1a) |
| The sim page: soldier layer, staff map drawing, input | `docs/systems/sim-page.md` | built (S1b) |
| Fire and morale | `docs/systems/fire-morale.md` | built (S1c-1): fire by company, loss-driven morale, rout |
| Melee, cavalry, artillery | not yet: see `docs/proposals/sim-design.md` | not built |
