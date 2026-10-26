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
    const v = new FrameView(data, cr, b.scene, buf, L)
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
  it('the writer never fills the slot the reader holds, nor the newest; the reader always holds the newest', () => {
    const s = Slots.make(false)
    expect(s.hold()).toBe(-1)
    // every interleaving of a write and a hold, a few thousand times
    let r = 7
    const rnd = () => (r = (r * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
    let held = -1
    let latest = -1
    for (let n = 0; n < 5000; n++) {
      if (rnd() < 0.5) {
        const w = s.free()
        expect(w).not.toBe(held)
        expect(w).not.toBe(latest)
        s.publish(w)
        latest = w
      } else {
        held = s.hold()
        expect(held).toBe(latest)
      }
    }
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
      const link = new WorkerLink(w.asBrowser, dataBytes(), GOLDEN_DATA_VERSION, scenario)
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
      const link = new WorkerLink(w.asBrowser, dataBytes(), GOLDEN_DATA_VERSION, scenario)
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
  it('runs on its own clock: frames arrive while the page only reads', async () => {
    const w = nodeWorker()
    try {
      const link = new WorkerLink(w.asBrowser, dataBytes(), GOLDEN_DATA_VERSION, scenario)
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
