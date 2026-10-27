---
status: done
last_reviewed: 2026-10-27
---

# Plan: a contact shadow under the soldiers' feet, capped at a tree's shadow

Asked by the owner (2026-10-26), of the simple shadows (decisions 0062 and 0067): "darker and more solid at the
foot of the soldier". Shown `?ushfoot=1.5,0.6,1.5,0.6&ushdark=0.5,0.6`: "darker than the tree shadow so not good,
but at least the feet shadow look more solid, so the direction maybe good". Then: "the bottom shadow should cover
the foot even in movement … as it's a fixed shadow, the shadow can be detached from the foot … a good enough shadow
with fast performance is always preferred". The owner's rule: **no part of a soldier's shadow darker than a tree's
cast shadow.**

It began as a test behind switches (the measurements below are the test's, made before the default changed); the
owner picked on 2026-10-27 (the outcome, at the end) and the pick is now the default: decision 0071.

## Why the foot is not solid today

1. Far off (from the band's end, 85 m; the default zoom 63 m is already 70 % of the way) the look has no gradient
   (foot = tip = 1).
2. Up close the dark core reaches only 0.4 m from the soles, and from the RTS camera the man's own body covers it;
   what shows is the lighter tail.
3. The shape is averaged over a clip's steps (a marching man's legs are one soft wedge, decision 0049), so at the
   feet it is weak and does not move with them. Measured on the figure's own data (the far LOD, every step of each
   clip, 16 facings; the vertices within 0.12 m of the clip's lowest): the shape's value at the feet averages 0.34
   halted, 0.19 marching, 0.11 running, 0.33 firing; it is at least half its darkest under 21 % of the halted and
   firing feet and under none of the marching or running feet. That is the detachment the owner sees.

## Scope

In (switches, `src/look/shadow-look.ts` `applyContactParams`):

- `?ushcontact=<pad m>,<darkness>[,<softness>]`: a solid oval under each man's feet, `pad` past them (0 or a
  darkness of 0: none), its darkness a share of the cap's (1: as dark as the cap allows), fading past the oval over
  `softness` of its size (0.35 by default). Drawn at every zoom, in the same decal pass, not by the sun.
- `?ushcontactat=stride|step|root`: where it sits (below). `stride` by default.
- `?ushcap=<exponent 1..4>`: the cap. On with a contact (`CONTACT_CAP`, 1.15); alone it caps today's shadow
  without a contact. Higher exponents are a darker cap (4: almost none), so going past the tree is an explicit ask.

Out: the figures, the shape's bake, the lift, a figure shadow map.

## Approach

### Where the oval sits: the feet's own travel

The feet's travel a clip, from the figure (m, in his own frame: across him, along him):

| clip | across | along | centre (across, along) |
|---|---|---|---|
| halt | 0.26 | 0.25 | 0.00, −0.08 |
| march | 0.36 | 0.85 | 0.01, −0.08 |
| run | 0.32 | 0.98 | 0.01, −0.14 |
| fire | 0.49 | 0.53 | −0.11, −0.04 (the firing stance) |

`contactOvals` (`src/look/units-data.ts`) makes an oval a baked step from the posed far LOD (generic: the feet are
the vertices near the clip's lowest point, no era names): **stride**, the oval holding the feet over the step's whole
clip (one a clip: march 0.24 × 0.57 m half-sizes before the pad); **step**, the oval holding the feet at that very step
(it follows them); **root**, none (a disc of radius `pad` about the man's root, the brief's first idea). They go in a
float texture, a texel a VAT row. The decal's vertex shader reads his step's oval (his clip's first step plus the
clock's steps since, `units.vert`'s rule), turns it with his facing (his matrix's own axes), grows it by the pad and
passes each vertex's place in the oval's frame (`vCt`, 1 at its edge); the fragment adds one `length` and a
`smoothstep`. One texel fetch a vertex (eight a man), a few ALU a fragment; the strip grows to hold the oval's reach
(at most the shape's cell, `decalStrip`'s `reach`).

The feet on the contact (a foot vertex counted when the contact there is solid; with the 0.1 m pad):

| clip | today's shape ≥ half | root disc 0.35 m | root disc 0.45 m | stride | step |
|---|---|---|---|---|---|
| halt | 21 % | 100 % | 100 % | 100 % | 100 % |
| march | 0 % | 94 % | 100 % | 100 % | 100 % |
| run | 0 % | 79 % | 90 % | 100 % | 100 % |
| fire | 21 % | 100 % | 100 % | 100 % | 100 % |

(the test `keep the feet on the contact at every step of every clip` checks stride and step for every foot vertex.)
Stride and step cost the same in this shader; step's oval is smaller (marching, about 0.43 m² against 0.59 m² with
the pad) and moves with the pose at 12 fps.

### The cap

Today every covered sample takes the full gained darkening (`d · L(d)^(gain − 1)` at the look's darkest), and the
coverage spreads it. With the gain, a covered sample is far darker than a tree's shadow (gain 2: about the shade's
luminance squared), and the pixels where all four samples are covered (the contact) go darker than the tree: today's
darkest 2 % is 0.10 to 0.15 of the unshadowed ground against the tree's 0.17.

Under the switches (`SH_CAP` in `src/look/shaders/unitdecal.{vert,frag}`, mirrored by `cappedCover`):

- every covered sample takes **the cap's darkening**: the ground's shade `k` toward which the shadow darkens
  (`mix(1, k, f)`, f the zoom's cross-fade with the shadows on), its luminance raised to the cap's exponent, its hue
  kept (`shadowShade(k, f, cap)`);
- the coverage is the share that gives the pixel **the darkening it had before** (the sun's shadow's share times its
  gained darkening, over the cap's), or the contact's share, whichever is more, at most 1.

So a pixel is never darker than the cap, at any gain: the gain still shapes the tail wherever it is lighter than the
cap (there the pixel is as before), and darker parts are clamped at the cap. Every shadow at a pixel takes the same
colour, so decision 0062's overlap rule holds unchanged (each sample darkened once, the darkest share wins whatever the
order; tested). Nothing is darkened where the ground already lies in full shadow (k = 1) or with the shadows off. A
side effect: covered samples are lighter and more of them, so today's stipple in the tail is calmer.

Why an exponent: the shade `k` is the ground painted in its cast shadow over the ground as it is; a tree's shadow is
darker still (its crown also hides sky). Measured: with the exponent at 1.45 the contact reached 0.13 to 0.15 of the
ground, at 1.25 0.16 to 0.19, at 1.15 0.18 to 0.22, the tree being 0.17 to 0.18. 1.15 puts the darkest half per
cent of pixels at the tree's close up (0.176 against 0.183), lighter than it elsewhere.

### The gain (decision 0067)

Under the cap the gain no longer darkens past the tree; it only shapes how fast the tail falls off. Keeping 2 / 1.5
keeps today's tail where it is lighter than the tree; 1.25 brings the tail back about to where 0062 had it.

## Measurements (2026-10-26)

The look page's production build, `?armies=20`, Metal, 1600 × 900, the camera of `docs/plans/done/shadow-darker.md`
(alpha −1.92, beta 0.8, target (142, 4.7, −96)) at 20, 63 and 125 m. Linear luminance of the frame over the same
frame with `?unitshadow=0`, over the pixels each candidate darkens by more than 3 %: the median (the tail), the darkest
10 % and the darkest 2 % (the contact). The tree: two patches in its cast shadow against lit ground beside them.

Candidates: **A** today; **B** `?ushcontact=0.1,1` (stride oval, cap 1.15, tail as today: gain 2 / 1.5); **B-step**
the same `&ushcontactat=step`; **B-root** `?ushcontact=0.35,1&ushcontactat=root`; **C** B with `&ushgain=1.25,1.25`;
**D** C with the foot gradient far too, `&ushfoot=1.05,0.4,1.05,0.4&ushdark=0.55,0.6`; **E** the owner's tried
`?ushfoot=1.5,0.6,1.5,0.6&ushdark=0.5,0.6` (no cap).

Epic summer (tail / darkest 10 % / contact 2 %):

| zoom | tree | A | B | B-step | B-root | C | D | E |
|---|---|---|---|---|---|---|---|---|
| close 20 m | 0.18 | 0.43 / 0.18 / 0.12 | 0.47 / 0.22 / 0.19 | 0.47 / 0.22 / 0.20 | 0.48 / 0.22 / 0.20 | 0.53 / 0.24 / 0.21 | 0.53 / 0.24 / 0.21 | 0.47 / 0.10 / 0.04 |
| default 63 m | 0.17 | 0.41 / 0.21 / 0.10 | 0.36 / 0.22 / 0.21 | 0.36 / 0.22 / 0.21 | 0.37 / 0.23 / 0.21 | 0.38 / 0.23 / 0.21 | 0.40 / 0.23 / 0.21 | 0.32 / 0.11 / 0.08 |
| wide 125 m | 0.17 | 0.30 / 0.17 / 0.15 | 0.28 / 0.24 / 0.23 | 0.28 / 0.24 / 0.23 | 0.27 / 0.24 / 0.23 | 0.35 / 0.24 / 0.23 | 0.38 / 0.24 / 0.23 | 0.33 / 0.14 / 0.06 |

Epic winter (`?season=3`, 1280 × 720; a conifer's shadow on snow is about 0.23 of lit snow, the wide view; no tree
shadow in the closer frames, the deciduous trees bare):

| zoom | A | B | B-step | C | D | E |
|---|---|---|---|---|---|---|
| close 20 m | 0.59 / 0.19 / 0.14 | 0.51 / 0.23 / 0.21 | 0.51 / 0.23 / 0.21 | 0.56 / 0.24 / 0.22 | 0.56 / 0.24 / 0.22 | 0.54 / 0.10 / 0.05 |
| default 63 m | 0.45 / 0.25 / 0.13 | 0.40 / 0.27 / 0.25 | 0.40 / 0.27 / 0.25 | 0.42 / 0.27 / 0.25 | 0.45 / 0.27 / 0.26 | 0.36 / 0.14 / 0.10 |
| wide 125 m | 0.34 / 0.20 / 0.18 | 0.37 / 0.27 / 0.25 | 0.37 / 0.27 / 0.25 | 0.41 / 0.28 / 0.26 | 0.42 / 0.28 / 0.27 | 0.37 / 0.17 / 0.10 |

Reading: today's contact is darker than the tree (0.10 to 0.15); E is far darker (0.04 to 0.08, what the owner
rejected). With the cap every candidate's darkest pixels sit at or just above the tree's, and the foot is solid (the
darkest 10 % and 2 % close together: a flat, filled core, not a stipple). The far zooms' contacts are a pixel or two
and partly covered, so they measure lighter than the cap. B keeps today's tail (median within 0.04 up close; darker
at 63 m because the contact adds dark pixels); C and D lighten the tail, D most at the far zooms.

Sheets (not in git): `output/armies-review/22-shadow-contact/` in the main checkout: `1-close.jpg`, `2-default.jpg`,
`3-wide.jpg` (1:1 crops, a tree's shadow in frame), `4-winter.jpg`, `5-motion-close.jpg` and `6-motion-default.jpg`
(a marching battalion's rear rank over one stride, 8 steps, the camera following).

### The cost (Metal)

`node tools/bench-look.mjs <url> <json> --gpu metal`, production builds (main c505440 on one port, this branch on
another), `?armies=20&benchr=40,63,125,250`, the arms alternated (main, step, stride), three rounds; the default
arm's (`l2`) GPU p50, ms, the mean over its three yaws. The machine was shared with other sessions and flipped
between two states, one about 2.4 times slower (load average up to 18), so the rounds are grouped by state.

| zoom | main | `?ushcontact=0.1,1&ushcontactat=step` | `?ushcontact=0.1,1` (stride) |
|---|---|---|---|
| unloaded runs: | main r2 (r1 at 125 and 250 m) | step r1, r2 | stride r1 |
| 40 m | 13.25 | 13.12, 13.36 | 13.11 |
| 63 m | 13.98 | 13.93, 14.08 | 13.91 |
| 125 m | 13.74, 14.12 | 13.67, 13.73 | 13.62 |
| 250 m | 9.69, 9.97 | 9.99, 10.11 | 9.96 |
| loaded round (r3): | | | |
| 40 m | 32.01 | 34.56 | 32.34 |
| 63 m | 35.88 | 38.04 | 36.53 |
| 125 m | 34.49 | 35.66 | 36.25 |
| 250 m | 23.63 | 24.41 | 23.45 |

Unloaded, every difference is within 0.3 ms and goes both ways: no measurable cost. The loaded round has step up to
7 % slower, but in that state main's own runs differ by up to 2.4 times; worth a clean rerun before a default. The
outliers left out (main r1 at 40 and 63 m, 32.9 and 31.5 ms; stride r2, 30.9 to 33.3 ms) are the loaded state. The
logs: the session scratchpad's `contact/bench/`.

The default page against main: `node tools/golden.mjs`, both `?armies=20`: a match, 0 differing pixels at all 8
cameras (the new path is compiled out without its switches).

## Acceptance

- No switch: the page exactly as main (the new shader path compiled out; the strip's reach 0).
- With the contact: every foot vertex of every clip's every step inside the stride and the step ovals (tested); no
  pixel darker than the cap at any gain (tested, and measured: the darkest pixels at about the tree's shadow).
- The overlap rule holds under the cap (tested).
- No measurable cost on Metal (below the run-to-run spread).
- The owner picks the candidate; then the default, a decision record, the system doc, the goldens. Done (the outcome).

## Open questions

- The tall meadow grass covers the contact around the boots up close (the decal is not lifted at the feet, so it does
  not darken the shins); a contact on the grass blades would need the lift near the feet or the grass shader to read it.
- In a tree's or a hill's shadow (k = 1) the contact draws nothing, as the sun's shadow: an ambient contact there would
  break the "never darker than a tree's shadow" rule.
- Stride or step: settled, step (the outcome).
- The far zooms' tail is lighter than 0067's (the far gain held at 1.15 for the cost; the outcome). If the owner
  wants it darker there, the capped shader keeps 1.5's tail at +0.3 ms at 250 m.
- The cap's exponent is calibrated against one tree up close; the shade varies over the map, and a tree's shadow there
  with it.

## Outcome (2026-10-27)

**The owner's pick:** `?ushcontact=0.1,0.9,1&ushcontactat=step` with the cap at 1.15. That is the oval that follows
the feet, fully soft, 0.9 of the cap's darkness, 0.1 m past the feet. 0067's gain stays at 2 / 1.5 under the cap.

**Also agreed: the oval only where feet show.**
- It is whole to 60 m from the focus, fades out to 100 m, and is gone beyond (`SHADOW_CONTACT.band`, `contactWeight`).
- The default zoom (63 m) keeps 0.98 of it; the wide one (125 m) none.
- Past the band the decal draws with decision 0067's own material: no oval, no cap code (`contactOvalOn`,
  `useDecalFor`). Its gain is held to the cap's exponent, 1.15, so it is still no darker than the cap (`heldLook`,
  eased across the band so nothing pops; tested). Both materials are compiled at load; the switch happens once each
  time the band's edge is crossed. Why, and what was tried first: the cost, below.

**Now the default** (decision 0071, `docs/systems/look.md`). `?ushcontact=0` (with no `?ushcap`) gives decision 0067's
shadows exactly, for the A/B.

**The motion check** (`output/armies-review/22-shadow-contact/7-default-motion-close.jpg`, `-default.jpg`):
- A marching rear rank over one stride. The boots stand on the dark oval at every step; main's show the lighter,
  stippled ground around them.
- Softness 1 only widens the fade past the oval; the solid part is the feet's own oval plus the pad. Every foot
  vertex of every clip's every step lies inside it (tested), marching and running alike, so the 0.1 m pad stays.

**The default's measurements** (same camera and measure as above; `8-default-close.jpg`, `-default.jpg`, `-wide.jpg`).
Each cell is tail / darkest 10 % / contact (2 %):

| zoom | tree | main 5227ec6 | default now | `?ushcontact=0` |
|---|---|---|---|---|
| close 20 m | 0.18 | 0.43 / 0.18 / 0.12 | 0.47 / 0.22 / 0.20 | as main |
| default 63 m | 0.17 | 0.41 / 0.21 / 0.10 | 0.37 / 0.23 / 0.21 | as main |
| wide 125 m | 0.17 | 0.30 / 0.17 / 0.15 | 0.38 / 0.25 / 0.23 | as main |
| winter close | (conifer 0.23) | 0.59 / 0.19 / 0.14 | 0.50 / 0.23 / 0.21 | |
| winter default | | 0.45 / 0.25 / 0.13 | 0.41 / 0.27 / 0.25 | |
| winter wide | | 0.34 / 0.20 / 0.18 | 0.42 / 0.28 / 0.27 | |

At the wide zoom 0067's shader draws with the gain held at 1.15. Its darkest pixels sit where the cap put them (0.23),
but its tail is lighter than main's (median 0.38 against 0.30; with the capped shader at gain 1.5 it was 0.33). That
is the price of costing what main does there.

**Goldens** (`node tools/golden.mjs`, SwiftShader, main 5227ec6 against the final branch):
- The default page (no armies): a match, 0 differing pixels at all 8 cameras.
- `?armies=20&ushcontact=0` against main's `?armies=20`: a match at all 8 cameras.
- `?armies=20` against main's: differs only on the battalions (the diff images light nothing else). Pixels differing
  by more than 6 levels, darker / lighter:

  | camera | darker | lighter |
  |---|---|---|
  | start | 0 | 0 |
  | yaw −40 | 0 | 325 |
  | yaw +40 | 0 | 95 |
  | close | 2,898 | 5,865 |
  | river | 0 | 261 |
  | wide | 0 | 9,252 |
  | far-edge | 0 | 1,524 |
  | winter | 0 | 0 |

  Worst regions: close 16.6 %, wide 5.7 %, far-edge 1.5 %.
- The cameras past the band only lighten (the far gain held at 1.15). The close one darkens where the oval fills the
  feet and lightens where the cap lifts main's darkest samples and the stipple calms.

**The cost:**

Metal, production builds (main 5227ec6 against the branch), `?armies=20`, alternated. Each round started only once
the 1-minute load average was under 3. The values are the default arm's (`l2`) p50, ms, the mean over its three yaws.

1. **The first default** (the capped shader at every zoom, the oval's read skipped past the band by a branch), 3
   rounds: no cost at 40 and 63 m, but +0.08 ms GPU at 125 m and +0.30 ms GPU (3 %) at 250 m, outside the spread
   in every round.
2. **Ablations at 250 m**, 2 rounds each, GPU p50 against main's 9.51 to 9.63 ms:
   - The oval compiled out past the band (a material without it): 9.78 to 9.80.
   - The cap's `pow` baked into the shade's alpha: 9.78.
   - The capped shader with one `dot` fewer: 9.80.
   - The capped shader with a near-black floor (`?ushcap=4`, so other coverage): 9.82, the same.
   - `?ushcontact=0` (0067's shader): 9.59, as main.

   So the cost was neither the oval, nor the cap's floor and coverage, nor the `pow`: it is the capped shader itself
   over the most shadow pixels of any zoom. Hence 0067's own shader past the band.
3. **The final default**, 3 rounds, rounds started at load 2.32, 2.45 and 2.64:

   | zoom | main frame | branch frame | main GPU | branch GPU |
   |---|---|---|---|---|
   | 40 m | 8.98 (8.98, 8.92, 9.05) | 7.85 (7.83, 7.82, 7.90) | 13.04 (13.05, 13.04, 13.03) | 13.06 (13.07, 13.06, 13.06) |
   | 63 m | 9.79 (9.77, 9.78, 9.83) | 9.81 (9.80, 9.85, 9.78) | 13.84 (13.86, 13.84, 13.83) | 13.89 (13.89, 13.89, 13.89) |
   | 125 m | 10.37 (10.37, 10.33, 10.40) | 10.49 (10.48, 10.52, 10.48) | 13.48 (13.50, 13.48, 13.46) | 13.51 (13.51, 13.51, 13.51) |
   | 250 m | 6.63 (6.63, 6.62, 6.63) | 6.64 (6.62, 6.67, 6.63) | 9.59 (9.60, 9.57, 9.58) | 9.58 (9.56, 9.60, 9.57) |

   - **40 m:** GPU equal. The frame p50 there sits at about 7.8 or about 9.0 ms whatever the arm: pacing.
   - **63 m:** +0.05 ms GPU, the oval and the cap; this round's spread is 0.03, the earlier rounds' about 0.05.
   - **125 m:** GPU +0.03, within the spread; frame +0.12 ms.
   - **250 m:** equal.

## Review round 1 (2026-10-27)

**The strip cut the oval** (severe).
- The oval's strip was clamped to the shape's cell, 0.99 m sunward of the soles on the far LOD. The oval with its
  pad and its fade (softness 1) reaches 1.5 to 1.7 m sunward. The reviewer measured a contact share of 0.65 (march)
  and 0.88 (run) at the strip's sunward edge: a straight cut on columns marching toward or away from the sun.
- Now the oval's material grows its strip past the cell (`contactReachOf`, `decalStrip`) and reads no shape outside
  it (`vCell` in `unitdecal.vert`, `unitdecal.frag`). The other material never gets the reach (`contactUniform`'s
  `near`).
- Tested on the figure's data: every baked step of every clip, step and stride ovals, 64 facings, the close, middle
  and far strips. The contact share at every strip edge is 0.
- Sheet: `output/armies-review/22-shadow-contact/9-strip-cut-80m.jpg`, the sunward rank of the demo battalion at
  80 m. There the cut was hidden by the neighbouring men's shadows; the crops differ by specks a few levels apart
  (the grown strip's rows shift, and with them the decal's lift near the feet).

**"Both compiled at load" was not true** (severe).
- `setFarScale` and `setLodFade` change the defines after the materials are made, so the forced compile went stale.
  The far material compiled on the first crossing of 100 m (a hitch).
- Worse, while the near one was not ready the far one could draw with the eased gain, above 1.15: past the cap.
- Now the material not drawn is compiled in the background (polled with `isReady` each frame until ready, and again
  after any change of the defines), and the switch waits for it.
- The far material's look keeps the cap whatever the weight (`heldLook`), so drawing it early is never darker than
  the cap.

**The far material broke the cap with a darkness over 1**, e.g. `?ushfoot` up to 1.5. Now its soles' and tip's
darkness are divided by the darker when it is over 1 (the coverage, their ratio, unchanged; tested with 1.5).

**Shader–mirror ties:** the capped lines of `unitdecal.frag` (lk, lg, room, the share, the contact, the cell mask),
the alpha factor of `unitshade.frag`, the step and oval frame of `unitdecal.vert` against `units.vert`'s step formula
are tied to their TS mirrors by source tests (`contactPoint` now mirrors the oval's frame and is tested on its own).

**Comments** claiming the oval's read is skipped at weight 0 are fixed: past the band it is a different material,
not a skipped read.

**Without coverage** (`?msaa=1|2`): the first shadow at a pixel wins, so a neighbour's faint oval rim drawn first can
keep a darker core from a pixel. This is documented in `docs/systems/look.md` (the sun shadows' faint edges already
behaved so on that path) rather than changed unmeasured.

**Also:**
- **The bilinear cap:** the shade's colour and its cap factor (the alpha) are filtered separately, and their product
  differs from the exact k · L(k)^0.15 by up to about 1 % across a texel where the shade changes fast (a tree
  shadow's edge); the 8-bit alpha adds at most 0.4 %.
- **The nearer LODs' feet** (lod0, lod1) are on the solid part of the far LOD's step ovals at every step (tested).

**Goldens** (main 5227ec6 against the fixed branch):
- The default page and `?armies=20&ushcontact=0`: a match at all 8 cameras.
- `?armies=20`: differs only on the battalions. Darker / lighter pixels by more than 6 levels:

  | camera | darker | lighter |
  |---|---|---|
  | start | 0 | 0 |
  | yaw −40 | 0 | 325 |
  | yaw +40 | 0 | 95 |
  | close | 2,887 | 5,889 |
  | river | 0 | 261 |
  | wide | 0 | 9,252 |
  | far-edge | 0 | 1,524 |
  | winter | 0 | 0 |

  Within a few pixels of before the fixes.
- The shadows' measurements: unchanged within 0.003.

**The cost after the fixes** (the larger strip within the band):

Metal, main 5227ec6 against the fixed branch, alternated, 3 rounds started at load 2.82, 2.90 and 2.93. GPU and
frame p50, ms, rounds in brackets:

| zoom | main GPU | branch GPU | main frame | branch frame |
|---|---|---|---|---|
| 40 m | 13.05 (13.06, 13.03, 13.06) | 13.06 (13.05, 13.07, 13.06) | 9.02 | 7.76 (pacing) |
| 63 m | 13.84 (13.84, 13.82, 13.85) | 13.89 (13.88, 13.89, 13.89) | 9.77 | 9.79 |
| 125 m | 13.48 (13.48, 13.46, 13.50) | 13.49 (13.49, 13.49, 13.49) | 10.41 | 10.38 |
| 250 m | 9.57 (9.58, 9.55, 9.58) | 9.56 (9.56, 9.58, 9.54) | 6.62 | 6.63 |

No regression from the larger strip: 40, 125 and 250 m equal main, and 63 m is +0.05 ms of GPU as before the fixes.


## Review round 2 (2026-10-27)

No severe issue; the last round. Fixed:

- **A softness of 0:** the contact's fade (`smoothstep(1, 1 + soft)`) was undefined there; it now takes at least 1e-4,
  as the mirror does. The line is pinned by the source test.
- **Stale names:** `contactGain` is `heldLook` in decision 0071 and here; units.ts no longer says both materials are
  compiled up front.
- **The strip on the shadow side:** past the soles the strip is drawn the look's length as long, so the grown box
  holds reach / len there. The real-data strip test now also runs at len 0.3 and with a pad of 1: no contact at any
  edge.
- **Cull bounds:** the contact's reach is scaled by the far figures' growth before the men's own reach is taken off.
- **The near material's darkness:** it now eases toward the held one by 1 − w, so a band that ends where the look's
  darkness is still over 1 does not pop at the switch. Tested with foot 1.05: at w = 0 it equals the far material.
- **The background compile:** it stops after 600 frames (10 s at 60 fps) with one warning, stays on the drawn
  material, and does nothing until a battalion exists.
- **The source tests** strip comments first and check each pinned line appears exactly once.
- **The look's wiring** (`decalUniforms`: the gradient, the gain, the contact's uniform, and the strip's reach only to
  the near material) is pulled out of `setDecalLook` and tested.

**Goldens** (main 5227ec6 against the fix):
- The default page and `?armies=20&ushcontact=0`: a match at all 8 cameras.
- `?armies=20`: the same differences from main as round 1.
- Against the round 1 build, 15 pixels differ by more than 6 levels, all at the close camera: the near material's
  darkness easing within the band.

**No new bench.** The default path's per-frame work is unchanged: the same shaders bar a `max` on a uniform, the
same strips at the default lengths (the tip is far past reach / len), and slightly larger cull bounds.

## Matching the trees (2026-10-27)

The owner, on the page (a white Austrian battalion on grass beside a tree's cast shadow): "here it looks darker and
bluer than the tree shadow … should we make the unit shadows a bit lighter to match?"

**Measured in that kind of frame:**
- The Austrians at (15, 157) and the French at (142, −96), each beside a tree's shadow, at the close, default and
  wide zooms, summer and winter, 1280 × 720.
- The tree: patches inside its shadow against lit grass across the edge, per channel (linear) and in Lab.
- The soldiers: the darkest 2 % (the contact) and the median (the tail) of the pixels they darken, against the same
  pixels without their shadows. (The script lives in the session's scratchpad, not in git.)

| | trees (6 views) | main | branch before (cap 1.15) | now |
|---|---|---|---|---|
| contact, luminance ratio | 0.14–0.28 | 0.07–0.16 | 0.19–0.25 | 0.23–0.29 |
| contact, R G B ratio | [0.14–0.26, 0.16–0.27, 0.26–0.42] | [0.05–0.10, 0.07–0.17, 0.17–0.34] | [0.11–0.14, 0.19–0.25, 0.46–0.51] | [0.20–0.24, 0.23–0.29, 0.36–0.39] |
| contact, Lab b* | +3 to +8 (inside the tree's shadow) | −3 to −1 | −3 to +1 | +7 to +11 |
| tail, luminance ratio | | 0.31–0.55 | 0.39–0.55 | 0.44–0.59 |
| hue distance to the trees | | 0.70 | 0.76 | ≈ 0.2 |

The hue distance is the mean over the views of |Δ ln(R/G)| + |Δ ln(B/G)| between the contact's ratio and the tree's.
Winter (snow; the trees bare, only one tree shadow in frame): the tree 0.25 [0.24 0.24 0.31]; now 0.24 to 0.29
[0.24 0.23 0.25]; main 0.08 to 0.17.

**Why "tree ≈ 0.17" disagreed with the eye.**
- In luminance the earlier patches were right: the trees' shadows measure 0.14 to 0.28 of lit grass here too.
- What differed was the hue. The decal darkens toward the ground's shade k, baked from the ground's macro colour.
  The grass paints its own shadow, much redder: k's channel ratios are about [0.6, 1, 2.4] relative to green, the
  trees' [0.95, 1, 1.8]. So a soldier's shadow at the same lightness read blue-grey beside a teal-green tree shadow.
- 0067's gain then raised the contact's darkness past the tree's (0.07 to 0.16).
- The cap at 1.15 fixed the darkness and kept the blue. In the owner's screenshot the tails are as light as the tree
  shadow (L* 44 against 42) but bluer (b* 2 to 6 against 7).

**Now the default:**
- **Gain 1, close and far**, and the soles' darkness 1 (0062's 1.05): no part of the sun's shadow goes darker than k.
- **The contact's core is k itself** (darkness 1), added to 0062's coverage rule (`contactFragment`). The cap and
  its shader path are gone: at gain 1 the plain shader cannot pass k.
- **The shade "desaturated" 0.65** (`SHADE_DESAT`, `?ushdesat`): each channel of k is moved 0.65 of the way toward
  k's own luminance, so its lightness stays the same and its blue cast mostly goes. Baked once into the shade texture
  (`unitshade.frag`); free per frame.
  - Swept 0 / 0.5 / 0.75 / 1: hue distances 0.77 / 0.25 / 0.23 / 0.53. 0.65 sits between the two best.
- `?ushcontact=0&ushdesat=0&ushgain=2,1.5&ushfoot=1.05,0.4` is decision 0067's page exactly (goldens: a match).
- A k-dark contact is a little lighter than a tree's core where the crown also hides sky. That is the owner's
  "a bit lighter".

**A bug found on the way** (also in `af16faa9`): after a switch between the two decal materials, the "idle is ready"
flag still described the previous idle material. Switching back to one compiled before a define change then drew
nothing until it recompiled: the first close view of a page had no soldier shadows. Now the switch asks the wanted
material itself, and the idle poll restarts after every switch.

**Sheets:** `output/armies-review/22-shadow-contact/10-match-tree-close.jpg`, `-default.jpg`, `-wide.jpg` (native
pixels: main | the branch before | now, the tree's and the soldiers' ratios and Lab on each).

**Goldens** (main 5227ec6 against the new default):
- The default page: a match at all 8 cameras.
- `?armies=20&ushcontact=0&ushdesat=0&ushgain=2,1.5&ushfoot=1.05,0.4`: a match at all 8 cameras.
- `?armies=20`: only the battalions, mostly lighter. Darker / lighter pixels by more than 6 levels:

  | camera | darker | lighter |
  |---|---|---|
  | start | 0 | 0 |
  | yaw −40 | 0 | 389 |
  | yaw +40 | 0 | 106 |
  | close | 930 | 8,310 |
  | river | 0 | 346 |
  | wide | 0 | 11,546 |
  | far-edge | 0 | 2,755 |
  | winter | 0 | 0 |

**The cost:**

BENCH10
