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
  normaliseCommand,
  makeHandle,
  formationHandle,
  KIND_FORMATION,
  MAX_FORMATIONS,
  M_FREE,
  M_SEQ,
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
// the reasons the commands are dropped for, applied in one tick. A refused command changes nothing: the world is as a
// copy that ran the tick without them, every section and every meta word but the sequence number (it moves on)
function refusals(w: World, cmds: Command[], changes = false): string[] {
  const copy = deserialize(serialize(w), data, cr)
  for (const c of cmds) issue(w, c)
  const r = advanceTick(w)
  advanceTick(copy)
  const rest = (x: World) => sectionHashes(x).filter(([name]) => name !== 'meta')
  const meta = (x: World) => [...x.meta].map((v, k) => (k === M_SEQ ? 0 : v))
  if (!changes) {
    expect(rest(w)).toEqual(rest(copy))
    expect(meta(w)).toEqual(meta(copy))
  }
  return r.dropped.map(d => d.reason)
}

describe('commands: refusals', () => {
  it('a spawn of an unknown type, a heading beyond 4π, a level outside 1..6, a negative bar, an unknown fire mode', () => {
    const w = makeWorld(data, cr, 1)
    const why = refusals(w, [
      { ...spawn(), unit: 'elephant' } as Command,
      { ...spawn(), heading: 4 * PI + 0.01 } as Command,
      { ...spawn(), level: 7 } as Command,
      { ...spawn(), bar: -0.25 } as Command,
      { ...spawn(), fire: 'by rank' } as Command,
      { ...spawn(), men: 0 } as Command,
    ])
    expect(why).toEqual([
      'no such unit type',
      'heading out of range',
      'no such level',
      'no such bar',
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
    expect(why).toEqual(['no such side', 'no such direction', 'malformed command']) // NaN: refused when issued
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
    // (no waypoints and a NaN angle are refused when issued)
    expect(why).toEqual(['no waypoints', 'no such wheel', 'malformed command', 'no such retreat', 'no such retreat'])
    expect(w.f.ordHead[0]).toBe(-1)
  })
  it('a fire command with an unknown mode, at a friend, or at a slot never filled', () => {
    const { w, a, b } = twoSides()
    const empty = makeHandle(KIND_FORMATION, 5, 0)
    const why = refusals(w, [
      { type: 'fire', id: a, mode: 'volley' },
      { type: 'fire', id: a, mode: 'at will', target: a },
      { type: 'fire', id: a, mode: 'at will', target: empty },
    ])
    expect(why).toEqual(['no such fire mode', 'no such target', 'no such target'])
    expect(w.f.prefer[0]).toBe(0)
    expect(refusals(w, [{ type: 'fire', id: a, mode: 'hold', target: b }], true)).toEqual([])
    expect([w.f.fireMode[0], w.f.prefer[0]]).toEqual([1, b])
  })
  it('a fire command at a stale handle: the enemy killed and its slot filled again by another', () => {
    const { w, a, b } = twoSides()
    refusals(w, [{ type: 'debug-kill', id: b, men: 50 }], true)
    refusals(w, [spawn(1, -60, 150)], true)
    expect(w.f.alive[1]).toBe(1)
    const fresh = formationHandle(w, 1)
    expect(fresh).not.toBe(b)
    expect(refusals(w, [{ type: 'fire', id: a, mode: 'at will', target: b }])).toEqual(['no such target'])
    expect(refusals(w, [{ type: 'fire', id: a, mode: 'at will', target: fresh }], true)).toEqual([])
    expect(w.f.prefer[0]).toBe(fresh)
  })
  it('a debug kill of no men, and a debug morale with no number for the bar', () => {
    const { w, a } = twoSides()
    const b = w.f.bar[0]
    expect(
      refusals(w, [
        { type: 'debug-kill', id: a, men: 0 },
        { type: 'debug-morale', id: a, bar: Infinity },
      ]),
    ).toEqual(['no men', 'malformed command'])
    expect(w.f.bar[0]).toBe(b)
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
  it('an angle or a position that rounds to zero is +0, not −0 (#157)', () => {
    const wheel = quantiseCommand({ type: 'wheel', id: 1, angle: -0.00001 }) as { angle: number }
    const side = quantiseCommand({ type: 'side', side: 1, x: -0.00001, z: -0 }) as { x: number; z: number }
    const spawn = quantiseCommand({
      type: 'debug-spawn',
      side: 0,
      x: -0.004,
      z: 1,
      heading: -0.00001,
      men: 10,
    }) as { x: number; heading: number }
    for (const v of [wheel.angle, side.x, side.z, spawn.x, spawn.heading]) expect(Object.is(v, 0)).toBe(true)
  })
  it("a fire command without a target targets none; a spawn without a level takes the ruleset's, with its bar", () => {
    expect(quantiseCommand({ type: 'fire', id: 1, mode: 'hold' })).toEqual({
      type: 'fire',
      id: 1,
      mode: 'hold',
      target: 0,
    })
    const w = makeWorld(data, cr, 1)
    issue(w, spawn())
    advanceTick(w)
    expect([w.f.level[0], w.f.barMax[0], w.f.bar[0]]).toEqual([cr.rs.morale.level, 100, 100])
  })
  it('a move with no, too many or malformed waypoints is refused when issued, with why', () => {
    const many = Array.from({ length: 65 }, (_, k): [number, number] => [k + 0.001, 0])
    const move = (points: unknown) => normaliseCommand({ type: 'move', id: 1, points, append: false })
    expect([move([]), move(many), move([[1, 2], , [3, 4]]), move([[1, '2']])]).toEqual(
      ['no waypoints', 'too many waypoints', 'malformed waypoints', 'malformed waypoints'].map(reason => ({
        type: 'refused',
        reason,
      })),
    )
  })
})
