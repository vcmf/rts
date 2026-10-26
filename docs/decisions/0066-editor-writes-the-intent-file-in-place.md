---
status: accepted
date: 2026-10-25
---

# 0066 The editor edits the intent file in the page and saves only what changed, through the dev server

## Context

The map editor (M7, `docs/plans/active/m7-editor.md`) works on the map page's lit view (decisions 0058, 0064). Maps
are strict JSON files written by hand until now (proposal §13.3: strict JSON so the editor can rewrite the file), some
in their own layout, each reviewed as a diff. The page already compiles a map in a worker and redraws on every save of
its file. The editor must write those files without losing a hand edit made meanwhile, and without turning a one-point
change into a diff of the whole file.

## Decision

We will build the editor as follows:
- **The intent file is the only truth.** The editor edits the intent (never the expanded map), and keeps none of its
  own state in the file.
- **Edits live in the page's memory until saved.** Each finished edit is compiled live from the page's copy; undo and
  redo are snapshots of that copy.
- **The save goes through the dev server, guarded by the text the page read.** If the file changed on disk since, the
  save is refused and the page says so. The built page has no server to write through and does not edit.
- **The stable save rewrites only what changed:** an unchanged feature keeps its bytes, a changed one is written on
  one line in its place, a new one appended, a deleted one cut. A file written unedited is byte for byte the same.
- **An edit always applies; the validator says what is wrong at once** (amended in this PR before it merged, twice:
  first to a gate that refused edits adding a problem, then, after that design's own three review rounds, to this):
  the problems the edit leaves show in the panel and in place as soon as it is made, and undo is one key. The editor
  holds no copy of the language's rules; snapping only helps. A gate was dropped because the validator is no complete
  oracle: it names a line's first problem of each kind only, and some checks wait for expansion (a shared edge's).
- **The editor edits only a map whose structure it can read** (amended likewise): an object, its features objects
  with a text id, its presets objects, each shape as its kind of value; any other file opens read-only, saying why.
  What is wrong inside that structure is the validator's to report, and can be mended in the editor.
- **A field that names a point by its place keeps in step** (amended likewise): adding or removing a point before a
  shared edge's `at` moves it with the ring.
- **One state machine owns the page's copy** (amended likewise): idle, pressing, dragging. Only an idle editor takes
  a command; a file changed on disk during a press is a conflict; a save's reply counts only for the file and base it
  was sent for.

## Consequences

- Good: an edit's diff is the features it touched, one line each, so maps stay reviewable as they are now.
- Good: a hand edit and the editor cannot overwrite each other silently.
- Good: dragging and undoing never touch the disk; the file watcher's redraw stays for hand edits.
- Bad: editing needs the dev server (`npm run dev`); the built page is a viewer.
- Bad: a changed feature loses a hand-written multi-line layout (it is rewritten on one line).
- Bad: unsaved edits live only in the page: closing the tab loses them (the page asks first).
- Good: the editor and the compiler cannot disagree on what a valid feature is (the first design's copies of the
  barrier rule drifted from the engine's), and a broken feature can be mended in the page.
- Bad: an edit can leave the map wrong, as a hand edit can; it shows red at once, and the save does not refuse it.
- Bad: the whole map is validated after each edit: 0.17–0.32 ms on today's maps (Node); to be measured again on
  Austerlitz's hundreds of features.

## Alternatives considered

- **The browser's File System Access API:** no server needed, but Chromium only, a file picked again each session,
  and no guard against the file changing on disk between reads.
- **Saving on every edit:** simpler, but every drag and undo writes the file and recompiles twice (the edit, then the
  watcher), and a half-finished edit lands on disk.
- **Formatting the whole file on save (`formatMap`):** simple, but the first save of a hand-written map rewrites every
  line, and its diff hides the edit.
