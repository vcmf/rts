---
status: accepted
date: 2026-10-23
---

# 0055 The lit map view leans a little off straight down, with armies as low slabs

## Context

The staff-map design (`docs/proposals/staff-map/design.md` §9) shows the map straight down: the camera tilts toward
the RTS angle only as you zoom in. With the shaded relief from real heights (`docs/plans/active/relief-shading.md`),
the owner asked to see the map at a slight angle, with the unit blocks as real boxes. They tried angles of 0 to 45°
(`?tilt=`), then chose "just tilt a bit" and "low slabs first".

## Decision

In the lit map view (decision 0051, proposed), the camera leans about 20° off straight down at full-map zoom, and
still tilts further as you zoom in. The armies are drawn as low slabs: boxes on the ground, their sides lit by the map's
one light, their shadows cast on the ground. Decision 0002 still holds: the view stays far short of the horizon, and
there is no sky.

## Consequences

Good: the relief and the armies read as a model on a table, the look of the references. The slabs' sides and
shadows come from the one light, with no screen-space fakery. Bad: the far side of the map is a little smaller on
screen. The ink style stays straight down and flat, so the two styles differ in view as well as look until one is
chosen.

## Alternatives considered

- **Straight down, as designed:** the cleanest map reading, but flatter. The owner preferred the angle.
- **A steeper tilt (30 to 45°):** more dramatic, and the far side shrinks more. It is kept as `?tilt=` for trying.
