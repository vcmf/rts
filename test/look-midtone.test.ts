// The mid tone (src/look/midtone.ts, decision 0084): ?midtone's values to the painter's defines, and the painter's
// routing of those defines to each material class (src/look/shaders/painter.glsl, read as text).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { MIDTONE_DEFAULT, midtoneDefines, parseMidtone } from '../src/look/midtone.ts'

describe('the mid tone switch', () => {
  it('is the owner pick with no value: u3, b2, n2, the ground at 0', () => {
    expect(parseMidtone(null)).toEqual({ u: 3, b: 2, n: 2, g: 0 })
    expect(parseMidtone('')).toEqual(MIDTONE_DEFAULT)
    expect(midtoneDefines(parseMidtone(null))).toEqual(['#define MID3_U', '#define MID2_B', '#define MID2_N'])
  })
  it('is the hard bands from before it, with no define, at 0', () => {
    expect(midtoneDefines(parseMidtone('0'))).toEqual([])
  })
  it('sets every class from one digit', () => {
    expect(midtoneDefines(parseMidtone('2'))).toEqual([
      '#define MID2_U',
      '#define MID2_B',
      '#define MID2_N',
      '#define MID2_G',
    ])
  })
  it('sets each class from its part, the rest at 0', () => {
    expect(parseMidtone('u2,b1')).toEqual({ u: 2, b: 1, n: 0, g: 0 })
    expect(midtoneDefines(parseMidtone('u2,b1,g0'))).toEqual(['#define MID2_U', '#define MID1_B'])
  })
  it('takes 3 for the units alone', () => {
    expect(midtoneDefines(parseMidtone('u3,b2'))).toEqual(['#define MID3_U', '#define MID2_B'])
    for (const bad of ['3', 'b3', 'g3']) expect(() => parseMidtone(bad)).toThrow()
  })
  it('throws on a malformed value or a class named twice', () => {
    for (const bad of ['4', 'x1', 'u4', 'u', 'u12', 'u1;b2', 'u2,u3']) expect(() => parseMidtone(bad)).toThrow()
  })
  it('does not share the default with a caller that changes its copy', () => {
    const m = parseMidtone(null)
    m.u = 0
    expect(parseMidtone(null).u).toBe(3)
  })
})

// the painter's routing block (from its THE MID TONE comment to the next uniform), run through a small preprocessor:
// #ifdef, #ifndef, #else, #endif and #define, the only directives it uses
const PAINTER = readFileSync(new URL('../src/look/shaders/painter.glsl', import.meta.url), 'utf8')
const routing = (): string[] => {
  const lines = PAINTER.split('\n')
  const from = lines.findIndex(l => l.startsWith('// THE MID TONE'))
  const to = lines.findIndex((l, i) => i > from && l.startsWith('uniform '))
  return lines.slice(from, to).filter(l => l.startsWith('#'))
}
/** the defines the routing leaves for a material's defines */
const route = (defined: string[]): string[] => {
  const d = new Set(defined)
  const stack: boolean[] = []
  const on = () => stack.every(Boolean)
  for (const l of routing()) {
    const [dir, name] = l.trim().split(/\s+/)
    if (dir === '#ifdef') stack.push(d.has(name))
    else if (dir === '#ifndef') stack.push(!d.has(name))
    else if (dir === '#else') stack.push(!stack.pop())
    else if (dir === '#endif') stack.pop()
    else if (dir === '#define' && on()) d.add(name)
    else if (dir !== '#define') throw new Error(`the routing test reads no ${dir}`)
  }
  expect(stack).toEqual([])
  return ['MID1', 'MID2', 'MID3'].filter(k => d.has(k))
}

describe("the painter's mid tone routing", () => {
  const ALL = ['1', '2', '3'].flatMap(n => ['U', 'B', 'N', 'G'].map(c => `MID${n}_${c}`))
  const CLASSES: [string, string[]][] = [
    ['U', ['KEEP_HUE']],
    ['B', ['PAINT_BUILDING']],
    ['N', ['PAINT_NATURE']],
    ['G', ['DETAIL_ON']],
  ]
  it("gives each class its own mode only, whatever the other classes' modes", () => {
    for (const [c, own] of CLASSES) {
      for (const n of ['1', '2', '3']) {
        const others = ALL.filter(k => !k.endsWith(`_${c}`))
        const want = n === '3' && c !== 'U' ? [] : [`MID${n}`]
        expect(route([...own, `MID${n}_${c}`, ...others.filter(k => k.startsWith(`MID${n}`))]), `${c}${n}`).toEqual(
          want,
        )
        expect(route([...own, ...others]), `${c} with every other class on`).toEqual([])
      }
    }
  })
  it('routes a unit by KEEP_HUE before the ground, and leaves the crowns alone', () => {
    expect(route(['KEEP_HUE', 'DETAIL_ON', 'MID3_U', 'MID2_G'])).toEqual(['MID3'])
    expect(route(['SOFT_RAMP', 'PAINT_NATURE', ...ALL])).toEqual([])
    expect(route(['SOFT_RAMP', 'KEEP_HUE', ...ALL])).toEqual([])
  })
  it('defines nothing for a material of no class', () => {
    expect(route(ALL)).toEqual([])
  })
})
