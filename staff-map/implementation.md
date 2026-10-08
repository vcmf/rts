# Staff Map: Implementation

How the staff map (`design.md`) is built in Babylon.js, and how it fits the sim/render split in
`../web-rts-architecture.md`. Status: **approach, validated only by the feel prototype**
(`../prototypes/staff-map.html`).

---

## 1. Two layers

| Layer | What | Where it lives | Why |
|---|---|---|---|
| **Paper** | Paper grain, hachures, woods, water, roads, villages, seasonal wash | A **map texture baked once per map**, sampled by the terrain shader | It must ride on the terrain when the relief rises, so it belongs to the ground |
| **Live ink** | Army blocks, orders, trails, smoke curls, labels, cartouche | A **2D canvas over the WebGL canvas**, redrawn every frame from sim state, with world points projected to screen | Crisp at any DPI, cheap patterns (hatching), easy text; it changes every frame |

The paper is baked, like the light map (`../design.md`: static things are baked once per map).
The live ink is UI-like and lives in `render/` (projection) and `ui/` (text and panels).

---

## 2. The `mapness` value

One number, 0..1, derived from camera distance each frame (`render/camera.ts`). It is computed in
**log space**, so each wheel notch moves the transition by the same amount:

```
mapness = smoothstep(log NEAR_3D, log FAR_MAP, log cameraDistance)   // prototype: 380 m, 1700 m
t       = 1 - mapness          // 0 at the map, 1 in the painted world
stage(a, b) = smoothstep(a, b, t)
```

`FAR_MAP` is set by the map texture: below ~1700 m the 1 m texels start to magnify, so the map
must already be handing over to the world.

Every stage in `design.md` §9 is a `stage(a, b)` window on `t`, read as a uniform by every
material and by the ink overlay. Tuned values live in one table, not scattered in shaders:

| Stage | Window on `t` (prototype values) |
|---|---|
| Tilt | 0.00 – 1.00 |
| Wash soaks | 0.10 – 0.60 |
| Relief rises | 0.15 – 0.70 |
| Symbols shrink to footprints | 0.15 – 0.48 (done before soldiers stand) |
| Trees and houses sprout | 0.30 – 0.80, staggered per instance |
| Place names fade | 0.35 – 0.70 |
| Ink lifts | 0.35 – 0.85 |
| Soldiers stand | 0.50 – 0.88, staggered per figure |
| Corps labels fade | 0.40 – 0.75 |
| Blocks fade | 0.55 – 0.88 |

Hachures also thin out (to 50%) as the camera closes from 2400 m to 900 m, because the baked
strokes get heavy when the texture is magnified.

Relief rising is a vertex shader scale on height (`y * stage(relief)`), so it costs nothing.
Normals blend toward up by the same factor.

---

## 3. Baking the map texture

Done once at map load, on the CPU into two offscreen canvases, then uploaded as two textures.
Alpha is never used (canvas alpha is premultiplied and would crush the colour channels).

| Texture | R | G | B |
|---|---|---|---|
| **A** | Hachures (own ink colour, cools in winter) | Woods: area 70/255, tree marks 255 | Water |
| **B** | Line ink: banks, roads, wood edges, houses, church crosses | Roads (earth tone in the world) | Village yards |

The shader colours the channels by season, so **changing season never re-bakes**.

### Hachures (Lehmann)
1. Sample the heightmap on a fine jittered grid.
2. Keep a sample only if it lies on a contour row (`fract(h / ΔH)` near 0) and its slope is above
   a threshold. An occupancy grid keeps samples at least `spacing` apart along the row.
3. From each kept sample, integrate **downhill** along the gradient until the height has fallen by
   about `ΔH` (the next row), so strokes stack in rows between contours.
4. Stroke width ∝ slope (Lehmann: steeper = darker). Slight jitter in width and end points so it
   reads as hand-drawn.

`ΔH` and spacing are set so rows are ~6–10 px apart at the default map zoom.

### Resolution
4096 px across the mapped area (≈ 1 m per texel on a 4 km field) holds up to ~3× zoom into the
map, which is where the zoom hands over to the painted world. Mipmaps and anisotropic filtering
on. If closer map zooms are needed, bake tiles instead of one texture.

---

## 4. Army blocks

- Drawn by the ink overlay, from the sim's per-unit data: position, facing, formation, frontage,
  strength, morale, type, side. `render/` reads it; `sim/` knows nothing about blocks.
- Corners are computed in world space (frontage × depth, rotated by facing), raised to the
  terrain height × relief stage, then projected. In map view the projection is exact; during the
  transition the blocks stay glued to the rising ground.
- Drawn size = `lerp(symbol × zoomScale, trueFootprint, stage(0.15, 0.48))`, where
  `zoomScale = clamp((mpp / mppTheatre)^0.6, 0.3, 1)` keeps symbols near a steady screen size.
  Depth is never under 5 px (`design.md` §6).
- Hatching for morale uses a canvas pattern; spacing grows as morale falls. Routing pulses between the
  army colour and white on a 1.1 s eased cycle, driven by the frame clock passed in.

### Soldiers
- Thin instances, one buffer per figure type (`../web-rts-architecture.md` §3, `unitRenderer.ts`).
- Each figure's slot inside the formation is derived from the same footprint as the block, so
  the block and the soldiers always agree.
- "Standing up" is a per-figure Y scale from 0 to 1 across the soldiers stage, offset by a
  per-figure random delay. At `mapness = 1` figures are not drawn at all (instance count 0).

---

## 5. Orders, trails, smoke

- An order is a path (world points). The command band is the path from the units' progress to
  the end, stroked at a screen width (8–20 px for a group), stopping where the head starts so the
  translucent band and head never overlap and double their opacity.
- Footprints are the order's own path, stamped every ~16 m of progress with the game time, up to
  how far the troops got (never a centroid of units, which jumps when a battalion leaves, routs or
  rejoins). Each dotted segment's opacity falls with its age, batched into six age buckets. They
  are render-side history, not sim state: the sim drops an order one step after it finishes, and
  the renderer keeps its footprint until it fades.
- A trace's visibility is one geometric test per sim step (one of its own battalions within 250 m
  of its end), eased toward 0 or 1 per frame on the frame clock (~1 s). No timers, chains or order
  bookkeeping: earlier designs based on order membership and trace chains kept failing review.
- The sim knows nothing about symbols: its spacing (45 m same side, 32 m enemies) and smoke
  (stored as a fraction along the unit's front) are independent of the zoom.

---

## 6. Labels and chrome

- DOM for the cartouche, panels and status bar (fonts, crisp text, accessibility).
- Canvas overlay for map lettering (place names along water, corps labels with leader lines),
  because they move with the map every frame.
- Label opacity follows the ink stage.

---

## 7. Performance

Measured in the feel prototype (Oct 2026): headless Chrome, ANGLE Metal on an Apple M1 Pro,
1920×1080, DPR 1, 74 units. Numbers are `requestAnimationFrame` intervals with the frame cap off,
not GPU timer queries, so they bound the cost rather than isolate it.

| View | Soldiers drawn | Median | p95 |
|---|---|---|---|
| Theatre (whole field) | 0 | 0.6 ms | 15.2 ms |
| Map | 0 | 0.8 ms | 14.4 ms |
| Field (mid-transition) | ~12,300 | 3.7 ms | 6.4 ms |
| Ground | ~12,300 | 3.7 ms | 6.6 ms |

- The p95 spikes at the far zooms are CPU-side (the overlay allocates per frame, and the sim
  steps in bursts); fix by reusing arrays before drawing more units.
- Map bake: 28k hachure strokes in ~140 ms on the main thread, plus ~2 s for the whole page build
  (heights, woods, textures). In the game, bake in a Web Worker with `OffscreenCanvas`.
- Soldiers are not drawn at all at map zoom, so the far view is the cheapest view.

---

## 8. What the prototype does not settle

- The prototype's 3D side lights terrain and props at runtime (`dot(n, sun)`). That is a
  stand-in: the art bible bakes static light once per map, and SM1 must use the baked light map
  of `painted-cinematic.html` under the map texture.

## 9. Video export

The map view needs no new renderer for video: a directed camera over the same data, plus the
trails, gives the Epic-History-style map sequence. Zoom-ins use the same transition.
