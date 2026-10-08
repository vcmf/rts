# Engine Design: World, Camera, Bakes

Status: **agreed direction, details open** (Oct 2026). The full list of engine parts, including the
simulation, is in `engine-map.md`. Companion to `web-rts-architecture.md`, which
covers the sim/render split, the data model and the tick. This document covers the **world** the
renderer draws, the **camera** that looks at it and the **baked data** that lights it, and splits
the work into what the prototype needs now and what the engine needs later. An adversarial review
of the first draft is folded in (§12).

## 1. Why this document exists

The W1 river PR stopped three times (`plans/w1-river-shape.md`). Two causes, both real:

**Missing engine concepts.** Many severe findings came from things no module owned:

| Finding (W1 reviews) | What was missing |
|---|---|
| River dashed, floating or hidden where the detailed tile met the far ring (5 rounds) | Two terrain resolutions with no contract for how they meet |
| Shadow frustum missed the tile corners; light map, AO and shadow went coarse | Coverage and resolution typed by hand (12 constants), not derived |
| Camera target climbs without limit when panning at the edge | Pan in view space (Babylon default); bounds bolted onto a Babylon object |
| Checks projecting onto the wrong surface; instances placed by one height and drawn on another | Several answers to "how high is the ground here" |
| Checks that could never fail; checks passing on a black frame | Verification added per finding instead of designed |

**Process and scope.** W1 was estimated at 0.5–1 day. Each redesign added scope: the valley and
floodplain moved in from W2, then corridor patches, then the tile grew from 520 to 800 m, then
the stitch strip and the render check. Round 3's shadow bug was caused by W1's own redesign (main
covered its tile), and the camera drift exists on main. Rules for this are in §11.

## 2. Scale and hardware targets (decided Oct 2026)

| Target | Value | Consequence |
|---|---|---|
| Play area | **1–1.5 km** square (the prototype stays at 500 m until the chunk step, §10) | Detail terrain ≈ play + 2 × ~150 m margin ≈ **1.8 km**; uniform chunks needed (§4) |
| Units | **20–40 formations × 100–200 figures** = 2k–8k figures | Instanced figures with LOD, stepped vertex animation, own shadows (§7) |
| Camera | **Locked down**: short zoom, pitch from zoom, **yaw ±45°** around a default | No distance LOD or streaming, ever; the sun stays behind the scene for the backlit look |
| Min-spec | **Gaming laptop, RTX 3060 (laptop) or better**: 6 GB VRAM, WebGL2, 1080p at 60 fps | Bake memory and texture size are not the constraint (§6); frame budget (§8). The dev Macs are not the target: they serve as a conservative proxy until a 3060 laptop is measured |

## 3. Principles

1. **One world spec, everything derived.** Extents, cell sizes and texel sizes are declared once;
   shadow frustums, bake sizes, camera bounds and check views are computed from it and validated
   at load.
2. **One heightfield is the truth.** A sampled height grid is the authority for the sim, the
   renderer and the tools. Formulas (`H()`) and real elevation data are *authoring* inputs that
   produce it.
3. **Coverage is a contract.** Every world-space resource declares what it must cover and at what
   texel size; the engine sizes it and asserts it.
4. **The camera is locked down**, so the engine never needs distance LOD or streaming.
5. **Verification is part of the engine**, with a negative test for every check.
6. **Small steps on the engine's seams.** Each change is one reviewable PR; no big-bang rewrite.

## 4. World spec and terrain

```ts
interface WorldSpec {
  play:   Rect          // where the camera focus may go (the battle area)
  detail: Rect          // full-resolution terrain = the heightfield's extent
  far:    Rect          // coarse backdrop terrain out to the edge of any view
  cell:   number        // m, heightfield spacing (today 1.79)
  farCell: number       // m, integer multiple of cell; detail edges lie on far grid lines
  chunk:  number        // m, integer multiple of farCell (~100 m)
  texel: { shadow: number, light: number, ao: number, mask: number }   // m per texel targets
  seed: number
}
```

**Derived and checked at load (throws on failure):**
- `far ⊇ play ⊕ R` at the widest supported aspect, where `R` is the camera footprint (§5):
  no view ever sees past the world.
- `detail ⊇ play ⊕ margin`: views near the play edge show the far ring only toward the frame's
  far side. `margin` (~150 m today) is checked on screenshots at the play-area corners.
- Grid alignment: `farCell / cell` and `chunk / farCell` are integers; the detail edge lies on far
  grid lines.
- Every bake fits the min-spec texture and memory limits (§6); the spec fails rather than going
  coarse silently.

**The heightfield** is an array on the `cell` grid over `detail`, **built offline by a Node build
step** (from `H()` today, from elevation + river data in W6) and shipped as data, then read by
everything. Building it in each browser would make the sim's input depend on that browser's
`Math.sin` (`sim-design.md` §2):
- `heightAt(x,z)`, `normalAt(x,z)` interpolate it with **the same triangle split as the mesh**,
  so the ground drawn and the ground used are equal by construction.
- The detail mesh is built from it vertex for vertex. Scatter, units, picking, camera focus height,
  water edges and checks read it. `sim/` gets it as plain data, so terrain is deterministic data,
  not trig evaluated per JS engine (`web-rts-architecture.md` §4).
- **Gameplay layers** live on the same grid as sim data, never as render bakes: water depth
  (fords are riffles shallow enough to cross), passability and slope, later ice by season.

**Chunks.** At 1.8 km and 1.79 m cells the detail terrain is ~1M vertices / 2M triangles, which a
3060 draws easily in one mesh. Chunks (~100 m, every chunk the same resolution, as in Age of Empires
III, Company of Heroes, StarCraft II) are still worth it for **scatter**: grass, wheat and trees
grow with the area (~13× today's counts at 1.8 km), and culling instances per chunk keeps them in
budget. Chunk edges share vertices, so seams are exact. Bakes stay single textures (§6).

**The far ring** is a render-only backdrop: coarse grid, valley trough only, the river painted as
a line, stitched exactly to the detail edge (the W1 apron). Nothing in gameplay touches it.

## 5. Camera

- **State (ours):** focus `(fx, fz)`, distance `d ∈ [dMin, dMax]`, yaw ∈ default ± 45°.
  Focus height = heightfield, smoothed over ~30 m so the view does not bob.
- **Pitch from distance** in a narrow band, **capped** so the top of the frame never reaches the
  horizon: `pitch(d) ≤ π/2 − fov/2 − margin` (≈ 1.15 rad from vertical at fov 0.62). This is the
  no-sky rule (`design.md` §1.2) as an invariant.
- **Pan in the ground plane** (speed ∝ d): the camera cannot drift up. Prototype: Babylon's
  `mapPanning` plus the focus clamp; our own controller at prototype exit.
- **Footprint `R`** = the largest ground distance from the focus to a frame corner over all allowed
  `d`, pitch, yaw, the widest supported aspect and the lowest terrain. Computed, not typed
  (~400 m today at 16:9). It feeds §4.
- **Picking:** screen ray against the heightfield, then unit bounds.
- **Presentation cameras** (photo mode, replays, video export) are separate controllers, may leave
  the gameplay bounds but not `far`, and still never show sky.

## 6. Bakes

A bake is a world-space texture computed once per map (load time in the prototype, shipped files
later). Each declares coverage, texel target, inputs and consumers.

| Bake | Covers | Texel | Inputs | Used by |
|---|---|---|---|---|
| Sun shadow depth | `detail` casters, fitted in light space | 0.33 m | static casters | light-map bake only; **disposed after** |
| Light map (sun vis., AO, valley mask) | `detail` | 0.26–0.5 m | shadow depth, AO, heightfield | terrain, scatter |
| AO + valley | `detail` + 40 m margin | 4 m | heightfield (+ `H()` beyond it) | light map |
| River mask | `far` | 1.3 m | river | far ring, apron |
| Water data (W3: depth, SDF, flow, foam) | `detail` | 0.5 m | river, heightfield | water |
| Tree reflections | `detail` | 0.5 m | scatter | water |

- **Fitted shadow frustum:** project the coverage corners (at min and max height) into light
  space for the ortho box and depth range; bias in metres.
- **No canvas filters or per-element strokes** (they lost the WebGL context in SwiftShader).
- **Min-spec limits (RTX 3060 laptop):** textures ≤ 8192² per bake; **bake memory ≤ 600 MB**
  resident (of 6 GB VRAM). At 1.8 km a single 0.26 m light map is 6900² (190 MB): it fits, so the
  light map stays one texture. The shadow depth map is disposed after the bake.
- **Budgets measured, not asserted:** bake time per bake (headless in CI, plus manual numbers on a
  3060 laptop; a dev Mac as a conservative proxy until then).

## 7. Units (rendering side)

2k–8k figures, readable first (`design.md` pillar 1).
- **Thin instances** per figure type, matrices written in place each frame
  (`web-rts-architecture.md` §3).
- **Figure LOD:** at max zoom a 1.8 m figure is ~8 px tall, so far figures drop to a very low-poly
  mesh or an impostor; full mesh only at close zoom. Budget to measure: ≤ 3M triangles for units.
- **Animation:** stepped at 12 fps (`design.md`), vertex animation textures, no skeletons on the
  CPU.
- **Shadows:** units are not in the static shadow map. Instanced contact blobs per figure (cheap),
  optionally one projected shadow per formation. Units without shadows look pasted on.
- **Picking and selection** against unit bounds, then the heightfield.

## 8. Verification and budgets

| Layer | Examples | Runs |
|---|---|---|
| Spec invariants | coverage, alignment, bake sizes vs. min-spec, footprint vs. far, pitch vs. horizon | at load (throws) |
| Geometry | stitch exact, water above bed, nothing in water or zones, banks not floating | headless, every PR |
| Pixels | differential render (river visible, banks dry, far line); golden screenshots, time frozen | headless, every PR |
| Budgets | load and bake time, GPU memory; GPU frame time per pass on min-spec hardware | per PR / per milestone |

**Frame budget (RTX 3060 laptop, 1080p, 60 fps = 16.7 ms; target ≤ 12 ms GPU):** terrain ~1.5 ms,
scatter ~3 ms, units ~3 ms, water ~1 ms, post ~2 ms, headroom ~1.5 ms. The 4 ms left under 16.7 ms
is the margin for 1440p screens and video-tier effects. Numbers are estimates until the performance
pass measures them.

- Every check gets a **negative test** when written.
- Where a check reuses the code it checks, add an independent oracle for the critical cases.
- Checks follow the risk a PR introduces, not the history of findings.

## 9. Known issues (to fix, planned)

Grave findings in code that already exists on main are recorded here with a planned fix instead of
blocking an unrelated PR (§11).

| Issue | Where | Planned fix |
|---|---|---|
| ~~Camera pans in view space; the target can climb without limit~~ | main, camera setup | **Fixed in W1** (#1): ground-plane pan + focus clamp, checked by render-check |
| Reflection canvas uses a canvas blur filter (the context-loss pattern) | main, reflection bake | E0-lite bake rules (§10 step 3) |
| Up/down pans move the map cos(pitch) as fast as left/right (0.56× at the steepest pitch) | main, Babylon panning | Own camera controller: drag keeps the grabbed ground point under the cursor (§5) |

## 10. Order of work

### Now
1. ~~**Close W1.**~~ Done (#1, #2): fitted shadow box, ground-plane pan, then W1b width variation.
   The simulation track (S0, S1) runs beside this one: see `engine-map.md` §4.

### E0-lite (engine spine, small PRs)
2. `SPEC` object with derived sizes and load-time invariants (incl. footprint, pitch cap, yaw range).
3. Heightfield as the truth (mesh, placement, checks read it); bake rules (fitted frustum, no
   canvas filters); far yOff and AO-edge fixes fall out.
4. Negative tests for the existing checks; golden-screenshot diff.
5. Split the prototype into ES modules (its own PR, no behaviour change).

### P: finish the prototype
6. **Units placeholder**: a few formations as thin instances with LOD, contact shadows and picking.
   Before water: it tests camera, readability and terrain data where the game will use them.
7. **W2–W5** water.
8. **Scale up**: grow the play area to 1–1.5 km, scatter culling by chunk, light map at full size;
   measured on a 3060 laptop.
9. **Performance pass** with per-pass budgets (§8), full unit count (8k figures).
10. **Video-tier frame** from a presentation camera.
11. **W6** Austerlitz from real data; defines the map file format (heightfield, river samples,
    zones, gameplay layers).

### At prototype exit / later
| Item | Trigger |
|---|---|
| Vite + TypeScript game structure (`web-rts-architecture.md`), our own camera controller | prototype exit |
| Shipped bake files (KTX2) | W6 / bake time over budget |
| River network (tributaries, ponds, mill dams) | W6 |
| GPU or worker bakes | measured need |

## 11. Process rules (AGENTS.md)

- A finding about code that already exists on main does not block the PR. If it is grave, it is
  recorded in §9 with a planned fix.
- The review round count restarts after a redesign (unchanged).
- A redesign may widen or cut scope: it can find a miss that must be built, or a simpler design.

## 12. Adversarial review: what changed

| Challenge | Outcome |
|---|---|
| Diagnosis ignored scope creep and the review loop | Accepted: §1, §11 |
| "Surface reads the drawn mesh" contradicts the sim/render split | Accepted: heightfield as truth (§4) |
| E0 was a 5–8 day disguised rewrite | Accepted: E0-lite in small PRs (§10) |
| Footprint maths wrong (~400 m with frame corners); pitch-from-distance can show the horizon | Accepted: computed footprint, pitch cap (§5) |
| Fords, ice, passability must be sim data | Accepted (§4) |
| Static shadow cannot hold units; budgets unmeasured; no memory budget | Accepted (§6, §7, §8) |
| Units placeholder before water | Accepted (§10) |
| Keep the single file until prototype exit | Partly: modules in their own PR after E0-lite |
| Review count should not restart after a redesign | Rejected by the owner: it restarts; pre-existing grave findings go to §9 instead |
