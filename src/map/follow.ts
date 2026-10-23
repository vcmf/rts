// Shared edges (docs/plans/done/m3d-follow.md, docs/proposals/map-engine.md §3.2, decision 0030): an area's edge
// that is part of another feature's line, so a wood bounded by a stream shares the stream's bank (TopoJSON's arcs,
// docs/research/map-language.md §6). The edge is the line itself: its centreline between the points nearest `from`
// and `to`, as expanded (so it moves with a meander). Expansion puts those points into the area's outer ring and
// records `clear: [{ id, offset }]`; apply then paints none of the area's cells that the line takes (or within
// `offset` m more), measured by the line's own painting rule. No cell is both, and none between is left out.
import type { Feature, Pt } from './schema.ts'
import { nearLine } from './apply.ts'
import { lineLength, stretch } from './geometry.ts'
import { cm, listOf } from './util.ts'

export interface FollowEdge { id: string; offset?: number; from: Pt; to: Pt; at?: number }
export const FOLLOW_KEYS = ['id', 'offset', 'from', 'to', 'at']
export const CLEAR_KEYS = ['id', 'offset']
// the categories whose areas apply paints cell by cell, honouring `clear`: the only ones that may follow or keep off
export const KEEPS_OFF = ['ground', 'veg', 'built', 'work', 'zone']
export const followsOf = (f: Feature): FollowEdge[] => listOf<FollowEdge>(f.follow)

// The edge's points: the line's centreline between the points nearest `from` and `to`, in that order. On a closed
// line (a loop of hedge or road) the shorter way round, across its first point when that is shorter
export function followEdge(line: Pt[], e: FollowEdge): Pt[] {
  const a = nearLine(line, e.from[0], e.from[1]).along, b = nearLine(line, e.to[0], e.to[1]).along
  const lo = Math.min(a, b), hi = Math.max(a, b), len = lineLength(line), last = line[line.length - 1]
  const closed = line.length > 3 && last[0] === line[0][0] && last[1] === line[0][1]
  // from lo to hi along the line; or, across the first point, from hi to the end and on from the start to lo
  const across = closed && len - (hi - lo) < hi - lo
  const raw = a === b ? [] : across ? [...stretch(line, hi, len), ...stretch(line, 0, lo)] : stretch(line, lo, hi)
  // on whole centimetres (the stretch's two ends fall anywhere on the line; its other points are the line's own)
  const part = raw.map(([x, z]) => [cm(x), cm(z)] as Pt).filter((p, k, ps) => k === 0 || p[0] !== ps[k - 1][0] || p[1] !== ps[k - 1][1])
  if (part.length < 2) throw new Error(`"from" and "to" meet the same point of "${e.id}": the edge along it has no length`)
  // in the order from → to: the plain stretch runs lo → hi, the one across runs hi → lo
  return (a <= b) !== across ? part : part.reverse()
}
