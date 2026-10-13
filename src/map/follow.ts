// Shared edges (docs/plans/active/m3d-follow.md, docs/proposals/map-engine.md §3.2): an area's edge that follows
// part of another feature's line, offset to one side, so a wood bounded by a stream shares the stream's bank
// (TopoJSON's arcs, docs/research/map-language.md §6). `from` and `to` snap to the nearest points of the line as
// expanded, so the edge moves with a meander; the edge runs along the line between them, in the order given.
import type { Feature, Pt } from './schema.ts'
import { nearLine } from './apply.ts'
import { stretch } from './geometry.ts'
import { cm } from './util.ts'
import { lineDistance } from './reach.ts'
import { atan2, cos, sin, PI } from '../sim/num.ts'

export interface FollowEdge { id: string; side: 'left' | 'right'; offset?: number; from: Pt; to: Pt; at?: number }
export const FOLLOW_KEYS = ['id', 'side', 'offset', 'from', 'to', 'at']
// a feature's shared edges: none, one, or a list
export const followsOf = (f: Feature): FollowEdge[] => (f.follow === undefined ? [] : (Array.isArray(f.follow) ? f.follow : [f.follow]) as FollowEdge[])

// Where two segments p→q and r→s cross (touching included), as the fraction along p→q; null when they do not or
// when they are parallel (an offset curve's folds are never parallel to what they cross)
function meet(p: Pt, q: Pt, r: Pt, s: Pt): number | null {
  const ux = q[0] - p[0], uz = q[1] - p[1], vx = s[0] - r[0], vz = s[1] - r[1], den = ux * vz - uz * vx
  if (den === 0) return null
  const t = ((r[0] - p[0]) * vz - (r[1] - p[1]) * vx) / den, u = ((r[0] - p[0]) * uz - (r[1] - p[1]) * ux) / den
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null
}
// An offset curve folds over itself at inner corners: each loop is cut out where the curve first meets itself again
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

const ARC_STEP = PI / 12   // an outer corner's arc, in steps of at most 15°
const SAMPLE = 2           // m: offset points along each segment, at most this far apart
const TOL = 0.02           // m: the rounding to centimetres, and the arithmetic's slack
const MERGE = 0.05         // m: points closer than this to the one before are one

// The edge's points: the line's stretch between the points nearest `from` and `to`, at `reach + offset` from it on
// its side (left: left of the line's own direction; `reach`: where apply stops painting the line, lineReach):
// - points along each segment (every SAMPLE m and its ends) moved along its normal, and at each outer corner an arc
//   about the vertex whose chords stay outside the distance (a polygon around the circle);
// - every point closer to the line than the distance dropped (the inner side of a bend: the points of a segment
//   that its neighbours come too close to). What is left of an inner bend is locally convex, so a chord between
//   two kept points stays outside the distance;
// - the loops left by a bend tighter than the distance cut out where the curve meets itself.
// The edge is then measured against the line, chord by chord, exactly: a bend too tight for the distance (a hairpin
// narrower than twice it) is an error naming where, never an edge inside the line.
export function followEdge(line: Pt[], halfWidth: number, e: FollowEdge): Pt[] {
  const a = nearLine(line, e.from[0], e.from[1]).along, b = nearLine(line, e.to[0], e.to[1]).along
  const part = a === b ? [] : stretch(line, Math.min(a, b), Math.max(a, b)).filter((p, k, ps) => k === 0 || p[0] !== ps[k - 1][0] || p[1] !== ps[k - 1][1])
  if (part.length < 2) throw new Error(`"from" and "to" meet the same point of "${e.id}": the edge along it has no length`)
  const d = halfWidth + (e.offset ?? 0), s = e.side === 'left' ? 1 : -1
  // the side's unit normal of segment k
  const nrm = (k: number): Pt => { const dx = part[k + 1][0] - part[k][0], dz = part[k + 1][1] - part[k][1], l = Math.sqrt(dx * dx + dz * dz); return [-s * dz / l, s * dx / l] }
  const raw: Pt[] = []
  for (let k = 0; k + 1 < part.length; k++) {
    const n = nrm(k), [px, pz] = part[k], [qx, qz] = part[k + 1]
    if (k > 0) {
      // an outer corner (the line turns away from the side: turn > 0 is a left turn, whose outside is the right):
      // an arc of points about the vertex
      const m = nrm(k - 1), turn = m[0] * n[1] - m[1] * n[0], ang = Math.abs(atan2(turn, m[0] * n[0] + m[1] * n[1]))
      if (s * turn < 0 && ang > 1e-9) {
        const steps = Math.ceil(ang / ARC_STEP), r = d / cos(ang / steps / 2), a0 = atan2(m[1], m[0])
        for (let q = 0; q < steps; q++) { const t = a0 + Math.sign(turn) * (q + 0.5) * ang / steps; raw.push([px + cos(t) * r, pz + sin(t) * r]) }
      }
    }
    const L = Math.sqrt((qx - px) * (qx - px) + (qz - pz) * (qz - pz)), steps = Math.max(1, Math.ceil(L / SAMPLE))
    for (let q = 0; q <= steps; q++) { const t = q / steps; raw.push([px + (qx - px) * t + n[0] * d, pz + (qz - pz) * t + n[1] * d]) }
  }
  // kept: points at the full distance (measured before rounding, so a neighbour's overlap at an inner corner goes),
  // on whole centimetres, none within MERGE of the one before, and none in the middle of a straight run
  const far = (p: Pt) => nearLine(part, p[0], p[1]).d >= d - 1e-9
  const tidy = (ps: Pt[]) => {
    const out: Pt[] = []
    for (const [x, z] of ps) {
      const p: Pt = [cm(x), cm(z)], l = out[out.length - 1]
      if (l && (p[0] - l[0]) * (p[0] - l[0]) + (p[1] - l[1]) * (p[1] - l[1]) < MERGE * MERGE) continue
      const o = out[out.length - 2]
      if (o && (l[0] - o[0]) * (p[1] - o[1]) - (l[1] - o[1]) * (p[0] - o[0]) === 0 && (l[0] - o[0]) * (p[0] - l[0]) + (l[1] - o[1]) * (p[1] - l[1]) > 0) out.pop()
      out.push(p)
    }
    return out
  }
  const pts = tidy(untangle(tidy(raw.filter(far))))
  if (pts.length < 2) throw new Error(`"${e.id}" bends too tightly between "from" and "to" for an edge ${d} m from it: move them, or lower the offset`)
  for (let k = 0; k + 1 < pts.length; k++) {
    const g = lineDistance([pts[k], pts[k + 1]], part)
    if (g < d - TOL) throw new Error(`"${e.id}" bends too tightly near [${pts[k].map(v => Math.round(v)).join(', ')}] for an edge ${d} m from it (it comes within ${g.toFixed(2)} m): move "from" or "to", or lower the offset`)
  }
  return a <= b ? pts : pts.reverse()
}
