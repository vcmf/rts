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
