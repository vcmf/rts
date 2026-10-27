---
status: accepted
date: 2026-10-27
---

# 0073 Modern works are mended out of real relief by rebuilding the ground from what lies around them

## Context

Real relief is today's ground (ČÚZK's DMR 4G, decision 0063): it holds the D1 motorway's embankments and
interchanges, railway embankments and cuttings, quarries, a tank farm's bunds. None of them stood in 1805. The edits
the language had (raise, lower, level, cut) move ground by a set amount or to a set height; an embankment that runs
for kilometres over sloping ground has no one height to level it to, and its height above the ground changes all along
it. M8d (`docs/plans/active/m8-austerlitz.md`) has to take them out of Austerlitz.

## Decision

- A new relief edit, **`relief.mend`**, rebuilds the ground under a work from the ground around it, as it stands when
  the mend applies:
  - along a **line** (`width`, `edge`): each node takes the linear blend across the line of the ground just past the
    edit's reach on each side, read at its nearest point on the line (past an end, their mean);
  - over an **area**, a circle or an ellipse: the plane through the ground on its rim (the nodes just past its
    `edge`), by least squares;
  - blended into the ground over `edge`, like the other edits.
- **Mends apply first** among the edits: they take out what the real relief holds, so the other edits (1805's sunken
  ways, ditches, levelled yards) land on the ground they rebuild, whatever the features' ids.
- The works are traced off the relief itself by a tool (`tools/works.ts`), from committed waypoints, along the ground
  that stands well off the mean around it; the owner checks them like any drawn feature.

## Consequences

- Good: one edit for any embankment, cutting or pit, on any slope; its result follows the ground on either side.
- Good: exact maths only (+ − × /, sqrt), so the page and Node give the same layers (decision 0006).
- Bad: the mended ground is smooth: the blend has no micro-relief, so a long mend reads as a faintly smoother band in
  the lit view (the scatter and the ground's kinds hide most of it).
- Bad: a work crossing a valley mends to the straight blend of its two sides, not to the valley floor that was there:
  where a railway embankment dams a valley, the valley is to be drawn back with a valley landform.
- Neutral: each mend costs one search per node in its reach (Austerlitz's twelve: about 1 s of a 5.5 s compile in
  Node, measured).

## Alternatives considered

- **Levelling to a height per stretch:** many features, steps between them, and wrong across any slope.
- **Harmonic infill (Laplace) from the rim:** smoother over areas, but iterative, slow over kilometres of corridor,
  and order-sensitive in exact maths.
- **Mending the relief file itself** (an edited `.rdem`): no feature to see or change in the editor, and the file
  stops being the source's pinned bytes (decision 0063's hash).
