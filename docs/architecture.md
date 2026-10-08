---
status: current
last_reviewed: 2026-10-08
---

# Web RTS — Architecture & Babylon.js Setup

Reference doc for building a browser-based RTS with Babylon.js, structured for
AI-agent-assisted development.

> **Revision, Oct 2026.** Fixed: entity handles could go negative (§3);
> `UnitRenderer` ignored unit type and only wrote X/Z (§3); `spawn()` bumped the
> counter before the cap check (§3); the crowd-avoidance seam was unaddressed and
> would have moved position ownership into `render/` (§7); determinism rules
> weren't linted (§5). Added: "Tick rate vs frame rate" (§4) with `sim/time.ts`.
> Verified: Babylon.js 9.0 (released 26 Mar 2026) and
> Navigation Plugin V2 in `@babylonjs/addons` (announced Oct 2025). Removed an
> unverified bundle-size figure.

**Core thesis:** the engine choice is secondary. The decision that determines
whether this project survives contact with reality is the hard separation of
**simulation** from **rendering**.

---

## 1. Why split simulation from rendering

Four reasons, in order of how much they'll matter to you:

1. **The sim becomes testable without a browser.** Pure TypeScript, no WebGL
   context, no canvas, no engine. `vitest run` executes 10,000 ticks of combat
   in milliseconds. You cannot meaningfully unit-test code that is tangled with
   a renderer.
2. **It's the code an AI agent writes most reliably.** Game logic with zero
   third-party API surface is just data structures and arithmetic — no
   hallucinated method names, no version-drifted APIs. The failure rate of
   agent-written code is roughly proportional to how much unfamiliar library
   surface it touches. The sim touches none.
3. **The engine stops being load-bearing.** If Babylon disappoints you in month
   three, you rewrite `render/` and keep the actual game. That's a weekend, not
   a restart.
4. **It's the only path to the things you'll want later** — web workers, a
   Rust/WASM sim core, deterministic lockstep multiplayer, replays, and a
   non-cheating AI. All four require a sim that can run headless and
   deterministically. Retrofitting that into tangled code is a rewrite.

### The rule

> `sim/` must never import from `@babylonjs/*`. Enforce it with a lint rule, not
> with discipline.

The renderer reads sim state. The sim never knows the renderer exists.

```
            ┌──────────────┐
  input ───►│    sim/      │  fixed timestep, deterministic, pure TS
            │  (the game)  │  no Babylon, no DOM, no Date.now, no Math.random
            └──────┬───────┘
                   │  read-only state snapshot
                   ▼
            ┌──────────────┐
            │   render/    │  Babylon. variable framerate. interpolates.
            │  (the view)  │  owns meshes, camera, picking, navmesh viz
            └──────┬───────┘
                   │
                   ▼
            ┌──────────────┐
            │     ui/      │  DOM / React overlay. HUD, minimap, build menu.
            └──────────────┘
```

---

## 2. Directory layout

```
src/
  sim/
    world.ts          # the authoritative state container (typed arrays, see §3)
    handle.ts         # entity handles: (generation << 12) | index — always ≥ 0
    tick.ts           # advanceTick(world, commands, deps) -> void
    units.ts          # unit data, spawn, damage, death
    combat.ts
    economy.ts
    pathing.ts        # requests path corridors; does NOT own the navmesh geometry
    steering.ts       # follows corridors + local separation — owns movement (see §7)
    vision.ts         # fog of war
    rng.ts            # seeded PRNG — the ONLY source of randomness
    time.ts           # TICK_HZ / TICK_MS / DT + per-second conversions (§4)
    commands.ts       # the command/intent types (see §4)
    index.ts
  render/
    engine.ts         # Babylon Engine + Scene bootstrap
    camera.ts         # RTS camera: pan, edge-scroll, zoom, rotate; derives `mapness`
    staffMap.ts       # far-zoom map: baked map texture + ink overlay (docs/proposals/staff-map/implementation.md)
    terrain.ts        # heightmap ground
    unitRenderer.ts   # thin instances, one buffer per unit type
    selection.ts      # picking, drag-box, selection decals
    navmesh.ts        # Recast (Navigation Plugin V2) — owns the navmesh, serves sim/pathing.
                      # Path queries only. NO crowd agents (see §7).
    effects.ts
  ui/
    Hud.tsx
    Minimap.tsx
  net/                # later. lockstep command relay.
  main.ts             # wires the three layers together
test/
  sim/                # headless, fast, deterministic
```

`sim/pathing.ts` asks for a path; `render/navmesh.ts` computes it. That seam is
the one place the separation is awkward — see §7 for how to handle it cleanly.

---

## 3. The data model — *beside* Babylon, not *on top of* it

You have to write your own data model. Babylon has no concept of a unit, a
player, a resource or a tech tree — that layer is the game, and nobody can
supply it for you.

But the preposition is load-bearing. "A sub-engine **on top of** Babylon" and
"a sim layer **beside** Babylon" sound like the same sentence and produce
opposite projects.

### The trap

```ts
// ❌ on top of Babylon — looks like the obvious design for three weeks
class Unit {
  mesh: Mesh;
  hp: number;
  move(dx: number, dz: number) { this.mesh.position.x += dx; }
}
```

Here the game state *is* the scene graph. Every unit's truth lives inside a
rendering object. What that costs you, all at once:

| Lost | Because |
|---|---|
| Headless tests | Instantiating a `Unit` requires a WebGL context |
| Web worker / WASM port | `Mesh` can't leave the main thread |
| Replays & save games | A scene graph doesn't serialize |
| Determinism | Babylon's internals aren't yours to control |
| Engine portability | The game and the renderer are the same object |

This is the single most common way hobby RTS projects die. It never fails
loudly — it just quietly makes every later feature impossible.

### The shape instead

Truth flows one way. The model owns reality; Babylon is a downstream view of it
that can be thrown away and rebuilt at any time.

```
  sim/  ──── owns truth, knows nothing of Babylon
    │
    │  read-only
    ▼
  render/  ──── Babylon. A projection. Disposable.
```

### Structure of arrays, not objects

For hundreds-to-thousands of units, don't allocate one object per unit. Store
each field as a typed array indexed by entity slot:

```ts
// sim/world.ts
export const MAX_UNITS = 4096;

export interface World {
  tick: number;
  rngState: number;

  unitCount: number;          // high-water mark of slots ever used
  alive:  Uint8Array;
  gen:    Uint32Array;        // bumped on free — see handles below
  owner:  Uint8Array;
  type:   Uint8Array;
  posX:   Float32Array;
  posZ:   Float32Array;
  prevX:  Float32Array;       // position at last tick; render interpolates
  prevZ:  Float32Array;
  facing: Float32Array;       // radians around +Y; render interpolates
  prevFacing: Float32Array;
  hp:     Int16Array;
  state:  Uint8Array;         // Idle | Moving | Attacking | ...
  target: Int32Array;         // handle, NO_TARGET (-1) = none
  freeList: number[];
}

export const NO_TARGET = -1;

export function createWorld(seed: number): World {
  return {
    tick: 0,
    rngState: seed >>> 0,
    unitCount: 0,
    alive:  new Uint8Array(MAX_UNITS),
    gen:    new Uint32Array(MAX_UNITS),
    owner:  new Uint8Array(MAX_UNITS),
    type:   new Uint8Array(MAX_UNITS),
    posX:   new Float32Array(MAX_UNITS),
    posZ:   new Float32Array(MAX_UNITS),
    prevX:  new Float32Array(MAX_UNITS),
    prevZ:  new Float32Array(MAX_UNITS),
    facing: new Float32Array(MAX_UNITS),
    prevFacing: new Float32Array(MAX_UNITS),
    hp:     new Int16Array(MAX_UNITS),
    state:  new Uint8Array(MAX_UNITS),
    target: new Int32Array(MAX_UNITS).fill(NO_TARGET),
    freeList: [],
  };
}
```

### Entities are integer handles, never object references

```ts
// sim/handle.ts
import { type World, NO_TARGET } from "./world";

// Layout: 12-bit index (matches MAX_UNITS = 4096) + 19-bit generation = 31 bits.
// Bit 31 is never used, so a valid handle is ALWAYS a non-negative int32 and
// -1 (NO_TARGET) can never collide with one.
export type Handle = number;
export const INDEX_BITS = 12;
export const INDEX_MASK = (1 << INDEX_BITS) - 1;     // 0xfff
export const GEN_MASK   = 0x7ffff;                   // 19 bits → wraps at 524,288

export const makeHandle = (i: number, g: number): Handle => (g << INDEX_BITS) | i;
export const index = (h: Handle): number => h & INDEX_MASK;
export const gen   = (h: Handle): number => h >>> INDEX_BITS;

export function isAlive(w: World, h: Handle): boolean {
  if (h === NO_TARGET) return false;
  const i = index(h);
  return w.alive[i] === 1 && w.gen[i] === gen(h);
}
```

> **Why not `(gen << 20) | index`?** JavaScript's `<<` produces a *signed*
> 32-bit result. With a 12-bit generation above index bit 20, every handle with
> generation ≥ 2048 comes out **negative** — so any code that tests
> `target >= 0` for "has a target" silently breaks halfway through a long game.
> Size the index to `MAX_UNITS` and give the spare bits to the generation; more
> generation bits also make wrap-around collisions far rarer. If you ever raise
> `MAX_UNITS`, keep `INDEX_BITS + generation bits ≤ 31`.
>
> Rule regardless: test "no target" with `=== NO_TARGET`, never with the sign.

This is why `World.gen` is a `Uint32Array`: 19 generation bits don't fit in a
`Uint16Array`.

The generation counter is what kills the classic RTS bug: unit A is attacking
unit B, B dies, its slot is recycled by a freshly spawned unit C, and A silently
starts attacking C. With raw indices that bug is invisible and intermittent.
With generations, the stale handle simply fails `isAlive` and A re-targets.

Object references would also solve it — but references can't be serialized,
can't cross a worker boundary, and can't be snapshotted. Handles can do all
three. That's the trade, and for an RTS it isn't close.

```ts
// sim/units.ts
export function spawn(w: World, type: UnitType, owner: number, x: number, z: number): Handle {
  let i: number;
  if (w.freeList.length > 0) {
    i = w.freeList.pop()!;
  } else {
    if (w.unitCount >= MAX_UNITS) throw new Error("unit cap reached"); // check BEFORE bumping
    i = w.unitCount++;
  }

  w.alive[i]  = 1;
  w.owner[i]  = owner;
  w.type[i]   = type;
  w.posX[i]   = w.prevX[i] = x;
  w.posZ[i]   = w.prevZ[i] = z;
  w.facing[i] = w.prevFacing[i] = 0;
  w.hp[i]     = UNIT_STATS[type].maxHp;
  w.state[i]  = UnitState.Idle;
  w.target[i] = NO_TARGET;
  return makeHandle(i, w.gen[i]);
}

export function free(w: World, h: Handle): void {
  if (!isAlive(w, h)) return;
  const i = index(h);
  w.alive[i] = 0;
  w.gen[i] = (w.gen[i] + 1) & GEN_MASK;   // must match the handle layout
  w.freeList.push(i);
}
```

### The tick

One function, fixed system order. The ordering *is* the determinism contract —
reordering these lines changes game outcomes, so treat it as API.

```ts
// sim/tick.ts
// deps holds injected services (PathProvider). They live OUTSIDE World, so the
// world stays plain serializable data.
export function advanceTick(w: World, commands: Command[], deps: SimDeps): void {
  w.prevX.set(w.posX);        // snapshot for render interpolation
  w.prevZ.set(w.posZ);
  w.prevFacing.set(w.facing);

  for (const c of commands) applyCommand(w, c);

  movement(w, deps.paths);    // corridor following + separation — sim owns ALL motion (§7)
  combat(w);
  production(w);
  vision(w);
  reaping(w);                 // free the dead LAST, so systems see stable state

  w.tick++;
}
```

### The renderer becomes a projection

No per-unit JavaScript objects are touched while rendering. The loop reads
typed arrays and writes directly into a thin-instance matrix buffer allocated
once at startup.

```ts
// render/unitRenderer.ts — one instance of this per unit type
export class UnitRenderer {
  private matrices = new Float32Array(MAX_UNITS * 16);   // allocated ONCE
  private mesh!: Mesh;

  constructor(
    private readonly unitType: UnitType,                  // this renderer draws ONLY this type
    private readonly groundY: (x: number, z: number) => number, // terrain height sampler (render-side)
  ) {}

  init(mesh: Mesh): void {
    this.mesh = mesh;
    mesh.thinInstanceSetBuffer("matrix", this.matrices, 16, false); // staticBuffer = false
  }

  sync(w: World, alpha: number): void {
    const m = this.matrices;
    let n = 0;
    for (let i = 0; i < w.unitCount; i++) {
      if (w.alive[i] !== 1 || w.type[i] !== this.unitType) continue;

      const x = w.prevX[i] + (w.posX[i] - w.prevX[i]) * alpha;
      const z = w.prevZ[i] + (w.posZ[i] - w.prevZ[i]) * alpha;
      const a = lerpAngle(w.prevFacing[i], w.facing[i], alpha);
      const c = Math.cos(a), s = Math.sin(a);

      // Write the WHOLE matrix every time — a recycled slot must never inherit
      // the previous occupant's rotation. Layout matches Matrix.RotationY + translation.
      const o = n * 16;
      m[o]      = c; m[o + 1]  = 0; m[o + 2]  = -s; m[o + 3]  = 0;
      m[o + 4]  = 0; m[o + 5]  = 1; m[o + 6]  = 0;  m[o + 7]  = 0;
      m[o + 8]  = s; m[o + 9]  = 0; m[o + 10] = c;  m[o + 11] = 0;
      m[o + 12] = x; m[o + 13] = this.groundY(x, z); m[o + 14] = z; m[o + 15] = 1;
      n++;
    }
    this.mesh.thinInstanceCount = n;
    this.mesh.thinInstanceBufferUpdated("matrix");
  }
}

// Shortest-arc interpolation, so a unit turning from 350° to 10° doesn't spin the long way.
function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
```

Notes:
- **Filter by type.** Each renderer owns one mesh; without the `w.type[i]`
  check every renderer would draw every unit.
- **Height is a render concern here** (`groundY` samples the visual terrain).
  If gameplay needs elevation (high-ground bonuses, line of sight), give the sim
  its own height grid in `sim/` and have both layers read it, rather than letting
  the sim call into the renderer.
- Only the first `thinInstanceCount` matrices are drawn, so slots past `n` don't
  need clearing.

`sync()` is the entire contract between the layers. If you ever replace Babylon,
this file is what you rewrite.

### Why this layout pays off four separate times

1. **Snapshots are a buffer copy.** Replays, save games and rollback netcode all
   reduce to copying typed arrays.
2. **Worker transfer is zero-copy.** Typed arrays move as transferables, or live
   in a `SharedArrayBuffer`. Moving the sim off the main thread becomes a move,
   not a rewrite — and it has no DOM dependencies to untangle, by construction.
3. **Rendering is allocation-free.** No GC pressure from per-frame object churn,
   which is what actually causes stutter in JS games.
4. **The WASM port is pre-done.** This memory layout is already what Rust wants.
   You'd port logic, not structure.

None of the four require you to do anything extra today. They're consequences of
the layout, which is the point — it's cheap now and unbuyable later.

### Scope warning: build a data model, not a framework

The failure mode at this layer is writing a general-purpose ECS: component
registries, archetype storage, query builders. Six months later you have an
engine and no game.

You need exactly three things: a `World`, an `advanceTick(world, commands, deps)`, and
a command queue. Add generality only when a second concrete use case demands it.

### Don't reach for bitECS or miniplex

They're good libraries, and in a different setup I'd suggest one. For this
project, hand-rolled plain data wins on a specific axis: **there's no library
API surface for an AI agent to hallucinate.** No version drift, no framework
idioms to get subtly wrong, and when something breaks you inspect a typed array
instead of debugging through someone else's abstraction. It's also the code an
agent writes most reliably, because it's just arithmetic over arrays.

## 4. The interface between layers

Keep it to two narrow channels.

**Down: commands.** Input never mutates the world directly. It produces
serializable intents that are queued and applied at the start of a tick. This
is also exactly what you send over the wire for multiplayer, and what you record
for replays — get it right once and three features come free.

```ts
// sim/commands.ts
export type Command =
  | { kind: "move";    unitIds: number[]; x: number; z: number }
  | { kind: "attack";  unitIds: number[]; targetId: number }
  | { kind: "build";   playerId: number; buildingType: BuildingType; x: number; z: number }
  | { kind: "train";   buildingId: number; unitType: UnitType };
```

**Up: state reads.** The renderer reads the world directly but treats it as
immutable. Don't build an event bus for this — polling a plain object every
frame is simpler and faster than you think.

### Fixed timestep with interpolation

The sim runs at a fixed rate (20 Hz is plenty for an RTS — SC2 ran at ~22.4).
The renderer runs at display rate and interpolates between the last two sim
states so movement looks smooth at 144 fps despite a 20 Hz sim.

```ts
// main.ts
import { TICK_MS } from "./sim/time";   // 50 ms = 20 Hz — defined once, see below
let accumulator = 0;
let last = performance.now();

engine.runRenderLoop(() => {
  const now = performance.now();
  accumulator += Math.min(now - last, 250); // clamp: never spiral after a tab stall
  last = now;

  while (accumulator >= TICK_MS) {
    advanceTick(world, drainCommandQueue(), deps);   // deps = { paths: recastPathProvider }
    accumulator -= TICK_MS;
  }

  const alpha = accumulator / TICK_MS; // 0..1 interpolation factor
  renderer.sync(world, alpha);
  scene.render();
});
```

The `Math.min(..., 250)` clamp matters. Without it, backgrounding the tab for a
minute makes the sim try to catch up with 1,200 ticks in one frame and the page
locks.

### Tick rate vs frame rate: why 20 Hz, not 60 or 120

These are two different numbers, and conflating them is the most common
instinct to get wrong here (in most action games they *are* the same number):

| | Rate | Decides |
|---|---|---|
| **Frame rate** | display rate: 60 / 120 / 144 fps | how *smooth* it looks |
| **Tick rate** | fixed: 20 Hz | how often *game logic* advances |

Smoothness comes entirely from the renderer interpolating between the last two
ticks (`alpha` above). A 20 Hz sim on a 144 Hz monitor looks like 144 Hz.

**The genre standard is 10–30 Hz.** StarCraft II runs ~22.4 ticks/s at "Faster",
Brood War ~24, Supreme Commander 10, and Age of Empires II advances in lockstep
turns of ~100–200 ms. Competitive RTS players are extremely latency-sensitive,
and these rates feel crisp.

**Why not 60 or 120 Hz?** Every cost scales linearly with tick rate:
- **CPU:** 120 Hz is 6× the sim work of 20 Hz. That's the difference between
  supporting ~3,000 units and ~500 in the same budget.
- **Lockstep:** every peer must finish every tick; more ticks mean more chances
  for the slowest machine to stall everyone.
- **Determinism & replays:** 6× more steps for float drift to accumulate, 6×
  larger checksum logs.

**Responsiveness is about input latency, not tick rate.** At 20 Hz a command
waits at most 50 ms (25 ms on average) for the next tick. In multiplayer,
network delay dominates that anyway. What makes a game *feel* instant is
feedback that doesn't wait for the sim:

```ts
// render/ or ui/ — fires the moment input is received, BEFORE the sim sees the command
function onRightClick(x: number, z: number) {
  queueCommand({ kind: "move", unitIds: selected, x, z }); // sim applies it next tick
  effects.spawnMoveMarker(x, z);   // ground ping, immediately
  audio.play("ack");               // unit acknowledgement voice/click
  // selection highlight, cursor change, etc. — all render-side, all instant
}
```

StarCraft does exactly this: the order executes a tick later, but the player
never perceives the wait. Purely cosmetic feedback is safe to run outside the
sim because it never changes game state.

#### Rule 1: the tick rate lives in one constant, owned by the sim

```ts
// sim/time.ts — the ONLY place the tick rate is defined
export const TICK_HZ = 20;
export const TICK_MS = 1000 / TICK_HZ;
export const DT = 1 / TICK_HZ;                       // seconds per tick

export const perSecond = (v: number) => v * DT;      // speed, regen, DPS → per tick
export const seconds   = (s: number) => Math.round(s * TICK_HZ); // durations → ticks
```

`main.ts` imports `TICK_MS` from here instead of declaring its own.

#### Rule 2: gameplay data is authored in seconds, never in ticks

```ts
// ✅ authored in real units, converted once at load
export const UNIT_STATS = {
  [UnitType.Rifleman]: { maxHp: 100, speed: 4.5 /* m/s */, cooldown: 1.2 /* s */, dps: 12 },
};
// at load:  speedPerTick = perSecond(4.5);  cooldownTicks = seconds(1.2);

// ❌ silently tied to 20 Hz — every value becomes wrong if the rate changes
const SPEED = 0.225;      // "per tick"
const COOLDOWN = 24;      // "ticks"
```

Follow both rules and changing the tick rate is a one-line edit plus a re-test,
not a rebalance of every unit in the game.

**When you *do* want something faster than the tick:**
- **Fast projectiles tunnelling through targets:** use swept collision (test the
  segment travelled this tick), or substep only projectiles 2–4× inside a tick.
- **Micro-heavy, action-like combat that playtests as sluggish** even *after*
  adding input feedback: try 30 Hz before anything higher.
- **Rigid-body physics** wants ~60 Hz, but per §6 you probably don't need it.

**Recommendation:** start at 20 Hz. Revisit only if playtests feel sluggish
after instant feedback is in place, and then try 30 Hz first.

### Determinism rules for `sim/`

Non-negotiable if you ever want lockstep multiplayer or reliable replays:

- **No `Math.random()`.** Seeded PRNG only, stored in the world, advanced by the
  sim. One shared stream.
- **No `Date.now()` / `performance.now()`.** The sim's clock is its tick count.
- **Stable iteration order.** Arrays and numeric-keyed maps. Never iterate a
  `Set` of objects or a `Map` keyed by object identity.
- **No floats if you go cross-machine lockstep.** Float math is not guaranteed
  identical across browsers/CPUs. Fixed-point integers (e.g. positions in
  1/1024 units) if you need bit-exact sync. For single-player and
  server-authoritative netcode, floats are fine — decide this early, it's
  painful to change.

---

## 5. Babylon.js setup

### Install

```bash
npm i @babylonjs/core @babylonjs/loaders
npm i @babylonjs/addons @recast-navigation/core @recast-navigation/generators   # Navigation Plugin V2
npm i @babylonjs/havok          # physics (optional for an RTS; often unnecessary)
npm i -D typescript vite vitest
```

**Navigation: use Plugin V2, not the legacy one.** Babylon's original
`RecastJSPlugin` depends on the old `recast-detour` package, which often breaks
with ES6 bundlers and is slated for deprecation. **Navigation Plugin V2**
(announced Oct 2025) lives in `@babylonjs/addons`, is built on Isaac Mason's
`recast-navigation-js`, and keeps the same `INavigationEnginePlugin` interface.
It's created through an async factory — `CreateNavigationPluginAsync()` —
rather than a constructor. Check the V2 docs for the exact import path and the
current list of `@recast-navigation/*` packages before wiring it up; don't let
an agent guess them.

**Pin exact versions** in `package.json` (Babylon.js 9.0 shipped 26 March
2026). Floating versions plus an AI agent is how you get silent API drift.

### ES6 imports — subpaths only

Importing the barrel (`from "@babylonjs/core"`) defeats tree-shaking and drags
in most of the engine. Don't trust a remembered number — measure your own
bundle (`vite build` plus `rollup-plugin-visualizer`) before and after. Use
subpath imports and side-effect imports:

```ts
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3, Matrix } from "@babylonjs/core/Maths/math.vector";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { CreateGroundFromHeightMap } from "@babylonjs/core/Meshes/Builders/groundBuilder";

// side-effect imports: register features that are otherwise tree-shaken away
import "@babylonjs/core/Meshes/thinInstanceMesh";
import "@babylonjs/core/Culling/ray";          // needed for scene.pick
import "@babylonjs/loaders/glTF";
```

The side-effect imports are the classic Babylon ES6 trap: the method exists in
the typings, compiles fine, and is `undefined` at runtime because the module
that patches it onto the prototype was never imported. If something types
correctly but is missing at runtime, this is why.

### `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noUnusedLocals": true,
    "skipLibCheck": true
  }
}
```

`strict` is doing real work here: it's the feedback loop that catches
agent-written mistakes before you ever run the game.

### Scripts

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "check": "npm run typecheck && npm run test && npm run lint"
  }
}
```

`npm run check` is the single command the agent should run after every change.

### Enforce the layer boundary

```js
// eslint.config.js — the rule that keeps this architecture honest
{
  files: ["src/sim/**/*.ts"],
  rules: {
    "no-restricted-imports": ["error", {
      patterns: [
        { group: ["@babylonjs/*"], message: "sim/ must stay engine-free." },
        { group: ["react", "react-dom"], message: "sim/ must stay UI-free." }
      ]
    }],
    "no-restricted-globals": ["error", "window", "document", "performance"],
    // The two determinism rules from §4, enforced instead of remembered:
    "no-restricted-properties": ["error",
      { object: "Math", property: "random", message: "Use the seeded PRNG in sim/rng.ts." },
      { object: "Date", property: "now",    message: "The sim clock is world.tick." }
    ],
    "no-restricted-syntax": ["error",
      { selector: "NewExpression[callee.name='Date']", message: "No wall-clock time in sim/." }
    ]
  }
}
```

Every rule in §4's "Determinism rules" that *can* be linted now is. The rest
(stable iteration order, float policy) stay in `CLAUDE.md` and code review.

---

## 6. Babylon features that map to RTS problems

| Problem | Use |
|---|---|
| Thousands of units, few draw calls | **Thin instances** — one mesh per unit type, per-instance matrix buffer. Update the `Float32Array` in place each frame; don't recreate it. |
| Pathfinding | **Navigation Plugin V2** (`@babylonjs/addons`, built on `recast-navigation-js`). Navmesh generation and path queries out of the box. It also ships a **crowd** system with local avoidance — but in this architecture you deliberately *don't* use crowd agents for authoritative movement; see §7. (Recast is a standalone library, so this isn't really Babylon-exclusive: `recast-navigation-js` also has a three.js integration.) |
| Click-select / drag-box select | `scene.pick` for single clicks. For box-select over hundreds of units, **don't raycast** — project unit world positions to screen space with the view-projection matrix and test against the 2D rect. O(n) and trivial. `GPUPicker` is available for dense pixel-accurate picking if you need it. |
| Terrain | `CreateGroundFromHeightMap`, or a custom mesh if you need deformation. |
| Ground decals (selection rings, build previews) | Decals, or flat alpha-blended planes offset slightly above ground — cheaper and sorts predictably. |
| Fog of war | Shader-sampled mask texture updated from sim vision state. Keep the mask data in `sim/vision.ts`; `render/` only uploads it. |
| HUD | **DOM/React overlay, not Babylon GUI.** You get real layout, real accessibility, real text rendering, and CSS. Babylon GUI is for in-world 3D UI. |
| Physics | You probably don't need it. RTS movement is steering + navmesh, not rigid bodies. Skip Havok until you have a concrete reason — it's a 1 MB WASM payload. |

---

## 7. Handling the navmesh seam

There are two separate problems here, and conflating them is how the
architecture quietly breaks:

1. **Global pathing:** *which way* do I go to reach the target? (A corridor of
   waypoints.)
2. **Local movement:** *how* do I walk it — speed, turning, not overlapping my
   neighbours? (Steering and avoidance.)

The navmesh lives in `render/` (Recast is a renderer-adjacent dependency), but
both questions affect unit positions — and **positions are sim truth**.

### Path queries: dependency inversion

The sim declares the interface; the outer layer supplies the implementation:

```ts
// sim/pathing.ts — sim owns the CONTRACT, not the implementation
export interface SimDeps { paths: PathProvider }

export interface PathProvider {
  /** Corner points [x0,z0, x1,z1, ...] from start to goal. Empty if unreachable. */
  findPath(fromX: number, fromZ: number, toX: number, toZ: number): Float32Array;
  isWalkable(x: number, z: number): boolean;
  /** Nearest point on the walkable surface — used to keep steering on the mesh. */
  clampToWalkable(x: number, z: number, out: Float32Array): void;
}
```

`main.ts` constructs the Recast-backed implementation and passes it to
`advanceTick` in a `deps` object. It is deliberately *not* stored on `World`:
the world must stay plain data so snapshots, replays and worker transfer keep
working. `sim/` stays import-clean, tests inject a trivial grid-based stub, and
the lint rule stays satisfied.

### Local movement: the crowd trap

Recast ships a **crowd** system (DetourCrowd): register agents, give them
targets, and it moves them with local avoidance. It's tempting — it's the
feature that makes Recast look like a finished RTS movement system. But crowd
agents **own their positions**. If the crowd runs in `render/` and writes
positions, then `render/` owns the truth, and everything in §1 is gone:
headless tests, replays, determinism, the worker move.

Pick one of these deliberately:

**Option A: corridors from Recast, steering in the sim (recommended).**
Recast answers only `findPath`. `sim/steering.ts` moves units along the corridor
with plain arithmetic: seek the next corner, arrive-and-slow at the end,
separate from neighbours found through a spatial hash (a uniform grid of cell
buckets rebuilt each tick), then clamp the result to the walkable surface.

```ts
// sim/steering.ts — sketch; the whole movement system is plain math over arrays
const tmp = new Float32Array(2);                // scratch, allocated once

export function movement(w: World, paths: PathProvider): void {
  rebuildSpatialHash(w);                        // uniform grid, cell ≈ 2× unit radius
  for (let i = 0; i < w.unitCount; i++) {
    if (w.alive[i] !== 1 || w.state[i] !== UnitState.Moving) continue;
    const [sx, sz] = seekNextCorner(w, i);      // advance corner index when close
    const [px, pz] = separation(w, i);          // push away from overlapping neighbours
    integrate(w, i, sx + px, sz + pz);          // cap speed, update posX/posZ/facing
    paths.clampToWalkable(w.posX[i], w.posZ[i], tmp);
    w.posX[i] = tmp[0]; w.posZ[i] = tmp[1];
  }
}
```

- ✅ The sim owns every position. Tests, replays and the worker port all keep working.
- ✅ The behaviour is yours to tune: formations, unit sizes, pushing priority.
- ❌ You write ~200–400 lines of steering instead of getting it free. That's the
  right trade: it's exactly the kind of pure arithmetic this architecture wants
  agents writing.

**Option B: crowd is authoritative, accept the consequences.**
Run DetourCrowd as the movement system and copy its agent positions *into* the
sim at the start of each tick, as if they were input. This works and ships
faster, but be explicit about what you give up:
- No lockstep multiplayer, and replays are only reliable on the same build and machine.
- `vitest` can no longer test movement without the WASM navmesh loaded.
- The crowd's own limits become yours (the V2 announcement thread notes
  hardcoded limits around off-mesh connections and agent behaviours).

If you take Option B, write it down in `CLAUDE.md`. Otherwise an agent will
"helpfully" restore sim ownership halfway through and you'll get both systems
fighting over the same units.

### When you need bit-exact determinism

Even under Option A, Recast's path output is floating-point and not guaranteed
identical across machines. For peer-to-peer lockstep, either quantize every
corridor to fixed-point integers the moment it enters the sim (and make sure
every peer requests the same paths on the same tick), or replace Recast with a
flow-field or grid A* implemented *inside* `sim/` with integer math. Decide
before you write combat. For single-player and server-authoritative designs,
Option A with floats is fine.

---

## 8. `CLAUDE.md` — project rules for the agent

Drop this at the repo root. It's the highest-leverage file in the project.

```markdown
# Project: web RTS

## Stack
- Babylon.js 9.x (exact version pinned in package.json) — ES6 subpath imports from `@babylonjs/core/...` ONLY.
  Never `import { X } from "@babylonjs/core"` (barrel import, kills bundle size).
- Remember side-effect imports (e.g. `@babylonjs/core/Meshes/thinInstanceMesh`)
  or methods exist in typings but are undefined at runtime.
- TypeScript strict. Vite. Vitest.
- Navigation: Babylon Navigation Plugin V2 (`@babylonjs/addons`, recast-navigation-js).
  Never the legacy `RecastJSPlugin` / `recast-detour`. Look up import paths in the
  docs; don't guess.

## Architecture — non-negotiable
- `src/sim/` is pure TypeScript game logic. It MUST NOT import from
  `@babylonjs/*`, React, or touch `window`/`document`/`performance`.
- `src/render/` owns all Babylon code. It reads sim state and never mutates it.
- `src/ui/` is a DOM/React overlay. Not Babylon GUI.
- Input produces serializable `Command` objects. Nothing mutates the world
  outside of `advanceTick`.

## Data model
- The sim sits BESIDE Babylon, never on top of it. No game struct may hold a
  `Mesh`, `Vector3`, `Scene` or any other Babylon object.
- Units are stored structure-of-arrays (typed arrays in `World`), not as one
  object per unit. No `class Unit`.
- Entities are integer handles `(generation << 12) | index` (12-bit index,
  19-bit generation, always ≥ 0), never object references. Always validate with
  `isAlive(w, h)` before dereferencing. "No target" is `=== NO_TARGET`; never
  test a handle's sign.
- Movement is owned by `sim/steering.ts`. Recast (in `render/navmesh.ts`) answers
  path queries only. Do NOT use DetourCrowd agents to move units.
- System order inside `advanceTick` is the determinism contract. Do not reorder
  it without being asked.

## Determinism in sim/
- Seeded PRNG from `sim/rng.ts` only. Never `Math.random()`.
- Never `Date.now()` or `performance.now()`. The clock is the tick count.

## Tick rate
- The sim ticks at a fixed `TICK_HZ` (20) defined ONLY in `sim/time.ts`. Never
  hardcode 20, 50 ms, or any per-tick number anywhere else.
- Author gameplay values in real units (m/s, seconds, DPS) and convert with
  `perSecond()` / `seconds()`. Never store "per tick" or "in ticks" constants.
- Do not raise the tick rate to make the game feel smoother — smoothness comes
  from render interpolation; responsiveness from instant render-side feedback.
- Stable iteration order: arrays and numeric keys. No object-keyed Maps/Sets.

## Workflow
- Run `npm run check` after every change. Fix what it reports before reporting done.
- New sim logic needs a vitest test. Render code does not.
- Don't add dependencies without asking.
```

---

## 9. Build order

Resist starting with units and combat. Build the spine first, prove the
architecture, then fill it in.

1. Babylon bootstrap + RTS camera (pan, edge-scroll, zoom, rotate). No game yet.
2. Flat terrain + a grid overlay.
3. `sim/` with 10 hardcoded units that move in straight lines. Fixed timestep,
   renderer interpolating. **No pathfinding.** This step proves the whole
   architecture — if the split feels wrong, fix it here, not in month three.
4. Selection: click, shift-click, drag-box. Issue move commands.
5. Recast navmesh (Plugin V2) behind the `PathProvider` interface, plus
   `sim/steering.ts` (corridor following + separation). Now units route around
   obstacles without overlapping, and the sim still owns every position.
6. Combat, health, death.
7. Resources, buildings, production.
8. Fog of war.
9. AI opponent — it consumes the same `Command` API as the human player. If it
   needs special access to the world, your command layer is wrong.
10. Netcode, if ever. By this point the sim is deterministic and command-driven,
    so lockstep is a transport problem rather than a rewrite.

---

## 10. Known walls

- **Single-threaded JS sim.** Fine to ~500 units. Beyond that, move `sim/` into
  a Web Worker (easy — it has no DOM dependencies, by design) and eventually to
  Rust/WASM. The architecture above is what makes that a port rather than a
  rewrite.
- **Thin instance buffer churn.** Allocate the matrix `Float32Array` once per
  unit type at max capacity and write into it. Reallocating every frame will
  dominate your frame time and GC.
- **Tab backgrounding.** `requestAnimationFrame` stops; the accumulator clamp in
  §4 handles it. Test it — background the tab for 30s and come back.
- **Babylon ES6 side-effect imports.** Already covered, but it will bite you at
  least twice.
- **Memory.** Browsers cap around 2–4 GB. Texture atlases and compressed
  textures (KTX2/Basis) matter earlier than you'd expect.
- **Cross-browser float determinism.** Not guaranteed. Only relevant if you
  commit to peer-to-peer lockstep; irrelevant for single-player and
  server-authoritative designs. Decide before you write combat math.
