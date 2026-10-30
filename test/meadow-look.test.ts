// The meadow's looks from the page's query (src/look/meadow-look.ts, decision 0085): ?grassup and ?wheatfill, their
// defaults, the values they refuse, and the defines the wheat's fill gives the shaders.
import { describe, expect, it } from 'vitest'
import { lookChoice, MEADOW_LOOK, meadowLookDefines, meadowLookOf } from '../src/look/meadow-look.ts'
import { GRASS_UP, GRASS_UP_DEFAULT, WHEAT_FILL_DEFAULT } from '../src/look/meadow-spec.ts'

const q = (s: string) => new URLSearchParams(s)

describe("the meadow's looks", () => {
  it('takes one digit under the count, the default when absent', () => {
    expect(lookChoice(q(''), 'grassup', 3, 2)).toBe(2)
    expect(lookChoice(q('grassup=0'), 'grassup', 3, 2)).toBe(0)
    expect(lookChoice(q('grassup=1'), 'grassup', 3, 2)).toBe(1)
  })
  it('refuses an empty value, more than one digit, one out of range or not a digit', () => {
    for (const v of ['', '02', '3', '-1', '1.0', 'x']) {
      expect(() => lookChoice(q(`grassup=${v}`), 'grassup', 3, 2)).toThrow(/grassup must be 0 to 2/)
    }
  })
  it("defaults to the upright carpet and the wheat filled, the owner's pick", () => {
    const look = meadowLookOf(q(''), 'flow')
    expect(look).toEqual(MEADOW_LOOK)
    expect(look.up).toBe(GRASS_UP[GRASS_UP_DEFAULT])
    expect(look.wheatFill).toBe(WHEAT_FILL_DEFAULT)
    expect(meadowLookOf(q('grassup=0&wheatfill=0'), 'flow')).toEqual({ up: GRASS_UP[0], wheatFill: 0 })
  })
  it('fails ?grassup with the brush pattern, as ?grassoff does, and takes ?wheatfill with either', () => {
    expect(() => meadowLookOf(q('grassup=1'), 'brush')).toThrow(/combed meadow/)
    expect(meadowLookOf(q('wheatfill=0'), 'brush').wheatFill).toBe(0)
    expect(() => meadowLookOf(q('wheatfill=2'), 'flow')).toThrow(/wheatfill must be 0 to 1/)
  })
  it('gives the wheat fill its defines, and none without it', () => {
    expect(meadowLookDefines({ ...MEADOW_LOOK, wheatFill: 0 })).toEqual([])
    expect(meadowLookDefines({ ...MEADOW_LOOK, wheatFill: 1 })).toEqual([
      '#define WHEAT_FILL',
      '#define WHEAT_FILL_WIDE 1.90',
    ])
  })
})
