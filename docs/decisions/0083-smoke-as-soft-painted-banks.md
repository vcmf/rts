---
status: proposed
date: 2026-10-28
---

# 0083 Powder smoke as soft painted banks, thinned over the formations

Proposed with the smoke track's first PR (`docs/plans/active/smoke-bank.md`, into `epic/smoke`, #239); the owner
accepts it when the track is shown. The research: `docs/research/smoke.md`. As built: `docs/systems/look.md` ("The
musket smoke"). This record's first proposal (2026-10-27: opaque cut-out puffs, cut wherever they would cover a
formation; `docs/plans/done/smoke-puffs.md`) was built and rejected by the owner on 2026-10-28: "too ugly", opaque,
hard-edged grey boulders lying in front of the line. It is replaced here, before acceptance.

## Context

- The owner's brief: smoke "painterly 2D on 3D, like painting: simple, elegant yet beautiful"; "above all performance
  must be good" (120 fps, 8.3 ms a frame; the smoke's share about 1 to 1.5 ms at its worst views).
- The owner's references (2026-10-28): a film's volley (*The Patriot*: one continuous, soft, bright white bank at
  muzzle height that swallows the front of the line and rolls forward, dense at the muzzles, thinning and translucent
  at its edges, the men readable through it), a single shot's plume jetting forward from the muzzle, and *Cossacks 2*
  from above (a soft translucent white streak along and just in front of the firing line, the men seen through it).
- The art bible (`docs/art-bible.md` §9): effects never hide a formation the player needs to read.
- The page writes the depth of field's lens term into the scene's alpha (decision 0040): a blended surface cannot
  write its own, and must keep the one it draws over.

## Decision

- **Soft blended cards at the muskets.** A puff is a card (one thin-instanced quad: one draw for all the smoke),
  moved, grown and thinned in the vertex shader from its age: born at the muzzles as a jet along the shot, near the
  level, then a low streak hung at the muskets and a little above them, wider along the front than tall, facing the
  eye's up, into its neighbours; rolled a few metres ahead at most, drifting with the wind, gone in nine to fourteen
  seconds. Each puff is its own (size, reach, rise, density, its place along the front), the volley thickens and thins
  in clumps along the front, and a line's sections go off a little apart, so a volley reads as one ragged streak
  hugging the line, thick in places, with uneven gaps (the owner's references: *Cossacks II*). (Tried and set aside:
  a tall card facing the camera read metres ahead of a line seen from behind, round 1; a card lying flat read as a row
  of cotton balls from behind and dust at the knees from the front, round 2.)
- **Light, painted in two bands.** A warm white on the sun's side and a pale cool grey in its shade, their edge drawn
  by the billows, close in value: smoke is light all over, never dark. The trees' baked shadow, the clouds' shade and
  the air as every surface.
- **Blended after everything opaque, no depth written; the lens term kept.** The blend takes the colour by the smoke's
  opacity and keeps the destination's alpha (the depth of field's lens term), as the soldiers' simple shadows do: the
  smoke blurs as what lies behind it, at most a few metres away (the ground or the men it hangs over). Its soft bottom
  fades out at the ground it was born over, so a card meets the ground with no hard line.
- **Thinned over the men, never cut.** A top-down mask of the formations' footprints, each in its own frame (a soft
  margin round each; a world box round a line askew to the axes took in the ground before it), drawn on the CPU when a
  battalion's men are placed; each smoke pixel follows its view ray down to a man's body height (the era's `body`),
  reads the mask there, and where it lies over a formation that card's opacity takes a factor (0.6 by default). It is
  a factor per card, not a cap on the bank's total: cards over each other add up (three grown puffs at 0.95 × 0.6 make
  about 0.92 over the front rank). The men read in the stills from either side, and the smoke stays whole elsewhere;
  a true cap is an open question (the plan's).
- **The era's values, the figure's moment.** Puffs a file group, life, thinning, size, the plume, the blast, the roll,
  the bank's width, rise, drift, the sections' stagger, the puffs' variety, the muzzles' places by rank, the sections'
  and the clumps' lengths, a man's body height for the cap, opacity, colour and flash are ruleset data (`PuffDef`,
  `src/rulesets/<era>-smoke.ts`);
  a shot's moment is the figure's own `fire` clip event (`data/figures/index.json`). The engine names no weapon
  (decision 0015).
- **A gun's shot is a string of the same cards** (2026-10-29, `docs/plans/active/artillery-smoke.md`): one big white
  blast from the muzzle, the era's `strung` puffs along its jet, the nearest a fat cloud round the muzzle, the
  farthest some metres out, larger and fainter (the staff map's gun clouds), lingering about half as long again as a volley's smoke;
  a battery firing in turn lays one low bank before its guns. A second source of puffs in the same system: the same
  shader, its own ring and draw, the same mask and cap (the arms' footprints joined to it, a piece's crew round its
  root). Which arms smoke, with which era smoke and on which clip event, is the scenario's (`ArmSpec.smoke`).
- **Fewer, larger puffs further out**: a share of the puffs kept by the camera's distance, the kept ones grown so the
  smoke's area holds.

## Consequences

- The smoke's cost is its blended fill: every covered layer of every card is shaded and blended. The count is capped
  by the ring and thinned with zoom; the paired bench (`?bench=smoke`) measures it (the plan's Results).
- Cards cross the men's figures with a straight edge where a card's plane passes through them (no soft-particle depth
  read); translucent and capped over the men, it reads as the smoke's edge.
- Cards in one draw are not sorted: they blend in their slots' order (birth order as the clock runs; a rebuild writes
  battalion by battalion). The smoke is one colour family, the same up to blend order, so the order is not seen. It
  draws after the soldiers' simple shadows (alphaIndex 2000 against their 1000).
- Big cards (the guns') meet rising ground and the depth test cuts them in a hard line: such a puff is lifted by the
  ground's rise along its way, and a card whose lower edge would pass under its ground is lifted until it clears it
  (it sits a little higher on screen). The muskets' small cards are drawn as approved, without either.
- The muskets' smoke draws first, then each arm's (one draw each); within a draw the cards are unsorted, as above.
- The sim's smoke (sight, `docs/proposals/sim-design.md` §11) will drive the puffs instead of the script; the cap then
  reads the sim's formations.
