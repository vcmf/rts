---
status: draft
last_reviewed: 2026-10-08
---

# Engine Map

Status: **draft for discussion** (Oct 2026). Every part of the engine in one place: what it does,
which document owns its design, which phase builds it, and where it stands. Built from the
research in `docs/research/rts-engine-subsystems.md` (0 A.D., Spring/Recoil, OpenRA, Age of Empires,
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

The decision records in `docs/decisions/` are authoritative; this table keeps the D-labels other
docs cite: D1 → 0018, D2 → 0006, D3 → 0008, D4 → 0013, D5 → 0009, D6 → 0010, D7 → 0015.

| # | Decision | Status |
|---|---|---|
| D1 | **The battalion is the simulation's unit and the player's unit.** About 400 figures each (decision 0018, superseding 0007; the engine reaches 800), 20 a side (about 16k figures). One entity per battalion (line shape, strength, share loaded, morale, cohesion); the figures are placed and animated by the renderer from that state. Musketry is resolved per battalion; roundshot is a real ray bouncing on the heightfield | agreed (Oct 2026) |
| D2 | **Deterministic numbers in the simulation.** Revised after the sim-design review: **restricted float64** (IEEE `+ − × /` and `sqrt` only; `Math.sin`, `pow` and the like banned by lint; own trig; build-time input data; seeded integer RNG; index-ordered iteration) instead of Q16.16 fixed-point, which overflowed and was mis-specified (`docs/proposals/sim-design.md` §2, §19) | accepted (Oct 2026) |
| D3 | **No couriers: orders apply immediately.** Couriers would need trajectories, blocking and interception; too costly to do well. Generals still matter on the field (rally, morale) | agreed (Oct 2026) |
| D4 | **Single-player first, multiplayer-capable**: determinism, hashing and command logs are built as if lockstep were coming, so it stays a transport problem | accepted (Oct 2026) |
| D5 | **A battle takes 30–45 minutes of real time** (real battles lasted hours): a battle clock with speed controls (pause, 1×, 2×, 4–8×). Time of day is chosen per scenario and baked; the sun does not move during a battle | agreed (Oct 2026) |
| D6 | **The camera is locked down** (short 3D zoom); the far zoom is the staff map | agreed (`docs/proposals/engine-design.md`, `docs/proposals/staff-map/`) |
| D7 | **Era-generic engine, antiquity to Napoleon** (decision 0015): era-specific units, formations, weapons, movement and morale parameters are **era rulesets** (data); the Napoleonic ruleset is first; modern warfare is out of scope | agreed (Oct 2026) |

## 3. The map

Phase keys (from `docs/proposals/engine-design.md` §10): **S0** = simulation spine (new, see §4), **E0** =
engine spine (world, render), **P** = finish the prototype, **A** = alpha (content scales),
**Ship** = polish. Status: ✅ exists in the prototype · 🟡 partial · ⬜ not started.

### Core (runtime)

| Part | What it does | Owner doc | Phase | Status |
|---|---|---|---|---|
| Tick loop and command pipeline | Fixed 20 Hz tick; every change enters as a tick-stamped command | `docs/systems/sim-spine.md` | S0 | ✅ (S0) |
| Deterministic maths | Restricted float64, own trig, lint against banned functions, build-time input data | `docs/systems/sim-spine.md` | S0 | ✅ (S0) |
| Split RNG | Seeded sim RNG; separate cosmetic RNG for the renderer | `docs/architecture.md` | S0 | 🟡 (sim RNG) |
| Entity storage | Typed arrays, generational handles | `docs/systems/sim-spine.md` | S0 | ✅ (S0) |
| Serialization and state hash | One serializer for saves, hashes and debug dumps | `docs/systems/sim-spine.md` | S0 | ✅ (S0) |
| Replay | A command log replayed through the same pipeline | `docs/systems/sim-spine.md` | S0 | ✅ (Node; browsers S2) |
| Headless runner | The sim in Node and in a worker, no renderer, for tests and AI soak runs | `docs/systems/sim-spine.md` | S0 | 🟡 (Node; worker S2) |
| Metering | Always-on per-system tick time against the 50 ms budget | `docs/systems/sim-spine.md` | S0 | 🟡 (per-step hook; no display) |

### Simulation

| Part | What it does | Owner doc | Phase | Status |
|---|---|---|---|---|
| Heightfield and terrain layers | Height, slope, cover, roads, water depth and fords as sim data | `docs/proposals/engine-design.md` §4 | E0 | 🟡 (`H()`, river data) |
| Spatial index | Who is near whom, per formation (figures are not simulated, D1) | `docs/proposals/sim-design.md` | P | ⬜ |
| Formations and drill | Line, column, square, skirmish; frontage per file; **timed formation changes** (square ≈ 60–100 s) with a penalty while changing | `docs/systems/formations.md` | P | 🟡 (S1a: shapes, changes, Face about, Retire, wheels; no skirmish, no change penalty yet) |
| Orders and commanders | The player orders battalions (immediate, multi-selection); generals rally and steady nearby troops | `docs/proposals/sim-design.md` §6 | P | ⬜ |
| Movement | Formation paths over the heightfield; wheeling, line deformation over terrain; local separation | `docs/systems/formations.md`, `docs/architecture.md` §7 | P | 🟡 (S1a: the terrain lag model and the footprint gate; no paths, no contact) |
| Fire | Musketry per formation (share loaded, volleys, 1 hit per 300–800 rounds in battle); artillery rays with ricochet, canister cones | `docs/proposals/sim-design.md`, `docs/systems/fire-morale.md` | P | 🟡 (S1c-1: musketry by company, calibrated on time to break; no artillery) |
| Melee and charges | Impact, square vs cavalry, breach chance on a morale failure | `docs/proposals/sim-design.md` | P | ⬜ |
| Morale | Scalar with shocks (flank, rear, casualties, artillery), contagion from routing neighbours, general's rally radius; steady → shaken → wavering → routing → rallied / shattered | `docs/proposals/sim-design.md`, `docs/systems/fire-morale.md` | P | 🟡 (S1c-1: loss-driven, to routing; no rally, shocks or contagion) |
| Modifier stack | One place for every bonus and penalty (terrain, formation, fatigue, elevation, commander) | `docs/proposals/sim-design.md` | P | ⬜ |
| Condition | Fatigue, ammunition, fouling as separate values | `docs/proposals/sim-design.md` | A | ⬜ |
| Vision and smoke | Line of sight over the heightfield; **smoke as a field** that cuts sight (to ~45 m) and accuracy | `docs/proposals/sim-design.md` | P (LOS), A (smoke) | ⬜ |
| AI | Uses commands only; layers: army plan → brigade tactics → formation behaviour; time-sliced | `docs/proposals/sim-design.md` | A | ⬜ |
| Scenario and triggers | Objectives, reinforcements, victory conditions, scripted events | `docs/proposals/sim-design.md` | A | ⬜ |
| Battle clock | Time of day, compression, end of battle (D5) | `docs/proposals/sim-design.md` | A | ⬜ |

### Presentation

| Part | What it does | Owner doc | Phase | Status |
|---|---|---|---|---|
| Sim → render bridge | Reads snapshots (once per frame) and an event ring, interpolates | `docs/proposals/sim-design.md` §16 | S1 (direct), S2 (worker) | 🟡 (S1b: direct reads, interpolated; no event ring) |
| World rendering | Terrain, river, vegetation, painterly shading, bakes | `docs/proposals/engine-design.md`, `docs/art-bible.md` | E0 | ✅ prototype |
| Figures | Instanced figures placed from formation state; LOD; stepped animation (vertex animation textures); casualties | `docs/proposals/engine-design.md` §7 | P | ⬜ |
| Effects | Musket smoke, muzzle flashes, roundshot dust, painted | `docs/art-bible.md` §9 | P | ⬜ |
| Camera | Locked RTS camera; presentation cameras | `docs/proposals/engine-design.md` §5 | E0 | 🟡 |
| Staff map | Far zoom as a drawn map; `mapness` transition | `docs/proposals/staff-map/`, `docs/systems/sim-page.md` | P | 🟡 (feel prototype #4; S1b draws it from the sim data) |
| Selection and orders UI | Click, drag-box, groups; drawing orders (also on the staff map) | `docs/proposals/sim-design.md`, `docs/proposals/staff-map/`, `docs/systems/sim-page.md` | P | 🟡 (S1b: click, shift, box, group moves, panel; no groups, no drawn orders) |
| HUD | Formation cards (strength, morale, ammunition), notifications, battle clock | to write | A | ⬜ |
| Audio | Volleys, cannon, drums; a voice budget per battle | to write | A | ⬜ |
| Debug overlays | Formation slots, paths, ranges, vision, smoke, morale, tick time | `docs/proposals/sim-design.md` | S0 → P | 🟡 (S1b: slots, waypoints, frame times) |

### Content and tools

| Part | What it does | Owner doc | Phase | Status |
|---|---|---|---|---|
| Era rulesets | Per era (Napoleonic first): unit types, formations and drill, weapons, movement factors, morale, as data with inheritance and validation (D7) | `docs/proposals/sim-design.md` | P | ⬜ |
| **Order of battle** | Army → corps → division → brigade → battalion; commanders; starting positions. The core of a historical scenario | `docs/proposals/sim-design.md` | P (one battle), A | ⬜ |
| Map build | A JSON map language, its generator and compilers; draft and rendered views; real data (W6) later | `docs/proposals/map-engine.md` | M | ⬜ |
| Assets | Models and textures in, compressed (KTX2, meshopt) out | `docs/asset-sources.md` | A | 🟡 |
| Scenario editor | Place troops, objectives, triggers on a map | to write | A | ⬜ |
| Checks | Spec, geometry, pixel, determinism and replay checks | `docs/proposals/engine-design.md` §8 | ongoing | 🟡 |
| Video export | Replays re-rendered with a directed camera and the staff map | `docs/proposals/staff-map/`, `docs/art-bible.md` §6b | A | 🟡 (austerlitz MP4 export exists) |

### Platform

| Part | What it does | Owner doc | Phase | Status |
|---|---|---|---|---|
| Sim worker | The simulation in a Web Worker; snapshots as transferables (no special headers) | `docs/proposals/sim-design.md` §16 | S2 | ⬜ |
| Build | Vite + TypeScript, Babylon deep or `/pure` imports | `docs/architecture.md` §5 | prototype exit | 🟡 (S1b: Vite builds the sim page; no Babylon yet) |
| Saves | Seed + scenario + command log + snapshots; exportable files (Safari clears storage after 7 days unused) | `docs/proposals/sim-design.md` | A | ⬜ |
| Input | Bindings by `KeyboardEvent.code`; right-click and edge-pan handling | to write | P | 🟡 |
| Context loss | Rebuild the scene from the untouched sim state | `docs/proposals/engine-design.md` | A | ⬜ |
| Tab lifecycle | Pause the battle when the tab is hidden | `docs/proposals/sim-design.md` | P | ⬜ |

## 4. What changes in the order of work

The render side has a plan (`docs/proposals/engine-design.md` §10). The simulation side has none yet, and it is
the part the research says costs most to add late. Proposal: two tracks.

**Track S (simulation), new:**
Phases as revised in `docs/proposals/sim-design.md` §17:
- **S0 short spine** (2–3 days): number rules and lint, tables, commands, RNG, hash, Node replay,
  build step for the sim heightfield and cost grid.
- **S1 fun slice** (main thread, with the units placeholder): infantry, one cavalry regiment, one
  battery, morale, standing behaviour, multi-selection moves. Acceptance: a 20-minute fight of
  about 6 battalions per side is fun at 2× speed.
- **S2 hardening:** worker, vision, smoke, group moves, cross-browser replays.
- **S3 a real battle:** order of battle, scenarios, AI, saves.

**Track E (engine spine and the look):** scheduled in `docs/plans/active/track-e-look.md` (phases
L0–L9: E0-lite, the units placeholder and benchmark, the terrain detail layer, the soldier look, the
readability gate, the macro bake, smoke, foliage, anti-aliasing, the look match; water W2–W6 after L2).
The two tracks meet at the renderer's read of the sim (`SoldierLayer`, the volley state).

**Track M (the map engine):** a closed JSON language for maps, its generator, the compilers that write the sim's
and the look's data, and the draft and rendered views (`docs/proposals/map-engine.md`), built on the
`epic/map-engine` branch (decision 0020).

## 5. Open questions

1. Default game speed within the 30–45 minute battle length (D5).
2. Whether figures ever matter to the simulation (e.g. the general's figure), or everything stays
   per formation.
