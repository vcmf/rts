---
status: active
last_reviewed: 2026-10-08
---

# Plan: Docs restructure

Source: `docs/research/formation-movement-and-doc-systems.md` §5 (best practices: short typed docs,
decision records, a short agent map, docs-as-code).

## Problem

Seven top-level docs plus staff-map/, plans/ and research/, with no index and decisions spread
inside long documents (`docs/art-bible.md` §1, `docs/engine-map.md` §2, `docs/proposals/sim-design.md` §18). `AGENTS.md`
mixes the map, the workflow and per-folder rules. Nothing checks that references still resolve.

## Scope

A **restructure, not a rewrite**: files move with `git mv` (history kept), references are rewritten
to the new paths, and only a few small new documents are written.

| From (old path) | To |
|---|---|
| design.md | `docs/art-bible.md` |
| web-rts-architecture.md | `docs/architecture.md` |
| engine-map.md | `docs/engine-map.md` |
| asset-sources.md | `docs/asset-sources.md` |
| engine-design.md, sim-design.md, staff-map/design.md, staff-map/implementation.md | `docs/proposals/` (designs written before building) |
| prototype-plan.md, staff-map/plan.md | `docs/plans/active/` |
| plans/w1-river-shape.md, plans/w1b-river-width.md | `docs/plans/done/` |
| research/*.md (+ the formation and doc-systems report) | `docs/research/` |

New:
- `docs/INDEX.md`: one line per doc with its type and status (the map agents read first).
- `docs/vision.md`: pitch, pillars, scale, non-goals (draft for the owner).
- `docs/conventions.md`: commits, prototypes, units and numbers, doc rules (moved out of `AGENTS.md`).
- `docs/glossary.md`: drill and engine terms.
- `docs/decisions/`: numbered decision records (MADR-lite) for the decisions already taken.
- `docs/systems/`: current-behaviour docs, one per built system; first one `docs/systems/river.md` (W1, W1b).
- `docs/templates/`: system, decision, plan, proposal.
- `prototypes/AGENTS.md` (+ `CLAUDE.md` bridge): prototype-only rules, loaded when working there.
- `tools/check-docs.mjs`: every doc path in docs and code resolves; front matter present; decision
  numbers unique.
- `AGENTS.md` shortened to a map (≤ 100 lines).

Out of scope: rewriting the content of moved documents; splitting `docs/art-bible.md` or the proposals
into system docs (that happens system by system, when each is built).

## Acceptance

- `node tools/check-docs.mjs` exits 0, and fails on a deliberately broken reference (negative test).
- No reference in docs, prototypes or tools points to an old path.
- `AGENTS.md` ≤ 100 lines and links `docs/INDEX.md`.
- Every doc under `docs/` has front matter (`status`, `last_reviewed`).
- Prototypes and check tools still run (`tools/render-check.js`, `tools/river-check.js` exit 0).

## Review round 1

10 findings; severe ones (checker false passes, a proposed decision recorded as accepted) → another round.

| # | Finding | Fix |
|---|---|---|
| 1 | Checker ignored old-layout names (`design.md`, `staff-map/plan.md`, `../x.md`): the main acceptance item was not enforced | Every backticked file name in docs and every `*.md` name in code is resolved (own folder, then root); found and fixed 20 stale bare names |
| 2 | 0006 (restricted float64) recorded as accepted; the owner never accepted it | Status proposed; the decisions README and AGENTS.md say proposed records are open |
| 3 | 0007 claimed a per-soldier slot table in the sim (only a research recommendation) | Removed; recorded as an open question |
| 4 | "Pack colours are never used" dropped from AGENTS.md | Back in AGENTS.md and `prototypes/AGENTS.md` |
| 5 | Research docs not checked; `@AGENTS.md` imports resolved against the root | Research docs: own `docs/` paths checked; CLAUDE.md imports resolve from their folder |
| 6 | Front matter contradicted the docs' own status lines (sim-design, engine-map) | Both `draft`; INDEX shows statuses |
| 7 | Case-insensitive existence on macOS; titled links skipped | Exact-case check per path segment; links with titles parsed |
| 8 | Glossary stated undecided structure (4 companies) as fact | Marked open |
| 9 | river.md: ribbon width wrong (1.35 widths, not half-widths); tunables copied | Fixed; values named, not copied |
| 10 | Bare `implementation.md` in `prototypes/staff-map.html` | Repo paths |

Negative run of the new checker: old names, `../art-bible.md`, a titled broken link, wrong case,
a broken path in research, and a missing `prototypes/AGENTS.md` are all reported (exit 1).
