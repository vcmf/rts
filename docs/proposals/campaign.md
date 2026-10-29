---
status: draft
last_reviewed: 2026-10-29
---

# Proposal: the campaign, armies on roads and battles that come from it

A campaign map of roads where every side gives its orders for the day at once and all armies then march at
the same time. Where two enemies meet, a battle starts; allies near enough can be called to it by courier,
and arrive during the battle, tired and strung out. The battle is the one already being built
(`docs/proposals/sim-design.md`); this proposal is the layer around it. Decisions 0084 and 0085 (proposed)
record the choices that change the vision; the battle maps of 2–6 km a side are decision 0061 (accepted).

## Context and goals / non-goals

Total War's Napoleonic campaign is shallow: armies are small, the map is moved turn by turn, one side at a
time, and its battles are mostly frontal attacks with local flanking. There is no room for a ruse, because
nothing can be planned beyond the one battle. Real battles of the era were decided before the first shot:
- **one side ready, the other not**: at Austerlitz Napoleon chose the ground and waited; at Borodino Kutuzov did;
- **reinforcements during the battle**: Davout at Austerlitz, Desaix at Marengo, Blücher at Waterloo;
- **a guess, never a full picture**: a general knew roughly where the enemy was and how strong, never exactly.

On a single small battle map (Cossacks 2) these cannot happen: cavalry can scout every road and the army
waits for its own reserves. So the finding, the guessing and the march to the battle happen on the campaign
map, and the battle starts with what the campaign made of it.

**Goals:**
- armies move only by roads, so the map is a puzzle of roads;
- simultaneous moves, so interceptions and surprises happen during the march, not between turns;
- calls for help that travel, take time and can be cut;
- the battle's start (who is deployed, who arrives when and by which road) comes from the campaign.

**Non-goals:**
- no layer between the campaign and the battle: the campaign hands over straight to the battle;
- no supply chain: food is one number per army;
- no couriers inside a battle: orders there still apply at once (decision 0008);
- not as complex as history: every simplification is named (§ Simplifications).

## Design

### Two layers

| Layer | What moves | Time | Map |
|---|---|---|---|
| **Campaign** | armies (corps) along roads | turns of one day: orders, then the day played at once | the road network, settlements |
| **Battle** | battalions | real time | 2–6 km a side (decision 0061) |

The campaign is otherwise like Total War's (settlements, armies); its economy is out of this proposal's
scope.

### The road network

The campaign map is a graph of roads: towns and crossroads are nodes, roads are edges with a length and a
kind (high road, country road). Armies move only along roads. Bridges, defiles and towns on crossroads are
where roads can be held and cut.

### The scale: a unit is a division

The armies are small on purpose: the game is a miniature of the war, not the war at full size, with unit sizes
after Total War's. One unit on the battle map stands for a **division**; a figure is a symbol for about 25 men
(decision 0085, proposed, which would supersede decision 0018's 400-figure battalion).

| Unit | Figures | A corps has |
|---|---|---|
| Line infantry | 240 | 4–5 |
| Light infantry (skirmishers) | 160 | 1–2 |
| Light cavalry | 80 | 1–2 |
| Artillery | 4 guns and their crews | 1 |

A corps is **8–10 units, about 1,300–1,700 figures**. Three corps a side make about 25–30 units and
4,000–5,000 figures a side, inside the 32,000-soldier budget (`docs/plans/active/armies-32k.md`). A line unit of
240 in three ranks is about 50 m wide, so a corps holds about 500 m of front.

- **Light infantry** is two thirds of a line unit: the British Light Division, the nearest real one, had about
  3,000–4,000 men against 5,000–7,000 for a line division. Fewer men, but faster, in open order (harder to hit
  at range, a front as wide as a line unit's), and fragile against cavalry and in melee. A skirmisher unit a
  corps is a simplification: French corps spread their light infantry through every division, each battalion
  with its voltigeurs, but a screen in every unit is too complex as game logic (the owner's choice).
- **Cavalry** is about a tenth of a corps' figures, as in real corps.
- **4 guns** match the scale: a real corps of about 25,000 men had about 50 guns, about 2 for every 1,000
  men, and 4 guns for 1,700 figures keeps that ratio. Guns must hit hard; Napoleon's artillery decided battles.
- **Heavy cavalry is not in a line corps.** As in history, cuirassiers and carabiniers are in the **reserve
  cavalry corps** (Murat's), which only the main army has. So heavy cavalry is seen in big battles, where the
  main army and its reserve fight, and bringing it to the right battle is a campaign decision.

The composition is ruleset data (decision 0015), so an era, a nation or a year can change it:
- **a reserve cavalry corps**: heavy and light cavalry and horse artillery, no infantry;
- **a corps short of cavalry** (the French of 1813, after Russia): a weak cavalry unit or none, and so a short
  scouting radius (§ Knowledge);
- the engine names a "formation unit"; "division" is the Napoleonic ruleset's word.

### Armies are corps

- An army is a **corps** of 8–10 units (§ The scale), with a maximum size.
- **Speed falls with size**: a small corps marches at the full road speed, a big one slower.
- **One column a road**: a corps cannot pass another on the same road, it follows its tail. Two corps on one
  road are slow, so an army spreads over parallel roads ("march divided, fight united").
- **A column has a length**: a corps on the march fills kilometres of road. Its head and its tail reach a
  place hours apart.
- **March modes**: normal (about 20–25 km a day, no cost) and forced (about 35 km a day). A forced march
  costs **stragglers** (a share of each battalion missing, who rejoin over a day or two) and **fatigue**
  (lower morale, or faster tiring, until rested). Davout reached Austerlitz with much of his corps strung out
  behind him.

### Food

- Each corps has **days of food**.
- Friendly towns and depots refill it; so does foraging a district not yet stripped.
- A corps that stays strips its district, a big one faster.
- At zero, the corps loses men every day and its morale falls.

Staying together in one big army is then costly, and splitting over roads is not a rule but the way to eat.

### Knowledge

- Enemy armies show only inside a corps' **scouting radius**, which grows with its light cavalry.
- What a corps sees is an **estimate**: a strength range, and an age that grows once out of sight.
- There are no separate scouting units: a corps scouts with its own cavalry, so cavalry cannot be detached to
  read every road.

### A turn is a timeline

Every side gives its orders: a road route, a march mode and standing orders for each corps. The day is then
played from dawn to dusk as a **timeline of events**, handled one by one in time order:
- **contact**: two enemy corps come within the contact radius, and a battle starts;
- **a courier arrives**: an ally receives a call for help and acts on its standing orders;
- **a courier is caught**: it enters an enemy's zone, and its message is lost;
- **an arrival**: a corps reaches a battle.

Events at the same moment are ordered by a fixed key (time, then the id), so a turn plays the same on every
machine, like the battle (decisions 0006, 0013).

### Contact and battle

- **Contact radius** (a parameter, about 1–2 km): two enemy corps inside it must give battle.
- **Engaged corps are held for the rest of the day**: they do not move on and cannot help anyone else.
- **Who is ready** comes from the moment of contact: a corps that was standing starts deployed; one on the
  march starts in column on its road, its tail still kilometres back.

### The battle zone

Each battle has a **battle zone**, a circle of a few km around it, which the battle map covers.
- A contact **inside** a battle zone joins that battle: both corps enter from the map's edge on their road, at
  their times.
- A contact **outside** every zone is a new, separate battle.

So two helpers who meet on the road close to the fight join it (Plancenoit was part of Waterloo); two who
meet far from it pin each other and neither helps (Wavre, 15 km away, held Grouchy).

### Calling for help

1. An engaged corps sends a courier to each ally within the **help radius** by road (a parameter, about
   25 km).
2. The courier takes the **fastest route**. It is a fast moving point on the timeline: if it enters an enemy
   corps' contact zone on its way, it is **caught**. It does not look for another road.
3. A caught message is **read by the enemy**: who called for help, and how hard pressed they are.
4. An engaged ally cannot come. A free one acts on its standing orders (below).
5. **Arrival = courier time + getting under way + forced march.** As starting values: a courier at about
   12 km/h, about 1 hour to get under way, a forced march at about 4 km/h. An ally 25 km away hears after about
   2 hours, and its head arrives about 9 hours after the battle began: the afternoon of a battle begun in the
   morning, as at Waterloo and Marengo. The rest of the corps follows by its column's length.
6. **A rescuer can be stopped**: if its road crosses an enemy's zone, it fights there instead.
7. A free corps in reach of two battles goes to the one whose courier reaches it first, unless its standing
   orders name one.

### Standing orders

The day plays without the player, so each corps carries standing orders, like an RTS's patrol and
attack-move. A short fixed list:
- **on a call for help**: always come / come if within X km / never;
- **march to the sound of the guns**: march to a battle it hears (cannon carry 20 km and more) without a
  courier: Grouchy's choice at Waterloo;
- **if an enemy comes within X km**: hold / fall back / come on.

### Urgent orders on contact

When a contact happens, the turn pauses for every side. Only the **engaged corps** act, and only by sending
couriers, which travel and can be caught. Every other corps keeps its orders until a courier reaches it.
(The other way, no pause and only standing orders, is in § Alternatives.)

### The end of a turn

1. The day is played through. A battle does not need its outcome to be known: its corps are held, and it only
   gathers its list of arrivals.
2. The battles are then fought, in any order: they are independent, since no corps leaves one during the day.
   Jena and Auerstedt are two battles on one day.
3. Their outcomes apply at the end of the turn: losses, who holds the field, who retreats.
4. A loser retreats next turn by road. If the enemy holds that road, it is cut off (Mack at Ulm).

### What the campaign hands to the battle

The contract between the two layers, the same one a historical scenario fills by hand:
- the map: the region around the battle zone, with its roads;
- each corps on each side, with its strength, stragglers, fatigue, food and morale;
- for each, deployed or in column, and where on which road;
- the arrivals: which corps, by which road, at what time, in what state;
- the time of day the battle starts.

Battles can be built and played from historical scenarios before the campaign exists; the campaign later only
has to write the same contract.

### Simplifications

- A courier never takes another road, and a courier in an enemy zone is always caught.
- Standing orders are a short fixed list, not a script.
- Food is one number per corps.
- Fatigue is one number per corps (or per battalion, § Open questions).
- A battle holds its corps for the whole day, even if it is won early.

### Starting values (estimates, to tune)

| Parameter | Start |
|---|---|
| Contact radius | 1–2 km |
| Help radius | about 25 km by road |
| Normal march | 20–25 km a day |
| Forced march | about 35 km a day, about 4 km/h |
| Courier | about 12 km/h |
| Getting under way | about 1 hour |
| Stragglers of a forced march | 10–20 % of each battalion, back in 1–2 days |
| Battle zone | 2.5 km from the battle's centre, inside its map (at most 6 km a side) |

## The models in code

The numbers and rules above are code in `src/campaign/` (exact maths, as the sim's: decision 0006), each tested in
`test/campaign-rules.test.ts` against this proposal's own cases; the Napoleonic values of § Starting values are
`src/rulesets/napoleonic-campaign.ts`. What is built is described in `docs/systems/campaign.md`.

| Rule | Code |
|---|---|
| March speed by mode and size, the column's length, head and tail arrivals | `src/campaign/march.ts` |
| Moving corps and couriers as tracks (timed waypoints, linear between) | `src/campaign/track.ts` |
| Contact: the first moment two tracks come within the contact radius, exactly; a contact joins the battle whose zone it lies in, else starts one | `src/campaign/contact.ts` |
| A courier caught where its road enters an enemy's zone; the help it brings | `src/campaign/courier.ts` |
| The road network (a road's length its line's) and the fastest route, the same on every machine | `src/campaign/roads.ts` |
| The day as a timeline, ordered by time, then id | `src/campaign/timeline.ts` |

Contact is exact rather than tested at ticks: a 10-minute tick finds two corps closing at 6 km/h up to 10 minutes
and a kilometre late, and a courier riding at 12 km/h through the edge of a zone (2 km of it inside) not at all.
Between two waypoints both move in straight lines, so the moment of contact is the first root of a quadratic. A
courier is caught when it is inside an enemy's zone and closing on that enemy: one sent from a battle rides out of
the zone of the enemy its corps fights, unless its road leads toward that enemy.

The battle zone is a radius that fits in the battle map (2.5 km: decision 0061's largest map is 6 km a side). Every
road is taken at one speed for now: road kinds come with the theatre's data and the march (K3, K4).

## Alternatives considered

- **Moves turn by turn, one side at a time (Total War):** nothing happens during the march; no interception,
  no surprise. Rejected.
- **A layer between the campaign and the battle**, where corps are placed on a fogged map before the fight:
  it adds a step without adding the march. Rejected: the campaign's timeline does its work.
- **A fixed help radius of about 10 km:** too short; the courier is fast and only the march is slow. Real
  rescues came from 15–18 km (Bülow from Wavre, Desaix at Marengo). The radius comes from the march times.
- **Helpers who meet on the road always join the first battle, or always fight their own:** both wrong half
  the time. The battle zone decides.
- **No pause on contact, standing orders only:** simplest, and easy in multiplayer, but the player watches more
  than decides. Kept as the fallback if pauses are too many.

## Drawbacks

- A battle cannot end early and free its corps to march the same day.
- Many contacts in one day mean many pauses; contacts in the same hour could be grouped.
- 2–6 km battle maps are larger than the 1–1.5 km the engine was budgeted for (decision 0011): its bakes,
  memory and frame rate must be measured again.
- The AI has to play the campaign: routes, standing orders, when to call and whether to come
  (`docs/proposals/ai.md`).
- A caught courier is easy to miss: the player must see where the message stopped and why.

## Open questions

1. **Urgent orders**: a pause on contact (proposed) or standing orders only?
2. **Battle zone**: a fixed radius, or one that grows with the size of the corps involved?
3. **Fatigue**: a new value per battalion, or forced marches only lower morale (which battalions have, with
   toughness and experience)?
4. **Refusing battle**: can a corps inside the contact radius slip away in the night after a day of battle, as
   Wellington did after Quatre Bras?
5. **A small corps as a roadblock**: if the contact radius does not depend on size, a tiny corps on a crossroads
   catches every courier. A radius by size, or a minimum size?
6. **Late contacts**: a battle begun at 18:00 is short; arrivals due after dark come the next morning, and the
   battle carries on into the next turn? Battles of two and three days (Wagram, Leipzig) need the same rule.
7. **Sending help with the day's orders**: besides standing orders, can the player send a corps toward a battle
   they expect?
8. **Time scale**: a battle covers a day of campaign time (arrivals hours apart) but takes 30–45 minutes of real
   time (decision 0009). How campaign hours map to battle minutes, and whether long waits for arrivals are
   played fast.
9. **Fog on the campaign map**: how wide the estimates are, and how fast they age.
10. ~~**Skirmishers**: a unit of their own, or a screen in every unit?~~ A light infantry unit (1–2 a corps), the
    owner's choice: a screen in every unit is too complex (§ The scale).
11. **Drill at a division's scale**: a division forms square as one block, where a real one formed a square per
    battalion. Does it still read as drill?
12. **About 30 units a side**: too many to steer one by one? Orders to a whole corps (spread by a simple rule,
    the player takes back single units where it matters) and AI corps commanders for the corps not watched.
13. **Retuning**: the fire, morale and casualty values of S1c were tuned for 400-figure battalions; with 240
    they are tuned again.


