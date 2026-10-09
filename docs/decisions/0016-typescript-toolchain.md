---
status: accepted
date: 2026-10-09
---

# 0016 Game code in strict TypeScript, tested with Vitest, linted with ESLint, versions pinned

## Context

S0 is the first game code (the prototypes are single HTML files). `docs/architecture.md` §5 sketched
TypeScript, Vite and Vitest; the determinism rules (0006) and the layer rule (0005) need a linter to
be enforced rather than remembered, and replays need a test runner in Node.

## Decision

We will write game code in strict TypeScript (only erasable syntax, so Node runs build tools directly by
type stripping), test it with Vitest, and lint it with ESLint (flat config, typescript-eslint), with
the sim's determinism and import rules in `eslint.config.js`. Versions are pinned exactly in
`package.json`, each at least two weeks old when chosen; Node ≥ 22.18. `npm test` runs lint, typecheck
and the tests.

## Consequences

The repo gets its first `package.json`, a committed `package-lock.json` and `node_modules/`
(ignored). Install with `npm ci`. With the lockfile, peer checks stay on. Resolving from scratch
(no lockfile) fails on npm 10.9.8 with "Cannot read properties of null (reading 'edgesOut')" while
resolving Vitest's optional peers; regenerate the lockfile once with `--legacy-peer-deps`, then
reinstall without it. `.nvmrc` pins the Node used to build the committed sim data (its terrain
formulas use Node's `Math`). The prototypes stay plain scripts that open from `file://`.

## Alternatives considered

Plain JavaScript with JSDoc types (no build step, weaker checks); Deno or Bun (one tool, but less
common in the browser-game toolchain); Jest (slower for ESM and TypeScript).

See: `docs/systems/sim-spine.md`, `docs/architecture.md` §5.
