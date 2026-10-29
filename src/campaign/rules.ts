// The campaign's rules as numbers (docs/proposals/campaign.md): how fast armies march, how long their columns are,
// how fast a courier rides, how near two enemies must come to fight. The shape only: an era's values are ruleset
// data (decision 0015; the Napoleonic ones are src/rulesets/napoleonic-campaign.ts). Distances in metres, times in
// minutes, throughout the campaign's code.

/** A way of marching: its speed on the road and how many hours a day it keeps up. */
export interface MarchMode {
  kmPerHour: number
  hoursPerDay: number
}

export interface CampaignRules {
  // the normal march, and the forced march (faster and longer, at a cost in stragglers and fatigue)
  march: MarchMode
  forced: MarchMode
  // a corps of up to fullSpeedUnits units marches at the full speed; each unit more slows it by slowPerUnit of it,
  // to at most maxSlow
  fullSpeedUnits: number
  slowPerUnit: number
  maxSlow: number
  // the road a corps fills on the march, a unit
  columnPerUnitM: number
  // the share of each unit left behind by a forced march (they rejoin later)
  forcedStragglers: number
  // a courier's speed, and the time a corps takes to get under way once ordered
  courierKmPerHour: number
  underWayMin: number
  // two enemies within the contact radius must give battle; a contact within a battle's zone joins it; an engaged
  // corps calls the allies within the help radius, measured by road
  contactRadiusM: number
  battleZoneM: number
  helpRadiusM: number
}
