# RTS

A browser real-time strategy game about Napoleonic battles, rendered as a painterly 3D world (the
look of *Puss in Boots: The Last Wish*, seen from a top-down RTS camera). The same rendering also
serves cinematic history videos, exported frame by frame.

Status: **prototyping the look**. No game code yet; prototypes are single HTML files.

## Repo map

- `design.md`: the art bible. Fixed constraints, palette, light, seasons, depth rules, asset contract.
  Read it before any visual change.
- `web-rts-architecture.md`: how the game will be built (sim/render split, typed arrays, commands,
  20 Hz tick, Babylon.js setup). Read it before writing game code.
- `prototype-plan.md`: what the prototypes are for, the phases, and the current workstream.
- `asset-sources.md`: where to find and how to judge 3D assets, brushes and licences.
- `staff-map/`: the far-zoom staff map (design, implementation, plan). Read its `design.md`
  before touching the map or the zoom transition.
- `research/`: deep-research reports (`cheap-painterly-postfx.md`, `stylized-water.md`).
- `prototypes/`: single-file Babylon.js 9 prototypes. `painted-cinematic.html` is the current one;
  the others are earlier steps kept for comparison. `*.data.js` are generated model data.
- `tools/`: asset converters (`obj-to-js.mjs`, `blend-to-js.py`).
- `assets/`: raw third-party packs. Git-ignored (large); see README for how to restore them.
- `design/refs/`: reference images (north star, painterly style, mood).

## Commands

- Open a prototype: open `prototypes/painted-cinematic.html` in Chrome (works from `file://`).
- Regenerate model data:
  - `node tools/obj-to-js.mjs` (Quaternius OBJ → `prototypes/nature-pack.data.js`)
  - `blender -b assets/painted-foliage/Trees.blend --python tools/blend-to-js.py -- trees`
- Headless check: render the page in Chrome headless and look at the screenshot; there are no
  automated tests for the prototypes yet.

## Workflow (every PR)

1. **Plan**: write the plan (scope, approach, acceptance criteria) before code.
2. **Implement**.
3. **Review**: run `/code-review high`.
   - If a round finds **at least one severe issue**, fix and run another round.
   - If a round finds only moderate or light issues, fix what's worth fixing and **stop**.
   - **More than 3 rounds = stop and redesign.** Repeated severe findings mean the design is wrong,
     not the code; go back to the plan.

## Commits and PRs

- Conventional Commits / Commitizen: `type(scope): subject`. Scope mandatory and specific
  (`water`, `terrain`, `foliage`, `postfx`, `design`, `tools`, …); subject imperative, lowercase,
  no trailing period; breaking → `!` or `BREAKING CHANGE:`. One logical change per commit. No emoji.
- PR titles in the same format (PRs are squash-merged, the title becomes the commit).
- No AI attribution lines (`Co-Authored-By`, "Generated with …") in commits or PRs.

## Conventions

- Prototypes stay single-file and runnable from `file://` (no build step, Babylon from the CDN,
  pinned version). Generated data goes in `*.data.js`.
- One short comment on non-obvious code: the why, not the how.
- GLSL in template strings: no apostrophes or words like `ground's` in comments inside shader
  source (Babylon's preprocessor chokes on some comment text); keep shader comments minimal.
- Measure, don't assume: performance claims need a frame-time measurement or are labelled estimates.

## Invariants (from `design.md`)

- **Camera is always the top-down RTS view; there is no sky, ever.**
- **No optical blur during gameplay.** Depth of field only in presentation modes and video export.
- **The painterly look lives in assets and materials**, not in a heavy full-screen filter.
- **Readable first**: armies are the most saturated objects on screen; never hide a formation.
- **Pack colours are never used**: materials map to roles and our palette paints them.
- **Static light is baked once per map** (light map); only moving things get runtime lighting.
- Game code (later) follows `web-rts-architecture.md`: `sim/` never imports the renderer.
