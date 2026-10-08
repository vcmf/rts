---
status: accepted
date: 2026-10-08
---

# 0014 Plan, implement, review in rounds, redesign after three

## Context

The W1 PR showed both the value of adversarial reviews and the risk of endless rounds.

## Decision

We will plan every PR, implement, then run `/code-review high` rounds: another round only while a round finds a severe issue; more than three rounds means stop and redesign (the count restarts after a redesign). Findings in code already on main do not block; grave ones go to the known issues.

## Consequences

Reviews converge; pre-existing debt is recorded instead of blocking unrelated work.

## Alternatives considered

Unlimited review rounds; no reviews.

See: `AGENTS.md`.
