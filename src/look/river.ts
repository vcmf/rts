// The lowland meander at run time (docs/plans/done/w1-river-shape.md, docs/research/stylized-water.md §2.1–2.4,
// docs/systems/river.md): the per-sample arrays, built offline (src/look/world/author.ts) and shipped in the look
// data, plus a bucket grid for nearest-segment queries. Every consumer (terrain colours, water mesh, scatter,
// reflections) asks riverQuery(); nothing re-derives the river from a formula. No DOM: the build tool uses it too.

export interface RiverParams { id: string; W0: number; D0: number; bankH: number; floodplainW: number; beltW: number; valleySlope: number; valleyFade: number
  theta0: number; Js: number; Jf: number; v0: number; seed: number; z0: number; z1: number }

// the per-sample arrays, in the order the look data stores them
export const SAMPLE_KEYS = ['px', 'pz', 'tx', 'tz', 's', 'kappa', 'W', 'D', 'A', 'riffle', 'zw', 'v', 'tau'] as const
export type SampleKey = typeof SAMPLE_KEYS[number]
export type RiverSamples = { P: RiverParams; n: number } & Record<SampleKey, Float32Array>

export interface River extends RiverSamples {
  WMAX: number
  grid: Map<number, number[]>; CELL: number; REACH: number
  key(cx: number, cz: number): number
}

export interface RiverQuery { i: number; t: number; dist: number; n: number; s: number; level?: number }

const WMAX = 11   // docs/art-bible.md §6c: 4–11 m

// the river every query reads; set once, from the look data (page) or from the authoring step (build tool)
export let RIVER: River

export function setRiver(samples: RiverSamples): River {
  const C = samples, n = C.n
  // bucket grid: each segment registered in every 16 m cell within REACH of it
  let Wmax = 0; for (let i = 0; i < n; i++) Wmax = Math.max(Wmax, C.W[i])
  const CELL = 16, REACH = Math.ceil(Wmax / 2 + 22), grid = new Map<number, number[]>(), key = (cx: number, cz: number) => cx * 65536 + cz   // widest caller: reflAdd (hw+20)
  for (let i = 0; i < n - 1; i++) {
    const x0 = Math.min(C.px[i], C.px[i + 1]) - REACH, x1 = Math.max(C.px[i], C.px[i + 1]) + REACH, z0 = Math.min(C.pz[i], C.pz[i + 1]) - REACH, z1 = Math.max(C.pz[i], C.pz[i + 1]) + REACH
    for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) {
      const k = key(cx, cz); let b = grid.get(k); if (!b) grid.set(k, b = []); b.push(i)
    }
  }
  RIVER = { ...samples, WMAX, grid, CELL, REACH, key }
  return RIVER
}

export const lerpA = (arr: Float32Array, q: { i: number; t: number }): number => arr[q.i] + (arr[q.i + 1] - arr[q.i]) * q.t

const sstep = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }

// nearest river segment within REACH: {i,t,n (signed, + = left of flow),dist,s} or null.
// wantLevel: also blend the water level of every pass in reach (trough only)
export function riverQuery(x: number, z: number, wantLevel = false): RiverQuery | null {
  const C = RIVER, b = C.grid.get(C.key(Math.floor(x / C.CELL), Math.floor(z / C.CELL))); if (!b) return null
  let bi = -1, bt = 0, bd = Infinity, bsg = 1, ws = 0, wl = 0; const R2 = C.REACH * C.REACH
  for (const i of b) {
    const ax = C.px[i], az = C.pz[i], ex = C.px[i + 1] - ax, ez = C.pz[i + 1] - az, L2 = ex * ex + ez * ez || 1
    const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / L2)), dx = x - (ax + ex * t), dz = z - (az + ez * t), d = dx * dx + dz * dz
    if (d < bd) { bd = d; bi = i; bt = t; bsg = ex * dz - ez * dx < 0 ? -1 : 1 }
    // water level near (x,z): every segment in reach weighted by exp(-d/3), fading to 0 at REACH; continuous where
    // two passes of a doubled-back bend meet, and the nearest pass dominates at its own bank
    if (wantLevel && d < R2) { const dd = Math.sqrt(d), w = Math.exp(-dd / 3) * (1 - sstep(0.5 * C.REACH, C.REACH, dd)); ws += w; wl += w * (C.zw[i] + (C.zw[i + 1] - C.zw[i]) * t) }
  }
  const dist = Math.sqrt(bd); if (bi < 0 || dist > C.REACH) return null
  const q: RiverQuery = { i: bi, t: bt, dist, n: bsg * dist, s: lerpA(C.s, { i: bi, t: bt }) }
  if (wantLevel) q.level = ws > 1e-9 ? wl / ws : lerpA(C.zw, q)
  return q
}

// bank distance in half-widths (≤0 = inside the channel), for terrain colouring
export const bandOf = (q: RiverQuery | null): number => { if (!q) return 8; const hw = lerpA(RIVER.W, q) / 2; return Math.min(8, (q.dist - hw) / hw) }
