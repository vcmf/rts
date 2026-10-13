---
status: current
last_reviewed: 2026-10-13
---

# Art Direction: "The Painted Campaign"

The visual design bible for the RTS. Companion to `docs/architecture.md`
(how the game is built). This document covers how it **looks**.

> **The promise:** *a living storybook illustration of history. It's real
> 3D, but every frame looks painted.*

Rendering reference: *Puss in Boots: The Last Wish* (DreamWorks, 2022): 3D
assets, surfaces, lighting and effects authored to look painted, explicitly
"not a Photoshop filter applied on top".

The reference images and what each is for are in §0.

> Revision, Oct 2026: replaces the earlier "tin-soldier diorama" direction
> (figure bases, sky and horizon shots), which is retired. A mild miniature-field
> depth of field came back on 13 Oct 2026 as a player option (decision 0024).

---

## 0. Reference images

All in `design/refs/`. Most are generated concepts (their prompts sit beside them as
`<name>.prompt.txt`). **They are targets for look, not specs:** where an image breaks a rule below
or a decision, the rule wins, and the image's row says what to ignore.

### Primary targets (the look is signed off against these)

| Target | For |
|---|---|
| `design/refs/north-star-painted-v1.png` | **Summer master.** Composition (one hill, few formations, negative space), battalions of about 100 (decision 0007), dry-brush ground, smoke puffs, the warm and cool split, figures without bases. Ignore its cypresses and its scrub, which fill the negative space; its terrain is louder than the armies should allow. |
| `design/refs/austerlitz-pratzen-v2.png` | **Winter master.** Grey frosted ground with the armies as the most saturated objects, ploughed stripes, mist and smoke that hide no formation. Ignore the brief's 300 men a battalion. |
| `design/refs/austerlitz-goldbach-v1.png` | **Close zoom: river and village** (§6c): meander, gravel bars, stones, reeds, bare willows, bridge, red roofs. Ignore its saturated gold ground, which is late autumn, not December. |
| `design/refs/wagram-grand-battery-v1.png` | **Pulled-back summer plain:** tan and olive fields, sculpted cannon smoke, Austrian white read on tan. Ignore the brief's 300 men a battalion, the oversized foreground staff and smoke over the Austrian line. |

### Supporting references

| Image | Take | Ignore |
|---|---|---|
| `design/refs/style-painterly.png` | **Brushwork and colour:** tapered grass flicks, flower dabs, broken edges, teal hue-shifted shadows, cloud-shadow patches | Its sky, horizon and ground-level camera |
| `design/refs/north-star.png` | Composition only (superseded by the painted version) | Toy bases, its heavy tilt-shift (ours is mild, §1.6), sky glow, glossy figurine finish |
| `design/refs/mood-wide.png` | Warm light temperature, gold-lit valley mist | Everything else: sky, mountains, cypresses, crowding, toy figures |
| `design/refs/austerlitz-cavalry-v2.png` (v1 superseded) | Grey winter palette, hollow squares, a cavalry mass read as one shape, dust | Even texture density everywhere (noise) |
| `design/refs/austerlitz-goldbach-v2.png` (v1 kept for close zoom) | Mid zoom: partly frozen meander, field-strip patchwork, tree lines along the stream | Crowding, little negative space |
| `design/refs/austerlitz-pratzen-v1.png` (superseded) | Mist in the hollow, long shadows across a slope | Saturated gold ground, Mediterranean rocks |
| `design/refs/borodino-fleches-v1.png` | Earthworks (arrowhead parapets), birch clusters, timber hamlet, casualties as small painted shapes | Clutter; near-realistic black smoke from the fire |
| `design/refs/borodino-great-redoubt-v1.png` | Redoubt massing (rampart, ditch, embrasures), an assault in clear lanes | Smoke banks over columns; dusty Total War realism |
| `design/refs/eylau-cavalry-v1.png` | Deep snow with blue shadows (§4b), frozen stream, cavalry masses as shapes | Squalls and smoke blurring the cavalry; white trousers lost in snow |
| `design/refs/eylau-cemetery-v1.png` | Snow on roofs and buildings, walled enclosures, hedges and fences as structure | Dense fallen; brown and grey roofs with no accent |
| `design/refs/wagram-russbach-v1.png` | Escarpments and banks, bridges as crossings, wheat patches | Poplars that read as cypresses; a canal-straight stream (§6c) |
| `design/refs/french-infantry-v1.png`, `-v1-rear` | Tripo input: silhouette, kit proportions, slender adult build, colour regions | Fine face, button and brass detail (§8); slight baked shading (§5); the shako is 1806 and later, so Austerlitz needs a bicorne variant |
| `design/refs/tiny-glade-img-2.jpg`, `design/refs/tiny-glade-forest.jpg` (screenshots of *Tiny Glade*) | **Texture and design:** crowns built of painted leaf clumps with one soft, ball-like light and warm-to-cool shading; soft cool-tinted shadows and contact darkening; real grass blades and tufts at edges; dark mirror water with long reflections; a miniature-field depth of field over which the brushwork still reads | The palette (fairy tale, pastel pinks and teals: ours is epic and wargame, §4); the close camera; the cosy tone |
| `design/refs/french-barracks-u-v2-front.png`, `-u-v2-rear` (v1 pair superseded) | Tripo input: a U footprint that reads from above, clear wall, roof and window regions | Baked directional light (§5); stone texture too fine; check the dormer and chimney counts match between views |

### What the set gets wrong (fix in the next generation, and never copy)

- **Battalion size.** The v2, Borodino, Eylau and Wagram prompts ask for 200–400 men a battalion;
  decision 0007 says about 100. Prompts say about 100 from now on (§12).
- **Russian green reads near-black** in every scene, never `#2F6B3C`, which fails "side readable in
  under a second". In game the palette sets it; check its value against the ground in L4's greyscale
  test (`docs/plans/active/track-e-look.md`). White trousers also vanish on snow.
- **December painted as late autumn.** The v1 Austerlitz images use saturated gold-orange ground
  (§4b value 2). Winter is the v2 grey with pale gold light only on ridges and roofs.
- **Busyness.** Many wide shots carry the same fine texture everywhere and fill the frame with units,
  against §11 and "terrain never matches army saturation".
- **Concept images have baked light** (warm side, cool side), so the Tripo output needs the clean-up
  pass in §10.

---

## 1. Fixed constraints

These are decisions, not preferences. Don't propose against them.

1. **Camera:** always the top-down, zoomed-out RTS view. There are no
   ground-level or horizon shots. At its farthest zoom the world becomes the
   **staff map** (`docs/proposals/staff-map/design.md`).
2. **No sky in the game, ever.** Atmosphere has to come from the ground (§6).
3. **Tone:** epic, not cozy, not dark. Not Total War's realistic, dingy look.
4. **The painterly look lives in the assets and materials,** not in a
   full-screen filter. Any post-processing is a light finishing pass at most.
6. **Blur is the player's choice.** Depth comes from *painting* first: haze and
   cooling toward the top of the screen, looser brushwork toward the edges,
   valley mist and backlight. A miniature-field depth of field sits on top as a
   gameplay setting, **on by default**, mild enough that the brushwork and the
   formations at the edges still read. Presentation modes and video exports use
   stronger settings. (Decision 0024, Oct 2026, superseding 0003; see §6b.)
5. **Readable first.** A player must read every formation, its side and its
   state in under a second.

---

## 2. Pillars (priority order)

1. **Readable.** Clear silhouettes, armies as the most saturated objects on
   screen, negative space between formations.
2. **Painted, not rendered.** Every surface shows the hand: brush marks,
   broken edges, chosen colours rather than computed ones.
3. **Light as colour.** Light is expressed through temperature: warm where
   the sun hits, cool and saturated in shadow. Darkness alone is not light.
4. **Sophisticated simplicity.** Shapes are simple, but the paint is rich.
   The production designer's line: simplification "couldn't be for a lack of
   sophistication."

---

## 3. How the film built the look → what we do

| DreamWorks technique | Our real-time equivalent |
|---|---|
| "A painterly, irregular edge to any 3D object" (their biggest new tool) | **Edge breakup:** silhouettes dissolve into brush-dab shapes, using a world-space grain texture threshold at grazing angles |
| "Stamp map": brushstroke images projected onto surfaces | **Brush library** (§7) projected in world space, never in screen space, so strokes never slide when the camera moves |
| Rim light used liberally for a "graphic edge" | **Graphic warm rim** on units and foliage tops, hard-edged with grain breakup |
| Detail at the focus, "looser, more impressionistic" toward the frame edges | Strokes grow larger and simpler away from the camera focus. Gameplay depth of field is mild and optional (§1.6). |
| Non-naturalistic colour (naturalistic felt "dingy") | **Hue-shifted shading ramp** (§4) |
| Volumetric effects sculpted into graphic shapes, hand-drawn lines | **Illustrated effects:** smoke as shaped puffs with hard and soft edges, volleys as graphic flashes (§9) |
| Animation stepped "on 2s and 4s" for action | **Units animated at 12 fps,** with the camera always smooth |

---

## 4. Colour & light

### The shading ramp (the core rule)
Every surface is painted with **three value bands**, not a smooth gradient:

| Band | Colour rule |
|---|---|
| **Light** | Base colour × warm sun (`#FFD699`-ish). Slightly lifted and warmer. |
| **Mid-tone** | Base colour, slightly warm |
| **Shadow** | **Hue-shifted cool:** toward teal, blue or violet, *more* saturated than the base, never just darker |

The edges between bands are **broken by the grain texture**, so they read as
brush edges rather than computed lines.

**Proposed exception, foliage crowns** (decision 0022, open until the owner
accepts it; built only in the leaf-card arm, `?trees=cards`): the same three
colours, the shadow still cool, blended over a wide range of light instead of
three steps, so a crown reads as a round mass of leaves. Its light wraps round
the crown, it is darker inside, and single leaves catch the sun. Until 0022 is
accepted, the three bands above are the rule for every surface.

### Palette
- **80% calm field:** muted olive and yellow-greens, dry golds, teal-green
  hollows. Never neon green.
- **20% accents, deliberately complementary:** orange flowers against teal
  shadow, red roofs, army colours.
- **Armies are always the most saturated objects on screen.** Terrain never
  matches their saturation.

| Army | Coat | Accent |
|---|---|---|
| France | `#2C4FA8` | white `#EDE6D6`, red `#B8322A` |
| Russia | `#2F6B3C` | white, red |
| Austria | `#E9E3D3` | grey-blue `#9FB0C4` |
| Britain | `#B3302A` | white, black |

### Light setup
- **Sun:** 20–35° elevation, from the side or behind relative to the default
  camera, so shadows are long and readable.
- **Shadows are painted shapes** in the cool shadow colour, with grain-broken
  edges. They are not dark grey overlays.
- **Time-of-day presets** are just ramp colours: golden morning (default), high
  afternoon, winter (pale gold sun, blue shadows), dusk.
- **Shadows are physically computed, then painted.** A real sun shadow pass
  plus ambient occlusion (Babylon) decides *where* shadow falls. Our shader
  decides *how it looks*: the cool shadow band, with edges broken by the grain.
- **Two kinds of shadow, as built** (`docs/systems/look.md`):
  - *The sun's:* crisp where a caster meets the ground and softer the farther
    the shadow falls from it, as under a real sun, exaggerated. A trunk's foot
    is sharp; a crown's outline is soft.
  - *The sky's:* woods, hollows and the ground round each crown see less sky,
    so they are darker. On a wood's floor the shadow colour itself deepens, so
    a wood reads as one mass, darker inside than a lone tree's shadow.
- **The valley mist thins over cast shadow**, so shadows still read in the
  hollows. Over snow it breaks §4b's rule today (a known fault: #62).

---

## 4b. Seasons & foliage colour

Battles happen in every season (Austerlitz in December, Borodino in
September, 1812 in snow), so **season is a per-map setting, not a separate
asset set.** One value, `season`, runs continuously from 0 to 3, and every
material reads it:

| Value | Season | Trees | Ground | Light |
|---|---|---|---|---|
| 0 | Summer | Muted olive and yellow-greens | Meadow greens, dry gold patches | Warm gold sun |
| 1 | Early autumn | **Mixed colours** (below) | Greens turning golden | Warm gold sun |
| 2 | Late autumn | Duller, browner, fewer bright crowns | Ochre and brown | Lower, warmer sun |
| 3 | Winter | Bare-looking dark crowns with snow caps | Snow, painted blue in shadow | **Pale gold sun** |

### Tree colour variety
- **The pack's own colours are never used.** Every model's materials map to
  roles (foliage, bark, rock, flower…), and our palette paints them. Any tree
  can therefore be any colour: it's a palette change, not a new model.
- **Every tree gets a random per-instance value**, which picks its colour
  within the season. A wood is never one flat colour.
- **Autumn mix (deciduous):** about 30% orange, 25% yellow, 17% red, 4%
  purple, the rest still turning from green. This mirrors a real Central
  European wood, where species turn at different times and in different colours.
- **Rare accent all year:** about 5% copper-beech purple, for variety even in summer.
- **Conifers stay green** in every season and only cool slightly in winter.
  Their contrast against bare autumn and winter woods is part of the look.
- **Grass and meadows** change as one field colour per season, with no
  multicolour mix. Variety lives in the trees.
- Every season's colours pass through the same painted lighting (warm lit,
  cool hue-shifted shadow, grain), so a red maple or a purple beech still
  belongs to the same painting.

### Snow
- **Snow is a shader effect, not separate models:** it settles on any surface
  facing upward (tree crowns, rocks, roofs, ground), with its edge broken by
  the paint grain so it reads as painted.
- **Snow must look white, never yellow.** In winter the sun colour shifts to
  pale gold. Lit snow is near-white, and shadowed snow is clear painted blue.
- The pack's dedicated `…_Snow` and `…_Dead` models remain available for
  special scenes (e.g. bare winter woods), but the default is shader snow.

Implemented in `prototypes/painted-hybrid.html` (season slider).

---

## 5. Assets: the 3D model contract

The paint comes from our shaders, so models must be **simple and clean**.

| Rule | Why |
|---|---|
| **Big, readable masses.** A tree is 3–6 crown clumps, not leaves; a house is walls, roof and a few openings. | The paint adds the detail. Modelled detail fights it. |
| **No baked lighting or shadows in textures.** Flat, evenly lit base colours only. | Our lighting ramp must own light and shadow. Baked shading doubles it and breaks under the game's sun. |
| **Separate colour regions** (crown / trunk; wall / roof / door), either as separate materials or clean texture areas | The shader maps each region to a palette role |
| **About 2–8k triangles** for a hero asset; fewer for scatter | Thousands of instances |
| Soft, slightly irregular forms with no razor-sharp bevels | They catch the rim and read as hand-made |

Generic asset packs (e.g. Quaternius) were tested and rejected: their shape
language never matches. **Assets are generated for this style** (§10).

---

## 6. Atmosphere without a sky

- **Painted cloud shadows** drift slowly across the land as big, soft, cool
  shapes. They are the main way the sky enters the frame.
- **Colour falloff from the focus:** away from the camera target, colours cool
  toward blue-violet (warmer on the side facing the sun). There's no horizon haze.
- **Water reflects a painted sky colour** (cool blue-teal) with graphic glints.
- **Valley mist** for special presets (e.g. the Austerlitz dawn): low, painted,
  lit gold on the sun side.

---

## 6b. Depth & the cinematic layer

**Depth of field in gameplay** (decision 0024, superseding 0003). *Tiny Glade*
(`design/refs/tiny-glade-img-2.jpg`, `design/refs/tiny-glade-forest.jpg`) shows that a tilt-shift blur over painted
leaves, grass and water makes the field read as a miniature while the
brushwork survives where the blur is mild. So:
1. It is a player setting, **on by default**, focused on the ground at the
   screen's centre. Only what lies well beyond the focus blurs: a soft band at
   the top of the screen. Nothing nearer than the focus blurs. Its strength
   follows the zoom.
2. It stays mild in the band the player reads: formations at the screen's edges
   must still pass the readability guard with it on.
3. Painting carries depth first; blur adds to it. The look checks measure the
   paint with blur off.
4. Cost: about 0.7–0.8 ms at the default zoom (measured on the Metal proxy,
   `docs/plans/active/gameplay-dof.md`), charged to the post budget.

The concerns that made 0003 (threats at the edges, focus pumping as the camera
pans, blur erasing grain) are what the tuning and the toggle answer.

**Where stronger depth of field is used:** video exports (directed camera, focus
follows the action) and in-game presentation modes.

**Reopened, then answered (owner, 2026-10-13):** after Tiny Glade, whose
tilt-shift is much of its miniature charm, gameplay depth of field was an open
question again. Decision 0024 answers it, with the measurement (Track E's owner
question 3).

**The cheap cinematic stack** (from `docs/research/cheap-painterly-postfx.md`):
- **Bake what doesn't move:** terrain ambient occlusion, canopy contact
  shading, the sun shadow and the sky's occlusion by crowns, baked once per
  map. No live SSAO.
- **One merged finishing pass:** warm amber grade with split toning, soft
  highlight roll-off, cool vignette, paper texture, dithering.
- **Valley mist and height fog in the materials:** warm where sunlit, cool
  in shadow. Light shafts form where tree shadows cross the mist.
- **Golden backlight glow** on foliage, plus the graphic rim.
- **Render at 1× pixel density** on high-DPI screens; the painterly look hides it.

---

## 6c. Water: the lowland meander

**The one river type we build first** (decided Oct 2026). It's the Goldbach at Austerlitz and
the most common Napoleonic battlefield stream. Other types (stony brook, wide slow river, braided
gravel) come later and reuse the same system. Technique: `docs/research/stylized-water.md`.

### Shape
| Element | Rule |
|---|---|
| Width | 4–11 m of water, **visibly** varying: each stretch of 2–3 bends has its own width, bends are narrower, straight riffles wider (wide and shallow). The widest stretches are about twice the narrowest |
| Bends | Meanders that **turn back on themselves**; each bend differs in size and spacing (about 11 widths apart, ±35%) |
| Pools | At each bend apex: deep, calm, **dark** water |
| Riffles | Between bends: shallow, fast, **light** water with foam. They are the **fords** (gameplay crossings) |
| Banks | Outside of a bend: a steep **cut bank** of bare earth. Inside: a shallow, pale **gravel point bar** |
| Valley | The stream winds through a **flat floodplain meadow** (~80 m) whose sides rise gently into the surrounding land; it never cuts canyons and never crosses hills |
| Water level | Only ever drops downstream; water never floats above its banks |

### What sits where
- **Nothing in the water except stones.** No trees, bushes, wheat, buildings or units stand in
  the water or on the wet bank. Stones and boulders are the one exception (in riffles and at
  the foot of cut banks), where they make foam.
- **Along the banks:** willows and alders in a broken line, reeds and cattails at the water's
  edge, damp darker grass on the floodplain.
- **On the floodplain:** open meadow, scattered trees. Fields and villages sit on the valley
  sides, above the floodplain.
- **Formation zones, the central hill and village sites are protected:** the valley is placed
  around them, never through them.

### Look (painted, top-down)
- **Depth reads as value:** pale turquoise shallows → mid teal → dark deep pools, in three
  painted bands with grain-broken edges.
- **Banks are painted shapes:** a dark wet line at the water, bare earth on cut banks, pale gravel
  on bars, reeds as small painted accents.
- **Life on the surface:** flow strokes along the current (stretched on riffles, bunched in pools),
  broken white foam lines on riffles and around stones, golden sun glitter, crisp tree reflections
  in pools.
- **Seasons:** autumn leaves drift in pools; in winter the stream freezes pale with snowy edges
  (§4b).
- **Readable from 260 m:** at the widest zoom the river must still read as one continuous
  winding blue-teal line, with no dashes or gaps.

---

## 6d. The far zoom: the staff map

Zoomed all the way out, the painted world turns into a drawn map: ink on warm
paper, Lehmann hachures for relief, armies as flat blocks, orders as pencil
arrows. The zoom between the two runs in stages (the land rises, the soldiers
stand up out of their blocks), never as a crossfade. Its own docs:

- `docs/proposals/staff-map/design.md`: art direction (paper, terrain, seasons, army symbols, orders, zoom, UI)
- `docs/proposals/staff-map/implementation.md`: how it is built (map bake, `mapness`, ink overlay)
- `docs/plans/active/staff-map.md`: phases

The `season` value (§4b) and the army colours (§4) drive the map too.

---

## 7. Brush library

The style's most important asset, and where the craft goes.

**Fill textures** (tileable, 2048², painted in greys on mid-grey; the shader adds colour):

| Fill | Marks | Covers |
|---|---|---|
| Grain | Fine gouache and paper speckle | Everything (start here) |
| Grass | Tapered flicks, one direction | Fields, hills |
| Meadow | Broad blotches and dabs | Colour variation |
| Earth | Broken dry-brush | Roads, banks, ploughed fields |
| Stone and plaster | Flat blocky strokes | Walls, rocks |
| Foliage | Round overlapping dabs | Woods at distance |
| Water | Long smooth horizontals | Streams |

**Single strokes** (PNG on transparency): leaf dabs, grass tufts, a flower shape,
splatters, soft smudges. Used for scattered accents and edge breakup.

Authoring: Procreate or Krita (wrap-around mode for seamless tiles), or real gouache
scanned. The prototype accepts a dropped PNG to test a grain live.

---

## 8. Units

- **Simple, clean figures:** strong silhouette, flat local colour, almost no
  internal detail. Closer to the film's characters than to detailed miniatures.
- **No bases.** Team colour and selection are shown by flags and a soft
  painted ground ring when needed.
- **Graphic rim** and a crisper version of the paint (less brush jitter than
  the landscape).
- **Paint follows size on screen** (decision 0017, proposed): a brush mask on
  the figure's UVs that fades to flat colour regions at gameplay zoom.
- **12 fps stepped animation** for marching and fighting.
- **No gore:** casualties fall and remain as painted shapes.
- At the far zoom a unit is a flat block whose shape is its formation's
  footprint (`docs/proposals/staff-map/design.md` §6).

---

## 9. Effects

| Effect | Style |
|---|---|
| Musket smoke | Shaped puffs: lit warm on the sun side, cool in shadow, edges partly hard |
| Volley | Brief graphic flash marks, not glowing particles |
| Cannon | Bigger sculpted puff plus a ring of dust |
| Dust | Warm beige dry-brush clouds |
| Fire | Hand-drawn-feeling shapes, stepped at 12 fps |

Effects must never hide a formation the player needs to read.

---

## 10. Asset generation pipeline

```
concept image (OpenAI)  →  Tripo (image or multiview → 3D)  →  clean-up  →  engine
```
1. **Concept image:** the asset alone, evenly lit, plain background, big simple
   masses, painted colour regions (see the prompt library in §12).
2. **Tripo:** image-to-model (or multiview with front/left/back/right). Ask
   for a moderate face limit (≈2–8k). Prefer clean geometry over a detailed texture.
3. **Clean-up:** check there's no baked shading in the texture; simplify; split
   colour regions if needed.
4. **Engine:** the shared painterly shader paints it. **Consistency comes from
   the shader, not from the source.**

---

## 11. Composition

- Few formations, generous negative space (the north star's lesson).
- 1–3 landmarks per screen: a village, a bridge, a farm, a church.
- Vegetation in **structures**: hedgerows, copses, orchards, tree lines along
  streams. Never random scatter.
- Regional authenticity: Central Europe means oak, lime, birch, willow and
  orchards. No palms, cypress or cactus.
- The battle tells its story on the ground: smoke and fallen figures accumulate.

---

## 12. Prompt library (OpenAI image generation)

**Rules for every battle-scene prompt** (from the review of the reference set, §0): battalions of
about 100 men (decision 0007); armies more saturated than the ground; winter as grey ground with pale
gold light, not gold-orange; Russian green named as a mid-value green, not dark; generous negative
space; no cypresses or poplars in Central Europe. The full prompts used so far sit beside their
images in `design/refs/`.

**Asset prompt: tree (Tripo input)**
```
A single deciduous oak tree, stylized 3D game asset in the painterly style of
modern stylized animated films: the crown is built from 4 to 6 large rounded
clumps of foliage with soft irregular edges, a short sturdy trunk with two
visible branches. Hand-painted look with visible brush strokes and gouache
grain inside each colour area, flat colour regions: muted olive and
yellow-green foliage, warm brown trunk. Evenly lit with soft neutral light,
NO cast shadows, no strong highlights or dark shading baked in. Three-quarter
view from slightly above, the whole tree visible and centred, isolated on a
plain light grey background. No ground, no grass, no text.
```

**Multiview variant (for Tripo multiview):** append
`Character-sheet layout: the same tree shown four times side by side from the
front, left side, back and right side, identical scale and lighting.`

**Style concept prompt (look reference, not for Tripo):**
```
Top-down view from high above of a gentle grassy hill in the painterly style
of a modern stylized animated film: 3D forms painted with visible gouache brush
strokes, broken painterly edges, warm yellow-green light on sunlit slopes and
cool teal-blue saturated shadows, long painted tree shadows, drifting soft
cloud shadows on the land, a few rounded clumpy trees, orange wildflower
patches, a winding blue-teal stream. No sky, no horizon. 16:9, no text.
```

---

## 13. Open questions

- [ ] Brush library v1: grain first, then grass and foliage fills.
- [ ] Do Tripo textures carry useful painted detail, or should we use geometry only plus our brush library?
- [ ] The visual vocabulary for unit state (routing, fatigue) without bases.
- [x] Winter preset concept → §4b (shader snow, pale sun). Still to decide: frozen water, and bare-branch models for deep winter.
- [ ] How strong the "looser away from the focus" effect should be at max zoom-out.
