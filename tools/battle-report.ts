// The battle report (docs/plans/active/s1e3-playtest.md): plays a page scenario in Node, or a session the page
// saved (its replay, with the moments marked), and prints what happened: each formation's morale states, shapes,
// squares against cavalry, charges and melees, who left the field, each side's share in the fight every minute,
// the result, and at each marked moment where everyone stood. A saved session is checked against its hashes first.
// Usage: node tools/battle-report.ts <session.json | scenario name> [minutes]   (a scenario runs with no orders)
import fs from 'node:fs'
import { loadSimData, compileRuleset, makeWorld, issue, advanceTick, attachScenario, play, fightShares, menOf, typeOf, sheltering,
  formationSlot, M_TICK, M_END, M_WINNER, END_RESULTS, MORALE_STATES, CH_NONE, TICK_HZ, type World, type Replay, type HashPoint,
  type SimData, type Compiled, type Scenario } from '../src/sim/index.ts'
import { napoleonic } from '../src/rulesets/napoleonic.ts'
import { PAGE_SCENARIOS } from '../src/scenarios/page.ts'
import { DEFAULT_MAP } from '../src/scenarios/maps.ts'

export interface Mark { tick: number; note: string }
export interface Session { replay: Replay; hashes: HashPoint[]; marks?: Mark[] }

const clock = (tick: number) => { const s = Math.floor(tick / TICK_HZ); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` }
// a formation by its side and spawn order (the slot, in a fresh world), as the plan names it
const nameOf = (w: World, i: number) => `side ${w.f.side[i]} #${i} ${typeOf(w, i).name}`
const shapeOf = (w: World, i: number) => typeOf(w, i).shapes[w.f.shape[i]].name

// what is reported of a formation each tick; a change between ticks is an event
const look = (w: World, i: number) => ({
  alive: w.f.alive[i] === 1,
  morale: MORALE_STATES[w.f.mstate[i]],
  shape: w.f.trans[i] ? `forming ${typeOf(w, i).shapes[w.f.tShape[i]].name}` : shapeOf(w, i),
  square: w.f.alive[i] ? sheltering(w, i) : false,
  charge: w.f.chPhase[i] !== CH_NONE ? `charging ${w.f.chTarget[i] ? `#${formationSlot(w, w.f.chTarget[i])}` : ''}` : '',
  melee: w.f.foe[i] ? `#${formationSlot(w, w.f.foe[i])}` : '',
})

export function report(w: World, ticks: number, step: () => void, marks: Mark[] = []): string[] {
  const out: string[] = [], N = w.f.alive.length
  const at = (s: string) => out.push(`${clock(w.meta[M_TICK])}  ${s}`)
  const was = Array.from({ length: N }, (_, i) => w.f.alive[i] ? look(w, i) : null)
  let m = 0
  while (w.meta[M_TICK] < ticks) {
    step()
    const t = w.meta[M_TICK]
    for (let i = 0; i < N; i++) {
      const a = was[i]; if (!a && !w.f.alive[i]) continue
      const b = w.f.alive[i] ? look(w, i) : null, n = a ? `${nameOf(w, i)}` : ''
      if (a && !b) { at(`side ${w.f.side[i]} #${i} left the field`); was[i] = null; continue }
      if (!a || !b) { was[i] = b; continue }
      if (a.morale !== b.morale) at(`${n}: ${b.morale} (${menOf(w, i)} men)`)
      if (a.shape !== b.shape) at(`${n}: ${b.shape}`)
      if (a.square !== b.square) at(`${n}: ${b.square ? 'shelters in square' : 'stands down from square'}`)
      if (a.charge !== b.charge) at(`${n}: ${b.charge || 'charge over'}`)
      if (a.melee !== b.melee) at(`${n}: ${b.melee ? `in melee with ${b.melee}` : 'out of melee'}`)
      was[i] = b
    }
    if (w.meta[M_END] === t) at(`THE END: ${END_RESULTS[w.meta[M_WINNER]]}`)
    if (t % (60 * TICK_HZ) === 0) { const [a, b] = fightShares(w); at(`in the fight: side 0 ${Math.round(100 * a)}%, side 1 ${Math.round(100 * b)}%`) }
    while (m < marks.length && marks[m].tick <= t) {
      at(`MARK ${marks[m].note || '(no note)'}`)
      for (let i = 0; i < N; i++) if (w.f.alive[i]) out.push(`        ${nameOf(w, i)}: ${shapeOf(w, i)}, ${MORALE_STATES[w.f.mstate[i]]}, ${menOf(w, i)} men at (${Math.round(w.f.x[i])}, ${Math.round(w.f.z[i])})`)
      m++
    }
  }
  // where each formation ended: its shape, state and men against those it spawned with
  out.push('', 'at the end:')
  for (let i = 0; i < N; i++) if (w.f.alive[i]) out.push(`  ${nameOf(w, i)}: ${shapeOf(w, i)}, ${MORALE_STATES[w.f.mstate[i]]}, ${menOf(w, i)} of ${w.f.startMen[i]} men`)
  return out
}

// a session the page saved (checked against its hashes first; a mismatch throws), or with none the scenario
// with no orders for `ticks`
export function reportSession(data: SimData, cr: Compiled, scenario: Scenario, session: Session | null, ticks = 0): string[] {
  if (session) {
    const bad = play(session.replay, data, cr, scenario, session.hashes)
    if (bad) throw new Error(`the session does not reproduce: ${JSON.stringify(bad)}`)
    ticks = session.replay.ticks
  }
  const w = makeWorld(data, cr, session ? session.replay.seed : 1, false)
  attachScenario(w, scenario); scenario.setup(w)
  const log = session?.replay.log ?? []
  let k = 0
  const step = () => {
    while (k < log.length && log[k].tick === w.meta[M_TICK] + 1) issue(w, log[k++].cmd)
    advanceTick(w)
  }
  const head = `${scenario.name}${session ? `, a session of ${clock(ticks)} with ${log.length} orders and ${session.marks?.length ?? 0} marks` : `, no orders, ${clock(ticks)}`}`
  return [head, ...report(w, ticks, step, session?.marks ?? [])]
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = process.argv[2]
  if (!arg) { console.error('usage: node tools/battle-report.ts <session.json | scenario name> [minutes]'); process.exit(2) }
  const session: Session | null = fs.existsSync(arg) ? JSON.parse(fs.readFileSync(arg, 'utf8')) : null
  const name = session ? session.replay.scenario : arg, scenario = PAGE_SCENARIOS[name]
  if (!scenario) { console.error(`no scenario ${name}`); process.exit(2) }
  const data = loadSimData(new Uint8Array(fs.readFileSync(`data/${scenario.map ?? DEFAULT_MAP}.simdata`)))
  const ticks = Math.round(Number(process.argv[3] ?? scenario.minutes ?? 20) * 60 * TICK_HZ)
  try { for (const line of reportSession(data, compileRuleset(napoleonic), scenario, session, ticks)) console.log(line) }
  catch (e) { console.error(String(e)); process.exit(1) }
}
