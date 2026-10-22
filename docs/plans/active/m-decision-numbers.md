---
status: active
last_reviewed: 2026-10-13
---

# Plan: Track M's decisions renumbered, and M3's plans done

Track M, on `epic/map-engine` (decision 0020). One docs PR into the epic, before M4.

## Problem

Main and the epic have each numbered their own decisions from 0022. Main now holds 0022 (the soft ramp for
foliage), 0024 (blur as a player option), 0025 (review rounds by kind of PR) and 0026 (crops under a soldier's
chest); the epic holds 0022–0025 (generators by dependency, the chain, free-standing trees, shared edges). Numbers
are never reused (`docs/decisions/README.md`), and `tools/check-docs.mjs` refuses two records with one number, so
the epic cannot reach main as it is. M3 is also finished, yet its plans (M3a–b and M3d)
are still under `docs/plans/active/`.

## Approach

- The epic's records move to the next free numbers after main's: 0022 → 0027, 0023 → 0028, 0024 → 0029,
  0025 → 0030. Their files, their titles, the supersession between them (0028 supersedes 0027; 0027 is now 0049, see `docs/decisions/README.md`), the decisions
  table, the system doc's front matter and every citation in docs, code comments, tests and the example maps
  follow. The records' content is otherwise unchanged: this is a number, not a decision, so it is not an edit
  of an accepted record in the sense of the README's rule. The README notes the old numbers, since merged PRs
  #66–#72 and #49 cite them; 0023, which main never used, is retired.
- M3's two plans move to `docs/plans/done/` (`docs/plans/done/m3-generators.md`, `docs/plans/done/m3d-follow.md`), and every path to them follows; the index
  lists them as done.
- Main is not merged into the epic here: a squash-merged PR would flatten main's history into one commit. That
  merge is its own step on the epic, after this PR.

## Acceptance

- No `0022`–`0025` left in the epic's tree outside unrelated data (`prototypes/` model data); no path to the two
  plans under `active/`.
- `node tools/check-docs.mjs` passes on the epic, and on a trial merge of main into this branch (no number held
  twice).
- `npm test`, `npm run check:data` and `npm run build` pass; the example maps are unchanged apart from the plan
  path in their `note`.

## Review (one round, a docs PR: decision 0025 on main)

No severe finding. Fixed: the two moved plans said `status: active`; the README now states the renumber as the one
change allowed to an accepted record, retires 0023, and names #49 among the PRs citing old numbers (its body is
updated to the new ones). Kept: the done plans' round logs use the new numbers, read through the README's mapping.
