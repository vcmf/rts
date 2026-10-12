---
status: active
last_reviewed: 2026-10-12
---

# Plan: S1e-3, the playtest

The last part of S1e (`docs/plans/active/s1e1-battlefield.md`, the split), and S1's acceptance
(`docs/proposals/sim-design.md` §17): **a 20-minute fight of about 6 battalions per side is fun at 2× speed**. Only
you can judge that, so S1e-3 is your play and the tuning that follows from it, in two PRs:

| Part | Scope | Ends with |
|---|---|---|
| **S1e-3a** (this PR) | The playtest kit: marking moments while you play, saving the session to a file, and a report that plays a session back and says what happened; a first read of the battle with no orders | You play, mark what feels wrong, and send the file |
| S1e-3b | Tuning from your sessions: the scenario, the plan, the rules' numbers | S1's acceptance, or a list of what blocks it |

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

