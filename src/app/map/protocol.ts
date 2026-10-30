// The draft page's messages between the page and its compile worker (docs/plans/done/m1-language.md M1b).
import type { MapFile } from '../../map/schema.ts'
import type { Issue } from '../../map/catalogue.ts'
import type { Resolved } from '../../map/resolve.ts'
import type { LAYER_NAMES } from '../../map/apply.ts'
import type { Sun } from '../../render/lit/bake.ts'
import type { OverlaySpec } from '../../render/lit/overlays.ts'
import type { Standing } from '../../render/lit/houses.ts'

export interface CompileRequest {
  type?: 'compile'
  seq: number
  mapText: string
  kindsText: string
  // the heightfields the map's dem sources name, by name: each with the page's version of it, and its bytes only
  // when the worker does not hold that version yet (a 10 MB file is sent once, not on every save of the map)
  files: Record<string, { version: number; bytes?: ArrayBuffer }>
  // the sun the light is baked for and the heights' exaggeration for the light (the page's ?sun=, ?az=, ?soft=, ?z=);
  // the map view's own (SUN, RELIEF.z) when absent
  sun?: Sun
  z?: number
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
  units: string[] // the ruleset's unit kinds, for the passability overlay
  // the lit view's bakes (src/render/lit/bake.ts): the light on every lightStep-th node (bakeLight), the masks on the
  // cells, RGBA
  light: ArrayBuffer
  lightNx: number
  lightNz: number
  lightStep: number
  masks: ArrayBuffer
  ink: ArrayBuffer // the ink's distance field on the cells (bakeInk), RGBA
  houses: Standing[] // the buildings that stand (standing): the view raises them and casts their shadows
  sun: Sun // the sun the light was baked for: the shader's slope light and the houses take the same
  z: number // the heights' exaggeration it was baked with: the shader's slope light takes the same
  ms: { validate: number; apply: number; draw: number; bake: number; ground: number }
}
export interface Failed {
  seq: number
  ok: false
  issues: Issue[]
  // heightfields the worker was told it holds but does not (it restarted, or never stored them): the page sends
  // them again and recompiles
  missing?: string[]
}
export type CompileReply = Compiled | Failed
// a debug overlay (src/render/lit/overlays.ts) of the last compiled map, or none
export interface OverlayRequest {
  type: 'overlay'
  seq: number
  of: number // the compile (its seq) whose map the page shows: the overlay is drawn on that map's ground alone
  spec: OverlaySpec | null
}
export interface OverlayReply {
  type: 'overlay'
  seq: number
  rgba: ArrayBuffer | null // RGBA a cell, the south row first
  ms: number
  error?: string
}
