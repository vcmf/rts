// Calling for help (docs/proposals/campaign.md, Calling for help): a courier rides the fastest road to an ally; if
// its road crosses an enemy's contact zone it is caught there and its message lost (and read by the enemy). Help
// that is called arrives when the courier has ridden, the corps has got under way and has marched, its tail a
// column's length after its head.
import { firstContact } from './contact.ts'
import { arrival } from './march.ts'
import type { CampaignRules } from './rules.ts'
import { positionAt, walk, type Track } from './track.ts'

/** A courier's ride: delivered at `atMin`, or caught by enemy `by` at `atMin` and position (x, z). */
export type Ride =
  { delivered: true; atMin: number } | { delivered: false; atMin: number; by: number; x: number; z: number }

/**
 * A courier leaving at `startMin` along its route (points in metres, the fastest road), with the enemies' tracks
 * over the day: caught by the first enemy (by time, then by index) whose contact radius it enters, else delivered
 * at the route's end.
 */
export function ride(
  rules: CampaignRules,
  route: { x: number; z: number }[],
  startMin: number,
  enemies: Track[],
): Ride {
  const speed = (rules.courierKmPerHour * 1000) / 60
  const courier = walk(route, startMin, speed)
  const end = courier[courier.length - 1].t
  let caughtAt = Infinity
  let by = -1
  for (let k = 0; k < enemies.length; k++) {
    const t = firstContact(courier, enemies[k], rules.contactRadiusM, startMin, end)
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
 * The help a delivered call brings: the corps hears it at `heardMin`, gets under way, and marches `marchM` metres
 * by road at a forced march; when its head and its tail reach the battle.
 */
export function help(
  rules: CampaignRules,
  units: number,
  heardMin: number,
  marchM: number,
): { headMin: number; tailMin: number } {
  return arrival(rules, 'forced', units, marchM, heardMin + rules.underWayMin)
}
