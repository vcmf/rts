// What cards and full plates say (src/ui/plate.ts), and how bars fill and show their state (src/ui/elements.ts).
// docs/systems/front-menu.md.
import { describe, it, expect } from 'vitest'
import { BAR_CRITICAL, BAR_LOW, barShare, barState } from '../src/ui/elements.ts'
import { captionOf, plateOf } from '../src/ui/plate.ts'
import type { RosterRoute } from '../src/ui/route.ts'
import { fixtureRoster } from './ui-fixture.ts'

const roster = fixtureRoster()
const route = (kind: RosterRoute['kind'], nation: string, arm: string, open: string | null): RosterRoute => ({
  screen: 'roster',
  kind,
  nation,
  arm,
  open,
})

describe('captionOf', () => {
  it('numbers a regiment by its library number and tags its arm', () => {
    expect(captionOf(roster.regiments[2], 0)).toEqual({
      label: 'No. 03',
      tag: 'horse',
      name: 'Regiment 03',
      detail: 'horse of north',
    })
  })

  it('numbers a commander by his place and gives his role', () => {
    expect(captionOf(roster.commanders[1], 8)).toEqual({
      label: 'Fig. 09',
      tag: '',
      name: 'Commander b',
      detail: 'General',
    })
  })
})

describe('plateOf', () => {
  it('is null when no plate is open, or its entry is not among the filtered ones', () => {
    expect(plateOf(roster, route('regiments', 'north', 'all', null))).toBeNull()
    expect(plateOf(roster, route('regiments', 'north', 'all', 'south/01-foot'))).toBeNull()
  })

  it("places the entry among the filtered roster's", () => {
    const plate = plateOf(roster, route('regiments', 'north', 'foot', 'north/02-foot'))
    expect(plate).toMatchObject({ index: 1, total: 2, figure: 'Plate II · No. 02', subtitle: 'foot of north' })
    expect(plate).toMatchObject({ prev: 'north/01-foot', next: null })
    expect(plate?.entry.id).toBe('north/02-foot')
    expect(plate?.nation.id).toBe('north')
  })

  it("gives a commander's life, likeness and army", () => {
    const plate = plateOf(roster, route('commanders', 'north', 'all', 'north/a'))
    expect(plate?.figure).toBe('Plate I · 01')
    expect(plate?.facts).toEqual([
      ['Life', 'a life'],
      ['Likeness', 'a source'],
      ['Army', 'North'],
    ])
  })

  it('leaves out the facts the library has no value for', () => {
    expect(plateOf(roster, route('commanders', 'north', 'all', 'north/b'))?.facts).toEqual([['Army', 'North']])
  })

  it("gives a regiment's arm and army", () => {
    expect(plateOf(roster, route('regiments', 'south', 'all', 'south/02-guns'))?.facts).toEqual([
      ['Arm', 'guns'],
      ['Army', 'South'],
    ])
  })
})

describe('barShare', () => {
  it('is the share of max, clamped to 0–1', () => {
    expect(barShare(450, 900)).toBe(0.5)
    expect(barShare(1300, 1000)).toBe(1)
  })

  it('is empty at zero, below it, or for a value or max that is not a positive number', () => {
    expect(barShare(0, 1000)).toBe(0)
    expect(barShare(-5, 1000)).toBe(0)
    expect(barShare(Number.NaN, 1000)).toBe(0)
    expect(barShare(5, 0)).toBe(0)
  })
})

describe('barState', () => {
  it('is low and critical as a good-when-full metric empties', () => {
    expect(barState(0.9)).toBe('ok')
    expect(barState(1 - BAR_LOW)).toBe('low')
    expect(barState(1 - BAR_CRITICAL)).toBe('critical')
    expect(barState(0)).toBe('critical')
  })

  it('is low and critical as a bad-when-full metric (fatigue) fills', () => {
    expect(barState(0.2, true)).toBe('ok')
    expect(barState(BAR_LOW, true)).toBe('low')
    expect(barState(BAR_CRITICAL, true)).toBe('critical')
  })
})
