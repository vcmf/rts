---
status: current
last_reviewed: 2026-10-08
---

# Docs index

One line per document. **Types:** *vision* and *conventions* frame everything; *system* docs describe
what is built **now** and are kept true; *decisions*: accepted records are binding until superseded, proposed ones are open; *proposals* are
designs written before building (frozen once built, their lasting content moves into system docs);
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
- More appear as systems are built; see [`systems/README.md`](systems/README.md).

## Proposals (designs before building)

- [`proposals/engine-design.md`](proposals/engine-design.md): world spec, heightfield, camera, bakes, scale, known issues, order of engine work. *(accepted)*
- [`proposals/sim-design.md`](proposals/sim-design.md): the battle simulation (battalions, drill, fire, morale, determinism, phases). *(draft)*
- [`proposals/battle-threads.md`](proposals/battle-threads.md): the battle in a worker, its soldiers stepped at 12 fps (decision 0048, experimental). *(draft)*
- [`proposals/staff-map/design.md`](proposals/staff-map/design.md): the far-zoom staff map, art direction. *(accepted)*
- [`proposals/staff-map/implementation.md`](proposals/staff-map/implementation.md): how the staff map is built. *(draft)*
- [`proposals/prepainted-terrain.md`](proposals/prepainted-terrain.md): a painted macro colour bake for the ground; strokes stay at runtime. *(draft)*
- [`proposals/map-format.md`](proposals/map-format.md): the map format, one schema-checked description of a battlefield that the sim, the 3D battlefield and the staff map compile from. *(draft)*
- [`proposals/ai.md`](proposals/ai.md): the enemy AI: layers, influence maps, utility scores, lookahead with the sim, honest difficulty; built after pathfinding. *(draft)*
- [`proposals/figure-animation.md`](proposals/figure-animation.md): animated figures: the simulation owns timing, clips are fitted to its phases by bindings checked at build time; the figure files and registry. *(accepted)*

## Plans

- Active: [`plans/active/prototype-plan.md`](plans/active/prototype-plan.md) (prototype phases, water W1–W6),
  [`plans/active/battle-threads.md`](plans/active/battle-threads.md) (the battle's threads: a worker, soldiers stepped at 12 fps),
  [`plans/active/flow-default.md`](plans/active/flow-default.md) (the combed meadow as the default grass),
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
  [`plans/active/l2-detail.md`](plans/active/l2-detail.md) (Track E L2: the bench, the readability guard, the terrain detail layer),
  [`plans/active/l5-macro.md`](plans/active/l5-macro.md) (Track E L5: the ground's cover and macro colour, baked and in the shader, and the ablation),
  [`plans/active/armies-demo.md`](plans/active/armies-demo.md) (the first armies on the demo map, scripted),
  [`plans/active/armies-32k.md`](plans/active/armies-32k.md) (32,000 soldiers at 120 fps: the 40-a-side baseline and four measured steps, decision 0050, experimental),
  [`plans/active/close-zoom.md`](plans/active/close-zoom.md) (a closer zoom to show the soldiers, the full figure nearest, #133),
  [`plans/active/close-figures.md`](plans/active/close-figures.md) (the close-zoom figures: drawn inside out, a face on the back of the head, #164; shadows off the feet, #165),
  [`plans/active/simple-soldier-shadows.md`](plans/active/simple-soldier-shadows.md) (the shadow map only up close, a simple shadow per soldier beyond, #131),
  [`plans/active/shadow-darker.md`](plans/active/shadow-darker.md) (the soldiers' simple shadows darker: a strength gain, `?ushgain`; after #175, decision 0062),
  [`plans/active/cavalry-pistol.md`](plans/active/cavalry-pistol.md) (the cavalryman's pistol),
  [`plans/active/test-gaps.md`](plans/active/test-gaps.md) (the test gaps: the coverage audit, this week's regressions, the test PRs by area),
  [`plans/active/figure-pipeline.md`](plans/active/figure-pipeline.md) (the figure pipeline in the repository),
  [`plans/active/track-e-look.md`](plans/active/track-e-look.md) (Track E: the painterly look, L0–L9 and LA assets; results in [`plans/active/track-e-results/README.md`](plans/active/track-e-results/README.md), the L2a baselines in [`plans/active/track-e-results/l2a-baseline.md`](plans/active/track-e-results/l2a-baseline.md), the L2b results in [`plans/active/track-e-results/l2b-detail.md`](plans/active/track-e-results/l2b-detail.md), the shadows' and the crowns' in [`plans/active/track-e-results/shadows-foliage.md`](plans/active/track-e-results/shadows-foliage.md)).
- Done: [`plans/done/lod-fade.md`](plans/done/lod-fade.md) (the soldiers' LODs cross-faded per man, not switched, #188; decision 0066), [`plans/done/tripo-lowpoly-buildings.md`](plans/done/tripo-lowpoly-buildings.md) (the buildings from Tripo's own low-poly models, windows as inlays, a farmhouse and a manor), [`plans/done/soft-shadows-all.md`](plans/done/soft-shadows-all.md) (the simple shadow at every zoom, softer, lighter and shorter up close; decision 0062), [`plans/done/browser-mcp.md`](plans/done/browser-mcp.md) (the page tools on a running Chrome, Windows Chrome from WSL, the DevTools MCP opt-in; decision 0060), [`plans/done/code-style.md`](plans/done/code-style.md) (code style: Prettier and readability lint rules, rolled out by area; decision 0052, #148 #160 #167), [`plans/done/building-light.md`](plans/done/building-light.md) (the buildings' static light, baked once), [`plans/done/buildings.md`](plans/done/buildings.md) (the first buildings: a windmill, village houses), [`plans/done/render-scale.md`](plans/done/render-scale.md) (the render scale 0.9 near, upscaled by EASU), [`plans/done/headroom.md`](plans/done/headroom.md) (frame headroom: the cost ablations, the road split), [`plans/done/gameplay-dof.md`](plans/done/gameplay-dof.md) (Track E: the gameplay depth of field), [`plans/done/w1-river-shape.md`](plans/done/w1-river-shape.md), [`plans/done/w1b-river-width.md`](plans/done/w1b-river-width.md), [`plans/done/docs-restructure.md`](plans/done/docs-restructure.md), [`plans/done/formation-feel.md`](plans/done/formation-feel.md), [`plans/done/terrain-movement.md`](plans/done/terrain-movement.md) (F1, #9), [`plans/done/s0-sim-spine.md`](plans/done/s0-sim-spine.md) (S0, #11), [`plans/done/s1a-formations-on-spine.md`](plans/done/s1a-formations-on-spine.md) (S1a, #13), [`plans/done/s1b-sim-page.md`](plans/done/s1b-sim-page.md) (S1b, #14), [`plans/done/l0-spine.md`](plans/done/l0-spine.md) (Track E L0, #19 #20 #21), [`plans/done/w2-river-banks.md`](plans/done/w2-river-banks.md) (water W2, in #26), [`plans/done/w3-water-data.md`](plans/done/w3-water-data.md) (water W3, #30), [`plans/done/w4-water-surface.md`](plans/done/w4-water-surface.md) (water W4, #42), [`plans/done/w5-banks.md`](plans/done/w5-banks.md) (water W5, #45 #46), [`plans/done/shadow-look.md`](plans/done/shadow-look.md) (the shadows' look, #59), [`plans/done/soft-shadows.md`](plans/done/soft-shadows.md) (soft shadows, #60), [`plans/done/l7a-canopy-cards.md`](plans/done/l7a-canopy-cards.md) (L7a, leaf-card crowns, #58), [`plans/done/l7b-crown-volume.md`](plans/done/l7b-crown-volume.md) (L7b, the crowns as volumes, #61), [`plans/done/forest-bench.md`](plans/done/forest-bench.md) (the forest bench, #65), [`plans/done/track-e-shadows-foliage-docs.md`](plans/done/track-e-shadows-foliage-docs.md) (the shadow and foliage work in Track E's documents, #67), [`plans/done/l5c-meadow.md`](plans/done/l5c-meadow.md) (L5c, the meadow, #74), [`plans/done/wheat-height.md`](plans/done/wheat-height.md) (standing wheat under a soldier's chest), [`plans/done/l5d-crops.md`](plans/done/l5d-crops.md) (L5d, the crops from the meadow's grass, #76), [`plans/done/stubble-height.md`](plans/done/stubble-height.md) (taller stubble, #77), [`plans/done/lc1a-moods.md`](plans/done/lc1a-moods.md) (LC1a, moods as data, #81), [`plans/done/lc1b-coats.md`](plans/done/lc1b-coats.md) (LC1b, the coats keep their colour, #82), [`plans/done/lc1c-unit-share.md`](plans/done/lc1c-unit-share.md) (LC1c, units take some of the air, #83), [`plans/done/tree-generator.md`](plans/done/tree-generator.md) (generated trees, leaf fall and clump-lit crowns, #84), [`plans/done/coverage-timeout.md`](plans/done/coverage-timeout.md) (a longer test budget under coverage, #85), [`plans/done/ground-light.md`](plans/done/ground-light.md) (the light on the ground, #86), [`plans/done/lc3-temperate.md`](plans/done/lc3-temperate.md) (LC2 and LC3, the temperate mood, #87), [`plans/done/units-cloud-shade.md`](plans/done/units-cloud-shade.md) (units take the soft cloud shade, #89), [`plans/done/ground-surface.md`](plans/done/ground-surface.md) (the ground's surface, bare earth, the autumn turn, #90), [`plans/done/default-map.md`](plans/done/default-map.md) (the default map's large wheat field, #91), [`plans/done/temperate-fixes.md`](plans/done/temperate-fixes.md) (the temperate mood's leftovers, #92), [`plans/done/lc4-bounce.md`](plans/done/lc4-bounce.md) (LC4, the ground's bounce on units and crowns), [`plans/done/gen-trees-default.md`](plans/done/gen-trees-default.md) (generated trees by default), [`plans/done/far-woods-gen.md`](plans/done/far-woods-gen.md) (the far woods from the generated trees, #99), [`plans/done/lc5-ground-bounce.md`](plans/done/lc5-ground-bounce.md) (LC5, bounced light on the ground, #100), [`plans/done/trees-perf-trunks.md`](plans/done/trees-perf-trunks.md) (the same trees everywhere, trunk shadows, toward 120 fps, #102), [`plans/done/frame-readout.md`](plans/done/frame-readout.md) (a frame readout on the look page), [`plans/done/wide-perf.md`](plans/done/wide-perf.md) (the widest zoom's frame: an 8-bit MSAA target, the meadow by zoom), [`plans/done/dynamic-scale.md`](plans/done/dynamic-scale.md) (an automatic render scale by zoom), [`plans/done/nan-guard.md`](plans/done/nan-guard.md) (no dark block from a NaN pixel), [`plans/done/auto-floor.md`](plans/done/auto-floor.md) (Auto's floor at 0.75, and why Auto stays by zoom), [`plans/done/crop-depth.md`](plans/done/crop-depth.md) (straight crops, a dark ground under the near grass), [`plans/done/roads.md`](plans/done/roads.md) (rutted dirt roads, more of them on the demo map, baked far out), [`plans/done/grass-flow.md`](plans/done/grass-flow.md) (the combed meadow, `?grass=flow`, #112), [`plans/done/dof-v2.md`](plans/done/dof-v2.md) (depth of field v2: 8 bits, near and far, painted, #114), [`plans/done/bare-earth.md`](plans/done/bare-earth.md) (bare earth where nothing grows, the soil by material, #116), [`plans/done/dark-water.md`](plans/done/dark-water.md) (dark water, after Tiny Glade's), [`plans/done/epic-palette.md`](plans/done/epic-palette.md) (the epic mood, after Tiny Glade, the default).

## Research (background)

- [`research/colour-and-light-review.md`](research/colour-and-light-review.md): the owner's colour and light references, and the coats' colour lost to the warm light, measured.
- [`research/grass-and-fields.md`](research/grass-and-fields.md): grass and fields at an RTS camera: Tiny Glade, Total War, the techniques (ground pattern, blades, cards, shells) and their pitfalls.
- [`research/painterly-grass.md`](research/painterly-grass.md): Tiny Glade's grass, the techniques that read as painted, what fits the RTS camera and the budget.
- [`research/dof-v2.md`](research/dof-v2.md): game depth of field near and far (Jimenez 2014, Gustafsson), what reads as painted, what fit our frame (measured).
- [`research/procedural-trees.md`](research/procedural-trees.md): generating trees: L-systems, Weber–Penn, space colonization, growth models, the pipe model, clump crowns and bare winter trees.
- [`research/frame-rate-120.md`](research/frame-rate-120.md): toward 120 fps: where the look page's frame goes (the frame interval, not the timer), the published techniques, ranked for us.
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

## Templates

- [`templates/`](templates/): system doc, decision record, plan, proposal.
