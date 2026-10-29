---
status: active
last_reviewed: 2026-10-29
---

# Plan: artillery smoke on the look page (the smoke track's second step)

The musket smoke shipped on `epic/smoke` (#250, `docs/plans/active/smoke-bank.md`, decision 0080, renumbered 0083 by
the sync #252): soft translucent cards born at the muzzles, a low ragged streak at musket height in clumps, a jet and
a spark, the opacity thinned to 0.6 over the formations; about +0.3 ms at its worst views. The owner approved its look
after three rounds. The guns now stand on the demo map (#256, `look/cavalry-artillery`: a foot battery of 8 pieces a
side, 16 m apart, 12 m before each side's lines, its pieces firing in turn), and fire without smoke. This plan gives
them theirs, in the same system. The owner's standing brief: "painterly 2D on 3D… like painting, simple, elegant yet
beautiful"; "above all performance must be good" (120 fps, 8.3 ms a frame). Into `epic/smoke` (#239).

## Problem

A gun's discharge is not a musket's made bigger. One piece fires about two to three times a minute, not a rank of
two hundred men every 15 s; each shot throws its smoke tens of metres ahead, not one or two; the cloud is the size of
the gun and its crew, not of a file; it lingers longer, hugs the ground before the gun and rolls ahead slowly; and a
battery firing in turn lays a row of such clouds that run into one bank before the guns. On today's page the pieces
recoil in silence: the Fire clip runs (the gun jumps back about 1 m), nothing leaves the muzzle.

## What cannon smoke looks like (references)

Marked as in `docs/research/smoke.md`: **[V]** checked in the source, **[O]** our reading of images or film, **[E]** an
estimate.

- **Why so much, and why white.** More than half of burnt black powder leaves as solid particles (research note §5,
  [Wikipedia, Gunpowder](https://en.wikipedia.org/wiki/Gunpowder)) **[V]**; a gun's charge is about a third of its
  ball's weight (a 6-pounder's about 2 lb, 900 g) against a musket's 10 g or so **[E]** (commonly cited; not checked
  here): ninety muskets' smoke in one breath. Reenactment and park demonstrations agree on "a lot of white smoke"
  ([The Columbian, Fort Vancouver demonstration](https://columbian.com/news/2017/sep/02/fort-re-enactors-demonstrate-historical-weapons-with-black-powder))
  and, for a 12-pounder Napoleon fired by the National Park Service, "the noise is deafening and the smoke is thick";
  "with a full service charge and projectile, the Napoleon could recoil several feet"
  ([NPS Vicksburg](https://www.nps.gov/vick/planyourvisit/firing-the-12-pdr-napoleon.htm)) **[V]**. Teaches: dense,
  white, one big mass a shot; the recoil is the figure's (our clip already throws the gun back 1 m).
- **The flash is brief and often small.** Reenactors firing blanks with modern powder report flashes as rare
  ([TWCenter, Muzzle flashes](https://www.twcenter.net/threads/muzzle-flashes.757378/), a forum, **[O]**); Kincaid at
  Waterloo, inside the smoke: "we could only distinguish each other by the flashes of the pieces" (research note §5)
  **[V]**. Teaches: a flash worth showing in a dull or smoky light, but short: a spark at the muzzle and a warm glow
  in the young cloud for a tenth of a second or so, not a fireball.
- **Battle smoke as the masters painted it.** Leonardo, *Of the way of representing a battle*: "the smoke of artillery
  mingling in the air with the dust tossed up by the movement of horses"; the higher it rises "the more it will look
  like a dark cloud", bluish at the top; "much lighter on the side whence the light comes than on the opposite side";
  "the more the combatants are in this turmoil the less will they be seen"
  ([Notebooks, §601, Gutenberg](https://www.gutenberg.org/cache/epub/5000/pg5000.txt)) **[V]**. Lejeune's *Borodino*,
  Dighton's *Waterloo*, Lady Butler's *Quatre Bras* (research note §5, §7) **[O]**: big soft white-grey masses behind
  and before the guns, the men kept as dark shapes in front of it. Teaches: two light bands (lit side, cool shade),
  the cloud a backdrop the men read against, never over them; a little dust in it, low and warm, at the ground.
- **The bank and the view from the battery** (Mercer, Royal Horse Artillery, Waterloo; research note §5 and
  [Gutenberg](https://www.gutenberg.org/cache/epub/75872/pg75872.txt)) **[V]**: "The smoke confined our vision to a very
  small compass, so that my battle was restricted to the two squares and my own battery"; squares as "dark masses,
  having guns between them, relieved from a background of grey smoke, which seemed to fill the valley"; "the cannonade
  began to slacken on both sides … and, the smoke clearing away a little, I had now, for the first time, a good view
  of the field". (His "great pillar, then spreading out a mushroom-head" is an ammunition wagon blowing up, not a
  gun's discharge.) Teaches: a battery in action lives inside its own bank; the bank clears when the firing slackens,
  so it should outlast a musket's but not stand for minutes on our short script.
- **Films** (Bondarchuk's *War and Peace*, 1966, and *Waterloo*, 1970, with real guns and thousands of extras:
  [Wikipedia, Waterloo (1970 film)](https://en.wikipedia.org/wiki/Waterloo_(1970_film))) **[O]**: each shot a
  horizontal jet of white that bursts from the muzzle and slows within a second or two some tens of metres ahead, its
  root a ball of smoke that swallows the muzzle and the front of the carriage; the jet's head billows and sags, the
  whole cloud stays low (gun-height to a few metres), grows for several seconds and drifts with the wind; a row of
  guns firing in turn leaves overlapping clouds, the oldest already thinning. How the films made their smoke is not
  documented (no source found). The jet's length (10 to 30 m for a field gun's blank) is our reading of film and
  reenactment footage, **[O]/[E]**, not a measurement.
- **Games.** Napoleon: Total War's vanilla battles were remembered as "a heavy cover of fog … when you have gunners
  and artillery constantly popping off" ([Steam comment](https://steamcommunity.com/sharedfiles/filedetails/comments/1224891876))
  **[V]** for the quote, **[O]** for the game; the realistic haze our art bible avoids. The staff map (research note
  §1) draws a gun's shot as a 0.2 s yellow flash, then **three clouds strung out forward along the gun's facing, each
  larger and fainter than the last**, living 6 s against a volley's 4.2 s, spawned 14 m ahead: our own precedent, and
  the shape this plan builds in 3D. Ultimate General: Gettysburg players asked for heavier smoke
  ([Game-Labs forum](https://forum.game-labs.net/topic/1034-cosmetic-suggestions/page/5/)) **[V]**; Cossacks: nothing
  checkable found. War of Rights darkened its lingering smoke so it would not glow (research note §2) **[V]**.
- **The game's own constraints** (the art bible §9, decision 0080): the armies are the most saturated thing on screen;
  smoke is light all over (warm white, pale cool grey), never dark; it never hides a formation.

So, in plain words: **a gun's shot is one big white blast**. A brief spark at the muzzle; a jet that shoots straight
ahead, low, for twenty metres or so and slows in a second; its root a fat cloud round the muzzle; the whole of it a
string of soft masses, the near one densest, the far ones larger and fainter, that grow for several seconds, sag
toward the ground, roll on a little and rise only slowly, lasting half a minute where a volley's lasts a quarter. A
battery firing right to left leaves a row of these that run into one low bank in front of the guns, the oldest
thinning at its far edge while the newest bursts out at the near one.

## Scope

In:

- **Gun smoke on the demo map's batteries** (`?armies=<n>`, #256's `ARMS_DEMO` artillery, its `serve` script): each
  piece's shot, at the moment of its fire clip's `shot` event, leaves a string of puffs from its muzzle.
- **The same system as the muskets'**: the painterly cards (`smoke.vert`, `smoke.frag`), the opacity cap over the
  formations (the guns' crews and the cavalry riding before them included in the mask), the lens term kept, the zoom's
  thinning, no depth written.
- **Era data**: a `PuffDef` for the battery (`src/rulesets/napoleonic-smoke.ts`, `GUN_SMOKE`), the musket's
  (`VOLLEY_SMOKE`) unchanged in look; the ruleset's smoke gains a `gun` entry. The engine names no gun: the shot's
  moment is the figure's clip event, the muzzle's place the era's (`ahead`, `height`) for this figure.
- **Switches**: `?firehold=1` holds the batteries in their firing too (every piece working); `?lookat=artillery[,r]`
  (#256's) works with the smoke; `?bench=smoke` turns both smokes on and off; `?gunsmoke=0` leaves the guns' smoke
  out (the musket smoke alone, for the owner's comparison and the bench's split).
- Tests for the pure parts; `docs/systems/look.md`; decision 0083's text extended (the same decision applied to a
  second source, if nothing new is decided; else a new record).

Out: the guns' dust (an open question below); impacts, shell bursts, burning buildings; the sim's sight through
smoke; a half-resolution smoke target; howitzers' high-angle fire; a limber and team.

## Approach

1. **One system, two sources.** `Smoke` (src/look/smoke.ts) is generalised to draw puffs from a *source*: the volley
   source as today (`shotsBetween`, `volleyPuffs`) and a gun source (new, pure, in `src/look/world/smoke.ts`). Each
   source has its own `PuffDef`, ring, thin-instanced quad and material (the def's values are uniforms): one more
   draw call. The formations' mask is drawn once and shared by both materials (one 512² texture).
2. **The shots** (`serveShotsBetween`, pure): a battery's pieces start their work in turn (`serveScript`: at rest
   `restSeconds`, then piece *k* in `serveOrder` starts `lag` s after the one before, its own lag ±0.2 s), each then
   loops its fire role (Load, Ready, Fire); its shots fall at its start + `shotAt(['Load', 'Ready', 'Fire'], …,
   'shot')` + *j* × the loop's length, until the cycle (110 s) ends. On #256's figure: Load 240 frames, Ready 48,
   Fire 166 at 24 fps, the shot at Fire's frame 15, so the first shot 12.5 s after a piece starts and one every
   18.8 s after **[E]** (read from `data/figures/index.json`; the bake's resampling to whole 1/12 s steps is read from
   the baked file, not assumed). A side's battery then fires once every 2.4 s on average, right to left, then
   rolling.
3. **The muzzle**: the piece's place in the battery's frame, `ahead` m along its facing and `height` m up: measured on
   the published figure (`output/figures/fr-foot-artillery/battery.glb`, the Barrel bone's vertices): the barrel's
   axis about 1.1 m over the ground, its mouth 2.0 m ahead of the figure's root at rest. The recoil comes after the
   shot (frames 15 to 30) and is the clip's.
4. **A shot's puffs** (`gunPuffs`, pure): `strung[0]` puffs (5 to start) from the muzzle; puff *k* carried by the
   jet a share of the way (its reach factor from 0.1 for the muzzle cloud to `strung[1]` for the farthest), larger
   and fainter the farther, each with its own seed, life, size, rise and drift as the muskets' (`puffVary`). The
   musket's `volleyPuffs` is `strung = [1, 1]`.
5. **The card**: unchanged shader, the values the def's. Young, a long jet along the shot near the level; grown, a low
   cloud wider along the battery's front than tall (`bank`), sagging (a low `rise`) and rolling ahead (`roll`),
   thinning into holes from `erode` of its life. If the gun's cloud needs it, the shader gains one uniform (the
   grown card's lean back toward the level for clouds this wide, so from the battle camera it lies on the ground as
   a cloud and does not stand as a wall); first tried with the musket's frame.
6. **Readability**: the cap's mask takes the arms' footprints too (the battery's pieces and crews, the cavalry). The
   cap is a factor per card (decision 0080's): five big overlapping puffs over a gun crew can add past the musket's
   case; measured on the stills, and if it bites, the gun def's `opacity` lowered rather than a new rule.
7. **The ring**: its size from the shots a piece has alive (life ÷ the loop, plus one) × pieces × `strung[0]`: about
   8 × 3 × 5 = 120 puffs a side (8 KB).

## Era data (`PuffDef`, src/sim/ruleset.ts)

One new field; the rest are the musket's, with gun values (a first guess, tuned by eye):

| Field | Musket (today) | Gun (first guess) | Note |
|---|---|---|---|
| `strung` (new) | [1, 1] | [5, 2.4] | puffs a muzzle's shot leaves along its jet, and the farthest one's reach over the jet's |
| `life` | [9, 14] s | [20, 30] s | lingers longer |
| `radius` | [0.3, 1.8] m | [0.8, 4.5] m | the size of the gun and crew |
| `grow` | 1.8 s | 3 s | |
| `jet` | [2, 0.3] | [30, 0.35] | 10 m in its first second; the farthest puff 25 m |
| `plume` | [3.5, 0.6] | [3, 0.5] | |
| `roll` | 0.06 m/s | 0.12 m/s | |
| `rise` | [0.06, 6] | [0.04, 8] | hugs the ground |
| `bank` | 1.7 | 1.3 | |
| `ahead`, `height` | 0.7, 1.5 m | 2.0, 1.1 m | the muzzle on the figure |
| `flash` | 0.07 s | 0.12 s | |
| `files`, `rankReach`, `rankLift`, `section`, `stagger`, `jitter` | the line's | 1, 0, 0, 1, 0, 0 | a piece is one muzzle; its own lag is the script's |

## Dependencies: #256 and #252

The guns come with #256 (`look/cavalry-artillery`, into `main`); the smoke track gets them when #256 merges into `main`
and `main` into `epic/smoke` (#252, which also renumbers decision 0080 to 0083). Until then this branch merges
`origin/look/cavalry-artillery` locally to build and see the guns, keeping its own commits apart from that merge so
it can be rebased onto `epic/smoke` once both land. Conflicts expected in `src/look/main.ts` (the smoke's `?lookat`,
`fight|line|line1`, against the arms' `?lookat=<arm>`: kept both, the arms' `lookAtSpot` taking `line` and `line1`)
and `src/look/units.ts` (`holdFire`, `footprints`, the arms' renderers).

## Acceptance

- **The owner's eye**: stills at `?armies=20&lookat=artillery,25`, `,40` and `,90` (both sides; `?firehold=1`), a
  sequence of one battery's volley from first shot to the bank's thinning, and a side-by-side compare page (smoke on
  and off, space to flip), in `output/armies-review/28-gun-smoke/` (not in git). The pieces and their crews read
  through the smoke; the bank sits before the guns.
- **Cost**: the built page, `?armies=20&firehold=1&bench=smoke&benchat=artillery&benchr=25,40,90`, alternated rounds
  (smoke on and off) aimed at the battery, each started at a 1-min load ≤ 3 under the bench lock: the guns' smoke
  ≤ ~0.3 ms GPU at its worst view (on top of the musket smoke's).
- **Main's look one switch away**: `?smoke=0` creates nothing; `?gunsmoke=0` the guns' smoke alone left out.
- `npm test`, `npm run check:data`, `node tools/check-docs.mjs` and the build pass.

## Cost estimate **[E]**

Far fewer puffs than the muskets', but each card is big. A side's battery keeps about 8 pieces × 1.6 shots alive
× 5 puffs ≈ 65 cards (130 both sides, against the muskets' up to 1,512-slot ring); a grown card is about 9 × 7 m
(`radius` 4.5 m × `bank`), so the two banks hold about 130 × 63 m² ≈ 8,000 m² of card over about 2 × 130 × 30 m of
ground: an overdraw of about 1 at the bank's edges and 3 to 4 at its core. At 25 m, the bank filling the screen,
that is 3 to 4 full-screen layers of the musket's fragment shader; the muskets' worst view, with many more but
smaller cards, measured +0.3 ms. Estimate: **+0.15 to 0.35 ms at the worst view (25 m on the battery)**, less at
40 and 90 m; the CPU's share nil between shots (8 shots in 19 s a side). The risk is the close view's fill; the
zoom's thinning does not help there (it keeps all puffs up to 60 m). Measured, not assumed, before the owner sees it.

## Open questions for the owner

1. **How long should a gun's cloud stay?** 20 to 30 s to start (twice a volley's): a battery in action then keeps a
   standing bank before its guns. Longer is truer to Mercer, but hides the ground between the lines.
2. **Dust**: a low, warm brown puff at the ground under the muzzle as the blast kicks it up (Leonardo's smoke and
   dust), or white smoke only?
3. **The flash**: a short spark only (as the muskets'), or a warm glow lighting the young cloud for a tenth of a second?

## Risks

- **A wall, not a cloud**: a camera-facing card 9 m wide and several high stands up in front of the guns at the
  battle camera's pitch. Mitigated by the card's frame (wide and low, the musket's streak), tuned by eye.
- **Over the cavalry**: the regiments ride along the front 24 m before the guns, inside the far puffs' reach; the cap
  over formations covers them if their footprints reach the mask.
- **Fill at 25 m**: see the estimate; the half-resolution target stays the fallback (the musket plan's Out).
