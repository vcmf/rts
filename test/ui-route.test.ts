// The front menu's routes (src/ui/route.ts): the hash every screen lives at, its repair against the roster, and the
// way back. docs/systems/front-menu.md.
import { describe, it, expect } from 'vitest'
import { formatRoute, normalizeRoute, parentRoute, parseRoute, rosterRoute, type Route } from '../src/ui/route.ts'
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
    expect(parseRoute('#roster/regiments/south/guns/1')).toEqual({
      screen: 'roster',
      kind: 'regiments',
      nation: 'south',
      arm: 'guns',
      open: 1,
    })
  })

  it('fills what a roster hash leaves out: commanders, every arm, no plate', () => {
    expect(parseRoute('#roster')).toEqual({ screen: 'roster', kind: 'commanders', nation: '', arm: 'all', open: null })
  })

  it('ignores an open index that is not a whole number', () => {
    for (const open of ['-1', '1.5', 'x', '']) {
      const route = parseRoute(`#roster/regiments/north/all/${open}`)
      expect(route.screen === 'roster' && route.open).toBe(null)
    }
  })
})

describe('formatRoute', () => {
  it('is the inverse of parseRoute for every screen', () => {
    const routes: Route[] = [
      { screen: 'home' },
      { screen: 'history' },
      rosterRoute('commanders', 'north'),
      { screen: 'roster', kind: 'regiments', nation: 'south', arm: 'guns', open: 0 },
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
    const route: Route = { screen: 'roster', kind: 'regiments', nation: 'north', arm: 'horse', open: 0 }
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

  it('closes a plate past the last entry of the filtered roster', () => {
    // north has one horse regiment: index 0 opens it, index 1 is past the end
    expect(normalizeRoute(parseRoute('#roster/regiments/north/horse/0'), roster)).toMatchObject({ open: 0 })
    expect(normalizeRoute(parseRoute('#roster/regiments/north/horse/1'), roster)).toMatchObject({ open: null })
  })
})

describe('parentRoute', () => {
  it('walks back plate → roster → History → home, and stays home', () => {
    const plate: Route = { screen: 'roster', kind: 'regiments', nation: 'south', arm: 'guns', open: 0 }
    const rosterScreen = parentRoute(plate)
    expect(rosterScreen).toEqual({ ...plate, open: null })
    expect(parentRoute(rosterScreen)).toEqual({ screen: 'history' })
    expect(parentRoute({ screen: 'history' })).toEqual({ screen: 'home' })
    expect(parentRoute({ screen: 'home' })).toEqual({ screen: 'home' })
  })
})
