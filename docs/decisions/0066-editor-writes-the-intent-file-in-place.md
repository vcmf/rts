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
- **The engine's validator gates every edit of a shape** (amended in this PR, before it merged, after the review's
  third round): an edit that adds a problem the validator did not find before is refused, and the copy keeps its last
  good state; the editor proposes (rounding, a barrier's snap) but holds no copy of the language's rules. Deleting a
  feature is not gated: what it breaks shows in place, and undo brings it back.
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
- Good: the editor and the compiler cannot disagree on what a valid feature is; three review rounds found the
  editor's copies of the barrier rule drifting from the engine's.
- Bad: the whole map is validated on each step of a drag: well under a millisecond on today's maps (0.3 ms for the
  valley, measured in Node); to be measured again on Austerlitz's hundreds of features.

## Alternatives considered

- **The browser's File System Access API:** no server needed, but Chromium only, a file picked again each session,
  and no guard against the file changing on disk between reads.
- **Saving on every edit:** simpler, but every drag and undo writes the file and recompiles twice (the edit, then the
  watcher), and a half-finished edit lands on disk.
- **Formatting the whole file on save (`formatMap`):** simple, but the first save of a hand-written map rewrites every
  line, and its diff hides the edit.
