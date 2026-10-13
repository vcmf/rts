// Shared edges (docs/plans/active/m3d-follow.md, docs/proposals/map-engine.md §3.2): an area's edge that follows
// part of another feature's line, offset to one side, so a wood bounded by a stream shares the stream's bank
// (TopoJSON's arcs, docs/research/map-language.md §6). `from` and `to` snap to the nearest points of the line as
// expanded, so the edge moves with a meander; the edge runs along the line between them, in the order given.
import type { Feature, Pt } from './schema.ts'
import { nearLine } from './apply.ts'
import { stretch } from './geometry.ts'
import { cm } from './util.ts'

export interface FollowEdge { id: string; side: 'left' | 'right'; offset?: number; from: Pt; to: Pt; at?: number }
export const FOLLOW_KEYS = ['id', 'side', 'offset', 'from', 'to', 'at']
// a feature's shared edges: none, one, or a list
export const followsOf = (f: Feature): FollowEdge[] => (f.follow === undefined ? [] : (Array.isArray(f.follow) ? f.follow : [f.follow]) as FollowEdge[])

// Where two segments p→q and r→s cross (touching included), as the fraction along p→q; null when they do not
function meet(p: Pt, q: Pt, r: Pt, s: Pt): number | null {
  const ux = q[0] - p[0], uz = q[1] - p[1], vx = s[0] - r[0], vz = s[1] - r[1], den = ux * vz - uz * vx
  if (den === 0) return null
  const t = ((r[0] - p[0]) * vz - (r[1] - p[1]) * vx) / den, u = ((r[0] - p[0]) * uz - (r[1] - p[1]) * ux) / den
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null
}
// An offset curve folds over itself on the inner side of a bend (where a segment is shorter than the offset asks):
// each loop is cut out at the point where the curve first meets itself again
function untangle(pts: Pt[]): Pt[] {
  let out = pts
  for (let i = 0; i + 1 < out.length; i++) {
    for (let j = out.length - 2; j >= i + 2; j--) {
      const t = meet(out[i], out[i + 1], out[j], out[j + 1])
      if (t === null) continue
      const x: Pt = [out[i][0] + t * (out[i + 1][0] - out[i][0]), out[i][1] + t * (out[i + 1][1] - out[i][1])]
      out = [...out.slice(0, i + 1), x, ...out.slice(j + 1)]
      break
    }
  }
  return out
}

// An offset point that steps backwards against the line (an inner bend shorter than the offset) folds the curve
// into a spike: dropped, walking from the start, then from the end. `dirs[k]`: the line's direction into point k
function forwardOnly(pts: Pt[], dirs: Pt[]): Pt[] {
  const walk = (ps: Pt[], ds: Pt[], sign: number) => {
    const keep = [0]
    for (let k = 1; k < ps.length; k++) {
      const l = ps[keep[keep.length - 1]], dx = ps[k][0] - l[0], dz = ps[k][1] - l[1]
      if (sign * (dx * ds[k][0] + dz * ds[k][1]) > 0) keep.push(k)
    }
    return keep
  }
  const fwd = walk(pts, dirs, 1), p1 = fwd.map(k => pts[k]), d1 = fwd.map(k => dirs[k])
  // backwards: the direction into point k is the line's direction out of it, reversed
  const back = walk([...p1].reverse(), [...d1.slice(1), d1[d1.length - 1]].reverse(), -1)
  return back.map(k => p1[p1.length - 1 - k]).reverse()
}

// The edge's points: the line's stretch between the points nearest `from` and `to`, each moved `reach + offset` to
// the side (left: left of the line's own direction; `reach`: how far the line paints, apply's lineReach). A vertex
// moves along the mean of its two segments' normals, lengthened to keep the offset from both (a mitre), at most
// twice the offset, so a sharp turn cannot shoot out; the loops an inner bend makes are cut out; the points are on
// whole centimetres, none repeated.
export function followEdge(line: Pt[], halfWidth: number, e: FollowEdge): Pt[] {
  const a = nearLine(line, e.from[0], e.from[1]).along, b = nearLine(line, e.to[0], e.to[1]).along
  if (a === b) throw new Error(`"from" and "to" meet the same point of "${e.id}": the edge along it has no length`)
  const part = stretch(line, Math.min(a, b), Math.max(a, b)).filter((p, k, ps) => k === 0 || p[0] !== ps[k - 1][0] || p[1] !== ps[k - 1][1])
  const d = halfWidth + (e.offset ?? 0), s = e.side === 'left' ? 1 : -1
  const normal = (k: number): [number, number] => {   // the left normal of segment k
    const dx = part[k + 1][0] - part[k][0], dz = part[k + 1][1] - part[k][1], l = Math.sqrt(dx * dx + dz * dz)
    return [-dz / l, dx / l]
  }
  const out = part.map((p, k) => {
    const n0 = normal(Math.max(0, k - 1)), n1 = normal(Math.min(part.length - 2, k))
    let mx = n0[0] + n1[0], mz = n0[1] + n1[1]
    const ml = Math.sqrt(mx * mx + mz * mz) || 1
    mx /= ml; mz /= ml
    const cos = mx * n1[0] + mz * n1[1], len = Math.min(2 * d, d / Math.max(cos, 1e-9))
    return [p[0] + s * mx * len, p[1] + s * mz * len] as Pt
  })
  const dirs = part.map((_, k) => { const n = normal(Math.max(0, k - 1)); return [n[1], -n[0]] as Pt })   // the segment into k
  const pts = untangle(forwardOnly(out, dirs)).map(([x, z]) => [cm(x), cm(z)] as Pt).filter((p, k, ps) => k === 0 || p[0] !== ps[k - 1][0] || p[1] !== ps[k - 1][1])
  return a <= b ? pts : pts.reverse()
}
