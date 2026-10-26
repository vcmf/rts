---
status: active
last_reviewed: 2026-10-25
---

# Plan: M7, the editor on the lit map

Track M, on `epic/map-engine` (decision 0020). Phase M7 of `docs/proposals/map-engine.md` §10, step 3 of
`docs/plans/active/one-map-austerlitz.md`. Several PRs into the epic (below); this plan covers them all and details the
first. M6d waits (the owner, 2026-10-25: `docs/plans/active/m6-lit-view.md`).

## Problem

A map is written by hand in its JSON file, and the map page (`app/map.html`) shows it: the lit view, the debug
overlays, the errors in place, a redraw on every save. Austerlitz (M8) is a 6 km map traced from the real relief and a
period map: hundreds of points, placed by eye against what the map shows. Typing them is too slow and too blind. The
editor puts the tools on the map page, on the lit view, and writes the same JSON (proposal §7: one view, the editor's
tools on top).

## The split

| PR | What | Acceptance |
|---|---|---|
| **M7a** (this plan's detail) | Select a feature on the map; move it, move, add and remove its points, resize a circle or an ellipse, delete it; barriers snapped to the lattice in 8 directions; the edits compiled live from the page's memory; undo and redo; the stable save through the dev server | Every map in `maps/` written back unedited is byte for byte the same; one point moved changes one line; undo to the start and save gives the original bytes; the page check drags a point through pointer events and saves |
| **M7b** | Create: a new map (id, name, size, seed, season); pick a kind from the catalogue and draw one of its shapes; ids proposed from the kind; references (`on`, `carries`, `crosses`, `along`, `near`) set by clicking their targets | A map drawn from scratch in the page validates, and its file round-trips with no diff but the edits (the phase's acceptance) |
| **M7c** | The selected feature's fields as a form from the catalogue: attributes with their units, ranges and enums, ramps, seasons, state, priority, note, source; a generator's parameters with the expansion redrawn live; pinning a generated feature; the map's sources | Every attribute of the catalogue editable and checked as the validator checks it; a pinned child equals its expansion |
| **M7d** | The tracing overlay: an image (a period map, a survey) placed under the lit view by matching points, its opacity a setting, stored beside the map as a source the compilers ignore | The 1805 map of Austerlitz placed over the real relief to within the image's own error |

## Decisions taken here (decision 0066)

- **The file stays the only truth.** The editor reads the intent file (not the expanded map), edits a copy in the
  page's memory, and writes it back. No state of the editor goes into the file.
- **Edits compile live from memory:** each finished edit (a drop, a delete, an undo) sends the page's copy to the
  compile worker; the file is written only on save. During a drag only the shape's outline moves.
- **Undo and redo** are snapshots of the page's copy, one a finished edit, 200 kept.
- **The save goes through the dev server** (`POST /__map/save`, `vite.config.ts`), with the text the page last read:
  if the file changed on disk since (edited by hand meanwhile), the server refuses and the page says so, never
  overwriting it silently. A file the page has not changed is reloaded on such a change as now. The built page
  (`vite preview`) has no server to write through: it shows and selects, but does not edit.
- **The stable save** (`src/map/write.ts`): the new file is the old text with only what changed rewritten. A
  feature that did not change keeps its bytes (a hand-written layout included); a changed one is written on one line
  in place (`formatMap`'s layout), a new one appended, a deleted one cut with its separator. A map with no previous
  text is written by `formatMap`.
- **The validator gates every edit of a shape** (the redesign, the owner, 2026-10-26: "engine gate and one state
  machine"): the editor proposes (rounding, a barrier's snap through `barrierProblem`) and keeps an edit only if the
  validator finds no problem it did not find before; deleting a feature is not gated (undo brings it back).
- **One state machine owns the copy:** idle, pressing, dragging; only an idle editor takes a command; a file changed
  on disk during a press is a conflict; a save's reply counts only for the file and base it was sent for; unsaved
  edits are a difference of values from the file, not of text.

## M7a in detail

- `src/map/write.ts`: `writeMap(base, map)`, a scan of the old text for the spans of the map's fields and of each
  feature (strings and escapes skipped), matched by id; values compared as JSON, keys in any order.
- `tools/map-save.ts`: `saveMapFile(root, file, base, text)`: the path checked (`maps/<name>.map.json` only), the
  current text compared with `base`, written through a temporary file and a rename. `vite.config.ts` serves it in
  dev.
- `src/app/map/edit.ts` (pure, tested):
  - `pick`: the feature under a screen point among the shapes the page draws (a point or a handle within 8 px, a line
    within 6 px, inside an area, a circle or an ellipse, the smallest first); a generated child picks its parent;
  - `handles` of a feature's intent shape: each point of a line or a ring, a circle's centre and radius, an ellipse's
    centre and two radii (turning it), a reference's `near`;
  - `moveHandle`, `moveShape`, `insertPoint`, `removePoint` (a line keeps 2 points, a ring 3);
  - rounding: to the coarsest of 1, 0.1 and 0.01 m that is under a screen pixel, so the file holds no false precision;
  - barriers (`barrier.*` kinds): every point on the 2 m lattice, a dragged point snapped where both its segments run
    in one of the 8 directions when such a point is near the pointer, else along one of them; a whole barrier moves by
    whole lattice steps;
  - `History`: undo, redo, a limit.
- The page (`src/app/map/editor.ts`, wired in `main.ts`): a click selects (the selection drawn over the outlines with
  its handles), Escape clears it; a drag on a handle moves it, on the selected shape moves the shape, elsewhere pans;
  a double-click on a selected line or ring adds a point; Delete removes the point under the pointer, or else the
  feature; Cmd or Ctrl Z undoes, with Shift (or Ctrl Y) redoes; Cmd or Ctrl S saves; the panel shows the selection's
  id, kind and JSON, and "unsaved" while the copy differs from the file. Picking another map or leaving the page with
  unsaved edits asks first.
- `window.MAP` gains `select(id)`, `selected`, `text` (what a save would write), `save()`, `undo()`, `redo()`,
  `dirty`, for checks.
- `tools/map-page-check.mjs`: selects a feature, drags one of its points through pointer events, waits for the
  compile, saves, checks the file's diff is that feature's line alone, undoes, saves, checks the bytes are the
  original's.

## Acceptance (M7a)

- `test/map-write.test.ts`: every map in `maps/` written back unedited is byte for byte its file; a moved point,
  an added and a deleted feature, a changed map field each change only their lines; a hand-written multi-line
  feature keeps its layout when another changes.
- `test/map-edit.test.ts`: picking, handles, moves and the barrier snap (every snapped barrier passes
  `barrierProblem`), undo and redo.
- `test/map-save.test.ts`: the server's save writes, refuses a stale base, refuses any other path.
- `test/map-editor.test.ts`: the editor without a page: a drag, undo, the history against changes on disk, Delete,
  one save at a time.
- The page check passes, with a save to a redraw under a second as before.

## Review rounds (M7a)

- **Round 1** (`/code-review high`): severe. A point added to or removed from a barrier could break its 8 directions
  (only rounded to the lattice, or its neighbours joined at any angle); a click inside the selected area always began
  a drag, so nothing on or in it could be selected; the history survived a change on disk read in, so an undo and a
  save could overwrite a hand edit with no conflict; a write error in the save was thrown into the dev server. Fixed:
  a barrier's new point is snapped between its neighbours (none added where none fits) and a point whose removal
  leaves a bad joint stays; a click that does not move selects, whatever it pressed on; reading the file in clears
  the history; the save catches its errors (a 500, the temporary file removed). With them: one save at a time (a
  second carried the old base and was refused by the page's own write), a save the server never answers is reported;
  taking the file from disk checks it is a map; Delete removes a line's or a ring's point under the pointer, else the
  feature, and forgets the handle when the selection changes; a press that changes nothing leaves no undo step; redo
  is greyed when there is nothing to redo; no point is added with the sight overlay on; one `isClosedLine` for the
  compiler and the editor (the editor took 3 points as a loop, the compiler 4); the writer reads the file's first
  text once. Tests: `test/map-editor.test.ts` drives the editor with a fake page and server; the page check selects a
  line inside the selected area.

- **Round 2**: severe. A base whose `features` was not a list (a hand edit in progress, taken in a conflict) made the
  writer loop forever and freeze the tab; a drag ending after the file was read in put the old copy back, so the next
  save reverted the hand edit. Fixed: the writer writes such a map afresh (an element that is no feature too); each
  replacement of the copy (a load, an edit, undo, redo) ends any drag begun before it, which leaves the new copy. With
  them: a press must move 4 px to drag (a click on the selection no longer nudges it); a cancelled pointer puts the
  drag back; a double click on a point adds none; Delete and Escape only with the map focused, not a list or a
  button; a conflict clears when the file is back to what the page read; the save route takes only JSON from the
  dev server's own origin (another site's page could have written maps); the editor makes its feature writer when it
  reads the file (no hidden cache in `src/map/write.ts`); the outlines' ovals are the editor's `ovalRing`.

- **Round 3**: severe, the third. A click on the selection's handle cleared it, so Delete then removed the whole
  feature; a dragged barrier point far from a valid place landed on the plain lattice and broke the barrier; a barrier
  whose kind came from a preset got no lattice at all; a late save reply could land on another map; undo, save and
  Delete acted on a drag in progress; a file the writer would lay out otherwise read as unsaved; a byte order mark
  made a file unsaveable; refusals were not JSON. Three rounds had each found the editor's state handled in another
  handler, or a rule of the engine copied and drifting: the design was wrong, not the code. Stopped and redesigned
  with the owner (above, decision 0066 amended in this PR before it merged). The review count restarts.
- **Redesign**: every edit of a shape goes through the validator (`refusal`, in `Editor`); the barrier snap takes the
  nearest candidate that passes `barrierProblem`, or leaves the point; `isBarrier` reads the kind through presets
  (`featureKind`, now exported); one mode (idle, pressing, dragging) and `ready()` before every command; a click on a
  handle keeps the selection and the hover; a save's reply is checked against the file and base it was sent for;
  `dirty` compares values; the server drops a byte order mark and answers JSON always; segment distance from
  `src/sim/fire.ts`. The validator takes 0.17–0.32 ms on today's maps (Node), so the drag checks each step.
- **Redesign, round 1**: severe. The gate matched problems word for word, and a problem's message and path carry
  indices and coordinates that shift as a broken feature is mended, so a repair read as a new problem and was
  refused; a second Delete (or a held key) removed the whole feature once its point was gone. Fixed: the gate counts
  each feature's problems (a feature with more than before is refused); Delete removes the line's or ring's point
  under the pointer, does nothing on the shape's line or edge, and removes the feature only off the shape (or on a
  point feature's or a centre's handle); the hover follows the pointer after a removal and clears when it leaves the
  map. With them: a click on the selection's line or edge keeps it (a double click there adds a point to it, not to
  what lies under); a conflict that came during a press that edited nothing reads the file in when the press ends; a
  barrier's snap checks only the moved point and its two segments, so a barrier broken elsewhere can be mended point
  by point; Cmd or Ctrl S, Z and Y work with a list or a box of the panel focused; the panel follows a cancelled drag;
  the panel and the view are refreshed only when a move changed something; `dirty` is remembered per copy; the
  segment distance is the editor's own again (the sim's is for combat), rounding uses `cm`.
- **Redesign, round 2**: severe. Two features sharing an id (a hand edit's slip) were edited and deleted together,
  and a save wrote the loss. Fixed: such a feature is not edited until the file gives one of them another id, and
  the copy replaces or removes a feature by identity, never by id. With them: the gate also counts each barrier
  segment the engine's rule finds bad (the validator names a barrier's first bad point only, so a barrier broken in
  one place could be broken in another unseen); one pointer at a time (a second finger left the editor pressing for
  good); the newest read of the file on disk alone is applied (`newestOnly`, `src/app/map/latest.ts`); the gate's
  catalogue is the newest compile's, and changes only when the catalogue's text does; an overwrite that finds
  nothing to write clears the conflict on screen; the selection redraws at once on an edit, an undo or a redo (not
  when the compile comes back), and the handle under the pointer is found again after them; `isBarrier` takes the
  kind's category as the validator does (`categoryOf`). Tests for each; the page check presses a second pointer.

## Open questions

1. Editing a generated child moves its parent's handles, not its own: changing one house of a village needs pinning
   (M7c).
2. A map file that is not valid JSON cannot be edited in the page until it is fixed by hand.
3. Each finished edit runs the whole compile (validate, apply, the bakes): 0.74 s on two-ridges (2.4 km); about 3 s
   on a 6 km map by the M6 measures. An incremental path (only the edited feature's cells) if M8's editing needs it.
