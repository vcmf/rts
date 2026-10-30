---
status: superseded by 0076
date: 2026-10-10
---

# 0018 Battalions of about 400 soldiers, one figure each; the engine reaches 800

## Context

Decision 0007 set battalions of about 100. On a 1–1.5 km field (decision 0011) a 100-man line is about
25 m wide, so 20 battalions a side cover a third of the front and the field looks empty. Battalions on
campaign had 400–800 men. A benchmark on the dev Mac (2026-10-10, 40 marching battalions) measured the
simulation at 0.6 ms per frame for 4,000 men and 2.0 ms for 16,000, and the soldier layer at 2.9 ms and
10.6 ms.

## Decision

We will make the battalion about 400 soldiers, one figure each, 20 a side (about 16,000 figures). The
engine has no limit below 800 men per battalion: no cap in the simulation, the masks or the buffers, and
the performance budgets are measured at 400 with a report at 800. Whether battles go beyond 400 is decided
once the prototype is finished.

## Consequences

- A 400-man line is about 90 m wide, so two lines and reserves fill the field.
- The soldier layer is the bottleneck (10.6 ms at 16,000 men against a 4 ms budget); it has to be made
  cheaper or moved off the main thread before the budget holds again.
- The fire and morale distances were set for 25 m battalions and are re-tuned; the calibration is rerun.
- The 360 m formation field holds a firefight, a brigade a side only just; real-size battles need a
  larger sim map (S1e).
- The reference images that show 200–400 men per battalion now match the game.

## Alternatives considered

Keeping 100 (cheap, but the field looks empty); 200 (half the cost, still sparse); one figure for several
men (breaks the one-figure-per-soldier look).

Supersedes 0007.
