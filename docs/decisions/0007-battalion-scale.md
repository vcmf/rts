---
status: accepted
date: 2026-10-08
---

# 0007 The player commands battalions of about 100 soldiers, one figure each

## Context

Total War's huge armies end up as dots when zoomed out; Age of Empires' 200 units per side feel small. A middle scale keeps every soldier visible.

## Decision

We will make the battalion the player's unit and the simulation's unit: about 100 soldiers, one figure per soldier, 20–40 battalions per battle (2k–4k figures). The figures are placed and animated by the renderer from the battalion's state.

## Consequences

Fire is resolved per battalion; individual soldiers are cosmetic. Brigade group moves are deferred. (Whether the simulation also keeps a per-soldier slot table, for identical casualties in replays, is open: `docs/research/formation-movement-and-doc-systems.md` §4.)

## Alternatives considered

Brigades as the main unit; one figure for several men; simulating every soldier.

See: `docs/proposals/sim-design.md` §1, §5.
