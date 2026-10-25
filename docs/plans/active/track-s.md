---
status: active
last_reviewed: 2026-10-25
---

# Plan: Track S, the sim engine to a battle worth playtesting

Track S is the logic track: `src/sim`, `src/rulesets`, `src/scenarios`, the sim page (`src/app`) and their tools
and tests. Its phases come from `docs/proposals/sim-design.md` §17. S1 has combat, sides and an end. What it lacks
before the playtest is movement over real ground and an enemy that reacts. This plan gives the order of the remaining
work. The epic branch `epic/sim-engine` collects it, and its tracking PR merges into `main` with a merge commit, as
Track M's does.

## How the epic works

- Each phase is a PR into `epic/sim-engine`, with its own plan in `docs/plans/active/`, reviewed with
  `/code-review high`, and squash-merged.
- `main` is merged into the epic regularly, so Tracks E and M see the sim's changes and conflicts surface early.
- The renderer reads `SoldierLayer`, `Man` and `volleyTick`: changes to them stay backward compatible, or the PR
  says so.
- Engine code names no era's unit, weapon or formation (decision 0015).

## Phases

| Phase | What | Why now |
|---|---|---|
| **S1e-3** | The playtest kit (marks, the session file, the battle report) and the tuned S1e battle (#51) | In review; the tools every later phase is tuned with |
| **U1–U9** | The unit model (`docs/proposals/unit-model.md`, its scenarios in `docs/proposals/unit-scenarios.md`): sectors, experience, closing and the assault, guns taken, categories, collision, ground with Track M; U8 is S1f-3's pathfinding and U9 includes S1f-4's group moves | The owner (2026-10-25): the units' rules first, as the heart of the game's logic, before the enemy that orders them |
| **S1f-1** | The plan reacts: a scenario plan's steps start on conditions (a formation's state, a charge over, a share of a side in the fight) as well as on times; a step survives a melee's pursuit or recoil (#179) | The timed plan is the S1e battle's weakest part: its cavalry rides home on the clock, and its second wave goes in at 15 min whatever happens |
| **S1f-2** | The end of a battle: the side's share in the fight leaves out battalions rallied far behind, so `end.broken` goes back to one meaning for every scenario (#180); the battle stops going quiet after the result | The result is the playtest's verdict, and #180 makes it scenario-specific |
| **S1f-3** | Pathfinding (`docs/proposals/sim-design.md` §7): A* on the cost grid dilated by the formation's width, time-sliced; a path with turns marches in column and re-forms on arrival | A formation today marches straight and halts at what it cannot cross: no flank march, no ford found. The AI needs it first (`docs/proposals/ai.md`, prerequisites) |
| **S1f-4** | Group moves: a selection ordered as one keeps its line, its second line and its intervals, and wheels as a body; drag to set a line's front | Moving six battalions one offset at a time is the page's clumsiest control |
| **S1e-3c** | The owner's playtest of the S1e battle at 2×, with marks and sessions, and tuning from them | After the phases above, so the playtest judges the battle and not its missing parts |

Then S2 (`docs/proposals/sim-design.md` §17): the battle in a worker (`docs/plans/active/battle-threads.md`, decision
0048), vision as a core rule (Track M's fog of war needs it), smoke, commanders, the compact 2 m grids (Track M's
maps over about 2 km need them), and issues #35, #36 and #38. S3 brings the brigade AI (`docs/proposals/ai.md`).

S1f-1 and S1f-2 come after U1–U7: the reacting plan is better written once the units it orders behave by the model. S1f-3 and S1f-4 are the model's U8 and U9. The order can change after each phase; each plan says why if it does.

## Open questions

- **Pathfinding before or after the playtest:** S1f-3 is the largest phase. If the S1e battle plays well without
  flank marches, the playtest could come before it.
