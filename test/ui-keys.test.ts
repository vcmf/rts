// The front menu's keyboard (src/ui/keys.ts): what each key does on each screen, and the home menu's stepping over
// muted items. docs/systems/front-menu.md ("Keyboard").
import { describe, it, expect } from 'vitest'
import { firstLive, keyAction, stepLive } from '../src/ui/keys.ts'
import type { Route } from '../src/ui/route.ts'

const HOME: Route = { screen: 'home' }
const HISTORY: Route = { screen: 'history' }
const ROSTER: Route = { screen: 'roster', kind: 'regiments', nation: 'north', arm: 'all', open: null }
const IDS = ['n/1', 'n/2', 'n/3']
const plate = (open: string): Route => ({ screen: 'roster', kind: 'regiments', nation: 'north', arm: 'all', open })
const key = (k: string) => ({ key: k, modified: false })

describe('keyAction', () => {
  it('moves and opens the home menu with the arrows and Enter', () => {
    expect(keyAction(HOME, key('ArrowDown'), [])).toEqual({ type: 'step', by: 1 })
    expect(keyAction(HOME, key('ArrowUp'), [])).toEqual({ type: 'step', by: -1 })
    expect(keyAction(HOME, key('Enter'), [])).toEqual({ type: 'activate' })
  })

  it('goes one level up on Escape, and does nothing with it at home', () => {
    expect(keyAction(plate('n/2'), key('Escape'), IDS)).toEqual({ type: 'go', route: ROSTER, move: 'up' })
    expect(keyAction(ROSTER, key('Escape'), IDS)).toEqual({ type: 'go', route: HISTORY, move: 'up' })
    expect(keyAction(HISTORY, key('Escape'), [])).toEqual({ type: 'go', route: HOME, move: 'up' })
    expect(keyAction(HOME, key('Escape'), [])).toBeNull()
  })

  it('turns the open plate with the arrows, in place of the history entry, stopping at either end', () => {
    expect(keyAction(plate('n/2'), key('ArrowRight'), IDS)).toEqual({
      type: 'go',
      route: plate('n/3'),
      move: 'replace',
    })
    expect(keyAction(plate('n/2'), key('ArrowLeft'), IDS)).toEqual({ type: 'go', route: plate('n/1'), move: 'replace' })
    expect(keyAction(plate('n/3'), key('ArrowRight'), IDS)).toBeNull()
    expect(keyAction(plate('n/1'), key('ArrowLeft'), IDS)).toBeNull()
  })

  it('does not turn a plate the roster does not show', () => {
    expect(keyAction(plate('s/9'), key('ArrowRight'), IDS)).toBeNull()
  })

  it('leaves keys held with a modifier to the browser (Alt+← is Back)', () => {
    expect(keyAction(plate('n/2'), { key: 'ArrowLeft', modified: true }, IDS)).toBeNull()
    expect(keyAction(HOME, { key: 'ArrowDown', modified: true }, [])).toBeNull()
    expect(keyAction(ROSTER, { key: 'Escape', modified: true }, IDS)).toBeNull()
  })

  it('leaves other keys, and the arrows off home and plates, to the browser', () => {
    expect(keyAction(HOME, key('a'), [])).toBeNull()
    expect(keyAction(ROSTER, key('ArrowDown'), IDS)).toBeNull()
    expect(keyAction(HISTORY, key('Enter'), [])).toBeNull()
  })
})

describe('stepLive', () => {
  // as on the home menu: muted items between live ones
  const live = [false, false, true, false, true]

  it('skips muted items both ways', () => {
    expect(stepLive(live, 2, 1)).toBe(4)
    expect(stepLive(live, 4, -1)).toBe(2)
  })

  it('wraps around the ends', () => {
    expect(stepLive(live, 4, 1)).toBe(2)
    expect(stepLive(live, 2, -1)).toBe(4)
  })

  it('stays put when no other item is live', () => {
    expect(stepLive([false, true, false], 1, 1)).toBe(1)
    expect(stepLive([false, false], 0, -1)).toBe(0)
  })

  it('finds the first live item, or none', () => {
    expect(firstLive(live)).toBe(2)
    expect(firstLive([false, false])).toBe(-1)
  })
})
