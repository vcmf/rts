---
status: accepted
date: 2026-10-25
---

# 0064 The lit map view is one flat plane in Babylon, its bakes made in the compile worker

## Context

Decision 0058 makes the lit map the one view of a map, for the editor and the game's staff map; its look was settled
in the single-file prototype (`prototypes/staff-map.html?style=lit&relief=shaded`). M6 brings it into the game's code
(`docs/plans/active/m6-lit-view.md`), on the map page first, where the editor (M7) will be built, from a compiled map
that can be 6 km square (decision 0061): 9 million height nodes at the 2 m cell.

## Decision

We will draw the lit map view as follows:
- **Babylon**, as the look page, so that M9 joins the map view and the painted world on one camera.
- **One flat plane at the map's zoom.** The relief is shading and contours, not geometry; the ground rises only toward
  the painted world (M9). The plane is seen through a perspective camera leaning 20° off straight down (decision 0055).
- **The node heights as a float texture** read by `texelFetch` and interpolated in the shader, so the contours are the
  compiled heights' own, not a decimated mesh's.
- **The bakes in the compile worker**, as pure functions after `apply`: the relief (slope light, cast shadow,
  exposure) on the nodes, and a mask of water depth, woods and water on the cells.
- **The light's direction is a parameter**, one of the grid's 8 directions for the cast shadow's walk (the prototype
  hard-coded the north-west diagonal); north-west for now.
- **The flat draft becomes a setting of the same view**, its raster drawn on the same plane, so the overlays (outlines,
  ids) have one camera to follow.

## Consequences

- Good: the editor and every overlay work in one projection; the look matches the prototype's, from the compiled map.
- Good: the 6 km bake takes about half a second, off the page's thread (Austerlitz, measured on the dev Mac).
- Good: turning the light later (one-map open question 6) is a parameter and a rebake.
- Bad: a 6 km map holds a 36 MB float texture and three RGBA textures of 36 MB each (the relief, the mask, the flat
  draft) on the GPU; tiles come with the 3D world in tiles (Track E) if that is too much.
- Bad: the cast shadow follows the grid's directions only; a light between them needs another walk.

## Alternatives considered

- **Raw WebGL2:** lighter for the editor page, but a second renderer to join with the painted world in M9.
- **A mesh of the heights:** at 6 km either millions of vertices or a coarse mesh whose contours differ from the
  compiled heights; and the map view does not need relief geometry.
- **The bakes on the page's thread or the GPU:** the worker already holds the heights, and half a second there blocks
  nothing; a GPU bake can come if the bake time grows.
- **Keeping the flat draft as its own 2D view:** two projections for every overlay, against decision 0057's one
  renderer.
