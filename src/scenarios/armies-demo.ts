// The look page's armies demo (?battle, docs/plans/active/division-armies.md): a stress-test battle at the division
// scale (decision 0099), not a historical one. The era's ruleset (src/rulesets/index.ts) and its corps, the battles'
// figure budgets, the template the first corps deploy by, and the arms: each a unit type of the ruleset, the figure
// it is drawn with (data/figures/<figure>.unitdata), each side's uniform and its script (src/look/world/arms.ts):
// - the line infantry marches up in column, deploys into line and fires by ranks (the drill);
// - the light infantry, the same figure in open order and its own dye (a stand-in until a voltigeur figure, #308);
// - the light cavalry, the cuirassier figure without its cuirass in a light cavalry dye, a smaller unit (a stand-in
//   until a hussar and chasseur figure, #309), and the cuirassiers (the reserve cavalry corps'), riding up to the
//   front: they walk, trot, gallop a little and halt (?cavalry=0: neither; ?lightcav=0, ?cuirassiers=0: one);
// - the foot battery, unlimbered in the line, its pieces resting, then firing in turn.
// Scripted, not the sim's: when the sim drives the armies, its scenarios name these instead.
import type { Composition } from '../sim/ruleset.ts'
import type { ArmSpec, Leg } from '../look/world/arms.ts'
import type { BattleSpec, Deploy } from '../look/world/battle.ts'
import { CORPS } from '../rulesets/napoleonic-division.ts'
import { BATTLE_BUDGETS } from './battles.ts'

// the horse's ride (the old cavalry demo's): about 115 m
const RIDE: readonly Leg[] = [
  { role: 'halt', seconds: 4 },
  { role: 'walk', seconds: 6 },
  { role: 'trot', seconds: 20 },
  { role: 'gallop', seconds: 6 },
  { role: 'halt', seconds: 24 },
]

// the arms, the line infantry first (the figures' shadow map is its; the page's __units): each a renderer
export const ARMS_DEMO: readonly ArmSpec[] = [
  {
    name: 'infantry',
    unitType: 'infantry',
    formation: 'line',
    figure: 'fr-line-infantry',
    sides: ['fr-line', 'at-line'],
    script: { kind: 'drill' },
    tread: 1,
  },
  {
    name: 'light',
    unitType: 'light',
    formation: 'line',
    figure: 'fr-line-infantry',
    sides: ['fr-light', 'at-grenzer'],
    script: { kind: 'drill' },
    tread: 1,
    // (skirmishers carried no colours)
    flags: false,
  },
  {
    name: 'artillery',
    unitType: 'battery',
    formation: 'unlimbered',
    figure: 'fr-foot-artillery',
    sides: ['fr-foot-artillery', 'at-artillery'],
    script: { kind: 'serve', rest: 'halt', work: 'fire', restSeconds: 8, lag: 2.5, cycle: 110 },
    tread: 6,
    // (the owner, 2026-10-28: the guns' shadows "a tiny bit darker"; a gun's is open and low)
    shadowDarken: 1.18,
    flags: false,
  },
  {
    name: 'lightcav',
    unitType: 'cavalry',
    group: 'cavalry',
    formation: 'column',
    figure: 'fr-cuirassier',
    sides: ['fr-chasseur', 'at-hussar'],
    script: { kind: 'ride', legs: RIDE },
    tread: 3,
    flags: false,
    // (no cuirass: the figure's one metal role, in the coat's colour. The bake gives the cuirass no role of its own;
    // the role is also the sabre, the stirrups, the buttons, but 81 % of its area is the rider's torso and head, the
    // cuirass and the helmet (its near LOD at rest, by height), so a light cavalryman loses his armour and his sabre
    // turns his coat's colour, too small to read at the page's zooms; the other way, a cuirass on every hussar, reads
    // as cuirassiers: #309)
    parts: { metal: 'coat' },
  },
  {
    name: 'cuirassiers',
    unitType: 'cuirassiers',
    group: 'cavalry',
    formation: 'column',
    figure: 'fr-cuirassier',
    sides: ['fr-cuirassier', 'at-cuirassier'],
    script: { kind: 'ride', legs: RIDE },
    tread: 3,
    flags: false,
  },
]

// the battles by the page's names and budgets (src/scenarios/battles.ts; the owner, 2026-10-31): a typical one for
// the look, two infantry corps a side, and the stress tests at 16,000 (the default) and 32,000, the main army's with
// its reserve cavalry corps fielded first
const ONCE: Readonly<Record<string, readonly Composition[]>> = {
  typical: [],
  '16k': [CORPS.cavalryReserve],
  '32k': [CORPS.cavalryReserve],
}
const BATTLES: Readonly<Record<string, BattleSpec>> = Object.fromEntries(
  Object.entries(BATTLE_BUDGETS).map(([name, figures]) => {
    const once = ONCE[name]
    if (!once) throw new Error(`armies-demo: the battle ${name} (src/scenarios/battles.ts) has no corps here`)
    return [name, { figures, once, repeat: CORPS.infantry }]
  }),
)

// the first two infantry corps a side in line along the front, each one row from its outer flank to the middle: a
// light cavalry regiment riding up to the front (its ride, about 118 m, ending at the front), its light infantry, its
// battery in the line, two line units deploying and firing (the line infantry nearest the middle: the cameras' fight
// there, as before); the rest in column behind. Along the front each engaged unit's ground is its own
// (src/look/world/battle.ts: none fires through another)
const DEPLOY: Deploy = {
  engaged: 2,
  corpsGap: 20,
  gap: 8,
  posts: [
    { units: ['cavalry'], ahead: -118 },
    { units: ['light', 'battery', 'infantry', 'infantry'], ahead: 0 },
  ],
}

export const ARMIES_DEMO = {
  ruleset: 'napoleonic-division',
  battles: BATTLES,
  deploy: DEPLOY,
  // ?uniforms=all (the dye palette's review, docs/plans/active/dye-palette.md): each side's line infantry wear these
  // in turn
  reviewSides: [
    ['fr-line', 'fr-guard-grenadier', 'fr-dragoon'],
    ['at-line', 'ru-line', 'br-line', 'at-grenzer', 'br-rifles'],
  ],
  // played by the sim (?sim, src/look/sim-armies.ts): the first arm's (the line infantry's) units, the shape each
  // approaches in, and the one it fights in
  sim: { approach: 'column', fight: 'line' },
} as const
