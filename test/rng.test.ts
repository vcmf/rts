import { describe, it, expect } from 'vitest'
import { nextU32, seedRng, nextUnit, sampleCount } from '../src/sim/rng.ts'

describe('rng: xoshiro128**', () => {
  it('matches the reference outputs for state [1, 2, 3, 4]', () => {
    // from the reference C algorithm (Blackman & Vigna), recomputed in Python for this test
    const s = new Uint32Array([1, 2, 3, 4])
    const out = Array.from({ length: 10 }, () => nextU32(s))
    expect(out).toEqual([
      11520, 0, 5927040, 70819200, 2031721883, 1637235492, 1287239034, 3734860849, 3729100597, 4258142804,
    ])
  })
  it('seeds deterministically and differently for nearby seeds', () => {
    const a = new Uint32Array(4)
    const b = new Uint32Array(4)
    const c = new Uint32Array(4)
    seedRng(a, 7)
    seedRng(b, 7)
    seedRng(c, 8)
    expect([...a]).toEqual([...b])
    expect([...a]).not.toEqual([...c])
  })
  it('sampleCount averages its expected value', () => {
    const s = new Uint32Array(4)
    seedRng(s, 1)
    for (const lambda of [0.3, 2.5, 40]) {
      let sum = 0
      for (let k = 0; k < 20000; k++) sum += sampleCount(s, lambda)
      expect(Math.abs(sum / 20000 - lambda)).toBeLessThan(0.05 * lambda + 0.02)
    }
    expect(nextUnit(s)).toBeLessThan(1)
  })
})
