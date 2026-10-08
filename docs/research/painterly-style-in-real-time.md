---
status: research
last_reviewed: 2026-10-08
---

# Painterly style in real time: what is doable for the browser RTS

Research date: 2026-10-08. Synthesised from five research notes: film techniques, real-time games, stroke stability, stylized crowds, and browser rendering plus asset pipeline.

## Verdict

A painterly "living miniature" look is doable in a browser RTS on an RTX 3060 laptop, provided it is built the way decision 0001 already intends: in materials, baked data and effects, not in a full-screen paint filter. The pieces that create most of the look are cheap and have shipped in real time. These are a hue-shifted shading ramp (Team Fortress 2), brush texture that keeps a constant size on screen while sticking to surfaces (Age of Sail, 90 fps in VR on a GTX 1080), edges broken by noise attached to geometry (also Age of Sail), and smoke drawn as opaque blobs with hard painted edges (Sea of Thieves, built to run on integrated laptop GPUs). The three known faults have published fixes. Grain swimming on soldiers is fixed by sampling the grain in the soldier's rest pose, which Babylon's animation system already provides at no extra cost. The seams are fixed by blending two or three projections instead of switching between them. The shimmer is fixed by blending two grain scales chosen from the pixel footprint. What cannot be copied are the film's per-shot artist tools; the studios never published their algorithms anyway, and *Puss in Boots* is documented mainly through interviews. At gameplay zoom a soldier is 10–30 px tall, which is too small to carry visible brushwork. The painting therefore has to live in the ground, trees, buildings, smoke and light, while soldiers stay clean and readable. The largest unknown is performance: nobody has published a benchmark of 2k–8k animated figures plus stylised shaders in WebGL2. A benchmark scene on the minimum-spec laptop is the first step, before any further art work.

## How to read this report

The five notes used slightly different evidence labels. They are normalised here:

- **[P] primary**: a paper, slides, talk transcript or abstract, official documentation, source code, or a crew member quoted directly.
- **[S] secondary**: press or a third party paraphrasing a primary source.
- **[C] community**: forum posts, fan analysis, reverse engineering or vendor marketing. Unverified.
- **[I] inference**: reasoning or arithmetic by the note authors or by this report, not a sourced fact.

Where only a talk abstract was available, the claim is marked [P, abstract]. Cost figures come from the hardware named in each source. **None of them were measured on WebGL2 or on an RTX 3060 laptop.**

---

## (a) What makes the target style, and what the films actually did

### The target

The owner's target images are oil-painting-like scenes of Austerlitz. They show dense brushwork in the ground, bare winter trees, patches of snow, musket smoke, a golden low sun with cool shadows, and warm haze. This is closer to a 19th-century battle painting than to *Puss in Boots: The Last Wish*. The film is the reference for *how* a 3D production made painting-like images, not for the palette or subject. [I]

### What *Puss in Boots: The Last Wish* documented

Documentation is thin. It consists of a SIGGRAPH 2023 production-session abstract, a SIGGRAPH entry by VFX supervisor Mark Edwards, and interviews. The session slides are not public, and no paper or algorithm was published. [P, abstract and interviews]

Documented facts:

- **Brief and placement of effort.** Production designer Nate Wragg describes a "fairy tale painting" look made with digital-painting tools, not oil or acrylic. Characters keep their detail; objects at the frame edges and in the distance are made "more impressionistic". He warns of a "Goldilocks zone": too little detail looks "undercooked or cheap". [P/S, Wragg via AWN]
- **Same pipeline, look pushed upstream.** The pipeline and software were the same as on the first film. The look was put into assets so that "lighting could just light" (Edwards). The SIGGRAPH abstract says the work was done "mostly within existing workflows". [P]
- **Stamp map.** Brush-stroke textures were projected with orientation from a point cloud and "plugged into things like the shading normal", giving "brush stroke breakup as lights would shade". Strokes changed the lighting, not just the colour. [P, Edwards]
- **"CEO" edge-breakup tool.** A point cloud around each object sampled its shading and could "lift off" the surface to break clean CG silhouettes. Artists tuned it per camera. [P/S]
- **Graphic rims.** "Cheated rim lights with bold color choices" were used so characters read against backgrounds. [S, SIGGRAPH blog; rims also listed in the abstract]
- **Painted effects.** Simulations were converted to meshes and sculpted to cut negative space (Edwards' "scalping effect"), volumes were stamp-mapped, hand-drawn marks were laid over effects, and Gaussian glow was replaced by a textured glow. [S, VFX Voice]
- **Lens.** Depth of field used "stylized bokeh elements". Camera and lens effects were "illustrated". [S]
- **Stepped animation.** Action runs on 2s, 4s and sparser. Emotional beats stay on 1s. [P, director Joel Crawford and Edwards]
- The team first pushed everything too far, then pulled Puss himself back to "soft and fuzzy" while the environment stayed pushed. [P, Edwards]

Interpretation, not documented:

- **No source documents a cool-shadow, warm-light hue-shifted ramp as a *Puss* pipeline feature.** The current 3-band ramp is the project's own interpretation. Its closest published precedent is Team Fortress 2 (see (b)). [I]
- No source says "looser brushwork instead of blur" in those words. It is a fair reading of the stylised bokeh plus the quotes about an impressionistic periphery. [I]

### What the comparison films did

- **Bolt (Disney, 2008)** [P, SIGGRAPH 2009 talk]. Painterliness comes from **massing** (editing detail into larger shapes) and **edge quality**, not from visible strokes: "Reduce a painting to the size of a postage stamp, it still looks like a painting." Techniques: painting LOD (detail layers stripped by distance, light or centre of interest), "raypainting" (painted-opacity cards around objects to break silhouettes), painterly normals, and roughened shadow edges.
- **Age of Sail (Google Spotlight Stories, 2019)** [P, Expressive 2019 / GVC 2020]. Shipped in real time, at 90 fps in VR on a GTX 1080 (about 800k triangles) and 57–60 fps on a Pixel 3 or iPhone 8. It used lit and shadow texture sets per asset; shadow shapes blurred and re-thresholded into rounded forms; **MetaTexture** (4 power-of-two scales of one texture blended so its on-screen size stays constant); and **Edge Breakup** (a screen-space warp driven by a noise field rendered on slightly inflated geometry). Characters were animated on twos and threes even at 90 fps. This is the most directly transferable reference.
- **Wish (Disney, 2023)** [P, SIGGRAPH 2024]. Screen-space textures anchored to 3D points, so paper and brush texture keeps a constant size on screen and still follows deforming characters. It was applied to "virtually every element". There was no rendered motion blur or depth of field. Atmosphere was painted as "broad washes on textured cards" instead of volumes. This is an offline renderer, and no real-time cost is given.
- **Spider-Verse (Sony, 2018/2023)** [P/S]. Lens blur was replaced by print misregistration. Linework comes from artist-drawn and ML-assisted tools that are not real-time. The lead says edge detection in compositing "always falls short because this is not how artists draw".
- **TMNT: Mutant Mayhem (2023)** [P]. Stylisation was set per light ("as if each light were painted one after another"). Soft defocus and glow were "banished". Depth instead simplified texture. It banned "unjustified rim lights", the opposite of *Puss*.
- **The Bad Guys 2 (2025)** [P]. Effects "carved dissipation shapes instead of opacity fades". Film grain was added back to break clean gradients.
- **Arcane (Fortiche)**. Primary documentation is limited to FMX 2025 session titles and a studio recap saying Mari was central to the hand-painted look. Claims that lighting is painted into the textures are fan analysis [C]. The best-supported reading is that Arcane gets painterliness mostly in textures, while *Puss* gets it in shading and rendering. [I]
- **Meier, "Painterly Rendering for Animation" (Disney, 1996)** [P]. Brush particles stuck to surfaces, which solved the "shower door" effect (strokes fixed to the screen while surfaces slide under them). Principle: "larger, smoother brush strokes tend to recede in depth while small, textured strokes depict foreground detail."

### Patterns across the films [I]

1. **Every studio removed lens blur.** Depth is shown by simplifying detail, not by blurring. For a top-down RTS this argues against tilt-shift blur, which would smear formations at the frame edges. *Tunic* used tilt-shift for a miniature read [S], so the evidence is split; see the open questions in (d).
2. **Strokes change the lighting, not just the colour** (*Puss* stamp maps, Bolt painterly normals).
3. **Texture that stays a constant size on screen but is anchored to geometry** is the shared answer to both shower-door and swimming (Meier 1996, MetaTexture 2019, Wish 2024). The current world-space grain changes on-screen size with zoom, which is the problem these papers solve.
4. **Edges are broken by fields attached to geometry, not by image filters** (*Puss* CEO, Bolt raypainting, Age of Sail warp).
5. **Detail and cleanliness go where the eye goes.** Characters stay clean. For this game the "characters" are formations.

---

## (b) Technique catalogue: real-time cost and evidence

Costs are as reported on the named hardware, or [I] where estimated. A texture tap is one texture sample.

### Shading

| Technique | What it does | Evidence | Real-time cost | Pitfalls |
|---|---|---|---|---|
| Warped ramp with cool shadow, reddish terminator, up-masked rim (TF2) | Artist-painted 1D RGB ramp over half-Lambert. Shadows go cool, not black. A narrow, saturated, reddened terminator band. The rim is masked by `n·up` so it reads as light from above | [P] Mitchell, Francke & Eng, NPAR 2007 | One 1D texture fetch per light plus an ambient cube; very cheap [I] | Validates the current ramp. Suggested changes: make the middle band a narrow, saturated warm terminator, and mask the rim with `n·up` |
| Art-directed thresholds (Guilty Gear Xrd) | Vertex colour offsets the shading threshold (painted occlusion). Light vector set per character. Hand-edited normals | [P] Motomura, GDC 2015 transcript | Near zero | For instanced soldiers it is only possible if baked once into the shared mesh [I] |
| Lit and shadow texture sets | Two hand-painted palettes per asset, blended by a shadow shape | [P] Age of Sail | Cheap per pixel; doubles texture memory for those assets | Painting effort |
| Painterly shadow shapes | Blur and re-threshold the shadow mask into rounded shapes; "inner glow" lightens shadow interiors | [P] Age of Sail; [S] Bolt | One half-res blur; free if baked | Terrain light is baked, so do this offline in the bake [I] |
| Shadow tint that varies by position | A 3D volume or LUT tints the shadow band by location | [P abstract + S] Hi-Fi RUSH (CGWORLD) | One small 3D fetch | Gives cool valleys and warmer ridges across 1.5 km [I] |
| Colour-shifting AO | AO shifts hue instead of only darkening | [P] Honkai Impact 3rd slides (no ms given) | Half-res AO pass | No WebGL2 timing |
| Per-light stylisation | Each light gets its own treatment | [P] TMNT / Mikros | Cheap with ≤4 lights | Fit: muzzle flashes and fire with a warm treatment distinct from the sun [I] |
| Skip filmic tone mapping | ACES desaturates and flattens a painted palette | [P] Genshin skipped ACES as "not suited to the style" | Free | None |
| Hand-painted albedo with light painted in | Form and light authored in texture | Arcane [C mostly]; TF2 textures from watercolour scans [P]; Dordogne real watercolour sets [S] | Zero at runtime | Conflicts with a moving sun or time of day |

### Brush texture and its stability

| Technique | What it solves | Evidence | Cost | Pitfalls |
|---|---|---|---|---|
| World-space projection (current) | Marks fixed to static geometry | [P] Wyman & McGuire 2017: stable for static geometry, "fails on dynamic geometry" | 1 fetch per plane | Moving soldiers slide through it (the observed swimming) |
| Rest-pose (bind-pose) object space | Swimming on moving and skinned objects | [P] Bénard 2009; Wyman 2017; Disney Wish uses rest-pose anchors | ~0 extra in Babylon (see note below) | Mild stretch where the mesh deforms; small at 10–30 px [I] |
| Hard dominant-axis switch (current) | Cheapest projection | Mechanism from [P] Quilez, biplanar article | 1 fetch | Seams at the switch. If plain `texture()` is used rather than `textureGrad()`, seam pixels also get the wrong mip [I] |
| Biplanar | Triplanar look with 2 fetches, no axis-swap jump | [P] Quilez | 2 fetches plus sort; must use `textureGrad` with derivatives taken before axis selection | A singularity remains at (±1,±1,±1) directions |
| Sharpened triplanar | Soft seams | [P] Golus | 3 fetches; `pow(n,4)` weights, normalised | Raw weights over-brighten corners |
| Two-octave log2 cross-fade | Constant grain size in pixels across zoom and across the depth of a tilted view | [P] Bénard 2009 (4 octaves, ~+10%: 70→65 fps on an 8800 GT); Wyman 2017; Dither3D | 2× the fetches of one octave | Linear blending loses contrast; structured patterns distort more than noise-like ones [P, Bénard] |
| MetaTexture | On-screen-constant texture attached through UVs | [P] Age of Sail | 4 fetches (8 with skew compensation) | Needs clean UVs. Fragment derivatives jump at triangle edges, so the paper computes them per vertex |
| Variance / histogram-preserving blend | Restores contrast lost by blending octaves or tiles | [P] Heitz & Neyret 2018; Burley 2019 | ALU, plus a LUT for non-Gaussian inputs | The Age of Sail factor and Heitz-Neyret's normalisation differ; check which form is needed [I] |
| `fwidth`-sharpened threshold | Band edges about one pixel crisp, without shimmer | [P] Golus; Dither3D derivative-scaled contrast | A few ALU | MSAA does nothing for shading thresholds, so this is the only anti-aliasing they get [I] |
| Anti-tiling (IQ index variation / hex tiling / Heitz-Neyret) | Visible repetition of the ~5.5 m grain across 1–1.5 km | [P] Quilez; Mikkelsen JCGT 2022; Heitz & Neyret | 2 fetches + 1 lookup / 3 `textureGrad` / 3 + LUT | Multiplies by the number of projections; can be applied only to the dominant plane [I] |
| Oriented strokes in the normal (stamp-map analogue) | Shading breaks along brush shapes | [P] *Puss*, Bolt | 1–3 taps [I] | Invisible on 10–30 px soldiers; spend it on terrain, trees and buildings [I] |
| Dynamic screen-space textures (Wish) | Anchored, camera-facing texture that tracks deformation | [P] Burley 2024 | Up to 16 samples, few in practice; offline | Reference design, not real-time |
| NPR Gabor noise | Flat, coherent procedural noise | [P] Bénard 2010 | 8–50 fps at 4k–50k triangles on a GTX 260; needs geometry shaders | Not WebGL2-friendly [I] |

**Babylon note** [P, source code; verified in the notes against `bakedVertexAnimation.fx` and `vertexAnimationBaker.ts`]: Babylon's "baked vertex animation" stores bone matrices per frame, not vertex positions. The `position` attribute stays the bind pose. A varying of raw `position` plus a per-instance seed therefore gives swim-free grain coordinates with no extra fetch. The frame index is floored, so with a 12 fps bake the pattern is perfectly still between pose steps.

### Edges and silhouettes

| Technique | Evidence | Cost | Pitfalls |
|---|---|---|---|
| Age of Sail Edge Breakup (geometry-anchored warp) | [P] shipped at 90 fps | One extra geometry pass into an RG buffer plus a full-screen warp | "Heat ripple" over busy, high-contrast backgrounds. The film note says mask units out; the stroke note says crowds work with distance falloff. Default: mask units out [I] |
| Painted-opacity skirts / flanges (Bolt raypainting analogue) | [P] Bolt | Cheap geometry, alpha-tested | Alpha-test aliasing at oblique angles |
| Stroke-shaped alpha masks or "megasplat" quads on crowns, hedges and smoke | [P] Dreams (28.2M splats in 4.38 ms on PS4, compute); [P abstract] 11-11 Memories Retold | Instanced quads; overdraw | Dreams' stochastic alpha relied on TAA and "breaks down horribly" under it. 11-11 flickered on overly detailed meshes |
| Hashed alpha in object space, log-scale | [P] Wyman & McGuire 2017 | +0.1–0.3 ms at 1080p | Noisy without TAA [C, three.js forum]; grain is already part of the look, so dithered edges may be acceptable [I] |
| Grazing-angle crown threshold (current) | Mechanism [P] Bénard STAR | Cheap | World-space grain slides on swaying trees; static trees are fine [I] |
| Image-space edges from depth, normal and ID | [P] Wish; Honkai uses them for scenery only | One full-screen pass | Outlining 10–30 px figures would dominate them; restrict to buildings and terrain features [I] |
| Per-figure ink outline (inverted hull) | [P] Guilty Gear Xrd (built for close-ups) | Doubles vertex work; Babylon outlines are whole-host only | On a figure 4–10 px wide, 25–35% of pixels become line, and close-order ranks merge [I]. Avoid |

### Full-screen painterly filters

- No shipped game was found with a documented Kuwahara pass. The one blog that cites *11-11* as a "paint filter" is contradicted by the developer, who describes a particle system. [C vs P]
- Real-time anisotropic Kuwahara is about 10–30 taps per pixel. It is acceptable at half resolution on terrain only, or free if baked offline into terrain textures. [I]
- *The Bad Guys* world talk cites Kuwahara in its references. Whether it was used is inference. [I]
- Media Molecule's Alex Evans: "I have a strong dislike of 'painterly post fx' especially 2d ones." [P]

This supports keeping full-screen filters off the unit layer.

### Effects, smoke and atmosphere

| Technique | Evidence | Cost | Pitfalls |
|---|---|---|---|
| Opaque mesh clouds, quarter-res blur, distortion, alpha-threshold edges (Sea of Thieves) | [P] SIGGRAPH 2018; built for integrated laptop GPUs | Quarter-res offscreen at 1080p ≈ 0.5 MP of fill [I]; not measured | Best published match for powder-smoke banks. Must stay readable over formations |
| Hand-painted flipbooks with alpha erosion | [C] standard practice; erosion-mask pitfall documented by Simon Schreibt | Cheap | The erosion mask must match the volume implied by the normal map, or the volume collapses during the fade |
| Carved dissipation instead of opacity fade | [P] Bad Guys 2 | Free | None; recommended default [I] |
| Opaque or masked effect meshes instead of translucency | [S] Season | Cheaper than blending | None found |
| Broad washes on textured cards for atmosphere | [P] Wish | Cheap | Suits haze and lingering smoke seen from above [I] |
| Volumetric fog | [P] Genshin < 1 ms on PS4 | < 1 ms (PS4) | Not WebGL2. Fog-as-wash is the cheaper fit [I] |
| Textured glow instead of Gaussian | [S] *Puss* | Cheap | None |
| Effects ranked below units in value and saturation | [S] Riot VFX guide: "visual impact should match gameplay impact" | Free | Discipline, not code |

Napoleonic smoke is part of the genre's identity. Napoleon: Total War tied powder haze to its fog setting, players kept musket smoke while removing other particles for frame rate, and fans called later Total War smoke a regression. [S/C]

### Crowds

| Technique | Evidence | Cost | Fit |
|---|---|---|---|
| Instancing + bone-matrix texture (Babylon VAT) | [P] GPU Gems 3: 9,547 characters at ~34 fps on an 8800 GTX, 160 vs 59,726 draws | 4 fetches per bone influence per vertex. VAT memory < 1 MB at 12 fps half-float [I] | Core. Cut to 1–2 influences for tiny figures [I] |
| Per-vertex VAT | [P] World War Z: 5k+ zombies, ~400 tris, 8-bit offsets, 1 draw per container | 1–2 fetches per vertex; ~1.3 MB per mesh variant [I] | Good for flags and plumes |
| Mesh LOD | [P] WWZ LOD4 ~250 tris per zombie; AC Unity 10,000 crowd NPCs with 120 hi-res models [P abstract] | — | 2 LODs suffice for a short zoom range [I] |
| Impostors | [P] Tecchia 2002; Geopostors 2005 | Memory scales with animation frames | Low value: figures are already ~150–400 tris, and impostors freeze lighting and rim [I] |
| Shared-skeleton CPU skinning | [C] Babylon forum: 20K instances at 60 fps on a 3080 Ti, all in the same pose | — | Fallback per battalion only |
| Thin instances, one host per battalion per LOD | [P] Babylon docs: culling is all-or-nothing per host | ~100–250 crowd draws for 40 battalions [I] | Core |

### Anti-aliasing

- **4× MSAA.** Available in WebGL2. Babylon's `DefaultRenderingPipeline.samples` defaults to 1 and must be set to 4. Without it, post-process targets lose MSAA. A 4× RGBA8 + D24S8 target at 1080p is about 66 MB. [P Babylon docs and forum; I for size]
- **Alpha-to-coverage.** Works only on an MSAA target. In Babylon 9.30.0 it is engine-level (`engine.setAlphaToCoverage`) with **no per-material switch**, so it must be toggled around foliage draws. [P, verified in package source] Coverage-preserving mips must be baked offline. [P Golus/Unity; I for KTX2]
- **TAA.** Babylon's `TAARenderingPipeline` converges over about 8 frames. **Babylon VAT writes no limb velocity** (geometry pass reads only the instance matrix and real-skeleton bones) [I from source]. Every 12 fps pose step is therefore a history mismatch. Expect soft, crawling soldiers and blurred hard shading steps. [I]
- **Thin props.** Humus's "phone-wire AA" clamps thin geometry to ≥1 px and lowers alpha by the same ratio. It applies directly to muskets, bayonets, sabres and flagpoles. [P]

### Browser costs

- **Texture rate is not the limit.** An RTX 3060 laptop has 120 TMUs, about 170 G texels/s peak. 4 samples per pixel at 1080p/60 with 3× overdraw needs about 1.5 G texels/s, under 1% of peak. The real limits are cache misses from badly mipmapped noise, loss of early-Z on alpha-tested foliage, MSAA and post-process bandwidth, and JS draw submission. [I from spec sheets]
- **Resolution matters more than sample count.** A `devicePixelRatio` of 1.5–2 grows pixel count 1.8–4×. Keep a render-scale setting as the main GPU quality knob. [I]
- **Shader variants cause hitches.** Use `KHR_parallel_shader_compile` and a small fixed set of materials (unit, terrain, foliage, building) driven by uniforms, not defines. [P MDN, PlayCanvas]
- **Material route.** Use a StandardMaterial with a `MaterialPluginBase` plugin (GLSL and WGSL paths), or a ShaderMaterial written in both languages. Avoid the PBR base and avoid CustomMaterial, which is GLSL-only. Plugin injection points are not guaranteed stable across versions. [P docs]
- **Masks must not use ETC1S.** ETC1S codebook clustering smears uncorrelated noise. Use UASTC or uncompressed RGBA8; a 512² mask with mips is about 1.4 MB. Leave threshold margin, because even BC7/UASTC shifts values slightly. [P Basis README; I]
- **WebGPU** is a CPU-overhead win (snapshot rendering, render bundles), not a fragment-shading win: "GPU performance roughly the same". [P Babylon docs] Keep WebGL2 as the baseline. Firefox on Linux and Intel Macs is still Nightly-only. [P gpuweb wiki, 2026-10-02]
- **Timing.** GPU timing in WebGL depends on `EXT_disjoint_timer_query`, which many browsers disable. Plan to profile with Spector.js and native profilers (Nsight, PIX on ANGLE/D3D11). [P Babylon docs]

---

## (c) Recommended stack per surface

These are recommendations from the evidence, so they are [I] throughout unless a source is named. The organising rule, taken from *Puss*, Bolt, 11-11 and the RTS readability sources, is this: **paint the world, keep the units clean.**

### Terrain

1. Keep world-space grain; it is correct for static geometry. [P Wyman]
2. Replace the dominant-axis switch with Y-planar plus a slope-gated second plane, or with biplanar. Use `textureGrad` with derivatives taken before axis selection.
3. Replace the two fixed scales (about 5.5 m and 21 m) with a two-octave log2 cross-fade driven by pixel footprint (`length(dFdx(p))`) or view depth. Two octaves should be enough for a short zoom range; Bénard's four were set for unbounded zoom. If one large value variation must stay fixed in the world, keep it as a separate, non-blended term.
4. Renormalise the blended grain's variance before it offsets band edges, and make the threshold `fwidth`-aware.
5. Add anti-tiling to the fine octave, starting with the cheapest variant (IQ's 2-fetch index variation).
6. Bake into the terrain light: rounded shadow shapes (Age of Sail), roughened penumbrae (Bolt), cool shadow tint, and optionally a shadow-tint volume that varies by position (Hi-Fi RUSH).
7. Snow patches and ground brushwork are albedo and mask work. No source covers painted snow specifically, so this is a gap.
8. **Pre-painting the static terrain once per map** is supported by several notes: the film note recommends baking strokes, rounded shadows and optionally Kuwahara into the terrain bake; Meier strokes are rated "offline-bake yes"; Dordogne preferred painted sets to watercolour shaders; Ghost of Tsushima swaps far vegetation for authored textures. It would move most terrain stylisation out of the frame budget and suits a fixed sun. Its costs are texture memory and resolution at the closest zoom, and baked light cannot follow a moving sun. That proposal is under separate review and is not decided here. Steps 1–5 are needed for whatever runtime grain remains in either case.
9. Keep terrain under the battle area mid-value and low-chroma, so units own the value extremes. [I, from AoE IV's "colours more differentiated against the environment" S]

### Foliage and trees

1. Crowns: normals spherized or transferred from a proxy sphere, plus the grain-broken band edge. This is standard practice in tools and community sources, but no shipped-title postmortem documents it. [C]
2. Silhouette breakup: stroke-shaped alpha masks on crown cards (Dreams megasplat / 11-11 idea), or object-space hashed alpha so swaying trees do not slide through world-space grain.
3. Alpha-to-coverage on 4× MSAA, toggled at engine level around foliage draws, with coverage-preserving mips baked offline.
4. Overdraw control: discard on alpha before doing ramp or grain work, use tight card geometry, and use a depth pre-pass if average overdraw at worst zoom exceeds 2–3×. Under WebGPU non-compatibility mode, `needDepthPrePass` rebuilds render bundles every frame. [P docs]
5. Far woods: Ghost of Tsushima-style switch to painted terrain colour instead of instanced cards. [P abstract + C summary]
6. **Bare winter trees** are central to the target images, and none of the notes covers them. Bare branches are thin geometry, so phone-wire-style ≥1 px clamping and alpha-to-coverage likely apply, and Bolt-style painted-opacity skirts could stand in for twig masses. This is untested inference and an open question.

### Buildings

1. Biplanar or object-space grain with oriented strokes feeding the normal before the ramp (stamp-map analogue). The 1–3 extra taps are worth spending here, because buildings are large on screen.
2. Optional lit and shadow texture sets on hero buildings (Age of Sail).
3. Painted-opacity skirts or Edge Breakup warp on silhouettes, with units masked out.
4. Image-space outlines from depth and normal are acceptable here if wanted.
5. Painting LOD: lerp from a loose base layer to a detail layer by zoom and by distance from the screen centre, following Wragg's impressionistic periphery and Bolt's painting LOD.

### Soldiers and horses

1. **Readability first.** Exaggerate headgear and muskets 1.2–1.5× (AoE IV, SC2). Distinguish arms by silhouette (shako, bearskin, cavalry mass). Put value contrast on the upper body, which is what a 50–70° camera sees (TF2 readability rule). Team identity is carried by the value and hue of the coat mass, with only ±5–10% per-figure value jitter. Use 4 per-instance mask channels: coat, facings, trousers, headgear. [S sources; I for numbers]
2. **Shading.** Use the 3-band ramp with a narrow warm terminator and a warm rim masked to the upper or back edge with a hard step. Do not draw per-figure ink outlines. Optionally bake a threshold-bias vertex channel into the shared mesh (Guilty Gear Xrd).
3. **Grain.** Sample it from bind-pose `position` plus a per-instance seed. Use one coarse octave sized to the figure, clamped by derivatives, and fade it to flat below a pixel-size threshold. At 10–30 px, grain finer than about 2–4 px per feature will alias. [I]
4. **Animation.** Use the 12 fps stepped VAT. Use **fractional** per-battalion phase offsets: integer offsets desynchronise poses but still make all 8,000 figures change pose on the same 1/12 s tick, a global strobe every 5th frame at 60 Hz [I from Babylon shader source]. Drilled lines share a phase per battalion or company. Skirmishers, routing troops and melee get random phase and ±10% speed. Flags and plumes can hold on 3s or 4s (the Spider-Verse "Hobie" precedent). Camera, projectiles, smoke and UI stay at display rate. Clip transitions cut on step boundaries, because Babylon VAT has no blending; author transition clips instead.
5. **Geometry.** Use about 400 / 150 tris for LOD0 / LOD1, 1–2 bone influences, and one thin-instance host per battalion per LOD. Pad bounds by one soldier height, because thin-instance bounds do not follow VAT.
6. **Formation-level identity.** Use one battalion outline or footprint decal (selection, facing, formation shape) and one oversized flag per battalion, never scaled below about 12 px. This replaces per-figure selection rings.
7. **Shadows.** Use a blob or decal shadow per battalion rather than shadow maps of 8k casters. Babylon VAT casters are supported in 9.x if real shadows are wanted. [P source]
8. **Horses** are not covered separately by any note. The same rules apply, with larger silhouettes. [I]

### Water

The evidence is thin. Sea of Thieves drives artist-painted foam textures from a simulation mask (wave peaks, depth intersection) and never shows the raw simulation. [P] Age of Sail's MetaTexture was designed for large surfaces such as its ocean. [P] For rivers and ponds on a battlefield, the recommendation is a flat, ramp-shaded surface with a painted-texture layer anchored to world space, using the same two-octave grain. Shoreline masks can come from the terrain bake. This is untested. [I]

### Smoke and effects

1. **Powder-smoke banks:** instanced low-poly puff meshes shaded through the same 3-band ramp, rendered to a quarter-res target, blurred, edge-distorted, then composited with a cut-out alpha threshold and a ramp-coloured edge (Sea of Thieves). [P technique, I adaptation]
2. **Muzzle flashes and the first frames of a discharge:** hand-painted flipbooks with alpha erosion.
3. **All effects die by eroding their shape, not by fading opacity.** [P Bad Guys 2]
4. **Readability:** smoke and effects sit below units in value and saturation (Riot). Fade smoke locally over a selected unit.
5. **Optional:** per-light warm treatment for muzzle-flash and fire light (TMNT); textured glow instead of Gaussian bloom (*Puss*).
6. Make smoke density a quality tier, as Napoleon: Total War did, but never remove it entirely. [S]

### Atmosphere and haze

1. With no sky and a high camera, haze is a function of distance and height. Use broad painted washes on textured cards or a depth-based wash tinted warm (Wish), rather than volumetric fog. [P technique, I adaptation]
2. The golden low sun and cool shadows come from the ramp: warm lit band, saturated warm terminator, cool shadow band. A shadow-tint volume can vary the cool band by location. Do not use ACES (Genshin).
3. Use depth cueing by simplification, not blur. Lower grain contrast and band contrast toward the far edge and the frame edges (Bolt painting LOD, Wragg periphery, TMNT depth simplification).
4. Film grain or under-sampled noise to break gradients is acceptable only if it is anchored to geometry or very subtle. Otherwise it reads as dirt on the screen. [P Bad Guys 2, TMNT; I for the caveat]

### Anti-aliasing

1. Use **4× MSAA** on the scene target (`samples = 4` on the pipeline; check that MSAA is actually active on every target drawn into).
2. Use **alpha-to-coverage** on foliage and thin cutouts, with coverage-preserving mips.
3. Anti-alias **ramp bands and grain thresholds in the shader** with `fwidth` or `smoothstep`, because MSAA does not touch them.
4. Use a **phone-wire clamp** for muskets, bayonets, flagpoles and lances.
5. **Do not let TAA own the soldier layer.** If TAA is wanted for terrain or foliage, composite units after it or mask them out. Babylon VAT writes no limb velocity, and 12 fps steps reset history.
6. FXAA is optional, and only if band edges still crawl. SMAA would be custom work in Babylon.

---

## (d) Risks and open questions, ranked

Ranking is by likely impact on shipping the look at the target frame rate. It is a judgement. [I]

1. **No performance evidence for this exact workload.** No published benchmark exists for 2k–8k VAT thin instances with stylised shaders in WebGL2, on any GPU, and nothing was measured on an RTX 3060 laptop. The closest data points are 20K shared-pose instances at 60 fps on a 3080 Ti [C] and a hobby project with 800 units [C]. The draw-call target (≤ 300–600 including shadows) and the GPU split (≤ 12 ms: terrain 2–3, units 2–4, foliage 2–3, shadows 1–2, post ≤ 1) are estimates. Laptop GPUs vary from 60 to 115 W; plan for 60–80 W.
2. **Painterly texture versus unit readability.** Grain, edge warp, smoke and haze all compete with 10–30 px figures. Hi-Fi RUSH found that always-on halftone and hatching annoyed players and switched them to per-element. [P/S] The game's value depends on reading formations, so this is the main art-direction risk.
3. **Foliage overdraw.** Alpha-tested foliage defeats early-Z and runs the full painterly shader once per layer. Woods across 1.5 km are where the GPU budget is most likely to break. [P mechanism, I for this map]
4. **The anti-aliasing combination is unproven.** MSAA plus alpha-to-coverage plus `fwidth` thresholds, with TAA excluded from units, is assembled from separate sources. Hashed or stochastic alpha generally assumes TAA. Babylon's lack of a per-material A2C switch adds integration work.
5. **Grain fixes are documented but not yet combined.** Rest-pose grain, the two-octave cross-fade, variance renormalisation and `fwidth` thresholds each have primary evidence. Their combination on this camera, and their cost in WebGL2, are untested. Linear octave blending distorts structured strokes more than noise-like grain, so oriented-stroke textures may show artifacts that plain grain does not. [P Bénard]
6. **Smoke cost and legibility.** Large translucent banks are an overdraw risk. The Sea of Thieves path reduces that with opaque meshes at quarter resolution, but it is unmeasured here. Smoke that hides units is a gameplay problem as well as a visual one.
7. **Target mismatch.** *Puss*'s algorithms are unpublished, and the owner's target is an oil-painting battle scene rather than a fairy-tale illustration. Bare winter trees, snow and water have no direct evidence in the notes. The look will have to be found by iteration against the target images, not by copying a documented recipe.
8. **Edge Breakup "heat ripple"** over busy terrain. The paper's proposed fix is multi-layer warping, at higher cost. [P]
9. **Stepped animation comfort.** Insomniac shipped its stepped Spider-Verse suit as an option that can be turned off. [S] Some players may read 12 fps figures as lag, especially on selected or nearby units.
10. **Baked light and a fixed sun.** Baked terrain light, painted albedo and the pre-painted terrain option all assume a fixed sun. Time of day or weather changes would conflict with them.
11. **Babylon churn.** 9.x patch releases have fixed WebGPU correctness bugs, and plugin injection points can change between versions. Pin a version and regression-test. [P]
12. **AI asset pipeline (adjacent).** Generated meshes need retopology onto a canonical soldier mesh before they can share VAT and thin instances. Hunyuan3D 2.1's licence excludes the EU, UK and South Korea. Free-tier outputs on Tripo are not commercially usable. Steam requires disclosure of AI-generated assets that players see. Flags, insignia and text must be hand-made. Gen-AI placeholders shipping at launch cost Clair Obscur two Indie Game Awards. [P terms, S press]

### Open questions

- **Tilt-shift or not?** The films argue against lens blur and for depth by simplification. *Tunic* used tilt-shift for its miniature read. A/B test both against formation legibility at the frame edges.
- **Should soldiers carry any grain at all at gameplay zoom,** or only at the closest zoom (40–70 px)?
- **Pre-painted terrain versus runtime grain:** this is decided in the separate review. The prototype below can supply measurements for it.
- **Bare winter trees:** branch geometry, cards or painted terrain at distance?
- **Is the WebGL2 path CPU-bound on draw submission** at 8k figures (the notes' expectation), or GPU-bound on fill? The answer decides whether WebGPU is urgent.
- **Unverified items** in the notes: Babylon support for XUASTC/XUBC7; whether Tripo albedo is shading-free; Golus's original alpha-to-coverage post (read via secondary copies).

---

## (e) Prototype plan with acceptance tests

Order follows the risk ranking: measure first, then fix known faults, then add look. All numeric thresholds below are proposed by this report [I]. They are starting points to agree on, not sourced figures. Test hardware throughout: the minimum-spec RTX 3060 laptop, on AC and on battery, in Chrome on Windows (ANGLE/D3D11), at 1080p, with render scale 1.0.

### P0. Benchmark scene (before any further art)

Build: a 1.5 km terrain with the current terrain shader. 8,000 soldiers at about 300 tris, using 1, 2 and 4 bone influences in turn, in about 40 thin-instance battalion hosts with 2 LODs. Woods at the densest planned coverage. MSAA at 1× and 4×. The camera at worst-case zoom-out and the closest zoom.

Acceptance:
- p95 frame time ≤ 16.7 ms at worst-case zoom with 4× MSAA, and GPU time ≤ 12 ms, measured with native profilers.
- Total draw calls ≤ 600, including shadow passes.
- No frame over 50 ms after the first 10 s of load (shader compile hitches).
- Record which limit is hit first (JS submission, vertex, fill or foliage overdraw), and its cost per element.

### P1. Terrain grain fixes

Build: Y-planar plus slope-gated biplanar with `textureGrad`, a two-octave log2 cross-fade, variance renormalisation, `fwidth` thresholds, and IQ index-variation anti-tiling on the fine octave.

Acceptance:
- **Scale stability.** Over a scripted zoom sweep, the dominant grain wavelength, measured in pixels by autocorrelation on captured frames, stays within ±25% across the whole zoom range and from near to far edge of the tilted view.
- **No seams.** On a test hill with slopes of 0–90° at 15° steps, no visible line at projection transitions at any zoom, and no 1 px mip lines.
- **No shimmer.** A slow pan at mid zoom shows no frame-to-frame band-edge flicker above a set pixel-difference threshold in static regions.
- **No tiling.** At maximum zoom-out, 3 of 3 reviewers cannot point to a repeat in a blind look.
- **Cost.** ≤ +1 ms GPU over the P0 terrain.

### P2. Soldier grain and stepping

Build: bind-pose `position` grain with a per-instance seed, one coarse octave, fade to flat below a pixel-size threshold, fractional phase offsets per battalion, and fully random phase for skirmishers.

Acceptance:
- **No swimming.** For a marching figure, the grain pattern in the figure's own frame is identical between two renders within the same pose step. Pixel difference is zero apart from translation.
- **No global strobe.** Across 8,000 figures, the share of figures changing pose on any single render frame stays ≤ 30%.
- Grain contributes no visible aliasing at 10 px figure height (reviewer A/B against grain off).

### P3. Readability gate

Build: formations in line, column and square for three armies, on painted terrain, with smoke on.

Acceptance:
- In a blind test with at least 5 people, at gameplay zoom and with 2 s exposures, identification of army, arm (infantry, cavalry, artillery), formation and facing is no worse than a flat-shaded baseline of the same scene. The proposed bar is ≥ 90% correct on each.
- A greyscale capture still separates every battalion from the terrain under it.

### P4. Smoke

Build: Sea of Thieves-style puff meshes to a quarter-res target, threshold edges, erosion dissipation, and local fade over the selection. Twenty battalions firing at once.

Acceptance: ≤ 1.5 ms GPU at worst-case density; the P3 readability bar still holds with smoke on; no opacity fades anywhere in the effect.

### P5. Foliage and edges

Build: spherized crowns, stroke-shaped alpha masks, alpha-to-coverage on 4× MSAA with coverage-preserving mips, a depth pre-pass if needed, Edge Breakup on environment layers only, and a first attempt at bare winter trees.

Acceptance: average foliage overdraw ≤ 2–3× at worst zoom; crowns do not thin out with distance (coverage within ±10% between nearest and farthest zoom); no heat ripple visible behind units, because units are masked; total foliage GPU time ≤ 3 ms.

### P6. Anti-aliasing A/B

Compare 4× MSAA + A2C + `fwidth` with the same plus TAA on terrain only, and with TAA on everything.

Acceptance: soldiers are judged crisper under the non-TAA options by the majority of reviewers; no crawling on band edges in a slow pan.

### P7. Look match

Build: the warm, saturated terminator; the `n·up` rim; a cool shadow-tint volume; a warm depth wash; snow and ground brushwork in albedo; periphery simplification. Optionally, a tilt-shift variant for A/B.

Acceptance: the owner compares the result side by side with the Austerlitz target images and signs off on palette, light and haze. All P0–P6 budgets still hold. Measurements from P1 and P7 (cost of runtime grain, memory and resolution of baked terrain) are handed to the separate pre-painted-terrain review.

---

## (f) Sources

### Films

- SIGGRAPH 2023 production session, "Visual Style of Puss In Boots: The Last Wish" (abstract): https://history.siggraph.org/?p=131616
- SIGGRAPH 2023 entry, Mark Edwards: https://history.siggraph.org/?p=130410
- AWN, Mark Edwards interview: https://awn.com/animationworld/mark-edwards-talks-visual-development-puss-boots-last-wish
- AWN, Nate Wragg interview: https://www.awn.com/animationworld/puss-boots-last-wish-returns-its-fairy-tale-illustration-roots
- VFX Voice, 2023-03-28: https://vfxvoice.com/wishing-upon-a-star-for-puss-in-boots-the-last-wish/
- SIGGRAPH blog, 2024-02-19: https://blog.siggraph.org/?p=17519
- TheWrap, 2023-01-04: https://www.thewrap.com/puss-in-boots-the-last-wish-behind-the-scenes-video/
- Cartoon Brew, Joel Crawford: https://www.cartoonbrew.com/feature-film/puss-in-boots-joel-crawford-inbtwn-224324.html
- SYFY Wire: https://www.syfy.com/syfy-wire/how-puss-in-boots-the-last-wish-upped-its-animation-game
- fxguide on Spider-Verse: https://www.fxguide.com/?p=244678 and https://www.fxguide.com/?p=246246
- befores & afters, Across the Spider-Verse linework: https://beforesandafters.com/2024/01/10/giving-spider-man-across-the-spider-verse-that-crucial-hand-made-quality/
- Foundry Colorway, Across the Spider-Verse comp: https://colorway.foundry.com/insights/film-tv/across-the-spider-verse-nuke-mari-katana
- "Repainting the Spider-Verse", SIGGRAPH 2023: https://history.siggraph.org/?p=129567
- Fortiche at FMX 2025: https://forticheprod.com/blog/projects-events/fortiche-rocks-fmx-2025-with-arcane-season-2-deep-dive/
- Meier 1996, "Painterly Rendering for Animation": https://www.cs.princeton.edu/courses/archive/fall00/cs597b/papers/meier96.pdf
- Bolt, "Applying Painterly Concepts in a CG Film": https://media.disneyanimation.com/uploads/production/publication_asset/64/asset/painterlyCgConcepts.pdf
- AWN VFXWorld, Bolt: https://www.awn.com/vfxworld/digital-eye-how-bolt-got-painterly
- Paperman / Meander: https://disneyanimation.com/technology/meander
- Curtis et al., Age of Sail, Expressive 2019: https://diglib.eg.org/handle/10.2312/exp20191071 ; journal PDF: https://storage.googleapis.com/gweb-research2023-media/pubtools/5311.pdf
- Burley, Green & Teece, Dynamic Screen Space Textures (Wish), 2024: https://disneyanimation.com/publications/dynamic-screen-space-textures-for-coherent-stylization/
- befores & afters, Wish: https://beforesandafters.com/2023/11/22/its-actually-what-an-illustrator-wouldve-done/
- The Bad Guys 2: https://beforesandafters.com/how-the-bad-guys-2-filmmakers-approached-stylization-and-combining-2d-and-3d-fx/
- TMNT: Mutant Mayhem (Mikros): https://beforesandafters.com/2023/09/07/we-wanted-to-imply-teenage-imperfection-everywhere/

### Games

- Mitchell, Francke & Eng, "Illustrative Rendering in Team Fortress 2", NPAR 2007: https://www.cs.princeton.edu/courses/archive/fall07/cos597B/papers/mitchell-team-fortress.pdf
- Motomura, Guilty Gear Xrd, GDC 2015 transcript: https://www.ggxrd.com/Motomura_Junya_GuiltyGearXrd.pdf
- Honkai Impact 3rd, Unite Tokyo 2018: https://docswell.com/s/UnityJapan/KWLQP5-unite-tokyo-20183rd
- Genshin Impact, Unity Dojo 2021: https://docswell.com/s/UnityJapan/KWRPQ5-210617-unity-dojo20211mihoyozhenzhongyi
- Hi-Fi RUSH, GDC 2024: https://gdcvault.com/play/1034330/3D-Toon-Rendering-in-Hi ; CGWORLD: https://cgworld.jp/article/202306-hifirush02.html
- Dreams, SIGGRAPH 2015 Advances (Evans): https://advances.realtimerendering.com/s2015/AlexEvans_SIGGRAPH-2015-sml.pdf
- 11-11 Memories Retold, GDC 2019: https://gdcvault.com/play/1026102/A-Living-Painting-The-Rendering
- Sea of Thieves, SIGGRAPH 2018 talks: https://history.siggraph.org/wp-content/uploads/2022/09/2018-Talks-Ang_The-Technical-Art-of-Sea-of-Thieves.pdf
- Ghost of Tsushima grass, GDC 2021: https://gdcvault.com/play/1027214/Advanced-Graphics-Summit-Procedural-Grass
- Age of Empires IV (MobileSyrup): https://mobilesyrup.com/2021/04/10/age-of-empires-iv-relic-developer-interview/ ; PCGamesN: https://www.pcgamesn.com/age-of-empires-4/graphics
- Dordogne Q&A: https://gamedeveloper.com/design/q-a-hand-painting-the-watercolor-world-of-i-dordogne-i-
- Riot, "Clarity in League": https://www.leagueoflegends.com/en-gb/news/dev/clarity-in-league/
- StarCraft II art panel: https://www.gamespot.com/articles/blizzard-talks-starcraft-ii-art-design/1100-6171176/
- Napoleon: Total War tech check (GameStar): https://www.gamestar.de/artikel/technik-check-napoleon-total-war-empire-engine-optimiert,2312680,seite2.html
- Simon Schreibt on stylised VFX in RIME: https://simonschreibt.de/gat/stylized-vfx-in-rime/
- Tunic interview: https://www.thexboxhub.com/the-tunic-interview-an-exclusive-chat-with-polymath-designer-andrew-shouldice/

### Stroke stability and texturing

- Bénard, Bousseau & Thollot, temporal coherence STAR, CGF 2011: https://inria.hal.science/inria-00636210
- Bénard et al., Dynamic Solid Textures, I3D 2009: https://artis.inrialpes.fr/Publications/2009/BBT09
- Bénard et al., NPR Gabor noise, EGSR 2010: https://artis.inrialpes.fr/Publications/2010/BLVLDT10/
- Praun et al., Tonal Art Maps, 2001: https://hhoppe.com/proj/hatching/
- Kalnins et al., WYSIWYG NPR, 2002: https://gfx.cs.princeton.edu/proj/wnpr/wnpr-final.pdf
- Wyman & McGuire, Hashed Alpha Testing, I3D 2017: https://research.nvidia.com/labs/rtr/publication/wyman2017hashed
- Rune Skovbo Johansen, Dither3D: https://runevision.com/tech/dither3d ; code: https://github.com/runevision/Dither3D
- Inigo Quilez, biplanar mapping: https://iquilezles.org/articles/biplanar/ ; texture repetition: https://iquilezles.org/articles/texturerepetition/ ; filterable procedurals: https://iquilezles.org/articles/filterableprocedurals/
- Ben Golus, triplanar normal mapping: https://bgolus.medium.com/normal-mapping-for-a-triplanar-shader-10bf39dca05a ; alpha-to-coverage: https://bgolus.medium.com/anti-aliased-alpha-test-the-esoteric-alpha-to-coverage-8b177335ae4f
- Heitz & Neyret 2018: https://doi.org/10.1145/3233304 ; Unity implementation: https://unity.com/blog/engine-platform/procedural-stochastic-texturing-in-unity
- Burley 2019, JCGT: https://jcgt.org/published/0008/04/02/
- Mikkelsen 2022, hex-tiling, JCGT: https://jcgt.org/published/0011/03/05/
- Glanville, texture bombing, GPU Gems ch. 20: https://developer.nvidia.com/gpugems/gpugems/part-iii-materials/chapter-20-texture-bombing

### Crowds

- GPU Gems 3 ch. 2, Animated Crowd Rendering: https://developer.nvidia.com/gpugems/GPUGems3/gpugems3_ch02.html
- Krupkin & Sladkov, World War Z, GDC 2019: https://gpuopen.com/gdc-presentations/2019/gdc-2019-agtd4-high-zombie-throughput-in-modern-graphics.pdf
- Assassin's Creed Unity crowds, GDC 2015: https://gdcvault.com/play/1022141/Massive-Crowd-on-Assassin-s
- Unreal Animation Budget Allocator: https://dev.epicgames.com/documentation/unreal-engine/animation-budget-allocator-in-unreal-engine
- Tecchia et al., image-based crowd rendering, 2002: https://www.cs.ucy.ac.cy/~yiorgos/publications/crowd_CG&A02_draft.pdf
- Dobbyn et al., Geopostors, 2005: https://ics-websites.science.uu.nl/docs/vakken/mcrws/papers_new/Dobbyn%20et%20al%20-%202005%20-%20Geopostors.pdf
- Humus, phone-wire AA: https://www.humus.name/index.php?page=3D&ID=89
- Spider-Verse "Hobie" frame rates: https://beforesandafters.com/2023/06/17/the-across-the-spider-verse-spider-punk-character-hobie-was-animated-with-different-frame-rates-for-different-parts-of-his-own-body-and-accessories/
- Miles Morales stepped suit (Engadget): https://engadget.com/spider-man-miles-morales-into-the-spider-verse-suit-151055035.html

### Babylon.js, WebGL2 and WebGPU

- Baked texture animations: https://doc.babylonjs.com/features/featuresDeepDive/animation/baked_texture_animations
- `bakedVertexAnimation.fx`: https://github.com/BabylonJS/Babylon.js/blob/master/packages/dev/core/src/Shaders/ShadersInclude/bakedVertexAnimation.fx
- `vertexAnimationBaker.ts`: https://raw.githubusercontent.com/BabylonJS/Babylon.js/master/packages/dev/core/src/BakedVertexAnimation/vertexAnimationBaker.ts
- `geometry.vertex.fx` (velocity): https://raw.githubusercontent.com/BabylonJS/Babylon.js/master/packages/dev/core/src/Shaders/geometry.vertex.fx
- Thin instances: https://doc.babylonjs.com/features/featuresDeepDive/mesh/copies/thinInstances
- TAA rendering pipeline: https://doc.babylonjs.com/features/featuresDeepDive/postProcesses/TAARenderingPipeline
- Optimising a scene: https://doc.babylonjs.com/features/featuresDeepDive/scene/optimize_your_scene
- Material plugins: https://doc.babylonjs.com/features/featuresDeepDive/materials/using/materialPlugins
- ShaderMaterial: https://doc.babylonjs.com/features/featuresDeepDive/materials/shaders/shaderMaterial
- WGSL support: https://doc.babylonjs.com/setup/support/webGPU/webGPUWGSL
- KTX2 compression: https://doc.babylonjs.com/features/featuresDeepDive/materials/using/ktx2Compression
- Snapshot rendering: https://doc.babylonjs.com/setup/support/webGPU/webGPUOptimization/webGPUSnapshotRendering
- Non-compatibility mode: https://doc.babylonjs.com/setup/support/webGPU/webGPUOptimization/webGPUNonCompatibilityMode
- Babylon forum, baked animation performance: https://forum.babylonjs.com/t/baked-animation-performance/32023
- MDN WebGL best practices: https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices
- PlayCanvas optimisation guidelines: https://developer.playcanvas.com/user-manual/optimization/guidelines/
- Basis Universal: https://github.com/BinomialLLC/basis_universal
- gpuweb implementation status: https://github.com/gpuweb/gpuweb/wiki/Implementation-Status
- RTX 3060 Laptop specifications (Notebookcheck): https://www.notebookcheck.com/NVIDIA-GeForce-RTX-3060-Mobile-Grafikkarte-Benchmarks-und-Spezifikationen.497447.0.html

### Asset pipeline and licensing (adjacent)

- Meshy AI texturing: https://docs.meshy.ai/en/webapp/guides/3d-model/ai-texturing ; terms: https://www.meshy.ai/terms-of-use
- Tripo terms: https://developers.tripo3d.ai/en/terms
- Hunyuan3D 2.1 licence: https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1/blob/main/LICENSE
- US Copyright Office, Part 2 report summary: https://blogs.loc.gov/copyright/2025/02/inside-the-copyright-offices-report-copyright-and-artificial-intelligence-part-2-copyrightability/
- Clair Obscur and the Indie Game Awards: https://stevivor.com/news/clair-obscur-loses-two-indie-game-awards-due-to-ai-usage/
