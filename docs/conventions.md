---
status: current
last_reviewed: 2026-10-08
---

# Conventions

## Commits and PRs

- Conventional Commits: `type(scope): subject`. Scope mandatory and specific (`water`, `terrain`,
  `foliage`, `postfx`, `sim`, `camera`, `docs`, `tools`, …); subject imperative, lowercase, no
  trailing period; breaking → `!` or `BREAKING CHANGE:`. One logical change per commit. No emoji.
- PR titles in the same format; PRs are squash-merged, so the title becomes the commit.
- No AI attribution lines in commits or PRs.

## Units and numbers

- **Metres, seconds, radians, men** in all authored data; converted once at load (never author in
  ticks: `docs/architecture.md` §4).
- **World axes:** y up, x and z on the ground; the battle area is centred on the origin.
- **Simulation numbers:** restricted float64, decision 0006; the full list of allowed
  and banned operations is in `docs/proposals/sim-design.md` §2 (one home, not copied here).
- **Tick:** 20 Hz, 50 ms of battle time; the rate lives in one constant.

## Code

- Readable code first: small functions, one statement per line, a doc comment on each function that is not
  trivial; comments say why, not how. The full rules: `AGENTS.md`, Code quality.
- Reference docs by repo path in comments (`docs/art-bible.md` §6c), never by bare file name.
- Prototype-only rules: `prototypes/AGENTS.md`.

## Docs

- **Types** (see `docs/INDEX.md`): vision, conventions, system (current, kept true), decision
  (accepted: binding; proposed: open; append-only), proposal (before building, frozen after), plan (active/done), research
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
