---
status: draft
last_reviewed: 2026-10-12
---

# Proposal: the enemy AI

An enemy that is hard to beat because it fights well, not because it has more men. Written early to keep
the ideas; it is built after S1's playtests, with pathfinding and group moves in place (§ Prerequisites).
`docs/proposals/sim-design.md` §12 holds the short form; this is the long one.

## Context and goals / non-goals

A weak AI is one of the main reasons players leave small studios' wargames. Their usual fix is to cheat:
more units, more resources, perfect information. This game has no economy, so there is nothing to boost:
its difficulty has to come from decisions.

What makes a wargame AI feel stupid is mostly a short list of failures:
- feeding units in one at a time;
- never keeping or committing a reserve;
- attacking fronts and ignoring flanks;
- leaving guns unsupported;
- marching columns under canister;
- letting a shaken battalion stand until it routs.

Each is a decision that can be named and fixed by hand. Napoleonic doctrine is well documented and gives the
AI its vocabulary:
- combined arms: cavalry forces squares, guns punish squares and columns, infantry holds ground;
- reserves held back and committed when the enemy's line wavers;
- flank attacks;
- pulling a shaken battalion back to rally.

**Goals:**
- **Honest difficulty:** it sees only what its side sees (once vision exists, S2), and gets no extra men or
  better rules.
- **Plays like a general of the period:** combined arms, reserves, timing.
- **Explainable:** we can see why it chose what it chose (a debug view of its maps and scores).
- **Difficulty levels** made from its decisions, not its numbers.
- **Follows a scenario's historical plan** where one is given, and adapts it.
- **Measurable:** its strength is a number from AI-against-AI runs that tests can keep from regressing.

**Non-goals:**
- a learned (machine-learning) opponent as the main AI (§ Alternatives);
- superhuman micro-management: the battalions' standing behaviours already do the small decisions;
- an AI for the operational level (marches between battles).

## Design

### Layers

Each layer works through the same commands the player sends (`docs/proposals/sim-design.md` §4):

| Layer | Decides | How often |
|---|---|---|
| **Army** | the objective, where to attack and where to hold, what goes to the reserve | every 30–60 s and on events (a brigade broken, a flank turned) |
| **Brigade** | the brigade's line, its supports, the battalions' shapes, when to advance, halt, fall back, charge | about every 1 s, time-sliced across brigades |
| **Battalion** | firing, the square against cavalry, falling back when wavering | every tick: the standing behaviours, already built |

The scenario's plan (`docs/systems/sides.md`) becomes the army layer's starting orders: "take the village by
the 20th minute" instead of "march to (x, z) at 300 s".

### Seeing the battlefield: influence maps

Coarse grids over the map, about 20–30 m a cell, rebuilt every few seconds:
- **threat:** the enemy's fire that reaches each cell (muskets, canister, roundshot lanes);
- **strength:** each side's men in the fight near each cell;
- **ground:** cover, height, the slope's reverse side, ground cavalry cannot charge over;
- **control:** whose ground it is, and where the front runs.

Questions become sums over cells: "is this ford covered by guns?", "where is their line thinnest?", "is our
flank in the air?". The maps are cheap, and drawn on the staff map they are the debug view.

### Choosing: utility scores

At each decision the layer scores its options and takes the best:
- **the options:** attack here, hold, refuse a flank, commit the reserve, pull back to rally, change shape;
- **the scores:** read from the influence maps and the formations' state (strength, morale, ammunition
  later);
- **the weights:** data, per AI personality ("cautious", "aggressive") and per difficulty;
- **noise:** a little, from the sim's seeded random numbers, so that it is not predictable;
- **commitment:** a chosen option keeps a bonus for a while, so the AI does not dither between two.

### Thinking ahead with the sim

The sim is deterministic and runs headless, so the AI can copy the world and play a candidate plan forward
to see how it turns out: "if the second line crosses now, what does the stream cost it?". Few games can do
this; it is the step from scripted to thinking.
- **Scope:** a few candidates for the army layer's large decisions, a few minutes ahead, not every brigade
  decision.
- **Cost:** a world copy (the save path) and some thousands of ticks per candidate. It has to be measured;
  a cheaper abstract model (strength and fire rates per sector) is the fallback.
- **The enemy's moves in the lookahead:** the other side runs its own standing behaviours and a simple
  guess of its orders (holds, or continues what it is doing).

### Difficulty

- **Easier:** slower reactions, more noise in the scores, no lookahead, a reserve committed too early or too
  late.
- **Harder:** quick reactions, sharp timing, lookahead.
- **Never:** extra men, better rules, or sight it has not earned. A scenario may be hard on purpose by being
  outnumbered historically.

### Tuning and testing

- **Tournaments:** thousands of AI-against-AI battles run headless (Node, workers), with the weights tuned by
  a search over the results. This is where learning fits cheaply: the AI stays hand-built and readable; only
  its numbers are learned.
- **A strength test:** a fixed set of scenarios and opponents gives a score that CI keeps from falling.
- **A sparring agent:** an AI built to find exploits in our rules and in the main AI (a search, or later a
  learned agent). Players never meet it.
- **Replays of its failures:** a playtest replay where the AI did something stupid becomes a test.

### Where it runs

Two ways, to decide before building (§ Open questions):
- **In the tick**, like the plan today: deterministic, nothing logged, the replay re-derives it. Its cost is
  in the tick's budget, and a lookahead inside a tick is hard to afford.
- **Beside the sim, as a player:** it reads the world, thinks (in its own worker, with the lookahead) and
  sends stamped commands that are logged like the player's. The replay plays its commands, so it may be
  non-deterministic and slow.

## Prerequisites

In the order the AI needs them:
1. **Pathfinding** (`docs/proposals/sim-design.md` §7): an AI cannot turn a flank it cannot reach. Today a
   formation marches straight and halts at what it cannot cross.
2. **Group moves:** a brigade ordered as one, its battalions keeping their places in the line.
3. **Vision** (S2): for the AI to be fair.
4. **The sim in a worker** (S2): the room to think.
5. **Commanders, ammunition and fatigue** (S2–S3): the AI's decisions need them (a brigade out of
   ammunition pulls back; a commander lost delays orders).

## Phases (later; numbered when planned)

1. **The brigade layer** with influence maps and utility scores; the scenario's plan as its orders. Ends
   with: the AI beats the plain script in a tournament, and players say it uses its reserve.
2. **The army layer:** objectives, reserves, reacting to events.
3. **Tournaments and tuning:** the strength test in CI; personalities and difficulty levels.
4. **Lookahead** for the army layer's large decisions, if its cost measures well.
5. **Learning, if it is still wanted:** a learned position score inside the lookahead, or the sparring agent.

## Alternatives considered

- **A learned opponent (reinforcement learning) as the main AI.** Rejected for now:
  - **cost:** the RTS agents that beat strong players (DeepMind's AlphaStar) took a research team and
    enormous compute;
  - **it goes stale:** every balance change, map or new rule changes the game it learned, and the game is
    being tuned constantly;
  - **hard to shape:** it finds exploits rather than playing in the period's manner, and is hard to weaken
    gracefully for difficulty levels or to make follow a scenario's plan;
  - **opaque:** when it does something stupid we cannot see why.

  Kept in narrow places (tuning, the sparring agent, a learned position score) once the rules settle.
- **Cheating for difficulty** (more men, full sight). Rejected: the problem this proposal exists to avoid.
- **Behaviour trees alone.** They suit fixed sequences; the decisions here are weighing ones, which utility
  scores make explicit. A behaviour tree may still run a chosen option's steps.
- **Planners (GOAP, HTN).** Possible for the army layer later; utility scores and lookahead come first, being
  simpler to tune.

## Drawbacks

- Hand-built AI is a long tail of special cases; the tournaments and the failure replays are what keep it in
  check.
- The lookahead may cost too much at 40 formations; the abstract model is then the fallback, and weaker.
- Influence maps at 20–30 m miss small terrain (a hedge, a ford's width), so pathfinding has to answer
  those.

## Open questions

- **Where it runs:** in the tick (deterministic, unlogged) or beside it as a player (logged commands, free to
  think in a worker). Leaning towards beside it, as a player.
- **The lookahead and fog of war:** with vision on, the AI must not look ahead in the true world, only in a
  world built from what it has seen. How to build that guess is open.
- **The lookahead's cost:** how many ticks a second the copied world runs at 16 and at 40 formations.
- **How strong is strong enough:** what score in the tournaments, and which playtest feedback, means "done".

## Review

Not yet reviewed.
