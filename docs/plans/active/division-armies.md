---
status: active
last_reviewed: 2026-10-31
---

# Plan: the look page's armies at the division scale

Asked by the owner on 2026-10-31. The sim's division scale (the campaign track's proposed scale, PR #234: a unit is a
division, a figure 25 men) changes the blocks the look page builds its armies on: line infantry 240 figures (4 sections
of 20 files × 3 ranks), light cavalry 80 (2 squadrons of 20 × 2), a battery 4 guns of 12 (48). The sim's PR #280 (the
blocks, the ranges) and #283 (the formations) are held until the look has moved its armies, because the look's
`armies` and `arms` tests expect the old blocks. This plan moves them, on main, before the sim's PRs land.

## The owner's choices (2026-10-31)

1. **Armies first**, on main, in this PR. A bigger map for them is the next step.
2. **A stress-test battle, not a historical one:** corps at the new sizes filled up to a figure budget, chosen by URL
   and in the page's panel: **16,000 figures by default, 32,000 as an option**, and a **typical** battle of about
   6,000 (two corps a side) for the look. It replaces `?armies=1..40`; `?armies` stays only where tools and tests rely
   on it, mapped onto the new sizes.
3. **The ground** stays the made-up demo world; the corps are placed as well as it allows and may run past the ±235 m
   play area (the camera's) onto the rest of the 800 m tile.
4. **Light infantry and light cavalry have no figures yet: stand-ins.** Light infantry is the line figure in open
   order with its own dye; light cavalry the cuirassier figure without its cuirass (its metal role painted as the
   coat) in a light cavalry dye, a smaller unit. Issues for the real figures: #308 (voltigeur), #309 (hussar,
   chasseur).
5. **Era-generic** (decision 0015): sizes, compositions and formations are ruleset data; the battle's budgets and
   the deployment are the scenario's.

## What #280 and #283 change, and what the look needs

- `src/rulesets/napoleonic.ts` on #280: infantry `companies 4, files 20` (240), cavalry `companies 2, files 20,
  bins 5` (80), battery `companies 4` (48). On #283 the attack column becomes one section wide, 20 files × 12 ranks;
  the look's own column of companies (`src/look/world/armies.ts` `slots`) is already that shape at 4 sections.
- On #280 two look tests fail: `test/armies.test.ts`'s layout hashes (`armies-layout-20.json`, laid out with the 414
  drill) and `test/arms.test.ts`'s `drillScript` check (it reads man 413, past a 240 unit). Everything else in the
  look already reads the ruleset's blocks.
- The ruleset on main keeps the old blocks until #280 merges (changing them here would move every sim golden). So the
  look reads its blocks from an era ruleset at the division scale, `napoleonic-division`
  (`src/rulesets/napoleonic-division.ts`): main's Napoleonic ruleset with #280's blocks set (`withBlock`), plus the two
  unit types the sim does not ship yet (light infantry, cuirassiers). Once #280 is on main, its three blocks equal
  main's and the overrides go; the look's tests pass on both.

## Approach

Decision 0099 (proposed) records the choices below.


1. **Ruleset data** (`src/rulesets/napoleonic-division.ts`, registered in `src/rulesets/index.ts`): the types `infantry`
   (240), `light` (160: 4 sections of 20 files × 2 ranks, open order, a file 1.0 m and a rank 1.5 m), `cavalry` (80),
   `cuirassiers` (120: 3 squadrons of 20 × 2; the owner gave no size, the docs none: a heavier unit than the light
   cavalry, an open question below), `battery` (4 guns, 48). The corps' compositions: an **infantry corps** of 5 line,
   1 light, 2 light cavalry, 1 battery (9 units, 1,568 figures), a **reserve cavalry corps** of 4 cuirassiers and a
   battery (5 units, 528), the main army's only (PR #234's scale).
2. **The battles** (`src/scenarios/armies-demo.ts`): `typical` (6,400 a budget: 2 infantry corps a side, 6,272
   figures), `16k` and `32k` (the reserve cavalry corps a side, then infantry corps until the budget; the last corps
   cut at the first unit that does not fit: 16,000 and 32,000 figures). The order of battle is a pure function
   (`src/look/world/battle.ts`, `orderOfBattle`).
3. **The page**: `?battle` (16k), `?battle=typical|16k|32k`; `?armies=<n>` maps to the battle nearest its old figure
   count (n × 828: up to about 11,000 typical, up to about 24,000 16k, beyond 32k), an error with `?battle` too. The
   panel's **Battle** select reloads the page with the chosen `?battle` (none, typical, 16k, 32k). The other switches
   (`?sim`, `?uniforms`, `?lookat`, `?cavalry=0`: no cavalry of any kind, ...) keep their meaning; `?light=0`,
   `?lightcav=0` and `?cuirassiers=0` join them. The select is labelled by the figures each battle fields and hidden on
   a map window; None drops `?sim` and `?lookat`.
4. **The layout** (`src/look/world/battle.ts`, `battleLayout`), each side, under two friendly-line rules (review
   round 2: on the cramped map, reserves stood before firing lines pushed back, and firing lines behind firing
   lines): no unit stands before a firing unit of its side it overlaps across, and no engaged unit stands behind
   another of its side it overlaps across (each side by its own way). Enforced in the placement itself:
   - the first `engaged` corps (2) stand side by side along the front, each one row from its outer flank to the
     middle: a light cavalry regiment riding up to the front, its light infantry, its battery in the line, two line
     units deploying and firing (the line infantry of both corps at the middle, the cameras' focus near it as on
     main); each unit at the legal spot nearest its post's (`placeArm`: never ahead of it, and no engaged box of its
     side across it), or, with none, in reserve, with a warning and a count (`__armies.fellBack`);
   - then the rest stand in column, 40 m behind the front at least and 40 m behind every engaged footprint of their
     side they overlap across (`RESERVE_BACK`), the nearest the front and the middle first, a kind at a time (one
     pass over the grid's spots, which only fill).
   - The area: the tile less its last 30 m (±370 m), past the camera's ±235 m: the next PR's bigger map takes them
     back into the play area. Fails loudly when a side cannot field its reserves.
   The old `layout` (lines, reserves and close reserves of one drill) and its fixture hashes go
   (~~`test/fixtures/armies-layout-20.json`~~): nothing else uses them.
5. **The arms** (`ARMS_DEMO`): one list, each a renderer (`Units`): line infantry (the shadow map's owner, `__units`),
   light infantry (the same figure, `drillScript` of its block, no flags), light cavalry and cuirassiers (the
   cuirassier figure, `rideScript`; the light cavalry's metal role painted as its coat), the battery (`serveScript`).
   The ride and the service learn the reserve: a reserve unit stands at rest in its places. Two arms drawn with one
   figure each build its GPU resources (#313: shared later, the final bench says what it costs).
6. **Uniforms** (`src/rulesets/napoleonic-uniforms.ts`): `fr-light` (blue coat and trousers: the légère's), the
   Austrian light infantry the Grenzer (`at-grenzer`, there); `fr-chasseur` (dragoon green, red facings) and
   `at-hussar` (sky blue, crimson facings) for the light cavalry.
7. **`?sim`** plays the line infantry on the division ruleset (`napoleonic-division`): the sim's unit is the drawn
   unit's 240.
8. **Tests**: the look's armies and arms tests on the division blocks (they hold on main and on #280's ruleset); the
   order of battle (each battle's figures, the cut, the reserve corps only in the main army's), the layout on the
   demo map's blocked ground at all three battles (every unit placed, clear, in the area, reserves behind), the ride's
   and the service's reserve, `?battle`/`?armies` parsing, the panel's URL, the division ruleset compiled by the sim.
   The blocked-ground fixture is sampled again over ±370 m (`tools/sample-blocked.mjs`, now with its radius).

## Acceptance

- `npm test` passes; `test/armies.test.ts` and `test/arms.test.ts` pass on #280's ruleset too (checked on its branch).
- The three battles lay out on the demo map: typical 6,272 figures, 16k 16,000, 32k 32,000, every unit placed.
- Stills at the default, close and wide zooms; the bench (`tools/bench-look.mjs`, production build) at the three
  battles and three zooms, two rounds, recorded below. No optimisation here (`docs/plans/active/armies-32k.md`, #275).

## Out of scope

- The bigger map (next PR); sharing a figure's GPU resources between arms (#313); the sim driving the other arms; the voltigeur and hussar figures (issues); corps grouped
  in reserve by corps on the ground (they pack by kind); the formations of #283 drawn (the look keeps its line and
  column of sections).

## Open questions

- The cuirassiers' size (120 here) and the reserve cavalry corps' composition: the owner's to set.
- The light infantry's open order (1.0 m files, 1.5 m ranks) is a first pick.

## Results

(filled in at the end: the bench, the stills)
