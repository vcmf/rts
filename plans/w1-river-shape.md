# W1: River shape (kill the "scarf")

Workstream: water (`prototype-plan.md` §4). Research: `research/stylized-water.md` §2.1–2.3.
Branch: `feat/water-w1-river-shape`.

## Problem

The stream is `x = f(z)`: a sum of two sines with a constant-width cut (`H()` line 99). It can't
turn back on itself, its width never changes, and every consumer (terrain carve, terrain bank
colours in GLSL, water mesh, scatter, reflections) re-derives distance from that formula.

## Scope

**In:**
1. **River data model**: one channel (`goldbach`) described by parameters (W0, D0, bankH,
   floodplainW, seed) and processed into dense per-sample arrays: `px pz tx tz s kappa W D A
   riffle zw v tau`.
2. **Centre line**: a Kinoshita curve integrated in a valley frame (u along, v across), with
   per-bend jitter of amplitude (±35%) and wavelength (±35%), a cubic restoring term that keeps
   it inside the meander belt, and θ₀ ≤ 1.85 (bends turn back, loops never touch). Mapped onto a
   gentle valley axis west of the hill and the formation zones. Curvature box-smoothed over ±8
   samples (~2 W); no Chaikin pass (the 1.5 m sampling is already smooth).
3. **Attribute rules** (research §2.3): width ∝ √Q with bend factor and noise; riffles at the
   crossings between bends; pool and riffle depth; bank asymmetry from curvature (computed now,
   used in W2); a monotonic water surface (running minimum of the base terrain, drop concentrated
   on riffles); time of travel `tau`.
4. **`riverQuery(x,z)`**: nearest segment via a 16 m bucket grid → `{i, t, n (signed), s, dist}`,
   plus `lerpA` for attributes. **The one source of truth**: every consumer goes through it.
5. **Rewire consumers**:
   - `H()`: a **symmetric** variable-width, variable-depth channel carve (smooth bowl to `D`,
     banks rising to `bankH` within 0.7 half-widths). The asymmetric carve is W2; the valley moved
     into W1 (see "Scope change").
   - Terrain bank colours: the GLSL formula `STREAM_GLSL` is removed. Each terrain vertex gets an
     `aRiver` attribute (distance to the bank in half-widths, from `riverQuery`); the shader uses
     it for the damp, mud and bank bands.
   - Water mesh: a ribbon that follows the samples, with per-sample width and water level `zw`;
     outer columns dive under the bank; `aDepth = zw − H`; UV = (across m, along s).
   - Scatter (`nearStream`, the willow line along the stream), reflection candidates (`reflAdd`).
6. **Debug view**: `?river=debug` overlays samples coloured by riffle (light) vs pool (dark) and
   the centre line, for review.

**Scope change during implementation:** the valley and floodplain carve moved from W2 into W1.
Without it the monotonic water surface trenched 5–10 m canyons wherever the noise hills rose
along the path (seen in the first W1 render), so W1 could not meet its own acceptance criteria.
Implemented as `RIVER.trough()`: a flat floodplain at the local water level + bank height, with
valley sides rising at ~10°, measured from the valley axis, and **faded out** over 22 m beyond the
floodplain so it never cuts neighbouring hills (cheap; no wide river query needed).

**Numeric acceptance**: `tools/river-check.js` (run with `tools/shot.mjs`) measures the formation
zones and hill (must be untouched), houses (dry), backtracking samples, riffle smoothness, far-ring
visibility and channel containment.

**Out (later PRs):** asymmetric cut banks and point bars, finer bank geometry (W2); the baked water texture (W3); the new water shader (W4); rocks, fords and ice
(W5); the OSM import (W6). The existing water shader stays; only its inputs change.

## Approach notes

- The arrays are plain `Float32Array`s, built once at load (the future `sim/` style).
- The river flows from the higher end to the lower end of `baseH` along the line, so the running
  minimum doesn't create a trench against the slope.
- `H()` = `baseH()` + carve. The carve only lowers (`min`); it never raises hills.
- Performance: `H()` is called about 450k times at load (two terrain meshes, AO mask, scatter,
  water). The bucket grid keeps each call to about 4–10 segment tests. Measure load time
  before and after (headless, `performance.now()` around the build) and report it.

## Acceptance (screenshot-verified, before/after at three camera positions)

- [ ] Bends **turn back** (the centre line is not a function of z); sinuosity visibly > 1.3.
- [ ] Bends differ from each other (amplitude and length jitter visible); no regular rhythm.
- [ ] Water width varies along the river (narrow at riffles and bends, wider in reaches).
- [ ] Pools read darker (deeper) than riffles with the existing depth ramp.
- [ ] No floating water and no water running uphill; the shoreline is cut by terrain everywhere.
- [ ] Terrain bank colours, scatter exclusion and reflections follow the new river (no leftover
      references to `streamX`/`STREAM`).
- [ ] Load time regression ≤ +300 ms (headless measurement).

## Result

- Load time (headless, 3 runs): baseline 2.7–2.9 s, W1 2.9–3.2 s (≈ +250 ms).
- Screenshots: `renders/w1-before/`, `renders/w1-after/` (not committed; attached to the PR).

## Review

`/code-review high` per `AGENTS.md`: another round only while a round finds a severe issue;
redesign after 3.

### Round 1 (9 findings: 3 severe)
Fixed: trough flattened the central hill (now a fading trough, axis moved west); riffle phase
not accumulated (now accumulated + curvature and riffle smoothed; max step 0.51 → 0.08); river
crossed formation zones (0 samples in KEEP_CLEAR now); channel left its floodplain (cubic
restoring term; max offset 27.2 m < 30 m); `tools/shot.mjs` tap/error handling; REACH sized
to callers and allocation-free query; one river query per terrain vertex; tree crowns over water.
Deferred: per-vertex bank colours are coarse on the far ring (moderate) → replaced by the W3 bake.

### Round 2 (10 findings: 2 severe + 2 acceptance failures)
Fixed: the trough fade still cut the hill flank and formation zone (axis moved to x≈-108,
floodplain 84 m, fade 22 m → 0 lowered cells in KEEP_CLEAR, hill unchanged); the valley ran
through the village (village relocated west of the valley, dead road removed); bends did not turn
back (θ₀ 1.5, cap 1.85 → 225 backtracking samples, 31 near the scene); far ring hid the river
(coarse trench → 0/1090 hidden); trough could raise land (clamped); shot.mjs hang/cleanup/load
wait; dead D/v stores (`boxSmooth`); stale comments and this plan. Willows inside tight bends.
Load time 2.8–3.1 s.
