// The page's side of the battle (docs/plans/active/battle-threads.md, PRs 3 and 5): one interface whether the battle
// runs in its workers (the sim worker, src/app/sim-host.ts, and the men worker, src/app/men-host.ts, whose frames the
// page reads in shared memory) or, when the page cannot share memory with them (no cross-origin isolation, or
// ?thread=main), on the page's own thread as before.
import {
  makeWorld,
  type Command,
  type SimData,
  type Compiled,
  type Stamped,
  type Dropped,
  type HashPoint,
  type Replay,
  type World,
  type Scenario,
} from '../sim/index.ts'
import { PAGE_SEED } from '../scenarios/page.ts'
import { buildScene, type Scene } from '../render/scene.ts'
import type { SoldierLayer } from '../render/soldiers.ts'
import { Battle } from './battle.ts'
import { FrameView, layoutFor, Slots, H_TICK_MS, H_STEP_MS, H_PUB_MS } from './battle-frame.ts'
import type { ToSim, FromSim, SimRecording } from './sim-host.ts'
import type { ToMen, FromMen, MenRecording } from './men-host.ts'
import { makeRing } from './tick-ring.ts'

/** The workers' every turn while recording: the sim's and the men's. */
export interface Recording {
  sim: SimRecording
  men: MenRecording
}

/** What the page reads this frame. */
export interface Seen {
  w: World
  layer: SoldierLayer
}

/** The battle as the page drives it. */
export interface BattleLink {
  readonly mode: 'worker' | 'main'
  readonly scene: Scene
  // the map's data, loaded once
  readonly data: SimData
  // why the battle stopped (the worker failed), or null
  readonly failed: string | null
  // the stamped log, the orders dropped and the hash points so far (the worker's, as far as they have arrived)
  readonly log: Stamped[]
  readonly dropped: Dropped[]
  readonly hashes: HashPoint[]
  /** A real frame of `dt` seconds: on the main thread, the battle advances; in the worker it runs on its own. */
  frame(dt: number): void
  /** What to read and draw this frame: the newest frame published (held until the next call), or the battle itself
   * on the main thread. */
  see(): Seen
  command(c: Command): void
  /** The game speed (0: paused). */
  setSpeed(speed: number): void
  /** `sec` seconds of game time at once, the clock then held until the next `setSpeed` (the headless checks). */
  advance(sec: number): Promise<void>
  replay(): Promise<{ replay: Replay; hashes: HashPoint[] }>
  hash(): Promise<string>
  /** The workers' costs (ms, smoothed): a tick (the sim worker's), the men's steps and publishing a frame (the men
   * worker's), per turn; zero on the main thread. */
  costs(): { tickMs: number; stepMs: number; pubMs: number }
  /** Starts (`on`) or ends recording the workers' every turn; ending returns them (null on the main thread). */
  record(on: boolean): Promise<Recording | null>
}

/** The battle on the page's own thread. */
export class MainLink implements BattleLink {
  readonly mode = 'main'
  readonly battle: Battle
  readonly scene: Scene
  readonly log: Stamped[]
  readonly dropped: Dropped[]
  readonly hashes: HashPoint[]
  private readonly seen: Seen
  readonly data: SimData
  readonly failed = null
  constructor(data: SimData, cr: Compiled, scenario: Scenario) {
    this.data = data
    this.battle = new Battle(data, scenario, cr)
    this.scene = this.battle.scene
    this.log = this.battle.log
    this.dropped = this.battle.dropped
    this.hashes = this.battle.hashes
    this.seen = { w: this.battle.w, layer: this.battle.layer }
  }
  frame(dt: number): void {
    this.battle.advance(dt)
  }
  see(): Seen {
    return this.seen
  }
  command(c: Command): void {
    this.battle.command(c)
  }
  setSpeed(speed: number): void {
    this.battle.speed = speed
  }
  async advance(sec: number): Promise<void> {
    this.battle.advanceBy(sec)
    this.battle.speed = 0
  }
  async replay() {
    return this.battle.replay()
  }
  async hash() {
    return this.battle.hash()
  }
  costs() {
    return { tickMs: 0, stepMs: 0, pubMs: 0 }
  }
  async record() {
    return null
  }
}

/** The battle in its two workers; the page reads the men worker's published frames. */
export class WorkerLink implements BattleLink {
  readonly mode = 'worker'
  readonly scene: Scene
  readonly log: Stamped[] = []
  readonly dropped: Dropped[] = []
  readonly hashes: HashPoint[] = []
  readonly data: SimData
  /** Why a worker stopped (null while they run): the page shows it; every request since fails with it. */
  failed: string | null = null
  private readonly sim: Worker
  private readonly men: Worker
  private readonly cr: Compiled
  private readonly shape: World
  private slots: Slots | null = null
  private views: FrameView[] = []
  private seen: Seen | null = null
  private ids = 0
  private readonly waiting = new Map<number, { ok: (v: unknown) => void; fail: (e: Error) => void }>()
  private readonly first: Promise<void>
  private onFirst: () => void = () => {}
  private onFail: (e: Error) => void = () => {}

  /** Starts the sim worker on the scenario (`key`: its key in PAGE_SCENARIOS; `bytes`: the map's, `data` loaded from
   * them), then the men worker once the sim has written its first world; `ready` resolves at the first frame. */
  constructor(sim: Worker, men: Worker, bytes: Uint8Array, data: SimData, cr: Compiled, key: string) {
    this.sim = sim
    this.men = men
    this.data = data
    this.cr = cr
    // the page's own world, for the scene (the trunks, the map's symbols: the cosmetic RNG, as the men worker's), the
    // views' terrain, the slots' and the ring's layouts
    this.shape = makeWorld(data, cr, PAGE_SEED, false)
    this.scene = buildScene(this.shape)
    this.first = new Promise((ok, fail) => {
      this.onFirst = ok
      this.onFail = fail
    })
    const ring = makeRing(this.shape)
    sim.onmessage = (e: MessageEvent<FromSim>) => {
      const m = e.data
      if (m.type === 'ready') this.toMen({ type: 'init', data: bytes, version: data.version, ring })
      else if (m.type === 'events') {
        this.log.push(...m.log)
        this.dropped.push(...m.dropped)
        this.hashes.push(...m.hashes)
      } else if (m.type === 'reply') this.answer(m.id, m.value)
      else this.fail(`sim: ${m.message}`)
    }
    men.onmessage = (e: MessageEvent<FromMen>) => {
      const m = e.data
      if (m.type === 'slots') {
        const L = layoutFor(this.shape, m.cap)
        this.views = m.bufs.map(b => new FrameView(this.data, this.cr, this.shape.terrain, this.scene, b, L))
        this.slots = new Slots(new Int32Array(m.ctl))
        this.seen = null
        this.onFirst()
      } else if (m.type === 'reply') this.answer(m.id, m.value)
      else this.fail(`men: ${m.message}`)
    }
    // a module that failed to load, or an error a worker did not catch
    sim.onerror = e => this.fail(`sim: ${e.message || 'the worker failed'}`)
    men.onerror = e => this.fail(`men: ${e.message || 'the worker failed'}`)
    this.toSim({ type: 'init', scenario: key, data: bytes, version: data.version, ring })
  }
  /** A worker stopped: both are ended (the other would run on for nothing), it is said on the console, and the start
   * and every request waiting fail with it. */
  private fail(message: string): void {
    this.sim.terminate()
    this.men.terminate()
    this.failed ??= message
    console.error(`battle worker: ${message}`)
    const e = new Error(`battle worker: ${message}`)
    this.onFail(e)
    for (const w of this.waiting.values()) w.fail(e)
    this.waiting.clear()
  }
  /** Resolves once the men worker has published its first frame. */
  ready(): Promise<void> {
    return this.first
  }
  private toSim(m: ToSim): void {
    this.sim.postMessage(m)
  }
  private toMen(m: ToMen): void {
    this.men.postMessage(m)
  }
  private answer(id: number, value: unknown): void {
    const r = this.waiting.get(id)
    this.waiting.delete(id)
    r?.ok(value)
  }
  /** A request to a worker, answered by its reply with the same id. */
  private ask<T>(send: (id: number) => void): Promise<T> {
    if (this.failed) return Promise.reject(new Error(`battle worker: ${this.failed}`))
    const id = ++this.ids
    return new Promise((ok, fail) => {
      this.waiting.set(id, { ok: ok as (v: unknown) => void, fail })
      send(id)
    })
  }
  frame(): void {}
  see(): Seen {
    // the men worker announces slots only once a frame is published in them, so there is always one to hold
    const s = this.slots!.hold()
    if (s < 0) throw new Error('battle worker: slots with no frame published')
    const v = this.views[s]
    v.read(performance.timeOrigin + performance.now())
    this.seen = v
    return v
  }
  command(c: Command): void {
    this.toSim({ type: 'command', c })
  }
  setSpeed(speed: number): void {
    this.toSim({ type: 'speed', speed })
  }
  async advance(sec: number): Promise<void> {
    // the sim advances (its men's clock at speed 0, its ticks logging departures only), then the men take its last
    // world and step to their places
    await this.ask(id => this.toSim({ type: 'advance', id, sec }))
    await this.ask(id => this.toMen({ type: 'advance', id, sec }))
  }
  replay() {
    return this.ask<{ replay: Replay; hashes: HashPoint[] }>(id => this.toSim({ type: 'replay', id }))
  }
  hash() {
    return this.ask<string>(id => this.toSim({ type: 'hash', id }))
  }
  costs() {
    const h = (this.seen as FrameView | null)?.head
    return h ? { tickMs: h[H_TICK_MS], stepMs: h[H_STEP_MS], pubMs: h[H_PUB_MS] } : { tickMs: 0, stepMs: 0, pubMs: 0 }
  }
  async record(on: boolean): Promise<Recording | null> {
    const [sim, men] = await Promise.all([
      this.ask<SimRecording | null>(id => this.toSim({ type: 'record', id, on })),
      this.ask<MenRecording | null>(id => this.toMen({ type: 'record', id, on })),
    ])
    return sim && men ? { sim, men } : null
  }
}
