---
status: active
last_reviewed: 2026-10-13
---

# Plan: L7b, the crowns' volume (soft light inside a leaf-card crown)

Track E phase L7 (`docs/plans/active/track-e-look.md` §L7), after L7a (`docs/plans/active/l7a-canopy-cards.md`),
on the card crowns (`?trees=cards`) only. Art direction: `docs/art-bible.md` §4 (the ramp), §5 (big readable masses).

## Problem

The owner (2026-10-13), of a Tiny Glade screenshot: the crowns are 2D textures, but their soft light makes them read
as 3D volumes. In Tiny Glade a crown is lit like a ball of cotton: bright on the sun's side, falling off smoothly to
the far side and the underside, darker in the hollows between clumps and deep inside. Ours are flat:

1. **One light value a card.** Each card has one normal (its point's sphere normal) and one shadow value, so the
   crown is lit card by card.
2. **The ramp's three hard bands.** `paint()` snaps a card to the shadow, mid or light colour: a crown is three flat
   patches of whole cards, not a gradient.
3. **No light through the volume.** The crown's own shadow is the shadow map at the card's surface point: on or off.

## Scope (the card crowns only; the pack crowns, the default arm, unchanged)

- **A. A normal per pixel**: from the crown's ellipsoid (its centre and its horizontal and vertical radii, per model)
  at the pixel's point, so the light rolls over the whole crown.
- **B. Light through the volume**: the distance from the pixel's point to the crown's surface toward the sun, inside
  the ellipsoid, dims it (exp(−k·t)): soft self-shadow, the sun's side lit, the far side and the core darker. Other
  trees' shadows: the shadow map at the point where that ray leaves the crown.
- **C. A soft ramp for foliage** (`SOFT_RAMP`, the card material only): the same three painted colours, blended
  over a wide range of light instead of three steps.
- **D. The core**: leaves deep inside the crown darker, so the gaps between clumps read as depth.
- **E. Light per leaf**: the leaf atlas carries each leaf's tilt (the gradient of its value, in G and B), which turns
  the pixel's normal a little, so single leaves catch the light at the crown's edge.
- `?volume=off` puts back L7a's lighting for comparison.

Not in scope: the pack crowns, the cards' shadows on the ground, the far-zoom anti-aliasing (L8).

## Acceptance

- `npm test` (full output, exit code); the goldens of the default arm unchanged (`tools/golden.mjs`, main against
  this branch).
- Pairs, `?trees=cards&volume=off` against `?trees=cards`, at the near, mid, far and autumn views and the dense wood
  (`?wood`), for the owner.
- Measured: the luma range across a lone crown (its 5th to 95th percentile) and the share of its pixels in each
  third of that range (three flat bands against a gradient); the GPU frame time of both arms at the closest and
  widest zoom (`?bench=volume`, the volume against L7a's light, Mac proxy).
- `node tools/guard.mjs` with `?trees=cards` against main's `?trees=cards`: no new failing block.

## Results (2026-10-13)

Pairs (not committed; `scratch/compare/crown-volume/` in the main checkout): `?trees=cards&volume=off` beside
`?trees=cards`, at the near, mid, far and autumn views and the dense wood (`?wood`) at 70 m and 125 m.

| One lone crown (near view, a box inside it) | L7a (`?volume=off`) | volume |
|---|---|---|
| Luma, 5th to 95th percentile | 131–170 | 84–182 |
| Its thirds (dark, mid, light), share of pixels | 0.22, 0.41, 0.27 | 0.22, 0.34, 0.34 |
| Value levels (4-luma bins holding over 1 % of it) | 13 | 29 |

- **Look:** the crowns read as round masses: lit on the sun's side, darker to the far side and in the core, single
  leaves catching the light. Clearest in the wood. The first try was dull and grey: the cards stand inside the
  crown's box, so nearly every pixel was "inside" with the low sun's light path running sideways through it (the
  ellipsoid is now grown by the cards' reach), most of what the camera sees faces away from a sun 27° high (the
  light now wraps), the golden backlight was dimmed by the self-shadow (only other trees block it now) and the soft
  ramp put more of the crown into the desaturating mid colour (kept saturated for foliage).
- **Cost** (`?bench=volume`, M1 Pro Metal proxy, 4 s a camera, two runs an arm): GPU frame p50 within ±0.2 ms of
  L7a at the default and the widest zoom (7.37–8.28 against 7.55–8.28 ms; 12.08–13.04 against 12.06–13.00 ms): no
  measurable cost.
- **Readability guard**, `?trees=cards` against main's `?trees=cards`: passes, with and without the volume.
- **Goldens**, the default arm against main: match at all 8 cameras.

## Review (`/code-review high`)

- **Round 1** (18b110d): no severe finding. Fixed: the leaf tilt's vertical axis inverted (the atlas is uploaded
  without a flip, so canvas down is the atlas v); the wrapped light also widening the warm rim onto the shadowed side
  (the wrap now feeds the ramp only); the light path counting the air before a ray enters the crown (the chord
  ahead); other trees' shadows read 0.8 m past the crown's edge (`shadowAt` adds its own 0.6 m); a dead write of the
  flat tilt where the canvas keeps no colour, and its comment; the horizontal radius the larger of x and z (now
  their mean: one radius stays true under an instance's yaw, two would need the instance's axes per pixel); two
  same-named bounds; the card's axes built twice (`cardAxes()` in `cards.glsl`, shared with `cardOffset`); a missing
  blank line in the system doc. Left: the ellipsoid as per-vertex attributes (the card materials are shared between
  models). Measured again after the fixes (the table above); the guard and the goldens pass. Review stops here.
