// The look bench's long tasks (src/look/trace.ts longIn, battle threads PR 6): a run counts those begun in its own
// measured window, whenever the browser reports them, so neither the setup between runs nor a late report moves one
// into another run.
import { describe, it, expect } from 'vitest'
import { longIn } from '../src/look/trace.ts'

describe("a run's long tasks", () => {
  // start, duration (ms), by pairs, in the order the browser reported them
  const tasks = [100, 60, 250, 80, 400, 51, 399.5, 70]
  it('counts those begun in [t0, t1), and their time', () => {
    expect(longIn(tasks, 200, 400)).toEqual({ n: 2, ms: 150 })
  })
  // regression (PR 6 review round 2): held per frame, a setup's long task was charged to the next run's first frame
  it('leaves out a task begun before the window (the setup) and one begun at or after its end (the next run)', () => {
    expect(longIn(tasks, 101, 250)).toEqual({ n: 0, ms: 0 })
    expect(longIn(tasks, 100, 101)).toEqual({ n: 1, ms: 60 })
    expect(longIn([], 0, 1e9)).toEqual({ n: 0, ms: 0 })
  })
})
