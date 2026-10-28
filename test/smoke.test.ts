// The musket smoke's pure parts (src/look/world/smoke.ts, decision 0080): the shot's moment from the figure's clip
// events, the script's shots and its fire hold (src/look/world/armies.ts), the puffs a volley leaves, a puff's motion,
// plume, opacity, life and erosion, the zoom's thinning, the formations' mask and the opacity cap over them, the ring
// and the page's switches
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { napoleonic } from '../src/rulesets/napoleonic.ts'
import { VOLLEY_SMOKE as DEF } from '../src/rulesets/napoleonic-smoke.ts'
import {
  CYCLE,
  RANK_LAG,
  extents,
  fireStart,
  phaseAt,
  scriptClock,
  type Battalion,
  type Drill,
} from '../src/look/world/armies.ts'
import {
  PUFF_FLOATS,
  SMOKE_DEFAULT,
  SMOKE_LOOKS,
  coverAt,
  coverCap,
  drawClearance,
  keepScale,
  keepShare,
  maskAt,
  muzzles,
  puffAt,
  puffLive,
  ringSize,
  shotAt,
  shotsBetween,
  smokeLook,
  volleyPuffs,
  type ClipInfo,
  type FireTiming,
  type Shot,
} from '../src/look/world/smoke.ts'

const g = napoleonic.types.infantry.geometry
const drill: Drill = {
  companies: g.companies,
  files: g.files,
  ranks: g.ranks,
  fileSpacing: g.fileSpacing,
  rankSpacing: g.rankSpacing,
}
const index = JSON.parse(readFileSync(new URL('../data/figures/index.json', import.meta.url), 'utf8')) as {
  figures: Record<string, { fps: number; clips: Record<string, ClipInfo> }>
}
const MARCH = 0.9018
const RUN = 3.2
const start = fireStart(drill, MARCH, RUN)
const timing = (hold: boolean): FireTiming => ({
  start,
  shot: 1.5,
  period: 166 / 12,
  ranks: drill.ranks,
  hold: hold ? start : null,
})

describe('the shot', () => {
  it("is the fire clip's fire event on the bake's timeline: 1.5 s into the infantry's fire loop", () => {
    const f = index.figures['fr-line-infantry']
    expect(shotAt(['Present', 'Aim', 'Fire', 'Reload'], f.clips, f.fps)).toBe(1.5)
  })
  it('counts a later clip from the frame it joins on', () => {
    const clips = { A: { frames: 5, events: {} }, B: { frames: 4, events: { fire: [1] } } }
    // (B's frame 1 is A's last: the timeline's index 4)
    expect(shotAt(['A', 'B'], clips, 2)).toBe(2)
    expect(shotAt(['B'], clips, 2)).toBe(0)
  })
  it('fails loudly without the event or the clip', () => {
    expect(() => shotAt(['A'], { A: { frames: 3, events: {} } }, 24)).toThrow(/no clip .* has a fire event/)
    expect(() => shotAt(['X'], {}, 24)).toThrow(/no clip X/)
  })
})

describe('the script clock', () => {
  it('runs the whole cycle unheld, as the page always did', () => {
    const out = { cycle: 0, local: 0 }
    for (const T of [0, 3.7, 109.9, 110, 345.25]) {
      const t = T - 9.7
      const cycle = Math.floor(t / CYCLE)
      expect(scriptClock(T, 9.7, null, out)).toEqual({ cycle, local: t - cycle * CYCLE })
    }
  })
  it('held, stays in the fire phase and runs it over again', () => {
    const out = { cycle: 0, local: 0 }
    for (let T = 0; T < 400; T += 0.37) {
      const { local } = scriptClock(T, 19.4, start, out)
      expect(local).toBeGreaterThanOrEqual(start)
      expect(local).toBeLessThan(CYCLE)
      expect(phaseAt(drill, local, MARCH, RUN).phase).toBe('fire')
    }
  })
})

describe('the shots', () => {
  it("fire each rank RANK_LAG after the one in front, once a loop, within the cycle's fire phase", () => {
    const shots = shotsBetween(0, CYCLE, 0, timing(false), [])
    const volleys = Math.ceil((CYCLE - start - 1.5) / (166 / 12))
    expect(shots.length).toBeLessThanOrEqual(volleys * drill.ranks)
    expect(shots.length).toBeGreaterThanOrEqual((volleys - 1) * drill.ranks)
    expect(shots[0].t).toBeCloseTo(start + 1.5, 9)
    expect(shots[1].t - shots[0].t).toBeCloseTo(RANK_LAG, 9)
    for (const s of shots) expect(s.t).toBeLessThan(CYCLE)
  })
  it('splits any interval the same: the shots of the parts are the shots of the whole', () => {
    const f = timing(false)
    const whole = shotsBetween(-50, 400, 9.7, f, []).map(s => s.t)
    const parts: number[] = []
    for (let t = -50; t < 400; t += 0.016) {
      parts.push(...shotsBetween(t, Math.min(400, t + 0.016), 9.7, f, []).map(s => s.t))
    }
    expect(parts.length).toBe(whole.length)
    parts.forEach((t, i) => expect(t).toBeCloseTo(whole[i], 9))
  })
  it('held, fire every run of the fire phase from its start', () => {
    const shots = shotsBetween(0, 2 * (CYCLE - start), 0, timing(true), [])
    expect(shots[0].t).toBeCloseTo(1.5, 9)
    expect(new Set(shots.map(s => s.cycle))).toEqual(new Set([0, 1]))
  })
  it('none for an empty or reversed interval', () => {
    expect(shotsBetween(5, 5, 0, timing(true), [])).toEqual([])
    expect(shotsBetween(9, 3, 0, timing(true), [])).toEqual([])
  })
})

describe("a volley's puffs", () => {
  const b: Battalion = { side: 1, uniform: 'x', x: 30, z: 40, heading: Math.PI, offset: 0 }
  const shot: Shot = { t: 12, rank: 1, cycle: 2, volley: 1 }
  const xs = muzzles(drill, DEF.files)
  const puffs = (bb = b) => {
    const out: number[] = []
    volleyPuffs(bb, 3, shot, xs, DEF, () => 10, out)
    return out
  }
  it('one a group of files, company by company, across the whole front', () => {
    expect(xs.length).toBe(drill.companies * Math.ceil(drill.files / DEF.files))
    const e = extents(drill)
    expect(Math.min(...xs)).toBeGreaterThan(-e.halfFront)
    expect(Math.max(...xs)).toBeLessThan(e.halfFront)
  })
  it('born ahead of the front rank, over the ground, at the shot with the men’s spread', () => {
    const p = puffs()
    expect(p.length).toBe(xs.length * PUFF_FLOATS)
    for (let k = 0; k < p.length; k += PUFF_FLOATS) {
      // (heading π: ahead is −z)
      expect(b.z - p[k + 2]).toBeGreaterThanOrEqual(DEF.ahead)
      expect(p[k + 1]).toBeGreaterThan(10 + DEF.height)
      expect(Math.abs(p[k + 3] - shot.t)).toBeLessThanOrEqual(DEF.jitter)
      expect(p[k + 4]).toBeCloseTo(0, 9)
      expect(p[k + 5]).toBeCloseTo(-1, 9)
      expect(p[k + 7]).toBeGreaterThanOrEqual(DEF.life[0])
      expect(p[k + 7]).toBeLessThanOrEqual(DEF.life[1])
    }
  })
  it('the same at every load', () => {
    expect(puffs()).toEqual(puffs())
  })
})

describe("a puff's life", () => {
  const life = 12
  it('carried ahead and up, never back, growing', () => {
    let last = puffAt(DEF, 0, life)
    expect(last.ahead).toBe(0)
    expect(last.radius).toBe(DEF.radius[0])
    for (let a = 0.25; a < life; a += 0.25) {
      const p = puffAt(DEF, a, life)
      expect(p.ahead).toBeGreaterThan(last.ahead)
      expect(p.up).toBeGreaterThan(last.up)
      expect(p.radius).toBeGreaterThan(last.radius)
      last = p
    }
    expect(last.radius).toBeLessThanOrEqual(DEF.radius[1])
  })
  it('born a plume stretched along the shot, relaxing to a round puff', () => {
    expect(puffAt(DEF, 0, life).stretch).toBeCloseTo(DEF.plume[0], 9)
    let last = Infinity
    for (let a = 0; a < 4; a += 0.1) {
      const st = puffAt(DEF, a, life).stretch
      expect(st).toBeLessThan(last)
      expect(st).toBeGreaterThanOrEqual(1)
      last = st
    }
    expect(puffAt(DEF, life, life).stretch).toBeCloseTo(1, 3)
  })
  it('densest at birth, thinning with age, never past its era opacity', () => {
    expect(puffAt(DEF, 0, life).opacity).toBe(DEF.opacity)
    expect(puffAt(DEF, life / 2, life).opacity).toBeLessThan(DEF.opacity)
    expect(puffAt(DEF, life, life).opacity).toBeCloseTo(DEF.opacity * 0.35, 9)
    expect(puffAt(DEF, 2 * life, life).opacity).toBeCloseTo(DEF.opacity * 0.35, 9)
  })
  it('keeps rolling ahead after the blast has died', () => {
    const late = puffAt(DEF, 9, life).ahead - puffAt(DEF, 8, life).ahead
    expect(late).toBeCloseTo(DEF.roll, 3)
  })
  it('whole until its erosion starts, then eroded to nothing at its end', () => {
    expect(puffAt(DEF, DEF.erode * life * 0.99, life).erode).toBe(0)
    const mid = puffAt(DEF, (DEF.erode + (1 - DEF.erode) / 2) * life, life).erode
    expect(mid).toBeCloseTo(0.5, 9)
    expect(puffAt(DEF, life, life).erode).toBe(1)
  })
  it('drawn from its birth to its end only', () => {
    expect(puffLive(-0.01, life)).toBe(false)
    expect(puffLive(0, life)).toBe(true)
    expect(puffLive(life - 0.01, life)).toBe(true)
    expect(puffLive(life, life)).toBe(false)
  })
})

describe("the zoom's thinning", () => {
  it('keeps every puff up close and a quarter at the widest', () => {
    expect(keepShare(20)).toBe(1)
    expect(keepShare(60)).toBe(1)
    expect(keepShare(120)).toBeCloseTo(0.5, 9)
    expect(keepShare(260)).toBe(0.25)
  })
  it('whole at keep 1, else the kept grown by 1/√keep and the rest gone', () => {
    for (let r = 0; r < 1; r += 0.01) expect(keepScale(r, 1)).toBe(1)
    expect(keepScale(0.1, 0.25)).toBeCloseTo(2, 9)
    expect(keepScale(0.5, 0.25)).toBe(0)
  })
  it('holds the area of smoke as it thins', () => {
    for (const keep of [1, 0.6, 0.25]) {
      let area = 0
      for (let i = 0; i < 1000; i++) area += keepScale((i + 0.5) / 1000, keep) ** 2
      expect(area / 1000).toBeGreaterThan(0.95)
      expect(area / 1000).toBeLessThan(1.1)
    }
  })
})

describe("the formations' mask and the opacity cap", () => {
  // a battalion's box: 40 m across, 3 m deep, at the origin; the mask over ±50 m at 0.5 m texels
  const N = 200
  const O: [number, number] = [-50, -50]
  const mask = new Uint8Array(N * N)
  drawClearance(Float32Array.from([-20, -1.5, 20, 1.5]), 1, mask, N, O, 0.5, 2)
  it('marks the box whole and falls to nothing a margin out', () => {
    expect(maskAt(mask, N, O, 0.5, 0, 0)).toBeCloseTo(1, 2)
    expect(maskAt(mask, N, O, 0.5, 0, 2.5)).toBeGreaterThan(0.2)
    expect(maskAt(mask, N, O, 0.5, 0, 2.5)).toBeLessThan(0.8)
    expect(maskAt(mask, N, O, 0.5, 0, 4)).toBe(0)
    expect(maskAt(mask, N, O, 0.5, 30, 0)).toBe(0)
  })
  it('covers smoke between the camera and the men, not smoke beyond them or clear of them', () => {
    const cam: [number, number, number] = [0, 30, -30] // (the camera to the south, looking north and down)
    // a puff 4 m in front of the line, 3 m up: its view ray comes down onto the box
    expect(coverAt(mask, N, O, 0.5, cam, [0, 3.9, -4], 0)).toBeGreaterThan(0.5)
    // the same puff low over the ground: its ray lands short of the line
    expect(coverAt(mask, N, O, 0.5, cam, [0, 0.9, -6], 0)).toBe(0)
    // beyond the line (the men in front of it hide it by depth): its ray lands past the box
    expect(coverAt(mask, N, O, 0.5, cam, [0, 3, 8], 0)).toBe(0)
    // off the line's flank
    expect(coverAt(mask, N, O, 0.5, cam, [30, 3, -2], 0)).toBe(0)
    // a ray that never comes down
    expect(coverAt(mask, N, O, 0.5, [0, 1, -30], [0, 3, 0], 0)).toBe(0)
  })
  it('takes the largest of overlapping boxes and is drawn afresh each time', () => {
    const m = new Uint8Array(N * N)
    drawClearance(Float32Array.from([-5, -5, 5, 5, 0, 0, 10, 10]), 2, m, N, O, 0.5, 2)
    expect(maskAt(m, N, O, 0.5, 7, 7)).toBeCloseTo(1, 2)
    drawClearance(new Float32Array(0), 0, m, N, O, 0.5, 2)
    expect(m.every(v => v === 0)).toBe(true)
  })
  it('caps the opacity over the men smoothly, whole clear of them', () => {
    expect(coverCap(0, 0.4)).toBe(1)
    expect(coverCap(0.15, 0.4)).toBe(1)
    expect(coverCap(1, 0.4)).toBeCloseTo(0.4, 9)
    expect(coverCap(0.65, 0.4)).toBeCloseTo(0.4, 9)
    let last = 1
    for (let c = 0; c <= 1; c += 0.05) {
      expect(coverCap(c, 0.4)).toBeLessThanOrEqual(last)
      last = coverCap(c, 0.4)
    }
    expect(coverCap(1, 1)).toBe(1)
  })
})

describe("the puffs' ring", () => {
  it("holds every line battalion's puffs alive at once", () => {
    const n = ringSize(14, muzzles(drill, DEF.files).length, timing(true), DEF)
    expect(n).toBeGreaterThanOrEqual(14 * drill.ranks * muzzles(drill, DEF.files).length)
    expect(ringSize(1000, 100, timing(true), DEF)).toBe(8192)
  })
})

describe('the switches', () => {
  const look = (q: string) => smokeLook(new URLSearchParams(q))
  it('off with ?smoke=0, the default variant without it, a variant by name', () => {
    expect(look('smoke=0')).toBeNull()
    expect(look('')).toEqual(SMOKE_LOOKS[SMOKE_DEFAULT])
    expect(look('smoke=1')).toEqual(SMOKE_LOOKS[SMOKE_DEFAULT])
    expect(look('smoke=step')).toEqual(SMOKE_LOOKS.step)
  })
  it('the knobs over the variant', () => {
    expect(look('smoke=soft&smokestep=12&smokecap=0.6')).toEqual({ step: 12, cap: 0.6 })
    expect(look('smokecap=1')?.cap).toBe(1)
    expect(look('smokecap=0')?.cap).toBe(0)
  })
  it('a bad value throws', () => {
    for (const q of ['smoke=a', 'smoke=d', 'smokestep=x', 'smokestep=61', 'smokecap=2', 'smokecap=-1', 'smokecap=x']) {
      expect(() => look(q)).toThrow()
    }
  })
})
