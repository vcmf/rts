# RTS

A browser real-time strategy game about Napoleonic battles, rendered as a painterly 3D world (the
look of *Puss in Boots: The Last Wish*, seen from a top-down RTS camera). The same rendering also
serves cinematic history videos.

Status: **prototyping, engine starting**. Prototypes are single HTML files in `prototypes/`; game code
is TypeScript in `src/`: the simulation (`src/sim/`, `docs/systems/sim-spine.md`, `docs/systems/formations.md`),
era rulesets as data (`src/rulesets/`), scenarios (`src/scenarios/`), and the page that draws and drives
the sim (`app/`, `src/app/`, `src/render/`, `docs/systems/sim-page.md`; `npm run dev`).

## Where things are

**Start at [`docs/INDEX.md`](docs/INDEX.md)**: one line per document, with its type and status.
The ones to read before touching a given area:

| Before you change… | Read |
|---|---|
| anything visual | `docs/art-bible.md` |
| engine, world, camera, bakes | `docs/engine-map.md`, then `docs/proposals/engine-design.md` |
| simulation, units, combat | `docs/proposals/sim-design.md`, `docs/architecture.md` |
| the far-zoom map | `docs/proposals/staff-map/design.md` |
| a built system | its doc in `docs/systems/` |
| anything | `docs/decisions/` (accepted records are binding; proposed ones are open) |

Prototype-specific rules live in `prototypes/AGENTS.md`. Raw asset packs live in the git-ignored
`assets/` folder (how to restore them: `README.md`); reference images in `design/refs/`. Conventions (commits, units, docs) are in
`docs/conventions.md`; terms in `docs/glossary.md`.

## Commands

- Game code: `npm install`, then `npm test` (lint, typecheck, Vitest; Node ≥ 22.18). Sim data:
  `node tools/build-sim-data.ts` (`--check` compares with the committed file). Look data:
  `node tools/build-look-data.ts` (same `--check`); `npm run build:data` and `npm run check:data` run both.
- Open a prototype: `prototypes/painted-cinematic.html` in Chrome (works from `file://`).
- Headless screenshots and checks: `node tools/shot.mjs <page> <outDir> [w] [h] '<steps JSON>'`;
  river and render checks: see the headers of `tools/river-check.js` and `tools/render-check.js`.
- Golden screenshots: `node tools/golden.mjs <base> <cand>` (a page, a URL or `<ref>:<page>`; `--selftest`);
  negative tests of the page checks: `node tools/check-negatives.mjs`.
- Docs check: `node tools/check-docs.mjs` (every doc path resolves, front matter, decision numbers).
- CI (`.github/workflows/ci.yml`): on every PR into and push to `main` or an `epic/**` branch, lint,
  typecheck, `check:data`, `check:docs`, Vitest, build. On PRs into `epic/**` and on all those pushes, Vitest
  with coverage, uploaded to Codecov (informational only). Coverage makes the suite about six times slower, so
  that run skips the tests marked `longIt` (they run in the check job). The cost tests skip when `CI` is set:
  run them locally. `npm run coverage` gives the same report locally (`coverage/`).
- Regenerate model data: `node tools/obj-to-js.mjs`; `tools/blend-to-js.py` with Blender (see its header).

## Workflow (every PR)

1. **Plan**: a plan in `docs/plans/active/` (scope, approach, acceptance) before code.
2. **Implement**. Update the system doc in `docs/systems/` and add a decision record for any new
   decision; move the plan to `docs/plans/done/` when merged.
3. **Review**: run `/code-review high`.
   - A round with **at least one severe issue**: fix and run another round.
   - Only moderate or light issues: fix what is worth fixing and **stop**.
   - **More than 3 rounds = stop and redesign** (the design is wrong, not the code). The round count
     restarts after a redesign.
   - A finding about code already on main does not block the PR; if grave, record it in
     `docs/known-issues.md` with a planned fix.
4. Check runs print their **full output and exit code**; never judge a run by grepping for "FAILED".

## Commits and PRs

Conventional Commits with a mandatory scope; PR titles in the same format (squash-merged). The full
rules are in `docs/conventions.md`. **No AI attribution** (`Co-Authored-By`, "Generated with …") in
commits or PRs.

## Invariants

- **Camera is always the top-down RTS view; there is no sky, ever.** Far zoom is the staff map.
- **No optical blur during gameplay.** Depth of field only in presentation modes and video export.
- **The painterly look lives in assets and materials**, not in a heavy full-screen filter.
- **Readable first**: armies are the most saturated objects on screen; never hide a formation.
- **Pack colours are never used**: materials map to roles and our palette paints them.
- **Static light is baked once per map**; only moving things get runtime lighting.
- **The simulation never imports the renderer** and changes only through commands (decision 0005,
  `docs/architecture.md`), and it is deterministic: restricted float64, replays match across
  browsers (decisions 0006, 0013).
- **Era-generic engine** (decision 0015): engine code never names an era's unit, weapon or formation;
  era content is ruleset data. Antiquity to Napoleon; no modern warfare.
- **Measure, don't assume**: performance claims need a measurement or are labelled estimates.
