// The state of every page scenario, for proving a refactor changes no behaviour: each scenario recorded for `ticks`
// (3000 by default) at seed 3, and at each hash point the hashes of every section of the save but meta, which holds
// the ruleset's hash (any change to the ruleset's shape moves it, and with it every golden). Run it before and after
// a change; identical files mean identical state on every scenario at every point.
// Usage: node tools/state-hashes.ts out.json [ticks]   or   node tools/state-hashes.ts --compare a.json b.json
import fs from 'node:fs'
import path from 'node:path'
import { loadSimData, compileRuleset, record, type SimData } from '../src/sim/index.ts'
import { napoleonic } from '../src/rulesets/napoleonic.ts'
import { PAGE_SCENARIOS } from '../src/scenarios/page.ts'
import { MAP_VERSIONS, DEFAULT_MAP } from '../src/scenarios/maps.ts'

if (process.argv[2] === '--compare') {
  const a = JSON.parse(fs.readFileSync(process.argv[3], 'utf8')) as Record<string, string[]>
  const b = JSON.parse(fs.readFileSync(process.argv[4], 'utf8')) as Record<string, string[]>
  let bad = 0
  for (const name of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const k = (a[name] ?? []).findIndex((h, i) => h !== b[name]?.[i])
    if (k >= 0 || a[name]?.length !== b[name]?.length) {
      bad++
      console.log(`${name}: differs from hash point ${k >= 0 ? a[name][k].split(':')[0] : 'end'}`)
    }
  }
  console.log(bad ? `${bad} scenarios differ` : 'identical')
  process.exit(bad ? 1 : 0)
}
const root = path.resolve(import.meta.dirname, '..')
const ticks = Number(process.argv[3] ?? 3000)
const cr = compileRuleset(napoleonic)
const out: Record<string, string[]> = {}
const maps: Record<string, SimData> = {}
for (const [name, sc] of Object.entries(PAGE_SCENARIOS)) {
  const map = sc.map ?? DEFAULT_MAP
  if (!(map in MAP_VERSIONS)) continue
  const d = (maps[map] ??= loadSimData(
    new Uint8Array(fs.readFileSync(path.join(root, 'data', `${map}.simdata`))),
    MAP_VERSIONS[map],
  ))
  const run = record(d, cr, sc, 3, ticks, () => {})
  out[name] = run.hashes.map(
    h =>
      `${h.tick}:` +
      h
        .sections!.filter(([n]) => n !== 'meta')
        .map(([, v]) => v.toString(16))
        .join(','),
  )
}
fs.writeFileSync(process.argv[2], JSON.stringify(out))
console.log(`${Object.keys(out).length} scenarios, ${ticks} ticks`)
