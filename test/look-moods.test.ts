// The light's moods (src/look/mood.ts): every field of every mood set and finite (an unset or NaN field paints the
// whole frame black, or one material: a grade value lost to a stray comment once did), and the season's light
// finite through the year.
import { describe, expect, it } from 'vitest'
import { MOODS, newSeasonLight, seasonLight, type Mood } from '../src/look/mood.ts'

const finite = (v: unknown, path: string): string[] => {
  if (typeof v === 'number') return Number.isFinite(v) ? [] : [path]
  if (v && typeof v === 'object') return Object.entries(v).flatMap(([k, x]) => (k === 'r' || k === 'g' || k === 'b' || typeof x !== 'function') ? finite(x, `${path}.${k}`) : [])
  return v === undefined ? [path] : []
}

describe('moods', () => {
  for (const [name, m] of Object.entries(MOODS) as [string, Mood][]) {
    it(`${name}: every field finite`, () => {
      expect(finite(m, name)).toEqual([])
      for (const k of ['greenAmt', 'sat', 'greenChroma', 'topAmt', 'summerSat', 'greenHue'] as const) expect(typeof m.grade[k]).toBe('number')
    })
    it(`${name}: the season's light finite through the year`, () => {
      const out = newSeasonLight()
      for (let s = 0; s <= 3; s += 0.1) { seasonLight(m, s, out); expect(finite(out, `${name}@${s.toFixed(1)}`)).toEqual([]) }
    })
  }
})
