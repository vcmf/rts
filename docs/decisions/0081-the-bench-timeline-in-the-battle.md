---
status: accepted
date: 2026-10-28
---

# 0081 The bench's timeline lives in the battle; its overlay is a view on the page

How Track S's visual bench (C0, #191: going back to a tick, a tick on, a time to go to, branching, marks; an overlay
of what the sim tests) works with the battle in its workers (decision 0048, `docs/plans/active/battle-threads.md`).
The plan's section: "PR 7".

## Context

C0 was written on Track S while this epic moved the battle off the page: the bench's timeline (`src/app/timeline.ts`)
replaced the page's world when it went back, and its overlay read that world. In the epic the page holds no battle
when it runs in the workers; it reads the frames the men worker publishes and sends the sim worker commands. Merging
`main` (with #181) into the epic needs one design for both.

## Decision

- **The timeline is the battle's** (`src/app/battle.ts`). The log, the hash points and the dropped orders the
  `Battle` kept are the timeline's; a command, a tick, going to a time, a tick on and a mark are the battle's methods.
  So the same code runs on the page's thread and in the sim worker; the page asks the battle, wherever it is.
- **Going to a time is a jump in the tick ring**: the world is written with the ring's jump count raised, and the men
  worker lays its men out again on it, as the page did with a new soldier layer.
- **The overlay is the page's**: it reads the world the page already has every frame. The claim grid, scratch the
  sim builds each tick and no published frame carries, is built again on the page's copy when drawn.

## Alternatives

- **The bench only on the page's thread** (`?thread=main`): the smallest merge, but two architectures in the page,
  and the bench would debug the sim in a configuration the player does not run. Rejected.
- **The overlay computed in the sim worker and published**: a debug view in the frame protocol and its bytes in
  every frame, for a tool that is off almost always. Rejected.

## Consequences

- Going back and on no longer blocks the page: the sim worker plays the ticks.
- The page's bench hooks (`APP.goTo`, `APP.stepTick`) return promises in the worker; `tools/app-check.mjs` awaits them.
- The tick ring and the published frames carry one more counter each (the ring's jumps; a layer's revisions numbered
  on from the last's).
