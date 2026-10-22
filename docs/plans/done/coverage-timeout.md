---
status: done
last_reviewed: 2026-10-14
---

# Plan: a longer test budget under coverage

## Problem

CI's coverage job fails on main (d3b2044, and its re-run): `test/morale.test.ts` › determinism › "the brigade: its
replay reproduces" passes its 120 s budget (`vitest.config.ts`). The job runs close to that budget throughout: in
the failing run the brigade took 196 s, "a line, a regiment's line and a battery marching at the edge…" 118 s,
"infantry: every change in its time…" 102 s, five more 65–82 s. V8's block counters make the sim's hot loops about
six times slower under coverage (`test/fx.ts`); the budget was set for the plain run (the brigade: 11.5 s here).

## Scope

The test budget under coverage. Out of scope: which tests the coverage run skips (`longIt`), the check job's budget.

## Approach

`testTimeout` 600 s under coverage (`COVERAGE` set, or `--coverage`), about three times the slowest test measured
there on CI (196 s), and 120 s otherwise. Every test stays in the coverage
run, so the brigade scenario's paths (its only test reaches the first rout at tick 13701 of 14000, measured) stay
covered; a shorter replay would not reach them. `npm test` and the check job are unchanged. A budget for the long
scenario tests alone was considered: every test is synchronous (vitest can only flag one after it ends), so the
global budget delays no hang report.

## Acceptance

- `npm test` unchanged (120 s); the coverage job passes, run by hand on this branch (`workflow_dispatch`: PRs into
  main do not run it) and again on main after the merge.

Done: the coverage job passed, run by hand on this branch with the 360 s budget of the first commit (run
38568065705; the brigade 93 s, the next two 60 s and 52 s: the runner's speed varies about twice between runs, the
failing one 196 s). The run on main after the merge is the last check.

## Review rounds

- **Round 1** (`/code-review high`, of a first approach: the brigade test as `longIt`). Its findings changed the
  design: that test is the brigade scenario's only one, so skipping it under coverage loses those paths; a shorter
  replay would not reach the first rout; and several other tests were near the budget too. Redesigned as above.
- **Round 2** (`/code-review high`, the redesign; 7 findings, none severe: fixed what was worth it, stopped). Fixed:
  the margin (360 s was 1.8 times the slowest; now 600 s, about three times); the budget keys on `--coverage` too; the
  brigade test says why it is not `longIt`, and `test/fx.ts` states the exception; the CI header and `AGENTS.md`
  mention the budget; the slowdown's explanation stays in `test/fx.ts`. Left: a budget per long test (above).
