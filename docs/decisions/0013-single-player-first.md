---
status: proposed
date: 2026-10-08
---

# 0013 Single-player first, multiplayer-capable

## Context

Multiplayer decides how strict determinism must be, but is not planned yet.

## Decision

We will build single-player first, but keep the simulation deterministic, hashed and command-logged as if lockstep multiplayer were coming.

## Consequences

Determinism costs little at this entity count and pays off in replays and saves either way.

## Alternatives considered

Single-player only, with no determinism rules.

See: `docs/engine-map.md` §2.
