---
status: draft
last_reviewed: 2026-10-30
---

# Proposal: formations, each with its strengths and weaknesses

For discussion with the owner before any code. A unit is one block of 240 figures (decision 0076; the division
scale, `docs/proposals/division-scale.md`) with five formations: line, thin line (British only), attack column,
square and march column. The owner asked that each give clear strengths and weaknesses, as in Total War, and that
changing formation and the flanks matter. Two research notes back it: `docs/research/formations-history.md` (what the
formations did; its numbers marked by how well they are sourced) and `docs/research/formations-in-games.md` (how
Total War, Lines of Battle, Scourge of War, Grand Tactician and Ultimate General model them).

## 1. Principles (from the research)

1. **One strength and one weakness each, on a few shared axes,** so a player reads a formation the way Total War
   players read a unit: the line shoots, the column holds and strikes, the square stops cavalry and suffers guns, the
   march column moves. Lines of Battle does exactly this and is the clearest of the games surveyed.
2. **Flanking is mostly a morale weapon.** Every game puts the large flank and rear multipliers on morale; the extra
   losses come from geometry (more muskets bear on the flanked unit, its own cannot answer). Our sectors model (U1)
   already works this way: exposure by sector, the back exposed's drain, the charge's shock by side.
3. **The square beats cavalry by behaviour, not by a number:** horses refuse to close (our charge's refusal and
   bracing). Its price is a clear weakness everywhere: it cannot move, and it is a dense target for guns and muskets.
   The counter is the combined-arms one: cavalry pins it, guns and skirmishers shoot it.
4. **A change of formation is a commitment and never an escape:** it takes time, the unit is weak while it lasts, and
   it never cancels a flank or rear attack already under way (Napoleon: Total War's "form square when charged in the
   rear" exploit). We already refuse a change in melee.
5. **Show it:** every active modifier is a status on the unit (Scourge of War's "Getting flanked"). Ultimate General was
   criticised because units broke "with no warning".

## 2. The formations (first guesses, against the 3-rank line)

| | Line (3 ranks) | Thin line (2 ranks) | Attack column | Square | March column |
|---|---|---|---|---|---|
| **Shape** (240 figures) | 80 × 3, about 54 m | 120 × 2, about 78 m | about 20 × 12 | four faces, 4 deep | about 4 × 60 |
| **Musket fire** (share that fires) | 1 | 1.5 | 0.3 | 0.25 a face (0.5 at a corner) | 0 |
| **Hits taken** (muskets, canister) | 1 | 0.8 | 1.3 | 1.4 | 1.2 |
| **Roundshot** | from the geometry: a ball through a deep block strikes more men (already so) | | | | |
| **Morale shocks taken** | 1 | 1.25 | 0.75 | 0.8 | 1.25 |
| **Melee and assault** | 1 | 0.7 | 1.4; may assault | 0.6; cannot charge | 0.5 |
| **Against cavalry** | fires; ridden down in the flank | the same, worse (the flank shock × 1.25) | second best, head on (§ 2a) | braced: most charges turn away | helpless |
| **Flank exposure** (U1) | 1.8 | 2.2 | 1.2 | none | 1.5 |
| **Flanked from** (U1, the sector blend) | about 80° off its front | about 80° | about 40° | never | about 60° |
| **Pace** | ordinary; halts to dress in rough ground | ordinary, slower to wheel | ordinary, does not halt to dress | cannot move (the owner) | route step (fastest) |

Notes:
- **Fire:** a 3-rank line fires about two-thirds of its muskets (its third rank is useless, history § Line); the
  2-rank line fires all of them, so 1.5 ×. A column fires its head only; a square one face. Today's calibration
  stays on the 3-rank line (1).
- **Hits taken** is the exposure the target already has (U1's `exposure` by shape); the column's and the square's are
  today's depth factors (1.6 for a column today, here 1.3 and 1.4). Losses stay losses: the morale row multiplies
  shocks and the drain, never what men lost cost (U2: losses are hit points).
- **Morale shocks taken** makes the column the shape that holds (Lines of Battle: −40%) and the thin line the shape
  that frays.
- **Melee and assault** multiplies melee strength and the assault's shock (U3's `assault.column` becomes this row).
- **Flanked from:** today every shape's sector blend is 45°; per shape, a column is flanked from about 40° off its
  axis, a line only from about 80° (Lines of Battle's limits: column 38°, line 79°).

## 2a. Bracing by the side struck (the owner: the column is second best against cavalry, head on)

Bracing (`bracedOf`, `docs/systems/melee.md`) gives the charge its chance to turn away, and cuts its impact and its
losses. Today a shape is braced or not; here it is braced by the side the charge strikes (its weights, U1):

| Side struck | Square | Attack column | Line | Thin line | March column |
|---|---|---|---|---|---|
| Front | 1 | 0.5 | 0 | 0 | 0 |
| Flank | 1 | 0.25, the flank's shock × 0.7 (a dense block) | 0 | 0, the flank's shock × 1.25 | 0 |
| Rear | 1 | 0 | 0 | 0 | 0 |

A column struck head on turns about half the charges away and takes half the impact; from the side it is tougher
than a line, far weaker than a square; from behind as open as any. Its weakness is the guns and the muskets (hits
taken × 1.3; roundshot through its depth; its own fire 0.3).

## 3. Changing formation

| From → to | Today (battalion) | Proposed (division block) |
|---|---|---|
| Line ↔ thin line | n/a | 20 s |
| Column → line / line → column | 40 s / 30 s | 40 s / 30 s |
| Column → square | 60 s | 30 s (the closed column forms square fastest) |
| Line → square | 100 s | 90 s |
| Square → line / column | 60 s / 30 s | 60 s / 30 s |
| March → any / any → march | 60 s / 20 s | 60 s / 20 s |

- **While changing:** it does not fire; against cavalry it is braced only by its progress into a square (B-05); in
  melee it counts as fully disordered; it takes the lower of the two shapes' morale row and the higher of their hits
  taken.
- **Under fire** (U3): × 1.3 the time, and disorder at the end.
- **Never an escape:** no change in melee (as today); a change does not end a flank or rear charge already under way
  (the charge's side is fixed at its impact).

## 4. Scenarios (to add to `docs/proposals/unit-scenarios.md` § B)

| Id | Situation | Should |
|---|---|---|
| B-11 | A 3-rank line and an attack column exchange fire at 50 m | The line wins clearly (fire 1 against 0.3) |
| B-12 | An attack column assaults a recruit line (level 1), or a shaken one | The line breaks at the assault's test, before contact |
| B-13 | The same column assaults a steady line in close volleys | The column stalls or breaks (Bugeaud: the volley, a cheer, the charge) |
| B-14 | A square is charged by cavalry | It holds; the cavalry turns away blown |
| B-15 | A square is held by cavalry while a battery fires on it | It bleeds fast and breaks long before a line would (the 27th at Waterloo) |
| B-16 | A thin line against a 3-rank line, at 50 m | The thin line wins the firefight (1.5 times the fire) |
| B-17 | Cavalry charges a thin line in the flank | It is destroyed in minutes (Albuera); a 3-rank line lasts a little longer |
| B-18 | A line forming square when cavalry arrives | Struck at its partial bracing (B-05); the line caught half-formed is lost (Quatre Bras' 69th) |
| B-19 | An attack column takes a line's fire in its flank | Enfiladed through its depth; its morale breaks (the Guard and the 52nd at Waterloo) |
| B-20 | A column fights through rough ground against a line | The column keeps its pace and order; the line halts to dress |

## 5. The unit's info box (the owner: for us to debug first)

One box for the selected unit, showing every number the sim uses on it, as Total War's unit card does:
- **who:** formation and fire mode, figures (× 25 men), level and its points toward the next;
- **morale:** the bar, effective and maximum, the shocks and the drain on it, the flanks secured, the state;
- **strengths:** toughness, musket fire (formation × precision × reload), melee strength, hits taken;
- **ranges:** long, close and bayonet, and the distance to the nearest enemy;
- **threats:** each enemy that threatens it and from which side (front, flank, rear, by weight), under fire, changing
  (with its progress), in melee.

It replaces the page's one-line summary for the selected unit; statuses for players come later.

## 5a. How the code holds it (the owner: structured so every number can be tuned later)

Every number in §§ 2, 2a and 3 is ruleset data, read through one place, so tuning never touches the sim's rules.

- **One table, a row per shape:** each unit type's shape gets a `traits` block in the ruleset (`src/rulesets/
  napoleonic.ts`): `fire`, `hitsTaken` (front, flank, rear: today's `exposure` and the kind's `fire.depth` folded in),
  `shockTaken`, `melee` (today's `melee.strength` by kind folded in), `assault`, `brace` (front, flank, rear),
  `flankShock`, `flankFrom` (the sector blend's angle), `moves`, `charges`. A field left out is neutral (1, or the
  rule's default), so a new formation or a new ruleset names only what differs.
- **Compiled once:** `compileRuleset` turns the rows into flat typed arrays indexed by type and shape (as the change
  times are today), so the hot loops read an array, never an object, and determinism is unchanged (decision 0006:
  multiplications of data, no new maths).
- **One accessor:** `src/sim/traits.ts` gives a formation's traits as they stand, and is the only place that knows a
  change is under way: the blend while changing (§ 3: the lower morale row, the higher hits taken, bracing by
  progress) is written once, there. Fire, artillery, melee, morale, sectors and movement read it; none reads a
  shape's name or a kind to decide a strength.
- **Guards:** each field's range is checked when the ruleset is compiled (multipliers above 0, bracing in 0..1, a
  square's `moves` false, a shape that `charges` has the fix bayonets mode), so a bad tune is refused, not played.
- **The same numbers everywhere:** the info box (§ 5) reads the accessor, so what it shows is what the sim uses.
  A new report tool prints the table from the ruleset, and the calibrations and tests take
  a ruleset variant (`{ ...napoleonic, ... }`), so a tune is tried without editing the shipped one.
- **The first step is a pure refactor:** today's per-shape and per-kind numbers move into the table with the same
  values, proven by the goldens not changing; the new values come after, each with its scenario.

## 6. The owner's answers (2026-10-30), and what is open

- The square cannot move. The column is second best against cavalry, head on (§ 2a), and weak to guns and muskets.
  Ordre mixte is deferred. The info box (§ 5) comes first, for debugging. The thin line is the British only.
- **Open:** the bracing numbers of § 2a; the size of the modifiers (Total War-sized, 20–50%, unless the owner wants
  them subtler).
