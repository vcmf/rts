---
status: research
last_reviewed: 2026-10-26
---

# Period maps for battle tracing and the theatre layer

Which scans of maps from about 1800–1815 can an author trace under a battle map (2–6 km square,
Austerlitz first, then Wagram, Eylau, Borodino, Jena, Friedland, Leipzig, Waterloo), and which
vector and terrain datasets can carry a later strategic layer over Europe? For each source: coverage,
date, scale, access, georeferencing, and whether the licence allows (a) tracing features into our
own data in a game that may be sold, and (b) committing the scan itself to a public git repository.

Date: 2026-10-26, by a research agent

Tags:

| Tag | Meaning |
|---|---|
| [S] | Sourced: the linked page states it. "(extract)" means the page blocked direct reading and the claim was read from a search engine's extract of that page. |
| [C] | Community or secondary source (Wikipedia, Wikimedia Commons descriptions, forum posts, catalogues of third parties). |
| [E] | Estimate or inference by this note's author, with the reasoning given. |
| [M] | Measured here: a request was made to the service and the result inspected. |

Not legal advice. Licence readings below are a developer's reading of the texts, to decide what to
ask a lawyer, not a substitute for one.

## Summary

- No single period source covers all eight battles at a usable scale with one style and a clean
  licence. Reymann's map comes closest in coverage but is at 1:200,000 and stops east of Grodno, so
  it does not reach Borodino [S][C]. At 1:200,000 a 4 km battlefield is 2 cm of paper [E].
- The best per-battle sources are older and larger in scale: the Habsburg First Military Survey
  (1:28,800) for Austerlitz and Wagram, the Saxon Meilenblätter (1:12,000, 1780–1806) for Leipzig,
  Lützen, Bautzen and Dresden, Schroetter's map of Prussia (1796–1802 survey) for Eylau and
  Friedland, Ferraris (1:11,520, 1771–1778) for Waterloo, Schubert's 1860 map of Moscow
  governorate (1:84,000) for Borodino. Jena has no large-scale period source verified here.
- Tracing (a) is safe for all of them in substance: the maps themselves are long out of copyright,
  and EU law (Art. 14 of Directive 2019/790; in Germany § 68 UrhG) says faithful reproductions of
  public-domain visual works get no copyright or related right [S]. The risks are contractual
  (website terms you accept when you download) and, for some services, unclear terms.
- Redistribution (b) is clean only for copies on Wikimedia Commons marked public domain, and even
  there the Reymann copies were uploaded from the David Rumsey collection, whose own terms are
  CC BY-NC-SA 3.0 (non-commercial) [S]. Every other service either states a non-commercial or
  restricted licence, watermarks its tiles, or states no licence at all.
- Theatre layer: Natural Earth (public domain), Copernicus DEM GLO-30 (free, commercial use, fixed
  attribution text), GMTED2010 (public domain) and Wikidata (CC0) are usable commercially [S].
  Historical borders are the weak point: Euratlas forbids distributing its vectors under the simple
  licence, CShapes and HGIS Germany are non-commercial, aourednik's set is GPL-3.0 with unclear
  provenance, HistoGIS is CC BY 4.0 but starts in 1815 and mixes in OpenStreetMap data.

## 1. Period map sources for battle-level tracing

### 1.1 Copyright background (applies to every scan below)

- Directive (EU) 2019/790, Art. 14: when protection of a work of visual art has expired, material
  resulting from its reproduction is not subject to copyright or related rights unless it is
  original [S] ([legislation.gov.uk copy](https://www.legislation.gov.uk/eudr/2019/790/article/14)).
- Germany implemented this as § 68 UrhG: "Vervielfältigungen gemeinfreier visueller Werke werden
  nicht durch verwandte Schutzrechte nach den Teilen 2 und 3 geschützt." [S]
  ([gesetze-im-internet.de](https://www.gesetze-im-internet.de/urhg/__68.html)).
- Whether maps count as "works of visual art" is debated; the European Copyright Society asked
  whether the term should include maps [C] ([Kluwer Copyright Blog summary](https://legalblogs.wolterskluwer.com/copyright-blog/the-new-copyright-directive-article-14-or-when-the-public-domain-enters-the-new-copyright-directive/), extract).
- Wikimedia Commons treats faithful scans of 2D public-domain works as public domain ("PD-Art")
  [C]. The French BnF still claims ownership of Gallica reproductions under public property law and
  charges for commercial reuse [S, extract]
  ([analysis of Gallica terms](https://linuxfr.org/users/pamputt/journaux/conditions-d-utilisation-des-contenus-de-gallica)).
- Consequence [E]: the copyright question for 1770–1860 maps is settled in our favour in the EU and
  the US; what remains is (1) terms of use you accept on a site ("By downloading any images from this
  site, you agree to the terms of that license" on David Rumsey [S]), (2) possible database rights
  in georeferenced mosaics, and (3) watermarks. Tracing roads and villages (facts) is the lowest-risk
  use. Committing a scan copied from a site with NC terms is the highest-risk use.

### 1.2 Reymann's Topographische Special-Karte (Central Europe, 1:200,000)

- Founded by D. G. Reymann; first sections (Rügen, Stralsund, Anclam) published by 1806 [C]
  ([de.wikipedia](https://de.wikipedia.org/wiki/Geographischer_Specialatlas_von_Deutschland_und_den_Nachbarl%C3%A4ndern_im_Ma%C3%9Fstabe_von_1_:_200.000)).
  Only 152 sheets existed by 1844, when C. Flemming (Glogau) took it over; continued by the General
  Staff to 1908 [S, extract] ([Spektrum lexicon](https://www.spektrum.de/lexikon/geowissenschaften/reymannsche-karte/13576)).
- Extended in 1844 "from Grodno to Paris", from 342 to 462 and finally 529 sections, each 34 × 23 cm
  [C] (de.wikipedia, above).
- **Dates per sheet are mostly 1830s–1880s, not 1806–1815** [S]: the Rumsey set (348 sheets) is
  "dated variously from 1822 to 1880" ([Commons file description copying Rumsey](https://commons.wikimedia.org/wiki/File:Topgraphischen_Special_Karte_von_Deutschland_(10605124).jpg)).
  The 1838 index sheet marks published sheets in colour; Brünn (227) and Wien (278) were not yet
  coloured in 1838 [M] ([index on Commons](https://commons.wikimedia.org/wiki/File:Topographische_Spezial_Karte_Deutschland_%C3%9Cbersicht.jpg)).
  The Lithuanian sheets on Commons (Kowno, Grodno) are dated 1875 [C]. So the map shows the
  landscape of roughly 1830–1880, with railways on later sheets [E].
- **Coverage** [M] from the 1838 index: west to Amiens, Paris and Sens; east to Memel, Kowno,
  Grodno, Lublin, Lemberg; south to Vienna, Pressburg, Graz, Agram, Trieste. Battle sheets read off
  the index: 227 Brünn (Austerlitz), 263 Korneuburg and 278 Wien (Wagram), 146 Jena, 128 Leipzig,
  7 Königsberg and K Allenburg (Eylau, Friedland), 138 Brüssel (Waterloo; neighbouring sheet
  unverified). **Borodino (about 35.8° E) is far outside; the eastern edge is about 24° E** [M].
- Scale versus need [E]: at 1:200,000, a 4 km field is 20 mm of paper; a 600 dpi scan gives about
  470 px across it. Good for road network and village positions, too coarse for woods, ponds and
  field edges. It is outside the requested 1:25k–1:150k range.
- **Access and licences:**
  - Wikimedia Commons: 396 files in [Category:Topgraphische Special Karte von Deutschland](https://commons.wikimedia.org/wiki/Category:Topgraphische_Special_Karte_von_Deutschland)
    [M], mostly the Rumsey set, tagged `{{PD-Art|PD-old-100-expired}}` [S]. Plain JPEG, not
    georeferenced. (a) yes; (b) yes by Commons' reading, with the Rumsey caveat below.
  - David Rumsey Map Collection (Stanford): "Images may be reproduced or transmitted, but not for
    commercial use … By downloading any images from this site, you agree to the terms of that
    license"; licence CC BY-NC-SA 3.0 [S] ([Stanford PURL record of a Rumsey item](https://purl.stanford.edu/zy955dh0497.mods)).
    **NC.** (a) tracing facts is low risk, but downloading from Rumsey binds you to NC terms by
    contract [E]; (b) no from Rumsey directly.
  - Universitätsbibliothek Trier (dilibri): CC BY-NC-SA 3.0 [S, extract] ([dilibri](https://www.dilibri.de/ubtr/content/titleinfo/2005496)). **NC.**
  - Niedersachsen Kulturerbe sheet: CC BY-NC 4.0 [S, extract] ([record](https://kulturerbe.niedersachsen.de/objekt/isil_DE-84_digibib_00002568/27/-/)). **NC.**
  - Halle University (1868 sheet): CC BY 4.0 [S, extract] ([record](https://opendata.uni-halle.de/handle/1981185920/113937)). Usable.
  - Hungaricana (232 images): "any publication … requires permission from the content provider"
    [S, extract] ([record](https://maps.hungaricana.hu/en/HTITerkeptar/21401)).
  - Max Kade Institute (Wisconsin): PDFs, incomplete, no licence stated [S]
    ([page](https://mki.wisc.edu/genealogy/mki-resources-for-genealogists/historical-maps-of-central-europe-g-d-reymanns-special-karte-1832-1870/)).
  - **SLUB Kartenforum does not hold Reymann**: a search of its index for "Reymann" returns 0 of
    9,068 records [M]. No georeferenced Reymann mosaic was found anywhere (unverified that none exists).

### 1.3 Habsburg military surveys and the stable cadastre (Moravia, Austria)

- First (Josephine) survey: 1:28,800, about 4,000 sheets, 1763–1785; Moravia 1764–1768,
  Lower Austria 1773–1781 [C] ([de.wikipedia](https://de.wikipedia.org/wiki/Josephinische_Landesaufnahme));
  Czech sources add a rectification 1780–1783 [C] ([Chartae Antiquae](https://chartae-antiquae.cz/en/mapsets/)).
- Second (Franciscan) survey: 1:28,800, 1806–1869, Cassini-Soldner on the Zach ellipsoid, with
  Moravia and Lower Austria on the St. Stephan system [C] ([cs.wikipedia](https://cs.wikipedia.org/wiki/Druh%C3%A9_vojensk%C3%A9_mapov%C3%A1n%C3%AD)).
  Arcanum lists Moravia 1836–1842 and Lower and Upper Austria 1819–1869 [S, extract]
  ([Arcanum geoname page](https://maps.arcanum.com/en/geoname/czechia/adamov-3079841/),
  [Austria](https://maps.arcanum.com/ro/map/secondsurvey-austria/)); Czech sources say 1836–1852 [C].
- For Austerlitz (1805) the first survey is closer in time; the second is 30+ years later [E].
- **Arcanum Maps (formerly Mapire)**: georeferenced mosaics, WMTS for desktop GIS, "Full access to
  maps requires subscription", raw scans sold per sheet [S, extract]
  ([Styria page](https://maps.arcanum.com/en/map/secondsurvey-styria/)). Accuracy of the second
  survey: "maximum error of about 200 meters" in most parts [S, extract]
  ([Molnár et al.](https://www.arcanum.com/media/uploads/mapire/pub/1survey_molnar_et_al.pdf)).
  **Terms of use: unverified** (mapire.eu and maps.arcanum.com returned 403 to every request).
- **Austrian State Archives (Kriegsarchiv)** holds the originals. Its page says digital copies are
  bought through Arcanum, and publication needed a fee-paying permission [S, extract]
  ([ÖStA](https://www.statearchives.gv.at/tasks-and-organisation/kriegsarchiv-information-in-brief/tips-for-researchers1/Researching-in-the-Kriegsarchiv/I-am-interested-in-maps-produced-during-the-First-17641787-or-Second-1806-1869-Military-Survey.html)).
  New: "As of 1 September 2026 reproductions of archival material" may be published at no charge
  under "Creative Commons CC BY-ND" (version not given), citing the Archivsignatur and sending a
  deposit copy [S] ([ÖStA publication page](https://www.statearchives.gv.at/tasks-and-organisation/kriegsarchiv-information-in-brief/tips-for-researchers1/Researching-in-the-Kriegsarchiv/I-wish-to-publish-reproductions-of-archival-material-in-print-display-them-in-an-exhibition-or-publish-them-online.html)).
  CC BY-ND allows commercial use but not sharing adapted material [E]; a reprojected or cropped
  tile set is probably "adapted" [E]. Whether this replaces Arcanum's own terms for scans bought
  from Arcanum is unverified.
- **Chartae Antiquae (VÚGTK and Historical Institute, Czech Academy of Sciences)**: free WMS and
  TMS layers of the first survey, second survey (1:28,800 and 1:144,000), Schroetter's Prussia and
  others, in EPSG:3857, 4326, 3035, 32633 and more [S][M]
  ([layer list](https://chartae-antiquae.cz/en/mapsets/layers/)). Coverage "Bohemia and Moravia"
  only [S]. Test requests [M]: the **first survey covers the whole Austerlitz field**; the
  **second survey layer has a gap over most of it**. Tiles carry a "VÚGTK, v.v.i." watermark [M].
  No licence text; footer "© VÚGTK, v.v.i. & HÚ AV ČR, v.v.i." [S]. (a) tracing facts: low risk
  [E]; (b) no (watermark, no licence).
- **oldmaps.geolab.cz** (UJEP): digital archive of the first to third surveys [S]
  ([GEOLAB](http://oldmaps.geolab.cz/)). Licence not stated; an old CENIA reply quoted on the OSM
  list called the public map services free for non-commercial use [C]
  ([talk-cz 2007](https://lists.openstreetmap.org/pipermail/talk-cz/2007-December/000515.html)).
  **Treat as NC / unverified.**
- **Stable cadastre (Czech lands)**: held by ČÚZK's central archive; scans cost 25 CZK each; ČÚZK
  open data is CC BY 4.0 but "Archiválie nejsou otevřená data" (archive items are not open data)
  [S, extract] ([ČÚZK talk, 2023](https://storm.fsv.cvut.cz/data/files/Konference/GISday/2023_GISday_prednasky/02_CUZK_petr_dvoracek.pdf)).
  Exact survey years near Austerlitz: unverified.
- Wikimedia Commons has only fragments of the Moravian survey sheets (13 files for Moravia) [M],
  some sourced to the ÖStA Kriegsarchiv and tagged PD-old-100 [S]. Not enough to cover the field.

### 1.4 Saxon Meilenblätter and SLUB Kartenforum (Leipzig, Lützen, Bautzen, Dresden)

- Survey of Electoral Saxony 1780–1806 under F. L. Aster, 1:12,000, three copies (Berlin, Dresden,
  Freiberg) [C] ([Commons category](https://commons.wikimedia.org/wiki/Category:Meilenbl%C3%A4tter)).
- **Kartenforum (SLUB Dresden)** holds 9,068 records, 369 of them Meilenblätter (type `mb`) [M],
  via its search index (`search.kartenforum.slub-dresden.de/vk20`). Each record has a WMS, a WCS,
  a GeoTIFF download (WCS GetCoverage in **EPSG:4326**), and TMS tiles [M], for example
  `https://wcs.kartenforum.slub-dresden.de/map/10009415?...&FORMAT=GEOTIFF`. Georeferencing is
  crowdsourced from control points (affine recommended for topographic maps, thin-plate spline for
  older ones) [S] ([help page](https://kartenforum.slub-dresden.de/hilfe)). Error figures: none
  published (unverified).
- Battle hits [M] (records dated before 1870 whose footprint contains the point): Leipzig and
  Lützen have Meilenblätter (1802, 1806) plus "Leipzig und Umgebung" 1828 (1:8,000); Bautzen and
  Dresden have Meilenblätter (1805, 1785). Jena and Auerstedt only return 18th-century small-scale
  maps, a "Jena bis Leipzig" sheet of 1846 at 1:25,000 (type code `gl`, meaning unverified) and a
  mosaic layer whose footprint may be a bounding box (unverified).
- **Licence**: no licence on the Kartenforum pages read [M]; the Deutsche Fotothek record page
  sat behind a bot check (unverified). Other SLUB digitisations carry the Public Domain Mark 1.0
  [S] ([DDB record](https://www.deutsche-digitale-bibliothek.de/item/2P66I7URLRI2FNLAJGSD7EUN36XXCK7P)).
  Commons copies of the Berlin set (from the Fotothek) are tagged `{{PD-old-100-1923}}` and carry
  sheet corner coordinates [S] ([sheet 1](https://commons.wikimedia.org/wiki/File:Meilenblatt_B_1_Merseburg.jpg)).
  (a) yes; (b) yes for the Commons copies; § 68 UrhG supports this for the SLUB originals [S][E].

### 1.5 Schroetter's map of Prussia (Eylau, Friedland)

- Survey 1796–1802 at 1:50,000 in 145 manuscript sheets, published reduced in 25 sheets
  (about 1:150,000), dated 1802–1812 [S, extract] ([RCIN record](https://rcin.org.pl/dlibra/show-content/publication/edition/829?id=829)).
  RCIN marks it Public Domain [S, extract].
- Chartae Antiquae serves it georeferenced as "Karte von Alt-Preussen 1809" (WMS/TMS) [S]; a test
  request shows Eylau and Friedland with roads, woods and rivers, watermarked [M].
- This is the only source found that is **contemporary** with Eylau and Friedland (1807) [E].
  (a) yes; (b) yes from RCIN if its PD statement holds; not from the watermarked tiles.

### 1.6 Ferraris map (Waterloo)

- Kabinetskaart of the Austrian Netherlands, 1771–1778, 1:11,520 [S]
  ([Flemish metadata](https://metadata.vlaanderen.be/srv/api/records/2d7382ea-d25c-4fe5-9196-b7ebf2dbe352)).
- Flanders (Digitaal Vlaanderen and KBR): WMS/WMTS, georeferenced to the GRB in 2013, revised 2023,
  Belgian Lambert 72 (EPSG:31370), **Flanders only**; "De gegevens zijn beschermd door het
  auteursrecht"; licence "Gebruik van geografische gegevens voor publieke taken door deelnemers
  GDI-Vlaanderen" [S]. **Public-task use only: not usable commercially.** Waterloo is in Wallonia.
- Wallonia (SPW): ArcGIS map service `CARTES_ANCIENNES/FERRARIS`, about 95 % of Wallonia, EPSG:31370,
  copyright SPW [S, extract] ([service](https://geoservices.wallonie.be/arcgis/rest/services/CARTES_ANCIENNES/FERRARIS/MapServer)).
  SPW's general view-service terms defer to each dataset's conditions [S, extract]
  ([LicServicesSPW.pdf](https://geoportail.wallonie.be/files/documents/ConditionsSPW/LicServicesSPW.pdf)).
  Ferraris-specific terms: unverified.
- Wikimedia Commons: full sheets from NGI/KBR (`ngi.be/FerrarisKBR`), tagged
  `{{PD-Art|PD-old-auto-expired}}` [S] ([example](https://commons.wikimedia.org/wiki/File:1_-_Lombarzyde_-_Lombardsijde_Nieuwpoort.jpg)).
  Not georeferenced. (a) yes; (b) yes.

### 1.7 Schubert maps (Borodino, western Russia, Lithuania, Belarus)

- Commons hosts many 3-verst (1:126,000) sheets in a row/column index covering Courland, Livonia,
  Kovno, Vilno, Grodno, Minsk, Mogilev, Smolensk, Kaluga, Moscow (edge) and more [S]
  ([template](https://commons.wikimedia.org/wiki/Template:Shubert_3v)); sample sheets are tagged
  `{{PD-old}}` or `{{PD-RusEmpire}}` [S]. Sheet dates on Commons range up to 1915 reprints [S].
- Moscow governorate, printed 1860, "2 versta in inch" (1:84,000), 34 sheets on Commons, tagged
  `{{PD-RusEmpire}}` [S] ([category](https://commons.wikimedia.org/wiki/Category:Shubert%27s_maps_of_Moscow_Governorate_(1-84000))).
  Which sheet holds Borodino: probably column 1 (western edge) [E], unverified.
- Not georeferenced on Commons. A georeferenced Schubert tile service with a stated licence was
  not found (unverified that none exists). (a) yes; (b) yes for Commons copies; the Commons
  sources are Russian forums and hobby sites [S], so provenance is weak but the works are PD [E].

### 1.8 Other sources checked

- **Wikimedia Commons** generally: the cleanest source for (b), but coverage is patchy and nothing
  is georeferenced except via sheet-corner metadata on some sets [M].
- **David Rumsey**: see 1.2. NC terms on everything downloaded from it [S].
- **Library of Congress**: "not aware of any U.S. copyright protection … or any other restrictions"
  for maps published before 1922 [S, extract] ([LoC rights page](https://www.loc.gov/item/90680842/)).
  Relevant holdings for these battlefields: unverified.
- **Gallica (BnF)**: non-commercial reuse free; commercial reuse "payante et fait l'objet d'une
  licence" [S, extract]. **Commercial use needs a paid licence.** Cassini (1:86,400, 1756–1815)
  is also on Commons in 705 files [M] and as a Chartae Antiquae WMS [S]. Not needed for the listed
  battles.
- **Polona (Polish National Library)**: terms not readable (unverified).
- **Old Maps Online**: a search portal over other holders' maps; licence is each holder's [C].
- **Prussian Urmesstischblätter (1:25,000, from the 1820s)**: Commons copies from the Staatsbibliothek
  zu Berlin are tagged PD-Art [C, extract]
  ([OSM wiki file](https://wiki.openstreetmap.org/wiki/File:Urmesstischblatt_3446_(Berlin_Nord)_um_1840.jpg)).
  Coverage for Jena, Eylau and Friedland and a georeferenced service: unverified. Worth checking
  for Jena if Reymann is too coarse.
- **Dépôt de la guerre maps of the Napoleonic period** (e.g. maps of Swabia or Westphalia): not
  checked in depth (unverified).

### 1.9 Comparison table

| Source | Coverage (battles) | Date shown | Scale | Access | Georeferenced | (a) tracing | (b) commit scan |
|---|---|---|---|---|---|---|---|
| Reymann, Commons copies (from Rumsey) | Austerlitz, Wagram, Jena, Leipzig, Eylau, Friedland, Waterloo; not Borodino | 1822–1880 per sheet | 1:200,000 | JPEG | No | Yes [S] | Commons says PD; Rumsey says NC [S] |
| Reymann, Rumsey / Trier / Niedersachsen | as above | as above | 1:200,000 | IIIF-like viewers, JPEG | No | Contract NC [S] | **No (NC)** |
| Habsburg 1st survey, Arcanum | Austerlitz, Wagram | 1764–1768 (Mor.), 1773–1781 (L. Austria) | 1:28,800 | WMTS (subscription), raw scans for sale | Yes (mosaics) | Terms unverified | No / unverified |
| Habsburg 1st and 2nd survey, Chartae Antiquae | Austerlitz (1st full, 2nd gap) | 1764–1783; 1836–1852 | 1:28,800 | WMS, TMS | Yes, many CRS | Low risk [E]; no licence | **No** (watermark) |
| Habsburg surveys, ÖStA direct | Austerlitz, Wagram | as above | 1:28,800 | Order copies | No | Yes | CC BY-ND from 2026-09-01 [S]; adapted copies not allowed [E] |
| Meilenblätter, SLUB Kartenforum | Leipzig, Lützen, Bautzen, Dresden | 1780–1806 | 1:12,000 | WMS, WCS GeoTIFF, TMS | Yes, EPSG:4326 | Yes [S] | Licence not shown; § 68 UrhG [S] |
| Meilenblätter, Commons | same | same | 1:12,000 | JPEG + corner coords | Partly (metadata) | Yes | **Yes** (PD) [S] |
| Schroetter, RCIN / Chartae Antiquae | Eylau, Friedland | 1796–1802 survey, pub. 1802–1812 | ~1:150,000 | Scans; WMS/TMS | Yes (VÚGTK) | Yes | Yes from RCIN (PD) [S, extract]; no from VÚGTK |
| Ferraris, Commons (NGI/KBR) | Waterloo | 1771–1778 | 1:11,520 | JPEG | No | Yes | **Yes** (PD-Art) [S] |
| Ferraris, Flanders WMS | Flanders only | same | same | WMS/WMTS | Yes, EPSG:31370 | **No** (public tasks only) [S] | **No** |
| Ferraris, Wallonia SPW | Waterloo | 1770–1778 | same | ArcGIS/WMS | Yes, EPSG:31370 | Unverified | Unverified |
| Schubert, Commons | Borodino, Lithuania, Belarus | 1860 (Moscow), others to 1915 | 1:84,000; 1:126,000 | JPEG | No | Yes | **Yes** (PD) [S] |
| Gallica (BnF) | France mainly | various | various | IIIF | No | Commercial licence needed [S, extract] | No |
| Library of Congress | unverified | various | various | IIIF, TIFF | Some | Yes [S, extract] | Yes [S, extract] |

## 2. One source (or pair) for all battles

- **Reymann is not the answer on its own.** It reaches every battle except Borodino [M], but it
  is 1:200,000, its sheets date from 1822 to 1880 rather than 1806–1815 [S], and the only
  redistributable full set is the Commons upload of the Rumsey scans, which Stanford publishes
  under NC terms [S]. No georeferenced mosaic of it was found.
- **There is no single consistent source.** The pragmatic pair is:
  1. **Per-battle large-scale period survey** as the tracing guide: Habsburg 1st survey
     (Austerlitz, Wagram), Meilenblätter (Leipzig and the 1813 Saxon battles), Schroetter
     (Eylau, Friedland), Ferraris (Waterloo), Schubert 1860 (Borodino), and for Jena either
     Reymann 146 or a Prussian or Saxon-Weimar survey still to be found.
  2. **Reymann** as a uniform small-scale context map for the area around each field (roads,
     villages, river courses) and for the strategic layer in central Europe.
- Licence-wise, the cleanest per-battle set is the Commons copies (Meilenblätter, Ferraris,
  Schubert, Reymann) plus RCIN for Schroetter. **Austerlitz is the hard case**: the best map (first
  survey) is only available watermarked (VÚGTK), behind a subscription (Arcanum), or from ÖStA
  under the new CC BY-ND terms. For tracing only, any of them works [E]; for committing a scan,
  ordering the sheets from ÖStA and keeping them unmodified is the only clean route found [E].

## 3. Theatre layer datasets

| Dataset | What | Period | Licence | Commercial use |
|---|---|---|---|---|
| [Natural Earth](https://www.naturalearthdata.com/about/terms-of-use/) | Coasts, rivers, lakes, relief | Modern | "in the public domain"; "personal, educational, and commercial purposes" [S] | Yes |
| [Copernicus DEM GLO-30](https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/Data/DEM/resources/license/License-COPDEM-30.pdf) | 30 m elevation, global | Modern | Free; reproduction, distribution, adaptation granted; fixed notice "produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 …" plus a no-liability sentence; must pass the obligations on [S] | Yes, with notices |
| EU-DEM | 25 m Europe | Modern | Obsolete; replaced by Copernicus DEM [S, extract] ([EEA](https://sdi.eea.europa.eu/catalogue/copernicus/api/records/19cff95e-61ac-45ed-8ee3-c43220d709cf)) | Use Copernicus DEM |
| GMTED2010 (USGS) | 7.5″–30″ elevation | Modern | Public domain, "may be used without restriction" [S, extract] ([Earth Engine catalogue](https://developers.google.com/earth-engine/datasets/catalog/USGS_GMTED2010_FULL)) | Yes |
| [HydroRIVERS / HydroSHEDS](https://www.hydrosheds.org/products/hydrorivers) | River network, 15″ | Modern | "freely available for scientific, educational and commercial use" under the HydroSHEDS licence [S]; one catalogue says CC BY 4.0, an older one says NC [C] | Yes per site; exact text unverified |
| [Wikidata](https://www.wikidata.org/wiki/Wikidata:Copyright) | Town coordinates, names | Any | "All structured data … is available under the … CC0 License" [S] | Yes |
| [aourednik historical-basemaps](https://github.com/aourednik/historical-basemaps) | World borders, snapshots 1783, 1800, 1815 | 1800, 1815 | GPL-3.0 [S]; "collected, adapted and converted from diverse sources, sometimes only available through the wayback machine" [S] | Copyleft on data and unclear provenance: **avoid shipping** [E] |
| [Euratlas 1800](https://euratlas.com/shop/1_gis_1800.html) | States, provinces, cities, rivers, mountains | 1800 (not 1805–1815) | Simple €150, extended €600 [S]; simple licence: "in no case the vector data themselves" may be disseminated, single computer [S] ([licence PDF](https://www.euratlas.net/shop/licences/licence_gis_gb.pdf)) | **Not without a bespoke deal** (a game ships vectors) |
| CShapes 2.0 | State borders | 1886–2019 | CC BY-NC 4.0 or BY-NC-SA 4.0 (records conflict) [S, extract] | **No (NC)**, wrong period |
| [HistoGIS](https://histogis.acdh.oeaw.ac.at/) | Borders and admin units, Europe, focus central Europe | c. 1815–1919 (plus 1792 imperial circles, 1800 Tyrol) | CC BY 4.0 per ARCHE records [S, extract]; sources include OpenStreetMap and Mosaic data [S] | Probably yes with attribution; check ODbL chain [E] |
| HGIS Germany (IEG, i3mainz) | German states, districts | 1820 onwards | "freely distributed for non-commercial academic research purposes" [S, extract] ([NYU metadata](https://geo.nyu.edu/catalog/harvard-ghgis1820core/metadata)) | **No (NC)** |
| MPIDR / Mosaic historical GIS | Admin boundaries | 1871+ (Germany), 1910 (Austria-Hungary) | Non-commercial scientific use, registration [S, extract] ([Mosaic](https://mosaic.ipums.org/historical-gis-datafiles)) | **No (NC)** |
| [Viabundus](https://zenodo.org/records/16611998) | Roads, towns, tolls, northern Europe | 1350–1650 | CC BY 4.0 on Zenodo [M]; project site says CC BY-SA [C] | Yes; wrong period, use as a hint only |

Notes [E]:

- Modern hydrography is not the 1800 river network. The Upper Rhine was straightened after 1817,
  and many marshes and ponds were drained later. Use modern rivers for position, period maps for
  course where they differ.
- No open, commercially usable vector set of 1805–1815 borders was found. Borders changed almost
  yearly in that period (1806, 1807, 1809, 1810, 1812, 1815). Drawing our own provinces from
  public-domain period maps is likely needed anyway; HistoGIS 1815 can check the end state.

## 4. Recommendation

### 4.1 What to use

- **Battle tracing**: one large-scale period survey per battle as listed in section 2, with
  Reymann as context. Prefer copies whose source states public domain (Commons, RCIN, ÖStA under
  CC BY-ND for unmodified copies). Use georeferenced services (Kartenforum, Chartae Antiquae,
  Arcanum) to get control points quickly, without committing their tiles.
- **Theatre layer**: Copernicus DEM GLO-30 or GMTED2010 for relief, Natural Earth for coasts,
  lakes and rivers, HydroRIVERS if a denser network is needed (check its licence text first),
  Wikidata for towns. Draw borders and regions ourselves from public-domain period maps; use
  HistoGIS (CC BY 4.0) as a reference for 1815.
- **Do not ship or commit**: anything from David Rumsey, Trier, Niedersachsen, Gallica,
  Hungaricana, Flanders Ferraris WMS, VÚGTK tiles, Euratlas vectors, CShapes, HGIS Germany,
  Mosaic. Tracing facts from them is lower risk but still binds you to their site terms [E].

### 4.2 How to place the scans

Two ways:

1. **Georeferenced source in a known CRS, reprojected.** Take a GeoTIFF (Kartenforum, EPSG:4326)
   or WMS tiles (Chartae Antiquae, EPSG:4326 or 3857) and warp them with GDAL into the map's local
   transverse Mercator (`+proj=tmerc +lat_0=… +lon_0=… +k=1 +x_0=0 +y_0=0 +ellps=GRS80`).
   - For: fast, no manual work, consistent across sheets.
   - Against: error is the source's, not ours. Arcanum states up to about 200 m for the second
     survey [S, extract]; on a 4 km map that is 5 %, enough to put a stream on the wrong side of
     a DEM valley [E]. Kartenforum publishes no error figure. Many services cannot be committed.
2. **Hand-matched control points in our editor.** The author clicks pairs: a point on the scan and
   the same place on the DEM hillshade or a modern reference (church, bridge, crossroads, stream
   junction). Fit an affine transform (3+ points) or a 2nd-order polynomial (6+ points); use a
   thin-plate spline only with many points, since it hides bad points [E]. Show residuals in metres.
   - For: aligns the scan to *our* DEM, which is what matters in game; works for plain JPEGs from
     Commons; the control points are tiny data we can commit even when the scan cannot be.
   - Against: manual work, maybe 10–20 points per sheet [E]; needs features that survive from 1800
     to today (churches, river junctions, old roads).

At 2–6 km, the map projection of the old sheet (Cassini-Soldner, a trapezoid sheet, or unknown) is
absorbed by an affine or low-order fit; the local transverse Mercator adds no measurable distortion
at that size [E].

**Recommended** [E]: use (1) to bootstrap and (2) to finish. Pull a georeferenced copy when one
exists, reproject it to local TM, take its implied positions as the first control points, then let
the author adjust them against the DEM and modern features. Store per map: the scan's source URL,
a hash, its licence tag, and the control points. Commit the scan only when its source states public
domain or a licence that allows redistribution; otherwise the editor loads it from a local, git-ignored
folder (as the repo already does for asset packs in `assets/`).

## Open questions

- Arcanum Maps terms of use (mapire.eu and maps.arcanum.com blocked automated reading).
- Whether the ÖStA CC BY-ND terms apply to sheets bought through Arcanum, and which CC version.
- A large-scale period source for Jena and Auerstedt (Prussian or Weimar surveys; Reymann 146 at
  1:200,000 is the fallback).
- The Schubert 1860 sheet that contains Borodino, and whether a Russian archive offers it
  georeferenced with a stated licence.
- Wallonia SPW's conditions for the Ferraris layer (Metawal record not read).
- The exact HydroSHEDS licence text and the HistoGIS licence chain (OpenStreetMap ODbL input).
- Whether "works of visual art" in Art. 14 covers maps in the member states that matter (debated).
