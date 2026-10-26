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
| [0003](0003-no-blur-in-gameplay.md) | No optical blur during gameplay | superseded by 0024 |
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
| [0014](0014-review-workflow.md) | Plan, implement, review in rounds, redesign after three | superseded by 0025 |
| [0015](0015-era-generic-engine.md) | The engine is era-generic, from antiquity to the Napoleonic era | accepted |
| [0016](0016-typescript-toolchain.md) | Game code in strict TypeScript, tested with Vitest, linted with ESLint, versions pinned | accepted |
| [0017](0017-paint-on-units-by-screen-size.md) | Paint on units follows their size on screen | proposed |
| [0018](0018-battalion-of-400.md) | Battalions of about 400 soldiers, one figure each; the engine reaches 800 | accepted |
| [0019](0019-shading-data-from-authored-surface.md) | Shading data finer than the heightfield comes from the authored surface | proposed |
| [0022](0022-soft-ramp-for-foliage.md) | Foliage crowns are painted with a soft ramp | accepted |
| [0024](0024-blur-as-player-option.md) | Depth of field in gameplay is a player option, on by default | accepted |
| [0025](0025-review-by-kind-of-pr.md) | Review rounds by kind of PR: code as before, docs one round at most, research none | accepted |
| [0026](0026-crops-under-a-soldiers-chest.md) | Standing crops are drawn under a soldier's chest | accepted |
| [0027](0027-units-take-the-lights-value.md) | Units take the light's value, not its hue | accepted |
| [0031](0031-generated-trees.md) | Trees are generated from species data | accepted |
| [0032](0032-units-under-clouds-and-whites.md) | A near-white coat takes less of the sun's hue (open until the figures) | proposed |
| [0033](0033-temperate-is-the-default-mood.md) | The temperate mood is the default | superseded by 0043 |
| [0034](0034-checks-re-baselined-for-the-default-mood.md) | The shimmer gate at the widest view is re-baselined for the temperate mood | accepted |
| [0035](0035-units-take-the-bounce-hue.md) | Units take the ground's bounce at its full hue, at a share of its strength | accepted |
| [0036](0036-frame-rate-targets-and-render-scale.md) | Frame rate: 60 fps hard, 120 fps soft; the render scale by zoom | superseded by 0045 |
| [0037](0037-simulation-owns-animation-timing.md) | The simulation owns timing; animation is fitted to its phases | accepted |
| [0038](0038-figure-pipeline-layout.md) | Figures: code in tools, sources out of git, a generated registry | accepted |
| [0039](0039-roads-baked-far-live-near.md) | Roads: baked far out, painted live from mid zoom in | accepted |
| [0040](0040-near-field-depth-of-field.md) | The gameplay depth of field blurs the near field too, in the bottom band, units with the scene | accepted |
| [0041](0041-combed-meadow-default.md) | The combed meadow is the default grass | accepted |
| [0042](0042-dark-water-shimmer-limits.md) | Dark water: the water's shimmer limits re-baselined | accepted |
| [0043](0043-epic-is-the-default-mood.md) | The epic mood, after Tiny Glade, is the default | accepted |
| [0044](0044-epic-shimmer-limits.md) | The water's shimmer limits re-baselined for the epic mood | accepted |
| [0045](0045-render-scale-easu.md) | The render scale 0.9 from the closest zoom, upscaled by EASU | accepted |
| [0046](0046-webgl2-minimum.md) | WebGL2 is the minimum | accepted |
| [0047](0047-figures-cast-runtime-shadows.md) | The figures cast runtime shadows from a map of their own | proposed |
| [0048](0048-battle-in-a-worker.md) | The battle runs in a worker, its soldiers stepped at 12 fps | proposed |
| [0049](0049-simple-shadows-beyond-close-zoom.md) | The figures' shadow map only up close; one simple shadow a soldier beyond | proposed |
| [0050](0050-armies-32k-at-120fps.md) | 32,000 soldiers at 120 fps: four steps, each kept only if measured (experimental) | proposed |
| [0051](0051-closer-zoom-nearest-lod.md) | The closest zoom at 15 m, held over high ground, with the full figure for the men nearest | proposed |
| [0052](0052-code-style.md) | Code style: Prettier formats, ESLint keeps lines short and one statement each | accepted |
| [0054](0054-readable-code.md) | Readable code: small functions, doc comments in new code, a test for every bug fix | accepted |
| [0060](0060-browser-checks-are-scripts.md) | Browser checks are scripts over CDP; the DevTools MCP is for exploring | accepted |
| [0062](0062-simple-shadows-at-every-zoom.md) | The simple shadow at every zoom, softer, lighter and shorter up close | accepted |
| [0069](0069-melee-holds-cornered-routers-cut-down.md) | A melee holds until one side breaks; a cornered router is cut down, never surrenders | accepted |
