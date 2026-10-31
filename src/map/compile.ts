// A map file compiled to its layers (docs/plans/done/m1-language.md): validate, its files (the heightfields it names,
// as bytes), expand, apply. One path for the CLI (maps/engine.ts, layersOf: the files read from disk) and the look
// page's tile worker (src/look/tile-worker.ts: the files fetched); the map page's worker reports the steps' issues to
// its editor instead (src/app/map/worker.ts). Throws on the first step that has issues, listing up to five.
import type { Catalogue, MapFile } from './schema.ts'
import type { MapFiles } from './dem.ts'
import type { Layers } from './apply.ts'
import { apply } from './apply.ts'
import { checkFiles, validate } from './validate.ts'
import { expand } from './expand.ts'

/** The issues a step found, as an error's message: `name`: up to five of them, each `id path: message` */
const issuesOf = (name: string, issues: readonly { id?: string | null; path: string; message: string }[]) =>
  `${name}: ${issues
    .slice(0, 5)
    .map(i => `${i.id ?? ''} ${i.path}: ${i.message}`)
    .join('; ')}`

/** A map (`raw`: its parsed JSON, `name` for the errors) compiled with its files to its expanded map and its layers */
export function compileMap(
  name: string,
  raw: unknown,
  cat: Catalogue,
  files: MapFiles,
): { map: MapFile; layers: Layers } {
  const issues = validate(raw, cat)
  if (issues.length) throw new Error(issuesOf(name, issues))
  const checked = checkFiles(raw as MapFile, cat, files)
  if (checked.issues.length) throw new Error(issuesOf(name, checked.issues))
  const ex = expand(raw as MapFile, cat)
  if (ex.issues.length) throw new Error(issuesOf(name, ex.issues))
  return { map: ex.map, layers: apply(ex.map, cat, checked.dems) }
}
