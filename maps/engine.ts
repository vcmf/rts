// A map-engine map as a map definition for the sim data build (docs/plans/active/m2-sim.md, tools/build-sim-data.ts):
// the JSON map validated, expanded and applied into its 2 m layers (src/map/), each cell classified by the
// ruleset's ground reading (src/rulesets/napoleonic-ground.ts), over the map's play area (square). The sim's format
// 2 carries it as it is: heights at 2 m (the layers' nodes), cost at 8 m, classes and depth at 2 m.
// The fine grid's node (i, j) takes the cell (i, j), the cell north-east of it, so the class pattern is copied one for
// one (a barrier sealed in cells stays sealed in nodes); the last row and column repeat their neighbours.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { MapDef } from './formation-field.ts'
import type { Catalogue, MapFile } from '../src/map/schema.ts'
import { validate } from '../src/map/validate.ts'
import { expand } from '../src/map/expand.ts'
import type { Layers } from '../src/map/apply.ts'
import { apply, CELL } from '../src/map/apply.ts'
import type { GroundCell, Classify } from '../src/rulesets/ground.ts'
import { napoleonic } from '../src/rulesets/napoleonic.ts'
import { classifyNapoleonic } from '../src/rulesets/napoleonic-ground.ts'
import { exp } from '../src/sim/num.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const COST_CELL = 4 * CELL   // decision 0021
const NOGO_DEPTH = 10               // m: a no-go cell's depth, past every wading limit

// the map's layers, or the validator's first problems as an error
export function layersOf(file: string): { map: MapFile; layers: Layers } {
  const cat = JSON.parse(fs.readFileSync(path.join(ROOT, 'maps/kinds.json'), 'utf8')) as Catalogue
  const raw: unknown = JSON.parse(fs.readFileSync(path.resolve(ROOT, file), 'utf8'))
  const issues = validate(raw, cat)
  if (issues.length) throw new Error(`${file}: ${issues.slice(0, 5).map(i => `${i.id ?? ''} ${i.path}: ${i.message}`).join('; ')}`)
  const ex = expand(raw as MapFile)
  if (ex.issues.length) throw new Error(`${file}: ${ex.issues[0].message}`)
  return { map: ex.map, layers: apply(ex.map, cat) }
}

// one cell's attributes, from its layers
export function groundCell(L: Layers, cell: number): GroundCell {
  const T = (k: number) => (k ? L.table[k - 1].attrs : undefined)
  const g = T(L.ground[cell]), v = T(L.veg[cell]), w = T(L.way[cell]), b = T(L.barrier[cell]), bu = L.built[cell] ? L.table[L.built[cell] - 1] : undefined
  const n = (x: unknown) => (typeof x === 'number' ? x : undefined), s = (x: unknown) => (typeof x === 'string' ? x : undefined)
  return {
    ground: g && { material: s(g.material), moisture: n(g.moisture), stones: n(g.stones), wear: n(g.wear) },
    veg: v && { growth: s(v.growth), density: L.density[cell] / 255, height: n(v.height), stage: s(v.stage), undergrowth: n(v.undergrowth) },
    water: L.depth[cell] / 1000,
    way: w && { surface: s(w.surface), cut: n(w.cut) },
    barrier: b && { crossing: s(b.crossing), height: n(b.height), porosity: n(b.porosity) },
    built: bu && { bridge: bu.kind.split('.')[1] === 'bridge', building: bu.attrs.wall !== undefined || bu.attrs.roof !== undefined },
    nogo: !!L.zone[cell] && L.table[L.zone[cell] - 1].kind === 'zone.nogo',
  }
}

export function engineMap(name: string, file: string, classify: Classify = classifyNapoleonic): MapDef {
  const { map, layers: L } = layersOf(file)
  const { w, h } = map.play
  if (w !== h || !Number.isInteger(w / COST_CELL)) throw new Error(`${file}: the sim needs a square play area, a whole number of ${COST_CELL} m cost cells (got ${w} × ${h})`)
  const half = w / 2, n = w / CELL + 1, ci = (half + L.x0) / -CELL   // the play area's corner, in the layers' cells
  const classes = Object.keys(napoleonic.terrain), T = napoleonic.terrain, limit = napoleonic.water.limit
  // classes and depths per fine node, once
  const cls = new Uint8Array(n * n), depth = new Float64Array(n * n)
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const cell = (ci + Math.min(j, n - 2)) * L.nx + ci + Math.min(i, n - 2), gc = groundCell(L, cell), c = classify(gc), k = classes.indexOf(c)
    if (k < 0) throw new Error(`${file}: the ruleset's ground reading gave "${c}", not a class of ${napoleonic.name}`)
    cls[j * n + i] = k
    depth[j * n + i] = gc.nogo ? NOGO_DEPTH : c === 'bridge' || c === 'road' && gc.water === 0 ? 0 : gc.water
  }
  const node = (x: number, z: number) => [Math.min(n - 1, Math.max(0, Math.floor((x + half) / CELL))), Math.min(n - 1, Math.max(0, Math.floor((z + half) / CELL)))]
  const W = L.nx + 1
  return {
    name, half,
    // the layers' heights at their nodes (the sim samples exactly there); between nodes, bilinear
    heightAt: (x, z) => {
      const u = (x - L.x0) / CELL, v = (z - L.z0) / CELL, i = Math.min(L.nx - 1, Math.floor(u)), j = Math.min(L.nz - 1, Math.floor(v)), fu = u - i, fv = v - j
      return (L.height[j * W + i] * (1 - fu) + L.height[j * W + i + 1] * fu) * (1 - fv) + (L.height[(j + 1) * W + i] * (1 - fu) + L.height[(j + 1) * W + i + 1] * fu) * fv
    },
    groundAt: (x, z) => { const [i, j] = node(x, z), k = j * n + i; return depth[k] > limit ? 0 : T[classes[cls[k]]].g.column },
    slopeFactor: rise => Math.min(1, napoleonic.slopeK * exp(-3.5 * rise)),
    classes,
    fine: { cell: CELL, n, classAt: (i, j) => cls[j * n + i], depthAt: (i, j) => depth[j * n + i] },
    cells: { height: CELL, cost: COST_CELL },
  }
}
