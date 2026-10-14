---
status: accepted
date: 2026-10-14
---

# 0033 The temperate mood is the default

## Context

The owner's reference review (`docs/research/colour-and-light-review.md`): the look must become "more epic and
beautiful, not colourful in the sense of a normal camera". The landscape should carry little colour and its values
should make the image. The art bible's light was "golden morning (default)": a warm orange-yellow sun over a saturated
yellow-green meadow with bright orange patches.

LC2 (`docs/plans/done/lc3-temperate.md`) built the light as moods (LC1) and gave a mood an **earth**: a shift of the
world's own colours, on the albedo before the light. Its candidates were:
- the film's overcast (*Napoleon*, 2023);
- dusty warm (the ochre battle stills);
- autumn earth (the farm);
- `golden`, today's look, as a control.

The owner judged them blind on the full map (the generated trees, the army blocks, any season and camera):
- dusty and autumn were "too similar, too yellow-orange";
- overcast was "too grey";
- golden was "too colourful".

They asked for golden "a bit cooler, less colourful, but not grey", and picked that mood, `temperate`, when it was
added.

## Decision

We will make `temperate` the default mood (`src/look/mood.ts`). Compared with golden:
- the sun is paler and less warm;
- the shadow, mist and haze are bluer;
- the world keeps 60 % of its chroma, turned slightly warm-grey;
- the grade is milder;
- units take 0.3 of the sun's hue, 0.05 of the mist and 0.1 of the grade.

It replaces the art bible's "golden morning (default)" (§4). `golden` stays as `?mood=golden`, and a map may set its
own mood.

## Consequences

- Good: the landscape recedes and the armies read as the strongest colour. The coat check passes, including a new far
  spot (the widest view's top band). Against golden, 116 of the guard's 132 blocks separate better.
- Bad: the Austrian white on winter snow separates less, because the snow is whiter (two blocks under the bound,
  accepted by the owner; #78).
- Good: a mood is all data. Another map's light (a dusk, a winter battle) is a new table entry, judged the same way.
- Bad: the earth costs a few instructions on every painted pixel: +0.07 to +0.23 ms a frame (the plan).
- Bad: in the valley mist the Russian green drifts toward teal (hue 149 against the painted 133, inside the coat
  check's 20°), because the sun is less warm.

## Alternatives considered

- Each of LC2's candidates (above): judged and not picked.
- Keeping golden and toning it down in the grade only: the grade acts after the light and on everything, units' share
  included, while the earth acts on the world's albedo alone.
