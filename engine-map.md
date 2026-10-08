# Engine Map

Status: **draft for discussion** (Oct 2026). Every part of the engine in one place: what it does,
which document owns its design, which phase builds it, and where it stands. Built from the
research in `research/rts-engine-subsystems.md` (0 A.D., Spring/Recoil, OpenRA, Age of Empires,
Supreme Commander, Planetary Annihilation, StarCraft II, Total War, Ultimate General).

## 1. The shape of an RTS engine

Every engine studied has the same core: **a simulation that advances in fixed ticks and changes
only through commands**. Players, the AI, scripts, debug tools and replays all speak the same
command language. Everything else sits around that core:

```
            commands (player, AI, scripts, replay, debug)
                              │
                              ▼
   ┌──────────── SIMULATION (worker, 20 Hz, deterministic float64) ─────────────────┐
   │ formations · orders · commanders · movement · fire · melee · morale · vision   │
   └───────────────────────────────┬────────────────────────────────────────────────┘
                                   │ snapshots (per tick)
                                   ▼
   ┌──────────── PRESENTATION (main thread, 60 fps, interpolated) ──────────────────┐
   │ world · figures · effects · camera · staff map · UI · audio                    │
   └────────────────────────────────────────────────────────────────────────────────┘
        content & tools (data, scenarios, editor, debug)   ·   platform (browser)
```

The four obvious parts (assets, maps, camera, unit logic) are real, but the parts that cost most
to add late are in the core: commands, deterministic maths, hashing, a simulation that runs
without the renderer.

## 2. Decisions this map rests on

| # | Decision | Status |
|---|---|---|
| D1 | **The battalion is the simulation's unit and the player's unit.** About 100 figures each, 20–40 per battle (2k–4k figures). One entity per battalion (line shape, strength, share loaded, morale, cohesion); the figures are placed and animated by the renderer from that state. Musketry is resolved per battalion; roundshot is a real ray bouncing on the heightfield | agreed (Oct 2026) |
| D2 | **Deterministic numbers in the simulation.** Revised after the sim-design review: **restricted float64** (IEEE `+ − × /` and `sqrt` only; `Math.sin`, `pow` and the like banned by lint; own trig; build-time input data; seeded integer RNG; index-ordered iteration) instead of Q16.16 fixed-point, which overflowed and was mis-specified (`sim-design.md` §2, §19) | revised, proposed |
| D3 | **No couriers: orders apply immediately.** Couriers would need trajectories, blocking and interception; too costly to do well. Generals still matter on the field (rally, morale) | agreed (Oct 2026) |
| D4 | **Single-player first, multiplayer-capable**: determinism, hashing and command logs are built as if lockstep were coming, so it stays a transport problem | proposed |
| D5 | **A battle takes 30–45 minutes of real time** (real battles lasted hours): a battle clock with speed controls (pause, 1×, 2×, 4–8×). Time of day is chosen per scenario and baked; the sun does not move during a battle | agreed (Oct 2026) |
| D6 | **The camera is locked down** (short 3D zoom); the far zoom is the staff map | agreed (`engine-design.md`, `staff-map/`) |

## 3. The map

Phase keys (from `engine-design.md` §10): **S0** = simulation spine (new, see §4), **E0** =
engine spine (world, render), **P** = finish the prototype, **A** = alpha (content scales),
**Ship** = polish. Status: ✅ exists in the prototype · 🟡 partial · ⬜ not started.

### Core (runtime)

| Part | What it does | Owner doc | Phase | Status |
|---|---|---|---|---|
| Tick loop and command pipeline | Fixed 20 Hz tick; every change enters as a tick-stamped command | `web-rts-architecture.md` §4 | S0 | ⬜ |
| Deterministic maths | Restricted float64, own trig, lint against banned functions, build-time input data | `sim-design.md` §2 | S0 | ⬜ |
| Split RNG | Seeded sim RNG; separate cosmetic RNG for the renderer | `web-rts-architecture.md` | S0 | ⬜ |
| Entity storage | Typed arrays, generational handles | `web-rts-architecture.md` §3 | S0 | ⬜ |
| Serialization and state hash | One serializer for saves, hashes and debug dumps | new: `sim-design.md` | S0 | ⬜ |
| Replay | A command log replayed through the same pipeline | `sim-design.md` | S0 | ⬜ |
| Headless runner | The sim in Node and in a worker, no renderer, for tests and AI soak runs | `sim-design.md` | S0 | ⬜ |
| Metering | Always-on per-system tick time against the 50 ms budget | `sim-design.md` | S0 | ⬜ |

### Simulation

| Part | What it does | Owner doc | Phase | Status |
|---|---|---|---|---|
| Heightfield and terrain layers | Height, slope, cover, roads, water depth and fords as sim data | `engine-design.md` §4 | E0 | 🟡 (`H()`, river data) |
| Spatial index | Who is near whom, per formation (figures are not simulated, D1) | `sim-design.md` | P | ⬜ |
| Formations and drill | Line, column, square, skirmish; frontage per file; **timed formation changes** (square ≈ 60–100 s) with a penalty while changing | `sim-design.md` | P | ⬜ |
| Orders and commanders | The player orders battalions (immediate, multi-selection); generals rally and steady nearby troops | `sim-design.md` §6 | P | ⬜ |
| Movement | Formation paths over the heightfield; wheeling, line deformation over terrain; local separation | `sim-design.md`, `web-rts-architecture.md` §7 | P | ⬜ |
| Fire | Musketry per formation (share loaded, volleys, 1 hit per 300–800 rounds in battle); artillery rays with ricochet, canister cones | `sim-design.md` | P | ⬜ |
| Melee and charges | Impact, square vs cavalry, breach chance on a morale failure | `sim-design.md` | P | ⬜ |
| Morale | Scalar with shocks (flank, rear, casualties, artillery), contagion from routing neighbours, general's rally radius; steady → shaken → wavering → routing → rallied / shattered | `sim-design.md` | P | ⬜ |
| Modifier stack | One place for every bonus and penalty (terrain, formation, fatigue, elevation, commander) | `sim-design.md` | P | ⬜ |
| Condition | Fatigue, ammunition, fouling as separate values | `sim-design.md` | A | ⬜ |
| Vision and smoke | Line of sight over the heightfield; **smoke as a field** that cuts sight (to ~45 m) and accuracy | `sim-design.md` | P (LOS), A (smoke) | ⬜ |
| AI | Uses commands only; layers: army plan → brigade tactics → formation behaviour; time-sliced | `sim-design.md` | A | ⬜ |
| Scenario and triggers | Objectives, reinforcements, victory conditions, scripted events | `sim-design.md` | A | ⬜ |
| Battle clock | Time of day, compression, end of battle (D5) | `sim-design.md` | A | ⬜ |

### Presentation

| Part | What it does | Owner doc | Phase | Status |
|---|---|---|---|---|
| Sim → render bridge | Reads snapshots (once per frame) and an event ring, interpolates | `sim-design.md` §16 | S1 (direct), S2 (worker) | ⬜ |
| World rendering | Terrain, river, vegetation, painterly shading, bakes | `engine-design.md`, `design.md` | E0 | ✅ prototype |
| Figures | Instanced figures placed from formation state; LOD; stepped animation (vertex animation textures); casualties | `engine-design.md` §7 | P | ⬜ |
| Effects | Musket smoke, muzzle flashes, roundshot dust, painted | `design.md` §9 | P | ⬜ |
| Camera | Locked RTS camera; presentation cameras | `engine-design.md` §5 | E0 | 🟡 |
| Staff map | Far zoom as a drawn map; `mapness` transition | `staff-map/` (in progress) | P | 🟡 feel prototype |
| Selection and orders UI | Click, drag-box, groups; drawing orders (also on the staff map) | `sim-design.md`, `staff-map/` | P | ⬜ |
| HUD | Formation cards (strength, morale, ammunition), notifications, battle clock | to write | A | ⬜ |
| Audio | Volleys, cannon, drums; a voice budget per battle | to write | A | ⬜ |
| Debug overlays | Formation slots, paths, ranges, vision, smoke, morale, tick time | `sim-design.md` | S0 → P | ⬜ |

### Content and tools

| Part | What it does | Owner doc | Phase | Status |
|---|---|---|---|---|
| Unit data | Formations, weapons, nations as data with inheritance and validation | `sim-design.md` | P | ⬜ |
| **Order of battle** | Army → corps → division → brigade → battalion; commanders; starting positions. The core of a historical scenario | `sim-design.md` | P (one battle), A | ⬜ |
| Map build | Heightfield, rivers, roads, villages, AI hints from real data (W6) | `engine-design.md` §10 | P | ⬜ |
| Assets | Models and textures in, compressed (KTX2, meshopt) out | `asset-sources.md` | A | 🟡 |
| Scenario editor | Place troops, objectives, triggers on a map | to write | A | ⬜ |
| Checks | Spec, geometry, pixel, determinism and replay checks | `engine-design.md` §8 | ongoing | 🟡 |
| Video export | Replays re-rendered with a directed camera and the staff map | `staff-map/`, `design.md` §6b | A | 🟡 (austerlitz MP4 export exists) |

### Platform

| Part | What it does | Owner doc | Phase | Status |
|---|---|---|---|---|
| Sim worker | The simulation in a Web Worker; snapshots as transferables (no special headers) | `sim-design.md` §16 | S2 | ⬜ |
| Build | Vite + TypeScript, Babylon deep or `/pure` imports | `web-rts-architecture.md` §5 | prototype exit | ⬜ |
| Saves | Seed + scenario + command log + snapshots; exportable files (Safari clears storage after 7 days unused) | `sim-design.md` | A | ⬜ |
| Input | Bindings by `KeyboardEvent.code`; right-click and edge-pan handling | to write | P | 🟡 |
| Context loss | Rebuild the scene from the untouched sim state | `engine-design.md` | A | ⬜ |
| Tab lifecycle | Pause the battle when the tab is hidden | `sim-design.md` | P | ⬜ |

## 4. What changes in the order of work

The render side has a plan (`engine-design.md` §10). The simulation side has none yet, and it is
the part the research says costs most to add late. Proposal: two tracks.

**Track S (simulation), new:**
Phases as revised in `sim-design.md` §17:
- **S0 short spine** (2–3 days): number rules and lint, tables, commands, RNG, hash, Node replay,
  build step for the sim heightfield and cost grid.
- **S1 fun slice** (main thread, with the units placeholder): infantry, one cavalry regiment, one
  battery, morale, standing behaviour, multi-selection moves. Acceptance: a 20-minute fight of
  about 6 battalions per side is fun at 2× speed.
- **S2 hardening:** worker, vision, smoke, group moves, cross-browser replays.
- **S3 a real battle:** order of battle, scenarios, AI, saves.

**Track E (engine spine and the look):** unchanged (E0-lite, then water W2–W5, scale-up,
performance, video tier, W6). The two tracks meet at the units placeholder.

## 5. Open questions

1. One figure = one soldier (proposal), or one figure = several men (`sim-design.md` §1).
2. Default game speed within the 30–45 minute battle length (D5).
3. Whether figures ever matter to the simulation (e.g. the general's figure), or everything stays
   per formation.
