// Commands at their edges (docs/systems/sim-spine.md, Commands): the refusals test/spine.test.ts and the system tests
// do not reach, each dropped with its reason and changing nothing, and how a command is quantised when it is stamped.
import { describe, it, expect } from 'vitest'
import {
  makeWorld,
  issue,
  advanceTick,
  serialize,
  deserialize,
  sectionHashes,
  quantiseCommand,
  makeHandle,
  formationHandle,
  KIND_FORMATION,
  MAX_FORMATIONS,
  M_FREE,
  PI,
  type Command,
  type World,
} from '../src/sim/index.ts'
import { data, shipped as cr } from './fx.ts'

const spawn = (side = 0, x = 0, z = 0): Command => ({
  type: 'debug-spawn',
  side,
  x,
  z,
  heading: 0,
  shape: 'line',
  men: 50,
})
// a world with a battalion on each side (slots 0 and 1), one tick in
function twoSides(): { w: World; a: number; b: number } {
  const w = makeWorld(data, cr, 2)
  issue(w, spawn(0, -60, 0))
  issue(w, spawn(1, -60, 150))
  advanceTick(w)
  return { w, a: formationHandle(w, 0), b: formationHandle(w, 1) }
}
// the reasons the commands are dropped for, applied in one tick. A refused command changes nothing: every section of
// the world but meta (the sequence number moves on) is as in a copy that ran the tick without them
function refusals(w: World, cmds: Command[], changes = false): string[] {
  const copy = deserialize(serialize(w), data, cr)
  for (const c of cmds) issue(w, c)
  const r = advanceTick(w)
  advanceTick(copy)
  const rest = (x: World) => sectionHashes(x).filter(([name]) => name !== 'meta')
  if (!changes) expect(rest(w)).toEqual(rest(copy))
  return r.dropped.map(d => d.reason)
}

describe('commands: refusals', () => {
  it('a spawn of an unknown type, a heading beyond 4π, a quality outside 0..1, an unknown fire mode', () => {
    const w = makeWorld(data, cr, 1)
    const why = refusals(w, [
      { ...spawn(), unit: 'elephant' } as Command,
      { ...spawn(), heading: 4 * PI + 0.01 } as Command,
      { ...spawn(), quality: 1.5 } as Command,
      { ...spawn(), quality: -0.25 } as Command,
      { ...spawn(), fire: 'by rank' } as Command,
      { ...spawn(), men: 0 } as Command,
    ])
    expect(why).toEqual([
      'no such unit type',
      'heading out of range',
      'no such quality',
      'no such quality',
      'no such fire mode',
      'no room for those men',
    ])
    expect(w.meta[M_FREE]).toBe(MAX_FORMATIONS)
    expect([...w.sides.spawned]).toEqual([0, 0])
  })
  it('a spawn past the last free slot is refused; the slots already taken stay', () => {
    const w = makeWorld(data, cr, 1)
    for (let k = 0; k <= MAX_FORMATIONS; k++) issue(w, { ...spawn(k & 1), men: 1 } as Command)
    expect(advanceTick(w).dropped.map(d => d.reason)).toEqual(['no free formation slot'])
    expect(w.meta[M_FREE]).toBe(0)
    expect(w.sides.spawned[0] + w.sides.spawned[1]).toBe(MAX_FORMATIONS)
  })
  it('a side command with no such side, or no direction', () => {
    const w = makeWorld(data, cr, 1)
    const rear = [...w.sides.rearX, ...w.sides.rearZ]
    const why = refusals(w, [
      { type: 'side', side: -1, x: 1, z: 0 },
      { type: 'side', side: 0, x: 0, z: 0 },
      { type: 'side', side: 1, x: NaN, z: 1 },
    ])
    expect(why).toEqual(['no such side', 'no such direction', 'no such direction'])
    expect([...w.sides.rearX, ...w.sides.rearZ]).toEqual(rear)
  })
  it('a side command sets a unit direction', () => {
    const w = makeWorld(data, cr, 1)
    expect(refusals(w, [{ type: 'side', side: 1, x: 3, z: -4 }], true)).toEqual([])
    expect([w.sides.rearX[1], w.sides.rearZ[1]]).toEqual([0.6, -0.8])
  })
  it('a move with no waypoints, a wheel past a full turn, a Retire beyond 1 km', () => {
    const { w, a } = twoSides()
    const why = refusals(w, [
      { type: 'move', id: a, points: [], append: false },
      { type: 'wheel', id: a, angle: 2 * PI + 0.01 },
      { type: 'wheel', id: a, angle: NaN },
      { type: 'retire', id: a, metres: 1000.5 },
      { type: 'retire', id: a, metres: 0 },
    ])
    expect(why).toEqual(['no waypoints', 'no such wheel', 'no such wheel', 'no such retreat', 'no such retreat'])
    expect(w.f.ordHead[0]).toBe(-1)
  })
  it('a fire command with an unknown mode, at a friend, or at a formation gone', () => {
    const { w, a, b } = twoSides()
    const gone = makeHandle(KIND_FORMATION, 5, 0)
    const why = refusals(w, [
      { type: 'fire', id: a, mode: 'volley' },
      { type: 'fire', id: a, mode: 'at will', target: a },
      { type: 'fire', id: a, mode: 'at will', target: gone },
    ])
    expect(why).toEqual(['no such fire mode', 'no such target', 'no such target'])
    expect(w.f.prefer[0]).toBe(0)
    expect(refusals(w, [{ type: 'fire', id: a, mode: 'hold', target: b }], true)).toEqual([])
    expect([w.f.fireMode[0], w.f.prefer[0]]).toEqual([1, b])
  })
  it('a debug kill of no men, and a debug morale outside 0..1', () => {
    const { w, a } = twoSides()
    const q = w.f.quality[0]
    expect(
      refusals(w, [
        { type: 'debug-kill', id: a, men: 0 },
        { type: 'debug-morale', id: a, quality: 1.01 },
        { type: 'debug-morale', id: a, quality: -0.5 },
      ]),
    ).toEqual(['no men', 'no such quality', 'no such quality'])
    expect(w.f.quality[0]).toBe(q)
  })
  it('a debug kill of more men than the formation has takes them all, and the formation is reaped', () => {
    const { w, a } = twoSides()
    expect(refusals(w, [{ type: 'debug-kill', id: a, men: 500 }], true)).toEqual([])
    expect(w.f.alive[0]).toBe(0)
    expect(w.meta[M_FREE]).toBe(MAX_FORMATIONS - 1)
  })
  it('a handle of another kind names no formation', () => {
    const { w } = twoSides()
    expect(refusals(w, [{ type: 'halt', id: makeHandle(2, 0, 0) }])).toEqual(['no such formation'])
  })
})

describe('commands: quantised when stamped', () => {
  it('positions to 1 cm, angles to 0.1 mrad, flags to booleans, ids to integers', () => {
    expect(
      quantiseCommand({ type: 'move', id: 7.9, points: [[1.234, -5.678]], append: 1 as unknown as boolean }),
    ).toEqual({ type: 'move', id: 7, points: [[1.23, -5.68]], append: true })
    expect(quantiseCommand({ type: 'wheel', id: 1, angle: 0.123456 })).toEqual({ type: 'wheel', id: 1, angle: 0.1235 })
    expect(quantiseCommand({ type: 'retire', id: 1, metres: 12.345 })).toEqual({ type: 'retire', id: 1, metres: 12.35 })
    expect(quantiseCommand({ type: 'side', side: 1, x: 0.70711, z: 0.70711 })).toEqual({
      type: 'side',
      side: 1,
      x: 0.7071,
      z: 0.7071,
    })
  })
  it("a fire command without a target targets none; a spawn without a quality takes the ruleset's", () => {
    expect(quantiseCommand({ type: 'fire', id: 1, mode: 'hold' })).toEqual({
      type: 'fire',
      id: 1,
      mode: 'hold',
      target: 0,
    })
    const w = makeWorld(data, cr, 1)
    issue(w, spawn())
    advanceTick(w)
    expect(w.f.quality[0]).toBe(cr.rs.morale.quality)
  })
  it('a move with too many or malformed waypoints is kept as given, to be dropped when applied', () => {
    const many = Array.from({ length: 65 }, (_, k): [number, number] => [k + 0.001, 0])
    const q = quantiseCommand({ type: 'move', id: 1, points: many, append: false })
    expect(q.type === 'move' && q.points).toBe(many)
  })
})
