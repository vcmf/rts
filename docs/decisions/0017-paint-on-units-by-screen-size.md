---
status: proposed
date: 2026-10-10
---

# 0017 Paint on units follows their size on screen

## Context

The world is painted, but soldiers are 10–30 px tall at gameplay zoom and must read in under a second
(decision 0001, `docs/art-bible.md` pillar 1). The research note `docs/research/painterly-2d-on-3d.md`
wants cloth marks that follow the figure; `docs/research/painterly-style-in-real-time.md` §c says to
keep units almost free of brushwork. Paint anchored to the world or the screen slides over a moving
figure.

## Decision

We will paint a figure with a greyscale brush mask on its authored UVs, coloured by the palette per
colour region, and fade those marks to flat colour regions as the figure's height in pixels drops.
No world-space or screen-space grain touches a unit, and a generated model's own colours are never
used. The pixel-height threshold is set by an A/B test (`docs/plans/active/track-e-look.md`, L3).

## Consequences

Formations read as value, silhouette and colour at gameplay zoom; the marks show at close zoom and in
video. Every figure needs clean authored UVs and a painted mask, so generated meshes are retopologised
rather than used as they come. The fade costs a derivative per pixel on units.

## Alternatives considered

- Marks always visible: aliases and adds noise at 10–30 px.
- No paint on units: figures look pasted onto a painted world at close zoom.
- World-space grain: the figure swims through a fixed paint field.

See: `docs/art-bible.md` §8.
