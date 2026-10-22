---
status: accepted
date: 2026-10-13
---

# 0025 Review rounds by kind of PR

## Context

Decision 0014 sends every PR through plan, implement and `/code-review high` rounds (up to three, then a
redesign). On 2026-10-13 a research note went through three rounds and a docs PR through four: process out of
proportion to what they risk. A research note is background, not authoritative (`docs/INDEX.md`); a docs PR changes
no behaviour. The owner: "not applied to research notes, even docs is truly not that necessary (docs pr maybe max
1 code-review)".

## Decision

We will review by the kind of PR:
- **Code** (anything that changes what runs, tools and checks included): as 0014: a plan, then `/code-review high`
  rounds; another round only while a round finds a severe issue; more than three rounds means stop and redesign
  (the count restarts after a redesign). Findings in code already on main do not block.
- **Docs only** (system docs, plans, the art bible, decisions, conventions): at most **one** `/code-review high`
  round, its findings fixed as worth it; no further rounds.
- **Research notes** (`docs/research/`): **no** `/code-review` and no plan; the author checks each claim against its
  source and labels inference as inference.

## Consequences

- Good: review effort goes where behaviour changes; docs and research land in minutes, not hours.
- Bad: a docs PR's second-round errors and a research note's misread sources go unreviewed; the author's own check
  must catch them, and a reader who finds one fixes it in a later PR.

## Alternatives considered

- Keep 0014 for everything: the cost seen on 2026-10-13.
- No review for docs either: the owner allowed one round, for docs that bind (the art bible, decisions).

Supersedes 0014. See: `AGENTS.md`.
