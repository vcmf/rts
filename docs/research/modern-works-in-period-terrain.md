---
status: research
last_reviewed: 2026-10-30
---

# Modern works in period terrain: how games and GIS take them out of real heights

Our battle maps are built from modern heights (Czech DMR 5G lidar for Austerlitz, at 2 m a cell), and the modern
heights carry works the period did not have: railway and motorway embankments and cuttings, quarries, retention
basins, reservoirs and dams, tank farms, interchanges. Today each one is a hand-drawn `relief.mend` (decision 0073):
a plane fitted to the ground round its rim, blended over an edge. It does not scale (the campaign covers Europe, and
every battle map is a new 2–4 km of lidar), and on curving ground a plane misfits its rim: the Újezd pit and the
Šlapanice basin show as square ghosts in the lit map (#281, G1b). How do other games with large historical maps do
it, and what do GIS, archaeology and terrain processing practice do?

Date: 2026-10-30, by two research agents (games; GIS and methods), merged and spot-checked.

Tags:

| Tag | Meaning |
|---|---|
| [S] | Sourced: the linked page states it (read in full, or its abstract where said). |
| [C] | Community or secondary source, or a search engine's extract of a page that refused reading. |
| [E] | Estimate or inference by this note's authors, with the reasoning. |

Spot-checked against their sources (2026-10-30): the Charlemagne canal paper's buffers, fill and errors; GRASS
`r.fillnulls`' edge buffer; Pérez et al.'s "blurred" membrane and their solver times; Asobo's terraforming slides.

## Summary

- **No game publishes an automated way** to take modern works out of real heights. Games draw the terrain by hand
  from period sources, start from a coarse DEM, or correct a modern DEM by hand against old maps [S/C, below].
- **Academic and GIS work does it automatically**, and always the same way: modern features from **vector data**
  (OpenStreetMap, national surveys), buffered by type, cut out of the DEM, the hole **refilled from the ground round
  it** by an interpolator, not a plane [S].
- **Detection belongs to vectors; the DEM only refines the outline.** The one published automatic embankment
  method grows each embankment from road and rail lines [S]; ground filters for point clouds (PMF, SMRF) treat an
  embankment as ground [S/E]; filters built for hydrology also remove sunken roads, which a period map must keep [S].
- **The fill should match the rim's slope as well as its height.** A plane or a membrane (Laplace) meets the
  ground's height at the rim but not its slope, which a lit relief shows as a crease [S/E]. A thin-plate
  (biharmonic) fill, held by two rings of rim cells, meets both, keeps a plane a plane, and solves in well under a
  second coarse to fine [S/E].
- **No height source exists for 1805 Moravia.** The Habsburg surveys draw relief in hachures, not contours [C]:
  good for dating a feature (was the pond there in 1805?), not for its heights.

## 1. How games do it

| Game | Terrain from | Modern works | Tag |
|---|---|---|---|
| Total War (battle maps) | authored tiles on the campaign map, a low-frequency height map from World Machine and the campaign's block-out | flattening under settlements, bridges, lake edges authored by hand as masks | [S] |
| Total War Saga: Thrones of Britannia | "actual terrain height data as the basis for the campaign and battle height map" | not described | [C] |
| Ultimate General: Gettysburg, Civil War | "hand-drawn", from satellite and historical maps | never enter: the artist draws only what the sources show | [S/C] |
| Scourge of War: Gettysburg | "used the DEM as our base … had to use the oldest maps to 'tune' the terrain" | by hand; fans still found "a couple of stone quarries that we had missed" | [C], [S] |
| Hell Let Loose | "real-world DEM/height data … compared with maps from the period" | by hand, method not described | [S] |
| Steel Division, Post Scriptum | 1944 aerial photographs | drawn from period images | [S] |
| Crusader Kings III | the old coarse heightmap, then erosion per tile in Gaea | none at that scale | [S] |
| Arma community terrains (PMC) | 30 m SRTM upsampled to 10 m, OSM land use and roads | blurred away by the coarse DEM | [S/E] |
| Microsoft Flight Simulator | global DEMs, photogrammetry | edits as vector shapes over an untouched DEM (below) | [S] |

- **Microsoft Flight Simulator** (Asobo, "Designing the Terrain System of Flight Simulator"): "Edition needs to be
  compatible with future DEM updates ⇒ Avoid editing original DEM data"; edits are vector data ("points, rectangles
  and polygons + heights + influence radius"), merged with the original DEM through a distance field generated on
  the GPU "for smooth fade-outs" [S]
  (https://www.asobostudio.com/files/inline-images/Designing_Terrain_System_Fuentes_Lionel.pdf). The closest
  industrial analogue of our mends: non-destructive, any polygon. Its target is an authored height per shape, not a
  surface rebuilt from the ground round it [E].
- Total War: https://gpuopen.com/learn/anatomy-total-war-engine-part/ and
  https://wiki.totalwar.com/w/Terry_-_Low_Frequency_Map [S]; Thrones of Britannia:
  https://gamewatcher.com/news/2017-11-12-the-total-war-saga-thrones-of-britannia-map-is-23x-bigger-than-total-war-attila
  [C]. Ultimate General: https://store.steampowered.com/app/306660/Ultimate_General_Gettysburg/ [S]. Scourge of
  War: https://www.norbsoftdev.net/phpBB3/viewtopic.php?p=31310 [C, extract],
  https://www.pcworld.com/article/503859/covering_the_waterfront_norbsoftdev_on_scourge_of_war_gettysburg.html [S].
  Hell Let Loose: https://devtrackers.gg/hell-let-loose/p/b9e40f81-dev-brief-mortain-weekend-pte-now-live [S].
  Steel Division: https://www.pcgamer.com/steel-division-normandy-44-is-a-realistic-ww2-rts-coming-this-year/ [S].
  Crusader Kings III, dev diary 177: https://devtrackers.gg/crusader-kings/p/3c2f2816-dev-diary-177-a-fresh-coat-of-paint
  [S]. PMC Arma terrains: https://www.pmctactical.org/arma3/pmc-poland-miroslawiec.php [S].
- Nothing found on: Grand Tactician, Field of Glory, Take Command, Holdfast, Battlefield 1, Squad, Gates of Hell,
  DCS Normandy, the Napoleon and Empire campaign maps, Paradox's other games.

**Patterns** [E]: (1) drawn by hand from period sources: no modern works, an artist per map; (2) a modern DEM
corrected by hand against old maps: what we do now; (3) a coarse DEM that blurs the works away: fine for a campaign
map, far too coarse for a 3 km battle map, and large works (reservoirs, open-cast mines) survive it; (4) a coarse
base plus procedural detail (CK3, World Machine); (5) vector edits blended by a distance field over an untouched DEM
(Flight Simulator). None is automatic and keeps lidar detail; only the GIS work below is both.

## 2. Detection

- **OSM tags** for raised and cut ways: `embankment=yes`, `cutting=*`, `man_made=embankment` [S]
  (https://wiki.openstreetmap.org/wiki/Key:embankment). No source gives their completeness; the ways themselves
  (railways, motorways) are core mapping, the embankment tag optional detail, so the way is the seed and the tag a
  bonus [E]. Areas: `landuse=quarry|landfill|reservoir|basin`, `water=reservoir|basin`, `waterway=dam`,
  `man_made=dyke|storage_tank` [S, OSM wiki].
- **Czech national data:** ZABAGED is open data under CC BY 4.0 since 1 July 2023 [S]
  (https://cuzk.gov.cz/Uvod/Produkty-a-sluzby/Otevrena-data/Otevrena-data-zakladni-informace.aspx); which
  embankment classes it carries was not checked.
- **Automatic embankment mapping** (Van Nieuwenhuizen, Lindsay, DeVries 2021, *Remote Sensing* 13(7):1308; abstract
  read): seeds from transportation network cells, region growing on road width, embankment width, height and slope;
  recall ≥ 90 % on 7 of 8 DEMs, 1.4–20.3 s per DEM; no automated technique before it [S]
  (https://api.crossref.org/works/10.3390/RS13071308). Shipped as WhiteboxTools `EmbankmentMapping`, with a
  `remove_embankments` output and a default `max_height` of 2 m [S, R wrapper docs]
  (https://search.r-project.org/CRAN/refmans/whitebox/html/wbt_embankment_mapping.html): far below a 10–15 m railway
  fill [E].
- **Ground filters are the wrong tool:** PMF and SMRF classify point clouds into ground and non-ground (buildings,
  plants) [S] (https://pdal.io/en/stable/stages/filters.pmf.html); an embankment is continuous ground within their
  slope limits [E].
- **Hydrology filters remove too much:** the TR32 Rur-catchment DEM removed embankments, railways, open-cast mines
  and **sunken roads** with a Köthe & Bock dam filter and hand correction [S]
  (https://www.tr32db.uni-koeln.de/data.php?dataID=77). Sunken roads are period features we must keep [E].
- **Czech precedent:** a ČVUT thesis (2023, supervised by T. Janata) on a pre-industrial terrain model from Czech
  lidar, removing railway bodies [C, abstract] (https://dspace.cvut.cz/handle/10467/110711). Full text not read.
- **Dating:** some works predate the battle and some 1805 features are gone (the Satschan ponds, drained later: general history, not sourced here), so
  detection is checked against a period map, not only "is it artificial" [E].

## 3. Filling

- **The Charlemagne canal recipe** (Schmidt, Werther, Zielhofer, *PLoS One* 2018), the most reusable [S]
  (https://pmc.ncbi.nlm.nih.gov/articles/PMC6033447/): modern features from survey and OSM vectors, "structure-specific
  buffers based on empirical knowledge" (railways 20 m, roads 15 m, buildings 10 m, present cadastre boundaries 7 m,
  19th-century ones 2 m); the remaining lidar points interpolated "via a multilevel B-spline"; "Finally, we smoothed
  the model with a low-pass filter". Against measured pre-modern surfaces the error fell from 0.87 m to 0.69 m.
- **Void-filling comparisons:** Reuter, Nelson, Jarvis 2007 (*IJGIS* 21(9); abstract read): kriging or IDW for
  small voids on flat ground, splines elsewhere, ANUDEM for large voids in relief [S]
  (https://research.utwente.nl/en/publications/an-evaluation-of-voidfilling-interpolation-methods-for-srtm-data/).
  The **delta surface fill** (Grohman et al. 2006): interpolate the difference to a reference DEM across the void
  and add it back [C] (NASADEM's documentation). Where no reference exists (1805 Moravia), it has nothing to add [E].
- **Membrane against thin-plate.** Pérez, Gangnet, Blake 2003 ("Poisson Image Editing"): the membrane interpolant
  gives "an unsatisfactory, blurred interpolant"; solved "using either Gauss-Seidel iteration with successive
  overrelaxation or V-cycle multigrid", "0.4 s. per system on a Pentium 4 for a disk-shaped region of 60,000
  pixels" [S] (https://www.cs.princeton.edu/courses/archive/fall14/cos526/papers/perez03.pdf). [E, standard maths]
  Any plane is harmonic and biharmonic, so both fills keep a planar rim planar; a membrane fixes only the rim's
  height, so its slope across the rim jumps, a crease in a lit relief; a biharmonic fill held by **two rings** of rim
  cells fixes height and slope. And since the membrane is linear and reproduces planes, a plane plus a membrane of
  the rim's residual is the membrane of the rim itself: fitting the plane first adds nothing.
- **IDW has flat spots:** Shepard interpolation with a power above 1 has a zero gradient at every data point [C]
  (https://www.kurims.kyoto-u.ac.jp/EMIS/journals/DRNA/pdf/dellaccioditommaso_kmfa2016.pdf). A plane plus IDW of
  the rim residual keeps planes and meets the rim's height, but flattens against it: a softer crease [E].
- **Tools:** GRASS `r.fillnulls` (regularised spline with tension by default, or bilinear/bicubic) uses an edge
  buffer of "three times the map resolution to get nominally three points around the edge", default 3 cells, and
  warns that large holes, especially at the map's boundary, cause problems [S]
  (https://grass.osgeo.org/grass-stable/manuals/r.fillnulls.html). GDAL FillNodata searches four directions with
  IDW, then smooths [S] (https://gdal.org/en/stable/programs/gdal_fillnodata.html): streaks on large holes [E]. SAGA
  "Close Gaps with Stepwise Resampling" fills coarse to fine [S]
  (https://saga-gis.sourceforge.io/saga_tool_doc/9.4.0/grid_tools_29.html).
- **Large fills need texture:** any smooth interpolant leaves a patch smoother than the ground round it; Crema et
  al. 2020 add synthetic roughness to their inpainting [C] (https://zendy.io/title/10.1002/esp.4739).
- **Reservoirs are reconstructions, not fills:** the valley under a reservoir is not described by its shore. The
  Copernicus DEM ships masks of the water it flattened [S]
  (https://developers.google.com/earth-engine/datasets/catalog/COPERNICUS_DEM_GLO30); a thin-plate fill with the
  river line through the reservoir as a falling breakline (as USGS hydro-flattening holds streams monotonic [S]) gives
  a plausible valley [E].

## 4. Historical reconstruction

- **Waterloo** (Schnurr, Kavanagh, Hill, FIG 2003): the Lion Mound's points removed, and soil added back by "a
  contour matching process from all points on the battlefield that were almost certainly original ground" [S]
  (https://www.fig.net/resources/Proceedings/fig_proceedings/fig_2003/TS_19/PP19_3_Schnurr_et_al.pdf).
- **Gettysburg** (Knowles et al. 2013): the National Elevation Dataset compared with the 1874 Corps of Engineers
  map; "the old map helped the team remove features from the landscape that were not there in 1863" [S]
  (https://science.nasa.gov/earth/earth-observatory/150th-anniversary-of-the-battle-of-gettysburg-81552). The method
  of removal is not stated.
- **Austerlitz:** no published terrain reconstruction found.
- **Old contours to heights** works where contour maps exist (DEM Ville 1893 from the Prussian survey's contours [S],
  https://b2find.eudat.eu/dataset/177770f4-9ff3-5dd7-bf6e-249be0a78fde). The Habsburg Second Military Survey
  (1806–1869) shows relief by hachures [C]; for 1805 Moravia there is no contour map to restore heights from [E].

## 5. Licences

- OSM is ODbL: credit OpenStreetMap; a derived database shares alike [S] (https://www.openstreetmap.org/copyright).
  A rendered image is usually a Produced Work [S/C]
  (https://osmfoundation.org/wiki/Licence/Community_Guidelines/Produced_Work_-_Guideline); OSM used only as a mask
  for which heights to replace, the height raster shipped, looks like one: attribute OSM, do not ship the extracted
  features as data without the ODbL [E].
- ČÚZK open data is CC BY 4.0 [S, link above]; that DMR 5G itself is named under it was not confirmed.

## 6. What fits our case

[E] throughout, from the findings above.

1. **Detection from OSM, per battle map, by a tool:** railways (also abandoned and disused), motorways and trunk
   roads with their links, quarries, landfills, reservoirs, basins, dams, dykes, storage tanks, in the map's window;
   buffered by kind (the canal paper's widths as a start, widened by an embankment's height), written as the works
   list `tools/works.ts` already reads. Hand mends stay as overrides (a former quarry OSM lacks; a feature that
   predates the battle, kept), checked once per map against the First and Second Military Surveys on Mapire.
2. **The fill: thin-plate (biharmonic) from two rings of rim cells, solved coarse to fine,** replacing the plane of
   decision 0073: it meets the rim's height and slope (no ghost), keeps a plane a plane, and needs no blend tuned by
   hand. A side with no usable ground (another work, the map's edge) holds nothing; the fill's own smoothness carries
   it. GRASS `r.fillnulls` as an offline reference to compare against. A light matched roughness inside wide fills.
3. **Reservoirs and big pits** (rare on a battle map): the same fill with the stream's line as a falling breakline.
4. **The campaign map** (100–250 m): embankments are below a cell; drop reservoirs (OSM, the Copernicus masks) and
   fill their valleys the same way.

Not done here: reading the ČVUT thesis and Van Nieuwenhuizen's full text; measuring a thin-plate fill on the
Austerlitz works.
