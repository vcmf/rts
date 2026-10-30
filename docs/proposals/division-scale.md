---
status: draft
last_reviewed: 2026-10-30
---

# Model: the division scale

The sim's units become decision 0076's (the campaign proposal's § The scale, #234): one unit stands for a
division, a figure for 25 men. The owner fixed the sizes and the ranges on 2026-10-30; this document says what changes
in the sim, exactly enough to build and check, as `docs/proposals/morale-bar-model.md` does. Its properties are P-56
to P-63 (U3's model, the closing model on U3's branch, holds P-41 to P-55). A review reads the properties first.

It comes before U3: U3's ranges (close range, the first volley, fire discipline's modes) are set at this scale.

## 1. Why ranges are not real ranges

A figure stands for 25 men, but figures stand at a soldier's spacing, so a line unit of 240 is about 54 m wide where
a real division held 1–2 km. Real ranges fit neither: a real musket's 250 m is five of our units' widths, and a
fraction of a real division's front. The distances are set instead by what the player sees, from four ratios:
- **range to a unit's width:** units fire at each other from a gap that reads as facing, not touching (about 1–2
  widths);
- **range to a corps' front** (about 10 widths): fire reaches well short of it, so flanks still matter;
- **range to the pace:** the time to cross the fire zone is the tactical number (tuned, not derived);
- **guns to muskets:** canister about 3 times a musket's reach, roundshot across a good part of the field.

## 2. The units (decision 0076)

| Type | Figures | Today | Blocks | Width in line |
|---|---|---|---|---|
| Line infantry | 240 | 400 (6 × 23 × 3) | 4 companies × 20 files × 3 ranks | about 54 m (was 93) |
| Light cavalry | 80 | 256 (4 × 32 × 2) | 2 squadrons × 20 files × 2 ranks | about 41 m (was 131) |
| Foot battery | 4 guns, 48 figures | 8 guns, 96 | 4 pieces × 12 (4 × 3) | about 52 m (pieces 16 m apart, as today) |
| Light infantry | 160 | none | U5 (light troops); its numbers are recorded here | |

- The square needs an even number of companies, at least 4: 4 companies make one face each. The column of
  divisions is two companies wide, two deep.
- Heavy cavalry is the reserve cavalry corps' (decision 0076), later; today's cavalry type becomes light cavalry.
- **A figure is 25 men** (`menPerFigure`, ruleset data): what the page shows as losses and strengths. The sim counts
  figures; nothing in it reads the 25.

## 3. Ranges (the owner's numbers)

| Distance | Metres | Today | What it does |
|---|---|---|---|
| Musket long range (`fire.maxRange`) | 100 | 250 | the farthest a musket fires; poor hits |
| Musket close range (`fire.close`, U3) | 50 | none | much better hits; the first volley's bonus (U3) |
| Bayonet range (`fire.bayonet`, U3) | 15 | none | inside it a moving unit charges instead (U3) |
| Light infantry long range | 160 | none | U5 |
| Canister (`artillery.cone.range`) | 300 | 300 | unchanged (the owner: 250–300) |
| Roundshot (`artillery.ray.range`) | 1,000 | 800 | |
| The guns' minimum (`artillery.min`) | 15 (the owner: bayonet range) | none | inside it the guns do not fire (§ 4) |

- **The hit chance by range** (`fire.pRange`) is today's table with its distances × 0.4 (250 → 100): the same chance at
  the same share of the range, so a firefight at 40 m is today's at 100 m.
- **Canister's hits by range** keep their table (its range is unchanged). **Roundshot's energy** grows with its
  range (900 → 1,100), so a ball still reaches its full range over open ground.

## 4. The guns' minimum range

An enemy whose nearest company is within `artillery.min` (15 m, bayonet range) of a piece's muzzle is among the guns: no piece of the
battery fires at all (at any target), its detachments fight as a melee does. Between the minimum and canister's range
it fires canister, beyond it roundshot, as today.

- **P-56:** a battery fires no piece on a tick when an enemy in the fight is within `min` of any of its muzzles; past
  it, it fires as today.

## 5. The other distances

Each distance in the ruleset belongs to one of three groups, and moves with its group:

| Group | Factor | Distances |
|---|---|---|
| **Fire** (a range or within one) | × 0.4 | `fire.pRange`; `morale.rally.safe` (250 → 100) |
| **The charge** (a pace and a time) | unchanged | the charge's `gallopAt`, `test`, `build`, `recoil`; the melee's `refuge.alert`: the paces and the clock are unchanged (below), so a charge's distances, its speeds by its times, are too |
| **The unit** (a frontage or a spacing) | × 0.58 (54 / 93) | `morale.contagion.front`, `.back` (560, 280 → 325, 163); `morale.support.reach` (280 → 163) |
| **The guns and the ground** | unchanged | canister; `sectors.reach` (300: no threat farther than canister); `morale.leave`; the terrain's and the movement's numbers |

Paces and times (the clock) are unchanged here: a unit crosses 3 km in about 55 minutes at today's 0.9 m/s. That
belongs to the battle's time scale (the campaign proposal's open question 8, #234), decided with the 2–6 km maps.

- **P-57:** every ruleset distance is its group's factor × today's, to the metre (the table above); the guards that read
  distances hold.

**The charge's distances, measured** (2026-10-30). Scaled × 0.4 with the musket (a test at 25 m), the charge's test
came closer to its impact, the shocks had less time to wear off between them, and two regiments charging each other
both broke at the impact in a third of the runs (the cavalry case 81/19 against its 30–70% target). Kept as they
were, every charge target holds (§ 7). The charge belongs to the paces and the clock, which this step leaves alone.

## 6. What it keeps

- **Morale** is a share of the unit (U2): a man lost costs `loss / start`, so a 240-figure unit breaks at the same
  share of losses as a 400.
- **Fire** is tuned on time to break, not on real hit rates: a company's rounds scale with its figures, a target's
  losses are a share of its own, so the time to break at the same share of the range is about today's (§ 3).
- **Sectors, the drain, the second enemy, experience:** unchanged in form; their distances move with § 5.

- **P-58:** a unit's losses at its break, as a share of its figures, are within 2 points of today's at the same share
  of the range (C-01 at 40 m against today's at 100 m).

## 7. Calibrations at the new distances

| Case | Today | At the scale | Target |
|---|---|---|---|
| C-01, the anchor | 100 m | 40 m | the weaker breaks in 6–10 min, at 12–25% losses |
| The fast break | 50 m | 20 m | under 5 min |
| The long-range harassment | 200 m | 80 m | no break in 20 min in 95% (the owner: firing at long range harasses) |
| The 3v3 brigade | 100 m | 40 m | reported |
| The charges, C-02, H-04, G-06 | as today | their distances × 0.4 | today's targets |

- **P-59:** C-01 at 40 m meets today's targets; the 20 m and 80 m cases meet theirs.
- **P-60:** every charge target (`tools/calibrate-charge.ts`) holds at the new distances.

## 8. Scenarios and the bench

- **The S1c firefight and brigade, the S1d scenarios:** at the new distances (§ 7).
- **The S1e battle:** re-laid out for units about half as wide on the 1.2 km battlefield; its plan's points moved with
  them, and tuned again (side 1's, decided in 15–22 minutes).
- **The bench** (`src/scenarios/bench.ts`): every case's positions × 0.58 about its centre, so formations meet as they
  did.

- **P-61:** the S1e battle at the page's seed is side 1's in 15–22 minutes; the valley plays the same battle.
- **P-62:** every bench case's invariants hold.
- **P-63:** the page shows losses and strengths in men (figures × 25); the sim's state holds figures only.

## 9. Choices for the owner

1. **The guns' minimum range** (§ 4) as "the enemy is among the guns, nothing fires". The alternative is a dead zone
   for roundshot only (no ball at an enemy inside canister's range), which today's code already has: inside 300 m it
   fires canister.
2. **The fire group × 0.4** moves the charge's distances with the musket's range (a charge's test at 25 m, inside close
   range). The alternative keeps the charge's distances, which would put its test at 60 m, outside musket range.
3. **Four companies** for line infantry (one a face of the square). Six companies of 40 would keep today's drill shapes
   closer, at narrower companies (8–9 m).
4. **Light infantry** waits for U5 (its type, open order, and its 160 m range); only its numbers are recorded here.
5. **The clock** (§ 5) waits for the 2–6 km maps.

## 10. Order of work

1. This document reviewed.
2. The units and `menPerFigure`; the distances (§§ 3, 5); the guns' minimum.
3. The calibrations at the new distances (§ 7), the scenarios and the bench (§ 8), retuned.
4. The docs (`docs/systems/fire-morale.md`, `docs/systems/melee.md`, `docs/systems/artillery.md`,
   `docs/systems/formations.md`), the goldens, `/code-review
   high`, the PR.

## 11. Results (PR B, 2026-10-30)

- **Fire** (`node tools/calibrate-fire.ts 30`): every check passes with no number tuned: at 40 m the weaker line breaks
  in a median 9.2 min at 20% losses; at 20 m in 4.5 min; at 80 m none breaks in 20 min. C-02 (0.42 of the recruit's
  losses), H-04 (holds 15.1 min) and G-06 (2.48) hold. The 3v3 brigade: its weaker side's first break at 10.2 min,
  but now one line out 3 minutes later where all three went before (reported, no target).
- **Charges** (`node tools/calibrate-charge.ts 60`, the charge's distances unchanged, § 5): every target passes:
  the square holds, the line breaks 78%, the flank 98%, cavalry against cavalry 62/38. The column, which has no target,
  now forms square in time and turns most charges away.
- **The S1e battle:** both fronts drawn in toward their middle by the width's ratio (0.58), side 1's halt and close at
  52 m and 28 m (× 0.4), its close at 700 s: side 1's at 17.2 minutes at the page's seed (15.2–17.0 on seven more,
  one decided at the limit); the valley plays the same battle.
- **The bench:** every case scaled by 0.58 about the field's centre in its builder (`BENCH_SCALE`), with the depths
  that must not shrink (X-16, X-17's regiment 9 m behind; X-14's columns 30 m apart) written so. Five cases that the
  tests listed as failing now pass (X-11's rally, the visiting order of X-15, X-16, X-17, X-20); Q-02's charge now
  depends on the slots' order (#187).
- **Artillery** (`node tools/calibrate-artillery.ts 30`): the line (12% in 10 minutes, none breaks), canister (70 of
  240 in 3 minutes, all break) and the crest hold; two column targets do not: it loses 1.8 times the line's men (the
  target 2) and none breaks in 10 minutes (the target 30%). Half the pieces (4), and a column of 240 two sections
  deep where S1c's was three, so a ball crosses fewer ranks. Not tuned here: PR C's attack column is a dense block 12
  ranks deep (`docs/proposals/formations.md` § 2), which the ball's geometry strikes far harder.
- **Full strengths** in one place for scenarios and tests, read from the ruleset's blocks, and the width's ratio:
  `src/scenarios/sizes.ts`.
- **The cost benches** keep their figures: 66 units of 240 (15,840) and every formation slot, 128 units (30,720:
  32,000 would need 134, over `MAX_FORMATIONS`).
- **The look page** builds its armies on the shipped infantry and cavalry; its tests (armies, arms, battle-thread)
  expect the old blocks and are the look track's to move (the owner, 2026-10-30).
