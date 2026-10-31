// The campaign map's patch near the camera (src/render/campaign/patch.ts, docs/plans/active/k2c-stream.md K2c2): where
// it lies, and the far mesh's own height, which its edge takes so the two meet without a crack.
import { describe, it, expect } from 'vitest'
import { farMeshHeight, patchRamp, patchStart } from '../src/render/campaign/patch.ts'

describe('the patch place', () => {
  it('centres on the target, its start on the far mesh grid', () => {
    // a frame of 800 km (half 400), the far mesh every 0.5 km, the patch 50 km
    expect(patchStart(-20, 400, 0.5, 50)).toBe(-45)
    expect(patchStart(-20.2, 400, 0.5, 50)).toBe(-45)
    expect(patchStart(-20.3, 400, 0.5, 50)).toBe(-45.5)
    // its start a whole number of steps from the frame edge
    const x = patchStart(123.456, 400, 0.5, 50)!
    expect(((x + 400) / 0.5) % 1).toBe(0)
  })

  it('stays a step inside the frame at its edges', () => {
    expect(patchStart(-399, 400, 0.5, 50)).toBe(-399.5)
    expect(patchStart(399, 400, 0.5, 50)).toBe(349.5)
  })

  it('is none on a frame too small to hold it a step inside each edge', () => {
    expect(patchStart(0, 20, 0.5, 50)).toBeNull()
    expect(patchStart(0, 25.4, 0.5, 50)).toBeNull()
    // a frame of 51 km holds it half a kilometre inside each edge
    expect(patchStart(0, 25.5, 0.5, 50)).toBe(-25)
  })
})

describe('the far mesh height', () => {
  // a grid of 5 × 4 nodes 0.25 km apart, a vertex every 2 nodes: quads of 0.5 km, the last row one node high
  const nx = 5
  const nz = 4
  const shape = Float32Array.from({ length: nx * nz }, (_, k) => ((k * 37) % 11) * 10)
  const at = (i: number, j: number) => shape[j * nx + i]
  const h = (x: number, z: number) => farMeshHeight(shape, nx, nz, 0.25, 2, x, z)

  it('is the node height at each vertex', () => {
    for (const [i, j] of [
      [0, 0],
      [2, 0],
      [4, 0],
      [2, 2],
      [4, 3],
      [0, 3],
    ]) {
      expect(h(i * 0.25, j * 0.25), `vertex ${i}, ${j}`).toBeCloseTo(at(i, j), 9)
    }
  })

  it('is linear along the grid lines between two vertices, where the patch edge lies', () => {
    // the south edge from node 0 to node 2, and the west edge from row 0 to row 2
    for (const t of [0.1, 0.5, 0.8]) {
      expect(h(t * 0.5, 0)).toBeCloseTo(at(0, 0) + t * (at(2, 0) - at(0, 0)), 9)
      expect(h(0, t * 0.5)).toBeCloseTo(at(0, 0) + t * (at(0, 2) - at(0, 0)), 9)
    }
    // the edge between two quads, at x = 0.5 km, the same from either side
    expect(h(0.5 - 1e-9, 0.2)).toBeCloseTo(h(0.5 + 1e-9, 0.2), 6)
  })

  it('is linear across each triangle, the quad cut from its south-east corner to its north-west one', () => {
    // on the cut, from (2, 0) to (0, 2): both triangles agree
    const mid = h(0.25, 0.25)
    expect(mid).toBeCloseTo((at(2, 0) + at(0, 2)) / 2, 9)
    // the north-east triangle: (2, 0), (2, 2), (0, 2)
    const p = h(0.4, 0.4)
    const u = 0.8
    const v = 0.8
    expect(p).toBeCloseTo(at(2, 2) + (1 - u) * (at(0, 2) - at(2, 2)) + (1 - v) * (at(2, 0) - at(2, 2)), 9)
  })

  it('reaches the grid edge in the last quad, narrower than the others', () => {
    // the last quad spans nodes 2 to 4 in x and rows 2 to 3 in z (one node)
    expect(h(1.0, 0.75)).toBeCloseTo(at(4, 3), 9)
    // node (3, 3): halfway along the quad's north edge, from (2, 3) to (4, 3)
    expect(h(0.75, 0.75)).toBeCloseTo((at(2, 3) + at(4, 3)) / 2, 9)
  })
})

describe('the patch share of the detail', () => {
  const rect: [number, number, number, number] = [-25, -25, 25, 25]
  const ramp = (x: number, z: number, centre: [number, number] = [0, 0], r = rect) =>
    patchRamp(x, z, centre, r, 19, 22.5, 0.5)

  it('is whole near the target and none past its outer square', () => {
    expect(ramp(0, 0)).toBe(1)
    expect(ramp(18, -18)).toBe(1)
    expect(ramp(22.5, 0)).toBe(0)
    expect(ramp(5, 23)).toBe(0)
    expect(ramp(20.75, 0)).toBeCloseTo(0.5, 9)
  })

  it('is none within the band of the patch edge, wherever the patch lies', () => {
    // a patch pushed off its target (near the frame edge): the target 3 km from its east edge
    const pushed: [number, number, number, number] = [-28, -25, 22, 25]
    expect(ramp(22, 0, [19, 0], pushed)).toBe(0)
    expect(ramp(21.6, 0, [19, 0], pushed)).toBe(0)
    // 1.5 km from the edge: halfway up the band's 2 km ease
    expect(ramp(20.5, 0, [19, 0], pushed)).toBeCloseTo(0.5, 9)
  })
})
