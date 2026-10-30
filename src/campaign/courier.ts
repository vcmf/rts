// Calling for help (the campaign proposal, PR #234: Calling for help): a courier rides the fastest road to an ally; if
// it comes within the contact zone of an enemy other than those its corps is fighting, it is caught there and its
// message lost (and read by the enemy). Help that is called arrives when the courier has ridden, the corps has got
// under way and has marched, its tail a column's length after its head.
import { firstContact } from './contact.ts'
import { arrival, dayMarch } from './march.ts'
import type { CampaignRules } from './rules.ts'
import { positionAt, walk, type Track } from './track.ts'

/** A courier's ride: delivered at `atMin`, or caught by enemy `by` at `atMin` and position (x, z). */
export type Ride =
  { delivered: true; atMin: number } | { delivered: false; atMin: number; by: number; x: number; z: number }

/**
 * A courier leaving at `startMin` along its route (points in metres, the fastest road), with the enemies' tracks
 * over the day: caught by the first enemy (by time, then by index) within whose contact radius it comes, else
 * delivered at the route's end. The enemies listed in `engaged` (those the sender's corps is fighting) never catch
 * it: they are held by their battle, and a call for help always gets out of the battle it is sent from. A route of
 * no road (routePoints gives none for the ally in the same town) is delivered at once.
 */
export function ride(
  rules: CampaignRules,
  route: { x: number; z: number }[],
  startMin: number,
  enemies: Track[],
  engaged: readonly number[] = [],
): Ride {
  if (route.length < 2) return { delivered: true, atMin: startMin }
  const speed = (rules.courierKmPerHour * 1000) / 60
  const courier = walk(route, startMin, speed)
  const end = courier[courier.length - 1].t
  let caughtAt = Infinity
  let by = -1
  for (let k = 0; k < enemies.length; k++) {
    if (engaged.includes(k)) continue
    // only a catch earlier than the one known can win: the search stops there
    const t = firstContact(courier, enemies[k], rules.contactRadiusM, startMin, Math.min(end, caughtAt))
    if (t !== null && t < caughtAt) {
      caughtAt = t
      by = k
    }
  }
  if (by < 0) return { delivered: true, atMin: end }
  const at = positionAt(courier, caughtAt)
  return { delivered: false, atMin: caughtAt, by, x: at.x, z: at.z }
}

/** Whether an ally `routeM` metres away by road is within reach of a call for help. */
export function inHelpRadius(rules: CampaignRules, routeM: number): boolean {
  return routeM <= rules.helpRadiusM
}

/**
 * The help a delivered call brings: the corps hears it at `heardMin`, gets under way, and marches `marchM` metres
 * by road at a forced march; when its head and its tail reach the battle, and the share of its strength with it: a
 * forced march leaves stragglers behind (they rejoin later), the ruleset's share for a full day's forced march, less
 * for a shorter one.
 */
export function help(
  rules: CampaignRules,
  units: number,
  heardMin: number,
  marchM: number,
): { headMin: number; tailMin: number; strength: number } {
  const { headMin, tailMin } = arrival(rules, 'forced', units, marchM, heardMin + rules.underWayMin)
  const dayShare = Math.min(1, marchM / dayMarch(rules, 'forced', units))
  return { headMin, tailMin, strength: 1 - rules.forcedStragglers * dayShare }
}
