// Builds the simulation's input data (docs/proposals/sim-design.md §2, decision 0012) from a map
// definition, once, in Node: the sim heightfield (1.79 m nodes) and the cost grid (7.16 m cells), as one
// little-endian file in data/, with the 1 m terrain class and water depth grids (format 2). Its FNV-1a
// hash is the data version the sim asserts on load.
//   node tools/build-sim-data.ts           writes data/<map>.simdata for every map and prints their versions
//   node tools/build-sim-data.ts --check   rebuilds them in memory and fails if one differs from data/
// The output depends on this Node's Math functions; the committed file is the authority (§2), so a
// different Node that builds different bytes is reported, not silently used.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { formationField, type MapDef } from '../maps/formation-field.ts'
import { battlefield } from '../maps/battlefield.ts'
import { bench } from '../maps/bench.ts'
import { fnv1a } from '../src/sim/hash.ts'
import { DATA_MAGIC, DATA_FORMAT, hex } from '../src/sim/data.ts'

// decision 0012; sim-design §7
export const HEIGHT_CELL = 1.79
export const COST_CELL = 4 * HEIGHT_CELL
const SUB = 8 // ground samples per cost cell side

export function buildSimData(map: MapDef): Uint8Array {
  const span = 2 * map.half
  const x0 = -map.half
  const z0 = -map.half
  const hn = Math.floor(span / HEIGHT_CELL) + 1
  const heights = new Float64Array(hn * hn)
  for (let j = 0; j < hn; j++) {
    for (let i = 0; i < hn; i++) heights[j * hn + i] = map.heightAt(x0 + i * HEIGHT_CELL, z0 + j * HEIGHT_CELL)
  }
  // cost: per cell, the harmonic mean of the passable ground samples if at least half are passable
  // (else impassable), times the slope factor of the steepest node-to-node rise in the cell
  const cn = Math.floor(span / COST_CELL)
  const cost = new Uint8Array(cn * cn)
  const hAt = (i: number, j: number) => heights[Math.min(hn - 1, j) * hn + Math.min(hn - 1, i)]
  for (let cj = 0; cj < cn; cj++) {
    for (let ci = 0; ci < cn; ci++) {
      let inv = 0
      let pass = 0
      for (let b = 0; b < SUB; b++) {
        for (let a = 0; a < SUB; a++) {
          const g = map.groundAt(x0 + (ci + (a + 0.5) / SUB) * COST_CELL, z0 + (cj + (b + 0.5) / SUB) * COST_CELL)
          if (g > 0) {
            inv += 1 / g
            pass++
          }
        }
      }
      let rise = 0
      for (let j = cj * 4; j < cj * 4 + 4; j++) {
        for (let i = ci * 4; i < ci * 4 + 4; i++) {
          rise = Math.max(
            rise,
            Math.abs(hAt(i + 1, j) - hAt(i, j)) / HEIGHT_CELL,
            Math.abs(hAt(i, j + 1) - hAt(i, j)) / HEIGHT_CELL,
          )
        }
      }
      const g = pass * 2 >= SUB * SUB ? (pass / inv) * map.slopeFactor(rise) : 0
      cost[cj * cn + ci] = Math.max(0, Math.min(255, Math.round(g * 255)))
    }
  }
  const fn = map.fine.n
  const classBytes = map.classes.reduce((a, c) => a + 4 + c.length, 4)
  const size =
    8 + (8 + 8 + 16) + heights.length * 8 + (8 + 8 + 16) + cost.length + classBytes + (8 + 8 + 16) + fn * fn * 3
  const buf = new Uint8Array(size)
  const v = new DataView(buf.buffer)
  let o = 0
  const u32 = (n: number) => {
    v.setUint32(o, n, true)
    o += 4
  }
  const f64 = (n: number) => {
    v.setFloat64(o, n, true)
    o += 8
  }
  u32(DATA_MAGIC)
  u32(DATA_FORMAT)
  f64(HEIGHT_CELL)
  u32(hn)
  u32(hn)
  f64(x0)
  f64(z0)
  for (let k = 0; k < heights.length; k++) f64(heights[k])
  f64(COST_CELL)
  u32(cn)
  u32(cn)
  f64(x0)
  f64(z0)
  buf.set(cost, o)
  o += cost.length
  // the 1 m grid: class index per node, water depth in mm
  u32(map.classes.length)
  for (const c of map.classes) {
    u32(c.length)
    for (let q = 0; q < c.length; q++) v.setUint8(o++, c.charCodeAt(q))
  }
  f64(map.fine.cell)
  u32(fn)
  u32(fn)
  f64(x0)
  f64(z0)
  for (let j = 0; j < fn; j++) for (let i = 0; i < fn; i++) v.setUint8(o++, map.fine.classAt(i, j))
  for (let j = 0; j < fn; j++) {
    for (let i = 0; i < fn; i++) {
      v.setUint16(o, Math.min(65535, Math.round(map.fine.depthAt(i, j) * 1000)), true)
      o += 2
    }
  }
  if (o !== size) throw new Error('size mismatch')
  return buf
}

export const dataFile = (name: string): string =>
  path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', name + '.simdata')

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let ok = true
  for (const map of [await formationField(), battlefield(), bench()]) {
    const bytes = buildSimData(map)
    const file = dataFile(map.name)
    if (process.argv.includes('--check')) {
      const old = fs.existsSync(file) ? fs.readFileSync(file) : Buffer.alloc(0)
      const same = Buffer.compare(Buffer.from(bytes), old) === 0
      console.log(
        `${map.name}: built ${hex(fnv1a(bytes))}, committed ${hex(fnv1a(new Uint8Array(old)))}${same ? ' (same)' : ' (DIFFERENT)'}`,
      )
      ok &&= same
      continue
    }
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, bytes)
    console.log(
      `${map.name}: ${bytes.length} bytes, data version ${hex(fnv1a(bytes))} → ${path.relative(process.cwd(), file)}`,
    )
  }
  process.exit(ok ? 0 : 1)
}
