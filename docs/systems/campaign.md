---
status: current
last_reviewed: 2026-10-29
---

# The campaign's models

What is built of the campaign (`docs/proposals/campaign.md`; Track K, `docs/plans/active/track-k.md`): its rules as
pure, deterministic models in `src/campaign/`, tested in `test/campaign-rules.test.ts`. Nothing plays a turn yet:
the day's loop (orders, standing orders, the turn) comes later in the track. The map's look is the K1 prototype
(`prototypes/campaign-map.html`); it moves into the game's code in K2a–K2d.

## Rules and their values

`src/campaign/rules.ts` holds the shape of the rules (`CampaignRules`); an era's values are ruleset data
(decision 0015): `src/rulesets/napoleonic-campaign.ts`. Distances are metres and times minutes throughout.

| Value | Napoleonic |
|---|---|
| Normal march | 3 km/h for 7.5 h: 22.5 km a day |
| Forced march | 4 km/h for 8.75 h: 35 km a day; 15 % of each unit left behind |
| Size | full speed up to 6 units, 3 % slower a unit more, 20 % at most |
| Column | 2 km of road a unit |
| Courier | 12 km/h; a corps gets under way in an hour |
| Contact, battle zone, help | 1.5 km, 4 km, 25 km by road |

## The models

- **March** (`march.ts`): a corps' speed by mode and size; its column's length; when its head and tail reach a
  point down its route (no halts: the day's hours belong to the turn).
- **Tracks** (`track.ts`): a moving corps or courier as timed waypoints, linear between them, still before the first
  and after the last; `walk` makes one from a route and a speed.
- **Contact** (`contact.ts`): `firstContact` gives the earliest moment two tracks come within a radius, exactly:
  between breakpoints the separation moves in a straight line, so contact is the first root of a quadratic.
  `battleFor` joins a contact to the first battle whose zone it lies in, or starts one.
- **Couriers** (`courier.ts`): `ride` takes the courier along its route and loses it to the first enemy whose
  contact zone it enters (by time, then index), where it enters it; a zone it starts in (the battle it is sent from)
  catches it only if it comes back in after leaving (`firstExit`, then contact again); a route of one town delivers
  at once. `help` gives the head's and tail's arrival of the corps that heard the call, at a forced march, and the
  share of its strength with it (stragglers left behind); `inHelpRadius` whether an ally is in reach.
- **Roads** (`roads.ts`): the graph of towns and roads; `fastestRoute` (Dijkstra, the heap ordered by distance, then
  town; a road's length is its line's), `routePoints` its line in the direction travelled.
- **Timeline** (`timeline.ts`): the day's events, played in the order of their time, then id; an event may queue
  later ones.

## Determinism

`src/campaign/` keeps the sim's exact-number rules (decision 0006), enforced by lint as in `src/map/`: only `+ − × /`
and `sqrt`, no transcendental functions, no clock, no randomness; it imports only itself and `src/sim/num.ts`, never
the renderer (decision 0005). A turn played on two machines gives the same events in the same order.

## Open questions

The proposal's (`docs/proposals/campaign.md`, Open questions); and whether a corps' contact is its head's or any
point of its column's (the models track a point; a column is a segment of road).
