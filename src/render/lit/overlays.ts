// The map page's debug overlays (docs/plans/active/m6-lit-view.md, M6c): what the sim makes of the ground, drawn over
// the lit map as RGBA bytes per cell, the south row first, alpha where there is something to show. Pure functions,
// run in the compile worker on the last compiled layers; tested in test/render-lit-overlays.test.ts. Era-generic
// (decision 0015): every unit kind, terrain class and distance comes from the ruleset given.
import type { Layers } from '../../map/apply.ts'
import type { Ruleset } from '../../sim/ruleset.ts'
import type { Classify } from '../../rulesets/ground.ts'
import { groundCell } from '../../../maps/cell.ts'

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

type L = Layers

// the ground's slope at a cell's centre, rise over run, from its four nodes
function slopeAt(L: L, i: number, j: number): number {
  const W = L.nx + 1
  const h = (a: number, b: number) => L.height[b * W + a]
  const gx = (h(i + 1, j) + h(i + 1, j + 1) - h(i, j) - h(i, j + 1)) / (2 * L.cell)
  const gz = (h(i, j + 1) + h(i + 1, j + 1) - h(i, j) - h(i + 1, j)) / (2 * L.cell)
  return Math.sqrt(gx * gx + gz * gz)
}
const heightAt = (L: L, i: number, j: number): number => {
  const W = L.nx + 1
  return (L.height[j * W + i] + L.height[j * W + i + 1] + L.height[(j + 1) * W + i] + L.height[(j + 1) * W + i + 1]) / 4
}

// a ramp of colours over 0..1
function ramp(stops: [number, number, number][], t: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, t)) * (stops.length - 1)
  const k = Math.min(stops.length - 2, Math.floor(x))
  const f = x - k
  return [0, 1, 2].map(c => stops[k][c] + (stops[k + 1][c] - stops[k][c]) * f) as [number, number, number]
}
const GO = [
  [176, 32, 32],
  [226, 150, 40],
  [238, 220, 90],
  [70, 160, 70],
] as [number, number, number][]

/**
 * A unit kind's speed factor on each cell, as the sim would take it on level ground or uphill: the terrain class's
 * factor for the kind, times the wading curve's at the cell's depth (0 past the kind's limit), times the slope's at the
 * cell's gradient uphill (the worst way across it). 0..1.
 */
export function passFactor(L: L, rs: Ruleset, classify: Classify, unit: string): Float32Array {
  const out = new Float32Array(L.nx * L.nz)
  const limit = rs.water.limitByKind?.[unit] ?? rs.water.limit
  const wade = (d: number) => {
    if (d <= 0) return 1
    if (d > limit) return 0
    const c = rs.water.curve
    for (let k = 1; k < c.length; k++) {
      if (d <= c[k][0]) return c[k - 1][1] + ((c[k][1] - c[k - 1][1]) * (d - c[k - 1][0])) / (c[k][0] - c[k - 1][0])
    }
    return c[c.length - 1][1]
  }
  for (let j = 0; j < L.nz; j++) {
    for (let i = 0; i < L.nx; i++) {
      const c = j * L.nx + i
      const cell = groundCell(L, c)
      const t = rs.terrain[classify(cell)]
      const g = t?.g[unit] ?? 0
      const slope = t?.level ? 0 : slopeAt(L, i, j)
      out[c] = g * wade(cell.water) * Math.min(1, rs.slopeK * Math.exp(-3.5 * slope))
    }
  }
  return out
}

/**
 * Cells visible from an eye at (x, z), the ruleset's eye height above the ground, out to `radius` m: a cell is seen
 * when the line from the eye to a point at eye height over the cell clears the ground between, and crosses no more of
 * each terrain class than the ruleset's sight table allows (woods so many metres); a building (a class the sight table
 * gives 0) blocks. Rays are cast to every cell on the square's border, a cell at a time. 1 seen, 0 not.
 */
export function sightFrom(L: L, rs: Ruleset, classify: Classify, x: number, z: number, radius: number): Uint8Array {
  const seen = new Uint8Array(L.nx * L.nz)
  const ci = Math.floor((x - L.x0) / L.cell)
  const cj = Math.floor((z - L.z0) / L.cell)
  if (ci < 0 || cj < 0 || ci >= L.nx || cj >= L.nz) return seen
  const eye = rs.fire.eye
  const sight = rs.fire.sight
  const cls = new Map<number, string>()
  const classOf = (c: number) => {
    let k = cls.get(c)
    if (k === undefined) cls.set(c, (k = classify(groundCell(L, c))))
    return k
  }
  const h0 = heightAt(L, ci, cj) + eye
  const R = Math.ceil(radius / L.cell)
  seen[cj * L.nx + ci] = 1
  const ray = (ti: number, tj: number) => {
    const n = Math.max(Math.abs(ti - ci), Math.abs(tj - cj))
    let maxSlope = -Infinity
    const crossed = new Map<string, number>()
    for (let s = 1; s <= n; s++) {
      const i = Math.round(ci + ((ti - ci) * s) / n)
      const j = Math.round(cj + ((tj - cj) * s) / n)
      if (i < 0 || j < 0 || i >= L.nx || j >= L.nz) return
      const c = j * L.nx + i
      const d = Math.sqrt((i - ci) ** 2 + (j - cj) ** 2) * L.cell
      if (d > radius) return
      const ground = heightAt(L, i, j)
      // seen if a figure standing there (eye height) clears every slope before it
      if ((ground + eye - h0) / d >= maxSlope) {
        let hidden = false
        for (const [k, m] of crossed) if (sight[k] !== undefined && m > sight[k]) hidden = true
        if (!hidden) seen[c] = 1
      }
      maxSlope = Math.max(maxSlope, (ground - h0) / d)
      const k = classOf(c)
      if (sight[k] !== undefined) crossed.set(k, (crossed.get(k) ?? 0) + L.cell)
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

/** An overlay's colours: RGBA bytes per cell, the south row first; alpha 0 where it shows nothing. */
export function overlay(L: L, rs: Ruleset, classify: Classify, spec: OverlaySpec): Uint8Array {
  const n = L.nx * L.nz
  const out = new Uint8Array(n * 4)
  const put = (c: number, rgb: [number, number, number], a: number) => {
    out[c * 4] = rgb[0]
    out[c * 4 + 1] = rgb[1]
    out[c * 4 + 2] = rgb[2]
    out[c * 4 + 3] = a
  }
  if (spec.kind === 'pass') {
    const g = passFactor(L, rs, classify, spec.unit)
    for (let c = 0; c < n; c++) put(c, g[c] <= 0 ? [60, 0, 0] : ramp(GO, g[c]), g[c] >= 0.999 ? 0 : 170)
  } else if (spec.kind === 'depth') {
    const blues: [number, number, number][] = [
      [190, 225, 240],
      [60, 130, 200],
      [10, 30, 110],
    ]
    for (let c = 0; c < n; c++) if (L.depth[c]) put(c, ramp(blues, L.depth[c] / 1000 / 2), 200)
  } else if (spec.kind === 'slope') {
    const reds: [number, number, number][] = [
      [250, 240, 200],
      [235, 150, 50],
      [150, 20, 20],
    ]
    for (let j = 0; j < L.nz; j++) {
      for (let i = 0; i < L.nx; i++) {
        const s = slopeAt(L, i, j)
        if (s >= 0.02) put(j * L.nx + i, ramp(reds, s / 0.3), Math.round(80 + 120 * Math.min(1, s / 0.3)))
      }
    }
  } else {
    const seen = sightFrom(L, rs, classify, spec.x, spec.z, spec.radius)
    for (let c = 0; c < n; c++) put(c, seen[c] ? [255, 240, 150] : [20, 20, 40], seen[c] ? 70 : 140)
  }
  return out
}
