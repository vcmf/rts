---
status: draft
last_reviewed: 2026-10-08
---

# Vision

*Draft for the owner to edit: assembled from decisions already taken.*

## Pitch

An engine for pre-modern battles, from antiquity to Napoleon (decision 0015), starting with the
Napoleonic era. Command a Napoleonic battle as it looked in the paintings: battalions of real soldiers wheeling,
forming square and breaking under fire, on a living storybook landscape. Zoom out and the battle
becomes a staff map drawn in ink; zoom in and the paper rises into the painted world. The same
renderer produces cinematic history videos.

## Pillars

1. **Readable battles.** A player reads every battalion, its side and its state in under a second,
   on the map and in 3D (`docs/art-bible.md` pillar 1).
2. **Painted, not rendered.** Every surface shows the hand (`docs/art-bible.md` §2).
3. **Drill is the drama.** Formation changes take real time and leave a battalion vulnerable;
   timing a square against cavalry is the game.
4. **A middle scale.** Big enough to feel like a battle, small enough that every soldier is seen.

## Scale

- About 40 battalions per battle, 20 a side, about 400 soldiers each, one figure per soldier (decision 0018).
- Square maps of 2 to 6 km a side, designed for play, 3 km by default (decision 0061); a battle takes 30–45 minutes of
  real time.
- Min-spec a gaming laptop with an RTX 3060. Single-player first, built so multiplayer can be added later (decision 0013).

## Non-goals

- No modern warfare (rifled and industrial weapons and later); eras come as rulesets on one engine.
- No sky, no ground-level camera, no strategic 3D zoom (the far zoom is the staff map).
- No economy, base building or production: battles only.
- No couriers or order delay.
- Not a simulation of every musket ball: musketry is resolved per battalion.
