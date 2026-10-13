// Shared edges (docs/plans/active/m3d-follow.md, docs/proposals/map-engine.md §3.2, decision 0025): an area's edge
// that is part of another feature's line, so a wood bounded by a stream shares the stream's bank (TopoJSON's arcs,
// docs/research/map-language.md §6). The edge is the line itself: its centreline between the points nearest `from`
// and `to`, as expanded (so it moves with a meander). Expansion puts those points into the area's outer ring and
// records `clear: [{ id, offset }]`; apply then paints none of the area's cells that the line takes (or within
// `offset` m more), measured by the line's own painting rule. No cell is both, and none between is left out.
import type { Feature, Pt } from './schema.ts'
import { nearLine } from './apply.ts'
import { stretch } from './geometry.ts'
import { cm } from './util.ts'

export interface FollowEdge { id: string; offset?: number; from: Pt; to: Pt; at?: number }
export const FOLLOW_KEYS = ['id', 'offset', 'from', 'to', 'at']
export interface Clear { id: string; offset?: number }
export const CLEAR_KEYS = ['id', 'offset']
// one or a list, as a list
export const listOf = <T>(v: unknown): T[] => (v === undefined ? [] : (Array.isArray(v) ? v : [v]) as T[])
export const followsOf = (f: Feature): FollowEdge[] => listOf<FollowEdge>(f.follow)

// The edge's points: the line's centreline between the points nearest `from` and `to`, in that order
export function followEdge(line: Pt[], e: FollowEdge): Pt[] {
  const a = nearLine(line, e.from[0], e.from[1]).along, b = nearLine(line, e.to[0], e.to[1]).along
  // on whole centimetres (the stretch's two ends fall anywhere on the line; its other points are the line's own)
  const part = a === b ? [] : stretch(line, Math.min(a, b), Math.max(a, b)).map(([x, z]) => [cm(x), cm(z)] as Pt).filter((p, k, ps) => k === 0 || p[0] !== ps[k - 1][0] || p[1] !== ps[k - 1][1])
  if (part.length < 2) throw new Error(`"from" and "to" meet the same point of "${e.id}": the edge along it has no length`)
  return a <= b ? part : part.reverse()
}
