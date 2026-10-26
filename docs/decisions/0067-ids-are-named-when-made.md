---
status: accepted
date: 2026-10-26
---

# 0067 The map editor names a feature or a map when it is made; renames are done in the file

## Context

The map editor's fields form (M7c, `docs/plans/active/m7-editor.md`) first let the selection's id be changed, a rename
following every place that names the feature. Two designs and six review rounds kept finding another thing an id is:
the references to it (`on`, `carries`, `crosses`, `along`, shared edges, a generator's selectors), the ids of its
children (generated `<id>-<n>`, or pinned ones by their recorded parent), their recorded parameters, and its seed (a
generator's output and the base relief's noise are hashed from it, so a renamed meandering stream is drawn anew). A
rename is an edit of a feature's identity, not of one of its fields. A new map's id is its file's name, so changing it
before its first save is a rename too.

## Decision

The page does not rename. A feature's id is set when it is made (the add box proposes one from its kind), a map's when
it is made (the new map box); both are shown read-only in the form, with where to rename them: the file. A later PR may
bring renames into the page once the engine says what an id seeds and names, so the editor can say what a rename
redraws.

## Consequences

- Good: an edit in the form changes the fields it shows and nothing else; the saved diff is those lines.
- Good: no id the engine derives from another (a child's, a seed) moves without the author knowing.
- Bad: renaming is a hand edit of the file, with every reference to the feature (the validator names any left behind).
- Bad: a new map whose id another map took before its first save cannot be saved under another id in the page.

## Alternatives considered

- **A rename that follows every reference** (built, then removed): each round found one more meaning of an id.
- **Renames refused for features whose id seeds or names something**: most generating features (streams, woods,
  villages) and the base relief, so little would be left to rename, behind a rule the page would have to keep in step
  with the engine's.
- **Renames applied with a warning that the output is drawn anew**: honest, but the engine does not yet say what an id
  seeds; the warning would be a copy of the engine's rules.
