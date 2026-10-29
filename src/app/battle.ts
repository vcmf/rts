// The battle as the sim page runs it (docs/plans/done/battle-threads.md, PRs 3, 5 and 7): the sim at 20 Hz of game
// time, the soldier layer on its clock (src/render/men-clock.ts), and the bench's timeline (src/app/timeline.ts: the
// stamped log, the hash points, the orders dropped, marks, and the saves going to a time uses; decision 0081). The page
// runs it whole when it cannot share memory with workers (src/app/battle-link.ts); the sim worker runs it without its
// men (src/app/sim-host.ts), whose layer the men worker steps on its own (src/app/men-host.ts). No DOM.
import {
  compileRuleset,
  makeWorld,
  deserialize,
  attachScenario,
  hashWorld,
  hex,
  SIM_VERSION,
  M_TICK,
  M_LIMIT,
  DT,
  TICK_HZ,
  type Command,
  type Stamped,
  type World,
  type HashPoint,
  type Replay,
  type Dropped,
  type Scenario,
  type SimData,
  type Compiled,
  type TickResult,
} from '../sim/index.ts'
import { napoleonic } from '../rulesets/napoleonic.ts'
import { PAGE_SEED } from '../scenarios/page.ts'
import { buildScene, type Scene } from '../render/scene.ts'
import { SoldierLayer } from '../render/soldiers.ts'
import { MenClock } from '../render/men-clock.ts'
import { mkTimeline, order, step, begin, mark, goTo, type Timeline, type Mark } from './timeline.ts'

/** The most ticks one advance runs; the rest of the game time owed is dropped (a busy thread falls behind). */
export const MAX_TICKS = 20
/** The most going to a time plays on at once: five minutes (going on further takes another). */
export const JUMP = 300 * TICK_HZ

/**
 * The tick going to `target` from tick `now` reaches: within the start and the battle's end (its time limit, `limit`
 * ticks, or the furthest tick played, `reached`, if that is later: a battle plays on past its limit; without a limit,
 * ten minutes past the furthest tick), and at most JUMP on (`capped`).
 */
export function goToTick(
  target: number,
  now: number,
  reached: number,
  limit: number,
): { tick: number; capped: boolean } {
  const end = limit > 0 ? Math.max(limit, reached) : reached + 600 * TICK_HZ
  const t = Math.max(0, Math.min(Math.round(target), end))
  return t > now + JUMP ? { tick: now + JUMP, capped: true } : { tick: t, capped: false }
}

/** What going to a time did: the tick the battle stands at, whether it stopped short at five minutes on, and why it
 * failed ('' if it did not: the battle stays where it was). */
export interface GoneTo {
  tick: number
  capped: boolean
  error: string
}

/** What one `advance` did, and what it cost (ms). */
export interface Advanced {
  ticks: number
  subSteps: number
  tickMs: number
  stepMs: number
}

/** What a battle may do besides the sim: step its own men (the page's thread and PR 3's one worker; not the sim
 * worker, whose men are the men worker's), and be told of each tick (the sim worker writes it to the tick ring). */
export interface BattleOptions {
  men?: boolean
  onTick?: (w: World, r: TickResult) => void
}

/** The sim and the soldier layer, as the page plays a scenario. */
export class Battle {
  private wOf: World
  private readonly sceneOf: Scene | null
  private layerOf: SoldierLayer | null
  readonly clock = new MenClock()
  /** The bench's timeline: the log, the hash points, the orders dropped, the marks and the saves. */
  readonly tl: Timeline = mkTimeline()
  // game time owed to the next tick, in seconds; the game speed (0: paused)
  acc = 0
  speed = 1
  // whether this battle steps its own men (else its layer is never synced nor stepped)
  readonly men: boolean
  private readonly onTick?: (w: World, r: TickResult) => void
  private readonly data: SimData
  private readonly scenario: Scenario
  private readonly cr: Compiled
  private readonly stepMen = (group: number, dt: number) => this.layer.step(dt, this.acc / DT, group, this.clock.groups)

  /** `cr`: the shipped ruleset compiled (the page compiles it once). */
  constructor(
    data: SimData,
    scenario: Scenario,
    cr: Compiled = compileRuleset(napoleonic),
    { men = true, onTick }: BattleOptions = {},
  ) {
    this.men = men
    this.onTick = onTick
    this.data = data
    this.scenario = scenario
    this.cr = cr
    this.wOf = begin(this.tl, this.fresh())
    // the scene and the layer only for a battle that steps its own men (the sim worker's has none to build)
    this.sceneOf = men ? buildScene(this.wOf) : null
    this.layerOf = this.sceneOf && new SoldierLayer(this.wOf, this.sceneOf)
  }

  /** The world as it stands: a new one after going to a time. */
  get w(): World {
    return this.wOf
  }
  /** The scene (the trunks, the map's symbols) of a battle that steps its own men. */
  get scene(): Scene {
    if (!this.sceneOf) throw new Error('battle: no scene without its men')
    return this.sceneOf
  }
  /** The soldier layer of a battle that steps its own men: a new one after going to a time. */
  get layer(): SoldierLayer {
    if (!this.layerOf) throw new Error('battle: no soldier layer without its men')
    return this.layerOf
  }
  /** The stamped log (its orders after the world's tick a future that branches at the next order). */
  get log(): Stamped[] {
    return this.tl.log
  }
  get hashes(): HashPoint[] {
    return this.tl.hashes
  }
  get dropped(): Dropped[] {
    return this.tl.dropped
  }
  get marks(): Mark[] {
    return this.tl.marks
  }

  /** A fresh world for the scenario at the page's seed. */
  private readonly fresh = (): World => {
    const w = makeWorld(this.data, this.cr, PAGE_SEED, false)
    attachScenario(w, this.scenario)
    this.scenario.setup(w)
    return w
  }
  /** A world from a save's bytes, the scenario attached. */
  private readonly load = (bytes: Uint8Array): World => {
    const w = deserialize(bytes, this.data, this.cr, false, this.wOf.terrain)
    attachScenario(w, this.scenario)
    return w
  }

  /** A command from the player: stamped for the next tick and logged (refused ones too, as `issue` keeps them).
   * After going back, the orders the log holds past the world's tick are a future that did not happen: it drops
   * them. */
  command(c: Command): void {
    order(this.tl, this.w, c)
  }

  /**
   * A real frame of `realDt` seconds at the battle's speed: the ticks owed (at most MAX_TICKS, the rest dropped),
   * each followed by the layer's sync, then the men's sub-steps due on their clock. A tick that parts from the first
   * pass pauses the battle there (`tl.warning` says why).
   */
  advance(realDt: number): Advanced {
    const a = performance.now()
    this.acc += realDt * this.speed
    let ticks = 0
    while (this.acc >= DT && ticks < MAX_TICKS) {
      ticks++
      // (a tick that parted from the first pass ran, and paused the battle)
      if (!this.tick()) break
      this.acc -= DT
    }
    if (ticks === MAX_TICKS) this.acc = 0
    const b = performance.now()
    const subSteps = this.men ? this.clock.advance(realDt, this.speed, this.stepMen) : 0
    if (this.men) this.layer.alphaNow = this.acc / DT
    return { ticks, subSteps, tickMs: b - a, stepMs: performance.now() - b }
  }

  /** `sec` seconds of game time at 1×, in 1/30 s frames whatever the speed (the headless checks' advance); it stops
   * where a tick parts from the first pass, as the page does. Returns the game seconds it ran. */
  advanceBy(sec: number): number {
    const sp = this.speed
    const was = this.tl.warnings
    this.speed = 1
    const frames = Math.round(sec * 30)
    let n = 0
    for (; n < frames && this.tl.warnings === was; n++) this.advance(1 / 30)
    this.speed = this.tl.warnings === was ? sp : 0
    return n / 30
  }

  /** One tick and the battle paused (the bench's tick on); its men, where it steps them, one tick's way on. */
  stepTick(): void {
    this.speed = 0
    this.acc = 0
    if (!this.tick() || !this.men) return
    for (let g = 0; g < this.clock.groups; g++) this.layer.step(DT, 0, g, this.clock.groups)
  }

  /**
   * Goes to tick `target` (goToTick: within the battle, at most five minutes on) as the first pass played it, and
   * pauses there. Going back builds the world again from a save; the battle's men, where it steps them, are laid out
   * again on it. A failure leaves the battle where it was.
   */
  goTo(target: number): GoneTo {
    const now = this.w.meta[M_TICK]
    const { tick, capped } = goToTick(target, now, this.tl.reached, this.w.meta[M_LIMIT])
    this.speed = 0
    this.acc = 0
    if (tick === now) return { tick, capped, error: '' }
    let w: World
    try {
      w = goTo(this.tl, tick, this.fresh, this.load, this.w)
    } catch (e) {
      return { tick: now, capped: false, error: e instanceof Error ? e.message : String(e) }
    }
    this.wOf = w
    if (this.layerOf) {
      this.layerOf = this.layerOf.laidOutOn(w)
      this.layerOf.sync(0, [])
    }
    return { tick: w.meta[M_TICK], capped, error: '' }
  }

  /** A moment marked (the playtest's M) at tick `tick`: the one the player saw, the world's if not given. */
  mark(note: string, tick?: number): void {
    if (tick === undefined) mark(this.tl, this.w, note)
    else this.tl.marks.push({ tick, note })
  }

  /** One tick, the layer synced after it; hash points without section hashes (those cost a second serialization).
   *  False when it parted from the first pass: the battle is paused there. */
  private tick(): boolean {
    const was = this.tl.warnings
    const r = step(this.tl, this.w)
    if (this.men) this.layer.sync(0, r.departed)
    this.onTick?.(this.w, r)
    if (this.tl.warnings === was) return true
    this.speed = 0
    this.acc = 0
    return false
  }

  /** The session as a replay (src/sim/replay.ts), as far as it has run: commands still waiting for their tick, and
   * after going back the future the world has not reached again, are left out. */
  replay(): { replay: Replay; hashes: HashPoint[] } {
    const w = this.w
    const t = w.meta[M_TICK]
    return {
      replay: {
        simVersion: SIM_VERSION,
        dataVersion: this.data.version,
        ruleset: w.cr.hash,
        scenario: this.scenario.name,
        seed: PAGE_SEED,
        ticks: t,
        log: this.tl.log.filter(s => s.tick <= t),
      },
      hashes: this.tl.hashes.filter(h => h.tick <= t),
    }
  }

  /** The replay with the moments marked that the world has reached (tools/battle-report.ts reads it). */
  session(): { replay: Replay; hashes: HashPoint[]; marks: Mark[] } {
    const t = this.w.meta[M_TICK]
    return { ...this.replay(), marks: this.tl.marks.filter(m => m.tick <= t) }
  }

  /** The world's state hash now, as hex. */
  hash(): string {
    return hex(hashWorld(this.w))
  }
}

/** What changed in a list since a copy of it was sent: how many of the sent entries still stand, and those after. */
export interface Tail<T> {
  keep: number
  add: T[]
}

/**
 * List `now` against `sent` (the entries sent before, in order): the entries from the first that is not the same
 * object on. With `grown` (nothing in the list was replaced or dropped since, only added) the sent ones all stand.
 */
export function tailOf<T>(sent: readonly T[], now: readonly T[], grown: boolean): Tail<T> {
  let k = 0
  if (grown) k = sent.length
  else while (k < sent.length && k < now.length && sent[k] === now[k]) k++
  return { keep: k, add: now.slice(k) }
}

/** Applies a tail to the list it was taken against (in place: its readers keep the same array). */
export function applyTail<T>(list: T[], t: Tail<T>): void {
  list.length = t.keep
  for (const e of t.add) list.push(e)
}
