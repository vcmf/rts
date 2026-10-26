// The map editor's save on the dev server (docs/plans/active/m7-editor.md M7a, decision 0066): it writes only a
// map file that still holds the text the page read.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { mayWrite, saveMapFile } from '../tools/map-save.ts'

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

describe('M7a: only the map page may save', () => {
  it("takes JSON from the server's own origin, or with no origin; refuses other sites and other types", () => {
    const host = 'localhost:5173'
    expect(mayWrite({ 'content-type': 'application/json', origin: 'http://localhost:5173', host })).toBe(true)
    expect(mayWrite({ 'content-type': 'application/json; charset=utf-8', host })).toBe(true)
    expect(mayWrite({ 'content-type': 'application/json', origin: 'https://evil.example', host })).toBe(false)
    expect(mayWrite({ 'content-type': 'text/plain', origin: 'http://localhost:5173', host })).toBe(false)
    expect(mayWrite({ origin: 'http://localhost:5173', host })).toBe(false)
    expect(mayWrite({ 'content-type': 'application/json', origin: 'null', host })).toBe(false)
  })
})

describe('M7a: a file with a byte order mark', () => {
  it('compares without it (the page reads none) and writes none', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'map-save-'))
    fs.mkdirSync(path.join(root, 'maps'))
    const file = path.join(root, 'maps', 'm.map.json')
    fs.writeFileSync(file, '﻿old')
    expect(saveMapFile(root, { file: '/maps/m.map.json', base: 'old', text: 'new' })).toEqual({ ok: true })
    expect(fs.readFileSync(file, 'utf8')).toBe('new')
  })
})

describe('M7a: a save through a link, keeping the mode', () => {
  it('writes the file a symbolic link names, and the hard-linked file in place, with its permissions', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'map-save-'))
    fs.mkdirSync(path.join(root, 'maps'))
    const real = path.join(root, 'real.map.json')
    fs.writeFileSync(real, 'old')
    fs.chmodSync(real, 0o640)
    fs.symlinkSync(real, path.join(root, 'maps', 's.map.json'))
    expect(saveMapFile(root, { file: '/maps/s.map.json', base: 'old', text: 'new' })).toEqual({ ok: true })
    expect(fs.lstatSync(path.join(root, 'maps', 's.map.json')).isSymbolicLink()).toBe(true)
    expect(fs.readFileSync(real, 'utf8')).toBe('new')
    expect(fs.statSync(real).mode & 0o777).toBe(0o640)
    const other = path.join(root, 'other.map.json')
    fs.linkSync(real, path.join(root, 'maps', 'h.map.json'))
    fs.linkSync(real, other)
    expect(saveMapFile(root, { file: '/maps/h.map.json', base: 'new', text: 'newer' })).toEqual({ ok: true })
    expect(fs.readFileSync(other, 'utf8')).toBe('newer')
  })
})
