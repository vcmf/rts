---
status: accepted
date: 2026-10-27
---

# 0071 A contact shadow under the soldiers' feet; their shadows no darker than the ground's painted shadow

Amends 0062 (the simple shadow at every zoom) and supersedes 0067's values (its gain, 2 up close and 1.5 far, is now
1; the gain switch stays). Accepted by the owner on 2026-10-27: the oval from the test's sheets; then, asked to
match the trees, the darkness and hue measured here (contact 1, gain 1, soles 1, desat 0.65): "look good". The plan and its
measurements: `docs/plans/done/shadow-contact.md`; as built: `docs/systems/look.md` ("The armies").

0069 and 0070 are taken on other branches, so this is 0071.

## Context

The owner, 2026-10-26 and 2026-10-27:
- "darker and more solid at the foot of the soldier".
- Of a darker foot gradient: "darker than the tree shadow so not good".
- "the bottom shadow should cover the foot even in movement … a good enough shadow with fast performance is always
  preferred".
- Then, of the first build of this record (every shadow capped near a tree's): "here it looks darker and bluer than
  the tree shadow … should we make the unit shadows a bit lighter to match?"

Measured (the plan):
- 0062's shape is averaged over a clip's steps, so it does not move with the feet. At the feet its value averages
  0.19 marching and 0.11 running, and it is at least half its darkest under none of the marching or running feet.
- With 0067's gain the contact went far darker than a tree's shadow: 0.07 to 0.16 of the lit ground, against 0.14
  to 0.28.
- The ground's shade k, the ratio the decal darkens to, is far bluer than a tree's painted shadow on the grass:
  channel ratios about [0.6, 1, 2.4] against [0.95, 1, 1.8], relative to green. It is baked from the ground's macro
  colour, while the grass paints its own shadow. So even at k a soldier's shadow read blue-grey beside a tree's
  teal-green.

## Decision

- **A contact oval under each man's feet** (`SHADOW_CONTACT` in `src/look/shadow-look.ts`; `contactOvals` in
  `src/look/units-data.ts`; `src/look/shaders/unitdecal.{vert,frag}`):
  - Drawn in the decal pass, not by the sun.
  - Sized from the figure's own clips: the oval holds the feet at the step the man is posed at, so it follows them.
    The feet are the posed vertices near the clip's lowest point; no era names (0015).
  - Grown 0.1 m past the feet, solid over that, fading out over as far again (softness 1).
  - Every foot of every clip's every step lies on its solid part, the nearer LODs' feet too (tested).
  - The oval's strip reaches past the shape's cell, which it reads nothing outside, so no strip edge cuts the fade
    (tested).
  - The contact is one more darkness in 0062's coverage rule (`contactFragment`), so the overlap rule holds unchanged.
  - Its material lifts the decal at least 3 cm toward the camera (`CONTACT_FLOOR`). The oval's half behind the soles
    is otherwise unlifted, and the terrain hid it there: the oval was cut along the soles (the owner: "cut in half").
    8 cm darkened boots.
- **No part darker than the ground's painted cast shadow:**
  - The contact's core is the shade k itself (darkness 1).
  - The sun's shadow's gain is 1 close and far (0067's 2 and 1.5 retired), and its soles' darkness 1 (0062's 1.05).
    A covered sample therefore goes at most to k, and the tail is lighter by coverage, as 0062 drew it.
  - No cap code is needed: the uncapped shader cannot pass k at gain 1.
- **The shade's hue turned toward its grey**, 0.65 of the way, its luminance kept (`SHADE_DESAT`; baked once into
  the shade texture, `src/look/shaders/unitshade.frag`, so it costs nothing per frame). Measured against the trees'
  painted shadows, this cuts the hue gap from 0.77 to about 0.2 (a log-ratio distance; the plan). On snow the shade is
  near grey already.
- **The oval only where feet show:** whole to 60 m from the camera's focus (the default zoom is 63 m), fading out to
  100 m, gone beyond.
  - Past the band the decal draws with 0062's own material, which has no oval read, varying or cell test.
  - The material not drawn is compiled in the background. The page switches only when the wanted one is ready, so a
    material that isn't ready is never drawn.
- **Switches** for the A/B:
  - `?ushcontact=<pad>,<dark>[,<soft>]` (0: none).
  - `?ushcontactat=step|stride|root`.
  - `?ushcontactband=<r0>,<r1>`.
  - `?ushdesat=<0..1>`.
  - `?ushcontact=0&ushdesat=0&ushgain=2,1.5&ushfoot=1.05,0.4` is decision 0067's page exactly.

## Consequences

- **Lighter than 0067's.** The contact is k: 0.23 to 0.29 of the lit ground, against 0.07 to 0.16 on main and a
  tree's 0.14 to 0.28. The tail (median) is 0.44 to 0.59, against 0.31 to 0.55.
- **The tree's hue.** The contact's ratio is about [0.21, 0.25, 0.37], against the trees' [0.14–0.26, 0.16–0.27,
  0.26–0.42].
- **Slightly lighter than a tree's core.** Where a crown also hides sky, a tree's shadow is darker than k.
- **The boots stand on the oval at every step of a march** (the motion sheets).
- **Cost:** see the plan's bench. Past the band the decal is 0062's shader; within it, the oval's.
- **Tall grass:** the meadow still covers the contact up close. The decal is not lifted at the feet, so it does not
  darken the shins.
- **In shade:** in a tree's or hill's shadow (shade 1) the soldiers' shadows draw nothing.

## Alternatives considered

- **Stride:** one oval over a clip's whole foot travel. It keeps the feet on it too, but is a larger still oval
  (marching, about 0.59 m² against 0.43 m²).
- **Root:** a disc at the root. At 0.35 m it keeps 94 % of the marching feet and 79 % of the running feet.
- **A darker foot gradient** (the owner's tried URL): far darker than a tree's shadow.
- **A cap near a tree's core darkness** (this record's first build: the shade's luminance to the power 1.15, every
  covered sample at it): darker and bluer than the trees the player sees. It also needed its own shader path within
  the band and a held gain past it.
