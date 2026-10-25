// The draft page's messages between the page and its compile worker (docs/plans/done/m1-language.md M1b).
import type { MapFile } from '../../map/schema.ts'
import type { Issue } from '../../map/catalogue.ts'
import type { Resolved } from '../../map/resolve.ts'
import type { LAYER_NAMES } from '../../map/apply.ts'

export interface CompileRequest {
  seq: number
  mapText: string
  kindsText: string
  // the heightfields the map's dem sources name, by name: each with the page's version of it, and its bytes only
  // when the worker does not hold that version yet (a 10 MB file is sent once, not on every save of the map)
  files: Record<string, { version: number; bytes?: ArrayBuffer }>
}
export type LayerName = (typeof LAYER_NAMES)[number]
export interface Compiled {
  seq: number
  ok: true
  map: MapFile
  w: number
  h: number
  rgba: ArrayBuffer // the draft raster, north up
  cell: number
  nx: number
  nz: number
  x0: number
  z0: number
  height: ArrayBuffer // Float64Array of (nx + 1)(nz + 1) nodes
  depth: ArrayBuffer // Uint16Array per cell: water depth, mm
  layers: Record<LayerName, ArrayBuffer> // Uint16Array per cell: an index into table (0: none)
  table: Resolved[]
  ms: { validate: number; apply: number; draw: number }
}
export interface Failed {
  seq: number
  ok: false
  issues: Issue[]
}
export type CompileReply = Compiled | Failed
