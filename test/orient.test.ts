// The men's ways and gaits (docs/plans/active/battle-threads.md, PR 4c): the soldier layer works them out for a
// battalion whose revision moved (SoldierLayer.orient), the published frame carries them, and they are what the look
// page used to work out itself: his velocity's way when he marches, at rest his place's.
import { describe, it, expect } from 'vitest'
import { dataBytes, GOLDEN_DATA_VERSION } from './fx.ts'
import { loadSimData, compileRuleset } from '../src/sim/index.ts'
import { napoleonic } from '../src/rulesets/napoleonic.ts'
import { PAGE_SCENARIOS } from '../src/scenarios/page.ts'
import { Battle } from '../src/app/battle.ts'
import { FrameView, layoutFor, writeFrame, capFor } from '../src/app/battle-frame.ts'
import { MAN_ALIVE, MARCH_FROM, RUN_FROM, GAIT_HALT, GAIT_MARCH, GAIT_RUN, gaitAt } from '../src/render/men.ts'

const data = loadSimData(dataBytes(), GOLDEN_DATA_VERSION)
const cr = compileRuleset(napoleonic)
const stats = { tickMs: 0, stepMs: 0, pubMs: 0 }

/** A charge advanced some ticks: men at rest and men on the move. */
function battle(): Battle {
  const b = new Battle(data, PAGE_SCENARIOS['s1d-charge'])
  b.advanceBy(80)
  return b
}

/** Every standing man's way and gait worked out afresh, as the look page did before PR 4c. */
function expected(b: Battle): Map<number, [number, number]> {
  const L = b.layer
  const M = L.men
  const p = [0, 0, 0]
  const out = new Map<number, [number, number]>()
  for (const u of L.units.values()) {
    L.frame(u.i, L.alphaNow)
    for (let j = 0; j < u.n; j++) {
      const m = u.ids[j]
      if (!(M.flags[m] & MAN_ALIVE)) continue
      const v = Math.hypot(M.vx[m], M.vz[m])
      out.set(m, [v > MARCH_FROM ? Math.atan2(M.vx[m], M.vz[m]) : L.place(u.i, M.s[m], false, p)[2], gaitAt(v)])
    }
  }
  return out
}

describe("the men's ways and gaits", () => {
  it('a gait by speed: halt to 0.3 m/s, march to 2.2, then run', () => {
    expect([gaitAt(0), gaitAt(MARCH_FROM), gaitAt(1), gaitAt(RUN_FROM), gaitAt(RUN_FROM + 0.01)]).toEqual([
      GAIT_HALT,
      GAIT_HALT,
      GAIT_MARCH,
      GAIT_MARCH,
      GAIT_RUN,
    ])
  })
  it("are each standing man's velocity's way, or his place's at rest, and his gait by his speed", () => {
    const b = battle()
    b.layer.orient()
    const want = expected(b)
    const M = b.layer.men
    let moving = 0
    for (const [m, [yaw, gait]] of want) {
      expect(M.yaw[m]).toBeCloseTo(yaw, 5)
      expect(M.gait[m]).toBe(gait)
      if (gait !== GAIT_HALT) moving++
    }
    // (both kinds seen)
    expect([moving > 0, moving < want.size]).toEqual([true, true])
  })
  it('are kept current by the steering itself for a battalion stepped since its last change (no framing again)', () => {
    const b = battle()
    // oriented once (as each frame published is), then stepped on: steering keeps them so
    b.layer.orient()
    b.advanceBy(10)
    const want = expected(b)
    const M = b.layer.men
    const fresh = [...b.layer.units.values()].filter(u => u.oriented === u.menRev)
    expect(fresh.length).toBeGreaterThan(0)
    for (const u of fresh) {
      for (const m of u.ids.subarray(0, u.n)) {
        const w = want.get(m)
        if (!w) continue
        expect(M.yaw[m]).toBeCloseTo(w[0], 5)
        expect(M.gait[m]).toBe(w[1])
      }
    }
  })
  it('are worked out again only for a battalion whose revision moved', () => {
    const b = battle()
    const L = b.layer
    L.orient()
    const M = L.men
    const u = [...L.units.values()][0]
    const m = [...u.ids.subarray(0, u.n)].find(k => M.flags[k] & MAN_ALIVE)!
    const before = [M.gait[m], M.yaw[m]]
    M.vx[m] = 1.5
    M.vz[m] = 0
    L.orient()
    expect([M.gait[m], M.yaw[m]]).toEqual(before)
    // a volley alone (the battalion's revision, not its men's) works nothing out again
    u.rev++
    L.orient()
    expect([M.gait[m], M.yaw[m]]).toEqual(before)
    u.menRev++
    L.orient()
    expect([M.gait[m], M.yaw[m]]).toEqual([GAIT_MARCH, Math.fround(Math.PI / 2)])
  })
  // regression guard: a frame published before its battalions are oriented would carry ways older than its revisions
  it('are oriented as the frame is published, so the frame carries them for its revisions', () => {
    const b = battle()
    const L = layoutFor(b.w, capFor(b.layer.men.n))
    const buf = new ArrayBuffer(L.bytes)
    expect([...b.layer.units.values()].some(u => u.oriented !== u.menRev)).toBe(true)
    expect(writeFrame(b, buf, L, stats)).toBe(true)
    const v = new FrameView(data, cr, b.w.terrain, b.scene, buf, L)
    v.read(0)
    const want = expected(b)
    for (const [m, [yaw, gait]] of want) {
      expect(v.layer.men.yaw[m]).toBeCloseTo(yaw, 5)
      expect(v.layer.men.gait[m]).toBe(gait)
    }
  })
})
