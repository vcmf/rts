---
status: accepted
date: 2026-10-30
---

# 0076 A unit stands for a division: 240 figures for line infantry; a corps is 8–10 units

## Context

With a campaign (decision 0088), battles hold several corps a side. Real corps had 15,000–30,000 men and
more; drawn one figure per soldier, a single one is past the engine's budget. The armies are meant to be small,
as in Total War: a miniature of the war, not the war at full size.

## Decision

We will let one unit on the battle map stand for a division, a figure a symbol for 25 men, with unit sizes
after Total War's:
- line infantry 240 figures, 4–5 a corps;
- light infantry (skirmishers) 160, 1–2 a corps;
- light cavalry 80, 1–2 a corps;
- artillery 4 guns, 1 a corps.

Heavy cavalry is only in the reserve cavalry corps, which only the main army has. Corps compositions and unit
sizes are ruleset data (decision 0015); the engine's word stays neutral. It supersedes decision 0018's battalion of
about 400, and amends decision 0061's one figure a soldier: a figure stands for 25 men. The design is `docs/proposals/campaign.md` § The scale.

The owner fixed these sizes on 2026-10-30, with a figure for 25 men (not about 25) and the ranges the sim uses at
this scale (muskets 100 m, light infantry 160 m, canister 250–300 m, roundshot 1 km, a minimum range for the guns).
How the sim is changed for them is Track S's division scale step.

## Consequences

Good: a corps is about 1,300–1,700 figures, so three corps a side fit the 32,000-soldier budget with room to
spare; the player commands divisions, with more of the campaign's planning; heavy cavalry belongs to big
battles and its march is a campaign decision.

Bad: figures are symbols, not soldiers; a division forms square as one block; its front is far narrower than a
real division's. The fire, morale and casualty values tuned for 400-figure battalions are tuned again. About
30 units a side need orders to a whole corps.

## Alternatives considered

- 400 figures a unit (decision 0018) and 6 units a corps: fewer, heavier units, less room in the budget.
- Battalions of about 120 figures, one per soldier, and corps of about 1,000 men.
- Heavy cavalry in every corps: a shock unit in every battle, but not historical, and it takes away a campaign
  decision.
