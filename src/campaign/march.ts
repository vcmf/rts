// A corps on the march (docs/proposals/campaign.md, Armies are corps): its speed by march mode and size, the road
// its column fills, and when its head and its tail reach a point down its route.
import type { CampaignRules } from './rules.ts'

export type Mode = 'march' | 'forced'

/** A corps' speed on the road, in metres a minute: its mode's, slowed when it has more units than a full-speed one. */
export function marchSpeed(rules: CampaignRules, mode: Mode, units: number): number {
  const kmPerHour = mode === 'forced' ? rules.forced.kmPerHour : rules.march.kmPerHour
  const slow = Math.min(rules.maxSlow, Math.max(0, units - rules.fullSpeedUnits) * rules.slowPerUnit)
  return ((kmPerHour * 1000) / 60) * (1 - slow)
}

/** The road a corps of `units` units fills on the march, in metres. */
export function columnLength(rules: CampaignRules, units: number): number {
  return units * rules.columnPerUnitM
}

/** How far a corps marches in a day, in metres, at its mode's speed for its mode's hours. */
export function dayMarch(rules: CampaignRules, mode: Mode, units: number): number {
  const hours = mode === 'forced' ? rules.forced.hoursPerDay : rules.march.hoursPerDay
  return marchSpeed(rules, mode, units) * hours * 60
}

/**
 * When a corps that sets off at `startMin` (its head at the route's start, its column behind it) reaches a point
 * `distanceM` down its route: its head, and its tail a column's length later. Marching without a halt: the day's
 * hours are the turn's to keep.
 */
export function arrival(
  rules: CampaignRules,
  mode: Mode,
  units: number,
  distanceM: number,
  startMin: number,
): { headMin: number; tailMin: number } {
  const speed = marchSpeed(rules, mode, units)
  const headMin = startMin + distanceM / speed
  return { headMin, tailMin: headMin + columnLength(rules, units) / speed }
}
