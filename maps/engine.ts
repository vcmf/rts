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
import { compileMap } from '../src/map/compile.ts'
import { readMapFiles } from './map-files.ts'
import type { Layers } from '../src/map/apply.ts'
import { CELL, heightOf } from '../src/map/apply.ts'
import type { Classify } from '../src/rulesets/ground.ts'
import { groundCell, simDepth } from './cell.ts'
import { napoleonic } from '../src/rulesets/napoleonic.ts'
import type { Ruleset } from '../src/sim/ruleset.ts'
import { classifyNapoleonic } from '../src/rulesets/napoleonic-ground.ts'
import { exp } from '../src/sim/num.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const COST_CELL = 4 * CELL // decision 0021

// the map's layers, or the validator's first problems as an error
export function layersOf(file: string, seed?: number): { map: MapFile; layers: Layers } {
  const cat = JSON.parse(fs.readFileSync(path.join(ROOT, 'maps/kinds.json'), 'utf8')) as Catalogue
  const raw = JSON.parse(fs.readFileSync(path.resolve(ROOT, file), 'utf8')) as Record<string, unknown>
  // another battlefield from the same intent (docs/plans/done/m3-generators.md);
  // a file that is no map fails validation below
  if (seed !== undefined && raw !== null && typeof raw === 'object' && !Array.isArray(raw)) raw.seed = seed
  return compileMap(file, raw, cat, readMapFiles(path.resolve(ROOT, file), raw as unknown as MapFile))
}

export function engineMap(
  name: string,
  file: string,
  rs: Ruleset = napoleonic,
  classify: Classify = classifyNapoleonic,
  seed?: number,
): MapDef {
  const { map, layers: L } = layersOf(file, seed)
  const { w, h } = map.play
  if (w !== h || !Number.isInteger(w / COST_CELL)) {
    throw new Error(
      `${file}: the sim needs a square play area, a whole number of ${COST_CELL} m cost cells (got ${w} × ${h})`,
    )
  }
  // the play area's corner, in the layers' cells, per axis (the extent need not be square)
  const half = w / 2
  const n = w / CELL
  const ix = (-half - L.x0) / CELL
  const iz = (-half - L.z0) / CELL
  const classes = Object.keys(rs.terrain)
  const T = rs.terrain
  const limit = rs.water.limit
  // one fine node per cell, at the cell's centre (the grid's origin is a half-cell in from the play area's corner),
  // so the sim's rounding to the nearest node lands in the cell that holds the point
  const cls = new Uint8Array(n * n)
  const depth = new Float64Array(n * n)
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const gc = groundCell(L, (iz + j) * L.nx + ix + i)
      const c = classify(gc)
      const k = classes.indexOf(c)
      if (k < 0) throw new Error(`${file}: the ground reading gave "${c}", not a class of ${rs.name}`)
      cls[j * n + i] = k
      depth[j * n + i] = simDepth(gc, c)
    }
  }
  const cellOf = (x: number, z: number) =>
    Math.min(n - 1, Math.max(0, Math.floor((z + half) / CELL))) * n +
    Math.min(n - 1, Math.max(0, Math.floor((x + half) / CELL)))
  return {
    name,
    half,
    heightAt: (x, z) => heightOf(L, x, z), // the sim samples the layers' nodes exactly
    groundAt: (x, z) => {
      const k = cellOf(x, z)
      return depth[k] > limit ? 0 : T[classes[cls[k]]].g.column
    },
    slopeFactor: rise => Math.min(1, rs.slopeK * exp(-3.5 * rise)),
    classes,
    fine: { cell: CELL, n, classAt: (i, j) => cls[j * n + i], depthAt: (i, j) => depth[j * n + i], origin: CELL / 2 },
    cells: { height: CELL, cost: COST_CELL },
  }
}
