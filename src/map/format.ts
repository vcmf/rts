// The map file's one layout (docs/proposals/map-engine.md §3, strict JSON): the map's own fields two-space
// indented, one feature, preset or source per line, so a diff shows which features changed. The CLI writes
// expanded maps with it; hand-written maps may use any layout.
import type { MapFile } from './schema.ts'

export function formatMap(map: MapFile): string {
  const lines = Object.entries(map).map(([k, v]) => {
    if (k === 'features' || k === 'sources') {
      return `  ${JSON.stringify(k)}: [\n${(v as unknown[]).map(x => '    ' + JSON.stringify(x)).join(',\n')}\n  ]`
    }
    if (k === 'presets') {
      return `  "presets": {\n${Object.entries(v as object)
        .map(([n, p]) => `    ${JSON.stringify(n)}: ${JSON.stringify(p)}`)
        .join(',\n')}\n  }`
    }
    return `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`
  })
  return `{\n${lines.join(',\n')}\n}\n`
}
