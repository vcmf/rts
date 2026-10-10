---
status: active
last_reviewed: 2026-10-10
---

# Plan: L0, the look spine

Phase L0 of Track E (`docs/plans/active/track-e-look.md`): a renderer the later phases can build on,
test and measure, in the game's toolchain, with no change to the look except the fixes named below.

## Problem

The painted world lives in one 900-line HTML file (`prototypes/painted-cinematic.html`) with Babylon
from a CDN, shader source built by string interpolation, sizes typed as loose constants, and heights
evaluated from a formula at every caller. Nothing guards its pixels: a refactor can change the look
without anyone noticing.

## Scope

Three PRs, in this order (the Track E plan lists them as L0a, L0b, L0c; the order changes, see
Approach):

1. **L0b, golden screenshots.** A tool that renders a page at fixed cameras with time frozen, compares
   it with a baseline per region, and fails on a difference; negative tests for it and for the
   existing render checks (`tools/render-check.js`, `tools/river-check.js`).
2. **L0c, the port.** The prototype as TypeScript modules under `src/look/`, drawn by the look page (app/look.html),
   Babylon from npm at 9.29.0 with deep imports, shaders in their own files imported as strings. **No
   change to the look:** the goldens match the prototype's.
3. **L0a, SPEC and the heightfield as the truth,** in the ported code:
   - a `SPEC` with derived sizes and load-time invariants (coverage, footprint, pitch cap, yaw range,
     grid alignment, bake sizes against min-spec; `docs/proposals/engine-design.md` §4–§6);
   - one heightfield (and the river samples) built in Node and shipped as data; the meshes, placement
     and checks read it (decision 0012);
   - the camera locked to yaw ±45° around its default (decision 0010);
   - the bake rules: fitted frustums, no canvas filters (the reflection bake still blurs a canvas,
     `docs/known-issues.md`);
   - the far ring's −0.9 m offset and the AO bake's edge clamp removed.

**Out of scope:** any new look (that is L2 on), the sim's own map and heightfield (logic track), the
chunked 1.8 km world (engine-design §10 item 8), our own camera controller (prototype exit).

## Approach

- **Guard first, then port, then change.** The goldens come first, so the port is checked against the
  prototype pixel for pixel, and L0a's changes show as diffs only where they are meant to.
  Building the heightfield offline in the single-file prototype and then porting it would do that
  work twice.
- **Baselines are rendered, not committed.** Both sides render on the same machine in the same run
  (the base page, or the base git ref checked out to a scratch worktree), so no PNGs go into git and
  the diff never mixes machines. Before/after images go in each PR's description.
- **Frozen time:** the page reads `?frozen` and stops its clock (clouds, water flow); everything else
  is already seeded.
- **The prototype stays** as the reference until L9; it gains only the `?frozen` switch.

## Acceptance

- **L0b:** a deliberate one-line shader change fails the golden diff, and the unchanged page passes
  against itself (the tool's `--selftest`). Sabotaged scenes make `tools/render-check.js` and
  `tools/river-check.js` fail (a negative-test script), and the real scene passes them.
- **L0c:** goldens of the look page (app/look.html) match the prototype's within tolerance at every camera;
  `npm run build` and `npm test` pass; the render check and river check pass on the look page.
- **L0a:** each invariant throws on a bad spec (a negative test per invariant); every diff in the
  goldens is explained in the PR (far ring seam, AO edge, placement heights); the 3D ground and
  `heightAt` agree at sampled points to float precision; the camera cannot leave yaw ±45°.

## Review rounds

- **L0b round 1:** one severe finding: the negative tests matched expected names anywhere in the output,
  which the check's own success report contains, so a sabotage that never applied counted as caught.
  Now the sabotage must report that it applied and the case is judged on the check's own failure line,
  captured whole. Also fixed: the base-ref worktree lives outside the repo and is removed after the run;
  each camera waits for every material to compile; a page that ignores `?frozen` fails clearly; cameras
  sit inside ±40° yaw and are checked against the page's limits; full output and exit code on a bad
  case; the selftest copy is git-ignored; the page contract names `scene`.
- **L0b round 2:** nothing severe. Fixed: one base worktree per commit, reused after an interrupt and
  removed after a run; the readiness wait covers render targets and times out with the camera's name;
  uncaught page exceptions fail a negative case; the focus is checked against the play area; a failed
  clean-up cannot hide the run's error; default pages resolve from the repo root. Not done: running
  base and candidate in parallel, and printing full error lines from `tools/shot.mjs` (the negative
  tests capture them in the page instead).
