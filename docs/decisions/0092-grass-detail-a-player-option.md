---
status: accepted
date: 2026-10-30
---

# 0092 Grass detail, a player option: Full by default, Balanced to spare the frame

Accepted by the owner on 2026-10-30 (issue #257), from the experiments' numbers and stills. As built:
`docs/systems/look.md` (the meadow and the crops) and `docs/plans/active/grass-detail.md`. It adds a choice over
decision 0085's meadow, which stays the default and is unchanged.

## Context

On the Austerlitz windows the close camera costs about 9 ms of GPU on the dev Mac (Metal), over the 8.3 ms budget.
Grass and crops cover more of the screen there than on the demo (#257).

Two cheaper meadows were tried:
- Fewer, wider blades past about 10 m: about 0.7 ms less close, but 0.3–0.5 ms more at the default zoom.
- Crops drawn only near the camera: 0.1–0.2 ms less, and their 25 m edge shows.

The owner wanted the cheaper grass as the player's choice, not as everyone's meadow.

## Decision

We will give the player a **Grass detail** setting with two levels (`src/look/grass-detail.ts`, `?grassdetail`, the
look page's settings panel):

- **Full**: decision 0085's meadow, the default everywhere, map windows included.
- **Balanced**: up close, the near ring's grass from 8–12 m of the focus out to its edge (25 m) is the small clump
  with every other blade, at the large clump's footprint. Between 70 and 110 m of zoom it hands back to Full's ring
  continuously, so from 110 m out, the default zoom included, Balanced draws Full's meadow. Inside 8 m and on the
  outer rings the grass is Full's.

The crops are drawn as at Full at both levels (decision 0085's wheat fill unchanged). The setting applies live.

## Consequences

- **Balanced** spares GPU time at the close camera, aimed at Kobelnitz's 8.3 ms budget, and is meant to be even with
  Full at the default and wide zooms (the numbers: the plan).
- **What Balanced loses.** Past about 10 m the carpet is thinner: fewer strokes, with more of the ground showing
  between them. Inside 8 m it is unchanged.
- **Full** draws exactly what main drew (the goldens match).
- **Applying a change.** Both levels' rings are built (the cut ring is hidden at Full), so a change applies on the next
  frame, without a reload.

## Alternatives considered

- **Every ring thinned, the blades widened ×1.4, and the inner rings cut from 60 m of camera radius** (the first
  experiment). It saves the same close, but costs 0.3–0.5 ms at the default zoom: the wider clumps cover more pixels.
- **Every ring thinned, not widened.** It saves less close, and still costs up to 0.1 ms at the default zoom: thinner
  outer rings show more ground, which costs more to shade than the grass that hid it.
- **The near ring thinned at every zoom.** At the default zoom it costs 0.4–0.7 ms on the demo, where the thinner
  carpet shows more ground.
- **Crops beyond 25 m left to the ground's paint.** It saves 0.1–0.2 ms, and the 25 m line shows as a change of
  tone.
- **Balanced for everyone.** The owner keeps the full carpet as the look; the cheaper one is a choice.
