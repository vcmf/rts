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

Revised on 2026-10-29 with the owner, once the K1 prototype was done: the map comes into the game's code first,
then the theatre as data, then the play. A design PR that carries a model ships its code and tests (the owner).

| Phase | What | Acceptance |
|---|---|---|
| **K1** | The look, prototyped (`prototypes/campaign-map.html`, `docs/plans/active/k1-theatre-look.md`): the 1805 theatre as a lit relief model, its offline-baked 100 m tiles as a proof of concept | Done: the owner's sign-off; 150 fps at 1080p on test machine A |
| **K0** | The rules (#234's proposal, decisions 0088 and 0076 (#234's)), the map's look (decision 0093), and the rules' models as exact code in `src/campaign/` with tests (`docs/plans/active/k0-campaign-rules.md`) | Vitest on #234's own cases; the owner's review of the decisions |
| **K2a** | The bake in the game's code: one module (shape, lakes, sun shadow, sky occlusion), a tool writing binary, compressed tile levels (250 m far, 100 m close) with a manifest | Vitest; tile size and bake time measured; the prototype's image |
| **K2b** | The campaign page (`app/`, `src/render/campaign/`): shaders in files, the raised mesh, sun and sky, water, contours, lines on the ground, FSR 1, the fps meter; no lighting at load | Page check; 150 fps at 1080p on test machine A |
| **K2c** | Streaming done properly: a ring of tiles with partial uploads (no hitch), a mesh denser near the camera | No frame over 6.7 ms panning the Alps up close |
| **K2d** | Labels and ink: towns, rivers, regions, collision, ink hidden behind ridges | Page check; no overlap, no line through a mountain |
| **K3** | The theatre as data: roads, towns, rivers and lakes in a checked file (period lakes, no modern reservoirs), traced from period maps (`docs/research/period-maps.md`) | A tool checks the file; the page draws from it |
| **K4** | The day played at once: corps on the roads, orders as routes, standing orders, the day's timeline from K0's models, what each side sees | A day where two corps meet on a road; a courier caught; the same events on two runs |
| **K5** | The hand-over to the battle: a contact written as the proposal's contract, the battle map around it from the map engine (Track M) | A battle started from a campaign contact, its arrivals on their roads at their times |
| **K6** | Europe: the whole continent in tiles, the road network beyond the 1805 theatre | Pan and zoom across Europe at 150 fps on test machine A |

K5 waits for Track S's playtest (it hands over to its battle) and Track M's map language (its battle maps).

## Open questions

- **One language** (decision 0057): is the campaign's road graph part of the map language (a theatre map at another
  scale), or a language of its own that the battle map's generator reads? Settled in K4.
- **One map view** (decision 0058): the campaign map shares the battle map's lit style, but is it the same renderer
  (`src/render/lit/`) at another scale, or a tile renderer of its own? Settled in K3.
- **The zoom from the campaign to a battle:** a cut, or a continuous zoom from the theatre into the 2–6 km battle map?
