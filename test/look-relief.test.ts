// The relief's painted tone (src/look/relief.ts): flat ground takes none, a slope turned to the sun is lighter and one
// turned away darker, a crest lighter and a valley darker; the blur keeps a flat field flat.
import { describe, expect, it } from 'vitest'
import { blur, reliefField, RELIEF_CELL } from '../src/look/relief.ts'

const SUN: [number, number, number] = (() => {
  const v = [-0.7, 0.45, 0.55]
  const l = Math.hypot(...v)
  return v.map(c => c / l) as [number, number, number]
})()
const SIDE = 400
const centre = (f: { n: number; tex: Uint8Array }, ch: number) => f.tex[((f.n >> 1) * f.n + (f.n >> 1)) * 4 + ch]

describe('the relief tone', () => {
  it('leaves flat ground at the middle value', () => {
    const f = reliefField(() => 12, SIDE, SUN)
    expect(f.n).toBe(SIDE / RELIEF_CELL)
    expect(centre(f, 0)).toBe(128)
    expect(centre(f, 1)).toBe(128)
  })

  it('lights a slope turned to the sun and darkens one turned away', () => {
    // the sun lies toward −x: ground falling toward −x (rising toward +x) faces it
    const toward = reliefField((x: number) => 0.05 * x, SIDE, SUN)
    const away = reliefField((x: number) => -0.05 * x, SIDE, SUN)
    expect(centre(toward, 0)).toBeGreaterThan(140)
    expect(centre(away, 0)).toBeLessThan(116)
  })

  it('lightens a crest and darkens a valley', () => {
    const bump = (s: number) => (x: number, z: number) => s * 6 * Math.exp(-(x * x + z * z) / (2 * 25 * 25))
    expect(centre(reliefField(bump(1), SIDE, SUN), 1)).toBeGreaterThan(160)
    expect(centre(reliefField(bump(-1), SIDE, SUN), 1)).toBeLessThan(96)
  })

  it('blurs without moving a flat field or the mean of a ramp', () => {
    const n = 20
    const flat = blur(new Float32Array(n * n).fill(3), n, 4)
    for (const v of flat) expect(v).toBeCloseTo(3, 5)
    const ramp = Float32Array.from({ length: n * n }, (_, k) => k % n)
    expect(blur(ramp, n, 2)[10 * n + 10]).toBeCloseTo(10, 5)
  })
})
