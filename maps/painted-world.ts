// The look page's world (the painted demo tile, src/look/world/author.ts) as a map for the sim data build
// (tools/build-sim-data.ts), so the sim can drive the look page's armies (docs/plans/active/battle-threads.md,
// PR 4a). Built from the look data file (data/painted-world.lookdata), not from the authoring formulas again: the
// ground the sim walks is the ground drawn. The 800 m tile; x east, z north, as the look page's.
//   heights: the look's heightfield (heightAt: its own triangles, as the mesh is drawn);
//   classes, per 2 m node: the most common of the look's four 2 m cover cells around it (src/look/world/cover.ts,
//     their corners on the nodes) mapped to the ruleset's (meadow, pasture, green, stubble, bare earth and the
//     village's ground open; wheat crops; ploughed ploughed; road and track road), water where the look's water data
//     is wet (the track's ford too: the look has no bridge), rough where the slope is steep (as the battlefield's),
//     and the buildings' footprints denseWood: the ruleset has no class for a building (adding one is the ruleset's,
//     Track S's; the plan's Open questions);
//   depth: the look's water depth where wet;
//   the cost grid's ground (groundAt): none within DEEP_REACH of water deeper than the ruleset's wading limit (the
//     river's 10 m sits inside 7.16 m cost cells, which their half-passable rule would otherwise mark passable: the
//     paths cross at the ford only), nor in a building.
// The look tile has no woods: its trees are the scatter's lone and hedgerow trees, not obstacles to the sim's men.
// Build time only, with the sim's exact-operation functions (src/sim/num.ts) where Math's may differ in the last bit
// between machines (as maps/battlefield.ts): the bytes are the same everywhere, which check:data compares.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { MapDef } from './formation-field.ts'
import { napoleonic } from '../src/rulesets/napoleonic.ts'
import { sin, cos, exp } from '../src/sim/num.ts'
import { D } from '../src/look/spec.ts'
import { decodeLook, unpackSpans } from '../src/look/world/data.ts'
import { setHeightfield, heightAt } from '../src/look/heightfield.ts'
import { COVER, coverAt } from '../src/look/world/cover.ts'
import { WATER_FILL, decodeWater, sampleRGBA } from '../src/look/world/water-data.ts'
import { BUILDINGS, FOOT } from '../src/look/world/buildings.ts'

export const CELL = 2
const CLASSES = Object.keys(napoleonic.terrain)
const C = (name: string): number => {
  const k = CLASSES.indexOf(name)
  if (k < 0) throw new Error(`painted-world: no terrain class ${name}`)
  return k
}
/** The look's cover class to the ruleset's. */
export const FROM_COVER: Record<number, string> = {
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
/** Wet: deeper than this (m); the look's water data is 0.5 m texels, its depth −1 (dry) to 2 m. */
export const WET = 0.05
/** Rough ground where the slope is steeper than this (the battlefield's threshold). */
export const ROUGH = 0.14
/** The cost grid's ground is none this near (m) to water deeper than the wading limit. */
export const DEEP_REACH = 4

// each building's footprint with its turn worked out once: centre, cos and sin of its yaw, radius or half sizes
const FEET = BUILDINGS.map(b => {
  const f = FOOT[b.model]
  return {
    x: b.x,
    z: b.z,
    c: cos(b.yaw),
    s: sin(b.yaw),
    r: f.r && f.r * b.scale,
    hx: (f.hx ?? 0) * b.scale,
    hz: (f.hz ?? 0) * b.scale,
  }
})
/** Whether (x, z) is inside a building's footprint (src/look/world/buildings.ts FOOT, turned by its yaw). */
export function inBuilding(x: number, z: number): boolean {
  for (const b of FEET) {
    const dx = x - b.x
    const dz = z - b.z
    // toLocal: the offset turned back by the yaw
    const lx = dx * b.c - dz * b.s
    const lz = dx * b.s + dz * b.c
    if (b.r !== undefined ? lx * lx + lz * lz <= b.r * b.r : Math.abs(lx) <= b.hx && Math.abs(lz) <= b.hz) return true
  }
  return false
}

/** The look data, read once: its cover, its water as texels, its heights set for heightAt. */
export function lookWorld() {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
  const file = fs.readFileSync(path.join(root, 'data', 'painted-world.lookdata'))
  const look = decodeLook(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength))
  setHeightfield(look.hf, look.far, D.spec.tile / 2)
  const water = unpackSpans(look.water, WATER_FILL)
  const W = look.water
  /** the water's depth at (x, z) where wet (else 0) */
  const depthAt = (x: number, z: number): number => {
    const [r, g, b, a] = sampleRGBA(water, W.n, W.cell, W.x0, W.z0, x, z)
    const d = decodeWater(r, g, b, a).depth
    return d > WET ? d : 0
  }
  /** the ruleset's class of the most common of the four cover cells around node (x, z) (ties: the first seen) */
  const coverClass = (x: number, z: number): string => {
    const seen: number[] = []
    const count: number[] = []
    for (const [dx, dz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ]) {
      const c = coverAt(look.cover, x + dx, z + dz)
      const k = seen.indexOf(c)
      if (k < 0) {
        seen.push(c)
        count.push(1)
      } else count[k]++
    }
    let best = 0
    for (let k = 1; k < seen.length; k++) if (count[k] > count[best]) best = k
    const name = FROM_COVER[seen[best]]
    if (name === undefined)
      {throw new Error(`painted-world: the look's cover class ${seen[best]} maps to no terrain class`)}
    return name
  }
  return { look, depthAt, coverClass }
}

/** The look world's map, from the look data file. */
export function paintedWorld(): MapDef {
  const half = D.spec.tile / 2
  const { depthAt, coverClass } = lookWorld()
  const limit = napoleonic.water.limit
  const classAt = (x: number, z: number, depth: number): number => {
    if (depth > 0) return C('water')
    if (inBuilding(x, z)) return C('denseWood')
    const cover = coverClass(x, z)
    if (cover !== 'open') return C(cover)
    const gx = (heightAt(x + 2, z) - heightAt(x - 2, z)) / 4
    const gz = (heightAt(x, z + 2) - heightAt(x, z - 2)) / 4
    return C(Math.sqrt(gx * gx + gz * gz) > ROUGH ? 'rough' : 'open')
  }
  const N = Math.round((2 * half) / CELL) + 1
  const cls = new Uint8Array(N * N)
  const depth = new Float32Array(N * N)
  // deep: water too deep to wade, spread DEEP_REACH m (the cost grid's ground is none there)
  const deep = new Uint8Array(N * N)
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = -half + i * CELL
      const z = -half + j * CELL
      const d = depthAt(x, z)
      cls[j * N + i] = classAt(x, z, d)
      depth[j * N + i] = d
      if (d > limit) deep[j * N + i] = 1
    }
  }
  const r = Math.round(DEEP_REACH / CELL)
  const nearDeep = new Uint8Array(N * N)
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      if (!deep[j * N + i]) continue
      for (let b = Math.max(0, j - r); b <= Math.min(N - 1, j + r); b++) {
        for (let a = Math.max(0, i - r); a <= Math.min(N - 1, i + r); a++) nearDeep[b * N + a] = 1
      }
    }
  }
  const node = (v: number) => Math.min(N - 1, Math.max(0, Math.round((v + half) / CELL)))
  const T = napoleonic.terrain
  return {
    name: 'painted-world',
    half,
    heightAt,
    // a column's speed factor: the class's at the nearest node, none near deep water or in a building (slope comes
    // from the heightfield)
    groundAt: (x, z) => {
      const k = node(z) * N + node(x)
      return nearDeep[k] || inBuilding(x, z) ? 0 : T[CLASSES[cls[k]]].g.column
    },
    slopeFactor: rise => Math.min(1, napoleonic.slopeK * exp(-3.5 * rise)),
    classes: CLASSES,
    fine: { cell: CELL, n: N, classAt: (i, j) => cls[j * N + i], depthAt: (i, j) => depth[j * N + i] },
  }
}
