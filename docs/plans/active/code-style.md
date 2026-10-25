---
status: active
last_reviewed: 2026-10-24
---

# Plan: code style, a formatter and readability lint rules

Asked by the owner on 2026-10-23: "TypeScript, beautiful code easy to read and maintain: normal spacing and line
breaks, good linting, good tests." The choices, their measurements and the alternatives are in decision 0052
(`docs/decisions/0052-code-style.md`, accepted); this plan is the work.

## Problem

No formatter: 11 % of `src/sim/`'s lines, 16 % of `src/look/`'s and 18 % of `tools/`' are over 120 characters (up
to 494), several statements and up to seven declarations share a line, and `tools/*.mjs` and `tools/*.js` are not
linted.

## Scope

In: Prettier with the decision's config; `npm run format` and `npm run format:check`, the check in `npm test` and CI;
the ESLint rules `@stylistic/max-len` (120), `@stylistic/max-statements-per-line` (1), `one-var` (`never`) and
`curly` (`multi-line`); linting `tools/*.mjs` and `tools/*.js`; `.git-blame-ignore-revs`; formatting `src/`,
`maps/`, `test/`, `tools/` and the root configs; shortening the comments over 120 columns (about 220).

Out: GLSL (`.glsl`, `.vert`, `.frag` and GLSL in template literals keep their own rules), `prototypes/`, `data/`,
`test/fixtures/`, Markdown, JSON, HTML, YAML, Python (`tools/*.py`, `tools/unitpipe/`). No renaming, no change to
comment density or naming (`docs/conventions.md`), no logic change.

## Approach

This PR is docs only: decision 0052 (proposed), this plan, the line in `docs/conventions.md`. The code comes in three
PRs, each a code PR (decision 0025), opened **after** the open PRs merge (#134 shadows, `look/close-zoom`,
`look/armies-32k`, #128 docs), so none of them has to rebase across a formatting commit:

1. **PR 1, config and the sim** (`style(sim): …`): `prettier` and `@stylistic/eslint-plugin` pinned in
   `package.json` (`globals` waits for PR 3, the first to need it); `.prettierrc.json`, `.prettierignore`; the
   scripts; `format:check` in `npm test` and as a step of CI's check job; the ESLint rules in a block whose `files`
   come from `formatted` in `eslint.config.js`, and `test/format-scope.test.ts`, which checks `.prettierignore`
   leaves exactly those areas formatted. Then `npm run format` on `src/sim/`, `src/rulesets/`, `src/scenarios/`,
   `maps/` (the formatting commit, alone), the comments over 120 by hand (a second commit: 31 in the measurement),
   `.git-blame-ignore-revs` with the formatting commit's hash (a third).
2. **PR 2, the look** (`style(look): …`): `src/look/`, `src/render/`, `src/app/` join the globs; the same three
   commits (about 130 comments).
3. **PR 3, tools and tests** (`style(tools): …`): `tools/`, `test/` and the root configs (`eslint.config.js` stops
   ignoring itself) join; `tools/*.mjs` and `tools/*.js` linted (`globals` pinned; 4 findings to fix); the same
   three commits (about 60 comments).

The formatting commit's hash changes when the PR is squash-merged: `.git-blame-ignore-revs` gets the squashed
commit's hash in a follow-up commit on main (a one-line docs-kind change), or the PR is merged with a merge commit
that keeps the formatting commit; the owner chooses at PR 1.

A branch in flight at each step follows the decision's recipe: merge main up to the commit before the formatting,
merge the formatting commit with `-X ours`, `npm run format`, commit, merge the rest of main.

## Acceptance

Per PR, every check run with its full output and exit code (`AGENTS.md`):

- **All**: `npm run format:check` passes and `npm run format` changes nothing (idempotent); `npm test` passes (lint
  with the new rules, typecheck, Vitest); `node tools/check-docs.mjs` passes. Every string literal and
  template-literal part unchanged (a script compares them before and after with TypeScript's parser, as in the
  measurement: 0 of 8,417 differed). The formatting commit touches no file outside its area.
- **PR 1**: the golden replay hashes unchanged (`test/golden/*.json`, read by the Vitest suite, not regenerated);
  `npm run check:data` reports the same hashes as main; `test/lint.test.ts` passes (its fixture not formatted).
- **PR 2**: on the built page (vite build and preview), `node tools/golden.mjs <main> <branch>` pixel-identical
  for the look page, also with `?armies=20`. The sim page has no `__proto` for golden to drive: its built bundle
  byte-identical to main's and `npm run check:app` (every session's replay reproduces the page's hashes) cover it.
  `node tools/guard.mjs --base`, the `--selftest` of `tools/detail-check.mjs`, `tools/water-check.mjs` and
  `tools/water-look-check.mjs` give main's results (a check that fails on main, fails the same).
- **PR 3**: each tool's `--selftest` passes (`tools/golden.mjs`, `tools/detail-check.mjs`, `tools/water-check.mjs`,
  `tools/water-look-check.mjs`), `node tools/check-negatives.mjs` passes, `npm run check:data`, Vitest.
- After PR 3: no line over 120 columns in the formatted areas except long strings, templates, URLs and regular
  expressions (`max-len` clean); `docs/systems/` docs that quote formatted code still point at the right lines.

### Measured for PR 1 (2026-10-23, a copy of main 084d6e0)

Prettier, then `eslint --fix` with the four rules, then Prettier again, on `src/sim/`, `src/rulesets/` and
`src/scenarios/`: 33 files, +4,905 −1,288. On that copy, with the repo's current `eslint.config.js`:
`npx eslint .` exit 0, `npx tsc --noEmit` exit 0, `node tools/build-sim-data.ts --check` exit 0 (formation-field
0x6ae782ed, battlefield 0xff0c79dc: the same as committed), Vitest 299 of 300 passed, the golden replay hashes
among them. The one failure was a cost test (`test/soldiers.test.ts`, 40 battalions of 400: 12.82 ms against a 12 ms
budget, with the whole suite running in parallel on a loaded machine; CI skips the cost tests); run alone it passed
twice on the formatted copy and twice on main, alternating.

### Measured for PR 2 (2026-10-24, #160, on main 1fa1312)

`npm run format` on `src/look/`, `src/render/`, `src/app/`: 42 files, +10,993 −2,873; then 100 hanging comments
moved and 156 comments over 120 columns shortened. Lines over 120: `src/look/` 1,159 → 46, `src/render/` 102 → 0,
`src/app/` 50 → 6 (all strings, templates or URLs). Rule hits 2,844 → 0. `npm test` exit 0 (309 of 309),
`check:data` the same hashes, `check-docs` and `build` exit 0. The built `dist/` against main's: 68 of 70 files
byte-identical (every sim-page file among them); the look chunk the same size, differing only in the build stamp.
The AST of all 42 files matches main's, 3,185 literal parts and every file's comment words unchanged. Golden
match (0/16 regions on all 8 cameras, with and without `?armies=20`); `guard --base`, detail and water `--selftest`
exit 0; `water-look-check --selftest` exit 1 on `banks` (#118) and `winter` (#120), its output identical to main's;
`check:app` exit 0.

## Open questions

- `.git-blame-ignore-revs` and squash-merging: decided (2026-10-23, the owner): squash as usual, and a one-line
  follow-up after each formatting PR lists its squashed commit (PR 1: 8abc1cf).
- Format on save in editors: left to each editor; the check in `npm test` and CI is what holds.

## Review rounds
