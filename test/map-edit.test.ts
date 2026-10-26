// The map editor's edits (docs/plans/active/m7-editor.md M7a): picking, handles, moves, the barrier snap, undo.
import { describe, it, expect } from 'vitest'
import type { Feature, Pt } from '../src/map/schema.ts'
import { barrierProblem } from '../src/map/geometry.ts'
import {
  handleAt,
  handles,
  History,
  insertPoint,
  moveHandle,
  moveShape,
  pick,
  removePoint,
  roundStep,
  roundTo,
  snapBarrier,
  isBarrier,
} from '../src/app/map/edit.ts'

// a view straight down at 1 px a metre, y down the screen
const project = (x: number, z: number): [number, number] => [x, -z]
const place = { step: 0.1, reach: 6, barrier: false }
const lattice = { ...place, barrier: true } // a barrier's
const wood: Feature = {
  id: 'wood',
  kind: 'veg.wood.broad',
  area: [
    [
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 100],
    ],
  ],
}
const copse: Feature = { id: 'copse', kind: 'veg.wood.broad', circle: [[50, 50], 10] }
const road: Feature = {
  id: 'road',
  kind: 'way.road.lane',
  line: [
    [-50, 50],
    [150, 50],
  ],
}
const ford: Feature = { id: 'ford', kind: 'water.ford', on: 'brook', near: [20, 50] }
const hedge: Feature = {
  id: 'hedge',
  kind: 'barrier.hedge',
  line: [
    [0, 0],
    [20, 0],
    [40, 20],
  ],
}

describe('M7a: picking', () => {
  const shown = [wood, copse, road, ford]
  const ids = new Set(shown.map(f => f.id))
  const at = (x: number, z: number) => pick(shown, ids, x, -z, [x, z], project)
  it('takes a point first, then a line, then the smallest area under the click', () => {
    expect(at(21, 50)).toBe('ford')
    expect(at(80, 53)).toBe('road')
    expect(at(52, 42)).toBe('copse')
    expect(at(10, 10)).toBe('wood')
    expect(at(500, 500)).toBe(null)
  })
  it('picks the feature a generated child came from', () => {
    const house: Feature = {
      id: 'hamlet/3',
      kind: 'built.house',
      area: [
        [
          [200, 0],
          [210, 0],
          [210, 10],
        ],
      ],
    }
    expect(pick([house], new Set(['hamlet']), 208, -2, [208, 2], project)).toBe('hamlet')
    const meander: Feature = { ...road, origin: { generator: 'meander', params: {}, version: 1 } }
    expect(pick([meander], new Set(['road']), 0, -50, [0, 50], project)).toBe('road')
  })
})

describe('M7a: handles and moves', () => {
  it("lists a shape's handles; a closed line's last point is not one", () => {
    expect(handles(wood).length).toBe(4)
    expect(handles(copse).map(h => h.at)).toEqual([
      [50, 50],
      [60, 50],
    ])
    const yard: Feature = { ...hedge, line: [...hedge.line!, [0, 0]] }
    expect(handles(yard).length).toBe(3)
    expect(handleAt(wood, 99, -1, project)).toEqual({ kind: 'ring', ring: 0, index: 1 })
    expect(handleAt(wood, 50, -50, project)).toBe(null)
  })
  it('moves a point, rounded to the step, and leaves the old feature as it was', () => {
    const moved = moveHandle(wood, { kind: 'ring', ring: 0, index: 2 }, [120.04, 130.06], place)
    expect(moved.area![0][2]).toEqual([120, 130.1])
    expect(wood.area![0][2]).toEqual([100, 100])
  })
  it('resizes a circle, turns an ellipse by its first radius', () => {
    expect(moveHandle(copse, { kind: 'radius' }, [50, 75], place).circle).toEqual([[50, 50], 25])
    const e: Feature = { id: 'e', kind: 'veg.wood.broad', ellipse: [[0, 0], 30, 10, 0] }
    const turned = moveHandle(e, { kind: 'rx' }, [0, 40], place).ellipse!
    expect(turned[1]).toBe(40)
    expect(turned[3]).toBeCloseTo(Math.PI / 2, 2)
    expect(moveHandle(e, { kind: 'rz' }, [0, 20], place).ellipse).toEqual([[0, 0], 30, 20, 0])
  })
  it('moves a whole shape; a barrier by whole lattice steps', () => {
    expect(moveShape(copse, 3.04, -1, place).circle).toEqual([[53, 49], 10])
    const h = moveShape(hedge, 3.1, 0.9, lattice)
    expect(h.line![0]).toEqual([4, 0])
    expect(barrierProblem(h.line!)).toBe(null)
  })
  it('adds a point on the nearest segment, removes one down to the minimum', () => {
    const more = insertPoint(road, 50, -51, [50, 51], project, place)!
    expect(more.line).toEqual([
      [-50, 50],
      [50, 51],
      [150, 50],
    ])
    expect(insertPoint(road, 50, -80, [50, 80], project, place)).toBe(null)
    expect(removePoint(more, { kind: 'line', index: 1 })!.line).toEqual(road.line)
    expect(removePoint(road, { kind: 'line', index: 0 })).toBe(null)
    const tri: Feature = { ...wood, area: [wood.area![0].slice(0, 3)] }
    expect(removePoint(tri, { kind: 'ring', ring: 0, index: 0 })).toBe(null)
    expect(removePoint(wood, { kind: 'ring', ring: 0, index: 0 })!.area![0].length).toBe(3)
  })
})

describe('M7a: barriers snap to the lattice in 8 directions', () => {
  it("keeps a barrier whole wherever its point is dragged: snapped by the engine's rule, or left where it was", () => {
    let snapped = 0
    for (let x = -10; x <= 50; x += 0.7) {
      for (let z = -10; z <= 40; z += 0.9) {
        const moved = moveHandle(hedge, { kind: 'line', index: 1 }, [x, z], lattice)
        expect(barrierProblem(moved.line!)).toBe(null)
        if (moved.line![1][0] !== 20 || moved.line![1][1] !== 0) snapped++
      }
    }
    expect(snapped).toBeGreaterThan(100) // it does move, where it can
  })
  it('snaps to the corner both segments allow, when near; to nothing when nothing near fits', () => {
    const fits = (c: Pt) => barrierProblem([[0, 0], c, [40, 20]]) === null
    expect(snapBarrier([19, 1], [[0, 0] as Pt, [40, 20] as Pt], 6, fits)).toEqual([20, 0])
    expect(snapBarrier([1, 19], [[0, 0] as Pt, [40, 20] as Pt], 6, fits)).toEqual([0, 20])
    expect(snapBarrier([9, 25], [[0, 0] as Pt, [40, 20] as Pt], 1, fits)).toBe(null)
  })
  it("knows a barrier by its preset's kind too", () => {
    const presets = { wall: { kind: 'barrier.wall' } }
    expect(isBarrier({ id: 'w', preset: 'wall', line: [] }, presets)).toBe(true)
    expect(isBarrier({ id: 'w', preset: 'wall', line: [] })).toBe(false)
    expect(isBarrier(hedge)).toBe(true)
    expect(isBarrier({ id: 'b', kind: 'barrier', line: [] })).toBe(true) // a bare category, as the validator reads it
  })
  it("moves a closed barrier's first point with its last", () => {
    const yard: Feature = {
      ...hedge,
      line: [
        [0, 0],
        [20, 0],
        [20, 20],
        [0, 0],
      ],
    }
    const moved = moveHandle(yard, { kind: 'line', index: 0 }, [0.4, 4.2], lattice)
    expect(moved.line![0]).toEqual(moved.line![3])
  })
})

describe('M7a: rounding and history', () => {
  it('rounds to the coarsest step under a pixel, with no binary fraction', () => {
    expect(roundStep(0.3)).toBe(1)
    expect(roundStep(5)).toBe(0.1)
    expect(roundStep(30)).toBe(0.01)
    expect(roundTo(0.1 * 3, 0.1)).toBe(0.3)
    expect(Object.is(roundTo(-0.001, 0.01), 0)).toBe(true)
  })
  it('undoes and redoes, and a new edit drops the redo', () => {
    const h = new History<number>(2)
    h.push(1)
    h.push(2)
    h.push(3) // 1 falls off
    expect(h.undo(4)).toBe(3)
    expect(h.undo(3)).toBe(2)
    expect(h.undo(2)).toBe(null)
    expect(h.redo(2)).toBe(3)
    h.push(3)
    expect(h.redo(5)).toBe(null)
  })
})

describe('M7a: points added to and removed from a barrier keep it valid', () => {
  const wall: Feature = {
    id: 'wall',
    kind: 'barrier.wall',
    line: [
      [0, 0],
      [10, 0],
    ],
  }
  it('adds a point only where both new segments run in the 8 directions', () => {
    for (let x = 0.5; x < 10; x += 0.5) {
      for (const z of [0.4, 1.2, 2.5, 4]) {
        const g = insertPoint(wall, x, -z, [x, z], project, lattice)
        if (g) expect(barrierProblem(g.line!)).toBe(null)
      }
    }
    // on a longer wall, away from its ends (a click within PICK.handle of a point adds nothing)
    const long: Feature = {
      ...wall,
      line: [
        [0, 0],
        [40, 0],
      ],
    }
    expect(insertPoint(long, 20.3, -0.2, [20.3, 0.2], project, lattice)!.line![1]).toEqual([20, 0])
  })
  it("removes a point either way: whether the barrier stays whole is the editor's gate (the validator)", () => {
    const step: Feature = {
      ...wall,
      line: [
        [0, 0],
        [4, 0],
        [4, 2],
      ],
    }
    expect(barrierProblem(removePoint(step, { kind: 'line', index: 1 })!.line!)).not.toBe(null)
    const straight: Feature = {
      ...wall,
      line: [
        [0, 0],
        [4, 0],
        [8, 0],
      ],
    }
    expect(removePoint(straight, { kind: 'line', index: 1 })!.line).toEqual([
      [0, 0],
      [8, 0],
    ])
  })
  it('reads a closed line as the compiler does: a 3-point line back to its start is open', () => {
    const back: Feature = {
      ...wall,
      line: [
        [0, 0],
        [10, 0],
        [0, 0],
      ],
    }
    expect(handles(back).length).toBe(3)
  })
})
