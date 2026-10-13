// M3c (docs/plans/active/m3c-trees.md): free-standing trees (points, rows, groups) and paved and brick roads
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Catalogue, MapFile, Pt } from '../src/map/schema.ts'
import { expand } from '../src/map/expand.ts'
import { validate } from '../src/map/validate.ts'
import { apply } from '../src/map/apply.ts'
import { draft } from '../src/map/draft.ts'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const cat = JSON.parse(fs.readFileSync(path.join(root, 'maps/kinds.json'), 'utf8')) as Catalogue
const mini = (features: MapFile['features'], seed = 7): MapFile => ({ format: 1, id: 'mini', name: 'Mini', seed, season: 'summer', extent: { w: 400, h: 400 }, play: { w: 300, h: 300 }, features })
const FIELD = { id: 'field', kind: 'ground.field.wheat', area: [[[-100, -100], [100, -100], [100, 100], [-100, 100]]] as Pt[][] }
const msgs = (m: MapFile) => validate(m, cat).map(i => `${i.path}: ${i.message}`)

describe('M3c: free-standing trees', () => {
  it('a tree takes a point or a line, never an area; its attributes are checked', () => {
    expect(msgs(mini([{ id: 't', kind: 'veg.tree.poplar', point: [0, 0] }, { id: 'row', kind: 'veg.tree', line: [[-50, 0], [50, 0]] as Pt[] }]))).toEqual([])
    expect(msgs(mini([{ id: 't', kind: 'veg.tree', area: FIELD.area }]))).toContainEqual(expect.stringMatching(/veg\.tree/))
    expect(msgs(mini([{ id: 't', kind: 'veg.tree', point: [0, 0], form: 'weeping' }]))).toContainEqual(expect.stringMatching(/form/))
    expect(msgs(mini([{ id: 't', kind: 'veg.tree', line: [[-50, 0], [50, 0]] as Pt[], spacing: 1 }]))).toContainEqual(expect.stringMatching(/spacing/))
    // no feature turns into a tree or out of one; the trees' attributes belong to trees
    expect(msgs(mini([{ ...FIELD, growth: 'tree' }]))).toContainEqual(expect.stringMatching(/growth: a free-standing tree is a kind of its own/))
    expect(msgs(mini([{ id: 'w', kind: 'veg.wood.broad', area: FIELD.area, growth: 'tree' }]))).toContainEqual(expect.stringMatching(/growth/))
    expect(msgs(mini([{ id: 't', kind: 'veg.tree', point: [0, 0], growth: 'stand' }]))).toContainEqual(expect.stringMatching(/growth: veg\.tree is a free-standing tree/))
    expect(msgs(mini([{ ...FIELD, crown: 3 }]))).toContainEqual(expect.stringMatching(/crown: is for free-standing trees/))
    expect(msgs(mini([{ id: 't', kind: 'veg.tree', point: [0, 0], growth: 'tree' }]))).toEqual([])
  })
  it('group places count trees around its point, a crown apart, within spread; seeded; the point leaves the map', () => {
    const group = (seed: number, p: Record<string, unknown> = {}) => expand(mini([{ id: 'by-farm', kind: 'veg.tree.poplar', point: [20, 30], gen: { group: p } }], seed), cat)
    const outs = [1, 2, 3, 4, 5].map(s => group(s))
    for (const { map, issues } of outs) {
      expect(issues).toEqual([])
      const trees = map.features.filter(f => f.origin?.parent === 'by-farm')
      expect(map.features.some(f => f.id === 'by-farm')).toBe(false)
      expect(trees).toHaveLength(3)
      for (const t of trees) {
        expect(t.kind).toBe('veg.tree.poplar')
        expect(Math.hypot(t.point![0] - 20, t.point![1] - 30)).toBeLessThanOrEqual(3 * 1.5 + 0.01)
        for (const u of trees) if (u !== t) expect(Math.hypot(t.point![0] - u.point![0], t.point![1] - u.point![1])).toBeGreaterThanOrEqual(2 * 1.5 - 0.02)   // crowns apart
      }
    }
    expect(group(1).map).toEqual(outs[0].map)
    expect(new Set(outs.map(o => JSON.stringify(o.map.features.map(f => f.point)))).size).toBe(5)
    expect(group(1, { count: 2 }).map.features.filter(f => f.origin?.parent === 'by-farm')).toHaveLength(2)
    expect(msgs(mini([{ id: 'g', kind: 'veg.tree', point: [0, 0], gen: { group: { count: 6 } } }]))).toContainEqual(expect.stringMatching(/count/))
    expect(msgs(mini([{ id: 'g', kind: 'built.house', point: [0, 0], gen: { group: {} } }]))).toContainEqual(expect.stringMatching(/gen/))
    expect(group(1, { count: 5, spread: 1 }).issues[0]?.message).toMatch(/placed \d of 5 trees/)
    expect(group(1, { count: 5 }).issues).toEqual([])   // five fit the default spread
  })
  it("a group's crowns keep clear of water, ways, buildings and barriers", () => {
    const brook = { id: 'brook', kind: 'water.stream', line: [[-150, 0], [150, 0]] as Pt[], width: 6 }, house = { id: 'house', kind: 'built.house', area: [[[4, 2], [14, 2], [14, 10], [4, 10]]] as Pt[][] }
    for (let seed = 1; seed <= 10; seed++) {
      const { map, issues } = expand(mini([brook, house, { id: 'oaks', kind: 'veg.tree', point: [0, 8], gen: { group: { count: 3, spread: 14 } } }], seed), cat)
      expect(issues).toEqual([])
      for (const t of map.features.filter(f => f.origin?.parent === 'oaks')) {
        const [x, z] = t.point!
        expect(Math.abs(z)).toBeGreaterThan(3 + 4)                                                    // the stream's edge, plus a crown
        expect(x < 4 - 4 || x > 14 + 4 || z < 2 - 4 || z > 10 + 4 || Math.hypot(Math.max(4 - x, 0, x - 14), Math.max(2 - z, 0, z - 10)) > 4).toBe(true)
      }
    }
  })
  it('apply lists the trees (a row every spacing m) and changes no cell', () => {
    const row = { id: 'row', kind: 'veg.tree.poplar', line: [[-60, 10], [60, 10]] as Pt[] }, lone = { id: 'oak', kind: 'veg.tree', point: [30, -40] as Pt }
    const bare = apply(mini([FIELD]), cat), withTrees = apply(mini([FIELD, row, lone]), cat)
    expect(withTrees.trees).toHaveLength(15 + 1)   // 120 m holds 15 spacings of 8 m: a tree in the middle of each
    expect(withTrees.trees.filter(t => withTrees.table[t.k - 1].kind === 'veg.tree.poplar').map(t => t.x)).toEqual(Array.from({ length: 15 }, (_, n) => -56 + 8 * n))
    // a row shorter than its spacing still has its tree, in its middle; a long one is even from end to end
    expect(apply(mini([{ id: 'r', kind: 'veg.tree', line: [[0, 0], [4, 0]] as Pt[] }]), cat).trees.map(t => t.x)).toEqual([2])
    expect(apply(mini([{ id: 'r', kind: 'veg.tree', line: [[0, 0], [25, 0]] as Pt[] }]), cat).trees.map(t => t.x)).toEqual([6.25, 18.75])
    expect(withTrees.trees.find(t => withTrees.table[t.k - 1].kind === 'veg.tree')).toMatchObject({ x: 30, z: -40 })
    const kinds = (L: ReturnType<typeof apply>, layer: Uint16Array) => Array.from(layer, k => (k ? L.table[k - 1].kind : ''))
    for (const layer of ['ground', 'veg', 'water', 'way', 'barrier', 'built', 'zone'] as const) expect(kinds(withTrees, withTrees[layer])).toEqual(kinds(bare, bare[layer]))
    expect(withTrees.density).toEqual(bare.density)
    // the draft draws the oak's crown over the wheat
    const d = draft(withTrees), px = (x: number, z: number) => { const i = Math.floor((x + 200) / 2), j = Math.floor((z + 200) / 2), o = ((d.h - 1 - j) * d.w + i) * 4; return [d.data[o], d.data[o + 1], d.data[o + 2]] }
    expect(px(30, -40)[1]).toBeLessThan(px(30, -60)[1])   // darker green than the wheat 20 m away
  })
})

describe('M3c: paved and brick roads', () => {
  it('the kinds validate and the draft tells their surfaces apart', () => {
    const road = (id: string, kind: string, z: number) => ({ id, kind, line: [[-150, z], [150, z]] as Pt[] })
    const m = mini([road('dirt', 'way.road', -60), road('setts', 'way.road.paved', 0), road('bricks', 'way.road.brick', 60)])
    expect(msgs(m)).toEqual([])
    const L = apply(m, cat), d = draft(L), px = (z: number) => { const j = Math.floor((z + 200) / 2), o = ((d.h - 1 - j) * d.w + 100) * 4; return `${d.data[o]},${d.data[o + 1]},${d.data[o + 2]}` }
    expect(new Set([px(-60), px(0), px(60)]).size).toBe(3)
    expect(L.table.find(r => r.kind === 'way.road.brick')!.attrs.surface).toBe('brick')
  })
})
