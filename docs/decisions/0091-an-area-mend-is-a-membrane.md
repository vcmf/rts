---
status: proposed
date: 2026-10-30
---

# 0091 An area's mend is a membrane on the ground round it (amends 0073)

## Context

Decision 0073 mends a modern work over an area or a circle with the plane through the ground on its rim, by least
squares. A plane fits a rim only where the ground round the work is flat or evenly sloped. Round the pit west of Újezd
(`pit-ujezd`) the ground curves across a flank: the plane missed it by up to 3 m along the rim, and the 5 m blend
(Austerlitz at 4×, G1) turned that into walls, which the staff map's new light (G2) drew as a rectangle the owner took
for a modern earthwork (2026-10-30).

## Decision

We will fill an area's or a circle's mend with a **membrane**: Laplace's equation over the mend's nodes, the ground
round them held (`membrane`, `src/map/apply.ts`), settled by over-relaxed Gauss-Seidel from a first fill (the plane
through the rim as before, each rim node's misfit to it added back by the inverse fourth power of its distance). The
rest of 0073 stands: lines are mended as before, every mend reads the relief before any mend, the blend over `edge`.

## Consequences

- Good: the mend meets the ground all round, keeps a plane a plane, and never leaves the range of heights round it
  (the membrane's maximum principle); the Újezd pit is gone from the map.
- Good: no measurable cost (Austerlitz compiles in about 2.1 s either way, measured).
- Bad: a membrane crosses the rim at its own slope, not the ground's: on strongly curving ground the light can show a
  faint change of slope at the work's edge (a biharmonic fill would match the slope too, at more cost and code).
- Bad: the work's floor is rebuilt as the smoothest surface between its rims, not as the ground it took away, which no
  fill from the rim can know.

## Alternatives considered

- **The plane, with a wider blend:** a 25 m blend at the pit still stepped about 2 m over 10–20 m (measured).
- **The plane and the misfit spread by inverse distance alone:** meets the rim better (0.73 to 0.4 m on the test's
  ground with squares, under 0.25 m with fourth powers) but overshoots the rim's range, and flat spots form round the
  nearest rim nodes.
- **A biharmonic (thin-plate) fill:** matches the ground's slope at the rim too; kept for a work where the kink shows.
