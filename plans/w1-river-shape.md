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
   per-bend jitter of amplitude (±25%) and wavelength (±20%), a restoring term that keeps it
   inside the floodplain, and θ₀ ≤ 1.6 (no self-touching loops). Mapped onto a gentle valley axis
   that runs west of the hill, as the current stream does. Chaikin-smoothed, curvature smoothed
   over ~1 W.
3. **Attribute rules** (research §2.3): width ∝ √Q with bend factor and noise; riffles at the
   crossings between bends; pool and riffle depth; bank asymmetry from curvature (computed now,
   used in W2); a monotonic water surface (running minimum of the base terrain, drop concentrated
   on riffles); time of travel `tau`.
4. **`riverQuery(x,z)`**: nearest segment via a 16 m bucket grid → `{i, t, n (signed), s, dist}`,
   plus `lerpA` for attributes. **The one source of truth**: every consumer goes through it.
5. **Rewire consumers**:
   - `H()`: a **symmetric** variable-width, variable-depth channel carve (smooth bowl to `D`,
     banks rising to `bankH` within ~0.6 W). The asymmetric carve and the valley are W2.
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
valley sides rising at ~10°, measured from the valley axis (cheap; no wide river query needed).

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
