---
status: research
last_reviewed: 2026-10-13
---

# Grass and fields at an RTS camera: Tiny Glade, Total War, and the techniques

Research notes, October 2026, for the look's ground (Track E, `docs/plans/active/track-e-look.md`) and the map's
ground kinds (the map track's map-engine proposal, on its epic branch: PR #49). The owner's references, Tiny Glade screenshots kept in the owner's local `design/refs/` (not committed:
`grass.webp`, `grass-2.jpeg`), show its meadow: dense blades darker at the root and lighter toward the tip, petals
strewn over it; at mid distance the blades merge into soft lighter and darker patches. From three research agents
reading public sources; each finding is marked **sourced** (said by its link), **secondary** (a third party's
summary, a forum member or a community wiki, linked), **untraced** (reported by a source we could not trace to the
original) or **inference** (ours). No cost below is ours:
every figure is the source's, on its own hardware, and ours are to be measured.

## Tiny Glade

- **Not published.** The developers have not described their grass. The GPC 2024 talk ("Rendering Tiny Glades with
  entirely too much ray marching", https://www.youtube.com/watch?v=jusWW2pPnA0) covers the renderer in general:
  GPU-driven, two-pass occlusion culling, discrete LODs ("changing to different discrete LOD just becomes a plus one
  to the index"), no clusters or mesh shaders at the time, a thin G-buffer, draws sorted by material ("grass will
  usually not occlude buildings"). **Sourced** (the talk's auto-generated transcript, read by a research agent).
- **The grass was rewritten in 2026** (update 1.16, 23 Sep 2026, Steam news): "The grass is also much more detailed
  now, and looks fluffier in the distance"; "our grass system just wouldn't scale … a new authoring & rendering
  system, loosely inspired by 'Nanite Foliage'". Separately, the official modding guide
  (https://pouncelight.games/tiny-glade/info/modding/, undated) excludes "grass/flower assets (which have a
  complicated LoD pipeline)" from texture replacement. The grass receives the global illumination (demo 1.5.4, 2024: "less noise, especially in the
  shadows and on grass"). **Sourced** (Steam posts: 1.16, https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/1844751498218119; demo 1.5.4,
  https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/6890025005352661540).
- **Crop fields: none.** Since 1.16 a garden brush paints "flowers and grain plants in the meadow": plants in a
  meadow, not a field system. **Sourced** (1.16 notes).
- **Paths, cobblestone, plants and water** are painted with "raster tools" (the 1.16 release post,
  https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/1844751498218119), and the 1.16 beta's notes fix grass "balding" near gardens and between poppies and
  "astroturf popping on top of grass" (https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/1842846814455841). **Sourced.** That
  paths clear grass through a painted mask the grass reads, over a ground layer: **inference.**
- **The far terrain** has one painted texture a season (`terrain_summer.png` …), and "small billboard plants
  distributed across the terrain" come from `assets/meshes/billboard_plants.json`, per the community wiki Tiny Docs
  (github.com/hbeau/tiny-docs, its plants and textures pages). **Secondary.** Whether those billboards face the
  camera, and where they grow: not said.
- **Inference:** the grass is geometry (compute-generated blades with an LOD pipeline), merging into clumps at
  distance; its look comes as much from the light (GI and occlusion on the blades) as from the blades.

## Total War

- **Terrain** (Attila's, part 1; Warhammer's 8-layer loop rewrite, part 2): battles are tiles, each with 8 texture layers (diffuse, normal, spec), projected in screen space one
  pass a tile with its blend map; tuned for "mid-far distance, rather than … near"; terrain left out of the shadow
  map. Rewriting the 8-layer blend as a loop gave "an almost two-times speedup". **Sourced** (Tamas Rabel,
  GPUOpen: https://gpuopen.com/learn/anatomy-total-war-engine-part/,
  https://gpuopen.com/learn/anatomy-total-war-engine-part-2/).
- **Grass (Troy):** square patches instanced from a template of blades, density from "an artist-designed mask and
  the distance from the camera", camera-facing jointed blades, Perlin wind with per-blade phase, "heavier entities and
  vehicles" trampling grass that recovers slowly, simulated on the CPU per patch. No counts or costs. **Sourced** (Intel case study,
  https://www.intel.com/content/www/us/en/developer/articles/case-study/blue-trojan-horse-snuck-total-war-saga-troy.html).
- **Maps** (the Assembly Kit's Terry): the editor lists tile creation, terrain painting and object placement; nothing
  on crops. **Sourced** (https://wiki.totalwar.com/w/TWW_Assembly_Kit_Terry_Intro).
- **Crop fields, readability:** no Creative Assembly source found. **Inference:** fields are terrain layers (striped
  textures) with sparse props; grass stays short and fades to the terrain's colour with distance; formations read by
  banners, highlights and saturated colours, never hidden by grass.
- **What needs an engine like theirs:** per-blade CPU simulation on a task system, many texture sets per tile,
  weather that rewrites the terrain. **Inference.**

## The techniques, for our camera and WebGL2

- **What a blade covers on screen** (inference, from the camera's limits in `src/look/spec.ts`: its field of view,
  its closest and widest zoom and its pitch from vertical, at 1080 lines; an upright blade foreshortens by the
  sine of the pitch): a blade 0.3–0.6 m tall spans about 3–7 pixels at the closest zoom seen near top-down and
  9–19 at its most oblique, and 0.6–3 pixels at the widest zoom; a blade a few millimetres wide is under a pixel
  at every zoom, so blades alias unless they are drawn as clumps. Tufts or clumps carry the closest zooms; the
  ground's pattern carries the mid and far zooms, and both must agree where one hands over to the other.
- **1. A ground shader that paints the grass's own pattern, crossfaded to geometry near the camera.** Hexaquo's
  Godot series: full blades near and an impostor plane far (the article also builds a one-triangle tier; its final
  script switches between the blades and the impostor),
  the plane's normals from a baked top-down capture of the grass, the two crossfaded with dithering; "just under
  2 ms on my machine" (hardware unstated). **Sourced**
  (https://hexaquo.at/pages/grass-rendering-series-part-4-level-of-detail-tricks-for-infinite-plains-of-grass-in-godot/).
  Ghost of Tsushima replaces far grass by "texture on terrain". **Secondary** (the summary deck below).
- **2. Procedural blades** (Ghost of Tsushima, GDC 2021, Eric Wohllaib, https://gdcvault.com/play/1027214/): Bézier
  blades, Voronoi clumps setting height, facing and colour, wind from noise, distant blades' normals lerped toward a global normal; 83k blades drawn of 1M, 2.5 ms on PS4. **Secondary** (a summary deck:
  https://origami.projet.liris.cnrs.fr/topics/gdl/gdl_talk_49/GDL26.03_2025.pdf). Open implementations inspired by the talk:
  https://github.com/2Retr0/GodotGrass, https://github.com/simondevyoutube/Quick_Grass. Without compute (WebGL2),
  blades are placed per tile or from `gl_VertexID` and a hash (inference).
- **3. Clump cards** (a tuft on a quad): a forum member's rule of thumb puts a safe total near 3 M triangles,
  "these numbers will vary from hardware to hardware". **Secondary**
  (https://discourse.threejs.org/t/performance-optimizing-3m-instanced-grass-in-three-js/81286). That cards cost
  in overdraw rather than vertices: **inference.**
  Their alpha-test aliasing: **inference** (as the leaf cards' at the widest zoom).
- **4. Shell texturing** (stacked copies of the ground, each cut by noise): cheap; "might look awkward when looked
  at with an angle". **Sourced** (https://godotshaders.com/shader/fur-grass-with-shell-texturing/). **Inference:**
  near top-down (the camera's smallest pitch from vertical, `src/look/spec.ts`) shells overlap and look solid; at
  its most oblique pitch a 1 m crop's shells may separate into visible slices; a candidate for standing wheat and
  reeds only after a test against cards at that oblique pitch.
- **Wheat in other games** (Manor Lords, Anno 1800, Age of Empires IV, Company of Heroes 3): no published breakdown
  found.
- **Placement:** Horizon Zero Dawn places vegetation procedurally on the GPU (GDC 2017, Jaap van Muijden;
  https://www.guerrilla-games.com/read/gpu-based-procedural-placement-in-horizon-zero-dawn); a research agent
  reported 250 µs average from the talk's slides, not on that page. **Untraced.** A hashed jitter per cell for stable
  placement on WebGL2: **inference.**

## Pitfalls

- **Babylon thin instances on ANGLE (Windows):** 2.5 M instanced quads (splats, not grass) drew at 15 fps with a
  buffer marked dynamic and 60 with a static one, ANGLE de-interleaving dynamic buffers; the OpenGL backend or
  WebGPU also avoided it. **Sourced**
  (https://forum.babylonjs.com/t/mesh-with-thin-instance-slower-than-with-full-vertices/46756). Keep the grass's
  buffers static and trample in the shader from a texture: **inference.**
- **Alpha-tested blades alias and vanish at distance:** alpha-to-coverage with MSAA and coverage-preserving mips.
  **Sourced** (https://bgolus.medium.com/anti-aliased-alpha-test-the-esoteric-alpha-to-coverage-8b177335ae4f).
  Alpha-blended grass is costly (Total War's "vegetation alpha" setting, a press test whose source was not
  re-found). **Untraced.**
- **Popping:** swapping LOD by tile shows, and grass shadows cost a lot. **Sourced** (the GodotGrass README).
  Fading per blade by distance with a hash, and darkening the root with the baked occlusion instead of shadows:
  **inference.**
- **Readability (inference):** grass and crops never taller than a soldier's shoulder; a low-resolution mask of the
  units' presence can shorten them under and around formations; crops less saturated than coats
  (`docs/art-bible.md` §4, the palette: armies are always the most saturated objects).

## What it suggests for us (inference, to plan and measure)

- **Meadow and pasture:** the near zooms need tufts or clumps (above); the macro colour gains a clump term (light and dark patches, lighter "tips", soil gaps)
  that carries the meadow at every zoom; the tufts (today's pack models) stay as the near tier, coloured from the
  same clump term and the ground under their root, lit with the ground's normal, and fade out per tuft by distance
  over a wide band.
- **Standing wheat, rye, oats:** today the scatter's pack Wheat tufts on wheat cover (`src/look/nature.ts`); against them,
  shells over each field (cut by row-aligned noise, ears toward the top, a strip of
  cards along the edges) or dense cards, chosen by a test at the camera's most oblique pitch; stubble short shells or
  texture; ploughed texture only; the far zoom keeps the baked stripes.
- **One painted mask** (the cover grid, `src/look/world/cover.ts`, and later the map's ground grid) drives grass,
  crops, paths and roads (inference; Total War's grass density comes from an artist's mask, Troy's case study).
