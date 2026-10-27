---
status: proposed
date: 2026-10-27
---

# 0076 A unit stands for a division; a corps is 5–6 units

## Context

With a campaign (decision 0074), battles hold several corps a side. Real corps had 15,000–30,000 men and
more; drawn one figure per soldier, a single one is past the engine's budget. The armies are meant to be small,
as in Total War: a miniature of the war, not the war at full size.

## Decision

We will let one unit on the battle map, drawn with about 400 figures (decision 0018), stand for a division, a
figure a symbol for about 15–20 men. A standard Napoleonic corps is 5–6 units: 3 infantry divisions (4 in a
big corps), 1 cavalry division, 1 artillery unit. Skirmishers are not a unit: each infantry division carries a
screen that goes out and falls back by itself. Corps compositions are ruleset data
(decision 0015); the engine's word stays neutral. Decision 0018's numbers stand; what a unit means changes.
The design is `docs/proposals/campaign.md` § The scale.

## Consequences

Good: about 20 units a side, as now, so the sim, the formations and the figure budgets stay valid; the player
commands divisions, with less micromanagement and more of the campaign's planning.

Bad: figures are symbols, not soldiers; a division forms square as one block; its front is far narrower than a
real division's. Real strengths live in the data, not in the figures.

## Alternatives considered

Battalions of about 120 figures, one per soldier, and corps of about 1,000 men; the 400-figure battalion of
decision 0018 with corps of 20 or more battalions, past the budget.
