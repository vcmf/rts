---
status: proposed
date: 2026-10-31
---

# 0097 The look page's armies at the division scale: a stress-test battle of corps, stand-ins for the light arms

Proposed with `docs/plans/active/division-armies.md`, from the owner's choices of 2026-10-31; as built:
`docs/systems/look.md` (the armies).

## Context

Decision 0076 (on the campaign branch) makes a unit a division and a figure 25 men: line infantry 240 figures, light
infantry 160, light cavalry 80, a battery of 4 guns (48), corps of 8–10 units. The sim's PRs for it (#280, the blocks
and ranges; #283, the formations) were held until the look page moved its armies, whose tests expected the old
blocks (a battalion of 414, a cavalry regiment of 256, a battery of 8 guns). The look page's demo laid out `?armies=n`
battalions a side of one drill, the cavalry and the battery one unit a side. Light infantry and light cavalry have no
figures yet.

## Decision

We will draw the look page's armies at the division scale, as a stress test rather than a historical battle:

- **The blocks and corps are ruleset data** (decision 0015): the era's ruleset at the division scale
  (`napoleonic-division`, `src/rulesets/napoleonic-division.ts`), main's Napoleonic ruleset with #280's blocks set and
  the light infantry and cuirassier types the sim does not ship yet, and the corps' compositions (an infantry corps of
  5 line, 1 light, 2 light cavalry, a battery: 9 units, 1,568 figures; a reserve cavalry corps of 4 cuirassiers and a
  battery). Once #280 is on main the overrides equal the shipped blocks and go. Cuirassiers are 120 figures (3
  squadrons of 20 × 2), a first pick.
- **A battle is a figure budget** (`?battle=typical|16k|32k`, and the panel's Battle select): each side the battle's
  once-only corps (the reserve cavalry corps, the main army's), then infantry corps up to half the budget, the last
  cut at its first unit that does not fit: about 6,300 (typical, two corps a side), 16,000 (the default) and 32,000.
  It replaces `?armies=n`, which maps onto the battle nearest its old figures.
- **The layout** stands each side's first two infantry corps along the front by a template (the scenario's data: a
  first line deploying and firing, the battery before it, the light cavalry riding along the front), the rest in
  column behind, on the 800 m tile past the camera's ±235 m until the bigger map.
- **Stand-ins** until their figures (#308, #309): light infantry is the line infantryman in open order in its own dye;
  light cavalry the cuirassier figure with its cuirass painted in its coat, in light cavalry dyes, a smaller unit.

## Consequences

- Good: the sim's division scale is unblocked (the look's tests read the division blocks and pass on #280 and #283);
  the page measures the armies at the sizes the game will have, at three budgets, from one switch.
- Good: a new unit type, corps or battle is data: the engine's layout and order of battle name none.
- Bad: two rulesets carry the same era until #280 merges (the division one is derived, so they cannot drift apart
  but by its overrides).
- Bad: the demo map is too small and split by its river: some units stand behind it or past the camera's play area;
  the cameras' fight's middle can fall where little stands. The bigger map is the next step.
- Bad: the stand-ins read only roughly as their arms (no shako or colpack, a helmet in the coat's colour).

## Alternatives considered

- **Change main's ruleset blocks here:** every sim golden and calibration would move in a look PR; #280 owns that.
- **Keep `?armies=n` at the new sizes** (n line units a side): no corps, no light arms, no budgets the owner can name.
- **A historical order of battle:** the owner asked for a stress test, "no need to stay faithful".
