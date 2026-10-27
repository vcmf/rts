---
status: accepted
date: 2026-10-27
---

# 0071 A contact shadow under the soldiers' feet, every shadow capped at a tree's

Amends 0062 (the simple shadow at every zoom) and 0067 (its gain). Accepted by the owner on 2026-10-27 from the
test's sheets. The plan and its measurements: `docs/plans/done/shadow-contact.md`; as built: `docs/systems/look.md`
("The armies").

0069 and 0070 are taken on other branches, so this is 0071.

## Context

The owner, 2026-10-26: the shadow should be "darker and more solid at the foot of the soldier". Of a darker foot
gradient: "darker than the tree shadow so not good". And: "the bottom shadow should cover the foot even in movement
… as it's a fixed shadow, the shadow can be detached from the foot … a good enough shadow with fast performance is
always preferred". The rule: no part of a soldier's shadow darker than a tree's cast shadow.

Measured (the plan):

- 0062's shape is averaged over a clip's steps, so it does not move with the feet. At the feet its value averages
  0.19 marching and 0.11 running, and it is at least half its darkest under none of the marching or running feet.
- With 0067's gain, the darkest 2 % of a soldier's shadow already went darker than a tree's (0.10 to 0.15 of the
  unshadowed ground, against 0.17).

## Decision

- **A contact oval under each man's feet** (`SHADOW_CONTACT` in `src/look/shadow-look.ts`; `contactOvals` in
  `src/look/units-data.ts`; `src/look/shaders/unitdecal.{vert,frag}`):
  - Drawn in the decal pass, not by the sun.
  - Sized from the figure's own clips: the oval holds the feet at the step the man is posed at, so it follows them.
    The feet are the posed vertices near the clip's lowest point; no era names (0015).
  - Grown 0.1 m past the feet, solid over that, fading out over as far again (softness 1), at 0.9 of the cap's
    darkness: the owner's picks.
  - Every foot of every clip's every step lies on its solid part (tested).
- **Every shadow capped at about a tree's cast shadow.**
  - A covered sample takes the ground's shade, its luminance raised to 1.15, its hue kept. 1.15 was measured: a
    tree's shadow is darker than the shade, because the crown hides sky too.
  - A pixel takes the share that gives it the darkening it had before, or the contact's, whichever is more, at most
    all of it.
  - So no gain makes a pixel darker than the cap. 0062's overlap rule holds unchanged (one colour for every shadow at
    a pixel).
  - 0067's gain stays, 2 up close and 1.5 far: it now only shapes the tail where that is lighter than the cap.
- **Only where feet show, and no cost past them**: the oval is whole to 60 m from the camera's focus (the default
  zoom is 63 m), fades out to 100 m, and is gone beyond.
  - Past 100 m the decal draws with 0067's own shader, not the capped one: no oval, no cap code. Its gain is held
    to the cap's exponent (`contactGain`: 1.15, not 0067's far 1.5).
  - That keeps the cap: a fully covered pixel there is L(k)^gain at most, never darker than L(k)^1.15.
  - Across the band the gain eases from the look's to that, and where the cap no longer binds the capped look gives
    the uncapped one's pixel, so nothing pops at the switch (tested).
  - Both materials are compiled at load; the page switches between them only when the band's edge is crossed.
  - The cap's factor L(k)^0.15 is baked once into the shade's alpha (`src/look/shaders/unitshade.frag`), so the
    capped shader raises nothing to a power for it.
- **Switches** for the A/B:
  - `?ushcontact=<pad>,<dark>[,<soft>]`; `?ushcontact=0` for none, and with no `?ushcap` as well the shadows are
    exactly 0067's.
  - `?ushcontactat=step|stride|root`.
  - `?ushcontactband=<r0>,<r1>`.
  - `?ushcap=<exponent 1..4>`.

## Consequences

- At the close and default zooms, the darkest pixels of a soldier's shadow sit at or just above a tree's shadow, with
  a filled core instead of a stipple. The boots stand on dark ground at every step of a march.
- The far zooms are lighter than 0067's: the darkest tenth 0.25 against 0.17 at 125 m, and the tail too (median
  0.38 against 0.30), from the far gain held at 1.15. That is the price of costing what main does there.
- On snow, the contact is 0.21 to 0.25 of lit snow, against a conifer's shadow of about 0.23.
- No measurable cost on Metal at 40, 125 and 250 m; +0.05 ms of GPU at 63 m, inside the run-to-run spread of
  earlier rounds (the plan's bench).
- Tall meadow grass still covers the contact up close: the decal is not lifted at the feet, so it does not darken the
  shins.
- In a tree's or hill's shadow (shade 1) the contact draws nothing, so it is never darker than that shadow.

## Alternatives considered

- **Stride:** one oval over a clip's whole foot travel. It keeps the feet on it too, but is a larger still oval
  (marching, about 0.59 m² against 0.43 m²).
- **Root:** a disc at the root. At 0.35 m it keeps 94 % of the marching feet and 79 % of the running feet.
- **A darker foot gradient** (the owner's tried URL): far darker than a tree's shadow.
- **Capping at the shade itself:** lighter than a tree's shadow, so the shadows would have been lighter everywhere.
