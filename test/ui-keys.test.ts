// The front menu's keyboard (src/ui/keys.ts): what each key does on each screen, and the home menu's stepping over
// muted items. docs/systems/front-menu.md ("Keyboard").
import { describe, it, expect } from 'vitest'
import { firstLive, keyAction, stepLive } from '../src/ui/keys.ts'
import type { Route } from '../src/ui/route.ts'

const HOME: Route = { screen: 'home' }
const HISTORY: Route = { screen: 'history' }
const ROSTER: Route = { screen: 'roster', kind: 'regiments', nation: 'north', arm: 'all', open: null }
const plate = (open: number): Route => ({ screen: 'roster', kind: 'regiments', nation: 'north', arm: 'all', open })

describe('keyAction', () => {
  it('moves and opens the home menu with the arrows and Enter', () => {
    expect(keyAction(HOME, 'ArrowDown', 0)).toEqual({ type: 'step', by: 1 })
    expect(keyAction(HOME, 'ArrowUp', 0)).toEqual({ type: 'step', by: -1 })
    expect(keyAction(HOME, 'Enter', 0)).toEqual({ type: 'activate' })
  })

  it('goes one level back on Escape, and does nothing with it at home', () => {
    expect(keyAction(plate(2), 'Escape', 5)).toEqual({ type: 'go', route: ROSTER })
    expect(keyAction(ROSTER, 'Escape', 5)).toEqual({ type: 'go', route: HISTORY })
    expect(keyAction(HISTORY, 'Escape', 0)).toEqual({ type: 'go', route: HOME })
    expect(keyAction(HOME, 'Escape', 0)).toBeNull()
  })

  it('turns the open plate with the arrows, stopping at either end', () => {
    expect(keyAction(plate(2), 'ArrowRight', 5)).toEqual({ type: 'go', route: plate(3) })
    expect(keyAction(plate(2), 'ArrowLeft', 5)).toEqual({ type: 'go', route: plate(1) })
    expect(keyAction(plate(4), 'ArrowRight', 5)).toBeNull()
    expect(keyAction(plate(0), 'ArrowLeft', 5)).toBeNull()
  })

  it('leaves other keys, and the arrows off home and plates, to the browser', () => {
    expect(keyAction(HOME, 'a', 0)).toBeNull()
    expect(keyAction(ROSTER, 'ArrowDown', 5)).toBeNull()
    expect(keyAction(HISTORY, 'Enter', 0)).toBeNull()
  })
})

describe('stepLive', () => {
  // the home menu: Campaign, Battles muted; History, Settings… as the page has them, plus a second live item
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
