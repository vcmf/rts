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

Track M's records 0053 and 0028–0030 were written on `epic/map-engine` as 0022–0025 and renumbered on 2026-10-13, before
the epic reached main, because main had taken 0022, 0024 and 0025 (`docs/plans/done/m-decision-numbers.md`). A
renumber of records that have not reached main yet, to keep numbers unique, is the one change allowed to an accepted
record: its number, its title's number and the citations, nothing else. Merged pull requests #66–#72 and the epic's
tracking PR #49 cite the old numbers: 0022 is 0027 (now 0053, below), 0023 is 0028, 0024 is 0029, 0025 is 0030. **0023 is retired**:
it is never given to another record, so that an old citation of it cannot resolve to an unrelated one.
The first of them, 0027, moved again on 2026-10-22, to 0049 (main had given 0027 to another record on 2026-10-14:
units take the light's value), and on 2026-10-23 to **0053** (#134 took 0049). Track M's pull requests and commits up to
then (#66–#79, PR #49) cite it as 0027 or 0049; either citation means 0053 (main's 0027 is the units' record, and 0049
is #134's).
The browser-checks record, written as 0047 and then 0052 on its branch (#129) and cited as 0052 on this epic, is **0060**:
`main` took 0052 for the code style (2026-10-24).

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
| [0011](0011-scale-and-min-spec.md) | Play area 1–1.5 km; min-spec an RTX 3060 laptop | superseded by 0061 |
| [0012](0012-heightfield-authority.md) | One heightfield is the authority for height, built offline | accepted |
| [0013](0013-single-player-first.md) | Single-player first, multiplayer-capable | accepted |
| [0014](0014-review-workflow.md) | Plan, implement, review in rounds, redesign after three | superseded by 0025 |
| [0015](0015-era-generic-engine.md) | The engine is era-generic, from antiquity to the Napoleonic era | accepted |
| [0016](0016-typescript-toolchain.md) | Game code in strict TypeScript, tested with Vitest, linted with ESLint, versions pinned | accepted |
| [0017](0017-paint-on-units-by-screen-size.md) | Paint on units follows their size on screen | proposed |
| [0018](0018-battalion-of-400.md) | Battalions of about 400 soldiers, one figure each; the engine reaches 800 | accepted |
| [0019](0019-shading-data-from-authored-surface.md) | Shading data finer than the heightfield comes from the authored surface | proposed |
| [0020](0020-track-m-on-an-epic-branch.md) | The map engine is Track M, built on an epic branch | accepted |
| [0021](0021-two-metre-map-cell.md) | Every map grid is built on one 2 m cell | accepted |
| [0022](0022-soft-ramp-for-foliage.md) | Foliage crowns are painted with a soft ramp (amended by 0084) | accepted |
| [0024](0024-blur-as-player-option.md) | Depth of field in gameplay is a player option, on by default | accepted |
| [0025](0025-review-by-kind-of-pr.md) | Review rounds by kind of PR: code as before, docs one round at most, research none | accepted |
| [0026](0026-crops-under-a-soldiers-chest.md) | Standing crops are drawn under a soldier's chest | accepted |
| [0027](0027-units-take-the-lights-value.md) | Units take the light's value, not its hue | accepted |
| [0028](0028-generators-form-a-chain.md) | Generators form a chain; kinds that keep apart share one scatter's mix | accepted |
| [0029](0029-free-standing-trees.md) | Free-standing trees stand on the cells, as a list | accepted |
| [0030](0030-shared-edges-are-the-line.md) | A shared edge is the line itself; the area keeps off the line's cells | accepted |
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
| [0048](0048-battle-in-a-worker.md) | The battle runs in a worker, its soldiers stepped at 12 fps | accepted |
| [0049](0049-simple-shadows-beyond-close-zoom.md) | The figures' shadow map only up close; one simple shadow a soldier beyond | proposed |
| [0050](0050-armies-32k-at-120fps.md) | 32,000 soldiers at 120 fps: four steps, each kept only if measured (experimental) | proposed |
| [0051](0051-closer-zoom-nearest-lod.md) | The closest zoom at 15 m, held over high ground, with the full figure for the men nearest | proposed |
| [0052](0052-code-style.md) | Code style: Prettier formats, ESLint keeps lines short and one statement each | accepted |
| [0053](0053-generators-expand-by-dependency.md) | Generators expand by dependency, over finished features, with hard and soft reads | superseded by 0028 |
| [0054](0054-readable-code.md) | Readable code: small functions, doc comments in new code, a test for every bug fix | accepted |
| [0055](0055-lit-map-view-tilts.md) | The lit map view leans a little off straight down, with armies as low slabs | accepted |
| [0056](0056-map-ink-at-ratio-one.md) | The map's ink renders at a pixel ratio of 1 by default; sharp ink is a setting | accepted |
| [0057](0057-one-language-for-the-battlefield.md) | One language for the battlefield and one for the armies; every system reads them | accepted |
| [0058](0058-one-map-view-lit.md) | One map view: the editor's draft and the game's staff map, lit with a 3D feel | accepted |
| [0059](0059-map-ink-upscaled-by-easu.md) | The map's ink is upscaled by FSR 1's EASU, on its alpha | accepted |
| [0060](0060-browser-checks-are-scripts.md) | Browser checks are scripts over CDP; the DevTools MCP is for exploring | accepted |
| [0061](0061-square-designed-maps-2-to-6-km.md) | Square maps of 2 to 6 km a side, designed for play, at true local scale (amended by 0070) | accepted |
| [0062](0062-simple-shadows-at-every-zoom.md) | The simple shadow at every zoom, softer, lighter and shorter up close | accepted |
| [0063](0063-real-relief-as-placed-pieces.md) | Real relief is placed pieces of a pinned heightfield, read by bicubic (amended by 0070) | accepted |
| [0064](0064-lit-view-flat-plane-baked-in-the-worker.md) | The lit map view is one flat plane in Babylon, its bakes made in the compile worker | accepted |
| [0065](0065-map-ink-as-distance-fields-houses-as-boxes.md) | The lit map draws from the cells, its edges smoothed by distance fields; its houses are lit boxes | accepted |
| [0066](0066-figures-lod-cross-fade.md) | The figures' LODs cross-faded per man by a screen-door dither | proposed |
| [0067](0067-simple-shadows-darker.md) | The soldiers' simple shadows darker: a gain on their darkening (amends 0062; its values superseded by 0071) | accepted |
| [0068](0068-dye-palette.md) | Uniforms name dyes from one palette, by cloth part | accepted |
| [0069](0069-scans-placed-in-their-relief-frame.md) | A scan to trace from is a source placed in its relief file's frame, bent through control points, kept out of git | accepted |
| [0070](0070-a-field-as-a-scale-model.md) | A real field may be fitted to a map as a scale model: distances and heights scaled by one factor (amends 0061 and 0063) | accepted |
| [0071](0071-soldier-contact-shadow.md) | A contact shadow under the soldiers' feet; their shadows no darker than the ground's painted shadow (amends 0062, supersedes 0067's values; its oval superseded by 0074) | accepted |
| [0072](0072-battle-threads-pr6-not-needed.md) | Battle threads: no PR 6; the look page's placing goes to the men worker instead | accepted |
| [0073](0073-modern-works-mended-from-their-surroundings.md) | Modern works are mended out of real relief by rebuilding the ground from what lies around them | accepted |
| [0074](0074-soldier-shadow-per-step.md) | The soldiers' shadow from their pose up close, baked per animation step; no contact oval (amends 0062, supersedes 0071's oval) | accepted |
| [0075](0075-arms-share-the-units-pipeline.md) | The cavalry and the artillery share the units pipeline; a figure on more than its root measures its shadow from its contacts (amends 0062, 0074) | proposed |
| [0077](0077-a-pond-levels-at-its-lower-bank.md) | A pond with no level of its own levels at its lower bank; a dam is drawn, never implied | accepted |
| [0078](0078-editor-writes-the-intent-file-in-place.md) | The editor edits the intent file in the page and saves only what changed, through the dev server | accepted |
| [0079](0079-ids-are-named-when-made.md) | The map editor names a feature or a map when it is made; renames are done in the file | accepted |
| [0080](0080-melee-holds-cornered-routers-cut-down.md) | A melee holds until one side breaks; a router the enemy reaches is cut down, never surrenders | accepted |
| [0081](0081-the-bench-timeline-in-the-battle.md) | The bench's timeline lives in the battle, wherever it runs; its overlay is a view on the page | accepted |
| [0082](0082-light-map-at-half-a-metre.md) | The baked light map at about half a metre a texel (1536² over the 800 m tile, the target 0.53 m) | accepted |
| [0083](0083-smoke-as-soft-painted-banks.md) | Powder smoke as soft painted banks, thinned over the formations | proposed |
| [0084](0084-a-soft-mid-tone-on-figures-and-buildings.md) | A soft mid tone on the figures, the buildings and the nature meshes (amends 0022) | accepted |
| [0085](0085-upright-meadow-and-wheat-fill.md) | The meadow's grass upright and shorter, the wheat filled (`?grassup`, `?wheatfill`; amends 0041's clumps) | accepted |
