// Streams from a heightfield (docs/plans/active/m8-austerlitz.md M8b): where water runs on the real relief, so a stream
// drawn on a map lies in its valley. The sinks are filled (priority flood), each node drains to the lowest of its eight
// neighbours, the ground draining through each node is summed, and the nodes draining more than a threshold are
// traced into lines, each from its head down to where it joins a larger one or leaves the box: upstream first, as the
// language reads a stream; a flat (a filled basin) drains through its middle (Barnes, Lehman and Mulla 2014). Plain
// float64 in a tool, not the sim's. Tested in test/map-streams.test.ts.
//   node tools/streams.ts <file.rdem> <x0> <z0> <x1> <z1> <min km²> <out.json>
// The box in the file's frame (m, centred, x east, z north); the lines out in the same frame, with each one's
// catchment where it ends (km²) and the line it flows into.
import fs from 'node:fs'
import path from 'node:path'
import { decodeRdem, demHalf, type Dem } from '../src/map/dem.ts'

/** A grid of heights: nx × nz nodes `cell` m apart, node (i, j) at (x0 + i·cell, z0 + j·cell), the south row first. */
export interface Grid {
  nx: number
  nz: number
  cell: number
  x0: number
  z0: number
  h: Float64Array
}
/** A stream traced from a grid: its points from its head down, its catchment where it ends, and what it flows into. */
export interface Stream {
  id: number
  pts: [number, number][]
  km2: number
  into: number | null // the stream it joins, or null where it leaves the box
}

// the eight neighbours, as (di, dj), and their distances in cells
const DI = [1, 1, 0, -1, -1, -1, 0, 1]
const DJ = [0, 1, 1, 1, 0, -1, -1, -1]
const DIST = DI.map((di, k) => Math.hypot(di, DJ[k]))

/** A binary heap of node indices by a key (the priority flood's queue). */
class Heap {
  private ids: number[] = []
  private keys: number[] = []
  get size(): number {
    return this.ids.length
  }
  push(id: number, key: number): void {
    const a = this.ids
    const k = this.keys
    let i = a.length
    a.push(id)
    k.push(key)
    while (i > 0) {
      const p = (i - 1) >> 1
      if (k[p] <= key) break
      a[i] = a[p]
      k[i] = k[p]
      i = p
    }
    a[i] = id
    k[i] = key
  }
  pop(): number {
    const a = this.ids
    const k = this.keys
    const top = a[0]
    const id = a.pop()!
    const key = k.pop()!
    if (a.length) {
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        if (l >= a.length) break
        const r = l + 1
        const c = r < a.length && k[r] < k[l] ? r : l
        if (k[c] >= key) break
        a[i] = a[c]
        k[i] = k[c]
        i = c
      }
      a[i] = id
      k[i] = key
    }
    return top
  }
}

/**
 * The grid with its sinks filled (priority flood, Barnes et al. 2014, with an epsilon): every node has a way down to
 * the edge, each step down by at least `eps` (with 0, a filled basin is left flat, for `drainage` to resolve).
 */
export function fill(g: Grid, eps = 1e-4): { h: Float64Array } {
  const { nx, nz } = g
  const h = Float64Array.from(g.h)
  const done = new Uint8Array(nx * nz)
  const q = new Heap()
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      if (i === 0 || j === 0 || i === nx - 1 || j === nz - 1) {
        const k = j * nx + i
        done[k] = 1
        q.push(k, h[k])
      }
    }
  }
  while (q.size) {
    const k = q.pop()
    const i = k % nx
    const j = (k - i) / nx
    for (let d = 0; d < 8; d++) {
      const a = i + DI[d]
      const b = j + DJ[d]
      if (a < 0 || b < 0 || a >= nx || b >= nz) continue
      const n = b * nx + a
      if (done[n]) continue
      done[n] = 1
      if (h[n] <= h[k] + eps) h[n] = h[k] + eps
      q.push(n, h[n])
    }
  }
  return { h }
}

/**
 * Where each node drains (the neighbour of steepest descent on the filled grid; −1 at the edge), and the ground
 * draining through it, in nodes (its own included). A flat (nodes of one height with no lower neighbour, as filling
 * makes of a pond's basin or a dam's backwater) drains as Barnes, Lehman and Mulla (2014) resolve it: each of its nodes
 * toward the flat's outlets and away from its higher rim, by breadth-first distances over the flat, so the flow
 * curves through the middle of a basin instead of running in ruled lines to the outlet.
 */
export function drainage(g: Grid, filled: Float64Array): { to: Int32Array; acc: Float64Array } {
  const { nx, nz } = g
  const n = nx * nz
  const to = new Int32Array(n).fill(-1)
  const edge = (i: number, j: number) => i === 0 || j === 0 || i === nx - 1 || j === nz - 1
  const flat = new Uint8Array(n)
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i
      if (edge(i, j)) continue
      let best = 0
      for (let d = 0; d < 8; d++) {
        const m = (j + DJ[d]) * nx + i + DI[d]
        const s = (filled[k] - filled[m]) / DIST[d]
        if (s > best) {
          best = s
          to[k] = m
        }
      }
      if (to[k] < 0) flat[k] = 1
    }
  }
  // the flats' distances: from their outlets (a node of the same height that drains), and from their higher rim
  const toLow = new Int32Array(n).fill(-1)
  const fromHigh = new Int32Array(n).fill(-1)
  const low: number[] = []
  const high: number[] = []
  const same = (a: number, b: number) => filled[a] === filled[b]
  for (let k = 0; k < n; k++) {
    if (!flat[k]) continue
    const i = k % nx
    const j = (k - i) / nx
    for (let d = 0; d < 8; d++) {
      const m = (j + DJ[d]) * nx + i + DI[d]
      // an outlet: a node of the same height that drains, or one on the grid's edge (it drains off the grid)
      const mi = m % nx
      const mj = (m - mi) / nx
      if (!flat[m] && (to[m] >= 0 || edge(mi, mj)) && same(k, m) && toLow[m] < 0) {
        toLow[m] = 0
        low.push(m)
      }
      if (filled[m] > filled[k] && fromHigh[k] < 0) {
        fromHigh[k] = 0
        high.push(k)
      }
    }
  }
  const spread = (dist: Int32Array, seeds: number[]) => {
    for (let q = 0; q < seeds.length; q++) {
      const k = seeds[q]
      const i = k % nx
      const j = (k - i) / nx
      for (let d = 0; d < 8; d++) {
        const a = i + DI[d]
        const b = j + DJ[d]
        if (a < 0 || b < 0 || a >= nx || b >= nz) continue
        const m = b * nx + a
        if (flat[m] && dist[m] < 0 && same(k, m)) {
          dist[m] = dist[k] + 1
          seeds.push(m)
        }
      }
    }
  }
  spread(toLow, low)
  spread(fromHigh, high)
  // each flat's farthest from its rim, so "away from the rim" counts down to its middle
  const far = new Map<number, number>()
  const flatOf = new Int32Array(n).fill(-1)
  for (let k = 0; k < n; k++) {
    if (!flat[k] || flatOf[k] >= 0) continue
    const stack = [k]
    flatOf[k] = k
    let most = Math.max(0, fromHigh[k])
    while (stack.length) {
      const c = stack.pop()!
      const i = c % nx
      const j = (c - i) / nx
      for (let d = 0; d < 8; d++) {
        const m = (j + DJ[d]) * nx + i + DI[d]
        if (flat[m] && flatOf[m] < 0 && same(c, m)) {
          flatOf[m] = k
          most = Math.max(most, fromHigh[m])
          stack.push(m)
        }
      }
    }
    far.set(k, most)
  }
  // a flat node's key: twice its distance to an outlet plus its distance from the rim's far side; it drains to its
  // neighbour of the lowest key (an outlet: 0)
  const key = (m: number) =>
    flat[m] ? 2 * toLow[m] + (fromHigh[m] >= 0 ? far.get(flatOf[m])! - fromHigh[m] : 0) : toLow[m] === 0 ? -1 : Infinity
  for (let k = 0; k < n; k++) {
    if (!flat[k] || toLow[k] < 0) continue
    const i = k % nx
    const j = (k - i) / nx
    let best = key(k)
    for (let d = 0; d < 8; d++) {
      const m = (j + DJ[d]) * nx + i + DI[d]
      if (!same(k, m)) continue
      const km = key(m)
      if (km < best) {
        best = km
        to[k] = m
      }
    }
  }
  // the flow summed in topological order (every node after all that drain into it)
  const into = new Int32Array(n)
  for (let k = 0; k < n; k++) if (to[k] >= 0) into[to[k]]++
  const acc = new Float64Array(n).fill(1)
  const ready: number[] = []
  for (let k = 0; k < n; k++) if (!into[k]) ready.push(k)
  for (let q = 0; q < ready.length; q++) {
    const k = ready[q]
    const t = to[k]
    if (t < 0) continue
    acc[t] += acc[k]
    if (--into[t] === 0) ready.push(t)
  }
  return { to, acc }
}

/**
 * The streams: the nodes draining at least `minNodes`, traced from each head down. Where streams meet, the one with
 * the larger flow goes on and the others end there, flowing into it; a stream ends at the box's edge. Points every
 * node, from the head down.
 */
export function streams(g: Grid, to: Int32Array, acc: Float64Array, minNodes: number): Stream[] {
  const { nx } = g
  const n = to.length
  const channel = (k: number) => acc[k] >= minNodes
  // each channel node's channel inflows: a head has none
  const inflow = new Int32Array(n)
  for (let k = 0; k < n; k++) if (channel(k) && to[k] >= 0 && channel(to[k])) inflow[to[k]]++
  // the inflow that carries on through a node: the largest (its main stem)
  const main = new Int32Array(n).fill(-1)
  for (let k = 0; k < n; k++) {
    const d = to[k]
    if (!channel(k) || d < 0 || !channel(d)) continue
    if (main[d] < 0 || acc[k] > acc[main[d]]) main[d] = k
  }
  const at = (k: number): [number, number] => {
    const i = k % nx
    const j = (k - i) / nx
    return [g.x0 + i * g.cell, g.z0 + j * g.cell]
  }
  // each stream starts at a head (a channel node with no channel inflow) and goes down while each step is its target's
  // main stem; at a join the smaller one ends, so every channel node is in one stream
  const owner = new Int32Array(n).fill(-1)
  const out: Stream[] = []
  const heads: number[] = []
  for (let k = 0; k < n; k++) if (channel(k) && inflow[k] === 0) heads.push(k)
  const lines: { pts: number[]; end: number }[] = []
  for (const h of heads) {
    const pts = [h]
    let k = h
    for (;;) {
      const d = to[k]
      if (d < 0 || !channel(d) || main[d] !== k) {
        lines.push({ pts, end: d >= 0 && channel(d) ? d : -1 })
        break
      }
      pts.push(d)
      k = d
    }
  }
  lines.forEach((l, id) => {
    for (const k of l.pts) owner[k] = id
  })
  lines.forEach((l, id) => {
    const last = l.pts[l.pts.length - 1]
    // where it ends: the join (its point too, so the line reaches the one it flows into), or the edge
    const pts = l.end >= 0 ? [...l.pts, l.end] : l.pts
    out.push({
      id,
      pts: pts.map(at),
      km2: (acc[last] * g.cell * g.cell) / 1e6,
      into: l.end >= 0 ? owner[l.end] : null,
    })
  })
  return out
}

/**
 * A line with the points closer than `tol` m to the segment between their kept neighbours left out (Douglas–Peucker,
 * by the distance to the segment, so a hairpin's far points stay), and every point `keep` holds kept (where another
 * stream joins it).
 */
export function simplify(
  pts: [number, number][],
  tol: number,
  keep: (p: [number, number]) => boolean = () => false,
): [number, number][] {
  if (pts.length < 3) return pts
  const kept = new Uint8Array(pts.length)
  kept[0] = kept[pts.length - 1] = 1
  for (let k = 1; k < pts.length - 1; k++) if (keep(pts[k])) kept[k] = 1
  // between each pair of points kept so far, split at the farthest from their segment while it is farther than tol
  const marks = kept.reduce<number[]>((a, v, k) => (v ? [...a, k] : a), [])
  const stack: [number, number][] = marks.slice(1).map((b, k) => [marks[k], b])
  while (stack.length) {
    const [a, b] = stack.pop()!
    const [ax, az] = pts[a]
    const [bx, bz] = pts[b]
    const dx = bx - ax
    const dz = bz - az
    const L2 = dx * dx + dz * dz
    let far = -1
    let dmax = tol
    for (let k = a + 1; k < b; k++) {
      const [px, pz] = pts[k]
      const t = L2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2)) : 0
      const d = Math.hypot(px - (ax + t * dx), pz - (az + t * dz))
      if (d > dmax) {
        dmax = d
        far = k
      }
    }
    if (far >= 0) {
      kept[far] = 1
      stack.push([a, far], [far, b])
    }
  }
  return pts.filter((_, k) => kept[k])
}

/**
 * The grid evened by `passes` passes of a 3 × 3 mean (its edge rows kept): the file's 1 cm steps make flats a fill
 * routes straight across; evened, the flow follows the valley's shape. A valley floor moves by well under a node.
 */
export function evened(g: Grid, passes: number): Grid {
  let h = g.h
  const { nx, nz } = g
  for (let p = 0; p < passes; p++) {
    const o = Float64Array.from(h)
    for (let j = 1; j < nz - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        let sum = 0
        for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) sum += h[(j + b) * nx + i + a]
        o[j * nx + i] = sum / 9
      }
    }
    h = o
  }
  return { ...g, h }
}

/** The streams of a grid over a threshold, evened first, simplified to `tol` m with their joins kept. */
export function streamsOf(g: Grid, minKm2: number, tol = 3, passes = 2): Stream[] {
  const ge = evened(g, passes)
  // filled level (no epsilon): its flats are resolved by drainage
  const { h } = fill(ge, 0)
  const { to, acc } = drainage(ge, h)
  const raw = streams(ge, to, acc, (minKm2 * 1e6) / (g.cell * g.cell))
  // the points other streams end on: each kept on the stream it joins
  const joins = new Set(raw.filter(s => s.into !== null).map(s => s.pts[s.pts.length - 1].join(',')))
  return raw.map(s => ({ ...s, pts: simplify(s.pts, tol, p => joins.has(p.join(','))) }))
}

/** The part of a heightfield file inside a box of its frame, as a grid of its nodes. */
export function gridOf(d: Dem, box: [number, number, number, number]): Grid {
  const { x: hx, z: hz } = demHalf(d)
  const i0 = Math.max(0, Math.ceil((box[0] + hx) / d.cell))
  const j0 = Math.max(0, Math.ceil((box[1] + hz) / d.cell))
  const i1 = Math.min(d.nx - 1, Math.floor((box[2] + hx) / d.cell))
  const j1 = Math.min(d.nz - 1, Math.floor((box[3] + hz) / d.cell))
  const nx = i1 - i0 + 1
  const nz = j1 - j0 + 1
  const h = new Float64Array(nx * nz)
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) h[j * nx + i] = d.base + d.cm[(j + j0) * d.nx + i + i0] / 100
  }
  return { nx, nz, cell: d.cell, x0: i0 * d.cell - hx, z0: j0 * d.cell - hz, h }
}

function main(): void {
  const [file, ...rest] = process.argv.slice(2)
  const [x0, z0, x1, z1, km2] = rest.slice(0, 5).map(Number)
  const out = rest[5]
  if (!file || ![x0, z0, x1, z1, km2].every(Number.isFinite) || !out) {
    console.error('usage: node tools/streams.ts <file.rdem> <x0> <z0> <x1> <z1> <min km²> <out.json>')
    process.exit(2)
  }
  const d = decodeRdem(new Uint8Array(fs.readFileSync(file)))
  const g = gridOf(d, [x0, z0, x1, z1])
  const t0 = performance.now()
  const found = streamsOf(g, km2)
  fs.writeFileSync(out, JSON.stringify(found))
  const ms = performance.now() - t0
  console.log(`${found.length} streams draining over ${km2} km², ${g.nx} × ${g.nz} nodes, ${ms.toFixed(0)} ms → ${out}`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) main()
