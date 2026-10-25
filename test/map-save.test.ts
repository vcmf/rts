// The map editor's save on the dev server (docs/plans/active/m7-editor.md M7a, decision 0066): it writes only a
// map file that still holds the text the page read.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { saveMapFile } from '../tools/map-save.ts'

describe('M7a: the save on the dev server', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'map-save-'))
  fs.mkdirSync(path.join(root, 'maps'))
  const file = path.join(root, 'maps', 'm.map.json')
  it('writes the new text over the base it was read from', () => {
    fs.writeFileSync(file, 'old')
    expect(saveMapFile(root, { file: '/maps/m.map.json', base: 'old', text: 'new' })).toEqual({ ok: true })
    expect(fs.readFileSync(file, 'utf8')).toBe('new')
    expect(fs.readdirSync(path.join(root, 'maps'))).toEqual(['m.map.json']) // no temporary file left
  })
  it('refuses when the file changed on disk since, and gives its text', () => {
    fs.writeFileSync(file, 'by hand')
    expect(saveMapFile(root, { file: '/maps/m.map.json', base: 'old', text: 'new' })).toEqual({
      ok: false,
      status: 409,
      current: 'by hand',
    })
    expect(fs.readFileSync(file, 'utf8')).toBe('by hand')
  })
  it('refuses any other path, and a file that does not exist', () => {
    for (const bad of [
      '/maps/../package.json',
      '/maps/kinds.json',
      '/src/x.map.json',
      '/maps/a/b.map.json',
      'maps/m.map.json',
    ]) {
      expect(saveMapFile(root, { file: bad, base: '', text: '' }).ok).toBe(false)
    }
    expect(saveMapFile(root, { file: '/maps/none.map.json', base: '', text: 'x' }).ok).toBe(false)
    expect(fs.existsSync(path.join(root, 'maps', 'none.map.json'))).toBe(false)
  })
})

describe('M7a: a save that cannot write', () => {
  it('reports the failure and leaves no temporary file', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'map-save-'))
    const dir = path.join(root, 'maps')
    fs.mkdirSync(dir)
    fs.writeFileSync(path.join(dir, 'm.map.json'), 'old')
    fs.chmodSync(dir, 0o555) // read-only: the temporary file cannot be made
    try {
      const r = saveMapFile(root, { file: '/maps/m.map.json', base: 'old', text: 'new' })
      expect(r.ok).toBe(false)
      expect(fs.readFileSync(path.join(dir, 'm.map.json'), 'utf8')).toBe('old')
      expect(fs.readdirSync(dir)).toEqual(['m.map.json'])
    } finally {
      fs.chmodSync(dir, 0o755)
    }
  })
})
