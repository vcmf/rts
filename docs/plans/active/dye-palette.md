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
in the landscape's painted palette while staying the most saturated objects (art bible §4, pillar 1). The decision
this plan proposes: 0068. Built so far: the uniforms as colours by the figure's roles (`docs/systems/look.md`, "The
armies", Uniforms; `src/rulesets/napoleonic-uniforms.ts`), the `?coat=` test (the owner's navy: #1F2B52 passes every
check and reads faintly blue, #26386E a dark blue, #1A2340 barely passes the coat check, #15192B fails), and a test
of units taking a share of the mood's earth, which changed little: harmony comes from choosing the colours, not a
filter.

## Scope

In (this PR, a test; the look's defaults unchanged):
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
- The review sheets, the measures and the checks below; decision 0068, proposed.

Out (the steps below): the default look, the checks as a tool, the season, any figure change.

## Approach

**The dyes** (`src/rulesets/napoleonic-dyes.ts`; L\*/C\* of the painted value, the epic ground under the test
battalions: L\* 47–81, C\* 13–44 in summer; L\* 52–68, C\* 0–7 on snow):

| Dye | Value | L\*/C\* | Why |
|---|---|---|---|
| imperial-blue | #1F2B52 | 18/27 | the owner's navy; #26386E (25/36) offered beside it |
| sky-blue | #7F9CC6 | 64/25 | hussars, Hungarian trousers |
| madder-red | #A8322B | 39/57 | French and Russian facings, the British rankers' coat (brick, not scarlet) |
| crimson | #8E2F3A | 34/44 | Austrian facings |
| buff, yellow | #C9A862, #D6AE3C | 70/41, 73/61 | British facings; the Austrian colours |
| white | #E8E2D2 | 90/9 | undyed wool and pipeclay: the Austrian coat, breeches, belts |
| russian-green | #2A5434 | 32/27 | darker than the art bible's #2F6B3C |
| dragoon-green | #3E6E3C | 42/36 | lighter and yellower than the Russian |
| rifle-green | #22402F | 24/17 | near black; #263F2E turned olive in the coat check (but see #208) |
| grenzer-brown | #5E4030 | 30/19 | |
| pike-grey | #8693A0 | 60/9 | Jäger, British trousers |
| greatcoat-grey, -beige, -brown | #66655F, #8A806E, #5E5448 | 43/4, 54/11, 36/9 | darker than snow, worn in winter |
| black | #24252B | 15/4 | boots, gaiters, headgear |

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

**How the dyes feed the checks.** `tools/army-blocks.mjs`'s `ARMY_HEX` (the guard's blocks and the coat check's) takes
`ARMY_COATS=<name>=<#hex>,…` (four) in this PR; in step 2 it is built from the ruleset: each scenario side's main
worn coat by season. The guard's `--figures` measures per side; per uniform, the sheets' scripts mask one uniform's
material (`uMask`). The far rule follows the worn coat: the Austrian white keeps its own, its grey greatcoat takes the
coat's (tested).

## Measured (Metal, preview build, epic, `?armies=5`, t 80 s; the review folder)

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

## Steps (each its own PR)

1. **This test** (docs, data behind switches, sheets).
2. **The dyes become the uniforms** (the owner's values): the era's uniforms resolved from dress
   (`napoleonic-uniforms.ts` replaced), the art bible's §4 table pointing at the dye set, `ARMY_HEX` built from the
   ruleset; decision 0068 accepted. Changes the default look: the goldens and the checks rerun.
3. **The dye check** (a new tool in `tools/`): each dye's L\*/C\* against the mood's ground (by season), each scenario's
   opposing main coats apart (a ΔE bound on screen), the coat check per dye in fours (after #208's per-block masks),
   the guard on the coat each side wears per season; the far rule per uniform as now.
4. **The season**: the scenario (or map) sets the season and the dress (in winter, or a campaign's greatcoats); the
   look page rebuilds the palettes when its season changes (today: at load).
5. **The figure** (`tools/bake-figure.py`, `tools/unitpipe/`, `docs/plans/active/figure-pipeline.md`): the bake writes
   the part each role shows; the white role split (trousers, waistcoat and lapels, belts) and the dark one (headgear,
   boots); then the greatcoat as a figure of its own (a capote: long skirts, no lapels), and headgear shapes.

## Acceptance (this PR)

- `npm test`, `node tools/check-docs.mjs` pass; the page without `?uniforms` draws today's uniforms.
- The sheets in output/armies-review/21-dye-palette/ (the main checkout, not committed): the palette, close, default,
  wide and winter, today against the dyes, the French blue both ways, labelled by dye name.

## Open questions

- The French blue: #1F2B52 or #26386E (on screen C\* 13 against 18–21)?
- The dragoon and the Russian (and the rifles) read alike (ΔE 6–7): history agrees; keep it, or a bound per scenario
  and a yellower dragoon green?
- Pillar 1 for dark coats: by chroma the navy and the greens are under the meadow; by saturation over it. Which
  measure does the art bible mean?
- Where the greatcoat comes from: per uniform (`always`), per scenario (winter, a campaign), or both? A greatcoat in
  summer fails the guard on the meadow.
- Are flags dyes (as in this test), or their own silk colours?
- The materials per uniform (the British black pack, the rifles' black leather), or per era?
