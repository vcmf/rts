---
status: active
last_reviewed: 2026-10-27
---

# Plan: M8, Austerlitz drawn on the editor

Track M, on `epic/map-engine` (decision 0020). Phase M8 of `docs/proposals/map-engine.md` §10, step 4 of
`docs/plans/active/one-map-austerlitz.md`: a 6 km designed map after Austerlitz 1805 (decision 0061), drawn with the
editor (M7, `docs/plans/done/m7-editor.md`) from the real relief (M5) and a period map (decision 0069). Several PRs
into the epic; this plan details each as it starts.

## The owner's choices (2026-10-27)

- **The field as a scale model at 2×** (decision 0070), not pieces moved closer: 12 km of the field in 6 km, its
  heights halved with it, so slopes and sight are the field's. The window 0.5 km south of the crop's centre, from the
  highway in the north to Satschan in the south. Chosen over 1.5× from side-by-side screenshots.
- **Claude drafts, the owner checks:** each PR comes with screenshots against the period map; the owner corrects or
  edits in the page.

## The split

| PR | What | Acceptance |
|---|---|---|
| **M8a** | The relief as a scale model (`scale` on `relief.dem`); the heightfield re-imported over the whole field (15 × 15 km); the First Military Survey fetched over it and placed at dated landmarks | The map validates and compiles; a scale model's slopes are its file's; the scan placed at its landmarks, its own error stated |
| **M8b** | Water: the Goldbach, the Littawa and their brooks, from the relief where the survey shows water; the ponds of 1805 | Each stream in its valley, each pond on its stream; the map compiles in seconds |
| **M8c** | Ways: the highway, the period roads and tracks; modern works levelled (the motorway, railway embankments, quarries) | Each road where the period map has it, against the relief |
| **M8d** | Villages: Pratze, Sokolnitz, Telnitz, Kobelnitz, Puntowitz, Blasowitz, Šlapanice, Aujezd, Satschan and the rest, as street villages along their roads, a church each | Each village on its site; houses clear of water and roads |
| **M8e** | Woods, fields, marsh, vineyards, as the survey shows them | The ground's kinds as the period map shows them, checked by the owner |
| **M8f** | Zones for the scenario, and the owner's check of the whole | The map validates and reads as the field (the proposal's acceptance) |

## M8a in detail

- `scale` (1 to 4) on a `relief.dem` piece (decision 0070): a map point reads its file at k times plus its shift, its
  height above the datum the file's divided by k. One placement (`demPlace`, `toFile`, `toMap` in `src/map/dem.ts`)
  read by apply, the file checks (the piece's box in its file, its heights divided by k), and the scan (its pieces,
  its markers, the GPU's shader).
- `maps/austerlitz.rdem` re-imported: 15 × 15 km at 5 m (3001 × 3001 nodes, 18 MB, heights 182–331 m), centred on
  49.1325 N 16.745 E, from Bosenitz in the north to the Menitz pond in the south. `maps/dem-test.map.json` reads the
  same file: its pieces' shifts are moved into the new frame (the old centre 583.99 m west and 1612.55 m south of the
  new one), so they read the same ground.
- Austerlitz's one piece at 2×, shift (0, −500): the map reads the file from 6.5 km south to 5.5 km north of its
  centre.
- The scan re-fetched over the same 15 km (`tools/scan-wms.ts`, 4096 × 4090 px, 3.85 m a pixel) and placed by seven
  dated landmarks from Wikidata (the churches of Šlapanice, Tuřany, Prace and Telnice, the chapel of St Anthony,
  Sokolnice castle, Žatčany), each pixel read off the scan.

## Acceptance (M8a)

- `test/map-dem.test.ts`: a scale model's heights are its file's at k times plus its shift, less the datum, divided by
  k, and its slopes are the file's; a scale model past its file and a scale below 1 refused; the test map reads the
  same ground through the new file.
- `test/map-scan.test.ts`: a scale model piece's frame point.
- `npm test`, `check:data`, the build, the docs check and the page check pass.

## Review rounds (M8a)

- **Round 1** (`/code-review high`): moderate and light only, so the review stops here. Fixed: decision 0070 names
  what it amends (0061's uniform squeeze, 0063's "scale 1"), and their rows say so; a scan with too few points lies
  over the extent as its piece reads it (k times as large, centred where it reads), not over a quarter of the map; the
  panel gives a scale model's residuals in metres of the field and of the map; `scale` and `shift` are refused on
  kinds that do not read a file; a scale that is no number of at least 1 is read as 1 (the page draws a copy being
  typed in); the catalogue's and the docs' notes, the scan tool's example; one reader of a piece's placement; the
  shader's uniforms looked up once. Tests: the height check at scale, the placement's round trip, `scale` on another
  relief kind, the scan over a scaled extent (each fails without its fix).

## Results (M8a)

- The landmarks: the service's georeferencing is 260 to 920 m off at them; the spline through all seven puts each on
  its place, and each where the other six put it, 140 to 810 m, 562 m RMS: the survey's own error at a few km between
  points, as on the first crop (M7e).

## M8b in detail

- **Streams from the relief** (`tools/streams.ts`, pure parts tested in `test/map-streams.test.ts`): the heightfield
  evened by two 3 × 3 means (its 1 cm steps make flats), its sinks filled level (priority flood), each node draining
  to its steepest of eight neighbours, a flat (a filled basin) draining through its middle toward its outlets and away
  from its rim (Barnes, Lehman and Mulla 2014; a node on the grid's edge an outlet too); the ground draining through
  each node summed in topological order; the nodes draining over 0.5 km² traced from each head down, the smaller
  stream ending where it joins the larger; simplified to 3 m by the distance to the segment, every join kept.
- **The map's water** (`tools/water.ts`, its inputs committed in `maps/austerlitz-water.json`, pure parts tested in
  `test/map-water.test.ts`): the streams traced over the whole relief file (a basin by the map's edge drains through
  its own outlet), those draining 2.5 km² or more, the stream of every pond inside the map and every stream any of
  them flows into, in the map's frame through the relief piece, cut exactly at the map's edge (a segment across a
  corner keeps its part inside; slivers under 50 m dropped). A named stream is the largest passing within 300 m of
  field of its point that no other name took: the Goldbach (4 m wide, 0.8 m deep), the Littawa (8 m, 1.2 m), the
  brooks of Šlapanice and the Pratzen; the rest by their catchment (1 to 3 m). Only the tool's own features are
  written again (the relief's streams, the survey's ponds): a ford or a lake drawn by hand stays, and an unnamed
  stream keeps its id where its mouth stays within 50 m, so a ford or a bridge naming it still does; a second run
  changes nothing. 31 streams. The relief, not the survey,
  gives their courses: the survey is off by hundreds of metres, the relief is the ground the map is.
- **Ponds from the survey**: each read as an ellipse in the scan's pixels (its wash fades to paper inside, so colour
  cannot find it), placed through the scan's fit, moved onto the nearest traced stream within 400 m of field (the
  ponds were dammed on them, 4 to 342 m), then slid along it, in 20 m steps up to 600 m, until it meets none placed
  before it by 20 m (shrunk if none is found, never under the 6 m semi-axis written; left out if it still meets one).
  Three have no stream near and stay where the survey has them; two lie outside the map (padded by their larger
  semi-axis) and bring no stream. 18 ponds. `source` the survey.
- **The compile of long lines** (`src/map/apply.ts`): `nearLine` takes a cutoff; a long line's box holds far more
  ground than its reach, and a far point's indexed search crossed the whole grid ring by ring. Each caller that
  discards what lies beyond its reach (a channel, a painted line, a cut, a ridge's and a scarp's profile) passes it.
  The answer within the cutoff is the full one (tested on both searches); the layers' hashes are unchanged. The
  Goldbach alone took 172 s to apply, 1.5 s with it; the whole map 3.4 s.

## Acceptance (M8b)

- `test/map-streams.test.ts`: a sink filled and drained, a valley traced from its head down along its floor, a
  tributary ending on the stream it joins, the simplification.
- `test/map-gen.test.ts`: the cut-off search answers as the full one within its cutoff, on both searches.
- The map validates and compiles (3.7 s apply in Node); screenshots of each stream in its valley and each pond on its
  stream, against the survey, for the owner.
- `npm test`, `check:data`, the build, the docs check and the page check pass.

## Review rounds (M8b)

- **Round 1** (`/code-review high`): severe, in the map's data. Six ponds were moved onto small streams that never
  became features, so they stood in dry valleys; three pairs of ponds overlapped once moved; each stream was
  simplified on its own, so a tributary stopped short of the stream it joins, and the simplification measured to the
  chord's line, not its segment; courses ran ruled straight across filled flats; and the conversion into the map was
  in no committed code. Fixed: the pipeline is `tools/water.ts` with committed inputs; a pond's stream, and every
  stream it flows into, join the map; ponds slide along their streams until apart; joins are kept and the distance is
  to the segment; flats are resolved (Barnes et al.) and the flow traced over the whole file; names go to the largest
  stream near their point; lines are cut exactly at the map's edge; the flood's order replaces a sort of every node;
  the file's half-size is `demHalf`'s; and the last search in apply without a cutoff (an area's edge by a line it keeps
  off) has one. Not taken: visiting only the nodes near a line instead of its box (the cutoff makes the box cheap:
  the whole map applies in 3.7 s). Tests: flats drained through their middle and off the grid's edge (fails without
  the edge outlets), the pipeline's parts (`test/map-water.test.ts`); the map's water checked by script for
  overlapping ponds (none), ponds off every stream (none), tributaries short of their stream (none).

- **Round 2**: severe. A run of the tool would have deleted every `water.*` feature (a ford or a lake drawn by hand)
  and renumbered the brooks (a bridge's `crosses` naming the wrong one); a pond outside the map still brought its
  stream; the edge check padded by one semi-axis; a pond shrunk below the writer's minimum was grown back into its
  neighbour; two names could take one stream (the Šlapanice and Pratzen brooks' points were off their streams);
  a segment across a map corner was dropped; the JPEG reader knew four frame types and no fill bytes; the tool copied
  helpers the engine has. Fixed as above, and the ford's and the bridge's searches take the cutoff too. Checked: a
  hand-drawn ford and lake survive a run, a second run changes nothing. Tests: the corner, ids by mouth, a C9 frame
  past fill bytes, a pond left out rather than under its minimum.

## Open questions

- Some streams still run straight for a few hundred metres across filled flats (former pond basins, the backwater of
  modern embankments) and along today's straightened channels; the brooks of 1805 bent. The language's meander
  generator could bend them, once the joins of tributaries and the ponds on them follow a meandered line.

- Bosenitz (49.191 N) lies just past the map's north edge, the Menitz pond just past its south edge: the window could
  move or the factor grow a little if the scenario needs either.
- Modern works in the relief (the D1 motorway, railway embankments, quarries) are levelled in M8b with relief edits.
