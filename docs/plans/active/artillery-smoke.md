---
status: active
last_reviewed: 2026-10-29
---

# Plan: artillery smoke on the look page (the smoke track's second step)

The musket smoke shipped on `epic/smoke` (#250, `docs/plans/active/smoke-bank.md`, decision 0083, 0080 before
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
- **The game's own constraints** (the art bible §9, decision 0083): the armies are the most saturated thing on screen;
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
  (#256's) works with the smoke; `?bench=smoke` turns both smokes on and off; `?armsmoke=0` leaves the arms'
  smoke out (the musket smoke alone, for the owner's comparison and the bench's split).
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
   cap is a factor per card (decision 0083's): five big overlapping puffs over a gun crew can add past the musket's
   case; measured on the stills, and if it bites, the gun def's `opacity` lowered rather than a new rule.
7. **The ring**: its size from the shots a piece has alive (life ÷ the loop, plus one) × pieces × `strung[0]`: about
   8 × 3 × 5 = 120 puffs a side (8 KB).

## Era data (`PuffDef`, src/sim/ruleset.ts)

One new field; the rest are the musket's, with gun values (tuned by eye on the stills from a first guess of
`strung` [5, 2.4], `radius` [0.8, 4.5], `grow` 3, `jet` [30, 0.35]: the far puffs flew into the cavalry and the muzzle
cloud swelled too slowly to read):

| Field | Musket (today) | Gun (first guess) | Note |
|---|---|---|---|
| `strung` (new) | [1, 1] | [4, 1.8] | puffs a muzzle's shot leaves along its jet, and the farthest one's reach over the jet's |
| `life` | [9, 14] s | [14, 22] s | lingers longer (cut from [20, 30] for the cost) |
| `radius` | [0.3, 1.8] m | [1.5, 4.2] m | the size of the gun and crew |
| `grow` | 1.8 s | 1.5 s | the blast swells fast, then slowly |
| `jet` | [2, 0.3] | [24, 0.35] | 8 m in its first second; the farthest puff about 15 m, 18 m with the roll |
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

Landed (2026-10-29): #252 merged into `epic/smoke`, #256 into `main` (db753ee2); `main` merged into the smoke track
by `sync/smoke-main-2` (every unit's script with its fire hold, `scriptClock` over its own cycle, `?lookat` taking
both), and this branch's commits rebased onto it.

## Acceptance

- **The owner's eye**: stills at `?armies=20&lookat=artillery,25`, `,40` and `,90` (both sides; `?firehold=1`), a
  sequence of one battery's volley from first shot to the bank's thinning, and a side-by-side compare page (smoke on
  and off, space to flip), in `output/armies-review/28-gun-smoke/` (not in git). The pieces and their crews read
  through the smoke; the bank sits before the guns.
- **Cost**: the built page, `?armies=20&firehold=1&bench=smoke&benchat=artillery&benchr=25,40,90`, alternated rounds
  (smoke on and off) aimed at the battery, each started at a 1-min load ≤ 3 under the bench lock: the guns' smoke
  ≤ ~0.3 ms GPU at its worst view (on top of the musket smoke's).
- **Main's look one switch away**: `?smoke=0` creates nothing; `?armsmoke=0` the arms' smoke alone left out.
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

## Results (2026-10-29, this machine: M1 Pro, ANGLE Metal, 1920 × 1080)

Built as the approach says, with what the stills taught:

- **Two sources, one system.** `src/look/smoke.ts`: `PuffSource` (`volleySource`, `pieceSource`), `SmokeMask` (one
  mask for both), `Smoke` (a ring, a mesh, a material each). The muskets' puffs are as before (their `strung` is
  [1, 1]; a puff's hashes are the same) and drawn without the big cards' lift; their only change is that a card's
  corners are left before any texture is read (the same pixels: past `d` 1 the card drew nothing).
- **The shots** come from each piece's script at its cycle's end (its work role, its start with its own lag:
  `Units.lagOf`), the role's clip loop and the scenario's event (`ArmSpec.smoke`: `gun`, `shot`); measured 12.5 s into
  the loop, 18.8 s a loop; the smoke leaves each muzzle as the gun recoils.
- **`?firehold=1` holds the guns too**: `Script.hold` (the infantry's fire start; a battery's last piece's start),
  `scriptClock` over each script's own cycle.
- **Cut by the ground**: big cards carried 15 m over rising ground were cut in hard lines by the depth test. Each
  puff now carries the ground's rise along its way (`pathGround`, two more floats a puff) and the vertex shader lifts
  it by it; and a card whose lower edge would pass under its ground is lifted until it clears it (first built as a pull
  toward the eye along the view ray, the same place on screen; the review found it moved a grown card up to 9 m nearer
  the eye, over what stands between, and read its light metres off: replaced by the lift, the guns' cards only).
- **The muzzle cloud**: one shot's first puff came out as one of the thin ones by chance and the gun fired with no
  smoke at its muzzle; the first puff of a string is never thin now.
- **The crews and the cavalry** in the mask (`Units.footPad`: a piece's crew round its root; the cavalry's ride
  footprint): the guns' smoke thins over them as the muskets' over a line; the cuirassiers riding through the bank
  read through it in the sequence.
- **Cost**, `?armies=20&firehold=1&bench=smoke&benchat=60,-43&benchr=25,40,90` (the first side's battery, both
  batteries firing without pause, arms smoke · noarmsmoke (named nogunsmoke then) · nosmoke paired in one page; the guns' share = smoke less
  noarmsmoke, GPU frame p50; each round started at a 1-min load ≤ 3 under the bench lock):
  - First def (life 20 to 30 s, 5 puffs a shot, radius to 5 m; two rounds): 25 m +0.52 / +0.60 ms, 40 m +0.69 /
    +0.69, 90 m +0.52 / +0.52; worst camera +1.01 (25 m, yaw −45°). Over the budget.
  - As built (life 14 to 22 s, 4 puffs, radius to 4.2 m, a card's corners left before the texture reads; two rounds):
    25 m +0.37 / +0.22 ms, 40 m +0.33 / +0.33, 90 m +0.24 / +0.25; worst camera +0.76 in one round and +0.34 in the
    other (25 m, yaw −45°: one arm's noise), else at most +0.40. About the budget (≤ ~0.3 ms) on the means; a little
    over it at the worst views. The muskets' share in these views (the camera on the battery) is about 0.
  - Not measured: the far zoom (125, 250 m), a half-resolution smoke target (the fallback if the owner's machine
    finds the fill dear).
- **Memory**: the guns' ring 192 puffs × 64 B (12 KB); the mask shared.
- **Far out, a camouflage pattern** (the owner, 2026-10-29: the battery's merged clouds from far, a broad sheet of
  even, similar holes and islands, read as camo or lichen): an old card grown by its age and by the zoom's thinning
  read the grain's blotches in metres, many to a card, and its erosion cut them all as holes; cards over each other
  each holed alike. Fixed for the big cards only, from 50 to 85 m out (up close as approved): the grain in each card's
  own frame at its own scale, gentler billows and rim, the thinning a fade more than holes. Stills before and after
  at 70 (the owner's framing), 90, 150 m and the widest (260 m), and 25 and 40 m after, in
  `output/armies-review/28-gun-smoke/far/` and the compare page. The muskets' streaks at 150 m: no such pattern
  (thin streaks along the lines), unchanged. Cost, one round (load 2.89 at the start; 25, 40, 90, 150 m on the
  battery): +0.16, +0.28, +0.29, +0.20 ms, worst camera +0.39 (90 m): as before.
- **The mask while the cavalry rides** (review round 1; #248): with the arms in the mask, the riding regiments change
  their footprints every step, so the mask is redrawn and uploaded whole about 10.6 times a second whenever the arms
  ride, where before only marching battalions did. One redraw with upload: 0.43 ms of the main thread with the arms,
  0.33 ms without (200 redraws timed in the page, the built page, Metal). One bench row with the armies running their
  script (no `?firehold`: the cavalry riding, the battalions marching and firing), `?bench=smoke&benchat=60,-43&benchr=40`,
  load 2.87 at the start: frame p50 smoke against nosmoke +0.01, +0.04, +0.08 ms at the three yaws, p95 no worse: not
  seen. Kept: the cap over the cavalry riding through the bank reads (the sequence); a sub-rectangle redraw stays
  #248's fix if a heavier battle finds it.
- **Looks**: `output/armies-review/28-gun-smoke/` (not in git): stills at 25, 40 and 90 m on the first side and 40 m
  on the second (facing the camera), on and off (a compare page: space flips), a battery's volley over a minute
  (`volley-life.gif`, `seq-sheet.png`), and the tuning rounds (`it2` to `it6`).

## Round 2: the clouds' body (2026-10-30)

The owner, on the merged guns' smoke (#266): its motion and look approved, but "still a bit flat: it must be denser,
less transparent, and more 3D". Refs: `output/smoke-refs/owner-2026-10-28/` (the Patriot's volley bank, Cossacks 2's
volley, the musket plume) and `docs/research/smoke.md`; this plan's open question 1 (a thicker bank).

**Scope**: the arms' big cards only (the muskets' smoke as approved: `uBig` 0 on its material); painted, no
volumetrics or ray marching; the formations' cap kept over every card; the far-zoom fix (`vFar`) kept. Built as
variants behind a switch for the owner's eye (0, the cards as approved; 1, the body; 2, the body and lobes); **the
owner picked 1** (2026-10-30: both liked, 1 for its cost; "for this I don't need options"): it is the guns' smoke now,
the switch, 0 and 2 removed.

**Approach** (`src/look/shaders/smoke.frag`, `smoke.vert`, `src/look/smoke.ts`; `docs/systems/look.md`, the body):

- **Denser**: a core from the card's large shape alone (the falloff and the large billows; the smaller billows and
  the grain left to the rim, which stays torn and soft), near-opaque through and its opacity holding to half its life
  (`vOpC`), then fading with the erosion; the rim thinning as before. A thin puff (one in seven, the gaps between
  clouds; a far strung puff's lower density) gets no core: a faint core read as a grey film (seen in the first stills).
- **3D**: a dome over the card's shape (its normal from the card's coordinates), its lobes the large billows embossed
  a step toward the sun; lit by the sun through a soft mid tone (decision 0084) from a warm white to a pale cool shade,
  the underside cooler and deeper, the core deeper in the shade than the rim, a faint warm rim on the sun's side. The
  thin veils lit as before (the body's light weighted by the core's shape). First built with the billows' slope from
  the screen's derivatives (and then a strong emboss): the 8-bit grain's large blotches step, and the light came out in
  terraces, a blocky camouflage; the gentle emboss of values does not.
- **Front and back**: the cards drawn back to front (`depthOrder`: the ring's live puffs' middles at the shader's clock,
  an insertion sort each frame into a second buffer, only the live ones drawn); with dense cores an unsorted blend put a
  back card's lit top over a front card.
- **Variant 2, dropped**: one lobe more on each of the first two strung puffs, the muzzle's cloud and the next (a lit
  top up and to one side, a shaded underbelly low on the other, set off by shares of the puff's radius, two more
  floats a puff): 6 cards a shot for 4 (first built with a lobe on all four, 8 cards). Fuller and rounder, but +0.75
  to 1.0 ms at 25 m (below); removed with the switch.

**Stills** (`output/armies-review/29-gun-smoke-volume/`, not in git: its compare page of the variants, side by side
or space to cycle 0 → 1 → 2; 25, 40, 90, 150 m at 66 s and 40 m at 64 s; one volley's life every 2 s,
`seq-sheet.png` and a gif a variant; the refs). Read: 1 and 2 turn the flat white patches into rounded, lit clouds with
a cool shaded side and underside; 2 is fuller and rounder, its far puffs more of a cloud; the crews and the cavalry
riding through still read (the cap); at 90 and 150 m soft shaded masses, no camouflage pattern.

**Cost**: `?armies=20&firehold=1&bench=smokebody&benchat=60,-43&benchr=25,40,90,150` (a bench arm built for the
comparison, removed with the switch; the built page, Metal, 1920 × 1080; `body0`, `body1`, `body2`, `noarmsmoke`
alternated in one page, each camera's arms run forward and back; three rounds each started at a 1-min load ≤ 3 under
the bench lock; the arms' share = body less `noarmsmoke`, GPU frame p50, ms):
  - First built uploading the sorted cards every frame: bodies 1 and 2 cost +3.2 to +6.5 ms of GPU frame at every view
    (one round), their draws' own share (`other`) only +0.1 to +0.6: the buffer's update waiting on the frame before,
    on Metal. Uploaded only when the drawn list changes now.
  - With 4 lobes (8 cards a shot; three rounds): body 1 +0.12 to +0.80, body 2 +0.40 to +1.09 (25 m, yaw −45°).
  - As built (body 2 with 2 lobes; three rounds; ranges over the rounds):

    | view (m) | body 0 (today) | body 1 | body 2 |
    |---|---|---|---|
    | 25 | +0.17 to +0.52 | +0.43 to +0.71 | +0.73 to +1.04 |
    | 40 | −0.02 to +0.40 | +0.12 to +0.51 | +0.46 to +0.58 |
    | 90 | −0.16 to +0.71 | −0.09 to +0.45 | +0.19 to +0.49 |
    | 150 | +0.03 to +0.31 | +0.12 to +1.03 (one camera, one round: noise) | +0.30 to +0.76 |

  Body 1 (as shipped) keeps about the budget (≤ ~0.5 ms) but at 25 m on the battery (+0.4 to 0.7); body 2 is about
  +0.5 from 40 m out and +0.75 to 1.0 at 25 m, over it. The fill of the denser, longer-held cores at the closest view
  is the cost; the half-resolution smoke target (the musket plan's Out) stays the fallback. Today's (body 0) measured
  here +0.0 to +0.7, the earlier round's +0.16 to +0.39: this machine's noise between days.

**Review** (one round, `/code-review high`, nothing severe; fixed): the cap over the men was weaker with dense cores
(two overlapping cards about 0.82 over the men, three 0.92): the core is dropped where the mask says men, the rim's
cap as before (before and after at 40 m with the cavalry riding through the battery's smoke:
`output/armies-review/29-gun-smoke-volume/review/`, the riders read more clearly, the clouds elsewhere unchanged).
The order by distance changed with every camera move and the drift, and any swap uploaded the buffer again (the stall
could come back while panning or orbiting): sorted along the view's axis now (a pan changes nothing), seeded with the
last frame's order with a 0.5 m dead band (no swapping back and forth, no pop where two dense cards cross; a slow
orbit's stills and gif, `review/orbit-40.gif`), and a swap alone uploaded at most every 0.25 s (`uploadDue`, tested).
Uploads counted in the page (the built page, 40 m on the battery, 10 s each): 108 at rest, 437 orbiting, 95 panning
before the rate; 51, 60 and 56 after. Bench while panning and orbiting (`?benchpan=1|orbit`, added for it):
`?armies=20&firehold=1&bench=smoke&benchpan=1|orbit&benchat=60,-43&benchr=25,40,90`, two rounds (1-min load 2.84
and 2.51 at their starts, under the bench lock), the arms' share (smoke less `noarmsmoke`, GPU frame p50) averaged
over each radius's three yaws: panning +0.19 to +0.23 ms, orbiting +0.03 to +0.68 (single cameras −0.23 to +0.70
panning, −0.60 to +1.34 orbiting: a moving camera's arms see different frames); no stall of the 3.5 ms kind.

## Open questions for the owner

1. **How long should a gun's cloud stay, and how thick the bank?** 14 to 22 s as built (cut from 20 to 30 s for the
   cost): a battery in action keeps a ragged row of clouds before its guns, not a continuous bank. A thicker,
   longer bank is truer to Mercer and costs about 0.3 ms more at the worst views (measured with the first def).
   Round 2 makes each cloud denser and rounder at the same life. **Answered** (2026-10-30): the owner liked bodies 1
   and 2 alike and picked **1** for its cost (+0.4 to 0.7 ms at 25 m, ≤ 0.5 from 40 m out, against 2's +0.7 to
   1.0), with no switch: it is the guns' smoke.
2. **Dust**: a low, warm brown puff at the ground under the muzzle as the blast kicks it up (Leonardo's smoke and
   dust), or white smoke only?
3. **The flash**: a short spark only (as the muskets'), or a warm glow lighting the young cloud for a tenth of a second?

## Risks

- **A wall, not a cloud**: a camera-facing card 9 m wide and several high stands up in front of the guns at the
  battle camera's pitch. Mitigated by the card's frame (wide and low, the musket's streak), tuned by eye.
- **Over the cavalry**: the regiments ride along the front 24 m before the guns, inside the far puffs' reach; the cap
  over formations covers them if their footprints reach the mask.
- **Fill at 25 m**: see the estimate; the half-resolution target stays the fallback (the musket plan's Out).
