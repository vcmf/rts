// The S1e scenario (docs/plans/active/s1e1-battlefield.md, docs/plans/active/s1e2-sides.md) on the battlefield (maps/battlefield.ts): on
// each side six battalions, a cavalry regiment and a battery on its ridge, firing at will. Side 0 holds the southern
// ridge facing north, in two lines of three, and is yours; side 1, veterans, the northern, four up and two back,
// and follows its plan (tuned in docs/plans/active/s1e3-playtest.md: with no orders from you it wins in about 17
// minutes; a defender who saves its guns from the regiment wins). The stream runs between them: men and horses wade it but in its pools out on the
// flanks; guns cross only at the fords (x −260 and 330) and the bridge on the road near x 62. Each side's rear is
// set, so routers run behind it. A side with more than a third of its men out of the fight is broken (end.broken);
// the battle is decided at 40 minutes otherwise.
import type { World, Scenario, PlanStep } from '../sim/index.ts'
import { issue, PI } from '../sim/index.ts'

// [unit, shape, men, x, z, heading]: side 0's, turned through the centre for side 1. Units are numbered in spawn
// order: side 0's 0–7, side 1's 8–15
const SOUTH: [string, string, number, number, number, number][] = [
  // the first line, in line, and the second, in column
  ['infantry', 'line', 400, -200, -230, 0], ['infantry', 'line', 400, -80, -230, 0], ['infantry', 'line', 400, 40, -230, 0],
  ['infantry', 'column', 400, -140, -330, 0], ['infantry', 'column', 400, -20, -330, 0], ['infantry', 'column', 400, 100, -330, 0],
  ['cavalry', 'line', 256, 300, -320, 0],              // the eastern flank, behind the ploughed field
  // S1e-3: on the first line's eastern flank, turned 25° inwards: its arc (±20°) sweeps the ground in front of the
  // line, which no piece's fire crosses (on the outer flank, facing ahead, no enemy ever came into its arc)
  ['battery', 'unlimbered', 96, 180, -280, -0.44],
]
// side 1's (S1e-3): four battalions in its first line and two in column behind, so its line overlaps yours at
// both ends; its regiment on its eastern flank, facing your battery and your regiment; its battery on its ridge,
// turned 25° inwards like yours
const NORTH: typeof SOUTH = [
  ['infantry', 'line', 400, 220, 230, PI], ['infantry', 'line', 400, 40, 230, PI], ['infantry', 'line', 400, -80, 230, PI], ['infantry', 'line', 400, -200, 230, PI],
  ['infantry', 'column', 400, 100, 330, PI], ['infantry', 'column', 400, -140, 330, PI],
  ['cavalry', 'line', 256, 260, 320, PI],
  ['battery', 'unlimbered', 96, -180, 280, PI - 0.44],
]
const S1 = 8   // side 1's first unit: its first line 8–11, its second 12–13, its regiment 14, its battery 15
const VETERAN = 0.85   // side 1's infantry: veterans (the ruleset's quality is 0.75)
// side 1's plan (S1e-3): its first line sets off at once straight down to the stream's north bank (each battalion
// clear of the hedge at x 110), wades it and halts about 130 m from your first line to dress, then closes to
// about 70 m, its four battalions overlapping your three. Its second line follows about 100 m behind and comes up
// to the firing line as a second wave; its regiment charges your battery and rides back
const T = { dress: 200, close: 500, charge: 300, wave: 900 }   // seconds
const march = (at: number, unit: number, points: [number, number][]): PlanStep => ({ at, unit, cmd: { type: 'move', points, append: false } })
const FIRST = [100, -20, -140, -260], SECOND = [40, -200]   // where each battalion of the first line fights, and of the second
const PLAN: PlanStep[] = [
  ...NORTH.slice(0, 4).map(([, , , x], k) => march(5, S1 + k, [[x, 70]])),
  ...FIRST.map((x, k) => march(T.dress, S1 + k, [[x, -100]])),
  ...FIRST.map((x, k) => march(T.close, S1 + k, [[x, -160]])),
  { at: T.charge, unit: S1 + 6, cmd: { type: 'charge', target: 7 } },   // your battery
  march(T.charge + 330, S1 + 6, [[260, 120]]),   // and rides back over the stream to re-form
  ...SECOND.map((x, k) => march(120, S1 + 4 + k, [[x, 120]])),
  ...SECOND.map((x, k) => march(T.dress + 60, S1 + 4 + k, [[x, -40]])),
  ...SECOND.map((x, k) => march(T.wave, S1 + 4 + k, [[x, -160]])),   // the second wave, to the firing line
]
export const s1eBattle: Scenario = {
  name: 's1e-battle',
  map: 'battlefield',
  player: 0,
  plan: PLAN,
  minutes: 40,
  setup(w: World) {
    issue(w, { type: 'side', side: 0, x: 0, z: -1 }); issue(w, { type: 'side', side: 1, x: 0, z: 1 })
    for (const [unit, shape, men, x, z, a] of SOUTH) issue(w, { type: 'debug-spawn', side: 0, unit, shape, men, x, z, heading: a, fire: 'at will' })
    for (const [unit, shape, men, x, z, a] of NORTH) issue(w, { type: 'debug-spawn', side: 1, unit, shape, men, x, z, heading: a, fire: 'at will', ...(unit === 'infantry' ? { quality: VETERAN } : {}) })
  },
}
