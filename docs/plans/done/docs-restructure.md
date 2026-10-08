---
status: done
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
| ~~design.md~~ | `docs/art-bible.md` |
| ~~web-rts-architecture.md~~ | `docs/architecture.md` |
| ~~engine-map.md~~ | `docs/engine-map.md` |
| ~~asset-sources.md~~ | `docs/asset-sources.md` |
| ~~engine-design.md~~, ~~sim-design.md~~, ~~staff-map/design.md~~, ~~staff-map/implementation.md~~ | `docs/proposals/` (designs written before building) |
| ~~prototype-plan.md~~, ~~staff-map/plan.md~~ | `docs/plans/active/` |
| ~~plans/w1-river-shape.md~~, ~~plans/w1b-river-width.md~~ | `docs/plans/done/` |
| ~~research/*.md~~ (+ the formation and doc-systems report) | `docs/research/` |

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
| 1 | Checker ignored old-layout names (~~design.md~~, ~~staff-map/plan.md~~, ~~../x.md~~): the main acceptance item was not enforced | Every backticked file name in docs and every `*.md` name in code is resolved (own folder, then root); found and fixed 20 stale bare names |
| 2 | 0006 (restricted float64) recorded as accepted; the owner never accepted it | Status proposed; the decisions README and AGENTS.md say proposed records are open |
| 3 | 0007 claimed a per-soldier slot table in the sim (only a research recommendation) | Removed; recorded as an open question |
| 4 | "Pack colours are never used" dropped from AGENTS.md | Back in AGENTS.md and `prototypes/AGENTS.md` |
| 5 | Research docs not checked; `@AGENTS.md` imports resolved against the root | Research docs: own `docs/` paths checked; CLAUDE.md imports resolve from their folder |
| 6 | Front matter contradicted the docs' own status lines (sim-design, engine-map) | Both `draft`; INDEX shows statuses |
| 7 | Case-insensitive existence on macOS; titled links skipped | Exact-case check per path segment; links with titles parsed |
| 8 | Glossary stated undecided structure (4 companies) as fact | Marked open |
| 9 | `docs/systems/river.md`: ribbon width wrong (1.35 widths, not half-widths); tunables copied | Fixed; values named, not copied |
| 10 | Bare ~~implementation.md~~ in `prototypes/staff-map.html` | Repo paths |

Negative run of the new checker: old names, ~~../art-bible.md~~, a titled broken link, wrong case,
a broken path in research, and a missing `prototypes/AGENTS.md` are all reported (exit 1).

## Review round 2

10 findings; severe: **the branch failed its own check** (the round-1 table above put old names in
backticks, and the checker was not re-run after writing it) → round 3 (the last before a redesign).
Rule added to `docs/conventions.md`: run the docs check after the last edit, before every commit.

| # | Finding | Fix |
|---|---|---|
| 1 | Check failed on HEAD (old names in this plan) | Old names written ~~struck through~~; the checker skips struck text |
| 2 | Bare doc names in prose not checked | Every `*.md` name in docs is checked |
| 3 | Relative and non-`.md` references in code not checked | `../`-relative paths everywhere; `*.html` and hyphenated `*.js/.mjs/.py` names in code |
| 4 | Backticked old folders, `<angle>` links, reference definitions unchecked | Checked (old top-level folders only: future code folders do not exist yet) |
| 5 | Decision status not cross-checked; docs missing from every index; impossible dates | Status must match the README table; every doc must be in an index; dates validated |
| 6 | AGENTS.md stated determinism as an invariant (only proposed) | Invariant is the sim/render split (0005); determinism marked proposed |
| 7 | Staff-map design front matter `draft`, body says decided | `accepted` |
| 8 | Vision and glossary stated proposed decisions as fact | Marked proposed |
| 9 | Conventions copied a partial banned-function list; decisions use `date` | Links `docs/proposals/sim-design.md` §2; `date` documented |
| 10 | `assets/` and `design/refs/` pointers lost; commit rules duplicated and diverged | Pointers back; AGENTS.md links the full rules in conventions |

Negative run: a bare stale name in prose, an old folder, angle and reference links, a relative and
two bare stale names in code, a status mismatch, an unlisted doc and an impossible date are all
reported (exit 1).

## Review round 3 — stop (no severe findings)

4 moderate, 5 light. Fixed:
- INDEX and conventions said all decisions bind: now accepted bind, proposed are open.
- The index check matched bare file names as substrings (~~design.md~~ inside ~~sim-design.md~~): now
  the exact link target or repo path.
- The checker trusted the local disk: now it resolves against what git tracks (staged files count),
  so an un-added doc fails.
- Accepted records said more than was decided: 0009 no longer fixes the calibration method; 0007
  and the vision say musketry (not all fire) is resolved per battalion; 0012's rationale no longer
  presents proposed determinism as settled.
- Known issues moved out of a frozen proposal into the living `docs/known-issues.md`.
- Real-date check, decision slugs in system front matter, strike-through only skipped in Markdown,
  one walk over tracked files.

Kept: link anchors are not checked.

Negative run: two unlisted docs (named like existing ones), an impossible date, an unknown decision
slug, a reference to an un-added file and a path between `~~` in JS are all reported (exit 1).
