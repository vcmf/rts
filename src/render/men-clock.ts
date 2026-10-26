// When the soldier layer steps (docs/plans/active/battle-threads.md, PR 1): in rounds of MEN_HZ a real second,
// whatever the frame rate (the art bible's 12 fps), each round split into one sub-step per group of battalions,
// spread evenly over the round. A group's sub-step covers the game time since its last one. The steering holds
// only up to MEN_DT of game time a step (its arrival damping, 1 − 8·dt, is gone at 1/8 s, and halted men near
// trunks jitter: test/soldiers.test.ts at 8×), so above 1.5× the rounds come faster, MEN_DT of game time each:
// 16 Hz at 2×, 64 Hz at 8×.

export const MEN_HZ = 12
// eight groups: at four, a sub-step at 16,000 men marching took 1.25 ms (the grid's rebuild in group 0's), and the
// p99 per 120 Hz frame was 1.72 ms; at eight, 0.95 ms (bench in the plan's PR 1 outcome)
export const MEN_GROUPS = 8
export const MEN_DT = 1 / 8

/** One sub-step: the group of battalions to step, and the game seconds it covers. */
export interface MenStep {
  group: number
  dt: number
}

export class MenClock {
  readonly groups: number
  private readonly hz: number
  private readonly maxDt: number
  private owed = 0
  private game = 0
  private next = 0
  private readonly last: Float64Array

  constructor(hz = MEN_HZ, groups = MEN_GROUPS, maxDt = MEN_DT) {
    this.hz = hz
    this.maxDt = maxDt
    this.groups = groups
    this.last = new Float64Array(groups)
  }

  /**
   * Advances by a frame of `realDt` seconds at `speed` (0: paused, nothing due) and returns the sub-steps now due, at
   * most one round: a frame longer than a round drops the rest, and the steps after it cover at most MEN_DT (the
   * men fall behind the sim and catch up, as they did when the layer stepped per frame).
   */
  advance(realDt: number, speed: number): MenStep[] {
    if (speed <= 0) return []
    const every = 1 / (Math.max(this.hz, speed / this.maxDt) * this.groups)
    this.game += realDt * speed
    this.owed += realDt
    const due: MenStep[] = []
    while (this.owed >= every - 1e-9 && due.length < this.groups) {
      this.owed -= every
      const g = this.next
      this.next = (g + 1) % this.groups
      due.push({ group: g, dt: Math.min(this.maxDt, this.game - this.last[g]) })
      this.last[g] = this.game
    }
    if (due.length === this.groups) this.owed = Math.min(this.owed, every)
    return due
  }
}
