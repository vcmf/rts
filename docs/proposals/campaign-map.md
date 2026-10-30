---
status: draft
last_reviewed: 2026-10-29
---

# Proposal: the campaign map's look

The look of the campaign map: Europe, or one theatre of it, as a printed relief map lying on the general's table,
in the lit style of the battle map (decision 0058). The rules played on it are the campaign proposal
of PR #234; the track is `docs/plans/active/track-k.md`.

> **The promise:** *the campaign is a relief print of Europe, lit low from the north-west, its mountains standing
> off warm paper, its roads drawn in red ink. The corps are small coloured slabs on those roads; when the day is
> played they all march at once, and where two meet, the map opens into the battle.*

## As settled (K1, 2026-10-29)

The prototype settled the look with the owner (`docs/plans/active/k1-theatre-look.md`; decision 0093, proposed). Where
this proposal's first draft says otherwise, this section holds:
- **A relief model, not a print with shading**: one shape (the large forms kept, mountain regions lifted, raised
  ×2.5, lakes sunk as stepped basins) displaces a 3D surface and is lit; the camera tilts from 30° far out to 45° up
  close (no sky).
- **Light as a photograph of the model**: a warm sun low from the north-east (top right on screen), a cool sky, the
  sun's soft shadows and the sky's occlusion baked offline; a slight fall-off across the table from the sun's side.
- **Cold white paper**; contours every 200 m in muted grey, every 1,000 m in a thin light orange; water in stepped
  blues; rivers and roads printed on the ground; names as ink above.
- **Data**: the theatre baked at 250 m for the far zoom and at 100 m in tiles for the close zoom; FSR 1 above
  1080p.

## Context

The battle map's lit view is settled (decisions 0055, 0058, 0064): paper, a shaded relief baked from real heights
(cast shadow, exposure, the slope's light), contours, water as a wash, the armies as low slabs, a 20° tilt. The
campaign map is the same idea at a scale a thousand times larger: a battle map is 2–6 km a side
(decision 0061), the 1805 theatre about 750 × 450 km, Europe about 4,000 × 3,500 km (estimates from the map).

## References

The owner's references are in `design/campaign/refs/` (third-party prints from the internet, kept out of git; what
each one is: `design/campaign/refs/sources.txt`). All six are old survey maps (USGS quadrangles of about 1910, a map
of Italy, a grey contour study) rendered as physical relief.

| Take | Leave |
|---|---|
| A low, raking light with long soft cast shadows: the mountains stand off the paper | The full colour of a photograph: the relief stays in the paper's hues, as on the battle map |
| Heights exaggerated far beyond the truth, so a continent's relief reads | A light from the south-east or the side; ours is the north-west, as the battle map's |
| Warm ochre on the lit slopes, a warm grey-brown in the shade, never black | Dense lettering, spot heights, grid numbers |
| Thin ink over the relief: rivers, red roads, names letter-spaced in serif capitals across a region | The modern survey's contours every few metres: at this scale, a few index lines at most |
| The map as an object: a plate with an edge and a thickness, on a table | A visible table or room: there is no sky and no world beyond the map (`AGENTS.md`, Invariants) |
| Lakes and seas flat and pale, sunk below the land | Bathymetry numbers |

## Design

### What is drawn

| Feature | At the theatre's scale |
|---|---|
| **Relief** | The battle map's shaded relief (slope light, cast shadow, exposure), from real heights, exaggerated many times (below) |
| **Sea and lakes** | A flat pale wash sunk below the shore, the bank toward the light shading the water, as the battle map's water |
| **Rivers** | A fine ink line widening downstream; the big ones (Rhine, Danube) a thin wash between two banks; names in serif italic along the course |
| **Roads** | The game's network, and only it: high roads in red ink, country roads thinner and dashed. A road is a playing piece, so it reads at every zoom |
| **Towns** | A small dark block, larger with the town; capitals and fortresses with their own mark; names in small caps |
| **Bridges and passes** | Where a road crosses a big river or a ridge: a small mark, since they are where roads are held and cut |
| **Regions** | Large letter-spaced capitals across a region (BAVARIA, BOHEMIA), as the references letter CRATER LAKE across the park |
| **Borders** | A faint dotted line, the state of the campaign's year |
| **Woods** | Only the big forests (the Black Forest, the Bohemian Forest), as the battle map's warm grey; no single woods |

### The scale: exaggeration and the plains

At 250 m a texel, the Alps, the Bohemian ranges and the Black Forest are dramatic, but the plains (the Danube's,
Bavaria's, northern Germany's, Poland's) are almost empty paper. Two answers, to be tried in K1:
- **heights exaggerated for the light** many times (the battle map uses ×2; prints of a continent use tens), so
  low hills read;
- **the ink carries the plains**: rivers, roads and towns, which is where the campaign is played anyway.

### Light and season

- **One light, north-west**, as the battle map's (decision 0064). An open question below: the light following the
  played day.
- **The season wash** of the staff map (`docs/proposals/staff-map/design.md` §5) follows the campaign's date: a
  campaign that starts in September and ends in December goes from green to ochre to the cool paper of winter.

### Armies on the map

- A corps is a **low slab** in its army's colour (decision 0055), sized to read, on its road; a corps on the march is
  drawn **along the road over its column's length** (the campaign proposal, #234: a column has a length), so a
  strung-out corps looks strung out.
- **Orders** are the staff map's broad translucent arrows along the chosen roads (`docs/proposals/staff-map/design.md`
  §7); the day's march leaves **footprints**.
- **What a side does not see** is not drawn. An enemy corps seen earlier is a pale ghost where it was last seen, with
  its strength as a range and its age.
- **A battle** is a mark where it is fought (crossed sabres or a burst), with its zone as a faint circle; clicking it
  opens the battle.

### Data

From `docs/research/period-maps.md` §3, licences checked there:
- **Heights:** Copernicus DEM GLO-30 or GMTED2010 (public domain). For the K1 prototype, the AWS terrain tiles
  (Terrarium PNGs, built from SRTM, GMTED2010 and, in Europe, EU-DEM), fetched once by a tool and never committed.
- **Coasts, lakes, rivers:** Natural Earth (public domain).
- **Towns:** Wikidata (CC0), positions checked.
- **Roads:** traced by hand from period maps (Reymann for central Europe); no dataset of 1805 roads was found.
- **Borders:** drawn from public-domain period maps, HistoGIS (CC BY 4.0) as a reference.

### Projection

A Lambert azimuthal equal-area projection, centred on the theatre (on a sphere, its scale error 400 km from the
centre is about 0.05%; computed from the projection's formula). Europe uses the EU's own (EPSG:3035, the same
projection centred at 52° N 10° E): a march's length on the map stays its length on the ground.

### The bake

The campaign map is **one map**, not one per battle: its relief can be baked offline, once, at print quality (many
shadow rays, occlusion), and shipped as images. The battle map bakes at load because every battle map is new
(decision 0064). The sizes (estimates): the theatre at 250 m a texel is about 3,000 × 1,800, one texture; Europe at
the same is about 16,000 × 14,000, which needs tiles and levels of detail (K7). K1 bakes at load, as the battle
map's prototype did, so the look can be tuned by eye; K3 moves the bake offline.

## Alternatives considered

- **The staff map's ink style** (hachures, no light): rejected by decision 0058 for the battle map; the references
  are lit relief.
- **A 3D globe or a tilted 3D terrain** (Total War's campaign map): a sky at the horizon breaks the invariant, and
  a painted 3D Europe is a second world to build. The lit print gives depth with one plane.
- **A painted map by hand** (an artist's Europe): beautiful, but not at true distances, and a march's time comes from
  its length.

## Open questions

1. **How much exaggeration**, and does it change with the zoom? Tried by eye in K1.
2. **The light following the day:** while the day plays, the light swings from the east at dawn to the west at
   dusk, the shadows turning under the marching corps. Static light is baked once (`AGENTS.md`, Invariants): a few
   bakes blended, or one light only?
3. **The plate's edge:** the map as a plate with a visible thickness at its border, or paper to the screen's edge?
4. **Same renderer as the battle map** (`src/render/lit/`) or a tile renderer of its own (K3)?
5. **The zoom into a battle**: a cut, or a continuous zoom from the theatre into the battle's 2–6 km map?
6. **Labels at every zoom**: which names show at which zoom (the theatre: regions and cities; closer: towns and
   rivers).
