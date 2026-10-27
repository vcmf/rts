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
| **M8b** | Water and ways: the Goldbach and its brooks, the ponds of 1805, the highway, the period roads and tracks; modern works levelled (the motorway, railway embankments, quarries) | Each stream in its valley, each road where the period map has it, against the relief |
| **M8c** | Villages: Pratze, Sokolnitz, Telnitz, Kobelnitz, Puntowitz, Blasowitz, Šlapanice, Aujezd, Satschan and the rest, as street villages along their roads, a church each | Each village on its site; houses clear of water and roads |
| **M8d** | Woods, fields, marsh, vineyards, as the survey shows them | The ground's kinds as the period map shows them, checked by the owner |
| **M8e** | Zones for the scenario, and the owner's check of the whole | The map validates and reads as the field (the proposal's acceptance) |

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

## Results (M8a)

- The landmarks: the service's georeferencing is 260 to 920 m off at them; the spline through all seven puts each on
  its place, and each where the other six put it, 140 to 810 m, 562 m RMS: the survey's own error at a few km between
  points, as on the first crop (M7e).

## Open questions

- Bosenitz (49.191 N) lies just past the map's north edge, the Menitz pond just past its south edge: the window could
  move or the factor grow a little if the scenario needs either.
- Modern works in the relief (the D1 motorway, railway embankments, quarries) are levelled in M8b with relief edits.
