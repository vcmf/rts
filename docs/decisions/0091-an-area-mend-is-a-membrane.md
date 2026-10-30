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

We will fill an area's or a circle's mend with a **membrane**: Laplace's equation over the mend's nodes, held to the
ground round them that no mend reaches; a neighbour another mend reaches is left out, never read, so the mends stay
independent of each other (0073). It is settled by successive over-relaxation from the plane through that ground,
until no node moves ten micrometres in a sweep (a millimetre or so of error), and the compile fails rather than keep an
unsettled fill (`membrane`, `src/map/apply.ts`).
A rim mostly off the map or reached by other mends (under a quarter of it free) keeps its mean, as 0073 has it: held
to a short arc, a membrane would spread that arc's bumps over the whole work. The
rest of 0073 stands: the blend into the ground over `edge`, lines mended as before, every mend reading the relief
before any mend. A work whose own ground reaches past its outline (the Újezd pit's stepped sides) takes an `edge`
wide enough to cover it (15 m there): a narrow blend mixes that ground back in, a ghost of the work's outline.

## Consequences

- Good: the mend meets the ground all round, keeps a plane a plane, and never leaves the range of heights round it
  (the membrane's maximum principle); the Újezd pit is gone from the map.
- Good: no measurable cost (Austerlitz compiles in about 2.1 s either way, measured).
- Bad: a membrane crosses the rim at its own slope, not the ground's, and flattens a rounded shoulder between its
  rims: the low sun still shows a faint flat patch over the west half of the Újezd pit (G2, the owner's screenshots)
  and a soft line along its north edge. A biharmonic fill would match the slope too, at more cost and code.
- Bad: the work's floor is rebuilt as the smoothest surface between its rims, not as the ground it took away, which no
  fill from the rim can know.

## Alternatives considered

- **The plane, with a wider blend:** a 25 m blend at the pit still stepped about 2 m over 10–20 m (measured).
- **The plane and the misfit spread by inverse distance alone:** meets the rim better (0.73 to 0.4 m on the test's
  ground with squares, under 0.25 m with fourth powers) but overshoots the rim's range, and flat spots form round the
  nearest rim nodes; it costs nodes × rim nodes.
- **A biharmonic (thin-plate) fill:** matches the ground's slope at the rim too; kept for a work where the kink shows.
