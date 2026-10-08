---
status: accepted
date: 2026-10-08
---

# 0008 No couriers: orders apply immediately

## Context

Courier-delayed orders are historical, but they need trajectories, blocking, interception and many edge cases.

## Decision

We will apply orders immediately. Generals stay on the field to rally troops and steady morale nearby.

## Consequences

Simpler game and code; command still matters through generals' positions and standing behaviour.

## Alternatives considered

Couriers above brigade level, or everywhere.

See: `docs/proposals/sim-design.md` §6.
