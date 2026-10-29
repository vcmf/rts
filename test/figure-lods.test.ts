// Each figure's lighter LODs cover what its nearest covers, as the page draws them (back faces culled), from the RTS
// camera's views at its baked steps (lodGaps): what a torn LOD fails. The cuirassier's near LOD, decimated from the
// GLB's mesh split at every seam, was torn (holes, shredded legs, loose shards: the owner, 2026-10-29); it left 6.4 %
// of the nearest's cells uncovered on average and its far LOD 35 %, the battery's far LOD 17 %
// (docs/plans/active/cavalry-artillery-demo.md, tools/bake-figure.py's welded and remeshed).
import { readFileSync } from 'node:fs'
import { describe, expect } from 'vitest'
import { decodeUnits } from '../src/look/units-data.ts'
import { longIt } from './fx.ts'
import { lodGaps } from './lod-coverage.ts'

const figure = (name: string) =>
  decodeUnits(new Uint8Array(readFileSync(new URL(`../data/figures/${name}.unitdata`, import.meta.url))).buffer)

// the share of the nearest LOD's cells a lighter LOD may leave uncovered: on average over the views and steps, and at
// the worst one (the far LOD, a few hundred triangles, rounds a figure's thin parts away)
const LIMITS = { lod1: { mean: 0.03, worst: 0.08 }, lod2: { mean: 0.1, worst: 0.16 } } as const

describe("a figure's lighter LODs cover its nearest (holes, torn parts, flipped faces)", () => {
  for (const name of ['fr-line-infantry', 'fr-cuirassier', 'fr-foot-artillery']) {
    longIt(
      name,
      () => {
        const d = figure(name)
        for (const lod of ['lod1', 'lod2'] as const) {
          const g = lodGaps(d, lod, { yaws: 6, steps: 4 })
          expect(g.mean, `${name} ${lod}: mean`).toBeLessThan(LIMITS[lod].mean)
          expect(g.worst, `${name} ${lod}: worst`).toBeLessThan(LIMITS[lod].worst)
        }
      },
      120_000,
    )
  }
})

describe('lodGaps finds what tore the cuirassier', () => {
  /** the figure with its near LOD's triangles changed: drop (a hole: every 4th of them gone) or flip (every 4th
   *  wound backwards, culled from the front) */
  const harmed = (how: 'drop' | 'flip') => {
    const d = figure('fr-cuirassier')
    const m = d.mesh.lod1
    const ix = Array.from(m.indices)
    const out: number[] = []
    for (let t = 0; t < ix.length; t += 3) {
      const tri = ix.slice(t, t + 3)
      if ((t / 3) % 4 === 0) {
        if (how === 'drop') continue
        tri.reverse()
      }
      out.push(...tri)
    }
    return { ...d, mesh: { ...d.mesh, lod1: { ...m, indices: Uint16Array.from(out) } } }
  }
  longIt(
    'a hole or flipped faces leave far more uncovered than the bake',
    () => {
      const base = lodGaps(figure('fr-cuirassier'), 'lod1', { yaws: 6, steps: 4 }).mean
      for (const how of ['drop', 'flip'] as const) {
        const g = lodGaps(harmed(how), 'lod1', { yaws: 6, steps: 4 })
        expect(g.mean, how).toBeGreaterThan(LIMITS.lod1.mean)
        expect(g.mean, how).toBeGreaterThan(base * 3)
      }
    },
    120_000,
  )
})
