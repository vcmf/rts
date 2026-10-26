// The battle as the sim page runs it (docs/plans/active/battle-threads.md, PRs 3 and 5): the sim at 20 Hz of game
// time, the soldier layer on its clock (src/render/men-clock.ts), the stamped log, the hash points and the orders
// dropped. The page runs it whole when it cannot share memory with workers (src/app/battle-link.ts); the sim worker
// runs it without its men (src/app/sim-host.ts), whose layer the men worker steps on its own (src/app/men-host.ts).
// No DOM.
import {
  compileRuleset,
  makeWorld,
  issue,
  advanceTick,
  attachScenario,
  hashWorld,
  hex,
  SIM_VERSION,
  M_TICK,
  DT,
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

/** The most ticks one advance runs; the rest of the game time owed is dropped (a busy thread falls behind). */
export const MAX_TICKS = 20

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
  readonly w: World
  private readonly sceneOf: Scene | null
  private readonly layerOf: SoldierLayer | null
  readonly clock = new MenClock()
  readonly log: Stamped[] = []
  readonly hashes: HashPoint[] = []
  readonly dropped: Dropped[] = []
  // game time owed to the next tick, in seconds; the game speed (0: paused)
  acc = 0
  speed = 1
  // whether this battle steps its own men (else its layer is never synced nor stepped)
  readonly men: boolean
  private readonly onTick?: (w: World, r: TickResult) => void
  private readonly data: SimData
  private readonly scenario: Scenario
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
    this.w = makeWorld(data, cr, PAGE_SEED, false)
    attachScenario(this.w, scenario)
    scenario.setup(this.w)
    // the scene and the layer only for a battle that steps its own men (the sim worker's has none to build)
    this.sceneOf = men ? buildScene(this.w) : null
    this.layerOf = this.sceneOf && new SoldierLayer(this.w, this.sceneOf)
  }

  /** The scene (the trunks, the map's symbols) of a battle that steps its own men. */
  get scene(): Scene {
    if (!this.sceneOf) throw new Error('battle: no scene without its men')
    return this.sceneOf
  }
  /** The soldier layer of a battle that steps its own men. */
  get layer(): SoldierLayer {
    if (!this.layerOf) throw new Error('battle: no soldier layer without its men')
    return this.layerOf
  }

  /** A command from the player: stamped for the next tick and logged (refused ones too, as `issue` keeps them). */
  command(c: Command): void {
    issue(this.w, c, this.log)
  }

  /**
   * A real frame of `realDt` seconds at the battle's speed: the ticks owed (at most MAX_TICKS, the rest dropped),
   * each followed by the layer's sync, then the men's sub-steps due on their clock.
   */
  advance(realDt: number): Advanced {
    const a = performance.now()
    this.acc += realDt * this.speed
    let ticks = 0
    while (this.acc >= DT && ticks < MAX_TICKS) {
      this.tick()
      this.acc -= DT
      ticks++
    }
    if (ticks === MAX_TICKS) this.acc = 0
    const b = performance.now()
    const subSteps = this.men ? this.clock.advance(realDt, this.speed, this.stepMen) : 0
    if (this.men) this.layer.alphaNow = this.acc / DT
    return { ticks, subSteps, tickMs: b - a, stepMs: performance.now() - b }
  }

  /** `sec` seconds of game time at 1×, in 1/30 s frames whatever the speed (the headless checks' advance). */
  advanceBy(sec: number): void {
    const sp = this.speed
    this.speed = 1
    for (let n = Math.round(sec * 30); n > 0; n--) this.advance(1 / 30)
    this.speed = sp
  }

  /** One tick, the layer synced after it; hash points without section hashes (those cost a second serialization). */
  private tick(): void {
    const r = advanceTick(this.w)
    if (this.men) this.layer.sync(0, r.departed)
    this.onTick?.(this.w, r)
    for (const d of r.dropped) this.dropped.push(d)
    if (r.hash !== null) this.hashes.push({ tick: r.tick, hash: r.hash, sections: [] })
  }

  /** The session as a replay (src/sim/replay.ts), as far as it has run: commands still waiting for their tick are
   * left out. */
  replay(): { replay: Replay; hashes: HashPoint[] } {
    const w = this.w
    return {
      replay: {
        simVersion: SIM_VERSION,
        dataVersion: this.data.version,
        ruleset: w.cr.hash,
        scenario: this.scenario.name,
        seed: PAGE_SEED,
        ticks: w.meta[M_TICK],
        log: this.log.filter(s => s.tick <= w.meta[M_TICK]),
      },
      hashes: this.hashes,
    }
  }

  /** The world's state hash now, as hex. */
  hash(): string {
    return hex(hashWorld(this.w))
  }
}
