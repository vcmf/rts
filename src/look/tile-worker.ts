// The look page's tile worker (G3b-3, docs/plans/done/g3b-the-detail-follows.md): the window's map compiled once, off
// the page's thread (validate, its files, expand, apply: the map CLI's steps, maps/engine.ts's layersOf, in the
// browser as the map page's worker runs them), its coarse light baked once, then each tile the page asks for built
// (src/look/world/window-build.ts: the compiler's own window build, in the window's frame) and sent back as look data.
import type { Catalogue, MapFile } from '../map/schema.ts'
import type { Layers } from '../map/apply.ts'
import { compileMap } from '../map/compile.ts'
import type { LightGrid, TileAt } from './world/data.ts'
import type { LookWindow } from './world/windows.ts'
import { coarseLight, standingOf, windowData } from './world/window-build.ts'
import type { Standing } from '../render/lit/houses.ts'
import { encodeLook } from './world/data.ts'
import { coarsenCover } from './world/cover.ts'
import { flowBytes } from './flow-field.ts'
import { D } from './spec.ts'
import { meadowMapData, type MeadowData } from './meadow-data.ts'
import { meadowGrowth } from './world/growth.ts'
import { sample } from './heightfield.ts'

/** The page's requests: the map (once, first), then a tile by its centre (on the tile grid, in the window's frame) */
export type TileRequest =
  // (flow: whether the page's meadow is combed, and so reads a tile's flow)
  | {
      type: 'map'
      win: LookWindow
      mapText: string
      kindsText: string
      files: Record<string, ArrayBuffer>
      flow: boolean
      // (whether the page grows the meadow, and so reads a tile's meadow map)
      meadow: boolean
    }
  | { type: 'tile'; seq: number; at: TileAt }
/** The replies: the map compiled (its time, ms), a tile's look data (its bytes, its time), or what failed */
export type TileReply =
  | { type: 'map'; ms: number }
  // (with the tile: its per-frame cover, coarsened to the spec's cells, and its flow's texels: the page writes them in
  // place, G3c)
  | {
      type: 'tile'
      seq: number
      at: TileAt
      bytes: ArrayBuffer
      frame: { n: number; cell: number; x0: number; z0: number; tex: ArrayBuffer }
      flow: ArrayBuffer | null
      meadow: {
        data: ArrayBuffer
        g: ArrayBuffer
        cropG: ArrayBuffer
        growingCells: number
        croppingCells: number
      } | null
      ms: number
    }
  | { type: 'error'; seq: number | null; message: string }

let world: {
  win: LookWindow
  map: MapFile
  layers: Layers
  light: LightGrid
  flow: boolean
  meadow: boolean
  built: Standing[] // (the map's standing buildings, once: each tile's are among them)
} | null = null
const post = (r: TileReply, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(r, transfer)

self.onmessage = (e: MessageEvent<TileRequest>) => {
  const q = e.data
  try {
    if (q.type === 'map') {
      const t0 = performance.now()
      const cat = JSON.parse(q.kindsText) as Catalogue
      const files = new Map(Object.entries(q.files).map(([k, b]) => [k, new Uint8Array(b)]))
      const { map, layers } = compileMap(q.win.map, JSON.parse(q.mapText), cat, files)
      world = {
        win: q.win,
        map,
        layers,
        light: coarseLight(layers),
        flow: q.flow,
        meadow: q.meadow,
        built: standingOf(map, layers),
      }
      post({ type: 'map', ms: performance.now() - t0 })
      return
    }
    if (!world) throw new Error('a tile asked for before the map')
    const t0 = performance.now()
    const data = windowData(world.win, world.map, world.layers, world.light, q.at, world.built)
    const bytes = encodeLook(data)
    const frame = coarsenCover(data.cover, D.spec.macro.cover)
    const flow = world.flow ? flowBytes(q.at[0], q.at[1], D.spec.tile) : null
    // the meadow map's data (src/look/meadow-data.ts): on a map world its rules are the cover's alone (no formation
    // zones, no river: src/look/nature.ts, growthAllowed, is true there)
    let meadow: MeadowData | null = null
    // (a tile with a river has banks the worker cannot keep the grass off: the page's move refuses one, G3d)
    if (world.meadow && !data.river.n) {
      const { growth, crop } = meadowGrowth(data.cover)
      const t = D.spec.tile
      const all = () => true
      const h = (x: number, z: number) => sample(data.hf, x, z)
      meadow = meadowMapData(q.at[0] - t / 2, q.at[1] - t / 2, t, growth, all, crop, all, h)
    }
    // (the encoding's own buffer when it is all of it: transferred, not copied)
    const whole = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
    const buf = (
      whole ? bytes.buffer : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    ) as ArrayBuffer
    // (the cover's own bytes are the encoding's source: copied only when the coarsening kept them)
    const ft = (frame === data.cover ? frame.tex.slice() : frame.tex).buffer as ArrayBuffer
    const fb = flow ? (flow.buffer as ArrayBuffer) : null
    const mb = meadow && {
      data: meadow.data.buffer as ArrayBuffer,
      g: meadow.g.buffer as ArrayBuffer,
      cropG: meadow.cropG.buffer as ArrayBuffer,
      growingCells: meadow.growingCells,
      croppingCells: meadow.croppingCells,
    }
    post(
      {
        type: 'tile',
        seq: q.seq,
        at: q.at,
        bytes: buf,
        frame: { ...frame, tex: ft },
        flow: fb,
        meadow: mb,
        ms: performance.now() - t0,
      },
      [buf, ft, ...(fb ? [fb] : []), ...(mb ? [mb.data, mb.g, mb.cropG] : [])],
    )
  } catch (err) {
    post({ type: 'error', seq: q.type === 'tile' ? q.seq : null, message: (err as Error).message })
  }
}
