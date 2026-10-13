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
- `docs/plans/active/track-e-results/`: the cards' and the volume light's cost (one-page A/Bs on the frame
  interval, with their JSON) and what the plans found, linked to the plans that hold the numbers.
- `docs/art-bible.md`: the light as built (the penumbra, the sky's occlusion, the woods), the crowns' soft ramp as
  an exception to the three bands (a proposed decision), depth of field reopened as a question.
- `docs/decisions/0022-soft-ramp-for-foliage.md` (proposed) and the decisions' index. (0020 and 0021 are taken by
  Track M's open PR #49; the depth of field's open PR #64 also proposes a 0020.)
- `docs/systems/look.md`: the module table (`canopy.ts`, `leaves.ts`, the bakes), the open questions.
- `docs/research/tiny-glade-look.md`: what the research on Tiny Glade found, and what we took from it.
- Known issues as GitHub issues: #62 (the mist tints sunlit snow), #63 (the cards and a dark coat's separation).
- The L7a and L7b plans move to `docs/plans/done/` (both merged); the code's comments that cite them follow.

Not in scope: `docs/proposals/engine-design.md` (a proposal is frozen once built; its bakes live in the system doc).

## Acceptance

- `node tools/check-docs.mjs` passes; `/code-review high` per the workflow.

## Review (`/code-review high`)

- **Round 1**: severe: the art bible stated the snow fault backwards; the cost table used one of the
  bench's two arms without saying so, and its "±0.5 ms noise" was not measured (measured now: up to 1.8 ms in the
  disturbed "before" bench, 0.03–0.13 ms in the others, so "before" against "after" shows nothing; the cards and
  the volume light cost +0.5 to +0.9 ms at the widest zoom, not "nothing measurable"). Moderate: the shadows
  table's conditions (frame size, arms, baselines) unstated; decision 0022's cost claim against the results; the
  system doc's `code:` list; the art bible writing a proposed rule as the rule; the L7a and L7b plans left in
  `active/`; the shadow look's missed targets unreported. Light: `wheat.Britain`'s known failure hidden by "every
  other block passes"; numbers copied across docs (the track plan now links to the results). All fixed.
- **Round 2**: severe: round 1's noise figure was itself wrong (single cameras in the later runs differ
  by up to 0.9 and 1.1 ms between repeats), so the costs taken across runs sat inside the noise; the volume light's
  cost across runs contradicted its own one-page A/B. Now the one-page A/Bs are the measurement, and a forest bench
  was run (`docs/plans/done/forest-bench.md`): the cards cost about 1.4 ms a frame where a forest fills it (read on
  the frame interval: the forest bench's own review found the GPU timer's 3 ms too long).
  Moderate: decision 0022 gave L7b's whole cost as the soft ramp's; the issues not cited at their code (#62 in
  `mist()`, #63 at the card casters); the load time misquoted (38–45 ms, a slower GPU longer); the triangle counts
  unreconciled (stated as such); numbers copied across docs (linked now); the heat-ripple check missing from what
  L7 owes. Light: an alternative in 0022 resting on an unrecorded measurement (now a judgement). All fixed.
- **Round 3** (the last of the first design): severe again in the costs: the "reliable" one-page figures were
  read on the GPU timer, which the forest bench found inflates with the scene, and some sat inside their own
  noise; claims with nothing behind them (blocks that fail on main "none got worse"; a triangle note said fixed
  and never written); PR #64's decision 0020 against #49's unmentioned. **Stopped; the owner chose to redesign
  (2026-10-13):** the results doc keeps only one-page A/Bs read on the frame interval (the normal scene run again
  that way, and the forest bench), every other number links to the plan that measured it, the across-run benches
  are dropped. The round count restarts.
- **Redesign, round 1:** no severe finding (every number recomputed from the JSON matched). Fixed: the cards'
  normal-scene cost read past its own repeat spread (now: nothing clear of the noise, as for the volume light);
  the forest rows copied from the forest bench, and narrower than its range (now linked, with its range); a
  headroom read from an absolute frame time; the JSON named by a stale build hash (now by their code, ae87e4c);
  `?bench=trees` still "for GPU time" in the system doc and its code comment; the guard's `fails*` values called
  unknowable (unrecorded: a guard run prints them, owed); the "numbers in one place" wording in the track plan and
  this scope; the forest called unmeasured in the system doc; "A B B A" overstated. Review stops here.
