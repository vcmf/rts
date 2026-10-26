// The sim worker (docs/plans/active/battle-threads.md, PR 5): the battle's sim on its own clock, without its men.
// After every tick it writes the world to the tick ring (src/app/tick-ring.ts) for the men worker
// (src/app/men-host.ts), and the game clock to the ring's header; commands and requests come from the page, the log,
// the orders dropped and the hash points go back to it.
import { loadSimData, M_TICK, type Command, type Stamped, type Dropped, type HashPoint } from '../sim/index.ts'
import { PAGE_SCENARIOS } from '../scenarios/page.ts'
import { Battle } from './battle.ts'
import { RingWriter, type RingBuffers } from './tick-ring.ts'
import { Host, type Port, type Failed } from './host.ts'

/** What the page sends the sim worker: the battle (its scenario's key in PAGE_SCENARIOS, the map's bytes, the tick
 * ring), then commands and requests (`id` answered by a `reply` with the same id). */
export type ToSim =
  | { type: 'init'; scenario: string; data: Uint8Array; version: number; ring: RingBuffers }
  | { type: 'command'; c: Command }
  | { type: 'speed'; speed: number }
  | { type: 'advance'; id: number; sec: number }
  | { type: 'replay'; id: number }
  | { type: 'hash'; id: number }
  | { type: 'record'; id: number; on: boolean }

/** What the sim worker sends: what happened since its last message, and answers. */
export type FromSim =
  | { type: 'ready' } // the world before the first tick is in the ring
  | { type: 'events'; log: Stamped[]; dropped: Dropped[]; hashes: HashPoint[] }
  | { type: 'reply'; id: number; value: unknown }
  | Failed

/** Per turn of the loop while recording: its real ms, the ticks' ms (the sim's own) and the ring's, the ticks. */
export interface SimRecording {
  loopMs: number[]
  tickMs: number[]
  ringMs: number[]
  ticks: number[]
}

/** Serves one battle's sim on `port` until the worker ends. */
export function serveSim(port: Port<ToSim>): void {
  let battle: Battle | null = null
  let ring: RingWriter | null = null
  let sent = { log: 0, dropped: 0, hashes: 0 }
  let rec: SimRecording | null = null
  let tickMs = 0
  // the time the turn's ticks spent writing the ring (left out of the tick's cost: the sim's own is what is measured)
  let ringMs = 0
  let last = performance.now()

  // what happened since the last message, in order: the stamped log, orders dropped, hash points
  const flush = () => {
    const b = battle!
    if (b.log.length === sent.log && b.dropped.length === sent.dropped && b.hashes.length === sent.hashes) return
    host.send({
      type: 'events',
      log: b.log.slice(sent.log),
      dropped: b.dropped.slice(sent.dropped),
      hashes: b.hashes.slice(sent.hashes),
    })
    sent = { log: b.log.length, dropped: b.dropped.length, hashes: b.hashes.length }
  }
  const clock = () => ring!.setClock(battle!.w.meta[M_TICK], battle!.acc, battle!.speed, tickMs)
  // one turn: the ticks owed since the last (none at speed 0: paused, or held after the checks' advance), the clock
  const step = () => {
    const now = performance.now()
    const dt = Math.min(0.1, (now - last) / 1000)
    last = now
    ringMs = 0
    const r = battle!.advance(dt)
    const simMs = r.tickMs - ringMs
    if (r.ticks) tickMs = tickMs * 0.9 + (simMs / r.ticks) * 0.1
    clock()
    if (rec) {
      rec.loopMs.push(dt * 1000)
      rec.tickMs.push(simMs)
      rec.ringMs.push(ringMs)
      rec.ticks.push(r.ticks)
    }
    flush()
  }
  const handle = (m: ToSim) => {
    if (m.type === 'init') {
      const scenario = Object.hasOwn(PAGE_SCENARIOS, m.scenario) ? PAGE_SCENARIOS[m.scenario] : undefined
      if (!scenario) throw new Error(`sim worker: no scenario ${m.scenario}`)
      const data = loadSimData(m.data, m.version)
      // the world before the first tick too, so the men worker starts from the scenario as set up
      let writer: RingWriter | null = null
      battle = new Battle(data, scenario, undefined, {
        men: false,
        onTick: (w, r) => {
          const a = performance.now()
          writer!.write(w, r.departed)
          ringMs += performance.now() - a
        },
      })
      writer = ring = new RingWriter(battle.w, m.ring)
      ring.write(battle.w, [])
      clock()
      last = performance.now()
      host.start()
      host.send({ type: 'ready' })
      return
    }
    const b = battle
    if (!b) throw new Error(`sim worker: ${m.type} before init`)
    if (m.type === 'command') {
      b.command(m.c)
      flush()
    } else if (m.type === 'speed') {
      b.speed = m.speed
      clock()
    } else if (m.type === 'advance') {
      // then held, as the page held itself before: until the page sets a speed again
      b.advanceBy(m.sec)
      b.speed = 0
      clock()
      flush()
      host.send({ type: 'reply', id: m.id, value: null })
    } else if (m.type === 'replay') host.send({ type: 'reply', id: m.id, value: b.replay() })
    else if (m.type === 'hash') host.send({ type: 'reply', id: m.id, value: b.hash() })
    else if (m.type === 'record') {
      const done = rec
      rec = m.on ? { loopMs: [], tickMs: [], ringMs: [], ticks: [] } : null
      host.send({ type: 'reply', id: m.id, value: done })
    }
  }
  const host = new Host<ToSim, FromSim>(port, handle, step)
}
