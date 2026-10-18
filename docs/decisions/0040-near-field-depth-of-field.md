---
status: proposed
date: 2026-10-18
---

# 0040 The gameplay depth of field blurs the near field too, in the bottom band, never the units

## Context

The gameplay depth of field (decision 0024) blurred only what lies beyond the focus: an earlier near blur failed the
readability guard at the screen's foot (`docs/plans/done/gameplay-dof.md`). At the closer zooms, tree crowns and the
end of the grass at the frame's foot are cut by the near plane; the owner asked for them blurred instead, and for a
depth of field that reads as painted. The research: `docs/research/dof-v2.md`.

## Decision

We will blur the near field as well as the far one, each within its band of the frame: the far blur toward the top
(as before), the near blur only in the bottom share of the frame (`DOF_NEAR.screen`, 0.3), so the formations in the
middle never take it. A unit's own pixels are never blurred: units write one alpha code, at the focus, that no surface
writes, which the blur reads as sharp. (A unit's edge pixels, which the MSAA resolve shares with the ground behind, take
a share of that ground's blur.) A blurred foreground spreads over a unit at half coverage at most. The blur's colour follows it:
the far blur toward the haze, the near layer darker and cooler.

## Consequences

The frame's foot reads as a painted foreground instead of a cut. The readability guard passes with the depth of field
on at the start and cover views, and a unit pixel's colour moves by at most 10 levels out of 255 (the bloom and paper
over the blurred surroundings). The cost against the depth of field off: up to +0.7 ms at the oblique mid zooms on the
dev Mac (`docs/plans/active/dof-v2.md`). A unit in the bottom band behind a blurred crown is half hidden; that is the
cap's purpose and its limit.

## Alternatives considered

- Keep the near field sharp and cut (0024 as built): the owner's complaint.
- A near blur over the whole frame: blurs formations near the camera; fails "readable first".
- Fade near objects out instead of blurring them: removes what the player may need to see, and reads as a glitch.
