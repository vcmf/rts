---
status: research
last_reviewed: 2026-10-29
---

# Epic campaign maps and crisp relief up close

Two questions about the 1805 theatre of the campaign map (`prototypes/campaign-map.html`, look in
`docs/proposals/campaign-map.md`, current state in `docs/plans/active/k1-theatre-look.md`, Results). First: how do
Total War's campaign maps, and those of similar games, look epic, how are they built, and what can a relief print on
paper take from them? Second: how do we get a crisp physical-relief look at close zoom (stacked contour sheets with
lit edges and cast shadows, fine erosion on the slopes, sharp ridges and gullies, soft occlusion, raking light) when
the base grid is 250 m? A third part recommends changes in order of impact. The earlier note
`docs/research/relief-generalization.md` covers simplifying the relief at the theatre's zoom (pyramids, Swiss tone
rules, contours); this note builds on it and does not repeat it.

Date: 2026-10-29, by a research agent

Tags (as in `docs/research/period-maps.md`):

| Tag | Meaning |
|---|---|
| [S] | Sourced: the linked page states it. "(extract)" means the claim was read from a search engine's extract of the page, not the page itself. |
| [C] | Community or secondary source (mod pages, forums, press, wikis). |
| [E] | Estimate or inference by this note's author, with the reasoning given. |
| [M] | Measured here. |

GPU costs are for test machine A (RTX 3080, 4K) and are all [E] unless marked; none was measured here.

## Summary

- **Little is published about how Total War builds its campaign maps.** No GDC talk or CA art blog on campaign
  terrain was found. What exists: the Assembly Kit's terrain editor (Terry) for battle maps, modding guides, mod
  pages that change the campaign camera, and press interviews [S, C]. Paradox is more open: Crusader Kings III's
  dev diary 177 describes its terrain pipeline and states the key design point: **stylised (exaggerated) mountains
  look best up close, realistic ones turn to noise** [S].
- **What reads as "epic" [E]:** mountains as few, big, exaggerated masses with the plains kept flat; a camera that
  tilts toward the horizon as it zooms in, with haze hiding the distance; strong value contrast between lit faces
  and shade; moving cloud shadows (CK3 [S]); water and coasts in a strong colour; and at the far zoom a different,
  simpler drawing (a paper map) rather than the 3D terrain seen from further away.
- **Why we are soft up close [E]:** at the closest zoom (30 km away, fov 0.5 rad) a screen shows about 15 km, so a
  250 m cell spans 15–35 px and the 1 km mesh 60–140 px. Both the baked light and the geometry are magnified.
- **Crispness comes from three things, in this order [E]:** (1) light computed per pixel from a height texture, not
  baked at 250 m; (2) finer real heights where the camera is close: Terrarium zoom 10–11 is 100–50 m at 48° N,
  backed by EU-DEM at 30 m [S]; (3) synthesised detail below the data's resolution, with the 2026 erosion filter by
  Rune Skovbo Johansen (MPL 2.0, one pass per pixel, no simulation) [S].
- **The reference's "stacked sheets" can be drawn per pixel at any zoom**: terrace the height, find each sheet's edge
  by height over gradient, light the edge by its facing, and test one or two offset samples for the drop shadow
  [E]. A few texture reads a pixel.
- **Occlusion:** bake a horizon-based occlusion on the GPU per height level [S for the method]; screen-space AO adds
  little on a near-vertical view of a height field and costs every frame [E].

## 1. How the epic campaign maps are made

### 1.1 Total War (Creative Assembly)

What is documented:

- **Battle terrain editor.** Terry, the Assembly Kit's editor, builds maps from layered heightmaps ("Layers are
  blended together in ascending order"), marks terrain steeper than 45° impassable, and shows a height overlay in
  coloured bands [S], https://wiki.totalwar.com/w/TWWAKT_Editing_the_Heightmap. A "low frequency" heightmap carries
  the large shapes across all tiles of a battle map, made at 4× the resolution of the tile map [S (extract)],
  https://wiki.totalwar.com/w/Terry_-_Low_Frequency_Map. These are battle tools; the campaign map's own pipeline is
  not documented by CA [E, nothing found].
- **Campaign map building for modders (Warhammer III).** A community guide describes a campaign map built from a
  height map and a blend texture, and a "camera heightmap" as a 16-bit greyscale PNG whose scale is stored in a PNG
  tEXt block [C], https://tw-modding.com/wiki/Tutorial:Campaign_Map_Making_for_Warhammer_III (marked work in
  progress; the page refused a direct read here). The camera following its own smoothed height field, not the
  terrain, is a cheap way to keep the camera calm over exaggerated ranges [E].
- **Rome II (2013).** A terrain map lies under the campaign map; its height map says where mountains and lakes are,
  foliage is generated, and battles are generated from the campaign map where they happen [S (extract)], Al Bickham
  interviewed by GamesBeat, https://gamesbeat.com/total-war-rome-ii-interview/. The campaign map is seamless rather
  than tiled, which made it harder to mod than Rome I's [S (extract)],
  https://pcgamer.com/total-war-devs-explain-lack-of-mod-tools-for-empire-and-napoleon-release-data-tables-for-modders.
- **Three Kingdoms (2019).** The art director cites modern Chinese painters of historical themes "with a much more
  modern and clean approach"; the campaign map runs a continuous day and night cycle; the 2D interface is built on
  "flowing ink" [S (extract)], https://gamesbeat.com/how-creative-assembly-conceived-the-art-for-total-war-three-kingdoms/.
- **Pharaoh (2023).** Seasons and weather change the campaign map; the map "becomes darker" in bad times [C],
  press coverage, e.g. https://www.pcgamer.com/total-war-pharaohs-dynamic-weather-system-lets-you-feel-the-heat-of-battle.
- **Camera and fog (Warhammer II–III).** Mods state the vanilla minimum campaign camera angle is 35°, raised to
  45° or 48° by the mods because "the default tilt makes the fog too disruptive"; one mod also lets the camera
  come to 2 m above the ground instead of 4 and reduces fog when zoomed out [C],
  https://www.moddb.com/mods/improved-campaign-camera. Modders say the fog is a plane in the effects, not particles
  [C], Steam workshop comments. Read as pitch above the horizon, 35° is about 55° off vertical: Total War tilts far
  more than our 20° when close, and hides the distance with fog [E].
- **Not found:** campaign heightmap resolution, vertical exaggeration, the zoom curve, or any GDC talk on campaign
  terrain for Empire, Napoleon, Rome II, Attila, Warhammer I–III, Troy or Pharaoh. Any number given for these
  elsewhere should be treated as unchecked.

What the published screenshots show, as this author reads them [E]: mountains several times taller than true
against settlements and armies; ranges drawn as continuous walls with sharp crests; plains nearly flat and busy
with fields and forests; deep blue water with bright shore foam; strong sun from one side with dark, saturated
shade; fog and cloud at the edges; at the farthest zoom the 3D terrain stays but icons and borders take over.

### 1.2 Paradox (Clausewitz / Jomini engine)

- **CK3 paper map.** At far zoom the map turns into a "paper map, for an easy overview and stylish screenshots";
  the map stays flat (no globe) [S (extract)], dev diary 2,
  https://forum.paradoxplaza.com/forum/threads/ck3-dev-diary-2-the-medieval-map.1274052/.
- **CK3 terrain pipeline (dev diary 177, 2025)** [S], read via
  https://devtrackers.gg/crusader-kings/p/3c2f2816-dev-diary-177-a-fresh-coat-of-paint:
  - before, "we painted heightmaps and terrain masks by hand", which took months; now the map is split into tiles,
    each run through Gaea (erosion simulation) to give a final heightmap, an overlay colour map and masks for the
    tiling materials, then stitched; the old heightmap is the base because its shape matters to play;
  - 7 biomes, each with its own tiling textures and a palette taken from reference material; a full build "can take
    up to 3 hours";
  - the old mountains took their detail from a tiling normal map, which made visual noise in dense regions;
  - the feature scale was kept: the stylised scale of mountains looks best zoomed in, and real-world scale would make
    most mountains look like noise up close;
  - terrain and map objects have separate lighting parameters; the map is brighter so objects stand out; cloud
    shadows creep across the land; effects blend between zoom levels (paper, political, terrain modes);
  - paper map styles: one after Olaus Magnus' Carta Marina, one in the bold brushwork of Shan Shui painting.
- **CK3 map files** [S], https://ck3.paradoxwikis.com/Map_modding (partly outdated since 1.18, says the page): a
  16-bit greyscale `heightmap.png`; a flat map texture at full map size; a colour map at a quarter of it; per
  material masks and a detail index and intensity at map size. So: one coarse height, one colour wash, and tiling
  detail materials chosen per pixel.
- **Imperator: Rome.** Players praise its terrain map mode, "a pleasant colour-coded aesthetic view of the land"
  [C]. No art diary on its terrain was found.

### 1.3 Others

- **Humankind (Amplitude).** Each tile has an elevation; slopes or cliffs between tiles; the aim is terrain "not
  necessarily realistic, but … plausible enough while being stylized and coherent" [S (extract)],
  https://community.amplitude-studios.com/amplitudestudios/humankind/blogs/722-humankind-feature-focus-02-reimagining-terrain.
  Players found the cliffs far larger than real ones, and the first palette "too yellow and too bright" [C].
- **Old World (Mohawk).** An environment artist says he "sculpted every coast" [S (extract)],
  https://mohawkgames.com/podcasts/interview-with-adam-garland-environment-artist/.
- **Civilization VII.** Firaxis published a post on map generation (Voronoi based) but nothing on terrain rendering
  was found [S (extract)], https://civilization.2k.com/civ-vii/game-guide/gameplay/map-generation/.
- **Anno 1800, Manor Lords, Northgard:** no public source on their terrain look or tech was found.

### 1.4 Terrain tech in general

- The documented games share a pattern [E, from 1.1–1.2]: a coarse authored or processed heightmap, a colour wash,
  and per-pixel detail from tiling materials (diffuse, normal) selected by masks. Fine geometry is not stored for
  the whole map; detail is a material.
- CK3's warning applies to us: a tiled detail normal map over large mountains reads as noise [S]. Detail must
  follow the terrain's own slope lines (erosion), not repeat a texture [E].

### 1.5 What makes them epic, and what a paper print can take [E]

| Ingredient | In the games | For a relief print |
|---|---|---|
| Vertical scale | Mountains many times true, as walls; CK3 keeps stylised scale on purpose [S] | Keep the ×4 lift on masses; exaggerate more far, less close (Patterson's chart, earlier note §2.1) |
| Camera | Tilts toward the horizon as it comes close, fog in the distance [C] | Tilt grows with zoom, haze into the paper, never a sky (§3, E2) |
| Light | One strong sun, deep shade, separate light for objects (CK3) [S] | Raking sun on the masses, cast shadows only from large forms |
| Atmosphere | Fog, cloud shadows (CK3) [S] | Haze toward paper with depth; slow cloud shadows as a faint wash |
| Colour | Palette per biome from references (CK3) [S] | One paper, warm light, cool shade; faint value steps by height |
| Water | Strong colour and moving shore (CK3) [S] | Ocean blue already; a darker rim and a lighter shallow band at shores |
| Far zoom | A different drawing: paper map (CK3) [S] | Already a print; at the far zoom drop the 3D lift toward a flat print |
| Frame | Map edge hidden in fog or cloud | A physical plate: the reference is a relief model, so show its thickness and its shadow |

## 2. Crisp detail at close zoom

### 2.0 Where the softness comes from [E]

At `DIST_MIN` 30 km with a vertical fov of 0.5 rad, the view is about 2 × 30 × tan(0.25) ≈ 15 km high, so 7–17 m
a pixel on a 900–2,160 px tall screen. One 250 m cell spans 15–35 px; the displaced mesh (a vertex a km, heights
smoothed over 2 cells) spans 60–140 px. The CPU bake stores light per cell, so the GPU magnifies a 250 m image by
15–35×: soft by construction. The reference model has detail at 1–3 px.

### 2.1 Finer real heights, by zoom

- **Terrarium resolution.** Mapzen's table, metres per pixel at 45° latitude: zoom 9 216, 10 108, 11 54, 12 27
  [S], https://github.com/tilezen/joerd/blob/master/docs/data-sources.md. At our 48° N it is a little finer:
  zoom 10 ≈ 102 m, 11 ≈ 51 m, 12 ≈ 26 m (equator value × cos 48°) [E].
- **Sources behind them.** EU-DEM at 30 m in most of Europe from zoom 9; at zooms 10–15 national data join it,
  among them Austria's data.gov.at; SRTM is 1 arc second (≈ 30 m), matching zoom 12 [S], same page. So zoom 11–12
  holds real detail over our theatre, not an upsample [E].
- **Copernicus GLO-30.** 30 m, free under ESA's licence, as Cloud Optimised GeoTIFFs in a public S3 bucket
  (copernicus-dem-30m), heights on the EGM2008 geoid [S], https://registry.opendata.aws/copernicus-dem/. The licence
  for use in a sold game was not checked here. Same resolution as zoom 12; useful only if Terrarium's seams or
  voids show.
- **Data sizes.** The theatre tool's cache holds 187 tiles at zoom 9, 25.8 MB, median 137 KB a tile [M]. Each zoom
  step is 4× the tiles: zoom 10 ≈ 750 tiles, ≈ 100 MB; zoom 11 ≈ 3,000, ≈ 400 MB; zoom 12 ≈ 12,000, ≈ 1.6 GB
  [E, assuming similar compression]. As a grid, the theatre at 51 m is about 15,700 × 9,800 = 154 M samples,
  308 MB at 16 bits [E]: too much to load whole, easy to tile.
- **LOD in WebGL2.** Two standard schemes [S]: geometry clipmaps, nested grids around the viewer shifted as it
  moves, heights in textures (Asirvatham and Hoppe, GPU Gems 2, ch. 2,
  https://developer.nvidia.com/gpugems/gpugems2/part-i-geometric-complexity/chapter-2-terrain-rendering-using-gpu-based-geometry);
  and CDLOD, a quadtree of regular grids chosen by 3D distance with vertex morphing, no stitching (Strugar, JGGGT
  14(4), 2009, https://github.com/fstrugar/CDLOD). For a plate seen from above with one focus point, a quadtree of
  height tiles (256² or 512²) loaded when the camera is within a few tile widths is enough; the mesh can stay one
  grid with heights fetched from the finest tile available [E]. WebGL2 has vertex texture fetch and half-float
  textures, which both need [E].
- **Bake, not stream from AWS [E].** A build step can cut the theatre into a pyramid of 16-bit height tiles (and
  normal tiles) once, generalised per level as the earlier note recommends, and ship them; the page loads a level's
  tiles by zoom. This keeps the page offline-capable and stable.

### 2.2 Per-pixel light from heights

- **What [E]:** sample the height texture in the fragment shader, take the normal from four neighbours (central
  differences), and light it there: Lambert, the warm and cool tones, the Tanaka edges. The cast shadow and
  occlusion stay baked (they need long searches).
- **Why it is crisper [E]:** the light changes inside a cell. With bilinear heights the normal is constant per
  cell (facets); a bicubic B-spline fetch (4 bilinear taps) or a stored normal texture removes the facets.
- **Cost [E]:** 4–8 texture reads a pixel, well under 0.5 ms at 4K. Data: one R16F height texture per level
  (the theatre at 250 m: 3201 × 2001 × 2 B ≈ 13 MB).
- **Normal maps from finer data [E]:** where only the 250 m geometry is drawn, a normal map baked from the 51 m
  data gives 5× sharper light on the same mesh, at 2 bytes a texel (RG8, octahedral or xy).

### 2.3 Detail synthesis below the data

- **Erosion filter (Rune Skovbo Johansen, 2026)** [S], https://blog.runevision.com/2026/03/: adds branching gullies
  and sharp ridges to any height function without simulating water; each point is independent, so it suits the GPU
  and chunks. Stripes are aligned with the gradient (the downhill direction), in grid cells each with a random pivot,
  blended with cosine (height) and sine (slope) waves; octaves branch smaller gullies off larger ones. His "fade"
  approach fades the stripes where the slope nears zero, giving crisp peaks and V-shaped valleys; Clay John's 2018
  original and Fewes' 2023 version scale the stripe frequency with slope instead. Parameters: erosion strength,
  gully weight (e.g. 2.0 and 0.5 for pointier peaks), detail, lacunarity (usually 2), rounding. Licence: MPL 2.0.
  Shadertoy wXcfWn (final), 33cXW8 (clean). Fewes' version is 7ljcRW, Clay John's MtGcWh.
- **Licences [S, C]:** a C# port of Fewes' shader is CC BY-NC-SA 3.0 [S],
  https://gist.github.com/runevision/c867c458f06284ad4c0f8aa3b974bc59; Shadertoy's default licence is non-commercial
  as this author understands it [E]. Only Johansen's MPL 2.0 code is usable in a sold game without asking [E].
- **How for us [E]:** apply it to the height in the fragment shader only for the band below the data's cell
  (wavelengths from 2 cells down to a few pixels), with strength fading in when a cell spans more than about 4 px,
  so the far view is untouched and the real forms never move. Feed the result to the normal of §2.2 only (not the
  mesh). Base the fade target on the generalised height, so gullies stop at valley floors.
- **Cost [E]:** 4–5 octaves × 9 cells × a few trig calls ≈ 200–400 ALU ops a pixel; with finite-difference normals
  ×3. At 4K on an RTX 3080 roughly 1–2 ms; at 1600 × 900 under 0.5 ms. Alternatively bake it into the normal tiles
  of §2.1 offline at no runtime cost.
- **Offline erosion simulation** (Gaea, as CK3 does [S]): best quality, but a tool outside the repo and a bake per
  map; Gaea's licence terms for shipped output were not checked.
- **A tiled detail normal map:** cheap but repeats and ignores the slope lines; CK3 moved away from it (§1.2) [S].
- **Fractal noise added by zoom:** cheap, but noise does not branch downhill, so it reads as crumpled paper (our
  ×8 experiment, plan Results) [E].

### 2.4 Ambient occlusion

- **Horizon-based, baked on the height field.** For each texel, march along N azimuths and keep the highest
  horizon angle; occlusion from their mean. Timonen and Westerholm compute exact horizons on a set of directions,
  hard and soft shadows from one structure, 23 fps on 1024² heights with 64 directions on a GTX 280 [S],
  https://diglib.eg.org/handle/10.2312/CGF.v29i2pp723-731. rayshader's ambient_shade defaults: 24 rays, search 30
  cells [S], https://rdocumentation.org/packages/rayshader/versions/0.35.7/topics/ambient_shade.
- **Cost for us [E]:** 16 directions × 32 steps over 6.4 M cells = 3.3 G samples: 10–30 s in JavaScript, but
  50–200 ms as a WebGL2 render-to-texture pass. Per close-zoom tile (512²), a few ms. One R8 texture per level.
- **Screen-space (HBAO).** Bavoil, Sainz and Dimitrov, SIGGRAPH 2008: horizon search over the depth buffer [S],
  https://history.siggraph.org/learning/image-space-horizon-based-ambient-occlusion-by-bavoil-sainz-and-dimitrov/.
  On a near-vertical view of a height field the depth buffer holds the same information as the heights, so it
  buys nothing over the baked version, costs 1–3 ms a frame at 4K, and shimmers when panning [E]. Useful later for
  moving things (armies on the map).
- **Multi-scale [E]:** a fine radius (4–8 cells) gives the crisp gully darkening of the reference; a wide one
  (2–8 km) the soft valley shade the prototype's exposure term already gives. Bake both, mix by zoom.

### 2.5 Stacked contour sheets, per pixel

The reference reads as a stack of cut sheets: each step has a thin lit edge where it faces the light and drops a
shadow onto the sheet below. It can be drawn per pixel at any zoom [E]:

1. Terrace: `t = floor(h / Δ)`; sheet top `T = t · Δ`.
2. Edge distance: `d = (h − T) / |∇h|` in metres, from the same gradient as the light; the edge is where `d` is
   small (screen-space: divide by metres a pixel). Lit edge: `e = 1 − smoothstep(0, w, d_px)` scaled by
   `max(0, dot(-n_xy, L_xy))` (the step's outward normal toward the light); dark edge the opposite.
3. Drop shadow: sample the terraced height at `p + L_xy · s` (one to three taps, s = the step height × rise ÷
   tan(sun elevation)); if that sheet is higher, darken by a soft amount. Shadows of all heights from a horizon
   map, if one is baked (§2.4).
4. Fade a step size out when its lines would come closer than about 6 px (Ricky Reusser's adaptive contouring,
   cited in the earlier note §3.2) and in the next coarser Δ.

A published look of this kind: Shane's "Smooth Noise Contours" Shadertoy, ported as a "paper-cut" shader that
embosses each terrace edge with a soft shadow below and a pale highlight above (CC BY-SA 4.0) [C],
https://www.shadcn.io/shaders/smooth-noise-contours-shader. Cost [E]: 3–6 extra texture reads a pixel, under 0.5 ms
at 4K. The prototype already terraces the light at 100 m bands (fifth look); this moves the step's edge and shadow
into the fragment shader so they stay one or two pixels wide at every zoom instead of a 250 m smear.

### 2.6 How the reference prints and web maps get their look

- **Blender relief (Daniel Huffman's method).** Cycles path tracing, about 200 samples for everyday use; the
  author's point is that the light "scatters … from one mountain to the next": peaks cast shadows and the shaded
  areas are lit by light bounced from nearby slopes, where a hillshade looks only at each pixel's facing [S],
  https://somethingaboutmaps.wordpress.com/2017/11/16/creating-shaded-relief-in-blender/. A GitHub gist following it
  recommends a 5× exaggeration [C], https://gist.github.com/jacobdadams/d00215d5424a82efc07bd26c5325560c.
- **Aerialod** (Ephtracy, the MagicaVoxel author): a free interactive path tracer for height maps up to 16384²,
  8- and 16-bit PNG, Windows only [C], https://www.cgchannel.com/2019/10/visualise-height-maps-in-3d-with-neat-free-tool-aerialod/.
- **What makes them crisp [E]:** full-resolution heights at about one texel a pixel, true cast shadows,
  sky light (which is ambient occlusion), one bounce, and a print-size render. Our per-pixel equivalent: §2.2 light,
  §2.4 occlusion, a baked shadow, and §2.1 data near one texel a pixel. The bounce can be faked by lifting the shade
  where the facing slope opposite is lit [E].
- **Web maps.** Mapbox shades each zoom from a DEM tile at that zoom's resolution, with separate highlight, shadow
  and accent colours (earlier note §2.4) [S]. The crispness comes from the data matching the screen, not from a
  filter [E]. Cesium, Google and Felt were not checked here.

### 2.7 Techniques at a glance [E]

| Technique | Bake or runtime | Cost | Data |
|---|---|---|---|
| Per-pixel light from height (§2.2) | runtime | < 0.5 ms at 4K | R16F, 13 MB at 250 m |
| Finer heights by zoom (§2.1) | offline pyramid, tiles loaded by zoom | load: a few tiles | zoom 10 ≈ 100 MB, 11 ≈ 400 MB as PNG |
| Normal tiles from 51 m data (§2.1) | offline | none at runtime | RG8, ≈ 1/2 of the height tiles |
| Erosion filter (§2.3) | runtime, or baked into normal tiles | 1–2 ms at 4K | none |
| Horizon occlusion (§2.4) | GPU bake per level or tile | 50–200 ms for the theatre | R8, 6.4 MB at 250 m |
| HBAO (§2.4) | runtime | 1–3 ms at 4K | none |
| Contour sheets (§2.5) | runtime | < 0.5 ms at 4K | the height texture |

## 3. Recommendation

All parameters are starting points [E], to tune by eye with the owner. The epic look first, then crispness.

### The epic look

1. **E1. Exaggeration by zoom, with masses not hills.** Keep the ×4 lift of the mountain masses (§1.5, CK3's
   stylised scale [S]) and let the overall vertical scale follow the zoom: the rise ×1.5 at the theatre view
   (dist ≥ 600 km), easing to ×1.0 at 30 km, on a smoothstep of log distance. Far, the ranges stand as walls; close,
   slopes stop looking crushed when the finer detail arrives. Keep the light's own milder lift (×1.5).
2. **E2. A camera that leans in, with haze instead of sky.** Tilt 20° off vertical at dist ≥ 600 km, rising to
   40° at 30 km (smoothstep of log distance). With fov 0.5 rad the top edge ray is then 54° off vertical: always
   ground, never sky [E]. Haze toward the paper colour by distance beyond the target: 0 at the target, about 35 % at
   the top edge, a cooler tint. Total War's own camera tilts much further (§1.1); 40° keeps the RTS view of
   `AGENTS.md` and the proposal's rejection of a horizon. The proposal's alternatives list rejects "a tilted 3D
   terrain" because of the sky; this keeps the sky out, but it is the owner's call.
3. **E3. Raking light on the masses, soft light in the valleys.** Cast shadows only from the generalised height
   (bands of 4 km and coarser, earlier note), sun at 30–35° from the north-west so the masses throw long shadows;
   the wide horizon occlusion (radius 2–8 km, §2.4) darkens valley floors softly, strength 0.25. Faint cloud
   shadows (CK3 [S]): a low-frequency noise of 20–40 km features at 10 % darkness drifting slowly. Moving shade
   is a moving thing, so it does not break the baked-light invariant [E]; offer it off by default if it distracts.
4. **E4. Frame it as a physical relief model.** The owner's reference is a model, so draw the plate: its sides as
   a 6–10 km thick band (in map units) showing the height profile in a darker tone, and a soft shadow of the plate on
   a table or paper beneath, 15–25 km offset away from the sun. This also answers the proposal's open question 3
   (the plate's edge). Water gets a darker rim at the shore (1–2 px) and a lighter shallow band.

### Crisp detail up close

5. **C1. Light per pixel, then finer heights.** Move the slope light and the Tanaka edges from the CPU bake to the
   fragment shader, reading the 250 m heights as R16F with a bicubic fetch (§2.2); keep the cast shadow and the
   occlusion baked. Then bake, in the theatre tool, Terrarium zoom 10 (≈ 102 m) for the whole theatre, about 100
   MB to fetch once, and from it a 512² tile pyramid of heights and normals; load zoom-10 tiles under about 200 km
   of camera distance and zoom-11 (≈ 51 m) tiles of the Austerlitz–Vienna and Ulm areas under about 80 km. The mesh
   stays a 1 km grid far, and a 256² grid per close tile (vertex every 50–100 m) near.
6. **C2. Contour sheets with lit edges and drop shadows, per pixel (§2.5).** Δ = 100 m sheets at close zoom
   (50 m under 40 km of distance if the finer data is loaded), 200 m far; lit edge 1.5 px; dark edge 1 px;
   shadow taps at 1 and 2 × the step's shadow length, darkening 0.25 of the sheet below; fade a Δ when its lines
   come closer than 6 px. Keep the 200 m dark contours above them, as now.
7. **C3. Synthesised erosion and fine occlusion.** Johansen's erosion filter (MPL 2.0) on the height in the fragment
   shader, for the normal only: 4 octaves, base wavelength 2 data cells (500 m on 250 m data, 100 m on 51 m),
   lacunarity 2, strength 0.3 of the local relief, gully weight 0.5, fading in from 4 px a cell to full at 12 px a
   cell, off on slopes under about 3°. A fine horizon occlusion (16 directions, 8 cells) baked per close tile on the
   GPU, strength 0.4, for the dark gullies of the reference. If 1–2 ms a frame is too much, bake the erosion into
   the normal tiles of C1 instead.

Measure each step's frame time on test machine A before keeping it (the Results report 1.8 ms still at
1600 × 900).

Open questions: whether 40° of tilt keeps the RTS read (or 30°); whether the exaggeration by zoom fights the owner's
"make mountains even bigger" at close zoom; the licences of Copernicus data, Gaea output and Eduard (earlier note)
for a sold game; whether the zoom-11 tiles belong in the repo or a fetched cache.
