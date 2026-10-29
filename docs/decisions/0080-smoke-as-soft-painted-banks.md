---
status: proposed
date: 2026-10-28
---

# 0080 Powder smoke as soft painted banks, thinned over the formations

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

- **Soft blended cards, low at the muzzles.** A puff is a card lying across the front, tilted a little up from the
  level (one thin-instanced quad: one draw for all the smoke), moved, grown and thinned in the vertex shader from its
  age: born at the muzzles as a jet along the shot, then grown wider along the front, partly into its neighbours, and
  rolled a few metres ahead at most, rising a little, drifting with the wind, gone in nine to fourteen seconds. Each
  puff is its own (size, reach, rise, density; some thin, the gaps) and a line's sections go off a little apart, so a
  volley reads as many shots partly merged, clumps and gaps hugging the line, not one even band. (A card facing the
  camera stood metres high and read, from above, metres ahead of the line: the owner's second review, 2026-10-28.) Its shape is a soft falloff broken by the paint
  grain (billows about a puff's size and smaller ones on them, in the card's own metres, churning slowly); with age it
  thins and breaks into holes. Nothing a puff a frame on the CPU.
- **Light, painted in two bands.** A warm white on the sun's side and a pale cool grey in its shade, their edge drawn
  by the billows, close in value: smoke is light all over, never dark. The trees' baked shadow, the clouds' shade and
  the air as every surface.
- **Blended after everything opaque, no depth written; the lens term kept.** The blend takes the colour by the smoke's
  opacity and keeps the destination's alpha (the depth of field's lens term), as the soldiers' simple shadows do: the
  smoke blurs as what lies behind it, at most a few metres away (the ground or the men it hangs over). Its soft bottom
  fades out at the ground it was born over, so a card meets the ground with no hard line.
- **Thinned over the men, never cut.** A top-down mask of the formations' footprints, each in its own frame (a soft
  margin round each; a world box round a line askew to the axes took in the ground before it),
  drawn on the CPU when a battalion's men are placed; each smoke pixel follows its view ray down to a man's mid height,
  reads the mask there, and where it lies over a formation its opacity is capped (0.4 of its own by default), so the
  front ranks may stand inside the smoke's edge and still read, from either side, and the smoke stays whole elsewhere.
- **The era's values, the figure's moment.** Puffs a file group, life, thinning, size, the plume, the blast, the roll,
  the bank's width, rise, drift, the sections' stagger, the puffs' variety, opacity, colour and flash are ruleset data (`PuffDef`, `src/rulesets/<era>-smoke.ts`);
  a shot's moment is the figure's own `fire` clip event (`data/figures/index.json`). The engine names no weapon
  (decision 0015).
- **Fewer, larger puffs further out**: a share of the puffs kept by the camera's distance, the kept ones grown so the
  smoke's area holds.

## Consequences

- The smoke's cost is its blended fill: every covered layer of every card is shaded and blended. The count is capped
  by the ring and thinned with zoom; the paired bench (`?bench=smoke`) measures it (the plan's Results).
- Cards cross the men's figures with a straight edge where a card's plane passes through them (no soft-particle depth
  read); translucent and capped over the men, it reads as the smoke's edge.
- Cards in one draw are not sorted: they blend in their birth order. The smoke is one colour family, so the order is
  not seen.
- The sim's smoke (sight, `docs/proposals/sim-design.md` §11) will drive the puffs instead of the script; the cap then
  reads the sim's formations.
