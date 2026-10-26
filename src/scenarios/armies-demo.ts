// The look page's armies demo (?armies, docs/plans/active/armies-demo.md): the era's ruleset (src/rulesets/index.ts),
// the unit type whose drill the battalions keep, the figure they are drawn with (data/figures/<figure>.unitdata), and
// the uniform each side's battalions wear (the ruleset's uniforms). Scripted, not the sim's: when the sim drives the
// armies, its scenarios name these instead
export const ARMIES_DEMO = {
  ruleset: 'napoleonic',
  unitType: 'infantry',
  figure: 'fr-line-infantry',
  sides: ['fr-line-1808', 'at-line-white'],
  // played by the sim (?sim, src/look/sim-armies.ts): the shape each battalion approaches in, and the one it fights in
  sim: { approach: 'column', fight: 'line' },
} as const
