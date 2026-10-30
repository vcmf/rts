// Who answers a call for help (docs/proposals/campaign.md, Calling for help): an ally in reach by road, free (not
// fighting, and not already marching to another battle: a corps answers at most one call a day), whose standing
// orders let it come. A corps on its way to help that meets another enemy fights there and may call for help itself,
// but only free corps can answer; every answer and every battle takes a corps out of the free ones, so a chain of
// calls in a day ends (with N corps, at most N answers).
import { inHelpRadius } from './courier.ts'
import type { CampaignRules } from './rules.ts'

/** What a corps' standing orders say to a call for help: always come, come if within `nearM` by road, or never. */
export type OnCall = { kind: 'always' } | { kind: 'near'; nearM: number } | { kind: 'never' }

/** An ally as the call reads it. */
export interface Ally {
  // fighting a battle today (held for the rest of the day)
  engaged: boolean
  // already marching to a battle today (it answered a call, or was sent)
  committed: boolean
  onCall: OnCall
}

/** Whether an ally `routeM` metres away by road answers a call that reaches it. */
export function answers(rules: CampaignRules, ally: Ally, routeM: number): boolean {
  if (ally.engaged || ally.committed) return false
  if (!inHelpRadius(rules, routeM)) return false
  if (ally.onCall.kind === 'never') return false
  if (ally.onCall.kind === 'near') return routeM <= ally.onCall.nearM
  return true
}
