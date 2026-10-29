// The page's side of the battle (docs/plans/active/battle-threads.md, PRs 3 and 5): one interface whether the battle
// runs in its workers (the sim worker, src/app/sim-host.ts, and the men worker, src/app/men-host.ts, whose frames the
// page reads in shared memory) or, when the page cannot share memory with them (no cross-origin isolation, or
// ?thread=main), on the page's own thread as before. The bench's time (going to a time, a tick on, marks: PR 7,
// decision 0081) is the battle's in both.
import {
  makeWorld,
  DT,
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
import { Battle, applyTail, type GoneTo } from './battle.ts'
import type { Mark } from './timeline.ts'
import { FrameView, layoutFor, Slots, H_TICK_MS, H_STEP_MS, H_PUB_MS } from './battle-frame.ts'
import type { ToSim, FromSim, SimRecording } from './sim-host.ts'
import type { ToMen, FromMen, MenRecording } from './men-host.ts'
import { makeRing } from './tick-ring.ts'

/** The workers' every turn while recording: the sim's and the men's. */
export interface Recording {
  sim: SimRecording
  men: MenRecording
}

/** The session as far as the world has reached: the replay, the hashes it must reproduce, the moments marked. */
export interface Session {
  replay: Replay
  hashes: HashPoint[]
  marks: Mark[]
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
  // the timeline's stamped log, orders dropped and hash points (the worker's, as far as they have arrived; after going
  // back, a future the world has not reached again), and its divergences: how many, the last's words. Read them here
  // each time: going to a time replaces the battle's lists on the page's thread
  readonly log: Stamped[]
  readonly dropped: Dropped[]
  readonly hashes: HashPoint[]
  readonly warnings: number
  readonly warning: string
  /** A real frame of `dt` seconds: on the main thread, the battle advances; in the worker it runs on its own. */
  frame(dt: number): void
  /** What to read and draw this frame: the newest frame published (held until the next call), or the battle itself
   * on the main thread. */
  see(): Seen
  /** The men's ways and gaits worked out for the battalions whose men moved (SoldierLayer.orient), for a reader that
   * draws them (the look page): a published frame carries them already, the battle on the main thread does not. */
  orient(): void
  command(c: Command): void
  /** The game speed (0: paused). */
  setSpeed(speed: number): void
  /** `sec` seconds of game time at once, the clock then held until the next `setSpeed` (the headless checks). */
  advance(sec: number): Promise<void>
  /** The bench: to tick `tick` (Battle.goTo), resolved once a frame of it is there to read; the battle paused. */
  goTo(tick: number): Promise<GoneTo>
  /** The bench: one tick on, the battle paused; resolved once a frame of it is there to read. */
  stepTick(): Promise<void>
  /** A moment marked at tick `tick` (the one the player saw). */
  mark(note: string, tick: number): void
  session(): Promise<Session>
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
  private readonly seen: Seen
  readonly data: SimData
  readonly failed = null
  /** `orients`: the men's ways and gaits kept (SoldierLayer.orients), for a reader that draws them. */
  constructor(data: SimData, cr: Compiled, scenario: Scenario, orients = false) {
    this.data = data
    this.battle = new Battle(data, scenario, cr)
    this.battle.layer.orients = orients
    this.scene = this.battle.scene
    this.seen = { w: this.battle.w, layer: this.battle.layer }
  }
  get log() {
    return this.battle.log
  }
  get dropped() {
    return this.battle.dropped
  }
  get hashes() {
    return this.battle.hashes
  }
  get warnings() {
    return this.battle.tl.warnings
  }
  get warning() {
    return this.battle.tl.warning
  }
  frame(dt: number): void {
    this.battle.advance(dt)
  }
  see(): Seen {
    // (going to a time gives the battle a new world and layer)
    this.seen.w = this.battle.w
    this.seen.layer = this.battle.layer
    return this.seen
  }
  orient(): void {
    this.battle.layer.orient()
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
  async goTo(tick: number) {
    return this.battle.goTo(tick)
  }
  async stepTick() {
    this.battle.stepTick()
  }
  mark(note: string, tick: number): void {
    this.battle.mark(note, tick)
  }
  async session() {
    return this.battle.session()
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
  warnings = 0
  warning = ''
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

  /** Starts the sim worker on the scenario (`key`: its key in BATTLE_SCENARIOS; `bytes`: the map's, `data` loaded from
   * them; `ruleset`: its name in src/rulesets/index.ts, the napoleonic one if none, `cr` compiled from it), then the
   * men worker once the sim has written its first world; `ready` resolves at the first frame. `claims`: the scenario
   * claims cells (the claim grid's prototype), set on the frames' worlds so the overlay draws them. */
  constructor(
    sim: Worker,
    men: Worker,
    bytes: Uint8Array,
    data: SimData,
    cr: Compiled,
    key: string,
    ruleset?: string,
    orients = false,
    claims = false,
  ) {
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
      if (m.type === 'ready') this.toMen({ type: 'init', data: bytes, version: data.version, ring, ruleset, orients })
      else if (m.type === 'events') {
        applyTail(this.log, m.log)
        applyTail(this.dropped, m.dropped)
        applyTail(this.hashes, m.hashes)
        this.warnings = m.warnings
        this.warning = m.warning
      } else if (m.type === 'reply') this.answer(m.id, m.value)
      else this.fail(`sim: ${m.message}`)
    }
    men.onmessage = (e: MessageEvent<FromMen>) => {
      const m = e.data
      if (m.type === 'slots') {
        const L = layoutFor(this.shape, m.cap)
        this.views = m.bufs.map(b => new FrameView(this.data, this.cr, this.shape.terrain, this.scene, b, L))
        for (const v of this.views) v.w.claims = claims
        this.slots = new Slots(new Int32Array(m.ctl))
        this.seen = null
        this.onFirst()
      } else if (m.type === 'reply') this.answer(m.id, m.value)
      else this.fail(`men: ${m.message}`)
    }
    // a module that failed to load, or an error a worker did not catch
    sim.onerror = e => this.fail(`sim: ${e.message || 'the worker failed'}`)
    men.onerror = e => this.fail(`men: ${e.message || 'the worker failed'}`)
    this.toSim({ type: 'init', scenario: key, data: bytes, version: data.version, ring, ruleset })
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
  orient(): void {
    // (the men worker orients each frame before publishing it: battle-frame.ts writeFrame)
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
    const ran = await this.ask<number>(id => this.toSim({ type: 'advance', id, sec }))
    await this.ask(id => this.toMen({ type: 'advance', id, sec: ran }))
  }
  async goTo(tick: number): Promise<GoneTo> {
    // the sim's jump, then the men laid out on it and a frame of it published
    const gone = await this.ask<GoneTo>(id => this.toSim({ type: 'goTo', id, tick }))
    await this.ask(id => this.toMen({ type: 'advance', id, sec: 0 }))
    return gone
  }
  async stepTick(): Promise<void> {
    await this.ask(id => this.toSim({ type: 'stepTick', id }))
    await this.ask(id => this.toMen({ type: 'advance', id, sec: DT }))
  }
  mark(note: string, tick: number): void {
    this.toSim({ type: 'mark', note, tick })
  }
  session() {
    return this.ask<Session>(id => this.toSim({ type: 'session', id }))
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

/** What starting a battle takes: the map's bytes and data, the ruleset compiled (and its name, src/rulesets/index.ts),
 * the scenario (and its key in BATTLE_SCENARIOS, which the sim worker looks up), and the two workers to start, made
 * by the caller (so the bundler finds their files), or null to play on the page. */
export interface LinkStart {
  bytes: Uint8Array
  data: SimData
  cr: Compiled
  scenario: Scenario
  key: string
  ruleset?: string
  workers: (() => [Worker, Worker]) | null
  // the men's ways and gaits kept, for a reader that draws them (the look page: SoldierLayer.orients)
  orients?: boolean
}

/** The battle in its workers when given them and they start, else on the page (said on the console when they fail). */
export async function startLink(o: LinkStart): Promise<BattleLink> {
  if (o.workers) {
    const [sim, men] = o.workers()
    const wl = new WorkerLink(sim, men, o.bytes, o.data, o.cr, o.key, o.ruleset, o.orients, !!o.scenario.claims)
    try {
      await wl.ready()
      return wl
    } catch (e) {
      console.warn(`the battle runs on the page: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return new MainLink(o.data, o.cr, o.scenario, o.orients)
}
