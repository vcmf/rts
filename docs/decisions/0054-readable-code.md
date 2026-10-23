---
status: accepted
date: 2026-10-23
---

# 0054 Readable code: small functions, one statement per line, doc comments

## Context

The owner found new prototype code hard to read: packed one-liners without spaces or doc comments, written to match
the older prototype code around it and the convention "one short comment on non-obvious code". Decision 0016 puts
game code in strict TypeScript with Vitest and ESLint; it says nothing about layout, function size or comments, and
no formatter or linter covers the prototypes or the older `.js`/`.mjs` tools.

## Decision

We will write code to be read and maintained: small functions with one job, one statement per line, named
intermediate values, and a `/** */` doc comment on every function that is exported or not trivial; comments say
why, not how. This holds in every file, prototypes included; a function written in the older packed style is
reformatted, in its own commit, before a change of behaviour inside it. New Node tools are TypeScript (0016);
existing `.js`/`.mjs` tools and Blender's Python stay as they are until rewritten. Behaviour that Vitest can test
comes with tests, and a bug fix with a test that fails without it. The rules live in `AGENTS.md`, Code quality.

## Consequences

Good: code an agent or the owner can read and change without decoding it; diffs that review well. Bad: reviews must
check layout in the files no tool covers yet; touching old packed code costs a reformat commit first.

## Alternatives considered

- A formatter (Prettier) on everything: enforces layout mechanically, but reformats nearly every file at once and
  cannot reach inline scripts in the prototypes' HTML without more tooling. Left open, for the owner.
- Linting the prototypes and older tools: catches more, but needs their inline scripts extracted or a plugin, and
  would fail on the existing code from day one. Left open.
