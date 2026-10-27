---
status: proposed
date: 2026-10-27
---

# 0075 Battle maps 2–6 km a side, by battle

## Context

Decision 0011 set a play area of 1–1.5 km. Battles that take reinforcements from the campaign
(decision 0074) need room for them to march in by road and for a battle zone around the fight: Austerlitz had a
front of about 12 km, Waterloo's main field about 4 km.

## Decision

We will size each battle map between 2 and 6 km a side, by battle. If accepted, this supersedes 0011's play
area; its min-spec stays.

## Consequences

Good: arrivals by road, flanks and a battle zone fit on the map.

Bad: the engine's budgets (bakes, memory, frame rate) were set for 1–1.5 km and must be measured again at 6 km
before this is relied on.

## Alternatives considered

Keep 1–1.5 km and bring arrivals in at the edge; one size for every battle.
