---
status: proposed
date: 2026-10-22
---

# 0058 One map view: the editor's draft and the game's staff map, lit with a 3D feel

## Context

Two pages draw the battlefield from above:
- the map engine's **draft view** (the map page and `src/map/draft.ts`, on `epic/map-engine`): the map maker's preview,
  flat colours by attribute, one hillshade, contours, with feature ids and a cell readout;
- the game's **staff map** (`src/render/map.ts`, `docs/proposals/staff-map/`): the far zoom, the armies and their
  orders over the ground, from the sim's terrain classes, in an ink style (hachures, flat blocks, no light).

They show the same ground for two audiences, from two data sources, in two styles, and neither is the look the owner
wants: the reference `design/refs/staff-map-epic-history-waterloo.source.txt`, a map with a 3D feel (relief under one light,
woods as massed canopy, villages as roofs, armies as blocks that stand off the ground). Decision 0057 asks for one way
per need. The research is `docs/research/map-view-style.md`.

## Decision

We will draw the battlefield from above with **one renderer**, in **one lit style**, for the editor and the game:
- **One renderer, two uses.** It reads the map language's compiled layers (decision 0057). The game adds the armies,
  their orders and the far zoom's handover to the painted world; the editor adds its overlays (outlines and ids, the
  cell readout, the errors) and a flat-colour toggle, so shading never hides an editing mistake.
- **The style** (`docs/research/map-view-style.md` §4): a surface model (the ground, woods as canopy domes, buildings
  as boxes with gable roofs, hedges as ridges) lit once per map on the GPU from the north-west: a key light with warm
  light and cool, slightly more saturated shadow, a weak fill from several directions, sky occlusion and a soft cast
  shadow. Colours are live uniforms; what a season changes in the surface (bare deciduous crowns, decision 0031)
  re-bakes the light once per season change, on the GPU (estimated under 1 s). Fields carry their strips; roads and
  water are crisp lines at any zoom.
- **The armies** stand off the ground: one instanced pass of blocks, each with a thin bevel lit from the map's light, a
  dark outline and a short cool shadow toward the south-east. A block takes the light's value and not its hue, as units
  in the painted world do (decision 0027), with a floor on how dark it gets, so one in a wood's shadow stays legible and
  the far zoom's handover shows no jump in brightness.
- **Guards for readability** (art bible: the armies are the most saturated objects, never hide a formation): the
  terrain's palette stays below the chroma of every coloured army (France, Britain, Russia; roofs a muted brick), and a
  near-white army (Austria) is carried by its brighter fill and bold edge, as the staff map's design already does (§6,
  Colours); the light has a floor (no black in a wood's shadow); every block has an outline and a halo of the ground's
  colour. A check enforces the chroma rule for every season.

This replaces how the map draws its ground and its blocks wherever the staff map's documents describe ink on paper:
- `docs/proposals/staff-map/design.md`: §1, the "Leave" entry of the Epic History TV reference (its bevelled blocks
  with shadows and rendered hillshade are now taken; its other entries stand); §2, pillar 2 ("Ink, not render") and
  pillar 3 ("Only the armies have colour": the terrain has colour, below the armies'); §3, paper and ink as the
  ground's medium (the interface keeps its type and hairlines); §4, the terrain on the map (relief lit, not hachured;
  woods as canopy, not stipple; villages as roofs; fields drawn as strips; contours an option); §5, the seasons as a
  wash over paper (the season colours the whole ground); §6, "no shadow, bevel or outline glow" on blocks;
- `docs/proposals/staff-map/implementation.md`: §1, the blocks on the 2D canvas overlay (one instanced GPU pass; labels
  may stay on the canvas); §3, the baked paper with hachures (the bake is the lighting above); §4, the blocks' drawing;
- `docs/art-bible.md` §6d, the far zoom as ink on warm paper with hachures and flat blocks.

Everything else in the staff map's design stands: the camera (decision 0010), pillar 1 (the interface around the map),
pillar 4 (the map is the simulation), the symbols' shapes, states and colours (§6), the orders (§7), the interface
(§8), the zoom as one world (§9, its order of reveal to be rewritten for a lit map), the gameplay (§10). Until this
record is accepted, the staff map's documents and the art bible's §6d govern.

## Consequences

- Good: one drawing to build, tune and check; the map maker sees what the player will see.
- Good: the 3D feel comes from one bake per map (estimated under 1 s on the GPU) and one full-screen pass a frame
  (estimated about 1 ms with the blocks; to be measured).
- Bad: the staff map's prototype style (hachures, stipple) is dropped; its ink look was a deliberate choice.
- Bad: the staff map needs the map language's layers at runtime, so a battle on a legacy map (not yet ported, decision
  0057) keeps today's drawing until its port.
- Bad: lit shadows and dark woods put readability at risk; the guards above must hold, measured as the readability
  guard does for the painted world.

## Open questions

- The map's light comes from the north-west (the cartographic convention, so relief never reads inverted); the painted
  world's sun sits to the side or behind the camera (art bible). Does the light turn as the far zoom hands over, or do
  the two agree from the start?
- A slight tilt for parallax ("plan oblique" relief) at mid zoom, or straight down only?

## Alternatives considered

- **Keep the ink style for the game and a lit style in the editor:** two renderers for one need (decision 0057), and
  the map maker would not see the game's map.
- **Bake the finished image on the CPU into a 2D canvas:** cheapest to build, but the shadows and occlusion take
  seconds on the CPU (measured: sky occlusion 7.6 s for a 1201² map), lines blur when zoomed, a season needs a re-bake.
- **A real 3D render (meshes, shadow maps):** the painted world already is one; the map view is its far, legible form.
