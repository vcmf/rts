---
status: active
last_reviewed: 2026-10-26
---

# Plan: a dye palette, uniforms that name dyes by cloth part

The owner, 2026-10-26: "it make more sense having our palette and each army choosing only outfit color coming from
this palette, also each unit has different cloth parts, a coat, a trouser, greatcoat in winter (some have greatcoat
and in that case we only see greatcoat instead of coat anyway), boots are always 'black' anyway". Earlier: colours
are per unit or uniform, not per nation (French line blue, the Guard, hussars in many colours, green dragoons; the
Austrian white line, brown Grenzer, pike-grey Jäger; Russian green; British red and green rifles), and the coats sit
in the landscape's painted palette while standing out (art bible §4, pillar 1). The decision: 0068, accepted
with the owner's answers below. Built so far: the uniforms as colours by the figure's roles (`docs/systems/look.md`, "The
armies", Uniforms; `src/rulesets/napoleonic-uniforms.ts`), the `?coat=` test (the owner's navy: #1F2B52 passes every
check and reads faintly blue, #26386E a dark blue, #1A2340 barely passes the coat check, #15192B fails), and a test
of units taking a share of the mood's earth, which changed little: harmony comes from choosing the colours, not a
filter.

## The owner's answers (2026-10-26)

1. **The French blue**: the dark blue, `imperial-blue` #26386E.
2. **The close greens** (the dragoon against the Russian and the rifles, ΔE 6–7 on screen): no problem; keep the dyes.
   Sides will be told apart by a banner floating above each battalion (as in Total War), a later step outside this
   plan.
3. **Pillar 1**: armies stand out from the ground by colour or by value (what the guard measures), the banner the
   identifier later; dark coats are "not that bad". The art bible's wording reworked (§2, §4; `AGENTS.md`).
4. **Greatcoats**: mixed within a battalion. By the season and the cold a share of the men wear the greatcoat, the
   colder the more, but some always wear the coat, so its colour still shows. Per man (as the per-man LOD fade), not
   per uniform or scenario: step 4. The all-greatcoat switch stays a test.
5. **Flags**: their own colours, beautiful and standing out so a side is easy to tell, not out of the painted
   palette: a small set of flag dyes, brighter and cleaner than the coats'. Done in step 2 (the flags' colours as
   they were, named).
6. **Materials** (pack, leather, wood, metal, skin): per era for now.

## Scope

Step 1 (`9c92901`, a test; the look's defaults unchanged):
- **The dye set** as era data (`src/rulesets/napoleonic-dyes.ts`, `DyeSet` in `src/sim/ruleset.ts`): 16 named dyes,
  each one sRGB value; the materials that are not cloth (skin, leather, pack, wood, metal); the boots' dye (black).
- **Dress**: a uniform as a dye name per cloth part (coat, facings, trousers, waistcoat, headgear, greatcoat), its
  flag's bands as dyes, and when the greatcoat is worn (in winter when it names one, or always). Eight: the French
  line, the Guard's grenadier, a French dragoon, the Austrian line, the Grenzer, the Russian line, the British line
  and the rifles.
- **The resolution** onto the one baked figure's roles (`src/look/world/dyes.ts`: `FIGURE_PARTS`, `dressed`), the test
  switches `?uniforms=dyes|dyes-winter` and `?dye=<dye>:<#hex>[;…]`, each side's battalions wearing the scenario's
  `dyeSides` in turn (`wearInTurn`); `ARMY_COATS` for the guard's and the coat check's blocks
  (`tools/army-blocks.mjs`).
- The review sheets, the measures and the checks below; decision 0068 (proposed then).

Step 2 (the dyes become the era's uniforms; the default look changes):
- `src/rulesets/napoleonic-uniforms.ts` holds the era's eight uniforms as dress (`UNIFORMS`, by dye name; the demo's
  sides `fr-line` and `at-line`, as before but renamed from `fr-line-1808` and `at-line-white`);
  `src/rulesets/napoleonic-dyes.ts` the dye set with `imperial-blue` #26386E, the flag dyes (`flags`), the materials
  and the boots; `yellow` dropped (it was only on flags). `RULESETS` carries the uniforms and the dyes; the page
  resolves them (`dressAll`).
- The checks' blocks take four uniforms' coats from the data (`tools/army-blocks.mjs`, `BLOCK_UNIFORMS`: fr-line,
  ru-line, at-line, br-line; tested against the resolver); the blocks are named by uniform.
- The test switches kept: `?uniforms=all` (the eight on the demo map, the scenario's `reviewSides`, was
  `?uniforms=dyes`), `?uniforms=all-greatcoats` (was `dyes-winter`), `?dye=` (a dye's value for every uniform: the
  way to try a value now). `?coat=` removed: a colour per uniform is what the dyes replace, and `?dye` covers it.
- The art bible §2 and §4, `AGENTS.md`'s invariant, `docs/systems/look.md`.

Out (the steps below): the dye check as a tool, the greatcoat share, any figure change, the banner.

## Approach

**The dyes** (`src/rulesets/napoleonic-dyes.ts`, as picked; L\*/C\* of the painted value, the epic ground under the test
battalions: L\* 47–81, C\* 13–44 in summer; L\* 52–68, C\* 0–7 on snow):

| Dye | Value | L\*/C\* | Why |
|---|---|---|---|
| imperial-blue | #26386E | 25/36 | the owner's pick (the navy #1F2B52, 18/27, the other candidate) |
| sky-blue | #7F9CC6 | 64/25 | hussars, Hungarian trousers |
| madder-red | #A8322B | 39/57 | French and Russian facings, the British rankers' coat (brick, not scarlet) |
| crimson | #8E2F3A | 34/44 | Austrian facings |
| buff | #C9A862 | 70/41 | British facings |
| white | #E8E2D2 | 90/9 | undyed wool and pipeclay: the Austrian coat, breeches, belts |
| russian-green | #2A5434 | 32/27 | darker than the art bible's #2F6B3C |
| dragoon-green | #3E6E3C | 42/36 | lighter and yellower than the Russian |
| rifle-green | #22402F | 24/17 | near black; #263F2E turned olive in the coat check (but see #208) |
| grenzer-brown | #5E4030 | 30/19 | |
| pike-grey | #8693A0 | 60/9 | Jäger, British trousers |
| greatcoat-grey, -beige, -brown | #66655F, #8A806E, #5E5448 | 43/4, 54/11, 36/9 | darker than snow, worn in winter |
| black | #24252B | 15/4 | boots, gaiters, headgear |

**The flag dyes** (`flags`): the colours the two flags flew before, named (blue #2C4FA8, white #EDE6D6, red #B8322A,
yellow #E3B935, black #1E1E1E) and the art bible's Russian green #2F6B3C; brighter and cleaner than the coats.

**Cloth parts onto the figure's roles** (`FIGURE_PARTS`; roles from `tools/bake-figure.py`):

| Role | Shows | What it also holds today |
|---|---|---|
| coat | coat (a worn greatcoat over it) | the turnbacks |
| facings | facings (a worn greatcoat over it) | the red only: collar, cuffs |
| white | trousers | the waistcoat, the white lapels, the crossbelts |
| dark | boots (black) | the headgear, the gaiters, the cartridge box |
| skin, leather, pack, wood, metal | materials | |

**The gaps** (later steps, the figure pipeline's): trousers, waistcoat and lapels, and belts are one role (the rifles'
black belts and the British grey trousers paint the belts too); headgear shares the boots' role (a dragoon's brass
helmet or a coloured hussar shako cannot be shown); the greatcoat is a recolour of coat and facings over the coat's
shape, with its lapels and short tails, not a capote's long skirts (the French greatcoat references, untracked in the main checkout's design
references, show one); the bearskin, the helmet, the rifle are shapes; the British pack's black and the
rifles' black leather are materials per uniform.

**How the dyes feed the checks.** `tools/army-blocks.mjs`'s `ARMY_HEX` (the guard's blocks and the coat check's) is
built from the era's data (step 2: four uniforms' coat dyes); `ARMY_COATS=<name>=<#hex>,…` (four) tries others. The guard's `--figures` measures per side; per uniform, the sheets' scripts mask one uniform's
material (`uMask`). The far rule follows the worn coat: the Austrian white keeps its own, its grey greatcoat takes the
coat's (tested).

## Measured, step 1 (Metal, preview build, epic, `?armies=5`, t 80 s; the review folder)

Lit coat L\*/C\* on screen · luma separation from the ground under the figures (the guard's measure, ≥ 0.10) · ΔE76 of
the figures' mean to that ground:

| Uniform | close | default | wide | winter | winter, greatcoat |
|---|---|---|---|---|---|
| fr-line | 17/15 · 0.31 · 43 | 20/13 · 0.25 · 36 | 21/13 · 0.26 · 40 | 22/14 · 0.38 · 39 | 38/1 · 0.32 · 33 |
| fr-line, #26386E | 21/21 · 0.31 · 43 | 23/18 · 0.24 · 37 | 24/19 · 0.24 · 42 | | |
| fr-guard-grenadier | 16/21 · 0.22 · 31 | 19/17 · 0.24 · 33 | 24/15 · 0.30 · 43 | 22/18 · 0.40 · 43 | (blue capote) |
| fr-dragoon | 34/24 · 0.18 · 24 | 36/22 · 0.23 · 26 | 39/22 · 0.22 · 24 | 39/20 · 0.34 · 35 | 45/3 · 0.32 · 32 |
| at-line | 86/8 · 0.18 · 31 | 77/9 · 0.11 · 20 | 74/9 · 0.10 · 19 | 77/5 · 0.11 · 12 | 47/4 · 0.15 · 16 |
| at-grenzer (column) | 29/7 · 0.42 · 59 | 37/17 · 0.32 · 43 | 36/16 · 0.28 · 37 | 37/17 · 0.25 · 28 | 42/8 · 0.24 · 27 |
| ru-line | 38/23 · 0.36 · 50 | 42/25 · 0.25 · 33 | 45/23 · 0.20 · 26 | 42/22 · 0.29 · 29 | 46/9 · 0.28 · 28 |
| br-line | 42/46 · 0.44 · 62 | 46/45 · 0.33 · 45 | 49/43 · 0.26 · 36 | 47/46 · 0.32 · 34 | 51/5 · 0.31 · 32 |
| br-rifles (column) | 27/15 · 0.47 · 52 | 34/16 · 0.40 · 45 | 32/15 · 0.39 · 44 | 34/15 · 0.37 · 38 | 51/5 · 0.32 · 33 |
| today's fr-line-1808 | 29/35 · 0.29 · 44 | 28/30 · 0.22 · 40 | 28/33 · 0.26 · 53 | 31/32 · 0.34 · 39 | |

- Every uniform separates from its ground at every zoom (0.10 to 0.47); the white is at the bound in summer, as today.
- The opposing sides' coats on screen (default zoom, ΔE76 of the lit coats): the dragoon against the Russian **7**
  and the rifles **6**; every other pair 26 or more.
- Chroma: the dark dyes' lit coats sit at C\* 13–25, under the summer ground's mean (21 under the French line) and far
  under its 99th percentile (34–59); by HLS saturation (the guard's report) the blocks are above it. Today's blue: 30–35.
- The guard (blocks, `ARMY_COATS`, the default view, summer and winter) and the coat check, against the art bible's
  four on the same build: the main four dyes (imperial-blue, russian-green, white, madder-red) fail exactly the blocks
  the art bible's fail (the white on the flat and the meadow in summer and on three snow spots, the red on the
  meadow), at about the same margins; the coat check passes. The second four (#26386E,
  dragoon-green, grenzer-brown, rifle-green) pass the guard; the coat check fails the rifle green in the fourth slot
  only, a measuring fault (#208: a block's pixels include its neighbour's). The greatcoats fail 7 summer blocks (grey
  at the summer ground's value) and none in winter.

## Measured, step 2 (against main `c505440`, both preview builds)

- **Goldens** (`node tools/golden.mjs`, SwiftShader): the default page matches main exactly (0 of 128 regions; the
  page draws no army). With `?armies=20`, one region fails, at the `close` camera: the French battalion, darker (10.7 %
  of its pixels over 6, mean 2.9); `wide` and `far-edge` move under the tolerance (the Austrians' small shifts); the
  rest match.
- **The figures** (`guard.mjs --figures`, `?armies=20`, Metal; separation from the ground, the share within ΔE 25 of
  the coat): the French at the default zoom 0.266 → 0.311 and 52 → 69 %, at the widest 0.178 → 0.219 and 31 → 62 %;
  in winter 0.315 → 0.361 and 0.200 → 0.242. The Austrians within 0.004 of main.
- **The guard** (blocks, now the four uniforms' coats): the same 6 blocks fail as on main with the art bible's coats,
  each by as much or less: the white on the flat (0.008 → 0.021) and the meadow (0.028 → 0.055) and the red on the
  meadow (0.012 → 0.015) in summer, the white on three snow spots (0.017 → 0.018, 0.050 → 0.048, 0.037 → 0.037; the
  winter white is the greatcoats' case, step 4). **The coat check** passes (12 of 12).
- Sheets: `step2-french`, `step2-austrian`, `step2-fight` in the review folder.

## Steps (each its own PR)

1. **The test** (docs, data behind switches, sheets): done, `9c92901`.
2. **The dyes become the era's uniforms** with the owner's values; the flag dyes; the blocks from the data; the art
   bible reworded; decision 0068 accepted: this branch.
3. **The dye check** (a new tool in `tools/`): each dye's L\*/C\* against the mood's ground by season, the coat check
   per dye in fours (after #208's per-block masks), the guard on each uniform's coat and greatcoat by season; the far
   rule per uniform as now. No bound on the opposing coats' distance (the owner's answer 2).
4. **The greatcoat share**: per man, a share of each battalion in the greatcoat by the season and the cold (none in
   summer, most in deep winter, never all), picked by a hash of the man (as the LOD fade's `manHash`) between two
   palettes of the uniform; the scenario or map sets the cold; the look page follows its season live (the palettes
   are made at load today). The guard then measures a battalion's mix.
5. **The figure** (`tools/bake-figure.py`, `tools/unitpipe/`, `docs/plans/active/figure-pipeline.md`): the bake writes
   the part each role shows; the white role split (trousers, waistcoat and lapels, belts) and the dark one (headgear,
   boots); then the greatcoat as a figure of its own (a capote: long skirts, no lapels) for the men who wear it, and
   headgear shapes.

Outside this plan: the battalion's banner above it (the owner's identifier of sides).

## Acceptance

- Step 1: `npm test`, `node tools/check-docs.mjs` pass; the page without `?uniforms` draws today's uniforms; the
  sheets in output/armies-review/21-dye-palette/ (the main checkout, not committed).
- Step 2: the default page's goldens match main; with `?armies` only the uniforms' colours move (the French the
  most); the guard fails no block main does not; the coat check passes; `npm test`, `check:data`, `check-docs` and
  the build pass.

## Open questions

- The greatcoat share's curve (by season, by a map's cold) and its floor (the owner: always some coats).
- When the dye check (step 3) lands, a bound for a new dye: the guard's separation on every season's ground, or
  also a minimum C\* for a light coat?
