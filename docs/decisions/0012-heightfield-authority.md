---
status: accepted
date: 2026-10-08
---

# 0012 One heightfield is the authority for height, built offline

## Context

The W1 reviews found several answers to "how high is the ground here" (formula, mesh, checks), and evaluating the formula in each browser would give each browser its own inputs and break cross-browser determinism (0006).

## Decision

We will build one heightfield in a Node build step (from `H()` today, from elevation data later) and ship it as data. The renderer's meshes, the simulation, placement and checks all read it.

## Consequences

Ground drawn and ground used are equal by construction; the formula becomes an authoring step. Today the prototype still evaluates `H()` in the page; the build step is E0-lite work (`docs/proposals/engine-design.md` §10).

## Alternatives considered

Reading the drawn mesh; evaluating `H()` at runtime.

See: `docs/proposals/engine-design.md` §4, `docs/proposals/sim-design.md` §2.
