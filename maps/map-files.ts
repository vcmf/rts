// The files a map's dem sources name (docs/plans/active/m5-relief.md), read from beside the map file in Node: for
// the map CLI (tools/map.ts) and the sim's map loader (maps/engine.ts). The page fetches them (src/app/map/main.ts).
import fs from 'node:fs'
import path from 'node:path'
import type { MapFile } from '../src/map/schema.ts'
import type { MapFiles } from '../src/map/dem.ts'

/** The heightfields a map's dem sources name, read beside the map; a missing one is left out (checkFiles says so). */
export function readMapFiles(file: string, map: MapFile): MapFiles {
  const files: MapFiles = new Map()
  for (const s of map.sources ?? []) {
    const name = (s as { file?: unknown }).file
    if (s.kind !== 'dem' || typeof name !== 'string' || name.includes('/') || name.includes('\\')) continue
    const at = path.join(path.dirname(file), name)
    if (fs.existsSync(at)) files.set(name, new Uint8Array(fs.readFileSync(at)))
  }
  return files
}
