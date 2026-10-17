---
status: accepted
date: 2026-10-17
---

# 0037 The simulation owns timing; animation is fitted to its phases

## Context

Animated figures arrived (a line infantryman, a gun and its crew, a cavalryman on his horse), and their clips
have their own lengths (the musket's Reload 11.3 s, the gun's Load 10 s) while the ruleset's reloads
(`src/rulesets/napoleonic.ts`) are more than twice as long. The owner: balancing is "pure math, but that math must be expressed via
animation; it's weird if someone shoots without shooting". The simulation is deterministic lockstep and never
imports the renderer (decisions 0005, 0006, 0013), yet today it fires a loaded company on the tick its reload
runs out (`src/sim/fire.ts`), so the renderer learns of a volley only after it, too late to show the men
presenting. Shipped RTS games (Warcraft III, StarCraft II, Dota 2, 0 A.D.) keep the numbers in game data and
fit the animation to them; the design and the survey are in `docs/proposals/figure-animation.md`.

## Decision

We will keep every duration in the simulation and fit the animation to it:
- **The ruleset owns every duration** (reload, present, recoil, paces). No clip length decides when anything
  happens in the battle, and the simulation never reads clip data.
- **Timed actions are phases announced ahead.** The state of a company, battery or squadron says its phase
  (a field of its own, not read from a countdown), when it began and when it ends. Every visible event is
  **scheduled**: a loaded company with a target commits and fires a `present` time later (new ruleset data,
  by drill quality); a laid gun commits and fires a `fireLead` later. Every event the renderer anchors is
  announced at least its clip's anchor lead ahead, so an open-ended phase (laid, holding fire) ends through
  a fixed final phase. While presenting the target is held; called off (the target out of reach, an order
  to move or charge), a volley keeps its load and loses only the time, and it cannot be called off in its
  last anchor lead.
- **The renderer is a function of that state**: clip and clip time from the phase, the time since it began and
  a **binding** (anchor a clip's event on the simulation's event, stretch within limits, fill with a hold loop,
  play gaits at speed ÷ root speed). Bindings are presentation data, next to the ruleset, never imported by the
  simulation.
- **A build-time test** checks every binding against the ruleset's ranges (a reload's whole jitter range can
  be shown, with a hold loop filling at most a capped share), so a balance change the animation cannot
  express fails a test.
- Cosmetic timing that the simulation does not count stays free, but never ahead of the simulation: men of a
  company fire up to about 0.3 s after its volley's tick, never before; idle variation.

## Consequences

- Good: balance stays numbers in the ruleset; what is seen matches what happened; replays, saves, culled and
  far figures are consistent because a figure's pose follows from the state; art changes cannot change balance.
- Bad: the simulation changes (a scheduled volley, phase ticks in its state) and the logic track pays for it;
  bindings are more data to keep, made safe only by the test; an anchored clip starts a few frames before its
  event, so every visible event must be announced at least that early.

## Alternatives considered

- Animation-driven timing (the effect waits for the clip's hit frame, as Age of Empires II's frame delay and
  Total War's weapon tables): not deterministic across level of detail, culling and frame rate, and it hides
  balance in assets.
- Clip lengths copied into the ruleset by hand: two homes for one fact.
- Stretching every clip to any duration: beyond about ±25% a drill looks wrong; hold loops absorb the rest.

See: `docs/proposals/figure-animation.md`, `docs/systems/fire-morale.md`, decision 0005.
