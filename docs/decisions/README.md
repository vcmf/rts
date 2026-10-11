---
status: current
last_reviewed: 2026-10-08
---

# Decisions

Numbered decision records (MADR-lite, template: `docs/templates/decision.md`). A record is never
edited after acceptance: to change a decision, write a new record and mark the old one
`superseded by NNNN`. Numbers are never reused. **Accepted** records are binding; **proposed**
records are open until the owner accepts or rejects them (then their status changes once). Decisions taken earlier in October 2026 were
recorded here on 2026-10-08.

| # | Decision | Status |
|---|---|---|
| [0001](0001-painterly-look-in-materials.md) | The painterly look lives in assets and materials | accepted |
| [0002](0002-top-down-camera-no-sky.md) | The camera is always top-down; there is no sky | accepted |
| [0003](0003-no-blur-in-gameplay.md) | No optical blur during gameplay | accepted |
| [0004](0004-lowland-meander-river.md) | The first river type is the lowland meander | accepted |
| [0005](0005-sim-render-split.md) | The simulation is separate from rendering and driven by commands | accepted |
| [0006](0006-restricted-float64.md) | Deterministic simulation numbers with restricted float64 | accepted |
| [0007](0007-battalion-scale.md) | The player commands battalions of about 100 soldiers, one figure each | superseded by 0018 |
| [0008](0008-no-couriers.md) | No couriers: orders apply immediately | accepted |
| [0009](0009-battle-length.md) | A battle takes 30–45 minutes of real time | accepted |
| [0010](0010-locked-camera-staff-map.md) | A locked camera with a short zoom; the far zoom is the staff map | accepted |
| [0011](0011-scale-and-min-spec.md) | Play area 1–1.5 km; min-spec an RTX 3060 laptop | accepted |
| [0012](0012-heightfield-authority.md) | One heightfield is the authority for height, built offline | accepted |
| [0013](0013-single-player-first.md) | Single-player first, multiplayer-capable | accepted |
| [0014](0014-review-workflow.md) | Plan, implement, review in rounds, redesign after three | accepted |
| [0015](0015-era-generic-engine.md) | The engine is era-generic, from antiquity to the Napoleonic era | accepted |
| [0016](0016-typescript-toolchain.md) | Game code in strict TypeScript, tested with Vitest, linted with ESLint, versions pinned | accepted |
| [0017](0017-paint-on-units-by-screen-size.md) | Paint on units follows their size on screen | proposed |
| [0018](0018-battalion-of-400.md) | Battalions of about 400 soldiers, one figure each; the engine reaches 800 | accepted |
