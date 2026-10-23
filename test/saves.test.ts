// Saves at their edges (docs/systems/sim-spine.md, Serializer): every command type crosses a save field by field, a
// save of a save is the same bytes, a loaded world goes on exactly from any tick of a fight, and a damaged save is
// refused with a reason. test/spine.test.ts covers the drill's save in the middle of a change.
import { describe, it, expect } from 'vitest'
import {
  makeWorld,
  issue,
  advanceTick,
  serialize,
  deserialize,
  hashWorld,
  sectionHashes,
  makeHandle,
  KIND_FORMATION,
  COMMAND_TYPES,
  M_TICK,
  type Command,
  type World,
} from '../src/sim/index.ts'
import { chargeFight } from '../src/scenarios/s1d-charge.ts'
import { data, shipped as cr, OPEN_DATA, openBattlefield } from './fx.ts'

const h = (slot: number) => makeHandle(KIND_FORMATION, slot, 0)

// one command of each type, every field away from its default, so a field the save forgets shows
const ONE_OF_EACH: Record<(typeof COMMAND_TYPES)[number], Command> = {
  move: {
    type: 'move',
    id: h(3),
    points: [
      [1.25, -2.5],
      [30, 40.75],
    ],
    append: true,
  },
  form: { type: 'form', id: h(1), shape: 'column' },
  wheel: { type: 'wheel', id: h(1), angle: -0.6 },
  face: { type: 'face', id: h(2) },
  retire: { type: 'retire', id: h(2), metres: 17.5 },
  halt: { type: 'halt', id: h(4) },
  style: { type: 'style', id: h(1), preset: 'push' },
  fire: { type: 'fire', id: h(1), mode: 'hold', target: h(5) },
  side: { type: 'side', side: 1, x: 0.6, z: -0.8 },
  'debug-spawn': {
    type: 'debug-spawn',
    side: 1,
    x: -12.5,
    z: 33.25,
    heading: 1.25,
    shape: 'square',
    men: 77,
    quality: 0.55,
    fire: 'hold',
    unit: 'infantry',
  },
  'debug-kill': { type: 'debug-kill', id: h(6), men: 9 },
  'debug-morale': { type: 'debug-morale', id: h(6), quality: 0.3 },
  charge: { type: 'charge', id: h(7), target: h(8) },
}

// two regiments charging each other on open, level ground (seed 5): they close until about tick 760, fight in melee
// until about 1000, one pursues, both rout. A world of it run to tick n
const charge = chargeFight('cavalry')
function chargeAt(n: number): World {
  const w = makeWorld(OPEN_DATA, cr, 5, true, openBattlefield())
  charge.setup(w)
  while (w.meta[M_TICK] < n) advanceTick(w)
  return w
}
const load = (w: World): World => deserialize(serialize(w), OPEN_DATA, cr, true, openBattlefield())

describe('saves: what crosses', () => {
  it('a pending command of every type crosses a save with every field', () => {
    const w = makeWorld(data, cr, 1)
    for (const t of COMMAND_TYPES) issue(w, ONE_OF_EACH[t])
    expect(w.pending.map(s => s.cmd.type)).toEqual([...COMMAND_TYPES])
    const loaded = deserialize(serialize(w), data, cr)
    expect(loaded.pending).toEqual(w.pending)
  })
  it('a save of a loaded save is the same bytes', () => {
    const w = chargeAt(100)
    issue(w, ONE_OF_EACH.move)
    const bytes = serialize(w)
    expect(serialize(deserialize(bytes, OPEN_DATA, cr, true, openBattlefield()))).toEqual(bytes)
  })
  it('the hash is the hash of the save: equal worlds hash equal, section by section', () => {
    const a = chargeAt(100)
    const b = chargeAt(100)
    expect(hashWorld(a)).toBe(hashWorld(b))
    expect(sectionHashes(load(a))).toEqual(sectionHashes(a))
  })
})

describe('saves: a loaded world goes on exactly', () => {
  it('saved while closing, in melee, in pursuit and in the rout, it gives the same hashes for 10 s more', () => {
    // one battle, a copy loaded from a save at each point and run beside it for 200 ticks
    const w = chargeAt(0)
    const phases: string[] = []
    for (const at of [1, 400, 800, 1000, 1200]) {
      while (w.meta[M_TICK] < at) advanceTick(w)
      phases.push(`${w.f.chPhase[0]}${w.f.chPhase[1]}${w.f.foe[0] ? ' melee' : ''}`)
      const c = load(w)
      for (let k = 0; k < 200; k++) {
        const a = advanceTick(w)
        const b = advanceTick(c)
        expect(b.dropped, `saved at ${at}, tick ${a.tick}`).toEqual(a.dropped)
        if (a.hash !== null) expect(b.hash, `saved at ${at}, tick ${a.tick}`).toBe(a.hash)
      }
      expect(hashWorld(c), `saved at ${at}`).toBe(hashWorld(w))
    }
    // the saves fell in each phase: both closing (CH_CLOSING 1), in melee, one pursuing (CH_PURSUIT 3)
    expect(phases[0]).toBe('11')
    expect(phases.some(p => p.endsWith(' melee'))).toBe(true)
    expect(phases.some(p => p.includes('3'))).toBe(true)
  })
})

describe('saves: refusals', () => {
  const good = serialize(chargeAt(20))
  it('refuses bytes that are not a save of this format', () => {
    const other = good.slice()
    other[0] ^= 0xff
    expect(() => deserialize(other, OPEN_DATA, cr)).toThrow(/not a save of this format/)
    const later = good.slice()
    later[4] += 1 // the format word
    expect(() => deserialize(later, OPEN_DATA, cr)).toThrow(/not a save of this format/)
  })
  it('refuses a truncated save and one with trailing bytes', () => {
    expect(() => deserialize(good.slice(0, good.length - 3), OPEN_DATA, cr)).toThrow()
    expect(() => deserialize(good.slice(0, 200), OPEN_DATA, cr)).toThrow()
    const longer = new Uint8Array(good.length + 1)
    longer.set(good)
    expect(() => deserialize(longer, OPEN_DATA, cr)).toThrow(/trailing bytes/)
  })
  it('refuses a save whose table has another length (another sim version)', () => {
    const w = chargeAt(1)
    const bytes = serialize(w)
    // the first array after the header is meta: its length word
    const v = new DataView(bytes.buffer)
    v.setUint32(8, v.getUint32(8, true) + 1, true)
    expect(() => deserialize(bytes, OPEN_DATA, cr)).toThrow(/array length/)
  })
})
