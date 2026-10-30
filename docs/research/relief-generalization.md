---
status: research
last_reviewed: 2026-10-29
---

# Generalised relief for the campaign map

How do cartographers and game artists make simplified, generalised relief maps at small scale (a country, a
continent), and which of their techniques can we compute from a heightfield, at load or offline? The case is the
1805 theatre of the campaign map (`prototypes/campaign-map.html`, look in `docs/proposals/campaign-map.md`): a
3201 × 2001 grid of 250 m cells, about 800 × 500 km, lit as a relief print. The owner's verdict on the first bake:
too much detail (every alpine ridge and upland hill drawn), and a wish for a simpler, more highlighted look, whiter
paper, darker shadows with more contrast, and contour lines.

Date: 2026-10-29, by a research agent

Tags:

| Tag | Meaning |
|---|---|
| [S] | Sourced: the linked page states it. "(extract)" means the page blocked direct reading and the claim was read from a search engine's extract of that page. |
| [C] | Community or secondary source (forums, blogs, wikis, reviews). |
| [E] | Estimate or inference by this note's author, with the reasoning given. |
| [M] | Measured here. |

Costs are for one pass over the 6.4 million cells, in plain JavaScript on one core, and are all [E] unless marked:
none was measured. shadedrelief.com (Tom Patterson) refuses automated reading, so its claims here are (extract).

## Summary

- The literature agrees on the diagnosis: analytical shading of a fine DEM at small scale is "excessively detailed"
  and "the dense details obscure macro topography" (Leonowicz et al. 2010, quoting Patterson) [S]. The cure is to
  **generalise the heights before lighting them**, not to blur the shaded image.
- The cheap, controllable tools are frequency based: Patterson's resolution bumping (a blend of a coarse and a fine
  DEM) and Jenny's Laplacian-pyramid "terrain equalizer" (attenuate or amplify chosen size bands) [S]. Both run on
  our grid in well under a second.
- Plain smoothing rounds the ridges. The cartographic methods add a guard: curvature finds ridges and valleys and
  keeps or exaggerates them (Leonowicz et al. 2010; Jenny et al. 2011), or line integral convolution smooths along
  the slope lines only (Jenny 2021) [S].
- The "highlight" look is a set of Swiss design rules: flat ground one uniform light tone, aerial perspective
  (strong contrast high, weak contrast low), lit slopes warmed, shade cooled or darkened, few or no cast shadows
  at small scale [S].
- Contours at this scale are drawn from smoothed heights at a coarse interval; Mapbox uses 500 m at web zoom 9 [S],
  roughly our zoom [E]. Illuminated (Tanaka) contours already exist in the prototype.
- Games say little in public about how they simplify; what is documented is a separate "paper map" at far zoom
  (Crusader Kings III) and procedural heightmap processing in a terrain tool [S (extract)].
- Recommended order (details in the last section): (1) a band-weighted generalised height, (2) Swiss-style tone
  rules with aerial perspective, (3) a curvature accent on ridges and main valleys, (4) contours and faint height
  bands from a still smoother height, (5) offline tests of texture shading, LIC or Eduard against 1–4.

## Our scale

- The grid is about one screen pixel per cell: 800 km over 2,560–3,840 px is 210–310 m per pixel [E].
- In web-map terms that is about zoom 8: 156,543 m/px at zoom 0 on the equator, ÷ 2⁸, × cos 48° ≈ 409 m/px [E].
- On paper it is about 1:1 million to 1:3 million, depending on the screen width [E]. Leonowicz et al. worked at
  1:1,000,000 against a Swiss manual reference [S], so their numbers are close to ours.
- The noise the owner sees is the band from about 0.5 to 5 km (2–20 cells): side ridges, hills, gullies [E]. The
  forms that should read first are 20–300 km across: the Alps, the Bohemian massif, the Black Forest, the Danube
  valley [E].

## 1. Generalising the heights

### 1.1 Imhof's principle

Imhof's sequence, as quoted by Leonowicz et al. (2010) [S]: first gullies, niches, terraces and small slopes go;
"next, whole valleys and mountain ridges are eliminated, and what was a complex mountain group … becomes what
appears to be one mountain only"; narrow but important river valleys are stressed by light and tone; "at the
smallest scales, maps are composed almost exclusively of similar mountain chains, patterns of high mountain peaks
and flat plains". The same paper restates four rules for small-scale shading: accentuate the difference between
mountains and low relief, remove irrelevant small details, accentuate important chains, enhance main river valleys
[S]. Source: Leonowicz, Jenny, Hurni, "Automated Reduction of Visual Complexity in Small-Scale Relief Shading",
*Cartographica* 45(1), 64–74, 2010, https://mail.colororacle.org/berniejenny/pdf/2010_Leonowicz_Small_Scale_Relief_Shading.pdf.
Imhof's book itself (*Cartographic Relief Presentation*, 1982; ESRI Press reprint 2007) was not read here.

### 1.2 Resolution bumping (Patterson)

- What: merge a downsampled DEM with the full-resolution one, so the generalised forms carry "a suggestion" of
  detail [S (extract)]. Patterson's page says unmodified GTOPO30 gives "choppy" mountains, that the downsampled copy
  must be resized back to the original dimensions, and that bumping is done on the DEM, not as a touch-up of the
  shaded image [S (extract)]. Its example blends 1 km and 8 km data [S (extract)]; the 1:1 ratio is from a search
  extract and not confirmed.
  https://shadedrelief.com/bumping/bumping.html
- How, for us: h' = a · up(down(h, f)) + (1 − a) · G(h, σ), with f the coarse factor (an 8–16× downsample, 2–4 km
  cells), up() a bicubic resize back, G a light Gaussian, a ≈ 0.5–0.7 [E].
- Cost: a box-filtered downsample and a bicubic upsample, about 50–100 ms [E].
- Limit: a 2-band special case of the pyramid in 1.3; ridges are rounded where the coarse layer dominates [E].

### 1.3 Laplacian pyramid, the "terrain equalizer" (Jenny, Jenny, Hurni 2011)

- What: split the DEM into frequency bands with a Laplacian pyramid; the author attenuates or amplifies each band
  with sliders "imitating an audio equalizer"; ridge and valley lines are found by curvature and their bands are
  kept or emphasised with a second set of sliders [S]. Implemented in Terrain Equalizer (free, open source) [S].
  "Terrain Generalization with Multi-scale Pyramids Constrained by Curvature", *Cartography and Geographic
  Information Science* 38, 110–116, 2011, https://mail.colororacle.org/berniejenny/pdf/2011_Jenny_etal_Terrain_Generalization.pdf.
  Its successor tool, Pyramid Shader (Jenny, Preppernau, Eynard, Oregon State, MIT licence), generalises by removing
  "small high-frequency details and/or large landforms" and also draws Tanaka contours and hypsometric colours [S],
  https://terraincartography.colororacle.org/PyramidShader/index.html. Patterson's Prisma world relief (2019) lists
  "generalized in Pyramid Shader" as its first step [S], https://www.naturalearthdata.com/?p=5025.
- How: G₀ = h; G_{k+1} = down2(blur(G_k)); D_k = G_k − up2(G_{k+1}); h' = up(G_N) + Σ w_k · up(D_k).
  On our grid the bands are about 250 m, 500 m, 1, 2, 4, 8, 16 km and coarser [E].
- Cost: the whole pyramid is about 1.33 × the grid; build and rebuild about 100–200 ms [E]. The weights are
  uniforms if the bands are uploaded as textures, so a GPU version can tune them live [E].
- Why it fits: it does exactly what the owner asks (small forms down, big forms up), and the weights are a
  handful of numbers to tune by eye [E].

### 1.4 Curvature-based generalisation (Leonowicz, Jenny, Hurni 2010)

Steps, all [S] from the paper above:

1. Low-pass the DEM: a 5 × 5 mean filter applied 15 times to SRTM at 3 arc seconds (the paper gives "approximately
   60 m" cells), for 1:1,000,000. The result alone is "clearly over-generalized and is lacking sharp structures".
2. Curvature by the Evans–Young quadratic fit on 3 × 3 windows; a larger window, or smoothing first, finds larger
   forms. Ridges: maximum plus plan curvature; valleys: minimum curvature.
3. Two DEMs: the filtered one multiplied by a constant (ridges exaggerated) and the same deepened.
   h_mount = w_r · h_ex + (1 − w_r) · h_fl; h_low = w_v · h_deep + (1 − w_v) · h_fl.
4. A mask from slope, "extensively filtered" into compact mountain and lowland areas:
   h_g = w_s · h_mount + (1 − w_s) · h_low.
5. Shade with azimuth 300°, elevation 45°; then brighten flat areas to "a uniform bright grey tone" through a slope
   mask. No aerial perspective was used. Remaining faults named by the authors: lowlands still too detailed, low
   mountains too bright, ridges lack the faceted manual look.

Our translation [E]: 15 passes of a 5 × 5 mean is close to a Gaussian of σ ≈ √(15 × 2) ≈ 5.5 cells, about 330 m on
60 m cells. Our scale is 1–3× smaller, so σ ≈ 0.7–1.5 km, 3–6 of our cells; the owner's wish for strong
simplification argues for the top of that range. Cost: a few 3 × 3 passes and a few blurs, about 0.2–0.4 s.
The tool is Terrain Sculptor (Leonowicz, Jenny, Hurni, *Cartographic Perspectives* 67, 2010) [S],
https://cartographicperspectives.org/index.php/journal/article/view/cp67-leonowicz-et-al.

### 1.5 Line integral convolution (Jenny 2021)

- What: smooth each cell along its slope line (the flow line of the gradient field), which removes detail
  "without changing the position of terrain features" and keeps sharp ridges; Jenny adds iterations, Gaussian
  weights, ridge accentuation, slope smoothing and sharp transitions to flat ground [S (extract)]. Evaluated on the
  NASADEM of the Italian Alps against expert rankings [S (extract)]. Builds on Geisthövel's 2017 ETH thesis
  "Automatic Swiss style rock depiction" [S].
  Jenny, "Terrain generalization with line integral convolution", *CaGIS* 48(1), 78–92, 2021,
  doi:10.1080/15230406.2020.1833762 [S].
- An open implementation: IGN's dem_lic (E. Saint-Denis), Python. Steps [S]: a Gaussian blur modulated by
  curvature (gentle slopes blurred more, ridges and valleys kept); a slope threshold splits flat from steep, small
  flat patches removed; LIC weighted by relative altitude along the line, its length modulated by the flat/steep
  grid; the result blended with the original by blurred maximum curvature; iterate. Parameters: integration length,
  iterations, weight k, slope threshold, minimum flat area [S]. No default values were found.
  https://ignf.github.io/dem_lic/_downloads/bebbed8f27ffa0394fe179215e18c2f6/Methodological_Documentation_DEM_Generalization_with_Line_Integral_Convolution.pdf
- Cost [E]: an integration length of 10–20 cells, two directions, 3–5 iterations: 0.4–1.3 billion bilinear
  samples, roughly 5–20 s in JavaScript. An offline bake in a build tool, not at load.
- Fit [E]: the best published answer for mountains (sharp ridges, smooth flanks); more work than 1.3 and needs
  tuning on the Alps.

### 1.6 Neural shading: Eduard (Jenny et al. 2020)

- What: U-Net networks trained on Swiss manual relief shading and the matching DEMs produce shading that removes
  unnecessary detail, adjusts the light locally and emphasises large landforms; 18 experts rated the results high
  [S]. "Cartographic Relief Shading with Neural Networks", Jenny, Heitzler, Singh, Farmakis-Serebryakova, Liu,
  Hurni, IEEE VIS 2020 / TVCG, https://arxiv.org/abs/2010.01256.
- Level of detail is set either by networks trained at several cell sizes or by downsampling and filtering the input;
  the networks "retain important edges in down-sampled and filtered elevation models" [S]. AutoCarto 2022 abstract,
  https://cartogis.org/docs/autocarto/2022/docs/abstracts/Session3_Jenny_0293.pdf. App: https://eduard.earth [S].
- Known limit: less successful on shapes not found in Switzerland, such as volcanoes and mesas [S],
  https://research.monash.edu/en/projects/national-geographic-relief-shading/. Our Alps and Central European uplands
  are close to its training ground [E].
- Fit [E]: an offline bake that replaces our light term, so it loses our cast shadow and URL tuning; its licence for
  use in a sold game was not checked. Useful as a reference image to aim our own pipeline at.

### 1.7 Texture shading (Leland Brown)

- What: not a lighting model; a fractional Laplacian of the heights, isotropic and "scale-invariant", that gives a
  clearer hierarchy than hillshading and brings out networks of ridges and canyons [S],
  https://sipg.isr.tecnico.ulisboa.pt/texture-shading/.
- How [S, from rayshader's code]: FFT of the (padded) heights, multiply by |k|^α (the "detail" α, 0 to 1, default
  0.5), inverse FFT, rescale to [−1, 1], then (tanh(v · contrast + brightness) + 1) / 2.
  https://rdrr.io/cran/rayshader/src/R/texture_shade.R. GMT.jl's lelandshade defaults detail to 1.0, and its
  tutorial blends texture and hillshade 60/40 as one example [S (extract)].
- Cost [E]: a 4096 × 2048 complex FFT both ways, about 1–3 s in JavaScript; offline or on the GPU.
- Fit [E]: it shows drainage, which is detail; on raw heights it would add noise back. On the generalised height of
  1.3, at α ≈ 0.5 and a 25–35 % blend, it could give the valleys of the uplands a crisp edge.

### 1.8 Other filters

- Median and morphological filters: Patterson used a median filter on the shaded image to smooth local
  irregularities while keeping sharp ridges and valleys [S, as cited by Leonowicz et al.]. A grey-scale opening
  (erosion then dilation) removes peaks narrower than its window, a closing fills narrow valleys [E]; a 3–5 cell
  window on the generalised height is a cheap clean-up, 0.1–0.3 s [E].
- Edge-preserving smoothing (anisotropic diffusion, energy minimisation) is reviewed by Jenny et al. 2011 as able
  to keep breaks but computationally costly [S]. Not recommended first [E].
- Curvature for display rather than generalisation: Kennelly (2008), "Terrain maps displaying hill-shading with
  curvature", *Geomorphology* 102, 567–577, aims at large-scale detail [S],
  https://pure.psu.edu/en/publications/terrain-maps-displaying-hill-shading-with-curvature/. Wrong direction for us
  unless computed on a generalised height [E].
- Downsample then sharpen: Eduard's second method (downsample and filter, the network keeps edges) [S]; Patterson's
  web relief chart resamples the DEM per zoom level and applies a smoothing step [S (extract)],
  https://dcmpx.remotevs.com/com/shadedrelief/www/PL/web_relief/Web_relief_chart.pdf. A plain version for us: build the pyramid level at 1–2 km and shade it with
  an unsharp mask on the heights (h + s · (h − G(h))) [E].

## 2. Light, tone and the "highlight" look

### 2.1 Swiss design rules

- Common principles of manual shading: flat areas a uniform grey tone, no cast shadows, light adjusted locally,
  brightness of the main landforms modulated so that the main structures read [S], from arXiv 2010.01256 above.
  Leonowicz et al. brightened flat areas to "a uniform bright grey" through a slope mask [S].
- Aerial perspective: emphasise high terrain with strong luminance contrast, low terrain with weak contrast [S
  (extract)]. Jenny and Patterson, "Aerial perspective for shaded relief", *CaGIS* 48(1), 21–28, 2021,
  doi:10.1080/15230406.2020.1813052, Java code on Zenodo, doi:10.5281/zenodo.3947033 [S (extract)]. The paper's
  curves were not read; the code is the place to get them.
- Patterson: a "light mist of lowland gray" softens the base of slopes; dark lowlands make uplands pop on a
  stand-alone relief but make a printed map heavy once labels are added [S (extract)],
  https://www.shadedrelief.com/retro/enhancement.html. Highlands get more contrast than similar lowland forms, which
  helps readers judge relative height and avoid relief inversion [S (extract)],
  https://www.shadedrelief.com/retro/discussion.html.
- Vertical exaggeration rises as scale falls; Patterson's web chart gives 2.1 at zoom 9 and 6.5 at zoom 5 [S
  (extract)], https://dcmpx.remotevs.com/com/shadedrelief/www/PL/web_relief/Web_relief_chart.pdf. Interpolated to
  our zoom 8: about 3 [E]. Generalised heights have gentler slopes, so the light may need more [E].

### 2.2 Colour of light and shade

From Jenny and Hurni, "Swiss-Style Colour Relief Shading Modulated by Elevation and by Exposure to Illumination",
*The Cartographic Journal* 43(3), 198–207, 2006 [S],
https://mail.colororacle.org/berniejenny/pdf/2006_JennyHurni_SwissStyleShading.pdf:

- Becker (1889) drew sunlit slopes yellow-green, shaded ones dark green, and simulated aerial perspective by
  "gradually sharpening colour contrast towards the highest peaks".
- Imhof's photomechanical plates: a yellow plate, a negative of the shading, puts saturated yellow on slopes facing
  the light, with "flat areas … masked to avoid yellow colouration in even lowlands"; the last plates are copies of
  the shading at rising contrast that "simulate aerial perspective by strengthening shades and contrast at the
  highest peaks".
- Low flat ground in cold greenish or bluish colours for haze; shadowed slopes from green-purple to dark purple.
- Hypsometric ramps: Hauslaub's "higher is darker" (1864), Peucker's rising saturation, Imhof's "higher is brighter",
  from a light grey-blue-green to olive, yellow and finally white.

For our print [E]: the slope facing the light gets a warm ochre-to-white highlight masked off flat ground (Imhof's
yellow plate); the shade gets a darker, slightly cooler umber or violet-grey than the paper, which reads as
contrast without black. `docs/proposals/campaign-map.md` says "never black"; the owner now asks for darker shadows,
so the floor can go lower while staying a coloured ink.

### 2.3 Multi-direction and sky light

Esri's multidirectional hillshade (2014, "inspired by" Imhof) combines six light directions and improves low-relief
regions [S], https://www.esri.com/arcgis-blog/products/arcgis-living-atlas/mapping/introducing-esris-next-generation-hillshade.
Kennelly and Stewart's sky models light terrain from a whole sky (uniform, 2006; general CIE skies, 2014) and give
softer shadows and more detail than one point light [S],
https://pure.psu.edu/en/publications/general-sky-models-for-illuminating-terrains/. Both reveal more detail, the
opposite of our aim, unless computed on the generalised height; a sky term there would darken the big valleys
softly, like the prototype's exposure term [E].

### 2.4 Posterised tones

Mapbox's Terrain v2 tiles carry hillshade as polygons at six brightness thresholds: 94 and 90 % (highlights), 89, 78,
67, 56 % (faint to extreme shadow) [S], https://docs.mapbox.com/data/tilesets/reference/mapbox-terrain-v2.md. Its
style spec has separate highlight, shadow and accent colours and an exaggeration of 0.5 by default [S],
https://docs.mapbox.com/style-spec/reference/layers/#hillshade. A few soft-edged tone steps read as a print and hide
small variation inside each step [E]; a shader test, no bake.

## 3. Plains, height bands and contours

### 3.1 Keeping the plains readable

- Flat ground one light tone (2.1). Our current bake sets flat ground at 0.86 of the paper so lit slopes can rise
  above it; whiter paper and a flat tone of 0.94–0.97 leave a smaller but cleaner room for highlights [E].
- Hypsometric tints are, with shading, "a preferred and commonly used relief representation at small scales"
  (Leonowicz et al., citing Imhof) [S]. Cross-blended tints (Patterson and Jenny, *Cartographic Perspectives* 69,
  2011) vary the lowland colour by region so that tints are not read as climate or vegetation [S],
  https://cartographicperspectives.org/index.php/journal/article/view/cp69-patterson-jenny. For a paper print, a
  few faint value or warmth steps (2–4 %) at 500, 1,000 and 2,000 m on a smooth height separate the Danube
  valley, the Bavarian plateau and the Alps without drawing a line [E].

### 3.2 Contours at small scale

- Mapbox Terrain v2 intervals: 500 m at zoom 9, 200 m at 10, 100 m at 11, 50 m at 12, 20 m at 13, 10 m from 14;
  each line has an index value (1, 2, 5, 10) so a style can stress every 2nd or 5th line [S], same page as 2.4.
  At our zoom 8, 500 m is the matching step [E].
- Imhof is cited as requiring at least 1 mm between printed contours [C], https://search.emarefa.net/detail/BIM-1220671.
  Imhof's interval formula was not found; treat any formula attributed to him as unchecked.
- Generalised contours: Jenny et al. (AutoCarto 2022) derive contours from an intermediate generalised DEM rather
  than smoothing the lines [S]. The same idea with our pyramid: contour a smoother level than the shading [E].
- Illuminated contours (Tanaka): first applied in 1950 to a volcanic region of Kyushu; on a mid-grey ground, white
  lines on slopes facing a north-west light, black on those facing away; width varies with the cosine of the angle
  between the light's horizontal direction and the contour normal [S],
  https://esri.com/news/arcuser/0701/althillshade.html and the 1939 paper's J-STAGE abstract,
  https://www.jstage.jst.go.jp/article/grj1925/15/10/15_10_784/_article/-char/en. The prototype already draws them,
  fading lines where they crowd.
- Shader technique: threshold a per-pixel distance to the nearest contour (value over gradient) for lines of even
  screen width, and blend octaves to fade dense levels [S], Ricky Reusser,
  https://rreusser.github.io/notebooks/adaptive-contouring-in-fragment-shaders.
- With shading: the Swiss style combines shading, contours and colour modulated by height and orientation [S]
  (arXiv 2010.01256). On a busy relief, contours add lines, so they work best over the generalised shading with
  few, wide-spaced levels [E].

## 4. Games and interactive maps

Little is published on how games simplify terrain; most claims below are thin.

- Crusader Kings III: a "paper map" at far zoom, "for an easy overview and stylish screenshots"; the map stays flat
  [S (extract)], dev diary 2,
  https://forum.paradoxplaza.com/forum/threads/ck3-dev-diary-2-the-medieval-map.1274052/. Dev diary 177
  processes the heightmap in tiles through Gaea and adds a terrain map mode; the old heightmap was kept as the base
  because its shape matters to play [S (extract)],
  https://admin-forum.paradoxplaza.com/forum/developer-diary/dev-diary-177-a-fresh-coat-of-paint.1854817/.
- Humankind: the art aim was "not necessarily realistic, but … plausible enough while being stylized and
  coherent" [S (extract)]; players found "too many high-contrast details" and asked for clearer elevation [C],
  https://community.amplitude-studios.com/amplitudestudios/humankind/blogs/722-humankind-feature-focus-02-reimagining-terrain.
- Civilization VI: a separate 2D strategic view; Firaxis cites early maps of the Age of Exploration [C], reviews.
  Players report hills hard to tell apart [C].
- Total War, Imperator, Old World, Field of Glory Empires, Ultimate Admiral, Pioneers of Pagonia, Townscaper: no
  public source on their terrain simplification was found. Total War builds campaign maps from heightmaps in its
  Terry editor [S], https://wiki.totalwar.com/w/TWW_Assembly_Kit_Terry_Intro.
- Lesson [E]: games that read well at far zoom switch to a different, simpler drawing (a paper map, a 2D view)
  rather than shading the full-detail terrain from further away; the generalisation happens in the art, which for
  us means in the bake.

## 5. Recommendation

All parameters are starting points [E], to tune by eye on the Alps, the Bohemian massif, the Black Forest and the
Danube valley side by side. Every step feeds the existing bake (`prototypes/campaign-map.html`, bakeRelief) and can
be exposed as URL parameters like the current ones.

1. **Band-weighted generalised height (1.3, with 1.2 as its 2-band shortcut).** A Gaussian pyramid by 2× steps
   (bands at 0.25, 0.5, 1, 2, 4, 8, 16 km and coarser). Weights w = 0, 0.1, 0.35, 0.7, 1.0, 1.15, 1.3 (fine to
   coarse), 1.3 for the rest. Light, cast shadow and exposure all read this height. Exaggeration for the light ×3,
   up to ×4 if the generalised slopes look flat. The exposure term becomes the 2–8 km bands (D₃ + D₄) of the same
   pyramid instead of two box means. Cost 0.1–0.2 s at load. Quick variant first: h' = 0.6 · up(down(h, 16)) +
   0.4 · G(h, σ = 3 cells).
2. **Swiss tone rules (2.1, 2.2).** Paper whiter; flat ground fixed at 0.95 of it; lit slopes rise to white with
   a warm ochre tint masked off flat ground (slope above about 3°); the shade floor down to about 0.35 of the paper
   in a dark, slightly cool umber. Aerial perspective: contrast × mix(0.55, 1.25, smoothstep(300 m, 2,500 m,
   h_generalised)). Cast shadows only from the bands of 4 km and coarser, so only massifs throw them. A 4–5 step
   posterised variant (2.4) is a one-line shader test.
3. **Ridge and valley accent (1.4).** Curvature (Evans–Young) on the 1–2 km level; ridges exaggerated × 1.3 where
   a mountain mask is set (slope blurred over about 20 km, above about 4°), valleys deepened × 1.3 in the lowlands
   so the Danube, Rhine and Main read. Cost 0.2–0.4 s at load. Stop here if 1–2 already read well.
4. **Contours and bands from a smoother height (3.1, 3.2).** Contour the 4 km level: lines every 500 m, an index
   at 1,000 and 2,000 m, intermediate 250 m lines only where their screen spacing exceeds about 6 px; keep the
   Tanaka light. Faint value steps at 500, 1,000 and 2,000 m on the same height.
5. **Offline comparisons (1.5, 1.6, 1.7).** Bake once, outside the page: LIC with IGN's dem_lic (3–5 iterations),
   an Eduard shading at a 1 km cell size, and a texture shading of the step 1 height at α 0.5 blended 25–35 %. Use
   them as targets for tuning 1–4; adopt one only if it is clearly better and its licence allows.

Open questions: whether cast shadows stay at all (Swiss rule: none at small scale; the owner's references: long
ones); how dark "darker shadows" may go against the proposal's "never black"; whether the strategic zoom-out to
Europe (about 4,000 km) needs another pyramid level and weight set.
