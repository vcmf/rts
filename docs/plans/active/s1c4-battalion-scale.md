---
status: active
last_reviewed: 2026-10-10
---

# Plan: S1c-4, the 400-man battalion

Decision 0018 replaces 0007: battalions of about 400 men, and an engine with no limit below 800. This
plan does the simulation side, before S1d builds cavalry and artillery on the battalion. The soldier
layer's cost is the next plan (S1c-5, below).

## What stops 400 today

| Limit | Where | At 400 |
|---|---|---|
| The block geometry is 4 companies of 9 files × 3 ranks: 108 slots | `src/rulesets/napoleonic.ts` | `debug-spawn` refuses more than 108 men |
| A company's slots are a 32-bit mask (the re-packing gate) | `wetSlots`, `compileRuleset`'s check | a company of 23 files × 3 ranks has 69 slots |
| A battalion's bins are a 32-bit mask (the footprint gate, the lag model) | `wetBins`, `gate`, `faceAbout`, `haltAtEdge`, `lagSettle`, `MAX_BINS` | 6 companies × 8 bins = 48 |
| The shapes place exactly 4 companies | the `place` functions | 6 companies |
| The bins are 3 per company | `BINS` | 3 bins over 23 files are 5 m wide; today a bin is 2 m (3 files) |
| Morale distances were set for 25 m battalions | `morale.support.reach` (100 m, centre to centre) | two 90 m lines side by side are about 100 m apart: support would flicker |
| The scenarios place 100-man lines | `src/scenarios/` | a 90 m line at z = −165 runs off the 360 m field |

The fire step, the morale step, the world's buffers and the saves already take the company count from
the ruleset.

## Design

### The geometry

The Napoleonic ruleset gets **6 companies of 23 files × 3 ranks (414 slots)**, the French battalion after
1808 (4 fusilier companies, grenadiers, voltigeurs), and a battalion spawns 400 men by default. A line is
6 × 23 × 0.65 m plus the gaps between companies, about 93 m.

**The ceiling** is a test ruleset with 6 companies of 45 files (810 slots): every test of the formation
layer that does not depend on the Napoleonic numbers also runs on it, and the cost suite reports a 40 ×
800 bench.

### Bins

`BINS` becomes a geometry field, `bins` (per company). Napoleonic: 8, about 3 files per bin, as today.
The ceiling ruleset: 15.

### Masks

A small bit-set module (`src/sim/bits.ts`): fixed-length `Uint32Array` words, with set, has, clear,
copy and "any bit in a not in b". Every 32-bit mask in `formation.ts` becomes one:
- `wetSlots`: a company's slots;
- `wetBins`, `gate`, `faceAbout` (the bin remap), `haltAtEdge`, `lagSettle`, the march's `held`: a
  battalion's bins;
- `takeMan`'s `tried`: a battalion's companies.

The scratch sets are allocated once per world (`w.scratch`), sized from the compiled ruleset, so a tick
allocates nothing. `compileRuleset` drops both 32-bit checks. The sets change no result: the same bits,
more words.

### Shapes for any number of companies

- **Line:** companies side by side, centred, one file between them; casualties close toward the colours
  (needs an even count, as today).
- **Column of divisions:** two companies wide, `C / 2` deep (an odd count puts the last company in the
  centre).
- **Column of route:** the companies one behind the other.
- **Square:** the companies spread over four faces, front and rear first (6: 2, 1, 2, 1), each face a row of
  company blocks facing out. A pinwheel as today: each face's end meets the next face's rear rank. With 4
  companies the layout is today's.

The half-turn maps, accordion pairs and trail limits are already computed from the placements.

### Distances

Distances stay centre to centre; the values change with the frontage:
- `morale.support.reach`: 100 → 150 m (a 93 m line and a 55 m interval);
- `morale.contagion.front` and `back`: kept at 200 and 100 m, re-checked in the brigade run;
- `fire.maxRange` (250 m, company centre to company centre) and `morale.rally.safe` (250 m) are kept.

### The calibration

The hit chances are per round, so a 400-man line inflicts four times the hits on four times the men and
the time to break should hold. `tools/calibrate-fire.ts` reruns at 400 men, 100 seeds. The target is
unchanged: two lines at 100 m break the weaker in 6–10 minutes. If the median drifts, `fire.pRange` is
scaled by one factor.

### Scenarios

- The firefight moves to where two 93 m lines fit, side by side along z, on open ground.
- The brigade: three lines a side, a 20 m interval, centred on the field's open band; if three do not
  fit, two, and the plan's results say so.
- The drill, the field and the 40-battalion bench spawn 400. The bench places columns (30 × 17 m), which
  fit on the field.

### Versions

`SIM_VERSION` `s1c.4`. The goldens and replays are regenerated: every hash changes with the ruleset.

### Cost

The cost suite measures 40 × 400:
- the sim alone, against the 4 ms budget (measured 2.0 ms on the dev Mac before this change);
- the soldier layer, reported, with a temporary budget of 14 ms and a known issue until S1c-5.

A 40 × 800 run is reported, never failed.

## Acceptance

- 40 battalions of 400 spawn, march, change shape, fire, rout, rally; no cap below 810 men.
- The ceiling ruleset passes the formation, re-pack and Face about tests.
- With 100 men the old behaviour holds where it should (the re-packing probe: no loss onto impassable
  ground at the axis headings).
- The calibration: the 100 m median within 6–10 minutes, the 50 m and 200 m rows reported.
- The page runs `s1c-firefight`, `s1c-brigade` and `s1b-bench` at 400.
- Lint, typecheck, `check:data`, `check:docs`, the tests and `check:app` pass.

## Non-goals

- The soldier layer's cost (S1c-5).
- A larger sim map (S1e).
- Battalions of different sizes in one ruleset: a battalion of 250 spawns into the 414-slot block (a line
  fills from the colours, so it stays compact); a geometry per battalion type waits for cavalry (S1d).
- Change times for larger battalions: kept (an open question for playtests).

## Risks

- **Coarser lag-model feel at bin edges:** kept at 3 files per bin, so the terrain feel should hold;
  the S1a terrain tests check it.
- **Tests written for 100 men:** many expectations are numbers of a 4-company block. Mechanics tests keep
  spawning 100 men where the count does not matter; the rest are rewritten for 400.
- **The re-packing gate's cost:** a re-pack checks a company's filled slots, 69 instead of 27, only
  near impassable ground.

## Next: S1c-5, the soldier layer at 16,000 men

The benchmark put the layer at 10.6 ms per frame for 16,000 marching men. Planned separately, after this
merges: skip settled men before any placement work, make the displaced-man search local (today it scans
every slot per displaced man), and measure what moving the layer into the S2 worker or onto the GPU
would save. Its budget: 4 ms for sim and layer together at 40 × 400, and a report at 40 × 800.

## Results (2026-10-10)

**What changed from the design:**
- **The trail ring** was a fixed 256 points (64 m); a column of route of 400 needs about 120 m. The ring
  is now sized from the ruleset (`cr.trail`: 512 for 400 men, 1024 for the ceiling).
- **The reaches:** contagion and support are centre to centre, so they were scaled by 2.8 (front 560 m,
  back 280 m, support 280 m), not only support raised to 150 m. Unscaled, the brigade's neighbours (113 m
  apart) fell outside contagion's 100 m and a break spread over 35–135 s instead of one tick.
- **The firefight** moved to x −120, z 120: at z −110 the ground between the lines hid part of each and
  a break took more than 20 minutes on the real field. In the north-west it takes 9.4 minutes, as on
  levelled ground. The fire tests keep the old strip for their 100-man lines.
- **The tests:** the terrain-mechanics tests run on `small`, the S1a–S1c block, with S1c-2's reaches
  (`test/fx.ts`); the scenarios, goldens, calibration and cost benches use the shipped ruleset;
  `test/scale.test.ts` covers 400 and 810.
- **A bug the scale tests caught:** the first square gave the extra companies to the front and right
  faces, so a 6-company square had no half-turn and refused Face about.

**Refactor check:** with `bins` left out of the ruleset hash, the bit sets reproduced every golden and
replay hash of the old block.

**Calibration** (100 seeds, levelled, lines of 400):

| Range | Weaker breaks | Time to break, min (p10 / median / p90) | Losses at the break |
|---|---|---|---|
| 50 m | 100 | 4.0 / 4.3 / 4.7 | 20% |
| 100 m | 100 | 8.4 / 9.3 / 10.7 | 20% |
| 200 m | none in 20 min | – | – |
| 100 m, no fall-back | 100 | 7.9 / 8.5 / 9.8 | 20% |

S1c-2 at 100 men: 9.1 minutes at 100 m, 4.2 at 50 m. The hit chances are per round, so they carry over
unchanged. Brigade 3v3: the weaker side breaks first in every seed, after a median 10.4 minutes, and all
three of its lines are out within 0.1 s.

**Cost** (dev Mac, M1 Pro; `docs/known-issues.md`):

| Bench | 40 × 400 | 40 × 800 |
|---|---|---|
| Formation step, per tick, every shape marching | 5.3 ms (target 2) | 8.9 ms |
| Sim and soldier layer, per frame, marching | 13.8 ms (budget 4) | 27 ms |
| Sim and soldier layer, per frame, firing at the halt | 6.2 ms | – |
| Hash, every 20 ticks | about 5 ms | about 8 ms |

`check:app`: the firefight breaks the weaker line at 9.5 minutes, the brigade's break spreads to its three
lines at 12.4 minutes, and every replay reproduces in Node.
