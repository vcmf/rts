---
status: accepted
last_reviewed: 2026-10-08
---

# Staff Map: Art Direction

The look of the game at its farthest zoom. Companion to the art bible (`docs/art-bible.md`), which
covers the painted 3D world. This document covers the **map**.

> **The promise:** *zoom out and the battle becomes the map a general would have drawn: ink on
> warm paper, armies as flat coloured blocks, orders as broad translucent arrows. Zoom in and the same map
> rises into the painted world, and every block unfolds into its soldiers.*

Decided Oct 2026. Implementation: `docs/proposals/staff-map/implementation.md`. Phases: `docs/plans/active/staff-map.md`.

---

## 1. Why a staff map

- **History:** Napoleon planned on large maps studded with coloured pins, laid out by his
  topographer Bacler d'Albe. At the far zoom the player does what he did.
- **Readability:** thousands of soldiers are unreadable from 3 km up. Blocks are not.
- **Video:** the map is the frame that history videos (Epic History TV, the West Point
  Napoleonic atlas) use, so our video export gets it from real battle data.

### References

| Reference | Take | Leave |
|---|---|---|
| Epic History TV battle maps | Flat army blocks, the season colouring the whole map, villages as clusters of dark marks, paper texture | Bevelled 3D blocks with drop shadows, rendered hillshade (the "hybrid" look), big banners with portraits |
| West Point *Atlas of the Napoleonic Wars* (Esposito & Elting) | One map per phase of the battle; past movements stay on the page | Its mid-century print look |
| 1800s staff maps (Lehmann hachures, 1799) | Relief drawn as hachures, woods as tree marks, water names in italic | Dense lettering, decorative cartouches |
| Kriegsspiel (1824) | Painted blocks on a map *are* the game | Its umpire and written orders |
| Supreme Commander strategic zoom | One continuous zoom from soldier to whole map; navigating by zooming out and back in | Icons that become an unreadable blob when units cluster |
| *field notes* (winlp4ever.github.io) | The UI language (§8) | Its dark mode as the map's default |

---

## 2. Pillars

1. **The map is 1805, the interface is 2026.** The map is drawn the way it was then. The chrome
   around it is modern editorial design: a condensed grotesk, a mono for data, hairlines, one
   accent per army. We never fake antique typography on the interface.
2. **Ink, not render.** No shadows, bevels, glows or gradients on the map. Every mark is a flat
   stroke or a flat fill, as if drawn.
3. **Only the armies have colour.** The paper, terrain and ink stay in warm neutrals and a
   seasonal wash. Army colours are the most saturated thing on the map, as in the 3D world.
4. **The map is the simulation.** Every block is a real formation's real footprint. Nothing on
   the map is decoration that the sim does not know about.
5. **Minimal, rich in detail.** Few elements, each carefully drawn: the hatch spacing of a
   wavering block, the pencil grain of an order, the tick marks on the neatline.

---

## 3. Paper and ink

| Element | Value | Note |
|---|---|---|
| Paper | `#e8e1d3` warm taupe | Fibre grain and faint foxing, anchored to the world (it never slides when panning) |
| Ink | `#2b2824` warm graphite | Never pure black |
| Pencil | `#8a847a` | Orders not yet carried out, plans, construction lines |
| Ink, winter | `#4f5a66` cool blue-grey | Relief and woods cool down in snow |

- **Line weights:** three only. Hairline (roads, contours, neatline ticks), fine (river banks,
  wood edges, hachures), bold (army symbols, inked orders).
- **The edge of the map:** content stops at a **neatline** (a fine double frame with coordinate
  ticks, like an atlas plate). Beyond it, blank paper. Ink thins out toward the neatline, as if
  the surveyor drew less carefully at the edges.

---

## 4. Terrain on the map

| Feature | Drawn as |
|---|---|
| **Relief** | **Hachures** (Lehmann): short strokes running straight downhill, set in rows along the contours. Steeper slopes get thicker, denser strokes; flat ground gets none. Generated from the heightmap, never hand-drawn |
| Contours | Optional hairlines, off by default |
| **Woods** | Edge line plus a stipple of small round tree marks; a light wash inside |
| **Water** | Rivers as a fine double ink line with a pale blue wash between; ponds the same. Water names in serif italic along the course |
| Roads | Double hairline; tracks as a single dashed hairline |
| **Villages** | Clusters of small dark ink blocks, one per real building, plus a church cross |
| Fields | Not drawn (they clutter); a faint ruling only where it matters for the battle (later) |
| Place names | Serif italic, letter-spaced; hills in small caps |

The hachures are what make the map feel drawn. They replace hillshade completely.

Every feature above comes from the battlefield's map file (`docs/proposals/map-format.md`), the same one
the 3D battlefield and the simulation compile from.

---

## 5. Seasons: a wash on the paper

The `season` value from `docs/art-bible.md` §4b drives the map too. Colour is a **watercolour wash**
over visible paper, never a full fill.

| Season | Wash | Woods | Ink |
|---|---|---|---|
| 0 Summer | Light green, stronger in valleys | Deeper green stipple | Warm graphite |
| 1 Early autumn | Green turning gold | Mixed rust and gold | Warm graphite |
| 2 Late autumn | Ochre | Rust and brown | Warm graphite |
| 3 Winter | **Almost none.** The paper lightens and cools: it reads as snow | Grey stipple | **Cool blue-grey** |

Winter is "less ink", which is also the most beautiful version of the map. Later: mud and rain
make the washes run and the ink fade.

---

## 6. Army symbols

Blocks are flat, sharp-cornered, with no shadow, bevel or outline glow.

### Shape is the formation
- **At the map zoom a block is a symbol, not a footprint.** A true battalion line is ~70 m by
  3 m: unreadable from 3 km. The symbol is sized to be read, and every formation keeps about
  the **same visual weight**, so a column or a square never looks like a smaller unit than a line:

  | Formation | Symbol (at the theatre zoom) |
  |---|---|
  | Infantry line | 104 × 32 m bar |
  | Infantry column | 62 × 56 m block |
  | Infantry square | 72 m hollow square, 18 m ring |
  | Cavalry line / column | 96 × 30 m / 50 × 60 m, with the diagonal |
  | Artillery deployed / limbered | 86 × 20 m bar / 24 × 62 m, with the gun dot |

  Symbols are narrower than the spacing inside a corps (125 m), so a corps reads as separate
  blocks. Blocks in contact with the enemy may touch; layering rules are an open question (§11).

  (In reality a square is far smaller than the same battalion's line: the men spread over four
  faces. The map favours readability over that truth.)
- Symbols keep a **steady on-screen size**: they shrink in world terms as the camera closes in
  (full at the theatre zoom, about half at the map zoom).
- **Zooming in, the symbol shrinks to the true footprint** (true frontage and depth, true facing)
  before the soldiers stand up in it (§9). In the painted world, block and soldiers always agree.
- Losses shorten the symbol's frontage (to about 55% when the unit breaks at 20% strength); a
  square shrinks on both sides so it stays a hollow square.
- Drawn depth is never under 5 screen pixels, at any zoom.
- The block **changes shape when the formation changes**: line → long bar, column → thick block,
  square → hollow square. The morph is animated (§9).

### Type
| Type | Symbol |
|---|---|
| Infantry | Solid block in the coat colour |
| Cavalry | Solid block with **one diagonal stroke** in paper colour |
| Artillery | Short bar with a dot (the gun) on the facing side |
| Headquarters | Small flag on a staff, no portrait on the map |

### State
| State | Reading |
|---|---|
| **Losses** | The block shortens as the frontage shrinks |
| **Morale** | Solid fill above 60%; below it the fill **drains into hatching** that gets sparser as morale falls |
| **Routing** | **Pulses between the army colour and white** (the colour of surrender, as in Total War; a soft ~1.1 s cycle, never a hard flicker), with a **dashed edge** so its white phase never reads as an Austrian block. It turns its back as it breaks, then flees away from the enemies in reach (closer ones push harder; when pinched, toward its own rear), running along the map edge rather than into it; its escape direction and the drawn block both turn smoothly |
| Firing | Small pencil smoke curls in front of the block, fading in a few seconds |
| Selected | Thin double outline in ink, plus an expanded label (§8) |

### Colours
From `docs/art-bible.md` §4: France `#2C4FA8`, Russia `#2F6B3C`, Britain `#B3302A`.
**Austria** (`#E9E3D3`) would vanish on winter paper, so Austrian blocks are filled a brighter
white (`#fbfaf6`) and always carry a bold grey-blue edge (`#4f6279`); a routing Austrian block
blinks between that grey-blue and white. Every army colour is checked against every
season's paper.

### Command
- Corps and division leaders are **typographic labels**: mono small caps ("IV CORPS · SOULT") on
  a thin leader line to the centre of their units, like figure captions.
- **No banners or portraits on the map.** A small engraved portrait appears only on hover or
  selection.

---

## 7. Orders and footprints

Two different marks, never confused:

| Mark | Meaning | Look |
|---|---|---|
| **Command** | Where the units are going | A broad, **solid but translucent** band in the army colour (~36% opacity, so it never competes with the blocks), ending in a **filled triangular head** with a thin paper-white edge (Epic History's campaign arrows). It covers only the distance still to go, and disappears on arrival |
| **Footprints** | Where the units actually went | A **thin dotted line** in the army ink colour along the commanded path, as far as the troops got. Each step fades with age and is gone after ~40 game minutes, so old movements disappear while the recent ones read clearly. **A trace always leads to a block:** it shows only while one of its own battalions stands within 250 m of its end; otherwise it fades out in about a second, and comes back if they return. Older legs of a chain of orders fade as the troops move on |

1. A command draws itself along the path the player dragged (~0.5 s reveal), head last.
2. Paths curve; they never snap to straight polylines. A group order is one wide band for the
   whole corps, a single-battalion order a narrower one.
3. **Only the player's commands are shown.** Enemy movements appear as footprints once carried
   out, never as intentions. Automatic moves (a battalion closing on an enemy by itself) leave
   no mark, or the map fills with noise.
4. Later, a replay scrubber can redraw footprints from the recorded orders.

---

## 8. Interface language

Borrowed from *field notes* (winlp4ever.github.io), the author's own site.

| Element | Rule |
|---|---|
| Type | **Instrument Sans** (condensed) for titles, **Hanken Grotesk** for text, **JetBrains Mono** for data; **Instrument Serif** italic for place names on the map only |
| Cartouche | Top left: the battle name in condensed display type, a mono line under it ("2 déc 1805 · 07:40 · −4 °C"), a double rule |
| Status bar | Bottom edge, mono: live dot, clock, scale, season, units engaged, fps |
| Panels | Hairline frames with **crosshair ticks at the corners**, "FIG"-style mono captions |
| Colour | Paper and ink only; colour belongs to the armies (and one accent for the player's selection) |
| Scale bar | Mono numbers, alternating ink and paper segments |

---

## 9. The zoom: one world, not two modes

Zooming is never a crossfade. It runs in stages, driven by one value, `mapness` (1 = map,
0 = painted world), which follows the camera distance:

| Order | Stage | What happens |
|---|---|---|
| 1 | Tilt | The camera leaves straight-down and tilts to the RTS angle |
| 2 | Wash soaks | The seasonal wash deepens into the painted ground colours |
| 3 | Relief rises | The flat paper lifts into real terrain; the hachures ride on it |
| 4 | Things sprout | Trees and houses grow out of their map marks, staggered |
| 5 | **Soldiers stand** | Each block's soldiers rise out of its footprint, staggered; the block fades under them |
| 6 | Ink lifts last | Hachures, outlines and names fade out; the painted world remains |

Zooming out plays the same stages backwards: soldiers lie down into their block, the land
flattens into paper, the ink comes back.

**Pace:** the zoom follows the wheel continuously (no snapping). Clicking a zoom level animates
with a slow-in, slow-out ease over ~0.8 s.

---

## 10. Gameplay

- **The map is playable.** The player can select, order and follow the whole battle from the
  far zoom, as in Supreme Commander.
- **Full terrain is always visible.** There is no fog of war on the map for now.

### Considered for later (not in scope)
- **Pencilled intelligence:** enemy positions shown as pencilled reports with a timestamp
  ("reported 07:40"), fading as the report ages (courier delay). Revisit once the core game
  plays; it is a gameplay decision as much as a visual one.
- Portraits in a corner panel when a commander is selected.
- Mud and rain affecting the washes.
- Field ruling and vineyards as map features.

---

## 11. Open questions

- [ ] Hachure density at mid zoom: do they need a second, finer set?
- [ ] How to keep blocks readable when many overlap (layering by importance, à la strategic
      icons).
- [ ] Paper colour under the dark UI theme, if there is one.
- [ ] Label collision rules for place names vs. corps labels.
