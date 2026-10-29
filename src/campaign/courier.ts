// Calling for help (docs/proposals/campaign.md, Calling for help): a courier rides the fastest road to an ally; if
// its road crosses an enemy's contact zone it is caught there and its message lost (and read by the enemy). Help
// that is called arrives when the courier has ridden, the corps has got under way and has marched, its tail a
// column's length after its head.
import { firstContact, firstExit, within } from './contact.ts'
import { arrival } from './march.ts'
import type { CampaignRules } from './rules.ts'
import { positionAt, walk, type Track } from './track.ts'

/** A courier's ride: delivered at `atMin`, or caught by enemy `by` at `atMin` and position (x, z). */
export type Ride =
  { delivered: true; atMin: number } | { delivered: false; atMin: number; by: number; x: number; z: number }

/**
 * A courier leaving at `startMin` along its route (points in metres, the fastest road), with the enemies' tracks
 * over the day: caught by the first enemy (by time, then by index) whose contact radius it enters, else delivered
 * at the route's end. An enemy whose zone it starts in (the one its corps is fighting) catches it only if it rides
 * out and comes back in: a call for help leaves from the battle. A route of one point (the ally in the same town)
 * is delivered at once.
 */
export function ride(
  rules: CampaignRules,
  route: { x: number; z: number }[],
  startMin: number,
  enemies: Track[],
): Ride {
  if (route.length < 2) return { delivered: true, atMin: startMin }
  const speed = (rules.courierKmPerHour * 1000) / 60
  const courier = walk(route, startMin, speed)
  const r2 = rules.contactRadiusM * rules.contactRadiusM
  const end = courier[courier.length - 1].t
  let caughtAt = Infinity
  let by = -1
  for (let k = 0; k < enemies.length; k++) {
    const t = entry(courier, enemies[k], rules.contactRadiusM, r2, startMin, end)
    if (t !== null && t < caughtAt) {
      caughtAt = t
      by = k
    }
  }
  if (by < 0) return { delivered: true, atMin: end }
  const at = positionAt(courier, caughtAt)
  return { delivered: false, atMin: caughtAt, by, x: at.x, z: at.z }
}

/**
 * The first time the courier enters the enemy's zone in [t0, t1]; if it starts inside, the first time it comes back
 * in after leaving it (the search for contact starts just past its exact exit, which is on the zone's edge).
 */
function entry(courier: Track, enemy: Track, radius: number, r2: number, t0: number, t1: number): number | null {
  if (!within(courier, enemy, r2, t0)) return firstContact(courier, enemy, radius, t0, t1)
  const out = firstExit(courier, enemy, radius, t0, t1)
  if (out === null) return null
  // past the edge by a hair, or the search would find the exit itself as a contact
  return firstContact(courier, enemy, radius, Math.min(t1, out + 1e-6), t1)
}

/** Whether an ally `routeM` metres away by road is within reach of a call for help. */
export function inHelpRadius(rules: CampaignRules, routeM: number): boolean {
  return routeM <= rules.helpRadiusM
}

/**
 * The help a delivered call brings: the corps hears it at `heardMin`, gets under way, and marches `marchM` metres
 * by road at a forced march; when its head and its tail reach the battle, and the share of its strength with it (the
 * forced march leaves stragglers behind: they rejoin later).
 */
export function help(
  rules: CampaignRules,
  units: number,
  heardMin: number,
  marchM: number,
): { headMin: number; tailMin: number; strength: number } {
  const { headMin, tailMin } = arrival(rules, 'forced', units, marchM, heardMin + rules.underWayMin)
  return { headMin, tailMin, strength: 1 - rules.forcedStragglers }
}
