// The S1e scenario (docs/plans/active/s1e1-battlefield.md, docs/plans/active/s1e2-sides.md) on the battlefield
// (maps/battlefield.ts): on each side six battalions, a cavalry regiment and a battery on its ridge, firing at will.
// Side 0 holds the southern ridge facing north, in two lines of three, and is yours; side 1, veterans, the northern,
// four up and two back, and follows its plan (tuned in docs/plans/active/s1e3-playtest.md: with no orders from you it
// wins in 17–20 minutes; a defender who saves its guns from the regiment wins). The stream runs between them: men and
// horses wade it but in its pools out on the flanks; guns cross only at the fords (x −260 and 330) and the bridge on
// the road near x 62. Each side's rear is set, so routers run behind it. A side with 35% of its men out of the fight is
// broken (end.broken); the battle is decided at 40 minutes otherwise.
import type { World, Scenario, PlanStep } from '../sim/index.ts'
import { issue, PI } from '../sim/index.ts'

// one formation: its type, shape, men, place and heading, and its part in the battle; side 1's battalions also
// carry the x they fight at. Units are numbered in spawn order, SOUTH then NORTH; the plan finds them by part
interface Row {
  unit: string
  shape: string
  men: number
  x: number
  z: number
  a: number
  part: 'first' | 'second' | 'regiment' | 'battery'
  quality?: number
  fight?: number
}
const inf = (shape: string, x: number, z: number, a: number, part: 'first' | 'second'): Row => ({
  unit: 'infantry',
  shape,
  men: 400,
  x,
  z,
  a,
  part,
})
// side 0's: two lines of three, the first in line and the second in column
const SOUTH: Row[] = [
  inf('line', -200, -230, 0, 'first'),
  inf('line', -80, -230, 0, 'first'),
  inf('line', 40, -230, 0, 'first'),
  inf('column', -140, -330, 0, 'second'),
  inf('column', -20, -330, 0, 'second'),
  inf('column', 100, -330, 0, 'second'),
  // the eastern flank, behind the ploughed field
  { unit: 'cavalry', shape: 'line', men: 256, x: 300, z: -320, a: 0, part: 'regiment' },
  // S1e-3: on the first line's eastern flank, turned 25° inwards: its arc (±20°) sweeps the ground in front of the
  // line, which no piece's fire crosses (on the outer flank, facing ahead, no enemy ever came into its arc)
  { unit: 'battery', shape: 'unlimbered', men: 96, x: 180, z: -280, a: -0.44, part: 'battery' },
]
// side 1's (S1e-3), veteran infantry: four battalions up, so its line overlaps yours at both ends, and two in
// column behind; its regiment on its eastern flank, facing your battery and your regiment; its battery on its
// ridge west of its first line, turned 25° inwards, so that it fires past its own line while that comes down (once
// the line has closed, it masks the battery's fire at your western battalions)
const VETERAN = 0.85 // the ruleset's quality is 0.75
const vet = (shape: string, x: number, z: number, part: 'first' | 'second', fight: number): Row => ({
  unit: 'infantry',
  shape,
  men: 400,
  x,
  z,
  a: PI,
  part,
  fight,
  quality: VETERAN,
})
const NORTH: Row[] = [
  vet('line', 220, 230, 'first', 100),
  vet('line', 40, 230, 'first', -20),
  vet('line', -80, 230, 'first', -140),
  vet('line', -200, 230, 'first', -260),
  vet('column', -20, 330, 'second', -20),
  vet('column', -140, 330, 'second', -140),
  { unit: 'cavalry', shape: 'line', men: 256, x: 260, z: 320, a: PI, part: 'regiment' },
  { unit: 'battery', shape: 'unlimbered', men: 96, x: -330, z: 280, a: PI - 0.44, part: 'battery' },
]
const units = (rows: Row[], first: number, part: Row['part']) =>
  rows.map((r, k) => ({ ...r, id: first + k })).filter(r => r.part === part)
// side 1's battalions of a line, each with the x it fights at (a row without one is a mistake in this file)
const lines = (part: 'first' | 'second') =>
  units(NORTH, S1, part).map(u => {
    if (u.fight === undefined) throw new Error(`s1e-battle: unit ${u.id} has no fight x`)
    return { ...u, fight: u.fight }
  })
const S1 = SOUTH.length
const FIRST = lines('first')
const SECOND = lines('second')
const REGIMENT = units(NORTH, S1, 'regiment')[0].id
const YOUR_BATTERY = units(SOUTH, 0, 'battery')[0].id
// side 1's plan (S1e-3): its first line sets off at once straight down to the stream's north bank (each battalion
// clear of the hedge at x 110), wades it, halts about 130 m from your first line to dress, then closes to about
// 70 m (the centre's two cross the hedge in front of your line at z −135 slowly, and fight from about z −150).
// Its second line follows in column behind the centre and halts on the north bank, clear of the stream and the
// marsh (z 40), and at 15 minutes wades over and comes up to about 25 m behind the centre's two, the far side of
// the hedge they crossed, to fill the line as it breaks. Its regiment charges your battery and rides back
// at a set time (once its rest is over): a charge ends by clearing its orders, so a move queued after it is lost,
// and a charge still running then is cut short
const T = { dress: 200, close: 500, charge: 300, back: 630, wave: 900 } // seconds
const march = (at: number, unit: number, points: [number, number][]): PlanStep => ({
  at,
  unit,
  cmd: { type: 'move', points, append: false },
})
const PLAN: PlanStep[] = [
  ...FIRST.map(u => march(5, u.id, [[u.x, 70]])),
  ...FIRST.map(u => march(T.dress, u.id, [[u.fight, -100]])),
  ...FIRST.map(u => march(T.close, u.id, [[u.fight, -160]])),
  { at: T.charge, unit: REGIMENT, cmd: { type: 'charge', target: YOUR_BATTERY } },
  march(T.back, REGIMENT, [[260, 120]]),
  ...SECOND.map(u => march(120, u.id, [[u.fight, 120]])),
  ...SECOND.map(u => march(T.dress + 60, u.id, [[u.fight, 40]])),
  ...SECOND.map(u => march(T.wave, u.id, [[u.fight, -120]])), // the second wave, behind the firing line
]
export const s1eBattle: Scenario = {
  name: 's1e-battle',
  map: 'battlefield',
  player: 0,
  plan: PLAN,
  minutes: 40,
  setup(w: World) {
    issue(w, { type: 'side', side: 0, x: 0, z: -1 })
    issue(w, { type: 'side', side: 1, x: 0, z: 1 })
    for (const [side, rows] of [
      [0, SOUTH],
      [1, NORTH],
    ] as const) {
      for (const { unit, shape, men, x, z, a, quality } of rows) {
        issue(w, { type: 'debug-spawn', side, unit, shape, men, x, z, heading: a, fire: 'at will', quality })
      }
    }
  },
}
