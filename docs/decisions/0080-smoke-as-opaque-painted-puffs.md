---
status: proposed
date: 2026-10-27
---

# 0080 Powder smoke as opaque painted puffs, cut off the formations

Proposed with the smoke track's first PR (`docs/plans/active/smoke-puffs.md`, into `epic/smoke`, #239); the owner
accepts it, and picks the variant, when the track is shown. The research: `docs/research/smoke.md` (its
recommendation B). As built: `docs/systems/look.md` ("The musket smoke").

## Context

- The owner's brief: smoke "painterly 2D on 3D, like painting: simple, elegant yet beautiful", after the staff map's
  flat clouds (PR #49) and the films (*The Wild Robot*, *Puss in Boots*); "above all performance must be good".
- The art bible (`docs/art-bible.md` §9): shaped puffs, lit warm on the sun side and cool in shadow, edges partly hard;
  effects never hide a formation the player needs to read.
- The page writes the depth of field's lens term into the scene's alpha (decision 0040, `docs/systems/look.md`): a
  blended effect cannot write it, so it would not blur with the scene, and must keep the alpha it draws over. Blended
  smoke's cost is its overdraw, unbounded where puffs pile up; the frame is already over 8.3 ms at 20 battalions a side.

## Decision

- **Opaque cut-outs, no blending.** A puff is an instance of one low-poly blob (an icosphere pushed out to the union of
  four spheres, the staff map's four merged circles in 3D), moved, grown and eroded in the vertex and fragment
  shaders from its age; its edge is cut by the paint grain in its own frame, and it dissolves by eroding its shape
  from the rim inward, never by opacity. It writes depth and the lens term like any surface, so it blurs with the
  scene. One draw for all puffs (two with the offset shadow); nothing a puff a frame on the CPU.
- **Light from the mood, two or three flat tones** (warm lit, mid, cool shadow, close in value: smoke is light all
  over), or the staff map's one flat tone; the trees' baked shadow, the clouds' shade, the air and the grade as every
  surface. Duller than the coats: its lit band stays under the brightest coat's.
- **Never over a formation (the clearance rule).** A top-down mask of the formations' ground boxes (a soft margin round
  each), drawn on the CPU when a battalion's men are placed; each smoke pixel follows its view ray down to a man's mid
  height and reads the mask there, and what it would cover erodes the puff as age does. So no smoke covers a man,
  from any camera, and the smoke stays everywhere else. The puffs are blown ahead of the line by the shot's blast, so
  the rule mostly trims their rear.
- **The era's values, the figure's moment.** The smoke's values (puffs a file group, life, size, blast, rise, drift,
  colour, flash) are ruleset data (`PuffDef`, `src/rulesets/<era>-smoke.ts`); a shot's moment is the figure's own
  `fire` clip event (`data/figures/index.json`). The engine names no weapon (decision 0015).
- **Fewer, larger puffs further out**: a share of the puffs kept by the camera's distance, the kept ones grown so the
  smoke's area holds.

## Consequences

- Smoke can be measured and capped like any opaque mesh: its cost is the puffs' fragments where they are the front
  surface (with `discard`, a tile GPU shades every covered layer of the draw: the count is capped and thinned with
  zoom). The paired bench (`?bench=smoke`) measures it.
- A cut edge aliases where MSAA does not reach it (the grain's brush, the erosion); the scallop itself is geometry,
  smoothed by the samples. `?smokea2c=1` tries alpha to coverage, at the price of the lens term (it keeps the one of
  what lies behind).
- Lingering banks as soft blended cards (the research's D) stay possible on top, if the owner wants them.
- The sim's smoke (sight, `docs/proposals/sim-design.md` §11) will drive the puffs instead of the script; the clearance
  rule then reads the sim's formations.
