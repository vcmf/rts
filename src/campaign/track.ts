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
  const first = track[0]
  if (t <= first.t) return { x: first.x, z: first.z }
  for (let k = 1; k < track.length; k++) {
    const b = track[k]
    if (t <= b.t) {
      const a = track[k - 1]
      const u = (t - a.t) / (b.t - a.t)
      return { x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u }
    }
  }
  const last = track[track.length - 1]
  return { x: last.x, z: last.z }
}

/**
 * The track of something leaving the start of a route (points in metres) at `startMin` and keeping to it at
 * `speed` metres a minute, to its end.
 */
export function walk(points: { x: number; z: number }[], startMin: number, speed: number): Track {
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
