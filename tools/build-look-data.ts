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
import { D, ROAD_SLOTS } from '../src/look/spec.ts'
import { authorWorld, authoredNormal } from '../src/look/world/author.ts'
import { encodeLook, ROAD_SEG, type LookData, type RoadGrid, type SpanGrid } from '../src/look/world/data.ts'
import { bakeWater, packWater } from '../src/look/world/water-data.ts'
import { sstep } from '../src/look/noise.ts'
import { riverQuery } from '../src/look/river.ts'
import { authorCover, COVER, LINES, segD } from '../src/look/world/cover.ts'

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

type Pt = readonly [number, number]

// The roads (docs/plans/active/roads.md): every segment of every line, and a grid over the tile listing, per cell, the
// segments that reach within their half width and SPEC.road.reach m of it (the shader finds the nearest exactly, with no
// filtering: no ghost where two lines or two sides meet). Throws if a cell needs more than ROAD_SLOTS
export function roadGrid(): RoadGrid {
  const g = D.spec.road, n = D.roadN, cell = g.cell, x0 = -D.spec.tile / 2, z0 = x0, segs: number[] = []
  // the mitre tangents (the mean of the two segments' directions at a bend, the segment's own at a free end): the shader
  // reads the distance along between them, so it is continuous round a bend (no step at the bisector)
  LINES.forEach((l, li) => {
    const p = l.pts, last = p.length - 2, dir = (k: number): Pt => { const dx = p[k + 1][0] - p[k][0], dz = p[k + 1][1] - p[k][1], m = Math.hypot(dx, dz); return [dx / m, dz / m] }
    const mitre = (u: Pt, v: Pt): Pt => { const m = Math.hypot(u[0] + v[0], u[1] + v[1]); return [(u[0] + v[0]) / m, (u[1] + v[1]) / m] }
    let along = 0
    for (let k = 0; k <= last; k++) {
      const a = p[k], b = p[k + 1], u = dir(k), m0 = k > 0 ? mitre(dir(k - 1), u) : u, m1 = k < last ? mitre(u, dir(k + 1)) : u
      segs.push(a[0], a[1], b[0], b[1], along, l.w / 2, li, (k === 0 ? 1 : 0) + (k === last ? 2 : 0) + (l.cls === COVER.track ? 4 : 0), m0[0], m0[1], m1[0], m1[1]); along += Math.hypot(b[0] - a[0], b[1] - a[1])
    }
  })
  const ids = new Float32Array(n * n * ROAD_SLOTS).fill(-1), used = new Uint8Array(n * n)
  for (let s = 0; s < segs.length / ROAD_SEG; s++) {
    const [ax, az, bx, bz, , hw] = segs.slice(s * ROAD_SEG, s * ROAD_SEG + 6), r = hw + g.reach + cell * 0.71
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - r - x0) / cell)), i1 = Math.min(n - 1, Math.floor((Math.max(ax, bx) + r - x0) / cell))
    const j0 = Math.max(0, Math.floor((Math.min(az, bz) - r - z0) / cell)), j1 = Math.min(n - 1, Math.floor((Math.max(az, bz) + r - z0) / cell))
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const cx = x0 + (i + 0.5) * cell, cz = z0 + (j + 0.5) * cell
      if (segD(cx, cz, [ax, az], [bx, bz]) > r) continue
      const o = j * n + i
      if (used[o] >= ROAD_SLOTS) throw new Error(`roads: the cell at ${cx}, ${cz} needs more than ${ROAD_SLOTS} segments (raise ROAD_SLOTS, or shrink the cell)`)
      ids[o * ROAD_SLOTS + used[o]++] = s
    }
  }
  // only the segments a cell lists (the lines run far past the tile), renumbered
  const keep = [...new Set(Array.from(ids).filter(v => v >= 0))].sort((a, b) => a - b), map = new Map(keep.map((v, k) => [v, k]))
  for (let k = 0; k < ids.length; k++) if (ids[k] >= 0) ids[k] = map.get(ids[k])!
  const out = new Float32Array(keep.length * ROAD_SEG); keep.forEach((v, k) => out.set(segs.slice(v * ROAD_SEG, (v + 1) * ROAD_SEG), k * ROAD_SEG))
  if (keep.length * ROAD_SEG / 4 > D.spec.minSpec.maxTexture) throw new Error(`roads: ${keep.length} segments on the tile, over the min-spec's ${D.spec.minSpec.maxTexture * 4 / ROAD_SEG}`)
  return { segs: out, n, cell, x0, z0, ids }
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
    roads: roadGrid(),
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
