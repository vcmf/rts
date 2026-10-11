---
status: active
last_reviewed: 2026-10-11
---

# Plan: S1e-1, the battlefield

S1e closes S1 (`docs/plans/done/s1a-formations-on-spine.md`, the split): "the 6v6 scenario, an end condition,
playtests". Its acceptance is S1's (sim-design §17): **a 20-minute fight of about 6 battalions per side is fun
at 2× speed**. Only you can judge that by playing, so S1e ends in playtests, and it is split:

| Part | Scope | Ends with |
|---|---|---|
| **S1e-1** (this plan) | A battlefield of 1.2 km, built from a map definition; the map's edge impassable (#37); shattered battalions that reach the edge leave the field; the page plays a scenario on its own map | Six battalions, a regiment and a battery a side deploy and fight on it, and nothing stands off the map |
| S1e-2 | Sides and the end: the player commands one side; the other follows its scenario's scripted plan (timed advances and attacks, through the same commands); the end condition (a side whose army is broken); routers break ranks (#39) | A scripted enemy attacks, and the battle ends with a result |
| S1e-3 | The 6v6 scenario and playtests: tuning from your play | S1's acceptance |

## The problem

- The formation field is 360 m. A regiment's line is 157 m, a battalion's 93 m, and a 6-pounder reaches 800 m.
  Six battalions a side do not fit, and S1d's calibrations had to shrink their ranges (decision 0018 put a
  larger sim map in S1e).
- Ground beyond the map's edge reads the edge cell, so the footprint gate passes it (#37).
- A shattered battalion runs to its side's rear and stands at the edge for the rest of the battle. Nothing
  removes it (`docs/systems/fire-morale.md`, non-goals).

## Design

### The map (`maps/battlefield.ts`)

A `MapDef` (the interface `maps/formation-field.ts` declares), invented: build-time formulas, like the look
world's. The map format (`docs/proposals/map-format.md`, a draft) is W6's; when it lands, this map becomes its
first file.
- **Size:** 1,200 m square (`half` 600). The terrain grid is 2 m (the field's is 1 m): 600² cells, 1.8 MB of
  data.
- **Relief:** two low ridges facing each other across a valley, about 600 m apart, rising 10–20 m, with
  gentle spurs and a few hollows (reverse slopes for the guns to fail against).
- **Water:** a stream meanders down the valley, 4–8 m wide and mostly too deep to wade. It has two fords and
  a bridge where the road crosses, and a marsh in one bend.
- **Ground:**
  - a road east–west over the bridge;
  - two woods, each with a dense core, one on each side's flank;
  - crop and ploughed fields, rough ground on the steeper slopes;
  - hedges along two field edges.
- **The class names** are the ruleset's terrain classes. The map names no rule.

`tools/build-sim-data.ts` builds every map (the field and the battlefield); `--check` checks both.

### The edge (#37)

Ground beyond the edge is impassable to every kind:
- every test of a place's ground in the formation layer goes through one helper that answers "impassable"
  off the map (the footprint gate, the wet bins, the per-bin look-ahead, a change's path);
- the distance to impassable ground (`impd`) counts the edge, so the quick rejects (`clearWithin`,
  `clearOfImpassable`) see it.

The formation field's scenarios keep their shapes on the map already. Their goldens move only where a router
reaches the edge (below).

### Leaving the field

A shattered battalion whose anchor comes within `morale.leave` metres (data, 12 m) of the map's edge leaves the
field. It is removed (reaped). Its side's count of men who left (`sides.left`, hashed) grows by its men. S1e-2's
end condition reads the count. A router there stays: it may still rally (S1c-2's rule; a router's run of 800 m
ends at the edge on any map, so removing routers would end every rally).

### Scenarios and the page

- **The map:** `Scenario` gains `map` (the data file's name; the formation field when left out). The page loads
  the scenario's map and checks its version (per map, in `src/scenarios/maps.ts`). Replays already record the
  data version.
- **The staff map** draws any map. Its build time and memory are measured at 1.2 km. If the build is over a
  second, it draws its hachures and classes at the map's own grid, not finer.
- **`s1e-battle`:** on each side, 6 battalions in two lines of three, a regiment on a flank and a battery on the
  ridge, holding fire. The page deploys and moves them. `check:app` marches a brigade across a ford, fires
  the batteries, and checks that nothing stands off the map.

## Acceptance

- `test/battlefield.test.ts`:
  - **the map:** its size, classes in the ruleset, the stream impassable but at the fords and the bridge, the
    ridges' heights;
  - **the edge:** a line marched at the edge halts with no place off the map, for every type; a column of
    route by the edge turns inside it; a change of shape that would put places off the map is refused;
  - **leaving the field:** a shattered battalion that reaches the edge is removed and counted; a router there
    stays;
  - **`s1e-battle`:** every formation deploys, and every shape it is formed into stays on the map.
- The S1c and S1d goldens are regenerated. Every change in them is accounted for: a router removed at the edge
  (the firefight, the brigade), or the edge holding a place (none are expected).
- **Cost:** the terrain build, the staff map's build and a tick of `s1e-battle` (16 formations) are measured; the
  40-battalion benches are unchanged.
- **Checks:** lint, typecheck, `check:data` (both maps), `check:docs`, the tests, `check:app`.
- **Docs:** `docs/systems/formations.md` (the edge), `docs/systems/fire-morale.md` (leaving the field),
  `docs/systems/sim-page.md` (maps), `docs/systems/sim-spine.md` (the maps' data). #37 is closed by the PR.

## Non-goals

- The map format (W6) and real battlefields.
- Villages and buildings (no terrain class yet).
- Pathfinding: formations march straight, halting at what they cannot cross.
- The 3D look of this map (Track E).

## Risks

- **Memory and build time at 1.2 km:**
  - the terrain's per-kind distance fields are 360,000 cells × 5 kinds × 8 bytes, 14 MB;
  - the soldier layer's obstacle grid and the staff map's caches grow with the area.

  All are measured; the staff map is the likeliest to need coarser drawing.
- **A map nobody has played:** S1e-3's playtests will move ridges and fords. The map is code, so it changes
  like code.

## Results (2026-10-11)

**The map** (`data/battlefield.simdata`, 4.7 MB, version `0xad83ce9c`):
- the terrain builds in 87 ms (601² cells on a 2 m grid);
- the staff map builds in 0.6–0.7 s on the page and redraws in 1.3 ms;
- `s1e-battle` deploys its 16 formations with every man on the map;
- a column of route from the southern ridge crosses the western ford in about 8 minutes.

**What changed from the design:**
- **Only shattered battalions leave the field.** A router's run is 800 m and ends at the edge on any map, so
  removing routers there would have ended every rally. A router at the edge stays and may rally, as in S1c-2;
  `docs/systems/fire-morale.md` deferred exactly this, removing shattered battalions at the edge, to S1e.
- **Tests that leaned on the edge.** On the 360 m field many tests had placed formations whose lines or columns of
  route reached past the edge (#37's own symptom), and the edge now holds them. They move to the battlefield,
  levelled and painted open, where they had always meant to stand on open ground:
  - the unit types (`test/types.test.ts`);
  - the charges (`test/charge.test.ts`);
  - the two 400- and 810-man drills of `test/scale.test.ts`;
  - the troopers' slot error in `test/soldiers.test.ts`.
- **The cost benches** (`tools/bench-cost.ts`, `test/formations.test.ts`, `test/soldiers.test.ts`) spawned their
  western columns at the field's edge, and formed every shape there: a 93 m line or a 96 m column of route
  reached off the map. The grid is tighter now (x −120..30, z −80..120) so every shape stands on the map.
  Measured on the new grid, main against this branch:
  - **release world (dev Mac):** 5.6–6.1 against 5.6–5.7 ms a frame marching at 40 × 400;
  - **vitest:** 9.2–9.9 against 9.3–10.1 ms. The test's 10 ms budget is tight on this machine for both (issue
    #36).

  The 40 × 800 row is only reported: an 810-man line is 180 m wide and the field 360 m, so the edge holds some of
  its lines.
- **The goldens.** With the new state (`sides.left`) left out of the hash and the ruleset hashed without
  `morale.leave`, the drill, firefight, calibration and guns goldens reproduced. The charge golden changed for an
  edge reason: its routed line runs north to the field's edge, where the edge now holds its square's rear face.
  All were regenerated.
