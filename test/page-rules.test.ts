// The sim page's small rules (src/app/page-rules.ts).
import { describe, it, expect } from 'vitest'
import { pruneSelection, runSpeed } from '../src/app/page-rules.ts'
import type { Formations } from '../src/sim/index.ts'

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
