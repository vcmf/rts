// The look page's world (the painted demo tile, src/look/world/author.ts) as a map for the sim data build
// (tools/build-sim-data.ts), so the sim can drive the look page's armies (docs/plans/active/battle-threads.md,
// PR 4a). Built from the look data file (data/painted-world.lookdata), not from the authoring formulas again: the
// ground the sim walks is the ground drawn, by construction. The 800 m tile; x east, z north, as the look page's.
//   heights: the look's heightfield (heightAt: its own triangles, as the mesh is drawn);
//   classes: the look's cover (src/look/world/cover.ts) mapped to the ruleset's (meadow, pasture, green, stubble,
//     bare earth and the village's ground open; wheat crops; ploughed ploughed; wood woods; road and track road), the
//     water where the look's water data is wet (bridge where a road crosses it), rough where the slope is steep (as
//     the battlefield's), and the buildings' footprints denseWood: the ruleset has no class for a building (adding one
//     is the ruleset's, Track S's; docs/plans/active/battle-threads.md, Open questions);
//   depth: the look's water depth where wet.
// Build time only (Math is fine: the output is data, and the committed file is the authority).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { MapDef } from './formation-field.ts'
import { napoleonic } from '../src/rulesets/napoleonic.ts'
import { D } from '../src/look/spec.ts'
import { decodeLook, unpackSpans } from '../src/look/world/data.ts'
import { setHeightfield, heightAt } from '../src/look/heightfield.ts'
import { COVER, coverAt } from '../src/look/world/cover.ts'
import { WATER_FILL, decodeWater, sampleRGBA } from '../src/look/world/water-data.ts'
import { BUILDINGS, FOOT, toLocal } from '../src/look/world/buildings.ts'

const CELL = 2
const CLASSES = Object.keys(napoleonic.terrain)
const C = (name: string): number => {
  const k = CLASSES.indexOf(name)
  if (k < 0) throw new Error(`painted-world: no terrain class ${name}`)
  return k
}
// the look's cover class to the ruleset's
const FROM_COVER: Record<number, string> = {
  [COVER.meadow]: 'open',
  [COVER.pasture]: 'open',
  [COVER.green]: 'open',
  [COVER.stubble]: 'open',
  [COVER.bare]: 'open',
  [COVER.village]: 'open',
  [COVER.wheat]: 'crops',
  [COVER.ploughed]: 'ploughed',
  [COVER.wood]: 'woods',
  [COVER.road]: 'road',
  [COVER.track]: 'road',
}
// wet: deeper than this (m); the look's water data is 0.5 m texels, its depth −1 (dry) to 2 m
const WET = 0.05
// rough ground where the slope is steepest (the battlefield's threshold)
const ROUGH = 0.14

/** Whether (x, z) is inside a building's footprint. */
export function inBuilding(x: number, z: number): boolean {
  for (const b of BUILDINGS) {
    const f = FOOT[b.model]
    const [lx, lz] = toLocal(b.yaw, x - b.x, z - b.z)
    if (
      f.r !== undefined
        ? Math.hypot(lx, lz) <= f.r * b.scale
        : Math.abs(lx) <= f.hx! * b.scale && Math.abs(lz) <= f.hz! * b.scale
    ) {
      return true
    }
  }
  return false
}

/** The look world's map, from the look data file. */
export function paintedWorld(): MapDef {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
  const file = fs.readFileSync(path.join(root, 'data', 'painted-world.lookdata'))
  const look = decodeLook(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength))
  const half = D.spec.tile / 2
  setHeightfield(look.hf, look.far, half)
  const water = unpackSpans(look.water, WATER_FILL)
  const W = look.water
  const depthAt = (x: number, z: number): number => {
    const [r, g, b, a] = sampleRGBA(water, W.n, W.cell, W.x0, W.z0, x, z)
    const d = decodeWater(r, g, b, a).depth
    return d > WET ? d : 0
  }
  const classAt = (x: number, z: number): number => {
    const cover = FROM_COVER[coverAt(look.cover, x, z)] ?? 'open'
    if (depthAt(x, z) > 0) return C(cover === 'road' ? 'bridge' : 'water')
    if (inBuilding(x, z)) return C('denseWood')
    if (cover !== 'open') return C(cover)
    const gx = (heightAt(x + 2, z) - heightAt(x - 2, z)) / 4
    const gz = (heightAt(x, z + 2) - heightAt(x, z - 2)) / 4
    return C(Math.sqrt(gx * gx + gz * gz) > ROUGH ? 'rough' : 'open')
  }
  const N = Math.round((2 * half) / CELL) + 1
  const cls = new Uint8Array(N * N)
  const depth = new Float32Array(N * N)
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = -half + i * CELL
      const z = -half + j * CELL
      cls[j * N + i] = classAt(x, z)
      // a bridge carries the road over: no water on it
      depth[j * N + i] = CLASSES[cls[j * N + i]] === 'bridge' ? 0 : depthAt(x, z)
    }
  }
  const T = napoleonic.terrain
  const limit = napoleonic.water.limit
  return {
    name: 'painted-world',
    half,
    heightAt,
    // a column's speed factor: the class's, and none where the water is too deep (slope comes from the heightfield)
    groundAt: (x, z) => {
      const c = CLASSES[classAt(x, z)]
      return c !== 'bridge' && depthAt(x, z) > limit ? 0 : T[c].g.column
    },
    slopeFactor: rise => Math.min(1, napoleonic.slopeK * Math.exp(-3.5 * rise)),
    classes: CLASSES,
    fine: { cell: CELL, n: N, classAt: (i, j) => cls[j * N + i], depthAt: (i, j) => depth[j * N + i] },
  }
}
