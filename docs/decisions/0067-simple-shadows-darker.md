---
status: accepted
date: 2026-10-26
---

# 0067 The soldiers' simple shadows darker: a gain on their darkening

Amends 0062 (the simple shadow at every zoom): its look gains one setting, the strength of the darkening; the
shadows' shape, size, softness, length and foot gradient stay 0062's. The plan: `docs/plans/active/shadow-darker.md`;
as built: `docs/systems/look.md` ("The armies").

## Context

The owner, 2026-10-26, of 0062's shadows: "i still do think the new shadow good but a bit too weak, can we make it
darker pls". 0062 darkens a covered sample toward the ground's shade (the ratio of its painted cast shadow to its
light), so at most about as dark as that ratio says. Measured (the plan): the darkest tenth of a soldier's shadow kept
0.29 to 0.38 of the unshadowed ground's luminance, about twice a tree's cast shadow (0.17).

## Decision

- **A gain on the full darkening** (`SHADOW_LOOK.close.gain`, `.far.gain` in `src/look/shadow-look.ts`; `uShGain` in
  `src/look/shaders/unitdecal.frag`): the darkening `d = max(mix(1, k, f), 0)` becomes `d · L(d)^(gain − 1)`, `L` its
  Rec. 709 luminance; then, as before, the coverage (alpha to coverage, or the share `a` without it) spreads it over
  the pixel. The channels are scaled alike, so the ground's shadow hue is kept wherever no channel was clamped at 0;
  never below 0; nothing darkened where the ground already lies in full shadow; at gain 1 exactly 0062's shadow.
- **One value for every shadow** a frame: the overlap rule (each sample darkened once, the darkest wins whatever the
  draw order) holds at any gain.
- **The values, the owner's pick (2026-10-26) from the plan's sheets: 2 up close, 1.5 far**, turned from one to the
  other over the look's band like its other settings. The switch `?ushgain=<close>[,<far>]` (1 to 3;
  `?ushgain=1,1` is 0062's shadow) tunes it live; below 1 is refused (it would brighten a channel).

## Consequences

- The shadows' darkest tenth is now about a tree's cast shadow at the close, default and wide zooms; in every mood
  and on winter snow the contact stays at a tenth or more of the ground's light, never black (the plan).
- No measurable cost on Metal (the plan's bench: a dot, a `pow` and a multiply a fragment, no reads).
- Under `?ushadowclose=map` the cross-fade blends the map's shadow, which has no gain, against the gained decal.

## Alternatives considered

The `mix` extrapolated past the ground's shade (clamps channels at 0: black and hue shifts on dark or tinted
shade); a `pow` on each channel (raises the shade's tint with its darkness); a higher darkness share at the tip alone
(the foot already at 1.05: the gradient flattened, not darker); a gain on the coverage (lighter parts darker but the
contact no darker than the ground's shade).
