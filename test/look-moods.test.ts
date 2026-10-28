// The light's moods (src/look/mood.ts): every field of every mood set and finite (an unset or NaN field paints the
// whole frame black, or one material: a grade value lost to a stray comment once did), the season's light finite
// through the year, the page's switches for the mood in use and its lock, and the grade of one colour.
import { Color3 } from '@babylonjs/core/Maths/math.color.js'
import { describe, expect, it, vi } from 'vitest'
import { MOODS, gradeColour, lumaW, newSeasonLight, seasonLight, type Mood } from '../src/look/mood.ts'

const finite = (v: unknown, path: string): string[] => {
  if (typeof v === 'number') return Number.isFinite(v) ? [] : [path]
  if (v && typeof v === 'object') {
    return Object.entries(v).flatMap(([k, x]) =>
      k === 'r' || k === 'g' || k === 'b' || typeof x !== 'function' ? finite(x, `${path}.${k}`) : [],
    )
  }
  return v === undefined ? [path] : []
}

describe('moods', () => {
  for (const [name, m] of Object.entries(MOODS) as [string, Mood][]) {
    it(`${name}: every field finite`, () => {
      expect(finite(m, name)).toEqual([])
      for (const k of ['greenAmt', 'sat', 'greenChroma', 'topAmt', 'summerSat', 'greenHue'] as const) {
        expect(typeof m.grade[k]).toBe('number')
      }
    })
    it(`${name}: the season's light finite through the year`, () => {
      const out = newSeasonLight()
      for (let s = 0; s <= 3; s += 0.1) {
        seasonLight(m, s, out)
        expect(finite(out, `${name}@${s.toFixed(1)}`)).toEqual([])
      }
    })
  }
})

// the mood in use is the module's state, set once before the materials: a fresh module a test
const freshMood = async () => {
  vi.resetModules()
  return import('../src/look/mood.ts')
}

describe('the mood in use (setMood, setBounce, setGroundBounce, lockMood)', () => {
  it('is epic by default, and setMood picks a mood by name', async () => {
    const m = await freshMood()
    expect(m.MOOD).toBe(m.MOODS.epic)
    m.setMood('temperate')
    expect(m.MOOD).toBe(m.MOODS.temperate)
  })
  it("refuses a name that is not a mood, an object's own keys included", async () => {
    const m = await freshMood()
    for (const name of ['dusk', '', 'toString', '__proto__', 'constructor']) {
      expect(() => m.setMood(name), name).toThrow(/\?mood must be one of golden, temperate, epic/)
    }
    expect(m.MOOD).toBe(m.MOODS.epic)
  })
  it('sets the bounces on a copy, the moods table untouched, within 0 to 2', async () => {
    const m = await freshMood()
    m.setBounce(1.5)
    m.setGroundBounce(0)
    expect([m.MOOD.bounce, m.MOOD.groundBounce]).toEqual([1.5, 0])
    expect([m.MOODS.epic.bounce, m.MOODS.epic.groundBounce]).toEqual([0.7, 0.5])
    m.setBounce(2)
    m.setGroundBounce(2)
    expect([m.MOOD.bounce, m.MOOD.groundBounce]).toEqual([2, 2])
    for (const v of [-0.01, 2.01, NaN, Infinity]) {
      expect(() => m.setBounce(v), `${v}`).toThrow(/\?bounce must be 0 to 2/)
      expect(() => m.setGroundBounce(v), `${v}`).toThrow(/\?gbounce must be 0 to 2/)
    }
  })
  it("takes the table's mood whole when one is picked after a bounce (the page sets the mood first)", async () => {
    const m = await freshMood()
    m.setBounce(1.5)
    m.setMood('golden')
    expect(m.MOOD.bounce).toBe(0.7)
  })
  it('refuses every change once the first material locks it', async () => {
    const m = await freshMood()
    m.setMood('golden')
    m.lockMood()
    expect(() => m.setMood('epic')).toThrow(/setMood: the materials are made/)
    expect(() => m.setBounce(1)).toThrow(/setBounce: the materials are made/)
    expect(() => m.setGroundBounce(1)).toThrow(/setGroundBounce: the materials are made/)
    expect(m.MOOD).toBe(m.MOODS.golden)
  })
  it("seeds the season's light from the mood at summer when it locks, if the page has not set it", async () => {
    const m = await freshMood()
    m.setMood('golden')
    m.lockMood()
    const summer = m.seasonLight(m.MOODS.golden, 0, m.newSeasonLight())
    expect(m.SEASON.shadow.asArray()).toEqual(summer.shadow.asArray())
    expect(m.SEASON.sat).toBe(summer.sat)
  })
  it("leaves the season's light the page set before the lock", async () => {
    const m = await freshMood()
    m.seasonLight(m.MOOD, 2.6, m.SEASON)
    const winter = m.seasonLight(m.MOOD, 2.6, m.newSeasonLight())
    m.lockMood()
    expect(m.SEASON.shadow.asArray()).toEqual(winter.shadow.asArray())
  })
})

describe('the grade of one colour (gradeColour, lumaW)', () => {
  const c = (r: number, g: number, b: number) => new Color3(r, g, b)
  // a grade that changes nothing: no green turn, full saturation, no split tone or lift, no top haze
  const neutral = (): Mood => {
    const one = c(1, 1, 1)
    const grade = { greenAmt: 0, sat: 1, splitLo: one, splitHi: one, lift: c(0, 0, 0), topAmt: 0 }
    return { ...MOODS.epic, grade: { ...MOODS.epic.grade, ...grade } }
  }
  const close = (a: Color3, b: Color3) => {
    for (const k of ['r', 'g', 'b'] as const) expect(a[k], k).toBeCloseTo(b[k], 12)
  }
  it('weighs luma as the painter does, white at 1', () => {
    expect(lumaW(c(1, 1, 1))).toBeCloseTo(1, 15)
    expect([lumaW(c(1, 0, 0)), lumaW(c(0, 1, 0)), lumaW(c(0, 0, 1))]).toEqual([0.3, 0.59, 0.11])
  })
  it('changes nothing under a neutral grade, at any height in the frame', () => {
    const m = neutral()
    for (const col of [c(0.2, 0.5, 0.1), c(0.9, 0.1, 0.3), c(0, 0, 0), c(1, 1, 1)]) {
      for (const y of [0, 0.5, 1]) close(gradeColour(col, m, y), col)
    }
  })
  it('greys a colour at saturation 0, keeping its luma, and takes the mood saturation by default', () => {
    const m = neutral()
    const g = gradeColour(c(0.9, 0.2, 0.1), m, 0, 0)
    expect(g.r).toBeCloseTo(g.g, 12)
    expect(g.g).toBeCloseTo(g.b, 12)
    expect(g.r).toBeCloseTo(0.2126 * 0.9 + 0.7152 * 0.2 + 0.0722 * 0.1, 12)
    m.grade.sat = 0
    close(gradeColour(c(0.9, 0.2, 0.1), m, 0), g)
  })
  it("turns greens toward the mood's muted green, and leaves a colour that is not green", () => {
    const m = neutral()
    m.grade.greenAmt = 1
    m.grade.greenChroma = 0
    m.grade.greenTint = c(1, 1, 1)
    const g = gradeColour(c(0.1, 0.6, 0.1), m, 0)
    // (a green far enough from red and blue goes all the way: its luma, grey)
    expect(g.r).toBeCloseTo(g.g, 12)
    close(gradeColour(c(0.6, 0.3, 0.2), m, 0), c(0.6, 0.3, 0.2))
  })
  it("hazes toward the frame's top only, by topAmt", () => {
    const m = neutral()
    m.grade.topAmt = 1
    const col = c(0.2, 0.3, 0.4)
    close(gradeColour(col, m, 0.6), col)
    const top = gradeColour(col, m, 1)
    const l = 0.2126 * 0.2 + 0.7152 * 0.3 + 0.0722 * 0.4
    close(top, m.grade.topHaze.scale(0.85 + l * 0.35))
  })
})
