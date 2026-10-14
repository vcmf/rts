---
status: active
last_reviewed: 2026-10-14
---

# Plan: the brigade replay out of the coverage run

## Problem

CI's coverage job fails on main (d3b2044, and its re-run): `test/morale.test.ts` › determinism › "the brigade: its
replay reproduces" times out at its 120 s budget (`vitest.config.ts`). It took 100.4 s in #83's passing coverage run,
so the runner's spread tips it over. It takes 11.5 s without coverage (this machine).

## Scope

That one test. Out of scope: the other tests' budgets, the coverage job itself.

## Approach

Mark it a long test, as the repo's convention asks of a test of 5 s or more (`longIt` in `test/fx.ts`): skipped in
the coverage run, where V8's block counters slow the sim's hot loops about six times, and still run in `npm test`
and in CI's check job, so the brigade's replay is still checked on every PR.

## Acceptance

- The test passes without coverage, and is skipped under `COVERAGE=1`.
- CI's check and coverage jobs pass on the PR.

## Review rounds
