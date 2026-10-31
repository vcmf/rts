// The look page's armies demo (?battle, docs/plans/active/division-armies.md): a stress-test battle at the division
// scale (decision 0099), not a historical one. The era's ruleset (src/rulesets/index.ts) and its corps, the battles'
// figure budgets, the template the first corps deploy by, and the arms: each a unit type of the ruleset, the figure
// it is drawn with (data/figures/<figure>.unitdata), each side's uniform and its script (src/look/world/arms.ts):
// - the line infantry marches up in column, deploys into line and fires by ranks (the drill);
// - the light infantry, the same figure in open order and its own dye (a stand-in until a voltigeur figure, #308);
// - the light cavalry, the cuirassier figure without its cuirass in a light cavalry dye, a smaller unit (a stand-in
//   until a hussar and chasseur figure, #309), and the cuirassiers (the reserve cavalry corps'), riding along the
//   front: they walk, trot, gallop a little and halt;
// - the foot battery, unlimbered before the lines, its pieces resting, then firing in turn.
// Scripted, not the sim's: when the sim drives the armies, its scenarios name these instead.
import type { ArmSpec, Leg } from '../look/world/arms.ts'
import type { BattleSpec, Deploy } from '../look/world/battle.ts'
import { CORPS } from '../rulesets/napoleonic-division.ts'
import { BATTLE_BUDGETS } from './battles.ts'

// the horse's ride along the front (the old cavalry demo's)
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
    name: 'cavalry',
    unitType: 'cavalry',
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
    formation: 'column',
    figure: 'fr-cuirassier',
    sides: ['fr-cuirassier', 'at-cuirassier'],
    script: { kind: 'ride', legs: RIDE },
    tread: 3,
    flags: false,
  },
]

// the battles (the owner, 2026-10-31): a typical one for the look, about 6,000 figures (two infantry corps a side),
// and the stress tests at 16,000 (the default) and 32,000, the main army's with its reserve cavalry corps
const BATTLES: Readonly<Record<string, BattleSpec>> = {
  typical: { figures: BATTLE_BUDGETS.typical, once: [], repeat: CORPS.infantry },
  '16k': { figures: BATTLE_BUDGETS['16k'], once: [CORPS.cavalryReserve], repeat: CORPS.infantry },
  '32k': { figures: BATTLE_BUDGETS['32k'], once: [CORPS.cavalryReserve], repeat: CORPS.infantry },
}

// the first two infantry corps a side in line along the front: each its first line of three line units and its light
// infantry (on the right), its battery 12 m before it, its light cavalry riding along the front between the lines
// (the old demo's lane, 36 m before the front); the rest in column behind
const DEPLOY: Deploy = {
  engaged: 2,
  corpsGap: 20,
  gap: 8,
  posts: [
    { units: ['infantry', 'infantry', 'infantry', 'light'], ahead: 0 },
    { units: ['battery'], ahead: 12 },
    { units: ['cavalry', 'cavalry'], ahead: 36, turn: Math.PI / 2 },
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
  // played by the sim (?sim, src/look/sim-armies.ts): the line infantry, the shape each unit approaches in, and the
  // one it fights in
  sim: { unitType: 'infantry', approach: 'column', fight: 'line' },
} as const
