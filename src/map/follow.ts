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

// The edge's points: the line's stretch between the points nearest `from` and `to`, each moved `halfWidth + offset`
// to the side (left: left of the line's own direction). A vertex moves along the mean of its two segments' normals,
// lengthened to keep the offset from both (a mitre), at most twice the offset, so a sharp turn cannot shoot out.
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
    return [cm(p[0] + s * mx * len), cm(p[1] + s * mz * len)] as Pt
  })
  return a <= b ? out : out.reverse()
}
