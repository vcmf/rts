// The look page's armies played by the sim (src/look/sim-men.ts, src/look/sim-armies.ts; battle threads PR 4b): the
// renderer's men are the sim's, a battalion's orders come when due. The battle on the test's thread (MainLink).
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { root } from './fx.ts'
import { loadSimData, compileRuleset, typeOf, DT, M_TICK } from '../src/sim/index.ts'
import { napoleonic } from '../src/rulesets/napoleonic.ts'
import { MAP_VERSIONS } from '../src/scenarios/maps.ts'
import { lookArmies } from '../src/scenarios/look-world.ts'
import { MainLink } from '../src/app/battle-link.ts'
import { MAN_ALIVE } from '../src/render/men.ts'
import { SimMen, RUN_FROM, MARCH_FROM, sourceDue, type SourceMan } from '../src/look/sim-men.ts'
import { marchTo, spawns, ordersDue, SHORT, GIVE_UP, type Orders } from '../src/look/sim-armies.ts'
import { ARMIES_DEMO } from '../src/scenarios/armies-demo.ts'
import type { Battalion } from '../src/look/world/armies.ts'

const data = loadSimData(
  new Uint8Array(fs.readFileSync(path.join(root, 'data', 'painted-world.simdata'))),
  MAP_VERSIONS['painted-world'],
)
const cr = compileRuleset(napoleonic)
const MEN = cr.types[0].slots
// two battalions facing each other east of the river, 200 m apart
const BS: Battalion[] = [
  { side: 0, uniform: 'a', x: 40, z: -100, heading: 0, offset: 0 },
  { side: 1, uniform: 'b', x: 60, z: 100, heading: Math.PI, offset: 0 },
]
const man = (): SourceMan => ({ x: 0, z: 0, yaw: 0, role: 'halt', since: 0, shown: false })
// the demo's era by name (src/scenarios/armies-demo.ts)
const A = { ruleset: ARMIES_DEMO.ruleset, unitType: ARMIES_DEMO.unitType, ...ARMIES_DEMO.sim }
const at = [0, 0]
/** Man `i` of battalion `k` from `source`, begun as the renderer begins a battalion. */
function manAt(source: SimMen, k: number, i: number, out: SourceMan): SourceMan {
  source.begin(k, at)
  return source.man(i, out)
}

/** The battle with the battalions spawned and one tick run, and the men source over it. */
function start() {
  const link = new MainLink(data, cr, lookArmies)
  for (const c of spawns(BS, MEN, A)) link.command(c)
  link.frame(DT)
  const source = new SimMen(
    BS,
    MEN,
    () => link.see(),
    () => link.published(),
  )
  return { link, source }
}

describe("the sim's men as the renderer's", () => {
  it('match each battalion to its formation, and each figure to a man where the sim has him', () => {
    const { link, source } = start()
    expect(source.frame(0)).toBe(true)
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
        expect([out.yaw, out.role]).toEqual([w.f.heading[i], 'halt'])
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
    manAt(source, 0, 3, out)
    // 1 m/s: between MARCH_FROM and RUN_FROM
    expect([MARCH_FROM < 1, 1 < RUN_FROM]).toEqual([true, true])
    expect([out.role, out.yaw]).toEqual(['march', Math.PI / 2])
    M.vz[m] = RUN_FROM + 0.1
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
  it('says a new frame only when one was published', () => {
    const { link, source } = start()
    expect(source.frame(0)).toBe(true)
    // on the page's thread every frame is new; a source reading a fixed publish time sees none
    const fixed = new SimMen(
      BS,
      MEN,
      () => link.see(),
      () => 7,
    )
    expect([fixed.frame(0), fixed.frame(1)]).toEqual([true, false])
  })
})

describe('the placing', () => {
  // regression (PR 4b review): due only at its exact part, a battalion whose part frames passed over (16.7 ms frames,
  // 10.4 ms parts) was not placed that step, the same ones step after step
  it("is due once a step, at the battalion's part or a later one, else at the next step's first frame", () => {
    const G = 8
    expect(sourceDue(3, -1, 0, G)).toBe(0)
    // step 5 (parts 40..47): battalion 3 from part 43 on, counted for step 5; not again in it
    expect([42, 43, 47].map(p => sourceDue(3, 4, p, G))).toEqual([-1, 5, 5])
    expect(sourceDue(3, 5, 46, G)).toBe(-1)
    // a step it missed whole: placed at the next one's first frame, counted for the one missed
    expect(sourceDue(7, 4, 48, G)).toBe(5)
    // 60 Hz frames over steps 5 to 9 (a frame 1.6 parts): every battalion placed once a step, give or take one late
    const placed = new Int32Array(G).fill(4)
    const count = new Int32Array(G)
    for (let f = 0; f < 25; f++) {
      const p = Math.floor(40 + f * 1.6)
      for (let k = 0; k < G; k++) {
        const due = sourceDue(k, placed[k], p, G)
        if (due >= 0) {
          placed[k] = due
          count[k]++
        }
      }
    }
    expect(Math.min(...count)).toBeGreaterThanOrEqual(4)
    expect(Math.max(...count)).toBeLessThanOrEqual(5)
  })
  // regression (PR 4b review): what moved() summed left out velocities and the volley's going stale, so a company
  // placed firing kept firing, a man who settled kept marching
  it('counts a battalion moved when its volley goes stale or a man stops, though no man changed place', () => {
    const { link, source } = start()
    source.frame(0)
    const { w, layer } = link.see()
    const i = source.formationOf(0)
    const u = layer.units.get(i)!
    source.moved(0)
    source.begin(0, at)
    expect(source.moved(0)).toBe(false)
    layer.men.vx[u.ids[0]] = 0.4
    expect(source.moved(0)).toBe(true)
    source.begin(0, at)
    w.f.volleyTick[i * w.cr.maxC] = w.meta[M_TICK]
    expect(source.moved(0)).toBe(true)
    source.begin(0, at)
    w.meta[M_TICK] += 20
    expect(source.moved(0)).toBe(true)
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
