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
- [`known-issues.md`](known-issues.md): grave pre-existing issues with their planned fixes. *(current)*

## Decisions

- [`decisions/`](decisions/README.md): numbered decision records; the list is in its README.

## Systems (built, current behaviour)

- [`systems/river.md`](systems/river.md): the lowland meander river (W1, W1b).
- [`systems/sim-spine.md`](systems/sim-spine.md): the simulation spine: tick, commands, state, hashing, saves, replays (S0).
- [`systems/formations.md`](systems/formations.md): the formation layer in the sim: shapes, changes, the lag model, the footprint gate (S1a).
- [`systems/sim-page.md`](systems/sim-page.md): the page that draws and drives the sim: soldier layer, staff map, input, replays (S1b).
- More appear as systems are built; see [`systems/README.md`](systems/README.md).

## Proposals (designs before building)

- [`proposals/engine-design.md`](proposals/engine-design.md): world spec, heightfield, camera, bakes, scale, known issues, order of engine work. *(accepted)*
- [`proposals/sim-design.md`](proposals/sim-design.md): the battle simulation (battalions, drill, fire, morale, determinism, phases). *(draft)*
- [`proposals/staff-map/design.md`](proposals/staff-map/design.md): the far-zoom staff map, art direction. *(accepted)*
- [`proposals/staff-map/implementation.md`](proposals/staff-map/implementation.md): how the staff map is built. *(draft)*
- [`proposals/prepainted-terrain.md`](proposals/prepainted-terrain.md): a painted macro colour bake for the ground; strokes stay at runtime. *(draft)*

## Plans

- Active: [`plans/active/prototype-plan.md`](plans/active/prototype-plan.md) (prototype phases, water W1–W6),
  [`plans/active/staff-map.md`](plans/active/staff-map.md),
  [`plans/active/s1b-sim-page.md`](plans/active/s1b-sim-page.md) (S1b).
- Done: [`plans/done/w1-river-shape.md`](plans/done/w1-river-shape.md), [`plans/done/w1b-river-width.md`](plans/done/w1b-river-width.md), [`plans/done/docs-restructure.md`](plans/done/docs-restructure.md), [`plans/done/formation-feel.md`](plans/done/formation-feel.md), [`plans/done/terrain-movement.md`](plans/done/terrain-movement.md) (F1, #9), [`plans/done/s0-sim-spine.md`](plans/done/s0-sim-spine.md) (S0, #11), [`plans/done/s1a-formations-on-spine.md`](plans/done/s1a-formations-on-spine.md) (S1a, #13).

## Research (background)

- [`research/rts-engine-subsystems.md`](research/rts-engine-subsystems.md): RTS engine parts, Napoleonic simulation, browser concerns.
- [`research/formation-movement-and-doc-systems.md`](research/formation-movement-and-doc-systems.md): fluid formations, historical drill, doc systems.
- [`research/terrain-movement-speed-models.md`](research/terrain-movement-speed-models.md): movement over terrain, the lag model, era rulesets.
- [`research/stylized-water.md`](research/stylized-water.md): painted water and river shape.
- [`research/cheap-painterly-postfx.md`](research/cheap-painterly-postfx.md): cheap painterly post-processing.
- [`research/painterly-style-in-real-time.md`](research/painterly-style-in-real-time.md): how doable the painted look is; techniques, costs, stack per surface, prototype plan.
- [`research/prepainted-terrain-review.md`](research/prepainted-terrain-review.md): adversarial review of the pre-painted terrain proposal.

## Templates

- [`templates/`](templates/): system doc, decision record, plan, proposal.
