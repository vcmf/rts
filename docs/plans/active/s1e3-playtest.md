---
status: active
last_reviewed: 2026-10-12
---

# Plan: S1e-3, the playtest

The last part of S1e (`docs/plans/active/s1e1-battlefield.md`, the split), and S1's acceptance
(`docs/proposals/sim-design.md` §17): **a 20-minute fight of about 6 battalions per side is fun at 2× speed**. Only
you can judge that, so S1e-3 is your play and the tuning that follows from it, in three PRs:

| Part | Scope | Ends with |
|---|---|---|
| **S1e-3a** (this PR) | The playtest kit: marking moments while you play, saving the session to a file, and a report that plays a session back and says what happened; a first read of the battle with no orders | You play, mark what feels wrong, and send the file |
| **S1e-3b** | Tuning before your play: the faults the first read found, fixed without human eyes, measured with the report and scripted defences | With no orders you lose; a defence that uses its arms wins |
| S1e-3c | Tuning from your sessions: the scenario, the plan, the rules' numbers | S1's acceptance, or a list of what blocks it |

## The problem

- A playtest's feedback is "around the 15th minute my line did something odd". Neither of us can see that moment
  again: the page's replay goes to the clipboard, and nothing reads it but the replay check.
- Nothing says what happened in a battle (who routed when, who formed square, who fought whom) without watching
  it.

## Design

### On the page

- **M marks a moment.** The battle pauses while you type what happened (optional), then goes on. Marks are not
  commands and are not in the sim.
- **Save session** (the button that was Copy replay) downloads the session as `<scenario>-<date>.json`: the replay,
  its hashes and the marks.

### The report (`tools/battle-report.ts`)

`node tools/battle-report.ts <session.json>` checks that the session reproduces, plays it in Node and prints a
timeline:
- each formation's morale states, shapes and changes, square against cavalry, charges and melees, leaving the
  field;
- each side's share in the fight every minute, and the result;
- at each mark, every formation's shape, state, men and place;
- at the end, each formation's shape, state and men against its spawned men.

`node tools/battle-report.ts s1e-battle [minutes]` runs the scenario with no orders: what the plan does against a
side that stands.

## How to playtest

1. `npm run dev`, then open `/app/?scenario=s1e-battle`. Play at 2× (key 2).
2. Press **M** whenever something feels wrong, dull or great, and say a few words.
3. At the end (or when you stop), press **Save session** and send me the file, with anything you noticed overall.

Worth watching:
- the opening: how long until something happens;
- the square against cavalry: how often, and how long, a charge pins your infantry;
- the firefight: is it decisive, or do lines trade shots until the time limit;
- the guns: do they matter;
- the end: is half the men out of the fight the right point (`end.broken`).

## A first read: the battle with no orders

`node tools/battle-report.ts s1e-battle`, 40 minutes at the page's seed (`PAGE_SEED`), your side standing where it
deploys:
- **A slow opening.** The first losses come at about 8 minutes, when side 1's regiment charges (its plan's 480 s);
  at 2× that is 4 minutes of watching.
- **One charge pins a whole side.** The regiment's charge put all six of your battalions in square, the second line
  100 m behind too, for 3–4 minutes (10:26 to 14:19).
- **An indecisive firefight.** Side 1's first line halts about 120 m from yours, at long musket range. In 40 minutes
  three battalions and the regiment rout, and all rally; none shatters. The limit finds a draw: 90% of your side
  in the fight against 88%.
- **Side 1's first line arrives piecemeal.** Its middle battalion (unit 9, x 80) marches its eastern flank along
  a hedge that runs north–south at x ≈ 110 from z 120 to 200, and the line keeps to the hedge's pace (0.2): 90 m
  in 8 minutes, 4–5 minutes after its neighbours. The plan's line or the hedge moves in S1e-3b.
- **Half the armies never fight.** Both second lines and both batteries lose no man; your regiment never charges.
  Side 1's second line stands in column 50 m behind its first.

These are a standing side's battle, not yours. They are what the playtest tests first, not tuning to do blind.

## Acceptance

- `test/battle-report.test.ts`: a recorded session with an order and a mark reports the order's change of shape,
  the mark with every formation's place, and the end table; a session whose hashes do not match is refused; with
  no session, the scenario runs with no orders.
- `npm run check:app`: the battle marks a moment through the page, and the report of the page's session, played in
  Node, has the mark and the result.
- Lint, typecheck, `check:docs`.
- **Docs:** `docs/systems/sim-page.md` (the keys, the session file, the report).

## Non-goals

- Tuning: S1e-3b, from your sessions.
- Recording what you saw (the camera, the selection): a session replays the battle, not the screen.

## Review

**Round 1** (`/code-review high`, 10 findings, none severe; no second round). All fixed:
- the no-orders report ran at seed 1, not the page's: the seed is `PAGE_SEED` (`src/scenarios/page.ts`), shared by
  the page and the report, and the first read above is redone at it (a draw, not side 1's win);
- a session was played twice, once to check it and once for the report, the second loop a copy of `play`'s: `play`
  takes an observer of each tick, and the report is built in the one checked pass;
- the script's entry check failed silently through a symlink or a path needing escapes: it compares real paths;
- the data file was read from the working directory, without its version: it is found from the tool's own place
  and checked against `MAP_VERSIONS`; every error exits 1 with a message;
- a pursuit was reported as a charge, and a target gone from the field as `#-1`;
- the download's link was revoked in the same task as its click, which some browsers cancel: it is revoked later;
- Cancel on the mark's prompt still marked: it marks nothing; the pause around the prompt did nothing (the prompt
  holds the page) and is gone; Cmd+M (minimise) no longer marks;
- `check:app` crashed on a missing session line, and left out the default map.

## S1e-3b: tuning before your play

Each fault of the first read, its cause, and what changed (measured with `tools/battle-report.ts` and with
throwaway probes: shots fired per formation, positions over time, results over eight seeds):

| Fault | Cause | Change |
|---|---|---|
| Side 1's eastern battalion faced nothing | side 1 was side 0 turned through the centre, so its lines attacked at x 200, 80, −40 against yours at −200, −80, 40 | side 1 is placed and planned on its own: four battalions up, two back, closing opposite and overlapping your line |
| A battalion crawled 90 m in 8 minutes | its 93 m line straddled the hedge at x 110 and kept to the hedge's pace | every first-line battalion comes straight down clear of the hedge to the north bank, then obliques across the stream (and, for the western two, the marsh) |
| The lines arrived one at a time | different paths and the marsh | three legs: the north bank, a halt at about 130 m to dress, the final advance together |
| The batteries never fired | each faced straight ahead (arc ±20°) from a flank where no enemy came | yours stands on your first line's eastern flank, turned 25° inwards: its arc sweeps the ground in front of the line, which no friend masks. Side 1's stands west of its first line, turned 25° inwards: it fires past its line while that comes down, and is masked by it once it closes |
| One charge put a whole side in square for 4 minutes | the regiment charged into the middle of the line, then rested and stood within 200 m of every battalion | it charges your battery on the flank, then rides back: only the battalion beside the battery squares, for about 3 minutes (the rule is unchanged; a rule change was tried and withdrawn, see the review) |
| The regiment loitered in your lines for 30 minutes | the plan ended with the charge | it charges your battery, then rides back over the stream (a timed step, 630 s: it moves once its rest is over; a charge ends by clearing its orders, so a move appended to it is lost) |
| A standing defender won easily | a halted line fires from 250 m and a marching one cannot; the defender's battery swept the approach | side 1's infantry are veterans (quality 0.85) and overlap your line; its regiment goes for your guns |
| Nothing was decided in 40 minutes; the limit gave a draw | at `end.broken` 0.5 a side whose first line had routed fought on, and its rallied battalions (at the map's edge) counted as in the fight | `end.broken` 0.65: a side with 35% of its men out of the fight is broken, and the battle is decided at 17–20 minutes. The quiet after it remains: the rallied battalions come back into the count, and nothing more happens (the result stands; the open question is in `docs/systems/sides.md`) |
| Side 1's second line never fought | the plan halted it 100 m behind | in column behind the centre, it halts on the north bank clear of the stream, and at 15 minutes comes up to about 25 m behind the centre's two, beyond the hedge they crossed, to fill the line as it breaks |

**Results**, eight seeds each (seeds 1–7 and the page's); a defence scripted as a player might play it:

| Your side | Result |
|---|---|
| No orders | side 1 wins at 17.4–19.6 min |
| The reserves extend both flanks | either: side 1 on four seeds (19.1–20.4 min), you on four (17.8–20.7 min) |
| Your regiment counter-charges theirs, saving your battery | you win at 11.3–13.0 min |
| Both | you win at 12.9–14.5 min |

Along the way: with ordinary quality (0.75) attackers and `end.broken` 0.65, a standing defender won every seed at
17–19 minutes; at 0.5 almost every battle was a draw at 40 minutes.

**What this leaves for your play:**
- the centre's two battalions of side 1 cross a hedge (the northern edge of the field in front of your line, z −135)
  on the final advance; they come on slowly and fight from about z −150, 10 m short of the others;
- the regiment's ride back is timed: if you delay its charge, the step can cut it short;
- the battle turns on one decision, the guns; whether that is a good puzzle or a trap is yours to say;
- a defender who saves its guns wins in about 12 minutes, maybe too fast;
- side 1's plan still does not react: a second wave goes in at 15 minutes whatever has happened.

**The goldens:** every one changed its ruleset hash (`end`; the hash is in every state hash). Only `s1e-battle`
changed behaviour: with `end.broken` set back to 0.5, the page's charge reproduces `main`'s golden exactly. `SIM_VERSION` is `s1e.3`.

### Review (S1e-3b)

**Round 1** (`/code-review high`, 9 findings, one severe; a second round follows):
- **Severe:** a blown regiment was left out of both the threat and the hold. A square near it formed back after
  `refuge.hold`, then formed again the moment its rest ended, while it still stood within 200 m (your #5: three
  changes in three minutes). Fixed by a narrower rule, which round 2 withdrew (below).
- **Fixed:**
  - "more than a third" was 35%;
  - three rows of the results were four seeds: all are eight now;
  - the second line's spacing in the comment;
  - the plan's unit numbers were hand-kept beside the rows: the rows carry their part and the x they fight at,
    and the plan finds its units from them.
- **Noted, not changed:**
  - `end.broken` treats a symptom: rallied battalions at the map's edge count as in the fight (`fightShares`).
    Counting them out is a rule of its own, open in `docs/systems/sides.md`, for your play to weigh;
  - the regiment's timed ride back, and the hedge on the final advance (above).

**Round 2** (`/code-review high`, 9 findings, three severe). The blown-regiment rule of round 1 was still wrong in
two ways: it began the threat 30 s before the rest ended, while a square takes 60–100 s to form (a battalion could be
caught mid-change); and a threat coming back mid-spell forgot a player's stand-down. Both came from changing the
rule to fix what was a scenario fault (the regiment charged into the middle of the line and stood there), so:
- **Withdrawn:** the rule change. `src/sim/melee.ts`, its doc and its tests are `main`'s again: cavalry near, blown
  or not, holds a formed square, and threatens. The scenario's fix (the regiment charges the battery on the flank
  and rides back) is enough: one battalion squares for about 3 minutes.
- **Fixed, severe:** side 1's battery, copied from yours through the centre, stood behind its own four-wide line and
  fired through it. It stands west of the line now (107 volleys in the first 20 minutes).
- **Fixed:**
  - the second wave was sent into the 27 m gaps of its own firing line: it comes up in column to about 40 m behind
    the centre;
  - veteran quality is a field of the rows, and a line's battalion must carry the x it fights at (a type, not a
    `!`).
- **Noted, not changed:** the regiment's timed ride back (above).

The results above are measured again after round 3, on eight seeds.

**Round 3** (`/code-review high`, 9 findings, none severe; the review stops here). It confirmed the ruleset change: run
at `end.broken` 0.5, every older golden reproduces, and each of their scenarios ends on the same tick with the same
winner at 0.5 and 0.65. Fixed:
- side 1's western second-line column halted with its rear in the stream and the marsh for six minutes: the second
  line halts on the north bank at z 40;
- the docs said the second wave came up 40 m behind the line (25 m, beyond a hedge), that the first line obliqued on
  open ground (it crosses the stream and the marsh), "17–19 minutes" (17–20), `s1e-battle` "holding fire" in
  `docs/systems/sim-page.md`, and `end.broken` 0.5 in the S1e-2 plan;
- nothing pinned the threshold or the tuning: a test breaks a side at 60% in the fight (in the fight at 0.5, out at
  0.65), and a long test plays the battle with no orders at the page's seed to side 1's win;
- the report test's end table is exact again;
- one helper numbers the units; side 0's rows carry no fight x.
- **Noted:** the quiet after the result (above); `check:app` runs in CI only on PRs into `main`, so it was run
  locally: every scenario passes, the battle ends in side 1's win at 19.2 minutes, its replay reproduces and the
  report finds the mark and the end.

