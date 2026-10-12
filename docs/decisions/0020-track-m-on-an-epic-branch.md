---
status: accepted
date: 2026-10-12
---

# 0020 The map engine is Track M, built on an epic branch

## Context

The map engine (`docs/proposals/map-engine.md`) is a workstream of several PRs: the language, the draft view,
the sim compiler, the generators, the rendered view. It runs beside Track S (simulation) and Track E (the look),
which keep merging into main. Its middle phases change shared data (every `.simdata` file, the golden replays) in
steps that are not useful on main one at a time.

## Decision

We will build the map engine as **Track M**, in its own worktree, on a long-lived branch `epic/map-engine`:
- each phase's PR (`map/<phase>-<topic>` branches) targets `epic/map-engine`, is reviewed as any PR (decision 0014)
  and is squash-merged into it;
- main is merged into the epic regularly (a merge commit, never a rebase), so the epic follows the other tracks
  and conflicts surface early;
- when the track's phases are done, the epic merges into main with a merge commit, so each phase stays one commit
  in main's history.

CI already runs on PRs into and pushes to `epic/**` branches (`.github/workflows/ci.yml`).

## Consequences

Track M can change shared data in several steps without leaving main in between states, and the other tracks
are not blocked by it. The cost is a late, larger merge into main, and work on main that touches the same files
(the sim data builder, `src/look/world/`, the rulesets) has to be merged into the epic as it lands. Merging main
in often keeps that cost small.

## Alternatives considered

PRs straight into main, phase by phase (main would carry half-migrated maps between M2 and M4); one long branch
with no PRs (no reviews per phase).
