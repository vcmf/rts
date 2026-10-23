---
status: research
last_reviewed: 2026-10-22
---

# A light map view with a 3D feel

Decided since: decision 0050 (one language for the battlefield) and decision 0051 (one map view, lit, proposed), which
take this note's recommendation for both the editor's draft and the game's staff map. Every external claim below was
checked against its source on 2026-10-22.

Research note for a "3D feel" style of the flat battle map: today's draft view (`src/map/draft.ts`, `src/app/map/` on
`origin/epic/map-engine`) and, perhaps, the game's far zoom. Labels used below: **[fact]** comes from a source and has
its URL; **[measured]** was run for this note; **[estimate]** is reasoning, not measured; **[rec]** is a recommendation.

---

## 0. Read this first: the conflict with the accepted staff map

The owner's reference (Epic History TV's Waterloo, `design/refs/staff-map-epic-history-waterloo.source.txt`) and this brief ask
for what the **accepted** staff map design explicitly turned down:

- `docs/proposals/staff-map/design.md` §1 lists Epic History's "Bevelled 3D blocks with drop shadows, rendered hillshade
  (the 'hybrid' look)" under **Leave**.
- §2 pillar 2, "Ink, not render. No shadows, bevels, glows or gradients on the map."
- §4: "The hachures … replace hillshade completely." §6: "Blocks are flat, sharp-cornered, with no shadow, bevel".

So the style can be built in one of two ways, and the owner has to choose which:

1. **For the draft view only** (a tool page for the map engine: the map engine's proposal, §7, on `epic/map-engine`). Nothing conflicts:
   the draft is "a working drawing, not the look" (`src/map/draft.ts` header) and is not bound by the staff map design.
2. **As the game's far zoom.** That needs a decision record that supersedes `staff-map/design.md` §1 (the Leave row),
   §2.2, §4 (relief) and §6 (blocks), at least: decision 0051 lists the full set. Accepted decisions bind (`AGENTS.md`). Note too that `implementation.md` §2
   lifts the relief into the 3D world as the zoom closes in: a baked light texture fits that path (§5.4 below).

Everything below works for either choice. The risks for choice 2 are in §7.

What we have today (read from the branch): the draft is CPU-built RGBA at one pixel per 2 m cell. It has flat colours by
attribute, a single-light hillshade (NW, 45°, `shade` clamped 0.55–1.3) and contours every 2.5 m (every fourth darker).
Trees are discs, and the whole image is blitted to a 2D canvas with `putImageData`. The layers available for a better
bake are height (nodes), ground, veg, density, water and depth, way, built, barrier, edit, zone, and the tree list.
`kinds.json` gives fields `rows: {dir, spacing}`, buildings `height`/`roof`, and trees `crown`/`form`. That is enough
for everything recommended here, with no new map data.

---

## 1. What the reference image does (my reading of the frame, not a documented pipeline)

- **One soft key light from the upper left**, with long, soft, *cast* shadows: the ridge throws a dark band across the
  valley to its lower right. This is a cast shadow, not plain slope shading. No source documents how Epic History builds
  its maps. The only claim found is a speculative, AI-generated note that such channels use Photoshop and After Effects
  or hire map designers ([lilys.ai](https://lilys.ai/ja/notes/map-animation-20260119/history-animators-map-making)),
  so treat that as unknown.
- **Elevation and light tint**: lit slopes go pale yellow-green and shadow goes olive-brown. This is the Imhof idea
  (below) in a warm palette.
- **Woods are a massed dark canopy** with crown-scale texture and a lit NW rim. **Hedgerows** are dark dotted lines.
  **Fields** are faint parallel strips. **Roads** are thin pale lines. **Villages** are small red or brown roof blocks.
  **Water** is a pale blue thread with a soft edge.
- **Units**: flat-coloured bars with a hard 1–2 px dark edge and a short drop shadow to the lower right. Flags on staffs
  serve as labels. Place names are in serif small caps with a light halo.

---

## 2. Research findings (facts, with sources)

### 2.1 Shaded relief

- **Single-light hillshade** looks at one pixel's slope and aspect only and ignores shadows cast from elsewhere
  ([Stamen](https://stamen.com/shadows-on-maps-are-getting-a-lot-more-exciting-and-heres-why/)). The convention is a
  light from the upper left (NW). A southern light can make the relief read inverted
  ([Wikipedia, Terrain cartography](https://en.wikipedia.org/wiki/Terrain_cartography)).
- **Multi-directional hillshade**: the USGS (Mark 1992) model mixes four hillshades at azimuths 225°, 270°, 315° and
  360°, all at 30° altitude, weighted by aspect ([USGS OFR 92-422](https://pubs.usgs.gov/of/1992/of92-422/of92-422.pdf)).
  Esri's version uses six directions and credits Eduard Imhof as its inspiration
  ([Esri ArcUser](https://esri.com/about/newsroom/arcuser/multi-directional-hillshade-makes-your-maps-pop)).
- **MapLibre GL's hillshade is a two-pass GPU shader** that can serve as a template. A *prepare* pass reads a 3×3
  neighbourhood of the DEM (texelFetch) into a derivative texture. A *shade* pass offers `standard`, `basic` (GDAL),
  `combined`, `igor` and `multidirectional` methods, with shadow, highlight and accent colours as uniforms
  ([hillshade.fragment.glsl](https://github.com/maplibre/maplibre-gl-js/blob/main/src/shaders/glsl/hillshade.fragment.glsl),
  [hillshade_prepare.fragment.glsl](https://github.com/maplibre/maplibre-gl-js/blob/main/src/shaders/glsl/hillshade_prepare.fragment.glsl)).
  The shade pass is cheap per pixel: a few trigonometric operations and one fetch.
- **Swiss style and Imhof**: sunlit slopes run from blue-green through green and olive-yellow towards white at the top,
  and shadowed slopes run through purples. Aerial perspective (haze) separates summits from lowlands
  ([Jenny & Hurni 2006](https://mail.colororacle.org/berniejenny/pdf/2006_JennyHurni_SwissStyleShading.pdf)). Imhof
  used "purples in valleys and yellows on peaks" ([Wikipedia](https://en.wikipedia.org/wiki/Terrain_cartography)).
- **Eduard** (Jenny et al.) reproduces Swiss manual shading with U-Net neural networks trained on Swiss topographic map
  shadings. It runs in seconds per DEM and was rated highly by 18 experts
  ([arXiv 2010.01256](https://arxiv.org/abs/2010.01256)). It is a Mac app
  ([Map Room](https://www.maproomblog.com/2022/10/eduard-a-new-mac-only-relief-shading-app/)). A 2026 exploratory study of downtown
  Calgary (a surface model) finds it gives, with tuning, results in some cases better than single- or multi-directional
  hillshade, though elsewhere analytical shading stays more reliable; it "was not designed for buildings, bridges, streets,
  trees" ([arXiv 2608.20149](https://arxiv.org/pdf/2608.20149)).
- **Blender relief** (Huffman's 2017 tutorial,
  [somethingaboutmaps](https://somethingaboutmaps.wordpress.com/2017/11/16/creating-shaded-relief-in-blender/)) is
  ray-traced, so peaks cast long shadows ([Stamen](https://stamen.com/shadows-on-maps-are-getting-a-lot-more-exciting-and-heres-why/)).
  The usual workflow then multiplies it over land cover
  ([Axis Maps](https://axismaps.com/blog/relief-mapping-in-10-easy-steps)). Huffman's own critique says to avoid the
  "deep black chasm" and too much detail and exaggeration. He blurs the DEM *before* shading and mixes about 90 %
  smoothed with 10 % detailed DEM (Tom Patterson's "resolution bumping"). Shading should be subtle enough that readers don't notice it
  ([Huffman 2022](https://somethingaboutmaps.wordpress.com/2022/01/13/towards-less-blender-y-relief/)).
- **Sky-view factor (SVF)** is the visible fraction of the sky above each cell: a diffuse-light shading with no
  direction. It was proposed because hillshade hides detail in deep shade and loses features that run parallel to the
  light ([ZRC SAZU](https://iaps.zrc-sazu.si/en/svf)). On flat ground it mostly shows negative features such as ditches
  and pits, and needs a display stretch of about 0.65–1.0, or 0.9–1.0 on very flat terrain
  ([RVT docs](https://rvt-py.readthedocs.io/en/latest/listofvis_svf.html)).
- **Soft cast shadows on heightfields**: horizon maps over a set of azimuths with a multi-resolution pyramid handle height
  fields "up to 1024×1024 in real-time" on an Nvidia 8800 Ultra (2007): about 57 Hz at 256², 2.5 Hz at 1024²
  ([Snyder & Nowrouzezahrai, CGF 2008](https://diglib.eg.org/handle/10.2312/CGF.v27i4pp1275-1283)).
- **Plan oblique relief** (Jenny & Patterson) starts from a shaded relief and "shifts pixels northward proportional to
  their elevation", so hills stand up and overlap what lies behind them while the map stays planimetric
  ([Wikipedia](https://en.wikipedia.org/wiki/Terrain_cartography),
  [Cartographic Perspectives 57](https://cartographicperspectives.org/index.php/journal/article/view/cp57-jenny-patterson)).
- **Texture shading** (Leland Brown) improves drainage detail and works best merged with conventional shaded relief
  ([shadedrelief.com](https://www.shadedrelief.com/texture_shading/), via search summary; the page returned 403).
- **Precomputed normals as a raster**: Mapzen shipped normal-map tiles to "precompute the math on the server so renderers
  like Tangram can generate spheremap-based hillshades" ([Mapzen](https://mapzen.com/blog/terrain-tile-service/)).

### 2.2 Cover, lines, water

- **Stamped tree clumps** are the standard in fantasy-map tools. Packs ship as PNG clumps, partly recolourable
  (custom and sample colour sets); this one has 138 assets ([fantasymapassets](https://fantasymapassets.com/product/old-cartography-tree-clumps-assets-megapack-woods-forests-trees/)).
- **Tiling without repeats**: histogram-preserving random tiling ([Burley, JCGT 2019](https://www.jcgt.org/published/0008/04/02/paper.pdf), building on Heitz & Neyret 2018).
  Hex-tiling takes 3 fetches of the source texture and drops Heitz & Neyret's histogram preservation (and its
  precomputed transform textures) for a blend with a contrast function on the weights
  ([Mikkelsen, JCGT 2022](https://jcgt.org/published/0011/03/05/paper.pdf)).
- **Distance fields for crisp edges at any zoom**: store a distance field in a low-resolution channel and threshold it.
  This also gives soft edges, outlines and drop shadows ([Green, Valve 2007](https://cdn.akamai.steamstatic.com/apps/valve/2007/SIGGRAPH2007_AlphaTestedMagnification.pdf)).
  Jump flooding builds approximate Voronoi diagrams and distance transforms on the GPU in a fixed number of passes,
  independent of the seed count (log₂ n for an n×n grid, per the paper) ([Rong & Tan](https://www.comp.nus.edu.sg/~tants/jfa.html)).
  For sharp corners (glyphs), the multi-channel version is MSDF ([msdfgen](https://github.com/Chlumsky/msdfgen)).
- **Anti-aliased roads**: draw one extruded quad per segment and anti-alias with a signed distance in the fragment
  shader, joins included ([Makie.jl PR 3558](https://github.com/MakieOrg/Makie.jl/pull/3558)). Tencent's maps
  draw joins in two triangles ([arXiv 1906.11999](https://arxiv.org/pdf/1906.11999v1)).

### 2.3 Units

- **A drop shadow for a rectangle in constant time**: the product of two closed-form 1D blurred boxes (erf), one step per
  pixel. A rounded rectangle has no closed form; it adds a small fixed number of samples
  (4 in the article's code) ([Evan Wallace](https://madebyevan.com/shaders/fast-rounded-rectangle-shadows/)).
- **Exact box SDF** in any dimension ([Quilez, box functions](https://iquilezles.org/articles/boxfunctions/); 2D set at
  [distfunctions2d](https://iquilezles.org/articles/distfunctions2d/)).
- **Babylon thin instances**: no per-instance JS objects, per-instance attributes through `thinInstanceRegisterAttribute`,
  and all-or-nothing culling ([Babylon docs](https://doc.babylonjs.com/features/featuresDeepDive/mesh/copies/thinInstances)).

### 2.4 Platform

- WebGL2 `MAX_TEXTURE_SIZE` is ≥ 8192 on 98 % of reports and ≥ 16384 on 86 % (as of 2026-10-22)
  ([web3dsurvey](https://web3dsurvey.com/webgl2/parameters/MAX_TEXTURE_SIZE)). The repo already notes a 16 fragment
  sampler limit on Metal (`src/look/materials.ts`) and already uses Babylon's `EffectRenderer`/`EffectWrapper` for
  full-screen GPU bakes (`src/look/building-light.ts`).

---

## 3. Games and products (what is documented)

Rendering details are rarely published. Here is what sources say; anything beyond that is labelled as my observation.

| Product | Documented | Technique (observation unless cited) |
|---|---|---|
| **Ultimate General: Gettysburg / Civil War** | Maps "accurately hand-drawn, utilizing data from satellite and historical maps" ([Steam](https://store.steampowered.com/app/502520/Ultimate_General_Civil_War/)); every "house, ridge and hill" depicted within "the game's unique art style" ([ultimategeneral.com](https://ultimategeneral.com/ug-gettysburg.html)) | Painted terrain under a tilted camera; units as coloured blocks with soldiers. The closest product to the brief |
| **Victoria 3** | The paper map is "the zoomed out version of the 3d map" with "lots of small illustrations" ([Dev Diary 49](https://www.paradoxinteractive.com/games/victoria-3/news/dev-diary-49-graphic-overview)) | One world, two styles by zoom, like our `mapness` |
| **Crusader Kings III** | DD 177 smooths blending between the paper map, political and terrain modes across zoom levels ([devtrackers](https://devtrackers.gg/crusader-kings/p/3c2f2816-dev-diary-177-a-fresh-coat-of-paint)) | Same |
| **Hearts of Iron IV** | Zooming out fades in abstracted elements; units stack by state ([PC Gamer](https://www.pcgamer.com/uk/hearts-of-iron-iv-streamlined-ww2-strategy)) | Counters with a drop shadow over a terrain map (observation) |
| **Total War** | The world map is built from artist-edited tiles ([GPUOpen](https://gpuopen.com/learn/anatomy-total-war-engine-part/)) | Full 3D, out of scope |
| **Scourge of War: Waterloo** | 2D sprites on 3D terrain; zooms out to great heights ([Steam](https://store.steampowered.com/app/369390/)) | Full 3D |
| **Grand Tactician, Field of Glory** | Nothing found on how the map is rendered | — |
| **Epic History TV** | Nothing primary (§1) | Probably a pre-rendered relief and painted layers composited in a motion-graphics tool (my guess) |

Lesson: the products that read best keep the map **one baked painting** with live symbols on top. None of them is
documented as rendering the map live with per-frame lighting.

---

## 4. Recommended stack ([rec])

The core idea is to **light a surface model, not the ground alone**. Bake one *digital surface model* (DSM) at 1 m:
ground, plus a canopy dome over woods, plus building boxes with gable roofs, plus hedges. Light that DSM once with one
pipeline. Woods then get a lit NW rim, a dark SE flank and a cast shadow on the field beside them. Roofs get a lit half
and a dark half, and hedges a thin shadow line, all for free and consistent with the hills. This is what makes the
reference read as 3D. (DSM shading of urban areas is studied in [arXiv 2608.20149](https://arxiv.org/pdf/2608.20149).)

### 4.1 Per layer

| Layer | Technique | Baked / runtime |
|---|---|---|
| **Relief** | DSM at 1 m (2401² nodes from the 2 m heights, bilinear, plus features). Generalise the ground first, Huffman-style (blur, then about 85/15 mix with the original). Light = (a) a key light, NW at about 35°, Lambert, with highlight and shadow tinted à la Imhof: warm light, cool and slightly more saturated shadow, as the art bible's ramp; (b) a weak multi-directional fill (USGS 4 azimuths) so slopes parallel to the light don't go flat; (c) SVF / AO, 16 directions, reach about 200 m, stretched for low relief; (d) a **soft cast shadow** from a horizon march toward the sun (3–5 jittered azimuths and elevations for a penumbra). Faint elevation tint (lighter higher). Contours stay as an option (the draft's 2.5 m), drawn in the shader from height with `fwidth` | Baked on the GPU into an RGBA8 *light* texture: R key, G sky (AO), B cast shadow, A fill. Combined in the shader, so the light strength and colours are live uniforms with no re-bake |
| **Woods** | Bake a *canopy* layer from the stands (density) and the tree list: stamp crown discs, Poisson-spaced by density, with jittered radius, into the DSM as domes (height about `veg.height`), so lighting gives each crown a lit side and a shadow. In the shader, colour = canopy ramp by season × the light texture. Add a crown-scale grain (a small tileable leaf-mass texture, hex-tiled, at world scale) to break up the bands. Wood edge = an SDF band, slightly darker on the shadow side | Canopy height and mask baked into the DSM and a cover texture; colour and grain at runtime |
| **Fields** | Strips from `rows.dir` and `rows.spacing`. Per field: `stripe = fract(dot(p, dirPerp) / spacing)` → a small value change (±4–6 %) alternating with crop stage, plus hairline furrows only at mid zoom (fade with `fwidth` so they never alias). Hedges as their own DSM ridge (1.5–2 m) → a thin shadow line on their lee side | Field id and dir in the cover texture (or a small per-feature table indexed by `veg`). Stripes computed at runtime |
| **Villages** | Each building as a DSM box: walls to `height`, gable roof along the footprint's long axis (pitch about 40°). Lighting splits the roof into lit and dark halves. Roof colour from `roof`/`material` (muted red tile, grey slate, straw), church darker and taller. Yards as a flat warm ground. At far zoom the roof halves merge into a cluster of small marks, as in the reference | Baked (DSM plus a roof colour index); colour at runtime |
| **Roads** | Rasterised distance-to-centreline field (exact segment distance on the CPU, or JFA on the GPU) at 1 m. Shader: `smoothstep` over `fwidth` for a crisp line of the road's real width, with a minimum screen width (about 1 px) so tracks never vanish. Two-tone (pale surface, thin darker verge) and a sunken-road darkening from the edit layer | Distance field baked; line drawn at runtime |
| **Water** | Distance to the bank (signed: positive inside) plus depth. Shallow to deep colour by depth (the draft's two colours), a soft bank band of about 2–4 m of darker damp ground, and a thin lighter "sky" edge on the NW bank. Water is excluded from the DSM's cast shadows (water is lit flat) but receives shadow | SDF and depth baked; colours at runtime |
| **Units** | One instanced quad per block, one draw call. Per instance: centre, size, angle, colour, state (morale, routing, selected). Fragment: exact box SDF → fill. A **bevel**: a 1–1.5 px lighter band on the NW edges and a darker one on the SE edges, read from the SDF gradient · light direction, plus a 1 px darker outline for contrast over any ground. A **drop shadow**: Wallace's closed-form erf box shadow, offset 2–3 px to the SE (the same light as the map), σ about 1.5 px, tinted cool and about 35 % opacity, drawn first in the same quad (the quad is padded by about 3σ). Morale hatching and routing pulse as today's rules, inside the fill. Sizes from the existing symbol rules (`staff-map/design.md` §6) | Runtime, every frame |
| **Labels** | Place names: MSDF serif atlas (Instrument Serif per the staff map's §8) with a halo of paper colour. Corps flags and labels as sprites in the same instanced pass, or kept on the existing 2D canvas overlay (`implementation.md` §1) | Atlas baked at build; runtime placement |

### 4.2 The frame

- **Render**: one full-screen quad (or the terrain mesh, §5.3) whose fragment shader reads about 5 textures: height (R16F),
  light (RGBA8), cover (RGBA8: category/palette index, density, field id, roof index), lines (RGBA8: road SDF, water
  SDF, wood-edge SDF, hedge), and the grain atlas. That is well under the 16-sampler limit. Then one instanced pass for
  blocks, one for labels.
- **Seasons**: colours are uniforms or a small palette texture indexed by category, so the season changes **without a
  re-bake**, as `implementation.md` §3 already requires of the paper bake.
- **Light stays fixed** (baked). If the light must follow the 3D world's sun, re-bake on the GPU (§5.2): about a second.

---

## 5. Architecture and cost

### 5.1 Memory for a 2.4 km map ([estimate], from sizes)

1200² cells at 2 m; bake at 1 m (2400², 5.76 M texels). WebGL2 handles 2400² on any desktop GPU (§2.4).

| Texture | Format | Size | With mips |
|---|---|---|---|
| Height (2 m, 1201²) | R16F (or R32F for the bake) | 2.9 MB (5.8) | 3.8 MB |
| Light (1 m) | RGBA8 | 23 MB | 31 MB |
| Cover (1 m) | RGBA8 | 23 MB | 31 MB |
| Lines/SDF (1 m) | RGBA8 | 23 MB | 31 MB |
| Grain, glyph atlases | RGBA8 | ~4–8 MB | — |
| **Total** | | | **~100 MB of VRAM** |

At 2 m (1200²) everything is a quarter of that: **~25 MB**. **[rec]** Bake the light at 1 m (roof and crown shading
needs it). Cover can stay at 2 m (it is the cell data). The water and wood-edge SDFs at 2 m are enough, since an SDF
interpolates to sharp edges (Green 2007); the roads' stays at 1 m (§4.1), so tracks and junctions keep a crisp line. That gives **about 55–58 MB** with mips (about 45 MB without).

### 5.2 Bake time

[measured] On this machine, an i7-9700K running Node 24 single-threaded on a synthetic 1201² heightfield at 2 m (a one-off script, not kept: plain loops over Float32Arrays, one thread):

| Step | Time |
|---|---|
| Hillshade plus normals | 49 ms |
| 6-direction hillshade | 295 ms |
| One sun's cast shadow (horizon march, 400 m) | 1.07 s (0.27 s at 4 m) |
| SVF, 16 directions, 200 m reach | **7.6 s** (1.9 s at 4 m) |
| Exact Euclidean distance transform, one mask | 61 ms |

So the **SVF and cast shadow must run on the GPU**, or in a worker at reduced resolution. [estimate] As a fragment
shader (the pattern in `building-light.ts`), 16 directions × about 25 steps is about 400 fetches per texel. At 5.76 M
texels that is about 2.3 G fetches, a few tens of ms on a desktop GPU of the min-spec class. The single sun is about
40 steps × 4 jitters. The distance fields and the DSM rasterising stay on the CPU in the worker (about 0.1–0.3 s,
estimate from the EDT row). **[rec] target: under 1 s from compile to drawn.** The draft page's "redraws in
milliseconds" (`map-engine.md` §7) then holds for colour and overlay changes, and a re-bake runs only when the geometry
changes.

### 5.3 Per-frame cost ([estimate])

- The full-screen pass at 1920×1080 is about 2.1 M pixels × about 8 fetches plus about 60 ALU operations, roughly
  0.3–0.6 ms on an RTX 3060-class GPU.
- Blocks: about 2,000 instanced quads of about 40×15 px plus padding, with negligible overdraw, under 0.1 ms; one
  `bufferSubData` per frame for about 2,000 × 12 floats (about 96 KB).
- Labels are under 0.1 ms. **Total about 1 ms**, well inside any frame-rate target (decision 0045). This must be
  measured before it is quoted as fact (`AGENTS.md`: measure, don't assume).

### 5.4 Camera: flat quad, tilt, parallax

- **Flat, straight down (orthographic)**: one quad; the 3D feel comes from the light alone. This is enough for the
  reference look, which is nearly top-down.
- **Slight tilt for parallax**: a flat quad gives none, so draw a **grid mesh** displaced by height. A 601² grid at 4 m
  is 0.36 M vertices and 0.72 M triangles, trivial on a GPU ([estimate]). The fragment shader stays the same. Two
  variants: a true tilted orthographic camera, or **plan oblique** (Jenny & Patterson). Plan oblique keeps the camera
  straight down and shifts each vertex north by `k·h` in the vertex shader. Hills "stand up" while the map stays
  planimetric, and picking stays almost unchanged (inverse-shift by height). **[rec]** Plan oblique with a small k
  (0.2–0.4, with exaggeration) suits the staff map's "straight down at map zoom" (`implementation.md` §2: "Tilt 0.00 –
  1.00"). It is the same vertex trick as the relief rising (`y * stage(relief)`), so the two compose.
- **Babylon**: an orthographic camera via `mode = ORTHOGRAPHIC_CAMERA` and `orthoLeft/Right/Top/Bottom`; ([forum](https://forum.babylonjs.com/t/getting-orthographic-camera-to-match-canvas-pixels/24532)); pan by
  moving the camera. Use a
  `ShaderMaterial` for the map and a thin-instanced unit quad with registered attributes for the blocks. The draft page
  today has no Babylon (2D canvas). A raw WebGL2 page with about 300 lines of GL is the lighter option for a tool page.
  Babylon is the right one if the code is to be shared with the game's far zoom.

---

## 6. Alternatives

| | A. Recommended: lit DSM + SDF lines + instanced blocks (§4) | B. "Canvas only" (cheapest to integrate) | C. "Real 3D at low cost" | D. Ink (the accepted staff map) |
|---|---|---|---|---|
| What | GPU-lit surface model, runtime colours | The worker bakes the whole final image (CPU hillshade plus a multiply-shaded canopy, no SVF or at 8 m) into an `ImageBitmap`. Units on the 2D canvas with `shadowBlur` or pre-rendered block sprites | Render the 1 m DSM as a mesh with a real shadow map and SSAO in Babylon, with instanced roof and crown meshes | Hachures, stipple, flat blocks, no light |
| 3D feel | Strong: cast shadows, AO, lit roofs and crowns | Medium: slope shading, weak woods | Strongest; true tilt | Drawn, not 3D |
| Cost | ~1 ms per frame, <1 s bake, ~45 MB | Bake 0.5–1 s on CPU; frame cost grows with canvas `shadowBlur` on many blocks (it blurs per draw call, so pre-render the sprites) | Shadow-map and AO passes every frame; duplicates `src/look` | Already prototyped |
| Season change | Uniforms | Re-bake | Uniforms | Uniforms |
| Zoom crispness | SDF lines stay crisp | Pixelates past 1 px per texel unless the bake is larger | Crisp | Baked strokes, 4096² |
| Fit with the staff map path | Its light texture can *be* the paper bake's lighting under the rising relief | Separate | Competes with the painted world | Is the plan |

**[rec]** Take A for the draft view now. B is a one-week stepping stone if the page must stay a 2D canvas. C is
rejected: the painted world already is C. Whether A replaces D at the game's far zoom is the owner's call and needs a
decision record (§0).

---

## 7. Risks against the art bible and the staff map

1. **The accepted staff map forbids this look** (§0). Decision 0051 (proposed) supersedes the parts it
   contradicts; until it is accepted, the ink design governs the far zoom.
2. **Armies must stay the most saturated objects** (art bible §4). Red roofs and autumn woods compete with the British
   `#B3302A`. **[rec]** Mute roofs to the earth (the 60 % chroma rule): a desaturated brick, darker in value than coats.
   Run a check that no terrain palette entry exceeds the lowest army chroma, as the staff map already requires every
   army colour checked against every season's paper.
3. **Never hide a formation**: cast shadows and dark woods are the danger. A French `#2C4FA8` block in the shade of a
   wood is dark on dark. **[rec]** Keep the bake's darkest value above a floor (Huffman's "no black chasm"). Give every
   block a 1 px outline plus a light halo in the paper colour (reference: place names). Blocks are never lit by the
   map's light: they are white-balanced, like units in the 3D world (decision 0027).
4. **The drop shadow's direction must equal the map's light**, or the scene reads as wrong. One `uLightDir` uniform
   feeds both.
5. **Light direction vs the 3D world**: the art bible's sun sits 20–35° up "from the side or behind relative to the
   default camera". The cartographic NW convention avoids inverted relief
   ([Wikipedia](https://en.wikipedia.org/wiki/Terrain_cartography)). If the map hands over to the painted world, the
   map's light and the world's sun should agree, or the handover shows a jump. Open question.
6. **"Shadows are painted shapes in the cool shadow colour, not dark grey overlays"** (art bible §4). The shadow term
   must tint cool and slightly more saturated, not multiply toward black. MapLibre's shadow-colour uniform is the model.
7. **Blender-y overdrive**: too much exaggeration or detail makes the relief noisy and the vectors seem to float
   ([Huffman 2022](https://somethingaboutmaps.wordpress.com/2022/01/13/towards-less-blender-y-relief/)). Battlefields
   are low relief (2–40 m), so exaggeration helps, but tune it by eye against the reference.
8. **Era-generic** (decision 0015): the style reads attributes (growth, roof, rows, surface), never kind names, as
   `draft.ts` already does. Block looks come from ruleset data (type → symbol), not code.
9. **Determinism** is unaffected: the bake is render-only and never feeds the sim (decision 0005).
10. **The draft view's purpose**: it is also a debugging tool (outlines, ids, overlays). **[rec]** Keep the flat-category
    mode as a toggle ("plain"/"lit"), so editing errors are not hidden under the shading.

---

## 8. Suggested first steps

1. Prototype A on the draft page behind a toggle. Take the DSM (ground plus stands as domes plus buildings with gables)
   and the GPU light bake (key, fill, SVF, sun shadow), then one full-screen shader with palette uniforms. Compare it
   with the reference at the same framing.
2. Add the SDF roads, water and wood edges, then the instanced blocks (box SDF, bevel, erf shadow).
3. Measure the bake and the frame on the min-spec. Record the numbers in the plan.
4. If the owner wants it at the far zoom: write the decision record (§0), then adapt `implementation.md` §3 so the light
   texture sits under or replaces the hachures.

---

## 9. Reading list

- Huffman, *Creating Shaded Relief in Blender* (2017) and *Towards Less Blender-y Relief* (2022): somethingaboutmaps.wordpress.com (links above).
- Jenny & Hurni (2006), *Swiss-Style Colour Relief Shading*: https://mail.colororacle.org/berniejenny/pdf/2006_JennyHurni_SwissStyleShading.pdf
- Jenny & Patterson (2007), *Introducing Plan Oblique Relief*: https://cartographicperspectives.org/index.php/journal/article/view/cp57-jenny-patterson
- Jenny et al. (2020), *Cartographic Relief Shading with Neural Networks* (Eduard): https://arxiv.org/abs/2010.01256
- Zakšek, Oštir & Kokalj, sky-view factor: https://iaps.zrc-sazu.si/en/svf
- MapLibre GL hillshade shaders (GPU template): https://github.com/maplibre/maplibre-gl-js/tree/main/src/shaders/glsl
- Snyder & Nowrouzezahrai (2008), soft self-shadowing on height fields: https://diglib.eg.org/handle/10.2312/CGF.v27i4pp1275-1283
- Green (2007), distance-field magnification: https://cdn.akamai.steamstatic.com/apps/valve/2007/SIGGRAPH2007_AlphaTestedMagnification.pdf
- Wallace, *Fast Rounded Rectangle Shadows*: https://madebyevan.com/shaders/fast-rounded-rectangle-shadows/
- Mikkelsen (2022), *Practical Real-Time Hex-Tiling*: https://jcgt.org/published/0011/03/05/paper.pdf
