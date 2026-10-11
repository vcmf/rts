// The S1c-5 shortcuts (docs/plans/active/s1c5-cost.md) give the answers of the full computation they
// replace: the cached filled slots are the ones `occupied` gives, and the footprint gate's bins, with
// companies far from the water skipped, are those of a scan of every man. The goldens check the same thing
// end to end (their hashes did not change); these name the part that broke.
import { describe, it, expect } from 'vitest'
import { Sim, ceiling, STREAM_X, DEG } from './fx.ts'
import { napoleonic } from '../src/rulesets/napoleonic.ts'
import { typeOf, filledSlots, occupied, slotIndex, wetBins, placesCtx, placeAt, placeWorld, mkPlaces, layoutOf, cellK, blockLocal, sin, cos, DT, M_TICK, type World } from '../src/sim/index.ts'
import { mkBits, hasBit } from '../src/sim/bits.ts'

// battalion i's filled slots by asking `occupied` of every slot
function filledBrute(w: World, i: number): number[] {
  const g = typeOf(w, i).geo, out: number[] = []
  for (let c = 0; c < g.companies; c++) for (let r = 0; r < g.ranks; r++) for (let q = 0; q < g.files; q++) if (occupied(w, i, c, r, q)) out.push(slotIndex(g, c, r, q))
  return out
}
// the bins with a man on impassable ground, every filled slot placed (wetBins before S1c-5)
function wetBrute(w: World, i: number): number[] {
  const f = w.f, U = typeOf(w, i), g = U.geo, B = g.bins, t = w.meta[M_TICK] * DT, L = layoutOf(w, i), imp = w.terrain.imp[U.shapes[f.trans[i] ? f.tShape[i] : f.shape[i]].kind]
  const ctx = placesCtx(mkPlaces(w), i, f.x[i], f.z[i], f.heading[i], t, 0), p = [0, 0, 0], out = new Set<number>()
  for (let c = 0; c < g.companies; c++) {
    const P = placeWorld(w, i, c, f.x[i], f.z[i], f.heading[i], t, 0, { x: 0, z: 0, a: 0, face: 0, kx: 1, kz: 1 }), ca = cos(P.a), sa = sin(P.a)
    for (let r = 0; r < g.ranks; r++) for (let q = 0; q < g.files; q++) {
      if (!occupied(w, i, c, r, q)) continue
      if (f.trans[i]) { const [bx, bz] = blockLocal(g, q, r), lx = bx * P.kx, lz = bz * P.kz; if (imp[cellK(w.terrain, P.x + lx * ca - lz * sa, P.z + lx * sa + lz * ca)]) out.add(c * B) }
      else { placeAt(ctx, c, r, q, p); if (imp[cellK(w.terrain, p[0], p[1])]) out.add(c * B + L.of[slotIndex(g, c, r, q)]) }
    }
  }
  return [...out].sort((a, b) => a - b)
}
const bitsList = (b: Uint32Array, n: number): number[] => { const out: number[] = []; for (let j = 0; j < n; j++) if (hasBit(b, j)) out.push(j); return out }

describe('the S1c-5 shortcuts', () => {
  it('the cached filled slots follow the men, the shape, a change of shape and Face about', () => {
    const s = new Sim(1, napoleonic), shapes = Object.keys(napoleonic.types.infantry.formations)
    const hs = [s.spawn(-60, -150, 0, 'line', 400), s.spawn(-60, -60, 0, 'column', 397), s.spawn(-60, 40, 0, 'march', 250)]
    let checks = 0
    const check = () => { for (const h of hs) { const i = s.slot(h); if (i < 0) continue
      const F = filledSlots(s.w, i), C = typeOf(s.w, i).C, a = i * (s.w.cr.maxC + 1)
      expect([...F.s.subarray(F.at[a], F.at[a + C])]).toEqual(filledBrute(s.w, i)); checks++ } }
    for (let k = 0; k < 12; k++) {
      check()
      hs.forEach((h, n) => { s.cmd({ type: 'debug-kill', id: h, men: 3 + 7 * n }); if (k % 3 === n) s.cmd({ type: k % 2 ? 'face' : 'form', id: h, shape: shapes[(k + n) % shapes.length] } as never) })
      for (let t = 0; t < 10; t++) { s.tick(); check() }
    }
    expect(checks).toBeGreaterThan(300)
  })

  // the gate asks of trial poses (a step, a turn, halved), so the battalions march to the bank and the test
  // shifts and turns them by up to 15 m and 0.5 rad around where they stand, onto the water and off it
  for (const [name, rs, unit, men] of [['battalions of 400', napoleonic, 'infantry', 400], ['battalions of 810', ceiling, 'infantry', 810], ['a regiment', napoleonic, 'cavalry', 250], ['a battery', napoleonic, 'battery', 96]] as const) it(`the gate's wet bins, ${name} at the stream in every shape and changing shape: as a scan of every man`, () => {
    let compared = 0, wet = 0, rnd = 1
    const r = () => { rnd = (rnd * 16807) % 2147483647; return rnd / 2147483647 - 0.5 }
    const shapes = Object.keys(rs.types[unit].formations)
    for (const shape of shapes) for (const hd of [90, 60, 120]) {
      const s = new Sim(1, rs), z = -120 + hd, x = STREAM_X(z) - 35, f = s.w.f
      const h = s.spawn(x, z, 0, shape, men, 0, unit)
      s.cmd({ type: 'move', id: h, points: [[x + Math.sin(hd * DEG) * 80, z + Math.cos(hd * DEG) * 80]], append: false })
      const bits = mkBits(s.w.cr.maxNB)
      for (let t = 0; t < 900; t++) {
        if (t === 600) s.cmd({ type: 'form', id: h, shape: shapes[(shapes.indexOf(shape) + 1) % shapes.length] })
        s.tick()
        const i = s.slot(h); if (i < 0 || t % 10) continue
        const x0 = f.x[i], z0 = f.z[i], h0 = f.heading[i]
        for (let k = 0; k < 8; k++) {
          f.x[i] = x0 + 30 * r(); f.z[i] = z0 + 30 * r(); f.heading[i] = h0 + r()
          const fast = bitsList(wetBins(s.w, i, bits), s.w.cr.maxNB), slow = wetBrute(s.w, i)
          expect(fast).toEqual(slow); compared++; if (slow.length) wet++
        }
        f.x[i] = x0; f.z[i] = z0; f.heading[i] = h0
      }
    }
    console.log(`${name}: ${compared} poses compared, ${wet} with a bin on impassable ground`)
    expect(wet).toBeGreaterThan(compared / 5)
  })
})
