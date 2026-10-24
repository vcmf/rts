---
status: accepted
date: 2026-10-23
---

# 0052 Code style: Prettier formats, ESLint keeps lines short and one statement each

## Context

The owner (2026-10-23): "TypeScript, beautiful code easy to read and maintain: normal spacing and line breaks, good
linting, good tests." The repo has no formatter. On main (084d6e0), the TypeScript and tool scripts:

| Area | Lines | Over 120 chars | Over 200 |
|---|---|---|---|
| `src/sim/` | 3,244 | 347 (11 %) | 32 |
| `src/look/` | 6,393 | 1,013 (16 %) | 180 |
| `tools/` (`*.ts`, `*.mjs`, `*.js`) | 3,566 | 640 (18 %) | 113 |
| `test/` | 3,429 | 423 (12 %) | 40 |

Several statements on one line are common (`src/look/main.ts`: a parameter's parse, check and `throw` in one line of
up to 494 characters), and so are declarations of six or seven names in one `const`. `tools/*.mjs` and `tools/*.js`
are not linted at all (`eslint.config.js` ignores them).

Kept as they are: strict TypeScript (decision 0016), typescript-eslint's recommended rules, the sim's determinism
rules (decision 0006, in `eslint.config.js` and tested by `test/lint.test.ts`), type-only imports, the Vitest suite,
the page checks (golden, guard, water, detail) and CI. Comments and naming stay as `docs/conventions.md` says.

### Measured (2026-10-23, on a copy of main 084d6e0, nothing committed)

The same settings in three formatters (width 120, no semicolons, single quotes, trailing commas, `k => …`):

| | Prettier 3.9.10 | Biome 2.6.2 | dprint 0.64.3 (TypeScript plugin 0.95.11) |
|---|---|---|---|
| `src/sim/`: files, lines changed | 21 of 22, +4,176 −1,140 | identical to Prettier | 21, +3,548 −998 |
| `src/sim/`: lines after | 6,280 | 6,280 | 5,794 |
| `src/look/`: files, lines changed | 36, +8,184 −2,241 | identical to Prettier | 36, +7,120 −1,973 |
| Time for `src/sim/` | 0.67 s | 0.12 s | 0.02 s (after a 1.6 s first compile of the plugin) |
| `prettier --check` over all 133 files | 2.1 s; 0.2 s with `--cache` | | |

- Biome's formatter printed exactly Prettier's output in every `src/` area (same files, same line counts).
- dprint keeps several declarators in one `const` when they fit in 120 characters (`const t = w.terrain, e = …,
  L = …`), the density this decision is meant to remove; Prettier and Biome put one per line.
- **Prettier does not touch what the code means**: over all 133 files, the 8,417 string literals and template-literal
  parts (the GLSL in `src/look/post.ts`, the `#define` lists in `src/look/main.ts`) are byte-identical after
  formatting, checked with TypeScript's parser; the 4,099 `//` comments are verbatim (re-indented, never rewrapped or
  joined). The only expression change is parentheses that spell out precedence (`(g.files - 1) / 2 * s` becomes
  `((g.files - 1) / 2) * s`): the same operations in the same order, so the same float64 results.
- With the ESLint rules below autofixed and Prettier run again, the whole set: 135 files, +24,406 −6,566. Lines over
  120 characters: `src/sim/` 347 → 29, `src/look/` 1,013 → 169, `tools/` 640 → 180, `test/` 423 → 52; every one
  that `max-len` (below) still reports is a comment (`src/sim/` 27: 3 whole-line, 24 at the end of a line;
  `src/look/` 124; `tools/` 39; `test/` 18); the rest are long strings and templates, which it ignores.
- Lines roughly double (`src/sim/`: 3,244 → 6,366): files get longer and each line says one thing.
- The sim's area formatted (`src/sim/`, `src/rulesets/`, `src/scenarios/`; 33 files): lint, typecheck and
  `node tools/build-sim-data.ts --check` pass, the data hashes unchanged; Vitest 299 of 300, the golden replay hashes
  among them, the one failure a cost test's time budget under load that passes alone (details in
  `docs/plans/done/code-style.md`).

## Decision

### Formatter: Prettier

Prettier, pinned exactly (decision 0016), in `.prettierrc.json`:

```json
{ "printWidth": 120, "semi": false, "singleQuote": true, "trailingComma": "all", "arrowParens": "avoid", "endOfLine": "lf" }
```

- **120 columns**, the width the comments already keep; indentation 2 spaces (as now).
- **No semicolons**, **single quotes**, **arrow functions without parentheses** around one parameter: the codebase's
  style today. Trailing commas wherever a list is broken over lines (Prettier's default; a new item is a one-line
  diff).
- **Scope**: `*.ts`, `*.mjs`, `*.js` in `src/`, `test/`, `tools/`, `maps/` and the root configs. Not formatted
  (`.prettierignore`): `prototypes/` (single HTML files, `prototypes/AGENTS.md`), `data/` (generated), `test/fixtures/`
  (`test/lint.test.ts` matches errors to the lines of `banned-in-sim.ts`), Markdown, JSON, HTML and YAML.
- **GLSL is out of its scope**: the `.glsl`, `.vert` and `.frag` files are not JavaScript, and GLSL inside template
  literals is never changed (measured above). The shaders keep their own rules (`#ifdef` blocks, no `//` comment at the
  end of a line), unchanged.
- **Prose comments are not rewrapped**: Prettier moves a comment with its code and re-indents it, nothing more.
  Comments follow `docs/conventions.md` and fit in 120 columns (the `max-len` rule below checks them).
- Scripts: `npm run format` (`prettier --write`, then `eslint --fix`, then `prettier --write` again: `curly`'s fix
  adds braces Prettier then lays out; one pass converged in the measurement; the last pass runs even when ESLint
  reports what it cannot fix, and the script still fails then) and `npm run format:check` (`prettier --check`),
  which joins `npm test` and CI's check job.

### ESLint additions

- **`@stylistic/max-len`**, 120, comments included; ignoring URLs, strings, template literals and regular
  expressions (an error message or a GLSL line is not broken to fit). ESLint's own `max-len` is deprecated and goes in
  ESLint 11, so it comes from `@stylistic/eslint-plugin`, pinned. After Prettier it reports only comments.
- **`local/comment-width`**, a rule of a few lines in `eslint.config.js`: every comment ends within 120 columns.
  `max-len`'s `ignoreStrings` skips a whole line that holds a string, the comment at its end included; this rule
  checks the comments on their own.
- **`@stylistic/max-statements-per-line`**, 1: Prettier already puts each statement on its own line (0 left in the
  measurement); the rule keeps it so where formatting is skipped (`// prettier-ignore`).
- **`one-var`: `never`**: one declaration per `const` or `let` statement, except a `for` loop's (which it allows).
  Autofixed (1,609 split in the measurement), order kept. Without it, Prettier lays a seven-name `const` out as a
  hanging list.
- **`curly`: `multi-line`**: `if (x) return` on one line stays; a body Prettier breaks onto its own line gets braces.
  Autofixed (616 in the measurement).
- **Lint `tools/*.mjs` and `tools/*.js`**: removed from the ignores, with typescript-eslint's recommended rules as
  everywhere. `tools/*.mjs` are Node's ES modules: Node's builtin globals (from the `globals` package, pinned; not
  CommonJS's `require` or `__dirname`) and `no-undef`, which catches a mistyped name in untyped JavaScript (0 found
  today). `tools/*.js` are evaluated inside a page (`tools/river-check.js`, …) and read the page's own globals:
  `sourceType: script`, no `no-undef` (it would flag every page global they read).
  4 findings to fix (3 unused variables, 1 unused expression).
- Nothing else: the list stays short. typescript-eslint's recommended set has no formatting rules, so no
  `eslint-config-prettier` is needed.

### Rollout

One formatting PR per area, each a code PR (decision 0025), **after the open PRs merge** (#134 shadows,
`look/close-zoom`, `look/armies-32k`, #128 docs):

1. **Config and the sim**: `.prettierrc.json`, `.prettierignore`, the scripts, the ESLint rules (scoped by `files` to
   the formatted areas), `format:check` in `npm test` and CI; then `src/sim/`, `src/rulesets/`, `src/scenarios/`,
   `maps/`. Proof: Vitest (the golden replay hashes unchanged), `check:data`, lint, typecheck.
2. **The look**: `src/look/`, `src/render/`, `src/app/`. Proof: golden screenshots pixel-identical against main
   (`node tools/golden.mjs`), the guard, water, water-look and detail checks pass, on the built page (vite build and
   preview).
3. **Tools and tests**: `tools/`, `test/`, the root configs, and linting `tools/*.mjs` and `tools/*.js`. Proof: each
   tool's `--selftest`, `node tools/check-negatives.mjs`, Vitest.

Each area joins in its own PR, so main is green between them: it is added to `formatted` in `eslint.config.js` (the
style rules' `files`) and taken out of `.prettierignore`'s list of areas not formatted yet;
`test/format-scope.test.ts` checks that the formatter and the rules cover the same files. The formatting PR changes
layout only, plus the comments `max-len` asks to shorten (a separate commit); the commit that lands on main goes in
`.git-blame-ignore-revs` (GitHub's blame reads it; locally `git config blame.ignoreRevsFile .git-blame-ignore-revs`),
after a squash merge in a one-line follow-up (`docs/plans/done/code-style.md`).

**A branch in flight** when an area is formatted: merge main up to the commit before the formatting, then merge the
formatting commit keeping the branch's side of every conflict (`git merge -X ours <commit>`; with a rebase,
`-X theirs`), run `npm run format`, commit, then merge the rest of main. The formatting changes no meaning, so the
result is the branch's code formatted; PRs are squash-merged, so the branch's history does not matter.

## Consequences

- Good: one layout everywhere, set by a tool, not by review; every statement and declaration on its own line, lines
  within 120 columns; diffs show logic, not re-wrapping; `tools/` linted like the rest.
- Good: the formatting is mechanical and proven per area (replay hashes, pixel-identical goldens, selftests).
- Bad: files about twice as long; a dense block such as `atEdge` in `src/sim/tick.ts` reads down instead of across.
- Bad: three large formatting PRs, a blame boundary (hidden by `.git-blame-ignore-revs`), and one merge recipe for
  every branch in flight. About 200 comment lines to shorten by hand.
- Bad: two more dev dependencies (`prettier`, `@stylistic/eslint-plugin`) and `globals`; `npm test` about 2 s longer.

## Alternatives considered

- **dprint**: the fastest (0.02 s for `src/sim/`), highly configurable; keeps multi-name declarations on one line,
  which is what this decision removes, and loads its TypeScript plugin as a WebAssembly file from plugins.dprint.dev:
  a second ecosystem and a download in CI.
- **Biome's formatter**: Prettier's output (identical here), five to twenty times faster; a native binary with its own config,
  and its linter cannot replace ESLint (the determinism rules, typescript-eslint), so it would be a second tool for
  2 s saved. Its output being Prettier's, a later switch costs nothing.
- **ESLint Stylistic as the formatter** (its formatting rules, no Prettier): every layout choice a rule to configure
  and keep, and it does not lay out long expressions; Prettier does.
- **`no-nested-ternary`**: 98 hits, none autofixable, most a readable chain (`a ? x : b ? y : z`) that Prettier lays
  out one case per line. Left out.
- **No formatter, rules only** (`max-len`, `max-statements-per-line`): about 2,400 lines over 120 to rewrap by hand, and no
  agreement on how.
