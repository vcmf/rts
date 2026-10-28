// The map file's one layout (docs/proposals/map-engine.md §3, strict JSON): the map's own fields two-space
// indented, one feature, preset or source per line, so a diff shows which features changed. The CLI writes
// expanded maps with it, and the editor's save (src/map/write.ts) writes what it changes with it; hand-written maps
// may use any layout.
import type { MapFile } from './schema.ts'

/** One of the map's own fields' value in the layout: lists and presets one entry a line, the rest on one line. */
export function formatValue(key: string, v: unknown): string {
  // an empty list on one line, as the editor's save writes one (src/map/write.ts)
  if ((key === 'features' || key === 'sources') && Array.isArray(v) && v.length === 0) return '[]'
  if (key === 'features' || key === 'sources') {
    return `[\n${(v as unknown[]).map(x => '    ' + JSON.stringify(x)).join(',\n')}\n  ]`
  }
  if (key === 'presets') {
    return `{\n${Object.entries(v as object)
      .map(([n, p]) => `    ${JSON.stringify(n)}: ${JSON.stringify(p)}`)
      .join(',\n')}\n  }`
  }
  return JSON.stringify(v)
}

export function formatMap(map: MapFile): string {
  const lines = Object.entries(map).map(([k, v]) => `  ${JSON.stringify(k)}: ${formatValue(k, v)}`)
  return `{\n${lines.join(',\n')}\n}\n`
}
