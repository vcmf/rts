// The buildings' placement (docs/plans/done/buildings.md): the gap between two paved yards (convex polygons) is 0
// where they overlap or cross and the edges' least distance otherwise, and the authored buildings' yards keep at least
// PAVE_GAP apart (the cover's authoring fails otherwise: src/look/world/cover.ts). The turn is Babylon's instance yaw:
// toWorld matches its Matrix, toLocal undoes it, and a house's yard lies before its door at every quarter turn
import { describe, expect, it } from 'vitest'
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js'
import fs from 'node:fs'
import { BUILDINGS, FOOT, PAVE, PAVE_EDGE, PAVE_GAP, PAVE_INNER, PAVE_REACH, PAVE_WOB, PAVE_WOBBLE, paveSdf, pavePoly, polyGap, toLocal, toWorld, type Building } from '../src/look/world/buildings.ts'

const box = (x: number, z: number, hx: number, hz: number): [number, number][] => [[x - hx, z - hz], [x + hx, z - hz], [x + hx, z + hz], [x - hx, z + hz]]

describe('the yards', () => {
  it('measures the gap between two yards', () => {
    expect(polyGap(box(0, 0, 2, 2), box(1, 1, 2, 2))).toBe(0)        // a corner of one in the other
    expect(polyGap(box(0, 0, 5, 1), box(0, 0, 1, 5))).toBe(0)        // crossing as a plus: no corner in the other
    expect(polyGap(box(0, 0, 2, 2), box(10, 0, 2, 2))).toBeCloseTo(6)
    expect(polyGap(box(0, 0, 2, 2), box(5, 5, 1, 1))).toBeCloseTo(Math.hypot(2, 2))
  })
  it('keeps the authored yards apart', () => {
    const p = BUILDINGS.map(pavePoly)
    for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) expect(polyGap(p[i], p[j])).toBeGreaterThanOrEqual(PAVE_GAP)
  })
})

// the paving's edge (shore.glsl, pavePaint): k = 1 − smoothstep(PAVE_EDGE, d + wobble), the wobble within ± half the
// sum of PAVE_WOB. Whole (k exactly 1, the noises skipped) inside PAVE_INNER; gone (k 0) past PAVE_WOBBLE; the cover's
// marker reaches PAVE_REACH (test/cover.test.ts). A retuned edge must keep these, or a seam opens
describe('the paving\'s edge', () => {
  const amp = (PAVE_WOB[0] + PAVE_WOB[1]) / 2
  it('is whole inside PAVE_INNER and gone past PAVE_WOBBLE, within PAVE_REACH', () => {
    expect(PAVE_INNER + amp).toBeLessThanOrEqual(PAVE_EDGE[0])
    expect(PAVE_EDGE[1] + amp).toBeLessThanOrEqual(PAVE_WOBBLE)
    expect(PAVE_WOBBLE).toBeLessThanOrEqual(PAVE_REACH)
  })
  it('is the shader\'s: its constants as defines, not numbers of its own', () => {
    const src = fs.readFileSync('src/look/shaders/shore.glsl', 'utf8'), fn = src.slice(src.indexOf('vec3 pavePaint('), src.indexOf('vec3 roadPaint('))
    expect(fn).toContain('if(d>PAVE_INNER)')
    expect(fn).toContain('*PAVE_WOB.x')
    expect(fn).toContain('*PAVE_WOB.y')
    expect(fn).toContain('smoothstep(PAVE_EDGE.x,PAVE_EDGE.y,')
    expect(fn).toContain('if(d>PAVE_REACH)return c;')
  })
})

describe('the turn', () => {
  it('is Babylon instance yaw', () => {
    for (const yaw of [-Math.PI / 2, -0.3, 0, 0.3, Math.PI / 2, 2.9]) {
      const q = new Quaternion(), m = new Matrix(); Quaternion.RotationYawPitchRollToRef(yaw, 0, 0, q); Matrix.ComposeToRef(new Vector3(1, 1, 1), q, Vector3.Zero(), m)
      for (const [x, z] of [[1, 0], [0, -1], [2.5, 3.5]]) {
        const v = Vector3.TransformCoordinates(new Vector3(x, 0, z), m), [wx, wz] = toWorld(yaw, x, z)
        expect(wx).toBeCloseTo(v.x, 6); expect(wz).toBeCloseTo(v.z, 6)   // (Babylon's matrices are float32)
        const [lx, lz] = toLocal(yaw, wx, wz); expect(lx).toBeCloseTo(x, 9); expect(lz).toBeCloseTo(z, 9)
      }
    }
  })
  it('puts a house\'s yard before its door at every quarter turn', () => {
    for (const k of [0, 1, 2, 3]) {
      const b: Building = { model: 'house', x: 0, z: 0, yaw: k * Math.PI / 2, scale: 1 }
      // (the door, local (0, −3.35): its yard reaches 10.4 m out, its back 6.9)
      const [fx, fz] = toWorld(b.yaw, 0, -9.5), [bx, bz] = toWorld(b.yaw, 0, 9.5)
      expect(onPavingOf(b, fx, fz)).toBe(true); expect(onPavingOf(b, bx, bz)).toBe(false)
    }
  })
})
// (onPaving asks of the authored buildings: one house alone, by its polygon)
const onPavingOf = (b: Building, x: number, z: number) => polyGap(pavePoly(b), [[x - 0.01, z - 0.01], [x + 0.01, z - 0.01], [x + 0.01, z + 0.01], [x - 0.01, z + 0.01]]) === 0

describe('the yard\'s distance', () => {
  it('reaches further before the door than behind it, the shader\'s rounded box', () => {
    const b: Building = { model: 'house', x: 10, z: -5, yaw: 0.7, scale: 1.0 }, f = FOOT.house, p = PAVE.house
    const at = (lx: number, lz: number) => { const [x, z] = toWorld(b.yaw, lx, lz); return paveSdf(b, b.x + x, b.z + z) }
    // the yard's edges: its door's (local −z) at hz + front, its back at hz + side, its sides at hx + side
    expect(at(0, -(f.hz! + p.front))).toBeCloseTo(0, 6); expect(at(0, f.hz! + p.side)).toBeCloseTo(0, 6); expect(at(f.hx! + p.side, 0)).toBeCloseTo(0, 6)
    expect(at(0, -(f.hz! + p.front) - 2)).toBeCloseTo(2, 6); expect(at(0, 0)).toBeLessThan(0)
    // a point 8 m before the door is on the yard, 8 m behind is not
    expect(at(0, -8)).toBeLessThan(0); expect(at(0, 8)).toBeGreaterThan(0)
    // its corners rounded (1.5 m): the corner point itself lies outside by (√2 − 1)·1.5
    expect(at(f.hx! + p.side, f.hz! + p.side)).toBeCloseTo((Math.SQRT2 - 1) * 1.5, 6)
    const w: Building = { model: 'windmill', x: 0, z: 0, yaw: 2, scale: 1 }
    expect(paveSdf(w, FOOT.windmill.r! + PAVE.windmill.side, 0)).toBeCloseTo(0, 6)
  })
})

