---
status: active
last_reviewed: 2026-10-30
---

# Plan: G1, Austerlitz at 3 km

Track G (`docs/plans/active/track-g.md`), on `epic/gameplay-map`. Decision 0089 (#234): battle maps are sized by the
armies' front, and Austerlitz is a 3 km map, the same 12 km of field as a 4× model (decision 0070 allows 1 to 4).

## Problem

`maps/austerlitz.map.json` is a 6 km map: one `relief.dem` piece at 2× (`field`), and 189 features written by the M8
tools from their inputs (`maps/austerlitz-*.json`, `docs/plans/active/m8-austerlitz.md`). At 25 men a figure (0076)
its armies hold about 1 km of front a side and are lost on it.

## Scope

- **The map:** `extent` and `play` 3000 × 3000; the piece's `scale` 4 (its `shift`, in the relief file's metres,
  unchanged: the same window of the field); its note.
- **The tools' inputs:** most are in the scan's pixels or the relief file's metres and follow the piece by
  themselves: the water's streams and ponds, the ways, the villages, the ground's seeds and orchards. Those in the
  map's metres are scaled by a half: the works' lines, areas, widths and edges (`austerlitz-works.json`); the labels'
  peak boxes and points (`austerlitz-labels.json`); the ground's smallest area by a quarter. Any threshold given in the
  map's area (the water's `minKm2`, `traceKm2`) checked against its tool and scaled if it is the map's.
- **The tools run again**, in M8's order: water, ways, works, villages, ground, labels. Attributes at real size stay
  (stream widths and depths, houses, decision 0070); a village keeps the houses that fit its shorter street.
- **The look windows** (`src/look/world/windows.ts`, Track E's A1): their centres halved, and the far ring (±1300 m)
  allowed past the map's edge, as paper (the owner, 2026-10-30, track-g.md: paper past the edge): there the heights
  hold at the map's edge and the cover is plain, with no ways, water or trees. Their look data rebuilt
  (`data/austerlitz-*.lookdata`).
- **The checks:** `tools/map.ts check`, `npm run check:data`, the tests that read the map (labels, scan), the map
  page check, the look page on both windows.

Out: the staff map's light (G2); the whole map in 3D (G3).

## Acceptance

- The map validates and compiles; the map page draws it with no error; both look windows open.
- Screenshots of the whole map and of each window, before (6 km) and after, in `scratch/g1/`, for the owner's check
  of the field (M8's, started over): every village, pond, stream and road where the survey has it.
- The compile time measured (it was about 5 s at 6 km).

## Results

- **The map:** 3000 × 3000 m, the piece at 4×; the inputs scaled as above; the six tools run again. 310 features after
  expansion (330 at 6 km). Validate 590 ms, apply 1.6 s, the lit bakes 0.4 s in the page's worker (5.2 s and 1.6 s at
  6 km; the dev Mac, Chrome).
- **The villages:** 121 of the survey's 134 houses placed: Pratze 8 of 14, Šlapanice 14 of 18, Kobelnitz 7 of 10,
  every other village all of its houses. The tool asked every house and required them all; it now requires half
  (`MIN_SHARE`, tools/villages.ts), so a village keeps what fits its shorter street and still fails when most do not.
  **Kobelnitz's south end** (6 houses down the Goldbach road) is gone: at 4× its stretch is about 25 m, and its ground
  met the village's own.
- **The look windows:** Kobelnitz at (−226, 176), the Pratzen at (350, 126); both far rings pass the map's edge
  (`checkWindowInside` now asks only for the tile). The demo's look data unchanged.
- Screenshots: `scratch/g1/` (before at 6 km, after at 3 km).

## Open questions

1. The far ring as paper is a stopgap until G3 draws the whole map with paper past its edge.
