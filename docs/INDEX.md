---
status: current
last_reviewed: 2026-10-08
---

# Docs index

One line per document. **Types:** *vision* and *conventions* frame everything; *system* docs describe
what is built **now** and are kept true; *decisions*: accepted records are binding until superseded, proposed ones are open; *proposals* are
designs, kept true as they change (nothing is frozen; what is built is described in the system docs);
*plans* are per-PR or per-workstream; *research* is background, not authoritative.

## Frame

- [`vision.md`](vision.md): pitch, pillars, scale, non-goals. *(draft)*
- [`art-bible.md`](art-bible.md): the look: fixed constraints, palette, light, seasons, water, assets. *(current)*
- [`architecture.md`](architecture.md): sim/render split, data model, commands, tick, Babylon setup. *(current; parts superseded by `docs/proposals/sim-design.md`)*
- [`engine-map.md`](engine-map.md): every engine part with its owner doc, phase and status. *(draft)*
- [`conventions.md`](conventions.md): commits, units and numbers, prototypes, docs. *(current)*
- [`glossary.md`](glossary.md): drill and engine terms. *(current)*
- [`asset-sources.md`](asset-sources.md): where assets come from, licences. *(current)*
- [`known-issues.md`](known-issues.md): where known issues live now (GitHub issues labelled `known-issue`), and the ones fixed before the move. *(current)*

## Decisions

- [`decisions/`](decisions/README.md): numbered decision records; the list is in its README.

## Systems (built, current behaviour)

- [`systems/river.md`](systems/river.md): the lowland meander river (W1, W1b).
- [`systems/sim-spine.md`](systems/sim-spine.md): the simulation spine: tick, commands, state, hashing, saves, replays (S0).
- [`systems/formations.md`](systems/formations.md): the formation layer in the sim: shapes, changes, the lag model, the footprint gate (S1a).
- [`systems/sim-page.md`](systems/sim-page.md): the page that draws and drives the sim: soldier layer, staff map, input, replays (S1b).
- [`systems/look.md`](systems/look.md): the look page: the painted world in TypeScript (Track E L0c).
- [`systems/fire-morale.md`](systems/fire-morale.md): fire by company, keyed casualties, loss-driven morale and rout (S1c-1).
- [`systems/melee.md`](systems/melee.md): cavalry charges, melee, and the square against cavalry (S1d-2).
- [`systems/artillery.md`](systems/artillery.md): the battery's roundshot over the ground and canister (S1d-3).
- [`systems/figure-pipeline.md`](systems/figure-pipeline.md): Tripo models to animated figures: re-scale, rig fixes, combine, scripted clips, checks, publish, the figure registry.
- [`systems/sides.md`](systems/sides.md): your side, the scenario's plan for the other, and the end of a battle (S1e-2).
- [`systems/map.md`](systems/map.md): the map engine: the kinds catalogue, the validator, resolution, the 2 m layers and water, the draft page, the sim compiler, the map CLI (Track M, M1, M2).
- More appear as systems are built; see [`systems/README.md`](systems/README.md).

## Proposals (designs before building)

- [`proposals/engine-design.md`](proposals/engine-design.md): world spec, heightfield, camera, bakes, scale, known issues, order of engine work. *(accepted)*
- [`proposals/sim-design.md`](proposals/sim-design.md): the battle simulation (battalions, drill, fire, morale, determinism, phases). *(draft)*
- [`proposals/battle-threads.md`](proposals/battle-threads.md): the battle in a worker, its soldiers stepped at 12 fps (decision 0048). *(accepted)*
- [`proposals/staff-map/design.md`](proposals/staff-map/design.md): the far-zoom staff map, art direction. *(accepted)*
- [`proposals/staff-map/implementation.md`](proposals/staff-map/implementation.md): how the staff map is built. *(draft)*
- [`proposals/prepainted-terrain.md`](proposals/prepainted-terrain.md): a painted macro colour bake for the ground; strokes stay at runtime. *(draft)*
- [`proposals/map-format.md`](proposals/map-format.md): the map format, one schema-checked description of a battlefield that the sim, the 3D battlefield and the staff map compile from. *(draft)*
- [`proposals/unit-model.md`](proposals/unit-model.md): the unit model: categories, shapes and faces, sectors, engagement, experience levels, fire, the assault, guns taken, collision, pathfinding, counters and bonuses; phases U1–U9. *(draft)*
- [`proposals/collision-and-orders.md`](proposals/collision-and-orders.md): formed and loose bodies, the clamp on bins with half gaps, a melee that holds until one side breaks, the visual bench, the orders' queue and what suspends or clears it; phases C0–C4. *(draft)*
- [`proposals/unit-scenarios.md`](proposals/unit-scenarios.md): the situations the unit model must get right, each with its expected outcome and what the sim does today. *(draft)*
- [`proposals/map-engine.md`](proposals/map-engine.md): the map engine: a closed JSON language (one feature shape, dotted kinds from a catalogue of presets, five layers), its generator, compilers in Node and the browser, square grids, the draft and rendered views, Track M's phases. *(draft)*
- [`proposals/ai.md`](proposals/ai.md): the enemy AI: layers, influence maps, utility scores, lookahead with the sim, honest difficulty; built after pathfinding. *(draft)*
- [`proposals/figure-animation.md`](proposals/figure-animation.md): animated figures: the simulation owns timing, clips are fitted to its phases by bindings checked at build time; the figure files and registry. *(accepted)*

## Plans

- Active: [`plans/active/prototype-plan.md`](plans/active/prototype-plan.md) (prototype phases, water W1–W6),
  [`plans/active/cavalry-artillery-demo.md`](plans/active/cavalry-artillery-demo.md) (the cavalry and the artillery on the armies demo, their shadows),
  [`plans/active/track-s.md`](plans/active/track-s.md) (Track S: the sim engine's remaining phases before the playtest, the `epic/sim-engine` branch),
  [`plans/active/lightmap-half.md`](plans/active/lightmap-half.md) (the baked light map at about 0.5 m a texel),
  [`plans/active/c0-bench.md`](plans/active/c0-bench.md) (C0: the visual bench, its overlay, time controls and cases),
  [`plans/active/ci-faster-tests.md`](plans/active/ci-faster-tests.md) (CI's tests and coverage in three shards each, the bench split in five files),
  [`plans/active/c1-claims.md`](plans/active/c1-claims.md) (C1: a prototype of the claim grid, experimental; its weak points and their order),
  [`plans/active/paper-layers.md`](plans/active/paper-layers.md) (paper layers: the relief as stacked lit sheets in the staff map prototype),
  [`plans/active/brigades-proto.md`](plans/active/brigades-proto.md) (brigades of two battalions in the staff map prototype),
  [`plans/active/water-paper.md`](plans/active/water-paper.md) (water as a paper wash, sunk below the land, in the staff map prototype),
  [`plans/active/relief-shading.md`](plans/active/relief-shading.md) (shaded relief from real heights: cast shadows and occlusion, baked once, in the staff map prototype),
  [`plans/active/slabs.md`](plans/active/slabs.md) (a slightly tilted map view, armies as low slabs, in the staff map prototype),
  [`plans/active/woods-canopy.md`](plans/active/woods-canopy.md) (woods in warm grey, in the staff map prototype),
  [`plans/active/perf-150.md`](plans/active/perf-150.md) (150 fps in the staff map prototype: the ink canvas made cheap),
  [`plans/active/real-terrain-proto.md`](plans/active/real-terrain-proto.md) (real terrain in the staff map prototype: ČÚZK's DMR 4G at Austerlitz, an experiment),
  [`plans/active/m6-lit-view.md`](plans/active/m6-lit-view.md) (Track M M6: the lit map view in the game's code, M6a–c done, M6d waits),
  [`plans/active/m8-austerlitz.md`](plans/active/m8-austerlitz.md) (Track M M8: Austerlitz drawn on the editor, the field as a scale model at 2×),
  [`plans/active/one-map-austerlitz.md`](plans/active/one-map-austerlitz.md) (one map in the language, drawn with the map editor: Austerlitz 1805, its draft-map mode and the real map),
  [`plans/active/look-austerlitz.md`](plans/active/look-austerlitz.md) (Austerlitz on the look page: the look compiler M4 for a window, then the 3D world in tiles, then the zoom handover; a plan),
  [`plans/active/look-austerlitz-a1.md`](plans/active/look-austerlitz-a1.md) (A1: the look compiler, a window of Austerlitz on the look page, Kobelnitz first),
  [`plans/active/look-austerlitz-a1b.md`](plans/active/look-austerlitz-a1b.md) (A1b: the camera's focus on the ground, the ground range per world, the Pratzen),
  [`plans/active/flow-default.md`](plans/active/flow-default.md) (the combed meadow as the default grass),
  [`plans/active/smoke-bank.md`](plans/active/smoke-bank.md) (musket smoke as soft painted banks at the muzzles, the smoke track's first step),
  [`plans/active/artillery-smoke.md`](plans/active/artillery-smoke.md) (artillery smoke: a gun's shot as a string of big soft clouds from its muzzle, the battery's bank, the smoke track's second step),
  [`plans/active/staff-map.md`](plans/active/staff-map.md),
  [`plans/active/s1c-fire-morale.md`](plans/active/s1c-fire-morale.md) (S1c),
  [`plans/active/s1c2-morale-machine.md`](plans/active/s1c2-morale-machine.md) (S1c-2),
  [`plans/active/s1c3-repack-gate.md`](plans/active/s1c3-repack-gate.md) (S1c-3),
  [`plans/active/s1c4-battalion-scale.md`](plans/active/s1c4-battalion-scale.md) (S1c-4: the 400-man battalion),
  [`plans/active/s1c5-cost.md`](plans/active/s1c5-cost.md) (S1c-5: the cost of 16,000 men),
  [`plans/active/s1d1-unit-types.md`](plans/active/s1d1-unit-types.md) (S1d-1: unit types, the cavalry regiment and the foot battery; the S1d split),
  [`plans/active/s1d2-charges.md`](plans/active/s1d2-charges.md) (S1d-2: charges, melee and the square against cavalry),
  [`plans/active/s1d3-artillery.md`](plans/active/s1d3-artillery.md) (S1d-3: the battery fires roundshot and canister),
  [`plans/active/s1e1-battlefield.md`](plans/active/s1e1-battlefield.md) (S1e-1: the 1.2 km battlefield, the map's edge, leaving the field; the S1e split),
  [`plans/active/s1e2-sides.md`](plans/active/s1e2-sides.md) (S1e-2: your side, the enemy's plan, the end of a battle),
  [`plans/active/s1e3-playtest.md`](plans/active/s1e3-playtest.md) (S1e-3: the playtest kit and the tuning from your play),
  [`plans/active/l2-detail.md`](plans/active/l2-detail.md) (Track E L2: the bench, the readability guard, the terrain detail layer),
  [`plans/active/l5-macro.md`](plans/active/l5-macro.md) (Track E L5: the ground's cover and macro colour, baked and in the shader, and the ablation),
  [`plans/active/armies-demo.md`](plans/active/armies-demo.md) (the first armies on the demo map, scripted),
  [`plans/active/armies-32k.md`](plans/active/armies-32k.md) (32,000 soldiers at 120 fps: the 40-a-side baseline and four measured steps, decision 0050, experimental),
  [`plans/active/close-zoom.md`](plans/active/close-zoom.md) (a closer zoom to show the soldiers, the full figure nearest, #133),
  [`plans/active/close-figures.md`](plans/active/close-figures.md) (the close-zoom figures: drawn inside out, a face on the back of the head, #164; shadows off the feet, #165),
  [`plans/active/simple-soldier-shadows.md`](plans/active/simple-soldier-shadows.md) (the shadow map only up close, a simple shadow per soldier beyond, #131),
  [`plans/active/cavalry-pistol.md`](plans/active/cavalry-pistol.md) (the cavalryman's pistol),
  [`plans/active/test-gaps.md`](plans/active/test-gaps.md) (the test gaps: the coverage audit, this week's regressions, the test PRs by area),
  [`plans/active/figure-pipeline.md`](plans/active/figure-pipeline.md) (the figure pipeline in the repository),
  [`plans/active/dye-palette.md`](plans/active/dye-palette.md) (a dye palette: uniforms name dyes by cloth part, the flags their own dyes; the greatcoat share and the figure next; decision 0068),
  [`plans/active/track-e-look.md`](plans/active/track-e-look.md) (Track E: the painterly look, L0–L9 and LA assets; results in [`plans/active/track-e-results/README.md`](plans/active/track-e-results/README.md), the L2a baselines in [`plans/active/track-e-results/l2a-baseline.md`](plans/active/track-e-results/l2a-baseline.md), the L2b results in [`plans/active/track-e-results/l2b-detail.md`](plans/active/track-e-results/l2b-detail.md), the shadows' and the crowns' in [`plans/active/track-e-results/shadows-foliage.md`](plans/active/track-e-results/shadows-foliage.md)).
- Done: [`plans/done/auto-floor.md`](plans/done/auto-floor.md) (Auto's floor at 0.75, and why Auto stays by zoom), [`plans/done/bare-earth.md`](plans/done/bare-earth.md) (bare earth where nothing grows, the soil by material, #116), [`plans/done/battle-threads.md`](plans/done/battle-threads.md) (the battle's threads: the sim and the soldiers in two workers, stepped at 12 fps, the pages reading published frames; decisions 0048, 0072, 0081), [`plans/done/browser-mcp.md`](plans/done/browser-mcp.md) (the page tools on a running Chrome, Windows Chrome from WSL, the DevTools MCP opt-in; decision 0060), [`plans/done/building-light.md`](plans/done/building-light.md) (the buildings' static light, baked once), [`plans/done/buildings.md`](plans/done/buildings.md) (the first buildings: a windmill, village houses), [`plans/done/code-style.md`](plans/done/code-style.md) (code style: Prettier and readability lint rules, rolled out by area; decision 0052, #148 #160 #167), [`plans/done/coverage-timeout.md`](plans/done/coverage-timeout.md) (a longer test budget under coverage, #85), [`plans/done/crop-depth.md`](plans/done/crop-depth.md) (straight crops, a dark ground under the near grass), [`plans/done/dark-water.md`](plans/done/dark-water.md) (dark water, after Tiny Glade's), [`plans/done/default-map.md`](plans/done/default-map.md) (the default map's large wheat field, #91), [`plans/done/docs-restructure.md`](plans/done/docs-restructure.md), [`plans/done/dof-v2.md`](plans/done/dof-v2.md) (depth of field v2: 8 bits, near and far, painted, #114), [`plans/done/dynamic-scale.md`](plans/done/dynamic-scale.md) (an automatic render scale by zoom), [`plans/done/epic-palette.md`](plans/done/epic-palette.md) (the epic mood, after Tiny Glade, the default), [`plans/done/far-woods-gen.md`](plans/done/far-woods-gen.md) (the far woods from the generated trees, #99), [`plans/done/forest-bench.md`](plans/done/forest-bench.md) (the forest bench, #65), [`plans/done/formation-feel.md`](plans/done/formation-feel.md), [`plans/done/frame-readout.md`](plans/done/frame-readout.md) (a frame readout on the look page), [`plans/done/gameplay-dof.md`](plans/done/gameplay-dof.md) (Track E: the gameplay depth of field), [`plans/done/gen-trees-default.md`](plans/done/gen-trees-default.md) (generated trees by default), [`plans/done/grass-flow.md`](plans/done/grass-flow.md) (the combed meadow, `?grass=flow`, #112), [`plans/done/ground-light.md`](plans/done/ground-light.md) (the light on the ground, #86), [`plans/done/ground-surface.md`](plans/done/ground-surface.md) (the ground's surface, bare earth, the autumn turn, #90), [`plans/done/headroom.md`](plans/done/headroom.md) (frame headroom: the cost ablations, the road split), [`plans/done/l0-spine.md`](plans/done/l0-spine.md) (Track E L0, #19 #20 #21), [`plans/done/l5c-meadow.md`](plans/done/l5c-meadow.md) (L5c, the meadow, #74), [`plans/done/l5d-crops.md`](plans/done/l5d-crops.md) (L5d, the crops from the meadow's grass, #76), [`plans/done/l7a-canopy-cards.md`](plans/done/l7a-canopy-cards.md) (L7a, leaf-card crowns, #58), [`plans/done/l7b-crown-volume.md`](plans/done/l7b-crown-volume.md) (L7b, the crowns as volumes, #61), [`plans/done/lc1a-moods.md`](plans/done/lc1a-moods.md) (LC1a, moods as data, #81), [`plans/done/lc1b-coats.md`](plans/done/lc1b-coats.md) (LC1b, the coats keep their colour, #82), [`plans/done/lc1c-unit-share.md`](plans/done/lc1c-unit-share.md) (LC1c, units take some of the air, #83), [`plans/done/lc3-temperate.md`](plans/done/lc3-temperate.md) (LC2 and LC3, the temperate mood, #87), [`plans/done/lc4-bounce.md`](plans/done/lc4-bounce.md) (LC4, the ground's bounce on units and crowns), [`plans/done/lc5-ground-bounce.md`](plans/done/lc5-ground-bounce.md) (LC5, bounced light on the ground, #100), [`plans/done/lod-fade.md`](plans/done/lod-fade.md) (the soldiers' LODs cross-faded per man, not switched, #188; decision 0066), [`plans/done/m-decision-numbers.md`](plans/done/m-decision-numbers.md) (Track M's decisions renumbered beside main's, #79), [`plans/done/m1-language.md`](plans/done/m1-language.md) (Track M M1, #50 #52), [`plans/done/m2-sim.md`](plans/done/m2-sim.md) (Track M M2, #54), [`plans/done/m3-generators.md`](plans/done/m3-generators.md) (Track M M3a–b, #56 #66), [`plans/done/m3c-trees.md`](plans/done/m3c-trees.md) (Track M M3c, #68), [`plans/done/m3d-follow.md`](plans/done/m3d-follow.md) (Track M M3d, #72), [`plans/done/m5-relief.md`](plans/done/m5-relief.md) (Track M M5, real relief, #178), [`plans/done/m7-editor.md`](plans/done/m7-editor.md) (Track M M7, the editor on the lit map: M7a–e, #192 #199 #202 #207 #213), [`plans/done/map-view-lit-v1.md`](plans/done/map-view-lit-v1.md) (a first lit map view in the staff map prototype, #136), [`plans/done/nan-guard.md`](plans/done/nan-guard.md) (no dark block from a NaN pixel), [`plans/done/render-scale.md`](plans/done/render-scale.md) (the render scale 0.9 near, upscaled by EASU), [`plans/done/roads.md`](plans/done/roads.md) (rutted dirt roads, more of them on the demo map, baked far out), [`plans/done/s0-sim-spine.md`](plans/done/s0-sim-spine.md) (S0, #11), [`plans/done/s1a-formations-on-spine.md`](plans/done/s1a-formations-on-spine.md) (S1a, #13), [`plans/done/s1b-sim-page.md`](plans/done/s1b-sim-page.md) (S1b, #14), [`plans/done/shadow-contact.md`](plans/done/shadow-contact.md) (a contact oval under the soldiers' feet that follows them; their shadows no darker than the ground's painted shadow, its hue matched to the trees'; decision 0071), [`plans/done/shadow-darker.md`](plans/done/shadow-darker.md) (the soldiers' simple shadows darker: a gain on their darkening, `?ushgain`, 2 up close and 1.5 far; after #175, decision 0067), [`plans/done/shadow-look.md`](plans/done/shadow-look.md) (the shadows' look, #59), [`plans/done/smoke-puffs.md`](plans/done/smoke-puffs.md) (musket smoke as opaque painted puffs: built, rejected by the owner, superseded by `docs/plans/active/smoke-bank.md`), [`plans/done/soft-shadows-all.md`](plans/done/soft-shadows-all.md) (the simple shadow at every zoom, softer, lighter and shorter up close; decision 0062), [`plans/done/soft-shadows.md`](plans/done/soft-shadows.md) (soft shadows, #60), [`plans/done/step-shadows.md`](plans/done/step-shadows.md) (the soldiers' shadows baked per animation step up close, darker crisper feet, no oval; decision 0074, #229), [`plans/done/stubble-height.md`](plans/done/stubble-height.md) (taller stubble, #77), [`plans/done/temperate-fixes.md`](plans/done/temperate-fixes.md) (the temperate mood's leftovers, #92), [`plans/done/terrain-movement.md`](plans/done/terrain-movement.md) (F1, #9), [`plans/done/track-e-shadows-foliage-docs.md`](plans/done/track-e-shadows-foliage-docs.md) (the shadow and foliage work in Track E's documents, #67), [`plans/done/tree-generator.md`](plans/done/tree-generator.md) (generated trees, leaf fall and clump-lit crowns, #84), [`plans/done/trees-perf-trunks.md`](plans/done/trees-perf-trunks.md) (the same trees everywhere, trunk shadows, toward 120 fps, #102), [`plans/done/tripo-lowpoly-buildings.md`](plans/done/tripo-lowpoly-buildings.md) (the buildings from Tripo's own low-poly models, windows as inlays, a farmhouse and a manor), [`plans/done/units-cloud-shade.md`](plans/done/units-cloud-shade.md) (units take the soft cloud shade, #89), [`plans/done/w1-river-shape.md`](plans/done/w1-river-shape.md), [`plans/done/w1b-river-width.md`](plans/done/w1b-river-width.md), [`plans/done/w2-river-banks.md`](plans/done/w2-river-banks.md) (water W2, in #26), [`plans/done/w3-water-data.md`](plans/done/w3-water-data.md) (water W3, #30), [`plans/done/w4-water-surface.md`](plans/done/w4-water-surface.md) (water W4, #42), [`plans/done/w5-banks.md`](plans/done/w5-banks.md) (water W5, #45 #46), [`plans/done/wheat-height.md`](plans/done/wheat-height.md) (standing wheat under a soldier's chest), [`plans/done/wide-perf.md`](plans/done/wide-perf.md) (the widest zoom's frame: an 8-bit MSAA target, the meadow by zoom).

## Research (background)

- [`research/formation-collision-and-commands.md`](research/formation-collision-and-commands.md): formation collision and command queues: per-soldier games' blobs and breakthroughs, open engines' order-independent contact, the formation literature, bins as bodies, suspend rather than clear.
- [`research/melee-outcomes.md`](research/melee-outcomes.md): how games and rule sets give ground in melee: fixed steps, a graded result from one margin, a blocked loser worse off, flank attacks and several units as one combat.
- [`research/claim-grid-weak-points.md`](research/claim-grid-weak-points.md): the claim grid's weak points: jams (arrival, a lasting priority), acts that cannot be cut short (a reserved sweep), the clash (steps of the contact line), the grid's cost (rectangles, not men).
- [`research/map-size-battle-density.md`](research/map-size-battle-density.md): how much ground armies occupied, 1700–1815 and antiquity: frontages, battle densities, approach distances, vision; for sizing the maps.
- [`research/map-size-rts-map-sizes.md`](research/map-size-rts-map-sizes.md): battle map size against soldier count in large-scale RTS and wargames (Total War, Scourge of War, Grand Tactician, HistWar, Graviteam and others).
- [`research/period-maps.md`](research/period-maps.md): period map scans to trace battle maps from (Habsburg surveys, Meilenblätter, Schroetter, Ferraris, Schubert, Reymann) and datasets for a Europe theatre layer: coverage, georeferencing, licences for tracing and for committing.
- [`research/map-view-style.md`](research/map-view-style.md): a light map view with a 3D feel: shaded relief, cast shadows and sky occlusion baked on the GPU, woods, roofs and lines, raised army blocks; what games document; costs measured and estimated.
- [`research/colour-and-light-review.md`](research/colour-and-light-review.md): the owner's colour and light references, and the coats' colour lost to the warm light, measured.
- [`research/grass-and-fields.md`](research/grass-and-fields.md): grass and fields at an RTS camera: Tiny Glade, Total War, the techniques (ground pattern, blades, cards, shells) and their pitfalls.
- [`research/painterly-grass.md`](research/painterly-grass.md): Tiny Glade's grass, the techniques that read as painted, what fits the RTS camera and the budget.
- [`research/dof-v2.md`](research/dof-v2.md): game depth of field near and far (Jimenez 2014, Gustafsson), what reads as painted, what fit our frame (measured).
- [`research/procedural-trees.md`](research/procedural-trees.md): generating trees: L-systems, Weber–Penn, space colonization, growth models, the pipe model, clump crowns and bare winter trees.
- [`research/frame-rate-120.md`](research/frame-rate-120.md): toward 120 fps: where the look page's frame goes (the frame interval, not the timer), the published techniques, ranked for us.
- [`research/smoke.md`](research/smoke.md): powder smoke painted, readable and cheap: the staff map's flat clouds, games, stylised films, real-time cost, history; opaque cut-out puffs recommended.
- [`research/tiny-glade-look.md`](research/tiny-glade-look.md): Tiny Glade's look (leaf cards, soft volume light, PCSS shadows, no filter in play) and what Track E took from it.
- [`research/painterly-2d-on-3d.md`](research/painterly-2d-on-3d.md): brush masks inside painted materials, keeping paint attached per surface, a one-hill validation scene.
- [`research/rts-engine-subsystems.md`](research/rts-engine-subsystems.md): RTS engine parts, Napoleonic simulation, browser concerns.
- [`research/formation-movement-and-doc-systems.md`](research/formation-movement-and-doc-systems.md): fluid formations, historical drill, doc systems.
- [`research/terrain-movement-speed-models.md`](research/terrain-movement-speed-models.md): movement over terrain, the lag model, era rulesets.
- [`research/stylized-water.md`](research/stylized-water.md): painted water and river shape.
- [`research/cheap-painterly-postfx.md`](research/cheap-painterly-postfx.md): cheap painterly post-processing.
- [`research/painterly-style-in-real-time.md`](research/painterly-style-in-real-time.md): how doable the painted look is; techniques, costs, stack per surface, prototype plan.
- [`research/prepainted-terrain-review.md`](research/prepainted-terrain-review.md): adversarial review of the pre-painted terrain proposal.
- [`research/s1c-plan-review.md`](research/s1c-plan-review.md): adversarial review of the S1c plan (fire, morale); the plan was revised after it.
- [`research/map-generation-in-games.md`](research/map-generation-in-games.md): how AoE, 0 A.D., StarCraft, Total War, Civilization, Recoil and terrain research describe and generate maps; lessons for a map language.
- [`research/map-grids.md`](research/map-grids.md): grid or no grid, square or hex, cell sizes per layer, blocking from slope, water as depth.
- [`research/terrain-taxonomy.md`](research/terrain-taxonomy.md): what terrain did in battle from antiquity to 1815, how games classify it, a five-layer model and an essential/bonus taxonomy.
- [`research/map-language.md`](research/map-language.md): what makes a map language elegant: OpenStreetMap, Mapbox, CityEngine, LDtk, stable seeding, schema design.

## Templates

- [`templates/`](templates/): system doc, decision record, plan, proposal.
