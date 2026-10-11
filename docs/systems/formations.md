---
status: current
last_reviewed: 2026-10-11
code: [src/sim/formation.ts, src/sim/ruleset.ts, src/sim/terrain.ts, src/rulesets/napoleonic.ts, test/formations.test.ts, test/types.test.ts]
decisions: [0005-sim-render-split, 0006-restricted-float64, 0018-battalion-of-400, 0012-heightfield-authority, 0015-era-generic-engine]
---

# Formations (the 20 Hz formation layer)

A formation (a battalion, a cavalry regiment, a battery: its unit type, S1d-1) as the sim moves it:
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

- **Decisions 0007 and 0018:** the battalion is the unit (about 400 men since 0018). The sim keeps the **men per company**, never a soldier.
  Which slots are filled follows from the counts by one rule (`occupied`); `filledSlots` keeps each
  battalion's list, rebuilt only when the men per company, the shape it fills or the lean change (S1c-5):
  - files from the centre outward, ranks front first;
  - a shape that closes across companies (`closeAcross`, the line) fills each half toward the colours;
  - where files or the last rank cannot centre exactly they lean one way (`lean`), and Face about
    reverses the lean when the shape's half-turn reverses the files, so complete files keep their places
    at any strength; each Face about also counts up `faces`, so the renderer knows to relabel its men (S1b).

  - **The re-packing gate** (`removeMan`, S1c-3): every loss goes through it. A re-pack only refills slots
    inside the block already filled (from five men up); but at an angle to a bank such a slot can be
    water (41 of 42,228 positions in `tools/repack-probe.ts`). A loss whose re-pack would put a man newly on
    impassable ground falls on another company instead, those owed hits first and then the rest, nearest
    first, with no random draws. The test is by slot (`wetSlots`), for the companies the re-pack can touch.
    If none can take it, the loss stands and the battalion's `pressed` count goes up (a count, not a
    status).

  Who stands where, and who falls, is the renderer's (`docs/systems/sim-page.md`).
- **The spine's rules** (`docs/systems/sim-spine.md`): exact-ops maths, slot order, typed-array state.
- **Budget:** 2 ms per tick (sim-design §16). 40 battalions of 400 changing shape and marching: 0.7 ms a
  tick on the dev Mac's release world (`tools/bench-cost.ts`, S1c-5 and S1d-1).

## Design

**Ruleset** (`ruleset.ts`, `src/rulesets/napoleonic.ts`). The ruleset holds its **unit types** (`types`; the
first is the default), each with:
- its block geometry: companies, files, ranks, spacings, the minimum spacing, the accordion gap, bins per
  company;
- its shapes as company placements, with kind, pace, road pace, `trail`, `closeAcross` and, for a trail
  shape, an optional `step`: the spacing of its places' files and ranks when it is not the block's (a column
  of route of horses, nose to tail);
- its change times, the shape a spawn takes, and whether it fires by company (S1c's musketry).

The rest is shared: paces and q (a type's shapes name their paces), the terrain table (a column per kind,
with `road` and `level` flags), the water curve and the wading limit (per kind where named), slope `k`, the
order presets, disorder, and the face and dress times.

The Napoleonic types (`docs/plans/active/s1d1-unit-types.md`):

| Type | Block | Shapes | Paces |
|---|---|---|---|
| Infantry (decision 0018) | 6 companies of 23 files × 3 ranks, 414 places; 8 bins a company; a line about 93 m | line, square (four faces, front and rear first: 2, 1, 2, 1), column of divisions, column of route | ordinary, route step |
| Cavalry regiment | 4 squadrons of 32 files × 2 ranks, 256 places; 1 m a file, 3 m a rank; a line about 157 m | line, column of squadrons at half distance, column of route by fours (each squadron a column of twos, horses 3 m apart: a `step`) | walk; the march at the trot |
| Foot battery | 8 pieces, each a detachment of 4 files × 3 ranks (96 men); one bin a piece | unlimbered (16 m apart), limbered (18 m apart on the trail) | by hand; the walk |

`compileRuleset` indexes it and precomputes, per type, its slot tables, and per shape:
- the straight layout;
- the bins: `bins` lateral strips of each company;
- the accordion pairs;
- the half-turn symmetry for Face about.

The ruleset's hash is recorded in the world, the replays and the saves.

**Types in the world.** A formation stores its type (`f.type`), and `f.shape` indexes its type's shapes. The
per-company and per-bin rows of the world are strided by the most of any type (`cr.maxC`, `cr.maxNB`,
`cr.maxSlots`), so a smaller type leaves the rest of its row empty; loops run over its own counts
(`typeOf(w, i)`).

**Terrain** (`terrain.ts`), from the build-time data:
- the class and water depth on the 1 m grid;
- the slope from the 1.79 m heightfield (level where the ruleset says so: a bridge deck);
- per kind, the impassable cells and each cell's distance to the nearest one.

`groundG` is class × water × slope along the direction of travel.

**Limits.** Checked when a ruleset is compiled:
- at most 32 companies (`MAX_COMPANIES`: per-company scratch, and the company mask of the re-packing
  gate); bins and slots have no limit: the gates keep them in bit sets (`bits.ts`);
- the trail ring is sized from the deepest trail shape of any type, at least 256 points of 0.25 m and at
  most 4096 (`cr.trail`): 960 for the regiment's column of route (512 for the battalion's alone). A trail
  shape keeps its depth, two company frontages and 12 m of trail, and at least 24 m past its farthest place.

**Places.** A man's place is his slot set back by his bin's lag:
- **straight shapes:** along the heading;
- **trail shapes:** along the trail, man by man, so a column follows its head's bends. The trail is a
  ring of points per formation.

During a change, each company wheels about the flank it turns to, with smoothstep timing; a step's spacing
is eased with the company's frame, so a change into or out of the column of route by fours passes from the
block's spacing to the step's. A change interrupted by another is timed by the distance still to cover (and
eases the spacing from its first shape's again).

**The lag model** (per tick, moving):
- the bins sample their men's ground: the harmonic mean of g, the worst q;
- a bin is held when a man has impassable ground underfoot or one step ahead;
- the speed is the largest that keeps every file within Lmax and the mean within Lmean (solved
  exactly);
- lags renormalise to the leading file, the accordion keeps bins apart, and disorder grows with lag.

**The footprint gate:**
- every pose change (the turn and advance of a move, a wheel step) goes through `gate`, which halves the
  step until no new bin's places are on impassable ground;
- `wetBins` places only the men of companies near impassable ground: a company whose places all lie
  within a reach of one point (a straight shape: its bins' frames plus the block; a trail shape: the
  middle of its stretch of trail, half that stretch and its widest offset) is skipped when the distance
  field there exceeds the reach, with margins for the chamfer and the cells (S1c-5; checked against a scan
  of every man in `test/shortcuts.test.ts`);
- the quick reject (no place of the formation within reach of impassable ground) allows a company's places
  a frontage of its origin, times its spacing (a step reaches three times farther);
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
- **Cost:** 40 battalions of 400, under 3 ms per tick in vitest (the target, 2 ms, met on the release world: S1c-5).
- **Scale** (`test/scale.test.ts`): the shipped block and the ceiling (45 files, 810 men) change through
  every shape, Face about, march a 90° turn, halt dry at the stream, and lose half their men at the bank
  without a man on impassable ground; no two places of any shape closer than the minimum spacing, for 4 to
  8 companies; a battalion's bins past bit 32 reported by the gate.

- **Unit types** (`test/types.test.ts`): each type through every change in its time, Face about and a wheel;
  its pace on open ground and its terrain factors (a regiment in woods, a battery held at a wood's edge and
  at a hedge, horses wading 1 m where infantry and guns cannot, guns refused at 0.8 m); a column of route by
  fours wet only at its tail, and a change into it refused for its places alone; a regiment and a battery
  under fire, which never fire back and rout; a battalion, a regiment and a battery side by side, whose rows
  no other touches. The gate's shortcuts are checked for the regiment and the battery too
  (`test/shortcuts.test.ts`).

Most terrain tests run on `small` (`test/fx.ts`): the S1a–S1c block of 4 companies of 9 files (100 men).
They were placed for battalions that size at spots along the stream; the code they test does not depend
on the block.

Negative runs, each failing its tests:
- the lean not flipping (uneven strengths);
- the Retire target not kept on the map;
- the gate off;
- the change-path check off;
- Face about dropping lags;
- the fill rule not centring the partial rank;
- no turning-circle stop.

## Open questions

- The soldier layer's checks (settling in the wood, slot error) are in `test/soldiers.test.ts` (S1b).
