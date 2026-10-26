---
status: accepted
date: 2026-10-26
---

# 0068 Uniforms name dyes from one palette, by cloth part

Accepted by the owner on 2026-10-26, after the test's sheets, with the answers below. The plan:
`docs/plans/active/dye-palette.md`.

## Context

A uniform was a colour per figure role, set by hand (`src/rulesets/napoleonic-uniforms.ts`), with the art bible's four
coats by nation (§4). The owner (2026-10-26): one palette of ours, each army choosing its outfit's colours from it;
each unit with its own cloth parts (a coat, trousers, a greatcoat in winter that hides the coat); boots always black.
Colours belong to a uniform, not a nation (the French line blue, the Guard, green dragoons, the Austrian white line
and brown Grenzer, British red and green rifles), and they must sit in the landscape's painted palette while standing
out. A test of units taking part of the mood's earth changed little: the harmony has to come from the colours chosen.

## Decision

We will paint uniforms from an era's **dye set**: a short list (about 12 to 16) of named cloth dyes, each one sRGB
value chosen once against the landscape and checked by the tools; a small set of **flag dyes**, brighter and cleaner,
so a side reads by its flag; the non-cloth materials (skin, leather, pack, wood, metal), per era; and the boots' dye
(black). A uniform names a dye per **cloth part** (coat, facings, trousers, waistcoat, headgear, greatcoat) and a
flag dye per flag band, never a colour. The renderer resolves a uniform onto the figure's colour roles by what each
role shows. Both are era data (decision 0015); the garments are generic. The checks take their coats from the same
data.

The owner's answers:
- The French coat is the dark blue, #26386E.
- Close greens on opposing sides (green dragoons, Russian green, rifles) are accepted: a banner above each
  battalion will tell sides apart (a later step).
- Armies stand out from the ground **by colour or by value** (the readability guard's measure), not necessarily as
  the most saturated objects: a dark coat stands out by its value. The art bible's pillar 1 says so now.
- The greatcoat is worn **by a share of each battalion's men**, larger as it gets colder, never all of them: per man,
  not per uniform or scenario (a later step).

## Consequences

- Good: one place for every colour on a soldier; a dye's change moves every uniform that wears it; a new uniform costs
  a list of names; the checks test the coats the armies wear.
- Good: a greatcoat is a part of the dress, not a separate uniform; the mixed battalion keeps its coat's colour in
  winter.
- Bad: the one baked figure shows fewer parts than a uniform names (trousers, waistcoat, lapels and belts share a role;
  headgear shares the boots'); until the bake splits them, some parts are not drawn (the plan's gaps).
- Bad: opposing sides can wear near-equal coats (ΔE 7 on screen); until the banner, the flag and the layout tell them
  apart.
- The default look changes: the French coat darker; the other colours move a little toward their dyes.

## Alternatives considered

- Keep a colour per role per uniform: no shared palette; each new uniform chosen and checked alone.
- One coat colour per nation (the art bible's old table): wrong for the many uniforms of one army.
- A filter pulling units toward the mood's earth: measured, it barely changed the image.
- Greatcoats per uniform or per scenario, all or nothing: rejected by the owner (a winter battalion would lose its
  coat's colour).
- Flags painted from the coat dyes: too dull for the one colour that tells a side; their own dyes.
