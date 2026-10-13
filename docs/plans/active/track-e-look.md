---
status: active
last_reviewed: 2026-10-13
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
| `docs/research/painterly-2d-on-3d.md` | Brush masks inside the ramp (not over it); which coordinates keep paint attached per surface (world for terrain, object-local for rigid props, authored UVs for skinned soldiers); the one-hill, one-tree, one-soldier validation scene |
| Decisions | 0001 (look in assets and materials, not filters), 0002 (top-down, no sky), 0003 (no blur in gameplay), 0007 (battalions of about 100, one figure each), 0010 (locked camera and staff map), 0011 (scale and min-spec), 0012 (heightfield authority) |
| `docs/art-bible.md` §0 (reference images) | The targets the look is judged against, each with what to take from it and what to ignore |
| The soldier animation trial (below, LA) | The first real figure: a Tripo French line infantryman, rigged, with authored clips |

**The rule from all of them: paint the world, keep the units clean.** Soldiers are 10–30 px tall at
gameplay zoom. The painting lives in ground, trees, buildings, smoke and light; units carry value,
silhouette and colour, and almost no brushwork.

**Paint on units depends on size on screen** (proposed decision 0017). This settles the research note
(`docs/research/painterly-2d-on-3d.md`, authored-UV cloth marks) against the rule above. A figure's paint is a greyscale
brush mask on authored UVs, so it moves with the cloth; the palette paints the colour regions, and the
generated model's own colours are never used (AGENTS.md invariant). No world-space or screen-space
grain ever touches a unit. The shader fades the marks toward flat colour regions as the figure's pixel
height drops, so at
gameplay zoom a unit reads as value, silhouette and colour, and the marks show only at the closest
zoom. The threshold is set by L3's A/B, not here.

## Naming

The research report numbers its steps P0–P7, but `docs/proposals/engine-design.md` already calls a phase **P** (finish
the prototype). This plan's phases are **L0–L9** (L for look):

| Phase | Research step | Engine-design §10 item |
|---|---|---|
| L0 Spine | none | E0-lite (2–5) |
| L1 Units and benchmark | P0 | 6 |
| LA Asset pipeline (beside L1–L3) | none (research §d risk 12) | none |
| L2 Terrain detail layer | P1 | none |
| L3 Soldier look | P2 | none |
| L4 Readability gate | P3 | none |
| L5 Macro colour bake and ablation | the terrain proposal's validation | none |
| L6 Smoke | P4 | none |
| L7 Foliage and edges | P5 | none |
| L8 Anti-aliasing | P6 | none |
| L9 Look match and prototype exit | P7 | 9, 10 |

Water W2–W5 and the Austerlitz import W6 continue under `docs/plans/active/prototype-plan.md` §4. They slot in after L2
(below). Maps are described in one format (`docs/proposals/map-format.md`), a separate workstream.

## Current focus: the world first (owner, 2026-10-10)

**For now the track paints the landscape and the buildings; units stay as they are.** The phases run
in two stages:

| Stage | Phases | Notes |
|---|---|---|
| **1. The painted world (now)** | L0, L2, water W2–W5, L5, LA2, L7, L9w | L9w is L9's look match for ground, water, trees and buildings only (below) |
| **2. Units (deferred)** | LA0, LA1, L1, L3, L4, L6, L8, the rest of L9 | Kept as written, so the plan is ready when units come back |

What changes while units wait:
- **Readability guard.** The painted ground must still leave room for the armies (art bible pillar 1;
  research §c terrain 9: the ground under the battle stays mid-value and low-chroma). Each stage-1
  screenshot set adds flat blocks in the army colours (art bible §4) at battalion size on the ground,
  and a greyscale capture must separate every block from the ground under it. This is a cheap
  stand-in for L4, not a replacement.
- **Budgets** are measured per pass for terrain, foliage, buildings and water; the units' share of
  the frame (engine-design §8) stays reserved and unmeasured, so the world must fit its own split.
  The bench harness (described under Measuring, first planned in L1) is built in L2's first PR with
  world scenes only, and L1 later adds its unit scenes to it. The laptop is needed in stage 1 too.
- **Stage 2 re-checks stage 1.** L4 re-runs L5's chosen arm and L7's heat-ripple check with real
  units and smoke. A failure there sends L2, L5 or L7 back, like any L4 failure.
- **L9w** signs the world off against the primary targets (`docs/art-bible.md` §0), with their
  armies ignored: palette, light, haze and brushwork on ground, water, trees and buildings, in one
  summer and one winter target.

## Working beside the logic track

### Who owns what

| Area | Owner | Notes |
|---|---|---|
| `src/sim/`, `src/rulesets/`, `src/scenarios/`, `test/` (sim tests), the calibration tool | logic | The style track reads; it changes nothing here |
| `src/render/soldiers.ts`, `src/render/map.ts`, `src/app/` (the staff-map page) | logic | The 3D renderer reuses `SoldierLayer` (below); a change it needs goes in a small PR the logic track reviews |
| `prototypes/` | style | Single-file look prototypes, until L0 moves them |
| New: the look code (`src/look`), its page (look.html in `app/`), the bench tools and look tests | style | The 3D renderer, its shaders, bakes and checks |
| `docs/art-bible.md`, `docs/research/` (look), `design/refs/`, `docs/asset-sources.md`, this plan | style | |
| Asset sources and their build scripts (LA): models, clips, the tools that bake them | style | Raw packs and generated sources stay out of git (`.gitignore`); what the game loads is committed |
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

**Known ask, from L1 and LA:** the figure's clips have lead-in time. From the shoulder carry a figure
makes ready before it fires, so the shot comes more than a second after the clip starts (times in the
clip graph, LA0). Started when `volleyTick` changes, it fires visibly late. The renderer cannot derive
"a volley is coming" from the sim's reload countdown and target: the countdown doubles as a 0.5 s
retry timer, and a company keeps a target it cannot fire at (`docs/systems/fire-morale.md`). The ask
is an accessor the logic track defines, such as the tick a company will fire if nothing changes.
Until it lands, the renderer starts at the volley and accepts the lag; it never predicts the sim's
decisions on its own. The sim's reload is longer than the reload clip, so figures hold the ready
pose for the rest; the clip is never stretched to fit.

### Rules

- **The workflow** (AGENTS.md):
  - plan, implement, `/code-review high`;
  - another round only after a severe finding; a redesign after 3 rounds;
  - no AI attribution in commits or PRs; squash merges.
- **A separate checkout.** The style track works in its own git worktree beside the main checkout
  (`git worktree add ../rts-track-e`), on branches named `look/<phase>-<topic>` cut from
  `origin/main`. It never edits files in the logic track's checkout, and
  it rebases on `origin/main` before each PR.
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
- **The look sign-offs (L9w in stage 1, L9 in stage 2):** the owner, against the target images.

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

## L1. Units and benchmark (research P0)

**Goal:** thousands of figures on the painted terrain, driven by the sim, measured on the min-spec
laptop before any further art. **This is the riskiest unknown in the track** (research §d, risk 1). Its
answer can change art decisions, so it comes first in stage 2.

**Build:**
- **The soldier:** the French infantryman from LA1 (retopologised LODs, about 300–400 triangles at LOD0
  and 120–150 at LOD1, separate colour regions for coat, facings, trousers and headgear: art bible §5).
  If LA1 has not landed when L1 starts, a procedural placeholder of the same budget stands in, with
  stand and march clips baked from a procedural rig by a small tool in `tools/`; the benchmark is run
  again on the real figure, with the firing loop, before L1 closes. A shako silhouette exaggerated
  1.2–1.5× (research §c, soldiers 1), in the LOD meshes rather than in the source.
- **Stepped animation** at 12 fps from a vertex animation texture (Babylon's
  `BakedVertexAnimationManager`), baked from LA1's clips. For the benchmark: march, halted (the
  march's first pose held: the trial has no idle clip), and the firing loop.
  - The phase is **fractional** per battalion, so not all figures change pose on the same frame (§c,
    soldiers 4).
  - Clips cut on step boundaries. In normal flow they cut only where the clip graph has an exact
    join, since VAT has no blending. An **interrupt** (a new order, a rout) cuts at the next step
    to the nearest exit the graph offers: a one-step pop, counted in the results, until LA1's
    transitions cover it.
  - Which clip a figure plays is decided by **roles** (advance, halt, make ready, fire, reload, rout,
    melee) that the clip graph maps to clips, as data. The renderer maps sim state to roles (moving,
    halted, `volleyTick`, `mstate`) and never names a clip or weapon (decision 0015). The firing
    lead-in is the known ask above.
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

**Depends on:** L0 to start; LA1 to close. **Estimate:** 5–8 days over 2–3 PRs (figure and VAT; instancing and shadows; the
harness and scenes). **Decision after L1:** whether WebGL2 is CPU-bound on submission at this scale. If
so, WebGPU moves up (research open question).

## LA. Asset pipeline (beside L0–L3)

**Goal:** generated models become engine assets that the shared painted material paints, within
budget, with their licence on record. No phase before this one owns that path (art bible §10), and the
first real assets exist: a rigged French infantryman with 14 authored clips, and concept images for
the infantryman and the barracks in `design/refs/`.

**Where the soldier stands now** (as of the trial's v8, in the owner's checkout under
`output/soldier-animation/`, not in git). A Tripo French infantry FBX (a Mixamo-style rig) with
clips authored in Blender: walking, running, standing and kneeling fire, the 1791 firing drill (make
ready, fire, a reload with a working ramrod), bayonet guard, thrust and butt stroke, and transitions.
One GLB holds every clip; its `clips.json` gives the graph, joins and event times for the drill and
melee clips only. Checks cover grips, joins, rigid weapons, ground contact, wrists and neck. Its
README is the source for every number; this plan copies none.

1. **LA0, land the sources.** Into git: every script the latest build imports or reads, and the files
   they generate along the way (under `tools/`; comparisons against the trial's earlier versions are
   history and stay out), and a clip graph that covers
   **every** clip, each with its role (the trial's `clips.json` covers only the drill and melee clips;
   LA0 adds the rest from the GLB and the trial's READMEs). Out of git: renders, videos, `.blend` scenes and the GLB, which
   are all rebuilt. **The licence comes first:** record in `docs/asset-sources.md` the source, the Tripo
   plan and the licence (a free-tier model cannot ship), and research §d risk 12's other duties
   (disclose AI-generated assets on Steam; flags, insignia and text are hand-made). Only then is the
   source FBX committed: it has no public download, so git is its one safe home. If the licence
   fails, the model is regenerated on a paid plan before LA0 lands.

   Acceptance: on a fresh checkout, the chain rebuilds the GLB from the committed FBX and the build's
   own checks pass; the clip graph lists every clip in the GLB (a check); the licence is recorded.
2. **LA1, the figure for crowds.** The Tripo mesh is the shape source, not the shipped mesh (research
   §d, risk 12: retopology onto a canonical soldier mesh). So:
   - a canonical soldier mesh at the L1 LOD budgets, retopologised over the Tripo shape and skinned to
     its rig with 1–2 bone influences, with clean authored UVs for the brush mask and the colour
     regions as 4 mask channels (coat, facings, trousers, headgear). Other nations and headgear are
     variants of this mesh;
   - a greyscale brush mask painted on those UVs (art bible §7 strokes, sized to the figure), the
     paint the size rule fades. The Tripo texture is only a guide for where the regions and folds
     are; its colours and baked light never reach the game;
   - authored transitions for the gaps the clip graph leaves: shoulder carry to port arms (into the
     run, for routs) and an exit from the reload back to the carry (the trial's reverse make-ready,
     baked as its own range);
   - a tool in `tools/` that bakes each clip into one vertex animation texture at 12 fps. Each clip
     is resampled to a whole number of 1/12 s steps that keeps its first and last pose, so joins
     stay exact; each event moves to its nearest step, and the tool reports the shift. The clip
     table (start, length, loop, joins, events) is generated from LA0's clip graph, never copied by
     hand;
   - writes committed, generated output the way `tools/obj-to-js.mjs` does.

   Acceptance: each LOD within budget; the VAT figure matches the canonical mesh's skinned pose at
   sampled steps (vertex error under 1 cm at LOD0); every join in the clip graph is exact after
   resampling; no event moves more than half a step; a screenshot at gameplay and closest zoom.
3. **LA2, one building.** The U-shaped barracks (`design/refs/french-barracks-u-v2-front.png`) through
   Tripo and clean-up into wall, roof, window and door regions that the palette paints, drawn with
   L0's ramp and the prototype's grain. It proves the pipeline for rigid props, gives L7 its first
   building and L9 a landmark; the building material (object-local grain, oriented strokes, edge
   skirts) is L7's, and so is the test that its marks stay attached.

   Acceptance: the licence is recorded in `docs/asset-sources.md` before the model is committed (a
   free-tier model cannot ship; LA0's rule); within 2–8k triangles; colour regions separate, with no
   colour taken from the Tripo texture; a side-by-side with the concept image at gameplay zoom for
   the owner.

**Out of scope:** cavalry and artillery models (L4's placeholders are enough until then), other
nations' uniforms (a palette change on the same mesh, art bible §4b's rule), and any clip the sim
cannot yet drive.

**Depends on:** nothing for LA0; LA0 for LA1 (L0 for its in-engine check); L0 for LA2. LA2 is in
stage 1 and records its own licence the way LA0 does; LA0 and LA1 are stage 2. **Estimate:**
6–9 days over 3 PRs (the retopology is the largest part).

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
- **Cost:** ≤ +1 ms GPU over L0's terrain (laptop, with the harness this phase builds).

**Depends on:** L0. **Estimate:** 4–6 days, 2 PRs.

**Then water:** W2–W5 (`docs/plans/active/prototype-plan.md` §4) go after L2, because their banks and bed painting use
the same projection and grain.

## L3. Soldier look (research P2; art bible §8)

**Goal:** units lit by the same ramp as the world, with a little grain that never swims or aliases, and
the readability features the research asks for.

**Build:**
- **The 3-band ramp on units:** a narrow warm terminator and a warm rim masked to the upper or back edge
  with a hard step. No per-figure outlines.
- **Paint on the figure** (the size rule under Sources): LA1's brush mask on authored UVs, plus at most one coarse grain octave sampled from the bind-pose position and a per-instance seed,
  clamped by derivatives. Both fade to flat colour regions below a pixel-height threshold, which this
  phase sets by A/B (owner question 5).
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
- **The threshold** where paint fades to flat, chosen by that A/B and written into
  `docs/art-bible.md` §8.
- **Units cost** still within L1's budget.

**Depends on:** L1, LA1. **Estimate:** 3–5 days, 2 PRs.

## L4. Readability gate (research P3)

**Goal:** proof that the painting does not cost the player the battle. **The track's main art-direction
risk** (research §d, risk 2). A failure here sends L2 and L3 back before more look is added; it also re-checks stage 1
(Current focus).

**Build:** formations in line, column and square for three armies, on the painted terrain, at gameplay
zoom, with flat-shaded baseline renders of the same scenes. A placeholder smoke (L6 is not built yet)
for the smoke-on arm.

**Acceptance:**
- **The blind test:** at least 5 people, 2 s exposures. Identification of army, arm (infantry, cavalry,
  artillery), formation and facing is no worse than the flat baseline, at ≥ 90% correct on each.
- **Greyscale:** a greyscale capture still separates every battalion from the ground under it.

Cavalry and artillery figures are needed for the "arm" question. Placeholders of L1's budget are enough: a
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

Run each at three zooms and three yaws, on the Pratzen framing, with one tree type and the
readability guard's army-colour blocks (no smoke in stage 1). When units return, the chosen arm is
checked again with two battalions and smoke.

**Acceptance:**
- **The judges:** at least 3, blind, using the checklist:
  - does it read as painted?
  - are the classes readable?
  - do the units look pasted on? (in stage 1: do the army-colour blocks stand out from the ground?)
  - does it shimmer or tile?

  An arm is kept only if the judges prefer it to the arm before it. The stroke painter is dropped
  unless arm 4 beats arm 3.
- **One full-size bake** is measured: bake time, peak memory (≤ 600 MB in total for bakes), and
  behaviour under SwiftShader (no lost context).

**Depends on:** L2 (in stage 1, the readability guard stands in for L4). **Estimate:** 4–6 days, 2 PRs
(the bake; the ablation set).

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

## L7. Foliage, buildings and edges (research P5; research §c buildings)

**Goal:** painted crowns and silhouettes that hold at every zoom within the foliage budget. The bare
winter trees the target images depend on, and the building material.

**Build:**
- spherized crown normals;
- stroke-shaped alpha masks on crown cards (or object-space hashed alpha, so swaying trees do not slide
  through the grain);
- alpha-to-coverage on 4× MSAA, toggled around foliage draws, with coverage-preserving mips baked
  offline;
- a depth pre-pass if overdraw at the worst zoom passes 2–3×;
- Edge Breakup on environment layers only (units masked out);
- **the building material** (research §c buildings 1, 3, 5): biplanar or object-local grain with
  oriented strokes feeding the normal before the ramp, painted-opacity skirts on silhouettes, and
  painting LOD by zoom; first on LA2's barracks. Its marks stay attached over the game camera's range
  (yaw −45° to +45°, every zoom, a pan; decision 0010);
- far woods switched to painted terrain colour;
- **a first attempt at bare winter trees:** thin branches clamped to at least 1 px with alpha-to-coverage,
  painted-opacity skirts for the twig mass. The research has no evidence here (§c foliage 6), so this is
  a design spike with screenshots for the owner. In stage 1 it is a gate: bare trees good enough for
  L9w's winter target, judged by the owner.

**Acceptance** (research P5):
- average foliage overdraw ≤ 2–3× at the worst zoom;
- crown coverage within ±10% from the nearest to the farthest zoom;
- no heat ripple behind units (in stage 1, behind the army-colour blocks; L4 re-checks with units);
- foliage ≤ 3 ms GPU.

**Depends on:** L2, LA2 (the first building); in stage 1 it measures its own budget rather than
L1's. **Estimate:** 4–6 days, 2–3 PRs.

**Progress (2026-10-13).** Built ahead of the phase, as experiments behind `?trees=cards` (the default arm keeps
the pack crowns): results in `docs/plans/active/track-e-results/shadows-foliage.md`, the technique's source in
`docs/research/tiny-glade-look.md`.
- **L7a, leaf-card crowns** (#58, `docs/plans/done/l7a-canopy-cards.md`): each broadleaf, birch and willow
  crown as camera-facing cards cut by a greyscale clump atlas our palette paints, casting leafy shadows. Read as
  painted leaf masses at the near and mid zooms (owner: "it's the way").
- **L7b, the crowns as volumes** (#61, `docs/plans/done/l7b-crown-volume.md`): a normal per pixel from the
  crown's ellipsoid, the light through it, a soft ramp (decision 0022, proposed), a darker core, a tilt per leaf
  (owner: "it's beautiful now the trees").
- **Cost so far:** `docs/plans/active/track-e-results/shadows-foliage.md` (the dev Mac, a proxy).

**What L7 still owes:**
- the cards as the default arm, once the guard passes with them (#63), the owner accepts decision 0022 and a forest
  costs less: about +3 ms GPU where one fills the frame (`docs/plans/active/forest-bench.md`), against fewer,
  larger cards for far crowns, the pack mesh beyond a distance, or a depth pre-pass;
- the outline at the widest zoom aliases: alpha-to-coverage on MSAA, L8's A/B;
- the acceptance above, measured on the cards: overdraw, coverage across the zooms, no heat ripple behind the
  army blocks (alpha-tested cards make it likelier), foliage ≤ 3 ms, in a battlefield forest and on the min-spec
  laptop;
- pines and bushes are still pack meshes; bare winter trees; the building material; far woods.

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
- the owner signs off side by side with the primary targets in `docs/art-bible.md` §0, on palette,
  light, haze and brushwork, one season per target (a summer and a winter target at least);
- every budget from L1–L8 still holds on the laptop;
- the prototype exit checklist (`docs/plans/active/prototype-plan.md` §1) is ticked;
- L1's and L9's measurements (the cost of runtime grain, the bake's memory and resolution) are written
  into `docs/proposals/prepainted-terrain.md`'s review.

**Depends on:** all. **Estimate:** 4–8 days, with iteration on the owner's feedback.

**L9w, the world-only match (stage 1):** the build items above that touch the world (the warm
terminator on ground and buildings, the rim on foliage tops only, shadow-tint volume, depth wash, snow and ground brushwork, periphery
simplification), signed off as described under Current focus. The units' items, the video-tier
frame and the full prototype exit wait for stage 2. **Acceptance:** the owner's sign-off, and every
stage-1 budget (terrain, foliage, buildings, water, post) still holding on the laptop with L9w's
passes on. **Depends on:** L2, water W2–W5, L5, L7.

---

## Order and parallelism

Stage 1, the painted world (now):

```
L0 ──► L2 ──┬──► water W2–W5 ─────────┐
  │         ├──► L5 ──────────────────┤
  │         └──► L7 (after LA2) ──────┴──► L9w
  └──► LA2 ──────┘
```

Stage 2, units (deferred):

```
LA0 ──► LA1 ──┬──► L1 closes
L0 ──► L1 ────┴──► L3 ──► L4 ──► L6
                          L3, L7 ──► L8 ──┐
                          L6 ─────────────┴──► L9 (full sign-off)
```

- **Stage 1's critical path is L0, L2, L7, L9w.** L2 is the base every ground, water and building
  surface reuses.
- **The order was risk-first** (L0, L1, L3, L4: performance and readability before most of the look).
  Deferring units moves those two risks later; the readability guard and the reserved unit budget
  keep them from being designed out by stage 1.
- **Water follows L2.** In stage 2, L1 needs only L0.
- **LA:** LA2 runs in stage 1 after L0. In stage 2, LA0 needs nothing; L1 starts without LA1 but
  closes only on its figure; L3 needs it.
- **Upstream assets:** Tripo or TRELLIS models (art bible §10) and the owner's brushes (§7) replace
  placeholders whenever they land. Only L1's close and L3 wait for an asset (LA1's figure).

## Open questions for the owner

1. **The laptop:** is a min-spec RTX 3060 laptop available for the stage-1 budgets and, later, the L1 measurements? If not, which
   machine stands in, and do its numbers gate?
2. **The judges** for L4 and L5: who, and how many? The research's bars assume at least 5 and at least 3.
3. **Tilt-shift:** A/B it in L9, or rule it out now (decision 0003 forbids blur in gameplay; tilt-shift
   is blur)? **Owner (2026-10-13):** open, after Tiny Glade ("simply astonishing and beautiful"): it may come
   back if a measurement shows it is good. Decision 0003 stands until a new record replaces it; an experiment
   (frame cost, formations at the frame's edges through the guard) decides. A first build is on its own
   branch (`look/gameplay-dof`, not yet a PR).
4. **Stepped animation comfort:** ship 12 fps steps as a setting that can be turned off (Insomniac did),
   or fixed?
5. **Soldier grain:** any at gameplay zoom, or only at the closest zoom (research open question)?
   The size rule under Sources makes this a threshold; L3's A/B proposes it, the owner accepts it.
6. **Licences** (LA0, LA2): which Tripo plan made the soldier and the barracks? LA0 commits the
   soldier's FBX and build chain only once that is recorded.
7. **Battle scale in the targets:** the v2 Austerlitz images show 200–400 men a battalion. Decision
   0007 keeps about 100, so those images are judged for mood, season and smoke, not for unit count.
   Is that right, or is the scale itself up for review (a new decision, not this track)?
8. **Headgear for the first battle:** the infantry concept and the trial wear the shako (from 1806);
   Austerlitz (1805) needs the bicorne. LA1 makes headgear a variant of the canonical mesh; which one
   comes first?

## Changes to this plan

- **2026-10-13, the shadows and the crowns.** Recorded the shadow work (Results) and L7's progress (L7a, L7b,
  what L7 still owes); the owner's answer on tilt-shift (question 3); decision 0022 (proposed); known issues #62
  and #63.

- **2026-10-10, focus.** The owner put units on hold: stage 1 paints the landscape and buildings
  (L0, L2, water, L5, LA2, L7, L9w), with a readability guard standing in for L4; the unit phases
  move to stage 2 unchanged.
- **2026-10-10, amendment** (the size rule is proposed as decision 0017). Added LA (asset pipeline) with the soldier animation trial as the source
  of L1's figure; the size rule for paint on units; the reference images curated in `docs/art-bible.md` §0;
  the note `docs/research/painterly-2d-on-3d.md` as a source; the volley lead-in ask; the style
  track's own worktree; buildings in L7; owner questions 6 to 8.
  Reviewed in two rounds (`/code-review high`): round 1 had severe findings (clip timing, sources,
  dependencies), all fixed; round 2 had none, and its findings were fixed.

## Results

Each phase adds its results here (measurements, the JSON files in `track-e-results/`, the judges'
tallies, and what changed from this plan).

- **The shadows (2026-10-12/13, between L5 and L7; not a phase of this plan).** The owner: "the shadow work of our
  trees in the whole map looks weak". The shadow look (#59, `docs/plans/done/shadow-look.md`): the valley mist no
  longer erases cast shadows, a cooler shadow band at the same value, crisper edges, a contact core under each
  tree. Its targets were missed (the valley narrowly, the slope by more): **slope shadows are still the weaker
  ones**, open for L9w. The soft shadows (#60, `docs/plans/done/soft-shadows.md`): the penumbra grows with the
  distance to the caster, each crown hides its share of the sky, the shadow deepens on a wood's floor; baked on
  load, nothing per frame. The guard's one regressed block was waived by the owner. The numbers, in one place:
  `track-e-results/shadows-foliage.md`.
- **L7a and L7b:** under L7, above.
