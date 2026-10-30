// A turn's day as a timeline (the campaign proposal, PR #234: A turn is a timeline): events handled one at a time in
// the order of their time, then of their id, so events at the same minute play in the same order on every machine
// (decisions 0006, 0013). Handling an event may queue later ones (a courier sent, an arrival due).

/** An event of the day: when, a unique id fixing the order of equal times, and what it carries. */
export interface CampaignEvent<T> {
  t: number
  id: number
  data: T
}

/** Whether event a comes before event b. */
const before = <T>(a: CampaignEvent<T>, b: CampaignEvent<T>) => a.t < b.t || (a.t === b.t && a.id < b.id)

/** The day's events, earliest first (a binary heap). */
export class Timeline<T> {
  private heap: CampaignEvent<T>[] = []

  get size(): number {
    return this.heap.length
  }

  /** Queues an event. */
  push(event: CampaignEvent<T>): void {
    const h = this.heap
    let k = h.length
    h.push(event)
    while (k > 0) {
      const parent = (k - 1) >> 1
      if (!before(event, h[parent])) break
      h[k] = h[parent]
      k = parent
    }
    h[k] = event
  }

  /** Removes and returns the earliest event (the lowest id on a tie), or undefined when none is left. */
  pop(): CampaignEvent<T> | undefined {
    const h = this.heap
    const top = h[0]
    const last = h.pop()
    if (!h.length || last === undefined) return top
    let k = 0
    for (;;) {
      let child = 2 * k + 1
      if (child >= h.length) break
      if (child + 1 < h.length && before(h[child + 1], h[child])) child++
      if (!before(h[child], last)) break
      h[k] = h[child]
      k = child
    }
    h[k] = last
    return top
  }

  /**
   * Plays the events up to and including `untilMin`, in order, each handed to `handle`, which may queue more (an
   * event queued for a time already past plays next). Returns how many were played.
   */
  play(untilMin: number, handle: (event: CampaignEvent<T>, timeline: Timeline<T>) => void): number {
    let played = 0
    while (this.heap.length && this.heap[0].t <= untilMin) {
      handle(this.pop()!, this)
      played++
    }
    return played
  }
}
