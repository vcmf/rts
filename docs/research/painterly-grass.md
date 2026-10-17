---
status: research
last_reviewed: 2026-10-17
---

# Painterly grass at the RTS camera: Tiny Glade's look, the techniques, the cost

Research notes, October 2026, from three research agents reading public sources and our code, for the meadow
(`docs/systems/look.md`, "The meadow and the crops"). It extends `docs/research/grass-and-fields.md` (Tiny Glade's
renderer, Total War) and `docs/research/painterly-2d-on-3d.md`. The owner's references are Tiny Glade screenshots in
the owner's local design/refs/tiny-glade/ (not committed). Tags: **sourced** (the link says it), **secondary** (a third party's
summary), **inference** (ours, reasoning shown), **estimate** (a cost we computed, not measured).

## 1. Our camera decides first

At fov 0.62 rad on 1080 lines there are about 1686/d pixels a metre at a ray distance of d m. **Computed:**

| View | Distance (m) | 2 cm blade's width | 0.5 m blade's length |
|---|---|---|---|
| Closest (radius 45) | 36–71 | 0.5–0.95 px | 11–13 px |
| Default (125) | 99–196 | 0.17–0.34 px | 4–5 px |
| Widest (260) | 185–523 | 0.06–0.18 px | 1.5–2.8 px |

A blade is under a pixel wide at every zoom, and seen from above its length is its height times the sine of the view
angle: mostly tips and the gaps between them. **Inference:** the long flat blades of the references can only be
seen as texture and as the structure of clumps; and sub-pixel triangles are the GPU's worst case (2×2 quad shading:
"Counting Quads", https://blog.selfshadow.com/page/6/, sourced; Fatahalian et al., SIGGRAPH 2010, quad merging cut
shading about 8× on pixel-sized triangles, https://www.microsoft.com/en-us/research/?p=159994, sourced).

## 2. Tiny Glade: what is public

- **Not published:** the blade mesh, texture, normals, flow, LOD or cost. Searched: both developers' Bluesky and
  Mastodon feeds, the Steam news feed, the GPC 2024 transcript, the 80.lv interview, the Tiny Docs wiki.
- **The 1.16 rewrite** was for scale: Tom "took it upon himself to rewrite our grass system … unimplementing the
  'Tiny'" (Dev Diary "Wooden Walls", https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/1837955055358944,
  sourced); one system for grass, flowers and grain, painted over to grow bushier (1.16 post,
  https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/1844751498218119, sourced).
  **Inference:** a plant-instancing system driven by a painted density field (the beta's "balding" fixes fit it).
- **Correction to `grass-and-fields.md`:** `billboard_plants.json` and the seasonal terrain textures belong to the
  background terrain outside the glade (it has "a square cutout that marks the playable glade area"), not to the
  in-glade grass or its far LOD (Tiny Docs, github.com/hbeau/tiny-docs, its terrain and plants pages, secondary).
- **The soft light:** screen-space GI at quarter resolution with a BVH fallback, denoised with XeGTAO as a guide,
  1.3–1.5 ms on a 2080 at 1440p (GPC 2024, https://www.youtube.com/watch?v=jusWW2pPnA0, about 30–50 min, sourced);
  grass receives it. **Inference:** that is why grass darkens at wall bases and under trees with no grass-specific
  AO. Our equivalent is a baked occlusion term (the light map's).
- **"Fluffier in the distance"** (1.16, sourced). "Loosely inspired by Nanite Foliage": far clusters become voxel
  bricks storing a distribution of normals, chosen when that has less error than triangles
  (https://dev.epicgames.com/documentation/unreal-engine/nanite-foliage, sourced). **Inference:** keep coverage
  constant with distance and spread the normals; do not fade grass to a flat colour.

## 3. The ingredients that read as painted, and the cheapest technique for each

From the references, and the shipped games and write-ups that do publish (Ghost of Tsushima mostly through
secondary summaries: https://tigerabrodi.blog/grass-in-ghost-of-tsushima, https://csarko.sh/research/grass-and-trail-realism;
GodotGrass, https://github.com/2Retr0/GodotGrass, sourced; Hexaquo,
https://hexaquo.at/pages/grass-rendering-series-part-2-full-geometry-grass-in-godot/, sourced; 80.lv Meadows,
https://80.lv/articles/meadows-creating-stylized-nature-in-ue4/, sourced):

1. **Combed flow:** patches share a lean and facing that change slowly. Ghost of Tsushima's Voronoi clumps set
   height, colour, facing and lean per clump (secondary); GodotGrass does it with cellular noise (sourced). Ours:
   random per clump (`meadow.vert`). Cheapest: the lean from a low-frequency world field, the hash only jittering it.
2. **Streaks from the lean:** at a top-down camera the lean shows as light and dark bands (the campfire reference).
   Cheapest: brightness by the lean against the sun, in the ground pattern and on the blades alike (inference).
3. **Root-to-tip gradient, two palettes per clump:** a darker cooler root to a warmer lighter tip, the tip palette
   chosen by the clump (Hexaquo, sourced; a BotW-style reconstruction,
   https://app.cinevva.com/blog/2026-05-14-open-world-browser-part-28-grass-and-occlusion, secondary).
4. **Soft unified light:** normals near the ground's (ours already bends them 75% up), no self-shadow, occlusion by
   height (Hexaquo, GodotGrass: shadows "_very_ high performance cost", sourced).
5. **Fluffy distance:** a low-resolution, blurry variation ("helped make the grass look fluffier and painterly",
   80.lv Meadows, sourced); Ghost of Tsushima's terrain towards the grass's colour at distance (secondary).
6. **Ragged edges and contact:** blades spilling over edges, parting and darker around props (the references;
   Tiny Glade's painted mask, inference).

## 4. Rendering: what fits the budget

The budget: 60 fps hard, 120 soft (decision 0036); scatter and foliage about 3 ms GPU
(`docs/plans/active/track-e-look.md`, Budgets). Today's meadow: +0.6 to +1.25 ms on the Mac
(`docs/plans/done/l5c-meadow.md`), 1.8 M triangles (`docs/research/frame-rate-120.md`).

- **Dense geometry blades at the references' density** (about 2000 m² in view × 300 a m²): about 600k blades of
  about 8 quads each. **Estimate: 2–4 ms** on an RTX 3060: over the budget, and wasted on sub-pixel blades.
- **Shells** (stacked painted layers with blade cells from the flow): their best case is a camera from above;
  slices show at grazing angles (https://godotshaders.com/shader/fur-grass-with-shell-texturing/, sourced), at our
  closest oblique view about 2.6 px apart for 8 shells over 0.3 m (computed), hidden by a per-pixel jitter.
  **Estimate: 0.5–1.5 ms** for 8 / 3 / 0–2 shells by zoom, drawn top first.
- **The ground pattern in the bake:** nothing a frame. Rendering the shells' shader top-down into it makes near and
  far match by construction (inference).
- **WebGL2 without compute:** one `drawArrays` with `gl_VertexID` fills the GPU's waves better than instancing a
  small mesh (Unity advises against instancing under about 256 vertices,
  https://docs.unity3d.com/cn/2020.3/Manual/GPUInstancing.html, sourced); our clumps do their per-clump work at
  every vertex (inference). **WebGPU** would cull blades once in compute and draw the survivors indirectly
  (https://toji.dev/webgpu-best-practices/indirect-draws, sourced), about the vertex half of today's cost.

## 5. Recommendation (the order the plans follow)

1. **The ground pattern combed** (flow, streaks, deep gaps, soft masses), in the bake: every zoom, nothing a frame;
   the 3D clumps lean with the same field. Plan: `docs/plans/active/grass-flow.md`.
2. **Shells** near the camera, reading the same flow and strokes, the root-to-tip gradient by layer.
3. **Sparse blades** at the closest zoom only, then flowers and petals, the autumn fur, parting around units.

To measure at each step: the frame interval A/B against the default at each zoom; the readability guard with
formations in the grass.
