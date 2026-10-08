---
status: proposed
date: 2026-10-08
---

# 0006 Deterministic simulation numbers with restricted float64

## Context

Replays must match across browsers, and `Math.sin` differs even between Chrome versions. A Q16.16 fixed-point design was drafted and found mis-specified (products overflow int32; `Math.imul` keeps only the low 32 bits).

## Decision

We will use float64 in the simulation with only IEEE-exact operations (`+ − × /`, `sqrt`, rounding helpers); transcendental functions, `Math.random` and `**` are banned by lint; trig comes from our own tables; input data (heightfield, cost grid, constants) is produced at build time.

## Consequences

Simple arithmetic and no overflow class; needs a lint rule and a golden-hash test. Supersedes the fixed-point idea in the engine map's first draft.

## Alternatives considered

Q16.16 fixed-point; plain floats with no rules.

See: `docs/proposals/sim-design.md` §2, §19.
