// The battle worker (docs/plans/active/battle-threads.md, PR 3): the published frame read in place equals the battle
// it was written from, the slot protocol never hands the reader a slot being written, and the battle played in a
// real worker thread (Node's worker_threads, the same host code as the browser's) reproduces the main thread's.
import { describe, it, expect } from 'vitest'
import { Worker } from 'node:worker_threads'
import { dataBytes, GOLDEN_DATA_VERSION } from './fx.ts'
import {
  loadSimData,
  compileRuleset,
  columns,
  hashWorld,
  sectionHashes,
  makeHandle,
  makeWorld,
  KIND_FORMATION,
  M_TICK,
  DT,
  play,
} from '../src/sim/index.ts'
import { napoleonic } from '../src/rulesets/napoleonic.ts'
import { PAGE_SCENARIOS } from '../src/scenarios/page.ts'
import { Battle } from '../src/app/battle.ts'
import { FrameView, layoutFor, writeFrame, capFor, Slots } from '../src/app/battle-frame.ts'
import { WorkerLink } from '../src/app/battle-link.ts'
import { makeRing, RingWriter, RingReader, RING, accSince } from '../src/app/tick-ring.ts'

const data = loadSimData(dataBytes(), GOLDEN_DATA_VERSION)
const cr = compileRuleset(napoleonic)
const scenario = PAGE_SCENARIOS['s1b-field']
const stats = { tickMs: 0, stepMs: 0, pubMs: 0, seq: 1 }

describe('the published frame', () => {
  it('read in place, it is the battle: every column, every man, every battalion', () => {
    const b = new Battle(data, PAGE_SCENARIOS['s1c-firefight'])
    b.command({ type: 'fire', id: makeHandle(KIND_FORMATION, 0, b.w.f.gen[0]), mode: 'at will' })
    b.advanceBy(20)
    const L = layoutFor(b.w, capFor(b.layer.men.n))
    const buf = new ArrayBuffer(L.bytes)
    expect(writeFrame(b, buf, L, stats)).toBe(true)
    const v = new FrameView(data, cr, b.w.terrain, b.scene, buf, L)
    v.read(0)
    const flat = (w: typeof b.w) => [w.meta, w.rng, w.free, ...[w.f, w.sides, w.ord].flatMap(t => columns(t))]
    expect(
      flat(v.w).every((c, k) => c.length === flat(b.w)[k].length && c.every((x, j) => Object.is(x, flat(b.w)[k][j]))),
    ).toBe(true)
    // the hash covers the pending commands too, which the frame leaves out: none are pending after a tick
    expect(hashWorld(v.w)).toBe(hashWorld(b.w))
    const M = b.layer.men
    const V = v.layer.men
    expect(V.n).toBe(M.n)
    for (const k of ['x', 'z', 'vx', 'vz', 's', 'flags', 'yaw', 'gait'] as const) {
      expect([...V[k].subarray(0, V.n)]).toEqual([...M[k].subarray(0, M.n)])
    }
    expect(
      [...v.layer.units.values()].map(u => [
        u.i,
        u.group,
        u.side,
        u.figure,
        [...u.ids.subarray(0, u.n)].map(m => V.x[m]),
      ]),
    ).toEqual(
      [...b.layer.units.values()].map(u => [
        u.i,
        u.group,
        u.side,
        u.figure,
        [...u.ids.subarray(0, u.n)].map(m => M.x[m]),
      ]),
    )
    // the readers' geometry (the map's places) on the view's world: the same slot error as the battle's
    v.layer.alphaNow = b.layer.alphaNow
    expect(v.layer.slotError()).toEqual(b.layer.slotError())
  })
  it('refuses men it has no room for, writing nothing', () => {
    const b = new Battle(data, scenario)
    b.advanceBy(1)
    const L = layoutFor(b.w, 16)
    const buf = new ArrayBuffer(L.bytes)
    expect(writeFrame(b, buf, L, stats)).toBe(false)
    expect(new Uint8Array(buf).every(x => x === 0)).toBe(true)
  })
})

describe('the slot protocol', () => {
  // the writer in two phases (a slot taken, filled, then published) and the reader's hold, interleaved at random,
  // the writer acting between the reader's load of the newest and its hold too (hold's `between`), which is the
  // race its re-check exists for: the reader must never come away holding the slot being filled
  it('the reader never holds the slot being written, and holds a complete one', () => {
    const s = Slots.make(false)
    expect(s.hold()).toBe(-1)
    let r = 7
    const rnd = () => (r = (r * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
    let filling = -1
    let raced = 0
    const write = () => {
      if (filling < 0) {
        filling = s.free()
      } else {
        s.publish(filling)
        filling = -1
      }
    }
    write()
    write()
    for (let n = 0; n < 20000; n++) {
      if (rnd() < 0.5) write()
      else {
        const held = s.hold(() => {
          // a few writer steps inside the reader's hold
          for (let k = Math.floor(rnd() * 3); k > 0; k--) {
            write()
            raced++
          }
        })
        expect(held).not.toBe(filling)
        expect(held).toBeGreaterThanOrEqual(0)
      }
    }
    expect(raced).toBeGreaterThan(1000)
  })
  it('without its re-check, the same run hands the reader a slot being written', () => {
    // the negative: hold as a bare load then store fails this test's own check
    const s = Slots.make(false)
    let filling = -1
    const write = () => {
      if (filling < 0) filling = s.free()
      else {
        s.publish(filling)
        filling = -1
      }
    }
    write()
    write()
    // the reader loads the newest (slot 0), the writer publishes 1 and starts filling 0 again before the hold
    const latest = Atomics.load(s.ctl, 0)
    write()
    write()
    write()
    Atomics.store(s.ctl, 1, latest)
    expect(latest).toBe(filling)
  })
})

describe('the tick ring', () => {
  const setup = () => {
    const b = new Battle(data, PAGE_SCENARIOS['s1c-firefight'], cr, { men: false })
    const ring = makeRing(b.w)
    const writer = new RingWriter(b.w, ring)
    const copy = makeWorld(data, cr, 0, false, b.w.terrain)
    return { b, ring, writer, copy, reader: new RingReader(copy, ring) }
  }
  // regression (PR 5): the men worker asked for ticks after its fresh world's own (0), so the world before the first
  // tick was never taken, and a men worker started before the sim's first tick found the ring empty
  it('gives the world before the first tick (tick 0) to a reader that has taken none', () => {
    const { b, writer, copy, reader } = setup()
    writer.write(b.w, [])
    expect(reader.take(copy, -1)?.tick).toBe(0)
    // the scenario's spawns wait as commands for tick 1: the ring carries the state, not the commands pending
    const state = (w: typeof copy) => sectionHashes(w).filter(([name]) => name !== 'pending commands')
    expect(state(copy)).toEqual(state(b.w))
  })
  it('takes the ticks in order, each the world as it stood, with its departures', () => {
    const { b, writer, copy, reader } = setup()
    const seen: number[] = []
    for (let k = 0; k < 5; k++) {
      b.advance(DT)
      writer.write(b.w, k === 2 ? [{ id: 77, men: 12 }] : [])
      const t = reader.take(copy, copy.meta[M_TICK])!
      seen.push(t.tick)
      expect(hashWorld(copy)).toBe(hashWorld(b.w))
      expect(t.departed).toEqual(k === 2 ? [{ id: 77, men: 12 }] : [])
    }
    expect(seen).toEqual([1, 2, 3, 4, 5])
    expect(reader.take(copy, copy.meta[M_TICK])).toBeNull()
  })
  // regression (PR 5 review): a reader behind jumped to the newest tick, and the departures of the ticks it passed
  // over were lost, so a formation that left the field was drawn as fallen
  // the checks' advance writes its ticks' departures only (its men read its last world): no world in between exists
  // for a men worker to take, whatever the threads' timing (PR 5 review)
  it('a departures-only write leaves the slots as they were; its departures come with the next world', () => {
    const { b, writer, copy, reader } = setup()
    b.advance(DT)
    writer.write(b.w, [])
    expect(reader.take(copy, -1)!.tick).toBe(1)
    b.advance(DT)
    writer.write(b.w, [{ id: 5, men: 40 }], false)
    expect(reader.take(copy, 1)).toBeNull()
    b.advance(DT)
    writer.write(b.w, [])
    expect(reader.take(copy, 1)).toMatchObject({ tick: 3, skipped: 1, departed: [{ id: 5, men: 40 }] })
  })
  it('a reader behind the ring takes the oldest tick it still holds, and every departure since its last', () => {
    const { b, writer, copy, reader } = setup()
    for (let k = 1; k <= RING + 3; k++) {
      b.advance(DT)
      writer.write(b.w, k === 2 ? [{ id: 77, men: 12 }] : [])
    }
    // ticks 4 to 11 in the ring; 1 to 3 gone, the departure of tick 2 with them but for the log
    const t = reader.take(copy, 0)!
    expect([t.tick, t.skipped, t.departed]).toEqual([4, 3, [{ id: 77, men: 12 }]])
    expect(reader.take(copy, 4)!.departed).toEqual([])
  })
  // regression (PR 5 review): the men's alpha was the sim's leftover game time whatever tick the men's world was at, so
  // a men worker a tick behind (or ahead of the clock's last write) drew its anchors a tick off
  it("reads the game time since the men's own tick: a tick behind is a whole tick, ahead of the clock none", () => {
    const { writer, reader } = setup()
    writer.setClock(5, 0.02, 0, 1.5)
    const now = performance.timeOrigin + performance.now()
    expect(accSince(reader.clockNow(), 5, now)).toBeCloseTo(0.02, 12)
    expect(accSince(reader.clockNow(), 4, now)).toBe(DT)
    expect(accSince(reader.clockNow(), 6, now)).toBe(0)
    expect(reader.clockNow()).toMatchObject({ tick: 5, acc: 0.02, speed: 0, tickMs: 1.5 })
  })
  // the writer's half: a writer that finds the slot it claimed held puts its stamp back and takes another
  it('a writer never fills the slot the reader holds: the tick copied while held is the tick it was', () => {
    const { b, writer, copy, reader } = setup()
    let wrote = 0
    let last = -1
    for (let n = 0; n < 100; n++) {
      b.advance(DT)
      writer.write(b.w, [])
      const t = reader.take(copy, last, undefined, () => {
        // the whole ring rewritten while the reader holds its slot: every other slot, never that one
        for (let k = 0; k < 2 * RING; k++) {
          b.advance(DT)
          writer.write(b.w, [])
          wrote++
        }
      })
      if (!t) continue
      last = t.tick
      expect(copy.meta[M_TICK]).toBe(t.tick)
    }
    expect(wrote).toBe(100 * 2 * RING)
  })
  // the race the reader's check exists for: the writer reuses the slot between the reader finding it and holding it
  it('the writer never fills the slot the reader is taking: a tick taken is always whole', () => {
    const { b, writer, copy, reader } = setup()
    let raced = 0
    let last = 0
    for (let n = 0; n < 400; n++) {
      b.advance(DT)
      writer.write(b.w, [])
      let first = true
      const t = reader.take(copy, last, () => {
        // on the first look only (a retry must be able to succeed): enough ticks to wrap the ring onto the slot found
        if (!first) return
        first = false
        for (let k = 0; k < RING; k++) {
          b.advance(DT)
          writer.write(b.w, [])
          raced++
        }
      })
      if (!t) continue
      last = t.tick
      // the copy is the tick it says (the world then: its meta's tick), never a mixture
      expect(copy.meta[M_TICK]).toBe(t.tick)
    }
    expect(raced).toBeGreaterThan(1000)
    // drained, the copy is the newest
    for (let t = reader.take(copy, last); t; t = reader.take(copy, last)) last = t.tick
    expect(hashWorld(copy)).toBe(hashWorld(b.w))
  })
})

/** A Node worker thread running one of the battle's hosts, as a browser `Worker` to the page's link. */
function nodeWorker(which: 'sim' | 'men'): { w: Worker; asBrowser: globalThis.Worker } {
  const w = new Worker(new URL('./fx-battle-workers.ts', import.meta.url), { workerData: which })
  const asBrowser = {
    postMessage: (m: unknown) => w.postMessage(m),
    terminate: () => void w.terminate(),
    set onerror(fn: (e: { message: string }) => void) {
      w.on('error', e => fn({ message: e.message }))
    },
    set onmessage(fn: (e: { data: unknown }) => void) {
      w.on('message', d => fn({ data: d }))
    },
  } as unknown as globalThis.Worker
  return { w, asBrowser }
}

/** The page's link to the scenario `key` played in two worker threads, and how to end them. */
function startLink(key: string): { link: WorkerLink; stop: () => Promise<void> } {
  const sim = nodeWorker('sim')
  const men = nodeWorker('men')
  const link = new WorkerLink(sim.asBrowser, men.asBrowser, dataBytes(), data, cr, key)
  return { link, stop: async () => void (await Promise.all([sim.w.terminate(), men.w.terminate()])) }
}

describe('the battle in a worker thread', () => {
  it("plays a battle the main thread reproduces: the worker's stamped log, replayed here, gives its every hash point", async () => {
    const { link, stop } = startLink('s1b-field')
    try {
      await link.ready()
      // on its own clock at 4×, commands arriving whenever they do, then held and advanced on request
      link.setSpeed(4)
      for (const h of [0, 1, 2]) {
        link.command({ type: 'move', id: makeHandle(KIND_FORMATION, h, 1), points: [[-40, 10 * h]], append: false })
      }
      await new Promise(r => setTimeout(r, 100))
      link.command({ type: 'form', id: makeHandle(KIND_FORMATION, 3, 1), shape: 'square' })
      link.command({ type: 'fire', id: makeHandle(KIND_FORMATION, 0, 1), mode: 'at will' })
      await link.advance(20)
      const { replay, hashes } = await link.replay()
      expect(replay.log.length).toBe(5)
      // the 20 s advanced alone take 20 hash points (one every 20 ticks)
      expect(hashes.length).toBeGreaterThanOrEqual(20)
      expect(play(replay, data, cr, scenario, hashes)).toBeNull()
      // the page's copies of the events, and its view of the newest frame, are that battle's
      expect([link.log.length, link.hashes.map(p => p.hash)]).toEqual([5, hashes.map(p => p.hash)])
      expect(hashWorld(link.see().w)).toBe(parseInt(await link.hash(), 16) >>> 0)
    } finally {
      await stop()
    }
  })
  it('outgrown, it sends new slots, and the page reads the men from them', async () => {
    const { link, stop } = startLink('s1b-field')
    try {
      await link.ready()
      // 2,400 men, the first slots room for 4,096: five battalions more outgrow them
      for (let k = 0; k < 5; k++) {
        link.command({ type: 'debug-spawn', side: 0, x: -150 + 40 * k, z: -140, heading: 0, shape: 'column', men: 400 })
      }
      await link.advance(1)
      const layer = link.see().layer
      expect([layer.men.n, layer.units.size]).toEqual([4400, 11])
      expect([...layer.units.values()].every(u => u.n === 400)).toBe(true)
    } finally {
      await stop()
    }
  })
  it('a worker that fails says so: the start rejects, requests reject, `failed` holds why', async () => {
    const { link, stop } = startLink('no such scenario')
    try {
      await expect(link.ready()).rejects.toThrow(/no scenario no such scenario/)
      expect(link.failed).toMatch(/no scenario/)
      await expect(link.hash()).rejects.toThrow(/battle worker/)
    } finally {
      await stop()
    }
  })
  // the checks' advance, end to end: the men stand where they always do after it, whatever the threads' timing
  it("the checks' advance leaves the men where it always does: two runs, the same men", async () => {
    const run = async () => {
      const { link, stop } = startLink('s1b-field')
      try {
        await link.ready()
        link.command({ type: 'move', id: makeHandle(KIND_FORMATION, 1, 1), points: [[-40, 30]], append: false })
        await link.advance(0)
        // the clock ran before the hold for as long as start-up took: the advance starts from wherever that was
        const t0 = link.see().w.meta[M_TICK]
        await link.advance(6)
        const M = link.see().layer.men
        return { ticks: link.see().w.meta[M_TICK] - t0, x: [...M.x.subarray(0, M.n)].map(v => Math.round(v * 1e3)) }
      } finally {
        await stop()
      }
    }
    const [a, b] = [await run(), await run()]
    expect(a.ticks).toBe(120)
    expect(b).toEqual(a)
  })
  it('runs on its own clock: frames arrive while the page only reads', async () => {
    const { link, stop } = startLink('s1b-field')
    try {
      await link.ready()
      const t0 = link.see().w.meta[0]
      link.setSpeed(4)
      // whatever the machine's load: the clock runs, nothing asked of it (how fast is the benches' to say)
      for (let k = 0; k < 100 && link.see().w.meta[0] === t0; k++) await new Promise(r => setTimeout(r, 20))
      expect(link.see().w.meta[0]).toBeGreaterThan(t0)
    } finally {
      await stop()
    }
  })
})
