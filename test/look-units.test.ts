// The armies' figures on the look page, the parts of src/look/units.ts pulled out pure (src/look/units-data.ts): the
// far figure's growth across (farWidthScale), the battalions' LOD switches with their hysteresis (drawsNear,
// drawsTiny), a figure's parts (boneParts) beyond its ground contact (test/armies.test.ts), and what of a mesh is seen
// from round the figure (seenArea).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { boneParts, drawsNear, drawsTiny, farWidthScale, seenArea, type UnitData } from '../src/look/units-data.ts'

describe("the far figure's growth across (farWidthScale)", () => {
  // a figure's vertices at (x, y, 0)
  const at = (...xy: [number, number][]) => Float32Array.from(xy.flatMap(([x, y]) => [x, y, 0]))
  it('widens up to the cap', () => {
    expect(farWidthScale(at([-0.15, 1.3], [0.15, 1.4], [3, 0.5]), 0.55, 1.35)).toBe(1.35)
  })
  it("never wider than 95 % of a file, measured at the shoulders' band alone", () => {
    // (0.5 m across between 1.2 and 1.5 m up; a musket's 3 m at the hips and a shako at 1.8 m left out)
    const w = farWidthScale(at([-0.25, 1.3], [0.25, 1.45], [3, 0.9], [-2, 1.8]), 0.6, 1.35)
    expect(w).toBeCloseTo((0.95 * 0.6) / 0.5, 12)
  })
  it('is 1 for a figure with no width there: no vertex in the band, or one (never −0, #130)', () => {
    for (const p of [at(), at([0, 0.5], [0.4, 1.7]), at([0.1, 1.3]), at([0.1, 1.2], [0.3, 1.5])]) {
      const w = farWidthScale(p, 0.55, 1.35)
      expect(Object.is(w, 1), `${w}`).toBe(true)
    }
  })
})

describe("a battalion's LOD switches, with their hysteresis (drawsNear, drawsTiny)", () => {
  const lodPx = 48
  it('switches to the near LOD from 10 % over the switch, back from 10 % under it', () => {
    expect(drawsNear(lodPx * 1.1 - 0.01, false, lodPx)).toBe(false)
    expect(drawsNear(lodPx * 1.1, false, lodPx)).toBe(true)
    expect(drawsNear(lodPx * 0.9, true, lodPx)).toBe(true)
    expect(drawsNear(lodPx * 0.9 - 0.01, true, lodPx)).toBe(false)
  })
  it('keeps its LOD anywhere within 10 % of a switch (a battalion there does not flicker)', () => {
    for (const k of [0.91, 1, 1.09]) {
      expect(drawsNear(lodPx * k, true, lodPx), `${k}`).toBe(true)
      expect(drawsNear(lodPx * k, false, lodPx), `${k}`).toBe(false)
      expect(drawsTiny(12 * k, true, 12), `${k}`).toBe(true)
      expect(drawsTiny(12 * k, false, 12), `${k}`).toBe(false)
    }
  })
  it('switches to the tiny LOD from 10 % under its switch, back from 10 % over it', () => {
    expect(drawsTiny(12 * 0.9, false, 12)).toBe(false)
    expect(drawsTiny(12 * 0.9 - 0.01, false, 12)).toBe(true)
    expect(drawsTiny(12 * 1.1 - 0.01, true, 12)).toBe(true)
    expect(drawsTiny(12 * 1.1, true, 12)).toBe(false)
  })
  it('switches once each way on a zoom in and back out across both switches', () => {
    let near = false
    let tiny = false
    const changes: string[] = []
    const zoomIn = [...Array(80).keys()].map(i => 4 + i).flatMap(px => [px, px + 0.5])
    const zoomOut = [...zoomIn].reverse()
    for (const px of [...zoomIn, ...zoomOut]) {
      const n = drawsNear(px, near, lodPx)
      const t: boolean = !n && drawsTiny(px, tiny, 12)
      if (n !== near || t !== tiny) changes.push(`${px}:${n ? 'near' : t ? 'tiny' : 'far'}`)
      near = n
      tiny = t
    }
    expect(changes).toEqual(['4:tiny', '13.5:far', '53:near', '43:far', '10.5:tiny'])
  })
})

/** A made-up figure for boneParts: one LOD, 'body', each vertex wholly on a bone unless weights are given */
function figure(bones: string[], parents: number[], verts: { b: number; p: number[]; w?: [number, number][] }[]) {
  const n = verts.length
  const bi = new Uint8Array(n * 4)
  const bw = new Float32Array(n * 4)
  verts.forEach((v, i) => {
    for (const [k, [b, w]] of (v.w ?? [[v.b, 1]]).entries()) {
      bi[i * 4 + k] = b
      bw[i * 4 + k] = w
    }
  })
  const positions = Float32Array.from(verts.flatMap(v => v.p))
  return { bones, parents, mesh: { body: { positions, boneIndices: bi, boneWeights: bw } } } as unknown as UnitData
}
// n vertices of a bone along y from y0 to y1, spread a little across
const column = (b: number, n: number, y0: number, y1: number, x = 0) =>
  [...Array(n).keys()].map(i => ({ b, p: [x + (i % 2) * 0.06, y0 + ((y1 - y0) * i) / (n - 1), (i % 3) * 0.03] }))

describe("a figure's parts (boneParts)", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })
  it('makes a part of each bone with enough vertices and length, along its long axis', () => {
    const fig = figure(
      ['Torso', 'Few', 'Short'],
      [-1, 0, 0],
      [
        ...column(0, 12, 0.6, 1.4),
        ...column(1, 7, 0.2, 0.6, 0.3), // (under minVerts, 8)
        ...column(2, 10, 0.3, 0.4, -0.3), // (under minLen, 0.14 m)
      ],
    )
    const parts = boneParts(fig, 'body', 8, 0.14, 0)
    expect(parts.map(p => p.bone)).toEqual([0])
    const [torso] = parts
    expect(Math.abs(torso.ax[1])).toBeGreaterThan(0.99)
    expect(torso.t1 - torso.t0).toBeGreaterThan(0.79)
    expect(torso.c[1]).toBeCloseTo(1, 6)
  })
  it("puts a vertex on its heaviest bone, whatever its slot's order", () => {
    const verts = column(0, 12, 0.6, 1.4).map(v => ({
      ...v,
      w: [
        [1, 0.3],
        [0, 0.7],
      ] as [number, number][],
    }))
    const parts = boneParts(figure(['Torso', 'Arm'], [-1, 0], verts), 'body')
    expect(parts.map(p => p.bone)).toEqual([0])
    expect(parts[0].vs.length).toBe(12)
  })
  it('leaves out a small bone at the ground with no part up its chain, and says so', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fig = figure(['Torso', 'Stone'], [-1, -1], [...column(0, 12, 0.6, 1.4), ...column(1, 4, 0, 0.02, 0.4)])
    const parts = boneParts(fig, 'body')
    expect(parts.map(p => [p.bone, p.lent.length])).toEqual([[0, 0]])
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/Stone touches the ground but no part is up its chain/))
  })
})

describe('what of a mesh is seen from round the figure (seenArea)', () => {
  // a closed box (0.6 m across, 0.2 to 1.2 m up), a triangle shut inside it, then one the box does not hide
  const box = [
    [-0.3, 0.2, -0.3],
    [0.3, 0.2, -0.3],
    [0.3, 0.2, 0.3],
    [-0.3, 0.2, 0.3],
    [-0.3, 1.2, -0.3],
    [0.3, 1.2, -0.3],
    [0.3, 1.2, 0.3],
    [-0.3, 1.2, 0.3],
  ]
  const faces = [
    [0, 2, 1, 0, 3, 2], // bottom
    [4, 5, 6, 4, 6, 7], // top
    [0, 1, 5, 0, 5, 4],
    [1, 2, 6, 1, 6, 5],
    [2, 3, 7, 2, 7, 6],
    [3, 0, 4, 3, 4, 7],
  ].flat()
  const inside = [
    [-0.1, 0.6, 0],
    [0.1, 0.6, 0],
    [0, 0.8, 0],
  ]
  const apart = [
    [0.8, 0.3, 0],
    [1.1, 0.3, 0],
    [0.95, 0.9, 0],
  ]
  const fig = {
    mesh: {
      body: {
        positions: Float32Array.from([...box, ...inside, ...apart].flat()),
        indices: Uint16Array.from([...faces, 8, 9, 10, 11, 12, 13]),
      },
    },
  } as unknown as UnitData
  const seen = seenArea(fig, 'body')
  it('counts nothing for what the figure hides: a part shut inside it, its underside', () => {
    expect(seen.length).toBe(14)
    expect(seen[12]).toBe(0)
    expect([seen[0], seen[1]]).toEqual([0, 0])
  })
  it('counts what the views see: the top, the sides, a part beside the figure', () => {
    for (const t of [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) expect(seen[t], `${t}`).toBeGreaterThan(0)
    expect(seen[13]).toBeGreaterThan(0)
  })
})
