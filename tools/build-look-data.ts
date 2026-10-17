// Builds the look world's data (decision 0012, docs/plans/done/l0-spine.md L0a): the heightfield over the tile
// plus its margin, the far ring's heights, the river's samples, the fine bank normals, the water data and the cover, from the
// authoring formulas in src/look/world/author.ts, once, in Node. The page reads the file and never evaluates the formulas.
//   node tools/build-look-data.ts           writes data/painted-world.lookdata
//   node tools/build-look-data.ts --check   rebuilds in memory and fails if it differs from the committed file
// Each node's x and z use the same expression as Babylon's CreateGround vertices, so the authored heights land on
// the mesh exactly.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { D } from '../src/look/spec.ts'
import { authorWorld, authoredNormal } from '../src/look/world/author.ts'
import { encodeLook, type LookData, type SpanGrid } from '../src/look/world/data.ts'
import { bakeWater, packWater } from '../src/look/world/water-data.ts'
import { sstep } from '../src/look/noise.ts'
import { riverQuery } from '../src/look/river.ts'
import { authorCover, LINES } from '../src/look/world/cover.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const LOOK_FILE = path.join(ROOT, 'data/painted-world.lookdata')

// The fine bank normals (docs/plans/done/w2-river-banks.md): the authored surface's normal by central differences
// at each texel's centre, over the river's corridor only (out to bank.reach m from its centre line, the weight fading
// to 0 over the last bank.fade m, and over the last bank.edge m before the tile's edge, so the tile's banks meet the
// apron's vertex normals without a seam), stored as row spans
function bankNormals(H: (x: number, z: number) => number): SpanGrid {
  const b = D.spec.bank, n = D.bankN, cell = b.texel, x0 = -D.spec.tile / 2, z0 = x0, e = cell / 2
  const spans: number[] = [], tex: number[] = [], enc = (v: number) => Math.round((Math.max(-1, Math.min(1, v)) * 0.5 + 0.5) * 255)
  for (let j = 0; j < n; j++) {
    let open = -1
    for (let i = 0; i <= n; i++) {
      const x = x0 + (i + 0.5) * cell, z = z0 + (j + 0.5) * cell, q = i < n ? riverQuery(x, z) : null, inside = !!q && q.dist < b.reach
      if (inside && open < 0) open = i
      if (!inside && open >= 0) { spans.push(j, open, i - open); open = -1 }
      if (!inside) continue
      const [nx, , nz] = authoredNormal(H, x, z, e)
      const edge = 1 - sstep(D.spec.tile / 2 - b.edge, D.spec.tile / 2, Math.max(Math.abs(x), Math.abs(z)))
      tex.push(enc(nx), enc(nz), Math.round(255 * (1 - sstep(b.reach - b.fade, b.reach, q!.dist)) * edge))
    }
  }
  return { n, cell, x0, z0, ch: 3, spans: Float32Array.from(spans), tex: Uint8Array.from(tex) }
}

// The road frame (docs/plans/active/roads.md): near each road or track (out to road.edge m past its side), four
// floats (bytes of float32, ch 16): the signed distance across the nearest line (past a dead end, the distance to its
// end: a round cap), the distance along it (from its start, plus 10 km a line, so lines differ), its half width, and a
// junction weight (1 where another line's side is within a metre, fading out over JUNCTION_M), from the nearest line.
// Each segment rasterised over its own strip of texels, its ends rounded (the nearest segment wins: a bend's outside
// is its shared point's). Over the tile, as row spans
const JUNCTION_M = 6
function roadFrame(): SpanGrid {
  const r = D.spec.road, n = D.roadN, cell = r.texel, x0 = -D.spec.tile / 2, z0 = x0
  const best = new Float32Array(n * n).fill(Infinity), other = new Float32Array(n * n).fill(Infinity), line = new Int16Array(n * n).fill(-1), val = new Float32Array(n * n * 3)
  LINES.forEach((l, li) => {
    let along = li * 10000
    for (let k = 0; k < l.pts.length - 1; k++) {
      const a = l.pts[k], b = l.pts[k + 1], sx = b[0] - a[0], sz = b[1] - a[1], len = Math.hypot(sx, sz), ux = sx / len, uz = sz / len, reach = l.w / 2 + r.edge + JUNCTION_M
      const i0 = Math.max(0, Math.floor((Math.min(a[0], b[0]) - reach - x0) / cell)), i1 = Math.min(n - 1, Math.ceil((Math.max(a[0], b[0]) + reach - x0) / cell))
      const j0 = Math.max(0, Math.floor((Math.min(a[1], b[1]) - reach - z0) / cell)), j1 = Math.min(n - 1, Math.ceil((Math.max(a[1], b[1]) + reach - z0) / cell))
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = x0 + (i + 0.5) * cell, z = z0 + (j + 0.5) * cell, t0 = (x - a[0]) * ux + (z - a[1]) * uz
        const t = Math.max(0, Math.min(len, t0)), px = a[0] + ux * t, pz = a[1] + uz * t, d = Math.hypot(x - px, z - pz), score = d - l.w / 2, o = j * n + i
        if (line[o] !== li && line[o] >= 0) { if (score < best[o]) other[o] = Math.min(other[o], best[o]); else { other[o] = Math.min(other[o], score); continue } }
        if (score >= best[o]) continue
        const side = (x - a[0]) * -uz + (z - a[1]) * ux
        best[o] = score; line[o] = li; val[o * 3] = side < 0 ? -d : d; val[o * 3 + 1] = along + t; val[o * 3 + 2] = l.w / 2
      }
      along += len
    }
  })
  const spans: number[] = [], f32: number[] = []
  for (let j = 0; j < n; j++) {
    let open = -1
    for (let i = 0; i <= n; i++) {
      const o = j * n + i, inside = i < n && best[o] <= r.edge
      if (inside && open < 0) open = i
      if (!inside && open >= 0) { spans.push(j, open, i - open); open = -1 }
      if (!inside) continue
      const jn = 1 - sstep(1, JUNCTION_M, other[o])
      f32.push(val[o * 3], val[o * 3 + 1], val[o * 3 + 2], jn)
    }
  }
  return { n, cell, x0, z0, ch: 16, spans: Float32Array.from(spans), tex: new Uint8Array(Float32Array.from(f32).buffer) }
}

export function buildLookData(): Uint8Array {
  const s = D.spec, w = authorWorld()
  // the heightfield: tile nodes col 0..tileSub, plus hfMargin nodes beyond each side
  const m = D.hfMargin, n = s.tileSub + 1 + 2 * m, h = new Float32Array(n * n)
  // CreateGround's vertex x (and z, by symmetry), rounded to float32 as the mesh stores it: the prototype evaluated
  // its formula at the stored positions
  const tx = (col: number) => Math.fround((col * s.tile) / s.tileSub - s.tile / 2)
  let min = Infinity, max = -Infinity
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const v = w.H(tx(i - m), tx(j - m)); h[j * n + i] = v; if (v < min) min = v; if (v > max) max = v }
  // the far ring's nodes: valley trough only (its river is a painted line)
  const fn = s.farSub + 1, fh = new Float32Array(fn * fn), fx = (col: number) => Math.fround((col * s.far) / s.farSub - s.far / 2)
  for (let j = 0; j < fn; j++) for (let i = 0; i < fn; i++) fh[j * fn + i] = w.farH(fx(i), fx(j))
  const data: LookData = {
    hf: { n, cell: s.tile / s.tileSub, x0: (-m * s.tile) / s.tileSub - s.tile / 2, z0: (-m * s.tile) / s.tileSub - s.tile / 2, h, min, max },
    far: { n: fn, cell: s.far / s.farSub, x0: -s.far / 2, z0: -s.far / 2, h: fh },
    river: w.samples,
    bank: bankNormals(w.H),
    road: roadFrame(),
    water: packWater(bakeWater(w.H)),
    cover: authorCover(s.far, s.macro.cover),
  }
  return encodeLook(data)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const t0 = performance.now(), bytes = buildLookData(), ms = performance.now() - t0
  if (process.argv.includes('--check')) {
    const old = fs.existsSync(LOOK_FILE) ? fs.readFileSync(LOOK_FILE) : null
    const same = !!old && Buffer.compare(old, Buffer.from(bytes)) === 0
    console.log(`look data: ${bytes.length} bytes built in ${ms.toFixed(0)} ms; ${same ? 'matches' : 'DIFFERS FROM'} ${path.relative(ROOT, LOOK_FILE)}`)
    process.exit(same ? 0 : 1)
  }
  fs.mkdirSync(path.dirname(LOOK_FILE), { recursive: true }); fs.writeFileSync(LOOK_FILE, bytes)
  console.log(`look data: wrote ${path.relative(ROOT, LOOK_FILE)}, ${bytes.length} bytes, built in ${ms.toFixed(0)} ms`)
}
