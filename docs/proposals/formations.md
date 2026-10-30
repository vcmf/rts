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
| **Against cavalry** | fires; ridden down in the flank | the same, worse (the flank shock × 1.25) | partly braced (0.3) | braced: most charges turn away | helpless |
| **Flank exposure** (U1) | 1.8 | 2.2 | 1.2 | none | 1.5 |
| **Flanked from** (U1, the sector blend) | about 80° off its front | about 80° | about 40° | never | about 60° |
| **Pace** | ordinary; halts to dress in rough ground | ordinary, slower to wheel | ordinary, does not halt to dress | cannot move | route step (fastest) |

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

## 5. Questions for the owner

1. **How strong:** these are clear, Total War-sized differences (20–50%). Subtler numbers would read less well.
2. **The square:** immobile, as in Total War and Grand Tactician, or crawling very slowly, as it could historically?
   Immobile is simpler and clearer.
3. **The column against cavalry:** partly braced (0.3), as history suggests (hard to break from the front), or
   nothing, so only the square counters cavalry?
4. **Ordre mixte** (lines and columns mixed, a Napoleonic favourite): a sixth formation between line and column on
   every row, or not for now? Not for now is simpler.
5. **The thin line** needs nations in the ruleset: a British line infantry type that has it. Only the British, as the
   owner said.
6. **Statuses on the page** (flanked, supported, changing, under fire): part of this work, or the page's later?
