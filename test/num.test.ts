import { describe, it, expect } from 'vitest'
import { sin, cos, atan2, wrapAngle, quantise, PI, TRIG_DOMAIN, exp } from '../src/sim/num.ts'

// the test may use Math.*: it checks the sim's own functions against them
describe('num: exact-ops trigonometry', () => {
  it('sin and cos within 1e-12 of Math over several turns', () => {
    let worst = 0
    for (let k = 0; k <= 200000; k++) {
      const x = -8 * PI + (16 * PI * k) / 200000
      worst = Math.max(worst, Math.abs(sin(x) - Math.sin(x)), Math.abs(cos(x) - Math.cos(x)))
    }
    expect(worst).toBeLessThan(1e-12)
  })
  it('atan2 within 1e-12 of Math in every quadrant and on the axes', () => {
    let worst = 0
    for (let k = 0; k < 4000; k++) {
      const a = -PI + (2 * PI * k) / 4000
      for (const r of [1e-6, 0.3, 1, 250]) {
        const x = r * Math.cos(a)
        const y = r * Math.sin(a)
        worst = Math.max(worst, Math.abs(atan2(y, x) - Math.atan2(y, x)))
      }
    }
    for (const [y, x] of [
      [0, 1],
      [1, 0],
      [0, -1],
      [-1, 0],
      [1, 1],
      [-1, -1],
      [1e-300, -1],
      [-1e-300, -1],
    ]) {
      worst = Math.max(worst, Math.abs(atan2(y, x) - Math.atan2(y, x)))
    }
    expect(worst).toBeLessThan(1e-12)
    expect(atan2(0, 0)).toBe(0)
    expect(atan2(-0, -1)).toBe(PI) // documented: (−π, π], unlike Math
  })
  it('exp within 1e-14 (relative) of Math over the range the sim uses, and refuses beyond ±700', () => {
    let worst = 0
    for (let k = 0; k <= 20000; k++) {
      const x = -40 + (60 * k) / 20000
      worst = Math.max(worst, Math.abs(exp(x) - Math.exp(x)) / Math.exp(x))
    }
    expect(worst).toBeLessThan(1e-14)
    expect(exp(0)).toBe(1)
    expect(() => exp(800)).toThrow(RangeError)
  })
  it('refuses arguments outside its exact domain', () => {
    expect(() => sin(TRIG_DOMAIN * 2)).toThrow(RangeError)
    expect(() => wrapAngle(-1e12)).toThrow(RangeError)
    expect(Math.abs(sin(TRIG_DOMAIN * 0.999) - Math.sin(TRIG_DOMAIN * 0.999))).toBeLessThan(1e-9)
    expect(Number.isNaN(sin(NaN))).toBe(true)
  })
  it('wrapAngle lands in (−π, π] and quantise rounds to centimetres', () => {
    for (const a of [-7, -PI, PI, 3 * PI, 100.5]) {
      const w = wrapAngle(a)
      expect(w).toBeGreaterThan(-PI)
      expect(w).toBeLessThanOrEqual(PI)
      expect(Math.abs(Math.sin(w) - Math.sin(a))).toBeLessThan(1e-9)
    }
    expect(quantise(12.3456)).toBe(12.35)
    // +0 (#157)
    expect(quantise(-0.004)).toBe(0)
  })
})
