---
status: done
last_reviewed: 2026-10-28
---

# Plan: musket smoke as opaque painted puffs (the smoke track's first PR)

**Superseded, 2026-10-28**: built on `look/smoke-puffs` and rejected by the owner ("too ugly": opaque, hard-edged grey
boulders lying in front of the line). Replaced by soft translucent banks, `docs/plans/active/smoke-bank.md`; decision
0080 rewritten before acceptance. Kept as the record of what was tried and measured.

The owner's brief (2026-10-27): powder smoke "painterly 2D on 3D, like painting: simple, elegant yet beautiful", after
the staff map's flat clouds (PR #49: merged circles, one paper-white fill, a hard scalloped edge, one offset shadow),
learning from *The Wild Robot* and *Puss in Boots*; "above all performance must be good". The research
(`docs/research/smoke.md`, recommendation B) and the art bible (`docs/art-bible.md` §9: shaped puffs, lit warm on the
sun side, cool in shadow, edges partly hard; effects never hide a formation) set the approach. Into `epic/smoke`
(#239); the owner merges the track after a showcase.

## Scope

In:

- **Musket smoke for the scripted infantry's volleys** on the demo map (`?armies=<n>`): a puff a few files along the
  front when a rank fires (the fire clip's shot), a bank along the line as the ranks fire by turn.
- **Approach B**: opaque cut-out puffs: one thin-instanced low-poly blob mesh, a puff an instance (seed, birth,
  place, frame), moved and grown in the vertex shader from its age (a muzzle jet, a slow rise, the wind's drift),
  shaded by the scene's painter and mood (the warm lit band, the cool shadow band), the edge broken by the paint grain,
  dissolved by eroding the shape with age (discard, no opacity fade, no blending). The puffs write depth and the
  depth of field's lens term, so they blur with the scene (decision 0040).
- **Readability**: the puffs move away from the firing line, and a **clearance rule** opens a hole wherever a puff
  would cover a formation on screen (below); the smoke is duller than the coats.
- **Zoom**: fewer, larger puffs further out (the same area of smoke); at the widest zoom a quarter of them, twice as
  wide.
- **Era-generic**: the powder's smoke (puffs a file group, life, size, jet, rise, drift, colour, flash) is ruleset
  data (`src/rulesets/`), the shot's moment in the fire clip comes from the figure's own clip events
  (`data/figures/index.json`); the engine names no weapon.
- **Switches**: `?smoke=0` (none: main's look), `?smoke=a|b|c` (the look variants below), knobs for the owner's
  comparisons (`?smoketone`, `?smokeedge`, `?smokestep`, `?smokeshade`, `?smokea2c`, `?smokeclear`), `?firehold=1` (the
  script held in its fire phase, for the bench and the stills), `?bench=smoke` (paired arms, smoke on and off).
- **Variants** for the owner: **A** the staff map's (one flat tone, a hard scallop, its offset shadow); **B** three
  tones by the painter with a brush edge; **C** B stepped at 12 fps with the offset shadow on the ground.
- Tests for the pure parts (the shots, the puffs a volley, the lifetime and erosion, the clearance rule, the
  clock's hold), a decision record, `docs/systems/look.md`.

Out: artillery smoke (the guns come on `look/cavalry-artillery`), lingering banks as blended cards (research D),
smoke in the sim's sight, the staff map's own clouds (no staff map on the look page), dust, burning buildings.

## Approach

- **Spawn (pure, `src/look/world/smoke.ts`)**: the script's fire phase is known in closed form (`phaseAt`,
  `RANK_LAG`); a rank's men go off at the fire role's start plus their rank's lag plus the shot's moment in the clip,
  then once a clip loop. Each frame the page asks for the shots between the last frame's clock and this one's
  (`shotsBetween`, wrapping the script's cycle) and writes their puffs (`volleyPuffs`: one a group of files, at the
  muzzles ahead of the front rank, each with its own seed, a birth jittered by the men's own lag) into a ring of
  instances; a jump of the clock (a load, the bench) rebuilds the ring from the last life's shots, so the smoke at a
  clock is the same however it was reached. Nothing a puff a frame on the CPU.
- **Motion and life (the vertex shader, mirrored in `puffAt` for the tests)**: a jet ahead that dies in a fraction of
  a second, a rise that slows, the wind (the flags' wind) carrying it; growth from a small radius to its full one;
  past a share of its life the erosion threshold climbs to 1 and the puff is gone. Its clock stepped at 12 fps under
  `?smokestep=12`.
- **The blob**: an icosphere (2 subdivisions, 320 triangles), squashed, its vertices pushed out by a per-puff lumpy
  noise (the scallop, drawn by the geometry so MSAA smooths it); the brush edge: the grain in the puff's own frame
  against the rim's facing ratio, discarded under a threshold that the erosion raises with age.
- **The light**: the painter's `paint()` (the three bands from the mood's sun, its hue shift, the grain, the cloud
  shade, the trees' baked shadow) on a smoke albedo duller than the coats, then the air (`airOf`) and the lens term;
  variant A one flat tone (the albedo in the sun's light), its shading only the offset shadow.
- **The offset shadow (A, C)**: the same instances drawn flattened onto the ground along the sun, eroded as the puff,
  darkening the ground by the shade as the soldiers' simple shadows (dst · src, the lens term kept, the stencil so
  overlaps darken once where the scene has one).
- **The clearance rule**: a top-down mask of the formations (each battalion's bounds, a soft margin round them),
  1 m texels over the play area, drawn on the CPU when a battalion's men are placed (at most at 12 Hz while they
  march); each puff fragment follows its view ray down to a man's mid height and reads the mask there: over a
  formation (with the grain's brush edge) it is cut. So no smoke pixel covers a man, whatever the camera, and the
  smoke stays everywhere else. Tested in `clearAt` and `maskCover`.
- **Zoom**: each puff a rank in [0, 1); a share kept by the camera's distance (1 up close to ¼ at the widest), the kept
  ones grown by 1/√share, the ones near the cut shrinking out, so the area holds and the count falls.
- **Budget**: a fixed ring (2048 puffs); a full ring overwrites the oldest (new fire always shows).

## Acceptance

- **Cost**: at `?armies=20&firehold=1` (every line battalion firing), paired arms in one page (`?bench=smoke`), at
  20, 40, 63, 125 and 250 m on Metal: smoke's GPU frame cost ≤ 1.5 ms at every radius (the P4 bar,
  `docs/research/painterly-style-in-real-time.md`), measured in 3 rounds at a 1-min load ≤ 3; memory: the ring and the
  mask (estimate written, then the bench's texture memory).
- **Readability rule**: no smoke pixel over a formation's men in the stills (20 to 125 m, both sides, the volley and
  after it); smoke darker than the brightest coat's lit band and less saturated than any coat; the guard
  (`node tools/guard.mjs "<url>?armies=20" --figures --base <epic url>`) within its bounds.
- **Main's look one switch away**: `?smoke=0` matches the epic's build on the goldens (`node tools/golden.mjs`).
- **Looks**: stills at 20, 40, 63 and 125 m of a volley and of the smoke after it, per variant, and a GIF of a volley
  at 40 m per variant, in `output/armies-review/26-smoke-puffs/`; a live preview with the variants' URLs.
- `npm test`, `npm run check:data`, `node tools/check-docs.mjs` and the build pass.

## Results (2026-10-28, this machine: M1 Pro, ANGLE Metal, 1920 × 1080)

- **Cost** (`?armies=20&firehold=1&bench=smoke&benchr=20,40,63,125,250`, the built page, three rounds each started at a
  1-min load ≤ 3, each camera's arms A B B A; GPU frame p50, the smoke arm's less the other's, averaged over the three
  yaws): 20 m +0.30 ms, 40 m +0.26, 63 m +0.52, 125 m +0.63, 250 m +0.34; the rounds agree within 0.02 ms. Under the
  1.5 ms bar at every radius. The two meshes add 0.97 M triangles (1,512 puffs × 320 × 2) whether or not puffs live.
- **Memory** (by construction): the ring 1,512 puffs × 64 B, in each of the two meshes' buffers and on the CPU (97 KB
  each); the mask 512² bytes, on the GPU and the CPU (256 KB each); the icosphere 2 KB. About 0.7 MB.
- **Readability**: in the stills no smoke covers a man at 20 to 125 m, the line facing the camera included (the rule
  trims the puffs' rear); the guard's figures (`--figures`) match the epic's build within 2 px a row. The smoke's
  lit band reaches the white coats' brightest (luma p99 229 against 232 in the 40 m stills) at a lower saturation
  (median 0.18 against the line's 0.25).
- **Main's look**: `?smoke=0` matches the epic's build on all eight goldens.
- **Stills and GIFs**: `output/armies-review/26-smoke-puffs/` (not in git).

## Risks

- **Discard edges alias** (MSAA does not smooth a discarded edge): the scallop is geometry for that reason; the brush
  bites only near the rim and while dissolving. `?smokea2c=1` tries alpha to coverage, which keeps the lens term of
  what lies behind (the scene's alpha is the depth of field's), for the owner to compare.
- **Fragment cost of piled puffs** on a tile GPU with discard (no hidden-surface removal for the draw): the count is
  capped and thinned with zoom; measured, not assumed.
- **The hole may read as a cut-out** where a side faces the camera and its smoke lies between: the margin's brush edge
  softens it; the owner judges.

## Open questions

- The default variant (the owner's pick), and whether the banks should linger longer (research D's cards).
- The flash at the muzzle: a few warm frames of the puff's first instant here; artillery's own flash later.
