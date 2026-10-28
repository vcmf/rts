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
- **Experience is simple and a real edge:** six levels, each harder to reach than the last. A higher level has a
  bigger morale bar, reloads faster, aims better, forms faster and loses fewer men to the same fire. A unit flees
  when its bar is empty (§ Experience, § Morale).
- **Every scenario in `docs/proposals/unit-scenarios.md`** has an answer in the model.
- **Era-generic (decision 0015):** the engine knows shapes, faces, sectors, tags and levels. The Napoleonic ruleset
  names line infantry, hussars and the square.
- **The calibration targets stay:** two lines at 100 m break the weaker in 6–10 minutes; cavalry catches a forming
  square; a square holds. The morale bar replaces today's morale machine, so U2 retunes the bar at level 2 to these
  targets, and each phase re-runs the calibrations (`tools/calibrate-fire.ts` and the others) and the S1e battle,
  and says what moved.

**Non-goals:**
- command and control: commanders, rally radius and succession (S2, `docs/proposals/sim-design.md` §6);
- vision and fog of war: their own design, ahead of S2 by decision 0061 (on `epic/map-engine`);
- the enemy AI (`docs/proposals/ai.md`);
- campaigns and the army builder: experience carried between battles, replacements and buying units. The rules
  they will follow are recorded here (§ Experience) so the sim's levels fit them;
- individual soldiers in the sim: the battalion stays the unit (decisions 0007 and 0018).

## Terms

| Term | Meaning | Engine or ruleset |
|---|---|---|
| **Formation** | The unit as the sim holds it: a battalion, a regiment, a battery | engine |
| **Unit type** | A formation's kind of unit: its block, shapes, paces, abilities and numbers (`UnitType`) | ruleset data on an engine structure |
| **Category** | A family of types with the same shapes and role (line infantry, light cavalry) | ruleset: a type's **tags** |
| **Tag** | A label on a type that rules can key on (`foot`, `horse`, `guns`, `light`, `heavy`, `lancer`) | the engine keys on tags; the ruleset names them |
| **Shape** | A formation's arrangement: line, column of attack, march column, square, skirmish order, limbered, unlimbered | engine structure, ruleset content |
| **Face** | A side of a shape that can fire and meet a charge as a front: a line has one, a square four | engine |
| **Sector** | Where a threat is in a face's frame: front, flank or rear | engine |
| **Level** | A formation's experience, 1 to 6 | engine; the ruleset's tables give its effects |
| **In the fight** | Alive and not routing, rallying or shattered (as today) | engine |

## Unit categories

The Napoleonic ruleset's categories. Each is one or more unit types; nations vary a type's numbers (for example
two ranks for the British line) later.

| Category | Tags | Shapes | Abilities | Role | Weak against |
|---|---|---|---|---|---|
| **Line infantry** | `foot` | line (3 ranks), column of attack, march column, square | fires; the assault; square against cavalry | holds ground; wins firefights in line; assaults in column | guns (in column or square); cavalry when caught in line or forming; enfilade |
| **Light infantry** | `foot`, `light` | as line infantry, plus skirmish order | as line infantry, plus fire on the move in skirmish order, little disorder in woods and villages, better cover | screens; harasses lines and batteries; holds woods and villages | cavalry in the open when in skirmish order |
| **Heavy cavalry** (cuirassiers, carabiniers; dragoons between) | `horse`, `heavy` | line, column of squadrons, march column | the charge, with strong impact and melee; armour | breaks lines and cavalry; the shock arm | squares; canister; tires fast; pursues poorly |
| **Light cavalry** (hussars, chasseurs, lancers) | `horse`, `light`; `lancer` for lancers | line, column of squadrons, march column; skirmish order (vedettes, later) | the charge, weaker impact; fast; long pursuit that it controls; sees far (S2) | pursuit; screening; skirmishers and guns in the open | heavy cavalry in melee; squares |
| **Foot artillery** | `guns` | unlimbered, limbered | roundshot and canister | punishes columns and squares at range; canister at close range | its flanks; skirmishers; cavalry from the flank |
| **Horse artillery** | `guns`, `horse` | unlimbered, limbered | as foot artillery, lighter pieces, much faster to limber and move | follows cavalry; quick fire support | the same as foot artillery |

**The Guard is a level, not a category.** Levels 4 to 6 are the Young, Middle and Old Guard, for any category:
Guard infantry, Guard cavalry, Guard artillery (§ Experience). There is no elite category, so one system decides how
good a unit is.

**Detached skirmishers:** a line battalion's light company deployed as a skirmish screen. Later, after light
infantry: it splits a formation into two, which the engine cannot do yet.

**Not yet:** dragoons fighting on foot, rocket troops, pontoniers, the train.

## Formations (shapes)

What each shape gives. Times are at level 2 (today's numbers). Exposure and threat are covered under § Facing and
sectors.

| Shape | Faces | Fire | Charges | Moves | Notes |
|---|---|---|---|---|---|
| **Line** (infantry, 3 ranks) | 1 (front) | full front; the rear rank does not fire (`fire.firingRanks`) | can be charged in front, flank and rear; the assault from it is weak | ordinary pace; obliques within about 30°; slow in rough ground | the firefight shape; a 93 m front |
| **Column of attack** (column of divisions) | 1 (front: the head division) | the head division only | the assault's shape: weight and momentum; half-braced only while forming square | ordinary pace; turns more freely than a line; passes gaps | a dense target for guns |
| **March column** (column of route) | 1 (front: the head) | none | caught on the march: struck as in the flank from the sides, the rear from behind | route step; fastest on roads; follows its head's trail | the moving shape; never fights from it |
| **Square** | 4 (every side is a front) | one face per target, two at a corner | braced: turns cavalry away | does not move (later: very slowly) | proof against cavalry; a dense target for guns and muskets |
| **Skirmish order** (light infantry) | all-round, loose | fires on the move, every man for himself; fewer rounds, better aimed | not braced: cavalry cuts it down | quick in rough ground; passes through friends | a spread target: musketry and canister do little |
| **Cavalry line** (2 ranks) | 1 | none (pistols and carbines later) | charges from it | walk, trot, gallop | the charge shape |
| **Column of squadrons** | 1 | none | charges from it, with less front | as the line, turns more freely | |
| **Cavalry march column** (by fours) | 1 | none | cannot charge; caught: as the infantry's march column | the trot; roads | |
| **Unlimbered** (guns) | 1 (the pieces' arc) | roundshot, canister | struck as a battery (§ Artillery) | by hand, very slowly | the firing shape |
| **Limbered** (guns) | 1 | none | helpless | gun walk (foot), trot (horse) | the moving shape |

**Changes** are timed and partial, as today (`docs/systems/formations.md`):
- changing shape stops fire;
- a change caught by cavalry is struck as in the flank (the rear from behind), at its partial bracing (B-05, E-05);
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
| **Fire taken** (exposure, × hits) | 1 | more, by shape (§ Exposure by shape) | the same or more, by shape |
| **Fire given** | the face fires | the face cannot fire: it must change front | it must Face about (3 s) |
| **A charge's threat and impact** | `melee.threat.front`, `melee.impact.shock.front` | the `flank` values, larger | the `rear` values, larger still |
| **Morale drain while the threat stands** (new) | none | a drain | a larger drain |

A square, all faces, is always struck in front (A-06). For charges and morale, a march column is struck as in the
flank from either side and in the rear from behind: never in front but at its head. Its fire exposure follows its
own row below. A formation changing shape has no
front: it is struck as in the flank, or the rear from behind (`src/sim/sectors.ts`), and its morale drains read it
the same way. Its fire exposure is that of the shape it is changing from, read as from its flank or rear; a shape
with no flank value (the square, skirmish order) uses its front.

### Exposure by shape

A shape's exposure is how many hits a given amount of fire does to it: the shape's base, times its sector's factor.
It replaces today's depth factor by kind (`fire.depth`): each shape's base is its kind's value there, so the front is
today's. First guesses for the sector factors:

| Shape | Base | Front | Flank | Rear | Why |
|---|---|---|---|---|---|
| Line | its kind's (`line`) | 1 | 1.8 | 1.2 | enfiladed, a shot that misses one file finds the next |
| Column of attack | `column` | 1 | 1.2 | 1.1 | from a flank a shot crosses its whole width, about twice its depth |
| March column | `column` | 1 | 1.5 | 1 | long and thin: end-on from front or rear, broadside from a flank |
| Square | `column` | 1 | | | dense, every side a front |
| Skirmish order | `skirmish` | 1 | | | spread, no flank |
| Cavalry (any shape) | `horse` | 1 | 1.2 | 1.1 | large targets |
| Guns | `guns` | 1 | 1.5 | 1 | the detachment spread round the piece, its flank along the line of pieces |

A sector's factor is never below the front's, so fire from a flank or the rear never does less than from the front
(A-07).

Roundshot needs no exposure table: the ball's line through the blocks gives it (`docs/systems/artillery.md`).
Canister uses exposure as musketry does.

## A unit's state

### What a formation holds

| Value | What it is | Today |
|---|---|---|
| **Strength** (men, per company) | The unit's health: men fall, nobody is wounded by halves. A battalion has 400 | yes |
| **Morale** (a bar, 0 to its level's maximum) and its state | The will to stay: steady, shaken, wavering by the share of the bar left; routing at 0; rallying, shattered | partly (a 0..1 value with a target, § Morale) |
| **Cohesion** (disorder 0..1) | Order in the ranks: grows with rough ground, lag, passing friends, changing under fire; falls when halted and dressed | yes (disorder) |
| **Experience** (points, and the level 1–6 they give) | § Experience | quality only |
| **Fatigue** (0..1) | Grows with fast paces, slopes, melee; recovers at the halt | later |
| **Ammunition** | Rounds per man; resupply | later |

**Health is strength, and toughness divides the losses.** A unit has no hit points apart from its men. A higher
level is tougher: the men lost to a given amount of fire or melee are divided by its level's toughness, so veterans
lose fewer men to the same fire (they use the ground, close the ranks, keep their heads). Together with the bigger
morale bar, a veteran battalion both bleeds slower and stands longer. The owner confirmed this definition (2026-10-25);
the toughness factors by level (§ Experience) are first guesses, tuned in U2.

### Engagement

How close a formation is to the fight. It is derived each tick from the positions and orders, not stored where it
can be derived:

| State | When | What it allows |
|---|---|---|
| **Free** | No enemy in the fight within threat range (about 300 m, the canister range) | anything |
| **Threatened** | An enemy within threat range; noted with its sector | anything; flank and rear threats press on morale |
| **Under fire** | Lost men to fire in the last few seconds | changes take longer (about 1.3×) and cost cohesion (B-03) |
| **Closing** | Moving, under an order, toward an enemy within threat range | within fire range, a wavering formation will not advance (§ Closing with the enemy); its flank and rear sectors exposed as it goes (A-10, F-05) |
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
F-06). **The back exposed** (decision 0081): a battalion whose flank or back is turned to an enemy that can hurt it
(that could fire on it, in range with a clear line, or charge it) is drained for as long as it stays so, whatever
orders turned it. A redeployment in the open within the enemy's reach costs nerve; behind a screen of friends, or beyond
range, nothing. From a melee there is no retiring at all (§ Collision).

## Experience

### Levels

Six levels. Each needs more points than the one before (the usual levelling curve), so the first comes in a battle
or two and the Old Guard takes a long career.

| Level | Name (Napoleonic) | Typical | Bought | Points to reach it (first guess) |
|---|---|---|---|---|
| 1 | Recruits | conscripts of 1813, militia, landwehr | yes, cheapest | 0 |
| 2 | Line | the average battalion | yes | 100 |
| 3 | Veterans | a battalion of several campaigns | yes, dearer | 300 |
| 4 | Young Guard | the Guard's newest regiments; the best of the line | yes, the dearest | 700 |
| 5 | Middle Guard | the Guard's tried regiments | no: only by experience | 1500 |
| 6 | Old Guard | the grognards | no: only by experience | 3100 |

- **A scenario sets each formation's level.** The army builder and campaigns, later, buy levels 1 to 4 at a price
  that rises with the level; levels 5 and 6 are only earned.
- **Level 2 is today's battalion.** A scenario or a test may set a formation's bar maximum apart from its level,
  as tests set `quality` today. The fire calibration then keeps its shape: two level 2 lines whose bars are set so their
  margins to flight are in today's ratio (quality less the rout: 0.40 against 0.25), so only morale separates them.
  The scale is pinned by today's average line: its margin of 0.35 is level 2's bar of 100, so the pair's bars are
  about 114 and 71. One `morale.perMan` then serves both C-01 and G-01; U2 tunes it and the burst term. The S1e battle's veterans (#51) become level 3, and the battle is retuned.

### What a level changes

First guesses, all ruleset data. A small set on purpose: each row is a stat a player can feel.

| Effect | 1 | 2 | 3 | 4 | 5 | 6 | Scenarios |
|---|---|---|---|---|---|---|---|
| Morale bar's maximum | 70 | 100 | 120 | 140 | 160 | 180 | G-01, G-05, G-06, H-04 |
| Toughness (men lost ÷) | 0.9 | 1 | 1.1 | 1.2 | 1.3 | 1.4 | C-02, H-04 |
| Reload (× `fire.reload`; for guns × `artillery.reload`) | 1.12× | 1× | 0.92× | 0.88× | 0.84× | 0.8× | C-02 |
| Precision (× hit chance; for guns, canister's hits × it, and the roundshot's `spread` and `short` divided by it) | 0.85 | 1 | 1.1 | 1.15 | 1.2 | 1.25 | C-02 |
| Change times (the formation's `drill` factor, which also scales Face about; U2 makes it scale dressing too, which today it does not) | 1.3× | 1× | 0.85× | 0.8× | 0.75× | 0.7× | B-02 |
| Square against cavalry: reaction (× `refuge.react`) | 2.5× | 1× | 1× | 0.5× | 0.5× | 0.5× | E-05 |
| Fire discipline: opens fire on its own inside | 150 m | holds | holds | holds | holds | holds | C-04 |
| Cavalry: pursuit, × `charge.pursue` | 2× (out of control) | 1× | 0.8× | 0.7× | 0.7× | 0.7× | E-08, E-09 |
| Replenished between battles (later) | fastest | | | | | slowest | H-02 |

**The scale (H-04):** a level 5 battalion against two level 2 battalions should hold its own for a while and then
lose. By the table it fires about 1.5 times as hard as one of them, loses about 0.77 as many men to the same fire,
and has 1.6 times the bar. Whether it breaks first depends on its targets (its fire split between the two, or on
one); U2 measures it with today's targeting and tunes the rows until H-04 holds.

### Gaining experience

- **Points come from fighting:** enemy men struck by its fire or in melee; minutes in the fight under fire; charges
  turned away; enemy formations broken in front of it.
- **A level up raises the bar's maximum to the new level's and refills the bar to it,** less any rally's cut
  (§ Morale). Like a rally, it writes off what the losses so far have cost, so the ceiling is the new maximum and
  the refill stays. It is the one moment a battle gives morale back in a lump, so a battalion gains at most one
  level per battle (H-05).
- **The other rows change at once** with the level.
- **The level never falls.** Losses do not lower it. Between battles (later), a battalion is filled up with men at
  its level's rate: the higher the level, the slower. Recruits and veterans are never mixed and their experience is
  never averaged (H-02).
- **The panel shows** the level, its name and how near the next one is.

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
- **Fire discipline** (C-04, F-03), for a level that cannot hold fire. Each formation keeps one flag, "opened on
  its own":
  - **it triggers** when the flag is clear, it stands in a shape that fires, and an enemy in the fight is in its
    arc inside its level's distance. A battalion that deploys into line with an enemy already inside triggers then;
  - **then:** the flag is set and its fire mode is set to at will. If it is moving toward that enemy (as the
    wavering rule reads "toward"), the move is dropped (status "opened fire on its own"), and it halts and fires. A
    formation moving away or across, retiring, falling back or charging cannot fire while it moves, as today, so for
    it nothing changes;
  - **the flag clears** only when no enemy is within its distance and a margin (about 20 m), so an enemy moving in
    and out across the distance does not trigger it again. Until then the player can order it on and it obeys;
  - it wastes its first volley at long range.
- **Skirmish order:** fires while moving, at a lower rate and a better aim, and is a small target.
- **A square fires** with the face toward its target, or two faces at a corner.
- **Calibration:** at level 2, line against line from the front, in the open, outside the first volley's range,
  the formula is today's. U2 tunes the morale bar so that the result is too.
- **Toughness** divides the expected men lost before the draw, so losses stay whole men (§ A unit's state):
  - **musketry and melee:** their expected losses, per target;
  - **canister:** today one draw covers the cone, scaled by the aimed target's depth factor, and its hits are
    spread over the formations in it by men. In the model the cone's expected hits are first split over the
    formations in it by men; each share is then scaled by that formation's own exposure (shape and sector), the
    battery's precision and the formation's toughness, and drawn on its own, keyed by its handle: one draw per
    formation in the cone;
  - **roundshot:** each block's expected kill along the ball's line is divided by its toughness. The ball spends
    energy per man actually struck, so a tough block slows it less and the blocks behind take more. Against deep
    targets toughness protects less than its factor; the calibrations measure it.

## Artillery

Roundshot and canister stay as they are (`docs/systems/artillery.md`). The model adds four things:

- **The guns' drain** (D-04): an enemy formation inside a loaded, unlimbered battery's arc and canister range
  takes a morale drain. It grows as the range falls; a higher level's bigger bar stands it longer. Advancing frontally on
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

### A wavering formation will not advance (F-03, F-04)

One rule, read from the morale state the bar already gives. A wavering formation's move toward an enemy is dropped,
with the status "wavering: will not advance":
- **toward an enemy:** the step's direction is within 60° of the direction to an enemy in the fight within fire
  range (`fire.maxRange`), so at least half the step closes on it. A march across an enemy's front is not dropped,
  and is punished by the sectors instead (A-10);
- **then:** it fires if it may, and stays where it is: there is no fall-back (decision 0082);
- **dropped, not held:** nothing resumes on its own; the player orders it forward again once it has recovered;
- **charges and assaults:** a wavering formation cannot be ordered to charge (refused: "wavering"), and a charge it
  is making is dropped by this rule until it reaches its test distance. From the test on, the test decides
  (§ The assault, `docs/systems/melee.md`).

The distance is not a number. It follows from the bar: nearer means more fire, recruits have the smallest bar and
lose the most men, so they reach wavering farther out and a veteran battalion reaches 50 m. Recruits usually stop
earlier still, when their fire discipline breaks (§ Fire): at about 150 m (F-03).

### The assault (F-01, F-02, F-07, E-15)

Infantry charges with the bayonet. It is the engine's charge (`docs/systems/melee.md`), given to infantry types
with their own numbers:
- **The command:** `charge`, from line or column of attack, as for cavalry. The column's assault is heavier.
- **The approach:** at quick time without firing (`docs/proposals/sim-design.md` §12, "advance without firing"),
  then at the double over the last 50–80 m.
- **The test at about 50 m.** Both sides take it:
  - **the defender:** a shock in points from the attacker's momentum, shape and sector. Its own bar is its
    steadiness: the same shock empties a recruit's bar further than a veteran's;
  - **the attacker:** the losses of the defender's last volley, and a shock in points that grows with the share of
    the defender's bar left (a steady line is frightening; a shaken one is not).
- **The outcomes:**
  - the defender breaks, and the attacker takes the ground (the usual end of an assault on a shaken line);
  - the attacker's advance stalls: if after its test its bar is in wavering, its charge ends there, it halts and
    fires (status "the assault stalled"), and a firefight at close range follows;
  - the attacker breaks;
  - rarely, contact and a short melee, which one side soon loses.
- **The battery:** an assault on guns meets the last salvo (§ Artillery). An assault that gets in takes the guns.

## Charges and melee

### Firearm and melee modes

Every type but artillery has a **firearm** and a **melee** mode, and the player sets which (the owner's rule,
decision 0080); a few have one only. Artillery has no mode: it fires as § Artillery says, and does not fight a melee.
- **firearm:** it fires as § Fire says (its fire mode, and fire discipline; formed bodies fire at the halt, skirmish
  order on the move);
- **melee:** it holds its fire, and an order to attack an enemy is a charge: cavalry's, or infantry's assault with the
  bayonet (§ The assault). Fire discipline still holds: a level that cannot hold its fire opens fire on its own, in
  either mode, and its advance is dropped (§ Fire);
- **by type:** skirmishers have the firearm mode only, and some militia (the Russian opolchenie) the melee mode only;
  line infantry and cavalry have both (cavalry's firearm is its pistols and carbines, later, § Formations);
- **in contact:** a battalion an enemy reaches in melee fights in melee as a whole, whatever its mode, until the
  melee ends; a firearm-only type fights at a heavy disadvantage. The sim fights battalions and companies, not single
  men: the soldiers on screen are drawn from them.

### What melee adds

Charges and melee work as today, with these additions:
- **By category** (E-06, E-07):
  - heavy cavalry: more impact and melee strength, armour against sabres, more fatigue, a shorter pursuit;
  - light cavalry: less impact, faster paces, a longer pursuit that it controls by level.
- **Blown cavalry** (E-10): besides being unable to charge, it fights a melee weaker (about 0.6× strength) until
  it has rested, so a fresh regiment's charge beats it.
- **The pursuit by level** (E-08, E-09): recruits pursue out of control, longer and farther, and are blown when
  caught; veterans rally after a short pursuit.
- **Ground** (E-13, E-14): no gallop over woods, villages, marsh or a barrier its kind cannot jump; uphill takes
  momentum. The ground's speed already slows a charge; momentum should read the slope too.
- **A second enemy in the flank or rear** (U1): a charge that strikes a battalion already in melee from its flank or
  rear gives it a further one-off morale shock, on top of the impact's own shock by sector: a new ruleset number, a
  first guess the size of the impact's flank shock. Its case is to be added to the scenarios with U1.

Fire into a melee needs nothing new: today a battalion in melee can be fired on from any side where no friend of the
shooter stands across the line of fire, and cannot fire back. One battalion holding an enemy in melee while another
fires into its flank is a tactic the rules already allow, and the AI may use it.

## Morale

**The bar.** Each formation has a morale bar from 0 to its level's maximum. It replaces today's 0..1 value that
relaxes toward a target (`docs/systems/fire-morale.md`). It is simpler to read and to tune, and the level's
maximum is what makes a veteran stand longer.

- **What empties it:**
  - **losses:** each man lost costs points (`morale.perMan`, scaled by the formation's spawn strength, so a
    battalion's bar measures a share of it), plus a burst term for many men lost in a few seconds;
  - **shocks:** a charge's threat and impact, a friend's break nearby (contagion), as today, in points;
  - **drains,** per second while their cause stands: a threat in the flank or rear (G-04; the rear's is larger),
    fire it cannot answer (G-09), the guns (D-04).
- **What fills it:** it recovers slowly, at `morale.regen` points a second, when it has lost no men for
  `morale.calm` seconds. It recovers up to a ceiling: its maximum less a share of what its losses have cost, so a
  battalion that has lost a third of its men does not come back to a full bar. Supports (secured flanks, today; a
  commander near, S2) raise the recovery rate.
- **The states** come from the share of the bar left, with a little hysteresis: steady above 60%, shaken above
  30%, wavering below it (fires worse, falls back, will not advance). **At 0 it flees:** it routs, as today.
- **Rally:** a router out of danger rallies as today (no enemy within `rally.safe`, no loss for `rally.calm`).
  - Like today's rally (which counts losses from its men now, `baseMen`), it writes off what its losses so far have
    cost: its ceiling is its maximum again.
  - `rally.cut` of its maximum is lost for the battle: it is brittle.
  - Its bar comes back at `rally.share` of that cut maximum.
  - **Which maximum:** the states, the ceiling and every share in this section read the formation's current
    maximum, its level's less its cuts. Cuts compound: after n rallies the maximum is the level's × (1 −
    `rally.cut`)ⁿ, and a level up gives the new level's maximum with the same factor.
  - The ruleset is refused unless `rally.share` is above the share at which a wavering formation recovers to
    shaken (the upper edge of the hysteresis), so a rallied battalion is never wavering at once.
  - A battalion that routs more than `rally.max` times, or below half its spawn strength, shatters, as today
    (G-08).
- **The guard:** the ruleset is refused if one contagion shock together with a minute of every drain at its largest
  could empty a fresh bar of level 1. Today's guard does the same for a lone shock.

The scale: at level 2, `perMan` is set so a battalion breaks at about the share of losses today's average line
does. A level 6 battalion's bar is 1.8 times as big and its toughness 1.4, so it stands about 2.5 times the fire
(G-06).

## Movement

### Modes

| Mode | Pace | Shape | Cost |
|---|---|---|---|
| **March** | route step; roads faster | march column | none; no fire |
| **Manoeuvre** | ordinary | line, column of attack | keeps order; a line obliques within about 30°, beyond it a change front (`docs/proposals/sim-design.md` §7) |
| **Quick time** | about 1.3× ordinary | any but the square | disorder and fatigue (I-11) |
| **Double, the charge** | the assault's last metres; cavalry's trot and gallop | the charge's shapes | fatigue; momentum |
| **Retire** | ordinary | as it stands | face about, march, face (today); its rear is exposed while it goes (F-06). Every retreat turns its back: there is no stepping back facing the enemy |
| **Change front** | a timed drill | line, column | tens of seconds; a wheel on a flank or on the centre (B-10) |

**Fatigue** (S3, I-12): an accumulator from 0 to 1, raised by fast paces, slopes, melee and the gallop, and
lowered at the halt. It slows a unit, weakens its melee and charges, and slows its morale's recovery. Heavy cavalry
tires fastest.

### Collision

Collision, and the orders and their queue, have their own proposal, written before U6 from a visual bench of the
hard cases (`docs/plans/active/track-s.md`). The rules a player sees, which it keeps:
- **Formed bodies never overlap.** A formed battalion, regiment or battery, in any shape and while changing shape,
  never overlaps another formed body, friend or enemy.
- **Loose bodies pass through friends:** routers, skirmish order, a battalion during an ordered passage of lines,
  and gunners who fled their guns, sheltering in a square or a line. The friend takes disorder. A loose body turns
  formed again only on free ground, and never passes through an enemy.
- **Enemies stand at contact and fire;** a charge or an assault that reaches any enemy strikes it, and the melee
  follows. **Nobody in melee gives ground:** a battalion in melee cannot step back or retreat; the melee ends when one
  side breaks, or as today when a charger turns away from a square or the two fall out of contact (decision 0080, on
  the claim grid's branch).
- **A broken battalion runs as a block:** it faces about and runs, wavering and shattered battalions keeping their
  block. Every enemy that reaches it, but one in melee with another, cuts it down, and it does not fight back; there
  is no surrender.
- **Nothing is pushed.** A formation that meets a friend waits or goes round; until pathfinding (U8) it halts with
  the status "blocked by a friend".
- **A router stopped by an enemy** is halted, as one stopped by impassable ground is today, so it tries the next
  direction of its fan, and goes on trying while an enemy is near (the way may clear).

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
- **Cavalry against the battery's front:** the last salvo and the guns' drain.

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
| tags, and a bonus table keyed by tags | `foot`, `horse`, `light`, `heavy`, `lancer`, `guns`; the entries |
| levels 1–6, the points to reach each, and a table of effects per level; a morale bar per formation | the names (recruits to the Old Guard), the numbers |
| engagement states, drains, the wavering rule | the ranges and rates |
| a charge for any type that has one (cavalry, infantry's assault) | the numbers per type |
| pieces apart from their crews | which types have pieces (guns) |
| formed and loose bodies; which states make a body loose | routers, skirmish order, a passage of lines, fled gunners |

An ancient ruleset would use the same structures: a phalanx with one face and a great frontal bonus, a testudo
braced against missiles, cavalry and elephants as tags.

## What changes from today

| System | Today | The model |
|---|---|---|
| Sectors | since U1, one reading from the face's nearest end, blended, used by fire, charges and morale (`docs/proposals/sectors-model.md`) | one reading, from the face's nearest end, blended, used by fire, charges and morale |
| Fire | in arc or not; exposure by shape and sector (U1) | the share that bears; exposure by shape and sector; cover; precision; first volley; fire discipline |
| Quality | morale's base only | six levels with a table of effects; points and a level up during a battle |
| Morale | a 0..1 value relaxing toward quality less losses and the back exposed's drain (U1) | a bar per level, emptied by losses, shocks and drains, flees at 0 |
| Infantry | one type | line and light categories, the Guard as levels 4–6; skirmish order; the assault |
| Cavalry | one type | heavy and light; lancers; pursuit by level |
| Artillery | pieces are companies of the battery | pieces apart from crews; guns taken; the last salvo; the guns' drain; horse artillery |
| Collision | formations pass through each other | formed bodies never overlap; loose bodies pass through friends (its own proposal) |
| Movement | straight moves, Retire | modes (quick time, change front); fatigue later |
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
| **U1** | Sectors: one reading for fire, charges and morale; exposure by shape and sector; flank and rear drains (the back exposed); the flank shock on a battalion in melee | A-01 to A-07, A-09, A-10, B-08, C-06, G-04, E-16 |
| **U2** | Experience and the morale bar: six levels, their table, points and a level up; the bar replaces today's morale value; toughness | B-02, C-01, C-02, E-05, E-08, E-09, G-01, G-05, G-06, G-08, H-01, H-04, H-05 |
| **U3** | Closing: engagement states, changes under fire, the wavering rule, fire discipline, the first volley, the assault; the firearm and melee modes; the share that bears and canister's exposure per formation | B-03, C-03 to C-05, E-15, F-01 to F-07, L-05 |
| **U4** | Guns: the guns' drain, the last salvo, pieces apart from crews, guns taken, gunners sheltering | B-06, D-04 to D-08, G-09, L-03, L-04 |
| **U5** | Categories: light infantry and skirmish order, heavy and light cavalry, horse artillery, the bonus table | A-08, B-07, C-07, D-10, E-06, E-07, E-10, E-11, E-12, K-01 to K-05, L-07 |
| **U6** | Collision, with the orders and their queue, by its own proposal: enemies, friends, loose bodies, the clash | I-06 to I-09, G-07 |
| **U7** | Ground with Track M: walls, buildings, barriers' crossings, cover; the 2 m margin bug | C-10, C-11, E-13, E-14, I-13, I-14, M-06 |
| **U8** | Pathfinding (S1f-3): A*, time-sliced, march column on turns | J-01 to J-04, J-06, J-07 |
| **U9** | Movement modes; group moves (S1f-4). Fatigue stays in S3 (`docs/proposals/sim-design.md` §17) | I-11, B-10 |

Outside U1–U9, with the systems they wait on: C-12 (ammunition, S3), H-02 (campaigns), H-03 (commanders, S2),
I-12 (fatigue, S3), J-05 (danger in the path's cost, the AI), K-06 and M-07 (vision, S2), and M-02 to M-04 (whole
battles, played as scenarios once U1–U7 are in).

U1 and U2 are the base the rest reads. G-09 (fire without reply) waits for U4, since it needs U2's bar, U3's
"under fire" and U4's guns. U1's flank and rear drains land as drains on today's morale value, and move onto the
bar in U2. U6 must come before U8, since pathfinding hands moving formations to collision. U5 could come before U3 if the playtests want light troops first.

## Alternatives considered

- **A flat bonus for standing higher** (the higher formation fires and fights better, as in Total War). Rejected (the
  owner, 2026-10-25): it would make Austerlitz and Wagram, both won against an enemy on the heights, impossible to
  replay as they went. Height acts through what it does: sight, roundshot that passes over crests and buries in steep
  ground, and slopes that slow and tire (§ M of the scenarios).
- **Hit points per unit apart from men.** Rejected: a battalion's men are its strength, and a separate health would
  double-count losses. Toughness by level divides the losses instead (§ A unit's state).
- **Keeping today's morale machine and scaling each of its terms by level** (its weight of losses, contagion,
  pressures, rally cost; and a nerve threshold per level). Tried in this proposal's first drafts: its levels had to
  satisfy a web of thresholds, and three review rounds kept finding cases where two rules gave opposite orders. The
  owner chose the bar (2026-10-25).
- **An elite category beside the levels.** Rejected for the Guard as levels 4–6: one system for how good a unit is.
- **A full bonus matrix, Age of Empires II style, as the main source of counters.** Rejected: it makes the period's
  combined arms arbitrary. Shape, sector and fire give most of it; bonuses fill the few gaps.
- **Sectors from the target's centre** (today's charges). Rejected: a 93 m line's ends would count as flanks for an
  enemy squarely in front of them.
- **Hard sector borders.** Rejected: a 1 m move across 45° would swing losses and morale in a step, and players would
  learn to stand on the border.
- **A fixed "closest it will go" distance per level, or a nerve threshold per level.** Rejected: the distance
  ignores how hard the fire is, and the threshold fought the fall-back and the charge's own test. The wavering rule
  reads the state the bar already gives.
- **A ban on changes under fire.** Rejected: § A unit's state.

## Drawbacks

- **More terms means more tuning:** each phase re-runs the calibrations (`tools/calibrate-fire.ts`,
  `tools/calibrate-charge.ts`, `tools/calibrate-artillery.ts`) and the S1e battle. U2's change of the morale value
  to a bar is the largest retune: every golden moves.
- **The tick's budget:**
  - sectors are cheap, read once per pair already culled;
  - collision adds a test per nearby pair at each gate step;
  - pathfinding is time-sliced.
  Each phase measures against `docs/proposals/sim-design.md` §16 and issue #36.
- **Pieces apart from crews** is the largest change to a structure: a battery stops being a formation like the
  others. It may be cheaper to keep the pieces as companies and mark them "unmanned".

## Open questions

- **Rallying, after Total War** (research, 2026-10-26: Napoleon's and Warhammer's morale tables): a router there rallies
  when its rout timer runs out, if no enemy within about 80 m is stronger than a third of it and it is not engaged;
  it shatters on its third rout, below a deep morale floor while running, or when its general dies; an army below
  about a quarter of its strength takes a large morale penalty. Today's rally (`morale.rally` and `morale.shatter` in
  `src/rulesets/napoleonic.ts`) already waits for no enemy near and no recent losses, and shatters on the third rout
  and below a share of its men. Left: the army-wide collapse and the general (his presence for a rally, his death for
  the routers) for when generals come, and whether a deep morale floor should shatter a router too.
- **The ceiling of the bar's recovery:** what share of the losses' cost stays for the battle (a half, as a first
  guess). Too little and a battered battalion comes back fresh; too much and nothing ever recovers.
- **The level up's refill** is a lump of morale mid-battle, once per battle. If playtests find it swings fights,
  it can refill a share instead.
- **Prices** for levels 1–4 belong to the army builder; the sim only needs the level.
- **Experience across battles:** campaign work, but the points are kept in a form a campaign can carry.
- **How large the enfilade is:** 1.8× is a guess. A test of a line enfiladed by another at 100 m decides it.
- **Detached skirmish companies:** splitting a formation in two needs handles and a merge. It waits until light
  infantry is in.
- **Squares that move:** historically they could move slowly. Not until a playtest asks.
