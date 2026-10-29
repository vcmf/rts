---
status: current
last_reviewed: 2026-10-24
---

# Conventions

## Commits and PRs

- Conventional Commits: `type(scope): subject`. Scope mandatory and specific (`water`, `terrain`,
  `foliage`, `postfx`, `sim`, `camera`, `docs`, `tools`, …); subject imperative, lowercase, no
  trailing period; breaking → `!` or `BREAKING CHANGE:`. One logical change per commit. No emoji.
- PR titles in the same format; PRs are squash-merged, so the title becomes the commit. The exception: an
  epic branch merges into main with a merge commit, keeping each squashed PR as one commit (decision 0020).
- No AI attribution lines in commits or PRs.

## Units and numbers

- **Metres, seconds, radians, men** in all authored data; converted once at load (never author in
  ticks: `docs/architecture.md` §4).
- **World axes:** y up, x and z on the ground; the battle area is centred on the origin.
- **Simulation numbers:** restricted float64, decision 0006; the full list of allowed
  and banned operations is in `docs/proposals/sim-design.md` §2 (one home, not copied here).
- **Tick:** 20 Hz, 50 ms of battle time; the rate lives in one constant.

## Code

Decisions 0052 (layout, by tools) and 0054 (what the tools cannot check). They hold in every file, prototypes
included, whatever the older code around it does.

- **Layout** (decision 0052, `docs/decisions/0052-code-style.md`): Prettier lays code out (120 columns, no
  semicolons, single quotes; `npm run format` before committing, `format:check` in `npm test` and CI); ESLint keeps
  every line within 120 columns, comments included, and one statement and one declaration per line. The areas it
  covers are `formatted` in `eslint.config.js`; the rest is in `.prettierignore` (prototypes, generated data,
  `test/fixtures/`). GLSL keeps its own rules.
- **Formatting PRs**: layout only, no change of behaviour. A new area joins `formatted` and leaves `.prettierignore`
  in the same PR (`test/format-scope.test.ts` checks the two agree). After the squash merge, a one-line follow-up adds
  the squashed commit to `.git-blame-ignore-revs`.
- **Functions**: small, one job each, named for what they do or return. When a function needs comments to explain
  its parts, split it into named functions instead; prefer named intermediate values to long nested expressions.
- **Comments**: the why, not the how; short, within 120 columns. In new or touched code, every exported or non-trivial
  function gets a doc comment (`/** */`): what it does, its parameters with units, what it returns when not obvious.
  Existing `//` comments stay as they are until that code next changes.
- Reference docs by repo path in comments (`docs/art-bible.md` §6c), never by bare file name.
- **TypeScript**: game code is strict TypeScript (decision 0016), and so are new Node tools (`tools/*.ts`). The
  existing `.js`/`.mjs` tools, the generated `*.data.js` files and Blender's Python stay as they are until rewritten.
  Type-only imports are `import type`. In `src/sim/` and `src/rulesets/`, lint enforces the determinism rules
  (decision 0006: no inexact `Math`, `Map`, `Set`, wall-clock time or `Float32Array`) and the layer rules (decision
  0005: the sim imports only the sim; a ruleset only the sim, the campaign and rulesets; the map engine and the campaign
  only themselves and the sim's exact maths), tested by `test/lint.test.ts`.
- **Tests**: behaviour Vitest can test comes with tests, and **every bug fix comes with a test that fails without the
  fix**. Logic buried in browser glue is pulled out into a pure function and tested there
  (`docs/plans/active/test-gaps.md`). Tests are fast, deterministic and check one behaviour each. Cost tests skip
  when `CI` is set (run them locally); long ones are `longIt`, skipped under coverage (`AGENTS.md`, Commands).
  Rendering and the look are checked with the page checks (`tools/`), each new check with a negative test
  (`tools/check-negatives.mjs`).
- Prototype-only rules: `prototypes/AGENTS.md` (not formatted or linted: these rules are checked in review there).

## Docs

- **Types** (see `docs/INDEX.md`): vision, conventions, system (current, kept true), decision
  (accepted: binding; proposed: open; append-only), proposal (the design, kept true as it changes: nothing is frozen), plan (active/done), research
  (background).
- **Front matter** on every doc under `docs/`: `status` and `last_reviewed` (YYYY-MM-DD); decision
  records use `date` instead of `last_reviewed`. System docs also list `code:` paths and `decisions:`.
- **One fact, one home.** Link instead of copying; tuning values live in code or data and are
  linked, not copied.
- **Decisions are never edited** after acceptance: a changed decision gets a new record that
  supersedes the old one (`docs/decisions/README.md`).
- **When a proposal ships,** its lasting content moves into `docs/systems/<x>.md` and the proposal
  is marked implemented.
- **Paths:** reference docs by repo-root path in backticks (`docs/proposals/sim-design.md`);
  `node tools/check-docs.mjs` checks that every such path exists.
- Keep `AGENTS.md` a short map (≤ 100 lines); detail goes in docs or folder `AGENTS.md` files.
- **Old names on purpose** (history, plans) are written ~~struck through~~; the checker skips them.
- Every doc is listed in `docs/INDEX.md`, `docs/systems/README.md` or `docs/decisions/README.md`.
- Run `node tools/check-docs.mjs` **after the last edit**, before every commit that touches docs.
