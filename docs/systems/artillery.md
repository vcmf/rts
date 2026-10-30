---
status: current
last_reviewed: 2026-10-28
code: [src/sim/artillery.ts, src/sim/fire.ts, src/rulesets/napoleonic.ts, src/scenarios/s1d-guns.ts, src/render/map.ts, tools/calibrate-artillery.ts, test/artillery.test.ts]
decisions: [0005-sim-render-split, 0006-restricted-float64, 0015-era-generic-engine]
---

# Artillery (S1d-3)

A battery's pieces fire roundshot and canister. A roundshot is one ball walked over the heightfield. It
grazes, bounces and buries; wherever it is low over the ground it cuts through every company block on its
line, friend or enemy. A column end-on suffers through all its ranks, a line fired on frontally through three,
and a ball over a crest flies on over the hollow behind. Canister is a cone at short range. Every number is
ruleset data (`UnitType.artillery`); the engine knows a ray and a cone. The numbers are calibrated on outcomes
(`tools/calibrate-artillery.ts`).

```
step 8  fire         musketry; builds the block geometry for the positions after movement
step 9  artillery    per piece: target (musketry's code, the battery's arc and range) → loaded → cone or ray;
                     men struck are owed to their companies
step 11 casualties   the owed men fall
```

## Goals / non-goals

- **Goals:**
  - artillery punishes columns (sim-design §17);
  - ground decides roundshot (reverse slopes, hollows);
  - results do not depend on slot order.
- **Non-goals (later):**
  - howitzers' shell and fuzes;
  - ammunition and supply;
  - smoke (S2);
  - a morale shock per strike (losses drive morale);
  - pieces knocked out by fire: a piece falls silent only when its detachment is gone;
  - the 3D look of balls and fans.

## Constraints

- **Exact operations only (decision 0006).** The ball's dispersion turns its direction by `sin`/`cos` from
  `num.ts`. Its trajectory is a parabola stepped exactly: height by the mean slope over each step. The drop
  per metre, `g / speed²`, is computed once at compile time.
- **Every draw is keyed** by the world seed, the tick, the battery's handle, the piece and a purpose tag. One
  stream serves a ball's dispersion and every block it strikes, in the order it meets them along its line.
- **Order independence.** A piece reads others' positions after movement and men as the step began; it owes
  whole men. The reverse-visiting test switch gives the same state.

## Design

**May fire** (`mayShoot`):
- its type has `artillery` and stands in a shape it fires from (`artillery.shapes`: unlimbered);
- it is halted (no order at its head but a dress) and not changing shape;
- it is in the fight, not in melee, and its fire mode is at will.

**Per piece** (a company with men):
- **The target:** musketry's targeting (`chooseTarget`, `aimAt` in `fire.ts`), passed the battery's own arc and
  range (`reachOf`): every 0.5 s, staggered, the preferred target, else the current one, else the nearest
  enemy company in arc and range with a clear sight line. The fire step keeps a battery's targets: they are
  this step's.
- **Friends:** it holds when a friendly block stands across any of its three rays to the company aimed at
  (`clearShare` < 1), and tries again in 0.5 s.
- **Reload:** `reload × (1 ± reloadJitter)`, × `crew / men` when its detachment is short (at most `crewSlow`).
  Its first load at spawn is a keyed share of its own reload.
- **The muzzle** stands `ahead` metres ahead of the detachment's front rank.
- **One type, one fire:** a type has musketry (`fires`) or artillery, not both; they share a company's reload and
  target, and the ruleset is refused otherwise.
- **Among the guns** (the division scale, `artillery.min`, 15 m: bayonet range): with an enemy company in the fight
  within it of a piece's muzzle, no piece fires (`overrun`).
- **The shot:** inside `cone.range` of the company aimed at, the cone; beyond it, the ray.

**The cone:**
- **Men struck:** `hits(range)` (the table, linear between points) × the aimed target's exposure to the firing
  piece (U1, `docs/systems/fire-morale.md`): its shape's hits taken (`traits.hits`), more from its flank or rear.
- **Who:** spread over the enemy companies whose centres lie inside the cone (`cone.half`) and its range, that
  the piece sees. Each man goes first to a formation weighted by its men there, then to a company of it
  (`oweByMen`).

**The ray** (`ray`), in `step` metre steps from the muzzle:
- **The aim:** at the company's centre, turned across by up to `spread` and lengthened or shortened by up to
  `short` (keyed). The flat trajectory from `muzzle` metres up meets the ground at the aim point: its first
  graze.
- **Each step:**
  - **flight:** the height follows the trajectory; the step costs its length in energy;
  - **a graze** (the ball meets the ground): where the ground ahead rises steeper than `bury`, the ball
    stops. Else it bounces, its slope becoming the ground's plus `restitution` of the difference, and loses
    `graze` metres of energy;
  - **striking men,** while the ball is no higher than `height` over the ground: each company block it cuts
    on the step loses `λ = chord × width × men/area × kill × min(1, 2 · energy / energy₀)`, drawn as an
    integer. `chord` is the step's length inside the block, grown by half the lane (`width`) so a ball
    skimming the edge strikes the edge file. Each man struck costs `perMan` metres of energy. The ball's line
    on the ground is straight, so where it enters and leaves each block is found once per shot.
- **It stops** when its energy is spent, it buries, or it leaves the map. It strikes every formation's blocks
  on its line but its own battery's: friendly fire beyond the target is real.
- Only formations whose reach (and half the lane) comes near the ball's line are tested (`G.reach`, as the fire
  step culls its friendly-cover test).

**Records** (per piece, hashed state):
- `volleyTick` and `target`, as musketry's;
- `shotKind` (none, ray, cone);   (they move with their pieces at a Face about, as the reload does)
- `shotX`, `shotZ`: where the ball stopped, or the cone's aim point.

The staff map draws a roundshot as a line from the piece to where it stopped and canister as a fan, each for a
second.

## Tunables

`types.battery.artillery` in `src/rulesets/napoleonic.ts`; measured by `node tools/calibrate-artillery.ts
[seeds] [case]`. Results are in `docs/plans/active/s1d3-artillery.md`.

## Verification

- **`test/artillery.test.ts`:**
  - **Who fires:** unlimbered, not limbered, not changing shape, not holding fire; not through a friend.
  - **Reload:** half the crew, twice the time.
  - **The ball:**
    - on level ground it runs past its first graze;
    - it buries in a steep rise, and carries over a gentle crest and the hollow behind it;
    - a column end-on and a line enfiladed lose more to one ball than a line frontally;
    - men struck slow it;
    - it strikes friends beyond the target;
    - a battery fires rays beyond canister range and cones inside it.
  - **The cone:** only companies inside it, and fewer with range.
  - **Determinism:** the reversed visiting order; the page scenario's golden, its replay and a save round trip.
- **`tools/calibrate-artillery.ts`:** a column against a line, the line over 10 minutes, canister, a crest.
- **`npm run check:app`:** the battery on the hill fires on the column across the stream.

## Open questions

- **The field is 360 m:** the calibration's long range is about 400 m, corner to corner, not the 1 km a ball reaches
  at the division scale (`docs/proposals/division-scale.md`). Longer ranges wait for the S1e map.
- **Sight decides more than the ball does:** on the rolling formation field a battery below a crest cannot see
  over it, and does not fire. The page scenario puts its battery on the hill. Whether batteries need an eye
  height above a man's is for S1e's playtests.
- **Canister breaks a line at 150 m in under two minutes.** It is meant to be terrible; whether it is too fast
  is for the playtests.
