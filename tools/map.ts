// The map CLI (docs/proposals/map-engine.md §8, docs/plans/active/m1-language.md), against the kinds catalogue in
// maps/kinds.json:
//   node tools/map.ts check <map.json>        validate; print every problem with its feature id and path; exit 1 if any
//   node tools/map.ts expand <map.json>       validate and write <map>.expanded.json beside it (generators arrive in M3)
//   node tools/map.ts expand <map.json> --check   fail if the committed expanded file differs from a fresh expansion
//   node tools/map.ts resolve <map.json> <id> [season] [state]   print one feature's effective attributes
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Catalogue, MapFile, Season } from '../src/map/schema.ts'
import type { Issue } from '../src/map/validate.ts'
import { validate } from '../src/map/validate.ts'
import { expand } from '../src/map/expand.ts'
import { resolve } from '../src/map/resolve.ts'
import { formatMap } from '../src/map/format.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const loadCatalogue = (): Catalogue => JSON.parse(fs.readFileSync(path.join(ROOT, 'maps/kinds.json'), 'utf8')) as Catalogue
export const expandedPath = (file: string): string => file.replace(/(\.map)?\.json$/, '.expanded.json')
const show = (file: string, issues: Issue[]) => { for (const i of issues) console.log(`${file}: ${i.id ? `[${i.id}] ` : ''}${i.path || '(map)'}: ${i.message}`) }

function load(file: string, cat: Catalogue): MapFile | null {
  let map: unknown
  try { map = JSON.parse(fs.readFileSync(file, 'utf8')) } catch (e) { console.log(`${file}: not valid JSON: ${(e as Error).message}`); return null }
  const issues = validate(map, cat)
  show(file, issues)
  return issues.length ? null : map as MapFile
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [cmd, file, ...rest] = process.argv.slice(2)
  const cat = loadCatalogue()
  if (!file || !['check', 'expand', 'resolve'].includes(cmd)) { console.log('usage: node tools/map.ts check|expand|resolve <map.json> …'); process.exit(2) }
  const map = load(file, cat)
  if (!map) process.exit(1)
  if (cmd === 'check') { console.log(`${file}: ok (${map.features.length} features)`); process.exit(0) }
  if (cmd === 'resolve') {
    const f = map.features.find(x => x.id === rest[0])
    if (!f) { console.log(`${file}: no feature "${rest[0]}"`); process.exit(1) }
    console.log(JSON.stringify(resolve(f, map, cat, (rest[1] as Season) ?? map.season, rest[2] ?? f.state), null, 2)); process.exit(0)
  }
  const { map: out, issues } = expand(map)
  show(file, issues)
  if (issues.length) process.exit(1)
  const text = formatMap(out), dest = expandedPath(file)
  if (rest.includes('--check')) {
    const same = fs.existsSync(dest) && fs.readFileSync(dest, 'utf8') === text
    console.log(`${dest}: ${same ? 'matches' : 'DIFFERS FROM'} a fresh expansion`); process.exit(same ? 0 : 1)
  }
  fs.writeFileSync(dest, text)
  console.log(`${file}: expanded → ${path.relative(process.cwd(), dest)} (${out.features.length} features)`)
}
