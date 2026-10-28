// The look page's armies demo (?armies, docs/plans/active/armies-demo.md): the era's ruleset (src/rulesets/index.ts),
// the unit type whose drill the battalions keep, the figure they are drawn with (data/figures/<figure>.unitdata), and
// the uniform each side's battalions wear (the ruleset's uniforms). Scripted, not the sim's: when the sim drives the
// armies, its scenarios name these instead. The other arms (docs/plans/active/cavalry-artillery-demo.md): a cavalry
// regiment a side in column of squadrons riding along the front (it walks, trots, gallops a little and halts), and a
// foot battery a side unlimbered in front of the lines, its pieces resting, then firing in turn
// (src/look/world/arms.ts)
import type { ArmSpec } from '../look/world/arms.ts'

// (placed in this order: the battery before the lines first, then the ride in front of it)
export const ARMS_DEMO: readonly ArmSpec[] = [
  {
    name: 'artillery',
    unitType: 'battery',
    formation: 'unlimbered',
    figure: 'fr-foot-artillery',
    sides: ['fr-foot-artillery', 'at-artillery'],
    script: { kind: 'serve', rest: 'halt', work: 'fire', restSeconds: 8, lag: 2.5, cycle: 110 },
    // (12 m before the lines, west of the woods by the fight's middle: the demo map's open ground)
    place: { turn: 0, ahead: 12, across: 60 },
    tread: 6,
  },
  {
    name: 'cavalry',
    unitType: 'cavalry',
    formation: 'column',
    figure: 'fr-cuirassier',
    sides: ['fr-cuirassier', 'at-cuirassier'],
    script: {
      kind: 'ride',
      legs: [
        { role: 'halt', seconds: 4 },
        { role: 'walk', seconds: 6 },
        { role: 'trot', seconds: 20 },
        { role: 'gallop', seconds: 6 },
        { role: 'halt', seconds: 24 },
      ],
    },
    // (along the front, each to its right: the two regiments pass each other between the lines, in front of the
    // batteries)
    place: { turn: Math.PI / 2, ahead: 36, across: 90 },
    tread: 3,
  },
]

export const ARMIES_DEMO = {
  ruleset: 'napoleonic',
  unitType: 'infantry',
  figure: 'fr-line-infantry',
  sides: ['fr-line', 'at-line'],
  // ?uniforms=all (the dye palette's review, docs/plans/active/dye-palette.md): each side's battalions wear these in
  // turn
  reviewSides: [
    ['fr-line', 'fr-guard-grenadier', 'fr-dragoon'],
    ['at-line', 'ru-line', 'br-line', 'at-grenzer', 'br-rifles'],
  ],
} as const
