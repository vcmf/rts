---
status: active
last_reviewed: 2026-10-08
---

# Plan: Movement over terrain (F1)

How fast a formation moves over slopes, water, rough ground, roads and narrow passes, including
when only part of it is on bad ground. Source: `docs/research/terrain-movement-speed-models.md`
(the lag model and its three fixes, §4; flows, §5; the generic mechanics and the Napoleonic ruleset,
§6). Era-generic by decision 0015: the engine holds the mechanics, an era ruleset holds the numbers.
Builds on `prototypes/formation-core.js` and `prototypes/formation-map.html` (F0, merged).

## Scope

- **Era ruleset as data:** `prototypes/ruleset-napoleonic.js` (plain script): base speeds per pace,
  the quick-step factor q per ground class, slope constant k, the terrain table g (per terrain and
  formation: line, column, skirmish), water curve and depth limit, the order presets (L_max, L_mean,
  τ), disorder constants. The core reads only the ruleset, never names an era.
- **Terrain classes on the map** (a 1 m class grid, baked once): open, road, crops, ploughed, rough
  (around rocks, rocky summits), open woods, dense woods (core of the wood), marsh, hedge strips (with
  a gap), water (depth from the stream: a knee-deep ford, deep elsewhere), a 4 m bridge.
- **Lag model in the formation layer (20 Hz), generic:**
  - 12 sample points per battalion: 3 lateral bins per company; each bin's g is the harmonic mean of
    the ground under its slots (so a column's depth counts), with slope along the direction of
    travel (Tobler, capped at drill pace) and water depth folded in;
  - q per bin from its worst ground class (open / light rough / hard);
  - V = min(V0, max-lag limit, mean-lag limit); lags renormalised to the leading point each tick;
    V ≥ 0; impassable ground (deep water) is enforced by one footprint gate (see Redesign);
  - three order presets: keep order, normal, push on;
  - disorder accrues from lag spread and recovers when dressed (shown, not yet used).
- **Soldiers:** each soldier's slot is set back by his bin's lag, so the line visibly bows around a
  wood and straightens; soldiers' own speed uses the same terrain table.
- **Map:** terrain drawn in the staff style (crop stipple, plough lines, marsh tufts, dense-wood wash,
  hedges, the bridge); a **Speed** overlay colouring the ground by g for a line; readout of lags and
  disorder; order presets in the panel; "Cross bridge" order.
- **Measurements** in `tools/formation-measure.js`: time lost when 1, 3, 6 and 12 of 12 points cross a
  10 m thicket (the research's table); halting at deep water; crossing the bridge; no regression of
  the existing checks.

Out of scope: queues of several units at one bridge (flow limit J; needs more than one battalion
moving through), cavalry and artillery rulesets, pathfinding around terrain, disorder's effect on
fire and morale.

## Acceptance

- The thicket test scales as the research's does: more time lost as more of the front is held up;
  the full front within 20% of the strip's own physical delay; one file costs at most 1.5 s with the
  research's tolerances; looser tolerances never cost more; the mean lag never passes Lmean and no
  file passes Lmax. (Revised after review round 1: the research's own figures came from an
  approximation; see Results.)
- A line ordered across the stream away from the ford stops at the bank, without any man's place in
  deep water on the way; a march column stopped there stays a column; a wheel stops short of the
  water; a shape that would stand in it is refused. Through the ford it slows; over the bridge it
  narrows to a march column and re-forms.
- Depth-ordered shapes (columns, the square) never walk through their own companies.
- With the Speed overlay on, slow ground and the line's bulge around it are visible.
- All existing formation checks still pass; `node tools/check-docs.mjs` passes.

## Results (headless, `tools/formation-measure.js`, after the redesign)

Run with `SHOT_TIMEOUT_S=1200` (the run takes several minutes; `tools/shot.mjs` waits 60 s per call by default).

- **Partial bad ground** (a line marches 60 m; a strip of woods exactly 10 m deep, g = 0.55, q = 1,
  covers the files of n of its 12 sample points; time lost against the same march without it):

  | Tolerances | 1/12 | 3/12 | 6/12 | 12/12 |
  |---|---|---|---|---|
  | Research's (Lmax 10 m, Lmean 2 m) | 0 s | 0.5 s | 4.6 s | 9.0 s |
  | Normal (4 m, 1.5 m) | 4.6 s | 4.7 s | 5.7 s | 9.0 s |
  | Keep order (1.5 m, 0.5 m) | 7.4 s | 7.5 s | 7.9 s | 9.0 s |

  The full front cannot avoid the strip: 10 m at 0.495 m/s against 10 m at 0.9 m/s is 9.1 s, and the
  model gives 9.0 s. Part of the front costs less; one file almost nothing with wide tolerances, and
  nearly the whole strip with "keep order" (the slowest file sets the pace, as drilled). Counting
  until every file is back in its place, the research's tolerances cost 0.5 / 0.7 / 4.6 / 9.0 s
  (the files left behind re-dress after arrival); the other rows do not change. Through every run
  the mean lag stays at or under Lmean and no file passes Lmax.
  **Departure from the research:** its table (0.5 / 2.2 / 6.3 / 10.5 s) came from an approximation of
  the mean-lag limit that ignores files already catching up, which over-slows the battalion. The
  engine solves the limit exactly (`n·V − Σ min(cap, V + l/τ) ≤ n (Lmean − l̄)/τ`, one pass over the
  sorted breakpoints), so with 3 of 12 points held the mean lag sits at Lmean and costs 0.5 s.
- **Impassable ground** (no man's place ever on it; sampled every 0.25–0.5 s, men checked at the end):
  - deep water crossed obliquely and along the whole front: "halted: impassable ground", 0 places
    on the way, 0 men;
  - a march column halted there keeps its companies 6.85 m apart along its trail, all facing on;
  - a wheel toward the stream turns 0.33 rad and stops short of it;
  - a line at the bank: a square is refused ("cannot form: impassable ground"), 12 m back it is
    accepted; column then square 5 s later: the square is refused, 0 places in the water;
  - the same line ordered north (a turn in place): halted, 0 places; a march column turning toward
    the stream 8, 9 and 10 m from it: halted, 0 places, 0 men;
  - a 4 m deep strip across part of the front, push order (Lmax 12 m): halted, nobody crosses;
  - thinned lines (41, 50, 59 losses) at the bank ordered into column over a grid of positions and
    headings: 15 accepted, 27 refused, 0 places in the water (empty slots are checked too); a line
    whose two emptied files stand over the stream is refused column (the men would spread into them);
  - a unit halted at the water and ordered on at 30°, 60°, 90°, 120°, 180° or −90° (line and march column):
    every order ends within 60 s (halted or arrived), no heading flip, 0 places in the water;
  - Face about, then a move: line and column both reach a target 58 m back; Retire 30 m: the line
    steps back 29.6 m in order and faces the front again;
  - Face about keeps the place of every man in a complete file, in line, column, square and march
    column (0 m), also when a file is held back by the water (its lag is kept); men in short files step
    up at most two ranks or close in a few files (1.82 m at most after 10 losses); no rank hole, none
    carried into line; refused ("cannot face about: impassable ground") when closing a file would put
    a man over the water; a Retire cut short by the water still ends facing the front;
  - ground a line cannot enter (a test ruleset with hedges g = 0 for a line): halted, 0 places on it;
    a column standing across that hedge is refused line;
  - places are checked both now and as the soldiers aim for them (0.6 s ahead);
  - the same run twice gives the same state, bit for bit.
  - the ford is crossed and the battalion ends in line on the far bank.
- **Casualties:** a bin emptied by casualties takes no part in the limits; a line wholly in woods
  then keeps every file in place (lag 0, disorder 0; it was 1.6 m and 0.6 before).
- **Bridge:** the deck is level for a column (g = 1 along it); narrow, cross the 4 m bridge, deploy
  32 m beyond (the column's rear off the bridge: deploying with it on the deck would wheel companies
  over the water, and the gate refuses that): 202.5 s, mostly the two formation changes.
- **Accordion**, from the shape's geometry (a bin wholly behind another, with men less than 0.6 m
  apart across the line of travel, stays at least 0.6 m behind it): a march column whose head is
  held up at a hedge bunches from 1.65 m to 0.6 m between companies, never closer; the same column
  turned 90° on push keeps 0.6 m between companies (0.03 m before) and 0.51 m between men of one
  company (0.65 m at rest; 0.21 m before the turn radius, which aims at 0.52 m: the trail's 0.25 m
  points cost about a centimetre); a march column ordered inside its turning circle ends the order
  ("arrived: as near as the column can turn") and refuses to wheel; a square pushing into the wood keeps
  0.68 m between faces (0.98 m at rest; 0.13 m before round 2).
- **Earlier checks** still pass; the march column's turn: 0.52 m worst distance from slot (it was 1.24 m:
  the column no longer turns in place).
- **Negative runs:** the round-0 code fails deep water along the whole front (stuck, men in the
  water), the bridge deck (g = 0.06) and the accordion (0.00 m). With the round-2 fixes disabled
  (look-ahead, trail trim, wheel check, empty bins, accordion) the checks fail on each: 36 and 27
  places in deep water on the way, the column folded (2.72 m gap, head facing 0), the wheel 63 places
  in the water, the emptied bin 1.64 m lag and 0.72 disorder, the column 0.00 m, the square 0.13 m.
- **Negative run of the redesign** (gate, change-path check, soldier guard and turn-radius cap
  disabled): fails the wheel (63 places in the water), the square at the bank (accepted), the change
  during a change (50 places, 37 men), the turn at the bank (48 places, 40 men) and men in the water
  after halts (1 man each). Not caught by it: the narrow strip (held by the lag model and the halt's
  step back, not the gate) and the turn-radius cap (centring the ranks already keeps the bend at
  0.6 m; the cap is a margin).
- **Negative run after review round 1 of the redesign** (empty slots unchecked, no turn radius, no
  target fall-back, one impassable grid for every kind): thinned lines put 2 places in the water, the
  bend folds to 0.16 m within a company, the hedge test 36 places on it, soldier targets 3, 2, 3, 2
  and 18 in the water.
- **Negative run after review round 2 of the redesign** (no countermarch, no retiring, every wet slot
  exempt, no turning-circle arrival, wheels allowed in column): the line and the column stay stuck at
  the bank (58.4 and 56.9 m from the target), the column circles its target, a wheeled column folds to
  0.46 m, the thinned line forms column with 3 places in the water.
- **Negative run of redesign 2** (no turning-circle halt, no file closing after Face about, anchor not
  moved on Face about): the column's order never ends; 15 rank holes after Face about and in line;
  the line cannot leave the bank (58.4 m short) and Retire is refused.
- **Cost, 40 battalions** (all four formations, 9 march columns moving): simulation 2.2 ms per frame
  (1.7–1.8 ms before the gate; budget 4 ms, checked), drawing 0.9 ms.

## Review round 1

10 findings, 3 severe → another round.

| # | Sev. | Finding | Fix |
|---|---|---|---|
| 1 | severe | Whole front at deep water: stuck for ever (the halt test watched V, not the anchor) | Halt when the anchor stops advancing; then dress back from the edge |
| 2 | severe | Lagging files read the ground at their slot, not where their men stand | Ground sampled at slot − lag along the direction of travel |
| 3 | severe | Bridge deck took the stream valley's slope | Deck cells are level |
| 4 | moderate | Lag offsets and bins followed company facing (a moving square's rear face drawn inside it) | Offsets along the direction of travel; bins across it |
| 5 | moderate | Columns walked through their own companies | Accordion: a company's lag ≥ the lag of the one ahead minus the room between them (ruleset data; replaced by geometry in round 2) |
| 6 | moderate | Lags and disorder never recovered at impassable ground; frozen in wheels; stale through changes | Settle during wheels and changes, skip blocked bins, reset lags when a change starts |
| 7 | moderate | Checks did not test the claims; no negative tests | Exact strip, bin-aligned shares, 0.1 s steps, whole-front water, men-in-water, level deck, accordion; negative run above |
| 8 | moderate | The core named paces and formations; route step on all ground; q not per pace | Formations, paces, road pace, q per pace and the accordion in the ruleset; route step only on roads |
| 9 | light | Mean-lag limit approximated in three passes | Exact one-pass solve |
| 10 | light | `Math.exp` and allocations per sample | Slope table; preallocated arrays |

## Review round 2

10 findings, 1 severe → round 3 (the last before a redesign).

| # | Sev. | Finding | Fix |
|---|---|---|---|
| 1 | severe | A march column halted at deep water folded on itself (head stepped back, trail did not) | The trail ahead of the head is dropped as it steps back; check: gaps and facings after the halt |
| 2 | moderate | A bin emptied by casualties pinned the renormalisation and the mean: a line wholly in woods drifted out of order | Empty bins take no part in the limits, the renormalisation, the accordion or disorder |
| 3 | moderate | Men's places entered deep water during the approach; only the end state was checked | A bin is held when any man has impassable ground 0.5 m ahead; places checked every 0.5 s on the way |
| 4 | moderate | Wheels and shape changes ignored impassable ground; settling used stale ground | A wheel stops short; a shape that would stand on it is refused; settling resamples the ground |
| 5 | moderate | No accordion for the square; the accordion was a chain only | Accordion pairs from the shape's geometry for every shape; the ruleset's ahead/room removed |
| 6 | moderate | Checks did not assert the exact solve, the orderings or that the accordion engaged; Acceptance stale | Lmean/Lmax asserted every step, tolerances ordered, keep-order bound, accordion against rest, Acceptance revised |
| 7 | light | Time lost ignored the re-dress after arrival | Both reported (arrived, dressed); halted files walk to their places at their ground's pace |
| 8 | light | The accordion acts after the solve, so it can push a lag past Lmean or Lmax for a tick | Not fixed: within 0.01 m in every check; folding it into the solve waits for a measured need |
| 9 | light | The core named 'march' and 'open' | Trail shapes are ruleset data (`trail`); empty bins need no q; turning half-width from the layout |
| 10 | light | Route step chosen by the head alone | Route step only while every company is on a road |

## Review round 3

10 findings, 2 severe. Third round with severe findings: stop and redesign (the review count restarts).

| # | Sev. | Finding |
|---|---|---|
| 1 | severe | Turning in place inside a move order is never checked: a line at the bank turning north puts 49 slots in deep water, and dressBack (backing along the heading) cannot get them out |
| 2 | severe | A shape order during a change skips the refusal; the path of a change (wheeling about a flank) is never checked |
| 3 | moderate | The accordion uses the straight layout; in a march column's bend companies come within 0.02 m |
| 4 | moderate | The halt waits for a held bin to reach Lmax; impassable ground narrower than Lmax lets the slots cross and the men follow |
| 5 | moderate | No checks for the ford, turning near water, orders during a change, the bend, wheel progress, a dry square accepted |
| 6 | light | Accordion overlap test on a floating-point boundary for diagonal pairs |
| 7 | light | Halted files close without q; idle battalions resample for nothing |
| 8 | light | Readout mean lag counts empty bins; binN is a flag, not a count |
| 9 | light | Core still names 'normal', 'march', 'line' (default style, bridge and ford orders, rebalance, closeRanks) |
| 10 | light | Road pace from one point per company flickers at road edges |

## Redesign (after round 3; the review count restarts)

Every severe finding since round 1 is the same rule (no man on impassable ground) enforced separately,
after the fact, in each kind of motion: advance, turn, wheel, change, halt. The redesign enforces it
once, before the fact:

- **One footprint gate** (`gate`, `wetBins`): every change of pose (the turn and the advance of a
  move, a wheel step) is tried through one function that checks the men's places (slot − lag) of the
  next pose. A step that would put a place on impassable ground is cut back by halving (6 halvings,
  deterministic); a turn or wheel that cannot proceed halts the order. Far from impassable ground
  (a distance grid baked with the terrain) the check is one lookup. `dressBack` and the 0.5 m
  look-ahead are gone; a man's ground is sampled one step ahead.
- **Per-bin holding in the advance:** a bin whose places would enter is held where it stands (its lag
  grows by the step); on halt the anchor steps back by the largest held lag, so the slots come back
  to where the held men stand and nothing crosses narrow ground.
- **Changes checked along their path** (`changeWet`: 128 poses of the transition, its end included),
  when ordered and at every interrupt.
- **Trail shapes man by man:** every man of a march column stands on the trail at his own distance
  behind the head (his place in the straight layout plus his lag), across it by his rank's offset;
  the ranks are centred on the trail. The head turns only as it advances, on a radius that keeps men
  one file apart at least 0.52 m apart on the inside of the bend (4.25 m for this column). The
  accordion's straight-layout pairs then hold in bends. A target inside its turning circle halts it
  ("halted: target inside the turning circle"); a target behind it is reached by looping on its
  radius; it does not wheel.
- **No automatic manoeuvres (redesign 2):** a move that cannot proceed halts with a status. The player
  has two drill orders, checked by the gate: *Face about* and *Retire N m* (below).
- **Soldiers** (the cosmetic layer) never step onto impassable ground either.
- **Era names out of the core:** start shape and order preset, the passage shapes (narrow, deploy) and
  `closeAcross` (which shape closes across company boundaries) are ruleset data. The shape geometry
  (`SHAPES`) and change times (`CHANGE_TIME`) are still in the core: to move into the ruleset with the
  S-phase shape system.
- **Smaller round-3 items:** pair tolerance in metres (men closer than 0.6 m across travel); halted
  files close at the quick step and idle battalions with no lag skip the work; the readout's mean lag
  counts live bins; binN counts men; route step only while every man stands on a road.
- **Checks** for each round-3 finding; negative run above.

## Review round 1 after the redesign

10 findings, 1 severe → another round.

| # | Sev. | Finding | Fix |
|---|---|---|---|
| 1 | severe | A change was checked against the slot table before casualties were spread into empty slots | The change check covers every slot, empty ones too, for the new shape's kind; thinned-line grid check |
| 2 | moderate | A march column turning 1 rad or more turned in place: inner rank folded to 0.21 m | Trail shapes turn only as the head advances, radius from the layout (inner men ≥ 0.52 m); within-company check |
| 3 | moderate | Soldier targets 0.6 s ahead went past the edge while the places did not | Lags extrapolated with their rate; a target on impassable ground falls back to the place now; targets checked |
| 4 | moderate | Ground impassable for one formation kind only was not gated | Impassable grids per kind; test ruleset check |
| 5 | moderate | The cost run had no march columns | All formations in the cost run (9 march columns moving) |
| 6 | moderate | Claims untested: radius cap, narrow strip, targets, determinism | Within-company, targets, replay checks; negative run above. The narrow strip is held by the lag model and the halt's step back: the gate is its second line |
| 7 | light | The change check was skipped whenever any bin was already on impassable ground | Per slot: a slot already on it may stay, every other must stay off |
| 8 | light | Places worked out several times a tick (road pace, sampling, gate tries) | Road pace from the last sampling; one trail walker with a cache. Gate tries still rebuild the places (measured cost above) |
| 9 | light | Two trail walkers that disagreed at the trail's end | `trailAt` uses the arc table and `trailPoint` |
| 10 | light | Half-width assumed a three-rank layout; paired 1.2 factors | Half-width from the layout once (`binsOf`); turn radius from it |

Known and left: closing ranks after casualties (`closeRanks`) moves men sideways without the gate; at a
bank parallel to the line a closed file could stand on impassable ground. To fold into the gate with
the casualty system (S-phase).

## Review round 2 after the redesign

10 findings, 2 severe → round 3 (the last before another redesign).

| # | Sev. | Finding | Fix |
|---|---|---|---|
| 1 | severe | A unit halted at the water could not leave: a line could not turn, a column could not advance | A line retires its half-width to turn; a column countermarches; leave-the-bank checks |
| 2 | severe | Round-1 #1 back: empty slots already over the water were exempt, then filled | Only a slot whose man already stands there is exempt; check with both emptied files over the stream |
| 3 | moderate | A march column ordered inside its turning circle circled for ever | The order ends with "arrived: as near as the column can turn" |
| 4 | moderate | A wheel on a march column folded its head company | Trail shapes refuse wheels |
| 5 | moderate | Checks missing for the above; bend threshold looser than the claim | Checks added; the claim states 0.51 m measured against the 0.52 m aim |
| 6 | light | During a change the guards used the old shape's kind; exemptions crossed kinds | The new shape's kind during a change (`kindOf`); the change check per the new kind |
| 7 | light | Road flag kept across changes and steps back | Reset when a change starts, on a step back and a countermarch |
| 8 | light | Transcendental functions in the 20 Hz layer (decision 0006) | Recorded in `docs/known-issues.md`: the S0 sim spine replaces them |
| 9 | light | The trail arc built twice; allocations in the hot path | Not changed: measured cost within budget; to go with the S0 rewrite |
| 10 | light | Run instructions disagreed on the timeout; stale plan figures | 1200 s everywhere; figures updated |

## Review round 3 after the redesign

10 findings, 2 severe. Third round in a row with severe findings: stop and redesign (proposal below).

| # | Sev. | Finding |
|---|---|---|
| 1 | severe | Countermarch flip-flops every tick for a target behind the head within the column's length |
| 2 | severe | A column halted at the water still cannot leave for targets 60–110° off its heading (only targets behind work) |
| 3 | moderate | The countermarch mirror (rank r → 2 − r) leaves front-rank holes that persist into line |
| 4 | moderate | The countermarch's gate check compares bins under old and new labels |
| 5 | moderate | `changeWet` exempts an occupied wet slot at every pose, decided before `rebalance` moves men |
| 6 | moderate | Checks miss 1–3; several assertions pass in states they should reject |
| 7 | moderate | The retire moves at full pace, outside terrain speed and the lag model |
| 8 | light | Retire starts only when a turn cannot move at all; its budget can exceed three half-widths |
| 9 | light | Retire always goes straight back, even when the ground behind blocks the turn |
| 10 | light | A refused countermarch is retried every tick at full cost |

## Redesign 2 (after round 3 of the redesign; the review count restarts)

The gate holds: since the redesign, no review found a man's place on impassable ground through
ordinary motion. The severe findings of the last two rounds are all about getting a blocked unit
moving again (stuck at the bank, countermarch flip-flops), and each fix was another automatic
controller (retire, countermarch, turning-circle arrival) added to the move order. That is manoeuvre
planning, the pathfinding phase's job, done piecemeal inside this PR.

- **This PR stops at the rule:** a move that cannot proceed halts with a clear status; it never
  oscillates and never leaves anyone on impassable ground. No automatic retire or countermarch.
- **Two explicit, gated drill orders** for the player instead (panel buttons "Face about" and
  "Retire 30 m"):
  - *Face about* (`faceAbout`): every man keeps his place. Company, file and rank are relabelled by
    the shape's half-turn symmetry: a slot maps to the slot at its point reflection through the
    layout's centre. A straight shape's anchor moves to match and its heading turns by π; a column's
    trail is rebuilt from its old tail (a countermarch). Then each file closes toward its new front
    rank. The whole result goes through the gate once; refused if anyone would stand on impassable
    ground. The battalion then stands 3 s.
  - *Retire N m*: face about, march N m (an ordinary move, so terrain speed and the lag model apply),
    halt and dress, face about again. A halt on the way keeps the last two steps (orders marked
    `finish`), so the battalion always ends facing the front.
  - Face about keeps lags: the anchor steps back by the largest lag and each file's new lag is that
    lag less its old one, so no man moves; bins are mapped through the half-turn for the gate.
- **Change check simplified:** no exemptions. A change is refused if any slot, filled or empty, would
  be on impassable ground at any sampled pose, before or after `rebalance`. A unit already standing on
  such ground (only possible through scenario setup) must first move off it.
- **Manoeuvre planning** (choosing retire, wheel, countermarch or a path around water automatically)
  moves to the pathfinding phase, with its own plan.
- **Checks:** the halt is final and stable (no oscillation over 60 s for any target angle at the bank);
  Retire and Face about each with a negative run; rank packing after Face about.

## Review round 1 after redesign 2

10 findings, none severe → stop (fix what is worth fixing).

| # | Sev. | Finding | Fix |
|---|---|---|---|
| 1 | moderate | Face about dropped every lag: refused with a file held at the water | Lags kept (anchor back by the largest lag; new lag = that less the old); check with a held file |
| 2 | moderate | The gate compared bins under old and new labels | `before` mapped through the half-turn's bin map |
| 3 | moderate | A halt during Retire dropped the final Face about | Drill-finishing orders survive a halt; Retire also dresses before facing the front; check |
| 4 | moderate | Refusals, other shapes and other angles untested | Checks for refusal, every shape, a held file, a cut-short Retire, angles 30° and −90°; negative run |
| 5 | light | Mirrored files left companies off-centre for `closeRanks` | `closeRanks` runs inside Face about, under the same gate check |
| 6 | light | Every refusal said "impassable ground" | The reason is given (no half-turn symmetry, changing shape, off-centre trail, impassable ground) |
| 7 | light | The turning-circle halt dropped the rest of a multi-step order | That move ends ("arrived: as near as the column can turn") and the next order goes on |
| 8 | light | `blockedFor` carried over between orders | Reset on a new order and when Face about starts |
| 9 | light | Unused variables; moved men's distance unchecked | Distance limit checked; variables gone |
| 10 | light | Rank closing and pose save/restore written three and two times | Not changed: to fold into the S-phase casualty system |

**Negative run of round 1 after redesign 2** (lags dropped, every order dropped on a halt, no dress):
the held file moves 1.11 m and the cut-short Retire ends facing the rear. Without the dress step alone
the Retire still measures 29.6 m (it matters only with the lag-keeping anchor step).

