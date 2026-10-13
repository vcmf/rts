---
status: research
last_reviewed: 2026-10-13
---

# Grass and fields at an RTS camera: Tiny Glade, Total War, and the techniques

Research notes, October 2026, for the look's ground (Track E, `docs/plans/active/track-e-look.md`) and the map's
ground kinds (the map track's map-engine proposal, on its epic branch: PR #49). The owner's references, Tiny Glade screenshots kept in the owner's local `design/refs/` (not committed:
`grass.webp`, `grass-2.jpeg`), show its meadow: dense blades darker at the root and lighter toward the tip, petals
strewn over it; at mid distance the blades merge into soft lighter and darker patches. From three research agents
reading public sources; each finding is marked **sourced** (with its link) or **inference**. No cost below is ours:
every figure is the source's, on its own hardware, and ours are to be measured.

## Tiny Glade

- **Not published.** The developers have not described their grass. The GPC 2024 talk ("Rendering Tiny Glades with
  entirely too much ray marching", https://www.youtube.com/watch?v=jusWW2pPnA0) covers the renderer in general:
  GPU-driven, two-pass occlusion culling, discrete LODs ("changing to different discrete LOD just becomes a plus one
  to the index"), no clusters or mesh shaders at the time, a thin G-buffer, draws sorted by material ("grass will
  usually not occlude buildings"). **Sourced.**
- **The grass was rewritten in 2026** (update 1.16, 23 Sep 2026, Steam news): "The grass is also much more detailed
  now, and looks fluffier in the distance"; "our grass system just wouldn't scale … a new authoring & rendering
  system, loosely inspired by 'Nanite Foliage'". Its LOD pipeline is not moddable (the official modding guide,
  https://pouncelight.games/tiny-glade/info/modding/: "grass/flower assets (which have a complicated LoD
  pipeline)"). The grass receives the global illumination (demo 1.5.4, 2024: "less noise, especially in the
  shadows and on grass"). **Sourced** (Steam news, https://store.steampowered.com/news/app/2198150).
- **Crop fields: none.** Since 1.16 a garden brush paints "flowers and grain plants in the meadow": plants in a
  meadow, not a field system. **Sourced** (1.16 notes).
- **Paths** are "raster tools" that clear grass (fixes for grass "balding" and "astroturf popping on top of grass"
  in 1.16). **Sourced.** A painted mask that the grass reads, with a ground layer under it: **inference.**
- **The far terrain** has one painted texture a season (`terrain_summer.png` …) and plants outside the glade are
  camera-facing cards, per the community wiki Tiny Docs (github.com/hbeau/tiny-docs). **Secondary.**
- **Inference:** the grass is geometry (compute-generated blades with an LOD pipeline), merging into clumps at
  distance; its look comes as much from the light (GI and occlusion on the blades) as from the blades.

## Total War

- **Terrain:** battles are tiles, each with 8 texture layers (diffuse, normal, spec), projected in screen space one
  pass a tile with its blend map; tuned for "mid-far distance, rather than … near"; terrain left out of the shadow
  map. Rewriting the 8-layer blend as a loop gave "an almost two-times speedup". **Sourced** (Tamas Rabel,
  GPUOpen: https://gpuopen.com/learn/anatomy-total-war-engine-part/,
  https://gpuopen.com/learn/anatomy-total-war-engine-part-2/).
- **Grass (Troy):** square patches instanced from a template of blades, density from "an artist-designed mask and
  the distance from the camera", camera-facing jointed blades, Perlin wind with per-blade phase, units flattening
  grass that recovers slowly, simulated on the CPU per patch. No counts or costs. **Sourced** (Intel case study,
  https://www.intel.com/content/www/us/en/developer/articles/case-study/blue-trojan-horse-snuck-total-war-saga-troy.html).
- **Maps** (the Assembly Kit's Terry): tiles of height map, blend map and models; texture and vegetation painting;
  nothing on crops. **Sourced** (https://wiki.totalwar.com/w/TWW_Assembly_Kit_Terry_Intro).
- **Crop fields, readability:** no Creative Assembly source found. **Inference:** fields are terrain layers (striped
  textures) with sparse props; grass stays short and fades to the terrain's colour with distance; formations read by
  banners, highlights and saturated colours, never hidden by grass.
- **What needs an engine like theirs:** per-blade CPU simulation on a task system, unbounded texture sets per tile,
  8 km of rendered tiles, weather that rewrites the terrain. **Inference.**

## The techniques, for our camera (45–260 m) and WebGL2

- **At our distances a blade is a few pixels at best** (inference: 0.3–0.6 m seen from 45–260 m). The ground layer
  must carry the meadow; blades only garnish the closest zoom.
- **1. A ground shader that paints the grass's own pattern, crossfaded to geometry near the camera.** Hexaquo's
  Godot series: blades near, one triangle a blade at mid range, a plane far whose shader reuses the grass's
  world-space noise (albedo, occlusion, normals), crossfaded with dithering; the whole "just under 2 ms" on a desktop
  at eye level. **Sourced**
  (https://hexaquo.at/pages/grass-rendering-series-part-4-level-of-detail-tricks-for-infinite-plains-of-grass-in-godot/).
  Ghost of Tsushima replaces far grass by "texture on terrain" (a third-party summary of the GDC 2021 talk).
- **2. Procedural blades** (Ghost of Tsushima, GDC 2021, Eric Wohllaib, https://gdcvault.com/play/1027214/): Bézier
  blades, Voronoi clumps setting height, facing and colour, wind from noise, distant blades lerped to the clump's
  normal; 83k blades drawn of 1M, 2.5 ms on PS4. **Secondary** (a summary deck:
  https://origami.projet.liris.cnrs.fr/topics/gdl/gdl_talk_49/GDL26.03_2025.pdf). Open ports:
  https://github.com/2Retr0/GodotGrass, https://github.com/simondevyoutube/Quick_Grass. Without compute (WebGL2),
  blades are placed per tile or from `gl_VertexID` and a hash (inference).
- **3. Clump cards** (a tuft on a quad): cheap a vertex; the cost is overdraw and alpha-test aliasing
  (https://discourse.threejs.org/t/performance-optimizing-3m-instanced-grass-in-three-js/81286).
- **4. Shell texturing** (stacked copies of the ground, each cut by noise): cheap, breaks seen from the side
  (https://godotshaders.com/shader/fur-grass-with-shell-texturing/). **Inference:** our camera never looks from the
  side, so it suits uniform, dense, bounded areas: standing wheat, reeds.
- **Wheat in other games** (Manor Lords, Anno 1800, Age of Empires IV, Company of Heroes 3): no published breakdown
  found.
- **Placement:** Horizon Zero Dawn places by dithering density maps, stable and cheap (250 µs average,
  https://www.guerrilla-games.com/read/gpu-based-procedural-placement-in-horizon-zero-dawn); a hashed jitter per cell
  gives the same stability on WebGL2 (inference).

## Pitfalls

- **Babylon thin instances:** 2.5 M quads ran at 15 fps until the buffer was made static
  (`thinInstanceSetBuffer(…, true)`; https://forum.babylonjs.com/t/mesh-with-thin-instance-slower-than-with-full-vertices/46756);
  rewriting it each frame for trampling was too slow: trample in the shader from a texture instead.
- **Alpha-tested blades alias and vanish at distance:** alpha-to-coverage with MSAA and coverage-preserving mips
  (https://bgolus.medium.com/anti-aliased-alpha-test-the-esoteric-alpha-to-coverage-8b177335ae4f), or hashed alpha;
  never alpha-blended grass (Total War's "vegetation alpha" was costly, GameStar's Rome II test).
- **Popping:** swapping LOD by tile shows (GodotGrass); fade per blade by distance with a hash.
- **Grass casting shadows is expensive** (GodotGrass): darken the root and use the baked occlusion instead.
- **Readability (inference):** grass and crops never taller than a soldier's shoulder; a low-resolution mask of the
  units' presence can shorten them under and around formations; crops less saturated than coats (art bible).

## What it suggests for us (inference, to plan and measure)

- **Meadow and pasture:** the macro colour gains a clump term (light and dark patches, lighter "tips", soil gaps)
  that carries the meadow at every zoom; the tufts (today's pack models) stay as the near tier, coloured from the
  same clump term and the ground under their root, lit with the ground's normal, and fade out per tuft by distance
  over a wide band.
- **Standing wheat, rye, oats:** shells over each field (8–16, cut by row-aligned noise, ears toward the top) with a
  strip of cards along the edges; stubble two or three short shells or texture; ploughed texture only; the far zoom
  keeps the baked stripes.
- **One painted mask** (the cover grid, `src/look/world/cover.ts`, and later the map's ground grid) drives grass,
  crops, paths and roads, as Tiny Glade's raster tools and Total War's density masks do.
