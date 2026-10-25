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
} from '../src/sim/index.ts'
import { napoleonic } from '../src/rulesets/napoleonic.ts'
import { PAGE_SCENARIOS, PAGE_SEED } from '../src/scenarios/page.ts'
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

// a report built tick by tick: `tick` after each of the world's ticks, `end` for the lines
export function reporter(w: World, marks: Mark[] = []): { tick: () => void; end: () => string[] } {
  const out: string[] = []
  const N = w.f.alive.length
  const at = (s: string) => out.push(`${clock(w.meta[M_TICK])}  ${s}`)
  const was = Array.from({ length: N }, (_, i) => (w.f.alive[i] ? look(w, i) : null))
  let m = 0
  const tick = () => {
    const t = w.meta[M_TICK]
    for (let i = 0; i < N; i++) {
      const a = was[i]
      if (!a && !w.f.alive[i]) continue
      const b = w.f.alive[i] ? look(w, i) : null
      const n = nameOf(w, i)
      if (a && !b) {
        at(`side ${w.f.side[i]} #${i} left the field`)
        was[i] = null
        continue
      }
      if (!a || !b) {
        was[i] = b
        continue
      }
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

// a session the page saved (a mismatch with its hashes throws), or with none the scenario with no orders for
// `ticks` at the page's seed
export function reportSession(
  data: SimData,
  cr: Compiled,
  scenario: Scenario,
  session: Session | null,
  ticks = 0,
): string[] {
  if (session) {
    const n = session.replay.log.length
    const marks = session.marks ?? []
    const on: { r?: ReturnType<typeof reporter> } = {}
    // the reporter starts at the first tick, on the world play() set up
    const bad = play(session.replay, data, cr, scenario, session.hashes, w => {
      on.r ??= reporter(w, marks)
      on.r.tick()
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
  while (w.meta[M_TICK] < ticks) {
    advanceTick(w)
    r.tick()
  }
  return [`${scenario.name}, no orders, ${clock(ticks)}`, ...r.end()]
}

// run as a script (a symlinked or percent-encoded path too), not imported
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const arg = process.argv[2]
    if (!arg) throw new Error('usage: node tools/battle-report.ts <session.json | scenario name> [minutes]')
    const session: Session | null = fs.existsSync(arg) ? JSON.parse(fs.readFileSync(arg, 'utf8')) : null
    const name = session ? session.replay.scenario : arg
    const scenario = Object.hasOwn(PAGE_SCENARIOS, name) ? PAGE_SCENARIOS[name] : null
    if (!scenario) {
      throw new Error(`no scenario ${name} (a session file, or one of: ${Object.keys(PAGE_SCENARIOS).join(', ')})`)
    }
    const map = scenario.map ?? DEFAULT_MAP
    const data = loadSimData(
      new Uint8Array(fs.readFileSync(new URL(`../data/${map}.simdata`, import.meta.url))),
      MAP_VERSIONS[map],
    )
    const ticks = Math.round(Number(process.argv[3] ?? scenario.minutes ?? 20) * 60 * TICK_HZ)
    for (const line of reportSession(data, compileRuleset(napoleonic), scenario, session, ticks)) console.log(line)
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e))
    process.exit(1)
  }
}
