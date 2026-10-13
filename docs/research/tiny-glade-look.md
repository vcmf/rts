---
status: research
last_reviewed: 2026-10-13
---

# Tiny Glade's look, and what the painted campaign takes from it

Research notes, October 2026. The owner pointed to Tiny Glade (Pounce Light, 2024) as the miniature, painterly
look closest to ours, with a palette that is too soft and fairy-tale for us (ours must read as epic). These notes
come from research agents reading public sources (the developers' talks and posts, tutorials, community tools);
the sources were not re-verified one by one here, and nothing below is the game's code.

## What the game does

- **Engine:** a custom Rust and Vulkan renderer (Bevy is used for its ECS only). The rendering is described in Tom
  Stachowiak's talk at the Graphics Programming Conference 2024.
- **No painterly filter in gameplay.** The brush-stroke overlay is the menu's and the photo mode's only; play has
  no Kuwahara or stroke pass. The look comes from the world itself.
- **Trees are leaf cards.** A crown is a cloud of quads facing the camera, each cut by a leaf-clump texture with
  alpha (the "quadmesh to billboards" technique of Pontus Karlsson's tutorial, https://youtu.be/iASMFba7GeI). Anastasia
  Opara's notes add a depth offset with noise (against the cards' flat intersections) and a discard by the view's
  angle. The game has three hand-made tree models and a bare variant; the meshes are JSON, the vertex colour holds
  the quad's UV (R, G) and a trunk flag (B), with per-primitive data (`appear_pos`, `prim_center`). They are not
  sold or released separately; a development menu exports textures and a community Blender add-on (v1.3 on)
  reads the trees' JSON. Copyrighted: for study only.
- **Light:** software ray-traced global illumination (the developers' "potato GI"), soft shadows by PCSS (their
  penumbra widens with the distance to the caster), a low dynamic range with the Tony McMapface tone mapper, few
  materials, coloured per vertex.
- **Geometry:** walls and roofs generated brick by brick and tile by tile.
- **Tilt-shift depth of field** in play: much of the miniature feel.

## What it means at our camera

- **Value structure, not leaf texture, carries a crown at our zoom.** A Tiny Glade crown fills 200 to 400 pixels;
  ours fills 30 to 50 at the mid zoom and 15 to 25 at the widest. What survives is the light across the crown: a
  lit top, a falling-off side, a dark core, single leaves catching the sun.
- **Other research of the same pass:** bake the brushwork into the static world (Dordogne's stamp maps), ramp
  shading, strokes that keep their size on screen as the camera zooms (Bénard and others, 2009; Johansen's
  Dither3D), readability at the formation's scale (Age of Empires IV), a Kuwahara filter last and for presentation
  only.

## What we took (Track E, `docs/plans/active/track-e-look.md`)

| Tiny Glade | Ours | Where |
|---|---|---|
| Leaf-card crowns | Cards from each pack crown's triangles, cut by a greyscale clump atlas painted by our palette; they cast leafy shadows | L7a, #58 |
| Soft volume light on the crowns (their GI) | A normal per pixel from the crown's ellipsoid, the light through it, a soft ramp, a darker core, a tilt per leaf | L7b, #61; decision 0022 (proposed) |
| PCSS soft shadows | The penumbra in the baked light map grows with the distance to the caster (an exaggerated sun), baked once | #60 |
| Sky light occluded by woods (their GI) | Each crown a sphere hiding its share of the sky, baked once; the shadow colour deepens where the sky is hidden | #60 |
| Tilt-shift in play | Not taken: decision 0003 forbids blur in gameplay. Reopened by the owner (2026-10-13) as a question to measure | art bible §6b |
| Temporal anti-aliasing | Not yet: L8's A/B (the cards' outline aliases at the widest zoom) | L8 |
