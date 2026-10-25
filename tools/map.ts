// The map CLI (docs/proposals/map-engine.md §8, docs/plans/done/m1-language.md), against the kinds catalogue in
// maps/kinds.json:
//   node tools/map.ts check <map.json>        validate; print every problem with its feature id and path; exit 1 if any
//   node tools/map.ts expand <map.json>       validate and write <map>.expanded.json beside it (generators: M3)
//   node tools/map.ts expand <map.json> --check   fail if the committed expanded file differs from a fresh expansion
//   node tools/map.ts resolve <map.json> <id> [season] [state|none]   print one feature's effective attributes
//   node tools/map.ts draft <map.json> [out.png]   draw the draft (one pixel per 2 m cell, north up) to a PNG
//   node tools/map.ts hash <file.rdem>        print a heightfield's hash for its dem source (M5)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Catalogue, MapFile, Season } from '../src/map/schema.ts'
import { SEASONS } from '../src/map/schema.ts'
import type { Issue } from '../src/map/validate.ts'
import { checkFiles, validate } from '../src/map/validate.ts'
import type { Dem, MapFiles } from '../src/map/dem.ts'
import { sha256 } from '../src/map/dem.ts'
import { expand } from '../src/map/expand.ts'
import { resolve } from '../src/map/resolve.ts'
import { formatMap } from '../src/map/format.ts'
import { apply } from '../src/map/apply.ts'
import { draft } from '../src/map/draft.ts'
import * as png from './png.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const loadCatalogue = (): Catalogue =>
  JSON.parse(fs.readFileSync(path.join(ROOT, 'maps/kinds.json'), 'utf8')) as Catalogue
export function expandedPath(file: string): string {
  if (!/\.json$/.test(file)) throw new Error(`${file}: a map file ends in .json`)
  return file.replace(/(\.map)?\.json$/, '.expanded.json')
}
const show = (file: string, issues: Issue[]) => {
  for (const i of issues) console.log(`${file}: ${i.id ? `[${i.id}] ` : ''}${i.path || '(map)'}: ${i.message}`)
}

/** The files a map's sources name (its heightfields), read from beside the map file; a missing one is left out. */
export function readMapFiles(file: string, map: MapFile): MapFiles {
  const files: MapFiles = new Map()
  for (const s of map.sources ?? []) {
    const name = (s as { file?: unknown }).file
    if (typeof name !== 'string') continue
    const at = path.join(path.dirname(file), name)
    if (fs.existsSync(at)) files.set(name, new Uint8Array(fs.readFileSync(at)))
  }
  return files
}

// the map, valid with its files, and its decoded heightfields
function load(file: string, cat: Catalogue): { map: MapFile; dems: Map<string, Dem> } | null {
  const map = loadJson(file, cat)
  if (!map) return null
  const { issues, dems } = checkFiles(map, cat, readMapFiles(file, map))
  show(file, issues)
  return issues.length ? null : { map, dems }
}

function loadJson(file: string, cat: Catalogue): MapFile | null {
  let map: unknown
  let text: string
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch (e) {
    console.log(`${file}: cannot read: ${(e as Error).message}`)
    return null
  }
  try {
    map = JSON.parse(text)
  } catch (e) {
    console.log(`${file}: not valid JSON: ${(e as Error).message}`)
    return null
  }
  const issues = validate(map, cat)
  show(file, issues)
  return issues.length ? null : (map as MapFile)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [cmd, file, ...rest] = process.argv.slice(2)
  const cat = loadCatalogue()
  if (cmd === 'hash' && file) {
    console.log(sha256(new Uint8Array(fs.readFileSync(file))))
    process.exit(0)
  }
  if (!file || !['check', 'expand', 'resolve', 'draft'].includes(cmd)) {
    console.log('usage: node tools/map.ts check|expand|resolve|draft <map.json> …, or hash <file.rdem>')
    process.exit(2)
  }
  const loaded = load(file, cat)
  if (!loaded) process.exit(1)
  const { map, dems } = loaded
  if (cmd === 'check') {
    console.log(`${file}: ok (${map.features.length} features)`)
    process.exit(0)
  }
  if (cmd === 'resolve') {
    const f = map.features.find(x => x.id === rest[0])
    if (!f) {
      console.log(`${file}: no feature "${rest[0]}"`)
      process.exit(1)
    }
    const season = (rest[1] ?? map.season) as Season
    const state = rest[2] === 'none' ? undefined : (rest[2] ?? f.state)
    if (!(SEASONS as readonly string[]).includes(season)) {
      console.log(`unknown season "${season}" (${SEASONS.join(', ')})`)
      process.exit(2)
    }
    try {
      console.log(JSON.stringify(resolve(f, map, cat, season, state), null, 2))
    } catch (e) {
      console.log((e as Error).message)
      process.exit(1)
    }
    process.exit(0)
  }
  const { map: out, issues } = expand(map, cat)
  show(file, issues)
  if (issues.length) process.exit(1)
  if (cmd === 'draft') {
    const t0 = performance.now()
    const layers = apply(out, cat, dems)
    const t1 = performance.now()
    const img = draft(layers)
    const t2 = performance.now()
    const dest = rest[0] ?? file.replace(/(\.map)?\.json$/, '.draft.png')
    fs.writeFileSync(
      dest,
      png.write({ w: img.w, h: img.h, data: Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength) }),
    )
    console.log(
      `${file}: draft ${img.w}×${img.h} → ${path.relative(process.cwd(), dest)} (apply ${(t1 - t0).toFixed(0)} ms, draw ${(t2 - t1).toFixed(0)} ms)`,
    )
    process.exit(0)
  }
  const text = formatMap(out)
  const dest = expandedPath(file)
  if (rest.includes('--check')) {
    const same = fs.existsSync(dest) && fs.readFileSync(dest, 'utf8') === text
    console.log(`${dest}: ${same ? 'matches' : 'DIFFERS FROM'} a fresh expansion`)
    process.exit(same ? 0 : 1)
  }
  fs.writeFileSync(dest, text)
  console.log(`${file}: expanded → ${path.relative(process.cwd(), dest)} (${out.features.length} features)`)
}
