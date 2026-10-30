// The bench's geometry (docs/plans/active/c0-bench.md, src/sim/geometry.ts): every filled slot placed, the pairs of
// companies that touch found as a scan of every pair finds them, and overlaps only between formations in the fight.
import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { root } from './fx.ts'
import { napoleonic } from '../src/rulesets/napoleonic.ts'
import { MAP_VERSIONS } from '../src/scenarios/maps.ts'
import {
  loadSimData,
  compileRuleset,
  makeWorld,
  issue,
  advanceTick,
  menOf,
  mkPlaced,
  placeAll,
  contacts,
  formedOverlaps,
  unitHandle,
  PI,
  type World,
} from '../src/sim/index.ts'
import { FULL } from '../src/scenarios/sizes.ts'

const data = loadSimData(new Uint8Array(fs.readFileSync(path.join(root, 'data/bench.simdata'))), MAP_VERSIONS.bench)
const cr = compileRuleset(napoleonic)

// a world with the given formations spawned (and applied)
function world(spawns: { side: number; x: number; z: number; heading: number; shape: string; unit?: string }[]): World {
  const w = makeWorld(data, cr, 1)
  for (const s of spawns) {
    const men = FULL[(s.unit ?? 'infantry') as keyof typeof FULL]
    issue(w, { type: 'debug-spawn', ...s, men, fire: 'hold' })
  }
  advanceTick(w)
  return w
}

describe('placeAll', () => {
  it('places every filled slot of every shape and type once', () => {
    const shapes: [string, string?][] = [
      ['line'],
      ['column'],
      ['square'],
      ['march'],
      ['line', 'cavalry'],
      ['march', 'cavalry'],
      ['unlimbered', 'battery'],
    ]
    const w = world(shapes.map(([shape, unit], k) => ({ side: 0, x: -250 + k * 80, z: 0, heading: 0, shape, unit })))
    const P = placeAll(w, mkPlaced(w))
    let men = 0
    for (let i = 0; i < shapes.length; i++) men += menOf(w, i)
    expect(P.n).toBe(men)
    // each formation's places stand around its anchor, within its type's reach
    for (let p = 0; p < P.n; p++) expect(Math.abs(P.x[p] - w.f.x[P.f[p]])).toBeLessThan(200)
  })
})

describe('contacts', () => {
  it('finds the nearest places of each pair of companies, as a scan of every pair does', () => {
    const w = world([
      { side: 0, x: 0, z: 0, heading: 0, shape: 'line' },
      { side: 1, x: 20, z: 4, heading: PI / 2, shape: 'column' },
    ])
    const P = placeAll(w, mkPlaced(w))
    const got = contacts(w, P, 5)
    const want = new Map<string, number>()
    for (let p = 0; p < P.n; p++) {
      for (let q = 0; q < P.n; q++) {
        if (P.f[q] <= P.f[p]) continue
        const d = Math.hypot(P.x[q] - P.x[p], P.z[q] - P.z[p])
        if (d > 5) continue
        const k = `${P.c[p]}-${P.c[q]}`
        want.set(k, Math.min(want.get(k) ?? Infinity, d))
      }
    }
    expect(want.size).toBeGreaterThan(0)
    expect(got.length).toBe(want.size)
    for (const c of got) expect(c.d).toBeCloseTo(want.get(`${c.ci}-${c.cj}`)!, 12)
  })
})

describe('formedOverlaps', () => {
  const two = (dz: number) =>
    world([
      { side: 0, x: 0, z: 0, heading: 0, shape: 'line' },
      { side: 1, x: 0, z: dz, heading: PI, shape: 'line' },
    ])
  it('is empty for lines apart and for lines that only touch', () => {
    for (const dz of [20, 4.5]) {
      const w = two(dz)
      expect(formedOverlaps(w, placeAll(w, mkPlaced(w)))).toEqual([])
    }
  })
  it('names the companies of a line that stands through another', () => {
    const w = two(0.4)
    const o = formedOverlaps(w, placeAll(w, mkPlaced(w)))
    expect(o.length).toBeGreaterThan(0)
    expect(new Set(o.map(c => `${c.i}-${c.j}`))).toEqual(new Set(['0-1']))
  })
  it('leaves out a formation out of the fight', () => {
    const w = two(0.4)
    issue(w, { type: 'debug-morale', id: unitHandle(1), bar: -100 })
    for (let t = 0; t < 400 && w.f.mstate[1] < 3; t++) advanceTick(w)
    expect(w.f.mstate[1]).toBeGreaterThanOrEqual(3)
    const o = formedOverlaps(w, placeAll(w, mkPlaced(w)))
    expect(o.filter(c => c.j === 1 || c.i === 1)).toEqual([])
  })
})
