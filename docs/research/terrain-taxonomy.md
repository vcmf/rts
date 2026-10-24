---
status: research
last_reviewed: 2026-10-12
---

# A terrain taxonomy for the map engine: layers, presets, and what the ruleset derives

**Summary.** On a pre-modern battlefield, terrain mattered more through **order, sight and shelter** than through raw speed. Columns crossed almost anything. Lines had to halt and re-dress at every hedge and ditch. Cavalry could not charge through vineyards, enclosures, mud or deep snow, and guns were tied to firm ground and roads. The battles the owner named turn on a few kinds of feature: a slope (Hastings, the Pratzen), a soft surface (Agincourt's ploughland, Waterloo's sodden fields), water with a level that can change (the Goldbach, the frozen Satschan ponds), thin linear obstacles (the hedged Ohain lane), strongpoints (Hougoumont, La Haye Sainte, the Borodino flèches) and tall growth that hides men (Quatre Bras' rye, the Bossu wood). Games and tabletop rules sort all of this into four bands of "going" (open, rough, difficult, impassable), plus linear obstacles, built-up areas and woods in one or two densities. Those bands are a **ruleset's output**, not map data.

The proposed model is **five orthogonal layers per point**: relief (bed height), ground (material and its state), water (an optional body with its own **level**), growth (a low layer and a tall stand), and **thin features** (lines and objects) for anything narrower than the grid. On top sit **season/state modifiers**. Every named sub-type ("oak wood", "sunken road", "orchard", "rye") is a **preset of attribute values**, so adding a new kind means adding data. Water is best kept as a **separate level, not negative height**. Obstacle height works as a universal attribute for **sight**, but not for **crossing**: a hedge, a wall, a fence and an abatis of the same height cross very differently. Each thin feature therefore needs height plus two more numbers: sight porosity and a crossing kind.

How to read the tags: **[primary]** marks a period source or an official rule text. **[secondary]** marks a history or reference work read in this session. **[forum]** marks player or modder reports. **[unverified]** marks something recalled or summarised by search but not confirmed against a fetched page. **[inference]** marks a design judgement made here.

---

## 1. What terrain mattered, antiquity to 1815

### 1.1 The effects terrain has, in general

Five effects recur in every period source. Terrain can **slow**, **disorder**, **hide**, **shelter**, and **channel**.

- **Disorder over speed.** This repo's movement research, drawing on Dundas, MacArthur and Nosworthy (via Napoleonistyka), found that drill kept cadence on rough ground. Files blocked by an obstacle "fall back by sections and regain their place at the quick step". Lines "required redressing" more the faster they moved and the more obstacles they met (bushes, fences, ditches, the dead and wounded), while columns "crossed all kinds of ground … without much trouble" (`docs/research/terrain-movement-speed-models.md` §1, citing [Napoleonistyka](https://www.napolun.com/mirror/napoleonistyka.atspace.com/infantry_tactics_4.htm)) [secondary]. No period source gives numeric speed penalties for woods, ploughland or marsh (same doc) [secondary]. *Consequence:* the attributes that matter are the ones that break a frontage: **obstacle frequency and spacing, footing, and gaps**, not only a "speed" number [inference].
- **Cavalry is the most terrain-sensitive arm.** Cavalry could not charge through vineyards, rocks or deep snow (same doc, citing Oman and the Krasne account) [secondary]. At Waterloo, the "sodden" ground "made manoeuvring cavalry and artillery difficult", and Napoleon delayed the start because of it ([Wikipedia, Battle of Waterloo](https://en.wikipedia.org/wiki/Battle_of_Waterloo)) [secondary]. The Ohain lane was "a deep sunken lane … lined on both sides by thick hedges" (same) [secondary]. Accounts call it either a ravine that swallowed cavalry (Hugo) or a modest dip that broke a charge's momentum ([HistoryRise](https://historyrise.com/the-role-of-terrain-and-weather-in-the-battle-of-waterloo/), weak source) [secondary, weak].
- **Artillery depends on the surface twice.** First, for moving: a horse draws about 1,360 kg on a paved road, 860 kg on hard ground and 500 kg on rough ground, and a cart grade limit is about 8% (this repo's research §2, §6) [secondary]. Second, for effect: roundshot did its killing by grazing and bouncing, and soft wet ground "reduced the bounce" so that shot "buried themselves" at Waterloo ([TWCenter thread](https://www.twcenter.net/threads/napoleonic-gunnery.409042/); [Age of Revolution, Cannon ball fired at Waterloo](https://ageofrevolution.org/?p=4190)) [forum/secondary]. Hughes' *Firepower* treats ground hardness as a factor in roundshot effectiveness [unverified: the book was not read in this session]. *Consequence:* **ground firmness/moisture is a fire attribute as well as a movement attribute** [inference]. The sim already models grazing roundshot with a `restitution` and `bury` term (`src/rulesets/napoleonic.ts`, `artillery.ray`). These should come from the ground under the graze, not stay a constant [inference].
- **Hiding is mostly relief, then tall growth.** Wellington placed his infantry behind the crest at Mont-Saint-Jean, where the reverse slope "concealed his strength" ([Wikipedia, Waterloo](https://en.wikipedia.org/wiki/Battle_of_Waterloo)) [secondary]. At Quatre Bras the 28th formed square in rye "especially tall for June" ([Victorian Web on Butler's painting](https://victorianweb.org/victorian/painting/thompson/paintings/1.html)), and tall crops "higher than a man's head in many places" obscured targets ([warhistory.org](https://warhistory.org/article/analysis-of-the-battle-of-quatre-bras-tactical-conduct?amp=0)) [secondary]. Pre-modern cereal varieties were much taller than modern ones (often 1.2–1.8 m) [unverified]. *Consequence:* **low growth needs a height**, and that height changes by season [inference].
- **Shelter and channelling come from buildings and enclosures.** Hougoumont was "a large and well-built country house, initially hidden in trees" with a "garden, and orchard", and La Haye Sainte was a "walled farmhouse compound" ([Wikipedia, Waterloo](https://en.wikipedia.org/wiki/Battle_of_Waterloo)) [secondary]. Sokolnitz was "perhaps the most contested area on the battlefield" at Austerlitz ([Wikipedia, Austerlitz](https://en.wikipedia.org/wiki/Battle_of_Austerlitz)) [secondary]. Village interiors behave as **passages** with a flow limit of about 1.2–1.3 men per metre of width per second, not as a speed factor (this repo's research §5) [secondary].

### 1.2 The named battles, and the attribute each one needs

| Battle | Terrain that decided it | What the engine must express | Tag |
|---|---|---|---|
| **Cannae** 216 BC | The Roman right anchored on the Aufidus river and the left near the Cannae heights, on a level plain where cavalry decided the battle ([Wikipedia, Aufidus](https://en.wikipedia.org/wiki/Battle_of_the_Aufidus); [MeG on Cannae](https://mortem-et-gloriam.co.uk/meg/?p=257)) | A river as a **flank anchor**: impassable or slow water. The site is disputed. | [secondary] |
| **Hastings** 1066 | An English shield wall on Senlac ridge, Norman attacks uphill; the Bretons attacked at the gentlest part of the slope, next to marshy ground ([Historic UK](https://www.historic-uk.com/HistoryMagazine/DestinationsUK/The-Battle-of-Hastings/); [Armchair General tour](https://armchairgeneral.com/battlefield-tour-hastings.htm/6)) | **Slope** as an effect on charges, not only on speed; **marsh** at the foot. | [secondary] |
| **Agincourt** 1415 | "Recently ploughed land hemmed in by dense woodland", rain-soaked; armoured men-at-arms exhausted by the "thick mud"; stakes against cavalry ([Wikipedia, Agincourt](https://en.wikipedia.org/wiki/Battle_of_Agincourt)) | **Ground state**: ploughed plus wet gives mud. **Dense wood** as an impassable funnel. **Field obstacles** (stakes, a Works sub-type). Load (armour) multiplies the penalty: a ruleset matter. | [secondary] |
| **Austerlitz** 1805 | The Goldbach stream and its villages (Telnitz, Sokolnitz, the castle); the "gently sloping" Pratzen; fog; retreat over the frozen Satschan ponds, whose ice was broken by bombardment. Draining a few days later found two or three bodies and about 150 horses, so the drowning is exaggerated ([Wikipedia, Austerlitz](https://en.wikipedia.org/wiki/Battle_of_Austerlitz)) | A **stream line** with marshy banks; **ice** as a water state with a load limit that fire can break; **ponds with an artificial level** (fishponds behind dams); villages as strongpoints. | [secondary] |
| **Borodino** 1812 | Earthworks: the Bagration flèches were V-shaped, "raised to chest height and fronted by a shallow ditch", built of sandy soil without gabions; the Shevardino redoubt was 4–5 ft of earth behind a steep-sided ditch ([Warfare History Network, J. North](https://warfarehistorynetwork.com/article/russian-earthworks-at-the-battle-of-borodino/)); the Raevsky redoubt ([Wikipedia](https://en.wikipedia.org/wiki/Battle_of_Borodino)) | **Works** with parapet height, ditch depth, a facing and an open gorge; they decay under fire (state). | [secondary] |
| **Waterloo** 1815 | Ridge and reverse slope; the hedged sunken Ohain lane; Hougoumont (house, walled garden, orchard, wood); La Haye Sainte; the sand pit with the 95th; sodden ground ([Wikipedia, Waterloo](https://en.wikipedia.org/wiki/Battle_of_Waterloo)) | **Relief-driven sight**; a **compound line** (a sunken road with hedges on both banks); a **compound settlement** (a building plus walled enclosure plus orchard plus wood); a **pit** (negative relief, cover); **moisture**. | [secondary] |

Ancient and medieval additions, not researched in depth here: chariots needed level, clear ground, and at Gaugamela Darius is said to have had the field levelled [unverified]. Elephants and large units were penalised in woods (Total War's pattern; [Steam TW:WH](https://steamcommunity.com/app/594570/discussions/0/3113646913561701217/)) [forum]. Teutoburg is the canonical forest-plus-marsh-plus-rampart ambush [unverified]. These add no new attributes. They need different **ruleset numbers** for the same attributes (firmness, clutter, slope) [inference].

---

## 2. How games and tabletop rules classify terrain

### 2.1 Three families

**(a) Going bands + linear obstacles + areas (tabletop).**

- **DBA/DBM** (ancients) sort ground into *good*, *rough* and *bad* going. Rough is "moderately boggy or rocky ground or brush". *Waterways* (navigable) are distinct from *rivers*, and *BUA*s are separate ([grognard DBA notes](https://www.grognard.com/info/dba.txt); [DBA cheat sheet](https://www.scribd.com/document/4569287/DBA-Cheatsheet)) [secondary/forum].
- **Black Powder 2**'s terrain chapter is "Woods, Rough Ground, Obstacles, Impassable Terrain". Rough ground costs double per inch. Artillery may not enter woods or rough ground except along a road, and light woods count as rough ([BP2 rulebook contents](https://rulespal.com/black-powder-second-edition/rulebook); [Warlord forum](https://www.warlordgames.com/community/topic/glory-hallelujah-questions/)) [primary contents/forum].
- **General de Brigade** classes built-up areas as difficult terrain, and players read small BUAs as woods-like and large ones as positional ([GdB forum](https://www.tapatalk.com/groups/generaldebrigadefr/built-up-areas-t7135.html)) [forum].
- **Lasalle 2** drops multipliers: difficult ground is a "complication" that costs momentum ([sammustafa.com](https://sammustafa.com/lasalle/)) [primary]. A house-rule discussion notes that it gives dice penalties to regulars "in, or attacking," rough terrain and bars squares there ([balagan.info](https://balagan.info/cavalry-in-rough-terrain-musing-on-a-lasalle-house-rule)) [forum].
- **Mortem et Gloriam**'s terrain table uses "Rough Going" for rocky or boggy ground, and its densest woods give all-round visibility of only 2 base widths ([MeG terrain table](https://mortem-et-gloriam.co.uk/meg/wp-content/uploads/2025/11/MeG-2026-Terrain-Table.pdf), search excerpt; the PDF returned 403) [secondary].

*Pattern:* every tabletop system has **(i)** about 3–4 going bands, **(ii)** linear obstacles as a separate class, **(iii)** woods in one or two densities, **(iv)** built-up areas, **(v)** an "impassable" flag that depends on the arm [inference].

**(b) Hex wargames: hex terrain plus hexside features.**

- **Commands & Colors: Napoleonics** gives each terrain a movement stop, a dice modifier per arm, and a LOS flag. Forest blocks LOS, stops movement, and gives Cav −2 and Art −1. Town gives Cav −3, and infantry cannot form square there. Hill blocks LOS to units behind it. Rugged hill is impassable. Field works are a **hexside** feature that does not block LOS. River is impassable except at a ford or bridge. A sand quarry is impassable to artillery ([C&C Napoleonics terrain](https://commandsandcolors.net/napoleonics/the-game/game-boxes/base-game/07-terrain.html)) [primary].
- **Napoleon at War** (hexwar): roads ½ MP "regardless of other terrain", trails 1 MP, rivers crossable only at bridges, streams +2 MP as a **hexside**, slope +1 MP. Forest and town block LOS, slope and rough do not. A defender's strength is multiplied by terrain ([hexwar common rules](https://www.hexwar.com/wiki/games/napoleon-at-war/common/common-rules.html)) [primary].
- **La Bataille** volumes list battle-specific terrain such as orchards, olive groves, arroyos, brush, farmettes and sunken roads ([La Bataille Talavera contents](https://rulespal.com/la-bataille-despagnol-talavera/rulebook); [Orthez](https://rulespal.com/la-bataille-dorthez/rulebook)) [primary contents].

*Pattern:* **area terrain and edge features are different things**, and roads **override** the area under them. That is exactly the split between our `cover` areas and `lines` [inference].

**(c) Layered tiles (Civilization).** Civ IV composes a tile from a base terrain, a hills flag, and features such as forest, jungle or floodplain, assumed to cover the tile uniformly. Features are removable, and building a city clears them ([Civ IV terrain, wiki](https://civilization.fandom.com/wiki/Terrain_(Civ4)), search summary; the page returned 402) [secondary]. Civ VI layers base terrain, feature and resource, with hills as a variant of the base, and puts rivers on tile **edges** ([CivFanatics, Civ VI terrain](https://civfanatics.com/?p=2010)) [secondary]. *Pattern:* **orthogonal layers**, each with its own small closed list, combine into many cases without a combinatorial enumeration. This is the elegance the owner is after [inference].

### 2.2 Real-time games

- **Total War** (Three Kingdoms, Warhammer): forests slow infantry and cavalry and protect against missiles. Units that stand still or move slowly hide in forest. Being in a forest does not by itself cut line of sight; a hill does ([TW wiki, 3K terrain](https://totalwar.fandom.com/wiki/Terrain_(Total_War:_Three_Kingdoms)); [TW:WH visibility wiki](https://totalwarwarhammer.fandom.com/wiki/Visibility?oldid=8669)) [secondary/forum]. In Three Kingdoms, elevation gives a missile damage bonus by height difference (same) [secondary]. *Lesson:* games separate **LOS blocking** (relief, solid objects) from **concealment** (being inside vegetation lowers detection range). We should too.
- **Ultimate General**: a cover gauge read from nearby terrain. Small units get full cover from small woods, while large brigades need the densest forest. Fences give cover only when garrisoned. Tall grass and fields conceal ([UG blog](https://ultimategeneral.com/blog/ultimate-general-is-fully-released); [Steam](https://steamcommunity.com/app/306660/discussions/0/1457328392108109279); [review](https://cdromfossil.com/2021/08/30/reviewing-ultimate-general-civil-war/)) [primary/forum]. *Lesson:* **cover is a fraction of the unit's frontage that has cover**, which our per-file sample points can compute directly [inference].
- **Age of Empires II**: a flat ±25% elevation damage modifier regardless of height difference ([AoE wiki, Elevation](https://ageofempires.fandom.com/wiki/Elevation)) [secondary]. That is a crude rule, and our ray-traced fire makes it unnecessary.
- **Scourge of War** and **TPS Waterloo**: no rule text was retrievable. A TPS Waterloo summary gives woods/villages as 2 MP for infantry and artillery and 3 for cavalry, with a fire protection value of 1 ([TPS rules](https://www.turningpointsimulations.com/cw3/Assets/Rules/TPS15_Waterloo_Rules.pdf), search excerpt) [unverified].

### 2.3 What this means for us

All of these systems **hard-code effect bands into terrain names** ("rough", "difficult"). For an era-generic engine that is backwards. The map should store **physical attributes**, and each ruleset should derive bands and effects from them. The ruleset can still **name** bands for the UI and for tuning (open, rough, difficult, impassable), but a band is a function's result, not a map value [inference]. Today's `napoleonic.ts` already behaves this way: classes such as `crops` and `denseWood` are the ruleset's, and map-format §5 says "wheat → `crops`".

---

## 3. The proposed model

### 3.1 Five layers plus state

```
point (x, z) ─┬─ relief    h            bed height, m (one heightfield: decision 0012)
              ├─ ground    material, firmness/moisture, stones   (what feet, hooves and wheels meet)
              ├─ water?    body id → level, flow, ice            (depth = level − h, derived)
              ├─ growth    low:   kind, height, density          (grass, crop, heath, reeds, scrub)
              │            stand?: kind, density, canopy, crownBase, undergrowth   (trees)
              └─ (thin features cross or sit on it)
lines         a polyline + width + preset: ways (road, track, causeway) and barriers (hedge, wall, fence, ditch, bank)
objects       a footprint + preset: buildings, enclosures, works, bridges, fords
state         season (0..3) → per-layer modifiers: snow depth, moisture, ice thickness, crop stage, leaf-on;
              plus scenario state: burnt, flooded, trampled, breached
```

Every layer is optional except relief and ground. Each has a **closed list of attribute names**, and a sub-type is a **named preset** of those attributes, in a ruleset-independent **catalogue file**. Map features name a preset and may override any attribute: `{"kind": "wood", "preset": "beech-high", "density": 0.5}`. This keeps today's map-format `kind` lists and adds `preset` beside them [inference].

### 3.2 Water: a separate level, not negative height

The owner's idea was to represent deep water as negative height. **Recommendation: keep the bed in relief, and give each water body its own surface level.**

1. **The level is not constant.** A river's level falls downstream: the art bible says it "only ever drops downstream" (`docs/art-bible.md` §6c). Satschan-type fishponds sit at a level set by their dams. A single "zero" for water is wrong everywhere except at the sea [inference].
2. **Depth is what every rule uses**: the wading limits of about 0.9 m for infantry, 1.2 m for cavalry and 0.7 m for guns (research §6; `napoleonic.ts` `water.limitByKind`), the look's colour bands, and ice. Depth = level − bed. It is cheap to derive and cannot be stored inconsistently [inference].
3. **Seasons and scenarios change the level, not the bed.** A flood, a spring spate, a summer low or a drained pond (the Austerlitz ponds were drained days after the battle, [Wikipedia](https://en.wikipedia.org/wiki/Battle_of_Austerlitz)) only moves `level`. A **flooded meadow** is just a level above the meadow's bed, with the meadow's growth kept underneath [inference].
4. **The code already works this way.** The look's water data stores "the water level of the nearest river sample … minus the ground, signed" (`src/look/world/water-data.ts`), and the sim stores depth per 1 m node (`src/sim/data.ts`). Negative heights would need a second pass to recover the same thing [inference].

The water body carries `level` (constant for a pond or lake, per centre-line sample for a stream or river), `flow` (m/s, from the line's order; it lowers the safe wading depth, research §6), `bed` (mud, sand, gravel, stone: wading footing) and `ice` (thickness, which is seasonal). A **marsh** is not a water body. It is **ground** whose moisture is at saturation, often with reeds and standing puddles. A **bog** is the same with a deep soft layer [inference].

### 3.3 Obstacle height: universal for sight, not enough for crossing

The owner's idea was to derive blocking from heights. **Evaluation:**

- **Sight: yes.** Line of sight needs, per point, the **height of the top of anything opaque**: ground + max(low growth height × opacity, stand canopy, thin feature height, building height), with porosity. A single derived **occlusion field** (top height plus opacity) built from all layers serves the sim's sight rays and the AI [inference]. Tall growth needs **two** heights, crown base and canopy top. A pine stand with a high crown base and no undergrowth can be seen into at eye level, while a spruce or a beech thicket cannot. That is why species matter to the sim only through structure [inference]. Total War's experience is that being in a wood should mostly reduce **detection** rather than hard-block rays ([TW:WH visibility](https://totalwarwarhammer.fandom.com/wiki/Visibility?oldid=8669)) [forum]. So opacity should accumulate with distance through a stand rather than act as a wall [inference]. Today's `fire.sight: { woods: 40, denseWood: 15 }` is this idea in metres.
- **Crossing: only partly.** At a 1 m grid, anything wider than about 2 m is relief: a cut bank, a sunken road 2 m deep, a redoubt's parapet and ditch, a railway-like causeway embankment, a cliff. The ruleset derives crossing from **slope and step height** between nodes: a step over about 1 m is impassable to guns and horses; one over about 2 m is impassable to formed infantry [inference]. Things **thinner than a cell** cannot be relief and must be lines with their own height. For those, height alone is not enough:

| Barrier | Height | Thickness | Sight porosity | Crossing kind | Same height, different effect |
|---|---|---|---|---|---|
| Post-and-rail fence | 1.2 m | 0.1 m | 0.9 | climb (or knock down) | Seen through; cavalry may jump |
| Quickset hedge | 1.5 m | 1–2 m | 0.2 | push through gaps only | Blocks sight; infantry through gaps; horse stopped |
| Dry-stone wall | 1.2 m | 0.6 m | 0 | climb | Blocks sight below 1.2 m; cover for men behind |
| Garden wall (Hougoumont-type) | 2–3 m | 0.5 m | 0 | none without a breach or ladder | Loopholes make it a firing position |
| Ditch | −1.5 m | 2 m | 1 | jump/climb out | Negative height, invisible from afar |
| Abatis | 1 m | 3–10 m | 0.6 | none at speed: clear or pass slowly | Low but nearly impassable |

The universal model for thin barriers is therefore **height (signed), thickness, sight porosity, a crossing kind (open, jump, climb, push, none), and gap spacing**. The ruleset maps (crossing kind, height, formation kind) to a delay or a block. That is the obstacle-strip row of the research's terrain table (g 0.2 for a line, 0 for guns "unless gap"), made attribute-driven [inference]. A **cliff** is not a separate kind. It is relief steeper than the ruleset's limit, plus an optional `rock` ground [inference].

### 3.4 Derived, not stored

The sim compiler (per ruleset, per season) turns the layers into what the sim reads today (classes, depth, cost) and what it will need: an occlusion field, a firmness field for grazes, and cover values.

---

## 4. The taxonomy

**E** = essential, the first version. **B** = bonus, later. Key attributes are the preset's values. Look-only attributes (colours, species meshes) are marked *look*.

### 4.1 Ground (the surface layer: material and state)

| Sub-type (preset) | Key attributes | E/B |
|---|---|---|
| meadow / grass | material: loam; firmness 0.8; low growth: grass 0.3 m | E |
| pasture (grazed) | loam; firmness 0.85; grass 0.1 m; stones optional | E |
| field: standing crop | loam; firmness 0.75; low growth: crop (kind, height by stage: wheat/rye 1.2–1.8 m [unverified], barley/oats ~1 m), density 1 | E (generic crop + stage), B (kind) |
| field: stubble | loam; firmness 0.75; low growth 0.15 m | E |
| field: ploughed / fallow | loam; firmness 0.6 (dry) → 0.3 (wet); low growth 0; furrow direction (*look*, and cavalry along/across: B) | E |
| heath / moor | sandy or peaty; firmness 0.7; low growth: heather 0.5 m; stones | B |
| rough / broken | loam + stones 0.5; low growth: scrub 0.5 m patches | E |
| sand | material: sand; firmness 0.5 (research table: loose sand η 2.1) | B |
| rock / scree | material: rock; firmness 1.0; stones 0.8–1.0 | B |
| mud | any material at moisture ≥ 0.8; firmness → 0.2 | E (as a moisture state, not a kind) |
| marsh / bog | peat; moisture 1.0; firmness 0.15 (bog 0.05); low growth: reeds/sedge 1–2 m; puddles | E (marsh), B (bog, deep soft layer depth) |
| bare earth (village yard, trampled) | loam; firmness 0.9; wear | E |
| snow cover | a state: snowDepth m (25 cm ≈ η 3.3, research §6); hides low growth under its depth | E (state), B (drifts by wind) |

Ground's few attributes: **material** (loam, clay, sand, gravel, rock, peat), **moisture** 0..1 (seasonal), **firmness** (derived from material and moisture, or overridden), **stones** 0..1, **wear** (roads and villages; *look*).

### 4.2 Growth (low layer and tall stand)

| Sub-type | Key attributes | E/B |
|---|---|---|
| broadleaf wood (oak, beech, lime, chestnut) | stand: leaf broad; density 0.4–0.8; canopy 18–30 m; crownBase 5–10 m; undergrowth 0.2–0.6; leaf-on by season | E (as `broad`), B (species presets) |
| conifer wood (pine, spruce, fir) | leaf: needle (evergreen); pine crownBase high (10 m), spruce low (2 m), undergrowth low | E (`conifer`), B (pine vs spruce) |
| mixed wood | leaf mix fraction | E |
| copse / tree clump | wood preset over a small area (< 1 ha) | E |
| dense thicket / young wood / coppice | canopy 4–8 m; crownBase 0.5 m; density 0.9; undergrowth 0.9 | E (as `denseWood` today) |
| open woodland / wood pasture | density 0.2–0.35; undergrowth 0.1 | B |
| birch, poplar, willow, alder | **mostly look**: poplar lines roads, willow and alder line banks (art bible §6c); structure like broadleaf | B |
| orchard | stand: rows; spacing 8–12 m; canopy 5–7 m; crownBase 1.5–2 m; often with an enclosure line | E |
| vineyard | low growth: vines 1–1.5 m on stakes/trellis in rows, row direction; terraces as relief | B (E for Peninsula/Italy maps) |
| olive grove | like an orchard, evergreen, canopy 4–6 m | B |
| hedgerow (as growth) | is a **line** (§4.4), not an area | — |
| scrub / brush | low growth: 1–3 m, density 0.3–0.8, patchy | E (part of `rough`), B (own preset) |
| reeds / sedge | low growth 1.5–2.5 m at the water's edge; opaque | E (as part of marsh/banks) |
| tall grass / fallow | low growth 0.6–1 m | B |

The stand's attributes are **leaf** (broad, needle, mix), **density** 0..1, **canopy** m, **crownBase** m, **undergrowth** 0..1, **trunk spacing** (derived from density), and **leafOn** (from season, with a per-species curve: *look* plus sight). Low growth has **kind**, **height**, **density** and **opacity**, plus **stage** for crops.

### 4.3 Water

| Sub-type | Key attributes | E/B |
|---|---|---|
| stream (≤ 5 m) | centre line; width; level per sample; depth profile (pools/riffles); flow; bed; banks per side (cut/bar/reed) | E |
| river (> 5 m, mostly unfordable) | same; fords as objects | E |
| pond / lake | area; constant level; depth from the bed; dam as an object (B) | E |
| ford | an object on a water line: local level/bed giving depth ≤ limit; bed firmness | E |
| marsh | ground state (§4.1), optionally with standing water: a pond body at depth 0.1–0.3 m | E |
| flooded meadow / inundation | a water body with a level above a meadow (seasonal or scenario) | B |
| frozen | water state: ice thickness (cm); load limit derived (infantry, cavalry, guns); breakable by fire | E (frozen pond/stream, Austerlitz), B (breaking) |
| canal / mill race | a stream preset with a straight cut-bank channel and a constant level | B |
| weir / dam / mill pond | objects that set a level step | B |

### 4.4 Lines (ways and barriers: thinner than the grid, or a route)

| Sub-type | Key attributes | E/B |
|---|---|---|
| road (highway, *chaussée*) | width 6–10 m; surface paved/metalled; firmness 1; ditches both sides optional; tree line optional (poplar) | E |
| road / lane | width 4–6 m; surface earth; firmness 0.9 (falls with moisture) | E |
| track / path | width 1–3 m; earth | E |
| sunken road | road + relief cut (depth 1–3 m, steep sides) + optional hedges on the banks | E (as a compound: a road with `cut` and `hedges` attributes) |
| causeway | road + relief raised 1–3 m across wet ground | B |
| hedge | height 1–2.5 m; thickness 1–2 m; porosity 0.1–0.3; crossing: push; gap spacing | E |
| wall (dry-stone, brick, garden) | height 0.8–3 m; thickness 0.4–0.8 m; porosity 0; crossing: climb (≤ 1.3 m) or none; loopholes (B) | E |
| fence (rail, paling, wattle) | height 1–1.5 m; porosity 0.7–0.9; crossing: climb; breakable (B) | E |
| ditch | negative height −1 to −2 m; width 1–3 m; may hold water (B) | E |
| bank / embankment / dyke | relief edit along a line (raised 1–3 m); often with a hedge on top (bocage) | B |
| tree line / avenue | a row of tall growth along a line (canopy, spacing): sight | B |
| palisade / stakes | crossing: none for horse, slow for foot; height 1–2.5 m | B (works) |

### 4.5 Built (objects with a footprint)

| Sub-type | Key attributes | E/B |
|---|---|---|
| building (house, barn, church, mill, manor, inn) | footprint; wall height; roof height; material (stone, brick, timber, wattle); openings for fire (loopholes); capacity (men it can hold); flammable | E (house, barn, church; generic attributes), B (all roles, capacity) |
| farm / walled compound | buildings + enclosing wall line + yard + gates (gaps) | E (Hougoumont/La Haye Sainte are the type) |
| village / town | an area with a street network (passages with width) + buildings + gardens/hedges; the sim treats it as passages with flow limits | E (village), B (town, walled town) |
| bridge | carries a way over a water line; width (sets flow); deck level; material; destructible (B) | E |
| windmill / watermill | building presets (watermill on a race) | B |
| cemetery, park, garden | enclosure line + low walls + trees | B |
| quarry / sand pit | relief cut (negative) + rock/sand ground; cover inside | B (Waterloo's pit: E for that map) |

### 4.6 Works (field fortification; era-generic)

| Sub-type | Key attributes | E/B |
|---|---|---|
| redoubt (closed) | footprint ring; parapet height (≈1.3–2 m) and thickness; ditch depth and width outside; gorge (open side) or closed; embrasures | E |
| flèche / lunette (open V) | as a redoubt, open at the rear; facing | E |
| entrenchment / breastwork / trench line | a line: parapet height, ditch, facing side | B |
| battery emplacement | a short parapet with embrasures for N guns | B |
| abatis | a line or area of felled trees: crossing none at speed, porosity 0.6 | B |
| palisade, stakes (Agincourt), caltrops, pits | line or area obstacles against horse | B (antiquity/medieval) |
| camp / laager (wagons) | a ring of wagon objects acting as a wall | B |

All works are **relief edits** (parapet and ditch at a wide enough scale) plus a **line** for the crest and its facing. Their state (`damaged` 0..1) lowers the parapet over a battle [inference]. The flèches' "sandy soil … without gabions" ([WHN](https://warfarehistorynetwork.com/article/russian-earthworks-at-the-battle-of-borodino/)) argues for a `revetment` attribute (none, fascine, gabion, timber) that sets decay [inference, B].

---

## 5. The attribute model: intrinsic vs derived

| Attribute | Where it lives | Intrinsic (map data) or derived (compiler/ruleset) | Notes |
|---|---|---|---|
| bed height h | relief | **intrinsic** | One heightfield (decision 0012); works, sunken roads and pits are relief edits |
| slope, step height | relief | derived (engine) | Per direction, at sim nodes; drives cliffs and banks |
| ground material, stones | ground | **intrinsic** | Preset |
| moisture | ground | **intrinsic per season** (map default + `seasons` override) or scenario weather | Waterloo's rain: a scenario state |
| firmness | ground | derived from material × moisture (overridable) | Feeds g, q, roundshot restitution/bury |
| snow depth | ground state | **intrinsic per season** | Hides low growth below its depth |
| water body level, flow, bed, ice | water | **intrinsic** (level per sample for lines) | Ice thickness per season |
| water depth | water | derived = level − h | Wading g and limits per ruleset |
| low growth kind, height, density, stage | growth | **intrinsic** (stage per season) | Crop height changes by season |
| stand leaf, density, canopy, crownBase, undergrowth | growth | **intrinsic** | Species = preset |
| leaf-on | growth | derived from season + leaf | Sight through bare woods in winter |
| barrier height, thickness, porosity, crossing kind, gaps | lines | **intrinsic** | Preset |
| way surface, width | lines | **intrinsic** | Road pace, flow width |
| building footprint, heights, material, openings, capacity | objects | **intrinsic** | |
| works parapet, ditch, facing, revetment | objects | **intrinsic**; damage = state | |
| occlusion top height + opacity | all | derived (engine) | Sight rays and detection |
| concealment (detection range factor) | all | derived (ruleset) | From growth opacity at the observed unit |
| passability per formation kind | all | derived (ruleset) | Today's `terrain[cls].g` |
| going band (open/rough/difficult/impassable) | all | derived (ruleset) | UI and tuning label only |
| cover from small arms / from roundshot | all | derived (ruleset) | Per file: what lies between the file and the shooter (barrier, building, parapet, trunk density), plus the ground's graze damping |
| defensibility, passage flow | built, lines | derived (ruleset) | Villages and bridges as flow limits |
| burnt, flooded, breached, trampled | state | **scenario/runtime state** applied as presets over a feature | |

The rule for deciding: **intrinsic = what a surveyor or a period map could record; derived = what a drill-master or a ruleset concludes from it** [inference].

---

## 6. Rich cases expressed

A feature names a preset and overrides attributes. Seasons and states override again.

**A flooded meadow.** The meadow stays a meadow, and a water body sits over it at a level just above the bed.
```jsonc
{ "id": "wiese", "kind": "meadow", "geometry": { "area": [...] } },
{ "id": "flood-1", "kind": "pond", "preset": "inundation", "geometry": { "area": [...] },
  "level": 182.4,                                   // the bed is ~182.0–182.3: depth 0.1–0.4 m, derived
  "seasons": { "summer": { "level": null } } }      // dry in summer: no water body
```
The sim derives wading g from the depth with the meadow's firmness under it. The look paints shallow water over grass.

**A sunken road with hedges (the Ohain lane).** One line expands into a relief cut, a way and two barriers.
```jsonc
{ "id": "ohain", "kind": "road", "preset": "lane", "geometry": { "line": [...] }, "width": 4,
  "cut": { "depth": 1.5, "side": 0.8 },             // relief edit: sunken, steep sides (sim: step height)
  "hedges": { "both": { "preset": "quickset", "height": 1.8, "gaps": 25 } } }
```
The compiler writes the cut into the heightfield, the road surface into ground, and two hedge lines on the banks. Sight across the lane is blocked twice. Crossing costs a hedge, a step down, a step up and a hedge.

**An orchard on a slope.** Relief carries the slope. Growth and line are independent of it.
```jsonc
{ "id": "verger", "kind": "orchard", "preset": "apple", "geometry": { "area": [...] },
  "rows": { "dir": 0.6, "spacing": 9 },
  "enclosure": { "preset": "hedge" } }
```
Sight under the crowns (crownBase 1.8 m) is open at the eye height of a mounted man but partial for a standing man. The ruleset's slope g applies to whatever direction a unit takes.

**A frozen marsh (December, Austerlitz-type).**
```jsonc
{ "id": "satschan-edge", "kind": "marsh", "geometry": { "area": [...] },
  "seasons": { "winter": { "moisture": 1.0, "frozen": { "ice": 0.12 }, "snowDepth": 0.1 } } }
```
Frozen ground has its firmness raised up to the ice's load limit. The ruleset decides that 12 cm of ice carries infantry but not a gun team, and that fire can break it (B).

**A burnt village (a scenario or runtime state).**
```jsonc
{ "id": "sokolnitz", "kind": "village", "geometry": { "area": [...] }, "houses": 40,
  "state": { "burnt": 0.6 } }                        // 60% of buildings → preset "ruin": roofs gone,
                                                     // walls 1–2 m, rubble ground (stones 0.7), no capacity
```
`burnt` swaps each affected building's preset for its ruin preset: the occlusion and cover change, and the streets' flow narrows from rubble. The look swaps to burnt materials and smoke.

---

## 7. Recommendations

1. **Adopt the five layers + state as the map format's model**, keeping today's collections. `relief` stays as it is. `cover` splits into `ground` and `growth` attributes on the same areas. `water` gains `level`. `lines`, `settlements` and `works` gain the barrier and building attributes. Most of this is renaming fields in `docs/proposals/map-format.md` §4 [inference].
2. **Add a preset catalogue file** (`data/terrain-presets.json` or similar), era-generic, validated, with every attribute in metres or 0..1. Rulesets **never** read preset names. They read attributes, so a new tree kind or crop is a data PR that touches no ruleset [inference]. One exception: the ruleset may key effects on a closed `crossing` enum and on growth `leaf`.
3. **Water as level, not negative height.** Keep the bed in relief. The sim and the look already work from level − bed.
4. **Obstacle height for sight, plus a crossing kind and porosity for movement.** Anything wider than about 2 m goes in relief and is judged by slope and step. Anything thinner is a line with these attributes.
5. **Let the ruleset derive** the going band, passability per formation kind, concealment, cover and graze damping. Replace the class table in `napoleonic.ts` with functions of attributes, keeping the class names as labels and tests (open, crops, ploughed, rough, woods, denseWood, marsh, hedge) so the numbers in research §6 still calibrate them [inference].
6. **First version (E):** relief; ground (meadow, pasture, crop/stubble/ploughed, rough, marsh, village ground; moisture and snow as states); growth (broad/conifer/mixed wood with density, canopy, crownBase, undergrowth; thicket; orchard; reeds); water (stream, river, pond, ford, ice); lines (road grades, sunken road, hedge, wall, fence, ditch); built (house, barn, church, walled farm, village, bridge); works (redoubt, flèche). **Later (B):** species presets, vineyard and olive grove, heath, sand, rock, bog depth, causeway, banks, tree lines, canals, weirs and dams, flooding, breakable ice, loopholes and capacities, entrenchments, abatis, stakes, palisades, wagon laagers, burning and ruin states, revetment decay.

### Open questions

- **Grid resolution for thin barriers in the sim.** The sim's fine grid is 1 m. Hedges and walls could be rasterised as a barrier class on that grid (as `hedge` is today) or kept as segments tested per file move. Segments are exact and cheap for sight rays; the grid is simpler for cost. This needs a measurement [inference].
- **Concealment model.** Should vegetation reduce detection range (Total War) or be accumulated opacity along the ray? The two can coexist; the ruleset would choose [inference].
- **Moisture as weather vs season.** Waterloo's mud came from one night's rain. A per-scenario `weather` override of moisture is probably the right place for it, not the map [inference].
- **Crop heights by era.** The historical crop heights here are [unverified] and need an agronomy-history source before they set sight numbers.

## Sources not retrievable in this session

The rule texts of General de Brigade, Age of Eagles, Napoleon's Battles, Scourge of War and Black Powder's terrain chapter were not found as readable text, and two PDFs (TPS Waterloo, Champs de Bataille) could not be parsed here. The claims about them above rest on forums and contents pages. Muir, Nosworthy and Hughes were not read directly. Their points reach this report through the repo's movement research and its Napoleonistyka citations, or are tagged [unverified].
