---
status: accepted
date: 2026-10-08
---

# 0015 The engine is era-generic, from antiquity to the Napoleonic era

## Context

The owner wants one engine for several historical settings, not a Napoleonic-only game. Modern
warfare is explicitly out of scope.

## Decision

We will keep the engine code era-generic and put everything era-specific in **era rulesets** (data):
unit types, formations (slot layouts and drill timings), weapons (melee, thrown, bows, crossbows,
firearms, artillery: range, rate and effect curves), movement (terrain and slope factors per unit
class, quick-step factor, order tolerance), morale and command parameters. The Napoleonic era is the
first ruleset built. Supported range: antiquity to the Napoleonic era (black powder, smoothbore);
rifled and industrial warfare and anything later are out of scope.

## Consequences

- Engine code never names an era's unit, weapon or formation; a rule that only one era needs is
  either a ruleset parameter or a documented engine extension point.
- Battalion, slot table, drill changes, the movement lag model, morale and commands stay generic;
  a phalanx, a testudo or a tercio is a layout plus drill data, like a line or a square.
- Melee must become a first-class system (central in ancient and medieval battles; the current
  simulation design treats it as rare, which is only true for the Napoleonic ruleset).
- Firearms are one kind of missile weapon among bows, crossbows, slings and javelins.
- Sieges are an open question (a different kind of battle).

## Alternatives considered

A Napoleonic-only engine (simpler now, a rewrite for the next era); a fully generic wargame engine
including modern warfare (vehicles, indirect fire, radio: different simulation needs).

See: `docs/vision.md`, `docs/engine-map.md` §2 (D7), `docs/proposals/sim-design.md`.
