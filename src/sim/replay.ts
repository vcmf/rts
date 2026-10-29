// Replays (docs/proposals/sim-design.md §15): sim version + data version + scenario + seed + the external
// command log. Playback re-issues each logged command at its tick and must reproduce every state hash;
// a mismatch reports the first differing tick and the first differing section (table).
import { attachScenario, type ScenarioRules } from './plan.ts'
import { type World, makeWorld, M_TICK } from './world.ts'
import { issue, type Stamped } from './commands.ts'
import { advanceTick, type TickResult } from './tick.ts'
import { sectionHashes } from './serialize.ts'
import { type SimData, DataVersionMismatch, hex } from './data.ts'
import type { Compiled } from './ruleset.ts'

export const SIM_VERSION = 's1e.4' // bumped when the state or a rule changes: older replays no longer reproduce

export interface HashPoint {
  tick: number
  hash: number
  sections: [string, number][]
}
export interface Replay {
  simVersion: string
  dataVersion: number
  ruleset: number
  scenario: string
  seed: number
  ticks: number
  log: Stamped[]
}
// setup issues the scenario's own commands (not logged); map: the data it is placed on (the formation field when
// left out); player: the side the page lets you command (none: both, a sandbox); plan and minutes: plan.ts
export interface Scenario extends ScenarioRules {
  name: string
  setup(w: World): void
  map?: string
  player?: number
}

// runs a scenario for `ticks`, issuing `script(w, tick)` commands as external (logged) ones
export function record(
  data: SimData,
  cr: Compiled,
  scenario: Scenario,
  seed: number,
  ticks: number,
  script: (w: World, issueExternal: (c: Parameters<typeof issue>[1]) => void) => void,
): { replay: Replay; hashes: HashPoint[] } {
  const w = makeWorld(data, cr, seed)
  const log: Stamped[] = []
  const hashes: HashPoint[] = []
  attachScenario(w, scenario)
  scenario.setup(w)
  while (w.meta[M_TICK] < ticks) {
    script(w, c => {
      issue(w, c, log)
    })
    const r = advanceTick(w)
    if (r.hash !== null) hashes.push({ tick: r.tick, hash: r.hash, sections: sectionHashes(w) })
  }
  return {
    replay: {
      simVersion: SIM_VERSION,
      dataVersion: data.version,
      ruleset: cr.hash,
      scenario: scenario.name,
      seed,
      ticks,
      log,
    },
    hashes,
  }
}

/**
 * Issues again the commands of `log` from entry `k` that are stamped for the world's next tick, as they were first
 * issued; returns the index after them, or the mismatch when one does not take the sequence number it was logged with.
 * The replay and the page's timeline (src/app/timeline.ts) both hand logged commands back to a world through it.
 */
export function reissue(w: World, log: readonly Stamped[], k: number): number | Mismatch {
  while (k < log.length && log[k].tick === w.meta[M_TICK] + 1) {
    const s = issue(w, log[k].cmd)
    if (s.seq !== log[k].seq) {
      return { tick: s.tick, expected: `command seq ${log[k].seq}`, got: `seq ${s.seq}`, section: 'command log' }
    }
    k++
  }
  return k
}

export interface Mismatch {
  tick: number
  expected: string
  got: string
  section: string
}

/**
 * What `play` shows a caller of the world as it plays (tools/battle-report.ts). The world is read-only there: the
 * sim changes only through commands (decision 0005), and a write would make the replay diverge from its hashes.
 */
export interface PlayObserver {
  /** the world as the scenario set it up, before the first tick */
  start?: (w: World) => void
  /** the world after each tick, with what the tick returned (its departures), before its hash is checked */
  tick?: (w: World, res: TickResult) => void
}

/**
 * Plays a replay back; returns the first mismatch against `expected`, or null. Hashes are taken every HASH_EVERY
 * ticks, so a divergence is reported at the first hash point after it (within 20 ticks). `observe` reads the world
 * before the first tick and after each one, and must not change it (`PlayObserver`).
 */
export function play(
  r: Replay,
  data: SimData,
  cr: Compiled,
  scenario: Scenario,
  expected: HashPoint[],
  observe?: PlayObserver,
): Mismatch | null {
  if (r.simVersion !== SIM_VERSION) throw new Error(`replay from sim ${r.simVersion}, this is ${SIM_VERSION}`)
  if (r.dataVersion >>> 0 !== data.version >>> 0) {
    throw new DataVersionMismatch(`replay made with data ${hex(r.dataVersion)}, loaded ${hex(data.version)}`)
  }
  if (r.ruleset >>> 0 !== cr.hash >>> 0) {
    throw new DataVersionMismatch(`replay made with ruleset ${hex(r.ruleset)}, given ${hex(cr.hash)}`)
  }
  if (r.scenario !== scenario.name) throw new Error(`replay of scenario ${r.scenario}, given ${scenario.name}`)
  for (let i = 0; i < r.log.length; i++) {
    if (r.log[i].tick < 1 || r.log[i].tick > r.ticks || (i && r.log[i].tick < r.log[i - 1].tick)) {
      return {
        tick: r.log[i].tick,
        expected: 'log ticks in order, within the replay',
        got: `entry ${i} at tick ${r.log[i].tick}`,
        section: 'command log',
      }
    }
  }
  const w = makeWorld(data, cr, r.seed)
  attachScenario(w, scenario)
  scenario.setup(w)
  observe?.start?.(w)
  let k = 0
  let e = 0
  while (w.meta[M_TICK] < r.ticks) {
    // re-issue the commands logged at this tick (stamped for the next one), checking their sequence
    const next = reissue(w, r.log, k)
    if (typeof next !== 'number') return next
    k = next
    const res = advanceTick(w)
    observe?.tick?.(w, res)
    if (res.hash === null) continue
    const want = expected[e++]
    if (!want || want.tick !== res.tick) {
      return {
        tick: res.tick,
        expected: want ? `hash at tick ${want.tick}` : 'no more hashes',
        got: hex(res.hash),
        section: '',
      }
    }
    if (want.hash !== res.hash) {
      // a recording without section hashes (the page, to spare a serialization) cannot name the table
      if (!want.sections.length) {
        return { tick: res.tick, expected: hex(want.hash), got: hex(res.hash), section: 'not recorded' }
      }
      const got = sectionHashes(w)
      const bad = got.find(([n, h], i) => want.sections[i]?.[0] !== n || want.sections[i][1] !== h)
      return { tick: res.tick, expected: hex(want.hash), got: hex(res.hash), section: bad ? bad[0] : '' }
    }
  }
  return e === expected.length
    ? null
    : { tick: w.meta[M_TICK], expected: `${expected.length} hashes`, got: `${e}`, section: '' }
}
