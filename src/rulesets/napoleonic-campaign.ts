// The Napoleonic campaign's numbers (docs/proposals/campaign.md, Starting values: estimates, to tune). A normal march
// of 22.5 km a day (the era's 20–25 km), a forced march of 35 km (Davout's corps before Austerlitz made more), a
// courier at a gallop between changes of horse.
import type { CampaignRules } from '../campaign/rules.ts'

export const napoleonicCampaign: CampaignRules = {
  march: { kmPerHour: 3, hoursPerDay: 7.5 },
  forced: { kmPerHour: 4, hoursPerDay: 8.75 },
  fullSpeedUnits: 6,
  slowPerUnit: 0.03,
  maxSlow: 0.2,
  // a division's column on the road: about 2 km, so a corps of 9 units fills about 18 km
  columnPerUnitM: 2000,
  forcedStragglers: 0.15,
  courierKmPerHour: 12,
  underWayMin: 60,
  contactRadiusM: 1500,
  battleZoneM: 4000,
  helpRadiusM: 25000,
}
