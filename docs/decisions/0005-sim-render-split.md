---
status: accepted
date: 2026-10-08
---

# 0005 The simulation is separate from rendering and driven by commands

## Context

Every shipped RTS engine studied is built around a fixed-tick simulation changed only by commands; it gives replays, saves, AI and multiplayer from one pipeline.

## Decision

We will keep all game state in a simulation that never imports the renderer, advances at 20 Hz, and changes only through commands from the player, the AI, scripts and replays.

## Consequences

The renderer is a projection that interpolates snapshots; it can be rebuilt at any time (for example after a lost WebGL context).

## Alternatives considered

Game logic inside Babylon scene objects.

See: `docs/architecture.md`, `docs/research/rts-engine-subsystems.md` §1.
