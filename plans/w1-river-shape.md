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

### Round 3 (10 findings: 2 severe) → STOP AND REDESIGN (workflow limit reached)
Severe: wheat in the water (a scatter loop with no river check); floodplain level keyed by
world z let a doubled-back bend sit below its own water. Root cause: the river was retrofitted
into a scene with hand-placed features, and every scatter loop carried its own exclusion rule,
so each fix that moved the river collided with the next hand-placed feature.

## Redesign (after round 3)

Target fixed in `design.md` §6c: **the lowland meander**. Rule: **nothing in the water except
stones.**

1. **One placement test** `placeable(x, z, r, kind)`: rejects anything within the wet channel +
   bank (+ its own radius) unless `kind === 'stone'`, and rejects formation zones. Every scatter
   loop (trees, willows, bushes, plants, wheat, far woods) goes through it; no loop keeps its
   own river rule. The unused village and its rules are removed (villages are not drawn yet).
2. **Floodplain level from the nearest river sample** near the channel (bank ≥ local water by
   construction), blended into the per-z level farther out. Doubled-back bends are safe by design.
3. **Far ring without a trench**: the water ribbon beyond the detailed tile sits on the far-ring
   surface (shared `farRingH()` helper), and its edge columns dive below it.
4. **Checks that fail**: `tools/river-check.js` asserts thresholds (non-zero exit), including
   "no scattered instance in the water" across every scatter group; it reuses the page's helpers
   instead of copying formulas.
5. **Same-marker timing** on main and branch for the load-time criterion.

The review count restarts at round 1 after this redesign.

### Redesign result
- `placeable()` is the only placement rule (12 scatter call sites); the village and its rules are
  gone; berry bushes now appear everywhere at 1/3.
- Floodplain follows the nearest pass's water level near the channel.
- Far ring: no trench; the ribbon is draped on the far surface per vertex (a row straddling the
  tile edge previously produced 10 NaN vertices that culled the whole river; now checked).
- `tools/river-check.js` asserts 10 limits and fails the run: all pass.
- Load time with the same marker, interleaved runs: main 2.78–2.79 s, branch 2.86–2.89 s (≈ +90 ms).

Review count restarts here.

### Post-redesign round 1 (10 findings: severe far-ring dashes/uphill water, width rule, cliffs, willow crowns)
Fixed: far ring gets the trough only (no pits); far water sits above the drawn cell and never
rises downstream (upstream-raising pass); width clamped to 5–8 m and narrower at bends
(5.59 vs 6.31 m); floodplain level distance-weighted over all passes (no cliffs, steepest
0.82 m/m); every scatter add goes through `addPlaced()` with the model's real footprint
(willow crowns, Plant_1 under trees); `nearStream` removed. river-check now measures the
drawn far triangles, widths, cliffs, footprints and zones: 16 limits, all pass (an earlier note said 17).

### Post-redesign round 2 (10 findings: water step-up at the tile exit, floating far ledges, willows gone, wheat on the floodplain)
Root cause of the far-ring findings: special-case water logic for the coarse ring. Replaced by a
**river corridor** (research §2.5): fine 64 m patches on the same 1.78 m grid and `carve()` as the
detailed tile wherever the river runs outside it; the far ring sinks under them. The water now has
**one code path everywhere** (flat at `zw`, edges dive under the carved bank), so it is downhill
and non-floating by construction. Also: `footprint()` is the exact reach from the pivot (models
are off-centre); willows step outward until the rule accepts them (26 now); stones only on dry
land or riffles; wheat moved to the valley side; `riverQuery` returns the blended level (one scan).
A regression found while fixing (a merged line made `placeable()` reject everything but stones,
and the checks passed on the empty scene) led to a **population** check.
river-check: 19 limits, all pass. Known look gap (moderate): corridor banks outside the detailed
tile have no baked light map yet, so they paint darker at the seam → W3.

### Post-redesign round 3 (8 findings, 1 severe) → STOP (workflow limit reached a second time)
Severe: the corridor patches were wound the wrong way, so they faced down and were culled; the river
outside the detailed tile floated over a 25 m pit. river-check passed because it measures heights,
not what is drawn. The "darker banks at the seam" noted after round 2 were this bug, misread as a
missing light map. Also: corridor overlaps the detailed tile (z-fight), load time +200–370 ms
(over the 300 ms limit in some runs), zone and stone tests ignore footprints, corridor in the
shadow casters, a latent far-ring margin. Decision pending (see PR).
