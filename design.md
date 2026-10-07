# Art Direction: "The Painted Campaign"

The visual design bible for the RTS. Companion to `web-rts-architecture.md`
(how the game is built). This document covers how it **looks**.

> **The promise:** *a living storybook illustration of history. It's real
> 3D, but every frame looks painted.*

Rendering reference: *Puss in Boots: The Last Wish* (DreamWorks, 2022): 3D
assets, surfaces, lighting and effects authored to look painted, explicitly
"not a Photoshop filter applied on top".

| Reference | File | Use it for |
|---|---|---|
| Painterly style | `design/refs/style-painterly.png` | Rendering, colour, brushwork |
| North star | `design/refs/north-star.png` | **Composition only:** one hill, few readable formations, negative space. Ignore its toy bases and tilt-shift. |
| Mood (wide) | `design/refs/mood-wide.png` | Warm light and atmosphere only. Its busy composition is what to avoid. |

> Revision, Oct 2026: replaces the earlier "tin-soldier diorama" direction
> (tilt-shift blur, figure bases, sky and horizon shots), which is retired.

---

## 1. Fixed constraints

These are decisions, not preferences. Don't propose against them.

1. **Camera:** always the top-down, zoomed-out RTS view. There are no
   ground-level or horizon shots.
2. **No sky in the game, ever.** Atmosphere has to come from the ground (§6).
3. **Tone:** epic, not cozy, not dark. Not Total War's realistic, dingy look.
4. **The painterly look lives in the assets and materials,** not in a
   full-screen filter. Any post-processing is a light finishing pass at most.
6. **No optical blur during gameplay.** Depth comes from *painting*: haze and
   cooling toward the top of the screen, looser brushwork toward the edges,
   valley mist and backlight. Depth of field is allowed only in **presentation
   modes** (photo mode, replays, the opening fly-in, victory screen) and in
   **video exports**. (Decided Oct 2026; see §6b.)
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
| Detail at the focus, "looser, more impressionistic" toward the frame edges | Strokes grow larger and simpler away from the camera focus. **No optical blur during gameplay** (§1.6). |
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

**Why no blur in gameplay** (decision record):
1. An RTS player reads the whole screen. Flanks and incoming threats live at
   the edges, exactly where tilt-shift blurs.
2. The camera pans constantly. Focus "pumps" as things scroll in and out of
   the sharp band, which is tiring and stops feeling magical.
3. Blur erases the painted grain and edges that carry the style.
4. *The Last Wish* "illustrates" depth with looser brushwork, not lens blur.
5. It is **not** a performance decision (depth of field ≈ 0.5–1 ms), so it can
   be revisited cheaply.

**Where depth of field IS used:** video exports (directed camera, focus
follows the action) and in-game presentation modes. Gameplay depth of field
exists only as an off-by-default setting. If playtests show the field feels
flat, the fallback is a *very subtle* depth of field at the closest zoom only.

**The cheap cinematic stack** (from `research/cheap-painterly-postfx.md`):
- **Bake what doesn't move:** terrain ambient occlusion, canopy contact
  shading and (later) sun shadow, baked once per map. No live SSAO.
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
gravel) come later and reuse the same system. Technique: `research/stylized-water.md`.

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
- **12 fps stepped animation** for marching and fighting.
- **No gore:** casualties fall and remain as painted shapes.

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
