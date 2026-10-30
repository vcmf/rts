---
status: active
last_reviewed: 2026-10-29
---

# Plan: Track K, the campaign

Track K is the campaign: a map of Europe's roads on which the armies, as corps, all march at once, and the battles
that come from their meetings. The rules are the campaign proposal of PR #234; the map's look is
`docs/proposals/campaign-map.md`. The letter is K because C names the collision phases
(`docs/proposals/collision-and-orders.md`).

The epic branch `epic/campaign` collects the track, and merges into `main` with a merge commit once its phases are
done, as Track M's does (decision 0020).

## How the epic works

- Each phase is one PR or more into `epic/campaign`, with its own plan in `docs/plans/active/` (docs-only PRs need
  none), reviewed by the workflow in `AGENTS.md`, and squash-merged.
- `main` is merged into the epic regularly (a merge commit, never a rebase).
- The campaign never imports the renderer and changes only through commands, and it is deterministic, as the battle
  is (decisions 0005, 0006, 0013): a turn plays the same on every machine, so the multiplayer turn is "both sides
  send their orders, each machine plays the day".
- Engine code names no era's unit, road kind or nation (decision 0015); the 1805 theatre, its roads and its corps
  are data.

## Phases

| Phase | What | Acceptance |
|---|---|---|
| **K0** | The design: the rules (the campaign proposal, #234, with its decisions renumbered past main's), the map's look (`docs/proposals/campaign-map.md`) and this plan | The owner's review; the vision's "battles only" non-goal removed once #234's campaign decision is accepted |
| **K1** | The look, prototyped in a single-file prototype: the 1805 theatre (Strasbourg to Austerlitz) from real heights in the lit style, its rivers, towns and a hand-placed road graph | The owner judges the look by eye against `design/campaign/refs/`; bake and frame measured |
| **K2** | The day played at once, in the prototype: corps of two sides on the roads, orders as road routes, the day as a timeline of events (contact, couriers, arrivals), what each side sees | A day where two corps meet on a road they both took; a courier caught; the timeline the same on two runs |
| **K3** | The look settled: the relief baked offline at print quality (soft shadows from several rays, occlusion), shipped as tiles; a decision record for the campaign map's look | The look accepted by the owner; load and frame measured on test machine A |
| **K4** | The theatre as data: the road graph, towns, rivers and bridges in a file that a tool checks, traced from period maps (`docs/research/period-maps.md`, Reymann for central Europe) | `node tools/...` checks the file; the prototype draws from it |
| **K5** | The campaign in the game's code: `src/campaign/` (the road graph, the timeline, standing orders, food, knowledge), deterministic and tested, its page in `app/` | Vitest; a recorded campaign replays to the same hash |
| **K6** | The hand-over to the battle: a contact written as #234's contract (who is deployed, who arrives when, by which road), the battle map around it from the map engine (Track M) | A battle started from a campaign contact, its arrivals entering on their roads at their times |
| **K7** | Europe: the whole continent (Lisbon to Moscow) in tiles, the road network beyond the 1805 theatre | Pan and zoom across Europe at 150 fps on test machine A |

K2 starts after the owner's verdict on K1: if the look does not hold at the theatre's scale, K3 comes first. K4–K6
wait for Track M's map language to settle (K4 reads it) and for Track S's playtest (K6 hands over to its battle).
The order can change after each phase; each plan says why if it does.

## Open questions

- **One language** (decision 0057): is the campaign's road graph part of the map language (a theatre map at another
  scale), or a language of its own that the battle map's generator reads? Settled in K4.
- **One map view** (decision 0058): the campaign map shares the battle map's lit style, but is it the same renderer
  (`src/render/lit/`) at another scale, or a tile renderer of its own? Settled in K3.
- **The zoom from the campaign to a battle:** a cut, or a continuous zoom from the theatre into the 2–6 km battle map?
