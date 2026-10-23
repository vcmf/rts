// The look data file (data/painted-world.lookdata), written by tools/build-look-data.ts and read by the look page:
// the heightfield (tile plus margin), the far ring's heights, the river's per-sample arrays, the fine bank normals and
// the water data.
// Layout, little-endian: "LOOK", u32 version, u32 meta length, the meta as UTF-8 JSON padded to 4 bytes, then the
// arrays in the order the meta lists them (float32, or bytes padded to 4). The cover (docs/plans/active/l5-macro.md):
// its grid's runs, src/look/world/cover.ts.
import type { Grid, Heightfield } from '../heightfield.ts'
import { ROAD_SLOTS, type Derived } from '../spec.ts'
import { SAMPLE_KEYS, type RiverParams, type RiverSamples } from '../river.ts'
import { packCover, unpackCover, type CoverGrid } from './cover.ts'

export const LOOK_VERSION = 8 // 8: the roads as segments (with mitre tangents) and a grid of them (docs/plans/done/roads.md)

// A grid of n² texels of `cell` metres from (x0, z0) with ch bytes a texel, stored only where covered: spans are (row,
// first column, count) triples, tex holds ch bytes per covered texel in span order. The rest take the user's fill.
// The bank normals (docs/plans/done/w2-river-banks.md): 3 bytes, the normal's x and z as (v·0.5 + 0.5)·255 and the
// weight ·255. The water data (docs/plans/done/w3-water-data.md): 4 bytes, src/look/world/water-data.ts.
export interface SpanGrid {
  n: number
  cell: number
  x0: number
  z0: number
  ch: number
  spans: Float32Array
  tex: Uint8Array
}
// the roads (docs/plans/done/roads.md): their segments (12 floats each: ax, az, bx, bz, the distance along their line
// at a, the line's half width, its index, its flags (1 its start is a free end, 2 its end, 4 a track's earth), and its mitre tangents at a and b) and a grid over the tile of `cell` m cells, ROAD_SLOTS segment indices a
// cell (−1: none), every segment that reaches within its half width and SPEC.road.reach m of the cell
export { ROAD_SLOTS }
export const ROAD_SEG = 12 // floats a segment (three RGBA texels)
export interface RoadGrid {
  segs: Float32Array
  n: number
  cell: number
  x0: number
  z0: number
  ids: Float32Array
}
export interface LookData {
  hf: Heightfield
  far: Grid
  river: RiverSamples
  bank: SpanGrid
  water: SpanGrid
  roads: RoadGrid
  cover: CoverGrid
} // far: the far ring's nodes

const SPAN_GRIDS = ['bank', 'water'] as const
type GridMeta = { n: number; cell: number; x0: number; z0: number; ch: number }

interface Meta {
  hf: { n: number; cell: number; x0: number; z0: number; min: number; max: number }
  far: { n: number; cell: number; x0: number; z0: number }
  river: { P: RiverParams; n: number }
  bank: GridMeta
  water: GridMeta
  roads: { n: number; cell: number; x0: number; z0: number }
  cover: { n: number; cell: number; x0: number; z0: number }
  arrays: [string, number, 'f32' | 'u8'][]
}

const bytesOf = (n: number, t: 'f32' | 'u8') => (t === 'f32' ? n * 4 : Math.ceil(n / 4) * 4)

const gridMeta = (g: SpanGrid): GridMeta => ({ n: g.n, cell: g.cell, x0: g.x0, z0: g.z0, ch: g.ch })

export function encodeLook(d: LookData): Uint8Array {
  const arrays: [string, Float32Array | Uint8Array][] = [
    ['hf', d.hf.h],
    ['far', d.far.h],
    ...SAMPLE_KEYS.map(k => [k, d.river[k]] as [string, Float32Array]),
    ...SPAN_GRIDS.flatMap(
      g =>
        [
          [g + 'Spans', d[g].spans],
          [g + 'Tex', d[g].tex],
        ] as [string, Float32Array | Uint8Array][],
    ),
    ['coverRuns', packCover(d.cover)],
    ['roadSegs', d.roads.segs],
    ['roadIds', d.roads.ids],
  ]
  const type = (a: Float32Array | Uint8Array): 'f32' | 'u8' => (a instanceof Float32Array ? 'f32' : 'u8')
  const meta: Meta = {
    hf: { n: d.hf.n, cell: d.hf.cell, x0: d.hf.x0, z0: d.hf.z0, min: d.hf.min, max: d.hf.max },
    far: { n: d.far.n, cell: d.far.cell, x0: d.far.x0, z0: d.far.z0 },
    river: { P: d.river.P, n: d.river.n },
    bank: gridMeta(d.bank),
    water: gridMeta(d.water),
    roads: { n: d.roads.n, cell: d.roads.cell, x0: d.roads.x0, z0: d.roads.z0 },
    cover: { n: d.cover.n, cell: d.cover.cell, x0: d.cover.x0, z0: d.cover.z0 },
    arrays: arrays.map(([k, a]) => [k, a.length, type(a)]),
  }
  const json = new TextEncoder().encode(JSON.stringify(meta))
  const pad = (4 - (json.length % 4)) % 4
  const head = 12 + json.length + pad
  const size = head + arrays.reduce((s, [, a]) => s + bytesOf(a.length, type(a)), 0)
  const out = new Uint8Array(size)
  const dv = new DataView(out.buffer)
  out.set(new TextEncoder().encode('LOOK'), 0)
  dv.setUint32(4, LOOK_VERSION, true)
  dv.setUint32(8, json.length + pad, true)
  out.set(json, 12)
  out.fill(32, 12 + json.length, head) // padded with spaces, still valid JSON
  let o = head
  for (const [, a] of arrays) {
    if (a instanceof Float32Array) for (let i = 0; i < a.length; i++, o += 4) dv.setFloat32(o, a[i], true)
    else {
      out.set(a, o)
      o += bytesOf(a.length, 'u8')
    }
  }
  return out
}

export function decodeLook(buf: ArrayBuffer): LookData {
  const dv = new DataView(buf)
  const bytes = new Uint8Array(buf)
  if (new TextDecoder().decode(bytes.subarray(0, 4)) !== 'LOOK') throw new Error('look data: bad magic')
  const ver = dv.getUint32(4, true)
  if (ver !== LOOK_VERSION) {
    throw new Error(`look data: version ${ver}, this build reads ${LOOK_VERSION}: run node tools/build-look-data.ts`)
  }
  const len = dv.getUint32(8, true)
  const meta = JSON.parse(new TextDecoder().decode(bytes.subarray(12, 12 + len))) as Meta
  const arr: Record<string, Float32Array> = {}
  const u8: Record<string, Uint8Array> = {}
  let o = 12 + len
  // the arrays are 4-byte aligned: views, not copies, on a little-endian machine (every browser), else read one by one
  const le = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1
  for (const [k, n, t] of meta.arrays) {
    if (o + bytesOf(n, t) > buf.byteLength) throw new Error(`look data: array ${k} runs past the end`)
    if (t === 'u8') {
      u8[k] = new Uint8Array(buf, o, n)
      o += bytesOf(n, t)
      continue
    }
    if (le) arr[k] = new Float32Array(buf, o, n)
    else {
      const a = new Float32Array(n)
      for (let i = 0; i < n; i++) a[i] = dv.getFloat32(o + i * 4, true)
      arr[k] = a
    }
    o += n * 4
  }
  if (o !== buf.byteLength) throw new Error(`look data: ${buf.byteLength - o} bytes left over`)
  for (const k of ['hf', 'far']) if (!arr[k]) throw new Error(`look data: no ${k} array`)
  const river = { P: meta.river.P, n: meta.river.n } as RiverSamples
  for (const k of SAMPLE_KEYS) {
    if (!arr[k] || arr[k].length !== meta.river.n) throw new Error(`look data: river array ${k} missing or short`)
    river[k] = arr[k]
  }
  const grid = (g: (typeof SPAN_GRIDS)[number]): SpanGrid => {
    const m = meta[g]
    const spans = arr[g + 'Spans']
    const tex = u8[g + 'Tex']
    if (!m || !spans || !tex || spans.length % 3) throw new Error(`look data: no ${g} grid`)
    if (!Number.isInteger(m.ch) || m.ch < 1 || m.ch > 4) {
      throw new Error(`look data: the ${g} grid has ${m.ch} bytes a texel (1 to 4)`)
    }
    let covered = 0
    for (let i = 0; i < spans.length; i += 3) {
      const j = spans[i]
      const i0 = spans[i + 1]
      const len = spans[i + 2]
      if (
        !Number.isInteger(j) ||
        !Number.isInteger(i0) ||
        !Number.isInteger(len) ||
        j < 0 ||
        j >= m.n ||
        i0 < 0 ||
        len < 1 ||
        i0 + len > m.n
      ) {
        throw new Error(
          `look data: ${g} span ${i / 3} (row ${j}, from ${i0}, ${len} texels) is outside the ${m.n}² grid`,
        )
      }
      covered += len
    }
    if (tex.length !== covered * m.ch) {
      throw new Error(`look data: the ${g} grid holds ${tex.length / m.ch} texels, its spans cover ${covered}`)
    }
    return { ...m, spans, tex }
  }
  if (
    !meta.roads ||
    !arr.roadSegs ||
    !arr.roadIds ||
    arr.roadSegs.length % ROAD_SEG ||
    arr.roadIds.length !== meta.roads.n * meta.roads.n * ROAD_SLOTS
  ) {
    throw new Error('look data: no road grid, or a short one')
  }
  const roads: RoadGrid = { ...meta.roads, segs: arr.roadSegs, ids: arr.roadIds }
  if (!meta.cover || !u8.coverRuns) throw new Error('look data: no cover grid')
  const cover: CoverGrid = { ...meta.cover, tex: unpackCover(meta.cover.n, u8.coverRuns) }
  return {
    hf: { ...meta.hf, h: arr.hf },
    far: { ...meta.far, h: arr.far },
    river,
    bank: grid('bank'),
    water: grid('water'),
    roads,
    cover,
  }
}

// a span grid unpacked into n² texels of 4 bytes (RGBA, for a texture), the uncovered ones `fill` (RGBA)
export function unpackSpans(g: SpanGrid, fill: [number, number, number, number]): Uint8Array {
  const n = g.n
  const ch = g.ch
  const data = new Uint8Array(n * n * 4)
  new Uint32Array(data.buffer).fill((fill[0] | (fill[1] << 8) | (fill[2] << 16) | (fill[3] << 24)) >>> 0) // bytes in little-endian order: every browser
  let t = 0
  for (let s = 0; s < g.spans.length; s += 3) {
    const j = g.spans[s]
    const i0 = g.spans[s + 1]
    const len = g.spans[s + 2]
    for (let i = i0; i < i0 + len; i++, t++) {
      const o = (j * n + i) * 4
      for (let k = 0; k < ch; k++) data[o + k] = g.tex[t * ch + k]
    }
  }
  return data
}

// The data must be the one this spec describes: a stale file (an old build, a cached download) would otherwise be
// indexed with the new spec's sizes and draw a subtly wrong world.
export function checkLookData(d: Derived, look: LookData): void {
  const s = d.spec
  const bad: string[] = []
  const m = d.hfMargin
  const n = s.tileSub + 1 + 2 * m
  const fn = s.farSub + 1
  const x0 = (-m * s.tile) / s.tileSub - s.tile / 2
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-9
  if (look.hf.n !== n || !near(look.hf.cell, d.cell) || !near(look.hf.x0, x0) || !near(look.hf.z0, x0)) {
    bad.push(
      `heightfield ${look.hf.n} nodes of ${look.hf.cell} m from ${look.hf.x0}, the spec wants ${n} of ${d.cell} m from ${x0}`,
    )
  }
  if (look.hf.h.length !== n * n) bad.push(`heightfield has ${look.hf.h.length} heights, not ${n * n}`)
  if (
    look.far.n !== fn ||
    !near(look.far.cell, d.farCell) ||
    !near(look.far.x0, -s.far / 2) ||
    !near(look.far.z0, -s.far / 2)
  ) {
    bad.push(`far ring ${look.far.n} nodes of ${look.far.cell} m, the spec wants ${fn} of ${d.farCell} m`)
  }
  if (look.far.h.length !== fn * fn) bad.push(`far ring has ${look.far.h.length} heights, not ${fn * fn}`)
  for (const [name, g, gn, texel, ch] of [
    ['bank normals', look.bank, d.bankN, s.bank.texel, 3],
    ['water data', look.water, d.waterN, s.water.texel, 4],
  ] as const) {
    if (g.n !== gn || g.ch !== ch || !near(g.cell, texel) || !near(g.x0, -s.tile / 2) || !near(g.z0, -s.tile / 2)) {
      bad.push(
        `${name} ${g.n}² of ${g.cell} m (${g.ch} bytes) from ${g.x0}, the spec wants ${gn}² of ${texel} m (${ch} bytes) from ${-s.tile / 2}`,
      )
    }
  }
  if (
    look.roads.n !== d.roadN ||
    !near(look.roads.cell, s.road.cell) ||
    !near(look.roads.x0, -s.tile / 2) ||
    !near(look.roads.z0, -s.tile / 2)
  ) {
    bad.push(`road grid ${look.roads.n}² of ${look.roads.cell} m, the spec wants ${d.roadN}² of ${s.road.cell} m`)
  }
  if (
    !near(look.cover.cell, s.macro.cover) ||
    !near(look.cover.n * look.cover.cell, s.far) ||
    !near(look.cover.x0, -s.far / 2) ||
    !near(look.cover.z0, -s.far / 2)
  ) {
    bad.push(
      `cover ${look.cover.n}² of ${look.cover.cell} m from ${look.cover.x0}, the spec wants ${s.macro.cover} m cells over the far ring (${s.far} m) from ${-s.far / 2}`,
    )
  }
  if (bad.length) {
    throw new Error('look data does not match the world spec (run node tools/build-look-data.ts): ' + bad.join('; '))
  }
}
