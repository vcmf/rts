---
status: active
last_reviewed: 2026-10-19
---

# Plan: the combed meadow as the default grass

## Problem

The combed meadow (`?grass=flow`, `docs/plans/done/grass-flow.md`) was built as an experiment next to the brush
pattern. The owner judged it on screen (2026-10-18: "it looks nice", 120 fps at every zoom) and asked (2026-10-19) to
make it the default.

## Scope

- `?grass` defaults to `flow`; `?grass=brush` keeps the brush pattern (the comparisons, the benches). Where the meadow
  cannot run (WebGL1, `?meadow=off`) the default is the brush pattern, as the combed meadow needs it; an explicit
  `?grass=flow` there still fails loudly.
- The system doc and a decision record (0041).

Not in scope: removing the brush pattern's code (it stays the fallback).

## Acceptance

- Goldens: the default against main differs only in the meadow (the combed pattern); `?grass=brush` against main's
  default identical.
- The readability guard against main: ok at the start and cover views.
- `npm test`, the docs check.
