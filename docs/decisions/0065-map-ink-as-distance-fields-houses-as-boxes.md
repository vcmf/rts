---
status: accepted
date: 2026-10-25
---

# 0065 The lit map draws from the cells, its edges smoothed by distance fields; its houses are lit boxes

## Context

The lit map view (decisions 0058, 0064) draws its relief, woods and water from bakes on the 2 m cells. Its ink (the
road edges, the water's banks and a pond's shore, hedges and walls) and its raised houses come from the features'
exact shapes, and must stay crisp from the whole 6 km map down to a few metres a screen. The prototype baked them into
canvases at about a texel a metre: a 6 km map would need textures of 6000² (144 MB each), and still blur up close. Its
houses were pre-lit 2D drawings (tops, side faces and shadows) baked into such a texture. Plan:
`docs/plans/active/m6-lit-view.md` (M6b).

## Decision

We will draw the ink and the houses as follows:
- **What the sim reads is what the map shows.** The water, the woods and the barriers are drawn from their compiled
  cells, whatever rule put them there (priority, `clear`, a hedge's gates), never from the raw shapes: a renderer
  that copies the engine's rules one by one disagrees with the cells wherever a rule is missed (three review rounds
  found three such rules, `docs/plans/active/m6-lit-view.md`).
- **Edges smoothed by distance fields on the cells**, baked in the compile worker: per cell, the signed metres to the
  nearest cell of the other kind, smoothed for the water and the woods so their edges run through the cells' steps
  (within about a metre of the shapes), square for the barriers (on the grid by design, proposal §3.6). The shader
  fills them and draws their edges as hairlines of constant screen width where a field crosses 0 (`fwidth`); the
  fields are mipmapped, so a far view does not break them into dashes.
- **The ways' edges from their shapes**, at the half-width apply paints them (`lineReach`), cut square at their free
  ends: crisp double hairlines at every zoom, drawn only on and beside the ways' cells.
- **The houses as boxes on the paper**, raised to their wall height, their faces lit by the map's light in the
  prototype's colours (the roof's, 0.62 of it away from the light, up to 0.85 toward it), and the footprint swept away
  from the light as its shadow, each pixel darkened once (a stencil); the view's tilt (decision 0055) shows their sides.
- **The names** (`zone.label`) as text on the overlay, through the view's camera.

## Consequences

- Good: the map cannot show a wood, a stream or a hedge the sim does not have, or hide one it has.
- Good: lines crisp at every zoom from fields the size of the other bakes (4 bytes a cell); houses that need no
  texture and lean with the view.
- Bad: an edge from the cells is within about a metre of the shape, not on it: a curve shows a little wobble up close.
- Bad: the cells' fields cost time in the worker: about 1.5 s for a 6 km map (three chamfer distance transforms and
  two blurs over 9 million cells), measured on the dev Mac; to be cut if the editor needs faster saves.
- Bad: a road or a stream narrower than a few pixels shows its two edges as one line; the edges fade from a metre a
  pixel to three, so the far map is not dark with them.

## Alternatives considered

- **The prototype's ink texture at a texel a metre:** 144 MB a channel group at 6 km, and blurred up close.
- **The fills from the shapes**, which M6b first did: exact curves, but the map then disagreed with the cells wherever
  the engine applies a rule the renderer did not copy (priority, `clear`, gaps). Shapes gated by the cells was the
  other option offered: exact where nothing overrides, at the cost of two sources to keep checked.
- **Line meshes with a screen-space width:** crisp too, but one more geometry path to keep in step with the cells;
  the distance field reuses the bakes' grid and the plane's shader.
- **The houses baked pre-lit into a texture, as the prototype:** the same size problem, and flat when the view tilts.
