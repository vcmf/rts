// The men worker (docs/plans/active/battle-threads.md, PR 5): the soldier layer on its own copy of the world, the
// ticks taken from the tick ring (src/app/tick-ring.ts) in order and each followed by the layer's sync, its clock run
// at the sim's speed, and the page's published frames (src/app/battle-frame.ts, as PR 3 published them).
import { loadSimData, compileRuleset, makeWorld, DT, type World } from '../sim/index.ts'
import { napoleonic } from '../rulesets/napoleonic.ts'
import { PAGE_SEED } from '../scenarios/page.ts'
import { buildScene } from '../render/scene.ts'
import { SoldierLayer } from '../render/soldiers.ts'
import { MenClock } from '../render/men-clock.ts'
import { layoutFor, writeFrame, capFor, Slots, type Layout } from './battle-frame.ts'
import { RingReader, accSince, type RingBuffers, type Clock } from './tick-ring.ts'
import { Host, type Port, type Failed } from './host.ts'

/** What the page sends the men worker: the map's bytes and the tick ring, then requests. */
export type ToMen =
  | { type: 'init'; data: Uint8Array; version: number; ring: RingBuffers }
  | { type: 'advance'; id: number; sec: number }
  | { type: 'record'; id: number; on: boolean }

/** What the men worker sends: the frame slots (again when the men outgrow them), and answers. */
export type FromMen =
  | { type: 'slots'; ctl: SharedArrayBuffer; bufs: SharedArrayBuffer[]; cap: number }
  | { type: 'reply'; id: number; value: unknown }
  | Failed

/** Per turn of the loop while recording: its real ms, the ticks taken and skipped, the sub-steps and their ms, and
 * each publish's ms. */
export interface MenRecording {
  loopMs: number[]
  taken: number[]
  skipped: number[]
  subSteps: number[]
  stepMs: number[]
  syncMs: number[]
  pubMs: number[]
}

// a frame at most every 1/120 s of real time; at most this many ticks taken a turn (then the loop steps the men, and
// takes the rest at its next turn, or jumps if they are gone from the ring)
const PUBLISH_MS = 1000 / 120
const TAKE = 16

/** Serves the men of one battle on `port` until the worker ends. */
export function serveMen(port: Port<ToMen>): void {
  let w: World
  let layer: SoldierLayer
  let ring: RingReader
  const clock = new MenClock()
  let L: Layout
  let slots: Slots | null = null
  let bufs: SharedArrayBuffer[] = []
  // the world's version (a tick taken changes it), and each slot's copy's: the world is copied only when it changed
  let worldVer = 0
  let slotVer = [-1, -1, -1]
  let lastPub = -Infinity
  let changed = true
  let rec: MenRecording | null = null
  const ema = { tickMs: 0, stepMs: 0, pubMs: 0 }
  let last = performance.now()
  // the last tick taken: none at first (−1), so the world before the first tick (tick 0) is taken too
  let lastTick = -1
  // the frame's clock: the game time since the men's world's tick (the sim's clock read against it), and the speed;
  // a change of speed (a pause) is published, so the page stops its anchors' alpha too
  const src = { w: null as unknown as World, layer: null as unknown as SoldierLayer, acc: 0, speed: 0 }
  // the clock, read once a turn (one snapshot for the speed, the alpha and the frame's tick cost)
  let k: Clock
  const now = () => {
    k = ring.clockNow()
    if (k.speed !== src.speed) changed = true
    src.speed = k.speed
    src.acc = accSince(k, lastTick, performance.timeOrigin + performance.now())
  }
  const stepMen = (group: number, dt: number) => layer.step(dt, src.acc / DT, group, clock.groups)

  // the ticks waiting, in order, each synced (at most `max`); returns how many were taken and skipped
  const take = (max: number) => {
    let taken = 0
    let skipped = 0
    for (; taken < max; taken++) {
      const t = ring.take(w, lastTick)
      if (!t) break
      lastTick = t.tick
      skipped += t.skipped
      layer.sync(0, t.departed)
    }
    if (taken) {
      worldVer++
      changed = true
    }
    return { taken, skipped }
  }
  const makeSlots = (cap: number) => {
    L = layoutFor(w, cap)
    slots = Slots.make(true)
    bufs = [0, 1, 2].map(() => new SharedArrayBuffer(L.bytes))
    slotVer = [-1, -1, -1]
  }
  // the page gets new slots only once a frame is published in them, so it never holds one with nothing in it
  const publish = () => {
    const a = performance.now()
    const fresh = !slots || layer.men.n > L.cap
    if (fresh) makeSlots(capFor(layer.men.n))
    const s = slots!.free()
    ema.tickMs = k.tickMs
    writeFrame(src, bufs[s], L, ema, slotVer[s] !== worldVer)
    slotVer[s] = worldVer
    slots!.publish(s)
    if (fresh) host.send({ type: 'slots', ctl: slots!.ctl.buffer as SharedArrayBuffer, bufs, cap: L.cap })
    const ms = performance.now() - a
    ema.pubMs = ema.pubMs * 0.9 + ms * 0.1
    rec?.pubMs.push(ms)
    lastPub = a
    changed = false
  }
  // one turn: the ticks waiting, then the men's sub-steps due at the sim's speed, then the frame when due
  const step = () => {
    const t0 = performance.now()
    const dt = Math.min(0.1, (t0 - last) / 1000)
    last = t0
    const got = take(TAKE)
    const t1 = performance.now()
    now()
    const subSteps = clock.advance(dt, src.speed, stepMen)
    layer.alphaNow = src.acc / DT
    const t2 = performance.now()
    if (subSteps) {
      changed = true
      ema.stepMs = ema.stepMs * 0.9 + (t2 - t1) * 0.1
    }
    if (rec) {
      rec.loopMs.push(dt * 1000)
      rec.taken.push(got.taken)
      rec.skipped.push(got.skipped)
      rec.subSteps.push(subSteps)
      rec.stepMs.push(t2 - t1)
      rec.syncMs.push(t1 - t0)
    }
    if (changed && t2 - lastPub >= PUBLISH_MS) publish()
  }
  const handle = (m: ToMen) => {
    if (m.type === 'init') {
      w = makeWorld(loadSimData(m.data, m.version), compileRuleset(napoleonic), PAGE_SEED, false)
      layer = new SoldierLayer(w, buildScene(w))
      src.w = w
      src.layer = layer
      ring = new RingReader(w, m.ring)
      // the world before the first tick: the page starts this worker once the sim worker has written it
      if (!take(TAKE).taken) throw new Error('men worker: the tick ring is empty (the sim worker not started)')
      now()
      publish()
      last = performance.now()
      host.start()
      return
    }
    if (!slots) throw new Error(`men worker: ${m.type} before init`)
    if (m.type === 'advance') {
      // after the sim's advance (the page asks it first): the ticks it can take, the newest at least, then its clock
      // `sec` of game time at 1× in 1/30 s frames, so the men stand where the battle now has them
      while (take(TAKE).taken);
      now()
      for (let n = Math.round(m.sec * 30); n > 0; n--) clock.advance(1 / 30, 1, stepMen)
      layer.alphaNow = src.acc / DT
      changed = true
      publish()
      last = performance.now()
      host.send({ type: 'reply', id: m.id, value: null })
    } else if (m.type === 'record') {
      const done = rec
      rec = m.on ? { loopMs: [], taken: [], skipped: [], subSteps: [], stepMs: [], syncMs: [], pubMs: [] } : null
      host.send({ type: 'reply', id: m.id, value: done })
    }
  }
  const host = new Host<ToMen, FromMen>(port, handle, step)
}
