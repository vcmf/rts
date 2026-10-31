// The look page's armies played by the sim (src/look/sim-men.ts, src/look/sim-armies.ts; battle threads PR 4b): the
// renderer's men are the sim's, a battalion's orders come when due. The battle on the test's thread (MainLink).
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { root } from './fx.ts'
import { loadSimData, compileRuleset, typeOf, formationHandle, DT, M_TICK } from '../src/sim/index.ts'
import { rulesetOf } from '../src/rulesets/index.ts'
import { MAP_VERSIONS } from '../src/scenarios/maps.ts'
import { lookArmies } from '../src/scenarios/look-world.ts'
import { MainLink } from '../src/app/battle-link.ts'
import { MAN_ALIVE, MARCH_FROM, RUN_FROM } from '../src/render/men.ts'
import { SimMen, FIRE_FOR, placeQuota, pickPlacings, type SourceMan } from '../src/look/sim-men.ts'
import { marchTo, spawns, ordersDue, SHORT, GIVE_UP, type Orders } from '../src/look/sim-armies.ts'
import { ARMIES_DEMO } from '../src/scenarios/armies-demo.ts'
import type { Battalion } from '../src/look/world/armies.ts'

const data = loadSimData(
  new Uint8Array(fs.readFileSync(path.join(root, 'data', 'painted-world.simdata'))),
  MAP_VERSIONS['painted-world'],
)
// the demo's era by name (src/scenarios/armies-demo.ts): the line infantry at the division scale, 240 figures
const A = { ruleset: ARMIES_DEMO.ruleset, ...ARMIES_DEMO.sim }
const cr = compileRuleset(rulesetOf(A.ruleset))
const MEN = cr.types[cr.typeIndex(A.unitType)].slots
// two battalions facing each other east of the river, 200 m apart
const BS: Battalion[] = [
  { side: 0, uniform: 'a', x: 40, z: -100, heading: 0, offset: 0 },
  { side: 1, uniform: 'b', x: 60, z: 100, heading: Math.PI, offset: 0 },
]
const man = (): SourceMan => ({ x: 0, z: 0, yaw: 0, role: 'halt', since: 0, shown: false })
const at = [0, 0]
/** Man `i` of battalion `k` from `source`, begun as the renderer begins a battalion. */
function manAt(source: SimMen, k: number, i: number, out: SourceMan): SourceMan {
  source.begin(k, at)
  return source.man(i, out)
}

/** The battle with the battalions spawned and one tick run, and the men source over it. */
function start() {
  const link = new MainLink(data, cr, lookArmies, true)
  for (const c of spawns(BS, MEN, A)) link.command(c)
  link.frame(DT)
  const source = new SimMen(BS, MEN, () => {
    link.orient()
    return link.see()
  })
  return { link, source }
}

describe("the sim's men as the renderer's", () => {
  it('match each battalion to its formation, and each figure to a man where the sim has him', () => {
    const { link, source } = start()
    source.frame(0)
    const { w, layer } = link.see()
    for (let k = 0; k < BS.length; k++) {
      const i = source.formationOf(k)
      expect(w.f.side[i]).toBe(BS[k].side)
      const u = layer.units.get(i)!
      expect(u.n).toBe(MEN)
      const out = man()
      for (const j of [0, 7, MEN - 1]) {
        manAt(source, k, j, out)
        const m = u.ids[j]
        expect([out.shown, out.x, out.z]).toEqual([true, layer.men.x[m], layer.men.z[m]])
        // at rest: his formation's heading, halted
        // (his way float32, as the pose the GPU draws him at)
        expect(out.role).toBe('halt')
        expect(out.yaw).toBeCloseTo(w.f.heading[i], 6)
      }
    }
    // no figure past the battalion's men
    expect(manAt(source, 0, MEN, man()).shown).toBe(false)
  })
  it('a moving man faces his way and marches or runs by his speed; a fallen man is not drawn', () => {
    const { link, source } = start()
    source.frame(0)
    const { layer } = link.see()
    const u = layer.units.get(source.formationOf(0))!
    const M = layer.men
    const m = u.ids[3]
    const out = man()
    M.vx[m] = 1
    M.vz[m] = 0
    // (a step moves its revision on: the layer works out its men's gaits and ways again, as the men worker does)
    u.menRev++
    link.orient()
    manAt(source, 0, 3, out)
    // 1 m/s: between MARCH_FROM and RUN_FROM
    expect([MARCH_FROM < 1, 1 < RUN_FROM]).toEqual([true, true])
    expect(out.role).toBe('march')
    expect(out.yaw).toBeCloseTo(Math.PI / 2, 6)
    M.vz[m] = RUN_FROM + 0.1
    u.menRev++
    link.orient()
    manAt(source, 0, 3, out)
    expect(out.role).toBe('run')
    M.flags[m] &= ~MAN_ALIVE
    expect(manAt(source, 0, 3, out).shown).toBe(false)
  })
  it("fires while his company's volley is fresh, and his role's start is when it began", () => {
    const { link, source } = start()
    source.frame(5)
    const { w, layer } = link.see()
    const i = source.formationOf(0)
    const u = layer.units.get(i)!
    const c = typeOf(w, i).slotC[layer.men.s[u.ids[0]]]
    w.f.volleyTick[i * w.cr.maxC + c] = w.meta[M_TICK]
    const out = man()
    manAt(source, 0, 0, out)
    expect([out.role, out.since]).toEqual(['fire', 5])
    source.frame(6)
    expect(manAt(source, 0, 0, out).since).toBe(5)
    w.f.volleyTick[i * w.cr.maxC + c] = w.meta[M_TICK] - 20
    expect(manAt(source, 0, 0, out).role).toBe('halt')
  })
})

describe('the placing', () => {
  // regression (PR 4b review): a fixed cap of placings a frame placed each of 80 battalions every 1.6 steps at 60 Hz
  it('places every moved battalion once a step at any frame rate, in turn', () => {
    for (const hz of [30, 60, 120, 144]) {
      const n = 80
      const placed = new Int32Array(n).fill(-1)
      const count = new Int32Array(n)
      const picked: number[] = []
      let next = 0
      // 10 steps of 1/12 s, every battalion moving all along
      for (let f = 0; f < (10 * hz) / 12; f++) {
        const step = Math.floor((f / hz) * 12)
        next = pickPlacings(n, next, placeQuota(n, 1 / hz, 12), k => placed[k] !== step, picked)
        for (const k of picked) {
          placed[k] = step
          count[k]++
        }
      }
      expect({ hz, least: Math.min(...count), most: Math.max(...count) }).toEqual({ hz, least: 10, most: 10 })
    }
  })
  // review round 2 of the redesign: a step's frames jitter round their mean, and a quota from the mean let a fifth of
  // the battalions slip a step at 60 Hz
  it('still places each once a step when the frames jitter (60 Hz, ±3 ms)', () => {
    const n = 80
    const placed = new Int32Array(n).fill(-1)
    const slips: number[] = []
    const picked: number[] = []
    let next = 0
    let r = 5
    const rnd = () => (r = (r * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
    let t = 0
    let last = 0
    for (let f = 0; f < 600; f++) {
      const dt = 1 / 60 + (rnd() - 0.5) * 0.006
      t += dt
      const step = Math.floor(t * 12)
      // a battalion not placed in the step before this one slipped it
      if (step !== last) for (let k = 0; k < n; k++) if (placed[k] < last && last > 1) slips.push(k)
      last = step
      next = pickPlacings(n, next, placeQuota(n, dt, 12), k => placed[k] !== step, picked)
      for (const k of picked) placed[k] = step
    }
    expect(slips).toEqual([])
  })
  it('looks at the battalions in turn: one passed over is looked at again only after the others', () => {
    const out: number[] = []
    expect(pickPlacings(5, 3, 2, () => true, out)).toBe(0)
    expect(out).toEqual([3, 4])
    expect(pickPlacings(5, 0, 9, k => k !== 1, out)).toBe(0)
    expect(out).toEqual([0, 2, 3, 4])
  })
})

describe('the revisions the renderer follows', () => {
  // the redesign after review round 3: the men worker says what changed (Unit.rev) in place of the page guessing
  it("the layer moves a battalion's revision on as its men step, fall or fire, and not while they stand settled", () => {
    const { link, source } = start()
    source.frame(0)
    const { w, layer } = link.see()
    const i = source.formationOf(0)
    const u = layer.units.get(i)!
    // spawned at their places, the men settle at once: standing, nothing to step
    const r0 = u.rev
    for (let n = 0; n < 10; n++) link.frame(1 / 30)
    expect(u.rev).toBe(r0)
    // marching 20 m: stepped
    link.command({ type: 'move', id: formationHandle(w, i), points: [[w.f.x[i], w.f.z[i] + 20]], append: false })
    for (let n = 0; n < 10; n++) link.frame(1 / 30)
    expect(u.rev).toBeGreaterThan(r0)
    // halted there long enough to settle: a second more changes nothing
    for (let n = 0; n < 30 * 60; n++) link.frame(1 / 30)
    const r1 = u.rev
    for (let n = 0; n < 30; n++) link.frame(1 / 30)
    expect(u.rev).toBe(r1)
    // a volley
    w.f.volleyTick[i * w.cr.maxC] = w.meta[M_TICK]
    link.frame(DT)
    expect(u.rev).toBeGreaterThan(r1)
  })
  it('a battalion has moved when its revision moved on, or when its last volley has gone stale since its placing', () => {
    const { link, source } = start()
    source.frame(0)
    const { w, layer } = link.see()
    const i = source.formationOf(0)
    const u = layer.units.get(i)!
    expect(source.moved(0)).toBe(true)
    source.begin(0, at)
    expect(source.moved(0)).toBe(false)
    u.rev++
    expect(source.moved(0)).toBe(true)
    // placed with a fresh volley: moved once it has gone stale (FIRE_FOR), though nothing else changed
    w.f.volleyTick[i * w.cr.maxC] = w.meta[M_TICK]
    source.begin(0, at)
    expect(source.moved(0)).toBe(false)
    w.meta[M_TICK] += Math.ceil(FIRE_FOR / DT)
    expect(source.moved(0)).toBe(true)
  })
  it('names no formation for a battalion whose formation is gone, though its slot be alive again', () => {
    const { link, source } = start()
    source.frame(0)
    const w = link.see().w
    const i = source.formationOf(0)
    w.f.gen[i]++
    expect(source.formationOf(0)).toBe(-1)
  })
})

describe("the battalions' orders", () => {
  it('march each to SHORT m short of the line through the middle, along its heading', () => {
    expect(marchTo(BS[0], [50, 0])).toEqual([40, -SHORT])
    // already past it: stays
    expect(marchTo({ ...BS[0], z: 10 }, [50, 0])).toEqual([40, 10])
  })
  // regression (PR 4b review): the front rows stand 55 m from the middle, short of SHORT: their march was to where
  // they stood, never seen under way, so they never deployed
  it('a battalion there already sends no march and deploys at once', () => {
    const { link } = start()
    const w = link.see().w
    const i = [...w.f.alive.keys()].find(k => w.f.alive[k] && w.f.side[k] === 0)!
    const st: Orders = { marched: false, moving: false, formed: false, sentAt: 0 }
    const to = marchTo(BS[0], [BS[0].x, BS[0].z + 55])
    expect(to).toEqual([BS[0].x, BS[0].z])
    expect(ordersDue(w, i, BS[0], to, A, st)).toEqual([])
    expect(ordersDue(w, i, BS[0], to, A, st)).toEqual([{ type: 'form', id: expect.any(Number), shape: A.fight }])
  })
  // regression (PR 4b review): a march the sim refuses is never seen under way; its battalion stayed in column
  it('a march never seen under way is taken as refused after GIVE_UP ticks, and the battalion forms where it stands', () => {
    const { link } = start()
    const w = link.see().w
    const i = [...w.f.alive.keys()].find(k => w.f.alive[k] && w.f.side[k] === 0)!
    const st: Orders = { marched: false, moving: false, formed: false, sentAt: 0 }
    const to = marchTo(BS[0], [50, 0])
    // the march sent, and not applied (as refused)
    expect(ordersDue(w, i, BS[0], to, A, st).map(c => c.type)).toEqual(['move'])
    for (let n = 0; n < GIVE_UP; n++) link.frame(DT)
    expect(ordersDue(w, i, BS[0], to, A, st)).toEqual([])
    link.frame(DT)
    expect(ordersDue(w, i, BS[0], to, A, st).map(c => c.type)).toEqual(['form'])
  })
  it('march once, then deploy into line once it has been seen moving and has halted', () => {
    const { link } = start()
    const w = link.see().w
    const i = [...w.f.alive.keys()].find(k => w.f.alive[k] && w.f.side[k] === 0)!
    const st: Orders = { marched: false, moving: false, formed: false, sentAt: 0 }
    const to = marchTo(BS[0], [50, 0])
    const first = ordersDue(w, i, BS[0], to, A, st)
    expect(first.map(c => c.type)).toEqual(['move'])
    // not seen under way yet: no line, however long it waits
    expect(ordersDue(w, i, BS[0], to, A, st)).toEqual([])
    for (const c of first) link.command(c)
    let formed = false
    for (let n = 0; n < 3000 && !formed; n++) {
      link.frame(DT)
      formed = ordersDue(w, i, BS[0], to, A, st).some(c => c.type === 'form')
    }
    expect(formed).toBe(true)
    expect(Math.hypot(w.f.x[i] - to[0], w.f.z[i] - to[1])).toBeLessThan(5)
  })
})
