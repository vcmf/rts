// The battle report (docs/plans/active/s1e3-playtest.md): plays a page scenario in Node, or a session the page
// saved (its replay, with the moments marked), and prints what happened: each formation's morale states, shapes,
// squares against cavalry, charges and melees, who left the field, each side's share in the fight every minute,
// the result, and at each marked moment where everyone stood. A saved session is checked against its hashes as
// it plays (one pass, `play`); a scenario with no orders runs at the page's seed, the battle the page plays.
// Usage: node tools/battle-report.ts <session.json | scenario name> [minutes]
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  loadSimData,
  compileRuleset,
  makeWorld,
  advanceTick,
  attachScenario,
  play,
  fightShares,
  menOf,
  typeOf,
  sheltering,
  formationSlot,
  handleIndex,
  M_TICK,
  M_END,
  M_WINNER,
  END_RESULTS,
  MORALE_STATES,
  CHARGE_PHASES,
  CH_NONE,
  TICK_HZ,
  type World,
  type Replay,
  type HashPoint,
  type SimData,
  type Compiled,
  type Scenario,
  type TickResult,
} from '../src/sim/index.ts'
import { napoleonic } from '../src/rulesets/napoleonic.ts'
import { BATTLE_SCENARIOS, PAGE_SEED } from '../src/scenarios/page.ts'
import { DEFAULT_MAP, MAP_VERSIONS } from '../src/scenarios/maps.ts'

export interface Mark {
  tick: number
  note: string
}
export interface Session {
  replay: Replay
  hashes: HashPoint[]
  marks?: Mark[]
}

const clock = (tick: number) => {
  const s = Math.floor(tick / TICK_HZ)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
// a formation by its side and spawn order (the slot, in a fresh world), as the plan names it
const nameOf = (w: World, i: number) => `side ${w.f.side[i]} #${i} ${typeOf(w, i).name}`
const shapeOf = (w: World, i: number) => typeOf(w, i).shapes[w.f.shape[i]].name
// another formation by its handle: gone from the field once its slot is reaped
const other = (w: World, h: number) => {
  const j = formationSlot(w, h)
  return j >= 0 ? `#${j}` : 'one gone'
}

// what is reported of a formation each tick; a change between ticks is an event
const look = (w: World, i: number) => ({
  morale: MORALE_STATES[w.f.mstate[i]],
  shape: w.f.trans[i] ? `forming ${typeOf(w, i).shapes[w.f.tShape[i]].name}` : shapeOf(w, i),
  square: sheltering(w, i),
  charge: w.f.chPhase[i] !== CH_NONE ? `${CHARGE_PHASES[w.f.chPhase[i]]} ${other(w, w.f.chTarget[i])}` : '',
  melee: w.f.foe[i] ? other(w, w.f.foe[i]) : '',
})

/**
 * A report built tick by tick on a world: `tick` after each of its ticks, with what that tick returned, and `end`
 * for the lines. It only reads the world. A formation reaped in a tick has every column zeroed, so its side and name
 * come from the reporter's own record of it, and its men from the tick's departures: one in `departed` left the
 * field with them, one not was destroyed (no men left).
 */
export function reporter(w: World, marks: Mark[] = []): { tick: (res: TickResult) => void; end: () => string[] } {
  const out: string[] = []
  const N = w.f.alive.length
  const at = (s: string) => out.push(`${clock(w.meta[M_TICK])}  ${s}`)
  const seen = (i: number) => ({ ...look(w, i), name: nameOf(w, i) })
  const was: (ReturnType<typeof seen> | null)[] = Array.from({ length: N }, (_, i) => (w.f.alive[i] ? seen(i) : null))
  const left = new Map<number, number>()
  let m = 0
  const tick = (res: TickResult) => {
    const t = w.meta[M_TICK]
    left.clear()
    for (const d of res.departed) left.set(handleIndex(d.id), d.men)
    for (let i = 0; i < N; i++) {
      const a = was[i]
      if (!a && !w.f.alive[i]) continue
      // reaped this tick: its columns are zeroed
      if (a && !w.f.alive[i]) {
        const men = left.get(i)
        at(men !== undefined ? `${a.name} left the field (${men} men)` : `${a.name} destroyed`)
        was[i] = null
        continue
      }
      const b = seen(i)
      if (!a) {
        was[i] = b
        continue
      }
      const n = b.name
      if (a.morale !== b.morale) at(`${n}: ${b.morale} (${menOf(w, i)} men)`)
      if (a.shape !== b.shape) at(`${n}: ${b.shape}`)
      if (a.square !== b.square) at(`${n}: ${b.square ? 'shelters in square' : 'stands down from square'}`)
      if (a.charge !== b.charge) at(`${n}: ${b.charge || 'charge over'}`)
      if (a.melee !== b.melee) at(`${n}: ${b.melee ? `in melee with ${b.melee}` : 'out of melee'}`)
      was[i] = b
    }
    if (w.meta[M_END] === t) at(`THE END: ${END_RESULTS[w.meta[M_WINNER]]}`)
    if (t % (60 * TICK_HZ) === 0) {
      const [a, b] = fightShares(w)
      at(`in the fight: side 0 ${Math.round(100 * a)}%, side 1 ${Math.round(100 * b)}%`)
    }
    while (m < marks.length && marks[m].tick <= t) {
      at(`MARK ${marks[m].note || '(no note)'}`)
      for (let i = 0; i < N; i++) {
        if (w.f.alive[i]) {
          out.push(
            `        ${nameOf(w, i)}: ${shapeOf(w, i)}, ${MORALE_STATES[w.f.mstate[i]]}, ${menOf(w, i)} men at (${Math.round(w.f.x[i])}, ${Math.round(w.f.z[i])})`,
          )
        }
      }
      m++
    }
  }
  // where each formation ended: its shape, state and men against those it spawned with
  const end = () => {
    out.push('', 'at the end:')
    for (let i = 0; i < N; i++) {
      if (w.f.alive[i]) {
        out.push(
          `  ${nameOf(w, i)}: ${shapeOf(w, i)}, ${MORALE_STATES[w.f.mstate[i]]}, ${menOf(w, i)} of ${w.f.startMen[i]} men`,
        )
      }
    }
    return out
  }
  return { tick, end }
}

/**
 * A session's marks, checked: a list of ticks within the replay, in order, each with a text note. The report prints
 * a mark when the battle reaches its tick, in the list's order, so a file edited by hand with a mark out of order or
 * past the end would lose marks silently; it is refused instead.
 */
export function checkMarks(session: Session): Mark[] {
  const marks: unknown = session.marks ?? []
  if (!Array.isArray(marks)) throw new Error("the session's marks are not a list")
  let last = 0
  marks.forEach((m: unknown, k: number) => {
    const { tick, note } = (typeof m === 'object' && m !== null ? m : {}) as Partial<Record<keyof Mark, unknown>>
    if (typeof tick !== 'number' || !Number.isInteger(tick) || tick < 0 || tick > session.replay.ticks) {
      throw new Error(`mark ${k + 1}: its tick is not one of the replay's (0 to ${session.replay.ticks})`)
    }
    if (tick < last) throw new Error(`mark ${k + 1}: at tick ${tick}, before the mark ahead of it (tick ${last})`)
    if (typeof note !== 'string') throw new Error(`mark ${k + 1}: its note is not text`)
    last = tick
  })
  return marks as Mark[]
}

// with no orders, the battle is played on this long after its end (a minute), then stops: the end and the table
// close the report rather than the quiet after it
const AFTER_END = 60 * TICK_HZ

/**
 * Reports a session the page saved (a mismatch with its hashes or a bad mark throws, `checkMarks`), or with none
 * the scenario with no orders for `ticks` at the page's seed, stopped `AFTER_END` after the battle's end. Both
 * start the reporter before the first tick.
 */
export function reportSession(
  data: SimData,
  cr: Compiled,
  scenario: Scenario,
  session: Session | null,
  ticks = 0,
): string[] {
  if (session) {
    const n = session.replay.log.length
    const marks = checkMarks(session)
    const on: { r?: ReturnType<typeof reporter> } = {}
    // the reporter starts on the world play() set up, before the first tick, as with no orders below
    const bad = play(session.replay, data, cr, scenario, session.hashes, {
      start: w => {
        on.r = reporter(w, marks)
      },
      tick: (_, res) => on.r?.tick(res),
    })
    if (bad) throw new Error(`the session does not reproduce: ${JSON.stringify(bad)}`)
    return [
      `${scenario.name}, a session of ${clock(session.replay.ticks)} with ${n} orders and ${marks.length} marks`,
      ...(on.r ? on.r.end() : []),
    ]
  }
  const w = makeWorld(data, cr, PAGE_SEED, false)
  attachScenario(w, scenario)
  scenario.setup(w)
  const r = reporter(w)
  const over = () => w.meta[M_END] > 0 && w.meta[M_TICK] >= w.meta[M_END] + AFTER_END
  while (w.meta[M_TICK] < ticks && !over()) r.tick(advanceTick(w))
  const stopped = w.meta[M_TICK] < ticks ? ', stopped a minute after the end' : ''
  return [`${scenario.name}, no orders, ${clock(w.meta[M_TICK])}${stopped}`, ...r.end()]
}

// run as a script (a symlinked or percent-encoded path too), not imported
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const arg = process.argv[2]
    if (!arg) throw new Error('usage: node tools/battle-report.ts <session.json | scenario name> [minutes]')
    const session: Session | null = fs.existsSync(arg) ? JSON.parse(fs.readFileSync(arg, 'utf8')) : null
    const name = session ? session.replay.scenario : arg
    // (a session from the look page at ?sim is a battle too: BATTLE_SCENARIOS)
    const scenario = Object.hasOwn(BATTLE_SCENARIOS, name) ? BATTLE_SCENARIOS[name] : null
    if (!scenario) {
      throw new Error(`no scenario ${name} (a session file, or one of: ${Object.keys(BATTLE_SCENARIOS).join(', ')})`)
    }
    const map = scenario.map ?? DEFAULT_MAP
    const data = loadSimData(
      new Uint8Array(fs.readFileSync(new URL(`../data/${map}.simdata`, import.meta.url))),
      MAP_VERSIONS[map],
    )
    const given = process.argv[3]
    if (session && given !== undefined) throw new Error('a session plays as long as it was played: no minutes')
    const minutes = Number(given ?? scenario.minutes ?? 20)
    if (!Number.isFinite(minutes) || minutes <= 0) throw new Error(`minutes must be a positive number, not ${given}`)
    const ticks = Math.round(minutes * 60 * TICK_HZ)
    for (const line of reportSession(data, compileRuleset(napoleonic), scenario, session, ticks)) console.log(line)
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e))
    process.exit(1)
  }
}
