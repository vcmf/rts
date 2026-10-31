---
status: accepted
date: 2026-10-31
---

# 0097 Balanced is the default grass detail

Accepted by the owner on 2026-10-31 (issue #257), after trying Balanced on the look page ("not bad"). It supersedes
decision 0095's default ("Full by default"); 0095's two levels, what Balanced draws and its cost stand. As built:
`docs/systems/look.md` (the meadow and the crops, Grass detail) and `docs/plans/active/grass-detail.md`.

## Context

Decision 0095 gave the player a Grass detail setting:
- **Full**: decision 0085's meadow, and the default.
- **Balanced**: up close, half the near ring's grass clumps culled and a fifth more shrunk.

Balanced spares 0.6–0.7 ms of GPU at Kobelnitz's close camera and is even with Full from 110 m out (0095's measured
cost).

## Decision

We will make **Balanced the default**, map windows included:
- a missing `?grassdetail` means Balanced;
- `?grassdetail=full` gives Full;
- without the meadow (WebGL1, `?meadow=off`) the page reads Full, as there is nothing to thin.

The address names the level only when it differs from the one a page takes without it. The panel starts on Balanced.

## Consequences

- **The default page.** It draws Balanced's thinner carpet past about 10 m up close. From 110 m out, the default zoom
  included, it draws Full's program.
- **Benches.** The bench measures the page's level, Balanced by default, and records it (`grassDetail`, bench version
  10). Each camera is timed once the grass detail has settled. `?grassdetail=full` compares with runs before it.
- **Goldens.** `tools/golden.mjs` renders both pages with `?grassdetail=full` unless the URL sets it. The goldens
  keep covering Full's program and compare exactly with older builds.
- **Compile cost.** Balanced's program is compiled once the camera comes within 140 m (`THIN_WARM_RADIUS`), not at
  load. A page never zoomed in never compiles it.
  - **Estimate, not measured:** one more compile of the near ring's program, tens of ms on the dev Mac. It happens in
    the background where the browser compiles in parallel.

## Alternatives considered

- **Keep Full the default** (decision 0095 as accepted): the owner preferred the cheaper carpet once he had seen it.
