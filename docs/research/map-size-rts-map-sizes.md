---
status: research
last_reviewed: 2026-10-24
---

# Battle map size against soldier count in large-scale RTS and wargames

Research note for the map-view work. Question: how big are battle maps in large RTS and tactical wargames,
relative to how many soldiers they put on them, and what does that suggest for a one-figure-per-man
Napoleonic game whose typical match is 4,000–5,000 soldiers and whose extreme one is 32,000?

Date: 2026-10-24, by a research agent. Each figure is tagged [S] sourced, [C] community, [E] estimate; the sourced ones were not re-checked one by one.

## How to read the numbers

Every figure carries a tag:

- **[S]** sourced: a developer, publisher, official wiki or modding kit states it.
- **[C]** community: measured or claimed by players or modders (forum posts, mod docs). Quality varies; the
  method is given where known.
- **[E]** my own estimate, with the arithmetic shown.
- **n/f**: searched for and not found.

Density is soldiers per km² over the whole playable map. Where a game shows fewer figures than the men it
represents (sprites at 1:4, models at 1:10), the density counts the men represented, and the note says so.
Historical army sizes used in the arithmetic are the commonly cited ones (Wikipedia-level), not research.

Some fetches were blocked (TWCenter returns 403 to scripts, histwar.com rate-limited); for those the figure
comes from the search engine's excerpt of the page, and the row says so.

## Summary table

| Game | Map size (playable) | Soldiers on map | Density (soldiers/km²) | Real scale? |
|---|---|---|---|---|
| Napoleon: Total War (custom battle) | ~1 km × 1 km [C, measured] | 2 × 20 units, ~120–160 men/unit → ~5,000 [E] | ~5,000 [E]; up to ~10,000 with reinforcements [E] | No; "1/5 to 1/10" of a real battle's area [C] |
| Napoleon: Total War (historical Waterloo) | ~2 km × 2 km [C] | ~6–8k [E] | ~1,500–2,000 [E] | No |
| Empire: Total War | n/f (impressions of "2–3 miles square" on the largest [C, unmeasured]) | as NTW | likely as NTW [E] | No |
| Rome II / Attila (Warscape) | full scene 2,000 m × 2,000 m; playable square ≥ 50 m smaller [S] | 20 units per army, up to 40 per side at once [C]; 160 men per infantry unit on Ultra [C] → ~5–6k in a 1-v-1 [E] | ≥ 1,400 if the whole square is playable; typically 2,000–4,000 [E] | No |
| Warhammer (I–III) | "usable area" 2,048 m square; playable area is an editor rectangle inside it [S]; players say maps shrank since Shogun 2 [C] | 20 units per army, ~40 per side cap [C]; ~3–5k in a 1-v-1 [E] | ~1,000–3,000 [E] | No (fantasy) |
| Shogun 2 / FotS, Three Kingdoms, Pharaoh | n/f in metres (same 2 km engine family [E]) | 20-unit armies [C] | ~as above [E] | No |
| Ultimate General: Gettysburg / Civil War | n/f; maps are "approximations to the historical battlefields" [C] | UG:G: visible soldiers "can exceed 7,000" [S]; represents whole armies (Gettysburg ~165k historically) | n/f | Compressed in practice [C] |
| Scourge of War: Gettysburg | **5 × 5 miles (8.0 × 8.0 km, 65 km²)**, one map covers the whole battle [S] | full historical order of battle (~165k men); sprites at ~1:4–1:5 [C] | ~2,500 men represented [E]; ~500–650 sprites [E] | Yes, distances and time real [C, review] |
| Scourge of War: Wavre / Quatre Bras | **5 × 5 miles** each [S] | historical OOB: Wavre ~50k, Quatre Bras ~56k [E, historical] | ~770 / ~870 men represented [E] | Yes |
| Grand Tactician: The Civil War | **8 × 8 miles (12.9 × 12.9 km, 166 km²)** [S, developer] | brigades of ~3,000 [C]; big battles 60–170k [E, historical] | ~350–1,000 men represented [E] | Yes-ish (terrain from period topo maps [S]) |
| HistWar: Les Grognards | **24 km² to 660 km²** (4 map types) [S, via excerpt]; solo maps up to 27 km², multiplayer near 700 km² [S, interview] | up to 50,000 models per side representing up to 500,000 men, 1 model = 10 men [S, via excerpt] | ~1,000–2,000 men represented [E]; ~100–200 models [E] | Yes |
| Graviteam Tactics (Mius-Front, Op. Star) | typical battle ~1 × 2 km [C]; max 3 × 3 km, 5 × 5 km rendered (Op. Star) [C] | 500–1,000 typical [C]; one battle 3,700 + 1,600 [C] | ~250–2,600 [E] | Yes, ~1:1 men and terrain [C] |
| Steel Division 2 | **3 × 3 km** battlefield [S, PC Gamer from dev demo]; campaign 150 × 100 km [S] | n/f; low thousands of men [E] | ~100–350 [E] | Yes, "1:1 scale … to the maps" [S] |
| Wargame: European Escalation / Red Dragon | up to **150 km²** (≈12 × 12 km) [S] | n/f; mostly vehicles, ~1–3k men [E] | ~10–20 [E] | Yes-ish (ranges compressed) |
| Men of War AS2 / Gates of Hell | ~500 × 500 m "standard small map"; 800 × 400 m example [C] | ~100–300 men [E] | ~400–1,200 [E] | Near 1:1 men, small areas |
| Cossacks 3 | grid 320 / 480 / 640 (Normal / Large / Huge = 1×, 2.25×, 4× area) [S, game scripts]; metres per cell n/f | up to **32,000 units** on the field [S] | n/f | No (RTS abstraction) |
| Cossacks: Back to War | random maps, size selectable [S]; metres n/f | up to **8,000 units** [S] | n/f | No |
| Holdfast: Nations at War | n/f | 150 players (75 v 75) [S] | n/f | Near 1:1 men, small maps [E] |
| Supreme Commander (FA) | **5, 10, 20, 40, 81 km** square [S, wiki]; 20 × 20 km the usual large size, 40/81 km "lag" [C] | unit cap per player, vehicles not men | not comparable | Nominal km; units oversized |
| Beyond All Reason (Recoil engine) | map size in "map units" (512 elmos each, mapper convention [C]); no metric scale | vehicles | not comparable | No |
| Ultimate Admiral: Age of Sail (land) | n/f | players report 2–3k enemies in a land mission [C] | n/f | n/f |

For comparison, real fields:

- **Waterloo**: the ground actually fought over was about 8 km² [S, Rijksmuseum]; about 140k men on it before the
  Prussians arrived [historical] → ~17,000 men/km². Wellington's ~68k held a front of ~4 km → ~17k men per km
  of front [E, historical].
- **Gettysburg** in Scourge of War's 65 km² box → ~2,500/km² [E]. The difference from Waterloo is the box: SoW's
  map includes the approaches, the fields actually fought over are a fraction of it.

So "density over the whole map" is mostly a statement about how much empty approach ground the designer gives,
not about how tightly soldiers stand. Total War gives almost none; Scourge of War and Grand Tactician give a lot.

## Per-title notes

### Total War (Creative Assembly)

**Map size.** The Attila assembly kit documents a full battlefield of 2,000 × 2,000 m, with a square playable area
that "must be a minimum of 50 metres smaller" [S]. The Warhammer kit documents a 2,048 m square "usable area"
(physics and pathfinding active), a playable area inside it ("where units can be ordered to move", whose edges
are the camera bounds and the reinforcement entry points), and a tile map rendered out to 8 km from the centre
as scenery [S]. So the **playable area is at most ~2 km and usually smaller; everything out to 8 km is
decoration**.

**Napoleon: Total War, measured.** A TWCenter thread by BruceR measured NTW fields from unit frontages: men at
0.8 m centre to centre, so a 160-man unit is ~65 m wide; custom-battle deployment zones on a standard map are
~200 × 800 m and campaign ones ~125 × 900 m, giving an **~1 km square battlefield**; historical maps are larger,
Lodi ≥ 1.5 km, **Waterloo ~2 km square**; the author put NTW fields at roughly **1/5 to 1/10** of the area of the
comparable real battle [C, via search excerpt; page blocked to direct fetch]. Modders enlarged deployment zones
to ~4.5 km² and claimed maps up to 30 km² against a vanilla ~9 km² [C]. From the 65 m per 160 men figure, NTW
frontage is **~400 m per 1,000 men** in its two-rank line [E].

**Soldiers.** 20 units per army; about 40 units per side on the field at once, the rest queue as reinforcements
[C, several forum threads]. 160 men per infantry unit on Ultra in Rome II [C] and in NTW (BruceR's 160-man
unit) [C]; Warhammer infantry is smaller (commonly 120 on Ultra) [C, not verified]. A one-army-a-side battle is
~4–6k men [E].

**Approach.** Deployment zones near the map edges, roughly 125–200 m deep [C]; reinforcements enter at the
playable-area edge [S]. There is little or no approach march: the armies start within long-musket or artillery
range. Players complain of maps that feel small, with "zero room to flank" in WH3 [C], and read the shrinkage as
CA's effort to shorten battles [C]. No developer statement on the reason was found.

**Fog of war.** Line-of-sight based; units hidden in woods (series design; not re-verified here).

### Ultimate General: Gettysburg and Civil War (Game-Labs)

No map dimensions published. UG:CW's store page speaks of battles "over hundreds of square miles of terrain"
(marketing, contradicted by the maps' size in play) [S]. A player answer in a scale thread: the maps "are
approximations to the historical battlefields", and estimating distances from unit sizes "will just end up
confusing"; infantry fire range reads as 300 game units, artillery 1,000+ [C]. UG:G's blog says the soldiers
visible in a battle "can exceed the 7,000" [S]; units are brigades with historical strengths. UG:G divides the
battle into **phases and sectors** so the player rarely has the whole map [C, review]; patch 0.81 introduced a
"realistic battle speed" [S, title only]. Fog: hills let you see earlier, forests conceal, dismounted cavalry is
harder to spot, reconnaissance skill matters [S, store page].

### Scourge of War (NorbSoftDev; Gettysburg, Waterloo, Wavre, Quatre Bras, Remastered)

- **Map**: "One 5x5-mile map covers the entire Gettysburg battle area", plus five high-resolution sector maps [S].
  Wavre and Quatre Bras: "historically correct 5-mile x 5-mile" maps [S]. Waterloo's base map size: n/f
  (likely the same family [E]).
- **Soldiers**: full historical order of battle [S]. Sprites stand for several men: ~1:4 at default in Waterloo
  [C], "one sprite equals 5 men" in Gettysburg [C]; Remastered caps a battalion formation at 200 sprites, so a
  "1" scale setting is still not 1:1 [C, developer reply quoted in a forum].
- **Scale**: a review calls it "real distances and time" [C]; one player argued the map scale is 1:3 against a
  1:4 unit scale [C, opinion].
- **Approach and command**: historical start positions and timed arrivals; orders travel by **courier on
  horseback** [S]; officers interpret orders and send their own couriers [S, Matrix page].
- **Why so big**: 2D sprites on 3D terrain let it show "far larger armies than most games" [S].

### Grand Tactician (Hexdraw)

- **The Civil War**: developer Zipuli (Feb 2019): battle maps are **8 × 8 miles** [S]. Terrain built from old
  topographical maps [S]. Units are brigades (~3,000) [C]; regiments were judged impractical for the engine [C,
  second-hand].
- **The Napoleonic Wars (1792–1815)**, in development: the first game averaged one model per 25 soldiers and
  the new combat system "moves toward 1:1 models" [S, via excerpt]; the battle layer is generated 1:1 from the
  campaign terrain at the point of contact [S]; battalions of up to ~1,000 men [S]. Battle map dimensions n/f.
  Players there ask for maps large enough that armies "need to march large distances to support each other" [C].

This is the closest existing design to the one in question (Napoleonic, approach, 1:1 models).

### HistWar: Les Grognards (HistWar team)

Real-scale Napoleonic grand tactics. Maps of **24 km² to 660 km²** in four types [S, via excerpt]; solo maps up
to 27 km², multiplayer near 700 km² (Jean-Michel Mathé, Armchair General interview) [S]. Up to 100 units
(brigades, regiments, batteries) and 11 corps commanders a side; orders are timed and relayed through a tactical
AI; engagements can last several days [S]. 1 model = 10 men; 50,000 models a side representing up to 500,000
men [S, via excerpt]. The large multiplayer maps exist because the battle includes the operational approach.

### Graviteam Tactics (Mius-Front, Operation Star)

Operational map of 140+ km² (Mius-Front) and 260 km² (Op. Star) [S]; each tactical battle is cut from it. Players
report the engine works in 1–2 km cells, a 3 × 3 km battle maximum with 5 × 5 km rendered [C], a typical
**1 × 2 km** battlefield, and a "Battle Radius" setting [C]. Typical battles have 500–1,000 men; one reported
battle had 3,700 against 1,600 [C]. Players complain that at 1 × 2 km "you are in a firefight straight away"; the
attacker gets ~1 km of depth to manoeuvre, the defender a few hundred metres; they ask for 4 × 4 or 6 × 6 km
[C]. The reason given for the small maps: building them takes months [C].

### Eugen Systems (Steel Division, Wargame)

- **Steel Division 2**: "everything recreated on a 1:1 scale, from the size of the tanks to the maps";
  **3 × 3 km** real-time battlefield inside a 150 × 100 km campaign (PC Gamer, from a developer demo) [S].
- **Steel Division: Normandy 44**: the Omaha map has a 6 km beach [S]; a reviewer doubts strict 1:1 [C].
- **Wargame: European Escalation**: maps up to **~150 km²** (60 sq mi) [S]; Red Dragon's "Russian Roulette" 10v10
  map is "the largest playable area ever designed for the game", circular, with six deployment zones so each side
  can flank from the start [S]. Weapon ranges are compressed against the map (genre knowledge, not re-verified).
- Fog of war in both: units are hidden until spotted by a unit with line of sight and optics (series design).

### Men of War / Gates of Hell (Best Way, Barbedwire)

Small maps: 500 × 500 m is "the standard size for small maps in GoH" (a mapmaker), 800 × 400 m another example;
an older minimap grid square read as 100 m [C]. Squad-to-company scale; density is high locally but headcount low.

### Cossacks (GSC)

- **Cossacks 3**: "up to 32 000 units present on the battlefield at the same time" [S]. Map grid sizes from the
  game scripts: Normal 320, Large 480, Huge 640 (area 1×, 2.25×, 4×); the Big Maps patch described Large as 2×
  and Huge as 4× standard [S]. Metres per grid cell: n/f. Bigger maps "may" cost memory and loading time [S, via
  excerpt]. Fog of war: classic RTS.
- **Cossacks: Back to War**: up to 8,000 units [S]; map size selectable on random maps [S]; metres n/f.

Neither is real scale; they are the only games near our 32,000 figure, and do it on maps whose real-world size is
undefined.

### Holdfast: Nations at War (Anvil)

150 players (75 v 75) per server, 70+ maps [S]. Map dimensions n/f. First-person; included only for headcount.

### Supreme Commander and Beyond All Reason

Supreme Commander's official maps are labelled 5, 10, 20, 40 and 81 km square (e.g. Varga Pass 10 × 10 km,
Seraphim Glaciers 20 × 20 km) [S, wiki]; players say 20 × 20 km is enough and 40/81 km "lag hard" and units take
"ages" to cross [C]; The Great Void is 40 km but play uses the centre 20 km [C]. The kilometres are nominal: units
are oversized against them. BAR (Recoil engine) sizes maps in map units of 512 elmos, a holdover convention [C],
with no metric meaning. Useful only as a reminder that a 4× bigger map is 4× longer marches, and that players
retreat to the size where contact comes in minutes.

### Ultimate Admiral: Age of Sail (Game-Labs)

Land battles exist; map size and unit strengths n/f; players report land missions against 2–3k enemies and unit
strengths of 30–200 men [C].

## What the survey shows

1. **Two families.** Arcade-tactical games (Total War, Ultimate General, Cossacks) put the armies on 1–4 km² at
   **~1,500–10,000 soldiers/km²** and start them nearly in contact. Grand-tactical wargames (Scourge of War, Grand
   Tactician, HistWar) use real distances on **65–660 km²** maps at **~400–2,500 men represented/km²**, and get
   their approach from historical arrival times, couriers and phases. Modern-era tactical games (Steel Division,
   Wargame, Graviteam) sit at 2–150 km² with far fewer men.
2. **Map area is not soldier spacing.** Every game packs units into formations at near-real spacing (NTW 0.8 m per
   man); what varies is the empty ground around them. Waterloo's fought-over core was ~17,000 men/km²; SoW's
   Gettysburg box is ~2,500 because it includes the approaches.
3. **Players of the small-map games ask for more room** (NTW mods to 30 km², Graviteam players asking 4 × 4 km,
   WH3 "no room to flank"); players of the huge-map RTS (SupCom 40–81 km) retreat to smaller ones because the
   marches are too long and the game too slow. Neither extreme is liked.
4. **Developer reasons, where stated**: battle length (Total War, as players read it), map-building cost and engine
   cells (Graviteam), engine load from many small units (Grand Tactician), memory and loading (Cossacks 3), and
   the historical battlefield itself (SoW, HistWar). No explicit performance-per-km² statement was found.

## Recommendation for this game

Frame: one figure per man; typical match 4–5k total, extreme 32k; fog hides units but not terrain; the designer
wants an approach and a guess before contact, but not a whole historical field. All numbers in this section are
**[E]**.

**Frontage first.** A Napoleonic line in three ranks takes ~0.55–0.65 m per file, so ~200 m per 1,000 men (two
ranks ~300 m; NTW's measured line ~400 m). A side of 2,500 with a third in reserve fronts **~350–500 m**; a side of
16,000 in two lines with reserves fronts **~1.6–2.7 km** (about 6–10k men per km of front, against Wellington's
~17k/km at Waterloo).

**Room for the approach.** At ordinary pace (~75 paces a minute, ~3.5 km/h) infantry crosses 2 km in ~35 minutes
of game time. A map should let each side start beyond the other's sight and artillery reach (roundshot ~1–1.5 km,
visible formations ~2–3 km on open ground) and give a front several times the deployed width, so a flank
march is possible and has to be guessed. That suggests a map side of **about 6–8 times one side's frontage**.

**Proposed sizes.**

| Match | Soldiers | Map (square) | Area | Density | Front as share of map width |
|---|---|---|---|---|---|
| Typical | 4,000–5,000 | **4 km** (range 3–5 km) | 16 km² (9–25) | **~250–300/km²** (160–550) | ~10–12 % |
| Extreme | 32,000 | **8–10 km** | 64–100 km² | **~320–500/km²** | ~20–30 % |
| Approach scenario (optional) | 32,000 | 12–16 km | 144–256 km² | ~125–220/km² | ~10–20 % |

Both main sizes keep the density roughly constant (side ≈ √(soldiers ÷ ~300–500 per km²)), so the extreme match
plays like a bigger typical match rather than a more crowded one.

**Where that sits against the survey.**

- **5–20× sparser than Total War** (1,500–10,000/km²): that is the point, Total War has no approach.
- **Below the real-scale black-powder games' whole-map density** (SoW Wavre / Quatre Bras ~800–900, Gettysburg
  ~2,500; Grand Tactician ~350–1,000; HistWar ~1,000–2,000 men represented): the recommended maps are smaller
  than theirs (16–100 km² against 65–660 km²) but carry far fewer men, so manoeuvre room per man is comparable or
  larger. 8–10 km for the extreme match is just above SoW's 8 km box; 16 km approaches Grand Tactician's 12.9 km.
- **Larger than Graviteam's 1 × 2 km**, which its players call too cramped for a few thousand men, and in line
  with the 4 × 4 to 6 × 6 km they ask for.

**Why not 16 km for everything.** At 4–5k soldiers a 16 km map is ~20/km², a Wargame-like emptiness: the two
armies (each ~0.5 km wide) can miss each other, marches take hours of game time, and terrain area (bake, staff
map, memory) grows 16× over 4 km for no tactical gain. Keep 12–16 km for scenarios that are about the march
(timed reinforcements entering from the map edge, as SoW and HistWar do).

**Design couplings to settle with the size.**

- **Time scale**: at 1:1 time a 4 km map means ~30–40 minutes of marching before contact. Either accept it, give
  a time-acceleration control while out of contact, or compress time; Scourge of War keeps real time, Ultimate
  General added a "realistic battle speed" patch.
- **Sight**: on flat open ground formations are visible for several km, so a 4 km map without ridges, woods or
  a sight cap has no hidden enemy. Fog only works if the terrain generator guarantees dead ground (SoW and UG
  rely on hills and woods).
- **Deployment**: start zones about 2–3 km apart on the 4 km map, and off-map entry for reinforcements on the
  big ones; a zone wider than the force so the starting position is itself hidden.
- **Rectangles**: real battle maps are wider than deep; a 5 × 3.5 km map gives the same area as 4 × 4 km with
  more flanking room. Worth testing if the engine allows it.
- **Measure**: these are estimates. Confirm with playtests of the approach time and with the bench on terrain
  size before fixing the numbers.

## Sources

Total War

- Attila assembly kit, battle tags (2,000 m battlefield, playable area): https://wiki.totalwar.com/w/Total_War:_ATTILA_KIT_-_Battle_tags
- Warhammer assembly kit, Terry intro (2,048 m usable area, 8 km tile map, playable area): https://wiki.totalwar.com/w/TWW_Assembly_Kit_Terry_Intro
- TW modding wiki, land battle maps: https://tw-modding.com/wiki/Battle_Maps:Land_Battle_Maps
- BruceR, "Some data on the size of NTW battlefields" (TWCenter; read via search excerpt, page 403s): https://www.twcenter.net/threads/some-data-on-the-size-of-ntw-battlefields.345583/
- "Maximized Battle Maps Tweaking for Larger 40+ Unit Battles" (TWCenter; via excerpt): https://www.twcenter.net/threads/maximized-battle-maps-tweaking-for-larger-40-unit-battles.626083/
- Steam, WH2 "Total war getting smaller battle maps": https://steamcommunity.com/app/594570/discussions/0/1752358461526397793/
- Steam, WH "Size of the battle maps?": https://steamcommunity.com/app/364360/discussions/0/357285398699288593/
- Steam, WH3 maps feel small: https://steamcommunity.com/app/1142710/discussions/0/4353373056338659396
- Rome II unit size and army cap threads: https://steamcommunity.com/app/214950/discussions/0/864978109687753087 , https://www.twcenter.net/threads/submod-released-epic-armies.661392/
- WH3 units per side: https://steamcommunity.com/app/1142710/discussions/0/4327475903877084347

Ultimate General / Ultimate Admiral

- UG: Gettysburg official page: https://www.ultimategeneral.com/ug-gettysburg.html
- UG: Gettysburg patch 0.81, realistic battle speed: https://store.steampowered.com/news/app/306660/view/2922229425717228395
- UG: Gettysburg blog (soldiers can exceed 7,000): https://ultimategeneral.com/blog/august-progress
- SEVENCUT review (phases and sectors): http://www.sevencut.com/grevs/2014/8/25/ultimate-general-gettysburg-reviewed
- UG: Civil War store page: https://store.steampowered.com/app/502520/
- UG: Civil War "Finding it hard to map to reality": https://steamcommunity.com/app/502520/discussions/0/3111395750243790911/
- UA: Age of Sail land-battle threads: https://steamcommunity.com/app/1069650/discussions/0/2962768085002203569 , https://steamcommunity.com/app/1069650/discussions/0/3378284761888226508/

Scourge of War

- Gettysburg game details (5 × 5 mile map, couriers): https://www.scourgeofwar.com/gburg.shtml
- Wavre store page (5 × 5 mile map): https://store.steampowered.com/app/610010
- Quatre Bras (5 × 5 mile map): https://www.wargamer.fr/scourge-of-war-quatre-bras-premieres-images/
- Waterloo, Matrix Games page (sprites, couriers): https://www.matrixgames.com/game/scourge-of-war-waterloo
- Remastered sprite ratio thread: https://steamcommunity.com/app/2205330/discussions/0/4410795530135370404
- Waterloo sprite ratio thread: https://steamcommunity.com/app/369390/discussions/0/485622866436489698
- Chancellorsville DLC review ("real distances and time"): https://armchairdragoons.com/sowg-chance/

Grand Tactician and HistWar

- Developer reply, battle maps 8 × 8 miles: https://steamcommunity.com/app/654890/discussions/0/1778261844032335771/
- Regimental scale thread: https://steamcommunity.com/app/654890/discussions/0/6118730946099440093/
- Grand Tactician: Napoleonic Wars community hub and dev blogs: https://steamcommunity.com/app/3829400
- HistWar: Les Grognards official page (via excerpt; rate-limited): https://www.histwar.com/en/pages/histwar-lgdn
- Armchair General interview with Jean-Michel Mathé: https://armchairgeneral.com/histwar-les-grognards-interview.htm

Modern-era tactical

- PC Gamer, Steel Division 2 (1:1, 3 × 3 km battlefield): https://www.pcgamer.com/steel-division-2-is-a-11-scale-rts-inside-a-massive-turn-based-wargame/
- Eugen, Steel Division: Normandy 44 Omaha map: https://eugensystems.com/steel-division-normandy-44-new-divisions-and-map/
- Wargame: European Escalation (150 km²): https://www.nuuvem.com/pe-en/item/wargame-european-escalation , https://eugensystems.com/games/wargame/
- Red Dragon "Russian Roulette" 10v10 map: https://store.epicgames.com/p/wargame-red-dragon--russian-roulette-10v10
- Graviteam Mius-Front store page (140 km²): https://store.steampowered.com/app/312980
- Graviteam, "Comparing No Limit and Limited battlefields": https://steamcommunity.com/app/312980/discussions/0/3835423585498316647/
- Graviteam, "How big are tactical battles?": https://steamcommunity.com/app/312980/discussions/0/1743352529770626734/
- Graviteam Op. Star, "Scale of units vs historical": https://steamcommunity.com/app/275290/discussions/0/458604254416610757/
- Graviteam Op. Star, "Largest Map size": https://steamcommunity.com/app/275290/discussions/0/38596748408107288/
- Gates of Hell map size comments: https://steamcommunity.com/app/400750/discussions/0/4040356333291275250

RTS

- Cossacks 3 store page (32,000 units): https://store.steampowered.com/app/333420
- Cossacks 3 Big Maps patch: https://store.steampowered.com/news/app/333420/view/4042499938190998936
- CossacksWorld, changing map size (grid 320/480/640 in the scripts): http://cossacksworld.ucoz.co.uk/index/map_size/0-352
- Cossacks: Back to War store page (8,000 units): https://store.steampowered.com/app/4856
- Holdfast store page (150 players): https://store.steampowered.com/app/589290
- Supreme Commander wiki, Varga Pass and Seraphim Glaciers: https://supcom.fandom.com/wiki/Varga_Pass , https://supcom.fandom.com/wiki/Seraphim_Glaciers
- Supreme Commander FA, big-map thread: https://steamcommunity.com/app/9420/discussions/0/846959362276865795
- SpringRTS forum on elmos and map units: https://springrts.com/phpbb/viewtopic.php?p=481136

Historical comparison

- Rijksmuseum, Waterloo field of about 8 km²: https://www.rijksmuseum.nl/en/collection/object/Map-and-View-of-the-Battle-of-Waterloo--3d0eb3b002f288b30e387a2ead07a7fe
- Army strengths at Waterloo, Gettysburg, Wavre and Quatre Bras: the commonly cited figures (Wikipedia articles on each battle).

## Gaps

Not found despite searching: measured playable sizes for Empire, Shogun 2, Rome II, Three Kingdoms, Pharaoh and
Warhammer III; any Ultimate General map dimension; Scourge of War: Waterloo's base map size; Holdfast, Ultimate
Admiral and Cossacks map sizes in metres; Steel Division and Wargame per-battle headcounts. The cheapest way to
fill the Total War gap would be to read the playable-area tags of a few maps in the assembly kit.
