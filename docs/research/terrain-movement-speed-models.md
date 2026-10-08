---
status: research
last_reviewed: 2026-10-08
---

# Lagging files, not slowest ground, set pace

A Napoleonic battalion should not move at the speed of its slowest ground, nor at the average speed across its frontage. Period drill handled bad ground differently: men stepped short but kept the cadence, files that were blocked fell back and regained their places at the quick step, and lines halted to re-dress when the ragged part grew too large. The proposed lag model reproduces all three behaviours, and its parameters can be calibrated from sources. The quick-step ratio q is **100/76 ≈ 1.32 (French 1791) to 108/75 ≈ 1.44 (British 1792)**. Terrain multipliers g come from metabolic terrain coefficients (Pandolf/Soule η, road 1.0 to bog 1.8) and from period draught-capacity figures (a horse draws **1,360 kg on paved road, 860 kg on hard ground and 500 kg on rough ground**). Slope comes from Tobler's hiking function, capped at drill pace, which leaves the 2–3% gradients of a Waterloo-type field almost free. Ford limits are about **0.9 m for infantry, 1.2 m for cavalry and 0.7–0.75 m for guns**, with walking speed down about 40% at knee depth. Bridges and streets should be treated as flow limits of about **1.2–1.3 men per metre of width per second** rather than as speed multipliers. A small simulation of the lag model, run for this report, turned up three defects that need fixing. The battalion anchor can outrun every one of its files. Hurrying at q is allowed on ground where the sources say no quick step was possible. And the battalion's speed does not depend on what fraction of the frontage is on bad ground, which is the owner's central concern. A second lag tolerance on the *mean* lag fixes the last defect: with it, 8% of a line in a thicket costs about 0.5 s, 50% costs about 6 s and 100% costs the full 10.5 s. Most of the specific multipliers below are inferences from physical data and drill descriptions. No period source gives numeric speed penalties for woods, ploughland or marsh. The engine covers eras from antiquity to the Napoleonic period, so §6 separates generic engine mechanics from per-era numbers. The mechanics are the sample points, the lag model, the terrain and slope factors, bottleneck flow and fords. The numbers sit in an "era ruleset" table, and the Napoleonic ruleset is the first one filled in. A short note covers what other eras would need to set differently, and it is almost entirely inference.

**How to read the tags.** [REG] marks a regulation or manual, usually read through a secondary compilation. [PRACTICE] marks battlefield or campaign accounts. [SCI] marks a peer-reviewed or engineering source. [GAME] marks official game or tabletop rules, and [forum] marks player or modder reports. [unverified] marks a value that the research notes recalled but could not confirm against a fetched source. **[inference]** marks a design judgement or arithmetic made for this report. Nearly all regulation figures reach this report second-hand, through MacArthur's summary of Dundas, the Napoleonistyka essays and the Napoleon Series. The Prussian, Austrian and Russian cadences were not confirmed.

---

## 1. Drill cadence fixes the base speeds and the hurry ratio

### Infantry walked at 0.8–0.95 m/s and could hurry by about a third

The French Ordonnance of 1791 set a step of about 65 cm, with an ordinary pace of **76 steps/min** and a pas accéléré of **100/min** ([Founders Online, Noailles to Hamilton 1800](https://founders.archives.gov/documents/Hamilton/01-24-02-0384); [Militaire Spectator 1949](https://www.militairespectator.nl/sites/default/files/bestanden/uitgaven/1918/1949/1949-0256-01-0069.PDF)) [REG]. Noailles, writing in 1800, argued that troops moving faster than this "would be unable to form an attack". Dundas (1792) used a 30-inch (76 cm) step with an ordinary pace of **75/min**, a quick pace of **108/min** and a quickest or wheeling pace of **120/min**. He expected columns to march at the ordinary step "in all normal circumstances" ([MacArthur, Napoleonic Infantry March Rates](https://rodwargaming.wordpress.com/miltary-historical-research/military-historical-research/napoleonic-infantry-march-rates/)) [REG, secondary]. Most armies had a double of about 120–160/min, roughly twice the ordinary pace, and advancing columns used the quick step with the double only "for limited periods" (same source) [REG/PRACTICE, secondary]. Troops rushing in column ran out of breath after **50–100 paces** ([Napoleonistyka, Infantry tactics 4](https://www.napolun.com/mirror/napoleonistyka.atspace.com/infantry_tactics_4.htm)) [PRACTICE].

| Step | Cadence × step length | Speed | Tag |
|---|---|---|---|
| French ordinaire | 76/min × 0.65 m | 49 m/min ≈ **0.82 m/s** | [REG] → arithmetic |
| British ordinary | 75/min × 0.76 m | 57 m/min ≈ **0.95 m/s** | [REG] → arithmetic |
| French accéléré | 100/min × 0.65 m | 65 m/min ≈ 1.08 m/s | [REG] → arithmetic |
| British quick | 108/min × 0.76 m | 82 m/min ≈ **1.37 m/s** | [REG] → arithmetic |
| British quickest / double | 120/min × 0.76 m | 91 m/min ≈ 1.52 m/s | [REG] → arithmetic |
| French pas de charge | ~120/min × 0.65 m | 78 m/min ≈ 1.3 m/s | [unverified] |

The hurry ratio q in the lag model therefore has a direct source. From the ordinary step, the French could hurry by **q ≈ 1.32** and the British by **q ≈ 1.44** [REG → arithmetic]. From the quick step, the only faster pace was the short-burst double, about 120/108 ≈ **1.11** (British) or 120/100 ≈ **1.2** (French) [inference]. The headroom therefore depends on the pace the battalion is already using. A battalion at the ordinary step has about 30–45% spare speed for catching up, while one already at the quick step has about 10–20%, available only for a minute or so. For the 20 Hz sim, 0.82–1.37 m/s is **4–7 cm per tick**.

### Cavalry, guns and road columns

On the battlefield, cavalry walked at about **100 m/min (1.7 m/s)**, trotted at about **200 m/min (3.3 m/s)** and galloped at **300+ m/min (5+ m/s)** ([Napoleonistyka, Cavalry tactics](https://www.napolun.com/mirror/napoleonistyka.atspace.com/cavalry_tactics.html)) [PRACTICE, secondary]. Period estimates for the war horse are a walk of 5.8–7.7 km/h, a trot of 7.8–14 km/h and a gallop of 13.3–19 km/h. Saumur (1829) put the gallop at about 18 km/h ([Slitherine forum, quoting Chauviré](https://forum.slitherine.com/viewtopic.php?t=101948)) [REG via forum]. The gallop was begun **200–50 paces** from the enemy and raised gradually "to prevent the horses from being completely blown". Spanish hussars who galloped from 1,000 paces were blown before they had covered half the distance ([Napoleonistyka, Cavalry tactics](https://www.napolun.com/mirror/napoleonistyka.atspace.com/cavalry_tactics.html)) [PRACTICE].

A battery moved only as fast as its ammunition caissons. Horse artillery guns could hold a fast trot, horse artillery caissons a slow trot, and heavier batteries a walk with some trotting ([Napoleon Series, Ordnance Journal 7](https://www.napoleon-series.org/military-info/OrdnanceJournal/Issue7/SOJ-07_Part3_Weights.pdf)) [REG, search summary]. Foot artillery gunners marched beside their guns, so a foot battery was limited to infantry pace ([Wikipedia, Horse artillery](https://en.wikipedia.org/wiki/Horse_artillery)). Cotty (1832) prescribed the trot for battlefield movement and the gallop only in exceptional cases ([Napoleon Series, Artillery Horses](https://www.napoleon-series.org/military-info/organization/France/Artillery/c_artilleryhorses.html)) [REG]. On campaign, French armies made **20–30 km/day**, with forced marches of 32–48 km ([Napoleon Series, Military Innovations](https://www.napoleon-series.org/military-info/organization/c_rma.html); [Artillery Horses](https://www.napoleon-series.org/military-info/organization/France/Artillery/c_artilleryhorses.html)) [PRACTICE]. These daily totals include halts and column effects, so they should not be used for tactical V0.

### What drill did on bad ground

The sources describe four behaviours, and together they amount to a specification for the model. **Steep hills: "troops step short to keep the rhythm"; gentle slopes: "Ordinary Step can be maintained"** ([MacArthur](https://rodwargaming.wordpress.com/miltary-historical-research/military-historical-research/napoleonic-infantry-march-rates/)) [REG, interpreted]. Dundas kept the ordinary step on rough ground and allowed the quick step only on flat or gently undulating ground free of rocks and bushes (same source) [REG]. That limits q, not only g. **"Files blocked by an obstacle fall back by sections and regain their place at the quick step"**, and ranks re-form on the far side of streams and walls (same source) [REG]. This is the lag mechanism almost word for word. Nosworthy, as summarised by Napoleonistyka, says a line "required redressing", and that the faster it moved and the more obstacles it met (bushes, fences, ditches, dead and wounded), the more disordered it became. **Two battalions in line halted to dress more often than one**, while columns crossed all kinds of ground at varying speeds without much trouble ([Napoleonistyka 4](https://www.napolun.com/mirror/napoleonistyka.atspace.com/infantry_tactics_4.htm)) [PRACTICE]. Finally, "halted columns seldom regained their earlier momentum" (same source) [PRACTICE]. The general lesson is that terrain mostly cost order rather than raw speed: columns got through almost anything, lines had to halt and re-dress, cavalry could not charge through vineyards, rocks or deep snow, and guns bogged.

---

## 2. Physical models supply the multipliers that period sources lack

No period source gives numeric speed multipliers for woods, ploughed fields or marsh. The sources describe these effects only qualitatively. The multipliers in this report are therefore built from modern physiology and from period draught data, and then checked against drill descriptions and tabletop practice.

### Slope: Tobler capped at drill pace

Tobler's hiking function is **W = 6·exp(−3.5·|s + 0.05|) km/h**, where s = dh/dx. It gives about 5 km/h on the flat and peaks at 6 km/h on a −5% descent ([Wikipedia, Tobler's hiking function](https://en.wikipedia.org/wiki/Tobler%27s_hiking_function)) [SCI]. Sample values are 5.04 km/h at 0°, 5.26 km/h at −5° and 2.72 km/h at +10° (same source). Other models agree that gentle descents are fastest and steep descents slow. Langmuir's correction to Naismith's rule switches from a bonus to a penalty at a descent of about **12° (−21%)**, and GRASS r.walk uses tan 12° as its breakpoint ([Wikipedia, Naismith's rule](https://en.wikipedia.org/wiki/Naismith%27s_rule); [GRASS r.walk](https://grass.osgeo.org/grass-stable/manuals/r.walk.html)). Minetti's treadmill study found walking cost lowest at a gradient of **−0.10**, at 0.81 J·kg⁻¹·m⁻¹ against 1.64 on the level ([Minetti et al. 2002](https://iris.unibs.it/retrieve/ddc633e4-3c03-4e2e-e053-3705fe0a4c80/Minetti%20JAP%202002.pdf)) [SCI]. Irmischer and Clarke's road fit, v = 0.11 + exp(−(100s + 2)²/1800) m/s, peaks at s = −0.02 and has a floor of 0.11 m/s ([arXiv 1805.04973](https://arxiv.org/pdf/1805.04973)) [SCI, secondary quote]. Its off-road variant is [unverified].

Tobler describes what a hiker chooses to walk, not drill pace. A soldier at the ordinary step (3.0–3.4 km/h) has spare capacity relative to Tobler's 5 km/h. Tobler's flat speed reduced by the load factor below (≈0.87, for a 25 kg pack) is about 4.4 km/h, which is roughly **1.3×** the British ordinary pace [inference]. That spare capacity is why "gentle slopes" cost nothing. The slope factor for a formed unit should therefore be the normalised Tobler curve, scaled by that spare capacity and capped at 1:

```
g_slope(s) = min(1, k · exp(−3.5 · (|s + 0.05| − 0.05)))     s = signed grade along the direction of travel
```

With **k ≈ 1.3** (ordinary step), the battalion keeps full pace from about **−17% to +7.5%**. At +15% it falls to about 0.79, and at +25% to about 0.55 [inference, arithmetic]. With **k ≈ 1.0** (quick step), every climb costs speed and descents to −10% cost nothing. This reproduces MacArthur's reading of the regulations. It also means the slopes on a field like Waterloo, "rarely more than a 2 or 3 per cent gradient" ([Bell of Lost Souls, snippet](https://gamewire.belloflostsouls.net/?p=18366)) [PRACTICE, weak], affect line of sight and charge impetus but not marching speed. That fits the tabletop rules, none of which were found to have a slope movement rule.

Load enters through Pandolf's (W+L) term. A 75 kg man carrying 25 kg has (W+L)/W ≈ 1.33, which at equal power implies about **0.87×** level speed, with a larger penalty uphill through the V·G term ([Wikipedia, Pandolf equation](https://en.wikipedia.org/wiki/Pandolf_equation)) [SCI equation; the speed conversion is inference]. Load should therefore lower k (fewer free slopes, more fatigue) rather than V0, which is fixed by cadence. No source in the notes gives Napoleonic pack weights.

Cavalry need a different curve. Tobler gives horseback travel 5/4 of walking speed ([Wikipedia, Tobler](https://en.wikipedia.org/wiki/Tobler%27s_hiking_function)), but no measured horse speed-on-slope data was found. Waterloo supplies the qualitative effects: the Household Brigade gained "surprise and impetus… by charging downhill", and Allied cavalry later went "remounting the slope in great disorder" ([militaryhistorynow](https://militaryhistorynow.com/2018/09/02/cavalry-at-waterloo-how-mounted-troops-made-history-in-the-napoleonic-wars-final-battle/); [Napoleonistyka cavalry](https://www.napolun.com/mirror/napoleonistyka.atspace.com/cavalry_tactics.html)) [PRACTICE]. Total War applies the same pattern, slowing uphill charges, which reduces impact ([Total War wiki, Three Kingdoms terrain](https://totalwar.fandom.com/wiki/Terrain_(Total_War:_Three_Kingdoms))) [GAME, secondary]. A workable choice is to make k depend on gait: **walk 1.5, trot 1.15, gallop 1.0**, with the gallop barred on descents steeper than about −15% and on climbs above about +10% [inference, no source].

### Ground: Pandolf's η converts to roughly 1/√η of speed

The best-sourced numeric terrain scale is the Soule and Goldman terrain factor η in the Pandolf equation: **blacktop 1.0, dirt road 1.1, light brush 1.2, heavy brush 1.5, swampy bog 1.8, loose sand 2.1, soft snow 15/25/35 cm = 2.5/3.3/4.1** ([Wikipedia, Pandolf equation](https://en.wikipedia.org/wiki/Pandolf_equation)) [SCI]. A Durham summary adds grass 1.1, ploughed field 1.3 and hard-packed snow 1.6 ([Durham repository](https://durham-repository.worktribe.com/OutputFile/1387688)) [SCI]. Since the walking term is η·(W+L)·1.5V², holding metabolic power constant gives speed ∝ **1/√η**. That puts ploughland at 0.88, heavy brush at 0.82, bog at 0.75, sand at 0.69 and 25 cm of snow at 0.55 [inference]. Tobler's off-path factor of **0.6** and Aitken's paths-versus-other-ground ratio of **4/5** bracket these values ([Wikipedia, Tobler](https://en.wikipedia.org/wiki/Tobler%27s_hiking_function); [Wikipedia, Naismith](https://en.wikipedia.org/wiki/Naismith%27s_rule)) [SCI].

Tabletop rules are much harsher: rough ground and woods cost **half pace** for formed troops, while skirmishers move normally ([Black Powder playsheet](https://www.warlordgames.com/wp-content/uploads/2009/10/black-powder-playsheet.pdf); [V&B summary](https://volleyandbayonet.wordpress.com/about/)) [GAME]. The two figures measure different things. The energetic value of 0.75–0.9 is the walking cost for one man. The tabletop half includes the halts to re-dress, the sidestepping round trees and the obstacles that physics leaves out. The lag model exists to generate those extra costs, so its g should sit near the physical value. Effective speeds close to the tabletop half should then emerge for lines that keep order, without being built into g [inference]. Woods are the exception. A close-order file cannot walk through a trunk, so g for a formed line in woods should include sidestepping at about 0.5–0.6, against about 0.8 for skirmishers [inference].

### Guns: draught capacity sets gait, surface and grade limits

The period figures for draught make artillery easy to model. A horse could draw **1,360 kg on a paved road, 860 kg on hard ground, 500 kg on rough ground and 420 kg at the trot on a good road**. In mud, "guns sank to their axles", and in 1812 and 1813–14 teams were often doubled ([Napoleon Series, Artillery Horses](https://www.napoleon-series.org/military-info/organization/France/Artillery/c_artilleryhorses.html)) [REG/PRACTICE]. Gribeauval loads were **319 kg per horse for the 12-pdr, 251 for the 8-pdr, 250 for the 4-pdr and 314 for the howitzer**, against a target of about 318–350 that was "seldom achieved" (same source) [REG].

Comparing load with capacity gives each surface's permitted gait [inference]. Rolling resistance scales inversely with capacity, so relative to paved road it is 1.58× on hard ground and 2.72× on rough ground. Assume that the trot keeps the same 420/1,360 ≈ 0.31 share of walking capacity on every surface. Then the trot is possible on paved road for every gun, and on hard ground (capacity ≈ 266 kg) only for the 4- and 8-pdr. On rough ground (≈ 154 kg) no gun can trot. That matches the Ordnance Journal categories and Dundas's rough-ground restriction. Grade adds W·sin θ to the required pull. With a paved rolling coefficient of about **0.03** ([unverified]; classical 2–4% of weight), the corresponding values are about 0.047 on hard ground and 0.082 on rough ground. The walking limit for a 12-pdr is then about **10% on paved road, 8% on hard ground and 5% on rough ground**, and for a 4-pdr about 8% on rough ground. These figures agree with the modern guideline that **8% is the desirable maximum gradient for animal-drawn carts** ([Practical Action, Improving paths and tracks](https://kolibri.teacherinabox.org.au/modules/en-practical_action/Transport%20and%20infrastructure/Road%20building/KnO-100388_Improving%20paths%20and%20tracks%20part%203/page1.html)) [SCI]. Above the limit, the gun needs a double team, the prolonge or manhandling. No period source on any of these was retrieved.

### Water: knee depth costs about 40%

Li et al. tested **188 participants** at depths of 0, 0.35, 0.60 and 0.90 m. Going from dry ground to 0.35 m cut speed by **38.6% for men** and 44.8% for women, and further depth added progressively smaller reductions ([Li et al., Acta Polytechnica](https://ojs.cvut.cz/ojs/index.php/APP/article/view/11596)) [SCI]. A Malaysian study found speed at 0.9 m was about **50%** of dry-land speed ([USM repository](https://erepo.usm.my/items/a468b545-b764-4502-bc8f-3487efbd264d)) [SCI]. Bernardini et al., with more than 200 volunteers, found that speed loss tracks the flood force per unit width, so current matters as well as depth ([IAHR](https://www.iahr.org/library/info?pid=9379)) [SCI]. Walking in single file with a rope was **4.85% faster at 0.35 m and 11.24% faster at 0.60 m** than walking alone ([Li et al. 2023](https://katalog.hcu-hamburg.de/vufind/Search2Record/ELV065217608)) [SCI]. That supports keeping formation in a ford rather than letting men cross individually. Historical depth limits are **infantry 3 ft (0.9 m), cavalry 4 ft (1.2 m) and artillery 2.5 ft (0.75 m)**, "lessened if the stream be swift". Gravel bottoms are best, stony bottoms bad for horses and wheels, and sandy beds deepen as troops cross ([wordhelp "ford"](https://www.wordhelp.com/definitions/english/?q=ford)) [REG, undated]. A second table gives artillery 2 ft 4 in (0.71 m) ([Christchurch Libraries, Clutterbuck page](https://heritage.christchurchcitylibraries.com/Archives/OSullivan/Clutterbuck/Diary/PDF/0050-033.pdf)) [REG, unnamed manual]. The artillery limit exists to keep the limber's ammunition chest dry. No horse wading-speed data were found.

### Roads matter for wheels and columns, not for formed lines

For a walker, roads are worth about 1.25× compared with other ground (Aitken, 5 vs 4 km/h) and 1.67× compared with open country under Tobler's off-path factor ([Wikipedia, Naismith](https://en.wikipedia.org/wiki/Naismith%27s_rule); [Wikipedia, Tobler](https://en.wikipedia.org/wiki/Tobler%27s_hiking_function)) [SCI]. For guns the gain is **1.58× over hard ground and 2.7× over rough ground** by draught capacity, and the road also allows the trot [inference from REG data]. Tabletop rules give the road bonus only to march columns and limbered guns: Fire & Fury uses **×1.5 for march column and ×2 for field guns**, and roads and bridges cancel rough terrain for those formations ([RFF 1812 variant](https://www.fireandfury.com/rffvariants/RFF1812/RFF_1812_Variant_Rules_Ver1.pdf)) [GAME]. Volley & Bayonet calibrates road march to **2.5–3 mph sustained** ([V&B design notes](https://volleyandbayonet.wordpress.com/design-notes/)) [GAME]. Modern-era games use a road-to-off-road ratio of about 3:1 for vehicles, for example the Steel Division Crocodile at 48 and 15 km/h ([NamuWiki SD44](https://en.namu.wiki/w/Steel%20Division:%20Normandy%2044/%EC%9C%A0%EB%8B%9B%20%EB%8A%A5%EB%A0%A5%EC%B9%98%EC%99%80%20%EC%A2%85%EB%A5%98)) [secondary]. In the sim, a road should give g = 1.0 to formed infantry, which is cadence-capped. It should unlock a faster route-step V0 (about 1.25×) only for a column of route, and give guns their full draught advantage [inference].

---

## 3. Games and tabletop rules handle straddling with one of three crude rules

Real-time games generally use `speed = base(unit) × f(ground, unit class) × g(slope)` and publish few numbers. In Three Kingdoms, sand halves the speed of all units and forests slow infantry and cavalry. In Warhammer, forest penalises large units and water penalises infantry, with player-reported forest penalties for cavalry ranging from −20% to −40% speed (the reports conflict and none is official) ([TW wiki, Three Kingdoms terrain](https://totalwar.fandom.com/wiki/Terrain_(Total_War:_Three_Kingdoms)); [Steam, TW:WH terrain penalty](https://steamcommunity.com/app/364360/discussions/0/141136086923737908/)) [secondary/forum]. CoH2 patch notes set soft-ground multipliers for specific vehicles, for example the Elefant at 30% in mud and deep snow ([CoH2 changelog](https://steamcommunity.com/sharedfiles/filedetails/changelog/341279469?p=9)) [GAME]. Ultimate General says only that slope, terrain and obstructions "will affect unit movement realistically" ([ultimategeneral.com](https://www.ultimategeneral.com/ug-gettysburg.html)) [GAME]. None of these sources says whether terrain is applied per soldier or at the unit centre.

Only the tabletop rules state a rule for a unit that straddles two kinds of ground. **Fire & Fury: road distance is prorated, but a unit that leaves the road for woods moves its entire move at the broken-ground rate** ([RFF ACW QRS](http://www.fireandfury.com/rffsupportnew/RFF_ACW_Rules_for_QRS_II_Ver3.pdf)) [GAME, excerpt]. **Volley & Bayonet: any move "beginning, ending, or crossing" difficult terrain takes the reduction** ([V&B rules copy](https://pdfcoffee.com/volley-and-bayonet-rules-pdf-free.html)) [GAME, secondary]. Black Powder 2 counts each inch in rough ground double, which is per-distance accounting ([BP2 reference](https://bayareaminiatures.com/wp/wp-content/uploads/2023/02/Black-Powder-2-Reference.pdf)) [GAME, secondary], and charges a flat **6"** to cross an obstacle ([Black Powder playsheet](https://www.warlordgames.com/wp-content/uploads/2009/10/black-powder-playsheet.pdf)) [GAME]. House rules swap speed for disorder. Close-order troops in woods test every 6", and a unit passing a gap narrower than **half its frontage** tests and is disordered and stopped on 1–3 ([Will's Wargames](https://willwarweb.blogspot.com/2011/09/black-powder-variations.html); [Blenheim to Berlin](https://blenheimtoberlin.blogspot.com/p/black-powder-house-rules-september-2012.html)) [forum]. Lasalle 2 drops multipliers altogether and treats difficult ground as a "complication" that uses up momentum ([Lasalle 2](https://sammustafa.com/lasalle/)) [GAME].

None of these rules prorates by the *fraction of frontage* on bad ground. Proration in tabletop rules is always by the fraction of the move's distance. The "worst terrain touched" rule is a concession to measuring with a tape: a player cannot track a ragged line. Its harshness is not a historical claim. A sim with sample points can track the ragged line, so it can do what the drill manuals describe [inference]. The tabletop rules are still useful as a check. A formed line that keeps order and crosses a woods should come out at roughly half pace, and a skirmish screen should come out barely slowed.

---

## 4. The lag model matches the drill manuals once three defects are fixed

### Why lag is the right state variable

Take the model as proposed. Each of the 12 frontage points j has a terrain factor g_j and a lag l_j. Its speed is u_j = min(V0·g_j·q, V + l_j/τ), its lag evolves as dl_j/dt = V − u_j, and the battalion speed is V = min(V0, min_j(V0·g_j·q + (L − l_j)/τ)). Four features of the model have direct counterparts in the sources [inference, mapping]. First, g read as the ratio of step length to cadence is exactly "shorten the step, keep the cadence". Second, catching up at the quick step is Dundas's "fall back by sections and regain their place at the quick step". Third, the tolerance L is the threshold at which a real line halted to re-dress, and V can drop to zero once a lag exceeds L, which is the halt itself. Fourth, a min over more sample points means a wider frontage slows more often, which matches "two battalions halted to dress more often than one". The model also never averages. That is physically right, because no file can be in two places, and the only way a battalion "averages" is by bending.

One structural property follows: **bad ground costs time only where g·q < 1.** Ground that the files can cross at the hurry pace no slower than V0 creates no lasting lag. The quick-step ratio therefore decides which terrain is free, and this is why q has to vary with terrain and pace.

### Simulation results

A run of the model at 20 Hz (V0 = 0.95 m/s, τ = 3 s, q = 1.3 in the open, one of 12 points meeting a patch 10 m deep) gave these results [inference, scratch simulation]:

| Patch | q on patch | L (m) | Time lost (s) | Peak lag (m) | Re-dress after exit |
|---|---|---|---|---|---|
| Thicket g = 0.5 | 1.0 | 0 | **10.5** | 0 | — (= worst-terrain rule) |
| Thicket g = 0.5 | 1.0 | 2 | 8.4 | 2.0 | ~10 s |
| Thicket g = 0.5 | 1.0 | 5 | 5.3 | 5.0 | ~20 s |
| Thicket g = 0.5 | 1.0 | 10 | 0.5 | 9.5 | ~37 s |
| Thicket g = 0.5 | 1.3 | 0 | 5.7 | 0 | — |
| Thicket g = 0.5 | 1.3 | 5 | 0.7 | 4.8 | ~20 s |
| Rough g = 0.75 | 1.1 | 0 | 2.2 | 0 | — |
| Rough g = 0.75 | 1.1 | ≥2 | ≤0.3 | 2.1 | ~12 s |
| Rough g = 0.75 | 1.3 | any | ≈0 | 0.3 | ~3 s |

L = 0 with q = 1 reproduces the Fire & Fury and Volley & Bayonet "whole move at the worst rate" rule exactly, and a large L lets a small patch cost almost nothing apart from the re-dress afterwards. The model therefore contains the tabletop rule as a limiting case. The two settings differ in what they cost: one costs time, the other leaves a ragged line for half a minute. That is the trade-off between "keep order" and "push on".

### Defect 1: the anchor can run ahead of every file

With a large L, when the *whole* frontage enters woods, every point's lag grows together. V stays at V0 until the lags reach L, so the battalion's reference point walks on alone, ahead of all its men. In the simulation, a line entirely in a g = 0.5 thicket with L = 10 m "lost" only 0.5 s while every file trailed by 9.5 m. The fix is to renormalise after each tick: m = min_j l_j; l_j ← l_j − m; anchor ← anchor − m. This keeps the reference on the leading file. With the fix, the full-frontage case loses the correct 10.5 s [inference, verified in simulation]. The rule is also a determinism requirement, because without it the anchor position and the soldiers' positions diverge without limit.

### Defect 2: fraction of frontage does not matter

Because V depends only on the worst point, 1, 3 or 6 lagging points produce the same battalion speed. With L = 10 m, a line with half its frontage 9.5 m back loses no more time than one with a single file behind. The drill evidence suggests that one blocked section can fall back and catch up while the battalion marches on. If half the line falls back, the battalion is bending, and real commanders halted to dress. The fix is a second tolerance on the mean lag l̄ = (1/n)·Σ l_j. Let B be the set of points currently held at their hurry cap c_j. Then:

```
V ≤ ( Σ_{j∈B} c_j + n·(L_mean − l̄)/τ ) / |B|
```

The slack term n/|B| is large when few points are lagging and approaches 1 when all are. With L_max = 10 m and L_mean = 2 m in the same thicket, the time lost was **0.5 s at 8% of frontage, 0.5 s at 17%, 2.2 s at 25%, 6.3 s at 50% and 10.5 s at 100%** [inference, simulation]. This gives the scaling the owner asked for. It comes from a physical idea, a limit on how much of the line may be out of place, rather than from averaging speeds. L_max then limits how far any single section may straggle, and L_mean limits how much of the line may bow.

### Defect 3: hurrying where the regulations forbid it

Multiplying every g by the same q lets files hurry through rocks and brush at 1.3× the rough-ground pace. With g = 0.75 and q = 1.3, g·q ≈ 0.98, so rough ground becomes almost free (last row of the table above). Dundas allowed the quick step only on flat ground free of rocks and bushes. q therefore has to be a function of the ground under each point and of the battalion's current pace. Suitable values are about **1.3** (French) to **1.4** (British) on open ground at the ordinary step, **1.1** in light rough ground, and **1.0** in woods, marsh, fords and on steep slopes. When the battalion is already at the quick step, q should be 1.1–1.2 at most, limited in duration by a fatigue budget [inference from REG].

### Smaller fixes

There are several smaller fixes [inference]. *Depth.* Twelve points along the front rank describe a line well but miss most of a column, which may be 15–25 m deep. A column's rear ranks are still in a ford or a hedge gap after its head has cleared. For each point, g_j should therefore be evaluated as the time-weighted (harmonic) mean along the file's depth footprint. Alternatively, a column can carry a 3×4 grid of samples. *Aliasing.* A point should stand for a segment of frontage, about 2 m for a 25 m line, so g_j should be the harmonic mean along the direction of travel over that segment's footprint. Otherwise a 1 m hedge between samples is missed. *Linear obstacles* such as hedges, walls, ditches and stream banks should be strips 1–2 m deep with g ≈ 0.15–0.3. The blocked files then lag and catch up, which is the "fall back by sections" procedure, and the 6" tabletop cost emerges rather than being imposed. *Halts.* V must be clamped at zero rather than going negative. After a halt caused by lag, a resumption delay of a few seconds models "halted columns seldom regained their momentum" ([Napoleonistyka 4](https://www.napolun.com/mirror/napoleonistyka.atspace.com/infantry_tactics_4.htm)). *Stability.* With dt = 0.05 s and τ ≥ 2 s, the explicit update is well damped. In Q16.16 fixed point, compute 1/τ once and clamp each l_j at zero.

### Disorder from lag spread

Disorder should grow with lag and with speed, and fall when the line is dressed [inference, following Nosworthy's "the faster it moved and the more obstacles it met"]. One workable form is:

```
dD/dt = k_lag · max(0, l_max − L_ok)/L_ok · (V/V0)  +  k_bow · max(0, l̄ − L_ok/3)/L_ok  −  k_rec · [l_max < L_ok] · (1 + 2·[halted])
```

Here L_ok is the "dressed" tolerance, about 1–1.5 m. The k_rec term gives the halt-to-re-dress recovery. Under fire it should be scaled down, using the factor of 2–3 between drill-ground and battle times found in square-forming figures (100 s from line on parade, 4–6 min in battle; [Napoleonistyka 4](https://www.napolun.com/mirror/napoleonistyka.atspace.com/infantry_tactics_4.htm)). For columns the k terms should be lower and for skirmishers close to zero, matching "columns moved over all kinds of ground… without much trouble". No source gives a time for a line to re-dress after a hedge or stream, so a recovery of **30–60 s** for a dressed line is an extrapolation.

---

## 5. Bridges, streets and fords run on flow, not speed

When an opening is narrower than the formation, no value of g can describe it. The battalion must narrow, file through and re-form. The doctrine for this was to close up before the defile, pass in a narrow column, then halt beyond it until half and then all of the column had passed ([Washington, General Orders 1 June 1778](https://founders.archives.gov/documents/Washington/03-15-02-0297)) [REG, comparable American doctrine]. Columns were not to narrow below fours. When an obstacle forced it, they halted short, crossed in two files or single file and re-formed ([Rod's Wargaming, drills](https://rodwargaming.wordpress.com/miltary-historical-research/military-historical-research/basic-formations-and-movement-drills/)) [REG, secondary]. At Aspern each street took only one platoon ([Napoleonistyka 4](https://www.napolun.com/mirror/napoleonistyka.atspace.com/infantry_tactics_4.htm)) [PRACTICE].

Crowd science gives the flow constant. Empirical maximum specific flow on walkways is **1.2–1.8 persons/(m·s)** ([Seyfried et al., arXiv 0810.1945](https://arxiv.org/html/0810.1945v1)) [SCI]. Fruin's LOS E capacity is about **1.37 persons/(m·s)** ([AITPM guidelines](https://www.aitpm.com.au/static/uploads/files/aitpm-pedestrian-guidelines-final-v1-30092021-wfzcogdroyxz.pdf)) [SCI]. Bottleneck flow grows **linearly with width** through a zipper effect rather than in steps of whole lanes ([Seyfried et al. 2009](https://ideas.repec.org/a/inm/ortrsc/v43y2009i3p395-406.html)) [SCI]. The period evidence gives a cross-check. A 600-man battalion in a column of route four files wide occupies about 150 m and moves at 50–65 m/min ([MacArthur](https://rodwargaming.wordpress.com/miltary-historical-research/military-historical-research/napoleonic-infantry-march-rates/) for the files; arithmetic from §1). It passes about 4 men per metre of column × 0.9 m/s ≈ 3.6 men/s through a gap about 3 m wide, which is **≈ 1.2 men/(m·s)** [inference]. The figure from drill-ground marching and the figure from the crowd laboratory agree, so **J ≈ 1.2–1.3 men/(m·s)** is the right constant for formed infantry. Pushing, compressed crowds can exceed it [unverified ~1.9]. Disorder can bring it far lower. The Berezina crossing averaged roughly **1,000 men/hour** over two trestle bridges, with loose planks, a crush and stragglers ([EBSCO, Berezina](https://www.ebsco.com/research-starters/military-history-and-science/battle-berezina-river)) [PRACTICE; rate is inference]. At Leipzig, a single Elster bridge blown while still crowded trapped about **30,000 men** ([historyofwar.org](https://www.historyofwar.org/articles/battles_leipzig_19_october.html)) [PRACTICE].

For the game this gives a mode switch and a formula [inference]. When the clear width w is less than about **half the frontage**, the threshold the Black Powder house rule uses, the battalion leaves the lag model and enters passage mode. It closes up, converts to a column whose width fits w, passes N men at Q = J·w·g_surface, and holds its head beyond the passage until the tail has cleared. It then redeploys, using the same timed sub-unit schedule as any formation change. For a 100-man battalion and a 4 m bridge, the flow time is **100/(1.3·4) ≈ 19 s**. Narrowing and redeploying cost more than that, about 30–100 s by analogy with the drill timings, so for small units the cost of a defile lies mostly in the formation changes. For whole brigades queueing at one bridge, the flow itself dominates. Following units should queue for the bridge as a shared resource, so that a single bridge throttles a corps. For pathfinding, the narrow edge should carry an expected delay of about N/(J·w) on top of the travel time, so that large formations route around passes that small ones would take ([GRASS r.walk](https://grass.osgeo.org/grass-stable/manuals/r.walk.html) and [Amit Patel, movement costs](http://theory.stanford.edu/~amitp/GameProgramming/MovementCosts.html) give the per-edge cost pattern) [inference]. For gaps between half the frontage and the full frontage, the lag model can stay in charge: the blocked edge points get g ≈ 0.2 and fall back behind their neighbours.

The single-file speed–density relation is linear in 1/ρ ([Seyfried 2005, arXiv physics/0506170](https://arxiv.org/abs/physics/0506170)) [SCI]. A halt at the head therefore travels back down a column as a stop-and-go wave at roughly 0.3–1 m/s [unverified constants]. A 25 m column then takes about 25–80 s to "un-accordion", and a brigade column proportionally longer. This can be left to the renderer for single battalions. It matters in the sim only for queues of several units.

For fords, the flow and speed factors combine: Q_ford ≈ J·w·g_water(d). The depth cut-offs should be lower in fast current [inference]. No horse wading-speed data were found, and artillery is limited by keeping the ammunition chests dry, not by speed.

---

## 6. Recommended model: generic engine mechanics plus era rulesets

### Engine mechanics do not depend on era

The mechanics in §§2–5 contain no era-specific constants, so the engine can implement them once and read every number from a ruleset [inference]. The engine owns the following. It samples each formation's footprint at about 12 frontage points, evaluating g_j as a harmonic mean along each file's depth. It runs the lag model with anchor renormalisation and both tolerances (L_max, L_mean). It applies the capped Tobler slope curve with a per-unit-class k. It runs the draught test for wheeled units: required pull = load × (1 + s/c_surface) compared with gait capacity. It applies a depth-and-current water curve with hard cut-offs. It switches to passage mode when the clear width is below a set fraction of frontage, with flow J·w·g. It accrues disorder from lag spread. And it gives pathfinding edges a cost of 1/speed plus queue delay. A ruleset supplies the following data. For each unit class it gives V0 per pace, q per pace and ground class, k_slope per pace, the slope gait limits, the wading depth limit, J, the formation disorder scale, and L/τ presets per order. For each terrain it gives g per unit class and formation, plus obstacle strips. For each wheeled class it gives load per draught animal, capacity per surface and gait, and c_surface. With this split, an era is a data file, and the lag model's behaviour (worst terrain at L = 0, drill-style catch-up at large L) is the same in every era.

| Engine mechanic | Era-independent form | Ruleset supplies |
|---|---|---|
| Footprint sampling | n frontage points × depth footprint; harmonic g along travel | n per formation type (more for wide lines) |
| Lag model | u_j, dl_j/dt, V with L_max and L_mean; renormalise min lag to 0; clamp V ≥ 0 | V0, q(ground, pace), L_max/L_mean/τ presets per order |
| Terrain factor | g(terrain, unit class, formation) per point | the g table; obstacle strips |
| Slope | min(1, k·Tobler_norm(s)); gait bans by grade | k per class and pace; grade limits |
| Wheeled draught | gait feasible if load·(1 + s/c) ≤ capacity(surface, gait) | loads, capacities, c_surface |
| Water | g_water(depth, current); cut-off depth | curve points and limits per class |
| Bottleneck | passage mode below w/frontage threshold; Q = J·w·g | J per class; threshold; re-form schedule |
| Disorder | from lag spread, speed and terrain; recovery when dressed | k_lag, k_bow, k_rec per formation |

### Napoleonic ruleset (the first one filled in)

All g values are relative to the unit's current-pace V0 on firm, level open ground. "Line", "column" and "skirmish" refer to infantry order. Cavalry values apply at the walk or trot. Artillery values are for a limbered battery at the walk, and the trot needs the draught test in §2. Every number below is **[inference]** unless a tag says otherwise. The η column shows the source anchor.

### Base speeds and hurry ratios

| Unit / pace | V0 (m/s) | q (open) | q (light rough) | q (woods, marsh, ford, steep) | Basis |
|---|---|---|---|---|---|
| Infantry ordinary | 0.85–0.95 | 1.3 (Fr) / 1.4 (Br) | 1.1 | 1.0 | [REG] 76→100, 75→108 |
| Infantry quick | 1.1–1.35 | 1.1–1.2, fatigue-limited | 1.0 | 1.0 | [REG] double ≈120/min |
| Infantry double/charge | 1.3–1.5 | 1.0; ≤ 50–100 paces | — | — | [PRACTICE] out of breath |
| Cavalry walk | 1.7 | 1.5 | 1.2 | 1.0 | [PRACTICE] 100 m/min; trot 2× |
| Cavalry trot | 3.3 | 1.15 | 1.0 | 1.0 | [PRACTICE] 200 m/min |
| Cavalry gallop | 5–5.5 | 1.0; last 50–200 paces | barred | barred | [PRACTICE] |
| Foot artillery | ≤ infantry, ~0.8–0.9 | 1.0 | 1.0 | 1.0 | [REG] gunners on foot |
| Horse artillery | trot ~3 (road) | gait set by draught test | — | — | [REG] categories; [SCI] FSR trot 7 mph is later |

### Terrain factor g

| Terrain | η (Soule/Goldman) | Inf line | Inf column | Skirmish | Cavalry | Artillery |
|---|---|---|---|---|---|---|
| Paved/good road | 1.0 [SCI] | 1.0 | 1.0 (route step ×1.25) | 1.0 | 1.0 | 1.0; trot allowed |
| Dirt track, grass, pasture | 1.1 [SCI] | 1.0 | 1.0 | 1.0 | 1.0 | 0.85; trot for light guns only |
| Standing crops, light brush | 1.2 [SCI] | 0.9 | 0.95 | 1.0 | 0.9 | 0.75 |
| Ploughed / wet field | 1.3 [SCI] | 0.85 | 0.9 | 0.95 | 0.8 | 0.6; mud 0.25 or double team |
| Rough, rocky, heavy brush | 1.5 [SCI] | 0.75 | 0.8 | 0.9 | 0.6, no gallop | 0.4–0.5 (draught 0.37–0.58) |
| Open woods | — | 0.55 | 0.7 | 0.85 | 0.45, no charge | tracks only (else 0) |
| Dense woods | — | 0.35, force column | 0.5 | 0.7 | 0.25 | impassable |
| Marsh/bog | 1.8 [SCI] | 0.6 | 0.65 | 0.75 | 0.35, stuck risk | impassable |
| Loose sand | 2.1 [SCI] | 0.7 | 0.7 | 0.75 | 0.6 | 0.3 |
| Snow 25 cm | 3.3 [SCI] | 0.55 | 0.6 | 0.6 | 0.5, no gallop [PRACTICE Krasne] | 0.3 |
| Vineyard, walled enclosures | — | 0.5 + obstacle strips | 0.6 | 0.8 | 0.3, no charge [PRACTICE Oman] | impassable |
| Village interior | — | streets → passage mode [PRACTICE Aspern] | streets | 0.7 | streets only | streets only |
| Hedge, wall, ditch, bank (strip 1–2 m) | — | 0.2 | 0.25 | 0.5 | 0.15, jump/no | 0 unless gap |

Disorder accrual in each terrain should be scaled by formation: line 1.0, column 0.4, skirmish 0.1. This follows the qualitative ranking in Nosworthy, as summarised by Napoleonistyka.

### Slope, water, tolerance and flow

| Parameter | Value | Basis |
|---|---|---|
| Slope curve | g_slope = min(1, k·exp(−3.5(\|s+0.05\| − 0.05))) | [SCI] Tobler + [inference] cap |
| k, infantry ordinary / quick | 1.3 / 1.0 (lower with heavy load) | [inference] Tobler ÷ drill pace × Pandolf load |
| k, cavalry walk / trot / gallop | 1.5 / 1.15 / 1.0; gallop barred < −15% and > +10% | [inference]; no source |
| Artillery grade limit at walk | road ~10%, hard ~8%, rough ~5% (12-pdr), ~8% (4-pdr); beyond → double team/prolonge | [REG] draught + [unverified] c_r ≈ 0.03 |
| Water, infantry | g = 1.0 dry → 0.6 at 0.35 m → 0.5 at 0.9 m; impassable > 0.9 m (less in current) | [SCI] Li; USM; [REG] 3 ft |
| Water, cavalry / artillery | limit 1.2 m / 0.7–0.75 m; g ≈ 0.6 near limit; stony bed −0.1 | [REG] limits; g is [inference] |
| L_max (keep order / normal / push on) | 1.5 / 4 / 12 m | [inference]; 12 m ≈ half a 100-man line |
| L_mean (same presets) | 0.5 / 1.5 / 4 m | [inference] |
| τ (catch-up time constant) | infantry 3 s; cavalry 2 s | [inference] |
| L_ok (dressed) | 1–1.5 m | [inference] |
| Specific flow J, formed infantry | 1.2–1.3 men/(m·s) | [SCI] Seyfried, Fruin; [REG] cross-check |
| J, disordered crowd | 0.3–0.6 (falling with disorder) | [inference] from Berezina |
| Passage-mode trigger | clear width < ½ frontage | [GAME] BP house rule |
| Cavalry / gun flow | cavalry ≈ 0.5 horses/(m·s) at walk; guns ≈ 1 gun-with-vehicles per ~65 m of column at column speed | [inference]; Aston 60 guns ≈ 2.5 mi via [TMP](http://theminiaturespage.com/boards/msg.mv?id=226865) |

### What other eras would set differently

The research notes cover only the Napoleonic period. Everything in this subsection is therefore **[inference]**, except where a general physical source is cited, and should be checked against era-specific research before use. The physical sources carry over unchanged: Tobler's slope curve, the Pandolf terrain factors, the depth-speed data for wading, the crowd-flow constant J and the draught test. What changes between eras is the drill (q and L), the loads, and the mix of unit classes.

*Close-order heavy infantry (hoplite phalanx, pike blocks).* These should have small L_max and L_mean and a high disorder scale for lines. Their q is uncertain: a formation that marched without a fixed cadence has no regulation ratio to calibrate against, so a value of about 1.1–1.2 is a placeholder. Deep files make depth sampling matter more than for a three-rank line. With the lag model and small tolerances, these units would show the same behaviour as a Napoleonic line on broken ground, only more strongly. Skirmishers and light infantry should keep the large-L, low-disorder settings used here.

*Armoured men.* Body armour adds to Pandolf's load term in the same way as a pack, (W+L)/W ([Wikipedia, Pandolf equation](https://en.wikipedia.org/wiki/Pandolf_equation)). The ruleset should therefore lower k_slope (fewer free slopes) and raise fatigue rather than reduce V0. In water, armour should lower the safe depth, especially in current, given that stability depends on the force of the flow ([IAHR, Bernardini et al.](https://www.iahr.org/library/info?pid=9379)). No source in the notes quantifies either effect.

*Chariots, carts and baggage.* These use the draught test with their own loads and capacities. The general guideline of an **8% maximum gradient for animal-drawn carts** ([Practical Action](https://kolibri.teacherinabox.org.au/modules/en-practical_action/Transport%20and%20infrastructure/Road%20building/KnO-100388_Improving%20paths%20and%20tracks%20part%203/page1.html)) applies to any era, as do the very low g values for wheeled vehicles in woods and on rough ground. Light chariots would get a higher capacity-to-load ratio and therefore trot or gallop on firmer ground. On broken ground and steep slopes they behave like guns.

*Pre-gunpowder cavalry, elephants and camels.* These reuse the cavalry curve with different V0 and limits. Very large animals belong with Total War's "large units penalised in forest" pattern ([Steam, TW:WH terrain](https://steamcommunity.com/app/594570/discussions/0/3113646913561701217/)) [forum]. No numeric source for any of these classes was found.

*Bottlenecks and fords.* J and the passage-mode switch carry over unchanged, because they come from crowd physics. Only the re-form schedule after a defile and the wading depth limits are era data.

---

## Conclusion

Once its three defects are fixed, the lag model does more than compromise between the two rules it replaces. Both of them appear inside it as limiting cases. With L = 0 and q = 1 it reproduces the tabletop "worst terrain" rule. A large L_max combined with a tight L_mean gives the drill-book behaviour, where one blocked section falls back and catches up while the battalion marches on. The order the player gives ("keep order" or "push on") then selects a historically recognisable behaviour rather than a fudge factor. The fixes are anchor renormalisation, a q that depends on terrain and pace, and the mean-lag tolerance. All three are cheap and deterministic, and the first is required for correctness, not just for calibration. The most important calibration lever is the hurry ratio q, not the terrain factor g, because terrain costs time only where g·q < 1. The capped Tobler slope curve has a similar consequence: most Napoleonic battlefield slopes should cost no speed. In this model, a hill's role is concealment and charge impetus.

The weakest numbers are the cavalry and artillery slope curves, the wading speeds of horses, the woods multipliers and every recovery time. The sources describe these qualitatively, and the values above are reasoned guesses. The cheapest way to firm them up is to read the primary texts the notes could not reach: Dundas on passing obstacles, the 1791 Règlement on defiles, and an 1840s artillery Aide-Mémoire for gradient limits. The g table should be treated as tunable data with these provenance tags attached, so that a value can be replaced when a better source turns up.
