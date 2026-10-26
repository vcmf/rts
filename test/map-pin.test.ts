// Pinning (docs/plans/active/m7-editor.md M7d): every generated feature of the maps pinned, alone and all together,
// expands to the same map as the original (a pinned child equals its expansion), and the stable save rewrites the
// pinned feature's line and appends its children.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import type { Catalogue, MapFile } from '../src/map/schema.ts'
import { validate } from '../src/map/validate.ts'
import { expand } from '../src/map/expand.ts'
import { writeMap } from '../src/map/write.ts'
import { pinned } from '../src/app/map/pin.ts'
import { root } from './fx.ts'

const cat = JSON.parse(fs.readFileSync(path.join(root, 'maps', 'kinds.json'), 'utf8')) as Catalogue
const files = fs.readdirSync(path.join(root, 'maps')).filter(n => n.endsWith('.map.json'))
const read = (n: string) => fs.readFileSync(path.join(root, 'maps', n), 'utf8')
const generated = files.filter(n => (JSON.parse(read(n)) as MapFile).features.some(f => f.gen))

/** The map pinned at `id`, which must succeed. */
function pin(map: MapFile, id: string): MapFile {
  const out = pinned(map, cat, id)
  if (typeof out === 'string') throw new Error(out)
  return out
}

describe('pinning', () => {
  it('covers every generator', () => {
    const names = new Set(
      generated.flatMap(n => (JSON.parse(read(n)) as MapFile).features.flatMap(f => Object.keys(f.gen ?? {}))),
    )
    expect([...names].sort()).toEqual(['clump', 'group', 'meander', 'scatter', 'street-village'])
  })

  for (const name of generated) {
    describe(name, () => {
      const text = read(name)
      const map = JSON.parse(text) as MapFile
      const expanded = expand(map, cat)
      it('expands', () => expect(expanded.issues).toEqual([]))

      for (const f of map.features.filter(g => g.gen)) {
        it(`${f.id}: pinned, it expands to the same map, and the save changes its line and appends its children`, () => {
          const out = pin(map, f.id)
          expect(validate(out, cat)).toEqual([])
          const again = expand(out, cat)
          expect(again.issues).toEqual([])
          expect(again.map).toEqual(expanded.map)
          // the feature without its generator, at its place or gone; its children last; the rest as they were
          const self = out.features.find(g => g.id === f.id)
          expect(self?.gen).toBeUndefined()
          const kids = out.features.filter(g => g.origin?.parent === f.id)
          expect(out.features.slice(out.features.length - kids.length)).toEqual(kids)
          expect(kids.map(k => k.id)).toEqual(kids.map((_, k) => `${f.id}-${k + 1}`))
          const rest = out.features.filter(g => g.id !== f.id && g.origin?.parent !== f.id)
          expect(rest).toEqual(map.features.filter(g => g.id !== f.id))
          // the file: the feature's line (rewritten, or cut) and the children's lines appended, nothing else
          // a feature's line (the maps write one feature a line)
          const isOf = (l: string, id: string) => {
            try {
              return (JSON.parse(l.trim().replace(/,$/, '')) as { id?: unknown }).id === id
            } catch {
              return false
            }
          }
          const lines = text.split('\n')
          const saved = writeMap(text, out).split('\n')
          const before = lines.filter(l => !isOf(l, f.id))
          const after = saved.filter(l => !isOf(l, f.id) && !kids.some(c => isOf(l, c.id)))
          expect(lines.filter(l => isOf(l, f.id))).toHaveLength(1)
          expect(after.map(l => l.replace(/,$/, ''))).toEqual(before.map(l => l.replace(/,$/, '')))
          expect(saved.filter(l => kids.some(c => isOf(l, c.id)))).toHaveLength(kids.length)
          expect(JSON.parse(writeMap(text, out))).toEqual(out)
        })
      }

      it('every generated feature pinned, one after another: the same map, with no generator left', () => {
        let out = map
        for (const f of map.features.filter(g => g.gen)) out = pin(out, f.id)
        expect(out.features.some(g => g.gen)).toBe(false)
        expect(validate(out, cat)).toEqual([])
        const again = expand(out, cat)
        expect(again.issues).toEqual([])
        expect(again.map).toEqual(expanded.map)
      })
    })
  }

  it('refuses a feature with no generator, and a map that does not validate or expand', () => {
    const map = JSON.parse(read('generated.map.json')) as MapFile
    const plain = map.features.find(f => !f.gen)!
    expect(pinned(map, cat, plain.id)).toMatch(/has no generator/)
    expect(pinned(map, cat, 'nothing')).toMatch(/no feature nothing/)
    const brook = map.features.find(f => f.id === 'brook')!
    const bad = { ...map, features: map.features.map(f => (f === brook ? { ...f, width: -1 } : f)) }
    expect(pinned(bad, cat, 'brook')).toMatch(/^the map has a problem to fix first: \[brook\]/)
    // a group asked for more trees than fit: it validates, and fails at expansion
    const poplars = map.features.find(f => f.id === 'poplars-west')!
    const cramped = {
      ...map,
      features: map.features.map(f => (f === poplars ? { ...f, gen: { group: { count: 5, spread: 1 } } } : f)),
    }
    expect(validate(cramped, cat)).toEqual([])
    expect(pinned(cramped, cat, 'brook')).toMatch(/^the map does not expand: \[poplars-west\]/)
  })
})
