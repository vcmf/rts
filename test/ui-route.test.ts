// The front menu's routes (src/ui/route.ts): the hash every screen lives at, its repair against the roster, and the
// way back. docs/systems/front-menu.md.
import { describe, it, expect } from 'vitest'
import {
  formatRoute,
  normalizeRoute,
  parentRoute,
  parseRoute,
  rosterRoute,
  sameGrid,
  upMove,
  type Route,
} from '../src/ui/route.ts'
import { fixtureRoster } from './ui-fixture.ts'

const roster = fixtureRoster()

describe('parseRoute', () => {
  it('reads home and History, and treats an empty or unknown hash as home', () => {
    expect(parseRoute('#history')).toEqual({ screen: 'history' })
    expect(parseRoute('')).toEqual({ screen: 'home' })
    expect(parseRoute('#')).toEqual({ screen: 'home' })
    expect(parseRoute('#nowhere/at/all')).toEqual({ screen: 'home' })
  })

  it('reads a roster with its kind, nation, arm and open plate', () => {
    expect(parseRoute('#roster/regiments/south/guns/south%2F02-guns')).toEqual({
      screen: 'roster',
      kind: 'regiments',
      nation: 'south',
      arm: 'guns',
      open: 'south/02-guns',
    })
  })

  it('fills what a roster hash leaves out: commanders, every arm, no plate', () => {
    expect(parseRoute('#roster')).toEqual({ screen: 'roster', kind: 'commanders', nation: '', arm: 'all', open: null })
  })

  it('treats a hash that does not decode as home, not a crash (a malformed address once stopped the page)', () => {
    expect(parseRoute('#roster/regiments/%E0')).toEqual({ screen: 'home' })
    expect(parseRoute('#roster/%')).toEqual({ screen: 'home' })
  })
})

describe('formatRoute', () => {
  it('is the inverse of parseRoute for every screen', () => {
    const routes: Route[] = [
      { screen: 'home' },
      { screen: 'history' },
      rosterRoute('commanders', 'north'),
      { screen: 'roster', kind: 'regiments', nation: 'south', arm: 'guns', open: 'south/02-guns' },
    ]
    for (const route of routes) expect(parseRoute(formatRoute(route))).toEqual(route)
  })

  it('escapes a nation id that is not plain, and reads it back', () => {
    const route: Route = { screen: 'roster', kind: 'commanders', nation: 'Ost/Süd', arm: 'all', open: null }
    expect(formatRoute(route)).toBe('#roster/commanders/Ost%2FS%C3%BCd/all')
    expect(parseRoute(formatRoute(route))).toEqual(route)
  })
})

describe('normalizeRoute', () => {
  it('leaves a valid route alone', () => {
    const route: Route = { screen: 'roster', kind: 'regiments', nation: 'north', arm: 'horse', open: 'north/03-horse' }
    expect(normalizeRoute(route, roster)).toEqual(route)
  })

  it('turns an unknown nation into the first army', () => {
    const route = normalizeRoute(parseRoute('#roster/commanders/atlantis'), roster)
    expect(route.screen === 'roster' && route.nation).toBe('north')
  })

  it('keeps every arm for commanders, and for an arm the roster does not know', () => {
    const commanders = normalizeRoute(parseRoute('#roster/commanders/north/horse'), roster)
    const unknown = normalizeRoute(parseRoute('#roster/regiments/north/dragons'), roster)
    expect(commanders.screen === 'roster' && commanders.arm).toBe('all')
    expect(unknown.screen === 'roster' && unknown.arm).toBe('all')
  })

  it('closes a plate the filtered roster does not show: an unknown id, or one filtered out', () => {
    const open = (hash: string) => normalizeRoute(parseRoute(hash), roster)
    expect(open('#roster/regiments/north/horse/north%2F03-horse')).toMatchObject({ open: 'north/03-horse' })
    expect(open('#roster/regiments/north/horse/north%2F01-foot')).toMatchObject({ open: null })
    expect(open('#roster/regiments/north/all/north%2F99-gone')).toMatchObject({ open: null })
  })
})

describe('parentRoute', () => {
  it('walks back plate → roster → History → home, and stays home', () => {
    const plate: Route = { screen: 'roster', kind: 'regiments', nation: 'south', arm: 'guns', open: 'south/02-guns' }
    const rosterScreen = parentRoute(plate)
    expect(rosterScreen).toEqual({ ...plate, open: null })
    expect(parentRoute(rosterScreen)).toEqual({ screen: 'history' })
    expect(parentRoute({ screen: 'history' })).toEqual({ screen: 'home' })
    expect(parentRoute({ screen: 'home' })).toEqual({ screen: 'home' })
  })
})

describe('upMove', () => {
  it('goes back when the page came from the level above, so Back does not reopen what Esc closed', () => {
    expect(upMove('#history', '#history')).toBe('back')
  })

  it('replaces in place when it came from elsewhere, or from outside the page', () => {
    expect(upMove('#home', '#history')).toBe('replace')
    expect(upMove(undefined, '#home')).toBe('replace')
  })
})

describe('sameGrid', () => {
  const grid: Route = { screen: 'roster', kind: 'regiments', nation: 'north', arm: 'all', open: null }

  it('is true when only the open plate differs (the grid is not redrawn, its focus kept)', () => {
    expect(sameGrid({ ...grid, open: 'north/01-foot' }, grid)).toBe(true)
  })

  it('is false for another kind, nation or arm, another screen, or nothing drawn', () => {
    expect(sameGrid(grid, { ...grid, nation: 'south' })).toBe(false)
    expect(sameGrid(grid, { ...grid, arm: 'foot' })).toBe(false)
    expect(sameGrid(grid, { ...grid, kind: 'commanders' })).toBe(false)
    expect(sameGrid(grid, { screen: 'history' })).toBe(false)
    expect(sameGrid(grid, null)).toBe(false)
  })
})
