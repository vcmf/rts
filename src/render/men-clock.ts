// When the soldier layer steps (docs/plans/active/battle-threads.md, PR 1): in rounds of MEN_HZ a real second,
// whatever the frame rate (the art bible's 12 fps), each round split into one sub-step per group of battalions,
// spread evenly over the round. A group's sub-step covers the game time since its last one. The steering holds
// only up to MEN_DT of game time a step: above it halted men near trunks jitter (measured: test/soldiers.test.ts at
// 8×), where its gains saturate (the arrival damping 1 − 8·dt is clamped at 0 from 1/8 s, the velocity blend 5·dt
// at 1 from 1/5 s) and the explicit step overshoots the pushes. So when a round would cover more, the rounds come
// faster, MEN_DT of game time each.

export const MEN_HZ = 12
// eight groups: at four, a sub-step at 16,000 men marching took 1.25 ms (the grid's rebuild in group 0's), and the
// p99 per 120 Hz frame was 1.72 ms; at eight, 0.95 ms (bench in the plan's PR 1 outcome)
export const MEN_GROUPS = 8
export const MEN_DT = 1 / 8
// the most rounds one frame catches up, as the layer's old MEN_STEPS: more would make a long frame's successor
// longer still at 8× (the page's longest frame, 0.1 s, owes 6.4 rounds there; the rest is dropped)
export const MEN_ROUNDS = 4

/** Takes one sub-step: the group of battalions to step, and the game seconds it covers. */
export type MenStep = (group: number, dt: number) => void

/** The soldier layer's clock: which group steps when, and for how much game time (see the file's head). */
export class MenClock {
  readonly groups: number
  private readonly hz: number
  private readonly maxDt: number
  private readonly rounds: number
  // real seconds owed to the sub-steps not yet taken, and the game time the sub-steps taken have reached
  private owed = 0
  private game = 0
  private next = 0
  private readonly last: Float64Array

  /**
   * @param hz rounds a real second at speeds up to `hz` · `maxDt`
   * @param groups sub-steps a round, one per group of battalions
   * @param maxDt the most game seconds one sub-step covers
   * @param rounds the most rounds one frame catches up
   */
  constructor(hz = MEN_HZ, groups = MEN_GROUPS, maxDt = MEN_DT, rounds = MEN_ROUNDS) {
    this.hz = hz
    this.maxDt = maxDt
    this.rounds = rounds
    this.groups = groups
    this.last = new Float64Array(groups)
  }

  /**
   * Advances by a frame of `realDt` seconds at `speed` (0: paused, nothing due) and takes the sub-steps now due, in
   * order, through `step` (no allocation: it runs every frame).
   * Each sub-step moves the clock's game time on by its share of a round, so the steps cover the frame's game time
   * at any frame rate. A frame owing more than `rounds` rounds drops the rest (the men fall behind the sim and
   * catch up, as they did when the layer stepped per frame). Returns how many sub-steps it took.
   */
  advance(realDt: number, speed: number, step: MenStep): number {
    if (speed <= 0) return 0
    const every = 1 / (Math.max(this.hz, speed / this.maxDt) * this.groups)
    this.owed += realDt
    let n = 0
    while (this.owed >= every - 1e-9 && n < this.rounds * this.groups) {
      n++
      this.owed -= every
      this.game += every * speed
      const g = this.next
      this.next = (g + 1) % this.groups
      // at most MEN_DT: only a change of speed within the round makes it more
      const dt = Math.min(this.maxDt, this.game - this.last[g])
      this.last[g] = this.game
      step(g, dt)
    }
    if (this.owed >= every) this.owed = 0
    return n
  }
}
