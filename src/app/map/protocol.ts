// The draft page's messages between the page and its compile worker (docs/plans/active/m1-language.md M1b).
import type { MapFile } from '../../map/schema.ts'
import type { Issue } from '../../map/catalogue.ts'
import type { Resolved } from '../../map/resolve.ts'
import type { LAYER_NAMES } from '../../map/apply.ts'

export interface CompileRequest { seq: number; mapText: string; kindsText: string }
export type LayerName = typeof LAYER_NAMES[number]
export interface Compiled {
  seq: number; ok: true; map: MapFile
  w: number; h: number; rgba: ArrayBuffer   // the draft raster, north up
  cell: number; nx: number; nz: number; x0: number; z0: number
  height: ArrayBuffer                       // Float64Array of (nx + 1)(nz + 1) nodes
  layers: Record<LayerName, ArrayBuffer>    // Uint16Array per cell: an index into table (0: none)
  table: Resolved[]
  ms: { validate: number; apply: number; draw: number }
}
export interface Failed { seq: number; ok: false; issues: Issue[] }
export type CompileReply = Compiled | Failed
