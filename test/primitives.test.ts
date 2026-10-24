// The spine's small parts at their edges: the keyed random streams, handles and their generations, bit sets, the
// exact-ops maths at its boundaries, the state hash's reference values and the data loader's refusals. The tests
// may use Math.*: they check the sim's own functions against it.
import { describe, it, expect } from 'vitest'
import {
  seedRng,
  nextU32,
  nextUnit,
  nextInt,
  sampleCount,
  keyedStream,
  makeHandle,
  handleKind,
  handleIndex,
  handleGen,
  KIND_FORMATION,
  MAX_INDEX,
  formationSlot,
  formationHandle,
  issue,
  advanceTick,
  makeWorld,
  atan2,
  wrapAngle,
  exp,
  sin,
  cos,
  quantise,
  assertFinite,
  NonFiniteState,
  PI,
  TRIG_DOMAIN,
  fnv1a,
  loadSimData,
  speedFactorAt,
  DATA_MAGIC,
  secondsToTicks,
  type RngState,
} from '../src/sim/index.ts'
import { mkBits, setBit, hasBit, anyBit, anyNew, minus } from '../src/sim/bits.ts'
import { data, dataBytes, shipped as cr } from './fx.ts'

const draws = (s: RngState, n: number): number[] => Array.from({ length: n }, () => nextU32(s))

describe('rng: the keyed streams', () => {
  it('the same key gives the same stream; each part of the key gives another', () => {
    const key = [7, 100, 3, 2, 1] as const
    const a = draws(keyedStream(new Uint32Array(4), ...key), 8)
    expect(draws(keyedStream(new Uint32Array(4), ...key), 8)).toEqual(a)
    for (let p = 0; p < key.length; p++) {
      const k = [...key] as [number, number, number, number, number]
      k[p] += 1
      expect(draws(keyedStream(new Uint32Array(4), ...k), 8), `part ${p}`).not.toEqual(a)
    }
  })
  it('a keyed draw leaves the world stream alone', () => {
    const world = new Uint32Array(4)
    seedRng(world, 9)
    const before = [...world]
    const k = keyedStream(new Uint32Array(4), 9, 1, 2, 3, 4)
    draws(k, 100)
    expect([...world]).toEqual(before)
  })
  it('swapped key parts give other streams (the key is ordered, not a sum)', () => {
    const a = draws(keyedStream(new Uint32Array(4), 1, 2, 3, 4, 5), 4)
    expect(draws(keyedStream(new Uint32Array(4), 1, 3, 2, 4, 5), 4)).not.toEqual(a)
    expect(draws(keyedStream(new Uint32Array(4), 2, 1, 3, 4, 5), 4)).not.toEqual(a)
  })
})

describe('rng: the draws', () => {
  it('nextInt stays in [0, n) and reaches both ends', () => {
    const s = new Uint32Array(4)
    seedRng(s, 3)
    const seen = new Set<number>()
    for (let k = 0; k < 5000; k++) {
      const v = nextInt(s, 7)
      expect(Number.isInteger(v) && v >= 0 && v < 7).toBe(true)
      seen.add(v)
    }
    expect(seen.size).toBe(7)
  })
  it('nextUnit is below 1 at the largest output, 2^32 − 1', () => {
    // the output is rotl(s1 · 5, 7) · 9: s1 = 0x831c71c7 makes it 0xffffffff (solved with the inverses of 9 and 5)
    const s = new Uint32Array([1, 0x831c71c7, 2, 3])
    expect(nextU32(new Uint32Array(s))).toBe(0xffffffff)
    const u = nextUnit(s)
    expect(u).toBeLessThan(1)
    expect(u).toBe(0xffffffff / 4294967296)
  })
  it('sampleCount: nothing for λ ≤ 0, without a draw; never negative', () => {
    const s = new Uint32Array(4)
    seedRng(s, 5)
    const before = [...s]
    expect([sampleCount(s, 0), sampleCount(s, -3)]).toEqual([0, 0])
    expect([...s]).toEqual(before)
    for (let k = 0; k < 2000; k++) expect(sampleCount(s, 1.2)).toBeGreaterThanOrEqual(0)
  })
  it('sampleCount: a NaN or infinite λ passes through as NaN, without a draw (#158)', () => {
    const s = new Uint32Array(4)
    seedRng(s, 5)
    const before = [...s]
    expect([sampleCount(s, NaN), sampleCount(s, Infinity), sampleCount(s, -Infinity)]).toEqual([NaN, NaN, NaN])
    expect([...s]).toEqual(before)
  })
  it('edge seeds (0, −1, 2^31 − 1, 2^32 − 1, 2^32) give a nonzero state and a moving stream', () => {
    // (seedRng's guard against the all-zero state, xoshiro's fixed point, needs a seed whose four splitmix words are
    // all zero: none is known, so the guard itself is not reached here)
    for (const seed of [0, -1, 0x7fffffff, 0xffffffff, 2 ** 32]) {
      const s = new Uint32Array(4)
      seedRng(s, seed)
      expect(
        s.some(v => v !== 0),
        `seed ${seed}`,
      ).toBe(true)
      expect(new Set(draws(s, 4)).size, `seed ${seed}`).toBeGreaterThan(1)
    }
  })
})

describe('handles', () => {
  it('kind, index and generation round-trip at their limits, and a handle is never negative', () => {
    for (const [kind, index, gen] of [
      [KIND_FORMATION, 0, 0],
      [KIND_FORMATION, MAX_INDEX - 1, (1 << 19) - 1],
      [7, 511, 12345],
    ]) {
      const h = makeHandle(kind, index, gen)
      expect([handleKind(h), handleIndex(h), handleGen(h)]).toEqual([kind, index, gen])
      expect(h).toBeGreaterThanOrEqual(0)
    }
  })
  it('a generation wraps after 2^19 reuses of a slot: the handle stays valid for the new one only', () => {
    const w = makeWorld(data, cr, 1)
    w.f.gen[0] = (1 << 19) - 1 // the last generation before the wrap
    issue(w, { type: 'debug-spawn', side: 0, x: 0, z: 0, heading: 0, shape: 'line', men: 5 })
    advanceTick(w)
    const old = formationHandle(w, 0)
    issue(w, { type: 'debug-kill', id: old, men: 5 })
    advanceTick(w)
    expect(w.f.gen[0]).toBe(0)
    issue(w, { type: 'debug-spawn', side: 0, x: 0, z: 0, heading: 0, shape: 'line', men: 5 })
    advanceTick(w)
    expect(formationSlot(w, old)).toBe(-1)
    expect(formationSlot(w, formationHandle(w, 0))).toBe(0)
  })
})

describe('bit sets', () => {
  it('set, test, any, any-new and minus across word boundaries', () => {
    const a = mkBits(70)
    const b = mkBits(70)
    expect(a.length).toBe(3)
    expect(anyBit(a)).toBe(false)
    for (const j of [0, 31, 32, 69]) setBit(a, j)
    expect([0, 1, 31, 32, 33, 69].map(j => hasBit(a, j))).toEqual([true, false, true, true, false, true])
    setBit(b, 31)
    expect(anyNew(a, b)).toBe(true)
    expect(anyNew(b, a)).toBe(false)
    const out = minus(a, b, mkBits(70))
    expect([0, 31, 32, 69].map(j => hasBit(out, j))).toEqual([true, false, true, true])
    minus(a, a, a) // in place
    expect(anyBit(a)).toBe(false)
  })
})

describe('num at its boundaries', () => {
  it('atan2: +0 at the origin and on the positive x axis, +π on the negative one, whatever the sign of zero', () => {
    expect(Object.is(atan2(0, 1), 0)).toBe(true)
    expect(Object.is(atan2(-0, 1), 0)).toBe(true) // #157
    expect(Object.is(atan2(-0, 0), 0)).toBe(true)
    expect(atan2(0, NaN)).toBeNaN()
    expect(Object.is(atan2(-5e-324, 2), 0)).toBe(true) // the ratio underflows to −0
    expect(Object.is(atan2(0, 0), 0)).toBe(true)
    expect(Object.is(atan2(-0, -0), 0)).toBe(true)
    expect(atan2(0, -1)).toBe(PI)
    expect(atan2(-0, -1)).toBe(PI)
    expect(atan2(1, 0)).toBe(PI / 2)
    expect(atan2(-1, 0)).toBe(-PI / 2)
    expect(atan2(1e-300, -1)).toBeCloseTo(PI, 15)
  })
  it('wrapAngle: −π becomes π, π stays, a full turn becomes 0; a NaN passes through', () => {
    expect(wrapAngle(-PI)).toBe(PI)
    expect(wrapAngle(PI)).toBe(PI)
    expect(wrapAngle(2 * PI)).toBe(0)
    expect(wrapAngle(-3 * PI)).toBe(PI)
    expect(wrapAngle(NaN)).toBeNaN()
    for (let k = -50; k <= 50; k++) {
      const v = wrapAngle(k * 0.7)
      expect(v > -PI && v <= PI).toBe(true)
    }
  })
  it('sin and cos at the edge of their domain: exact inside, refused just outside, NaN passes', () => {
    expect(Math.abs(sin(TRIG_DOMAIN) - Math.sin(TRIG_DOMAIN))).toBeLessThan(1e-9)
    expect(() => cos(TRIG_DOMAIN * 1.0001)).toThrow(RangeError)
    expect(() => sin(-Infinity)).toThrow(RangeError)
    expect(sin(NaN)).toBeNaN()
  })
  it('exp: 1 at 0, exact doublings, NaN passes, ±700 the bounds', () => {
    expect(exp(0)).toBe(1)
    expect(exp(Math.LN2 * 10) / 1024).toBeCloseTo(1, 14)
    expect(exp(NaN)).toBeNaN()
    expect(exp(700)).toBeGreaterThan(1e304)
    expect(exp(-700)).toBeGreaterThan(0)
    expect(() => exp(700.0001)).toThrow(RangeError)
  })
  it('quantise rounds half a centimetre up, toward +∞, the same on both sides of zero; zero is +0', () => {
    expect(quantise(0.005)).toBe(0.01)
    // +0, not the −0 Math.round gives (#157)
    expect(Object.is(quantise(-0.005), 0)).toBe(true)
    expect(Object.is(quantise(-0), 0)).toBe(true)
    expect(quantise(1.004)).toBe(1)
    expect(quantise(-2.0049)).toBe(-2)
  })
  it('assertFinite names the array and the index of the first bad value', () => {
    expect(() => assertFinite('x', new Float64Array([0, 1, Infinity, NaN]))).toThrow(
      new NonFiniteState('x[2] = Infinity'),
    )
    expect(() => assertFinite('x', new Float64Array([0, -1e308]))).not.toThrow()
  })
  it('secondsToTicks rounds to the nearest tick', () => {
    expect([secondsToTicks(1), secondsToTicks(0.024), secondsToTicks(0.026), secondsToTicks(2.5)]).toEqual([
      20, 0, 1, 50,
    ])
  })
})

describe('the state hash', () => {
  it('is 32-bit FNV-1a: its reference values', () => {
    const b = (s: string) => new TextEncoder().encode(s)
    expect(fnv1a(b(''))).toBe(0x811c9dc5)
    expect(fnv1a(b('a'))).toBe(0xe40c292c)
    expect(fnv1a(b('foobar'))).toBe(0xbf9cf968)
  })
  it('chains: the hash of a whole is the hash of its second part seeded by the first', () => {
    const all = new Uint8Array([1, 2, 3, 4, 5, 6])
    expect(fnv1a(all.subarray(3), fnv1a(all.subarray(0, 3)))).toBe(fnv1a(all))
  })
})

describe('the sim data loader', () => {
  const good = dataBytes()
  it('refuses another magic or format, and trailing bytes', () => {
    const bad = good.slice()
    new DataView(bad.buffer).setUint32(0, DATA_MAGIC + 1, true)
    expect(() => loadSimData(bad)).toThrow(/not a sim data file/)
    const fmt = good.slice()
    new DataView(fmt.buffer).setUint32(4, 99, true)
    expect(() => loadSimData(fmt)).toThrow(/not a sim data file/)
    const longer = new Uint8Array(good.length + 2)
    longer.set(good)
    expect(() => loadSimData(longer)).toThrow(/trailing bytes/)
  })
  it('reads a file from a view into a larger buffer (a byte offset) the same', () => {
    const big = new Uint8Array(good.length + 16)
    big.set(good, 8)
    const d = loadSimData(big.subarray(8, 8 + good.length))
    expect(d.version).toBe(data.version)
    expect([...d.height.h.slice(0, 50)]).toEqual([...data.height.h.slice(0, 50)])
    expect(d.classes).toEqual(data.classes)
  })
  it('the speed factor is 0 outside the cost grid, on every side', () => {
    const c = data.cost
    const e = c.cell * c.nx
    const mid = c.x0 + e / 2
    expect(speedFactorAt(data, c.x0 - 0.01, mid)).toBe(0)
    expect(speedFactorAt(data, mid, c.z0 - 0.01)).toBe(0)
    expect(speedFactorAt(data, c.x0 + e + 0.01, mid)).toBe(0)
    expect(speedFactorAt(data, mid, c.z0 + c.cell * c.nz + 0.01)).toBe(0)
    expect(speedFactorAt(data, mid, mid)).toBeGreaterThanOrEqual(0)
    expect(speedFactorAt(data, mid, mid)).toBeLessThanOrEqual(1)
  })
})
