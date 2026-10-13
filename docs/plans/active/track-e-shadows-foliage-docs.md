---
status: active
last_reviewed: 2026-10-13
---

# Plan: record the shadow and foliage work in Track E (docs)

The shadow look (#59), the soft shadows (#60), the leaf-card crowns (L7a, #58) and their volume light (L7b, #61)
each updated their own plan and `docs/systems/look.md`, but not the track's documents. The owner (2026-10-13):
"have we upgraded the graphics track design and implementation docs with these new work and findings?"

## Scope (docs only)

- `docs/plans/active/track-e-look.md`: L7's progress (what is built, what L7 still owes), the shadow work as a
  stage-1 item, the owner's answer on tilt-shift (question 3), the change log.
- `docs/plans/active/track-e-results/`: the day's measurements in one place (the cost of the stack, the shadows,
  the crowns, the guard), with the bench JSON of the dev Mac (proxies).
- `docs/art-bible.md`: the light as built (the penumbra, the sky's occlusion, the woods), the crowns' soft ramp as
  an exception to the three bands (a proposed decision), depth of field reopened as a question.
- `docs/decisions/0022-soft-ramp-for-foliage.md` (proposed) and the decisions' index. (0020 and 0021 are taken by
  Track M's open PR #49.)
- `docs/systems/look.md`: the module table (`canopy.ts`, `leaves.ts`, the bakes), the open questions.
- `docs/research/tiny-glade-look.md`: what the research on Tiny Glade found, and what we took from it.
- Known issues as GitHub issues: #62 (the mist tints sunlit snow), #63 (the cards and a dark coat's separation).

Not in scope: `docs/proposals/engine-design.md` (a proposal is frozen once built; its bakes live in the system doc).

## Acceptance

- `node tools/check-docs.mjs` passes; `/code-review high` per the workflow.
