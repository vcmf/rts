// Sides, the scenario's plan and the end (S1e-2, docs/plans/active/s1e2-sides.md, docs/systems/sides.md), and routers
// that break ranks (#39). The cases stand on the battlefield, levelled and open.
import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { Sim, root, longIt, openBattlefield, OPEN_DATA, battleData } from './fx.ts'
import { napoleonic } from '../src/rulesets/napoleonic.ts'
import { s1eBattle } from '../src/scenarios/s1e-battle.ts'
import { attachScenario, compileRuleset, makeWorld, advanceTick, record, play, serialize, deserialize, hashWorld, hex, unitHandle, formationSlot,
  M_TICK, M_END, M_WINNER, END_SIDE0, END_DRAW, O_HOLD, bracedOf, fightShares, issue, type World, MS_ROUTING, type PlanStep, type ScenarioRules } from '../src/sim/index.ts'

const PI = Math.PI
// a world on the open battlefield with a scenario's plan and limit, and units spawned in order (unit k is slot k)
function battle(rules: ScenarioRules, units: [side: number, x: number, z: number, heading: number, shape?: string][], seed = 1): Sim {
  const s = new Sim(seed, napoleonic, openBattlefield(), OPEN_DATA); attachScenario(s.w, rules)
  for (const [side, x, z, heading, shape] of units) s.cmd({ type: 'debug-spawn', side, x, z, heading, shape: shape ?? 'line', men: 400, fire: 'hold' })
  s.tick(); expect(s.dropped).toEqual([])
  return s
}

describe('the plan', () => {
  it('a step\'s command reaches its formation at its tick', () => {
    const plan: PlanStep[] = [{ at: 10, unit: 1, cmd: { type: 'move', points: [[200, 100]], append: false } }]
    const s = battle({ plan }, [[0, 0, -200, 0], [1, 200, 200, PI]])
    s.advance(9.9); expect(s.orders(unitHandle(1))).toBe(0)
    s.advance(0.1); expect(s.orders(unitHandle(1))).toBe(1)
  })
  it('a recorded game logs only the player\'s commands, not the plan\'s; its replay reproduces the planned moves', () => {
    const plan: PlanStep[] = [{ at: 5, unit: 1, cmd: { type: 'move', points: [[200, 100]], append: false } }]
    const scenario = { name: 'plan-log', map: 'battlefield', plan, setup: (w: World) => { issue(w, { type: 'debug-spawn', side: 0, x: 0, z: -200, heading: 0, shape: 'line', men: 400, fire: 'hold' }); issue(w, { type: 'debug-spawn', side: 1, x: 200, z: 200, heading: PI, shape: 'line', men: 400, fire: 'hold' }) } }
    const cr = compileRuleset(napoleonic)
    const run = record(battleData, cr, scenario, 1, 400, (w, ext) => { if (w.meta[M_TICK] === 20) ext({ type: 'halt', id: unitHandle(0) }) })
    expect(run.replay.log.map(e => e.cmd.type)).toEqual(['halt'])
    expect(play(run.replay, battleData, cr, scenario, run.hashes)).toBeNull()
  })
  it('a plan\'s march under a cavalry threat is kept: the battalion forms square, holds, then forms back and marches on', () => {
    // a regiment of the other side stands 140 m off: the line is on the alert when the plan's order comes
    const plan: PlanStep[] = [{ at: 0.5, unit: 1, cmd: { type: 'move', points: [[0, 300]], append: false } }]
    const s = new Sim(1, napoleonic, openBattlefield(), OPEN_DATA); attachScenario(s.w, { plan })
    s.cmd({ type: 'debug-spawn', side: 0, unit: 'cavalry', x: 0, z: -40, heading: 0, shape: 'line', men: 256, fire: 'hold' })
    s.cmd({ type: 'debug-spawn', side: 1, x: 0, z: 100, heading: 0, shape: 'line', men: 400, fire: 'hold' }); s.tick()
    const line = unitHandle(1), z0 = s.z(line)
    s.until(() => s.shape(line) !== 'square', 150); const zq = s.z(line); s.advance(60)
    expect([s.shape(line), s.orders(line) > 0, s.z(line)]).toEqual(['square', true, zq])   // in square, holding, its march kept
    s.order({ type: 'move', id: unitHandle(0), points: [[0, -500]], append: false })   // the regiment rides away
    s.until(() => s.z(unitHandle(0)) > -400, 400); s.advance(napoleonic.melee.refuge.hold + 120)
    expect(s.shape(line)).toBe('line'); expect(s.z(line)).toBeGreaterThan(z0 + 20)   // formed back, and on its way
  })
  it('a battalion that breaks in the square it formed by itself runs: the square\'s hold goes with its orders', () => {
    const s = new Sim(1, napoleonic, openBattlefield(), OPEN_DATA)
    s.cmd({ type: 'debug-spawn', side: 0, unit: 'cavalry', x: 0, z: -40, heading: 0, shape: 'line', men: 256, fire: 'hold' })
    s.cmd({ type: 'debug-spawn', side: 1, x: 0, z: 100, heading: 0, shape: 'line', men: 400, fire: 'hold' }); s.tick()
    s.order({ type: 'side', side: 1, x: 0, z: 1 })
    const line = unitHandle(1); s.until(() => s.shape(line) !== 'square', 150); expect(s.w.ord.type[s.w.f.ordHead[1]]).toBe(O_HOLD)
    const z0 = s.z(line); s.w.f.morale[1] = 0.1; s.tick(); expect(s.w.f.mstate[1]).toBe(MS_ROUTING)
    s.advance(30); expect(s.z(line)).toBeGreaterThan(z0 + 20)   // it ran north, to its rear
  })
  it('a player\'s order in the same spell stands the square down', () => {
    const s = new Sim(1, napoleonic, openBattlefield(), OPEN_DATA)
    s.cmd({ type: 'debug-spawn', side: 0, unit: 'cavalry', x: 0, z: -40, heading: 0, shape: 'line', men: 256, fire: 'hold' })
    s.cmd({ type: 'debug-spawn', side: 1, x: 0, z: 100, heading: 0, shape: 'line', men: 400, fire: 'hold' }); s.tick()
    s.advance(0.5); s.order({ type: 'move', id: unitHandle(1), points: [[0, 300]], append: false }); s.advance(10)
    expect(s.shape(unitHandle(1))).toBe('line'); expect(s.z(unitHandle(1))).toBeGreaterThan(105)
  })
  it('a save made with a plan refuses to run until that plan is attached again, and refuses another', () => {
    const plan: PlanStep[] = [{ at: 50, unit: 0, cmd: { type: 'halt' } }]
    const s = battle({ plan, minutes: 10 }, [[0, 0, -200, 0], [1, 200, 200, PI]]), cr = s.w.cr
    const w2 = deserialize(serialize(s.w), OPEN_DATA, cr, true, openBattlefield())
    expect(() => advanceTick(w2)).toThrow(/plan is not attached/)
    expect(() => attachScenario(w2, { plan: [], minutes: 10 })).toThrow(/another plan/)
    attachScenario(w2, { plan, minutes: 10 }); advanceTick(w2); s.tick(); expect(hex(hashWorld(w2))).toBe(hex(hashWorld(s.w)))
  })
  it('one for a formation gone, or out of the fight, is dropped with a reason', () => {
    const plan: PlanStep[] = [{ at: 5, unit: 3, cmd: { type: 'halt' } }, { at: 5, unit: 1, cmd: { type: 'halt' } }]
    const s = battle({ plan }, [[0, 0, -200, 0], [1, 200, 200, PI]])
    s.w.f.morale[1] = 0.1; s.tick(); expect(s.w.f.mstate[1]).toBe(MS_ROUTING)
    s.advance(5)
    expect(s.dropped.map(d => [d.seq, d.reason])).toEqual([[-1, 'plan: no such formation'], [-1, 'plan: routing']])
  })
  it('a charge names its target by unit', () => {
    const plan: PlanStep[] = [{ at: 1, unit: 1, cmd: { type: 'charge', target: 0 } }]
    const s = new Sim(1, napoleonic, openBattlefield(), OPEN_DATA); attachScenario(s.w, { plan })
    s.cmd({ type: 'debug-spawn', side: 0, x: 0, z: -100, heading: 0, shape: 'line', men: 400, fire: 'hold' })
    s.cmd({ type: 'debug-spawn', side: 1, unit: 'cavalry', x: 0, z: 200, heading: PI, shape: 'line', men: 256 }); s.tick()
    s.advance(1); expect(s.w.f.chTarget[1]).toBe(unitHandle(0))
  })
})

describe('the end', () => {
  const two = () => battle({}, [[0, -100, -200, 0], [0, 100, -200, 0], [1, -100, 200, PI], [1, 100, 200, PI]])
  it('a side with half its men out of the fight is broken and its enemy wins', () => {
    const s = two(); s.advance(1); expect(s.w.meta[M_END]).toBe(0)
    s.order({ type: 'debug-morale', id: unitHandle(2), quality: 0 }); s.until(() => !s.w.meta[M_END], 30)
    expect([s.w.f.mstate[2], s.w.meta[M_WINNER]]).toEqual([MS_ROUTING, END_SIDE0])
    const at = s.w.meta[M_END]; s.advance(5); expect(s.w.meta[M_END]).toBe(at)   // decided once
  })
  it('both broken on one tick is a draw', () => {
    const s = two(); for (const u of [0, 2]) s.w.f.morale[u] = 0.1; s.tick()   // both break in the same morale step
    expect([s.w.f.mstate[0], s.w.f.mstate[2], s.w.meta[M_WINNER]]).toEqual([MS_ROUTING, MS_ROUTING, END_DRAW])
  })
  it('at the time limit the larger share in the fight wins; within the margin, a draw', () => {
    const go = (kill: number) => { const s = battle({ minutes: 0.1 }, [[0, -100, -200, 0], [1, -100, 200, PI]]); s.order({ type: 'debug-kill', id: unitHandle(1), men: kill }); s.advance(6); return [s.w.meta[M_END], s.w.meta[M_WINNER]] }
    expect(go(10)).toEqual([120, END_DRAW]); expect(go(40)).toEqual([120, END_SIDE0])
  })
  it('a rally brings a battalion\'s men back into the count', () => {
    // side 1's battalion breaks far from any enemy and runs to its rear at the northern edge, where it rallies
    const s = battle({}, [[0, -500, -500, 0], [1, 0, 300, PI], [1, 300, 300, PI], [1, -300, 300, PI]])
    s.order({ type: 'side', side: 1, x: 0, z: 1 }); s.w.f.morale[1] = 0.1; s.tick()
    expect(s.w.f.mstate[1]).toBe(MS_ROUTING); expect(fightShares(s.w)[1]).toBeCloseTo(2 / 3, 9)
    s.until(() => s.w.f.mstate[1] >= MS_ROUTING, 300)
    expect(s.w.f.mstate[1]).toBeLessThan(MS_ROUTING); expect(fightShares(s.w)[1]).toBe(1)   // rallied: all its men back
  })
  it('a side is not broken while more than half its men are in the fight', () => {
    const s = battle({}, [[0, -100, -200, 0], [1, -150, 200, PI], [1, 0, 200, PI], [1, 150, 200, PI]])
    s.w.f.morale[1] = 0.1; s.tick()   // one of side 1's three: two thirds still in the fight
    expect([s.w.f.mstate[1], s.w.meta[M_END]]).toEqual([MS_ROUTING, 0])
    s.w.f.morale[2] = 0.1; s.tick(); expect(s.w.meta[M_WINNER]).toBe(END_SIDE0)
  })
})

describe('routers break ranks (#39)', () => {
  const caught = (at: number) => {
    const s = battle({}, [[0, 0, -200, 0]]), h = unitHandle(0)
    s.order({ type: 'form', id: h, shape: 'square' })
    s.until(() => s.layout(h).name === 'line' && s.w.f.trans[0] === 1 && bracedOf(s.w, 0) < at, 200)   // its progress into the square
    s.w.f.morale[0] = 0.1; s.tick()
    return { state: s.w.f.mstate[0], shape: s.shape(h) }
  }
  it('a battalion caught at 30% of its change runs at once as the shape it left, one at 70% as the shape it was forming', () => {
    expect(caught(0.3)).toEqual({ state: MS_ROUTING, shape: 'line' })
    expect(caught(0.7)).toEqual({ state: MS_ROUTING, shape: 'square' })
  })
})

describe('determinism', () => {
  const goldenFile = path.join(root, 'test', 'golden', 's1e-battle.json'), TICKS = 12000
  longIt('ten minutes of s1e-battle give the committed golden hashes; the replay and a save round trip reproduce them', () => {
    const cr = compileRuleset(napoleonic), run = record(battleData, cr, s1eBattle, 3, TICKS, () => {})
    const hashes = run.hashes.map(p => [p.tick, hex(p.hash)])
    if (process.env.UPDATE_GOLDEN) fs.writeFileSync(goldenFile, JSON.stringify({ dataVersion: hex(battleData.version), ruleset: hex(cr.hash), ticks: TICKS, hashes }) + '\n')
    const golden = JSON.parse(fs.readFileSync(goldenFile, 'utf8'))
    expect([golden.dataVersion, golden.ruleset]).toEqual([hex(battleData.version), hex(cr.hash)])
    expect(hashes).toEqual(golden.hashes)
    expect(run.replay.log).toEqual([])   // the plan's commands are not logged
    expect(play(run.replay, battleData, cr, s1eBattle, run.hashes)).toBeNull()
    // a save taken mid-battle continues to the same hashes once the plan is attached again
    const w = makeWorld(battleData, cr, 3); attachScenario(w, s1eBattle); s1eBattle.setup(w); while (w.meta[M_TICK] < 5000) advanceTick(w)
    const w2 = deserialize(serialize(w), battleData, cr); attachScenario(w2, s1eBattle)
    while (w.meta[M_TICK] < 7000) { advanceTick(w); advanceTick(w2) }
    expect(hex(hashWorld(w2))).toBe(hex(hashWorld(w)))
    expect(formationSlot(w, unitHandle(8))).toBeGreaterThanOrEqual(0)
  })
})
