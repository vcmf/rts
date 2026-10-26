// The battle worker's side (docs/plans/active/battle-threads.md, PR 3): the battle on its own clock, published in
// three shared slots (src/app/battle-frame.ts), commands and requests from the page by message. Written against a
// bare message port, so a browser worker (src/app/battle-worker.ts) and Node's worker_threads (the tests) run the
// same code.
import { loadSimData, type Command, type Stamped, type Dropped, type HashPoint } from '../sim/index.ts'
import { PAGE_SCENARIOS } from '../scenarios/page.ts'
import { Battle } from './battle.ts'
import { layoutFor, writeFrame, capFor, Slots, type Layout } from './battle-frame.ts'

/** The worker's end of the page's messages. */
export interface Port {
  postMessage(m: unknown): void
  onmessage: ((e: { data: ToHost }) => void) | null
}

/** What the page sends: the battle to play (its scenario and map bytes), then commands and requests (`id` answered
 * by a `reply` with the same id). */
export type ToHost =
  | { type: 'init'; scenario: string; data: Uint8Array; version: number }
  | { type: 'command'; c: Command }
  | { type: 'speed'; speed: number }
  | { type: 'advance'; id: number; sec: number }
  | { type: 'replay'; id: number }
  | { type: 'hash'; id: number }
  | { type: 'record'; id: number; on: boolean }

/** What the host sends: the slots (again whenever the men outgrow them), what happened since the last message, and
 * answers. */
export type ToPage =
  | { type: 'slots'; ctl: SharedArrayBuffer; bufs: SharedArrayBuffer[]; cap: number }
  | { type: 'events'; log: Stamped[]; dropped: Dropped[]; hashes: HashPoint[] }
  | { type: 'reply'; id: number; value: unknown }
  | { type: 'error'; message: string }

// a frame at most every 1/120 s of real time, and the loop's own period (ms): a timer, clamped to about 4 ms by the
// browser once nested
const PUBLISH_MS = 1000 / 120
const LOOP_MS = 2

/** Per advance while recording: its real ms, the ticks' and the steps' ms, the ticks and sub-steps it ran. */
export interface Recording {
  loopMs: number[]
  tickMs: number[]
  stepMs: number[]
  ticks: number[]
  subSteps: number[]
  pubMs: number[]
}

/** Serves one battle on `port` until the worker ends. */
export function serveBattle(port: Port): void {
  let battle: Battle | null = null
  let L: Layout
  let slots: Slots
  let bufs: SharedArrayBuffer[] = []
  let seq = 0
  let lastPub = -Infinity
  let changed = true
  let sent = { log: 0, dropped: 0, hashes: 0 }
  let rec: Recording | null = null
  const ema = { tickMs: 0, stepMs: 0, pubMs: 0 }
  const send = (m: ToPage) => port.postMessage(m)

  const makeSlots = (cap: number) => {
    L = layoutFor(battle!.w, cap)
    slots = Slots.make(true)
    bufs = [0, 1, 2].map(() => new SharedArrayBuffer(L.bytes))
    send({ type: 'slots', ctl: slots.ctl.buffer as SharedArrayBuffer, bufs, cap })
  }
  const publish = () => {
    const b = battle!
    const a = performance.now()
    if (b.layer.men.n > L.cap) makeSlots(capFor(b.layer.men.n))
    const s = slots.free()
    writeFrame(b, bufs[s], L, { ...ema, seq: ++seq })
    slots.publish(s)
    const ms = performance.now() - a
    ema.pubMs = ema.pubMs * 0.9 + ms * 0.1
    if (rec) rec.pubMs.push(ms)
    lastPub = a
    changed = false
  }
  // what happened since the last message, in order: the stamped log, orders dropped, hash points
  const flush = () => {
    const b = battle!
    if (b.log.length === sent.log && b.dropped.length === sent.dropped && b.hashes.length === sent.hashes) return
    send({
      type: 'events',
      log: b.log.slice(sent.log),
      dropped: b.dropped.slice(sent.dropped),
      hashes: b.hashes.slice(sent.hashes),
    })
    sent = { log: b.log.length, dropped: b.dropped.length, hashes: b.hashes.length }
  }
  let last = performance.now()
  const loop = () => {
    try {
      step()
    } catch (err) {
      // the battle stops: said to the page, which shows it on its console
      send({ type: 'error', message: err instanceof Error ? (err.stack ?? err.message) : String(err) })
      return
    }
    setTimeout(loop, LOOP_MS)
  }
  // one turn of the loop: the time owed since the last, the frame published when due, the events
  const step = () => {
    const now = performance.now()
    const dt = Math.min(0.1, (now - last) / 1000)
    last = now
    // at speed 0 (paused, or held by the headless checks' advance) nothing is owed
    const r = battle!.advance(dt)
    if (r.ticks || r.subSteps) {
      changed = true
      ema.tickMs = ema.tickMs * 0.9 + r.tickMs * 0.1
      ema.stepMs = ema.stepMs * 0.9 + r.stepMs * 0.1
    }
    if (rec) {
      rec.loopMs.push(dt * 1000)
      rec.tickMs.push(r.tickMs)
      rec.stepMs.push(r.stepMs)
      rec.ticks.push(r.ticks)
      rec.subSteps.push(r.subSteps)
    }
    if (changed && now - lastPub >= PUBLISH_MS) publish()
    flush()
  }

  port.onmessage = e => {
    const m = e.data
    try {
      if (m.type === 'init') {
        const scenario = PAGE_SCENARIOS[m.scenario]
        if (!scenario) throw new Error(`battle worker: no scenario ${m.scenario}`)
        battle = new Battle(loadSimData(m.data, m.version), scenario)
        makeSlots(capFor(battle.layer.men.n))
        publish()
        flush()
        last = performance.now()
        setTimeout(loop, LOOP_MS)
        return
      }
      const b = battle
      if (!b) throw new Error(`battle worker: ${m.type} before init`)
      if (m.type === 'command') {
        b.command(m.c)
        flush()
      } else if (m.type === 'speed') {
        b.speed = m.speed
        changed = true
      } else if (m.type === 'advance') {
        // then held, as the page held itself before: until the page sets a speed again
        b.advanceBy(m.sec)
        b.speed = 0
        publish()
        flush()
        send({ type: 'reply', id: m.id, value: null })
      } else if (m.type === 'replay') send({ type: 'reply', id: m.id, value: b.replay() })
      else if (m.type === 'hash') send({ type: 'reply', id: m.id, value: b.hash() })
      else if (m.type === 'record') {
        const done = rec
        rec = m.on ? { loopMs: [], tickMs: [], stepMs: [], ticks: [], subSteps: [], pubMs: [] } : null
        send({ type: 'reply', id: m.id, value: done })
      }
    } catch (err) {
      send({ type: 'error', message: err instanceof Error ? (err.stack ?? err.message) : String(err) })
    }
  }
}
