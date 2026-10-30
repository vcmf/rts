---
status: research
last_reviewed: 2026-10-30
---

# Formations: strengths, weaknesses, numbers (history notes for the unit model)

Background for giving each division formation clear strengths and weaknesses. It complements
`docs/research/melee-outcomes.md` (how fights resolve) and `docs/proposals/unit-model.md` § Formations and § Closing
with the enemy (the shapes and the assault test), and does not repeat them.

**Markers.** [W] checked against a web source this session (linked at the end). [R] from the named book, recalled,
not re-checked against the page: verify before quoting. [D] disputed among historians. [I] my inference for the game.
All figures are for a battalion (500–800 men) unless stated; the game's division is 6000 men, so times scale up [I].

## Shared numbers

- **Paces** (French Règlement 1791; Dundas 1788/1792) [R]: French *pas ordinaire* 76/min, *pas accéléré* 100/min,
  *pas de charge* about 120/min, step about 0.65 m: roughly 50, 65 and 78 m/min. British ordinary 75/min, quick
  108/min, 30-inch step: about 57 and 82 m/min. A line kept these on a parade ground only; in rough ground it lost
  alignment and had to halt and dress, a column did not (Nosworthy, *Battle Tactics of Napoleon and His Enemies*) [R].
- **Rate of fire**: 3–4 rounds a minute in drill, 4–5 for the best-drilled British; in battle 1–2 a minute after the
  first volley, and ordered volleys decayed into independent fire (*feu de billebaude*) (Haythornthwaite, *Weapons
  and Equipment of the Napoleonic Wars*; Muir, *Tactics and the Experience of Battle*) [R].
- **Hit rates**: Scharnhorst's test against a large cloth target gave about 60% hits at 75 paces, 40% at 150, 25% at
  225 (via Hughes, *Firepower*; Chandler) [W]. In battle, Hughes found 3–5 casualties per 100 shots as the norm, about
  5 at 100 yards or less, with a spread from under 1 to over 15 [W, second-hand]. Gohrde 1813: 66 French muskets hit
  27 men at 70 yards, 41% (via Nafziger and Nosworthy) [W]. The first volley was the most effective (Hughes) [R].
- **Bayonet contact was rare.** Most charges ended before contact, one side breaking or the attacker stalling into a
  firefight (Muir, chs. on the infantry fight; Griffith, *Forward into Battle*; du Picq) [R]. Bayonet wounds are a
  small share of surgeons' cases (Larrey, Guthrie, cited by Haythornthwaite and Muir) [R]. Real bayonet fighting came
  in villages, woods, at night and over walls (Muir) [R]. The unit model already assumes this.

## Line, 3 ranks (French, most Continental armies)

- **Fire.** Two ranks fire well; the third rank's fire was ineffective and endangered the front rank (Guibert; the
  1791 Règlement keeps it, with the front rank kneeling for *feu de trois rangs*) [R]. Napoleon ordered 2 ranks before
  Leipzig (Oct 1813), partly for this, partly to look stronger (Chandler, *Campaigns of Napoleon*) [R]. So roughly
  two-thirds of muskets bear [I: matches today's `fire.firingRanks`].
- **Movement.** Slowest to move far or across broken ground; obliques and wheels cost time (Nosworthy) [R].
- **Musketry.** The best shape to receive it: shallow, few men per metre of front [I].
- **Artillery.** A roundshot along the front hits one file (2–3 men); one that enfilades the line hits many (Hughes)
  [R]. Canister hits what is in the cone, so a line loses less than a column for the same front [I].
- **Cavalry.** Steady infantry in line could repel a frontal charge by fire (44th at Quatre Bras faced its rear rank
  about and fired) [R]; caught on a flank or rear it was ridden down (see Flanking).
- **Bayonet.** A thin line attacked by a column at close quarters was in danger only if its fire had not stopped the
  column first; the line won the shock contest by fire, then a cheer and a short charge (Griffith) [R].

## British 2-rank line

- **Why.** Made the regular formation by a 1801 order, replacing the 3-rank order of Dundas's 1788 drill book; in use
  before the Egyptian campaign [W, Oman via Castalia]. Reasons given: the third rank's fire was useless and dangerous
  to the front; the army was small and wanted frontage and fire from every man; the habit came from America [W]. Its
  origin is debated [W, D]. Dundas himself thought the two-deep line too vulnerable to cavalry [W].
- **Gains.** Every musket bears: 100% versus about 67% for 3 ranks [I]. The same battalion covers 1.5 times the
  front, so it overlaps a column's head and fires into its flanks (Oman, *Wellington's Army*) [R].
- **Risks.** Thin: less weight to resist a column that reaches it, fewer men to replace losses, a longer flank. Feared
  against cavalry [W]. Wellington offset this by the reverse slope (out of view and artillery), a strong skirmish
  screen and cavalry or squares nearby (Arnold, JMH 2004; Muir) [W/R].
- **Failures.** Albuera 1811: Colborne's brigade advanced in line and was struck in flank and rear by the 1st Vistula
  Lancers and hussars in a hailstorm; three of four battalions destroyed in about seven minutes; the 2/31st formed
  square and survived (Buffs lost about 640 of 750) [W]. Quatre Bras 1815: the 69th, ordered out of square by the
  Prince of Orange, caught and lost a colour; Waterloo: the 8th Line KGL caught in line by cuirassiers near La Haye
  Sainte (Adkin, *Waterloo Companion*; Siborne) [R].

## Attack column (column of divisions, *colonne d'attaque*)

- **Shape.** French battalion (6 companies after 1808) in column of divisions: 3 divisions of 2 companies, each 3 deep,
  so about 9 ranks deep and 2 companies wide (Règlement 1791; Nosworthy) [R]. The *colonne d'attaque* is formed on the
  centre divisions, at half or full distance, so it can deploy either way [R].
- **Fire.** The head division only: one sixth to one third of the battalion's muskets [I from the shape]. Oman reduced
  the line-vs-column contest to this ratio [W].
- **Movement.** Fastest and easiest formation to move and steer across ground, through gaps and under control of its
  officers; the reason the Revolution adopted it (Nosworthy; Griffith) [R].
- **Musketry.** Small front, so it took fewer hits than a line facing it, but a line overlapping it fired into its
  flanks too (Oman) [R].
- **Artillery.** The worst: a roundshot through a deep column kills or maims men in file, anecdotes of 20+ casualties
  from one shot (Hughes; Haythornthwaite) [R, anecdotal]. D'Erlon's corps at Waterloo, in "columns" of deployed
  battalions 20+ ranks deep, suffered both guns and the Union Brigade's charge, unable to form square (Adkin) [R].
- **Cavalry.** Hard to break from the front, and the closed column formed square fastest (see Changing formation)
  [R]. Its flanks were solid files, not the thin end of a line [I].
- **Shock and morale.** Its purpose was moral: a mass coming on fast with drums, after skirmishers and guns had
  shaken the enemy; most columns won or lost before contact (Nosworthy; Muir; Griffith) [R]. Against steady troops it
  failed: Bugeaud, a French battalion officer in Spain, describes the column advancing with shouting, the silent
  British line waiting with ordered arms, a volley at close range, three cheers and a charge, and the column breaking
  before contact [W: quoted by Oman, *Studies in the Napoleonic Wars*; exact wording not checked]. [D] The account was
  published long after and may be idealised.
- **Disputed.** Oman (1910): the French lost because they attacked lines in column, a firepower sum [W]. Revisionists
  (Griffith, Nosworthy, Muir, Arnold 2004) [W/R]: the column was a manoeuvre formation meant to deploy or to strike
  a shaken enemy; the French often used line or mixed order; Wellington's reverse slope and skirmishers denied them
  the preparation the column needed. Both agree columns attacking steady, unshaken lines usually lost [I].

## Ordre mixte

- **Shape.** Battalions in line alternating with battalions in column, a Guibert idea used by Napoleon (Tagliamento
  1797, Albuera 1811 per Oman) (Chandler; Arnold) [R/W].
- **Strengths.** The lines give fire, the columns give a flank guard against cavalry (they form square fast), a
  reserve to charge, and depth (Chandler; Nosworthy) [R].
- **Weaknesses.** Still vulnerable to artillery in its columns; slower to move as a whole than columns [I].
- **Game note [I].** At division scale this is a mix of the division's battalions; one block can model it as a
  formation between line and column in every stat.

## Square

- **Shape.** Each face a short line; British squares 4 deep (2-rank line doubled, front ranks kneeling), French
  often from column of divisions, 6 deep (Haythornthwaite; Adkin) [R].
- **Fire.** One face per direction: about a quarter of muskets, two faces at a corner [I from the shape].
- **Movement.** Could move very slowly and in disorder; normally stationary (Nosworthy) [R].
- **Cavalry.** Steady squares were rarely broken. At Waterloo about 20 Allied squares withstood Ney's cavalry
  repeatedly; none broke [R]. Breaks came when the infantry was poor, tired or demoralised, muskets would not fire
  (rain at Dresden and the Katzbach, 1813), a dying horse burst in (García Hernández 1812, KGL dragoons broke one to
  three French squares: sources disagree) or the square was still forming [W].
- **Musketry and artillery.** A dense target: the 27th (Inniskillings) at Waterloo lost about two-thirds of its men
  standing in square under artillery and skirmishers (Adkin) [R]. Cavalry forcing infantry into square for guns and
  skirmishers to shoot was the combined-arms point (Muir; Nosworthy) [R].
- **Bayonet.** A square attacked by infantry is a poor fighter: little fire to the front, cannot charge [I].
- **Flank.** No flank; every side is a front [R].

## March column (column of route)

- **Fire** none; **movement** fastest, on roads; **cavalry**: caught in it, helpless; **artillery**: very
  vulnerable enfiladed. Never meant to fight; deployment from it into line or column took the longest (Nosworthy) [R].
  Salamanca 1812: Thomières's division, strung out in march, was struck by Pakenham and destroyed (Oman) [R].

## Changing formation

- **Times (battalion)** [W, forum transcription of French 1808 drill timings; treat as estimates]: column to square
  about 30 s; column of divisions to square about 1 min; line to square about 1¼–1¾ min (a French regulation figure
  of 100 s also cited). Column to line: no figure found; a deployment took several minutes for a battalion and much
  longer for a brigade (Nosworthy) [R, D].
- **Cavalry closes fast.** At a gallop over the last stretch cavalry covered about 300–400 m a minute [I from speed],
  so a line that saw cavalry inside about 500 m was often too late [I]. Quatre Bras: the 42nd formed square with
  lancers inside; the 69th was caught forming [R].
- **Under fire.** Changing in close range of infantry or guns disordered units; the 1791 Règlement wanted deployment
  out of musket range (Nosworthy; Muir) [R]. Columns that tried to deploy under British fire at close range often
  failed and broke (Oman; Bugeaud) [R/W].
- **Game note [I].** Times ranked: column→square fastest, line→square slower, any change to or from march column
  slowest; a unit mid-change counts as neither braced nor firing.

## Flanking

- **Line.** A line can fire only to its front. Turning to face a flank means a wheel or a change of front, which takes
  minutes; meanwhile fire along it hits files end on (enfilade) and cavalry rolls it up (Muir; Nosworthy) [R].
- **2-rank line.** Same flank, but less depth to refuse a flank or form a crotchet, and a longer line to wheel [I].
  Albuera's Colborne (above) is the standard case [W].
- **Column and square.** A column's side is a solid block of files, slower to break than a line's end; a square has no
  flank [R/I]. But a column caught by fire in its side is enfiladed through its depth: the Imperial Guard at Waterloo,
  struck in flank by the 52nd's line wheeled out by Colborne (Adkin; Muir) [R].

## Sources

Books [R]: Nosworthy, *Battle Tactics of Napoleon and His Enemies* (1995); Muir, *Tactics and the Experience of Battle
in the Age of Napoleon* (1998); Griffith, *Forward into Battle* (1981) and *The Art of War of Revolutionary France*
(1998); Haythornthwaite, *Weapons and Equipment of the Napoleonic Wars* (1979); Chandler, *The Campaigns of Napoleon*
(1966); Hughes, *Firepower* (1974); Oman, *Wellington's Army 1809–1814* (1913) and *Studies in the Napoleonic Wars*
(1929); Adkin, *The Waterloo Companion* (2001); *Règlement concernant l'exercice et les manœuvres de l'infanterie*
(1791); Dundas, *Rules and Regulations for the Formations, Field-Exercise and Movements of His Majesty's Forces*
(1792).

Web [W]:
[Arnold, "A Reappraisal of Column versus Line", JMH 68:2 (2004)](https://muse.jhu.edu/article/54286);
[Arnold's article, Napoleon Series](https://www.napoleon-series.org/military-info/organization/maida/c_maida3.html);
[Oman, Studies, "Column and Line in the Peninsula"](https://stack.castalialibrary.com/p/studies-in-the-napoleonic-wars-039),
[part 6](https://castalialibrary.substack.com/p/studies-in-the-napoleonic-wars-035);
[Line (formation)](https://en.wikipedia.org/wiki/Line_(formation));
[Albuera counter-attack](https://warhistory.org/article/that-astonishing-infantry-the-albuera-counter-attack-ii?amp=1);
[Failure to form square at Albuera](https://thesharpendgaming.blogspot.com/2017/04/failure-to-form-square-destruction-of.html);
[García Hernández](https://en.wikipedia.org/wiki/Battle_of_Garc%C3%ADa_Hern%C3%A1ndez),
[Rickard's account](https://www.historyofwar.org/articles/combat_garcia_hernandez.html);
[Infantry square](https://en.wikipedia.org/wiki/Infantry_square);
[musketry effectiveness](https://palousewargamingjournal.blogspot.com/2012/12/musketry-effectiveness-on-early.html);
[modelling musketry accuracy](https://the-armchair-general.blogspot.com/2022/04/modeling-accuracy-of-napoleonic-musketry.html);
[forming squares: timings thread](https://www.warlordgames.com/community/topic/forming-squares-responses-to-cavalry-charges/).
