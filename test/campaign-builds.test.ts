// How the campaign map's tool replaces its last output (tools/campaign-builds.ts): a build in a directory of its own,
// made live by its manifest, the others removed only after.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, it, expect } from 'vitest'
import { commitBuild, liveBuild, pruneBuilds, startBuild, writeWhole } from '../tools/campaign-builds.ts'

let out: string

beforeEach(() => {
  out = fs.mkdtempSync(path.join(os.tmpdir(), 'campaign-builds-'))
})

afterEach(() => {
  fs.rmSync(out, { recursive: true, force: true })
})

/** A build with one tile, its manifest committed if `commit`. */
function build(now: number, commit: boolean): string {
  const name = startBuild(out, now, 7)
  fs.writeFileSync(path.join(out, name, 't.bin'), name)
  if (commit) commitBuild(out, name, { build: name })
  return name
}

describe('the campaign builds', () => {
  it('starts each build in a directory of its own, named by its time and process', () => {
    expect(startBuild(out, 36 ** 3, 12)).toBe('b-1000-12')
    expect(fs.statSync(path.join(out, 'b-1000-12')).isDirectory()).toBe(true)
    expect(() => startBuild(out, 36 ** 3, 12)).toThrow(/EEXIST/)
  })

  it('makes a build live by its manifest, then removes the others', () => {
    const first = build(1, true)
    const second = build(2, true)
    expect(liveBuild(out)).toBe(second)
    expect(pruneBuilds(out)).toEqual([first])
    expect(fs.readdirSync(out).sort()).toEqual([second, 'manifest.json'])
  })

  it('keeps the live build when a later run fails before its manifest, and again when one fails after it', () => {
    const live = build(1, true)
    // a run killed mid-build: its directory left, the manifest the last one
    const killed = build(2, false)
    expect(liveBuild(out)).toBe(live)
    // the next run to fail keeps both: nothing is removed before a manifest is committed
    const failed = build(3, false)
    expect(fs.readFileSync(path.join(out, live, 't.bin'), 'utf8')).toBe(live)
    // the next to succeed removes the leftovers, never the build it made live
    const next = build(4, true)
    expect(pruneBuilds(out).sort()).toEqual([live, killed, failed].sort())
    expect(fs.readFileSync(path.join(out, next, 't.bin'), 'utf8')).toBe(next)
  })

  it('removes nothing without a manifest, and nothing but builds', () => {
    build(1, false)
    expect(pruneBuilds(out)).toEqual([])
    fs.mkdirSync(path.join(out, 'notes'))
    const live = build(2, true)
    pruneBuilds(out)
    expect(fs.readdirSync(out).sort()).toEqual([live, 'manifest.json', 'notes'])
  })

  it('refuses a manifest of another build, or of a build not there', () => {
    const name = build(1, false)
    expect(() => commitBuild(out, name, { build: 'b-0-0' })).toThrow(/a manifest of build b-0-0/)
    expect(() => commitBuild(out, 'b-9-9', { build: 'b-9-9' })).toThrow(/ENOENT/)
    expect(liveBuild(out)).toBeUndefined()
  })

  it('writes a file whole, leaving no temporary one', () => {
    const file = path.join(out, 'meta.js')
    writeWhole(file, 'one')
    writeWhole(file, 'two')
    expect(fs.readFileSync(file, 'utf8')).toBe('two')
    expect(fs.readdirSync(out)).toEqual(['meta.js'])
  })
})
