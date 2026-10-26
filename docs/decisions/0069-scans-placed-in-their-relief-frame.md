---
status: accepted
date: 2026-10-26
---

# 0069 A scan to trace from is a source placed in its relief file's frame, bent through control points, kept out of git

## Context

Battle maps are traced from period maps (the editor's M7e, `docs/plans/done/m7-editor.md`), but they are designed,
not copies (decision 0061): pieces of the real relief are cut from a heightfield and placed closer together
(`relief.dem`, `shift`, decision 0063). A scan placed once in the map's own frame lines up with one piece at most. The
period maps for the battles (`docs/research/period-maps.md`) were surveyed with no geodetic basis or little: on
Austerlitz the Habsburg First Military Survey's georeferenced copy is 320 to 690 m off at seven dated landmarks, and the
survey disagrees with itself by about 560 m between them. Most copies may be traced but not redistributed: the
Austerlitz copy is watermarked with no licence, the Austrian State Archives' are CC BY-ND, David Rumsey's are
non-commercial. A Europe theatre layer will come later and place its own data the same way.

## Decision

- A scan is a map source of kind `scan`: its image under `maps/scans/`, its `ref`, `credit` and `licence`, the dem
  source whose file's `frame` it is placed in (none: the map's own frame), and its control points `[u, v, x, z]` (a
  pixel and the place it shows). The compilers ignore it.
- The page draws it in each relief piece cut from that file, moved by the piece's `shift`, so the period map follows
  the terrain it was cut with.
- Its placement: one point moves it, two move, turn and scale it, three give an affine map, four or more a thin-plate
  spline through every point (exact at each, smooth between, affine far away: the rubber sheet GIS tools use for old
  surveys). Each point's residual is where the other points alone put it: the image's own error there.
- A georeferenced copy gives its first points (`tools/scan-wms.ts`: an image of a WMS layer in WGS 84, and points in
  the transverse Mercator the relief importer uses); landmarks and features matched by hand against the relief refine
  them.
- Scans are kept out of git (`maps/scans/` is ignored); one is committed only where its source states it is in the
  public domain. The control points, which are ours, are in the map file.
- Its opacity is a setting of the page, kept in the browser, not in the file.

## Consequences

- Good: rearranging the relief moves the period map with it; tracing a moved piece needs no new placement.
- Good: a scan's local distortions are bent out at every point the author places; the residuals say how far to trust
  it between them.
- Good: the same placement serves the theatre layer: data in WGS 84, through the frame's projection.
- Bad: a clone of the repository has the control points but not the images; each author fetches or copies them (the
  page says which file is missing and how to get it).
- Bad: a spline extrapolates poorly far from its points (a corner of the map with none near it); more points there
  are the remedy.
- Bad: the built page (`vite preview`) has no scans to show.

## Alternatives considered

- **One placement in the map's own frame:** wrong for every piece but one once the relief is rearranged.
- **Only an affine fit (GDAL's first-order polynomial):** on Austerlitz it leaves 380 m RMS at five landmarks, and
  between villages a stream lands outside its valley.
- **Warping the scan with GDAL into the frame beforehand:** a second copy of every scan, a tool outside the repo, and
  no way to refine the placement on the page.
- **Committing the scans:** not allowed for most copies; public-domain ones may be, case by case.
