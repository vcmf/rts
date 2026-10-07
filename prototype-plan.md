# Prototype Plan

What the prototypes are for, how they are built, and the current workstream (**water**).

## 1. Purpose

The prototypes lock the **look** before any game code: a painterly, top-down Napoleonic
battlefield that runs at 60 fps in a browser (game tier) and renders at film quality offline
(video tier). When the look is locked, the rendering code moves into `render/` of the real game
(`web-rts-architecture.md`), behind the sim/render split.

**Exit criteria for the prototype phase** (the look is "locked" when):
- [ ] A screenshot of the game-tier view holds up next to `design/refs/north-star.png` for light,
      colour, depth and composition (judged by the art director).
- [ ] Terrain, vegetation, water and seasons all follow `design.md` without per-asset hacks.
- [ ] 60 fps measured at 1080p on an M1-class Mac (GPU frame time ≤ 12 ms).
- [ ] The same scene renders a video-tier frame with depth of field, mist and light shafts.
- [ ] Real elevation and real rivers load for at least one historical battlefield.

## 2. Where we are

| Area | State | Notes |
|---|---|---|
| Painterly shading (ramp, grain, edges, rim, backlight) | ✅ done | `painted-cinematic.html` |
| Light: baked light map, sun shadows, occlusion | ✅ done | review round 1 fixed (10 findings) |
| Cinematic layer (grade, bloom, mist, shafts, DOF option) | ✅ first pass | tuning pending |
| Seasons and tree colour variety | ✅ done | `design.md` §4b |
| Vegetation assets | 🟡 placeholder | Quaternius pack; Tripo assets later |
| **Water** | 🔴 **in progress** | the river "looks like a scarf"; this plan |
| Brush library (painted grain/fill textures) | ⏳ waiting | user paints in Procreate |
| Performance pass (tiling, LOD, measured frame time) | ⏳ | after water |
| Real terrain + historical import | ⏳ | after water |
| Units and buildings | ⏳ | Tripo / TRELLIS |
| **Staff map** (far zoom, zoom transition) | 🟡 feel prototype | `staff-map/plan.md`, `prototypes/staff-map.html` |

## 3. Process

Every PR follows `AGENTS.md` → Workflow: **plan → implement → `/code-review high`**, another review
round only while a round finds at least one severe issue, and a **redesign after 3 rounds**.
Each PR below is one logical change, verified with headless screenshots at fixed camera
positions (before and after) attached to the PR.

## 4. Water workstream

Source: `research/stylized-water.md` (§1.4 order of work, §2 implementation plan).

### 4.1 Problem

- **Shape:** a sine centre line with a constant-width cut; no real bends (x is a function of z),
  no valley, the channel narrows on diagonals, and the terrain grid (1.73 m) is too coarse for banks.
- **Rendering:** water and terrain disagree at the shoreline; reflections, flow and foam are
  generic; nothing reads as pools vs. riffles.

### 4.2 Design (target)

**Shape:**
- **River = spline with per-sample attributes:** width, depth, bank asymmetry, water level,
  speed, riffle (data model in research §2.1). One shared query (`riverAt(x,z)`) answers "nearest
  river sample and its attributes" for the terrain, the bake, the meshes and the scatter.
- **Meanders:** Kinoshita curves inside a valley frame. Bend length ≈ 11 widths, radius ≈ 2–3
  widths, per-bend jitter.
- **Width:** ∝ √discharge, steps up below tributaries, narrower at bends (the point bar), wider
  at riffles.
- **Pools at bends, riffles between them** (5–7 widths apart). Riffles are fords (gameplay).
- **Asymmetric banks:** a steep cut bank outside each bend, a shallow gravel point bar inside.
- **Valley and floodplain** carved along a smooth valley line. The water level never rises
  downstream.
- **Ponds and mill dams** as polygons with a flat level (Satschan, winter ice).

**Rendering:**
- **Water-data bake** once per map: one world-space texture with depth, distance to the shore,
  flow direction and a foam source.
- **Opaque water that paints the river bed** with the terrain colour at zero depth, so there is
  no seam at the shoreline. View depth stays in alpha for the depth of field pass.
- **Layers, in order:**
  1. Three-band depth ramp with grain-broken edges
  2. Painted sky tint at grazing angles
  3. Baked tree reflections (crisp in pools, broken on riffles)
  4. Flow strokes along the river's time-of-travel coordinate (stretched in fast water,
     bunched in pools)
  5. Sun glitter
  6. Hard-edged painted foam (shore, riffles, rocks, weirs)
  7. Shadows, mist, grade
- **Banks:** a dark wet band, bare earth on cut banks, pale gravel on bars, reeds.
- **Rejected:** `MirrorTexture` and Babylon's `WaterMaterial` (they re-render the scene and
  assume flat water), and transparent water (it breaks depth-in-alpha).

### 4.3 Implementation phases (one PR each)

| PR | Scope | Research ref | Acceptance (screenshot-verified) | Est. |
|---|---|---|---|---|
| **W1** | `feat(water)`: river data model, Kinoshita centre line, attribute rules, `riverAt()` query; the existing water shader renders on the new path | §2.1–2.3 | Bends turn back on themselves; width visibly varies; pools and riffles alternate; no "scarf" at any zoom | 0.5–1 d |
| **W2** | `feat(terrain)`: asymmetric channel carve, finer bank geometry (valley + floodplain moved into W1) | §2.4–2.5 | Cut banks steep, point bars shallow; no terrain stair-steps at banks | 1–1.5 d |
| **W3** | `feat(water)`: water-data bake (depth, SDF, flow, foam) bound to terrain and water | §2.6 | Debug view shows correct depth, SDF and flow arrows; no per-frame cost added | 1 d |
| **W4** | `feat(water)`: ribbon mesh per channel + pond polygons, opaque bed-painting shader, all layers | §2.7–2.8 | No shoreline seam or flicker; pools read dark and calm, riffles light and foamy; 60 fps holds | 1.5–2 d |
| **W5** | `feat(water)`: banks painting, rocks, weirs, fords, reeds; seasons (ice, autumn leaves) | §2.9, §4.4, §4.10 | Banks read wet/bare/gravel; foam around rocks; winter freezes ponds cleanly | 1–1.5 d |
| **W6** | `feat(terrain)`: OSM + Terrarium importer for a historical battlefield (Austerlitz) | §3.6 | Real Goldbach and (1805) Satschan pond on real elevation | 2–3 d |

W1–W4 are the core: the scarf goes away in W1, the land fits in W2, and W3–W4 deliver the painted
water. W5 and W6 can be reordered after a look review.

### 4.4 Risks

- **Bank detail vs. performance:** finer terrain near rivers adds triangles. Use a bank strip
  mesh instead of densifying the whole grid if the frame time grows.
- **Kinoshita looking too regular:** per-bend jitter plus a slow random walk of the valley line.
  Judge this on screenshots at three zooms, not in one view.
- **Bake and terrain disagreeing:** both read the same `riverAt()` and `H()`; never duplicate
  the river formula in GLSL (a review-round-1 finding).
- **Spiral risk:** if W4's review needs more than 3 rounds, stop and revisit the opaque
  bed-painting design.

## 5. After water (backlog)

1. Performance pass: spatial tiling of instances, LOD and fade, measured GPU frame time.
2. Brush library v1 from Procreate (grain, grass, foliage fills).
3. First Tripo assets (one tree, one building) under the shaders.
4. Real terrain + historical import beyond Austerlitz.
5. Staff map SM1–SM4 (`staff-map/plan.md`), after the SM0 feel review.
6. Exit-criteria review → start the game repo structure (`web-rts-architecture.md` §2).
