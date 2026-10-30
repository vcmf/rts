---
status: proposed
date: 2026-10-27
---

# 0088 A campaign of armies on roads, moved at once; battles come from it

## Context

The vision is battles only (`docs/vision.md`, Non-goals). Without a layer around them, battles cannot have
what made the era's battles: one side ready and the other not, reinforcements arriving during the fight, and
a guess at the enemy rather than a full view. A small battle map cannot hold them either: cavalry scouts every
road and the army waits.

## Decision

We will add a campaign layer: a map of roads on which armies (corps) move only by road, every side gives its
orders for the day at once, and all armies then march together. Two enemy corps within a contact radius give
battle; allies are called by couriers that travel by road and can be caught. The battle starts from the
campaign's state: who is deployed, who arrives when, by which road. The design is
`docs/proposals/campaign.md`. Couriers exist only on the campaign; inside a battle, orders still apply at
once (decision 0008).

## Consequences

Good: ruses and surprises are planned on the campaign and play out in the battle; reinforcements and readiness
come from the map instead of a scenario's script. Historical scenarios fill the same contract by hand, so
battles do not wait for the campaign.

Bad: a second game layer to build, balance and teach, and an AI that plays it. The vision's "battles only"
non-goal goes.

## Alternatives considered

Total War's turn-by-turn moves; a layer between campaign and battle where corps are placed on a fogged map;
battles only, as now. See `docs/proposals/campaign.md` § Alternatives considered.
