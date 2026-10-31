// What cards and full plates say (src/ui/plate.ts) and how meters fill (src/ui/elements.ts).
// docs/systems/front-menu.md.
import { describe, it, expect } from 'vitest'
import { meterCells } from '../src/ui/elements.ts'
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

describe('meterCells', () => {
  it('fills to the nearest tenth', () => {
    expect(meterCells(812, 1000)).toBe(8)
    expect(meterCells(860, 1000)).toBe(9)
    expect(meterCells(1000, 1000)).toBe(10)
  })

  it('shows one cell for any value above zero, so the last men still show', () => {
    expect(meterCells(1, 1000)).toBe(1)
  })

  it('is empty at zero, below it, or for a value that is not a number', () => {
    expect(meterCells(0, 1000)).toBe(0)
    expect(meterCells(-5, 1000)).toBe(0)
    expect(meterCells(Number.NaN, 1000)).toBe(0)
    expect(meterCells(5, 0)).toBe(0)
  })

  it('never overfills', () => {
    expect(meterCells(1300, 1000)).toBe(10)
  })
})
