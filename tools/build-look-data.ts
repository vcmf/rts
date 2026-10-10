// Builds the look world's data (decision 0012, docs/plans/active/l0-spine.md L0a): the heightfield over the tile
// plus its margin, the far ring's heights and the river's samples, from the authoring formulas in
// src/look/world/author.ts, once, in Node. The page reads the file and never evaluates the formulas.
//   node tools/build-look-data.ts           writes data/painted-world.lookdata
//   node tools/build-look-data.ts --check   rebuilds in memory and fails if it differs from the committed file
// Each node's x and z use the same expression as Babylon's CreateGround vertices, so the authored heights land on
// the mesh exactly.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { D } from '../src/look/spec.ts'
import { authorWorld } from '../src/look/world/author.ts'
import { encodeLook, type LookData } from '../src/look/world/data.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const LOOK_FILE = path.join(ROOT, 'data/painted-world.lookdata')

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
