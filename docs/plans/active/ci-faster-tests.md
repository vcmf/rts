---
status: active
last_reviewed: 2026-10-29
---

# Plan: CI's tests in shards, the bench split

## Problem

CI's coverage job passes its 60 min limit and is cancelled (runs 40769326472 and 40591568092). It took 22 min on
Oct 27 (run 40585382081), 33 min (40753618633), 51 min (40747213493). The check job's Vitest step grew from 4 to
12 min of its 20.

Everything but Vitest takes about a minute. In the last coverage run that passed (40802708005, 1994 s of Vitest),
`test/bench.test.ts` alone took 1480 s: its 111 tests run one after another, because Vitest runs files in parallel and
a file's tests in turn, so that file was the whole job's length. All the files together took 3873 s. In the check job
the same file took 351 s of about 600.

The bench also played each case three times: once forward for invariant 1 (no overlap), and forward and reversed for
invariant 4 (the visiting order changes nothing). The two forward plays are the same play.

## Scope

The bench's tests (`test/bench*.ts`) and the CI workflow (`.github/workflows/ci.yml`, `codecov.yml`). Out of scope:
what the tests check, which tests the coverage run skips (`longIt`), the test budgets.

## Approach

1. **One forward play per case.** `test/bench-fx.ts` plays a case forward once, watching for the first overlap, and
   keeps its end state; invariant 1 reads the overlap and invariant 4 compares the reversed play's state with it.
   Watching only reads the world (the placement cache in `w.scratch` is keyed on what it places): checked once for
   all 44 cases, the watched play ends with the same section hashes as a plain play.
2. **The bench in five files.** The plain cases' invariants in two shares (`test/bench-plain-{1,2}.test.ts`), the
   claim cases' in two (`test/bench-claim-{1,2}.test.ts`), X-14, the queue and the melee in `test/bench.test.ts`.
   Same tests, same titles under the same describes.
3. **Tests and coverage in three shards each.** `vitest run --shard=i/3` in a matrix (the repo is public: the runners
   cost nothing). Vitest gives each shard a third of the files by a hash of their paths. Each coverage shard uploads
   its own `lcov.info`; Codecov merges them, and `codecov.yml` waits for all three before it reports. The check job
   keeps lint, format, types, data, docs and build.
4. **Vitest's results cache restored per shard.** Without it Vitest starts the largest files first, and the bench's
   files are four lines long; with it, the longest first.

Not done: running coverage only once per merge into an epic (today on the PR and on the push after it). Codecov needs
the epic's own commits covered to compare a PR with, and with shards the run no longer comes near its limit.

## Acceptance

- The same 111 bench tests, 90 passing and 21 expected to fail, as before.
- `npm test` passes.
- On CI: the test shards and the coverage shards each well under their limits (20 and 30 min), and Codecov reports
  one merged coverage close to the 57.3% statements of run 40802708005.

## Measurements

On the dev Mac (10 cores), the bench alone: 264 s in one file before; 56 s in five after. Under coverage, after: the
five files 150, 191, 190, 242 and 83 s, 243 s in all side by side.

Estimate for CI, from run 40802708005's times per file with the bench's new ones: 3266 s of tests, the shards' sums
790, 1256 and 1170 s, each over the runner's workers (Vitest uses all cores but one). To be measured on this PR.

## Open questions

- If one shard keeps being the slowest, a fourth shard, or splitting its longest file.
