// An area's inside found a row at a time (src/map/geometry.ts ringRow): the same answer as inRing for every point,
// on edges and vertices too, so painting an area by rows gives the cells cell-by-cell painting gave.
import { describe, it, expect } from 'vitest'
import type { Pt } from '../src/map/schema.ts'
import { inRing, ringRow } from '../src/map/geometry.ts'

// a seeded generator, so a failure repeats
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

describe('an area inside by rows', () => {
  it('agrees with inRing for random rings over a grid, edges and vertices on its rows and columns included', () => {
    const r = rng(7)
    for (let t = 0; t < 300; t++) {
      // a star-shaped ring round the origin, some vertices on whole metres (the grid's points), others on centimetres
      const n = 3 + Math.floor(r() * 12)
      const ring: Pt[] = Array.from({ length: n }, (_, k) => {
        const a = (2 * Math.PI * (k + r() * 0.8)) / n
        const d = 5 + r() * 25
        const snap = r() < 0.4 ? 1 : 100
        return [Math.round(d * Math.cos(a) * snap) / snap, Math.round(d * Math.sin(a) * snap) / snap]
      })
      // a horizontal edge on a row now and then
      if (r() < 0.3) ring[1] = [ring[1][0], ring[0][1]]
      const xs = Array.from({ length: 81 }, (_, k) => -40 + k)
      for (let z = -40; z <= 40; z += r() < 0.5 ? 1 : 0.5) {
        const row = ringRow(ring, z, xs)
        for (let k = 0; k < xs.length; k++) {
          if (row[k] !== (inRing(ring, [xs[k], z]) ? 1 : 0)) {
            expect({ ring, z, x: xs[k], row: row[k] }).toEqual({
              ring,
              z,
              x: xs[k],
              row: inRing(ring, [xs[k], z]) ? 1 : 0,
            })
          }
        }
      }
    }
  })
})
