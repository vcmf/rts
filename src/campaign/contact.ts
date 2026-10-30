// When two moving things meet (the campaign proposal, PR #234: Contact and battle): the first moment two tracks come
// within a radius, found exactly rather than at a tick (a 10-minute tick finds two corps closing at 6 km/h up to
// 10 minutes and a kilometre late), so corps meet and couriers are caught where they do; and which battle a contact
// joins.
import type { CampaignRules } from './rules.ts'
import { positionsAt, type Track } from './track.ts'

/** Every time either track turns (its waypoints' times) inside [t0, t1], with t0 and t1, in order. */
function breakpoints(a: Track, b: Track, t0: number, t1: number): number[] {
  const times = [t0, t1]
  for (const w of a) if (w.t > t0 && w.t < t1) times.push(w.t)
  for (const w of b) if (w.t > t0 && w.t < t1) times.push(w.t)
  times.sort((p, q) => p - q)
  return times.filter((t, k) => k === 0 || t > times[k - 1])
}

/**
 * The separation of b from a over one interval between breakpoints, where both move in straight lines: d(s) =
 * d0 + v·s for s in [0, span], s from the interval's start. Within the radius r where |d(s)|² ≤ r², which is
 * qa·s² + 2·half·s + c ≤ 0 (qa = |v|², half = d0·v, c = |d0|² − r²): between the roots s1 ≤ s2.
 */
interface Interval {
  ts: number
  span: number
  qa: number
  half: number
  c: number
}

/** The intervals of [t0, t1] between the two tracks' breakpoints, each with its separation's quadratic. */
function intervals(a: Track, b: Track, radius: number, t0: number, t1: number): Interval[] {
  if (t1 < t0) throw new RangeError(`contact: the window ends (${t1}) before it starts (${t0})`)
  const times = breakpoints(a, b, t0, t1)
  const pa = positionsAt(a, times)
  const pb = positionsAt(b, times)
  const out: Interval[] = []
  const last = Math.max(1, times.length - 1)
  for (let k = 0; k < last; k++) {
    const e = Math.min(k + 1, times.length - 1)
    const span = times[e] - times[k]
    const dx = pb[k].x - pa[k].x
    const dz = pb[k].z - pa[k].z
    const vx = span > 0 ? (pb[e].x - pa[e].x - dx) / span : 0
    const vz = span > 0 ? (pb[e].z - pa[e].z - dz) / span : 0
    out.push({
      ts: times[k],
      span,
      qa: vx * vx + vz * vz,
      half: dx * vx + dz * vz,
      c: dx * dx + dz * dz - radius * radius,
    })
  }
  return out
}

/** The roots s1 ≤ s2 of an interval's quadratic, or null when the separation never comes within the radius. */
function roots(iv: Interval): [number, number] | null {
  if (iv.qa === 0) return iv.c <= 0 ? [-Infinity, Infinity] : null
  const disc = iv.half * iv.half - iv.qa * iv.c
  if (disc < 0) return null
  const root = Math.sqrt(disc)
  return [(-iv.half - root) / iv.qa, (-iv.half + root) / iv.qa]
}

/**
 * The earliest time in [t0, t1] at which tracks a and b are within `radius` metres, or null if they never are:
 * per interval, the first s in [0, span] between the roots. A pair exactly on the radius counts as within it or not
 * as the arithmetic rounds: the same on every machine (decision 0006), and no tolerance is added for it.
 */
export function firstContact(a: Track, b: Track, radius: number, t0: number, t1: number): number | null {
  for (const iv of intervals(a, b, radius, t0, t1)) {
    // already within at the interval's start: exact, where the roots of a separating pair can round past it
    if (iv.c <= 0) return iv.ts
    const r = roots(iv)
    if (r === null) continue
    const from = Math.max(0, r[0])
    if (from <= Math.min(iv.span, r[1])) return iv.ts + from
  }
  return null
}

/** A battle being fought, as far as the contact rule reads it: where it is, and its zone's radius (zoneFor). */
export interface BattleSite {
  x: number
  z: number
  zoneM: number
}

/**
 * A battle's zone, a radius in metres: the ruleset's, never more than half its map's side (so the zone lies inside
 * the map that is fought on) and never less than the contact radius (so an enemy that engages a corps fighting at
 * the battle's heart joins that battle rather than starting another: no corps is in two battles).
 */
export function zoneFor(rules: CampaignRules, mapSideM: number): number {
  return Math.max(rules.contactRadiusM, Math.min(rules.battleZoneM, mapSideM / 2))
}

/**
 * The battle a contact at (x, z) joins: of those whose zone holds it, the nearest (the lowest index on a tie), or
 * -1 when it lies in none and starts a battle of its own (Plancenoit was part of Waterloo; Wavre, 15 km away, was
 * not).
 */
export function battleFor(battles: BattleSite[], x: number, z: number): number {
  let best = -1
  let bestD2 = Infinity
  for (let k = 0; k < battles.length; k++) {
    const dx = battles[k].x - x
    const dz = battles[k].z - z
    const d2 = dx * dx + dz * dz
    if (d2 <= battles[k].zoneM * battles[k].zoneM && d2 < bestD2) {
      best = k
      bestD2 = d2
    }
  }
  return best
}
