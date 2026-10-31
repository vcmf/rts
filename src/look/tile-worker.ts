// The look page's tile worker (G3b-3, docs/plans/done/g3b-the-detail-follows.md): the window's map compiled once, off
// the page's thread (validate, its files, expand, apply: the map CLI's steps, maps/engine.ts's layersOf, in the
// browser as the map page's worker runs them), its coarse light baked once, then each tile the page asks for built
// (src/look/world/window-build.ts: the compiler's own window build, in the window's frame) and sent back as look data.
import type { Catalogue, MapFile } from '../map/schema.ts'
import type { Layers } from '../map/apply.ts'
import { compileMap } from '../map/compile.ts'
import type { LightGrid, TileAt } from './world/data.ts'
import type { LookWindow } from './world/windows.ts'
import { buildWindowData, coarseLight } from './world/window-build.ts'

/** The page's requests: the map (once, first), then a tile by its centre (on the tile grid, in the window's frame) */
export type TileRequest =
  | { type: 'map'; win: LookWindow; mapText: string; kindsText: string; files: Record<string, ArrayBuffer> }
  | { type: 'tile'; seq: number; at: TileAt }
/** The replies: the map compiled (its time, ms), a tile's look data (its bytes, its time), or what failed */
export type TileReply =
  | { type: 'map'; ms: number }
  | { type: 'tile'; seq: number; at: TileAt; bytes: ArrayBuffer; ms: number }
  | { type: 'error'; seq: number | null; message: string }

let world: { win: LookWindow; map: MapFile; layers: Layers; light: LightGrid } | null = null
const post = (r: TileReply, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(r, transfer)

self.onmessage = (e: MessageEvent<TileRequest>) => {
  const q = e.data
  try {
    if (q.type === 'map') {
      const t0 = performance.now()
      const cat = JSON.parse(q.kindsText) as Catalogue
      const files = new Map(Object.entries(q.files).map(([k, b]) => [k, new Uint8Array(b)]))
      const { map, layers } = compileMap(q.win.map, JSON.parse(q.mapText), cat, files)
      world = { win: q.win, map, layers, light: coarseLight(layers) }
      post({ type: 'map', ms: performance.now() - t0 })
      return
    }
    if (!world) throw new Error('a tile asked for before the map')
    const t0 = performance.now()
    const bytes = buildWindowData(world.win, world.map, world.layers, world.light, q.at)
    // (the encoding's own buffer when it is all of it: transferred, not copied)
    const whole = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
    const buf = (
      whole ? bytes.buffer : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    ) as ArrayBuffer
    post({ type: 'tile', seq: q.seq, at: q.at, bytes: buf, ms: performance.now() - t0 }, [buf])
  } catch (err) {
    post({ type: 'error', seq: q.type === 'tile' ? q.seq : null, message: (err as Error).message })
  }
}
