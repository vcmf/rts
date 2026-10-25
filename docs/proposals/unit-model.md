---
status: draft
last_reviewed: 2026-10-25
---

# Proposal: the unit model

This proposal is the design model for the sim's units. It covers:
- what a unit is and which categories exist;
- the formations each category takes, and which way a unit faces;
- the states a unit can be in, and what each state allows;
- experience;
- how units fire, charge, close with the enemy, take losses and break;
- how they move, collide and find their way.

It is the heart of the game's logic from here on, so it is written before the formulas. The situations it must get
right are in `docs/proposals/unit-scenarios.md`, cited here by id (A-02, F-01, and so on). Where this document gives
a formula, it is the formula's shape: which terms multiply which. Its numbers are first guesses for tuning.

It builds on what the sim does today:
- `docs/systems/formations.md`: shapes, changes, the lag model, the footprint gate;
- `docs/systems/fire-morale.md`: musketry, morale, routs and rallies;
- `docs/systems/melee.md`: charges, melee, the square;
- `docs/systems/artillery.md`: roundshot and canister;
- `docs/proposals/sim-design.md`: the overall design, especially §5–§13.

The ground data comes from Track M (its map engine proposal, on the `epic/map-engine` branch of PR #49). § What changes from today lists what
is new.

## Context and goals / non-goals

The sim has the systems of a Napoleonic battle, but each was built for its own phase, and their rules do not yet
meet:
- the side a unit is struck from matters for charges only;
- quality moves morale only;
- every infantry battalion is the same battalion;
- formations pass through each other;
- nothing finds a path.

**The model in brief:** a unit has a category. Its category gives its shapes, and its shapes give its faces. The
unit's faces decide how it gives and takes fire and charges by sector. Its experience scales how well it does all
of it.

**Goals:**
- **One set of rules:** facing, sectors and experience apply the same way to fire, charges, the assault, artillery
  and morale.
- **Combined arms comes from the rules:** cavalry forces squares, guns punish squares and columns, the line wins the
  firefight. These follow from geometry and sectors, with a small table of named bonuses only where geometry does
  not explain the result (§ Counters and bonuses).
- **Experience is a real edge, not a multiplier on everything:** veterans reload faster, aim better, form faster,
  close nearer and break later. Recruits waste their fire and stall under it.
- **Every scenario in `docs/proposals/unit-scenarios.md`** has an answer in the model.
- **Era-generic (decision 0015):** the engine knows shapes, faces, sectors, tags and levels. The Napoleonic ruleset
  names line infantry, hussars and the square.
- **Today's calibrations still hold:** a formation with no level set plays exactly as today, so the fire
  calibration (lines of quality 0.8 and 0.65 at 100 m: the weaker breaks in 6–10 minutes) and the S1e battle keep
  their results (§ Experience, *Today's numbers*).

**Non-goals:**
- command and control: commanders, rally radius and succession (S2, `docs/proposals/sim-design.md` §6);
- vision and fog of war: their own design, ahead of S2 by decision 0061 (on `epic/map-engine`);
- the enemy AI (`docs/proposals/ai.md`);
- campaigns: experience carried between battles, and replacements;
- individual soldiers in the sim: the battalion stays the unit (decisions 0007 and 0018).

## Terms

| Term | Meaning | Engine or ruleset |
|---|---|---|
| **Formation** | The unit as the sim holds it: a battalion, a regiment, a battery | engine |
| **Unit type** | A formation's kind of unit: its block, shapes, paces, abilities and numbers (`UnitType`) | ruleset data on an engine structure |
| **Category** | A family of types with the same shapes and role (line infantry, light cavalry) | ruleset: a type's **tags** |
| **Tag** | A label on a type that rules can key on (`foot`, `horse`, `guns`, `light`, `heavy`, `lancer`, `elite`) | the engine keys on tags; the ruleset names them |
| **Shape** | A formation's arrangement: line, column of attack, march column, square, skirmish order, limbered, unlimbered | engine structure, ruleset content |
| **Face** | A side of a shape that can fire and meet a charge as a front: a line has one, a square four | engine |
| **Sector** | Where a threat is in a face's frame: front, flank or rear | engine |
| **Level** | A formation's experience, 0 to 4 | engine; the ruleset's tables give its effects |
| **In the fight** | Alive and not routing, rallying or shattered (as today) | engine |

## Unit categories

The Napoleonic ruleset's categories. Each is one or more unit types; nations vary a type's numbers (for example
two ranks for the British line) later.

| Category | Tags | Shapes | Abilities | Role | Weak against |
|---|---|---|---|---|---|
| **Line infantry** | `foot` | line (3 ranks), column of attack, march column, square | fires; the assault; square against cavalry | holds ground; wins firefights in line; assaults in column | guns (in column or square); cavalry when caught in line or forming; enfilade |
| **Light infantry** | `foot`, `light` | as line infantry, plus skirmish order | as line infantry, plus fire on the move in skirmish order, little disorder in woods and villages, better cover | screens; harasses lines and batteries; holds woods and villages | cavalry in the open when in skirmish order |
| **Elite infantry** (grenadiers, the Guard) | `foot`, `elite` | as line infantry | as line infantry; a stronger assault; starts at level 3–4 | the decisive assault; the last reserve | the same as line infantry, less so |
| **Heavy cavalry** (cuirassiers, carabiniers; dragoons between) | `horse`, `heavy` | line, column of squadrons, march column | the charge, with strong impact and melee; armour | breaks lines and cavalry; the shock arm | squares; canister; tires fast; pursues poorly |
| **Light cavalry** (hussars, chasseurs, lancers) | `horse`, `light`; `lancer` for lancers | line, column of squadrons, march column; skirmish order (vedettes, later) | the charge, weaker impact; fast; long pursuit that it controls; sees far (S2) | pursuit; screening; skirmishers and guns in the open | heavy cavalry in melee; squares |
| **Foot artillery** | `guns` | unlimbered, limbered | roundshot and canister | punishes columns and squares at range; canister at close range | its flanks; skirmishers; cavalry from the flank |
| **Horse artillery** | `guns`, `horse` | unlimbered, limbered | as foot artillery, lighter pieces, much faster to limber and move | follows cavalry; quick fire support | the same as foot artillery |

**Detached skirmishers:** a line battalion's light company deployed as a skirmish screen. Later, after light
infantry: it splits a formation into two, which the engine cannot do yet.

**Not yet:** dragoons fighting on foot, rocket troops, pontoniers, the train.

## Formations (shapes)

What each shape gives. Times are at level 2 (today's numbers). Exposure and threat are covered under § Facing and
sectors.

| Shape | Faces | Fire | Charges | Moves | Notes |
|---|---|---|---|---|---|
| **Line** (infantry, 3 ranks) | 1 (front) | full front; the third rank does not fire (`firingRanks` 2) | can be charged in front, flank and rear; the assault from it is weak | ordinary pace; obliques within about 30°; slow in rough ground | the firefight shape; a 93 m front |
| **Column of attack** (column of divisions) | 1 (front: the head division) | the head division only | the assault's shape: weight and momentum; half-braced only while forming square | ordinary pace; turns more freely than a line; passes gaps | a dense target for guns |
| **March column** (column of route) | 1 (front: the head) | none | caught on the march: struck as in the flank from any side but its head | route step; fastest on roads; follows its head's trail | the moving shape; never fights from it |
| **Square** | 4 (every side is a front) | one face per target, two at a corner | braced: turns cavalry away | does not move (later: very slowly) | proof against cavalry; a dense target for guns and muskets |
| **Skirmish order** (light infantry) | all-round, loose | fires on the move, every man for himself; fewer rounds, better aimed | not braced: cavalry cuts it down | quick in rough ground; passes through friends | a spread target: musketry and canister do little |
| **Cavalry line** (2 ranks) | 1 | none (pistols and carbines later) | charges from it | walk, trot, gallop | the charge shape |
| **Column of squadrons** | 1 | none | charges from it, with less front | as the line, turns more freely | |
| **Cavalry march column** (by fours) | 1 | none | cannot charge; caught: as the infantry's march column | the trot; roads | |
| **Unlimbered** (guns) | 1 (the pieces' arc) | roundshot, canister | struck as a battery (§ Artillery) | by hand, very slowly | the firing shape |
| **Limbered** (guns) | 1 | none | helpless | gun walk (foot), trot (horse) | the moving shape |

**Changes** are timed and partial, as today (`docs/systems/formations.md`):
- changing shape stops fire;
- a change caught by cavalry is struck as in the flank, at its partial bracing (B-05, E-05);
- experience scales the times (§ Experience);
- a change while under fire takes longer and costs cohesion (§ A unit's state).

## Facing and sectors

### A formation's facing

Every formation has a heading, which is the way its men face. A shape's faces are its fronts:
- a line, a column or a battery has one face, along its heading;
- a square has four;
- skirmish order has none: it has no flanks to turn, and is treated as all front at its own small exposure.

Men face their face's front, so a square's men look outward on all four sides. This is already the soldier
layer's rule.

### The sector of a threat

A threat is an enemy formation that fires on this one, charges it, or stands where it could. Its sector is
**front, flank or rear**, read in the frame of the face nearest to it:
- **From the face's nearest end, not its centre.** Take the threat's nearest point to the face. Measure how far
  that point lies ahead of the face's front edge, and how far it lies beyond the edge's nearer end. A long line's
  front reaches out past 45° from its centre, so an enemy ahead of one end is in front (A-04). Today's charge rule
  measures from the centre, which a 93 m line exaggerates.
- **The front:** ahead of the front edge and within 45° of straight ahead, measured from the edge's nearer end.
- **The rear:** behind the rear edge and within 45° of straight back, measured the same way.
- **A flank:** everywhere else.
- **No cliff at the borders (A-05).** Within a margin of the 45° borders (about 10° each side), the sector's
  effect is a blend of the two sectors by angle. A threat moved a metre changes the effect by a little.
- **Exact arithmetic (decision 0006):** the test and the blend use comparisons and ratios of the two distances, not
  `atan`.
- **The battery:** its face is its line of pieces; its arc decides what it can hit, and its sectors decide how it is
  struck.

### Where the sector counts

The same sector reading is used everywhere it matters:

| Where | Front | Flank | Rear |
|---|---|---|---|
| **Fire taken** (exposure, × hits) | 1 | enfilade: more (a line about 1.8×, a column about 1.2×) | a little more (about 1.1–1.2×) |
| **Fire given** | the face fires | the face cannot fire: it must change front | it must Face about (3 s) |
| **A charge's threat and impact** (today's `melee.threat`, `melee.impact.shock`) | 0.12 / 0.2 | 0.25 / 0.35 | 0.3 / 0.4 |
| **Morale pressure while the threat stands** (new) | none | a pressure | a larger pressure |

A square, all faces, is always struck in front (A-06). A march column is struck as in the flank from every sector but
its head. A formation changing shape has no face: it is struck as in the flank, as today.

### Exposure by shape

A shape's exposure is how many hits a given amount of fire does to it: the shape's base, times its sector's factor.
It replaces today's depth factor by kind (`fire.depth`), whose values become the bases. First guesses:

| Shape | Base | Front | Flank | Rear | Why |
|---|---|---|---|---|---|
| Line | 1.0 | 1 | 1.8 | 1.2 | enfiladed, a shot that misses one file finds the next |
| Column of attack | 1.6 | 1 | 1.2 | 1.1 | deep from every side; its flank is a little longer than its front |
| March column | 1.2 | 1 | 1.5 | 1 | long and thin: end-on from front or rear, broadside from a flank |
| Square | 1.6 | 1 | | | dense, every side a front |
| Skirmish order | 0.5 | 1 | | | spread, no flank |
| Cavalry (any shape) | 1.3 | 1 | 1.2 | 1.1 | large targets |
| Guns | 0.4 | 1 | 1.5 | 1 | the detachment spread round the piece, its flank along the line of pieces |

A sector's factor is never below the front's, so fire from a flank or the rear never does less than from the front
(A-07).

Roundshot needs no exposure table: the ball's line through the blocks gives it (`docs/systems/artillery.md`).
Canister uses exposure as musketry does.

## A unit's state

### What a formation holds

| Value | What it is | Today |
|---|---|---|
| **Strength** (men, per company) | The unit's health: men fall, nobody is wounded by halves. A battalion has 400 | yes |
| **Morale** (0..1) and its state | The will to stay: steady, shaken, wavering, routing, rallying, shattered | yes |
| **Cohesion** (disorder 0..1) | Order in the ranks: grows with rough ground, lag, passing friends, changing under fire; falls when halted and dressed | yes (disorder) |
| **Experience** (points, and the level they give) | § Experience | quality only |
| **Fatigue** (0..1) | Grows with fast paces, slopes, melee; recovers at the halt | later |
| **Ammunition** | Rounds per man; resupply | later |

**Health is strength.** A unit does not have hit points apart from its men. "Tougher" units do not have more
health; they break later, so they keep fighting while they lose men (§ Experience). Open questions has the
alternative.

### Engagement

How close a formation is to the fight. It is derived each tick from the positions and orders, not stored where it
can be derived:

| State | When | What it allows |
|---|---|---|
| **Free** | No enemy in the fight within threat range (about 300 m, the canister range) | anything |
| **Threatened** | An enemy within threat range; noted with its sector | anything; flank and rear threats press on morale |
| **Under fire** | Lost men to fire in the last few seconds | changes take longer (about 1.3×) and cost cohesion (B-03) |
| **Closing** | Moving, under an order, toward an enemy within threat range | the nerve test (§ Closing with the enemy); its flank and rear sectors exposed as it goes (A-10, F-05) |
| **In contact** (melee) | `foe` set, as today | no change of shape, no fire, no player's orders (B-04) |
| **Pursuing**, **recoiling**, **blown** (cavalry) | as today | blown: cannot charge (E-10) |
| **Sheltering** (square against cavalry) | as today | stands; keeps its orders for after |

The morale states overlay these: a routing formation is out of the fight, whatever its engagement.

**On "cannot change formation when engaged":** a formation in contact cannot change shape. Under fire it can, at a
cost. A hard ban under fire would leave a line with no answer to cavalry once the firefight starts, and the square
against cavalry under fire is the period's central dilemma (L-01).

**Facing away from a threat is punished by the rules, not by a special penalty:**
- a threat in the flank or rear sector strikes harder (the sector tables);
- it presses on morale while it stands;
- the formation's own fire cannot answer it until it turns;
- turning costs time (Face about 3 s; a change front tens of seconds).

A battalion that marches across an enemy's front, or turns its back to retire under fire, pays all four (A-10,
F-06).

## Experience

### Levels

Five levels. Level 2 sets every effect to today's numbers.

| Level | Name (Napoleonic) | Typical |
|---|---|---|
| 0 | Recruits | conscripts of 1813, militia, landwehr |
| 1 | Trained | a new line battalion |
| 2 | Line | the average battalion (today's `quality` 0.75) |
| 3 | Veteran | a battalion of several campaigns |
| 4 | Elite | the Old Guard, the best regiments |

A scenario sets each formation's level; a category can set a starting level (elite infantry starts at 3 or 4).

**Today's numbers.** A level gives a default `quality`, and an explicit `quality` overrides it, as today. A
formation with no level set takes level 2's effects, which are all today's values, with its own quality. So:
- the fire calibration's lines (quality 0.8 and 0.65, `tools/calibrate-fire.ts`) and the S1e-3 battle's veterans
  (quality 0.85, #51) keep their numbers and their results;
- the first volley counts only inside its range (§ Fire), and the calibration's 100 m and 200 m rows open fire
  outside it. Its 50 m row changes, and is measured again in U3.

### What a level changes

First guesses, all ruleset data:

| Effect | 0 | 1 | 2 | 3 | 4 | Scenarios |
|---|---|---|---|---|---|---|
| Morale base (default `quality`) | 0.66 | 0.70 | 0.75 | 0.80 | 0.85 | G-01, H-04 |
| Losses' weight on morale | 1.15× | 1.05× | 1× | 0.9× | 0.8× | G-01 |
| Contagion taken | 1× | 1× | 1× | 0.8× | 0.6× | G-05, G-06 |
| Pressure from threats and guns | 1.2× | 1.1× | 1× | 0.8× | 0.6× | G-04, G-09, D-04 |
| Reload | 30 s | 27 s | 25 s | 23 s | 22 s | C-02 |
| Precision (× hit chance) | 0.75 | 0.9 | 1 | 1.1 | 1.15 | C-02 |
| Change times | 1.4× | 1.2× | 1× | 0.8× | 0.7× | B-02 |
| Disorder recovered | 0.7× | 0.85× | 1× | 1.2× | 1.4× | I-01 |
| Square against cavalry: reaction | 6 s | 4 s | 2 s | 2 s | 1 s | E-05 |
| Fire discipline: opens fire on its own inside | 150 m | 120 m | holds | holds | holds | C-04 |
| Nerve: the advance stalls below morale | 0.62 | 0.60 | 0.58 | 0.56 | 0.55 | F-03, F-04 |
| Cavalry: pursuit, × `charge.pursue` | 2.5× (out of control) | 1.6× | 1× | 0.8× | 0.7× | E-08, E-09 |
| Rally: quality it costs | 0.15 | 0.12 | 0.1 | 0.08 | 0.06 | G-08 |

How the rows fit today's morale thresholds (`morale` in `src/rulesets/napoleonic.ts`: shaken below 0.6 and back
above 0.65, wavering below 0.5 and back above 0.55, the rout at 0.4):
- **Every base is above 0.65,** so a shaken battalion of any level can recover to steady.
- **Every nerve threshold lies between 0.55 and its base,** so:
  - a steady recruit battalion stalls after a few per cent of losses;
  - a veteran one closes until it is well shaken;
  - a wavering battalion of any level never closes, so the nerve test and the wavering fall-back never give
    opposite orders.
- **Rallies:** a rally needs its quality less the rally's cost to stay at or above 0.5, where wavering begins
  (`morale.wavering[0]`; `src/sim/morale.ts`). Recruits rally once (0.66 − 0.15 = 0.51; the second time 0.36
  fails), so their second rout shatters them (G-08). Every other level rallies up to `rally.max` (2) times.
- **Contagion:** recruits feel a neighbour's break more through their lower base: the same shock is a larger share
  of a smaller gap to the rout. The factor only lowers it above level 2. The ruleset's guard (one shock may not
  take more than 0.6 of the gap from quality to the rout) is checked at every level's base: at level 0,
  0.15 ≤ 0.6 × (0.66 − 0.4) = 0.156.

**The scale (H-04):** a level 4 battalion against two level 1 battalions, by the table's fire and morale rows:
- **its fire:** 1.15 / 22 against 0.9 / 27 each, so the two give about 1.3 times its fire;
- **its break point:** about 45% losses, against about 23% for each of them;
- **the result:** it lasts about as long as a level 1 battalion does against one other, and then breaks first.
  One against one, it wins, with about two thirds of the losses it inflicts.

U2 checks this by calibration and tunes the rows if it fails.

### Gaining experience

Points come from fighting, and a level comes at a threshold:
- **Earning points:** minutes in the fight under fire; enemy men struck by its fire or in melee; charges turned
  away; enemy formations broken in front of it.
- **The cap:** at most one level per battle. A level gained applies at once; each level is a small step, so a fight
  never turns on one (H-05).
- **Losses do not lower the level within a battle.** Replacements between battles (H-02) are campaign work.
- **The panel shows** the level and how near the next one is.

## Fire

The shape of the musketry formula, per company volley, extending today's (`docs/systems/fire-morale.md`):

```
rounds        = men in the firing ranks × the share of the company's front that bears on the target
                × the share of its rays that no friendly block crosses × (1 − misfire)
expected hits = rounds × p(range) × precision(level) × exposure(target shape, sector) × cover(target's ground)
                × state factor × (1 − cohesion × disorder) × first-volley bonus × bonus(attacker tags, target tags)
```

- **The share that bears** replaces today's rule that a company fires only at a target in its arc. A target at the
  arc's edge gets part of the company's front. Today it is all or nothing.
- **Friends' cover stays as today:** the share of the company's three rays that no friendly block crosses. A second
  line cannot fire through the first (C-08), and a column's rear companies do not fire.
- **Cover** (C-10, C-11): from what stands between the shooter and the target's company. A wood, a hedge, a wall or a
  building in the last few metres in front of the target reduces its hits. Track M's ground gives the classes and
  barriers (the map engine proposal, §6). Light infantry takes more from cover.
- **The first volley** (C-05): a company's first volley of the battle, loaded with care before the fight, is
  stronger (about 1.5×), when it is fired inside the first volley's range (about 80 m). A battalion that holds its
  fire until the enemy is close gets it; one that opens at long range wastes it.
- **Fire discipline** (C-04): a formation whose level cannot hold fire opens fire on its own when an enemy in its
  arc comes inside its level's distance, whatever the order says. It wastes its first volley at long range.
- **Skirmish order:** fires while moving, at a lower rate and a better aim, and is a small target.
- **A square fires** with the face toward its target, or two faces at a corner.
- **Calibration:** with no level set, line against line from the front, in the open, outside the first volley's
  range, the formula is today's (§ Experience, *Today's numbers*).

## Artillery

Roundshot and canister stay as they are (`docs/systems/artillery.md`). The model adds four things:

- **The guns' pressure** (D-04): an enemy formation inside a loaded, unlimbered battery's arc and canister range
  takes a morale pressure. It grows as the range falls, and is scaled by the enemy's level. Advancing frontally on
  guns is a real choice, made with support.
- **The last salvo** (D-05): when a charge or an assault in its arc reaches its test distance, every loaded piece
  fires canister at it at once, without waiting for its own target choice. A battery that holds its fire for the
  charge is stronger for it.
- **Guns taken** (D-05, D-07, D-08):
  - A battery's detachments can break and flee without their pieces. The pieces stay where they stood: silent,
    owned by no one, and drawn so.
  - Gunners who flee go to the nearest friendly formation within reach, a square or a line, not to the side's
    rear. They come back to the pieces and man them again when no enemy is near.
  - An enemy in contact with unmanned pieces holds them. It cannot fire them: it has no crew. Dragging them off and
    spiking them come later.
  - This needs a piece to be an object apart from its detachment: today a piece is its detachment's company.
- **Flanks** (D-06): a battery's pieces bear only in their arc. A threat in its flank meets no canister, and the
  battery is struck as in the flank.
- **Horse artillery** (D-10): the same fire, lighter pieces, mounted paces, and limber and unlimber times about a
  third of foot artillery's.

## Closing with the enemy

### The nerve test (F-03, F-04)

A formation that is closing and under fire takes the advance's test each tick: if its morale is below its level's
nerve threshold, the advance stalls. It halts, keeps its orders for when it recovers, and fires if it may.

The distance it stalls at is not a number in the table. It follows from the losses: nearer means more fire, more
fire means lower morale, and recruits start lower and fall faster, so they stall farther out. A veteran battalion
reaches 50 m; a recruit one stalls at about 120 m.

A player's order to advance again starts the test again; the unit still stalls if it is still shaken.

### The assault (F-01, F-02, F-07, E-15)

Infantry charges with the bayonet. It is the engine's charge (`docs/systems/melee.md`), given to infantry types
with their own numbers:
- **The command:** `charge`, from line or column of attack, as for cavalry. The column's assault is heavier.
- **The approach:** at quick time without firing (`docs/proposals/sim-design.md` §12, "advance without firing"),
  then at the double over the last 50–80 m.
- **The test at about 50 m.** Both sides take it:
  - **the defender:** a shock from the attacker's momentum, shape, level and sector, cut by its own steadiness;
  - **the attacker:** a shock from the defender's last volley and steadiness.
- **The outcomes:**
  - the defender breaks, and the attacker takes the ground (the usual end of an assault on a shaken line);
  - the attacker's advance stalls, and a firefight at close range follows;
  - the attacker breaks;
  - rarely, contact and a short melee, which one side soon loses.
- **The battery:** an assault on guns meets the last salvo (§ Artillery). An assault that gets in takes the guns.

## Charges and melee

Charges and melee work as today, with three additions:
- **By category** (E-06, E-07):
  - heavy cavalry: more impact and melee strength, armour against sabres, more fatigue, a shorter pursuit;
  - light cavalry: less impact, faster paces, a longer pursuit that it controls by level.
- **The pursuit by level** (E-08, E-09): recruits pursue out of control, longer and farther, and are blown when
  caught; veterans rally after a short pursuit.
- **Ground** (E-13, E-14): no gallop over woods, villages, marsh or a barrier its kind cannot jump; uphill takes
  momentum. The ground's speed already slows a charge; momentum should read the slope too.

## Morale

Morale stays loss-driven at its core: the target is quality less losses, relaxing toward it with shocks and
contagion, as today. The model adds **pressures**, terms in the target while their cause stands:
- **A threat in the flank or rear** (G-04): an enemy in the fight within threat range in that sector; the rear's
  pressure is larger.
- **Under fire without reply** (G-09): losing men to fire it cannot answer (out of range, out of arc, or guns at
  long range). It is small, and grows for lower levels.
- **The guns** (D-04): § Artillery.
- **Supports** stay as they are: secured flanks and, in S2, a commander near.

Each pressure is scaled by the level's row. The ruleset is refused if a steady unit of any level, at its level's
base, could rout from pressures alone with no losses. This is the same guard as contagion's, checked at every
level.

## Movement

### Modes

| Mode | Pace | Shape | Cost |
|---|---|---|---|
| **March** | route step; roads faster | march column | none; no fire |
| **Manoeuvre** | ordinary | line, column of attack | keeps order; a line obliques within about 30°, beyond it a change front (`docs/proposals/sim-design.md` §7) |
| **Quick time** | about 1.3× ordinary | any but the square | disorder and fatigue (I-11) |
| **Double, the charge** | the assault's last metres; cavalry's trot and gallop | the charge's shapes | fatigue; momentum |
| **Retire** | ordinary | as it stands | face about, march, face (today); its rear is exposed while it goes (F-06) |
| **Fall back facing** | about 0.5× ordinary | as it stands | backward steps, facing the enemy; slow, but no exposed rear (new) |
| **Change front** | a timed drill | line, column | tens of seconds; a wheel on a flank or on the centre (B-10) |

**Fatigue** (S3, I-12): an accumulator from 0 to 1, raised by fast paces, slopes, melee and the gallop, and
lowered at the halt. It slows a unit, weakens its melee and charges, and slows its morale's recovery. Heavy cavalry
tires fastest.

### Collision

Formations do not pass through each other unless a rule says they may (I-06 to I-09, G-07). Each formation's blocks
are rectangles, and the separating-axis gap is already in the sim (`docs/systems/melee.md`).

- **Enemies never overlap.** A move that would bring a block within contact distance of an enemy's block halts at
  contact. Contact without a charge or an assault is not a melee: the two stand at point-blank range and fire. A
  charge or an assault makes contact a melee, as today.
- **Friends do not overlap by default.** A move into a halted friend's blocks halts short of it ("blocked by a
  friend"). After a few seconds it re-plans around (§ Pathfinding).
- **Passing through is a rule of its own:**
  - **a passage of lines:** ordered explicitly, the mover passes through a friend. Both lose cohesion, and the
    friend cannot fire while the mover is in front of it;
  - **skirmishers** pass through friends freely, and friends through them;
  - **routers** pass through friends, costing them cohesion and a morale shock (`docs/proposals/sim-design.md` §7).
- **Two movers converging:** each reads the other's position at the start of the step. A mover whose step would
  enter the other's blocks halts for the tick. When both would, both halt, and a keyed draw on the pair decides who
  goes first next tick. The draw is keyed by the two handles sorted, so it is the same whichever is visited first.
  No slot is favoured, and the reversed visiting order gives the same state (`docs/proposals/sim-design.md` §7).
- **Cost:** block pairs are culled by reach, as fire's friendly-cover test is. Collision runs on the gate's step, so
  it adds a test per nearby pair, not per man.

### Pathfinding

`docs/proposals/sim-design.md` §7, with the ground Track M compiles (the map engine proposal, §5–§6):
- **The grid:**
  - Track M's 8 m cost grid: a speed factor per kind of unit, 0 for impassable;
  - with the compact grids (Track S's to build, needed for maps over about 2 km), a clearance per kind;
  - per Track M: "`c` for the footprint gate, `4c` for planning".
- **The search:**
  - A* with octile steps, then smoothing against the clearance, giving waypoints for today's move order;
  - ties broken by cell index, so it is deterministic;
  - **time-sliced:** a budget of node expansions per tick, and a queue (J-06). A formation waiting for its path
    goes on with its current order.
- **The shape on the way (J-02, J-03, J-04):**
  - a move within about 30° of the front, clear for its current shape: straight, in that shape;
  - otherwise the path is found for the march column's width. The formation forms march column, follows the path,
    and forms the ordered shape and facing on arrival, with the change times.
  - The player can order "keep formation": the path is then found for the formation's own width, and may be longer
    or fail.
- **Fords and bridges** (J-01): the grid's costs route a formation to a ford or bridge its kind can cross.
- **Unreachable** (J-07): it goes to the nearest reachable cell and says why.
- **Formations are not in the grid.** The collision rules handle them. A formation blocked for long re-plans with
  the blocking friends as a temporary cost.
- **No hierarchy** until a 6 km map's searches are measured. That is 750² cells per kind, and Track M agrees.
- **Danger in the path's cost** (J-05): not now. It is the AI's influence maps' job (`docs/proposals/ai.md`).

### Ground the model needs from Track M

The ground classes the model reads. Track M maps some of them to stand-ins today, waiting on Track S
(its Napoleonic ground classifier, on `epic/map-engine`):
- walls, fences and buildings as their own classes: buildings impassable, walls and fences crossed by kind;
- barriers' crossing kinds (open, jump, climb, push, none) read per kind of unit (I-13). Cavalry jumps a low
  hedge; guns need a gap;
- cover per class or barrier (C-10, C-11);
- earthworks, judged by slope and step height.

Track M also handed over a known bug: `clearOfImpassable` and `changeWet` (`src/sim/formation.ts`) use a fixed 2 m
margin that ignores the cell size.

## Counters and bonuses

### The triangle

Most of the period's counters follow from shapes, sectors and fire. The table is what the model must produce. `++`
is a strong edge for the attacker, `−−` a strong edge for the target.

| Attacker ↓ / target → | Line | Column | Square | Skirmishers | Cavalry | Battery, front | Battery, flank |
|---|---|---|---|---|---|---|---|
| **Infantry fire (line)** | = | + | + | − | + | − | + |
| **Infantry assault (column)** | + if it wavers, − if steady | = | + | + | −− | − | + |
| **Skirmishers** | + | + | + | = | −− | + | + |
| **Heavy cavalry** | + front, ++ flank | + | −− | ++ | + against light | − | ++ |
| **Light cavalry** | front −, ++ flank | = | −− | ++ | − against heavy | − | ++ |
| **Artillery** | + | ++ | ++ | − | + | = | = |

How each edge arises:
- **Cavalry against the square:** bracing (today).
- **Guns against the square and the column:** the roundshot's line through dense blocks, and exposure (today and
  § Facing and sectors).
- **The line against the column in a firefight:** the column's front is one division, so it fires less (today).
- **The flank:** sectors.
- **Skirmishers against guns:** a spread target and aimed fire.
- **Cavalry against the battery's front:** the last salvo and the guns' pressure.

### Bonuses

Where geometry does not give the edge, a small table of named bonuses does (E-11, E-12). It is like Age of Empires
II's bonus damage, but kept small, because the period's counters are mostly about shape and position, not weapon
against armour.

```
bonus: [{ attacker: tags, target: tags or a shape kind, mode: fire | impact | melee | melee taken, factor }]
```

The Napoleonic ruleset's first entries:
- **lancers against foot not braced** (line, column, skirmish order): impact and melee × about 1.3;
- **cuirassiers' armour:** melee losses taken from `horse` × about 0.8;
- **light cavalry against skirmish order:** impact × about 1.3.

Each stat stays one plain function that combines its terms in a fixed order and can print them
(`docs/proposals/sim-design.md` §13). A bonus is one more term, named in the printout.

## The engine and the ruleset (decision 0015)

| The engine knows | The ruleset says |
|---|---|
| shapes with faces, exposure by sector, bracing, fire share, paces | line, square, column of attack, skirmish order and their numbers |
| sectors and their blend | 45°, the margin, the sector tables |
| tags, and a bonus table keyed by tags | `foot`, `horse`, `light`, `heavy`, `lancer`, `elite`, `guns`; the entries |
| levels 0–4 and a table of effects per level | the names (recruits to elite), the numbers, the thresholds |
| engagement states, pressures, the nerve test | the ranges and thresholds |
| a charge for any type that has one (cavalry, infantry's assault) | the numbers per type |
| pieces apart from their crews | which types have pieces (guns) |
| collision rules by tag (pass freely, pass at a cost, never) | skirmish order passes freely; routers pass at a cost |

An ancient ruleset would use the same structures: a phalanx with one face and a great frontal bonus, a testudo
braced against missiles, cavalry and elephants as tags.

## What changes from today

| System | Today | The model |
|---|---|---|
| Sectors | charges only, read from the target's centre | one reading, from the face's nearest end, blended, used by fire, charges and morale |
| Fire | in arc or not; depth by kind | the share that bears; exposure by shape and sector; cover; precision; first volley; fire discipline |
| Quality | morale's base only | experience levels with a table of effects; points and levels during a battle |
| Morale | losses, shocks, contagion, support | plus pressures: flank and rear threats, fire without reply, the guns |
| Infantry | one type | line, light and elite categories; skirmish order; the assault |
| Cavalry | one type | heavy and light; lancers; pursuit by level |
| Artillery | pieces are companies of the battery | pieces apart from crews; guns taken; the last salvo; the guns' pressure; horse artillery |
| Collision | formations pass through each other | enemies never overlap; friends by rule |
| Movement | straight moves, Retire | modes (quick time, fall back facing, change front); fatigue later |
| Paths | none: a formation halts at what it cannot cross | A* on Track M's grid, march column on paths with turns |
| Changes | timed, any time but in melee | also scaled by level, and slower under fire |

**The renderer's interfaces** (`SoldierLayer`, `Man`, `volleyTick`):
- skirmish order needs the soldier layer to draw loose order;
- pieces apart from their crews need the pieces drawn on their own;
- the rest changes no interface. Each phase's PR says which it touches.

## Phases

Each phase is a PR into `epic/sim-engine` with its own plan, ordered so that each one's scenarios become tests as it
lands. U1–U7 come before the reacting enemy plan (S1f-1) and the end rule (S1f-2), which are better written once the
units they order behave this way. U8 and U9 are Track S's pathfinding and group moves (S1f-3, S1f-4), after them
(`docs/plans/active/track-s.md`).

| Phase | What | Scenarios |
|---|---|---|
| **U1** | Sectors: one reading for fire, charges and morale; exposure by shape and sector; the share that bears; flank and rear pressure | A-01 to A-10, B-08, C-06, G-04, G-09 |
| **U2** | Experience: levels, their table, points and levels in battle; `quality` becomes the level's base | B-02, C-02, E-08, E-09, G-05, G-06, H-01, H-04, H-05 |
| **U3** | Closing: engagement states, changes under fire, the nerve test, fire discipline, the first volley, the assault | B-03, C-03 to C-05, E-15, F-01 to F-07, L-05 |
| **U4** | Guns: the guns' pressure, the last salvo, pieces apart from crews, guns taken, gunners sheltering | B-06, D-04 to D-08, L-03, L-04 |
| **U5** | Categories: light infantry and skirmish order, heavy and light cavalry, horse artillery, the bonus table | D-10, E-06, E-07, E-11, E-12, K-01 to K-05, L-07 |
| **U6** | Collision: enemies, friends, passages of lines, routers | I-06 to I-09, G-07 |
| **U7** | Ground with Track M: walls, buildings, barriers' crossings, cover; the 2 m margin bug | C-10, C-11, E-13, E-14, I-13, I-14 |
| **U8** | Pathfinding (S1f-3): A*, time-sliced, march column on turns | J-01 to J-07 |
| **U9** | Movement modes; group moves (S1f-4). Fatigue stays in S3 (`docs/proposals/sim-design.md` §17) | I-11, B-10 |

U1 and U2 are the base the rest reads. U6 must come before U8, since pathfinding hands moving formations to
collision. U5 could come before U3 if the playtests want light troops first.

## Alternatives considered

- **Hit points per unit apart from men.** Rejected: a battalion's men are its strength, and a separate health would
  double-count losses (§ A unit's state; also Open questions).
- **A full bonus matrix, Age of Empires II style, as the main source of counters.** Rejected: it makes the period's
  combined arms arbitrary. Shape, sector and fire give most of it; bonuses fill the few gaps.
- **Sectors from the target's centre** (today's charges). Rejected: a 93 m line's ends would count as flanks for an
  enemy squarely in front of them.
- **Hard sector borders.** Rejected: a 1 m move across 45° would swing losses and morale in a step, and players would
  learn to stand on the border.
- **A fixed "closest it will go" distance per level.** Rejected for the nerve test's morale threshold: a distance
  ignores how hard the fire is, and a battalion should go nearer to a weak enemy than to a strong one.
- **A ban on changes under fire.** Rejected: § A unit's state.

## Drawbacks

- **More terms means more tuning:** each phase re-runs the calibrations (`tools/calibrate-fire.ts`,
  `tools/calibrate-charge.ts`, `tools/calibrate-artillery.ts`) and the S1e battle. Level 2 holding today's numbers
  keeps the regressions visible.
- **The tick's budget:**
  - sectors are cheap, read once per pair already culled;
  - collision adds a test per nearby pair at each gate step;
  - pathfinding is time-sliced.
  Each phase measures against `docs/proposals/sim-design.md` §16 and issue #36.
- **Pieces apart from crews** is the largest change to a structure: a battery stops being a formation like the
  others. It may be cheaper to keep the pieces as companies and mark them "unmanned".

## Open questions

- **Health beyond men:** should veterans also lose fewer men to the same fire? For example, men lying down under
  artillery, or using the ground. The recommendation: no, toughness through morale only, unless the playtests find
  veterans too fragile.
- **Five levels or fewer:** three (recruits, line, veterans) would be easier to read on the panel, and five gives
  experience room to grow in a battle.
- **Experience across battles:** campaign work, but the points are kept in a form a campaign can carry.
- **How large the enfilade is:** 1.8× is a guess. A test of a line enfiladed by another at 100 m decides it.
- **Detached skirmish companies:** splitting a formation in two needs handles and a merge. It waits until light
  infantry is in.
- **Squares that move:** historically they could move slowly. Not until a playtest asks.
