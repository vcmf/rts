// The map page's debug overlays (docs/plans/active/m6-lit-view.md, M6c): what the sim makes of the ground, drawn over
// the lit map as RGBA bytes per cell, the south row first, alpha where there is something to show. Pure functions,
// run in the compile worker; tested in test/render-lit-overlays.test.ts. Era-generic (decision 0015): every unit
// kind, terrain class and distance comes from the ruleset given.
import type { Layers } from '../../map/apply.ts'
import type { Ruleset } from '../../sim/ruleset.ts'
import type { Classify } from '../../rulesets/ground.ts'
import { groundCell, simDepth } from '../../../maps/cell.ts'

/** Which overlay: passability for one of the ruleset's unit kinds, the water's depth, the slope, or sight. */
export type OverlaySpec =
  | { kind: 'pass'; unit: string }
  | { kind: 'depth' }
  | { kind: 'slope' }
  | { kind: 'sight'; x: number; z: number; radius: number }

/** The unit kinds a ruleset's terrain table names (the passability overlay's choices). */
export const unitKinds = (rs: Ruleset): string[] => [
  ...new Set(Object.values(rs.terrain).flatMap(t => Object.keys(t.g))),
]

/**
 * The ground as the overlays read it, made once a compile: the grid, the node heights, and each cell's terrain class
 * (as the ruleset reads it) and water depth (as the sim takes it: `simDepth`, so bridges and the map's zones agree).
 */
export interface Ground {
  nx: number
  nz: number
  cell: number
  x0: number
  z0: number
  height: Float32Array // (nx + 1) × (nz + 1) nodes, m
  cls: Uint8Array // an index into `classes`
  classes: string[]
  depth: Float32Array // m
}

/** Reads a compiled map's ground once, for every overlay until the next compile. */
export function groundOf(L: Layers, classify: Classify): Ground {
  const n = L.nx * L.nz
  const cls = new Uint8Array(n)
  const depth = new Float32Array(n)
  const classes: string[] = []
  const index = new Map<string, number>()
  for (let c = 0; c < n; c++) {
    const gc = groundCell(L, c)
    const k = classify(gc)
    let q = index.get(k)
    if (q === undefined) {
      q = classes.push(k) - 1
      index.set(k, q)
    }
    cls[c] = q
    depth[c] = simDepth(gc, k)
  }
  return {
    nx: L.nx,
    nz: L.nz,
    cell: L.cell,
    x0: L.x0,
    z0: L.z0,
    height: Float32Array.from(L.height),
    cls,
    classes,
    depth,
  }
}

/** The ground's slope at a cell's centre, rise over run, from its four nodes. */
function slopeAt(G: Ground, i: number, j: number): number {
  const W = G.nx + 1
  const h = (a: number, b: number) => G.height[b * W + a]
  const gx = (h(i + 1, j) + h(i + 1, j + 1) - h(i, j) - h(i, j + 1)) / (2 * G.cell)
  const gz = (h(i, j + 1) + h(i + 1, j + 1) - h(i, j) - h(i + 1, j)) / (2 * G.cell)
  return Math.sqrt(gx * gx + gz * gz)
}
/** The ground's height at a cell's centre, the mean of its four nodes, m. */
const heightAt = (G: Ground, i: number, j: number): number => {
  const W = G.nx + 1
  return (G.height[j * W + i] + G.height[j * W + i + 1] + G.height[(j + 1) * W + i] + G.height[(j + 1) * W + i + 1]) / 4
}

/**
 * The wading factor at depth d for a kind (the ruleset's curve, linear between its points; 0 past the kind's limit),
 * as the sim reads it (src/sim/terrain.ts waterG, over the compiled tables).
 */
function wade(rs: Ruleset, unit: string, d: number): number {
  const limit = rs.water.limitByKind?.[unit] ?? rs.water.limit
  if (d <= 0) return 1
  if (d > limit) return 0
  const c = rs.water.curve
  for (let k = 1; k < c.length; k++) {
    if (d <= c[k][0]) return c[k - 1][1] + ((c[k][1] - c[k - 1][1]) * (d - c[k - 1][0])) / (c[k][0] - c[k - 1][0])
  }
  return c[c.length - 1][1]
}

/**
 * A unit kind's speed factor on each cell, as the sim would take it uphill (the worst way across): the terrain class's
 * factor for the kind, times the wading factor at the sim's depth there, times the slope's factor at the cell's
 * gradient (none on level ground: a bridge's deck). 0..1.
 */
export function passFactor(G: Ground, rs: Ruleset, unit: string): Float32Array {
  const out = new Float32Array(G.nx * G.nz)
  const byClass = G.classes.map(k => rs.terrain[k])
  for (let j = 0; j < G.nz; j++) {
    for (let i = 0; i < G.nx; i++) {
      const c = j * G.nx + i
      const t = byClass[G.cls[c]]
      const g = t?.g[unit] ?? 0
      const slope = t?.level ? 0 : slopeAt(G, i, j)
      out[c] = g * wade(rs, unit, G.depth[c]) * Math.min(1, rs.slopeK * Math.exp(-3.5 * slope))
    }
  }
  return out
}

/**
 * Cells visible from an eye at (x, z), the ruleset's eye height above the ground, out to `radius` m: a cell is seen
 * when the line from the eye to a figure standing on it (eye height) clears the ground between, and crosses no more of
 * each terrain class than the ruleset's sight table allows (woods so many metres; the length crossed is the line's,
 * a diagonal step's longer than a cell). Rays are cast to every cell on the square's border, a cell at a time.
 * 1 seen, 0 not.
 */
export function sightFrom(G: Ground, rs: Ruleset, x: number, z: number, radius: number): Uint8Array {
  const seen = new Uint8Array(G.nx * G.nz)
  const ci = Math.floor((x - G.x0) / G.cell)
  const cj = Math.floor((z - G.z0) / G.cell)
  if (ci < 0 || cj < 0 || ci >= G.nx || cj >= G.nz) return seen
  const eye = rs.fire.eye
  const limit = G.classes.map(k => rs.fire.sight[k] ?? Infinity) // metres of each class a line may cross
  const h0 = heightAt(G, ci, cj) + eye
  const R = Math.ceil(radius / G.cell)
  seen[cj * G.nx + ci] = 1
  const crossed = new Float32Array(G.classes.length)
  const ray = (ti: number, tj: number) => {
    const n = Math.max(Math.abs(ti - ci), Math.abs(tj - cj))
    const step = (Math.sqrt((ti - ci) ** 2 + (tj - cj) ** 2) * G.cell) / n // m along the line a step
    let maxSlope = -Infinity
    crossed.fill(0)
    let hidden = false
    for (let s = 1; s <= n; s++) {
      const i = Math.round(ci + ((ti - ci) * s) / n)
      const j = Math.round(cj + ((tj - cj) * s) / n)
      if (i < 0 || j < 0 || i >= G.nx || j >= G.nz) return
      const d = s * step
      if (d > radius) return
      const c = j * G.nx + i
      const ground = heightAt(G, i, j)
      // seen if a figure standing there clears every slope before it, and the line crossed no class past its limit
      if (!hidden && (ground + eye - h0) / d >= maxSlope) seen[c] = 1
      maxSlope = Math.max(maxSlope, (ground - h0) / d)
      const k = G.cls[c]
      crossed[k] += step
      if (crossed[k] > limit[k]) hidden = true
    }
  }
  for (let k = -R; k <= R; k++) {
    ray(ci + k, cj - R)
    ray(ci + k, cj + R)
    ray(ci - R, cj + k)
    ray(ci + R, cj + k)
  }
  return seen
}

/** Writes the colour at t (0..1) on a ramp of stops at out[o..o+2]. */
function rampInto(out: Uint8Array, o: number, stops: number[][], t: number): void {
  const x = Math.min(1, Math.max(0, t)) * (stops.length - 1)
  const k = Math.min(stops.length - 2, Math.floor(x))
  const f = x - k
  for (let c = 0; c < 3; c++) out[o + c] = stops[k][c] + (stops[k + 1][c] - stops[k][c]) * f
}
const GO = [
  [176, 32, 32],
  [226, 150, 40],
  [238, 220, 90],
  [70, 160, 70],
]
const BLUES = [
  [190, 225, 240],
  [60, 130, 200],
  [10, 30, 110],
]
const REDS = [
  [250, 240, 200],
  [235, 150, 50],
  [150, 20, 20],
]

/** An overlay's colours: RGBA bytes per cell, the south row first; alpha 0 where it shows nothing. */
export function overlay(G: Ground, rs: Ruleset, spec: OverlaySpec): Uint8Array {
  const n = G.nx * G.nz
  const out = new Uint8Array(n * 4)
  if (spec.kind === 'pass') {
    const g = passFactor(G, rs, spec.unit)
    for (let c = 0; c < n; c++) {
      if (g[c] >= 0.999) continue // full speed: nothing to show
      if (g[c] <= 0) out.set([60, 0, 0], c * 4)
      else rampInto(out, c * 4, GO, g[c])
      out[c * 4 + 3] = 170
    }
  } else if (spec.kind === 'depth') {
    for (let c = 0; c < n; c++) {
      if (!G.depth[c]) continue
      rampInto(out, c * 4, BLUES, G.depth[c] / 2)
      out[c * 4 + 3] = 200
    }
  } else if (spec.kind === 'slope') {
    for (let j = 0; j < G.nz; j++) {
      for (let i = 0; i < G.nx; i++) {
        const s = slopeAt(G, i, j)
        if (s < 0.02) continue
        const c = j * G.nx + i
        rampInto(out, c * 4, REDS, s / 0.3)
        out[c * 4 + 3] = Math.round(80 + 120 * Math.min(1, s / 0.3))
      }
    }
  } else {
    const seen = sightFrom(G, rs, spec.x, spec.z, spec.radius)
    // what the eye sees is left clear, the rest darkened
    for (let c = 0; c < n; c++) if (!seen[c]) out.set([20, 20, 40, 140], c * 4)
  }
  return out
}
