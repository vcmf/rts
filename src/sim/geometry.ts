// The formations' places as the footprint gate tests them, and where formations touch: the visual bench's geometry
// (docs/plans/active/c0-bench.md). Read-only and never called by the tick, so no hash depends on it; the bench's
// overlay and its tests share it, so what the page shows is what the tests check.
import { type World, MAX_FORMATIONS, M_TICK, outOfFight, typeOf } from './world.ts'
import { DT } from './time.ts'
import { mkPlaces, placesCtx, placeAtSlot, filledSlots, type Places } from './formation.ts'

/** Every filled slot's place in the world, with its formation, company and bin (bin index within the formation). */
export interface Placed {
  n: number
  x: Float64Array
  z: Float64Array
  f: Int32Array
  c: Int32Array
  b: Int32Array
  ctx: Places
}

/** Buffers for `placeAll`, sized for every formation's slots. */
export function mkPlaced(w: World): Placed {
  const n = MAX_FORMATIONS * w.cr.maxSlots
  return {
    n: 0,
    x: new Float64Array(n),
    z: new Float64Array(n),
    f: new Int32Array(n),
    c: new Int32Array(n),
    b: new Int32Array(n),
    ctx: mkPlaces(w),
  }
}

const tmp = [0, 0, 0]

/** Fills `out` with the place of every filled slot of every live formation, as the sim stands at its tick. */
export function placeAll(w: World, out: Placed): Placed {
  const f = w.f
  const CS = w.cr.maxC
  const t = w.meta[M_TICK] * DT
  let n = 0
  for (let i = 0; i < MAX_FORMATIONS; i++) {
    if (!f.alive[i]) continue
    const U = typeOf(w, i)
    const F = filledSlots(w, i)
    placesCtx(out.ctx, i, f.x[i], f.z[i], f.heading[i], t, 0)
    const L = out.ctx.L
    for (let c = 0; c < U.C; c++) {
      const a = F.at[i * (CS + 1) + c]
      const e = F.at[i * (CS + 1) + c + 1]
      for (let k = a; k < e; k++) {
        const s = F.s[k]
        placeAtSlot(out.ctx, s, tmp)
        out.x[n] = tmp[0]
        out.z[n] = tmp[1]
        out.f[n] = i
        out.c[n] = c
        out.b[n] = c * U.geo.bins + L.of[s]
        n++
      }
    }
  }
  out.n = n
  return out
}

/** The nearest two places of a pair of companies of two formations, `d` apart. */
export interface Contact {
  i: number
  j: number
  ci: number
  cj: number
  d: number
  ax: number
  az: number
  bx: number
  bz: number
}

/**
 * Every pair of companies of two different formations with places within `near` metres, each with its nearest two
 * places. A uniform grid of cell `near` keeps it to the places around each one.
 */
export function contacts(w: World, P: Placed, near: number): Contact[] {
  const n = P.n
  if (!n) return []
  // a counting sort of the places into cells of `near` over their bounds: cell k's places are
  // order[start[k] .. start[k + 1])
  let x0 = Infinity
  let z0 = Infinity
  let x1 = -Infinity
  let z1 = -Infinity
  for (let p = 0; p < n; p++) {
    x0 = Math.min(x0, P.x[p])
    z0 = Math.min(z0, P.z[p])
    x1 = Math.max(x1, P.x[p])
    z1 = Math.max(z1, P.z[p])
  }
  const nx = Math.floor((x1 - x0) / near) + 1
  const nz = Math.floor((z1 - z0) / near) + 1
  const cellOf = new Int32Array(n)
  const start = new Int32Array(nx * nz + 1)
  for (let p = 0; p < n; p++) {
    const k = Math.floor((P.z[p] - z0) / near) * nx + Math.floor((P.x[p] - x0) / near)
    cellOf[p] = k
    start[k + 1]++
  }
  for (let k = 0; k < nx * nz; k++) start[k + 1] += start[k]
  const fill = start.slice(0, nx * nz)
  const order = new Int32Array(n)
  for (let p = 0; p < n; p++) order[fill[cellOf[p]]++] = p
  // every pair of places within `near`, then the nearest per pair of companies (sorted by the pair, then distance)
  const CS = w.cr.maxC
  const near2 = near * near
  const keys: number[] = []
  const d2s: number[] = []
  const ps: number[] = []
  const qs: number[] = []
  for (let p = 0; p < n; p++) {
    const gx = cellOf[p] % nx
    const gz = (cellOf[p] - gx) / nx
    for (let dz = -1; dz <= 1; dz++) {
      if (gz + dz < 0 || gz + dz >= nz) continue
      for (let dx = -1; dx <= 1; dx++) {
        if (gx + dx < 0 || gx + dx >= nx) continue
        const k = (gz + dz) * nx + gx + dx
        for (let o = start[k]; o < start[k + 1]; o++) {
          const q = order[o]
          // each pair once, from the lower formation's place
          if (P.f[q] <= P.f[p]) continue
          const ex = P.x[q] - P.x[p]
          const ez = P.z[q] - P.z[p]
          const d2 = ex * ex + ez * ez
          if (d2 > near2) continue
          keys.push((P.f[p] * CS + P.c[p]) * MAX_FORMATIONS * CS + P.f[q] * CS + P.c[q])
          d2s.push(d2)
          ps.push(p)
          qs.push(q)
        }
      }
    }
  }
  const idx = keys.map((_, m) => m).sort((a, b) => keys[a] - keys[b] || d2s[a] - d2s[b] || ps[a] - ps[b])
  const out: Contact[] = []
  for (let m = 0; m < idx.length; m++) {
    const a = idx[m]
    if (m && keys[idx[m - 1]] === keys[a]) continue
    const p = ps[a]
    const q = qs[a]
    out.push({
      i: P.f[p],
      j: P.f[q],
      ci: P.c[p],
      cj: P.c[q],
      d: Math.sqrt(d2s[a]),
      ax: P.x[p],
      az: P.z[p],
      bx: P.x[q],
      bz: P.z[q],
    })
  }
  return out
}

/**
 * How near two places of different formations may stand before the formations overlap: within a block places
 * are a file and a rank apart (under a metre), so two blocks that interpenetrate put places of the one within about
 * half a metre of places of the other, and two that only touch keep them over a metre apart.
 */
export const TOUCH = 1

/** The companies of two formations both in the fight that overlap; the bench's first invariant: there are none */
export function formedOverlaps(w: World, P: Placed): Contact[] {
  const f = w.f
  return contacts(w, P, TOUCH).filter(c => !outOfFight(f.mstate[c.i]) && !outOfFight(f.mstate[c.j]))
}
