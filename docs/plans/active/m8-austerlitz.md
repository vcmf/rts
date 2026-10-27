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
| **M8c** | Ways: the highway, the period roads between the villages, traced off the survey | Each road where the period map has it, on the survey's line |
| **M8d** | Modern works levelled: the D1 motorway and its interchanges, the railway's embankments and cuts, the quarries | The ground of 1805 under each, no modern work left in the relief |
| **M8e** | Villages: Pratze, Sokolnitz, Telnitz, Kobelnitz, Puntowitz, Blasowitz, Šlapanice, Aujezd, Satschan and the rest, as street villages along their roads, a church each | Each village on its site; houses clear of water and roads |
| **M8f** | Woods, fields, marsh, vineyards, as the survey shows them | The ground's kinds as the period map shows them, checked by the owner |
| **M8g** | Zones for the scenario, and the owner's check of the whole | The map validates and reads as the field (the proposal's acceptance) |

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
  Goldbach alone took 172 s to apply, 1.5 s with it; the whole map 3.7 s.

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

- **Round 3**: moderate and light only, so the review stops here. Fixed: a pond slid along its stream past the map's
  edge is left out (checked again after sliding); streams are cut at the extent's own edge, each side its own
  half-size (they stopped 10 m short, and a map that is not square lost its water along its longer side); a stream
  takes the id of the nearest old mouth, and a vanished brook's id is not handed to another; the outlines are
  sampled every 4 m (a thin pond could cross a long one between samples); a pond's axes come through the fit's local
  map (its singular values), so its long axis stays long; names matched as strings; one comparison in the scan's hot
  loop. Not taken: a far point's search made cheap inside `nearIndexed` itself (every caller in apply passes its
  cutoff; the generators' and the scatter's distance checks are a question for when M8e places villages). Tests for
  each (the thin crossing, the nearest mouth, a vanished id, the framed axes, a map that is not square).

## M8c in detail

- **Ways traced off the survey** (`tools/ways.ts`, its inputs committed in `maps/austerlitz-ways.json`, pure parts
  tested in `test/map-ways.test.ts`): each road given as a few waypoints in the scan's pixels, a junction other roads
  meet at by its name (`junctions`: one pixel, so every road through it has the same point). A waypoint or junction off
  the ink is moved onto the nearest pixel within 4 px costing no more than the cheapest there by 2 (one clicked beside
  the drawn line; one on ink stays, a faint line too, though darker lettering lies near; one off the image is refused),
  and between each two the tool
  takes the cheapest path over the scan, eight neighbours, searched in their box padded by 80 px. A pixel costs 1 on
  ink, up to 31 on paper: ink is darker than the mean of the 15 px box around it, by 25 levels for the full discount,
  so the sheets' paper (0.65 to 0.95 of white) does not matter.
- **Roads meet exactly.** Where two legs come back along each other within 12 px of a plain waypoint (a spur: the
  waypoint beside the road, 3 px deep or more), both are cut back to where they part, never past a junction (a straight
  pass and a right-angled corner are left; a turn sharper than about 50° at a plain waypoint is cut at its tip, so one
  that is needed is given as a junction). A road with an end running
  along another (within 3 px for more than 8) is cut back to where it leaves it and joined to that road's pixel, the
  fork, which both keep; the roads are taken in turn against the others as they are left, so of two whose ends run
  along each other the first listed is cut. A junction on a cut end, and a stretch left in two roads' middles (more
  than 32 px, 120 m of field, a third road crossing it or not), are errors naming the roads; an end within 4 px of
  another road and not on it is reported, the junction to be named. The pixel path, which steps between a road's two drawn
  edges, is evened by a moving mean over 8 px each side between the points it keeps (its ends, its junctions, its
  forks), placed through the scan's fit (`scanFitOf`, shared with `tools/water.ts`) and the relief piece, simplified
  to 3 m of field with those points kept, and cut at the map's edge (no piece under 20 m).
- Only the tool's own features are written again: way kinds with the scan as their source and the tool's note (a way
  drawn by hand stays, whatever its source; one dropped from the inputs goes). A piece's id already taken, an id listed
  twice, a kind that is not a way's, a way of fewer than two points or of points all on one pixel are refused.
- The ways: the Brünn–Olmütz highway (the Kaiserstraße) along the north, the post road from Turas past Sokolnitz to
  Telnitz (6 m), and the roads between the villages: Telnitz–Satschan–Aujezd, Kobelnitz–Pratze, Šlapanice–Blasowitz,
  Šlapanice–Puntowitz, Puntowitz–Pratze, Aujezd–Hostieradek–Krenowitz, the Goldbach road from Kobelnitz to Telnitz,
  Pratze to St Anthony's chapel, Pratze north to Blasowitz and south to Hostieradek. 12 ways. The survey's field
  tracks are not drawn: the generators' fields bring their own (M8f). Where a road forks off another just before the
  village it is named for, it runs on into the village alone (30 to 52 m at Kobelnitz, Aujezd and Blasowitz): the
  village's street, which M8e builds along.
- The survey, not the relief, gives their line: unlike a stream, a road leaves no mark in a 5 m relief the tool can
  follow, and the survey's error (562 m RMS between landmarks, M8a) is the price; the villages of M8e are placed on the
  same scan, so a road and its village keep together.

## Acceptance (M8c)

- `test/map-ways.test.ts`: ink cheap against its own paper whatever its shade, the path along a drawn line rather
  than across paper, the search box, a waypoint off the image refused, the snap (and a waypoint on its line kept beside
  darker ink), a spur cut and a junction kept (and never cut past), the fork whichever road is listed first, a
  stretch traced twice in two middles (and with a third road across it), the evening between kept points; a waypoint
  off the image refused before it is moved, one on a faint line kept, a straight pass and a corner not cut, a junction
  on a cut end refused.
- The map validates and compiles (4.3 to 4.8 s apply in Node); checked by script: every junction and fork meets the
  road it is on (0.00 m), no turn over 140°, no stretch of one way within 4 m of another; screenshots of the ways, and
  of the traced lines over the survey, for the owner.
- `npm test`, `check:data`, the build, the docs check and the page check pass.

## Review rounds (M8c)

- **Round 1** (`/code-review high`): severe. Junctions meant to be shared were typed as nearby pixels in each road,
  so the roads stopped 9 to 21 m short of each other, and evening and simplifying moved the points they met at; a
  waypoint on paper beside the line forced a spur into the field (up to 125 m at Kobelnitz); three pairs of roads
  traced the same drawn stretch twice, 300 to 500 m each; the rerun would have deleted a hand-drawn way citing the
  survey. Fixed as above (named junctions, the snap, the spur cut, the fork, the kept points, the inputs' ids), and the
  waypoints are checked against the image, the search skips a node already settled, the scan's fit is one function
  for both tools, a piece's id is checked against the map's. Three inputs were wrong on the survey and are moved: the
  Pratze, Telnitz and Kobelnitz junctions off their crossings, Puntowitz's middle waypoint in a field, the road by
  St Anthony's chapel traced along its lettering (it now ends at the chapel; the survey shows no clear road on to
  Aujezd). Tests for each.
- **Round 2**: severe. The spur cut could walk back past a junction kept before it (the junction dropped from the
  road); forks were found only at a later road's ends, so an earlier road's end along a later one's middle stayed
  doubled, depending on the inputs' order; a way dropped or renamed in the inputs stayed in the map; the snap moved a
  waypoint already on its line onto darker ink beside it; inputs were not checked. Fixed as above: the cut stops at the
  last kept point; every road's pixels are known from the start and each road's ends are cut against all the others,
  forks pinned by their pixel; a stretch left in two middles is an error; the tool's ways are known by their note; the
  snap keeps the nearest pixel near the cheapest. Not changed: the half-pixel between the two tools (a way's points
  are pixel indices, their centres at u + 0.5; a pond's are read as coordinates on the image, which the fit takes as
  continuous, as the page draws it); the ink's cost over the whole scan (about 300 MB for one run, estimated).
- **Round 3**: moderate and light only, so the review stops here. Fixed: a waypoint off the image was moved onto it
  before the check (or failed with a bare error); `forks` could drop a junction on the end it cut (now an error); a
  T-junction given as a plain waypoint could stop a few pixels off the road it meets (now reported: the tool found one
  at Šlapanice, named since); the spur cut also cut a straight pass through a plain waypoint (3 px jumps) and shaved
  right-angled corners; the snap moved a waypoint on a faint line onto darker ink; a run traced twice was broken by a
  third road crossing it, and the search was a square; a kind that is not a way's and inputs without junctions. Not
  taken: the ink's cost per leg's box (an estimate, as above); and the review's design point, that the snap, the spur
  cut, the forks and the doubled check reconcile roads traced one by one, which is where the severe findings of both
  earlier rounds came from: tracing the network incrementally (pixels already on a road nearly free, a road reaching
  one sharing it) makes it a graph from the start. Recorded as #227, for when the tracer is next used (M8e's streets).

## M8d in detail

- **`relief.mend`** (decision 0073): a new relief edit that rebuilds the ground under a modern work from the ground
  around it. Along a line, each node takes the blend across the line of the ground just past the edit's reach on each
  side, at its nearest point; over an area, a circle or an ellipse, the plane through the ground on its rim (least
  squares); blended in over `edge`. Mends apply first among the edits, so the 1805 edits land on the mended ground.
- **The works traced off the relief** (`tools/works.ts`, its inputs committed in `maps/austerlitz-works.json`, pure
  parts tested in `test/map-works.test.ts`): each line given as a few waypoints in the map's metres, and between each
  two the cheapest path over the relief file, a node costing 1 where it stands 1.5 m or more off the mean of the 105 m
  box around it (an embankment's crest, a cutting's floor) and up to 31 on plain ground; M8c's snap and spur cut; the
  path evened, simplified to 1 m and any loop it makes cut out. Only the tool's mends (known by their note) are written
  again.
- The works: the D1 west of Šlapanice with its interchange's ramp and loop, the D1 north of Jirschikowitz and
  Blasowitz to the Holubice interchange, the Brno–Přerov railway from Šlapanice east, the railway from Křenovice
  south and west to Újezd, the railway embankment past Sokolnice, the Brno–Veselí railway's low embankment across the
  south; the pits and heaps north of Šlapanice, a walled basin beside them, a tank farm's bunds, a pit and stepped
  ground west of Újezd. 12 mends, found from the relief less its local mean, before and after compared the same way.

## Acceptance (M8d)

- `test/map-apply.test.ts`: an embankment and a pit in the landforms mended to within 15 cm of the ground without
  them, the ground past the mend's reach unchanged, a cut listed before a mend landing on the mended ground.
- `test/map-works.test.ts`: the file read over a box, the work's cost, a line's loops (a crossing, a spur back to a
  point) cut out.
- The map validates and compiles; the mends add about 1 s to its 5.5 s apply in Node (measured). The relief less its
  local mean, before and after, for the owner's check.
- `npm test`, `check:data`, the build, the docs check and the page check pass.

## Open questions

- The road tracer reconciles roads traced one by one (#227); tracing the network incrementally would make the forks
  part of the tracing.

- A long line's far point still searches the whole bucket grid where a caller passes no cutoff (`reach.ts`'s
  distances, the scatter's edge); M8e's villages keep clear of the streams through them, so it is measured there.
- Some streams still run straight for a few hundred metres across filled flats (former pond basins, the backwater of
  modern embankments) and along today's straightened channels; the brooks of 1805 bent. The language's meander
  generator could bend them, once the joins of tributaries and the ponds on them follow a meandered line.

- Bosenitz (49.191 N) lies just past the map's north edge, the Menitz pond just past its south edge: the window could
  move or the factor grow a little if the scenario needs either.
- Mended ground is smooth (decision 0073): a long mend reads as a faintly smoother band; where an embankment crosses
  a valley, the valley floor is to be drawn back with a landform if the scenario needs it.
- What is left of modern ground: Slatina's and Brno's built-up edge in the north-west corner, the airport's flat
  apron, Holubice's interchange slip roads, the low banks of today's roads. Light; the owner's check decides.
