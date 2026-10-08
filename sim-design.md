# Simulation Design

Status: **draft for discussion, revised after an adversarial review** (Oct 2026; §19). The battle
simulation: what it holds, how a tick runs, and how Napoleonic warfare is modelled. Builds on
`web-rts-architecture.md` (sim/render split, typed arrays, handles, commands, 20 Hz tick) and the
decisions in `engine-map.md` §2. Evidence and parameters: `research/rts-engine-subsystems.md`
(cited as **R§n**).

**Supersedes in `web-rts-architecture.md`:**
- §4 "floats are fine for single-player / fixed-point for lockstep": the sim uses **restricted
  float64** (§2), deterministic across browsers without fixed-point.
- §4 the main-thread loop (`advanceTick` in `runRenderLoop`, `renderer.sync(world)`, `prevX`
  arrays): the sim runs in a worker and the renderer reads posted snapshots (§16), after the
  first fun slice (§17).
- §7 Recast navmesh as the sim's path provider: formations path on a **cost grid in the sim** (§7).
- §2 `units.ts`, `production.ts`, `economy.ts`: no economy or production in a battle.

## 1. What is simulated, and what is only drawn

| Simulated (deterministic) | Only drawn (renderer, cosmetic RNG) |
|---|---|
| **Formations**: battalions, cavalry regiments, batteries (D1) | The ~100 figures of a battalion, their animation, who falls |
| **Commanders**: generals, one rider each, with position | Flags, drummers, officers inside a formation |
| | Musket balls, flashes |
| **Roundshot** in flight (rays bouncing on the heightfield) | Dust, debris, bodies |
| **Smoke puffs** (position, radius, density) | The painted smoke clouds drawn from the puffs |
| Sim heightfield, cost grid, terrain layers (build-time data, §2) | Vegetation, water look, the far ring |

Scale per battle: ≤ 128 formations, ≤ 64 commanders, ≤ 256 roundshot, ≤ 512 smoke
puffs. The sim works on tens of entities, not thousands.

**Scale (decided Oct 2026): the player commands battalions of about 100 figures**, 20–40 per battle
(2k–4k figures). A middle size between Total War (magnificent, but players zoom out to dots) and
Age of Empires (about 200 units per side). **One figure is one soldier** (decided): a game
battalion is about 100 men (historically a large company), with real spacing per man so a line
looks right. Ranges and speeds stay historical, to playtest.

## 2. Numbers, inputs, time, randomness

**Restricted float64** (replaces fixed-point; see §19 for why). IEEE 754 `+ − × /` and `sqrt` are
correctly rounded and identical in every JS engine, and JS never fuses multiply-adds (R§4). The
cross-browser hazard is only the transcendental functions (`Math.sin` differs even between Chrome
versions, R§4). So:

| Allowed in `sim/` | Banned in `sim/` (lint) |
|---|---|
| `+ − × /`, comparisons, `Math.sqrt`, `Math.abs/min/max/floor/ceil/trunc/round/sign` | `Math.sin/cos/tan/asin/acos/atan/atan2/exp/log/pow/hypot/cbrt/random` and the `**` operator |
| Our own `sin/cos/atan2` (tables or polynomials built from allowed ops) | `Date`, `performance`, `Map`/`Set` iteration |
| `Float64Array` state; integers for counts and ticks | `Float32Array` for state (silent rounding on store) |

- **Same operation order everywhere:** sums are always accumulated in entity index order.
- **No NaN or Infinity in state:** assert at the end of each tick in debug builds; the hash would
  not be stable across engines on NaN payloads.
- **Decay factors** (`pow`-like: smoke, morale recovery, fatigue) are per-tick constants computed
  at build time.
- **Inputs are build-time data, not runtime formulas.** `H()`, the river and every authored float
  table run **once in a Node build step** that writes the sim heightfield (on the 1.79 m grid), the
  cost grid, trig tables and decay constants as binary files. The renderer and the sim load the
  same files; their hash is part of the **data version** (§15) and the runtime asserts it. This
  makes `engine-design.md` §4's heightfield an offline product, not a per-browser computation.
- **Time:** one tick = 50 ms of battle time, always (`TICK_HZ = 20`). Game speed changes how many
  ticks run per real second (pause, 1×, 2×, 4×, 8×), never the tick length.
- **Battle clock:** `start + tick × 50 ms`; time of day fixed per scenario, the sun does not move (D5).
- **RNG:** one seeded integer stream in the world (`xoshiro128**` with `Math.imul`, integers only),
  advanced in tick order. The renderer has its own RNG.

## 3. Entities

Tables of typed arrays per kind. Handles carry a **kind tag** (`kind:3 | index:9 | gen:19`) so a
target or an order's recipient is unambiguous across tables (`web-rts-architecture.md` §3 used a
single 12-bit index). Variable-length data (waypoints, order queues) lives in
**typed-array pools** with free lists, so every byte of state is in arrays that the hash and saves
cover, including the RNG state and the free lists.

**Formation** (battalion, cavalry regiment or squadron, battery):

| Group | Fields |
|---|---|
| Identity | type (data id), side, parent commander, name id |
| Strength | men, men at start, killed since last snapshot |
| Shape | kind (line, column, square, skirmish, march column; limbered/unlimbered for guns), ranks, files, frontage and depth (both shrink as men fall), centre, facing |
| Drill | target kind, transition progress 0..1 |
| Movement | path (pool), speed state |
| Fire | target, loaded share 0..1, reload state |
| Combat | melee opponent, charge state |
| Condition | **cohesion** 0..1 (order in the ranks: lost to terrain, interpenetration, melee; restored by halting) and **morale** 0..1 (the will to stay), morale state, recent losses (10 s ring) |
| Orders | pool handle, last order sequence number |

**Commander**: side, parent, rank (army, corps, division, brigade), position, quality (initiative,
command radius, rally), alive, successor rule. **Roundshot**: position, velocity, energy, battery. **Smoke puff**:
position, radius, density.

## 4. Commands

The only way into the sim. Players, AI and scripts issue the same commands.

- **Stamping:** the main thread sends a command without a tick; the **sim stamps it** with
  `currentTick + 1` on receipt, quantizes positions to 1 cm, and **logs it**. Only external
  commands (player, scripts) are logged; AI commands are re-derived on replay, so they are never
  applied twice.
- **Validation** in the sim (ownership, alive, legal for the kind); invalid commands are dropped
  and logged, never thrown.

| Command | Payload |
|---|---|
| `move` | formations, waypoints, final facing, kind on arrival, road preference, **advance without firing** flag, replace or append |
| `form` | formation, kind |
| `fire` | formation, hold or fire, optional target |
| `charge` | formation, target |
| `halt`, `retreat`, `rally` | formation |
| `group-move` | *later:* a brigade laid out as a line, a column of battalions, or a second line |
| `commander-move` | commander, waypoints |
| `script`, `debug` | scenario events; spawn, kill, set morale, teleport (replayable) |

Orders to formations go through command and control (§6).

## 5. Formations and drill

- **Geometry from data:** 0.56–0.7 m per file (R§3), ranks per nation and kind. A 100-man game
  battalion in a 3-rank line is ≈ 34 files ≈ 20 m × 2.3 m (2 ranks: ≈ 30 m); an attack column
  ≈ 10 files × 10 ranks. Forty battalions in line cover ≈ 0.8–1.2 km, which fits the 1–1.5 km
  play area with room for second lines and manoeuvre.
  Frontage shrinks as men fall (ranks close), which moves contact, sight and canister edges.
- **Formation changes are timed transitions** (R§3), with **partial credit**: a square at 70% gives
  70% of the square's protection.

  | Change | Time (calibration anchor) |
  |---|---|
  | column → square | ≈ 60 s |
  | line → square | ≤ 100 s |
  | line ↔ attack column | ≈ 30 s |
  | battery limber / unlimber | ≈ 60 s (unsourced, to tune) |

  During a change the formation cannot fire and moves slowly. Charging cavalry closes in ≈ 60 s
  (R§3). Drill quality scales the times.
- **Shapes stay rigid rectangles per battalion.** A brigade line bends at the joints between
  battalions; a single rectangle never deforms.
- **Skirmish order** is for light companies and light battalions only: lower rate of fire, low
  density, helpless against cavalry.

## 6. Command and control

**No couriers** (decided Oct 2026): orders apply immediately. A courier system would also need
trajectories, blocking, interception and their edge cases; it is not worth it for this game.
Command still matters through the commanders on the field:

- **Commanders** are entities with a position: the army commander (the player) and the brigade,
  division and corps generals of the order of battle.
- **Rally and morale:** formations within a commander's radius get a morale bonus and can be
  rallied when routing (§10). Riding a general forward helps a wavering line, at the risk of his
  life.
- **The player orders battalions** (decided). Multi-selection moves several at once, keeping
  their relative positions. Brigade group moves (a laid-out line or second line) come later if
  playtests ask for them.
- **Orders** are **replace** (default) or **append** (queued waypoints).
- **Standing behaviour** (§12) still matters: troops react on their own to cavalry, fire and
  disorder between the player's orders.
- **Succession:** a dead general is replaced by the next in the chain after a delay; his
  formations lose the rally bonus meanwhile. If the army commander falls, the player keeps control
  (no game over), but the army takes a morale shock.

## 7. Movement

- **Cost grid** (build-time data): cell = 4 × 1.79 m = 7.16 m, aligned to the heightfield. Cost
  from slope, woods, villages, marsh; rivers impassable except fords and bridges. Bridges and fords
  narrower than a cell are marked explicitly.
- **Clearance:** each formation kind searches a grid **dilated by its width** (a 111 m line cannot
  plan through a 10 m bridge; a march column can).
- **Paths:** A* per order, **queued and time-sliced** (a brigade order is 4–8 searches; at most one
  or two per tick).
- **Moving in line vs column:** lines advance, retire or oblique within ≈ 30°. Any path with turns
  uses **march column** automatically and re-forms on arrival (the formation-change times apply).
  A turn over 45° in place is a timed **change front**, not a sweeping wheel.
- **Speed** = base (R§3: ≈ 61 m/min ordinary, 91 m/min quick) × kind × terrain × slope × fatigue ×
  morale state.
- **Contact between friends:** a column passing through a line, or a line through a halted line,
  costs both **cohesion**. Routers pass through friends, costing them cohesion and a morale shock.
  Skirmishers pass freely. Push-apart is resolved symmetrically (from the start-of-step state), so
  index order never favours a side.
- **Map edges:** routers leaving the map are removed (counted as lost). Reinforcements enter at
  scenario-defined edge points.

## 8. Fire

**Targeting:** each formation picks a target in its **fire arc** (front, or every face for a
square) and range, preferring the nearest threat or the player's target. **Fire is blocked by
friends:** a second line cannot fire through the first. Partial frontage overlap scales the rounds.

**Musketry, per formation, statistical** (D1). **Calibrated on time to break, not on hit rates.**
The research's per-minute figure was wrong (§19): a 600-man line firing at 100 m with 1 hit in
300–500 rounds gives ≈ 1.4–5 casualties a minute, so a battalion breaking at 10–15% losses would
take 15–45 minutes and the battle would look static. Game battalions are 100 men, so the rates are
derived from the time-to-break target, not from historical rounds. Battlefield rates are averages over mostly
long-range fire (Waterloo: 1 in 162, R§3), so short-range rates are higher anyway.

- **Target:** two lines exchanging fire at ≈ 100 m: the weaker breaks in **≈ 6–10 minutes** of
  battle time (to playtest). p(range) is derived from that target, steep with distance.
- **Rounds per volley** = loaded men in firing ranks (line: 2–3 ranks; column: front company;
  square: one face) × (1 − misfire ≈ 15%). Reload 2–3 rounds a minute (R§3).
- **Hits** = rounds × p(range) × modifiers (target density, cover, smoke, elevation, morale state,
  cohesion). Integer casualties drawn from the sim RNG around the expected value (an integer-only
  sampler: sum of uniform draws, no `log`/`cos`).
- **Ammunition:** unlimited in the first slice; 50–60 rounds per man and resupply later (§17).

**Artillery, as rays** (R§3):
- A battery fires each gun every ≈ 20–30 s. Batteries do not fire if friends are in the cone.
- **Roundshot:** a ray over the heightfield in fixed sub-steps: first graze, ricochets losing
  energy, ≈ 800 m effective (R§3). Formations crossed below ≈ 2 m take casualties by **effective
  depth along the ray per kind** (column end-on: many ranks; line: 3; hollow square: 2 faces × 4
  ranks). Reverse slopes and hollows stop shot. Friendly roundshot hits friends.
- **Canister** under ≈ 300 m: a cone; casualties by frontage inside it.

## 9. Melee and charges

- **Charge:** acceleration over the last ≈ 150 m. Before contact the defender takes a morale shock
  test; many charges end there.
- **Impact:** steady square vs cavalry: cavalry recoils, a small breach chance only on a defender
  morale failure (R§3). Infantry in transition, or hit in flank or rear: heavy losses and a large
  shock. Cavalry vs cavalry: momentum and quality.
- **Melee:** attrition per tick between rectangles in contact, costing cohesion and morale, until
  one side routs. Cavalry may pursue.

## 10. Morale and cohesion

Two values per formation: **cohesion** (order in the ranks, §3) and **morale** (the will to stay).
Morale state machine (R§3):

```
steady ──► shaken ──► wavering ──► routing ──► rallying ──► steady
                                      │
                                      └──► shattered (cannot rally)
```

- **Shocks** (instant): heavy losses in the last 10 s, flank or rear attack, charge impact,
  artillery hits, a nearby friendly rout (contagion radius, larger to the front), commander killed.
- **Pressure** (per tick): cumulative losses, fatigue, under fire, enemy in the flank arc, low
  cohesion. **Support:** commander within radius, secured flanks, square against cavalry, cover.
- All shocks in a tick are computed from the **start-of-step state**, then applied together, so
  contagion never depends on index order.
- Hysteresis on thresholds. Routing formations run to their side's rear (through friends, §7);
  rally inside a commander's radius; **shattered** below a strength threshold or if their commander
  dies while they rout (Rome II rule, R§3).

## 11. Vision and smoke

- **Line of sight** per formation over the heightfield, sampled every ≈ 7 m (the cost-grid step),
  staggered (each formation ≈ 2×/s). Woods and villages block; height helps (R§3). Budget measured
  at the maximum count before raising rates.
- **Uses:** targeting, AI knowledge, later fog of war. **The player sees everything** until the S2
  playtests decide otherwise.
- **Smoke puffs** (≤ 512): volleys and guns emit puffs that drift with a fixed wind and decay.
  Sight rays and fire through puffs lose range and accuracy (to ≈ 45 m in heavy fighting, R§3).
  The renderer draws the same puffs as painted clouds. (A gridded, advected field is cut.)

## 12. Standing behaviour and AI

- **Standing behaviour** (every formation, both sides, every tick, cheap):
  - return fire at enemies in arc and range, **unless** the order says advance without firing
    (attack columns that stop to fire was the historical failure);
  - **form square** only against cavalry closing within ≈ 200 m, judged by drill quality, and
    stay formed for a delay after the threat (feinting cavalry costs the enemy too);
  - halt to restore cohesion; fall back when wavering.
- **Enemy AI:** the enemy's plan is **scripted per scenario** (objectives, timing, which brigades
  attack where). Brigade-level AI executes it through commands: lines, supports,
  attack and defend points, time-sliced (≈ 1 s). Army-level AI is later.
- **Fair:** the AI knows only what its side sees.

## 13. Stats and modifiers

Each stat (fire effectiveness, speed, morale change, melee strength) is **one plain function**
that combines its terms (terrain, kind, cohesion, fatigue, commander, smoke) in a fixed order and
can **print its terms** for the debug overlay. No generic modifier stack until there are enough
cases to need one.

## 14. Data and the order of battle

- **Unit types** as JSON with inheritance (nation, then kind), authored in metres, seconds and men,
  validated against a schema at load. All data and build-time binaries are hashed into the **data
  version**.
- **Order of battle:**

  ```
  scenario: map, date, start time, wind, victory rules, time limit, reinforcements, enemy plan
  side:     army commander
    corps → division → brigade (commanders with quality, succession)
      formation: type, men, start position, kind, facing
  ```

- **Victory:** objectives held at the time limit, or one side's army broken (share of formations
  routed or shattered).

## 15. Determinism, hashing, replays, saves

- **State hash** every 20 ticks: a 32-bit hash over every table's bytes (including pools, free
  lists, RNG), in index order. No NaN in state (§2).
- **Replay** = sim version + data version + scenario + seed + external command log. Playback must
  reproduce every hash; a mismatch prints the first differing tick and table.
- **Saves** = all tables + the command log since. Exportable as a file (R§4).
- **Checks:** a lint rule bans the §2 list in `sim/`; a Node golden-hash test runs every PR;
  Firefox and WebKit replays (Playwright) run nightly.

## 16. The worker and the snapshot

After the fun slice (§17) the sim runs in a **Web Worker**.
- The worker posts **the latest snapshot once per render frame** (not per tick: at 8× that would be
  160 posts/s), as a transferable buffer, plus an **event ring** since the last post: volleys,
  grazes, casualties per formation, morale breaks.
- The snapshot carries what figures need: centre, facing, kind, **transition progress**, frontage,
  ranks, files, men, **killed since last post**, morale state, smoke puffs. Figures re-slot and fall
  stably from it; the renderer interpolates positions between the last two snapshots.
- Size ≈ 128 formations × ~40 fields × 8 B ≈ 40 KB + 512 puffs × 32 B ≈ 16 KB per frame.

**Tick order** (the determinism contract):

```
1  apply stamped commands                          9  roundshot flight and hits
2  commanders: movement, succession               10 melee
3  enemy AI (time-sliced)                           11 apply casualties, shrink frontage
4  standing behaviour                               12 morale and cohesion (from start-of-step state)
5  orders → formation state (transitions)           13 smoke: emit, drift, decay
6  movement (queued paths, contact)                 14 reap dead entities
7  vision (staggered)                               15 hash (every 20 ticks), tick++
8  fire: targeting, musketry, artillery launch
```

**Budget:** 50 ms per tick at 1×; target ≤ 2 ms per tick so 8× speed fits. Metering shows the time
per step.

## 17. Phases

The goal is to learn **"is it fun?"** as early as possible without building determinism twice.

| Phase | Scope | Acceptance |
|---|---|---|
| **S0 short spine** (2–3 days) | restricted-float64 rules + lint, entity tables and pools, handles with kind tags, commands and stamping, RNG, hash, Node replay test, build step for the sim heightfield and cost grid | A scripted fight of moving blocks replays to the same hashes in Node |
| **S1 fun slice** (main thread) | infantry line, column, square; one cavalry regiment; one battery with roundshot; musketry calibrated on time to break; morale and cohesion; standing behaviour; multi-selection moves; an end condition; drawn by the prototype (units placeholder) | **A 20-minute fight of about 6 battalions per side is fun at 2× speed**; cavalry catches a forming square; a square holds; artillery punishes columns |
| **S2 hardening** | worker + snapshot + event ring; vision; smoke puffs; group moves; commanders and succession; Firefox/WebKit nightly replays | Same battle in the worker; replays match across browsers |
| **S3 a real battle** | ammunition and fatigue; order of battle and scenarios; scripted enemy plan with brigade AI; saves; victory rules | One historical scenario playable start to end against the AI |

## 18. Open questions

**Decided (Oct 2026):** no couriers (§6); a battle takes **30–45 minutes of real time** (speed
controls: pause, 1×, 2×, 4–8× for approach marches; march speeds and casualty rates are tuned to
fit).

1. ~~What does the player command?~~ **Battalions of about 100 figures, one figure per soldier**
   (decided, §1).
2. **Fog of war for the player:** full visibility until S2 playtests.
3. **Casualty display:** proposal: figures fall in proportion and ranks close, bodies stay on the
   ground, plus a strength bar.

## 19. Adversarial review: what changed

| Challenge | Outcome |
|---|---|
| **Q16.16 with `Math.imul` is wrong** (it keeps only the low 32 bits of a product); squared distances overflow past 181 m; Q16 × Q16 wraps to 0 | Accepted. **D2 revised (proposed): restricted float64** with transcendentals banned by lint (§2). IEEE basic ops and `sqrt` are identical across engines (R§4); this removes the overflow class |
| Sim inputs (`H()`, cost grid, decay factors) computed per browser with `Math.sin`/`pow` | Accepted: build-time data, hashed into the data version (§2) |
| Commands across the worker: who stamps the tick; AI commands applied twice on replay; variable-length state outside the hash | Accepted: sim stamps and quantizes; only external commands logged; pools for variable data (§3, §4) |
| Musketry calibration: 1.4–5 casualties/min, battle would look static; the research misread Duhèsme (3–4 casualties per whole firefight, not per minute) | Accepted: calibrate on time to break (§8); the research report is corrected in the same PR |
| Courier rule degenerate (almost every order by courier from the army commander; brigadiers do nothing) | Superseded: the owner dropped couriers; orders apply immediately (§6) |
| 120 m rigid lines: centre-point A*, misaligned 8 m grid, 174 m wheel sweeps, jittery reservation, no passage of lines | Accepted: clearance grids, column for turns, change front, 7.16 m aligned grid, interpenetration rules (§7) |
| Snapshot per tick at 8× = 160 posts/s; events lost | Accepted: snapshot per frame + event ring (§16) |
| Missing: targeting, arcs, friendly fire, cohesion vs morale, ammunition, map edges, group moves, succession, frontage shrink | Accepted (§3–§10) |
| Standing behaviour exploitable (feinting cavalry, columns stopping to fire) | Accepted: advance-without-firing flag, auto-square rule (§12) |
| Over-engineering: modifier stack, path reservation, smoke grid, army AI, four-browser gate on S0 | Accepted: plain stat functions, puffs, scripted plan, lint + Node golden hash + nightly browsers |
| Phasing: S1 infantry-only firefights are the least fun part | Accepted: short S0, then a combined-arms fun slice on the main thread (§17) |
