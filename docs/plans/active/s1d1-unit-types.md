---
status: active
last_reviewed: 2026-10-11
---

# Plan: S1d-1, unit types

S1d brings cavalry and artillery (`docs/plans/done/s1a-formations-on-spine.md`, the split; sim-design §5, §8,
§9, §12). It is too large for one reviewable PR, so it is split:

| Part | Scope | Ends with |
|---|---|---|
| **S1d-1** (this plan) | Unit types: the ruleset declares infantry, a cavalry regiment and a foot battery, each with its own block, shapes, paces and change times; they move, change shape, take fire and rout | A regiment and a battery manoeuvre on the field beside a battalion; every infantry hash reproduced before the types are added |
| S1d-2 | Charges and melee: the `charge` command, the gallop, the defender's test before contact, impact, melee, recoil and pursuit; standing behaviour forms square against cavalry; flank and rear shocks | Cavalry catches a forming square; a square holds |
| S1d-3 | The battery fires: roundshot as rays with grazes over the heightfield, depth along the ray by kind, canister as a cone | Artillery punishes columns |

## The problem

The ruleset has one block geometry (`geometry`), and everything sized or shaped by it reads it from the
compiled ruleset (`cr.geo`, `cr.shapes`, `cr.slots`, `cr.NB`): about 70 places in `src/sim/`, the soldier
layer, the map and the page. A cavalry regiment (two ranks of horses 1 m apart and 3 m deep, squadrons
10 m apart) and a battery (gun detachments 16 m apart) cannot be expressed as shapes of the infantry
block.

## Design

### The ruleset

`Ruleset.geometry`, `formations`, `changeTime`, `defaultChangeTime` and `start.shape` move into
`types: Record<string, UnitType>`:

```ts
interface UnitType {
  geometry: Geometry
  formations: Record<string, FormationDef>
  changeTime: Record<string, number>; defaultChangeTime: number
  start: string           // the shape a spawn takes when none is given
  fires: boolean          // musketry (S1c); a battery's fire is S1d-3
}
```

What stays shared: the paces and hurry table (a type's shapes name their paces), the terrain table (its
kinds are columns, and the new types bring new kinds), water, the order presets, disorder, Face about and
dress times, fire and morale. The first type is the default.

Water gets a limit per kind (`water.limit` stays the default; `water.limitByKind`): horses wade to 1.2 m,
guns to 0.7 m (`docs/research/terrain-movement-speed-models.md`, the slope and water table).

### The compiled ruleset and the world

`Compiled.types[]` holds per type what `Compiled` held for the one block: the geometry, the shapes and their
layouts, the change times, the slot tables and the bins. The world's per-formation buffers keep one stride
for every type, the largest: `maxC` companies, `maxNB` bins, `maxSlots` slots (renamed from `geo.companies`,
`NB` and `slots`, so the compiler finds every use and each is read again as a stride or a count). A
formation stores its type (`f.type`); `f.shape` indexes its type's shapes. `layoutOf` and the helpers take
the formation, so most of `formation.ts` reads `typeOf(w, i)` where it read `w.cr`.

**The refactor check.** Before the types are added, the ruleset with infantry only must reproduce every
golden and replay hash: run with the new `type` column left out of the hash and the ruleset hashed as
before (a temporary switch, as S1c-4 did with `bins`). Then the switch goes, the types come in and the
goldens are regenerated (`SIM_VERSION` `s1d.1`).

### Commands

- `debug-spawn` takes an optional `unit` (the type; the default type when left out: `type` names the command),
  and `shape` becomes optional (the type's start shape); `men` is checked against the type's slots.
- `form` looks the shape up in the formation's own type: "no such shape" for a cavalry regiment ordered into
  square.

### The Napoleonic types

Every number is ruleset data; sources: `docs/research/terrain-movement-speed-models.md` (paces, terrain
factors, water) and `docs/research/formation-movement-and-doc-systems.md` (cavalry ranks and intervals,
unlimbering).

- **Infantry:** today's battalion, unchanged.
- **Cavalry regiment:** 4 squadrons of 32 files × 2 ranks (256 places, a regiment of about 250), 1.0 m a file,
  3.0 m a rank (a horse and the gap behind it), squadrons 10 m apart. Shapes: **line** (squadrons side by side),
  **column** (column of squadrons at half distance), **march** (column of route by fours, following its head's
  trail). Paces: walk 1.7 m/s in line and column, trot 3.3 m/s on the march (the gallop is the charge's, S1d-2).
  Change times: the squadrons at the trot (below).
- **Foot battery:** 8 guns (6 guns, 2 howitzers), each a detachment of 4 files × 3 ranks (12 men; 96 in all)
  as a company. Shapes: **unlimbered** (the guns in a line 16 m apart, the detachment behind its gun; moved
  by hand at 0.3 m/s) and **limbered** (gun, limber and team one behind the other on the trail, 18 m apart, at
  the walk, 0.85 m/s). Unlimbering 60 s, limbering 90 s (unsourced, to tune).
- **New kinds:** `horse` and `guns`, with the table's terrain factors (woods 0.45 and dense wood 0.25 for
  horses; guns 0 in woods, dense wood, marsh and hedges, so they are impassable to a battery), disorder scale
  0.6 and 0.2, and fire depth factors 1.3 (a horseman is a large target) and 0.4.

Cavalry and batteries do not fire in S1d-1. They are fired on, lose men through the same re-packing gate,
and have morale, routs and rallies like a battalion.

### The soldier layer and the map

- **The soldier layer** places men by their type's slots, unchanged in kind. The men of a fast type walk and
  run faster (the run speed is at least 1.3 times the type's fastest pace, so troopers keep up at the trot).
  `Unit` gains `type` (the type's name) for the 3D renderer: a backward-compatible addition.
- **The map** (staff map): troopers as short strokes along their facing, gunners as today's circles with a
  bar for each gun at its detachment's front; the morale bar sits behind the type's own rear rank.

### Scenarios

`s1d-arms`: on each side a battalion, a cavalry regiment and a battery, holding fire, to drill from the page
(a scenario's setup issues only first-tick commands, and a shape change cannot be queued behind a move, so
the page deploys them: `check:app` unlimbers a battery, trots a regiment and forms columns). It is the page's
way to see the types; fighting between them comes with S1d-2 and S1d-3.

## Acceptance

- The refactor check: with infantry only, every golden and replay hash reproduced.
- `test/types.test.ts`:
  - each type spawns, marches, changes into each of its shapes in its change time, wheels and Faces about;
  - its pace on open ground and its terrain factors (cavalry slower in woods than in the open, a battery held
    at a wood's edge, at a hedge and on deep water where horses cross a ford);
  - the cached filled slots and the gate's wet bins as the full scan, for the cavalry and the battery
    (`test/shortcuts.test.ts`);
  - a regiment and a battery under musketry lose men, break and rout; a regiment cannot form square;
  - the soldier layer keeps troopers within their slot error at the trot.
- The goldens regenerated; lint, typecheck, `check:data`, `check:docs`, the tests and `check:app` pass (the
  page runs `s1d-arms`).
- The cost bench at 40 × 400 infantry is unchanged within noise.

## Non-goals

- Charges, melee, auto-square (S1d-2); the battery firing (S1d-3).
- Horse artillery, the draught test for guns on slopes, a slope curve per kind: the slope stays the
  infantry curve for every type (an open question in `docs/systems/formations.md`).
- A lag-model catch-up time per type (cavalry 2 s): the presets stay shared.
- The 3D look of horses and guns (Track E reads `Unit.type`).

## Risks

- **Strides against counts:** a loop over `maxC` where the type has fewer companies reads empty companies; a
  stride of the type's count corrupts the next formation. The renaming forces every use to be read, and the
  types test runs a battalion beside a regiment and a battery (different counts) through every path.
- **The square:** it needs an even number of companies, at least 4 (S1c-4); only infantry has one.

## Results (2026-10-11)

**The refactor check:** with infantry as the only type, the new `type` column left out of the hash and the
ruleset hashed as before, the drill, firefight and calibration goldens and every replay reproduced. With the
types added, the goldens were regenerated (`SIM_VERSION` `s1d.1`); the calibration table is unchanged (the
ruleset's hash alone moved).

**What changed from the design:**
- **The column of route of horses** cannot be the block turned along the road, as the battalion's is: its
  files would stand 1 m apart nose to tail. A trail shape may set its own spacing (`step`: 3 m between
  horses, 1 m between the two ranks), and the regiment marches by fours: each squadron a column of twos, the
  squadrons in pairs side by side (by twos the column was 384 m and the trail ring 2,240 points).
- **A step's places reach farther than the block,** which the gate's quick reject (a frontage from each
  company's origin) did not allow for: a column whose last horses stood in water 180–192 m back was judged
  clear. The reaches scale with the spacing; a test places only the tail in water.
- **A change eases the spacing** with the company frames, so a change into or out of the column of route by
  fours passes from the block's spacing to the step's, and its last pose is the step shape's places (the
  check of the whole path covers them).
- **Change times:** "about half the infantry's" moved the squadrons' frames at up to 24 m/s (a line of 157 m
  into a column of 190 m in 10–15 s). They are now set so no squadron's frame covers more than 3.3 m/s over
  its part of the change (45–100 s), and the battery's pieces under 2.8 m/s (90 s into action, 120 s to
  limber up).
- **The trail limit:** a trail shape keeps its depth, two company frontages of the block and 12 m, and at least
  24 m past its farthest place (the battalion's limits are unchanged; the regiment's ring is 960 points).
- **The hurry factor** that sets the gate's look-ahead is per type (the largest q of its shapes' paces), so
  the cavalry's 1.5 does not lengthen the infantry's.
- **The soldier layer:** troopers keep up at the walk and the trot (slot error below 1.6 m, 0.5 m on average)
  and through their changes (below 9.4 m, 1.4 m on average, while the rear squadrons' eased frames peak
  near 5 m/s); a battery's gunners trail their pieces by up to 29 m while it deploys and fall in after.
- **The scenario** spawns the types in place (above), and keeps every shape the page drills them into on the
  map: the field is 360 m, and the gate does not treat the ground beyond its edge as impassable
  ([#37](https://github.com/vcmf/rts/issues/37), for S1e).

**Cost** (dev Mac, M1 Pro, `node tools/bench-cost.ts`, the page's release world, main against this branch):

| Bench, 40 battalions of 400 | main | S1d-1 |
|---|---|---|
| Marching, per frame (after 8 s) | 4.57 ms | 4.51 ms |
| the sim, per tick | 0.60 ms | 0.68 ms |
| Firing at the halt, per frame | 0.59 ms | 0.64 ms |
| The hash (every 20 ticks) | 2.7 ms | 4.1 ms |

The tick's 0.08 ms is the type lookups in the per-formation paths (the per-man path reads the type and shape
from its places context). The hash is the trail ring (960 points for every slot, the regiment's column of
route): [#38](https://github.com/vcmf/rts/issues/38).

## Review

**Round 1** (`/code-review high`, 10 findings, none severe; no second round):
- **Fixed:**
  - a change interrupted halfway into or out of the column of route snapped its spacing back to its first
    shape's (a regiment's places shrinking to a third in one tick): each company's spacing as the change
    began is now state (`tK`), and the change eases on from it; a test checks that no place jumps;
  - the fire step sized a block by the block's spacing, so a friendly column of route by fours blocked
    fire along a third of its length: the block's rectangle and reach take the pose's spacing;
  - a type whose paces had no hurry table got a look-ahead of 0: the hurry factor is at least 1;
  - the map named the Napoleonic kinds (`horse`, `guns`), against decision 0015: a unit type now says how its
    men are drawn (`figure`: foot, mounted, crewed), and `Unit` carries it for the 3D renderer;
  - the map looked a type's shapes and the anchor up twice a formation a frame; a halted trooper's stroke
    pointed along the head's heading, across a bent column: it follows his place's direction of travel;
  - the places context is read for its type and shape throughout (`companyClear`, `placeAt`);
  - the scenario's own π.
- **Kept:**
  - one trail ring size for every slot (the hash 2.7 → 4.1 ms even with no cavalry): a ring per type
    needs per-formation offsets into the rings, a change of the save format left for S2 with the save of live
    points only ([#38](https://github.com/vcmf/rts/issues/38));
  - the fire step's per-company buffers and sight cache strided by the battery's 8 companies (2.1 MB against
    1.2 MB): the cost is memory, not time (the firing frame is unchanged).

## Next

- **S1d-2:** charges and melee (the split, above).
- **The slope** stays the infantry curve for every kind; the research's cavalry and gun curves (and the
  draught test for guns on slopes) wait for a map with real hills.

