// The page's side of the battle (docs/plans/active/battle-threads.md, PR 3): one interface whether the battle runs in
// the battle worker (src/app/battle-host.ts; the page reads its frames in shared memory) or, when the page cannot
// share memory with a worker (no cross-origin isolation, or ?thread=main), on the page's own thread as before.
import {
  compileRuleset,
  loadSimData,
  makeWorld,
  type Command,
  type Stamped,
  type Dropped,
  type HashPoint,
  type Replay,
  type World,
  type Scenario,
} from '../sim/index.ts'
import { napoleonic } from '../rulesets/napoleonic.ts'
import { PAGE_SEED } from '../scenarios/page.ts'
import { buildScene, type Scene } from '../render/scene.ts'
import type { SoldierLayer } from '../render/soldiers.ts'
import { Battle } from './battle.ts'
import { FrameView, layoutFor, Slots, H_TICK_MS, H_STEP_MS, H_PUB_MS } from './battle-frame.ts'
import type { ToHost, ToPage, Recording } from './battle-host.ts'

/** What the page reads this frame. */
export interface Seen {
  w: World
  layer: SoldierLayer
}

/** The battle as the page drives it. */
export interface BattleLink {
  readonly mode: 'worker' | 'main'
  readonly scene: Scene
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
  /** The worker's costs (ms, smoothed): its ticks, steps and publishing, per advance; zero on the main thread. */
  costs(): { tickMs: number; stepMs: number; pubMs: number }
  /** Starts (`on`) or ends recording the worker's every advance; ending returns them (null on the main thread). */
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
  constructor(data: Uint8Array, version: number, scenario: Scenario) {
    this.battle = new Battle(loadSimData(data, version), scenario)
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

/** The battle in the battle worker; the page reads its published frames. */
export class WorkerLink implements BattleLink {
  readonly mode = 'worker'
  readonly scene: Scene
  readonly log: Stamped[] = []
  readonly dropped: Dropped[] = []
  readonly hashes: HashPoint[] = []
  private readonly worker: Worker
  private readonly data: ReturnType<typeof loadSimData>
  private readonly cr = compileRuleset(napoleonic)
  private readonly shape: World
  private slots: Slots | null = null
  private views: FrameView[] = []
  private seen: Seen | null = null
  private ids = 0
  private readonly waiting = new Map<number, (v: unknown) => void>()
  private readonly first: Promise<void>
  private onFirst: () => void = () => {}

  /** Starts the worker on the scenario; `ready` resolves at the first published frame. */
  constructor(worker: Worker, data: Uint8Array, version: number, scenario: Scenario) {
    this.worker = worker
    this.data = loadSimData(data, version)
    // the page's own world, for the scene (the trunks, the map's symbols: the cosmetic RNG, as the worker's) and the
    // slots' layout
    this.shape = makeWorld(this.data, this.cr, PAGE_SEED, false)
    this.scene = buildScene(this.shape)
    this.first = new Promise(r => (this.onFirst = r))
    worker.onmessage = (e: MessageEvent<ToPage>) => this.receive(e.data)
    // an error the host does not catch (in its loop) ends the battle: said on the page's console, as the page's own
    worker.onerror = e => console.error(`battle worker: ${e.message}`)
    this.post({ type: 'init', scenario: scenario.name, data, version })
  }
  /** Resolves once the worker has published its first frame. */
  ready(): Promise<void> {
    return this.first
  }
  private post(m: ToHost): void {
    this.worker.postMessage(m)
  }
  private ask<T>(m: (id: number) => ToHost): Promise<T> {
    const id = ++this.ids
    return new Promise(r => {
      this.waiting.set(id, r as (v: unknown) => void)
      this.post(m(id))
    })
  }
  private receive(m: ToPage): void {
    if (m.type === 'slots') {
      const L = layoutFor(this.shape, m.cap)
      this.views = m.bufs.map(b => new FrameView(this.data, this.cr, this.scene, b, L))
      this.slots = new Slots(new Int32Array(m.ctl))
      this.seen = null
      this.onFirst()
    } else if (m.type === 'events') {
      this.log.push(...m.log)
      this.dropped.push(...m.dropped)
      this.hashes.push(...m.hashes)
    } else if (m.type === 'reply') {
      const r = this.waiting.get(m.id)
      this.waiting.delete(m.id)
      r?.(m.value)
    } else console.error(`battle worker: ${m.message}`)
  }
  frame(): void {}
  see(): Seen {
    const s = this.slots!.hold()
    const v = this.views[s]
    v.read(performance.timeOrigin + performance.now())
    this.seen = v
    return v
  }
  command(c: Command): void {
    this.post({ type: 'command', c })
  }
  setSpeed(speed: number): void {
    this.post({ type: 'speed', speed })
  }
  async advance(sec: number): Promise<void> {
    await this.ask(id => ({ type: 'advance', id, sec }))
  }
  replay() {
    return this.ask<{ replay: Replay; hashes: HashPoint[] }>(id => ({ type: 'replay', id }))
  }
  hash() {
    return this.ask<string>(id => ({ type: 'hash', id }))
  }
  costs() {
    const h = (this.seen as FrameView | null)?.head
    return h ? { tickMs: h[H_TICK_MS], stepMs: h[H_STEP_MS], pubMs: h[H_PUB_MS] } : { tickMs: 0, stepMs: 0, pubMs: 0 }
  }
  record(on: boolean) {
    return this.ask<Recording | null>(id => ({ type: 'record', id, on }))
  }
}
