// What the battle's workers share (docs/plans/done/battle-threads.md, PRs 3 and 5): a bare message port (a browser
// worker's `self`, or Node's worker_threads in the tests), a timer loop, and one rule for errors: an error anywhere
// stops the worker for good, its loop and its requests alike, and is said to the page.

/** A worker's end of the page's messages. */
export interface Port<In> {
  postMessage(m: unknown): void
  onmessage: ((e: { data: In }) => void) | null
}

/** Sent to the page when a worker stops on an error. */
export interface Failed {
  type: 'error'
  message: string
}

// the loop's period (ms): a timer, clamped to about 4 ms by the browser once nested
const LOOP_MS = 2

/** A worker's loop and messages: `handle` takes each message, `step` is one turn of the loop once `start`ed. */
export class Host<In, Out> {
  private dead = false
  private readonly port: Port<In>
  private readonly step: () => void
  constructor(port: Port<In>, handle: (m: In) => void, step: () => void) {
    this.port = port
    this.step = step
    port.onmessage = e => {
      if (!this.dead) this.guard(() => handle(e.data))
    }
  }
  send(m: Out): void {
    this.port.postMessage(m)
  }
  /** Starts the loop. */
  start(): void {
    const loop = () => {
      if (this.dead) return
      this.guard(this.step)
      if (!this.dead) setTimeout(loop, LOOP_MS)
    }
    setTimeout(loop, LOOP_MS)
  }
  private guard(f: () => void): void {
    try {
      f()
    } catch (err) {
      this.dead = true
      this.port.postMessage({ type: 'error', message: err instanceof Error ? (err.stack ?? err.message) : String(err) })
    }
  }
}
