// Each figure's LODs are whole: its closest LOD (the nearest, or the near when it has none) not torn into scraps
// (openEdgeShare), and its lighter LODs covering what the closest covers, as the page draws them (back faces culled),
// from the RTS camera's views at its baked steps (lodGaps). The cuirassier's near LOD, decimated from the GLB's mesh
// split at every seam, was torn (holes, shredded legs, loose shards: the owner, 2026-10-29): 1.9 open edges a
// triangle, and 6.4 % of the nearest's cells uncovered on average, its far LOD 35 %, the battery's far LOD 17 %
// (docs/plans/done/cavalry-artillery-demo.md, tools/bake-figure.py's welded and remeshed).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { decodeUnits, type UnitData } from '../src/look/units-data.ts'
import { longIt } from './fx.ts'
import { lodGaps, openEdgeShare } from './lod-coverage.ts'

const figure = (name: string) =>
  decodeUnits(new Uint8Array(readFileSync(new URL(`../data/figures/${name}.unitdata`, import.meta.url))).buffer)

// the share of the closest LOD's cells a lighter LOD may leave uncovered: on average over the views and steps, and at
// the worst one (the far LOD, a few hundred triangles, rounds a figure's thin parts away)
const LIMITS = { next: { mean: 0.03, worst: 0.08 }, far: { mean: 0.1, worst: 0.16 } } as const
// open edges a triangle the closest LOD may have (whole meshes about 0.1; torn, near 2)
const OPEN = 0.3

/** the figure with a LOD's triangles changed: drop (a hole: every 4th of them gone) or flip (every 4th wound
 *  backwards, culled from the front) */
function harmed(d: UnitData, lod: string, how: 'drop' | 'flip'): UnitData {
  const m = d.mesh[lod]
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
  return { ...d, mesh: { ...d.mesh, [lod]: { ...m, indices: Uint16Array.from(out) } } }
}

describe("a figure's LODs are whole (holes, torn parts, flipped faces)", () => {
  for (const name of ['fr-line-infantry', 'fr-cuirassier', 'fr-foot-artillery']) {
    longIt(
      name,
      () => {
        const d = figure(name)
        expect(openEdgeShare(d, d.lods[0].name), `${name} ${d.lods[0].name}: open edges`).toBeLessThan(OPEN)
        d.lods.slice(1).forEach((l, i, rest) => {
          const lim = i === rest.length - 1 ? LIMITS.far : LIMITS.next
          const g = lodGaps(d, l.name, { yaws: 6, steps: 4 })
          expect(g.mean, `${name} ${l.name}: mean`).toBeLessThan(lim.mean)
          expect(g.worst, `${name} ${l.name}: worst`).toBeLessThan(lim.worst)
        })
      },
      120_000,
    )
  }
})

describe('the checks find what tore the cuirassier', () => {
  it("a hole in the closest LOD opens its edges (the cuirassier's near, its closest)", () => {
    const d = figure('fr-cuirassier')
    expect(openEdgeShare(harmed(d, 'lod1', 'drop'), 'lod1')).toBeGreaterThan(OPEN)
  })
  longIt(
    'a hole or flipped faces in a lighter LOD leave far more uncovered than the bake',
    () => {
      const d = figure('fr-foot-artillery')
      const base = lodGaps(d, 'lod1', { yaws: 6, steps: 4 }).mean
      for (const how of ['drop', 'flip'] as const) {
        const g = lodGaps(harmed(d, 'lod1', how), 'lod1', { yaws: 6, steps: 4 })
        expect(g.mean, how).toBeGreaterThan(LIMITS.next.mean)
        expect(g.mean, how).toBeGreaterThan(base * 3)
      }
    },
    120_000,
  )
})
