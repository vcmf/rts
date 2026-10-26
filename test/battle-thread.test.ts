// The battle worker (docs/plans/active/battle-threads.md, PR 3): the published frame read in place equals the battle
// it was written from, the slot protocol never hands the reader a slot being written, and the battle played in a
// real worker thread (Node's worker_threads, the same host code as the browser's) reproduces the main thread's.
import { describe, it, expect } from 'vitest'
import { Worker } from 'node:worker_threads'
import { dataBytes, GOLDEN_DATA_VERSION } from './fx.ts'
import { loadSimData, compileRuleset, columns, hashWorld, makeHandle, KIND_FORMATION, play } from '../src/sim/index.ts'
import { napoleonic } from '../src/rulesets/napoleonic.ts'
import { PAGE_SCENARIOS } from '../src/scenarios/page.ts'
import { Battle } from '../src/app/battle.ts'
import { FrameView, layoutFor, writeFrame, capFor, Slots } from '../src/app/battle-frame.ts'
import { WorkerLink } from '../src/app/battle-link.ts'

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
    for (const k of ['x', 'z', 'vx', 'vz', 's', 'flags'] as const) {
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

/** A Node worker thread running the battle host, as a browser `Worker` to the page's link. */
function nodeWorker(): Worker & { asBrowser: globalThis.Worker } {
  const w = new Worker(new URL('./fx-battle-worker.ts', import.meta.url))
  const asBrowser = {
    postMessage: (m: unknown) => w.postMessage(m),
    set onmessage(fn: (e: { data: unknown }) => void) {
      w.on('message', d => fn({ data: d }))
    },
  } as unknown as globalThis.Worker
  return Object.assign(w, { asBrowser })
}

describe('the battle in a worker thread', () => {
  it("plays a battle the main thread reproduces: the worker's stamped log, replayed here, gives its every hash point", async () => {
    const w = nodeWorker()
    try {
      const link = new WorkerLink(w.asBrowser, dataBytes(), data, cr, scenario)
      await link.ready()
      // on its own clock at 4×, commands arriving whenever they do, then held and advanced on request
      link.setSpeed(4)
      for (const h of [0, 1, 2]) {
        link.command({ type: 'move', id: makeHandle(KIND_FORMATION, h, 1), points: [[-40, 10 * h]], append: false })
      }
      await new Promise(r => setTimeout(r, 400))
      link.command({ type: 'form', id: makeHandle(KIND_FORMATION, 3, 1), shape: 'square' })
      link.command({ type: 'fire', id: makeHandle(KIND_FORMATION, 0, 1), mode: 'at will' })
      await link.advance(20)
      const { replay, hashes } = await link.replay()
      expect(replay.log.length).toBe(5)
      expect(hashes.length).toBeGreaterThan(20)
      expect(play(replay, data, cr, scenario, hashes)).toBeNull()
      // the page's copies of the events, and its view of the newest frame, are that battle's
      expect([link.log.length, link.hashes.map(p => p.hash)]).toEqual([5, hashes.map(p => p.hash)])
      expect(hashWorld(link.see().w)).toBe(parseInt(await link.hash(), 16) >>> 0)
    } finally {
      await w.terminate()
    }
  })
  it('outgrown, it sends new slots, and the page reads the men from them', async () => {
    const w = nodeWorker()
    try {
      const link = new WorkerLink(w.asBrowser, dataBytes(), data, cr, scenario)
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
      await w.terminate()
    }
  })
  it('a worker that fails says so: the start rejects, requests reject, `failed` holds why', async () => {
    const w = nodeWorker()
    try {
      const link = new WorkerLink(w.asBrowser, dataBytes(), data, cr, { name: 'no such scenario', setup: () => {} })
      await expect(link.ready()).rejects.toThrow(/no scenario no such scenario/)
      expect(link.failed).toMatch(/no scenario/)
      await expect(link.hash()).rejects.toThrow(/battle worker/)
    } finally {
      await w.terminate()
    }
  })
  it('runs on its own clock: frames arrive while the page only reads', async () => {
    const w = nodeWorker()
    try {
      const link = new WorkerLink(w.asBrowser, dataBytes(), data, cr, scenario)
      await link.ready()
      const t0 = link.see().w.meta[0]
      link.setSpeed(4)
      await new Promise(r => setTimeout(r, 600))
      const t1 = link.see().w.meta[0]
      // 0.6 s at 4× is 48 ticks; the worker's timer and start-up take some
      expect(t1 - t0).toBeGreaterThan(20)
      expect(t1 - t0).toBeLessThan(60)
    } finally {
      await w.terminate()
    }
  })
})
