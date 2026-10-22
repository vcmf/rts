---
status: superseded by 0028
date: 2026-10-12
---

# 0049 Generators expand by dependency, over finished features, with hard and soft reads

## Context

The map engine's generators (`docs/proposals/map-engine.md` §3.4) read each other's output: a village keeps its
houses clear of water and buildings, a scatter keeps its clumps clear of what it avoids and near what it stays
within. Track M's M3b review stopped three times on the order generators run in. Each time, a generator saw another
generator's unexpanded input (a guide line, a scatter's region) or missed an output it should have kept clear of.
Fixed passes and id order could not express it (`docs/plans/done/m3-generators.md`, the redesign and its rounds).

## Decision

We will expand generators by dependency, showing each only finished features:
- **Finished features only:** a generator sees the author's features without a generator and the generators that
  have already run (their output and children); one still to run is invisible.
- **Declared reads:** each generator declares what it reads, as selectors (ids, categories, kind prefixes).
  - **Hard reads** name what it cannot run without: a village's road, a scatter's `within` by name.
  - **Soft reads** are what it keeps clear of, and a `within` by kind.
- **Order:** F waits for G when F's reads could match G's id, its children's ids, or the kinds G and its children
  will have. The strongly connected groups of that graph run in dependency order. Inside a group, hard reads go
  first, then ids.
- **Separation is mutual:** inside a group, a generator also keeps clear of the earlier members that wanted to keep
  clear of it, so every pair that one side avoids ends up apart, whichever runs first.
- **Errors:**
  - a loop of hard reads is an error naming its members;
  - a generator reading a failed one is skipped;
  - a selector that names a feature must name one in the expanded map, checked once everything has run.

## Consequences

- **The file's order never changes the output.**
- **Ids matter only through seeds, and through the order inside a group of generators that read each other.** A
  rename there can change which one places first, never whether constraints hold.
- **Every generator must declare its reads correctly.** A missing read is a missing dependency; the tests check
  each generator's reads against what its `run` uses.

## Alternatives considered

- **Fixed passes** (reshapers, then readers, then scatters): each review found a pair of generators the passes
  ordered wrongly.
- **Joint placement of mutual readers:** fair, but much more complex for a rare case.
- **Refusing every cycle:** it rejects common maps (two scatters of woods that each avoid `veg`).
