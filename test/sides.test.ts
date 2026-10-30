// Sides, the scenario's plan and the end (S1e-2, docs/plans/active/s1e2-sides.md, docs/systems/sides.md), and routers
// that break ranks (#39). The cases stand on the battlefield, levelled and open.
import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { Sim, root, longIt, openBattlefield, OPEN_DATA, battleData } from './fx.ts'
import { napoleonic } from '../src/rulesets/napoleonic.ts'
import { s1eBattle } from '../src/scenarios/s1e-battle.ts'
import { PAGE_SEED } from '../src/scenarios/page.ts'
import {
  attachScenario,
  compileRuleset,
  makeWorld,
  advanceTick,
  record,
  play,
  serialize,
  deserialize,
  hashWorld,
  hex,
  unitHandle,
  formationSlot,
  M_TICK,
  M_END,
  M_WINNER,
  TICK_HZ,
  END_SIDE0,
  END_SIDE1,
  END_DRAW,
  sheltering,
  ordersFree,
  braceOf,
  fightShares,
  issue,
  type World,
  MS_ROUTING,
  type PlanStep,
  type ScenarioRules,
} from '../src/sim/index.ts'
import { FULL } from '../src/scenarios/sizes.ts'

const PI = Math.PI
// a world on the open battlefield with a scenario's plan and limit, and units spawned in order (unit k is slot k)
function battle(
  rules: ScenarioRules,
  units: [side: number, x: number, z: number, heading: number, shape?: string][],
  seed = 1,
): Sim {
  const s = new Sim(seed, napoleonic, openBattlefield(), OPEN_DATA)
  attachScenario(s.w, rules)
  for (const [side, x, z, heading, shape] of units) {
    s.cmd({ type: 'debug-spawn', side, x, z, heading, shape: shape ?? 'line', men: FULL.infantry, fire: 'hold' })
  }
  s.tick()
  expect(s.dropped).toEqual([])
  return s
}

describe('the plan', () => {
  it("a step's command reaches its formation at its tick", () => {
    const plan: PlanStep[] = [{ at: 10, unit: 1, cmd: { type: 'move', points: [[200, 100]], append: false } }]
    const s = battle({ plan }, [
      [0, 0, -200, 0],
      [1, 200, 200, PI],
    ])
    s.advance(9.9)
    expect(s.orders(unitHandle(1))).toBe(0)
    s.advance(0.1)
    expect(s.orders(unitHandle(1))).toBe(1)
  })
  it("a recorded game logs only the player's commands, not the plan's; its replay reproduces the planned moves", () => {
    const plan: PlanStep[] = [{ at: 5, unit: 1, cmd: { type: 'move', points: [[200, 100]], append: false } }]
    const scenario = {
      name: 'plan-log',
      map: 'battlefield',
      plan,
      setup: (w: World) => {
        issue(w, {
          type: 'debug-spawn',
          side: 0,
          x: 0,
          z: -200,
          heading: 0,
          shape: 'line',
          men: FULL.infantry,
          fire: 'hold',
        })
        issue(w, {
          type: 'debug-spawn',
          side: 1,
          x: 200,
          z: 200,
          heading: PI,
          shape: 'line',
          men: FULL.infantry,
          fire: 'hold',
        })
      },
    }
    const cr = compileRuleset(napoleonic)
    const run = record(battleData, cr, scenario, 1, 400, (w, ext) => {
      if (w.meta[M_TICK] === 20) ext({ type: 'halt', id: unitHandle(0) })
    })
    expect(run.replay.log.map(e => e.cmd.type)).toEqual(['halt'])
    expect(play(run.replay, battleData, cr, scenario, run.hashes)).toBeNull()
  })
  it("a plan's march under a cavalry threat is kept: the battalion forms square, holds, then forms back and marches on", () => {
    // a regiment of the other side stands 140 m off: the line is on the alert when the plan's order comes
    const plan: PlanStep[] = [{ at: 0.5, unit: 1, cmd: { type: 'move', points: [[0, 300]], append: false } }]
    const s = new Sim(1, napoleonic, openBattlefield(), OPEN_DATA)
    attachScenario(s.w, { plan })
    s.cmd({
      type: 'debug-spawn',
      side: 0,
      unit: 'cavalry',
      x: 0,
      z: -40,
      heading: 0,
      shape: 'line',
      men: FULL.cavalry,
      fire: 'hold',
    })
    s.cmd({ type: 'debug-spawn', side: 1, x: 0, z: 100, heading: 0, shape: 'line', men: FULL.infantry, fire: 'hold' })
    s.tick()
    const line = unitHandle(1)
    const z0 = s.z(line)
    s.until(() => s.shape(line) !== 'square', 150)
    const zq = s.z(line)
    s.advance(60)
    // in square, holding, its march kept
    expect([s.shape(line), s.orders(line) > 0, s.z(line)]).toEqual(['square', true, zq])
    s.order({ type: 'move', id: unitHandle(0), points: [[0, -500]], append: false }) // the regiment rides away
    s.until(() => s.z(unitHandle(0)) > -400, 400)
    s.advance(napoleonic.melee.refuge.hold + 120)
    // formed back, and on its way
    expect(s.shape(line)).toBe('line')
    expect(s.z(line)).toBeGreaterThan(z0 + 20)
  })
  it("a battalion that breaks in the square it formed by itself runs: the square's hold goes with its orders", () => {
    const s = new Sim(1, napoleonic, openBattlefield(), OPEN_DATA)
    s.cmd({
      type: 'debug-spawn',
      side: 0,
      unit: 'cavalry',
      x: 0,
      z: -40,
      heading: 0,
      shape: 'line',
      men: FULL.cavalry,
      fire: 'hold',
    })
    s.cmd({ type: 'debug-spawn', side: 1, x: 0, z: 100, heading: 0, shape: 'line', men: FULL.infantry, fire: 'hold' })
    s.tick()
    s.order({ type: 'side', side: 1, x: 0, z: 1 })
    const line = unitHandle(1)
    s.until(() => s.shape(line) !== 'square', 150)
    expect(sheltering(s.w, 1)).toBe(true)
    const z0 = s.z(line)
    s.w.f.bar[1] = -100
    s.tick()
    expect(s.w.f.mstate[1]).toBe(MS_ROUTING)
    // it ran north, to its rear
    s.advance(30)
    expect(s.z(line)).toBeGreaterThan(z0 + 20)
  })
  it('a plan order that comes after the square has formed is kept too, and the order pool does not grow', () => {
    const plan: PlanStep[] = [{ at: 60, unit: 1, cmd: { type: 'move', points: [[0, 300]], append: false } }]
    const s = new Sim(1, napoleonic, openBattlefield(), OPEN_DATA)
    attachScenario(s.w, { plan })
    s.cmd({
      type: 'debug-spawn',
      side: 0,
      unit: 'cavalry',
      x: 0,
      z: -40,
      heading: 0,
      shape: 'line',
      men: FULL.cavalry,
      fire: 'hold',
    })
    s.cmd({ type: 'debug-spawn', side: 1, x: 0, z: 100, heading: 0, shape: 'line', men: FULL.infantry, fire: 'hold' })
    s.tick()
    const line = unitHandle(1)
    s.until(() => s.shape(line) !== 'square', 150)
    const free = ordersFree(s.w)
    s.advance(60)
    expect([s.shape(line), s.orders(line), sheltering(s.w, 1)]).toEqual(['square', 1, true])
    expect(ordersFree(s.w)).toBeGreaterThanOrEqual(free - 1) // at most the plan's one order: nothing piling up
    s.order({ type: 'move', id: unitHandle(0), points: [[0, -500]], append: false })
    s.until(() => s.z(unitHandle(0)) > -400, 400)
    s.advance(napoleonic.melee.refuge.hold + 120)
    expect(s.shape(line)).toBe('line')
    expect(s.z(line)).toBeGreaterThan(130)
  })
  it('a battalion sheltering in its square still fires at an enemy in range', () => {
    const plan: PlanStep[] = [{ at: 1, unit: 1, cmd: { type: 'move', points: [[0, 300]], append: false } }]
    const s = new Sim(1, napoleonic, openBattlefield(), OPEN_DATA)
    attachScenario(s.w, { plan })
    s.cmd({
      type: 'debug-spawn',
      side: 0,
      unit: 'cavalry',
      x: 0,
      z: -40,
      heading: 0,
      shape: 'line',
      men: FULL.cavalry,
      fire: 'hold',
    })
    s.cmd({
      type: 'debug-spawn',
      side: 1,
      x: 0,
      z: 100,
      heading: 0,
      shape: 'line',
      men: FULL.infantry,
      fire: 'at will',
    })
    // infantry 100 m off its rear face
    s.cmd({ type: 'debug-spawn', side: 0, x: 0, z: 200, heading: PI, shape: 'line', men: FULL.infantry, fire: 'hold' })
    s.tick()
    s.until(() => s.shape(unitHandle(1)) !== 'square', 150)
    const C = s.w.cr.maxC
    const v0 = Math.max(...s.w.f.volleyTick.slice(C, 2 * C))
    s.advance(40)
    expect(sheltering(s.w, 1)).toBe(true)
    expect(Math.max(...s.w.f.volleyTick.slice(C, 2 * C))).toBeGreaterThan(v0)
  })
  it('a battalion struck in melee stands, keeping its plan march, and goes on with it once the melee is over', () => {
    const plan: PlanStep[] = [{ at: 1, unit: 1, cmd: { type: 'move', points: [[300, 100]], append: false } }]
    // no square: the melee alone
    const rs = { ...napoleonic, melee: { ...napoleonic.melee, refuge: { ...napoleonic.melee.refuge, alert: 0 } } }
    const s = new Sim(1, rs, openBattlefield(rs), OPEN_DATA)
    attachScenario(s.w, { plan })
    s.cmd({
      type: 'debug-spawn',
      side: 0,
      unit: 'cavalry',
      x: 100,
      z: -60,
      heading: 0,
      shape: 'line',
      men: FULL.cavalry,
      fire: 'hold',
      bar: 14, // the old quality 0.45 on the bar's scale
    })
    s.cmd({
      type: 'debug-spawn',
      side: 1,
      x: 100,
      z: 100,
      heading: PI / 2,
      shape: 'line',
      men: FULL.infantry,
      fire: 'hold',
      bar: 260, // struck in the flank, it takes the impact's shock and its men lost at once, and stands
    })
    s.tick()
    s.advance(2)
    s.order({ type: 'charge', id: unitHandle(0), target: unitHandle(1) })
    s.until(() => !s.w.f.foe[1], 120)
    expect(s.w.f.foe[1]).not.toBe(0)
    // stands, its march kept
    const x = s.x(unitHandle(1))
    s.advance(2)
    expect([s.orders(unitHandle(1)), s.x(unitHandle(1))]).toEqual([1, x])
    // the regiment broke: on it goes
    s.until(() => s.w.f.foe[1] !== 0, 300)
    s.advance(20)
    expect(s.x(unitHandle(1))).toBeGreaterThan(x + 5)
  })
  it("a player's order in the same spell stands the square down", () => {
    const s = new Sim(1, napoleonic, openBattlefield(), OPEN_DATA)
    s.cmd({
      type: 'debug-spawn',
      side: 0,
      unit: 'cavalry',
      x: 0,
      z: -40,
      heading: 0,
      shape: 'line',
      men: FULL.cavalry,
      fire: 'hold',
    })
    s.cmd({ type: 'debug-spawn', side: 1, x: 0, z: 100, heading: 0, shape: 'line', men: FULL.infantry, fire: 'hold' })
    s.tick()
    s.advance(0.5)
    s.order({ type: 'move', id: unitHandle(1), points: [[0, 300]], append: false })
    s.advance(10)
    expect(s.shape(unitHandle(1))).toBe('line')
    expect(s.z(unitHandle(1))).toBeGreaterThan(105)
  })
  it('a save made with a plan refuses to run until that plan is attached again, and refuses another', () => {
    const plan: PlanStep[] = [{ at: 50, unit: 0, cmd: { type: 'halt' } }]
    const s = battle({ plan, minutes: 10 }, [
      [0, 0, -200, 0],
      [1, 200, 200, PI],
    ])
    const cr = s.w.cr
    const w2 = deserialize(serialize(s.w), OPEN_DATA, cr, true, openBattlefield())
    expect(() => advanceTick(w2)).toThrow(/plan is not attached/)
    expect(() => attachScenario(w2, { plan: [], minutes: 10 })).toThrow(/another plan/)
    attachScenario(w2, { plan, minutes: 10 })
    advanceTick(w2)
    s.tick()
    expect(hex(hashWorld(w2))).toBe(hex(hashWorld(s.w)))
  })
  it('one for a formation gone, or out of the fight, is dropped with a reason', () => {
    const plan: PlanStep[] = [
      { at: 5, unit: 3, cmd: { type: 'halt' } },
      { at: 5, unit: 1, cmd: { type: 'halt' } },
    ]
    const s = battle({ plan }, [
      [0, 0, -200, 0],
      [1, 200, 200, PI],
    ])
    s.w.f.bar[1] = -100
    s.tick()
    expect(s.w.f.mstate[1]).toBe(MS_ROUTING)
    s.advance(5)
    expect(s.dropped.map(d => [d.seq, d.reason])).toEqual([
      [-1, 'plan: no such formation'],
      [-1, 'plan: routing'],
    ])
  })
  it('a charge names its target by unit', () => {
    const plan: PlanStep[] = [{ at: 1, unit: 1, cmd: { type: 'charge', target: 0 } }]
    const s = new Sim(1, napoleonic, openBattlefield(), OPEN_DATA)
    attachScenario(s.w, { plan })
    s.cmd({ type: 'debug-spawn', side: 0, x: 0, z: -100, heading: 0, shape: 'line', men: FULL.infantry, fire: 'hold' })
    s.cmd({
      type: 'debug-spawn',
      side: 1,
      unit: 'cavalry',
      x: 0,
      z: 200,
      heading: PI,
      shape: 'line',
      men: FULL.cavalry,
    })
    s.tick()
    s.advance(1)
    expect(s.w.f.chTarget[1]).toBe(unitHandle(0))
  })
})

describe('the end', () => {
  const two = () =>
    battle({}, [
      [0, -100, -200, 0],
      [0, 100, -200, 0],
      [1, -100, 200, PI],
      [1, 100, 200, PI],
    ])
  it('a side whose share in the fight falls to end.broken is broken and its enemy wins (one of two out)', () => {
    const s = two()
    s.advance(1)
    expect(s.w.meta[M_END]).toBe(0)
    s.order({ type: 'debug-morale', id: unitHandle(2), bar: -100 })
    s.until(() => !s.w.meta[M_END], 30)
    expect([s.w.f.mstate[2], s.w.meta[M_WINNER]]).toEqual([MS_ROUTING, END_SIDE0])
    // decided once
    const at = s.w.meta[M_END]
    s.advance(5)
    expect(s.w.meta[M_END]).toBe(at)
  })
  it('both broken on one tick is a draw', () => {
    // both break in the same morale step
    const s = two()
    for (const u of [0, 2]) s.w.f.bar[u] = -100
    s.tick()
    expect([s.w.f.mstate[0], s.w.f.mstate[2], s.w.meta[M_WINNER]]).toEqual([MS_ROUTING, MS_ROUTING, END_DRAW])
  })
  it('at the time limit the larger share in the fight wins; within the margin, a draw', () => {
    const go = (kill: number) => {
      const s = battle({ minutes: 0.1 }, [
        [0, -100, -200, 0],
        [1, -100, 200, PI],
      ])
      s.order({ type: 'debug-kill', id: unitHandle(1), men: kill })
      s.advance(6)
      return [s.w.meta[M_END], s.w.meta[M_WINNER]]
    }
    expect(go(10)).toEqual([120, END_DRAW])
    expect(go(40)).toEqual([120, END_SIDE0])
  })
  it("a rally brings a battalion's men back into the count", () => {
    // side 1's battalion breaks far from any enemy and runs to its rear at the northern edge, where it rallies
    const s = battle({}, [
      [0, -500, -500, 0],
      [1, 0, 300, PI],
      [1, 300, 300, PI],
      [1, -300, 300, PI],
    ])
    s.order({ type: 'side', side: 1, x: 0, z: 1 })
    s.w.f.bar[1] = -100
    s.tick()
    expect(s.w.f.mstate[1]).toBe(MS_ROUTING)
    expect(fightShares(s.w)[1]).toBeCloseTo(2 / 3, 9)
    s.until(() => s.w.f.mstate[1] >= MS_ROUTING, 300)
    // rallied: all its men back
    expect(s.w.f.mstate[1]).toBeLessThan(MS_ROUTING)
    expect(fightShares(s.w)[1]).toBe(1)
  })
  it('a side with 60% of its men in the fight is broken (two of five out; at 0.5 it was not)', () => {
    expect(napoleonic.end.broken).toBeGreaterThanOrEqual(0.6)
    const s = battle({}, [
      [0, 0, -200, 0],
      ...[-300, -150, 0, 150, 300].map((x): [number, number, number, number] => [1, x, 200, PI]),
    ])
    s.w.f.bar[1] = -100
    s.tick()
    expect(s.w.meta[M_END]).toBe(0) // one of five out: 80% in
    s.w.f.bar[5] = -100
    s.tick()
    expect(fightShares(s.w)[1]).toBeCloseTo(0.6, 9)
    expect(s.w.meta[M_WINNER]).toBe(END_SIDE0)
  })
  it('a side is not broken while its share in the fight is above end.broken (two of three in)', () => {
    expect(napoleonic.end.broken).toBeGreaterThanOrEqual(1 / 2)
    expect(napoleonic.end.broken).toBeLessThan(2 / 3) // what the setups below need
    const s = battle({}, [
      [0, -100, -200, 0],
      [1, -150, 200, PI],
      [1, 0, 200, PI],
      [1, 150, 200, PI],
    ])
    s.w.f.bar[1] = -100
    s.tick() // one of side 1's three: two thirds still in the fight
    expect([s.w.f.mstate[1], s.w.meta[M_END]]).toEqual([MS_ROUTING, 0])
    s.w.f.bar[2] = -100
    s.tick()
    expect(s.w.meta[M_WINNER]).toBe(END_SIDE0)
  })
})

describe('routers break ranks (#39)', () => {
  const caught = (at: number) => {
    const s = battle({}, [[0, 0, -200, 0]])
    const h = unitHandle(0)
    s.order({ type: 'form', id: h, shape: 'square' })
    // its progress into the square
    s.until(() => s.layout(h).name === 'line' && s.w.f.trans[0] === 1 && braceOf(s.w, 0) < at, 200)
    s.w.f.bar[0] = -100
    s.tick()
    return { state: s.w.f.mstate[0], shape: s.shape(h) }
  }
  it('a battalion caught at 30% of its change runs at once as the shape it left, one at 70% as the shape it was forming', () => {
    expect(caught(0.3)).toEqual({ state: MS_ROUTING, shape: 'line' })
    expect(caught(0.7)).toEqual({ state: MS_ROUTING, shape: 'square' })
  })
})

describe('the tuned battle (docs/plans/active/s1e3-playtest.md)', () => {
  longIt("with no orders from you, s1e-battle at the page's seed is side 1's, decided in 15–22 minutes", () => {
    const w = makeWorld(battleData, compileRuleset(napoleonic), PAGE_SEED, false)
    attachScenario(w, s1eBattle)
    s1eBattle.setup(w)
    while (!w.meta[M_END] && w.meta[M_TICK] < 22 * 60 * TICK_HZ) advanceTick(w)
    expect(w.meta[M_WINNER]).toBe(END_SIDE1)
    expect(w.meta[M_END] / TICK_HZ / 60).toBeGreaterThan(15)
  })
})

describe('determinism', () => {
  const goldenFile = path.join(root, 'test', 'golden', 's1e-battle.json')
  const TICKS = 12000
  longIt(
    'ten minutes of s1e-battle give the committed golden hashes; the replay and a save round trip reproduce them',
    () => {
      const cr = compileRuleset(napoleonic)
      const run = record(battleData, cr, s1eBattle, 3, TICKS, () => {})
      const hashes = run.hashes.map(p => [p.tick, hex(p.hash)])
      if (process.env.UPDATE_GOLDEN) {
        fs.writeFileSync(
          goldenFile,
          JSON.stringify({ dataVersion: hex(battleData.version), ruleset: hex(cr.hash), ticks: TICKS, hashes }) + '\n',
        )
      }
      const golden = JSON.parse(fs.readFileSync(goldenFile, 'utf8'))
      expect([golden.dataVersion, golden.ruleset]).toEqual([hex(battleData.version), hex(cr.hash)])
      expect(hashes).toEqual(golden.hashes)
      expect(run.replay.log).toEqual([]) // the plan's commands are not logged
      expect(play(run.replay, battleData, cr, s1eBattle, run.hashes)).toBeNull()
      // a save taken mid-battle continues to the same hashes once the plan is attached again
      const w = makeWorld(battleData, cr, 3)
      attachScenario(w, s1eBattle)
      s1eBattle.setup(w)
      while (w.meta[M_TICK] < 5000) advanceTick(w)
      const w2 = deserialize(serialize(w), battleData, cr)
      attachScenario(w2, s1eBattle)
      while (w.meta[M_TICK] < 7000) {
        advanceTick(w)
        advanceTick(w2)
      }
      expect(hex(hashWorld(w2))).toBe(hex(hashWorld(w)))
      expect(formationSlot(w, unitHandle(8))).toBeGreaterThanOrEqual(0)
    },
  )
})
