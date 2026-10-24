---
status: accepted
date: 2026-10-24
---

# 0054 Readable code: small functions, doc comments in new code, a test for every bug fix

## Context

The owner found new prototype code hard to read: packed one-liners without spaces or doc comments, written to match
the older prototype code around it and the convention "one short comment on non-obvious code". Decision 0052 has
since settled layout by tools: Prettier formats `src/`, `tools/`, `test/`, `maps/` and the root configs; ESLint keeps
lines within 120 columns and one statement and one declaration per line, and lints `tools/*.mjs` and `tools/*.js`. It
left comments and naming as `docs/conventions.md` said. What no tool checks: how big a function is, what it is named,
what its comments say, whether it is tested, and anything in the prototypes, which are neither formatted nor linted.

## Decision

We will write code to be read and maintained, in every file, prototypes included:

- **Functions** small, with one job, named for what they do or return; split rather than comment the parts; named
  intermediate values rather than long nested expressions.
- **Doc comments in new or touched code**: every exported or non-trivial function gets a `/** */` comment saying what
  it does, its parameters with units and what it returns when not obvious. Existing `//` comments stay until that
  code next changes. Comments say why, not how, short and within 120 columns. This amends decision 0052's "comments
  and naming stay as `docs/conventions.md` says" and replaces the convention "one short comment on non-obvious code".
- **TypeScript** for new Node tools as for game code (decision 0016); the existing `.js`/`.mjs` tools, generated data
  and Blender's Python stay as they are until rewritten.
- **Tests**: behaviour Vitest can test comes with tests, and every bug fix with a test that fails without the fix;
  logic buried in browser glue is pulled out into a pure function to be tested.

The rules live in `docs/conventions.md`, Code; `AGENTS.md` points to them.

## Consequences

Good: code an agent or the owner can read and change without decoding it; diffs that review well; a fixed bug stays
fixed. Bad: review checks what no tool does, and in the prototypes everything; the codebase mixes `//` comments and
doc comments until old code is touched.

## Alternatives considered

- Doc comments on every function at once: one large comment-only PR across the codebase for little gain on code
  nobody is changing.
- Type-checking the prototypes with `// @ts-check` and JSDoc types (no build step needed), or linting their inline
  scripts (extracting them, or an HTML plugin): left open, for the owner.
