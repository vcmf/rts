---
status: active
last_reviewed: 2026-10-28
---

# Plan: U1, sectors

The first phase of the unit model (`docs/proposals/unit-model.md`, § Facing and sectors, § Phases). One reading of
where a threat stands, front, flank or rear, used by fire, charges and morale alike, and the two rules the owner
added that read it: a battalion's back exposed to an enemy that can hurt it presses on its morale (decision 0086,
amending 0080's one-off retreat shock), and a second enemy charging a battalion already in melee shakes it again
(decision 0080). It builds on C1 (`docs/plans/active/c1-claims.md`, #220): the charge and
melee code it changes is C1's.

Earlier drafts were reviewed and replaced (§ Review).

## Problem

- **Three readings of "the side":** the charge reads it from the target's centre to the charger's (`quarter`,
  `src/sim/melee.ts`), fire does not read it at all (a target's exposure is one factor by kind, `fire.depth`), and
  morale has no pressure from an enemy on a flank or behind until men fall.
- **The centre's angle is wrong for long shapes:** a 93 m line's front reaches well past 45° from its centre, so an
  enemy ahead of one end reads as a flank. Lines that meet 30 m offset break on the impact as if struck in the flank
  (bench X-19).
- **Enfilade costs nothing:** a line fired on from its flank loses men as fast as from the front (A-02, A-07).
- **A flank turned is not felt** before the first shot (G-04), and turning the back on the enemy costs nothing but the
  fire it then takes (A-10).

## The model

The rules, their exact definitions, their properties and their numbers are in `docs/proposals/sectors-model.md`; this
plan follows it, and where they differ the model holds. In short:
- **the face** of each formation, once a tick after the move: all front (a square), one face from where its men stand,
  a march column's head and tail, or no front (changing shape);
- **the weight of a point** (front, flank, rear) by an angle measure without trigonometry, blended 35° to 55°, smooth at
  the face's corner; **of a threat**, the mean over its block's slices;
- **what reads them:** fire's exposure, the side a charge strikes, the second enemy in melee (0080), and the drain of a
  back exposed to an enemy that can hurt it (0086); the wavering fall-back is removed (0087): a wavering battalion keeps
  fighting until it recovers or routs;
- **who can hurt a battalion:** by fire (range, arc, sight, unscreened by its friends) or by a charge (a shape it charges
  from, not blown, within 200 m), found in one pass before the morale loop.

## Steps

1. The model reviewed, its properties first.
2. `src/sim/sectors.ts` and `test/sectors.test.ts` alone: the faces and the weights, P-1 to P-17 proved on sampled
   inputs; nothing else in the sim changes and no golden moves; the bench's Sectors layer (S-01 to S-03) to judge the
   wedges by eye.
3. The readers one at a time, each with its properties' tests: exposure (P-18), the side struck and the second enemy
   (P-19, P-20), the threats and the drain (P-21 to P-23, P-25 to P-27), the fall-back removed (P-24); then the goldens
   regenerated once.

## State and versions

- **Save format:** `falling` and `fellBack` removed, no field added. The state version moves, and the ruleset's hash
  with the new numbers (and without `morale.fallback`).
- **Decision 0086** supersedes decision 0080's one-off retreat shock (0080's status: superseded in part by 0086): the
  back exposed, a pressure while it lasts. The unit model's § Facing and sectors and § Phases follow.
- **The goldens move,** all of them where fire, charges or morale run: regenerated in one commit with the reason,
  after the tests below pass. `tools/calibrate-charge.ts` and `tools/calibrate-fire.ts` (its fights included
  fall-backs, now removed) are run again and their outcomes recorded here.
- **The cost:** the faces table once a tick when asked; the cost tests (40 battalions) measured before and after, alone,
  not under load.

## Tests

The model's properties, each with its test (`docs/proposals/sectors-model.md`, § 9): P-1 to P-17 in
`test/sectors.test.ts` on sampled inputs; P-18 to P-27 in `test/fire.test.ts`, `test/charge.test.ts` and
`test/morale.test.ts` on the unit scenarios (A-01 to A-07, A-09, A-10, B-08, C-06, G-04, E-16) and the reversed
visiting order. The fall-back's tests in `test/morale.test.ts` go, with the save test's mid-fall-back case; one test
says a wavering battalion stands and fires. A-08 (skirmishers' flanks) waits for skirmish order (U5).

## The bench

Three cases on the bench field, judged by eye with a new Sectors layer on the overlay (each formation's face, and its
front, flank and rear wedges with the blend bands):
- **S-01 enfilade:** two lines at right angles, one firing into the other's flank.
- **S-02 the end of a line:** an enemy ahead of one end of a long line, then walked round to its flank.
- **S-03 across the front:** a march column crossing a line's front at 150 m.

## Docs

`docs/systems/fire-morale.md` (exposure, the back exposed, the fall-back removed), decision 0087,
`docs/systems/melee.md` (the side struck, the second enemy), `docs/systems/artillery.md` (canister's exposure),
`docs/systems/formations.md` (the face), `docs/proposals/unit-scenarios.md` (E-16), decision 0086, and the unit model's
§ Facing and sectors, § What changes from today and § Phases (A-08 to U5, E-16 to U1).

## Non-goals

- The morale bar and levels (U2): the drains and shocks are in today's 0..1 morale, rescaled with U2.
- The share of a company's front that bears at its arc's edge, and canister's exposure per formation in its cone (U3,
  with the rest of fire); changing front as a drill (U9, B-10); the firearm and melee modes (U3); skirmish order (U5).
- Sectors for vision (S2).

## Risks

- **The drain stacks with flank support's loss:** a turned flank both loses its support bonus and drains. Both are
  real; the first guesses are small, and the bench shows whether a line breaks too easily.
- **Exposure moves every firefight's balance:** the S1c calibration's line-on-line front is unchanged (factor 1), but
  its fall-backs are gone: `tools/calibrate-fire.ts` says whether its 6 to 10 minutes still hold.
- **The screen's cost:** `screenShare` walks the battalion's friends for each enemy tested; only enemies in its flank or
  rear sectors within reach are tested. The cost tests say whether it needs a cache.

## Results

Run on 2026-10-28, U1 against `epic/sim-engine` at f343c53f, alone on one machine.

- **`tools/calibrate-fire.ts`** (100 seeds): every target holds. The 100 m median time to break is 8.5 min (9.3
  before), the 100 m row without the fall-back as it was; 50 m 4.0 min (4.3); losses at the break 20% as before;
  the 3v3 brigade's first break 9.7 min (10.4).
- **`tools/calibrate-charge.ts`** (50 seeds): every target holds. A line charged in front breaks in 92% (90%), with
  contact in 66% (78%); a column breaks in 28% (12%); the flank and the
  square unchanged.
- **`tools/calibrate-artillery.ts`:** unchanged.
- **The S1e battle with no orders** went to you at 12:41 (side 1's at 19:13 before): your battery, turned 25°
  inwards on your line's eastern flank, took side 1's line in the flank, drained it, and broke two battalions by
  9:24 on every seed. The battery stands 50 m behind your line now (z −330, not −280): side 1 wins at 16:11 at the
  page's seed and in 15.6–16.4 min on seeds 1–6, the test's 15–22 again. Side 1 ends at about 86% in the fight (74%
  before), a one-sided battle with no orders; S1e-3c's playtest judges it. Between −310 and −320 the battle turns
  from yours to side 1's: the battery's flank fire decides it, not its range alone. Turning the battery less, or
  side 1's veterans and its regiment's charge, did not turn it.
- **The valley** (`m2-valley`) follows: side 1's at 15:51, and within 25 m of the battlefield's battle.
- **The cost:** minutes 5–8 of the S1e battle, 0.57 ms a tick (0.47 before, best of three); the 40-battalion cost
  tests pass alone.

## Review

- **Draft 1:** a face from the nearest company (a march column read sideways, gaps between pieces read as a flank),
  a charge's side from one company, a second enemy read in visiting order, a retreat that could not tell the player
  from the reactions.
- **Draft 2:** a face from the layout's extents (it cannot shorten as men are lost), a blend 5 m wide (a flank share
  at contact, a cliff at range), a retreat checked every tick (advances and late arrivals paid, a waypoint paid
  again), a drain kept apart from the morale (losses hidden from the fall-back, the bar disagreeing).
- **Draft 3:** faces from the men as they stand, once a tick; the blend as a ratio; the retreat decided once, when the
  command is applied; one morale, and the fall-back on losses. Its review: a face read before the move, a charger's
  span on the wrong axis, a turned column's face as wide as its trail, the fall-back firing on one casualty, and a
  retreat check that could be dodged (a Wheel, a shift-click, a change of shape first) or paid again on every re-issue.
- **Draft 4:** the faces in the fire step's geometry after the move; a threat's span on the target's frame;
  a trail shape's front and rear as wide as its head and tail; the fall-back on a share of recent losses; and, by the
  owner's rule (decision 0086), no retreat detected at all: the back exposed to an enemy that can hurt it, screened by
  friends and out of range, is a drain. Its review: fire's cover test looks for the shooter's friends, not the
  target's; the threats read mid-step; the fall-back's hold needed a counter; a column's turned blocks; forming square
  drained; an enemy facing away counted; the blend a cliff at contact and off-centre; a range unused; `tan`; 0080's
  status.
- **Draft 5** (this one): a screen test of its own; the threats found in one pass before the morale changes; `falling`
  kept as the losses' hold; a trail shape's edges from the column; forming square all front; the enemy's arc and a
  battery's three rays; the blend centred, with a floor in metres; every threat within 300 m; literal numbers; 0080
  superseded in part.
