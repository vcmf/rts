---
status: done
last_reviewed: 2026-10-14
---

# Plan: units take the soft cloud shade

A follow-up to the ground's light (`docs/plans/done/ground-light.md`). There, a cloud became a soft shade on every
painted material except units, which kept the old drop of their light into a darker band so a coat read on bright
ground under a cloud (decision 0032 as proposed). The owner rejected that rule (2026-10-14): "we worry too much about
readability; they have colourful coats, and a shadow at their feet". The white-coat half of 0032 stays open until the
soldier figures.

## Scope

The painter's unit path (`KEEP_HUE`): the cloud as the shared shade (`cloudShade`), not a band drop. Decision 0032
rewritten to the white rule alone (open); decision 0033 accepted; the art bible's and the system doc's cloud lines.

## Approach

- In `paint()`, units (`KEEP_HUE`) lose the cloud's band drop and take the cloud as a shade, as every other material.
- Review round 1 (severe): the shade's full cool hue turned a white under a cloud blue (a white allows 8 steps of
  chroma; the shade gives it about 33), against decision 0027. Units' shade is white-balanced as the sun is: its value,
  `wb` of its hue.
- No frozen spot near the start sits clearly under a cloud since the ground's light (the graded edge): a cloud spot
  for the coat check was tried and measured in sun, so it was dropped. The white balance holds by construction (the
  shade's hue scaled by the same `wb` as the sun's).

## Acceptance

- `tools/coat-check.mjs` 12 of 12.
- `tools/guard.mjs --base` main, start, cover and crops, three seasons: the blocks under a cloud measured; a failure
  there is the owner's call (recorded), not a block.
- The goldens: unchanged (no units in them).
- `npm test`, `node tools/check-docs.mjs`.

## Results

Main at dd6c835.

- `tools/coat-check.mjs`: 12 of 12.
- The guard against main, start, cover and crops, three seasons: one block under the bound, the British red on the
  winter meadow at a cloud's edge, 0.098 against main's 0.108 (bound 0.10), accepted by the owner's call above. The
  cover and crops views pass.
- The goldens: a match at the 8 views (no units in them).
