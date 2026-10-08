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
- `docs/systems/`: current-behaviour docs, one per built system; first one `river.md` (W1, W1b).
- `docs/templates/`: system, decision, plan, proposal.
- `prototypes/AGENTS.md` (+ `CLAUDE.md` bridge): prototype-only rules, loaded when working there.
- `tools/check-docs.mjs`: every doc path in docs and code resolves; front matter present; decision
  numbers unique.
- `AGENTS.md` shortened to a map (≤ 100 lines).

Out of scope: rewriting the content of moved documents; splitting `art-bible.md` or the proposals
into system docs (that happens system by system, when each is built).

## Acceptance

- `node tools/check-docs.mjs` exits 0, and fails on a deliberately broken reference (negative test).
- No reference in docs, prototypes or tools points to an old path.
- `AGENTS.md` ≤ 100 lines and links `docs/INDEX.md`.
- Every doc under `docs/` has front matter (`status`, `last_reviewed`).
- Prototypes and check tools still run (`render-check.js`, `river-check.js` exit 0).
