// The relief's painted tone (src/look/relief.ts): flat ground takes none, a slope turned to the sun is lighter and one
// turned away darker, a crest lighter and a valley darker; the blur keeps a flat field flat.
import { describe, expect, it } from 'vitest'
import { blur, reliefField, reliefPatch, RELIEF_CELL } from '../src/look/relief.ts'

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

describe("the relief's tone made again where the heights changed (reliefPatch, G3c)", () => {
  it("is the whole field's tone, a byte at most, on a field whose heights changed in a square", () => {
    const sun: [number, number, number] = [-0.7, 0.45, 0.55]
    const hill = (x: number, z: number) => 20 * Math.sin(x / 90) * Math.cos(z / 70) + 0.01 * x
    // a moved tile: the heights inside a square read finer (a bump the coarse ground had not)
    const sq = { x0: -100, z0: 40, x1: 300, z1: 440 }
    const inSq = (x: number, z: number) => x >= sq.x0 && x <= sq.x1 && z >= sq.z0 && z <= sq.z1
    const moved = (x: number, z: number) => hill(x, z) + (inSq(x, z) ? 3 * Math.sin(x / 7) * Math.sin(z / 9) : 0)
    const before = reliefField(hill, 1600, sun, -800, -700)
    const after = reliefField(moved, 1600, sun, -800, -700)
    const tex = Uint8Array.from(before.tex)
    reliefPatch(moved, { n: before.n, cell: before.cell, x0: -800, z0: -700 }, sq, sun, tex)
    let worst = 0
    for (let k = 0; k < tex.length; k++) worst = Math.max(worst, Math.abs(tex[k] - after.tex[k]))
    expect(worst).toBeLessThanOrEqual(1)
    // and it did change: the square's tone is not the field's before
    let changed = 0
    for (let k = 0; k < tex.length; k++) if (tex[k] !== before.tex[k]) changed++
    expect(changed).toBeGreaterThan(1000)
  })

  it("is the whole field's tone at the field's edge too, its read window clipped there", () => {
    const sun: [number, number, number] = [-0.7, 0.45, 0.55]
    const hill = (x: number, z: number) => 15 * Math.sin(x / 60) * Math.cos(z / 80)
    // a square against the field's west and south edges (the field from −800, −700)
    const sq = { x0: -800, z0: -700, x1: -500, z1: -400 }
    const inSq = (x: number, z: number) => x >= sq.x0 && x <= sq.x1 && z >= sq.z0 && z <= sq.z1
    const moved = (x: number, z: number) => hill(x, z) + (inSq(x, z) ? 4 * Math.cos(x / 5) : 0)
    const before = reliefField(hill, 1600, sun, -800, -700)
    const after = reliefField(moved, 1600, sun, -800, -700)
    const tex = Uint8Array.from(before.tex)
    reliefPatch(moved, { n: before.n, cell: before.cell, x0: -800, z0: -700 }, sq, sun, tex)
    let worst = 0
    for (let k = 0; k < tex.length; k++) worst = Math.max(worst, Math.abs(tex[k] - after.tex[k]))
    expect(worst).toBeLessThanOrEqual(1)
  })
})

describe('a box blur of a field that is not square', () => {
  it('blurs each axis over its own length, clamped at its own edges', () => {
    // 5 × 3: a step along x, constant along z: the z pass leaves it, the x pass smooths it, clamped at x's ends
    const f = Float32Array.from([0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1])
    const b = blur(f, 5, 1, 1, 3)
    const row = Array.from(b.subarray(0, 5)).map(v => +v.toFixed(4))
    expect(row).toEqual([0, 0.3333, 0.6667, 1, 1])
    for (let j = 1; j < 3; j++) expect(Array.from(b.subarray(j * 5, j * 5 + 5)).map(v => +v.toFixed(4))).toEqual(row)
  })
})
