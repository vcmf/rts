---
status: research
last_reviewed: 2026-10-30
---

# How other games model formations, flanking and formation change

Research for the division scale (240-figure divisions; line, thin line, attack column, square, march column).
Date: 2026-10-30. Source quality is marked: **[data]** comes from game files or a wiki that quotes them,
**[manual]** from an official manual, **[guide]** from a community guide or forum post, and **[memory]** is
unverified recall. Many Total War pages (fandom, twcenter, org forums) blocked fetching. Where a value was
seen only in a search-engine excerpt and not read on the page itself, it is marked "(excerpt)".

## 1. Empire: Total War (ETW) and Napoleon: Total War (NTW)

**Formations and abilities**
- ETW **Fire by rank:** only the first three ranks fire, one rank reloading while the others shoot, so ranks
  beyond the third add nothing. It is slow to start and re-forms after losses. **Platoon fire** (a technology,
  replacing fire by rank for grenadiers and guards) ripples along the line, gives continuous fire and a
  continuous morale penalty, has a slower first volley, and works poorly in wide units. [guide] Steam "ETW Guide
  to Unit Types" (id 1407453103); fandom *Platoon Firing* (excerpt).
- NTW dropped fire by rank and platoon fire. The front rank fires as fast as it can, and line reload was sped up
  to compensate. Guides recommend lines of 2–3 ranks. [guide] Steam "NTW Unit and Tactics Guide" (id 3490185597).
  *[memory, uncertain: in NTW the front rank kneels and the first two ranks both fire.]*
- **Fire and advance** (NTW line and elite infantry): the ranks leapfrog while firing. It closes to charge range
  with fewer losses, but slowly. [guide] both Steam guides.
- **Square:** granted to line infantry and its variants only (no militia, skirmishers, grenadiers or cavalry in
  ETW). ETW requires at least 49 men (excerpt). It gives "a high defensive bonus against charging enemies", and
  cavalry "rear and shy" near squares, which "significantly reduc[es] their damage potential". It gives no
  protection from gunfire and bunches the men, so muskets and guns hit it harder. Forming and unforming take
  time, and thinner units take longer. NTW infantry already in melee cannot form square. In square every face
  fires and there is no flank, so flank and rear morale penalties never apply. [guide] Total War wiki *Square
  Formation* and *Light Infantry Tactics* (excerpts); Steam guide 3490185597. **No numeric bonus was found.** The
  "shying" (horses refuse to close) does most of the work, not a stat.
- **No column formation.** Column is only a deep block drawn by the player. NTW's `_kv_morale` table has a
  "column formation +5" morale entry, but one modder found that changing it had no effect. [data/guide]
  twcenter "On Morale" (excerpt).
- **Cavalry wedge / diamond:** they trade contact for penetration, and turn on the spot (diamond). Units split
  by them "tend to suffer flank/rear penalties". [guide] Steam guide 1407453103.

**Numbers**
- NTW `_kv_morale` [data, one forum post, excerpt]: charge bonus +5, column +5 (seemed inert), flanks secure +4,
  flanks exposed −1 (multiple: −2), attacked in flank −3, **attacked in rear −5**, fighting cavalry −4, under
  artillery fire −4, under small-arms fire −2. The "attacked in front" malus lasts about a second, while the flank
  and rear maluses last as long as any enemy man touches the flank or rear. Modders call the flank and rear
  penalties "very harsh".
- Charge bonus is added to melee attack during the charge. Bayonets add +3 charge, and a later technology another
  +3. Cavalry mass: light 450, medium 600, heavy 750, against infantry 80–100, so the impact comes from mass.
  Line morale is 6 in NTW and 7–8 in ETW. [guide] Steam guides 1407453103, 3490185597.
- **Later Total War games, for scale:** the melee defence multiplier when hit in the flank is 0.5 and in the rear
  0 (Rome II, Attila), or 0.6 and 0.3 (Warhammer). [guide] Steam workshop discussion 362473569 (excerpt).
  *[memory: ETW and NTW likely use the same kv_rules mechanism, value unknown.]*
- Formation change times: no figures found. *[memory: square takes about 5–15 s in NTW, depending on frontage.]*

**Praise and criticism**
- Exploit: line infantry charged in the rear by cavalry "wait a few seconds and form square for the exploit
  win". [guide] twcenter *Square Formation* (excerpt). Because the square cancels flank and rear penalties
  already in progress, forming square becomes an escape from a flank attack.
- The community sums up the counters as "cavalry > line, line/artillery > square". Historically, horse
  artillery shot the square and cavalry finished it. [guide] .org forum *Napoleonic warfare and squares*.
- Fire by rank versus platoon fire is "debatable". Players split on which wins, so the choice was not legible.
  [guide] fandom *Platoon Firing*, Steam ETW discussions.

## 2. Ultimate General: Gettysburg / Civil War (Game-Labs)
- **No player-controlled formation.** Brigades switch between line and column on their own, by distance to the
  enemy. "There's no way to force a brigade from line into column." [review] Armchair General UG:G review.
  Units "re-align, switch targets, and withdraw and form battle lines without player input" (anti-babysitting
  by design). [manual] UG Field Manual p.23.
- **Flanking is a morale weapon:** "A unit exposed and receiving fire from the flank or rear will lose its
  morale extremely quickly." Morale is reinforced by "a solid front line with protected flanks", high ground,
  cover and a general nearby. [manual] p.22. No multipliers are published.
- Criticism: "Your brigades will break and run with no warning", so the player has to poll morale by hand.
  Missing feedback, not the mechanics, was the complaint. [review] Armchair General.

## 3. Scourge of War: Waterloo (NorbSoftDev / Slitherine)
- Formations: line, march column, column by divisions, square, skirmish order, mixed order, lie down. [manual]
  SoW:W manual pp.64–65; grogheads review.
- **Transition times** (game time, a little compressed): column by divisions to line **25 s**; column to line
  **42 s**. [guide] kriegsimulation.blogspot "SoW Waterloo – Formations, Transitions" (2015).
- Battalions automatically deploy into line within range of an enemy. The AI forms square when cavalry
  threatens and returns to line afterwards. [guide] same blog; Steam discussions.
- **Flanking is a firepower asymmetry plus morale:** "a battalion's firing line could present hundreds of
  muskets on its front, but just two on its flank". A "Getting Flanked" status icon shows morale "greatly
  lowered by receiving fire from an enemy unit in a flanking position". Flanking needs a pinning force as well
  as a flanking force, because otherwise "the enemy line will simply wheel". [manual] pp.65, 81–82.
- **Square:** "very strong against cavalry". Cavalry attacking it "will take casualties and have very little
  chance of doing significant damage". The counter is to pin infantry in square with cavalry out of musket
  range, then bring up guns. [manual] pp.82, 87.
- Morale status icons (Visible to Enemy, Support Bonus, High Ground, Getting Flanked) make each modifier
  readable. [manual] pp.64–65.

## 4. Grand Tactician: The Civil War (Hexi Studios)
- Line (2 ranks): best frontal fire, "can stand charges reasonably well". Assault column: only the front ranks
  fire, and its "mass … should break the enemy line in a charge, especially if the defending enemy's cohesion
  or morale has suffered". Square: fire to all sides, cannot move, vulnerable to artillery. March column:
  automatic for long moves, vulnerable to artillery. [manual] GT manual pp.166, 185.
- "The unit commander gives orders to change the formation, so there is no delay order involved". That removes
  the command delay, not necessarily the drill time. [manual] p.166.
- Group formations: single line, double line (about 150 ft apart), successive lines, assault column, refused
  flank (less fire, safer flank), march columns. [manual] p.166.
- Morale "situation" icons: Supported (each friendly unit on a flank or in the rear adds), Flanked (enemy moving
  round an unsupported flank, so the unit may fall back on its own), Flanking fire ("lowers morale
  considerably"), Cohesion, Charged by a determined foe. Morale shocks "accumulate with time". "Enfilading fire
  from the flanks is most devastating both to morale, and when inflicted casualties are considered." [manual]
  pp.152, 185.

## 5. Lines of Battle (indie, Napoleonic; wiki quotes game data, v1.7.1) — the clearest numbers found
- **Ranged output by formation:** line ×2.0 (+100%), column ×0.6 (−40%), square ×2.5 per shot but split over
  four faces. **Body damage taken:** line −30%, column +15%, square +40%. **Morale (org) damage taken:** line
  +15%, column −40%, square −20%. So the column is the shape that holds under fire, the line fires best but
  frays, and the square is a fat target that holds. [data] linesofbattle.wiki.gg *Ranged Combat*.
- **Rear fire:** ×2.5 organization damage to infantry (×2.75 against militia), with no extra hit-point damage.
  Flank *fire* gets no bonus on land. [data] same page.
- **Melee flank:** a flank percentage ramps linearly from 0 to 1 between a "front limit" and a "full flank"
  angle, and the limits depend on the shape: column 37.9°/142.1°, line 79.2°/100.8°, cavalry 63.4°/116.6°. A 90°
  hit on a column does ×1.5 org damage. Flank charge resistance is −0.75 for column and line, and the square is
  "completely immune to flank melee bonuses". A clean rear charge takes no backlash. Flanking "is a morale
  weapon, not a damage weapon". Square: charge resistance +0.3, own charge −0.75. Column: charge resistance
  +0.2. A dragoon charge against a square does 0 damage. [data] *Melee Combat*.
- **Change time:** column forms and breaks fastest, line slowest; column to square is quick, line to square much
  slower. The time is set by the shape being left and the shape being entered. [data] *Formations*.
- The in-game tactics panel shows each posture's stat effects, which makes the counters legible.

## 6. Others, briefly
- **Fall of the Samurai:** *[memory, unverified]* line infantry get toggled drills (fire by rank, kneeling
  fire) and there is no square. Players found kneel fire weak except against a close cavalry charge (Steam
  Shogun 2 discussions, excerpt).
- **Holdfast: Nations at War:** *[memory]* players physically form the lines, and officers call volleys. A
  formation has no stat buffs, so its strength comes from the volley being concentrated. Not a model for us.

## Typical numbers (cross-game)
| Effect | Range seen | Source |
|---|---|---|
| Flank melee defence | ×0.5–0.6 | later TW kv_rules |
| Rear melee defence | ×0–0.3 | later TW kv_rules |
| Flank / rear morale hit (per tick, scale −10..+10) | −3 / −5 | NTW kv_morale |
| Rear fire, morale damage | ×2.5 | Lines of Battle |
| Flank melee hit on a column (90°) | ×1.5 morale damage | Lines of Battle |
| Column firepower | ×0.3–0.6 of a line | LoB −40% vs line's +100% |
| Square against cavalry | near-total: horses shy, or charge does 0 | NTW wiki, LoB, SoW manual |
| Square against fire | +40% losses taken | LoB |
| Column to line | 25 s (by divisions), 42 s (column of route) | SoW blog |

## Lessons for our design
1. **Make flanking a morale and cohesion weapon first, a damage weapon second.** Every game here puts the big
   flank and rear multipliers on morale (NTW −3/−5, LoB ×2.5 rear, UG and SoW and GT "extremely quickly").
   Damage edges come mostly from geometry: more muskets bear on the target, and its fire does not reply.
2. **Use an angle ramp, with limits per shape** (LoB): a column is flanked from about 38° off its axis, a line
   only from about 80°. That makes "columns are fragile in the flank" fall out of the shape, and it fits our
   sectors model.
3. **The square's anti-cavalry effect should be behavioural**, as horses refusing to close (NTW "shy", LoB 0
   damage), plus a clear price: no movement, a fat target for guns and muskets (+40%), and fire split over four
   faces. Then the counter to a square is artillery plus cavalry pinning it (SoW manual), a legible combo.
4. **Formation change must not erase flank or rear penalties already in progress**, or players get the NTW
   "form square after being rear-charged" exploit. Forming square while engaged should be blocked (as NTW does),
   or the change should count as flanked until it completes (our current rule).
5. **Make the column the shape that holds** (less morale damage under fire, better charge resistance and impact)
   and the line the shape that shoots (×2 fire, more morale damage taken). Each shape then has a boost and a nerf
   on the same two axes, the way Total War players read units.
6. **Change times of about 20–45 s**, set by both the shape left and the shape entered (column fast, line
   slow). Timing them is what makes the choice of shape a commitment.
7. **Legibility comes from status icons and stat panels**: SoW's "Getting Flanked", GT's "Flanking fire" and
   "Supported", LoB's posture panel. UG was criticised because units broke "with no warning". Show each active
   modifier on the unit.
8. **Avoid toggles whose payoff is debatable** (ETW fire by rank against platoon fire). If the British thin
   line is in, give it one clear trade, such as more muskets in front against more morale damage taken or a
   weaker charge resistance, and show it in the panel.
9. **Supported flanks as a bonus** (NTW flanks secure +4, GT "Supported", UG "protected flanks") rewards building
   a continuous line and makes the flank threat a positional game, not only micro.
10. **Automatic formation changes** (UG, GT, SoW) reduce micro but take the decision away. The owner wants change
    to matter, so keep it manual. An "auto-deploy to line at range" option could be added for the AI or
    subordinates.
