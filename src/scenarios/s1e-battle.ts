// The S1e scenario (docs/plans/active/s1e1-battlefield.md, docs/plans/active/s1e2-sides.md) on the battlefield (maps/battlefield.ts): on
// each side six battalions, a cavalry regiment and a battery on its ridge, firing at will. Side 0 holds the southern
// ridge facing north, in two lines of three, and is yours; side 1, veterans, the northern, four up and two back,
// and follows its plan (tuned in docs/plans/active/s1e3-playtest.md: with no orders from you it wins in about 17
// minutes; a defender who saves its guns from the regiment wins). The stream runs between them: men and horses wade it but in its pools out on the
// flanks; guns cross only at the fords (x −260 and 330) and the bridge on the road near x 62. Each side's rear is
// set, so routers run behind it. A side with 35% of its men out of the fight is broken (end.broken);
// the battle is decided at 40 minutes otherwise.
import type { World, Scenario, PlanStep } from '../sim/index.ts'
import { issue, PI } from '../sim/index.ts'

// one formation: its type, shape, men, place and heading, its part in the battle, and (side 1's first and second
// lines) the x it fights at. Units are numbered in spawn order, SOUTH then NORTH; the plan finds them by part
interface Row { unit: string; shape: string; men: number; x: number; z: number; a: number; part: 'first' | 'second' | 'regiment' | 'battery'; fight?: number }
const row = (unit: string, shape: string, men: number, x: number, z: number, a: number, part: Row['part'], fight?: number): Row => ({ unit, shape, men, x, z, a, part, fight })
// side 0's: two lines of three, the first in line and the second in column
const SOUTH: Row[] = [
  row('infantry', 'line', 400, -200, -230, 0, 'first'), row('infantry', 'line', 400, -80, -230, 0, 'first'), row('infantry', 'line', 400, 40, -230, 0, 'first'),
  row('infantry', 'column', 400, -140, -330, 0, 'second'), row('infantry', 'column', 400, -20, -330, 0, 'second'), row('infantry', 'column', 400, 100, -330, 0, 'second'),
  row('cavalry', 'line', 256, 300, -320, 0, 'regiment'),   // the eastern flank, behind the ploughed field
  // S1e-3: on the first line's eastern flank, turned 25° inwards: its arc (±20°) sweeps the ground in front of the
  // line, which no piece's fire crosses (on the outer flank, facing ahead, no enemy ever came into its arc)
  row('battery', 'unlimbered', 96, 180, -280, -0.44, 'battery'),
]
// side 1's (S1e-3), veterans: four battalions up, so its line overlaps yours at both ends, and two in column behind;
// its regiment on its eastern flank, facing your battery and your regiment; its battery on its ridge, turned 25°
// inwards like yours
const NORTH: Row[] = [
  row('infantry', 'line', 400, 220, 230, PI, 'first', 100), row('infantry', 'line', 400, 40, 230, PI, 'first', -20),
  row('infantry', 'line', 400, -80, 230, PI, 'first', -140), row('infantry', 'line', 400, -200, 230, PI, 'first', -260),
  row('infantry', 'column', 400, 100, 330, PI, 'second', 40), row('infantry', 'column', 400, -140, 330, PI, 'second', -200),
  row('cavalry', 'line', 256, 260, 320, PI, 'regiment'),
  row('battery', 'unlimbered', 96, -180, 280, PI - 0.44, 'battery'),
]
const VETERAN = 0.85   // side 1's infantry (the ruleset's quality is 0.75)
const units = (rows: Row[], first: number, part: Row['part']) => rows.map((r, k) => ({ ...r, id: first + k })).filter(r => r.part === part)
const S1 = SOUTH.length, FIRST = units(NORTH, S1, 'first'), SECOND = units(NORTH, S1, 'second')
const REGIMENT = units(NORTH, S1, 'regiment')[0].id, YOUR_BATTERY = units(SOUTH, 0, 'battery')[0].id
// side 1's plan (S1e-3): its first line sets off at once straight down to the stream's north bank (each battalion
// clear of the hedge at x 110), wades it, halts about 130 m from your first line to dress, then closes to about
// 70 m (the centre's two cross the hedge in front of your line at z −135 slowly, and fight from about z −150).
// Its second line follows to about 60 m behind the halt and comes up to the firing line as a second wave. Its
// regiment charges your battery and, its rest over, rides back (a timed step: a charge ends by clearing its orders)
const T = { dress: 200, close: 500, charge: 300, back: 630, wave: 900 }   // seconds
const march = (at: number, unit: number, points: [number, number][]): PlanStep => ({ at, unit, cmd: { type: 'move', points, append: false } })
const PLAN: PlanStep[] = [
  ...FIRST.map(u => march(5, u.id, [[u.x, 70]])),
  ...FIRST.map(u => march(T.dress, u.id, [[u.fight!, -100]])),
  ...FIRST.map(u => march(T.close, u.id, [[u.fight!, -160]])),
  { at: T.charge, unit: REGIMENT, cmd: { type: 'charge', target: YOUR_BATTERY } },
  march(T.back, REGIMENT, [[260, 120]]),
  ...SECOND.map(u => march(120, u.id, [[u.fight!, 120]])),
  ...SECOND.map(u => march(T.dress + 60, u.id, [[u.fight!, -40]])),
  ...SECOND.map(u => march(T.wave, u.id, [[u.fight!, -160]])),   // the second wave, to the firing line
]
export const s1eBattle: Scenario = {
  name: 's1e-battle',
  map: 'battlefield',
  player: 0,
  plan: PLAN,
  minutes: 40,
  setup(w: World) {
    issue(w, { type: 'side', side: 0, x: 0, z: -1 }); issue(w, { type: 'side', side: 1, x: 0, z: 1 })
    for (const [side, rows] of [[0, SOUTH], [1, NORTH]] as const) for (const { unit, shape, men, x, z, a } of rows)
      issue(w, { type: 'debug-spawn', side, unit, shape, men, x, z, heading: a, fire: 'at will', ...(side === 1 && unit === 'infantry' ? { quality: VETERAN } : {}) })
  },
}
