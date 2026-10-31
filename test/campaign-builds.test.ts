// How the campaign map's tool replaces its last output (tools/campaign-builds.ts): a build in a directory of its own,
// made live by the file that names it, the older ones removed only after.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, it, expect } from 'vitest'
import {
  commitBuild,
  liveBuild,
  namedBuild,
  pruneBuilds,
  startBuild,
  writeFlushed,
  writeWhole,
} from '../tools/campaign-builds.ts'

const FILE = 'manifest.json'
let out: string

beforeEach(() => {
  out = fs.mkdtempSync(path.join(os.tmpdir(), 'campaign-builds-'))
})

afterEach(() => {
  fs.rmSync(out, { recursive: true, force: true })
})

/** A manifest's text naming `build`. */
const manifest = (build: string) => JSON.stringify({ format: 2, build }, null, 2)

/** A build started at `now` with one tile, made live if `commit`. */
function build(now: number, commit: boolean): string {
  const name = startBuild(out, now, 7)
  fs.writeFileSync(path.join(out, name, 't.bin'), name)
  if (commit) commitBuild(out, name, FILE, manifest(name))
  return name
}

describe('the campaign builds', () => {
  it('starts each build in a directory of its own, named by its time and process', () => {
    expect(startBuild(out, 36 ** 3, 12)).toBe('b-1000-12')
    expect(fs.statSync(path.join(out, 'b-1000-12')).isDirectory()).toBe(true)
    expect(() => startBuild(out, 36 ** 3, 12)).toThrow(/EEXIST/)
  })

  it('reads the build a manifest or a meta file names', () => {
    expect(namedBuild(manifest('b-1-2'))).toBe('b-1-2')
    expect(namedBuild('window.CAMPAIGN_TILES = {"cell":100,"build":"b-a9-3"}')).toBe('b-a9-3')
    expect(namedBuild('{"build":"../l1"}')).toBeUndefined()
  })

  it('makes a build live, then removes the older ones but the one it replaced', () => {
    const first = build(1, true)
    const second = build(2, true)
    const third = build(3, true)
    expect(liveBuild(out, FILE)).toBe(third)
    expect(pruneBuilds(out, FILE, [second])).toEqual([first])
    expect(fs.readdirSync(out).sort()).toEqual([second, third, FILE])
  })

  it('keeps the live build when a later run fails before its manifest, and again when one fails after it', () => {
    const live = build(1, true)
    // a run killed mid-build: its directory left, the manifest the last one
    const killed = build(2, false)
    expect(liveBuild(out, FILE)).toBe(live)
    // the next run to fail keeps both: nothing is removed before a manifest is committed
    const failed = build(3, false)
    expect(fs.readFileSync(path.join(out, live, 't.bin'), 'utf8')).toBe(live)
    // the next to succeed removes the leftovers, never the build it made live
    const next = build(4, true)
    expect(pruneBuilds(out, FILE).sort()).toEqual([live, killed, failed].sort())
    expect(fs.readFileSync(path.join(out, next, 't.bin'), 'utf8')).toBe(next)
  })

  it('leaves a build started after the live one: a run still going', () => {
    const going = startBuild(out, 5, 8)
    const done = build(4, true)
    expect(pruneBuilds(out, FILE)).toEqual([])
    expect(fs.readdirSync(out).sort()).toEqual([done, going, FILE].sort())
  })

  it('removes nothing without a manifest, and nothing but builds', () => {
    build(1, false)
    expect(pruneBuilds(out, FILE)).toEqual([])
    fs.mkdirSync(path.join(out, 'notes'))
    const live = build(2, true)
    pruneBuilds(out, FILE)
    expect(fs.readdirSync(out).sort()).toEqual([live, FILE, 'notes'])
  })

  it('refuses a manifest of another build, or of a build not there', () => {
    const name = build(1, false)
    expect(() => commitBuild(out, name, FILE, manifest('b-0-0'))).toThrow(/of build b-0-0 for/)
    expect(() => commitBuild(out, 'b-9-9', FILE, manifest('b-9-9'))).toThrow(/ENOENT/)
    expect(liveBuild(out, FILE)).toBeUndefined()
  })

  it('writes a file whole, leaving no temporary one, and a flushed one', async () => {
    const file = path.join(out, 'meta.js')
    writeWhole(file, 'one')
    writeWhole(file, 'two')
    expect(fs.readFileSync(file, 'utf8')).toBe('two')
    await writeFlushed(path.join(out, 't.bin'), new Uint8Array([1, 2]))
    expect([...fs.readFileSync(path.join(out, 't.bin'))]).toEqual([1, 2])
    expect(fs.readdirSync(out).sort()).toEqual(['meta.js', 't.bin'])
  })
})
