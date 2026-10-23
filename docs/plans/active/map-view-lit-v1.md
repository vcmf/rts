---
status: active
last_reviewed: 2026-10-23
---

# Plan: a first lit map view in the staff map prototype (paper, grain, arrows, raised blocks)

## Problem

Decision 0051 (proposed) wants one map view with a 3D feel for the editor and the game; the owner's reference is a
frame of Epic History TV's Waterloo (its source note arrives with PR #135, beside decision 0051). Before building the
renderer, the owner wants to see a first pass of the feel: a warmer paper, grain, better order arrows and army blocks
that stand off the ground. The one place that already has paper, terrain, blocks and arrows together is the staff map
prototype (`prototypes/staff-map.html`), in the ink style of `docs/proposals/staff-map/design.md`.

## Scope

A `?style=lit` mode in `prototypes/staff-map.html`; without it the page is unchanged (the ink style stays for
comparison). In the lit mode:
1. **Paper:** a warmer yellow-brown, aged toward the map's edges.
2. **Grain:** coarser and at more scales (fibres, blotches, fine noise), over the whole map, terrain included.
3. **Order arrows:** one tapered shape along a smoothed path (wide at the tail, narrow at the neck, the head part of
   the same outline), a notched tail, a thin dark edge, a lighter inner line and a soft cast shadow.
4. **Blocks:** a top face lit from the north-west (a lighter NW edge, a darker SE edge), a side face 3–4 px deep in a
   darker shade of the army colour, and a short soft shadow on the ground toward the south-east. Hatching for morale
   and the routing pulse stay on the top face (the shadow and the sides are clipped out under it); selection and
   hover rings stay around the top face, the block's footprint (a lit battery's ring circles its icon, see below).

5. **Relief as contours** (the owner's choice, 2026-10-23, over the hachures): minor contours every 5 m and index
   contours every 25 m, drawn in the terrain shader from the height, about a pixel wide at any zoom, each set fading
   where its lines crowd, and fading with the rest of the ink toward the painted world. A light ink (5 m at 0.25,
   25 m at 0.45 of the ink colour; lightened from 0.4 and 0.7 at the owner's request, in the paper layers' PR #141) so
   the map does not feel heavy.

Out of scope: lit relief (shading), woods as canopy, roofs (decision 0051's bake, a later step); the game's staff map
(`src/render/map.ts`); the map engine's draft page; season tuning beyond keeping each season readable.

## Scope, v2 (2026-10-23)

The owner found the v1 ground (striped Voronoi patches, a mat of identical brown domes) ugly next to the references.
Research (kept outside the repository) measured why: the references put their contrast in large soft masses (relief
light and shade, mottling, dark clumped woods) in one warm yellow-olive family and have no hard edge in the ground;
v1 put it in small hard regular marks. v2, in the same `?style=lit` mode, owner's choices: contours at far zoom only;
built in the prototype first, with stand-in fields (the prototype has no field polygons).
1. **Lit relief, baked once:** a north-west key light, a soft fill and a cast-shadow march over the heights, at
   about 4 m, painted through the painted world's own ground colours (`gLit`, `gMid`, `gSh`), so the map and the world
   agree at the handover; a slow large mottle; no paper grain on the land at play zoom.
2. **Canopy, baked once:** pre-lit crown sprites from the tree list, drawn north to south, sizes varying in clumps,
   gaps near the edge so the field shows through, soft gradient shadow sprites on the ground; green from the
   season's crown colour, not brown.
3. **Fields (stand-in):** patches with no hard edge: the strips fade out toward a patch's border, are soft ridges lit
   from one side, broken and about 5.5 m apart; some patches are plain meadow; tints stay within one hue family.
4. **Contours** shown only at far zoom.

Out of scope for v2: hedgerows, roads from a distance field, a crown atlas from the generated trees (the research's
steps 4, 5 and 8); the real renderer reading the map language (after the owner approves the look).

## Scope, v3 (2026-10-23, the owner's direction)

The owner found v2's ground still unappealing and chose not to follow the references' look: back to v1's paper (the
parchment, its season wash and grain, the aged band, thin ink roads; contours at every zoom), with simple marks on it:
1. **Trees** as flat filled circles with a soft shadow, about 4 in 10 of a wood's trees (chosen by place, stable),
   baked once.
2. **Buildings** as raised rectangles with a side face and a shadow, lit like the army blocks, baked once with the
   static light (drawn live, all 221 cost about 11 ms a frame at map zoom, measured; up close the painted world's own
   houses take over).
v2's relief light, stand-in fields, canopy shading and dirt roads are removed.

## Approach

- One `LIT` flag from the URL; every change branches on it, so the default page draws exactly as before.
- Paper and grain in the terrain shader's paper term (the paper texture is the default's, sampled at a finer scale too);
  the lit palette as its own season table.
- Arrows and blocks on the 2D ink canvas (`drawOrders`, `drawBlock`): every block's shadow and side faces first, then
  every top face and its edges, so no shadow falls on a neighbour's top. One light, the world's north-west seen on
  screen each frame (it turns with the camera), sets the side faces and every shadow.
- Readability (art bible §4, decision 0051's guards): the army colours stay the most saturated marks; the paper and
  grain stay below them in chroma; every block keeps an outline.

## Acceptance

- `?style=lit` screenshots at the map zoom and at mid zoom, in summer and winter, side by side with the default style
  and the reference, shown to the owner.
- The default page is unchanged: at fixed URL parameters (`?R=…&x=…&z=…&simto=…`, the page's headless hooks), its
  screenshots from main and from the branch are pixel-identical (`tools/png.mjs`), at the map zoom and at mid zoom.
  `tools/golden.mjs` knows only the look page's cameras, so it does not apply here.
- No console errors in either mode (`tools/shot.mjs` exit 0).

- **Guards** (the owner, in the paper layers' PR #141): the Garde Impériale and the Russian Imperial Guard in their
  army's colour, darker and a little warm, with a rust cavalry stripe (never white), a legend row; a first try mixing
  the coat with rust read purple-black, too close to the ink, and a rust edge was dropped at the owner's request.
- **Austria in beige**, not white: a light stone beige (`#F4EDDC`, lighter than every season's paper) in the lit style
  only, its blue-grey edge kept; the ink style keeps its white.
- **Losses as wear**: a block loses ragged bites from its edges as its strength falls (up to ten, some through the
  block), seeded by the unit so they stay put; on top of the shorter frontage it already had.
- **Squares fire all round**: a square fires at an enemy in any direction, and its smoke rises from all four faces.
- The page's `window.__proto` hook, swallowed by a comment in the real-terrain PR (#140), restored.

## Review rounds

- **Round 1** (`/code-review high`): severe: the outline strokes after `litEdges` drew one stray segment (the canvas's
  current path), the dark slab under every block filled the morale hatching and the hollow square's hole, an arrow
  could be drawn backwards while its reveal trailed the troops. Fixed, with the moderate ones: shadows and side faces in
  a pass of their own before every top face, clipped out under it; one light, the world's north-west on screen each
  frame; arrow sampling capped, a short arrow keeps its head; one paper term per style in the shader.
- **Round 2**: moderate and light only, so the review stops. Fixed: shadow offsets and blur in device pixels (canvas
  shadows ignore the transform), the ageing a band inside the frame (no seam at the border), the interface's paper,
  the light set before the arrows, the arrowhead continuous and on its base-to-tip axis, the arrows at 0.6 so the
  ground under a route reads and the blocks stay the strongest marks, one fill for a block's sides. Left: the corners
  projected twice per unit (74 units).

- **After the owner's test** (2026-10-23): a group order's arrow could start in empty ground, away from every block.
  It started at the group's average progress along one route laid from its centre, which a spread group or one whose
  battalions dropped out does not stand on (the ink style does the same, faintly). In the lit style the arrow's tail now
  starts at the centre of the battalions still on the order, where they stand, and joins the route where it passes
  nearest them.

- **The owner's gun icon** (2026-10-23): in the lit style a battery is the owner's 15×15 gun icon, in the army's colour,
  turned to its facing (mirrored when it faces left, so the wheel stays under the barrel), with the blocks' shadow;
  the legend's swatch too; its selection ring circles the icon.
- **Round 3**: severe: the side faces never filled (the quads on the far side wound against the shifted top, so the
  visible strip summed to zero under the nonzero rule). The fourth round the rule would need is a redesign instead.
  Also fixed: the arrow's shadow clipped outside its translucent body; the grain on the paper only, not on the painted
  world at close zoom (a full-screen filter otherwise); its fine octave rotated off the texture's period; the light
  from two points at one height (relief swung it); the troops' place on the route searched near their progress only;
  the light spine from past the notch; the battery's ring; no decision cited by number from this branch.
- **Redesign** (the round count restarts): a block's sides are one convex polygon, the hull of its top and the top
  shifted away from the light, the top clipped out above it. No winding to get wrong.

- **Round 1 after the redesign**: severe: `setLight` read both points from `proj`, which returns one shared array, so
  the light never turned (a regression of round 3's fix). Fixed (copies), with: a routing battery keeps its shadow and
  loses its stale ring; a lit battery is clicked
  by its icon; dead code. Measured on the owner's RTX 3080 (Windows Chrome, D3D11, mid-battle, two runs each): the ink
  style 8.3 ms a frame, the lit style 11–12 ms with the tree icons, 8.3–10 ms with the canopy below.
- **The owner's direction** (2026-10-23), after the reference frames of Epic History TV: woods as a texture of crowns,
  not one icon per tree; fields and roads as in the frames. Made in the terrain shader, not copied: a canopy of crowns
  on a jittered 8 m grid, each lit from the north-west, deep shade between them, clumped brightness, a ragged edge
  (only whole crowns near it) and the wood's shadow on the ground to the south-east; fields as patches about 180 m
  across with their own strip direction (10 m) and tint from the season's wash; roads as brown dirt, darker at the edge;
  contours faint under the woods. Smoke: a volley is a small white cloud along the front, a gun flashes at the muzzle
  and throws a larger cloud forward, the way it faces.

- **Round 2 after the redesign**: moderate and light only, so the review stops. Fixed: a lit battery's click circle
  only from the frame that drew it; a cannon's cloud shadows all drawn before its white; the gun's shadow in the
  shadow pass; the arrow's tail at the battalion nearest the route (an average of places can be empty ground); no
  apostrophe in a shader comment; no hachures baked in the lit style; the dead Austria-arrow line (only France's
  orders draw an arrow) and its claim removed. Left, as the woods and fields are to be redone after research
  (research in progress on how clean battle maps are made: the owner found them unclean next to the reference): crowns cut on two
  wood edges, the canopy computed outside woods, a duplicated hash.

- **v2 built** (scope above): the light baked at about 4 m (key, fill, shadow march) through `gSh`/`gMid`/`gLit`; the
  canopy baked as pre-lit crown sprites, north to south, clumped, gaps at the edge, soft gradient shadows, the shade
  under it following the crowns' cover blurred over about 10 m (baked) (no rim, no drawn outline); fields as stand-in patches whose strips
  fade at the borders; a smooth computed mottle (the old noise texture was blocky, in the fields and in the valley
  mist); contours at far zoom only. Measured on the owner's RTX 3080 (D3D11): 8.3–11 ms a frame. Build (`window.__buildMs`,
  three alternating runs each): main 2.19–2.22 s, the lit style 2.19–2.25 s, the ink style 2.18–2.34 s: no
  measurable difference (the lit style skips the hachure bake).

- **v2, round 1**: severe: the shadow march kept the last occluder rather than the strongest, so cast shadows broke
  into blotches. Fixed, with: one sun (25°) for the shading and the shadows; heights sampled past the map's border
  (full shading at the frame, shadows from higher ground outside it); the woods' shade from their cover blurred over
  about 10 m and baked, not a screen-space blur (it left a halo at map zoom); the aged band over the land again; smooth
  breaks along the strips; the existing value noise reused. Open for the owner: the map's light is north-west (the
  cartographic convention), the painted world's sun east-south-east, so light and shade swap sides on the handover.

- **v2, round 2**: moderate and light only, so the review stops. Fixed: a patch's tint none at its border; the
  canopy and its blurred cover drawn with high-quality smoothing (the low default skipped texels); the trees the map
  leaves out at a wood's edge left out of the painted world too; the crown sprite lit by the relief's 25° sun; the
  shadows straight onto the canopy (no second 45 MB canvas); the light march stopping once the ray is above every
  height; `bakeMap` merging the blurred cover (no hidden order between the bakes); the dead aged band; a stray comment;
  the build time measured in pairs. Left: the woods' crown sizes still differ from the painted world's trees.

- **v3 built**: measured on the owner's RTX 3080 (D3D11): 8.2–8.3 ms a frame at map, mid and close zoom (the same
  as the ink style); with the houses drawn live at map zoom it was 19–22 ms, 8.3 ms with them removed (measured in the
  running page), hence the bake. Build about 1.8 s.

- **v3, round 1**: severe: the shader divided the baked houses' colour by their alpha, but the bytes are straight
  (unpremultiplied), so shadows came out a light tan. Fixed (the colour as is), with: houses drawn under the names;
  culled to the screen; only those in the map's frame, as the bake; a crossfade that never thins (each side at full
  strength mid-fade) with the bake's side and shadow lengths in metres; no contours across baked roofs; one corner
  function for the bake and the live houses; stale comments. Kept on purpose: the map shows about 4 in 10 of a wood's
  trees while the painted world grows them all (the owner asked for sparser marks).

- **v3, round 2**: severe: the house texture, straight alpha with mipmaps, filtered each house's colour against the
  transparent black around it (dark blobs at map zoom, dark rims up close). Fixed: premultiplied on upload, blended to
  match. With: one light for the bake, the live houses and the tree shadows (the world's north-west, 45°); the live
  shadow the bake's length; the live houses in batches (all shadows one path, then the sides, then the roofs) and culled
  by their centre first; contours stopping at roofs only; the baked houses at full ink up to the frame, as the live ones.
  Left: the houses' bake uses a full-size canvas (about 45 MB) for 221 houses.

- **v3, round 3**: moderate and light only, so the review stops. Most findings came from the crossfade between baked
  and live houses (stacked shadows, muddy roofs while fading, grain and edges flipping at the handover), so the live
  houses are gone: baked only, at every zoom. With: the bake's shadows as one path (overlaps darken once); houses laid
  after the ink lines and the contours (roofs cover them, no mask needed); no paper grain on roofs; a battery's shadow
  pass with the icon clipped out (a fading gun composites once); dead lines and doubled comments. Measured: 8.3 ms a
  frame at map, mid, crossfade and close zoom; build about 1.8–1.9 s.

## Results

- Lit screenshots (1600×900, Windows Chrome over CDP, SwiftShader): the map in summer, mid zoom in summer and winter
  with French orders, close zoom with a wavering, a routing, a square and a selected block. Shown to the owner.
- The default page against main at `?season=0&speed=0` (1280×720, the status bar masked): 456 differing channel
  values, the same as main against itself (456) and the branch against itself (456): the page's own run-to-run noise
  (an animated swatch and readouts in the lower part), so no change shows. Not a strict proof: the page has no
  `?frozen`.
- Not settled for v2: the notched tail reads as a fishtail; the blocks' depth is fixed in pixels (thin up close);
  Russian green on the summer olive has less contrast than French blue; the relief's light and shade (decision
  0051's bake) under the contours; height labels on the index contours; the summer wash's blocky noise, already in
  the ink style, shows more under the ageing.
- **Wear, squares, beige Austria: round 1**: severe: the bites replaced the canvas path, so the strokes after them
  (an Austrian block's edge, a wavering block's outline) went round the bites and the block lost its edge. Fixed (the
  bites in their own path), with: bites clipped to a square's ring, so its hole stays open; the wear kept while a
  block routs; all-round fire and four-face smoke only once the square has formed, the smoke at the true footprint and
  the drawn heading (it followed the zoom's symbol size); Austria's coat back to the art bible's (the 3D figures
  share it), only the blocks' fill beige; the guards' legend swatches from the palette, with the rust stripe; the
  staff map design doc updated. Left: the bites rebuilt each frame (not measured; a cache if a battle late shows it).
- **Wear: round 2**: severe: the first beige (`#ECE0C2`) was the winter paper's value, an Austrian block's fill gone
  into it. Fixed (a lighter stone beige, lit style only, as the design doc says), with: the bites chosen by the
  block's edges on the ground, not on screen, so they stay on their edge as the camera turns; a square's bites as deep
  as its ring, not its side (it fell apart at 80 %); the bites drawn after the outline, so they break it; a square's
  four-face smoke placed on the block as drawn (at far zoom it sat inside the symbol); one formed-square test; the
  legend's guard swatches equal, each with its stripe. The per-frame bite build stays (unmeasured; noted).
