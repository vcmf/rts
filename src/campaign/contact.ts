// When two moving things meet (docs/proposals/campaign.md, Contact and battle): the first moment two tracks come
// within a radius, found exactly rather than at the next tick, so two corps on one road meet at the minute they do
// and a courier is caught where it enters an enemy's zone. And whether a contact joins a battle being fought or
// starts its own.
import { positionAt, type Track } from './track.ts'

/** Every time either track turns (its waypoints' times) inside [t0, t1], with t0 and t1, in order. */
function breakpoints(a: Track, b: Track, t0: number, t1: number): number[] {
  const times = [t0, t1]
  for (const w of a) if (w.t > t0 && w.t < t1) times.push(w.t)
  for (const w of b) if (w.t > t0 && w.t < t1) times.push(w.t)
  times.sort((p, q) => p - q)
  return times.filter((t, k) => k === 0 || t > times[k - 1])
}

/**
 * The earliest time in [t0, t1] at which tracks a and b are within `radius` metres, or null if they never are.
 * Between breakpoints both move in straight lines, so their separation is d(s) = d0 + v·s: within the radius where
 * |d0 + v·s|² ≤ r², a quadratic in s, whose first root is the moment of contact.
 */
export function firstContact(a: Track, b: Track, radius: number, t0: number, t1: number): number | null {
  const times = breakpoints(a, b, t0, t1)
  const r2 = radius * radius
  for (let k = 0; k < times.length - 1; k++) {
    const ts = times[k]
    const te = times[k + 1]
    const pa = positionAt(a, ts)
    const pb = positionAt(b, ts)
    const qa = positionAt(a, te)
    const qb = positionAt(b, te)
    const dx = pb.x - pa.x
    const dz = pb.z - pa.z
    if (dx * dx + dz * dz <= r2) return ts
    const span = te - ts
    // the separation's change a minute
    const vx = (qb.x - qa.x - dx) / span
    const vz = (qb.z - qa.z - dz) / span
    const qa2 = vx * vx + vz * vz
    if (qa2 === 0) continue
    const half = dx * vx + dz * vz
    const disc = half * half - qa2 * (dx * dx + dz * dz - r2)
    if (disc < 0) continue
    const s = (-half - Math.sqrt(disc)) / qa2
    if (s >= 0 && s <= span) return ts + s
  }
  return null
}

/** A battle being fought, as far as the contact rule reads it: where it is. */
export interface BattleSite {
  x: number
  z: number
}

/**
 * The battle a contact at (x, z) joins: the first (lowest index) whose centre lies within `zoneM`, or -1 when it
 * lies in none and starts a battle of its own (Plancenoit was part of Waterloo; Wavre, 15 km away, was not).
 */
export function battleFor(battles: BattleSite[], x: number, z: number, zoneM: number): number {
  const z2 = zoneM * zoneM
  for (let k = 0; k < battles.length; k++) {
    const dx = battles[k].x - x
    const dz = battles[k].z - z
    if (dx * dx + dz * dz <= z2) return k
  }
  return -1
}
