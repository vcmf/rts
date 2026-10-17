---
status: research
last_reviewed: 2026-10-16
---

# Toward 120 fps: where the look page's frame goes, and what to cut

Research notes, October 2026. The owner (2026-10-16): 60 fps is the hard target, 120 fps a soft one, "without
compromising much". Two passes: a reading of our own code and a headless count of its draws, and a survey of the
published techniques. What was built from them is in `docs/plans/done/trees-perf-trunks.md`.

## 1. Measure the frame interval, not only the GPU timer

The bench's "GPU frame" (the timer query) reads higher than the frame interval at every zoom: in the tree-generator
bench, close 6.3 against 4.2 ms, default 8.4 to 10 against 5.6 to 6.7, widest 12.4 to 13.5 against 7.9 to 8.8
(`track-e-results/tree-gen-2026-10-14-62b166b-gen-run1-summer-mac-proxy.json`). The GPU cannot take longer than the
interval, so the timer over-reports here, by about a third. On the M1 (a tile-based GPU) the scene's pixel work runs
when its render pass resolves, so the timer bills much of it to the post pass: adding far trees moved post from 4.3
to 6.6 ms while the interval moved 0.7 ms. **The interval is the number to judge by on this Mac; the min-spec laptop
(RTX 3060, an immediate-mode GPU) must be measured on its own** (MSAA and overdraw behave differently there).

## 2. Where the frame goes (our code, counted headless)

- About 110 draws and 3.2 M triangles a frame before this work, the same at every zoom: **nothing was culled.** Every
  scatter mesh has `alwaysSelectAsActiveMesh`; a thin-instance mesh is culled as one box, so a ring of trees is never
  culled at all (Babylon forum: https://forum.babylonjs.com/t/question-about-thin-instance-frustum-culling/43272).
- **The terrain** is about 90 % of the pixels: 17 to 22 texture reads a pixel, up to about 30. Measured: the detail
  layer (L2) costs 0.6 ms close, 1.1 to 1.3 default, 2.9 to 3.0 widest on the timer.
- **The meadow:** 1.8 M of the triangles (three rings of clumps); the vertex shader culls each clump, but every vertex
  still runs.
- **The leaf cards:** a `discard` in an opaque, depth-writing material, about 2.6 layers of cards a crown; on Apple's
  GPUs a discard stops hidden-surface removal, so every layer is shaded. Never culled, no level of detail.
- **Post:** the scene in a 1920×1080 RGBA16F target with 4× MSAA; the fused pass at full resolution reads about 15
  texels a pixel, 12 of them for bloom.
- **CPU:** about 17 uniforms on each of 22 materials every frame, under 1 ms (estimate).

## 3. The techniques (survey)

Published talks rarely give per-technique savings; where a number below is an estimate it says so.

| Technique | Evidence | For us |
|---|---|---|
| **Culling by area** (tiles, or per instance on the CPU) | standard; the Babylon thin-instance limit above | the prerequisite for any level of detail |
| **A level of detail for distant crowns**: fewer, larger cards, the crown as a mesh, or octahedral impostors | impostors: https://shaderbits.com/blog/octahedral-impostors; a three.js forest of 200k impostors: https://discourse.threejs.org/t/a-forest-of-octahedral-impostors/85735; Unreal 5.7 voxelises distant foliage (https://80.lv/articles/check-out-new-features-arriving-with-unreal-engine-5-7) | the biggest lever at the widest zoom; no published ms |
| **Early-z with discard**: draw what discards first, or a depth pre-pass | MJP measured a `discard` that never fires raising pixel-shader invocations from 440k to 582k (of 648k worst): https://therealmjp.github.io/posts/to-earlyz-or-not-to-earlyz/; front to back 32 % fewer than back to front | try; measure (the effect differs on tilers) |
| **Tight card hulls** (cut the quad to the opaque texels) | about 30 % fewer overdrawn pixels on impostor sprites (the three.js thread above) | cheap |
| **A cached terrain clipmap** (runtime virtual texture): bake the expensive layers round the camera, re-render only what scrolls in | Battlefield 3: https://media.contentapi.ea.com/content/dam/eacom/frostbite/files/gdc12-terrain-in-battlefield3.pdf; Far Cry 4: https://gdcvault.com/play/1021761/Adaptive-Virtual-Texture-Rendering-in; Unreal's RVT: https://dev.epicgames.com/documentation/en-us/unreal-engine/runtimevirtual-texturing-quick-start-in-unreal-engine | estimate 6 ms of terrain to 2; medium to high effort |
| **Shader detail by distance** (drop the detail grain far off) | none published; the grain is under a pixel there | estimate 20 to 40 % of the terrain at the widest zoom |
| **Render scale with an upscale** (FSR1-style), the UI at full resolution | https://forum.babylonjs.com/t/using-amd-fsr-with-babylon-js/39326; https://gpuopen.com/manuals/fidelityfx_sdk/techniques/super-resolution-spatial/ | the safety valve for the 3060 with 4× MSAA; 0.77 per axis is 0.59 of the pixels |
| **MSAA** | about 25 % more GPU time than TAA in Unreal's forward renderer (https://dev.epicgames.com/documentation/en-us/unreal-engine/forward-shading-renderer-in-unreal-engine); nearly free on Apple's tilers | **the M1 understates its cost on the 3060** |

What the reference games do, as far as public sources show: Horizon Zero Dawn and Ghost of Tsushima place vegetation
on the GPU with distance levels of detail; Ghost of Yōtei bakes distant mountains into textures and culls over a
million items to about 60k before drawing; Total War is reported to draw untextured impostors far off; nothing
public on Tiny Glade or Manor Lords.

## 4. Ranked for this project

1. **Cull the scatter** (per instance or by tile), then **a level of detail for far crowns.** Built for the far
   woods in `trees-perf-trunks.md`; the near scatter and the meadow are next.
2. **Measure on the RTX 3060** (with 4× MSAA), by the frame interval.
3. **The terrain:** skip reads whose weight is zero (the macro bakes read both arms, the dirt test's five cover
   reads), detail by distance, then a cached clipmap if that is not enough.
4. **Draw the discarding meshes before the ground; no `discard` in materials that never cut** (trunks, stones).
5. **Bloom at half resolution:** tried and dropped (2026-10-16). On the frame interval the bloom costs 0.1 to 0.3 ms
   (`?bloom=0` against on, the bench, twice); its half-resolution pass cost as much as it saved. A timing that waits
   on every frame (a read-back) had made it look like 1.5 ms: it serialises the GPU and inflates the last passes.
6. **Per-clump constants in the vertex shader** (the ground under a clump's root, its snow, its bounce).
7. **Render scale** as a dynamic floor on the min-spec laptop.
8. **The grain's anisotropic filtering** 4 → 2 (a look change at grazing angles: an A/B for the owner).

## 5. Measured at the widest zoom (2026-10-16)

The frame interval with one part off at a time (`docs/plans/done/wide-perf.md`): 4× MSAA ≈2.4 ms, the meadow ≈1.2,
the far woods ≈0.6, the bloom ≈0.2, the terrain's detail grain and the leaf cards ~0. So far-tree impostors could win
0.6 ms at most; built instead: the MSAA target in 8 bits (same image) and the meadow's rings by zoom (94 → 108 fps on
the owner's screen). Then an automatic render scale by zoom (0.85 at the widest: 108 → 120 fps on the owner's screen; `docs/plans/done/dynamic-scale.md`).

Auto's floor then went to 0.75 at the widest (decision 0036, `docs/plans/done/auto-floor.md`; the owner's screen: a
fixed 0.75× reached the 120 cap); a scale driven by missed frames was tried and dropped (the same plan says why).
