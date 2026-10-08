# RTS

A browser real-time strategy game about Napoleonic battles, rendered as a painterly 3D world (the
look of *Puss in Boots: The Last Wish*, seen from a top-down RTS camera). The same rendering also
serves cinematic history videos.

Status: **prototyping**. No game code yet; prototypes are single HTML files in `prototypes/`.

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
| anything | the decisions in `docs/decisions/` (they are binding until superseded) |

Prototype-specific rules live in `prototypes/AGENTS.md`. Conventions (commits, units, docs) are in
`docs/conventions.md`; terms in `docs/glossary.md`.

## Commands

- Open a prototype: `prototypes/painted-cinematic.html` in Chrome (works from `file://`).
- Headless screenshots and checks: `node tools/shot.mjs <page> <outDir> [w] [h] '<steps JSON>'`;
  river and render checks: see the headers of `tools/river-check.js` and `tools/render-check.js`.
- Docs check: `node tools/check-docs.mjs` (every doc path resolves, front matter, decision numbers).
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
   - A finding about code already on main does not block the PR; if grave, record it in the known
     issues (`docs/proposals/engine-design.md` §9) with a planned fix.
4. Check runs print their **full output and exit code**; never judge a run by grepping for "FAILED".

## Commits and PRs

- Conventional Commits: `type(scope): subject`, scope mandatory and specific (`water`, `terrain`,
  `sim`, `docs`, `tools`, …), imperative, lowercase, no trailing period. One logical change per commit.
- PR titles in the same format (PRs are squash-merged).
- **No AI attribution** (`Co-Authored-By`, "Generated with …") in commits or PRs.

## Invariants

- **Camera is always the top-down RTS view; there is no sky, ever.** Far zoom is the staff map.
- **No optical blur during gameplay.** Depth of field only in presentation modes and video export.
- **The painterly look lives in assets and materials**, not in a heavy full-screen filter.
- **Readable first**: armies are the most saturated objects on screen; never hide a formation.
- **Static light is baked once per map**; only moving things get runtime lighting.
- **The simulation is deterministic and never imports the renderer** (`docs/decisions/`).
- **Measure, don't assume**: performance claims need a measurement or are labelled estimates.
