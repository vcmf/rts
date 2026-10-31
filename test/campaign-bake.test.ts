// The campaign map's bake (src/render/campaign/bake.ts): the box mean, the lakes' signed distance and the baked light.
import { describe, it, expect } from 'vitest'
import { bakeLightRows, boxMean, despiked, lakeDistance, sinkLakes, type Grid } from '../src/render/campaign/bake.ts'

/** The box mean computed the slow way: the mean of the nodes within r, clamped to the grid. */
function slowMean(h: number[], nx: number, nz: number, r: number): number[] {
  const out: number[] = []
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      let sum = 0
      let n = 0
      for (let b = Math.max(0, j - r); b <= Math.min(nz - 1, j + r); b++) {
        for (let a = Math.max(0, i - r); a <= Math.min(nx - 1, i + r); a++) {
          sum += h[b * nx + a]
          n++
        }
      }
      out.push(sum / n)
    }
  }
  return out
}

describe('the bake', () => {
  it('box-means as the slow way does, edges clamped', () => {
    const nx = 9
    const nz = 7
    const h = Array.from({ length: nx * nz }, (_, k) => Math.sin(k * 1.7) * 100 + k)
    for (const r of [1, 2, 4]) {
      const fast = boxMean(h, nx, nz, r)
      slowMean(h, nx, nz, r).forEach((v, k) => expect(fast[k]).toBeCloseTo(v, 3))
    }
  })

  it('clamps a single-node spike to its neighbours', () => {
    const h = new Array(25).fill(10)
    h[12] = 500
    expect(despiked(h, 5, 5)[12]).toBe(10)
  })

  it('measures the lake distance positive inside and negative outside', () => {
    const g: Grid = { nx: 41, nz: 41, cell: 100, x0: -2000, z0: -2000 }
    const lake: [number, number][] = [
      [-1000, -1000],
      [1000, -1000],
      [1000, 1000],
      [-1000, 1000],
    ]
    const d = lakeDistance([lake], g, 100)
    const at = (x: number, z: number) => d[((z + 2000) / 100) * 41 + (x + 2000) / 100]
    expect(at(0, 0)).toBeGreaterThan(0.7)
    expect(at(1800, 0)).toBeLessThan(-0.5)
    expect(at(0, 0)).toBeGreaterThan(at(700, 0))
  })

  it('shades the far side of a ridge from a low sun and lights its near side', () => {
    // a 2,000 m ridge along z at x = 0; the sun low in the east (azimuth 90)
    const g: Grid = { nx: 201, nz: 21, cell: 100, x0: -10000, z0: -1000 }
    const shape = new Float32Array(g.nx * g.nz)
    for (let j = 0; j < g.nz; j++) {
      for (let i = 0; i < g.nx; i++) shape[j * g.nx + i] = Math.max(0, 2000 - Math.abs(g.x0 + i * g.cell) * 2)
    }
    const out = new Uint8Array(g.nx * g.nz * 2)
    bakeLightRows(shape, g, { el: 15, az: 90, size: 2 }, out, 10, 11)
    const sun = (x: number) => out[(10 * g.nx + (x - g.x0) / g.cell) * 2]
    expect(sun(3000)).toBe(255)
    expect(sun(-3000)).toBe(0)
  })

  it('bakes the same bytes by bands as in one pass, as the workers of the tool do', () => {
    const g: Grid = { nx: 41, nz: 31, cell: 100, x0: 0, z0: 0 }
    const shape = Float32Array.from({ length: g.nx * g.nz }, (_, k) => 300 * Math.sin(k * 0.37) + 400)
    const whole = new Uint8Array(g.nx * g.nz * 2)
    bakeLightRows(shape, g, { el: 20, az: 55, size: 2.5 }, whole, 0, g.nz)
    const bands = new Uint8Array(g.nx * g.nz * 2)
    for (const [j0, j1] of [
      [0, 7],
      [7, 20],
      [20, 31],
    ]) {
      bakeLightRows(shape, g, { el: 20, az: 55, size: 2.5 }, bands, j0, j1)
    }
    expect(bands).toEqual(whole)
  })
})

describe('the lakes sunk', () => {
  it('drop the same over the same metres from the shore at every level, eased over the width given', () => {
    // the distance to the shore in km at a node (positive in the water): a 100 m level and a 250 m one
    const fine = Float32Array.from({ length: 11 }, (_, k) => (k - 5) * 0.1)
    const coarse = Float32Array.from({ length: 5 }, (_, k) => (k - 2) * 0.25)
    const sunkFine = sinkLakes(new Float32Array(11), fine, 250, 70)
    const sunkCoarse = sinkLakes(new Float32Array(5), coarse, 250, 70)
    // dry 125 m and more inland, full 125 m and more out, half at the shore
    expect(sunkFine[3]).toBe(0)
    expect(sunkFine[5]).toBeCloseTo(-35, 4)
    expect(sunkFine[7]).toBeCloseTo(-70, 4)
    // at 100 m the drop takes more than one node: a node 100 m out is sunk part of the way
    expect(sunkFine[6]).toBeCloseTo(-63, 4)
    // the 250 m level's nodes at 0 and 250 m out fall where the 100 m level's would
    expect(sunkCoarse[2]).toBeCloseTo(sunkFine[5], 4)
    expect(sunkCoarse[3]).toBeCloseTo(-70, 4)
  })
})
