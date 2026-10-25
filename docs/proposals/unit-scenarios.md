---
status: draft
last_reviewed: 2026-10-25
---

# The unit model's scenarios

The situations the unit model (`docs/proposals/unit-model.md`) has to get right, each with the outcome it should
give. They are written before the model's formulas, so the formulas are judged against them and not the other way
round. Each one later becomes a test or a calibration case, cited by its id.

How to read the tables:
- **Should:** the outcome a player who knows the period expects, qualitatively; times are given only where the feel
  depends on them, and are tuned in playtests.
- **Model:** the parts of `docs/proposals/unit-model.md` it exercises (its section names).
- **Today:** what the sim on `main` does: **yes**, **partly** or **no**.

Times are battle time; the page plays at 2× by default.

## A. Facing and sectors

| Id | Situation | Should | Model | Today |
|---|---|---|---|---|
| A-01 | Two lines face each other at 100 m | Both fire their full front; neither has a flank exposed | Sectors, fire | yes |
| A-02 | A line fires into another line's flank from 100 m (enfilade) | The target loses men faster than to frontal fire, takes a flank-threat pressure on its morale, and cannot reply until it changes front | Sectors, fire, morale | no (no fire by sector) |
| A-03 | A line is fired on from its rear | Worse than A-02 for morale; it must Face about (3 s) before replying | Sectors, morale | no |
| A-04 | An enemy stands ahead of one end of a long line, 60° off its centre | It counts as in front: the sector is read from the nearest end of the front, not the centre | Sectors | no (centre angle) |
| A-05 | An enemy stands exactly on the 45° border between front and flank | No cliff: moving it 1 m changes the effect by a little, not a step | Sectors (the blend) | no |
| A-06 | A square is attacked from any side | Always the front: a square has no flank or rear | Sectors, shapes | yes for charges, no for fire |
| A-07 | A column of attack is fired on from its flank | Its flank companies take it; worse than frontal but less than a line's enfilade (the column is deep, not long) | Sectors, fire | no |
| A-08 | Skirmishers are approached from their flank | Little flank penalty: open order has no rigid flank; their weakness is cavalry, from anywhere | Sectors, shapes | no (no skirmish order) |
| A-09 | A battery is approached from its flank | Its guns cannot bear; turning them (change front) takes time; the approach is the battery's worst case | Sectors, artillery | partly (arc only) |
| A-10 | A battalion marches across an enemy line's front at 150 m, in column of route | It is exposed: the enemy fires into its flank, it cannot reply, its morale takes the flank pressure; the player should not do this | Sectors, closing, movement | partly (it is fired on, frontally) |

## B. Formations and drill

| Id | Situation | Should | Model | Today |
|---|---|---|---|---|
| B-01 | Line to square, no enemy near | Takes the full change time (100 s at level 2), with no fire during it | Changes | yes |
| B-02 | The same with a veteran (level 4) and with recruits (level 0) | The veteran is markedly faster (about 0.7×); recruits slower (about 1.4×) | Changes, experience | no |
| B-03 | Line to square while under musketry at 100 m | Allowed, but slower and with disorder; the battalion loses the firefight while it forms | Changes, engagement | partly (no extra time or disorder) |
| B-04 | A change ordered while in melee | Refused: a formation in contact cannot change shape | Engagement | yes |
| B-05 | A change caught half done by cavalry | Struck as if in the flank, at the change's partial bracing | Changes, charges | yes |
| B-06 | A battery limbers while infantry advances on it | It takes about a minute; it is helpless in between; a battery that waited too long is lost | Changes, artillery | partly (no capture) |
| B-07 | Line infantry is ordered into skirmish order | Refused: only light infantry (and a line battalion's light company, later) has it | Categories | n/a |
| B-08 | A column of route meets the enemy unexpectedly | It must form line or square before it can fight; caught on the march it is at its weakest | Changes, closing | partly |
| B-09 | Face about under fire | 3 s, then it fires the other way; a battalion cannot spin to face every threat at once | Facing | yes |
| B-10 | Change front by 90° in line | A timed drill (a wheel on a flank, or a change front on the centre), tens of seconds for a battalion, not an instant turn | Facing, changes | partly (wheels) |

## C. Musketry

| Id | Situation | Should | Model | Today |
|---|---|---|---|---|
| C-01 | Two average lines at 100 m | The weaker breaks in 6–10 minutes (the calibration anchor, `docs/proposals/sim-design.md` §8) | Fire | yes |
| C-02 | A veteran line against a recruit line at 100 m | The veteran wins clearly, with about half the losses | Fire, experience | partly (quality is morale only) |
| C-03 | The same two lines at 50 m | Much bloodier; the recruits break in a few minutes, or refuse to stand at that range | Fire, nerve | partly |
| C-04 | A recruit line ordered to hold fire while an enemy advances | It cannot hold: it opens fire on its own at long range (about 150 m), wasting its first volley | Nerve, fire discipline | no |
| C-05 | A veteran line holding fire until 60 m | Its first volley is the best of the fight (carefully loaded, at short range) | Fire discipline, first volley | no |
| C-06 | A line fires on a square | A square is a dense target: it suffers, and fires back with one face only | Fire, shapes | partly (no density by shape) |
| C-07 | A line fires on skirmishers | Few hits: a small, spread target | Fire, shapes | yes (depth 0.5) |
| C-08 | A second line behind the first | It cannot fire through the first | Fire | yes |
| C-09 | A wavering line keeps firing | It fires worse (state factor) and falls back if the losses continue | Fire, morale | yes |
| C-10 | Fire into a wood | The men in the wood are seen to 40 m and take fewer hits (cover) | Fire, ground | partly (sight, no cover) |
| C-11 | Fire at a line behind a wall or hedge | The defenders take markedly fewer hits | Fire, ground | no (no cover) |
| C-12 | A line out of ammunition (later) | It stops firing and must be resupplied or withdrawn | Ammunition | no (later) |

## D. Artillery

| Id | Situation | Should | Model | Today |
|---|---|---|---|---|
| D-01 | Roundshot into a column end-on | Many men per ball, through the ranks | Artillery | yes |
| D-02 | Roundshot into a square | Devastating: a dense, fixed target | Artillery, shapes | yes (geometry) |
| D-03 | A line on a reverse slope | Roundshot passes over or buries; the line is safe until it shows itself | Artillery, ground | yes |
| D-04 | Infantry advances frontally on a battery | It takes roundshot and then canister; the morale pressure of the guns grows as it closes; an average line should usually stop or break before 150 m unless supported | Artillery, guns' pressure | partly (losses only) |
| D-05 | Cavalry charges a battery frontally | It takes a last salvo of canister at short range and a test; if it gets in, the gunners are cut down or flee and the guns are silenced; the regiment is then blown, disordered and close to the enemy's infantry, and pays for it | Artillery, charges, guns taken | partly (no last salvo, no capture) |
| D-06 | Cavalry charges a battery from its flank | The guns cannot bear; the battery is overrun cheaply. A battery's flanks need infantry | Sectors, artillery | partly |
| D-07 | A battery's gunners flee into a nearby square and come back after the cavalry leaves | The guns stay where they stood and fire again when manned (Waterloo) | Guns taken | no |
| D-08 | Guns overrun and held by the enemy | Silent until retaken; the enemy cannot turn them (no crew), but can drag them off later (S3) | Guns taken | no |
| D-09 | Counter-battery fire | Possible but slow: guns are small targets; firing on infantry pays more | Artillery | yes (by depth) |
| D-10 | Horse artillery limbers, moves and unlimbers | Much faster than foot artillery; follows cavalry | Categories, changes | no |

## E. Cavalry, charges and melee

| Id | Situation | Should | Model | Today |
|---|---|---|---|---|
| E-01 | Cavalry charges a steady line frontally | Costly for the cavalry at the test and the impact; the line often holds if steady and firing; a shaken line breaks | Charges | yes |
| E-02 | Cavalry charges a line in its flank or rear | The line breaks, almost always | Charges, sectors | yes |
| E-03 | Cavalry charges a formed, steady square | It turns away; repeated charges blow the horses | Charges | yes |
| E-04 | Cavalry charges a square that is wavering | A breach is possible (Garcia Hernandez, 1812) | Charges | yes |
| E-05 | Cavalry charges a battalion while it forms square | Caught half-formed: struck as in the flank, heavy losses | Charges, changes | yes |
| E-06 | Heavy cavalry meets light cavalry, both charging | The heavy wins the melee most of the time | Categories, melee | no (one cavalry type) |
| E-07 | Light cavalry pursues a broken enemy | Pursues further and faster than heavy, and rallies better after | Categories, pursuit | no |
| E-08 | Recruit cavalry wins a charge | It pursues out of control, far past where it should stop, and is caught blown by fresh enemies (the Union Brigade, Waterloo) | Experience, pursuit | no |
| E-09 | Veteran cavalry wins a charge | It rallies after a short pursuit and is ready again sooner | Experience, pursuit | no |
| E-10 | A blown regiment is charged by a fresh one | It loses badly: blown cavalry cannot counter-charge | Charges, fatigue | partly (blown = cannot charge) |
| E-11 | Lancers charge infantry in line or skirmish order | More deadly than sabres against men on foot who are not in square | Bonuses | no |
| E-12 | Cuirassiers in melee with hussars | Armour tells: the cuirassiers lose fewer men | Bonuses, melee | no |
| E-13 | Cavalry charges through or into woods, a village, over a hedge | Refused or broken up: no gallop over such ground; disorder | Charges, ground | partly (terrain slows) |
| E-14 | Cavalry charges uphill | Slower, less momentum | Charges, ground | partly (slope slows) |
| E-15 | A melee between two infantry battalions | Rare and short: one side usually breaks before or soon after contact | Infantry assault, melee | no |

## F. Closing with the enemy (the assault)

| Id | Situation | Should | Model | Today |
|---|---|---|---|---|
| F-01 | An attack column advances on a steady line without firing | It takes fire; at about 50 m both take a morale test; most often one side breaks before the bayonets cross (the column if the line's fire holds, the line if it wavers) | Infantry assault, closing | no |
| F-02 | The same column advances on a wavering line | The line breaks; the column takes the ground | Infantry assault | no |
| F-03 | A recruit battalion is ordered to advance to 50 m under fire | It halts on its own at its nerve distance (about 120 m) and opens fire; it will not close further unless its morale is high | Nerve | no |
| F-04 | A veteran battalion is ordered the same | It closes to 50 m and fires a first volley, or presses on with the bayonet | Nerve, first volley | no |
| F-05 | A battalion closes with an enemy on its flank | It is punished: the enemy's fire and charges strike its flank; its own front cannot bear | Closing, sectors | partly |
| F-06 | A battalion advances on an enemy, then turns its back to retire at 80 m | Its rear is exposed while it goes; the enemy may charge it; a Retire under fire costs disorder | Closing, sectors | partly |
| F-07 | Infantry assaults a battery frontally | Canister makes it costly; if it gets in, the guns are taken (D-08) | Assault, guns taken | no |

## G. Morale

| Id | Situation | Should | Model | Today |
|---|---|---|---|---|
| G-01 | A battalion loses 20% in a firefight | It breaks (the average line) | Morale | yes |
| G-02 | A friend breaks next to a wavering battalion | It may break too (contagion) | Morale | yes |
| G-03 | Both flanks covered by friends | Holds longer than alone | Morale | yes |
| G-04 | An enemy appears on its flank (no fire yet) | Morale pressure: a threatened flank is felt before the first shot | Morale, sectors | no |
| G-05 | A veteran battalion beside a breaking recruit one | Takes less of the contagion shock | Morale, experience | no |
| G-06 | Elite infantry (the Guard) watches the army break | Holds longest; it is the last to go, and its break is the army's (later: an army-wide shock) | Morale, experience | no |
| G-07 | A router passes through a friendly battalion | Costs the friend cohesion and a little morale | Morale, collision | no (formations pass through) |
| G-08 | A routed battalion rallies | Comes back brittle (worse quality), and shattered after its second rout | Morale | yes |
| G-09 | A battalion stands under artillery fire for 10 minutes with light losses | A slow pressure: being shot at with no reply wears it down, more for recruits | Morale | no (losses only) |

## H. Experience

| Id | Situation | Should | Model | Today |
|---|---|---|---|---|
| H-01 | A recruit battalion survives a firefight it wins | It gains experience; after a few such fights it is a level up | Experience | no |
| H-02 | A veteran battalion loses half its men and is filled with recruits (between battles, later) | Its level falls toward the recruits' | Experience | no |
| H-03 | Two battalions of one level, one with a commander near (S2) | The commander's adds to morale; experience does not stack with it beyond a cap | Experience, morale | no |
| H-04 | A level 4 battalion against two level 1 battalions | It can hold its own for a while, not win outright: experience is a large edge, not a doubling | Experience | no |
| H-05 | A battalion gains a level during a battle | A small step, visible on the panel, never a sudden reversal of a fight | Experience | no |

## I. Movement, ground and collision

| Id | Situation | Should | Model | Today |
|---|---|---|---|---|
| I-01 | A line marches through a wood | Slow, disorder grows, the line comes out ragged and must dress | Movement, cohesion | yes |
| I-02 | A column of route on a road | Faster than over fields | Movement | yes |
| I-03 | A line meets a stream too deep to wade | Halts at the bank; does not wade in | Movement | yes |
| I-04 | Infantry crosses a ford | Wades, slowly, disordered | Movement | yes |
| I-05 | Guns at a ford too deep for them | Halt; infantry beside them crosses | Movement | yes |
| I-06 | A battalion is ordered to a point behind another friendly battalion | It goes around, or passes through it at a cohesion cost to both if ordered through; it never stands inside it | Collision, pathfinding | no (passes through) |
| I-07 | Two enemy formations meet without a charge | They do not overlap: they halt in contact, and a melee or a firefight follows | Collision | no (pass through) |
| I-08 | A regiment gallops through its own infantry | Not allowed as free: it goes around, or both are disordered | Collision | no |
| I-09 | Skirmishers pass through a friendly line | Freely (they open and close ranks) | Collision, categories | no |
| I-10 | A line climbs a steep hill | Slower; the slope decides; too steep is impassable by kind | Movement | yes |
| I-11 | A battalion runs (quick time, double time) | Faster, at a cohesion and fatigue cost | Movement modes, fatigue | no |
| I-12 | A unit marches all day, then fights | Tired: slower, weaker in melee (later) | Fatigue | no |
| I-13 | A formation crosses a hedge | Slowed and disordered; cavalry may jump a low one; guns need a gap | Movement, ground (barriers) | partly (hedge is a class) |
| I-14 | A village street | A column passes; a line cannot; buildings are impassable (not dense wood) | Movement, ground | partly (buildings read as dense wood) |

## J. Pathfinding

| Id | Situation | Should | Model | Today |
|---|---|---|---|---|
| J-01 | Ordered across the stream, a ford 300 m away | The formation goes to the ford, crosses, and continues | Pathfinding | no (halts at the bank) |
| J-02 | A 93 m line ordered through a 20 m gap between woods | It forms column (route or attack) to pass, and re-forms line after, or the path goes round | Pathfinding, clearance | no |
| J-03 | A path with turns | Taken in march column; the formation re-forms on arrival, with the change time | Pathfinding, movement modes | no |
| J-04 | A short advance in line, under 30° off the line's front | Straight, in line, no column | Movement modes | yes |
| J-05 | The path goes past an enemy within its range | The path's cost includes the enemy's fire (later, with the AI's influence maps); for now the player picks the route by waypoints | Pathfinding | no |
| J-06 | Forty formations ordered at once | Paths found over a few ticks, not one; nobody waits more than about a second | Pathfinding (time-sliced) | no |
| J-07 | A target point that cannot be reached | The formation goes as near as it can and says why | Pathfinding | partly (halts) |

## K. Light troops

| Id | Situation | Should | Model | Today |
|---|---|---|---|---|
| K-01 | Skirmishers in front of a line, enemy line at 150 m | They pick off men, the enemy line's fire does little to them | Categories, fire | no |
| K-02 | Skirmishers caught by cavalry in the open | Cut down, unless they run to a square, a wood or behind their line | Categories, charges | no |
| K-03 | Skirmishers fire on a battery | They kill gunners steadily: guns cannot fire canister at such a spread target well | Categories, fire | no |
| K-04 | Light infantry in a wood | At home: little disorder, good cover | Categories, ground | no |
| K-05 | Light infantry forms line | It can; it fights as line infantry of its level | Categories | no |
| K-06 | Light cavalry screens the army | Sees far ahead (vision, S2) and shadows the enemy | Categories, vision | no |

## L. Combined arms (the triangle)

| Id | Situation | Should | Model | Today |
|---|---|---|---|---|
| L-01 | Cavalry threatens a line while the enemy's line advances | The line must choose: square (safe from horses, beaten by the line's fire) or line (beats the line, risks the horses) | Counters | yes |
| L-02 | Cavalry forces a square, guns then fire on it | The square suffers terribly; the real counter is the gun, the horse only sets it up | Counters | yes |
| L-03 | A battery without infantry near it, enemy cavalry about | The battery is lost if the cavalry reaches its flank | Counters | partly |
| L-04 | Infantry in line supports its battery | The cavalry that overruns the guns is then shot or charged by the line | Counters | partly |
| L-05 | A column attack on a line weakened by guns first | The line breaks at the assault's test | Counters, assault | no |
| L-06 | Cavalry against cavalry to save the guns | The counter-charge wins if fresh, and saves the battery (the S1e result) | Counters | yes |
| L-07 | Skirmishers ahead of a column | They screen it: the defending line's fire is split, and its skirmishers driven off | Counters, light | no |
