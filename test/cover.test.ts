// The look world's cover (docs/plans/active/l5-macro.md, L5a): its grid's run-length coding round-trips and refuses
// a run that leaves its row, and the authored cover keeps the art bible's rules (no field or village on the
// floodplain, nothing but meadow in the formation zones) and holds every class the macro colour paints.
import { describe, expect, it } from 'vitest'
import { SPEC } from '../src/look/spec.ts'
import { COVER, authorCover, coverAt, inFormationZone, isField, onFloodplain, packCover, unpackCover } from '../src/look/world/cover.ts'
import { buildLookData } from '../tools/build-look-data.ts'
import { decodeLook } from '../src/look/world/data.ts'
import { BUILDINGS, PAVE_REACH, YARD_ALL, YARD_BASE, paveSdf, pavePoly } from '../src/look/world/buildings.ts'

const look = () => { const b = buildLookData(); return decodeLook(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer) }

describe('cover grid coding', () => {
  it('round-trips', () => {
    const n = 5, tex = new Uint8Array(n * n * 4).map((_, i) => (i * 37) % 7 < 3 ? 1 : 2)
    expect(unpackCover(n, packCover({ n, cell: 1, x0: 0, z0: 0, tex }))).toEqual(tex)
  })
  it('refuses a run past its row, and runs that do not cover the grid', () => {
    expect(() => unpackCover(2, Uint8Array.from([3, 0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1]))).toThrow(/leaves its row/)
    expect(() => unpackCover(2, Uint8Array.from([2, 0, 1, 1, 1, 1]))).toThrow(/cover 2 cells, not 4/)
  })
})

describe('the authored cover', () => {
  const g = look().cover
  it('fills the far ring at the spec\'s cell', () => {
    expect(g.n * g.cell).toBe(SPEC.far)
    expect(g.cell).toBe(SPEC.macro.cover)
  })
  it('keeps fields and the village off the floodplain and the formation zones', () => {
    let fields = 0
    for (let j = 0; j < g.n; j += 3) for (let i = 0; i < g.n; i += 3) {
      const x = g.x0 + (i + 0.5) * g.cell, z = g.z0 + (j + 0.5) * g.cell, c = g.tex[(j * g.n + i) * 4]
      if (!isField(c) && c !== COVER.village && c !== COVER.bare) continue
      fields++
      expect(!onFloodplain(x, z) && !inFormationZone(x, z), `class ${c} at ${x},${z}`).toBe(true)
    }
    expect(fields).toBeGreaterThan(1000)
  })
  it('holds every class the macro colour paints but wood (not used yet), and fields carry an id and wear stops at the lines', () => {
    const seen = new Set<number>()
    for (let k = 0; k < g.tex.length; k += 4) {
      seen.add(g.tex[k])
      if (isField(g.tex[k])) expect(g.tex[k + 1]).toBeGreaterThan(0)
      else expect(g.tex[k + 1]).toBe(0)
      // (a building's yard is worn by its distance to the lines alone: the road's paint gate passes it by far from one)
      if (g.tex[k] === COVER.road || g.tex[k] === COVER.track || (g.tex[k] === COVER.village && g.tex[k + 2] < YARD_ALL)) expect(g.tex[k + 3]).toBe(0)
    }
    for (const [name, c] of Object.entries(COVER)) if (name !== 'wood') expect(seen.has(c), name).toBe(true)
    expect(seen.has(COVER.wood)).toBe(false)
  })
  // the paving's gate (shore.glsl, roadPaint) runs one building's shape, the one its texel names (YARD_BASE plus its
  // index), or every one (YARD_ALL): every point the paving can paint for a building (within PAVE_REACH of its yard,
  // pavePaint's cut-off) must read a texel (nearest) naming that building or all, or a road's or a track's (they keep
  // their class: the gate skips them)
  it('marks every texel within the paving\'s reach of a yard with that yard\'s building', () => {
    let seen = 0, all = 0
    BUILDINGS.forEach((b, bi) => {
      const poly = pavePoly(b), xs = poly.map(p => p[0]), zs = poly.map(p => p[1])
      for (let x = Math.min(...xs) - PAVE_REACH; x <= Math.max(...xs) + PAVE_REACH; x += 0.25) for (let z = Math.min(...zs) - PAVE_REACH; z <= Math.max(...zs) + PAVE_REACH; z += 0.25) {
        if (paveSdf(b, x, z) > PAVE_REACH) continue
        const i = Math.floor((x - g.x0) / g.cell), j = Math.floor((z - g.z0) / g.cell), o = (j * g.n + i) * 4
        if (g.tex[o] === COVER.road || g.tex[o] === COVER.track) continue
        expect([g.tex[o], g.tex[o + 1]], `${b.model} ${bi} at ${x.toFixed(2)}, ${z.toFixed(2)}`).toEqual([COVER.village, 0])
        expect([YARD_BASE + bi, YARD_ALL], `${b.model} ${bi} at ${x.toFixed(2)}, ${z.toFixed(2)}`).toContain(g.tex[o + 2])
        seen++; if (g.tex[o + 2] === YARD_ALL) all++
      }
    })
    expect(seen).toBeGreaterThan(1000)
    expect(all / seen).toBeLessThan(0.05)   // (every shape only between close yards)
  })
  it('wears a yard far from a road by its distance to the lines, not as the village', () => {
    let far = 0
    for (let k = 0; k < g.tex.length; k += 4) if (g.tex[k] === COVER.village && g.tex[k + 2] >= YARD_ALL && g.tex[k + 3] > 0) far++
    expect(far).toBeGreaterThan(100)
  })
  it('reads meadow off the grid', () => {
    expect(coverAt(g, -1e5, 0)).toBe(COVER.meadow)
  })
  it('is deterministic', () => {
    expect(authorCover(SPEC.far, SPEC.macro.cover).tex).toEqual(g.tex)
  })
})
