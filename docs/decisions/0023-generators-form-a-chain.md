---
status: accepted
date: 2026-10-13
---

# 0023 Generators form a chain; kinds that keep apart share one scatter's mix

Supersedes [0022](0022-generators-expand-by-dependency.md).

## Context

Decision 0022 ran generators by dependency and let generators that read each other form a group, ordered inside by
hard reads, then ids, with mutual separation. Its review (M3b, after the redesign, round 3) found two more severe
ordering faults inside such groups: a `within` by kind turned into a keep-clear, and the order inside a group
depended on ids, so clearance could be lost (`docs/plans/active/m3-generators.md`). That is three rounds of the same
class of fault; the design, not the code, was wrong. Every fault lived inside a group of generators that read each
other.

## Decision

We will refuse groups, and give the one common mutual case its own construct:
- **Finished features only**, as in 0022: a generator sees the author's features without a generator and the
  generators that have already run (their output and children).
- **Declared reads**, as in 0022: each generator lists the selectors it reads (ids, categories, kind prefixes). F
  reads G when one of them could match G's id, its children's ids, or the kinds G and its children will have. A
  generator never reads itself (a scatter's children keep apart by its own rules), nor the kind of a scatter's
  region (it leaves the map).
- **Peers:** a generator may declare that others of its name are its peers (street villages). Peers never read each
  other. Each declares where its output can reach whatever its seed (a village: a band around its stretch of road,
  and its own area); two peers whose reaches come within the gap (1 m for buildings) are an error on both, before
  anything runs. Apart, neither can change the other's output, so the order, the seeds and pinning one of them
  never matter. Two villages are common; they would otherwise be a cycle through `built`.
- **A chain:** generators run in dependency order. A cycle of reads (two or more generators) is an error on each
  member. The error names what it reads, by which selector, and how to break the cycle.
- **Joint placement:** a scatter takes `mix: [{ kind, count, radiusMin?, radiusMax?, min?, coherence?,
  raggedness?, set? }, …]` and places every entry's clumps in one pass. Every child keeps the scatter's `clearance`
  from every other, whatever their kinds; each entry has its own budget of tries, so one that cannot be placed
  never starves the others. A mix's children take their entry's kind and `set` only, so the scatter's feature may
  carry no attributes of its own. Woods and fields that must stay apart are one scatter, not two that
  avoid each other.
- **Errors**, as in 0022: a generator reading a failed one (or a cycle) is skipped, so the first error is the one
  reported. A selector naming a feature must name one of the expanded map, checked once everything has run.

## Consequences

- **The output depends on neither the file's order nor the ids** (beyond seeds): there is no group to order.
- **Some maps that 0022 accepted are now errors:** two scatters that avoid each other's kinds, or a village with a
  scatter of ponds that avoids `built`. The message says how to fix it: drop one side's read (keeping clear on one
  side is enough), or, when all are scatters, one scatter's mix.
- **Two street villages whose stretches lie close are an error** on every seed alike, even where the houses of one
  seed would have fitted: the author moves their stretches apart (about 40 m between two stretches of one lane).
- **Every generator must declare its reads correctly**, as before.

## Alternatives considered

- **0022's groups with hard and soft reads and mutual separation:** each review round found another ordering fault
  inside a group.
- **Iterating a group to a fixed point:** it may not converge, and costs a run per pass.
