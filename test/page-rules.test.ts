// The sim page's small rules (src/app/page-rules.ts).
import { describe, it, expect } from 'vitest'
import { pruneSelection, runSpeed, lastDropped, clockText, parseTime } from '../src/app/page-rules.ts'
import type { Formations, Dropped } from '../src/sim/index.ts'

const table = (alive: number[], gen: number[]) =>
  ({ alive: Uint8Array.from(alive), gen: Int32Array.from(gen) }) as unknown as Formations

describe('the selection', () => {
  // regression (battle threads PR 3 review): pruned on `alive` alone, a formation gone and its slot refilled
  // between two frames left the new one selected, so the next order went to it (an enemy, past `mine`)
  it('drops a formation whose slot was reused since it was chosen, and one that is gone', () => {
    const selected = new Set([0, 1, 2])
    const chosen = new Map([
      [0, 4],
      [1, 7],
      [2, 1],
    ])
    pruneSelection(selected, chosen, table([1, 1, 0], [4, 8, 1]))
    expect([...selected]).toEqual([0])
  })
})

describe('the battle speed', () => {
  // regression (battle threads PR 3 review): in the worker the battle no longer stopped with the page's frames
  it('is the panel speed, held at 0 while paused or hidden', () => {
    expect([runSpeed(4, false, false), runSpeed(4, true, false), runSpeed(4, false, true)]).toEqual([4, 0, 0])
  })
})

describe('the order dropped shown', () => {
  const d = (tick: number, seq: number) => ({ tick, seq, id: 0, reason: `at ${tick}` }) as unknown as Dropped
  // the bench (PR 7): after going back, an order dropped in a future the world has not reached again is not shown
  it("is the player's last the world has reached; the plan's refusals never", () => {
    const list = [d(10, 0), d(20, -1), d(30, 1)]
    expect([lastDropped(list, 40), lastDropped(list, 25), lastDropped(list, 5)]).toEqual([list[2], list[0], undefined])
  })
})

describe('the bench times', () => {
  // regression (PR 7 review): the seconds were rounded after the minutes were taken, so 59.95 s read 0:60
  it('reads a game time as m:ss, the rounding carried into the minutes', () => {
    expect([clockText(0), clockText(59.4), clockText(59.95), clockText(119.6), clockText(754)]).toEqual([
      '0:00',
      '0:59',
      '1:00',
      '2:00',
      '12:34',
    ])
  })
  it('takes m:ss or seconds, and nothing else', () => {
    expect([parseTime('1:30'), parseTime(' 90 '), parseTime('2.5'), parseTime('0:05')]).toEqual([90, 90, 2.5, 5])
    expect([parseTime('1:60'), parseTime('abc'), parseTime(''), parseTime('-3')]).toEqual([null, null, null, null])
  })
})
