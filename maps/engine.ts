// A map-engine map as a map definition for the sim data build (docs/plans/done/m2-sim.md, tools/build-sim-data.ts):
// the JSON map validated, expanded and applied into its 2 m layers (src/map/), each cell classified by the
// ruleset's ground reading (src/rulesets/napoleonic-ground.ts), over the map's play area (square). The sim's format
// 2 carries it as it is: heights at 2 m (the layers' nodes), cost at 8 m, classes and depth at 2 m.
// The fine grid has one node per cell, at the cell's centre (its origin a half-cell in from the play area's corner),
// so the class pattern is copied one for one (a barrier sealed in cells stays sealed in nodes) and the sim's
// rounding to the nearest node finds the cell that holds the point. The map's edge is then a cell's half inside the
// play area's.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { MapDef } from './formation-field.ts'
import type { Catalogue, MapFile } from '../src/map/schema.ts'
import { validate } from '../src/map/validate.ts'
import { expand } from '../src/map/expand.ts'
import type { Layers } from '../src/map/apply.ts'
import { apply, CELL, heightOf } from '../src/map/apply.ts'
import type { GroundCell, Classify } from '../src/rulesets/ground.ts'
import { napoleonic } from '../src/rulesets/napoleonic.ts'
import type { Ruleset } from '../src/sim/ruleset.ts'
import { classifyNapoleonic } from '../src/rulesets/napoleonic-ground.ts'
import { exp } from '../src/sim/num.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const COST_CELL = 4 * CELL   // decision 0021
const NOGO_DEPTH = 10               // m: a no-go cell's depth, past every wading limit

// the map's layers, or the validator's first problems as an error
export function layersOf(file: string, seed?: number): { map: MapFile; layers: Layers } {
  const cat = JSON.parse(fs.readFileSync(path.join(ROOT, 'maps/kinds.json'), 'utf8')) as Catalogue
  const raw = JSON.parse(fs.readFileSync(path.resolve(ROOT, file), 'utf8')) as Record<string, unknown>
  if (seed !== undefined && raw !== null && typeof raw === 'object' && !Array.isArray(raw)) raw.seed = seed   // another battlefield from the same intent (docs/plans/done/m3-generators.md); a file that is no map fails validation below
  const issues = validate(raw, cat)
  if (issues.length) throw new Error(`${file}: ${issues.slice(0, 5).map(i => `${i.id ?? ''} ${i.path}: ${i.message}`).join('; ')}`)
  const ex = expand(raw as unknown as MapFile, cat)
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
    go: !!L.zone[cell] && L.table[L.zone[cell] - 1].kind === 'zone.go',
  }
}

export function engineMap(name: string, file: string, rs: Ruleset = napoleonic, classify: Classify = classifyNapoleonic, seed?: number): MapDef {
  const { map, layers: L } = layersOf(file, seed)
  const { w, h } = map.play
  if (w !== h || !Number.isInteger(w / COST_CELL)) throw new Error(`${file}: the sim needs a square play area, a whole number of ${COST_CELL} m cost cells (got ${w} × ${h})`)
  // the play area's corner, in the layers' cells, per axis (the extent need not be square)
  const half = w / 2, n = w / CELL, ix = (-half - L.x0) / CELL, iz = (-half - L.z0) / CELL
  const classes = Object.keys(rs.terrain), T = rs.terrain, limit = rs.water.limit
  // one fine node per cell, at the cell's centre (the grid's origin is a half-cell in from the play area's corner),
  // so the sim's rounding to the nearest node lands in the cell that holds the point
  const cls = new Uint8Array(n * n), depth = new Float64Array(n * n)
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const gc = groundCell(L, (iz + j) * L.nx + ix + i), c = classify(gc), k = classes.indexOf(c)
    if (k < 0) throw new Error(`${file}: the ground reading gave "${c}", not a class of ${rs.name}`)
    cls[j * n + i] = k
    depth[j * n + i] = gc.nogo ? NOGO_DEPTH : c === 'bridge' || gc.go ? 0 : gc.water
  }
  const cellOf = (x: number, z: number) => Math.min(n - 1, Math.max(0, Math.floor((z + half) / CELL))) * n + Math.min(n - 1, Math.max(0, Math.floor((x + half) / CELL)))
  return {
    name, half,
    heightAt: (x, z) => heightOf(L, x, z),   // the sim samples the layers' nodes exactly
    groundAt: (x, z) => { const k = cellOf(x, z); return depth[k] > limit ? 0 : T[classes[cls[k]]].g.column },
    slopeFactor: rise => Math.min(1, rs.slopeK * exp(-3.5 * rise)),
    classes,
    fine: { cell: CELL, n, classAt: (i, j) => cls[j * n + i], depthAt: (i, j) => depth[j * n + i], origin: CELL / 2 },
    cells: { height: CELL, cost: COST_CELL },
  }
}
