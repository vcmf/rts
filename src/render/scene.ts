// Cosmetic scenery scattered from the sim's terrain classes by their style (style.ts): trees (drawn as
// crowns, and trunks the soldiers walk round), reeds. Not simulated: placed by a seeded renderer RNG, the same on
// every load, never read by the sim (decision 0005).
import type { World } from '../sim/index.ts'
import { cellK } from '../sim/index.ts'
import { CLASS_STYLE } from './style.ts'

export interface Obstacle { x: number; z: number; r: number }
export interface Scene {
  trees: Obstacle[]
  reeds: [number, number][]
  obstacleCell: number; obstacleN: number; x0: number
  obstacleGrid: Obstacle[][]
  isClass(x: number, z: number, names: string[]): boolean
}

// a small seeded RNG for cosmetic placement
export function cosmeticRng(seed: number): () => number {
  let s = seed >>> 0
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

export function buildScene(w: World, seed = 11): Scene {
  const t = w.terrain, names = Object.keys(w.cr.rs.terrain), rnd = cosmeticRng(seed)
  const classAt = (x: number, z: number) => names[t.cls[cellK(t, x, z)]]
  const isClass = (x: number, z: number, which: string[]) => which.includes(classAt(x, z))
  const span = (t.n - 1) * t.cell, trees: Obstacle[] = [], reeds: [number, number][] = []
  // trees: one try per 4 m² of woods (denser in dense woods), at least 4 m apart
  const G = 4, gn = Math.ceil(span / G), grid: Obstacle[][] = Array.from({ length: gn * gn }, () => [])
  const gi = (x: number, z: number) => { const i = Math.floor((x - t.x0) / G), j = Math.floor((z - t.z0) / G); return i < 0 || j < 0 || i >= gn || j >= gn ? -1 : j * gn + i }
  for (let z = t.z0; z < t.z0 + span; z += 2) for (let x = t.x0; x < t.x0 + span; x += 2) {
    const p = CLASS_STYLE[classAt(x, z)]?.trees ?? 0
    if (!p || rnd() > p) continue
    const tx = x + rnd() * 2, tz = z + rnd() * 2, k = gi(tx, tz)
    let near = false
    for (let dj = -1; dj <= 1 && !near; dj++) for (let di = -1; di <= 1 && !near; di++) { const q = k + dj * gn + di; if (q >= 0 && q < grid.length) for (const o of grid[q]) if ((o.x - tx) * (o.x - tx) + (o.z - tz) * (o.z - tz) < 16) { near = true; break } }
    if (near || k < 0) continue
    const o = { x: tx, z: tz, r: 0.3 + rnd() * 0.15 }; trees.push(o); grid[k].push(o)
  }
  for (let z = t.z0; z < t.z0 + span; z += 5) for (let x = t.x0; x < t.x0 + span; x += 5) if (CLASS_STYLE[classAt(x, z)]?.symbol === 'reeds' && rnd() < 0.7) reeds.push([x + rnd() * 3, z + rnd() * 3])
  return { trees, reeds, obstacleCell: G, obstacleN: gn, x0: t.x0, obstacleGrid: grid, isClass }
}

// every obstacle in the 3×3 cells around (x, z)
export function eachObstacle(s: Scene, x: number, z: number, fn: (o: Obstacle) => void): void {
  const G = s.obstacleCell, n = s.obstacleN, i = Math.floor((x - s.x0) / G), j = Math.floor((z - s.x0) / G)
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= n || b >= n) continue
    for (const o of s.obstacleGrid[b * n + a]) fn(o)
  }
}
