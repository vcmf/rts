---
status: accepted
date: 2026-10-30
---

# 0095 Grass detail, a player option: Full by default, Balanced to spare the frame

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
- **Balanced**: up close, the near ring's own program with one define (`GRASS_THIN`) shrinks away a share of its
  grass clumps, each picked by a hash of its own. The share is none at 8 m from the focus; from 12 m half the clumps
  are culled and a fifth more shrunk. It goes back to
  none across the near ring's band out (18–25 m), where the middle ring fades in. Across 70–110 m of zoom the share
  falls to none, and from 110 m out, the default zoom included, the ring draws Full's program.

The crops are drawn as at Full at both levels: the drop lies on the grass branch only (decision 0085's wheat fill
unchanged). Full's material and program are main's. The setting applies live.

## Consequences

- **Balanced**, measured (the plan's outcome: dev Mac, Metal, two alternated rounds, GPU frame p50):
  - Kobelnitz's close camera: 0.6–0.7 ms less, 8.19–8.34 ms against Full's 8.84–9.02. Two of its three yaws come
    under the 8.3 ms budget; the third is 0.04 ms over.
  - The demo's close camera: 0.1–0.35 ms less.
  - The default and wide zooms and a 90 m view: even with Full, within ±0.03 ms.
- **What Balanced loses.** From about 10 to 20 m the carpet is sparser: half the grass tufts gone and a fifth more
  smaller, with more of the
  ground showing between them. Inside 8 m, the crops and the outer rings are unchanged.
- **Full** draws main's program: the shader without the `GRASS_THIN` blocks is main's, and the near ring keeps its
  material. Full now differs from main on the CPU only:
  - the material declares two more uniforms and holds values for them, which Babylon's bind asks for each frame (no
    GL call: the program has no location for them);
  - a few arithmetic operations of the share's ease run each frame.

  The goldens against main's build match in every region of every view, on the demo and on Kobelnitz.
- **Applying a change.** It toggles the define live, without a reload:
  - the new program is compiled ahead while Balanced is chosen (and again when the material's other defines change);
  - the look tools wait for it to be in force before a still (`__look.meadowSettled`);
  - the switch waits until it is ready, so the ring never blinks;
  - the share eases up from none after the switch on and down to none before the switch off, so no clump pops.

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
- **The near ring split into a large-clump ring and a thinned-clump ring beyond the cut, with crop and world-anchored
  rings around them** (review rounds 1–3). Crops and grass share the near ring and its clump. So every change to the
  grass alone needed more rings, and their cost and complexity moved onto the crops, the CPU and finally Full
  (`docs/plans/active/grass-detail.md`, Redesign).
