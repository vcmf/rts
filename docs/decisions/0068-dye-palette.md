---
status: proposed
date: 2026-10-26
---

# 0068 Uniforms name dyes from one palette, by cloth part

Open until the owner picks the dyes' values on the test's sheets. The plan: `docs/plans/active/dye-palette.md`.

## Context

A uniform today is a colour per figure role, set by hand (`src/rulesets/napoleonic-uniforms.ts`), with the art
bible's four coats by nation (§4). The owner (2026-10-26): one palette of ours, each army choosing its outfit's
colours from it; each unit with its own cloth parts (a coat, trousers, a greatcoat in winter that hides the coat);
boots always black. Colours belong to a uniform, not a nation (the French line blue, the Guard, green dragoons, the
Austrian white line and brown Grenzer, British red and green rifles), and they must sit in the landscape's painted
palette while staying its most saturated objects. A test of units taking part of the mood's earth changed little:
the harmony has to come from the colours chosen.

## Decision

We will paint uniforms from an era's **dye set**: a short list (about 12 to 16) of named dyes, each one sRGB value
chosen once against the landscape and checked by the tools, plus the non-cloth materials (skin, leather, pack, wood,
metal) and the boots' dye. A uniform (**dress**) names a dye per **cloth part** (coat, facings, trousers, waistcoat,
headgear, greatcoat) and for its flag's bands, never a colour; a worn greatcoat covers the coat and its facings. The
renderer resolves a dress onto the figure's colour roles by what each role shows. Both are era data (decision 0015);
the garments are generic. The checks (the guard, the coat check, opposing coats apart) run on the dyes as worn.

## Consequences

- Good: one place for every colour on a soldier; a dye's change moves every uniform that wears it; new units cost a
  list of names; the checks test a fixed set, not each uniform's own hexes.
- Good: winter's greatcoat is data, not a separate uniform, and fixes the Austrian white on snow.
- Bad: the one baked figure shows fewer parts than a dress names (trousers, waistcoat, lapels and belts share a role;
  headgear shares the boots'); until the bake splits them, some parts are not drawn (the plan's gaps).
- Bad: a small palette forces near-equal colours on opposing sides where history had them (green dragoons against
  Russian green: ΔE 7 on screen); the scenario must check its sides.
- Adopting it changes the default look (the French blue darker, the greens darker), the goldens with it.

## Alternatives considered

- Keep a colour per role per uniform (today): no shared palette; each new uniform is chosen and checked alone.
- One coat colour per nation (the art bible's table): wrong for the many uniforms of one army.
- A filter pulling units toward the mood's earth: measured, it barely changed the image.
