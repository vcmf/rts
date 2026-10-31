// Builds the look world's data (decision 0012, docs/plans/done/l0-spine.md L0a): the heightfield over the
// tile plus its margin, the far ring's heights, the river's samples, the fine bank normals, the water data
// and the cover, from the authoring formulas in src/look/world/author.ts, once, in Node. The page reads the
// file and never evaluates the formulas.
// A map's window (docs/plans/active/look-austerlitz-a1.md) is compiled from the map's layers instead
// (src/look/world/from-map.ts), into data/<map>-<window>.lookdata: built, not committed (G3a, the owner's choice: about
// 12 MB each; Vitest builds a missing one, test/look-data-setup.ts).
//   node tools/build-look-data.ts                   writes the demo's and every window's (src/look/world/windows.ts)
//   node tools/build-look-data.ts --window <name>   writes that window's alone
//   node tools/build-look-data.ts --window <name> --tileat <x>,<z>   that window's with its tile there (G3b-1)
//   node tools/build-look-data.ts --missing         writes each window's that is missing or older than its sources
//   node tools/build-look-data.ts --check           rebuilds the demo's in memory and fails if it differs from the
//                                                   committed file (the windows' are not committed)
// Each node's x and z use the same expression as Babylon's CreateGround vertices, so the authored heights land on
// the mesh exactly.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { D } from '../src/look/spec.ts'
import { authorWorld, authoredNormal } from '../src/look/world/author.ts'
import {
  decodeLook,
  encodeLook,
  type LightGrid,
  type LookData,
  type SpanGrid,
  type TileAt,
} from '../src/look/world/data.ts'
import { bakeWater, packWater } from '../src/look/world/water-data.ts'
import { sstep } from '../src/look/noise.ts'
import { riverQuery } from '../src/look/river.ts'
import { authorCover } from '../src/look/world/cover.ts'
import { layersOf } from '../maps/engine.ts'
import { WINDOWS, mapFile, windowFile } from '../src/look/world/windows.ts'
// the window builder (the page's tile worker runs it too: src/look/tile-worker.ts)
import { buildWindowData, coarseLight, roadGrid } from '../src/look/world/window-build.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const LOOK_FILE = path.join(ROOT, 'data/painted-world.lookdata')

// The fine bank normals (docs/plans/done/w2-river-banks.md): the authored surface's normal by central differences
// at each texel's centre, over the river's corridor only (out to bank.reach m from its centre line, the weight fading
// to 0 over the last bank.fade m, and over the last bank.edge m before the tile's edge, so the tile's banks meet the
// apron's vertex normals without a seam), stored as row spans
function bankNormals(H: (x: number, z: number) => number): SpanGrid {
  const b = D.spec.bank
  const n = D.bankN
  const cell = b.texel
  const x0 = -D.spec.tile / 2
  const z0 = x0
  const e = cell / 2
  const spans: number[] = []
  const tex: number[] = []
  const enc = (v: number) => Math.round((Math.max(-1, Math.min(1, v)) * 0.5 + 0.5) * 255)
  for (let j = 0; j < n; j++) {
    let open = -1
    for (let i = 0; i <= n; i++) {
      const x = x0 + (i + 0.5) * cell
      const z = z0 + (j + 0.5) * cell
      const q = i < n ? riverQuery(x, z) : null
      const inside = !!q && q.dist < b.reach
      if (inside && open < 0) open = i
      if (!inside && open >= 0) {
        spans.push(j, open, i - open)
        open = -1
      }
      if (!inside) continue
      const [nx, , nz] = authoredNormal(H, x, z, e)
      const edge = 1 - sstep(D.spec.tile / 2 - b.edge, D.spec.tile / 2, Math.max(Math.abs(x), Math.abs(z)))
      tex.push(enc(nx), enc(nz), Math.round(255 * (1 - sstep(b.reach - b.fade, b.reach, q!.dist)) * edge))
    }
  }
  return { n, cell, x0, z0, ch: 3, spans: Float32Array.from(spans), tex: Uint8Array.from(tex) }
}

export function buildLookData(): Uint8Array {
  const s = D.spec
  const w = authorWorld()
  // the heightfield: tile nodes col 0..tileSub, plus hfMargin nodes beyond each side
  const m = D.hfMargin
  const n = s.tileSub + 1 + 2 * m
  const h = new Float32Array(n * n)
  // CreateGround's vertex x (and z, by symmetry), rounded to float32 as the mesh stores it: the prototype evaluated
  // its formula at the stored positions
  const tx = (col: number) => Math.fround((col * s.tile) / s.tileSub - s.tile / 2)
  let min = Infinity
  let max = -Infinity
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const v = w.H(tx(i - m), tx(j - m))
      h[j * n + i] = v
      if (v < min) min = v
      if (v > max) max = v
    }
  }
  // the far ring's nodes: valley trough only (its river is a painted line)
  const fn = s.farSub + 1
  const fh = new Float32Array(fn * fn)
  const fx = (col: number) => Math.fround((col * s.far) / s.farSub - s.far / 2)
  for (let j = 0; j < fn; j++) for (let i = 0; i < fn; i++) fh[j * fn + i] = w.farH(fx(i), fx(j))
  const data: LookData = {
    hf: {
      n,
      cell: s.tile / s.tileSub,
      x0: (-m * s.tile) / s.tileSub - s.tile / 2,
      z0: (-m * s.tile) / s.tileSub - s.tile / 2,
      h,
      min,
      max,
    },
    far: { n: fn, cell: s.far / s.farSub, x0: -s.far / 2, z0: -s.far / 2, h: fh },
    river: w.samples,
    bank: bankNormals(w.H),
    roads: roadGrid(),
    water: packWater(bakeWater(w.H)),
    cover: authorCover(s.far, s.macro.cover),
    world: { kind: 'demo' },
    trees: new Float32Array(0),
    farCover: null,
    light: null,
    tileAt: [0, 0],
    buildings: new Float32Array(0),
  }
  return encodeLook(data)
}

/** Every look data file this run builds: the demo's (unless one window is asked for) and the windows' (none with
 *  `demoOnly`). */
function* builds(only: string | null, demoOnly = false): Generator<{ file: string; build: () => Uint8Array }> {
  if (only === null) yield { file: LOOK_FILE, build: buildLookData }
  if (demoOnly) return
  const wins = WINDOWS.filter(w => only === null || w.name === only)
  if (only !== null && !wins.length) throw new Error(`--window ${only}: no such window (src/look/world/windows.ts)`)
  // each map compiled once, for all its windows
  const maps = new Map<string, ReturnType<typeof layersOf> & { light: LightGrid }>()
  for (const w of wins) {
    yield {
      file: path.join(ROOT, windowFile(w)),
      build: () => {
        if (!maps.has(w.map)) {
          const m = timed(`map ${w.map} compiled`, () => layersOf(mapFile(w)))
          maps.set(w.map, { ...m, light: timed(`map ${w.map} lit`, () => coarseLight(m.layers)) })
        }
        const { map, layers, light } = maps.get(w.map)!
        return buildWindowData(w, map, layers, light)
      },
    }
  }
}

// what a window's look data is built from: a file older than any of them (or than its map) is rebuilt
const WINDOW_SOURCES = [
  'tools/build-look-data.ts',
  'src/look/world',
  'src/look/river.ts',
  'src/look/heightfield.ts',
  'src/look/spec.ts',
  'src/render/lit/bake.ts',
  'src/map',
  'maps/engine.ts',
  'maps/kinds.json',
]

/** The newest modification time under a path, ms (a directory's files, recursively). */
function newest(p: string): number {
  const st = fs.statSync(p)
  if (!st.isDirectory()) return st.mtimeMs
  return Math.max(st.mtimeMs, ...fs.readdirSync(p).map(f => newest(path.join(p, f))))
}

/**
 * Writes each window's look data that is missing, older than its map or what builds it (WINDOW_SOURCES: by the files'
 * times, so a checkout that touches them rebuilds), or unreadable (another LOOK_VERSION, a file cut short); returns
 * the files written. The tests' global setup (test/look-data-setup.ts) and `npm run build` (`--missing`): the windows'
 * data is built, not committed.
 */
export function buildMissingWindows(): string[] {
  const out: string[] = []
  const sources = Math.max(...WINDOW_SOURCES.map(p => newest(path.join(ROOT, p))))
  for (const w of WINDOWS) {
    const file = path.join(ROOT, windowFile(w))
    if (fs.existsSync(file) && fs.statSync(file).mtimeMs > Math.max(sources, newest(path.join(ROOT, mapFile(w))))) {
      try {
        const b = fs.readFileSync(file)
        decodeLook(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer)
        continue
      } catch {
        // (unreadable: rebuilt below)
      }
    }
    out.push(path.relative(ROOT, file))
  }
  for (const { file, build } of builds(null)) {
    if (!out.includes(path.relative(ROOT, file))) continue
    // (written whole, then moved: a build cut short leaves no partial file)
    fs.writeFileSync(file + '.part', build())
    fs.renameSync(file + '.part', file)
  }
  return out
}

/** f's result, its time and the process's resident memory printed after `what`. */
function timed<T>(what: string, f: () => T): T {
  const t0 = performance.now()
  const v = f()
  const rss = process.memoryUsage().rss / 2 ** 20
  console.log(`${what} in ${(performance.now() - t0).toFixed(0)} ms (${rss.toFixed(0)} MiB resident)`)
  return v
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const check = args.includes('--check')
  if (args.includes('--missing')) {
    const built = buildMissingWindows()
    console.log(`look data: ${built.length ? `built ${built.join(', ')}` : "every window's is up to date"}`)
    process.exit(0)
  }
  // --tileat x,z: one window's data with its tile at that centre (G3b-1's check: as the window built there)
  const ta = args.indexOf('--tileat')
  if (ta >= 0) {
    const w = WINDOWS.find(v => v.name === args[args.indexOf('--window') + 1])
    const at = (args[ta + 1] ?? '').split(',').map(Number) as unknown as TileAt
    if (!w || at.length !== 2) throw new Error('--tileat x,z needs --window <name>')
    const { map, layers } = layersOf(mapFile(w))
    const file = path.join(ROOT, windowFile(w, at))
    // (written whole, then moved, as buildMissingWindows; a check's file: rebuilt only by asking again)
    fs.writeFileSync(file + '.part', buildWindowData(w, map, layers, coarseLight(layers), at))
    fs.renameSync(file + '.part', file)
    console.log(`look data: wrote ${path.relative(ROOT, file)}`)
    process.exit(0)
  }
  const wi = args.indexOf('--window')
  const only = wi >= 0 ? (args[wi + 1] ?? null) : null
  if (wi >= 0 && only === null) throw new Error('--window takes a window name')
  let bad = 0
  for (const { file, build } of builds(only, check && only === null)) {
    const rel = path.relative(ROOT, file)
    const t0 = performance.now()
    const bytes = build()
    const ms = performance.now() - t0
    if (check) {
      const old = fs.existsSync(file) ? fs.readFileSync(file) : null
      const same = !!old && Buffer.compare(old, Buffer.from(bytes)) === 0
      console.log(
        `look data: ${bytes.length} bytes built in ${ms.toFixed(0)} ms; ${same ? 'matches' : 'DIFFERS FROM'} ${rel}`,
      )
      if (!same) bad++
      continue
    }
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, bytes)
    console.log(`look data: wrote ${rel}, ${bytes.length} bytes, built in ${ms.toFixed(0)} ms`)
  }
  process.exit(bad ? 1 : 0)
}
