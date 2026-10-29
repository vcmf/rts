---
status: active
last_reviewed: 2026-10-29
---

# Plan: K0, the campaign's rules as a design, its models as code

Track K (`docs/plans/active/track-k.md`), on `epic/campaign`, stacked on K1 (the map's look prototype). K0 was to be
docs only; the owner (2026-10-29): a design PR that carries game logic or a model with numbers ships its code and
tests in the same PR, so the reviewer tests the doc against something concrete. So K0 follows the full workflow.

## Problem

The campaign's rules are written in PR #234 (into `main`, open): armies as corps marching only on roads, every side
ordering at once and the day played as a timeline, contact radius and battle zones, couriers that travel and can be
caught, help that arrives tired and strung out. Its decision numbers (0074–0076) are taken since; its numbers
(march times, courier speed, the help that arrives about 9 hours after a morning battle began) are only prose.

## Scope

**Docs**

- `docs/proposals/campaign.md`: #234's proposal, its references renumbered, its battle-map size pointed to the
  accepted decision 0061 (#234's 0075 is dropped: 0061 already says it), its models pointed to their code below,
  and the contact rule made exact (below). The map's look stays in `docs/proposals/campaign-map.md`, updated to what
  the prototype settled.
- Decisions, proposed: **0084** the campaign layer (#234's 0074), **0085** a unit is a division (#234's 0076,
  unchanged), **0086** the campaign map is a lit model: one shape for form and light, baked offline in tiles (from
  K1).
- `docs/systems/campaign.md`: the models as built.
- `docs/plans/active/track-k.md`: the series as agreed with the owner (K2a–K2d, K3).

**Code** (`src/campaign/`, exact maths as the sim's: decision 0006, enforced by lint as `src/map/` is; it imports
only itself and `src/sim/num.ts`; era values are ruleset data, decision 0015)

- `rules.ts`: the rules' shape (`CampaignRules`), and `src/rulesets/napoleonic-campaign.ts` the Napoleonic values
  of #234's table (march 3 km/h for 7.5 h a day, forced 4 km/h for 8.75 h, a courier 12 km/h, an hour to get under
  way, a contact radius of 1.5 km, a battle zone of 4 km, a help radius of 25 km, the column's length a unit).
- `march.ts`: a corps' speed by march mode and size (a large corps slower), its column's length, and when its
  head and tail reach a point along its route.
- `track.ts`: a moving thing as a track (timed waypoints, linear between them); a route walked at a speed from a
  start time; the position at a time.
- `contact.ts`: the first moment two tracks come within a radius, exactly (per interval the relative motion is
  linear: a quadratic in time, solved with `sqrt`); so two corps on a road meet when they do, not at the next tick,
  and a courier is caught where it enters an enemy's zone. Whether a contact joins an existing battle (inside its
  zone) or starts a new one.
- `courier.ts`: a courier's trip along its route, caught or delivered; the help it brings: heard, under way, the
  head's and the tail's arrival.
- `roads.ts`: the road graph and the fastest route between two towns (Dijkstra, ties broken by index).
- `timeline.ts`: the day's events in a queue ordered by time, then by id, so a turn plays the same everywhere.

Out of scope: the day's loop that ties them together (orders, standing orders, the turn), food, knowledge (K4 and
after); the map's code (K2a–K2d).

## Acceptance

- Vitest covers each model, including #234's own example: an ally 25 km away hears after about 2 hours and its
  head arrives about 9 hours after the call; two corps closing on a road meet at the exact minute; a courier whose
  road crosses an enemy's zone is caught there; equal times play in id order.
- `npm test`, `check:data`, `check:docs` pass; lint enforces the exact maths in `src/campaign/`.
- Review rounds recorded here.

## Results

Filled when built.
