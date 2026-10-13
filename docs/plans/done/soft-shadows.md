---
status: done
last_reviewed: 2026-10-13
---

# Plan: soft shadows (the sun's penumbra, the sky's occlusion)

Track E, stage 1 (`docs/plans/active/track-e-look.md`), after the shadow look (`docs/plans/done/shadow-look.md`)
and on top of the leaf-card crowns (`docs/plans/done/l7a-canopy-cards.md`). Art direction: `docs/art-bible.md`
§4 (the ramp; "shadows are painted shapes… with grain-broken edges"), §6b (static light baked once per map).

## Problem

The owner (2026-10-13): "in real life it has two kinds of shadow… soft shadow and hard shadow". There are two kinds
of light to lose, and the look has only half of the second:

1. **The sun's shadow has one edge everywhere.** The light-map bake (`bake.frag`) filters every shadow edge by the
   same width. A real sun is a disc: the edge is sharp where a caster meets the ground and widens the farther the
   shadow falls from its caster (a trunk's foot is crisp, a crown's outline 8 m up is soft).
2. **The sky's light is barely occluded.** The occlusion (`bakes.ts`) is a ring test on the height field (hollows,
   stream banks) and a soft disc under each crown or bush. A wood is a set of overlapping discs, not a dark interior
   that lightens to its edge. And in the painter's ramp (`paint()`), occlusion only pushes a pixel across a band
   edge: inside a cast shadow every pixel is one flat shadow colour, so a wood's floor and a lone tree's shadow are
   the same value.

## Scope

- **A. Penumbra** (`bake.frag`, the light map, baked once): a blocker search in the sun's depth map gives the
  distance from the ground to its caster in metres; the filter's radius grows with it (an exaggerated sun,
  `PENUMBRA` metres of edge per metre of distance, a painterly choice and not the real sun's 0.009). The painted
  edge (the grain's threshold) widens with it, so a far edge is a soft, broken gradient and a near one stays crisp.
- **B. Sky visibility** (`bakes.ts`, on the CPU, once): each crown and bush is a sphere (its centre's height above
  the ground, its radius, its leaves' opacity); each texel of the occlusion texture takes the cosine-weighted
  fraction of sky each sphere hides (cos θ · (r/d)², the analytic sphere occlusion) and multiplies them. It replaces
  the discs in G; the terrain's ring test and the contact core (A channel) stay.
- **C. Occlusion inside the shadow band** (`paint()`): the shadow colour itself darkens with the occlusion, so a
  wood's floor is deeper than a lone tree's shadow. The army blocks pass no occlusion (1.0) and are untouched.
- Switches: `?soft=off` (A, B and C off: this plan's baseline), `?penumbra=<m per m>`.

Not in scope: the runtime lookup the crowns use for their own shadows (`shadowAt`, per frame), buildings (the look
page has none yet), the snow tint under the mist (known, separate).

## Acceptance

- `npm test`, full output and exit code.
- Measured on the look page: an edge's width (the 10–90 % luma ramp across it) at a trunk's foot against a crown's
  outline, before and after; luma of the ground inside a wood, at its edge and in a lone tree's shadow, before and
  after (target: the wood's interior visibly deeper than a lone tree's shadow).
- The bake's added time on load, measured.
- Before and after pairs (`?soft=off` against the soft shadows, both with `?trees=cards`) at the near, mid, far
  and winter views, plus a wood, for the owner.
- `node tools/guard.mjs <this branch> --base <main>`: no block that separates on main fails here, except the block
  the owner waived on the shadow look (`wheat.France`, summer, 0.098).
- The goldens are expected to differ (a look change); the diff is reported, not gated.

## Results (2026-10-13)

Pairs (not committed; the scratchpad): this plan's baseline (`?soft=off`) beside it, both with `?trees=cards`, at the
near, mid, far and winter views, and a dense wood (`?wood`) at 70 m and 125 m.

| Measured | `?soft=off` | soft |
|---|---|---|
| Shadow edges in the light map, 20→80 % width, the crispest 10 % | 0.24 m | 0.24 m |
| The same, median | 0.31 m | 0.37 m |
| The same, 90th percentile | 0.62 m | 1.06 m |
| The wood's floor, between trunks (luma, mid view) | 62.6 | **40.9** |
| A bush's cast shadow beside it | 84.0 | 83.5 |
| Lit open ground | 130.9 | 130.9 |

- **Edges:** the edges near their casters keep their width; those far from it soften (the widest tenth 1.7 times
  as wide; `?penumbra` tunes it). Measured in the baked light map's sun visibility over the middle half of the tile, so nothing
  painted over it (the ground's colour, the mist) counts.
- **Woods:** with the old flat shadow band a wood's floor was the colour of any other shadow; now it is 35 % darker
  and the wood reads as one mass, its inner crowns a value lower. The scene's own groves are sparse (about 7 trees
  in 42 by 32 m), so outside `?wood` the change is small.
- **Cost, on load only** (the M1 Pro, Metal, headless Chrome; median of 9): the sky's occlusion 25–32 ms on the
  CPU; the light-map bake, a frame that re-bakes it against a plain frame, 1.1–1.4 ms with `?soft=off` and 14.1–14.2
  ms with the soft shadows (48 shadow-map taps a texel instead of 12, over 3072²). It runs once on load, again when
  the grain is switched or the shadow pass re-renders; nothing per frame. A slower GPU will take longer (not
  measured: an estimate of a few times the Mac's on an integrated GPU, still a one-off).
- **The readability guard** (against main): every block passes but one, the block of the shadow look's waiver:
  `wheat.France` in summer, a dark blue block in a tree's shadow, 0.098 here, as on the shadow look (main 0.100):
  the soft shadows cost it nothing. With the leaf cards the same block is 0.071, with or without the soft shadows:
  the cards' leafy shadow covers more of its ground, a finding for the cards' plan (L7a, not the default arm).
- **Woods and formations:** the wood's floor in shadow is deep (luma 41 against 63). A formation standing inside a
  wood would lose separation there; the guard has no block in a wood. The floor is one number (0.62 in `paint()`)
  if the owner wants it lighter.
- **Inner crowns** read the ground's G at their foot, so in a wood they are a value darker than the crowns at its
  edge (a look the owner judges from the wood pairs: Tiny Glade's woods do the same).
- **The ring test's hollows** are in G too, so a hollow's floor in shadow darkens a little (G at least 0.65 there:
  the shadow colour at most 13 % darker); that is the sky's occlusion as well.

## Review (`/code-review high`)

- **Round 1** (cf899c5): severe: the occlusion inside the shadow read `paint()`'s whole occlusion (a model's own
  vertex occlusion, the contact core, the hollows), so it darkened bushes', grass's and crowns' shadowed parts and a
  lone tree's foot, not only a wood's floor (now `pSky`, the ground's G, set by the ground's materials alone).
  Moderate: the blocker search's fixed 2 m reach cut wide penumbrae off with a step (the reach now follows
  `?penumbra`, and the radius never passes it); the radii were in the sun's metres, stretched 2.2 times along the
  sun on the ground (now ground metres, the minimum the old filter's); 24 fixed taps ghosted thin casters (32, turned
  per texel); the ground inside a sphere but above its centre took no occlusion (the inside test first); the sky
  bake scanned every texel's neighbourhood (now splatted per sphere: 148 ms to 25–32 ms). Light: the strength's
  comment against its use, a roundabout uniform, a second parser for the page's switches and an empty `?penumbra`
  taken as 0. All fixed.
- **Round 2** (7c4ada5): no severe finding. Fixed: the grain leaked into full sun and full shadow once the edge was
  loose (it now acts in the penumbra only); the bake's GPU time unmeasured (measured, above); one switch wired into
  the bakes and the materials with different defaults (`softDefines()`, and `buildBakes` takes the options); a
  bush's occlusion stronger than the old disc (its opacity 0.7: 0.29); the sky bake's numbers as module globals that
  read as real with `?soft=off` (returned in `Bakes.sky`, null when off); `?penumbra` unbounded (at most 0.2); the
  tree placement copied for `?wood` (`placeTree`); a sine hash on world coordinates (interleaved gradient noise on
  the texel index). Left as they are: `pSky` a global set by the ground's materials (the shore's `pSnowK` and
  `pSnowLie` pass the same way), and the inner crowns' darker value (above, for the owner). Review stops here (no
  severe finding).
