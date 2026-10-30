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

- The rules themselves stay in #234's proposal, worked on by the map editor track's session (into `epic/sim-engine`:
  its decisions 0088, the campaign layer, 0076, a unit is a division, accepted, and 0089, battle maps sized by the
  front, accepted). K0 does not copy them (a first version did, as 0084–0086; main and other branches took those
  numbers since, and the copies went stale): it points to them, and aligns its docs when #234 lands in the epic.
- Decision, proposed: **0093** the campaign map is a lit model: one shape for form and light, baked offline in tiles
  (from K1).
- `docs/systems/campaign.md`: the models as built.
- `docs/plans/active/track-k.md`: the series as agreed with the owner (K2a–K2d, K3).

**Code** (`src/campaign/`, exact maths as the sim's: decision 0006, enforced by lint as `src/map/` is; it imports
only itself and `src/sim/num.ts`; era values are ruleset data, decision 0015)

- `rules.ts`: the rules' shape (`CampaignRules`), and `src/rulesets/napoleonic-campaign.ts` the Napoleonic values
  of #234's table (march 3 km/h for 7.5 h a day, forced 4 km/h for 8.75 h, a courier 12 km/h, an hour to get under
  way, a contact radius of 1.5 km, a battle zone of 2.5 km (a radius, kept within its map), a help radius of 25 km,
  the column's length a unit).
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
- `roads.ts`: the road graph and the fastest route between two towns (Dijkstra, the same on every machine).
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

- `src/campaign/`: rules, march, track, contact (`firstContact`, `zoneFor`, `battleFor`), courier (`ride`, `help`,
  `inHelpRadius`), answers (`answers`), roads (`network`, `fastestRoute`, `routePoints`, `roadLength`), timeline;
  the Napoleonic values in `src/rulesets/napoleonic-campaign.ts`. 34 tests in `test/campaign-rules.test.ts`, among
  them the proposal's own: a call 25 km away heard after 125 minutes, the help's head 560 minutes after the call
  (9 h 20), with 25/35 of the day's 15 % left behind; two corps closing at 6 km/h meet at minute 285; a courier
  caught where it enters a zone, at 8.5 km; a chain of calls among eight corps that ends.
- The exact rules on `src/campaign/` by lint, one helper for it and the map engine (`exactArea` in
  `eslint.config.js`), tested in `test/lint.test.ts`.

## Review rounds

- **Round 1** (`/code-review high`): severe: a call for help was caught at its first minute (it starts inside the
  zone of the enemy its corps is fighting); a route of one town (an ally in the same town) crashed `walk`; a window of
  no length missed a contact already made. Fixed, each with a test: a courier is caught when it enters a zone, and by
  the zone it starts in only on coming back (`firstExit`, exact); a one-town route delivers at once; contact is
  checked at the window's start. With: a road's length is its line's (the route chosen and the time to walk it
  agree); the graph prepared once and searched with a heap (the network will be Europe's); the docs' tie-break claim
  corrected; the stragglers and the help radius used; the lint block shared with the map engine and tested; the
  conventions and the index updated.
- **Round 2**: severe: round 1's exemption let a courier ride straight through the enemy its corps fights. Fixed
  exactly: a courier is caught when it is inside a zone and closing on the enemy (`firstClosing`, the quadratic's
  roots and its vertex), so it gets away from its battle only by riding away; the nudges are gone. With: the battle
  zone a radius that fits the largest battle map (2.5 km); a contact joins the nearest battle; the quadratic's roots
  clamped to their interval (a pair on the radius at a corner is not lost to rounding); the road graph copied into a
  network searched as built (a later change to the graph cannot make a live turn and its replay differ); positions
  along a track in one sweep; no argument spread on long routes; stragglers in proportion to the forced march made;
  the doc's case for exact contact corrected (a tick finds contact late, and misses a courier's short crossing);
  road kinds named as K3–K4's.
- **Round 3**: two correctness findings on the same rule again: "closing" decided on a knife-edge (a road 0.02° toward
  the enemy caught at once, the perpendicular delivered), and a pair exactly on the radius at a corner lost to
  rounding at some angles (the doc claimed otherwise). Three rounds, so **stop and redesign** (`AGENTS.md`): the
  rule, not its geometry, was wrong.

### The redesign (the owner, 2026-10-30)

- **The enemies a courier's corps is fighting never catch it**: they are held by the battle, and a call always gets
  out of the battle it is sent from; every other enemy catches it where it comes within its zone (`ride(…, engaged)`,
  plain `firstContact`; `firstClosing` and its knife-edge are gone).
- **A corps answers at most one call a day**; one marching to help that meets another enemy fights there and may
  call in turn, but only free corps answer (`answers.ts`). Every answer commits a corps, so a chain of calls ends
  (the owner's worry: "u call an ally for help, he goes and got into a fight with another enemy, will this ally call
  for help as well?").
- With: each battle's zone at most half its map's side (`zoneFor`); the doc honest on a pair exactly on the radius
  (deterministic, no tolerance); the search stopping at an earlier catch; town indices checked; one interpolation.
- The review rounds count again from 1.

After the redesign:

- **Round 1**: severe: decision numbers taken on main (0084, 0085) and later on other branches; a battle's zone
  smaller than the contact radius on a small map; a road with no line a free leap. Fixed: K0 no longer copies
  #234's proposal and decisions (the map editor track's session works on them: decisions 0088, 0076, 0089) and points
  to them; its own look decision is 0093; roads need a line; contact already made at a start found exactly
  (`c ≤ 0`); rulesets take only types from `src/campaign/` (lint, with a test).
- **Round 2**: severe: a route's line bridged a gap between roads that did not meet at their town; "no corps in two
  battles" held only for a corps at a battle's centre (the zone was inflated to the contact radius for it). Fixed:
  the road graph's towns have positions and each road must run from its town to its town (`network`); a one-town
  route is that town's point, so a courier there is caught by an enemy holding the town like any other; a contact
  with a corps already fighting joins that corps' battle (`battleFor(…, engagedIn)`), and the zone is back to at
  most half the map's side. With: a ruleset's `./` imports may not climb out (tested); intervals made lazily, the
  zero-length window plain; the courier and help test split, one behaviour each.
- **Round 3**: no severe issue. Fixed: two corps each held by a battle of its own do not engage each other
  (`battleFor` refuses it; a rule from "engaged corps are held for the rest of the day"); a road's ends are set on its
  towns' places, so routes join exactly and a route's length is its line's; tracks whose times do not rise and walks
  at no speed refused; stale battle indices refused; `Network.towns` dropped for `places.length`; comments. Left: the
  search allocates its arrays per query (a scratch buffer on the network when Europe's network comes, K6). Review
  stops here (`AGENTS.md`, Workflow).

