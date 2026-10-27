// The soldiers' simple shadows baked per animation step (?ushstep, docs/plans/active/step-shadows.md, #229): the bin a
// man's step draws (stepBin, and unitdecal.vert's copy of it), the blend's two bins (stepBlend), the atlas's layout and
// size (stepAtlasLayout, shadowShape's steps), the page's switch (applyStepParams), and the feet on the shape.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  FOOT_SHARP,
  SHADOW_CONTACT,
  STEP_SHADOW,
  applyContactParams,
  applyFootSharpParams,
  applyNearBandParams,
  NEAR_BAND,
  ovalWeight,
  applyStepParams,
  footSharpen,
  nearOn,
  nearWeight,
} from '../src/look/shadow-look.ts'
import {
  binSteps,
  decodeUnits,
  posedVertices,
  shadowShape,
  stepAtlasLayout,
  AtlasTooLarge,
  stepBin,
  stepBlend,
  stepIndex,
} from '../src/look/units-data.ts'

const f32 = Math.fround

describe('the bin a step draws (stepBin)', () => {
  it('puts every step of a clip in the bin that holds it, every bin used, for every clip length and bin count', () => {
    for (let n = 1; n <= 200; n++) {
      for (let k = 1; k <= Math.min(n, 32); k++) {
        const seen = new Set<number>()
        for (let i = 0; i < n; i++) {
          const j = stepBin(i, n, k)
          expect(Math.floor((j * n) / k)).toBeLessThanOrEqual(i)
          expect(i).toBeLessThan(Math.floor(((j + 1) * n) / k))
          seen.add(j)
        }
        expect(seen.size).toBe(k)
      }
    }
  })
  // a GPU's mod(x, n) as ANGLE Metal computes it, x − n·floor(x·rcp(n)), in float32, the product 1 ULP off either
  // way: it can return n itself (#review round 1)
  const gpuMod = (x: number, n: number, ulp: -1 | 0 | 1) => {
    const q = f32(f32(x) * f32(1 / n))
    const qq = f32(q * (1 + ulp * 2 ** -23))
    return f32(x - f32(n * Math.floor(qq)))
  }
  it("takes the figure's own step (units.vert's int() of start + mod) on a GPU, its mod off by an ULP or n itself", () => {
    for (let n = 1; n <= 200; n++) {
      for (const start of [0, 49, 75, 1000]) {
        for (let x = 0; x < 3 * n; x++) {
          for (const ulp of [-1, 0, 1] as const) {
            const m = gpuMod(x + 1000 * n, n, ulp)
            // (units.vert: int f=int(r.x+mod(...)); at the exact n it poses the clip's closing row, its first pose)
            const figure = Math.trunc(f32(start + m)) - start
            const i = stepIndex(start, m, n)
            expect(i).toBe(figure % n)
            expect(i).toBe(x % n)
          }
        }
      }
    }
  })
  it("puts a GPU's step in the right bin, never past the clip's", () => {
    for (let n = 1; n <= 200; n++) {
      for (let k = 1; k <= Math.min(n, 16); k++) {
        for (let x = 0; x < 3 * n; x++) {
          for (const ulp of [-1, 0, 1] as const) {
            const i = stepIndex(49, gpuMod(x + 1000 * n, n, ulp), n)
            const j = stepBin(i, n, k)
            expect(j).toBeGreaterThanOrEqual(0)
            expect(j).toBeLessThan(k)
            expect(Math.floor((j * n) / k)).toBeLessThanOrEqual(i)
          }
        }
      }
    }
  })
  it("wraps the mod's n to 0 and clamps any bin into the clip's", () => {
    expect(stepIndex(49, 16, 16)).toBe(0)
    expect(stepIndex(49, 15, 16)).toBe(15)
    expect(stepIndex(49, -0.2, 16)).toBe(0)
    expect(stepBin(16, 16, 8)).toBe(7)
    expect(stepBin(-1, 16, 8)).toBe(0)
  })
  it('blends two bins in the clip, the share in [0, 1], even from the n a GPU mod can give', () => {
    for (const [n, k] of [
      [16, 8],
      [166, 8],
      [8, 8],
    ]) {
      for (const i of [0, n - 1, n]) {
        const b = stepBlend(i, n, k)
        for (const j of [b.j0, b.j1]) expect(j >= 0 && j < k).toBe(true)
        expect(b.s >= 0 && b.s <= 1).toBe(true)
      }
    }
  })
  it('bakes each bin from its own steps, at most `samples` of them', () => {
    expect(binSteps(49, 16, 8, 3, 4)).toEqual([55, 56])
    expect(binSteps(75, 166, 8, 0, 4)).toEqual([75, 80, 85, 90])
    for (let j = 0; j < 8; j++) for (const s of binSteps(75, 166, 8, j, 4)) expect(stepBin(s - 75, 166, 8)).toBe(j)
  })
})

describe("the blend's two bins (stepBlend)", () => {
  it('mixes two neighbouring bins round the loop, the share in [0, 1); a bin a step is that step alone', () => {
    for (const [n, k] of [
      [16, 8],
      [166, 8],
      [8, 8],
      [48, 12],
    ]) {
      for (let i = 0; i < n; i++) {
        const b = stepBlend(i, n, k)
        expect(b.j1).toBe((b.j0 + 1) % k)
        expect(b.s).toBeGreaterThanOrEqual(0)
        expect(b.s).toBeLessThan(1)
        if (n === k) expect([b.j0, b.s]).toEqual([i, 0])
      }
    }
  })
})

describe("the step atlas's layout (stepAtlasLayout)", () => {
  it('holds every row within the size limit, as near square as it can', () => {
    const l = stepAtlasLayout(112, 160, 16, 32)
    expect(l).toEqual({ blocks: 2, rowsPerBlock: 16, width: 3584, height: 2560 })
    for (const [rows, f] of [
      [1, 16],
      [4, 16],
      [32, 16],
      [44, 16],
      [32, 8],
      [64, 8],
      [100, 8],
    ]) {
      const m = stepAtlasLayout(112, 160, f, rows)
      expect(m.blocks * m.rowsPerBlock).toBeGreaterThanOrEqual(rows)
      expect(Math.max(m.width, m.height)).toBeLessThanOrEqual(4096)
    }
  })
  it('refuses an atlas that cannot fit', () => {
    expect(() => stepAtlasLayout(112, 160, 16, 200)).toThrow(/exceed/)
    expect(() => stepAtlasLayout(112, 160, 16, 32, 2048)).toThrow(/exceed/)
  })
})

describe('the page switch (?ushstep: applyStepParams)', () => {
  const q = (s: string) => applyStepParams(new URLSearchParams(s))
  it('reads steps, facings and the mode; absent is decision 0074s 8,8,hold, 0 the clip-averaged shape', () => {
    expect(q('')).toEqual({ steps: 8, facings: 8, blend: false })
    expect(q('')).toEqual(STEP_SHADOW)
    expect(q('ushstep=0')).toBeNull()
    expect(q('ushstep=8')).toEqual({ steps: 8, facings: 8, blend: false })
    expect(q('ushstep=4,8,blend')).toEqual({ steps: 4, facings: 8, blend: true })
    expect(q('ushstep=12,16,hold')).toEqual({ steps: 12, facings: 16, blend: false })
  })
  it('refuses malformed values', () => {
    for (const v of ['x', '8,', '8,2', '33', '8,16,mix', '-1', '8.5', '8,16,hold,1']) {
      expect(() => q(`ushstep=${v}`), v).toThrow(/ushstep/)
    }
  })
})

describe('the shape baked per step (shadowShape steps)', () => {
  const d = decodeUnits(
    new Uint8Array(readFileSync(new URL('../data/figures/fr-line-infantry.unitdata', import.meta.url))).buffer,
  )
  const lod = d.lods[d.lods.length - 1].name
  const l = Math.hypot(-0.7, 0.45, 0.55)
  const sun = [-0.7 / l, 0.45 / l, 0.55 / l] as const
  const roles = ['halt', 'march', 'run', 'fire']
  const pv = posedVertices(d, lod)
  const today = shadowShape(d, lod, sun, roles, { facings: 8, soft: 0.12, posed: pv })
  const s = shadowShape(d, lod, sun, roles, { facings: 8, soft: 0.12, posed: pv, steps: 8 })
  const cell = (row: number, k: number) => {
    const bl = Math.floor(row / s.rowsPerBlock)
    const y0 = (row % s.rowsPerBlock) * s.cellH
    const x0 = (bl * s.facings + k) * s.cellW
    const v: number[] = []
    for (let y = 0; y < s.cellH; y++) {
      for (let x = 0; x < s.cellW; x++) v.push(s.data[((y0 + y) * s.width + x0 + x) * 2])
    }
    return v
  }
  it('lays its bins out as stepAtlasLayout says, its cells as today', () => {
    expect(s.bins).toEqual(roles.map(r => Math.min(8, d.ranges[r].end - d.ranges[r].start)))
    expect(s.binRow).toEqual([0, 8, 16, 24])
    expect([s.cellW, s.cellH, s.margin]).toEqual([today.cellW, today.cellH, today.margin])
    const lay = stepAtlasLayout(s.cellW, s.cellH, 8, 32)
    expect([s.width, s.height, s.rowsPerBlock, s.blocks]).toEqual([lay.width, lay.height, lay.rowsPerBlock, lay.blocks])
    expect(s.data.length).toBe(s.width * s.height * 2)
    // (today's: one bin a role, a block)
    expect([today.bins, today.binRow, today.rowsPerBlock, today.blocks]).toEqual([[1, 1, 1, 1], [0, 1, 2, 3], 4, 1])
  })
  it("refuses an atlas over the GPU's size by AtlasTooLarge: decision 0074's default needs 2560, WebGL2 promises 2048", () => {
    expect(() =>
      shadowShape(d, lod, sun, roles, { facings: 8, soft: 0.12, posed: pv, steps: 8, maxSize: 2048 }),
    ).toThrow(AtlasTooLarge)
    expect(Math.max(s.width, s.height)).toBe(2560)
  })
  it('fills every cell inside its empty border, the run differing step to step', () => {
    for (let row = 0; row < 32; row++) {
      for (let k = 0; k < 8; k++) {
        const v = cell(row, k)
        let mass = 0
        v.forEach((t, i) => {
          const x = i % s.cellW
          const y = Math.floor(i / s.cellW)
          const inside = x >= s.margin && y >= s.margin && x < s.cellW - s.margin && y < s.cellH - s.margin
          if (!inside) expect(t).toBe(0)
          mass += t
        })
        expect(mass, `row ${row} facing ${k}`).toBeGreaterThan(0)
      }
    }
    const a = cell(16, 0)
    const b = cell(20, 0)
    expect(a.some((t, i) => Math.abs(t - b[i]) > 64)).toBe(true)
  })
  it('keeps the marching feet on the shape more than the clip-averaged shape does', () => {
    const A = s.dir
    const C = [-A[1], A[0]]
    const kx = sun[0] / sun[1]
    const kz = sun[2] / sun[1]
    const nv = pv.width / 2
    const rg = d.ranges.march
    const n = rg.end - rg.start
    let floor = Infinity
    for (let st = rg.start; st < rg.end; st++) {
      for (let v = 0; v < nv; v++) floor = Math.min(floor, pv.data[(st * nv * 2 + v * 2) * 4 + 1])
    }
    // the shape's value under each foot vertex, every step, facing 0 (unturned): today's and per step
    let sumToday = 0
    let sumStep = 0
    let cnt = 0
    for (let st = rg.start; st < rg.end; st++) {
      const row = s.binRow[1] + stepBin(st - rg.start, n, s.bins[1])
      for (let v = 0; v < nv; v++) {
        const o = (st * nv * 2 + v * 2) * 4
        const [x, y, z] = [pv.data[o], pv.data[o + 1], pv.data[o + 2]]
        if (y > floor + 0.12) continue
        const wx = x - kx * y
        const wz = z - kz * y
        const i = Math.floor((wx * C[0] + wz * C[1] - s.across[0]) / s.texel) + s.margin
        const j = Math.floor((wx * A[0] + wz * A[1] - s.along[0]) / s.texel) + s.margin
        sumToday += today.data[((today.cellH + j) * today.width + i) * 2]
        sumStep += cell(row, 0)[j * s.cellW + i]
        cnt++
      }
    }
    expect(cnt).toBeGreaterThan(0)
    expect(sumStep / cnt).toBeGreaterThan(1.3 * (sumToday / cnt))
  })
})

describe('unitdecal.vert picks the bin as stepBin and stepBlend do (the source)', () => {
  const src = (f: string) =>
    readFileSync(new URL(`../src/look/shaders/${f}`, import.meta.url), 'utf8')
      .replace(/\/\/[^\n]*/g, '')
      .replace(/\s+/g, '')
  const once = (text: string, line: string) => expect(text.split(line).length - 1, line).toBe(1)
  it("his step as units.vert counts it, his bin, the blend's bins, the cell's block", () => {
    const v = src('unitdecal.vert')
    once(src('units.vert'), 'intf=int(r.x+mod(uVATStep+r.z,r.y));')
    once(v, 'intii=int(aVAT.x+mod(uVATStep+aVAT.z,aVAT.y))-int(aVAT.x+0.5);ii=clamp(ii==ni?0:ii,0,ni-1);')
    once(v, 'floatjb=float(clamp(((ii+1)*ki-1)/ni,0,ki-1));')
    once(v, 'floatsp=(float(ii)+0.5)*float(ki)/float(ni)-0.5,sf=floor(sp);vS=clamp(sp-sf,0.0,1.0);')
    once(v, 'floatja=float(clamp((si+ki)%ki,0,ki-1)),jb=float(clamp((si+1)%ki,0,ki-1));')
    once(v, 'floatbl=floor((rw+0.5)/uStepRPB);')
    once(v, 'return(vec2(bl*FACINGS+k,rw-bl*uStepRPB)*uShapeCell.xy+c)*uShapeCell.zw;')
  })
  it("unitdecal.frag: the feet sharpened as footSharpen does, on the shape alone, before the contact's oval", () => {
    const f = src('unitdecal.frag')
    const boost = 'v*=mix(uShFootK.x,1.0,smoothstep(0.0,max(uShFootK.y,1.0e-3),vAlong));'
    once(f, `v=s*mix(uShFoot.x,uShFoot.y,g);#ifdefSH_STEPS${boost}#endif`)
    // (the oval joins after it, so ?ushcontact=1 draws decision 0071's oval unboosted)
    expect(f.indexOf(boost)).toBeLessThan(f.indexOf('dm=max(dm,uShContact.y);v=max(v,ct);'))
    once(f, 'floata=min(1.0,v/dm);')
  })
})

describe('the near material with the per-step shape (nearWeight, nearOn)', () => {
  const c = { ...SHADOW_CONTACT }
  const band = [...NEAR_BAND] as [number, number]
  it("takes the per-step band for the per-step shape, the oval's own band for the oval, the larger of both", () => {
    expect(NEAR_BAND).toEqual([60, 100])
    expect(nearWeight(null, false, 20, band)).toBe(0)
    expect(nearWeight(null, true, 20, band)).toBe(1)
    expect(nearWeight(null, true, 101, band)).toBe(0)
    expect(nearWeight(null, true, 150, [100, 200])).toBeGreaterThan(0)
    expect(nearWeight({ ...c, band: [10, 20] }, false, 30, band)).toBe(0)
    expect(nearWeight({ ...c, band: [10, 20] }, true, 30, band)).toBe(1)
    expect(nearWeight({ ...c, dark: 0 }, false, 20, band)).toBe(0)
    expect(ovalWeight({ ...c, band: [10, 20] }, 30)).toBe(0)
    expect(ovalWeight(null, 10)).toBe(0)
  })
  it('reads ?ushnearband, 60,100 when absent, r0 < r1', () => {
    const q = (v: string) => applyNearBandParams(new URLSearchParams(v))
    expect(q('')).toEqual([60, 100])
    expect(q('ushnearband=40,150')).toEqual([40, 150])
    for (const v of ['100,60', '50', 'x,1']) expect(() => q(`ushnearband=${v}`), v).toThrow(/ushnearband/)
  })
  it('draws the near material within the band for the oval or the per-step shape', () => {
    expect(nearOn(null, true, 0.5)).toBe(true)
    expect(nearOn(null, true, 0)).toBe(false)
    expect(nearOn(null, false, 1)).toBe(false)
    expect(nearOn(c, false, 1)).toBe(true)
  })
})

describe("the per-step shape's feet sharpened (footSharpen, ?ushfootk)", () => {
  it('boosts the share at and behind the soles, back to 1 by its reach; 1 is none', () => {
    expect(footSharpen(0, 2, 0.4)).toBe(2)
    expect(footSharpen(-0.3, 2, 0.4)).toBe(2)
    expect(footSharpen(0.4, 2, 0.4)).toBe(1)
    expect(footSharpen(1, 3, 0.4)).toBe(1)
    expect(footSharpen(0.2, 2, 0.4)).toBeCloseTo(1.5, 9)
    for (const a of [-1, 0, 0.1, 0.5, 2]) expect(footSharpen(a, 1, 0.4)).toBe(1)
  })
  it('reads the switch: 3,0.6 when absent, the reach 0.6 m by default, refusing values outside 1..4 and 0..1 m', () => {
    const q = (v: string) => applyFootSharpParams(new URLSearchParams(v))
    expect(q('')).toEqual([3, 0.6])
    expect(q('')).toEqual([...FOOT_SHARP])
    expect(q('ushfootk=1')).toEqual([1, 0.6])
    expect(q('ushfootk=2')).toEqual([2, 0.6])
    expect(q('ushfootk=3,0.5')).toEqual([3, 0.5])
    for (const v of ['0.5', '5', '2,2', 'x']) expect(() => q(`ushfootk=${v}`), v).toThrow(/ushfootk/)
  })
})

describe("main's look one URL away (decision 0074's A/B recipe)", () => {
  it('?ushstep=0&ushcontact=1 gives decision 0071s page: no per-step shape, 0071s oval', () => {
    const q = new URLSearchParams('armies=20&ushstep=0&ushcontact=1')
    expect(applyStepParams(q)).toBeNull()
    expect(applyContactParams(q)).toEqual(SHADOW_CONTACT)
  })
  it('the default: the per-step shape 8,8 held, no oval, the feet 3,0.6', () => {
    const q = new URLSearchParams('armies=20')
    expect(applyStepParams(q)).toEqual({ steps: 8, facings: 8, blend: false })
    expect(applyContactParams(q)).toBeNull()
    expect(applyFootSharpParams(q)).toEqual([3, 0.6])
  })
})

describe("the contact's own switches need the contact (applyContactParams)", () => {
  it('?ushcontactat and ?ushcontactband without ?ushcontact are an error, not ignored', () => {
    const q = (v: string) => applyContactParams(new URLSearchParams(v))
    expect(() => q('ushcontactat=root')).toThrow(/needs \?ushcontact=1/)
    expect(() => q('ushcontactband=40,70')).toThrow(/needs \?ushcontact=1/)
    expect(() => q('ushcontact=0&ushcontactat=root')).toThrow(/needs \?ushcontact=1/)
    expect(q('ushcontact=1&ushcontactband=40,70')).toEqual({ ...SHADOW_CONTACT, band: [40, 70] })
  })
})
