---
status: proposed
date: 2026-10-18
---

# 0040 The gameplay depth of field blurs the near field too, in the bottom band, units with the scene

## Context

The gameplay depth of field (decision 0024) blurred only what lies beyond the focus: an earlier near blur failed the
readability guard at the screen's foot (`docs/plans/done/gameplay-dof.md`). At the closer zooms, tree crowns and the
end of the grass at the frame's foot are cut by the near plane; the owner asked for them blurred instead, and for a
depth of field that reads as painted. The research: `docs/research/dof-v2.md`.

## Decision

We will blur the near field as well as the far one, each within its band of the frame: the far blur toward the top
(as before), the near blur only in the bottom share of the frame (`DOF_NEAR.screen`, 0.3), so the formations in the
middle never take it. Units blur by their own depth as the scene does: a formation in the far band blurs with the
ground round it, one under a blurred crown is covered as the ground is (the owner, 2026-10-18: "it's normal a unit take
some blur", against a sharp unit in a blurred far field; the blur is mild and only in the top and bottom bands).
Readability is the guard's to check, with the blur on, where the game is played: the sharp middle of the frame. A
unit's mild blur in the bands is by design, not a readability failure. The blur's colour follows it: the far blur toward the haze, the near layer darker and cooler.

## Consequences

The frame's foot reads as a painted foreground instead of a cut. The readability guard passes with the depth of field
on at the start and cover views (`docs/plans/done/dof-v2.md`). No special case for units in the lens term: one code
range for every surface, so the MSAA resolve's averaging of codes at a unit's edge is the same soft edge as any other
object's. The cost against the depth of field off: +0.1 to +1.1 ms at the oblique mid zooms on the dev Mac, by view
and session (the plan).

## Alternatives considered

- Keep the near field sharp and cut (0024 as built): the owner's complaint.
- A near blur over the whole frame: blurs formations near the camera; fails "readable first".
- Fade near objects out instead of blurring them: removes what the player may need to see, and reads as a glitch.
- Units never blurred (a unit alpha code, the near layer held to half coverage over it), as first built: a sharp unit
  in a blurred far field breaks the miniature, and the MSAA resolve blurs a unit's edge anyway; the owner rejected it.
