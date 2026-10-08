---
status: research
last_reviewed: 2026-10-08
---

# Adversarial review: Pre-painted terrain

Reviewed: `rts/docs/proposals/prepainted-terrain.md` (draft, 2026-10-08).

Checked against:
- `engine-design.md` §2, §4–§8;
- `art-bible.md`;
- decisions 0001, 0003, 0005, 0010, 0011, 0012;
- `staff-map/implementation.md`;
- the terrain shader in `prototypes/painted-cinematic.html`, which is the same paint function as the other `painted-*` files;
- the three Austerlitz stills at full resolution (1672 × 941);
- the research notes in this folder.

Review date: 2026-10-08. Every number I computed is shown, so it can be checked. Where a number is my own estimate, it is marked **[est]**.

## Verdict

**Conditional.** The proposal bundles two separate ideas.

The first is a **painted macro bake**: per-map colour shapes, painted light and shadow pools, snow patches, field stripes and furrows, and AO, all baked into world space. This is worth pursuing. It is close to what the light map already does, its cost is well understood, and baked terrain light under runtime characters is ordinary practice. It should be built under the conditions in finding 3: bake painted colour and light separately, and keep the 3-band ramp at runtime.

The second is a **stroke-splatting painter** run over that bake (step 3, plus the Kuwahara pass in step 4). This is not yet worth weeks of work. The arithmetic in finding 1 shows that, at 0.26 m per texel, its strokes come out larger than the soldiers. The fine brushwork in the stills is about 0.1 m wide, which is below one texel, so at the zoom the stills are framed at, the bake does not carry it. That brushwork falls to the runtime detail layer, which the proposal treats as secondary. The kill criterion as written cannot detect this (finding 2).

The order should be:
1. Build the runtime detail layer first; every option needs it.
2. Add the macro bake.
3. Fund the stroke painter only if an ablation shows it beats the macro bake plus the detail layer.

The proposal's own "short answer" is "cheap at runtime, affordable in memory, doable". Of those three, only "affordable in memory" was checked, and it holds only on the shipped-KTX2 path. "Cheap at runtime" is true but irrelevant (finding 6). "Doable" has not been shown for the part that matters, which is the look.

---

## Findings

### 1. The baked strokes are bigger than the soldiers; the stills' brushwork sits below one texel. **Severe**

**Claim challenged.** "The bake carries the painting at gameplay zoom; a runtime detail layer carries close zoom." Also the bake-time estimate of "~0.5–1 M instanced brush quads".

**Evidence.**
- **Stroke size implied by the stroke count.** The detail area is 1.8 km × 1.8 km = 3.24 km² = 3.24 × 10⁶ m². Covering it once with 1 M strokes gives **3.2 m² per stroke**, for example 3.6 m × 0.9 m. With 0.5 M strokes it is 6.5 m² each. Coverage needs overlap, so real strokes are larger still.
- **On screen at the proposal's own densities:**
  - gameplay zoom (5.6–17 px/m): a 3.6 m stroke is 20–60 px long;
  - closest zoom (22–39 px/m): it is 80–140 px long.
  - The soldiers at those zooms are 10–30 px and 40–70 px tall. **Every baked stroke is larger than a figure.**
- **The stills.** I measured the Pratzen still at full resolution (the column at lower left):
  - figures are about 45 px tall;
  - file spacing in the ranks is about 15–18 px; at roughly 0.6 m per man **[est]**, that is about 25–30 px per ground metre;
  - the dry-brush ground marks are 2–4 px wide and 10–30 px long, which is about **0.1 m × 0.4–1 m**.
  - A 0.26 m texel is 7–8 px there, so **the brushwork in the stills is finer than one texel of the bake.**
- **What it would take to bake still-like marks.** Marks of 0.1 × 0.6 m at single coverage need 3.24 × 10⁶ / 0.06 ≈ **54 M strokes**, at roughly 0.05 m per texel. That is the 1.3-billion-texel case the proposal itself rules out.
- **So at the stills' zoom, the look comes entirely from the detail layer.** That layer is a tiling, grayscale, value-only mask, which is the same kind of thing the proposal criticises in today's terrain ("reads as a regular texture, not as strokes placed by a painter"). What the bake contributes at that zoom is colour shapes at the metre scale: light pools, snow patches, furrow bands and field edges. Those are valuable, but they are shapes, not strokes, and the base fill (step 1) plus the light pass (step 2) already produce them without a stroke painter.

**Suggested change.**
- Add the stroke-size arithmetic to "The numbers".
- State plainly that the bake carries **shapes at 1 m and above**, and that the brushwork in the stills is the detail layer's job at every zoom from gameplay inward.
- Make the stroke painter (step 3) an optional stage behind its own ablation (finding 2).
- Move the detail layer out of "Layers at runtime, item 2" and into the main work item, with its own design (finding 9).

### 2. The kill criterion compares against the wrong baseline, at the wrong zoom, with no judge. **Severe**

**Claim challenged.** "If the patch does not beat today's runtime terrain clearly at gameplay zoom in the side by side, drop the bake and invest in the runtime detail layer instead."

**Evidence.**
- **Confounded comparison.** The test patch includes the new brush-detail layer (MetaTexture-style, 2–4 scales) and the bake. Today's terrain has neither. If the patch wins, nobody will know whether the bake, the stroke painter or the detail layer won it. The fallback the criterion names is "the runtime detail layer", so the fair baseline is **runtime terrain plus the same detail layer**.
- **Wrong zoom.** The proposal sets the closest zoom to the stills, and the stills are the reference. Testing only at gameplay zoom tests where the bake is strongest and skips where finding 1 says it adds nothing.
- **"Clearly" has no judge and no measure.** The stills are AI concept images ("an imagined gameplay screenshot … not an actual engine capture", per the `.prompt.txt`). Side-by-side against them rewards whatever looks most like generated imagery, not what reads best in play.
- **A 300 × 300 m patch at 0.26 m is 1154².** That hides the costs that only appear at 6923²: bake time, peak memory, SwiftShader behaviour and load time.

**Suggested change.** Rewrite the validation plan as an ablation on the same patch, all with the same detail layer:
- (a) runtime ramp plus detail layer;
- (b) macro bake (fill and light only) plus detail layer;
- (c) (b) plus the stroke painter;
- (d) (c) plus Kuwahara.

Judge at three zooms (far 3D, gameplay, closest), at yaw −45°, 0 and +45°. Use a written checklist taken from the art bible: strokes follow form, painted shadow shapes, class edges read, no visible tiling, no shimmer. Use at least two people who do not know which image is which.

Kill criteria:
- the stroke painter only if (c) does not beat (b) at gameplay zoom;
- the whole bake only if (b) does not beat (a).

Separately, before any of this, run a **full-size synthetic bake** of 1 M random quads into a 6923² target, plus one Kuwahara pass, on the dev Mac, in headless SwiftShader and on a 3060. It takes an afternoon and settles bake time and peak memory.

### 3. Baking lit colour breaks every dynamic shadow, the staff-map transition and the season slider. **Severe**

**Claim challenged.** "Painted macro … colour with light, shadow, AO and painted shapes already in it" and "a cloud-shadow multiply". Also "Two lighting paths … must agree on sun direction and ramp".

**Evidence.**
- **Clouds are shaded differently today.** In `paint()` (painted-cinematic.html, around line 333) the cloud term is subtracted from the light value *before* the ramp (`l-=cloud(wp)*0.40+…`). So cloud shadow pushes the ground into the **cool, more saturated shadow band**. A multiply on baked RGB only darkens. That breaks the art bible's pillar 3 ("Darkness alone is not light") and §4 ("Shadows are painted shapes in the cool shadow colour … not dark grey overlays").
- **Other dynamic shadows have the same problem.** Unit contact shadows and per-formation shadows (`engine-design.md` §7: "Units without shadows look pasted on"), smoke shadows and scorch decals all land on a ground whose shadow colour is frozen in RGB. A multiply cannot turn a warm lit ochre into the art bible's teal shadow. These are the shadows meant to fight the pasted-on look, so the problem lands exactly where finding 4 is weakest.
- **Staff-map transition** (`staff-map/implementation.md` §2):
  - "Relief rises" is a vertex scale on height, and normals blend toward up.
  - "Trees and houses sprout" is staggered over t = 0.30–0.80.
  - Today `lm.r` (sun visibility) is a separate scalar, so shadows can be faded with the stage. Baked into RGB, hill shading and tree cast shadows stay at full strength on flattened ground under trees that have not appeared yet.
- **Seasons.** The art bible §4b makes `season` a continuous value that "every material reads", and the prototype has a season slider. The staff-map bake was designed so that "changing season never re-bakes". A colour bake reverses that design choice and multiplies variants (finding 11).

**Suggested change.**
- Bake **unlit painted colour plus scalar light inputs**, not final colour:
  - RGB: painted base colour (strokes, field patterns, snow mask already applied);
  - A, or a second texture: the painted light value `l`, with sun visibility, AO and painted shadow shapes already combined, so band edges are baked;
  - keep sun visibility separate if units and scatter need it.
- Keep the ramp (`shadowOf` / mid / light mix) at runtime. It is a few ALU operations.
- Clouds, unit shadows and smoke shadows then subtract from `l` before the ramp, as today. The staff map can fade the light term, and season stays a uniform for whatever the bake does not fix.

Alternatively, follow Age of Sail's "lit + shadow texture sets" (two painted colours blended by a shadow mask; see `film-techniques.md`), at twice the memory. Either way, delete "lighting included" from the runtime layer list.

### 4. The pasted-on risk is named, but there are no mitigations or test criteria; shipped precedents needed substantial integration work. **Severe**

**Claim challenged.** A one-line drawback ("may look like stickers … if their palette, light direction and edge treatment do not match"), and validation step 3 ("do they look pasted on?") with no criteria.

**Evidence.**
- **Pillars of Eternity** (pre-rendered painted backgrounds, 3D characters; fixed camera):
  - After the first screenshots, Obsidian wrote that "the 3D characters were not matching the 2D rendered scene as much as we would have hoped."
  - The fix took several systems:
    - a dynamic ambient that **samples colour from the background**;
    - a low-resolution **shadow control map** that dims sunlight on characters in painted dark areas and prevents double shadows;
    - dynamic shadows **tinted to the backgrounds' blue shadow colour**;
    - bloom over both layers.
  - The backgrounds were already rendered with depth, normal and albedo passes so characters could be occluded and lit (Obsidian, Update #79).
- **Disco Elysium** (painted backgrounds, real-time NPCs, vegetation, particles): each painted background shipped with height, normal and shadow maps so that real-time objects could interact with it (GameBanshee developer post; Raidma, GDC 2020 talk listing).
- Both precedents have a **fixed camera**, so every pixel of background is seen from exactly one angle. Ours rotates ±45° and zooms, which adds risk rather than removing it.
- **Ground-cover scatter is a pasted-on surface too.** `engine-design.md` §4 plans grass and wheat scatter at about 13× today's counts. Runtime-shaded grass covering a painted ground is the biggest area where two shading paths meet, and the proposal does not mention it.
- **Scale mismatch.** Finding 1 puts multi-metre baked marks next to 10–30 px figures. Crisper units are intended (Puss keeps characters clean; `film-techniques.md` §takeaways). Ground marks bigger than the units are not intended.

**Suggested change.** Add a "Matching" section with concrete mechanisms:
1. Units, trees and scatter read the macro bake at their base, one fetch per instance in the vertex shader, for ambient tint and light value. This is the Pillars of Eternity background-ambient approach.
2. Ground scatter takes its base colour from the bake under its root.
3. Contact and formation shadows go through the same ramp (finding 3), not a multiply.
4. A single shared palette module for the bake and runtime shaders.

Give validation step 3 pass criteria:
- no visible colour or value step where grass scatter meets bare painted ground;
- unit shadows in the cool band;
- figures in shadow pools darken and cool the same amount as the ground.

### 5. The ground-density table derives ground pixels from figure height, which ignores the camera pitch. **Moderate**

**Claim challenged.** "Screen px per metre" is the figure's height in pixels divided by 1.8 m, and so are the texel counts derived from it.

**Evidence.**
- A standing figure projects to h·cos(e) on screen, where e is the camera's angle below the horizontal.
- The ground across the screen is not foreshortened. Ground in depth projects with sin(e).
- So ground pixels per metre equal figure-derived pixels per metre × 1/cos(e) across, and × tan(e) in depth:

| e | across | in depth |
|---|---|---|
| 50° | ×1.56 | ×1.19 |
| 55° (the stills' prompt) | ×1.74 | ×1.43 |
| 70° | ×2.92 | ×2.75 |

- If the figure numbers are projected heights, the texel spans become:

| Zoom | Proposal (px per texel) | Corrected, 50°–70° (across) |
|---|---|---|
| Far 3D | 1.2 | 1.8–3.3 |
| Gameplay | 1.4–4.3 | 2.3–12.9 |
| Closest | 5.8–10 | 8.9–29.6 |

- My measurement of the stills (about 25–30 px/m from rank spacing) is closer to the proposal's numbers. That suggests the generated stills do not follow strict projection either, so they cannot calibrate the engine.
- **Perspective across the frame.** At fov 0.62 and e = 50°, the bottom of the frame is 1.21× denser than the centre, and the top 0.70×.
- **Slopes.** A slope s facing the camera magnifies the depth axis by 1 + tan(s)/tan(e):

| Slope s | e | Facing the camera | Facing away |
|---|---|---|---|
| 10° | 50° | 1.15 | 0.85 |
| 20° | 50° | 1.31 | 0.69 |
| 20° | 24° (the engine's pitch cap, about 1.15 rad from vertical) | 1.82 | 0.18 |

  The Pratzen slope in the reference faces the camera.
- `engine-design.md` §5 caps pitch at about 1.15 rad from vertical. That allows far more oblique views than the 50–70° the research notes assume. The proposal should state which pitch range applies at each zoom.

**Suggested change.** Compute ground pixels per metre from the camera model (d, pitch(d), fov, 1080 px) at the frame centre and the bottom edge. Do not derive them from figure heights. State the pitch at each zoom. Add a "worst case" row: bottom of the frame, camera-facing 15° slope, closest zoom. The conclusion (soft at close zoom) gets stronger, and finding 1 gets worse.

### 6. The runtime saving is real but negligible, and it is miscounted. **Moderate**

**Claim challenged.** "Today's shader does 2 grain samples plus the full ramp and lighting maths, so this is equal or cheaper."

**Evidence.** Fetches per terrain pixel in `painted-cinematic.html` today, after dead-code elimination:

| Source | Fetches |
|---|---|
| `LM()` | 1 |
| `albedo()`: n1, n2, fpat, flowers (2), bank noise, furrows | 7 (n3 and `st` are dead) |
| `grainW` ×2 in `paint()` | 2 |
| `cloud()`, 3 fetches; called twice with the same arguments, likely merged by the compiler | 3 |
| `snowAt` (winter only) | +1 |
| `mist()` where the valley mask is above 0.01: noise, plus 3 more light-map fetches with shafts | +1 to +4 |
| **Total** | **about 13, up to 18** |

So the proposal undercounts today's cost. The proposed path is not much cheaper either:

| Source | Fetches |
|---|---|
| Macro | 1 |
| Detail layer: MetaTexture uses 4 samples per lookup, 8 with skew compensation (`stroke-stability.md` §3.5) | 4–8 |
| `cloud()`: the cloud shadow is itself 3 grain fetches, not "a multiply" | 3 |
| Valley mask for mist, from a texture the proposal has deleted (finding 7) | 1+ |
| **Total** | **about 9–13** |

In absolute terms: at 1080p, about 2 M pixels × 13 fetches ≈ 27 M fetches, from a 2048² grain texture that stays in cache. On a 3060 laptop that is a fraction of a millisecond **[est]**, against a terrain budget of about 1.5 ms (§8). Finding 3 puts the ramp back at runtime anyway. Cost is therefore not a reason to do this, and the doc should not suggest it is.

**Suggested change.** Replace the runtime-cost bullet with the fetch table above. Say the change is cost-neutral, and justify the bake on look alone. Keep validation step 5, but as a check that cost did not go up, not as a benefit.

### 7. "The painted texture can absorb the light map" drops two channels other systems read. **Moderate**

**Claim challenged.** "One channel keeps sun visibility for units and scatter. Net: +0 to +60 MB."

**Evidence.** The light map is RGBA:
- R: sun visibility;
- G: AO (`occ`), read by terrain and listed as a scatter input in §6;
- B: the valley-mist mask, read by `mist()`, which also samples R at three offset points along the view ray for light shafts.

The macro has only one spare channel. So either AO and the valley mask move to a second texture, or mist and shafts are lost. Finding 3 also wants a light channel. The real layout is two textures. One can be coarse: AO is a 4 m bake, and the valley mask is smooth.

**Suggested change.** Specify a channel layout, for example:
- Macro RGBA: painted colour plus painted light value `l`.
- Small aux RGBA at 1–2 m: sun visibility, AO and valley mask.

Recompute the memory delta from that layout.

### 8. Compressed memory exists only on the shipped path; peak bake memory is not budgeted. **Moderate**

**Claim challenged.** The memory numbers "BC7 … 48 MB, 63 MB with mips" and "+0 to +60 MB … compressed", and the claim that the bake fits "≤ 600 MB bake memory".

**Evidence.**
- **Arithmetic, checked:**
  - 1800 / 0.26 = 6923 → 6923² × 4 B = 191.7 MB, or 255.6 MB with mips;
  - BC7: 47.9 MB, or 63.9 MB with mips. Correct.
- **No BC7 on the load-time path.** WebGL2 has no compute shaders and cannot render into a compressed format. A **bake at load produces RGBA8.** BC7 would need a readback plus a CPU or wasm encode of 48 M texels, which takes seconds to minutes depending on quality **[est]**. So "bake at load" means about 256 MB resident, and only "ship KTX2" gets about 64 MB.
- **Peak during the bake** is larger than the final texture. Based on the prototype's formats:

| Item | Size |
|---|---|
| Shadow depth: R32F at 0.33 m = 5455², plus a depth buffer (`shadowRT`, line 746) | about 120 MB + depth |
| Base fill render target, RGBA8 6923² | 192 MB |
| Stroke target, or a ping-pong copy for Kuwahara | 192 MB |
| Final texture with mips | 256 MB |

  Together that is roughly **600–900 MB at peak [est]**, against a 600 MB budget, unless the bake works tile by tile and frees as it goes.
- **Dimensions.** 6923 is not a multiple of 4. BC-family uploads in WebGL want block-aligned base levels, so use 6912 (0.2604 m) or 7168.

**Suggested change.**
- Give two memory lines, "shipped KTX2/BC7" and "baked at load, RGBA8".
- Add a peak-memory line for the bake with a tile-by-tile order: base fill, light, strokes and finish per 2048² or 4096² tile, with a stroke apron the width of the largest stroke.
- Pick a block-aligned size.

### 9. The close-zoom detail layer is underspecified and, as described, reproduces today's "regular texture" problem. **Moderate**

**Claim challenged.** "Grayscale stroke masks … modulate the macro's value only … Blended across 2–4 power-of-two scales … strokes keep a constant screen size."

**Evidence.**
- **Orientation.** A tiling mask has one orientation per tile. The bake's strokes follow furrows and the fall line. Close up, the detail strokes will cross the furrows, and furrows are a signature of the Pratzen and cavalry stills. Following the bake's direction field needs a direction channel and per-pixel rotation of the detail coordinates. Done naively, that creates seams wherever the direction changes; the usual fix is a few quantised direction bins blended together, which costs about 2× the fetches.
- **Contrast.** Age of Sail reports that blending up to 8 copies "significantly reduces feature contrast" and needs a variance-compensation step (`stroke-stability.md` §3.5). The proposal does not mention it.
- **Value only.** The strokes in the stills vary in **hue** as well as value: warm ochre flicks over pale gold, and cool flicks in shadow. Value-only modulation reads as grain.
- **Screen-constant size conflicts with world-anchored macro strokes.** Zooming in, the macro shapes grow while the detail strokes stay the same size on screen. The eye sees two stroke scales moving apart. That may be acceptable, but nobody has tested it.
- **Coverage of the zoom range.** 2–4 scales covers it: far 3D to closest zoom is about 3 octaves by the proposal's numbers.

**Suggested change.**
- Give the detail layer its own section covering:
  - a direction source (a channel in the macro);
  - the blend and its contrast compensation;
  - a hue jitter tied to the light band;
  - the fetch count.
- Build and evaluate it **first**, because it carries the look at the reference zoom whatever happens to the bake.

### 10. River banks are steep everywhere, and the "triplanar fallback" has no baked data to fall back to. **Moderate**

**Claim challenged.** "Gentle terrain (Austerlitz) has few [steep faces]; a local triplanar fallback where slope exceeds ~45°."

**Evidence.**
- Art bible §6c puts a **steep cut bank of bare earth on the outside of every bend**. The river runs the length of the map and appears in the Goldbach still.
- A top-down bake holds one projection. Triplanar needs side projections the bake does not have. The fallback is therefore *runtime* shading, which puts a seam in shading style along every river bank, where the player looks at fords.
- At 0.26 m, a 1–2 m bank spans about 2–4 texels horizontally anyway.

**Suggested change.** State that steep faces use the runtime paint path. Add a blend band so that path takes the bake's colour at its edge, by sampling the macro at the top of the bank. Include a river bend in the 300 m test patch; the Pratzen framing has none.

### 11. Seasons, battle presets and map edits multiply bakes; download size and iteration time are missing. **Moderate**

**Claim challenged.** "The bake (per map, per battle preset)"; "Every change to the ground means a rebake"; and the open question "ship KTX2 (download size, a build step)".

**Evidence.**
- **Variant count.** Variants per map = sun and palette presets × seasons, with time-of-day presets as in art bible §4.
- **Size per variant [est from the Basis README]:**
  - UASTC is 8 bpp: about 48 MB for level 0 and about 64 MB with mips, before RDO and Zstd. RDO trades quality for LZ compressibility; assume roughly 30–60 % smaller on disk **[est]**, so about **25–45 MB per variant**.
  - ETC1S is roughly 0.3–3 bpp, but its endpoint and selector codebooks smear high-frequency brushwork (`browser-and-pipeline.md` §1.5). It is the wrong codec for exactly this content.
  - With 4 presets × 2 seasons: about **200–350 MB per map** shipped.
- **Iteration.** Map edits (W6 real data), palette tuning and stroke tuning each need a full rebake. Bake time therefore becomes artist iteration time, not just load time, and the proposal gives no target for it.
- **Artist overrides.** If an override is painted on the baked result, it is invalidated whenever the sun, palette or heightfield changes.
- **Context loss.** Decision 0005 says the renderer "can be rebuilt at any time (for example after a lost WebGL context)". A load-time bake runs again on every context restore.

**Suggested change.**
- Add a "Variants and size" table: presets × seasons × size per variant.
- Decide that **season and presets bake at load**, so only the map's own variant exists. Ship KTX2 only for a default.
- Set an iteration target: a full-map rebake in under 10 s on the dev Mac, and a single-tile preview in under 1 s.
- Put artist overrides **before** the light pass, as painted colour in the base layer, so they survive changes to sun and palette.
- Note that a context restore re-runs the bake, or caches it in IndexedDB.

### 12. The headless and SwiftShader path contradicts a standing engine rule and is now behind a flag. **Moderate**

**Claim challenged.** "SwiftShader (our headless checks) could take minutes. To be measured."

**Evidence.**
- **A standing rule.** `engine-design.md` §6 says: "**No canvas filters or per-element strokes** (they lost the WebGL context in SwiftShader)." The proposal plans up to 1 M per-element strokes plus a filter pass, and does not mention the rule. Instanced GPU quads are not the canvas strokes the rule was written about, but the failure (a long GPU job in SwiftShader losing the context) applies equally.
- **Chrome flag.** Chrome has deprecated the automatic WebGL fallback to SwiftShader. WebGL context creation fails where it would have used SwiftShader unless Chrome runs with `--enable-unsafe-swiftshader`, enforced from about M139 per Samsung's and Chromium's documentation. The CI launch flags must include it.
- **Rough cost [est].**
  - Splat fill: 48 M texels × 4–10 overdraw ≈ 0.2–0.5 G blended fragments.
  - Anisotropic Kuwahara: around 200–400 taps per texel ≈ 10¹⁰ fetches.
  - On a 3060 this is under a second. On CPU rasterisation, the Kuwahara pass alone plausibly takes minutes.
  - A cheap calibration: time today's 3072² light-map bake in SwiftShader and scale it.
- **Texture size limit.** SwiftShader's reported MAX_TEXTURE_SIZE could not be confirmed (search found nothing citable). Query it in CI before relying on 8192 or 6923.

**Suggested change.**
- Address the §6 rule explicitly.
- Bake in many small draws: per tile, with stroke batches under about 100 ms each.
- Let headless checks load a pre-baked fixture instead of baking.
- Add `--enable-unsafe-swiftshader` to the CI notes.

### 13. View-dependent terms are not separated from the bake. **Moderate**

**Claim challenged.** "Baked light is view-independent", which the proposal implies without saying which terms qualify.

**Evidence.**
- The current terrain `paint()` adds a **Fresnel rim** (`fres=1-dot(N,V)`, rimAmt 0.12).
- The art bible's backlit look ("the sun stays behind the scene", "golden backlight glow") and frost and snow glints are view-dependent.
- With yaw ±45°, the sun swings from behind the camera to its side. Any sheen baked for one yaw is wrong at the others.
- The stills show strong sheen on dry grass toward the sun. Their camera is fixed, so they hide this problem.

**Suggested change.** List the terms that stay at runtime: rim, backlight sheen, glints and atmos (focus-relative). The bake keeps only N·L-based light, shadow and AO. Validation must cover yaw −45° and +45°.

### 14. Class readability is asserted, not tested. **Moderate**

**Claim challenged.** "Strokes are clipped at class edges, so woods, marsh and fields keep readable borders."

**Evidence.**
- Clipping keeps the edges, but painted variation *inside* classes can still close the value and hue gap between classes. Meadow against stubble, or marsh against wet floodplain, may become harder to tell apart at gameplay zoom.
- Step 4's anisotropic Kuwahara is not class-aware and averages across edges unless masked.
- The art bible ranks "Readable" as pillar 1.

**Suggested change.**
- Add a validation step: at gameplay zoom, in grayscale and slightly downsampled, can a tester name the class at 10 random points?
- Make the Kuwahara pass class-masked, or drop it (finding 15).

### 15. The Kuwahara finishing pass is the generic "oil filter" signature. **Light**

**Claim challenged.** "Cheap there and safe, because no unit is in the image."

**Evidence.**
- Being offline removes the formation-smear objection (decision 0001). It does not remove the look. Kuwahara flattens texture into flat patches with soft-cornered edges, which is the recognisable Photoshop "oil paint" look. The art bible quotes the reference film as "not a Photoshop filter applied on top".
- Run over freshly splatted strokes, it also erases the stroke shapes the painter just made.
- `realtime-games.md` found no shipped AAA game with a documented Kuwahara pass.

**Suggested change.** Leave it out of the default pipeline. Keep it only as ablation (d) in finding 2.

### 16. Stroke orientation under yaw, and dab foreshortening. **Light**

**Claim challenged.** None directly; the task asked for this to be checked.

**Evidence.**
- Strokes anchored in world space rotate with the view, which is correct for marks on a surface and matches the art bible's "never in screen space".
- Under yaw ±45° this is fine. Fall-line and furrow directions are physical, so they stay plausible from any yaw.
- The real effect is foreshortening: round dabs become ellipses by sin(e). That is 0.77 at 50° and 0.41 at the 24° pitch cap. Painters do not foreshorten their marks.

**Suggested change.** One sentence acknowledging it. Optionally pre-stretch dabs along the default view direction by about 1/sin(e) at the default pitch.

### 17. Determinism. **Light**

**Claim challenged.** "Deterministic: seeded, so a map always bakes the same."

**Evidence.** This is irrelevant to the simulation: the bake is render-only (decision 0005), and nothing in the sim reads it. It matters only for golden screenshots and for parity between a shipped bake and one made at load. A fixed seed still gives different bits on different GPUs (float precision, rasterisation rules, blending).

**Suggested change.** Say that determinism is a test convenience, not a requirement. Golden comparisons of the bake need a tolerance or a per-device baseline.

### 18. Far zoom and the staff map. **Light**

**Claim challenged.** "It fades out at far zoom, where the macro alone carries the look."

**Evidence.**
- At far 3D zoom, a texel is 1.2–3.3 px (finding 5), so the macro is minified and needs mips. Today's grain texture uses anisotropic filtering at level 4, so the macro needs it too, or it will shimmer when panning. Shimmer is one of the proposal's own complaints about today's terrain.
- The staff map's paper bake is sampled by the same terrain shader. The crossfade between the macro and the paper over `mapness` should be specified, including the stage interactions in finding 3.

**Suggested change.** Add mips plus anisotropic filtering to the macro's sampling spec. Add one line on how the macro hands over to the map texture over `mapness`.

### 19. Smaller factual points. **Light**

- **The stills are 1672 × 941.** The "40–70 px" figure heights are at that size and become 46–80 px at 1080p. They are AI concept images, not engine captures, so they cannot calibrate densities (finding 5).
- **BC7 on macOS is not universal.** web3dsurvey reports EXT_texture_compression_bptc on 99.7 % of Windows WebGL2 reports, but **79 % on macOS and 55 % in Safari**. The dev Macs should be checked in the browser actually used. Where BC7 is missing, the Basis transcoder falls back to a lower-quality block format or to RGBA32.
- **MAX_TEXTURE_SIZE.** Windows is ≥ 16384 on 97 % of reports and macOS ≥ 8192 on 100 % (web3dsurvey). The 8192 cap is safe on the targets. If the bake ships as 4 tiles, sample them through a 2D texture array to avoid per-pixel texture selection.

---

## Claims stated as fact that are estimates or unverified

| Claim in the proposal | Status |
|---|---|
| "Short answer: cheap at runtime, affordable in memory, doable" | Two of three unmeasured; "doable" untested for the look |
| "Today's shader does 2 grain samples" | **Wrong:** about 13 fetches (finding 6) |
| "This is equal or cheaper" | Unmeasured; roughly equal by fetch count, and it does not matter |
| "The painted texture can absorb the light map" | **Wrong** as specified: AO and the valley mask have nowhere to go (finding 7) |
| "Net: +0 to +60 MB … compressed" | Only on the shipped path; final size only, no peak (finding 8) |
| "Fits the bake budget … ≤ 600 MB" | Final texture only; peak unbudgeted |
| "Well under a few seconds on a 3060" | Labelled as an estimate (good); plausible by my estimate too |
| "SwiftShader could take minutes" | Labelled as an estimate; the Kuwahara pass is the risk |
| "Anisotropic Kuwahara … cheap there and safe" | Cheap on GPU, yes. "Safe" fails on class edges and the generic look |
| "The bake carries the painting at gameplay zoom" | Shapes yes; strokes bigger than figures (finding 1); unproven |
| "Strokes keep a constant screen size across the zoom range" | Approximate; loses contrast without compensation |
| "Gentle terrain (Austerlitz) has few [steep faces]" | Contradicted by the river spec (finding 10) |
| "The stroke painter … weeks" | Estimate. W1 was estimated at 0.5–1 day and took several redesigns (`engine-design.md` §1) |
| "1.8 km per map is too large to hand-paint" | Opinion; plausible |
| Screen px per metre per zoom | Derived from figure heights; ignores pitch (finding 5) |
| "Terrain no longer needs a shadow pass for static casters" | True, but already true today, so not a gain |

## Claims checked and found correct

- 1800 m / 0.26 m ≈ 6923, so 6900² texels.
- RGBA8 is 192 MB, or 256 MB with mips.
- BC7 is 48 MB, or 64 MB with mips.
- 0.05 m per texel over 1.8 km is 36000², or 1.296 × 10⁹ texels. That is 5.2 GB in RGBA8 and 1.3 GB in BC7, so it is impossible under a 600 MB budget, as stated.
- The pixels-per-texel column is arithmetically consistent with its own pixels-per-metre inputs (×0.26).
- Virtual texturing is correctly ruled out by "no streaming, ever" (decision 0010, `engine-design.md` §2).
- The MetaTexture attribution to Age of Sail (Curtis et al., Expressive 2019) is correct.
- Decision 0001 is described correctly: Kuwahara was rejected for smearing formations.
- BC7 through EXT_texture_compression_bptc is effectively universal on Windows Chrome and Edge (99.7 % of Windows reports, 98.7 % of Edge).
- MAX_TEXTURE_SIZE ≥ 8192 holds on all Windows and macOS WebGL2 reports.
- A GPU bake of about 1 M quads into a 6923² target in seconds on a 3060 is plausible.
- Terrain already reads static shadow from the light map (`sh=(1.0-lm.r)` in `TER_FS`).
- Hand-painting and generated paint-over are correctly kept out of the core pipeline.
- The "no smear of formations" goal is met by construction: nothing that moves is in the bake.

## Sources

- web3dsurvey, [EXT_texture_compression_bptc support](https://web3dsurvey.com/webgl2/extensions/EXT_texture_compression_bptc) and [MAX_TEXTURE_SIZE](https://web3dsurvey.com/webgl2/parameters/MAX_TEXTURE_SIZE) (fetched 2026-10-08).
- Chromium, [Using Chromium with SwiftShader](https://chromium.googlesource.com/chromium/src/+/da170c2267b2201954efe1c8fa5d2d89ab09f7bf/docs/gpu/swiftshader.md); blink-dev, [Intent to Remove: SwiftShader Fallback](https://groups.google.com/a/chromium.org/g/blink-dev/c/yhFguWS_3pM/m/oLrB5up_BwAJ); Samsung Internet policy, [EnableUnsafeSwiftShader](https://developer.samsung.com/browser/policy/enable-unsafe-swift-shader.html).
- Obsidian, [Pillars of Eternity Update #79: Graphics and Rendering](https://eternity.obsidian.net/news/update--79-graphics-and-rendering-) (2014).
- GameBanshee, [Disco Elysium – From Render to Paintover](https://www.gamebanshee.com/k4fuh); GDC, [Turpentine Fumes and Shaders: Art Tech in Disco Elysium (talk listing)](https://gdconf.com/news/come-gdc-and-see-how-disco-elysiums-unique-style-was-achieved-0).
- Binomial, [basis_universal README](https://github.com/BinomialLLC/basis_universal) (via `browser-and-pipeline.md` §1.5).
- Curtis et al., [Real-time non-photorealistic animation for immersive storytelling in Age of Sail](https://storage.googleapis.com/gweb-research2023-media/pubtools/5311.pdf) (via `stroke-stability.md` §3.5, `film-techniques.md`).
- Local: `rts/prototypes/painted-cinematic.html` (TER_FS, `paint()`, `cloud()`, `mist()`, `shadowRT`); `rts/docs/proposals/staff-map/implementation.md` §2–§3; `rts/docs/art-bible.md` §4, §4b, §6c; `rts/design/refs/austerlitz-*-v1.png` and `.prompt.txt`.
