---
status: active
last_reviewed: 2026-10-27
---

# Plan: the cavalry and the artillery on the look page's demo map

Asked by the owner (2026-10-27): the cuirassier regiment and the foot battery on the armies demo (`?armies=<n>`),
alongside the infantry, mainly to see whether the soldiers' shadows (decisions 0062, 0074) work on a horse and on a
gun before the smoke work starts. The figures are published (`output/figures/fr-cuirassier/`,
`output/figures/fr-foot-artillery/`, `docs/systems/figure-pipeline.md`); only the infantryman is baked to unit data
today (`tools/bake-figure.py`), with three LODs.

## Scope

In:

- **The bake** (`tools/bake-figure.py`): the cavalry (one skin: the horse, the rider, the sabre, the pistol) and the
  battery (one skin: a light gun and its four gunners) baked into `data/figures/<figure>.unitdata`, each with three
  LODs collapse-decimated from the published mesh in the bake (the infantry's LODs are the pipeline's own), at a
  triangle budget for its size on screen; its colour roles from its materials, bones and texture; its roles' clips
  (the cavalry: halt, walk, trot, gallop; the battery: halt, and the firing cycle Load, Ready, Fire as one looped
  role); clips whose span is not a whole number of 1/12 s steps resampled (the gallop's 13 frames, the battery's
  clips), the root speed kept planted. The infantry's file unchanged, byte for byte.
- **The figures' own data** in the file's header (format 3, optional fields; absent: the infantryman's): its roles
  in order (at most four: the shadow's shader holds four), each colour role's cloth part or material (the dyes,
  decision 0068: never a raw colour in a uniform), its height (the LOD switch's figure height).
- **The scenario** (`src/scenarios/armies-demo.ts`): arms, each a unit type of the ruleset, a figure, a script and
  the sides' uniforms: the infantry as today; a cavalry regiment a side (the ruleset's 4 squadrons of 32 × 2, in
  column of squadrons); a foot battery a side (the ruleset's 8 pieces, 16 m apart, unlimbered; a piece is one
  figure: the gun and four of its detachment). Switches `?cavalry=0`, `?artillery=0`: main's page one URL away.
- **The scripts** (the sim's stand-in, `src/look/world/`): the infantry's as today; a ride (the regiment walks,
  trots, gallops a little and halts, then starts again where it began), a service (each piece at rest, then its
  firing cycle, the pieces in turn). Each places its arm clear of the infantry, the blocked ground and the other
  arms, within the play area; deterministic.
- **The renderer** (`src/look/units.ts`): era-generic (decision 0015: no horse, no gun named; roles, figures, scripts
  are data). One renderer an arm; the first arm keeps the page-wide parts (the trodden ground's mask, the figures'
  shadow map behind its switches, the receivers' bindings), the others feed the trodden mask and draw their simple
  shadows at every zoom. Flags only for the arms that carry them (the infantry).
- **The shadows** (the point): the simple shadow (0062) and its per-step shape (0074) for figures whose ground
  contacts spread beyond the root (a horse's four hooves, a gun's wheels and trail, its crew round it): measured
  from the figure's own contacts, not from its root. The shape bake keeps, per texel, the height of the lowest part
  that casts it (a third channel), and the look's gradient (dark and solid at the contact, softer and lighter toward
  the tip) and the feet's boost (0074's `?ushfootk`) run on that height, so each hoof, wheel and gunner's foot is
  dark and crisp, wherever it lies; the shadow is not shortened about the root (a horse's front hooves would leave
  their shadow) and its lift toward the camera starts past the figure's own footprint (it would darken the horse's
  legs). The atlas's cell fitted to the figure (a texel coarser where a cell would grow past the infantryman's), the
  per-step bins per clip, the 2048 fallback, memory: checked and measured. The infantryman's shadow unchanged.
- Tests for the pure parts; `docs/systems/look.md`; a decision record (how non-infantry figures share the units
  pipeline, and the spread figures' shadow).

Out: the sim driving them (decision 0037's bindings come with it); limbers, teams, a gun's smoke and flash; horse
colour varieties per man; a cavalry standard; the pistol and the sabre clips on the page.

## Approach

1. Bake: a profile a figure kind (the GLBs, the LODs and their targets, the colour roles by material, bone and
   texel, the roles' clips, the height bounds); the infantry's profile is today's code path. Decimation on the rest
   mesh before the armature (as `tools/unitpipe/infantry/lod.py`), each triangle's colour role read on the full
   mesh first and carried through the decimation as a face attribute.
2. Data and dyes: the header's optional fields decoded and checked (`src/look/units-data.ts`); the figure's role to
   part map given to `dressed` (`src/look/world/dyes.ts`); new dyes, materials and uniforms
   (`src/rulesets/napoleonic-dyes.ts`, `napoleonic-uniforms.ts`), a `paint` part for the gun's carriage.
3. Scripts and layout: a `Script` the renderer asks for a phase and a man's place and role; the infantry's wraps
   `phaseAt` and `manAt` unchanged; the arms placed after the infantry's layout (which stays as hashed).
4. Renderer: `Units` takes a script and a lead; the figure's roles, height and reach from its data; a facade for the
   page's hooks (`__units`, `__armies`: every arm's figures, masks, coats).
5. Shadows: `shadowShape` with heights (B) and a texel that grows for big figures; `SH_SPREAD` in the decal's
   shaders, chosen when the figure's contacts spread (data: the posed far LOD's lowest vertices).

## Acceptance

- `?armies=20` shows each side's regiment and battery with their LODs, dyes, gaits and firing cycle; with
  `?cavalry=0&artillery=0` the page is main's: `tools/golden.mjs` matches main with the same armies.
- Stills at 20, 40 and 63 m of the cavalry (halt, trot, gallop) and the battery (its firing cycle), on the meadow
  and `?meadow=off`, and a GIF of the cavalry moving at 20 m, in `output/armies-review/25-cavalry-artillery/` (not
  in git): the shadows' verdict per figure.
- Measured: each figure's memory and bake and load time; the frame on the production build (`tools/bench-look.mjs
  "<url>?armies=20&benchr=20,40,63,125,250" --gpu metal`), the new arms on against off, three alternated rounds
  under the bench lock, the load noted.
- `npm test`, `npm run check:data`, `node tools/check-docs.mjs`, the build, `tools/golden.mjs` (main against the
  branch with the new arms off), `tools/guard.mjs "<url>?armies=20" --figures --base <main>`: printed whole with
  their exit codes.

## Open questions

- The dyes the arms take (the cuirassiers', the gunners', the carriages' paint, the horses' hide): first picks, the
  owner's to change.
