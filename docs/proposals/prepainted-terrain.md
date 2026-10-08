---
status: draft
last_reviewed: 2026-10-08
---

# Proposal: Painted terrain macro (pre-painted terrain, revised)

Should the static ground be painted once per map instead of stylized at runtime? After an
adversarial review (§Review), the answer is split:

- **Yes, for a painted macro colour bake:** large colour shapes (field stripes, furrow bands, dry and
  green grass patches, worn ground near roads and villages, colour variation) painted into one
  world-space texture per map. It is cheap, fits memory, and is close to what the light map already
  does.
- **No, for baked brush strokes, for now:** the strokes in the reference stills are about 0.1 × 0.4–1 m,
  finer than any texel we can afford to bake (0.26–0.5 m). At the zoom where strokes are visible they
  can only come from a runtime detail layer. A baked stroke painter (and a baked Kuwahara pass) stays
  an experiment, kept only if an ablation shows it adds something.
- **Light stays at runtime:** the bake holds colour, not lit colour. Lighting keeps going through the
  runtime 3-band ramp, so cloud and unit shadows turn cool instead of grey, seasons and the staff map
  keep working, and units are lit by the same function as the ground.

Order of work: runtime detail layer first (every option needs it), then the macro bake, then the
stroke-painter experiment.

## Context and goals / non-goals

The reference stills (the `austerlitz-*-v1` and `north-star-painted-v1` images in the design refs folder) put most of
their brushwork in the ground. Our terrain gets its paint at runtime: a 3-band hue-shifted ramp with
band edges and value broken by a world-space grain (the `painted-*` prototypes, `grainW()`). It reads
as a regular texture, shimmers and repeats across zoom, and has seams where its projection switches
axis.

Goals:
- the ground reads as painted at gameplay zoom and holds up at the closest zoom;
- runtime cost about today's (a fraction of a millisecond either way: cost is not the reason to do this);
- fits the bake budget (`docs/proposals/engine-design.md` §6: ≤ 8192² per texture, ≤ 600 MB);
- no smear of formations (decision 0001); seasons and the staff map keep working.

Non-goals: painting units, trees, buildings, water or smoke into the bake; matching a still pixel for
pixel.

## The numbers

Ground density depends on pitch, not only on figure height: a figure stands upright, the ground lies
at the elevation angle `e`, so the ground is foreshortened by `sin e`. At 50–70° from vertical
(e = 20–40°) a metre of ground spans more pixels across the screen than up it.

| Zoom | Figure | px per metre (across) | px per 0.26 m texel | px per 0.5 m texel |
|---|---|---|---|---|
| Far 3D | ~8 px | ~4.4 | ~1.2 | ~2.2 |
| Gameplay | 10–30 px | 5.6–17 | 1.4–4.3 | 2.8–8.5 |
| Closest (stills) | 40–70 px | 22–39 | 5.8–10 | 11–19 |

(Along the view direction a texel covers fewer pixels; slopes facing the camera add 1.15–1.8×.)

- **Strokes cannot be baked at a useful size.** The stills' dry-brush marks are about 0.1 × 0.4–1 m.
  Baking them at 2 px per mark at the closest zoom would need ~0.05 m texels: ~36000² over 1.8 km
  (1.3 × 10⁹ texels). And 1 M baked strokes over 3.24 km² average 3.2 m² each, bigger than a soldier
  on screen. The bake can hold shapes of a metre and up, not strokes.
- **So the macro bake can be coarse:** colour shapes ≥ 1 m need about 0.5 m/texel. Over 1.8 km that
  is 3600²: 52 MB RGBA8 (69 MB with mips), baked at load; 13–17 MB as BC7 where available. Next to
  the existing 0.26 m light map (190 MB, kept: AO and the valley mask are read by scatter, mist and
  light shafts) the total stays well under 600 MB.
- **Runtime:** today's terrain shader does about 13 texture fetches (grain at two scales, light map,
  cloud noise, snow). The new path: macro colour (1), light map (1), detail layer (2–4 with octave
  blending), cloud and snow as today: about the same. Not a saving; not a cost.
- **Bake time and peak memory at full size:** not measured. A colour-shape bake (fills, noise, field
  stripes) is a handful of full-screen passes on a 3600² target: plausibly well under a second on a
  3060 (estimate); SwiftShader slower (headless checks need `--enable-unsafe-swiftshader`). Bake in
  tiles so peak memory stays near one tile.

## Design

### Runtime layers (terrain)

1. **Macro colour** (baked, 0.5 m, world space): local colour only, no light. Channels: RGB colour,
   A a class-edge or wear mask for the detail layer.
2. **Light** (existing light-map bake: sun visibility, AO, valley mask) and dynamic terms (cloud
   shadow, unit and formation contact shadows) all lower the **light value before the ramp**, as
   `cloud()` does today, so every shadow becomes the cool shadow colour (art bible §4: "Darkness alone
   is not light").
3. **The 3-band ramp at runtime**, with season and time-of-day presets as today.
4. **Brush detail** (runtime, tiling, per terrain class): stroke masks from the brush library
   (art bible §7) break band edges and modulate value. Fixes from the research report
   (`docs/research/painterly-style-in-real-time.md`):
   - the projection: biplanar or Y-planar plus a slope-gated second plane, with `textureGrad`,
     instead of a hard switch;
   - two power-of-two scales blended by `log2` of the pixel footprint (Age of Sail's MetaTexture),
     variance renormalised, thresholds sharpened with `fwidth`;
   - anti-tiling (index variation or hex tiling) where repeats show.
5. **View-dependent terms** (rim, backlight sheen, glints) stay at runtime under yaw ±45°.

### Matching objects to the ground (the pasted-on risk)

Pillars of Eternity reported its 3D characters "were not matching" pre-rendered backgrounds until
they sampled ambient from the background, added a shadow-control map and tinted dynamic shadows blue.
Our design keeps the ground's light at runtime, which removes most of that gap, and adds:
- units, trees, buildings and grass scatter use the same ramp function, sun and palette preset;
- objects sample the macro colour under them for a ground-bounce tint at their feet;
- contact and formation shadows lower the light value (cool shadow), not multiply to grey.

### The bake

Inputs: terrain classes (the same 1 m grid the simulation reads), heightfield (slope and exposure),
roads, river, field polygons with furrow direction, villages, scatter positions (worn ground under
trees, near buildings), palette preset, seed.

Passes (GPU, in tiles, deterministic by seed):
- class colours from the palette;
- low-frequency variation (noise);
- field stripes and furrow bands along their direction;
- wear near roads, gates and villages;
- edge treatment where classes meet (broken, not ruled lines).

No per-element strokes (`engine-design.md` §6: they lost the WebGL context in SwiftShader). An artist
override layer can paint over landmarks.

### Seasons, staff map, river banks

- **Seasons:** the macro holds season-neutral shapes. The season tints them through the palette, and
  snow stays a runtime term by slope and grain, as now. No rebake per season.
- **Staff map:** it reads the same macro colour flattened, with no baked relief or shadow in it, so
  nothing lingers when the relief flattens.
- **River cut banks** (art bible: a steep bank at every bend): the top-down macro stretches there.
  Banks take a class colour with runtime biplanar detail. Accept and check a change of texture scale
  along banks.

## Alternatives considered

- **Lit pre-painted terrain** (the first draft): colour and light baked together. Rejected:
  - grey dynamic shadows;
  - a rebake per season and preset;
  - baked shading left behind in the staff map;
  - a 0.26 m RGBA8 bake (256 MB) on top of the light map.
- **Baked stroke painter** (stroke splatting, Kuwahara on the bake): kept as an experiment, not core.
  The strokes come out bigger than soldiers, and the visible brushwork at close zoom comes from the
  detail layer anyway.
- **Runtime-only (today plus the grain fixes):** the baseline every option is measured against.
- **Full-screen filter on the terrain layer only:** unstable under camera motion; strokes do not stick.
- **Virtual texturing at stroke density:** needs streaming, which `engine-design.md` rules out.

## Drawbacks

- One more bake and one more texture fetch.
- The look still depends on the runtime detail layer at close zoom. If that layer is weak, the macro
  bake does not save it.
- Map edits rebake the macro (seconds, estimated).

## Open questions

- Is a macro bake visibly better than procedural macro variation computed in the shader (noise plus
  class colours, no texture)? The ablation answers it.
- BC7 coverage: 99.7% of Windows WebGL2 reports, 79% on macOS, 55% in Safari (web3dsurvey, via the
  review). Baked at load it is RGBA8 anyway (69 MB here).
- Bare winter trees, snow and water: no evidence in the research yet.

## Validation plan

An ablation in which every arm has the same detail layer:
1. runtime ramp and detail only (baseline);
2. + procedural macro variation in the shader;
3. + baked macro colour;
4. + baked strokes (experiment);
5. + Kuwahara on the bake (experiment).

Run each at three zooms (far, gameplay, closest) and three yaws (−45°, 0°, +45°), on the Pratzen
framing, with two battalions, one tree type and smoke on it. Judges compare blind against a short
checklist:
- does it read as painted?
- are the terrain classes readable?
- do the units look pasted on?
- does it shimmer or tile in motion?

A full-size bake runs once up front to measure bake time, peak memory and SwiftShader behaviour.

Keep an arm only if judges prefer it over the arm before it. Drop the stroke painter if arm 4 does not
beat arm 3.

## Review

Adversarial review, 2026-10-08 (19 findings: 4 severe, 10 moderate, 5 light; full text in
`docs/research/prepainted-terrain-review.md`). What changed:
- **Strokes larger than soldiers; stroke detail finer than a texel (severe):** the baked stroke
  painter left the core; the macro bake is coarse (0.5 m); strokes come from the runtime detail layer.
- **Kill criterion against the wrong baseline (severe):** replaced by an ablation with the same detail
  layer in every arm, three zooms, three yaws, blind judges, plus a full-size bake run.
- **Baked lit colour breaks shadows, staff map and seasons (severe):** light stays at runtime; the
  bake holds colour only.
- **Pasted-on risk unmitigated (severe):** same ramp, sun and palette for all; ground-bounce tint
  from the macro; shadows through the ramp.
- **Ground density ignored pitch (moderate):** table and note corrected.
- **"Cheaper at runtime" was wrong (moderate):** about the same; not a reason.
- **Light map cannot be absorbed (moderate):** kept, because AO and the valley mask are read
  elsewhere.
- **Memory peak and BC7 coverage (moderate):** 0.5 m RGBA8 at 69 MB; tiled bake; coverage figures
  cited.
- **River banks (moderate):** runtime biplanar detail with a class colour; check the bank seam.
- **SwiftShader rule on per-element strokes (moderate):** no strokes in the core bake.
- **View-dependent terms (moderate):** stay at runtime.
- **Readability untested (moderate):** in the ablation checklist.
