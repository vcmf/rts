---
status: current
last_reviewed: 2026-10-09
code: [src/sim/formation.ts, src/sim/ruleset.ts, src/sim/terrain.ts, src/rulesets/napoleonic.ts, test/formations.test.ts]
decisions: [0005-sim-render-split, 0006-restricted-float64, 0007-battalion-scale, 0012-heightfield-authority, 0015-era-generic-engine]
---

# Formations (the 20 Hz formation layer)

The battalion as the sim moves it:
- its shape and timed changes between shapes;
- the march column's trail;
- movement over terrain with the lag model;
- the footprint gate that keeps every man off impassable ground;
- Face about, Retire and wheels.

It is ported from `prototypes/formation-core.js` (the feel prototype, still the reference for the feel;
the sim is drawn by the S1b page, `docs/systems/sim-page.md`). The behaviour and its history are in `docs/plans/done/terrain-movement.md`; the port
is in `docs/plans/done/s1a-formations-on-spine.md`.

## Goals / non-goals

- **Goals:**
  - the prototype's drill and terrain behaviour, deterministic, driven only by commands;
  - every era-specific number and name in a ruleset (decision 0015).
- **Non-goals:**
  - drawing the men (the S1b page, `docs/systems/sim-page.md`);
  - fire, morale and contact between formations (S1c);
  - pathfinding, and automatic manoeuvres around obstacles (later).

## Constraints

- **Decision 0007:** the battalion is the unit. The sim keeps the **men per company**, never a soldier.
  Which slots are filled follows from the counts by one rule (`occupied`):
  - files from the centre outward, ranks front first;
  - a shape that closes across companies (`closeAcross`, the line) fills each half toward the colours;
  - where files or the last rank cannot centre exactly they lean one way (`lean`), and Face about
    reverses the lean when the shape's half-turn reverses the files, so complete files keep their places
    at any strength; each Face about also counts up `faces`, so the renderer knows to relabel its men (S1b).

  Who stands where, and who falls, is the renderer's (`docs/systems/sim-page.md`).
- **The spine's rules** (`docs/systems/sim-spine.md`): exact-ops maths, slot order, typed-array state.
- **Budget:** about 1.2 ms per tick for 40 battalions (`test/formations.test.ts`).

## Design

**Ruleset** (`ruleset.ts`, `src/rulesets/napoleonic.ts`). The ruleset holds:
- the block geometry: companies, files, ranks, spacings, the minimum spacing, the accordion gap;
- the shapes as company placements, with kind, pace, road pace, `trail` and `closeAcross`;
- change times, paces, q, the terrain table (with `road` and `level` flags), the water curve, slope `k`;
- the order presets, disorder, and the face and dress times.

`compileRuleset` indexes it and precomputes, per shape:
- the straight layout;
- the bins: lateral thirds of each company;
- the accordion pairs;
- the half-turn symmetry for Face about.

The ruleset's hash is recorded in the world, the replays and the saves.

**Terrain** (`terrain.ts`), from the build-time data:
- the class and water depth on the 1 m grid;
- the slope from the 1.79 m heightfield (level where the ruleset says so: a bridge deck);
- per kind, the impassable cells and each cell's distance to the nearest one.

`groundG` is class × water × slope along the direction of travel.

**Limits.** Checked when a world is made:
- at most 32 bins per formation (`BINS = 3` per company), because the gate's masks are 32-bit;
- a trail shape's trail, and the one Face about rebuilds, must fit the 256-point ring.

**Places.** A man's place is his slot set back by his bin's lag:
- **straight shapes:** along the heading;
- **trail shapes:** along the trail, man by man, so a column follows its head's bends. The trail is a
  ring of points per formation.

During a change, each company wheels about the flank it turns to, with smoothstep timing. A change
interrupted by another is timed by the distance still to cover.

**The lag model** (per tick, moving):
- 12 bins sample their men's ground: the harmonic mean of g, the worst q;
- a bin is held when a man has impassable ground underfoot or one step ahead;
- the speed is the largest that keeps every file within Lmax and the mean within Lmean (solved
  exactly);
- lags renormalise to the leading file, the accordion keeps bins apart, and disorder grows with lag.

**The footprint gate:**
- every pose change (the turn and advance of a move, a wheel step) goes through `gate`, which halves the
  step until no new bin's places are on impassable ground;
- changes are checked along their whole path (128 poses), for every slot, filled or empty;
- a stalled move halts after 1 s ("halted: impassable ground"), stepping back to where the held men
  stand.

**Orders** (a list per formation in the order pool):
- move, with waypoints or a distance ahead (Retire);
- form, wheel, face, dress.

How each behaves:
- **Face about** relabels the companies by the shape's half-turn symmetry and keeps the lags (the anchor
  steps back by the largest lag), so every man in a complete file keeps his place; the fill rule closes
  the short files toward the new front. It is gated as a whole.
- **Retire** is face, march, dress, face; the last two survive a halt. Its march target is kept on the map.
- **Trail shapes** turn only as they advance, on a radius that keeps the inside men apart; a target
  inside the turning circle ends that move; they do not wheel.

**Statuses** (`STATUS`): halted, cannot form, arrived as near as the column can turn, cannot wheel,
cannot face about (with the reason).

## Tunables

The ruleset (`src/rulesets/napoleonic.ts`). In `formation.ts`:
- `GATE_HALVINGS`;
- `CHANGE_SAMPLES`;
- `STALL` and `HALT_AFTER`;
- `ARRIVE`.

## Verification

`test/formations.test.ts`: the prototype's formation-level checks, against the sim's places.
- **Thicket.** One file, three, six or all twelve in a 10 m strip of woods, at the research's, normal
  and keep-order tolerances:

  | Tolerances | 1/12 | 3/12 | 6/12 | 12/12 |
  |---|---|---|---|---|
  | Research | 0 | 0.5 | 4.6 | 9.0 |
  | Keep order | 7.4 | 7.4 | 7.9 | 9.0 |
  | Normal | 4.6 | 4.7 | 5.7 | 9.0 |

  The prototype had 7.5 at keep 3/12. The lag limits hold every tick.
- **Deep water:**
  - oblique and whole-front approaches, and a march column halted at the bank;
  - a wheel, a square refused (accepted 12 m back), a change during a change;
  - thinned lines at the bank: 15 accepted, 30 refused, nobody in the water;
  - empty files over the stream;
  - halted units ordered on at six angles, with no oscillation;
  - Face about and Retire, also cut short, and turns at the bank;
  - a strip narrower than Lmax;
  - ground impassable for one kind only (a test ruleset).
- **Face about:** complete files keep their places in every shape, at 100, 97, 96 and 88 men, and with a
  held file; refused when closing a file would wet a man.
- **Trail shapes:** looping round to a target behind, the turning circle, no wheel.
- **The accordion:** a held column, a 90° bend (within-company spacing too), a square in the wood.
- **Passages:** the level bridge deck and the crossing, the ford, an empty bin in woods.
- **Cost:** 40 battalions, under 2 ms per tick.

Negative runs, each failing its tests:
- the lean not flipping (uneven strengths);
- the Retire target not kept on the map;
- the gate off;
- the change-path check off;
- Face about dropping lags;
- the fill rule not centring the partial rank;
- no turning-circle stop.

## Open questions

- Casualty re-packing (the fill rule after losses) moves men sideways without the gate: at a bank
  parallel to the line, a closing file could stand on impassable ground. Recorded in
  `docs/known-issues.md`; to fold into the gate with the casualty system (S1c).
- The soldier layer's checks (settling in the wood, slot error) are in `test/soldiers.test.ts` (S1b).
