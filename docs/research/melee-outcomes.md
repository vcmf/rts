---
status: research
last_reviewed: 2026-10-26
---

# Ground changes hands in steps, not in a slide

Every game and rule set surveyed that resolves a fight between formed bodies moves the loser in discrete steps, or
not at all: a fixed distance, a hex, or a distance set once by the margin or a die. None lets it give way
continuously. The tabletop rules move it a base depth, a hex, 2", 6", a die roll or one full move;
the grid games a square or a hex; the one wargame designer who tried pushes and follow-ups in a free-form melee gave
them up because they "get very complex when multiple BGs are engaged". The video games that model formed units at
the unit level (Ultimate General, Scourge of War, Grand Tactician) have the loser withdraw or retreat as a whole;
those that model soldiers (Total War, Bannerlord, Cossacks) give ground only as a side effect of per-man physics, and
spend years of patches on its blobs, jitter and pass-through. Four further patterns recur: the result is graded from
one margin; a loser that cannot retreat is worse off, not stuck; a flank or rear attack changes the result's
category, not only its odds; and several units in one fight resolve as one combat.

This note is the background to the clash's second design (`docs/proposals/collision-and-orders.md`, § Contact), after
the first, a continuous give way with a bend (C1 step 4, on the claim grid's prototype), failed five reviews. It
complements `docs/research/formation-collision-and-commands.md`, which argued that formed bodies block and only
combat decides who yields; this note is about how the yielding is done.

**How to read it.** A claim with a link is sourced; [I] marks my inference. Several rulebooks are read from mirrored
text, as their PDFs did not extract; none of the studios has published its engine.

## Tabletop and board rules move the loser in fixed steps

| Rules | Loser | Winner | Retreat blocked | Flank or rear |
|---|---|---|---|---|
| General d'Armée | by the casualty difference: 1–2 retreat (formed for the first 6"), 3+ rout | takes the ground (unformed on a win by 1) | a router not ending near a formed friend disperses; one entering enemy contact disperses | −2 flanked; −4 and a discipline test when charged there |
| Black Powder 2 | break test: break, retire a full move and disordered, or hold | chooses: advance, stand, fall back, sweep on | can't retire: up to two moves to a tenable place, else breaks | −1 to hit engaged in flank or rear |
| Lasalle | decisive (twice the hits): breaks; else staggers back about a base width, disrupted | an attacker that wins must advance; a defender never does | — | flanked: half the dice |
| Napoleon's Battles | loses figures by the margin; rounds go on until a retreat or a rout | must occupy the ground (1") | surrounded: surrenders | — |
| Napoleon at War (HexWar; the hex games' rule) | retreat a hex out of enemy zones of control, or eliminated | may advance into the vacated hex | no hex to retreat to: eliminated | surrounded: no retreat |
| DBA 3 | beaten: recoil a base depth, facing kept; doubled: destroyed | some types pursue a fixed distance | can't start the recoil: destroyed | beaten with an enemy on its flank: destroyed |
| Basic Impetus | most loss loses: cohesion test, retreat a die roll without turning | some must pursue; contact again is a new melee | pushes friends back and disorders them; ground it cannot cross: routs | attacked there: disordered at once; loses: routs |
| Warhammer: The Old World | break test: give ground 2", fall back in good order, or flee | follows up into contact on a give ground | can't break contact: locked, fights again as a draw | +1 flank, +2 rear to the result |
| Kings of War 3 | nerve test: steady, wavering, routed; **the defender never moves** | the charger backs off 1" if the target holds | — | hits ×2 flank, ×3 rear |
| Sharp Practice 2 | lost by 1: thrown back 6" facing the enemy … by 4+: 18" facing away, shock to all | — | no escape: surrenders | modifier |

Sources: [General d'Armée](https://pdfcoffee.com/general-darmee-tfl-pdf-free.html),
[Black Powder 2](https://pdfcoffee.com/black-powder-20-rulebook-2019-pdf-free.html),
[Lasalle](https://sammustafa.com/lasalle) and [a summary](http://deepfriedhappymice.com/html/rd_lasalle.html),
[Napoleon's Battles](https://rulespal.com/napoleons-battles/rulebook),
[Napoleon at War](https://www.hexwar.com/wiki/games/napoleon-at-war/common/common-rules.html),
[DBA 3 changes](https://fanaticus.boards.net/thread/3408/rule-changes-v3),
[Basic Impetus](https://pdfcoffee.com/download/basic-impetus-rules-pdf-free.html),
[The Old World: give ground](https://tow.whfb.app/the-combat-phase/loser-gives-ground),
[follow up](https://tow.whfb.app/the-combat-phase/follow-up), [surrounded](https://tow.whfb.app/the-combat-phase/surrounded),
[Kings of War 3](https://pdfcoffee.com/kow-3-rulebook-web-v11-1-pdf-free.html),
[Sharp Practice 2](https://pdfcoffee.com/sharp-practice-v2pdf-pdf-free.html).

What the designers say they were after:
- **Melee is decisive and cheap in men.** Mustafa made Lasalle 2's combat "a more decisive either/or experience",
  most often a fall back "with few casualties to either side" ([Lasalle](https://sammustafa.com/lasalle)); General
  d'Armée takes no further casualties from a unit that retires, retreats or routs. Blücher has no long melees over
  several turns ([review](http://balkandave.blogspot.com/2015/02/blucher.html)). The cost of losing is the ground and
  the order lost, not men.
- **A draw continues or both step apart.** Impetus, The Old World and Black Powder's infantry fight on; Sharp
  Practice ends after three rounds with both retiring 4"; General d'Armée has the attacker retire 3".
- **Many units, one combat.** Impetus, Black Powder and General d'Armée pool a main unit's dice with its supports';
  the main unit takes the test and the supports follow its retreat. Kings of War takes one nerve test per target,
  however many charged it.

## Grid games: a whole square or nothing

Field of Glory II (Slitherine) is the closest to a rule written for a program. Its developer: "pushbacks have to be
at least one square or nothing", and the distance also stands for time lost reorganising
([Steam](https://steamcommunity.com/app/660160/discussions/0/1735465524697857116/)). A fix in September 2018 rationed
them: a loser facing square on falls back on its 1st, 3rd and 5th result of "lost badly", one facing diagonally on its
2nd and 5th (same thread). The loser is decided by the size of the result, and the casualties after it
([forum](https://forum.slitherine.com/viewtopic.php?p=755106)). When a charging shock unit wins, it follows: "push
back" instead of "fall back". Players complained that winners were drawn out of their line, and the developer
proposed letting foot follow only with a friend beside it ([forum](https://forum.slitherine.com/viewtopic.php?p=747070)).
The tabletop Field of Glory's designers had tried pushes and follow-ups in its betas and dropped them: "The problem
with push backs and follow ups is that they get very complex when multiple BGs are engaged"
([forum, 2009](https://forum.slitherine.com/viewtopic.php?p=88929)).

Commands & Colors: Napoleonics moves a loser one hex per retreat flag; a hex it cannot retreat costs it a block; a
leader or two friends beside it let it ignore a flag; the winner may take the vacated hex, and cavalry may break
through and fight again ([rules summary](https://www.commandsandcolors.net/napoleonics/articles/ccn-related/ccn-initiation-kit.html)).
The Tiller and Wargame Design Studio engine pools every attacker facing a hex into one melee, capped by the
defender's stacking; the loser retreats, one with no path is eliminated, and all who fought end disordered and tired.
Its designer chose elimination over finding a partial way out, because routers choke at the exits
([manual](https://wargameds.s3.us-east-1.amazonaws.com/web/mnp/User.pdf)).

## Real-time line warfare: withdraw as a whole

- **Ultimate General: Civil War** (Game-Labs) moves units as shapes. Its patches fixed collision boxes that made
  "melee damage … zero and cause 'sticking' with enemies", overhauled retreats "when melee was resulting in units
  passing through each other", and stopped units falling back toward enemies
  ([v0.90–v1.04 notes](https://steamcommunity.com/games/502520/announcements/detail/1434811563451162813)). Players
  still reported sticky melees ([Steam](https://steamcommunity.com/app/502520/discussions/0/133258593399538043/)).
- **Scourge of War: Waterloo**: a retreating unit goes 300 yards back and forms line; melee is rare and tiring
  ([manual](https://cdn.cloudflare.steamstatic.com/steam/apps/369390/manuals/SLIT_SoW_Waterloo_Materials_Manual_Ebook.pdf)).
- **Grand Tactician**: the attacker stands "slightly overlapping" its target while they fight, until one falls back
  or routs; its developers call the model rudimentary, and plan per-man melee for the sequel, with a bulge in the
  line under pressure. "Prolonged melees were not common"
  ([dev diary](https://www.grandtactician.com/thecivilwar/blog/index.php?id=53)).

## Per-man physics: ground given by accident

Total War has no unit-level push. Each man is a body with mass steering to his slot
([TWCenter](https://www.twcenter.net/threads/attila-battles-good-adequate-or-insufficient.687207/)); a line is pushed
back only as men are displaced, killed or rout. Creative Assembly's fixes moved toward keeping the shape: charges in
formation "stop sooner on contact" to blob less, matched combat chosen to keep pikemen in line
([Rome II patch 9](https://wiki.totalwar.com/w/Total_War_ROME_II:_Patch_9)), and matched combat cut from all melee to
40% in the recent MARS beta
([notes](https://community.creative-assembly.com/total-war/total-war/forums/118-mars-first-beta/threads/15583-mars-first-beta-patch-notes)).
Mass, bracing and charge values interact, and cavalry rebalances have swung one way and then the other [I]. The
earlier note covers the blobs and pass-through of these games in detail.

## What fits this sim [I]

1. **Rounds and a step.** Judge a melee every few seconds from one margin, the pushes the sim already weighs; a
   loser by more than an edge steps back a fixed distance as one rigid move, granted whole or not at all. No bend, no
   per-tick give way, no lags to keep.
2. **The winner follows by the same step,** so the two stay in contact, and only its foe: other units fighting do not
   move (Field of Glory II's drawn-out winners are the warning).
3. **A blocked step costs, once a round.** Anything in the way (a friend, an enemy, the ground) turns the step into
   a cost on the loser's nerve, rather than a geometry problem of who blocked it.
4. **An enemy on the flank pins.** A loser fighting a second enemy on its flank or rear cannot step back (DBA and
   Impetus pin or destroy a loser with an enemy on its flank): one rule, no geometry of sideways retreats.
5. **No extra deaths.** The step and the nerve it costs are the price of losing; the men lost stay the strike's.
