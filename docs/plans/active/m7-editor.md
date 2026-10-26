---
status: active
last_reviewed: 2026-10-25
---

# Plan: M7, the editor on the lit map

Track M, on `epic/map-engine` (decision 0020). Phase M7 of `docs/proposals/map-engine.md` §10, step 3 of
`docs/plans/active/one-map-austerlitz.md`. Several PRs into the epic (below); this plan covers them all and details
each as it starts (M7a merged in #192, M7b in #199; M7c below). M7c as first planned (fields, generators, pinning,
sources) is split in two here (M7a and M7b each needed a redesign; a smaller PR reviews better): M7c the fields, M7d
generators and pinning; tracing becomes M7e. M6d waits (the owner, 2026-10-25: `docs/plans/active/m6-lit-view.md`).

## Problem

A map is written by hand in its JSON file, and the map page (`app/map.html`) shows it: the lit view, the debug
overlays, the errors in place, a redraw on every save. Austerlitz (M8) is a 6 km map traced from the real relief and a
period map: hundreds of points, placed by eye against what the map shows. Typing them is too slow and too blind. The
editor puts the tools on the map page, on the lit view, and writes the same JSON (proposal §7: one view, the editor's
tools on top).

## The split

| PR | What | Acceptance |
|---|---|---|
| **M7a** (done, #192) | Select a feature on the map; move it, move, add and remove its points, resize a circle or an ellipse, delete it; barriers snapped to the lattice in 8 directions; the edits compiled live from the page's memory; undo and redo; the stable save through the dev server | Every map in `maps/` written back unedited is byte for byte the same; one point moved changes one line; undo to the start and save gives the original bytes; the page check drags a point through pointer events and saves |
| **M7b** | Create: a new map (id, name, size, seed, season); pick a kind from the catalogue and draw one of its shapes; ids proposed from the kind; references (`on`, `carries`, `crosses`, `along`, `near`) set by clicking their targets | A map drawn from scratch in the page validates, and its file round-trips with no diff but the edits (the phase's acceptance) |
| **M7c** | The selected feature's fields as a form from the catalogue: its id (a rename follows every reference to it), kind, preset, priority, state, source, note, each attribute the kind's category takes (its unit, range and values shown, its inherited value as a hint), seasons and ramps as JSON; the whole feature as JSON; the map's own fields and sources with no selection, its id while it has no file | Every attribute of the catalogue set through the form and judged as the validator judges it, its problem shown at its field; a rename leaves a valid map valid |
| **M7d** | A generator chosen for the selection and its parameters as a form, the expansion redrawn on each change; pinning a generated feature (its expanded form copied into the file) | A pinned child equals its expansion |
| **M7e** | The tracing overlay: an image (a period map, a survey) placed under the lit view by matching points, its opacity a setting, stored beside the map as a source the compilers ignore | The 1805 map of Austerlitz placed over the real relief to within the image's own error |

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
- **An edit always applies** (the second redesign, the owner, 2026-10-26, after analysing six review rounds): what the
  validator finds in it shows at once (the selection drawn red, the problem in the panel, the page's list), and undo
  is one key. The first redesign's gate (refuse an edit that adds a problem) is dropped: the validator names a line's
  first problem of each kind only, and some checks wait for expansion, so a gate is either incomplete or a copy of
  the rules. Snapping only helps.
- **One state machine owns the copy:** idle, pressing, dragging; only an idle editor takes a command; a file changed
  on disk during a press is a conflict; a save's reply counts only for the file and base it was sent for; unsaved
  edits are a difference of values from the file, not of text.
- **The editor edits only a map whose structure it can read** (`wellFormed`); any other file opens read-only.
- **Point edits keep index fields in step:** a shared edge's `at` (the place in the outer ring it goes before).
- **Only the selection's outline and handles drag it;** a press inside a selected area pans.

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
- **Redesign, round 3**: severe, the redesign's third. Point edits shifted a shared edge's place in its ring
  (`follow.at`), and the gate let it through (the validator checks that edge after expansion); a file of valid JSON
  but a malformed structure (a `null` feature or preset) crashed the editor; a conflict from another write seen while
  a save was out was cleared by the save's reply. Stopped and asked the owner, who asked whether the design itself
  was wrong. The analysis: most findings across the six rounds were event handling, fixed; four came from the design.
  (1) The gate rested on the validator being a complete oracle, which it is not: each precision fix led to the next
  finding. (2) Index fields (`follow.at`) shift under point edits. (3) No trust boundary on what the editor reads.
  (4) A press inside a selected area both moved it and was meant to pan. The owner chose all four changes (above;
  decision 0066 amended in this PR). The review count restarts.
- **Second redesign**: the gate is gone; `check` validates the copy after each edit and shows what it finds;
  `wellFormed` on reading, read-only otherwise; `shiftFollow` keeps `at` in step (an outer ring that is a shared
  edge's rest may keep one point); `down` takes only the outline and the handles. With it, round 3's other findings:
  the hover follows a zoom and the end of a pan; an overtaken read's failure is dropped too; the shared-id message
  only for a press on the selection; no ground under the pointer is no pick and no move (not the view's centre); the
  drag no longer validates or refreshes the panel on every move. Tests for each; the page check zooms away from a
  hovered point and presses Delete.
- **Second redesign, round 1**: severe. A map that did not compile when opened could not be edited: clicks picked only
  from the last good compile, and there was none. Fixed: a click picks from the copy's own shapes too. With it: a
  double click whose first click selected only selects (no point added by accident); the gap where a shared edge
  runs is no outline (no press, no point added there), and the open ring is drawn as its segments; the watcher's
  report of a save still on its way is ignored, so an undo made meanwhile stands; reading a file clears the last
  message and shows what the validator finds in it; a generated child is found by its parent through `childOf`; a
  shared edge's `at` that is not a number is left alone and the file is read-only; the writer keeps a CRLF file's
  line ends; the save writes through a symbolic link, in place for a hard-linked file, and keeps the permissions.
  The page check's save-to-redraw time went over its second (1.2–1.3 s) at a load average of 97 from other
  sessions, the compile itself at 1.0–1.1 s against 0.75 s before; to run again when the machine is quiet.
- **Second redesign, round 2**: moderate and light only, so the review stops (the writer's patches and the save
  route came through with nothing). Fixed: a failed read of the file on disk is said in the editor's panel, no longer
  dropping the compile of an edit in flight; a change on disk is applied only to the map the editor holds; an undo
  that makes the copy clean during a conflict reads the file in; the selection is drawn red by the newest catalogue,
  from the file's first reading; the handle under a resting pointer is found again when the view moves; the message
  for a point that stays names each shape's fewest points; leftover names of the dropped gate.

## Results (M7a)

- Every map in `maps/` written back unedited is byte for byte its file; a moved point changes one line; an edit
  undone after a save comes back in the file's first bytes (`test/map-write.test.ts`).
- The page check: a drag of a point compiles from the page's copy in 0.73–0.93 s (two-ridges, 2.4 km, the dev Mac
  under other sessions' load); the save writes one changed line; undo and save give the original bytes; a save to a
  redraw in 0.86 s.
- The validator on the edited copy: 0.17–0.32 ms on today's maps (Node).
- `npm test` (822 tests), `check:data`, the build and the docs check pass.

## M7b in detail

Creating, with the same state machine and the same save (decision 0066 holds; no new decision):

- **A new map** (the panel's "new map"): its id (also the file's name, `maps/<id>.map.json`, refused when taken), name,
  size (the extent, square, and the play area inside it), seed (a random uint32 proposed, or when left blank) and
  season, judged by the validator at once like any edit. The page holds it as a copy with no file yet
  (`Editor.create`): it compiles from memory, shows "unsaved", and its first save creates the file. The save route
  takes `base: null` as "create": written only if no file is there (409 with the file's text otherwise). The map joins
  the page's list; leaving it unsaved asks first and drops it.
- **The disk, explicit** (the redesign below): the editor knows the file's last text and whether it is there. A
  creation, a change and a deletion on disk take one path; a file there that the page does not know is a conflict,
  whatever made it. A deletion keeps the copy and its layout; the next save creates the file again.
- **Adding a feature** (the panel's "add"): a kind from the catalogue (by category), one of the shapes it takes, and an
  id proposed from the kind's last name (`wheat`, then `wheat2`…: never `wheat-2`, a generated child's form), editable
  before drawing. Then a drawing mode, the state machine's fourth, which takes clicks (a press that moves still pans;
  the editor pairs clicks, so a double click's second click is never a click of its own):
  - a point: one click; a line: clicks, Enter or a double click ends it (2 points at least); an area: likewise
    (3 points), its ring closing itself; a click back on the first point closes an area or a line (a barrier's with a
    lattice point between when its last segment needs one); a circle: its centre, then a point on its edge; an ellipse: its centre, the
    end of its first radius (which sets its angle), then a point giving the second radius;
  - points rounded as a drag rounds them; a barrier's on the lattice, each new point snapped where its segment runs in
    one of the 8 directions (`snapBarrier`, the engine's rule as the check);
  - then each reference the kind takes, in the catalogue's order, by clicking: a feature for `on`, `carries`,
    `crosses` (only one of the category and shape the catalogue names picks: `water:line`), a ground point for
    `near`, and for `along` two clicks on the line (where the stretch starts and ends, in metres along it); an
    optional reference is skipped with Enter;
  - Backspace takes back the last click, Escape drops the drawing; the panel says what to click next, and the draft
    is drawn with a line to the pointer;
  - the end makes the feature in one edit (one undo step), selects it, and the validator says at once what is still
    wrong (the kind's attributes come from the catalogue's defaults; the fields form is M7c).
- **A reference of the selected feature** set again by clicking (the panel lists the kind's references, each with a
  button): the same picking, one edit.
- The pure parts in `src/app/map/draw.ts` (the draft, its steps, the proposed id, the feature it makes, what a click
  picks as a reference, a point's distance along a line); the editor's mode in `Editor`; both tested in
  `test/map-draw.test.ts`.
- `window.MAP` gains `add` (start a drawing), `enter`, `prompt`, `drawing`, `isNew`.
- The page check: makes a new map, draws a meadow (an area), a stream (a line), a ford on it (references by clicks),
  a road and a bridge, a hedge (a barrier) and a hill (a circle); saves; checks that the new file validates with no
  problem, that the page reads it back unchanged, and that one more edit changes one line; removes the file.

## Acceptance (M7b)

- A map drawn from scratch in the page validates, and its file round-trips with no diff but the edits (the page check;
  `test/map-draw.test.ts` for a new map saved, read back and written unedited).
- Every shape and every reference of the catalogue's kinds can be drawn (`test/map-draw.test.ts`, through the kinds'
  own `shapes` and `refs`), every drawn barrier passes `barrierProblem`.
- `test/map-save.test.ts`: a create writes a new file and refuses to overwrite one.
- `npm test`, `check:data`, the build, the docs check and the page check pass.

## Review rounds (M7b)

- **Round 1** (`/code-review high`): severe. The proposed id for a second feature of a kind (`wood-2`) is the form of
  a generated child's id, reserved while a feature of that name generates; a click back on an area's first corner (the
  usual way to close one) added it again, and the area then crossed itself. Fixed: ids are numbered `wood2`; a click
  back on the first point closes an area or a line, a barrier's with a lattice point between when its last segment
  needs one (a hedge round a field can be drawn). With them: the create writes a temporary file and links it into
  place (a failed write leaves no partial map; a path there but unreadable is answered); the map takes the focus
  after the draw button, so Enter, Backspace and Escape work at once; a deleted map file leaves the page's list (the
  hot update sends its type); one `kindMetaOf` (`src/map/catalogue.ts`) and `Editor.metaOf` for the four lookups of a
  kind's metadata; the picker's entries made and dropped in one place each; this plan's hooks and test files.
- **Round 2**: severe. A new map's first save refused because another map of that id was made meanwhile showed as a
  conflict, whose buttons would overwrite that other map or take it in as this one. Fixed: it says the id is taken
  and offers neither. With it: a double click that ended a drawing (a village's stretch, an area closed near its
  first corner) no longer passes its second click to the idle editor (which picked what lay under it, or added a
  point); `along` is never set past its line's end by the rounding; Backspace after an area closed on its first
  corner reopens it with every corner; a map file deleted under the page turns its copy into a new map, said in the
  panel, which a save makes again (it was silent until a save failed); a blank seed is a random one, not 0; picking
  another kind keeps an id typed in the box; the reference's target rule is the validator's (`refTargetProblem`,
  exported); a draft no longer carries its own barrier flag (the editor's `place`).

- **Round 3**: severe, the third. A file deleted and written again with the same bytes (a safe write, a checkout)
  showed as a conflict; a new map's id taken meanwhile could still be overwritten through a conflict seen by the
  watcher; an `along` target the catalogue names without a shape crashed the click (no line to measure); a double
  click's second click acted in the step its first click had opened (a reference set, a circle of the least radius);
  a file deleted lost its layout; the new-map form copied the validator's ranges; a create failed where the file
  system has no hard links; the new-map button and the map list ignored a drawing in progress. Stopped at the limit.
- **Analysis** (the owner asked for it at the limit, as in M7a): of about 29 findings over three rounds, about 10 were
  ordinary bugs; the rest fell in three classes each round found again. (1) The file's lifecycle: the editor knew the
  disk as "base text, or null", and null was made to mean "new, create it", then "deleted"; every patch led to the
  next finding. (2) Double clicks: the browser's click, click, dblclick were read by each step in its own way, and
  leaks across steps kept coming. (3) Copies of the rules: the drawing and the form checked what the validator
  checks (ids, `along`'s range, targets' shapes, seed and play), each copy a little off, one crashing, against
  decision 0066. The owner chose all three changes (2026-10-26); they apply decision 0066, which is not amended. The
  review count restarts.
- **Redesign**: (a) the disk is the file's last text and whether it exists; `onDisk` takes text or none, one rule for
  made, changed and deleted, a 409 the same conflict, the panel saying which; a deletion keeps the copy and its
  layout. (b) `Editor.click` pairs clicks (600 ms, 4 px): the second of a double click is that gesture; it ends a line
  or an area only when its first click added a point, and adds a point to the selection only when its first click did
  not select; the page's dblclick listener is gone. (c) The drawing sets values and the validator judges them: `add`
  refuses only a kind the catalogue lacks and an id in use; the form checks only the id (it names the file); a
  reference's target is the validator's `refTargetProblem`, and `along` a line (a type guard: it is measured along
  it). With them, from round 3: a create without hard links falls back to an exclusive copy; the new-map button and
  the map list wait for a drawing or a drag; the editor's picking is one `pickAt`. Tests: the editor's tests click
  through a clock (`test/map-clock.ts`); the page check deletes the new map's file and writes it again.
- **Redesign, round 1**: moderate and light only, so the review stops. Fixed: the watcher's echo of the page's own
  save no longer clears the panel's message ("saved", a problem), only a conflict or the note of a deletion; a deletion
  seen while a save is on its way is the save's rename and is left to its reply; the end of an `along` stretch picks
  only the line it starts on (another may be nearer at a junction); a pan, a zoom or a drag between two clicks makes
  them no double click (`Editor.forgetClick`); Backspace back into an area closed on its first corner reopens it with
  every corner however many steps followed (the draft keeps which steps were closed); a click on a barrier's first
  point that cannot close it adds no point there (a guard: from lattice points a closing point is always found); the
  page check notes the file's deletion from the step before (it raced the watcher); the reference buttons are rebuilt
  only when they change (a button replaced under a press lost its click); one layout of an empty list (`formatValue`),
  one radius rounding (`radiusTo`) and one `isPts` for the drag and the drawing.

## Results (M7b)

- The page check draws a new map from scratch by clicks (a base, a meadow, a stream and a ford on it, a road and a
  bridge, a hedge, a hill), saves it into a new file that validates with no problem and reads back unchanged; one more
  feature saved adds one line; the file deleted and written again with its bytes settles with no conflict.
- `test/map-draw.test.ts`: every kind of the catalogue drawn as every shape it takes, its references clicked, its
  shape and references valid.
- `npm test`, `check:data`, the build and the docs check pass.

## M7c in detail

Decision 0066 holds: a form sets values, the validator judges them at once (no copy of the rules); each change is one
edit. No new decision.

- `src/app/map/fields.ts` (pure, tested in `test/map-fields.test.ts`):
  - `attrRows`: the attributes a feature's kind's category takes (`allowedIn`), in the catalogue's order, each with
    its spec, the feature's own value, what it inherits and what the season or state makes it (`resolve`), for the
    hints;
  - `parseInput`: a field's text as a value by its spec's type: empty removes the field (it inherits); a number's
    text that is no number is kept as text, for the validator to name; objects, ramps, seasons and lists as JSON (text
    that is no JSON: no edit, and the panel says so);
  - `setField`, `setMapField`: the feature or the map with one field set or removed, the others in their order;
  - `renameFeature`: the copy with a feature's id changed and every place that names it by that id: `on`, `carries`,
    `crosses`, `along.id`, `follow` and `clear` ids, a generator's selectors (`avoid`, `within`) and a pinned child's
    record of them; `hasChildren`: a feature whose children carry its id (renamed in the file, not the page);
  - `problemsAt`: the validator's problems whose path is a field's (`features[i].height`, `seed`).
- `Editor`: `setField(key, value)`, `rename(id)`, `setMapField(key, value)`, each one edit and saying whether it
  changed the copy; `renameMap(id)` (only while the map has no file: it moves the new map to `maps/<id>.map.json`).
- The panel (`src/app/map/form.ts`): the selection's form, its text not applied held explicitly (applied on change
  and before any command of the editor; refused, kept with why), the problems under their fields, the feature's JSON
  below to read; with no selection the map's form.
- The page check: renames a feature with references and sets an attribute through the form; the saved diff is
  those lines alone.

## Acceptance (M7c)

- `test/map-fields.test.ts`: every attribute of the catalogue, on a kind whose category takes it, set from a good
  text and from a bad one through `parseInput` and `setField`: the good gives no problem, the bad one at its field's
  path (`problemsAt`); a rename of each map's features in `maps/` leaves its problems as they were, and no reference to
  the old id.
- `npm test`, `check:data`, the build, the docs check and the page check pass.

## Review rounds (M7c)

- **Round 1** (`/code-review high`): severe. A new map renamed was compiled from its old file name (the page's list
  still named it), which does not exist; a change applied as the focus moved on (a click, Tab) rebuilt the form, so
  the field moved to was gone; an id emptied renamed the feature and its references to nothing, and the selection with
  it. Fixed: the list moves first, so the compile reads the copy; the form is built again only when its fields change
  and is otherwise given its values in place (a rename keeps it too); an empty id is refused. With them: a rename
  follows a generating parent's children (`<id>-<n>` wherever named, a pinned child's own id); undo and redo of a
  rename keep the selection on the feature; a refused change shows what the field still holds; a feature's problems
  of no field (its shape, references, shared edges) show above its JSON; a new map is not renamed while its first
  save is out; what an attribute inherits is `resolve`'s (its season and state too), not a copy of its order;
  `renameFeature` compares with `sameJson`. Tests for each; the page check renames a new map and back, types an id in
  use, and keeps the field the focus moved to.
- **Round 2**: severe. A rename moved a parent's children onto ids in use (two features of one id, neither editable
  after); it renamed references to an author's feature only named like a child (`farm-2` beside a parent with pinned
  children); JSON refused after a click on "apply JSON" was replaced by the feature's. Fixed: only real children
  follow (a generator's, which the validator keeps author ids off, or pinned ones by their recorded parent); a rename
  whose ids would clash is refused (`newClashes`); refused JSON stays as typed. With them: a field typed in and not
  applied is left as typed by a refresh from elsewhere; a new catalogue refreshes the form; each history step keeps
  the selection it had (an undone rename or deletion selects its feature), no guess by place; a pinned child's record
  of its generator's selectors follows a rename; the feature's JSON on one line, and given once a change; problems
  under their input; one check of a new map's id.
- **Round 3**: severe, the third. A value typed in a field was lost when the next press on the map began a drag before
  the blur applied it; a JSON box marked typed stopped following the feature and could apply stale text over newer
  edits; bad JSON in a field was replaced by the old value; a rename cleared what other fields held typed; Cmd S in
  a field opened the browser's dialog; a new map's rename refitted the view; the hint did not say when a season
  overrode the field. Stopped at the limit.
- **Analysis** (the owner asked for it at the limit, as in M7a and M7b): of about 30 findings, about 10 were ordinary;
  the rest fell in two classes every round found again. (1) The form's state: text typed and not applied was a second
  state beside the editor's copy, synced by hand (rebuilds, typed flags, a counter of fills, focus restored, applied
  on blur), and the JSON box was a second editor of the same feature competing with the fields; each fix made the
  next finding. (2) The rename's scope: following every reference grew to generated and pinned children, their
  selectors and recorded parameters, and each round found one more place an id lives. The owner chose all three
  changes (2026-10-26); decision 0066 holds (they apply it). The review count restarts.
- **Redesign**: (a) the text not applied is explicit (`pending`): a field shows the copy unless it holds some; it is
  applied on change and before any command of the editor (a press outside the form, Cmd or Ctrl S, Z, Y); refused,
  it stays with its reason until changed, or Escape drops it; the editor's commands say whether they changed the copy
  (no counters). (b) The feature's JSON is to read and copy only. (c) A rename follows the feature's own id; a
  feature with children is not renamed in the page (`hasChildren`), so no child id moves. With them: a new map
  renamed keeps the view; the hint says what a season or state makes a field; Cmd S in a field applies and saves,
  Cmd Z there is the field's text undo while it holds text; the page check takes the lines a rename changes from
  `renameFeature` (any map), presses the map with text typed, and drops a refused id with Escape.

## Open questions

(M7b)
- A new map whose id another map took between its making and its first save is a conflict: overwrite that file or
  take it. Saving the drawing under another id needs the map's own fields (M7c's form).
- While drawing, each pointer move redraws the lit view to move the preview (one frame a displayed frame, as a drag
  does since M7a); to measure on Austerlitz, and to draw the overlay alone if it lags.

(M7a)

1. Editing a generated child moves its parent's handles, not its own: changing one house of a village needs pinning
   (M7c).
2. A map file that is not valid JSON cannot be edited in the page until it is fixed by hand.
3. The writer parses and compares the whole features list on each edit; measured cheap on today's maps, to be
   measured on Austerlitz with the compile below.
4. Each finished edit runs the whole compile (validate, apply, the bakes): 0.74 s on two-ridges (2.4 km); about 3 s
   on a 6 km map by the M6 measures. An incremental path (only the edited feature's cells) if M8's editing needs it.
