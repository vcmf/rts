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
  MS_ROUTING,
  normaliseCommand,
  record,
  play,
  REFUSALS,
  type Command,
  type Stamped,
  type World,
} from '../src/sim/index.ts'
import { chargeFight } from '../src/scenarios/s1d-charge.ts'
import { s1aDrill } from '../src/scenarios/s1a-drill.ts'
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

// commands that are not what they claim: each field of each type given, in turn, something it is not (a number as a
// string, a sparse array, a getter that throws, a Proxy that throws), and things that are no command at all
const throwing = Object.defineProperty({}, 'x', {
  get() {
    throw new Error('read')
  },
}) as { x: unknown }
const trap = new Proxy([[1, 2]], {
  get(t, k) {
    if (k === '0') throw new Error('trap')
    return Reflect.get(t, k)
  },
})
const JUNK: unknown[] = [
  { type: 'nonsense', id: h(1) },
  null,
  7,
  { type: 'refused', reason: 'because' },
  { type: 'refused', reason: 'malformed waypoints' },
  Object.defineProperty({}, 'type', {
    get() {
      throw new Error('read')
    },
  }),
  new Proxy(
    { type: 'halt', id: h(1) },
    {
      get() {
        throw new Error('trap')
      },
    },
  ),
  { type: 'move', id: h(1), points: [[1, 2], , [3, 4]], append: false },
  { type: 'move', id: h(1), points: new Array(3), append: false },
  { type: 'move', id: h(1), points: [], append: false },
  { type: 'move', id: h(1), points: Array.from({ length: 65 }, (_, k) => [k, 0]), append: false },
  { type: 'move', id: h(1), points: trap, append: false },
  { type: 'form', id: h(1), shape: '\udc00' },
  ...[NaN, -1, 'x', 1.5].map(length => ({
    type: 'move',
    id: h(1),
    points: new Proxy([[1, 2]], { get: (t, k) => (k === 'length' ? length : Reflect.get(t, k)) }),
    append: false,
  })),
  { ...ONE_OF_EACH['debug-kill'], men: 4294967301 },
  { ...ONE_OF_EACH.side, side: 2 ** 32 },
  { ...ONE_OF_EACH.halt, id: 2.9 },
  { ...ONE_OF_EACH.wheel, angle: 1e305 },
  { ...ONE_OF_EACH['debug-spawn'], x: 1e307 },
  { ...ONE_OF_EACH.move, points: [[1e305, 0]] },
]
for (const t of COMMAND_TYPES) {
  for (const k of Object.keys(ONE_OF_EACH[t]).filter(k => k !== 'type')) {
    for (const v of [null, '5', 'x', NaN, -Infinity, {}, [[1, 'x']], [[1]], BigInt(1), throwing]) {
      const c = { ...ONE_OF_EACH[t], [k]: v }
      JUNK.push(v === throwing ? Object.defineProperty(c, k, { get: () => throwing.x }) : c)
    }
  }
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
  it('a malformed command is stamped as refused: every queued one saves, loads and drops the same (#155)', () => {
    const w = chargeAt(100)
    const log: Stamped[] = []
    for (const c of JUNK) issue(w, c as Command, log)
    expect(log).toEqual(w.pending)
    const bytes = serialize(w)
    const loaded = load(w)
    expect(loaded.pending).toEqual(w.pending)
    expect(serialize(loaded)).toEqual(bytes)
    expect(hashWorld(loaded)).toBe(hashWorld(w))
    const [a, b] = [advanceTick(w), advanceTick(loaded)]
    expect(b.dropped).toEqual(a.dropped)
    expect(hashWorld(loaded)).toBe(hashWorld(w))
    const reasons = new Set(a.dropped.map(d => d.reason))
    for (const r of REFUSALS) expect(reasons).toContain(r)
  })
  it('a queued command is canonical: normalised again it is the same, and re-issued it is the same (#155)', () => {
    for (const c of [...Object.values(ONE_OF_EACH), ...JUNK, { type: 'debug-spawn', side: 0, x: 0, z: 0 }]) {
      const n = normaliseCommand(c)
      expect(normaliseCommand(n)).toEqual(n)
      expect(normaliseCommand(structuredClone(n))).toEqual(n)
    }
    const spawn = normaliseCommand({ type: 'debug-spawn', side: 0, x: 1, z: 2, heading: 0, men: 10 })
    expect(spawn).toMatchObject({ quality: -1, shape: '', fire: 'at will', unit: '' })
  })
  it('a save with a command that is not canonical refuses it when loaded, as issue would', () => {
    const w = makeWorld(data, cr, 1)
    w.pending.push({ tick: 1, seq: 0, cmd: { type: 'wheel', id: h(1), angle: NaN } })
    expect(deserialize(serialize(w), data, cr).pending[0].cmd).toEqual({ type: 'refused', reason: 'malformed command' })
  })
  it('a number past the bound, a count or a handle that is not an int32, is malformed', () => {
    const bad = [
      { ...ONE_OF_EACH['debug-kill'], men: 4294967301 },
      { ...ONE_OF_EACH.side, side: 2 ** 32 },
      { ...ONE_OF_EACH.halt, id: 2.9 },
      { ...ONE_OF_EACH.wheel, angle: 1e305 },
      { ...ONE_OF_EACH['debug-spawn'], x: 1e307 },
    ]
    for (const c of bad) expect(normaliseCommand(c)).toEqual({ type: 'refused', reason: 'malformed command' })
    const far = normaliseCommand({ ...ONE_OF_EACH.move, points: [[1e305, 0]] })
    expect(far).toEqual({ type: 'refused', reason: 'malformed waypoints' })
  })
  it('a string with a lone surrogate is queued as the save holds it', () => {
    const w = makeWorld(data, cr, 1)
    issue(w, { type: 'form', id: h(1), shape: 'col\ud800umn' })
    expect(w.pending[0].cmd).toEqual({ type: 'form', id: h(1), shape: 'col\ufffdumn' })
    expect(deserialize(serialize(w), data, cr).pending).toEqual(w.pending)
  })
  it('a recorded run with malformed commands plays back with no mismatch', () => {
    const run = record(data, cr, s1aDrill, 3, 60, (w, external) => {
      if (w.meta[M_TICK] === 10) for (const c of JUNK) external(c as Command)
    })
    const back = JSON.parse(JSON.stringify(run)) as typeof run
    expect(play(back.replay, data, cr, s1aDrill, back.hashes)).toBeNull()
  })
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
    const routing: boolean[] = []
    for (const at of [1, 400, 800, 1000, 1200]) {
      while (w.meta[M_TICK] < at) advanceTick(w)
      phases.push(`${w.f.chPhase[0]}${w.f.chPhase[1]}${w.f.foe[0] ? ' melee' : ''}`)
      routing.push(w.f.mstate[0] === MS_ROUTING || w.f.mstate[1] === MS_ROUTING)
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
    expect(routing.at(-1)).toBe(true)
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
    // cut in the last word (the pending commands' count) the reader runs off its view; cut in a table, the copy refuses
    expect(() => deserialize(good.slice(0, good.length - 3), OPEN_DATA, cr)).toThrow(RangeError)
    expect(() => deserialize(good.slice(0, 200), OPEN_DATA, cr)).toThrow(/save is truncated/)
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
