---
status: active
last_reviewed: 2026-10-10
---

# Plan: Track E, the painterly look

How the game gets its painted look, in order, with acceptance tests. This is the **styling track**. It
runs beside the **logic track** (the simulation, `docs/engine-map.md` §4, Track S), worked by another
agent. The two meet at the renderer's read of the sim state, described below.

## Sources (read these first)

The style is designed in these documents; this plan schedules them and does not restate them:

| Document | What it gives this plan |
|---|---|
| `docs/art-bible.md` | **The style design:** pillars (§2), the shading ramp and palette (§4), seasons (§4b), the asset contract (§5), atmosphere without a sky (§6), depth and the cinematic layer (§6b), water (§6c), the staff map (§6d), the brush library (§7), units (§8), effects (§9) |
| `docs/research/painterly-style-in-real-time.md` | **The evidence:** what makes the look; the technique catalogue with costs (§b); the stack per surface (§c); the ranked risks (§d); the prototype steps P0–P7 and their acceptance tests (§e) |
| `docs/proposals/prepainted-terrain.md` | **The terrain decision:** a painted macro colour bake yes; baked strokes only as an experiment; light stays at runtime; its validation ablation |
| `docs/research/prepainted-terrain-review.md` | Why baked strokes and lit bakes were rejected |
| `docs/proposals/engine-design.md` | Scale and min-spec (§2), camera (§5), bakes and their memory limits (§6), units on the render side (§7), verification and frame budgets (§8), the order of work this plan extends (§10) |
| `docs/plans/active/prototype-plan.md` | Prototype exit criteria (§1); the water workstream W2–W6 (§4) |
| Decisions | 0001 (look in assets and materials, not filters), 0002 (top-down, no sky), 0003 (no blur in gameplay), 0010 (locked camera and staff map), 0011 (scale and min-spec), 0012 (heightfield authority) |
| `design/refs/north-star.png` and the Austerlitz images in `design/refs/` | The targets the look is judged against |

**The rule from all of them: paint the world, keep the units clean.** Soldiers are 10–30 px tall at
gameplay zoom. The painting lives in ground, trees, buildings, smoke and light; units carry value,
silhouette and colour, and almost no brushwork.

## Naming

The research report numbers its steps P0–P7, but `docs/proposals/engine-design.md` already calls a phase **P** (finish
the prototype). This plan's phases are **L0–L9** (L for look):

| Phase | Research step | Engine-design §10 item |
|---|---|---|
| L0 Spine | none | E0-lite (2–5) |
| L1 Units placeholder and benchmark | P0 | 6 |
| L2 Terrain detail layer | P1 | none |
| L3 Soldier look | P2 | none |
| L4 Readability gate | P3 | none |
| L5 Macro colour bake and ablation | the terrain proposal's validation | none |
| L6 Smoke | P4 | none |
| L7 Foliage and edges | P5 | none |
| L8 Anti-aliasing | P6 | none |
| L9 Look match and prototype exit | P7 | 9, 10 |

Water W2–W5 and the Austerlitz import W6 continue under `docs/plans/active/prototype-plan.md` §4. They slot in after L2
(below).

## Working beside the logic track

### Who owns what

| Area | Owner | Notes |
|---|---|---|
| `src/sim/`, `src/rulesets/`, `src/scenarios/`, `test/` (sim tests), the calibration tool | logic | The style track reads; it changes nothing here |
| `src/render/soldiers.ts`, `src/render/map.ts`, `src/app/` (the staff-map page) | logic | The 3D renderer reuses `SoldierLayer` (below); a change it needs goes in a small PR the logic track reviews |
| `prototypes/` | style | Single-file look prototypes, until L0 moves them |
| New: the look code (`src/look`), its page (look.html in `app/`), the bench tools and look tests | style | The 3D renderer, its shaders, bakes and checks |
| `docs/art-bible.md`, `docs/research/` (look), this plan | style | |
| `package.json`, `eslint.config.js`, `vite.config.ts`, `docs/INDEX.md`, `docs/engine-map.md` | shared | Small, separate commits; rebase before merging; never reformat someone else's lines |

### The interface between them

The renderer reads the sim. It never writes to it (decision 0005).
- **Where each man stands:** `SoldierLayer` (`src/render/soldiers.ts`, `docs/systems/sim-page.md`) gives
  every man's position, his slot, alive or fallen, interpolated between ticks. The 3D figures take x and
  z from it, y from the heightfield, and facing from the battalion's heading. The staff-map page and
  the 3D view then show the same men in the same places.
- **Per battalion:** shape, heading, morale state (`mstate`), and the colours' position
  (`SoldierLayer.anchor`).
- **Volleys, for smoke and flashes:** each company's `volleyTick` and `target`
  (`docs/systems/fire-morale.md`). A volley is a change of `volleyTick`; there is no event ring until S2.
- **Scenarios** for benchmarks and screenshots: `s1b-bench` (40 battalions marching), `s1c-firefight`
  (two lines firing), from `src/scenarios/page.ts`.

If the style track needs more from the sim (a per-figure animation state, a facing per company), it
asks the logic track for a read-only accessor rather than reading internals.

### Rules

- **The workflow** (AGENTS.md):
  - plan, implement, `/code-review high`;
  - another round only after a severe finding; a redesign after 3 rounds;
  - no AI attribution in commits or PRs; squash merges.
- **One PR per phase step,** with before and after screenshots at fixed cameras.
- **Timing:** headless Chrome uses SwiftShader. It checks correctness, never timing. Timing comes from
  the min-spec laptop (below).

## Measuring on the min-spec laptop

The budgets are for an **RTX 3060 laptop** (60–80 W), Chrome on Windows (ANGLE / D3D11), 1080p, render
scale 1 (decision 0011). An agent cannot run that machine.
- **The harness:** each phase that has a budget ships a bench page in `tools/` (bench-<phase>), or a page
  mode. It runs fixed camera paths and writes a JSON result:
  - frame times (p50, p95, max);
  - GPU time per pass, from `EXT_disjoint_timer_query_webgl2` where available, else the browser's
    profiler;
  - draw calls, triangles and texture memory;
  - the build hash.
- **The owner runs it** on the laptop, on AC and on battery, and commits the JSON to
  `docs/plans/active/track-e-results/`.
- **The dev Mac** is a conservative proxy until the laptop is measured. Its numbers are reported but do
  not pass a gate.

**Budgets** (`docs/proposals/engine-design.md` §8; the research's split in brackets):
- 16.7 ms frame, ≤ 12 ms GPU;
- terrain about 1.5 ms (2–3);
- scatter and foliage about 3 ms (2–3);
- units about 3 ms (2–4);
- water about 1 ms;
- post about 2 ms (≤ 1);
- smoke ≤ 1.5 ms (research P4);
- draw calls ≤ 600 including shadows;
- bake memory ≤ 600 MB.

All are estimates until L1 measures them, and **L1's numbers can move every later budget.**

## Human gates

Some acceptance tests need people, not scripts. The owner arranges them:
- **The readability test (L4):** at least 5 people, blind, 2 s exposures.
- **The terrain ablation (L5):** at least 3 judges, blind, a fixed checklist.
- **Anti-aliasing (L8):** a majority of reviewers.
- **The look sign-off (L9):** the owner, against the target images.

The style agent prepares the material (image sets, randomised order, answer sheets in
`docs/plans/active/track-e-results/`) and tallies the answers.

---

## L0. Spine (E0-lite)

**Goal:** a renderer the later phases can build on, test and measure, in the game's toolchain. No
change to the look.

1. **L0a, SPEC and the heightfield as the truth** (`docs/proposals/engine-design.md` §10 items 2–3):
   - a `SPEC` object with derived sizes and load-time invariants (coverage, footprint, pitch cap, yaw
     range, bake sizes against min-spec);
   - the terrain mesh, placement and checks all read one heightfield;
   - the bake rules (fitted frustum, no canvas filters).

   Acceptance: the invariants throw on a bad spec (with a negative test); the far yOff and AO-edge
   known issues are gone.
2. **L0b, golden screenshots** (item 4):
   - fixed cameras, frozen time and seed;
   - a pixel-diff tool with a per-region tolerance;
   - negative tests for the existing render checks (`tools/render-check.js`).

   Acceptance: a deliberate one-line shader change fails the diff, and reverting it passes.
3. **L0c, into the game toolchain** (item 5, and the "Vite + TypeScript" line under "At prototype exit"):
   - port `prototypes/painted-cinematic.html` to TypeScript modules under `src/look/`: terrain, ramp
     and grain shaders, bakes, scatter, cinematic layer, camera;
   - render it from a look page in `app/` (look.html);
   - Babylon from npm, pinned to the prototype's version (9.29.0), deep imports;
   - shaders in their own files, imported as strings.

   Acceptance:
   - golden screenshots match the prototype's within tolerance at every camera;
   - `npm run build` passes, and so do lint and typecheck;
   - the render code follows decision 0016's toolchain. The sim's lint rules (no `Math.sin` and the
     like) do **not** apply to `src/look/`; the render code may use any maths.

   The prototype stays in `prototypes/` as the reference until L9.

**Depends on:** nothing. **Estimate:** 4–6 days over 3 PRs. **Risk:** the port drifts from the prototype.
The golden screenshots are the guard; port, then change, never both in one PR.

## L1. Units placeholder and benchmark (research P0)

**Goal:** thousands of figures on the painted terrain, driven by the sim, measured on the min-spec
laptop before any further art. **This is the riskiest unknown in the track** (research §d, risk 1). Its
answer can change art decisions, so it comes first.

**Build:**
- **A placeholder soldier:** about 300 triangles (LOD0) and about 120 (LOD1), separate colour regions
  for coat, facings, trousers and headgear (art bible §5 contract). A shako silhouette exaggerated
  1.2–1.5× (research §c, soldiers 1).
- **Stepped animation** at 12 fps from a vertex animation texture (Babylon's
  `BakedVertexAnimationManager`). Two clips, stand and march, baked by a small tool in `tools/` from a
  procedural rig: the placeholder needs no artist rig.
  - The phase is **fractional** per battalion, so not all figures change pose on the same frame (§c,
    soldiers 4).
  - Clips cut on step boundaries.
- **Thin instances:** one host per battalion per LOD; matrices written in place each frame from
  `SoldierLayer`; bounds padded by one figure height (thin-instance bounds do not follow VAT).
- **Shadows:**
  - **Contact:** a blob per figure (instanced) or a decal per battalion, which lowers the light value
    before the ramp (cool, not grey; art bible §4).
  - **Units stay out of the static shadow map.**
- **Formation identity:** one flag per battalion, never under about 12 px, and a footprint outline for
  the selection (§c, soldiers 6).
- **Picking:** against battalion bounds, then the heightfield.
- **Scenes:**
  - `s1b-bench` (40 battalions, about 4,000 figures, the decided scale);
  - a stress scene at 8,000 figures (the research's benchmark, 2× headroom);
  - the densest planned woods;
  - MSAA at 1× and 4×.
- **Cameras:** worst-case zoom-out, gameplay zoom, the closest zoom; yaw −45°, 0°, +45°.

**Acceptance** (research P0, on the laptop):
- **Frame time:** p95 ≤ 16.7 ms at the worst zoom with 4× MSAA and 4,000 figures; GPU ≤ 12 ms.
- **The 8,000 run** is reported, not gated.
- **Draw calls** ≤ 600, shadows included.
- **No hitch:** no frame over 50 ms after the first 10 s (shader compile hitches).
- **The limit hit first** (JS submission, vertex, fill, foliage overdraw) and its cost per element,
  written in the results.
- **The 3D men match the staff map:** at the same tick, every figure stands where `SoldierLayer` puts
  him (a headless check: project the figures, compare with the soldier layer's positions).

**Depends on:** L0. **Estimate:** 5–8 days over 2–3 PRs (figure and VAT; instancing and shadows; the
harness and scenes). **Decision after L1:** whether WebGL2 is CPU-bound on submission at this scale. If
so, WebGPU moves up (research open question).

## L2. Terrain detail layer (research P1; the proposal's runtime layer 4)

**Goal:** brush detail on the ground that holds its size across the zoom range, with no seams, shimmer
or tiling. Every terrain option needs this layer (the terrain proposal: "runtime detail layer first").

**Build** (research §c terrain 1–5, the proposal's §Design, runtime layers):
- Y-planar plus a slope-gated second plane (or biplanar), with `textureGrad` and derivatives taken before
  the axis choice;
- two power-of-two scales cross-faded by `log2` of the pixel footprint (MetaTexture), replacing the
  fixed 5.5 m and 21 m scales;
- the blended grain's variance renormalised; band thresholds sharpened with `fwidth`;
- anti-tiling on the fine octave (IQ 2-fetch index variation first, hex tiling if repeats still show);
- stroke masks from the brush library (art bible §7), per terrain class. Until the owner's Procreate
  brushes land, use the current grains; the layer takes any brush texture.

**Acceptance** (research P1):
- **Scale stability:** over a scripted zoom sweep, the dominant grain wavelength in pixels (by
  autocorrelation on captured frames) stays within ±25%, near and far edge of the tilted view included;
  a headless tool.
- **No seams:** on a test hill with slopes 0–90° in 15° steps, no line at projection transitions and no
  1 px mip lines, at any zoom.
- **No shimmer:** a slow pan at mid zoom, with no band-edge flicker above a set pixel-difference
  threshold in static regions; a headless tool.
- **No tiling:** 3 of 3 reviewers cannot point to a repeat at maximum zoom-out.
- **Cost:** ≤ +1 ms GPU over L1's terrain (laptop).

**Depends on:** L0 (L1 can run in parallel). **Estimate:** 4–6 days, 2 PRs.

**Then water:** W2–W5 (`docs/plans/active/prototype-plan.md` §4) go after L2, because their banks and bed painting use
the same projection and grain.

## L3. Soldier look (research P2; art bible §8)

**Goal:** units lit by the same ramp as the world, with a little grain that never swims or aliases, and
the readability features the research asks for.

**Build:**
- **The 3-band ramp on units:** a narrow warm terminator and a warm rim masked to the upper or back edge
  with a hard step. No per-figure outlines.
- **Grain** sampled from the bind-pose position plus a per-instance seed: one coarse octave sized to the
  figure, clamped by derivatives, fading to flat below a pixel-size threshold.
- **Team identity** in the value and hue of the coat mass, with ±5–10% per-figure value jitter; 4
  per-instance mask channels.
- **Phases:** fractional per battalion; random with ±10% speed for routers (`mstate` routing) and, later,
  skirmishers.
- **Muskets, bayonets and flagpoles:** clamped to at least 1 px (the phone-wire clamp).

**Acceptance** (research P2):
- **No swimming:** between two renders in the same pose step, a marching figure's grain is identical in
  its own frame (pixel difference zero apart from translation).
- **No global strobe:** at most 30% of figures change pose on any one frame, across 4,000 and 8,000.
- **No grain aliasing** at 10 px figure height: reviewers A/B it against grain off.
- **Units cost** still within L1's budget.

**Depends on:** L1. **Estimate:** 3–5 days, 2 PRs.

## L4. Readability gate (research P3)

**Goal:** proof that the painting does not cost the player the battle. **The track's main art-direction
risk** (research §d, risk 2). A failure here sends L2 and L3 back before more look is added.

**Build:** formations in line, column and square for three armies, on the painted terrain, at gameplay
zoom, with flat-shaded baseline renders of the same scenes. A placeholder smoke (L6 is not built yet)
for the smoke-on arm.

**Acceptance:**
- **The blind test:** at least 5 people, 2 s exposures. Identification of army, arm (infantry, cavalry,
  artillery), formation and facing is no worse than the flat baseline, at ≥ 90% correct on each.
- **Greyscale:** a greyscale capture still separates every battalion from the ground under it.

Cavalry and artillery figures are needed for the "arm" question. Placeholders like L1's are enough: a
horse-and-rider mass, and a gun with crew.

**Depends on:** L2, L3. **Estimate:** 2–3 days plus the test session.

## L5. Macro colour bake and ablation (`docs/proposals/prepainted-terrain.md`)

**Goal:** decide by ablation whether a baked macro colour layer earns its place, and build it if it does.

**Build** (the proposal's §The bake):
- a GPU bake in tiles, deterministic by seed, at 0.5 m in world space;
- **inputs:** terrain classes, slope, roads, river, field polygons with furrow direction, villages,
  scatter, palette preset;
- **passes:** class colours, low-frequency variation, field stripes and furrow bands, wear near roads
  and villages, broken class edges;
- **colour only, no light:** light stays at runtime through the ramp;
- **seasons** tint it through the palette (no rebake);
- **the staff map** reads it flattened;
- objects sample it under them for a ground-bounce tint.

**The ablation**, each arm with L2's detail layer:
1. the runtime ramp and detail only;
2. plus procedural macro variation in the shader;
3. plus the baked macro colour;
4. plus baked strokes (experiment);
5. plus Kuwahara on the bake (experiment).

Run each at three zooms and three yaws, on the Pratzen framing, with two battalions, one tree type and
smoke.

**Acceptance:**
- **The judges:** at least 3, blind, using the checklist:
  - does it read as painted?
  - are the classes readable?
  - do the units look pasted on?
  - does it shimmer or tile?

  An arm is kept only if the judges prefer it to the arm before it. The stroke painter is dropped
  unless arm 4 beats arm 3.
- **One full-size bake** is measured: bake time, peak memory (≤ 600 MB in total for bakes), and
  behaviour under SwiftShader (no lost context).

**Depends on:** L2 (and L4 passed). **Estimate:** 4–6 days, 2 PRs (the bake; the ablation set).

## L6. Smoke (research P4; art bible §9)

**Goal:** powder smoke that looks painted, costs little, and never hides the battle.

**Build:**
- **Puffs from volleys:** each volley (a change of a company's `volleyTick`) emits puffs at the
  company's front.
  - Instanced low-poly puff meshes, shaded through the 3-band ramp, rendered to a quarter-resolution
    target, blurred, edge-distorted, then composited with a cut-out alpha threshold and a ramp-coloured
    edge (Sea of Thieves).
  - The puffs drift with a fixed wind and **die by eroding their shape, never by fading**.
  - This is the render side only. The sim's own smoke, which blocks sight, is S2's (`docs/proposals/sim-design.md`
    §11). The two use the same wind and puff shapes when S2 lands.
- **Muzzle flashes:** hand-painted flipbooks with alpha erosion.
- **Readability:** smoke below units in value and saturation, and fading locally over a selected unit.
- **Density** is a quality tier, never zero.

**Acceptance** (research P4):
- ≤ 1.5 ms GPU at the worst density, twenty battalions firing (`s1c-firefight` scaled up);
- L4's readability bar still holds with smoke on;
- no opacity fades anywhere in the effect.

**Depends on:** L4. **Estimate:** 3–5 days, 2 PRs.

## L7. Foliage and edges (research P5)

**Goal:** painted crowns and silhouettes that hold at every zoom within the foliage budget. The bare
winter trees the target images depend on.

**Build:**
- spherized crown normals;
- stroke-shaped alpha masks on crown cards (or object-space hashed alpha, so swaying trees do not slide
  through the grain);
- alpha-to-coverage on 4× MSAA, toggled around foliage draws, with coverage-preserving mips baked
  offline;
- a depth pre-pass if overdraw at the worst zoom passes 2–3×;
- Edge Breakup on environment layers only (units masked out);
- far woods switched to painted terrain colour;
- **a first attempt at bare winter trees:** thin branches clamped to at least 1 px with alpha-to-coverage,
  painted-opacity skirts for the twig mass. The research has no evidence here (§c foliage 6), so this is
  a design spike with screenshots for the owner, not a gate.

**Acceptance** (research P5):
- average foliage overdraw ≤ 2–3× at the worst zoom;
- crown coverage within ±10% from the nearest to the farthest zoom;
- no heat ripple behind units;
- foliage ≤ 3 ms GPU.

**Depends on:** L1 (budget), L2. **Estimate:** 4–6 days, 2–3 PRs.

## L8. Anti-aliasing (research P6)

**Goal:** choose the anti-aliasing by an A/B test.

**The arms:**
1. 4× MSAA, alpha-to-coverage and `fwidth` thresholds;
2. the same plus TAA on terrain only, with units composited after it;
3. TAA on everything.

Check that MSAA is active on every render target drawn into. TAA must not own the soldier layer:
Babylon VAT writes no velocity, and the 12 fps steps reset its history.

**Acceptance** (research P6):
- the majority of reviewers judge soldiers crisper under the non-TAA arms;
- no crawl on band edges in a slow pan;
- the chosen arm fits the post budget.

**Depends on:** L3, L7. **Estimate:** 2–3 days.

## L9. Look match and prototype exit (research P7)

**Goal:** the look locked against the targets, every budget still met, and the prototype phase closed
(`docs/plans/active/prototype-plan.md` §1).

**Build** (art bible §4, §6, §6b):
- the warm saturated terminator;
- the warm rim;
- a cool shadow-tint volume;
- a warm depth wash;
- snow and ground brushwork in the albedo;
- periphery simplification (lower grain and band contrast toward the far and frame edges; no blur, decision 0003);
- a tilt-shift variant for A/B only;
- the video-tier frame (`docs/proposals/engine-design.md` §10 item 10): depth of field, mist, shafts, from a
  presentation camera.

**Acceptance:**
- the owner signs off side by side with `design/refs/north-star.png` and the Austerlitz images on
  palette, light and haze;
- every budget from L1–L8 still holds on the laptop;
- the prototype exit checklist (`docs/plans/active/prototype-plan.md` §1) is ticked;
- L1's and L9's measurements (the cost of runtime grain, the bake's memory and resolution) are written
  into `docs/proposals/prepainted-terrain.md`'s review.

**Depends on:** all. **Estimate:** 4–8 days, with iteration on the owner's feedback.

---

## Order and parallelism

```
L0 ──► L1 ──► L3 ──┐
  └──► L2 ──┬──────┴──► L4 ──► L5
            │                  L6 (after L4)
            └──► water W2–W5   L7 (after L1, L2) ──► L8 ──► L9
```

- **The critical path is L0, L1, L3, L4.** It answers the two biggest risks, performance and readability,
  before most of the look is built.
- **L2 runs beside L1.** Water follows L2.
- **Upstream assets:** Tripo or TRELLIS models (art bible §10) and the owner's brushes (§7) replace
  placeholders whenever they land. None of the phases waits for them.

## Open questions for the owner

1. **The laptop:** is a min-spec RTX 3060 laptop available for the L1 measurements? If not, which
   machine stands in, and do its numbers gate?
2. **The judges** for L4 and L5: who, and how many? The research's bars assume at least 5 and at least 3.
3. **Tilt-shift:** A/B it in L9, or rule it out now (decision 0003 forbids blur in gameplay; tilt-shift
   is blur)?
4. **Stepped animation comfort:** ship 12 fps steps as a setting that can be turned off (Insomniac did),
   or fixed?
5. **Soldier grain:** any at gameplay zoom, or only at the closest zoom (research open question)?

## Results

Each phase adds its results here (measurements, the JSON files in `track-e-results/`, the judges'
tallies, and what changed from this plan).
