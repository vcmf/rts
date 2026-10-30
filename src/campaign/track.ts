// A moving thing on the campaign map as a track (docs/proposals/campaign.md, A turn is a timeline): timed waypoints,
// the position linear between them, still before the first and after the last. A corps' head on its route and a
// courier on its ride are tracks; contact.ts finds when two of them meet.

/** A waypoint: a time in minutes and a position in metres (x east, z north). */
export interface Waypoint {
  t: number
  x: number
  z: number
}

/** Timed waypoints, their times strictly rising. */
export type Track = Waypoint[]

/** The position on a track at time t. */
export function positionAt(track: Track, t: number): { x: number; z: number } {
  return positionsAt(track, [t])[0]
}

/**
 * The positions on a track at rising times, in one sweep along the track (positionAt for each would scan it from
 * the start every time: quadratic on a long route).
 */
export function positionsAt(track: Track, times: number[]): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = []
  let k = 1
  for (const t of times) {
    while (k < track.length && track[k].t < t) k++
    if (t <= track[0].t || k >= track.length) {
      const w = t <= track[0].t ? track[0] : track[track.length - 1]
      out.push({ x: w.x, z: w.z })
      continue
    }
    const a = track[k - 1]
    const b = track[k]
    const u = (t - a.t) / (b.t - a.t)
    out.push({ x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u })
  }
  return out
}

/**
 * The track of something leaving the start of a route (points in metres) at `startMin` and keeping to it at
 * `speed` metres a minute, to its end.
 */
export function walk(points: { x: number; z: number }[], startMin: number, speed: number): Track {
  if (!points.length) throw new RangeError('walk: a route of no points')
  const track: Track = [{ t: startMin, x: points[0].x, z: points[0].z }]
  let t = startMin
  for (let k = 1; k < points.length; k++) {
    const a = points[k - 1]
    const b = points[k]
    const length = Math.sqrt((b.x - a.x) * (b.x - a.x) + (b.z - a.z) * (b.z - a.z))
    if (length === 0) continue
    t += length / speed
    track.push({ t, x: b.x, z: b.z })
  }
  return track
}

/** A thing standing still at a point, as a track. */
export function standing(x: number, z: number, t = 0): Track {
  return [{ t, x, z }]
}
