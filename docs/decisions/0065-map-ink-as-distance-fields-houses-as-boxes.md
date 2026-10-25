---
status: accepted
date: 2026-10-25
---

# 0065 The lit map's ink is a distance field from the features' shapes; its houses are lit boxes

## Context

The lit map view (decisions 0058, 0064) draws its relief, woods and water from bakes on the 2 m cells. Its ink (the
road edges, the water's banks and a pond's shore, hedges and walls) and its raised houses come from the features'
exact shapes, and must stay crisp from the whole 6 km map down to a few metres a screen. The prototype baked them into
canvases at about a texel a metre: a 6 km map would need textures of 6000² (144 MB each), and still blur up close. Its
houses were pre-lit 2D drawings (tops, side faces and shadows) baked into such a texture. Plan:
`docs/plans/active/m6-lit-view.md` (M6b).

## Decision

We will draw the ink and the houses as follows:
- **The ink as signed distance fields on the cells**, baked in the compile worker from the features' shapes: per cell,
  the signed metres to the nearest edge of the ways (their two edges), of the water (a stream's banks, a pond's shore
  and its holes), and of the barriers, over ±8 m in a byte. The shader draws a hairline of constant screen width where
  a field crosses 0 (`fwidth`), the lining of a pond at fixed distances inside its shore, and the barriers solid. A
  distance field reads between its texels as straight as the edge itself, so a field at the cell's size stays crisp
  at every zoom.
- **The houses as boxes on the paper**, raised to their wall height, their faces lit by the map's light in the
  prototype's colours (the roof's, 0.62 of it away from the light, up to 0.85 toward it), and a soft shadow on the
  ground away from the light; the view's tilt (decision 0055) shows their sides.
- **The names** (`zone.label`) as text on the overlay, through the view's camera.

## Consequences

- Good: lines crisp at every zoom from a field the size of the other bakes (4 bytes a cell); houses that need no
  texture and lean with the view.
- Good: one source for every renderer: the features' shapes, as the sim and the draft read them.
- Bad: where two edges of one field meet at a sharp corner or a junction, the bilinear field rounds them a little
  within a cell.
- Bad: a road or a stream narrower than a few pixels shows its two edges as one line; the ink fades from a metre a
  pixel to three, so the far map is not dark with them.

## Alternatives considered

- **The prototype's ink texture at a texel a metre:** 144 MB a channel group at 6 km, and blurred up close.
- **Line meshes with a screen-space width:** crisp too, but one more geometry path to keep in step with the cells;
  the distance field reuses the bakes' grid and the plane's shader.
- **The houses baked pre-lit into a texture, as the prototype:** the same size problem, and flat when the view tilts.
