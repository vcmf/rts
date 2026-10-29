---
status: accepted
date: 2026-10-22
---

# 0058 One map view: the editor's draft and the game's staff map, lit with a 3D feel

> Revised 2026-10-24 and accepted (the owner), after the lit style was settled by eye in the staff map prototype
> (`prototypes/staff-map.html?style=lit`, PR #136): plain woods, low slabs, a slight tilt, the zoom from the map to
> the painted world, the map's size (decision 0061), the ink (decisions 0056, 0059) and measured costs.

## Context

Two pages draw the battlefield from above:
- the map engine's **draft view** (the map page and `src/map/draft.ts`, on `epic/map-engine`): the map maker's preview,
  flat colours by attribute, one hillshade, contours, with feature ids and a cell readout;
- the game's **staff map** (`src/render/map.ts`, `docs/proposals/staff-map/`): the far zoom, the armies and their
  orders over the ground, from the sim's terrain classes, in an ink style (hachures, flat blocks, no light).

They show the same ground for two audiences, from two data sources, in two styles, and neither is the look the owner
wants: a map with a 3D feel, the relief under one light and the armies standing off the ground. The first reference
was a frame of Epic History TV's Waterloo (`design/refs/staff-map-epic-history-waterloo.source.txt`); the research is
`docs/research/map-view-style.md`. The staff map prototype then tried that reference's massed canopy and fields (v2),
which the owner rejected ("we don't have to follow them"; the canopy "ugly" and slow), and settled a lighter style on
paper (v3 and after). Decision 0057 asks for one way per need.

## Decision

We will draw the battlefield from above with **one view**, in **one lit style**, for the editor and the game:
- **One view, two uses.** It reads the map language's compiled layers (decision 0057). The game adds the armies,
  their orders and the zoom into the painted world; the editor adds its overlays (outlines and ids, the cell readout,
  the errors) and a flat-colour switch, so shading never hides an editing mistake.
- **One zoom for the player, a switch for the developer.** At the widest zoom the player sees the whole map in this
  view; zooming in, it becomes the painted world gradually, on one camera, with no toggle and no crossfade
  (`docs/proposals/staff-map/design.md` §9). While building and testing, a developer setting holds one view at every
  zoom (the lit map, the flat draft or the painted world), so a map can be worked on without the handover.
- **The style**, as the prototype settled it:
  - **paper and relief:** a warm paper, the relief shaded from the real heights under one light from the north-west,
    the contours drawn over it;
  - **woods:** a plain warm-grey tone over the paper, under the relief's light and shadow; no canopy domes, no
    crown texture;
  - **water:** a wash in the ground, its banks drawn as lines;
  - **villages:** raised houses, their light baked;
  - **roads and water:** crisp lines at any zoom;
  - **the light is static** (art bible): baked once per map; what a season changes re-bakes it once per season change.
  Colours stay live uniforms. Fields as strips, roofs with gables and hedges as ridges are later steps, each settled
  by eye in the prototype before it enters this view.
- **The camera** leans about 20° off straight down at the widest zoom and tilts further as you zoom in (decision 0055;
  decision 0002 holds: no sky).
- **The armies** stand off the ground as low slabs, their sides lit by the map's light, their shadows cast on the
  ground (decision 0055). A slab takes the light's value and not its hue, as units in the painted world do (decision
  0027), with a floor on how dark it gets, so one in a wood's shadow stays legible and the zoom's handover shows no
  jump in brightness. Their symbols, states, losses and colours are the staff map's
  (`docs/proposals/staff-map/design.md` §6).
- **The marks** (symbols, arrows, labels, smoke) are drawn on a 2D canvas at a pixel ratio of 1 and upscaled by FSR 1's
  EASU on their alpha (decisions 0056, 0059); whether some move to a GPU pass is the map view's plan in M6.
- **Guards for readability** (art bible: the armies are the most saturated objects, never hide a formation): the
  terrain's palette stays below the chroma of every coloured army (France, Britain, Russia), and a light army
  (Austria, a light stone beige in this style) is carried by its brighter fill and bold edge (§6, Colours); the light
  has a floor (no black in a wood's shadow). A check enforces the chroma rule for every season.
- **Size.** Maps are square, 2 to 6 km a side (decision 0061). The view and its bakes must hold a 6 km map; how its
  layers are tiled is decided with the world's tiles (Track E) in M6's plan.

This replaces how the map draws its ground and its blocks wherever the staff map's documents describe ink on paper:
- `docs/proposals/staff-map/design.md`: §1, the "Leave" entry of the Epic History TV reference (its raised blocks
  with shadows and its rendered relief are now taken; its other entries stand); §2, pillar 2 ("Ink, not render") and
  pillar 3 ("Only the armies have colour": the terrain has colour, below the armies'); §3, paper and ink as the
  ground's medium (paper stays; the interface keeps its type and hairlines); §4, the terrain on the map (relief lit,
  not hachured; woods a plain tone, not stipple; villages raised; contours drawn); §5, the seasons as a wash over
  paper; §6, "no shadow, bevel or outline glow" on blocks;
- `docs/proposals/staff-map/implementation.md`: §1, the blocks on the 2D canvas overlay (slabs in the 3D view, their
  marks on the canvas); §3, the baked paper with hachures (the bake is the lighting above); §4, the blocks' drawing;
- `docs/art-bible.md` §6d, the far zoom as ink on warm paper with hachures and flat blocks.

Those documents are rewritten to this record as the lit style reaches them (PR #136 starts it). Everything else in
the staff map's design stands: the camera (decision 0010), pillar 1 (the interface around the map), pillar 4 (the map
is the simulation), the symbols' shapes, states and colours (§6), the orders (§7), the interface (§8), the zoom as one
world (§9, its order of reveal to be rewritten for a lit map), the gameplay (§10).

## Consequences

- Good: one drawing to build, tune and check; the map maker sees what the player will see.
- Good: cheap, measured in the prototype on test machine A (RTX 3080, Windows Chrome; the 150 fps plan in PR
  #136): the WebGL terrain, relief and world take about 1 ms of GPU time at map zoom; the frame's cost is the 2D
  marks, which decisions 0056 and 0059 bring to 150 fps or better in normal play.
- Bad: the staff map's ink style (hachures, stipple) is dropped; its ink look was a deliberate choice.
- Bad: the staff map needs the map language's layers at runtime, so a battle on a legacy map (not yet ported, decision
  0057) keeps today's drawing until its port.
- Bad: lit shadows and dark woods put readability at risk; the guards above must hold, measured as the readability
  guard does for the painted world.
- Bad: a 6 km map is about 6 times the 2.4 km the research costed (`docs/research/map-view-style.md` §5); the bakes'
  memory and time are to be measured at that size.

## Open questions

- The map's light comes from the north-west (the cartographic convention, so relief never reads inverted); the painted
  world's sun sits to the side or behind the camera (art bible). Does the light turn as the zoom hands over, or do the
  two agree from the start?

## Alternatives considered

- **Keep the ink style for the game and a lit style in the editor:** two renderers for one need (decision 0057), and
  the map maker would not see the game's map.
- **The reference's massed canopy and fields** (the research's §4.1, the prototype's v2): tried and rejected by the
  owner, heavy on screen and slow to draw.
- **Bake the finished image on the CPU into a 2D canvas:** cheapest to build, but the shadows and occlusion take
  seconds on the CPU (measured: sky occlusion 7.6 s for a 1201² map), lines blur when zoomed, a season needs a re-bake.
- **A real 3D render (meshes, shadow maps):** the painted world already is one; the map view is its far, legible form.
