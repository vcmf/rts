// The roster's queries and its soundness check (src/ui/roster.ts). docs/systems/front-menu.md.
import { describe, it, expect } from 'vitest'
import { countByArm, countByNation, entriesOf, entryById, nationOf, rosterProblems } from '../src/ui/roster.ts'
import { fixtureRoster } from './ui-fixture.ts'

const roster = fixtureRoster()
const ids = (entries: { id: string }[]) => entries.map(e => e.id)

describe('entriesOf', () => {
  it("keeps one army's entries of one kind, in library order", () => {
    expect(ids(entriesOf(roster, { kind: 'commanders', nation: 'north', arm: 'all' }))).toEqual(['north/a', 'north/b'])
  })

  it('filters regiments by arm', () => {
    expect(ids(entriesOf(roster, { kind: 'regiments', nation: 'north', arm: 'foot' }))).toEqual([
      'north/01-foot',
      'north/02-foot',
    ])
  })

  it('finds no commanders under an arm: commanders have none', () => {
    expect(entriesOf(roster, { kind: 'commanders', nation: 'north', arm: 'foot' })).toEqual([])
  })
})

describe('the counts the filters show', () => {
  it('counts each army in roster order', () => {
    const counts = countByNation(roster, 'regiments').map(c => [c.nation.id, c.count])
    expect(counts).toEqual([
      ['north', 3],
      ['south', 2],
    ])
  })

  it('counts each arm of one army, every arm first, an arm with none at zero', () => {
    expect(countByArm(roster, 'south')).toEqual([
      { arm: 'all', count: 2 },
      { arm: 'foot', count: 1 },
      { arm: 'horse', count: 0 },
      { arm: 'guns', count: 1 },
    ])
  })
})

describe('lookups', () => {
  it('finds a nation and an entry by id, and nothing for an unknown one', () => {
    expect(nationOf(roster, 'south')?.name).toBe('South')
    expect(nationOf(roster, 'west')).toBeUndefined()
    expect(entryById(roster, 'commanders', 'south/c')?.name).toBe('Commander c')
    expect(entryById(roster, 'regiments', 'south/c')).toBeUndefined()
  })
})

describe('rosterProblems', () => {
  it('finds none in a sound roster', () => {
    expect(rosterProblems(fixtureRoster())).toEqual([])
  })

  it('names each kind of fault', () => {
    const broken = fixtureRoster()
    broken.version = 99
    broken.regiments[1].id = broken.regiments[0].id
    broken.regiments[2].arm = 'dragons'
    broken.commanders[2].nation = 'west'
    broken.commanders[0].image = ''
    broken.featured.regiments = 'nobody'
    expect(rosterProblems(broken)).toEqual([
      'version 99, expected 2',
      'commanders: north/a has no image',
      'commanders: south/c of unknown nation west',
      'regiments: north/01-foot twice',
      'regiments: north/03-horse of unknown arm dragons',
      'featured regiments nobody not found',
    ])
  })

  it('refuses a roster the screens cannot draw: no nations, no level names, an arm named like the every-arm filter', () => {
    const broken = fixtureRoster()
    broken.arms.push('all')
    broken.levels = []
    expect(rosterProblems(broken)).toEqual(['an arm named "all", the filter that keeps every arm', 'no level names'])
    const empty = fixtureRoster()
    empty.nations = []
    expect(rosterProblems(empty)).toContain('no nations')
  })
})
