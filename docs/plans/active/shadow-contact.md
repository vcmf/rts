---
status: active
last_reviewed: 2026-10-26
---

# Plan: a contact shadow under the soldiers' feet, capped at a tree's shadow (a test)

Asked by the owner (2026-10-26), of the simple shadows (decisions 0062 and 0067): "darker and more solid at the
foot of the soldier". Shown `?ushfoot=1.5,0.6,1.5,0.6&ushdark=0.5,0.6`: "darker than the tree shadow so not good,
but at least the feet shadow look more solid, so the direction maybe good". Then: "the bottom shadow should cover
the foot even in movement … as it's a fixed shadow, the shadow can be detached from the foot … a good enough shadow
with fast performance is always preferred". The owner's rule: **no part of a soldier's shadow darker than a tree's
cast shadow.**

This branch is the test: switches only, the default unchanged (the shader's new path is behind a define that is
off unless a switch asks for it). Once the owner picks, a follow-up makes the pick the default with a decision record
amending 0062 and 0067 and the system doc (`docs/systems/look.md`).

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
- The owner picks the candidate; then the default, a decision record, the system doc, the goldens.

## Open questions

- The tall meadow grass covers the contact around the boots up close (the decal is not lifted at the feet, so it does
  not darken the shins); a contact on the grass blades would need the lift near the feet or the grass shader to read it.
- In a tree's or a hill's shadow (k = 1) the contact draws nothing, as the sun's shadow: an ambient contact there would
  break the "never darker than a tree's shadow" rule.
- Stride or step: the same cost; step hugs the feet and moves with them at the poses' 12 fps, stride is one still
  oval a clip (merging into a band under a dense block).
- The cap's exponent is calibrated against one tree up close; the shade varies over the map, and a tree's shadow there
  with it.
