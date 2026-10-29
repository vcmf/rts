// The guns' smoke's pure parts (src/look/world/smoke.ts, docs/plans/active/artillery-smoke.md, decision 0083): the
// gun's shot from its fire clip's event, a battery's pieces' shots in turn and under the fire hold, the string of puffs
// a shot leaves along its jet, the ground along a puff's way, the ring, and the era's gun smoke checked
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { GUN_SMOKE as GUN, VOLLEY_SMOKE } from '../src/rulesets/napoleonic-smoke.ts'
import { scriptClock, type Battalion } from '../src/look/world/armies.ts'
import { serveScript } from '../src/look/world/arms.ts'
import {
  PUFF_FLOATS,
  pathGround,
  pieceRingSize,
  piecePuffs,
  pieceShotsBetween,
  puffAt,
  shotAt,
  strungPuff,
  validateSmoke,
  type ClipInfo,
  type PieceShot,
  type ServeTiming,
} from '../src/look/world/smoke.ts'

const index = JSON.parse(readFileSync(new URL('../data/figures/index.json', import.meta.url), 'utf8')) as {
  figures: Record<string, { fps: number; clips: Record<string, ClipInfo> }>
}
// the demo's battery (src/scenarios/armies-demo.ts): 8 pieces 16 m apart, at rest 8 s, each 2.5 s after the one
// before, its cycle 110 s
const places: [number, number][] = Array.from({ length: 8 }, (_, i) => [(i - 3.5) * 16, 0])
const times = { rest: 8, lag: 2.5, cycle: 110 }
const script = serveScript(places, { rest: 'halt', work: 'fire' }, times, 16)
const SHOT = 12.5
const PERIOD = 18.8
/** each piece's work start as the page reads it: its man at the cycle's end (every piece at work), no lag of its own */
const starts = places.map((_, i) => {
  const t = times.cycle - 1e-6
  return script.man(i, t, script.phase(t, false), 0, { x: 0, z: 0, face: 0, role: '', since: 0, moving: false }).since
})
const timing = (hold: boolean): ServeTiming => ({
  cycle: times.cycle,
  hold: hold ? (script.hold ?? null) : null,
  shot: SHOT,
  period: PERIOD,
  starts,
})
const battery: Battalion = { side: 0, uniform: 'x', x: 60, z: -43, heading: 0, offset: 0 }

describe("the gun's shot", () => {
  it("is the Fire clip's shot event on the fire role's chain (Load, Ready, Fire): 12.5 s into the loop", () => {
    const f = index.figures['fr-foot-artillery']
    expect(shotAt(['Load', 'Ready', 'Fire'], f.clips, f.fps, 'shot')).toBe(SHOT)
  })
})

describe("a battery's shots", () => {
  it('each piece first fires its shot after its work starts, the right of the line first, then once a loop', () => {
    const shots = pieceShotsBetween(0, times.cycle, 0, timing(false), [])
    const firsts = new Map<number, number>()
    for (const s of shots) if (!firsts.has(s.piece)) firsts.set(s.piece, s.t)
    // (the right of the line, +x, starts first)
    const order = [...firsts.entries()].sort((a, b) => a[1] - b[1]).map(([p]) => p)
    expect(order).toEqual([7, 6, 5, 4, 3, 2, 1, 0])
    expect(firsts.get(7)).toBeCloseTo(times.rest + SHOT, 9)
    expect(firsts.get(6)! - firsts.get(7)!).toBeCloseTo(times.lag, 9)
    const p7 = shots.filter(s => s.piece === 7).map(s => s.t)
    expect(p7[1] - p7[0]).toBeCloseTo(PERIOD, 9)
    for (const s of shots) expect(s.t).toBeLessThan(times.cycle)
  })
  it('splits any interval the same: the shots of the parts are the shots of the whole', () => {
    const f = timing(false)
    const whole = pieceShotsBetween(-50, 400, 3.3, f, []).map(s => s.t)
    const parts: number[] = []
    const out: PieceShot[] = []
    for (let t = -50; t < 400; t += 0.05) {
      parts.push(...pieceShotsBetween(t, Math.min(400, t + 0.05), 3.3, f, out).map(s => s.t))
    }
    expect(parts.length).toBe(whole.length)
    parts.forEach((t, i) => expect(t).toBeCloseTo(whole[i], 9))
  })
  it("held, fires only within the held run (every piece at work), each run its own cycle, as the renderer's clock", () => {
    const f = timing(true)
    const hold = script.hold!
    expect(hold).toBe(times.rest + 7 * times.lag)
    const out = { cycle: 0, local: 0 }
    const shots = pieceShotsBetween(0, 3 * (times.cycle - hold) - 1, 0, f, [])
    expect(new Set(shots.map(s => s.cycle))).toEqual(new Set([0, 1, 2]))
    for (const s of shots) {
      const { local } = scriptClock(s.t, 0, hold, out, times.cycle)
      expect(local).toBeGreaterThanOrEqual(hold)
      // (the shot falls on its piece's loop: its work start + the shot + a whole number of loops)
      const j = (local - starts[s.piece] - SHOT) / PERIOD
      expect(Math.abs(j - Math.round(j))).toBeLessThan(1e-6)
    }
    // (at the hold every piece is at work)
    const p = script.phase(hold, false)
    for (let i = 0; i < places.length; i++) {
      expect(script.man(i, hold, p, 0, { x: 0, z: 0, face: 0, role: '', since: 0, moving: false }).role).toBe('fire')
    }
  })
  it('none for an empty or reversed interval; a bad timing throws', () => {
    expect(pieceShotsBetween(5, 5, 0, timing(true), [])).toEqual([])
    expect(pieceShotsBetween(9, 3, 0, timing(true), [])).toEqual([])
    expect(() => pieceShotsBetween(0, 1, 0, { ...timing(false), period: 0 }, [])).toThrow()
    expect(() => pieceShotsBetween(0, 1, 0, { ...timing(false), hold: 200 }, [])).toThrow()
  })
})

describe("a shot's string of puffs", () => {
  it('a lone puff is the era’s own; a string runs from the muzzle cloud to the farthest, larger and fainter', () => {
    expect(strungPuff(0, 1, 3)).toEqual({ reach: 1, size: 1, density: 1 })
    const s = Array.from({ length: 5 }, (_, k) => strungPuff(k, 5, 1.8))
    expect(s[0].reach).toBeCloseTo(0.1, 9)
    expect(s[4].reach).toBeCloseTo(1.8, 9)
    for (let k = 1; k < 5; k++) {
      expect(s[k].reach).toBeGreaterThan(s[k - 1].reach)
      expect(s[k].size).toBeGreaterThan(s[k - 1].size)
      expect(s[k].density).toBeLessThan(s[k - 1].density)
    }
  })
  it("born at the piece's muzzle at the shot's clock, along the battery's heading, the muzzle cloud never thin", () => {
    for (const heading of [0, Math.PI, 0.7]) {
      const b = { ...battery, heading }
      for (let n = 0; n < 40; n++) {
        const shot: PieceShot = { t: 30 + n, piece: n % 8, cycle: 0, n }
        const out: number[] = []
        piecePuffs(b, 1, shot, places[shot.piece], GUN, () => 2, out)
        expect(out.length).toBe(GUN.strung[0] * PUFF_FLOATS)
        const [px, pz] = places[shot.piece]
        const lz = pz + GUN.ahead
        const mx = b.x + Math.cos(heading) * px + Math.sin(heading) * lz
        const mz = b.z - Math.sin(heading) * px + Math.cos(heading) * lz
        for (let k = 0; k < out.length; k += PUFF_FLOATS) {
          expect(Math.hypot(out[k] - mx, out[k + 2] - mz)).toBeLessThanOrEqual(GUN.lateral / 2 + 1e-9)
          expect(out[k + 1]).toBeCloseTo(2 + GUN.height, 9)
          expect(out[k + 3]).toBeCloseTo(shot.t, 9)
          expect(out[k + 4]).toBeCloseTo(Math.sin(heading), 9)
          expect(out[k + 5]).toBeCloseTo(Math.cos(heading), 9)
          expect(out[k + 7]).toBeGreaterThanOrEqual(GUN.life[0])
          expect(out[k + 7]).toBeLessThanOrEqual(GUN.life[1])
          // (flat ground: no rise along its way)
          expect(out[k + 12]).toBe(0)
        }
        expect(out[11]).toBeGreaterThan(0.5)
      }
    }
  })
})

describe("the ground along a puff's way", () => {
  it('how far the puff goes in its life and how much higher the ground lies there', () => {
    const [rise, d] = pathGround(GUN, 1.8, 25, 0, 0, [0, 1], (_x, z) => 0.1 * z)
    expect(d).toBeCloseTo(puffAt(GUN, 25, 25).ahead * 1.8, 9)
    expect(rise).toBeCloseTo(0.1 * d, 9)
    expect(pathGround(GUN, 1, 25, 3, 4, [1, 0], () => 7)[0]).toBe(0)
  })
})

describe("the guns' ring", () => {
  it("holds every piece's puffs alive at once, held or not: the live count simulated over the script", () => {
    for (const hold of [false, true]) {
      const f = timing(hold)
      const spans: [number, number][] = []
      const units = [battery, { ...battery, side: 1, z: 43, heading: Math.PI }]
      units.forEach((b, u) => {
        for (const s of pieceShotsBetween(-times.cycle, 3 * times.cycle, b.offset, f, [])) {
          const out: number[] = []
          piecePuffs(b, u, s, places[s.piece], GUN, () => 0, out)
          for (let k = 0; k < out.length; k += PUFF_FLOATS) spans.push([out[k + 3], out[k + 3] + out[k + 7]])
        }
      })
      let most = 0
      for (let t = 0; t < 3 * times.cycle; t += 0.25) {
        let n = 0
        for (const [a, e] of spans) if (a <= t && t < e) n++
        most = Math.max(most, n)
      }
      expect(most).toBeGreaterThan(0)
      expect(most, hold ? 'held' : 'unheld').toBeLessThanOrEqual(pieceRingSize(16, f, GUN))
    }
  })
})

describe("the era's gun smoke checked", () => {
  it("passes the era's own values and the battery's timing; the muskets' are a lone puff a group", () => {
    expect(() => validateSmoke(GUN, timing(false))).not.toThrow()
    expect(() => validateSmoke(GUN, timing(true))).not.toThrow()
    expect(VOLLEY_SMOKE.strung).toEqual([1, 1])
  })
  it('throws, naming it, on a string of no puffs or no reach, or a hold past the cycle', () => {
    expect(() => validateSmoke({ ...GUN, strung: [0, 1] }, timing(false))).toThrow(/strung\[0\]/)
    expect(() => validateSmoke({ ...GUN, strung: [2.5, 1] }, timing(false))).toThrow(/strung\[0\]/)
    expect(() => validateSmoke({ ...GUN, strung: [3, 0] }, timing(false))).toThrow(/strung\[1\]/)
    expect(() => validateSmoke(GUN, { ...timing(false), hold: 110 })).toThrow(/hold/)
  })
})
