// The armies demo's arms (docs/plans/done/cavalry-artillery-demo.md): what a unit's script tells the renderer (a
// phase, each man's place, way and role), the infantry's script (src/look/world/armies.ts) behind it, and the other
// arms' scripts, the sim's stand-ins: a ride (a column that walks, trots and gallops a little, then halts) and a
// service (pieces that rest, then fire in turn). Era-generic (decision 0015): the roles, their speeds, the shapes and
// the legs are the scenario's and the figure's data; nothing here names a horse or a gun. Deterministic (a function of
// the clock alone). No Babylon: the tests read it in Node.
//
// Frames as src/look/world/armies.ts: a unit at (x, z) with heading h faces (sin h, cos h); in its own frame x is
// across (right = (cos h, −sin h)) and z ahead
import type { Geometry, Placement } from '../../sim/ruleset.ts'
import type { FigurePart } from '../units-data.ts'
import { APPROACH, CYCLE, extents, manAt, phaseAt, slots, type Blocked, type Drill, type ManState } from './armies.ts'

/** a unit's phase: its name (the renderer places a still unit's men again only when it changes) and when it began
 *  (s into the unit's cycle); a script may carry more (the infantry's deployment's end) */
export interface ScriptPhase {
  phase: string
  start: number
}

/** What the renderer asks of a unit's script (src/look/units.ts): its men, its cycle (s), the man who carries its
 *  flag, the width a far figure may grow into (its file spacing, m: farWidthScale), the roles it gives, and at a
 *  unit's local time its phase, whether the phase moves its men, and each man's place (m, the unit's frame), way (rad,
 *  0 its front), role and the time his role's clip started (s, local) */
export interface Script<P extends ScriptPhase = ScriptPhase> {
  readonly men: number
  readonly cycle: number
  readonly bearer: number
  readonly fileSpacing: number
  readonly roles: readonly string[]
  phase(t: number, reserve: boolean): P
  moving(p: P): boolean
  man(i: number, t: number, p: P, jitter: number, out: ManState): ManState
}

// a reserve's phase: halted in column, always
const RESERVE = { phase: 'halt', start: 0, deployEnd: 0 } as const

/** The infantry's script (src/look/world/armies.ts, unchanged): its drill's slots, its phases (column, halt, deploy,
 *  fire; a reserve halted) and men (manAt), at the march's and the run's root speeds (m/s, the figure's); the flag's
 *  bearer the line's centre file in its second rank */
export function drillScript(d: Drill, speed: { march: number; run: number }): Script<ReturnType<typeof phaseAt>> {
  const s = slots(d)
  let best = Infinity
  let bearer = 0
  s.line.forEach(([x, z], i) => {
    const r = Math.hypot(x, z + d.rankSpacing)
    if (r < best) {
      best = r
      bearer = i
    }
  })
  return {
    men: s.line.length,
    cycle: CYCLE,
    bearer,
    fileSpacing: d.fileSpacing,
    roles: ['halt', 'march', 'run', 'fire'],
    phase: (t, reserve) => (reserve ? RESERVE : phaseAt(d, t, speed.march, speed.run)),
    moving: p => p.phase === 'column' || p.phase === 'deploy',
    man: (i, t, p, jitter, out) => manAt(d, s, i, t, p, speed.run, speed.march, jitter, out),
  }
}

/** the men's places (m, the unit's frame) in a formation of a ruleset's unit type: each company at its anchor
 *  (the formation's place), its files across and its ranks behind, as the sim stands them (its turn left out: the
 *  block shapes) */
export function formationSlots(g: Geometry, place: (g: Geometry) => Placement[]): [number, number][] {
  const out: [number, number][] = []
  for (const a of place(g)) {
    for (let r = 0; r < g.ranks; r++) {
      for (let f = 0; f < g.files; f++) {
        out.push([a.x + (f - (g.files - 1) / 2) * g.fileSpacing, a.z - r * g.rankSpacing])
      }
    }
  }
  return out
}
/** one place a company (m, the unit's frame): its anchor in the formation, a figure that stands for the whole
 *  company (a piece and its crew) */
export function companySlots(g: Geometry, place: (g: Geometry) => Placement[]): [number, number][] {
  return place(g).map(a => [a.x, a.z])
}

/** a ride's phase: its leg's index too (a reserve's: its first halted leg's, standing where the ride begins) */
export interface RidePhase extends ScriptPhase {
  leg: number
  reserve: boolean
}
/** a service's phase: how many of its pieces have started work */
export interface ServePhase extends ScriptPhase {
  started: number
}
/** each piece's turn in a service (0 first): the right of the line first (+x, the unit's frame), then leftward */
export function serveOrder(places: readonly [number, number][]): number[] {
  const byRight = places.map((_, i) => i).sort((a, b) => places[b][0] - places[a][0] || a - b)
  const turn = new Array<number>(places.length)
  byRight.forEach((i, k) => (turn[i] = k))
  return turn
}

/** a leg of a ride: the role its men take and for how long (s) */
export interface Leg {
  role: string
  seconds: number
}

/** A ride (the sim's stand-in for a mounted unit's movement): its men in their slots move ahead together leg by leg,
 *  each leg at its role's root speed (m/s, the figure's: its feet planted; 0: halted), then the cycle starts again
 *  where it began (the stand-in's loop, as the infantry's). A leg's phase is its index and role; a man's clip starts
 *  at the leg's start, offset by his own lag (jitter × lag s: no two in step). A reserve stands halted in its slots
 *  (the role of the first leg with no speed: a ride with a unit in reserve needs one). fileSpacing: the slots' file
 *  spacing */
export function rideScript(
  places: readonly [number, number][],
  legs: readonly Leg[],
  speeds: Readonly<Record<string, number>>,
  fileSpacing: number,
  lag = 0.4,
): Script<RidePhase> {
  if (legs.length === 0) throw new Error('arms: a ride needs a leg')
  for (const l of legs) {
    if (!(l.role in speeds)) throw new Error(`arms: a ride's leg names the role ${l.role}, which has no speed`)
    if (!(l.seconds > 0)) throw new Error(`arms: a ride's leg lasts ${l.seconds} s`)
  }
  const starts = legs.map((_, k) => legs.slice(0, k).reduce((a, l) => a + l.seconds, 0))
  const cycle = starts[legs.length - 1] + legs[legs.length - 1].seconds
  const legAt = (t: number) => {
    let k = 0
    while (k + 1 < legs.length && t >= starts[k + 1]) k++
    return k
  }
  // (a reserve stands in its first halted leg's role: asked of a ride with none, a loud failure then, not before)
  const halted = legs.findIndex(l => speeds[l.role] === 0)
  const reserve: RidePhase = { phase: 'reserve', start: 0, leg: halted, reserve: true }
  return {
    men: places.length,
    cycle,
    bearer: 0,
    fileSpacing,
    roles: [...new Set(legs.map(l => l.role))],
    phase: (t, inReserve) => {
      if (inReserve) {
        if (halted < 0) throw new Error('arms: a ride in reserve needs a halted leg (it stands in its role)')
        return reserve
      }
      const k = legAt(t)
      return { phase: `${k}:${legs[k].role}`, start: starts[k], leg: k, reserve: false }
    },
    moving: p => speeds[legs[p.leg].role] > 0,
    man: (i, t, p, jitter, out) => {
      out.x = places[i][0]
      out.z = places[i][1] + (p.reserve ? 0 : rideDistance(legs, starts, speeds, t))
      out.face = 0
      out.role = legs[p.leg].role
      // (a reserve's men in their halt clip each from his own lag: never in lockstep)
      out.since = (p.reserve ? 0 : p.start) + jitter * lag
      out.moving = speeds[out.role] > 0
      return out
    },
  }
}
/** m a ride has gone by t (s into its cycle): each leg's role's speed over its time */
export function rideDistance(
  legs: readonly Leg[],
  starts: readonly number[],
  speeds: Readonly<Record<string, number>>,
  t: number,
): number {
  let d = 0
  for (let k = 0; k < legs.length; k++) {
    d += speeds[legs[k].role] * Math.min(Math.max(t - starts[k], 0), legs[k].seconds)
  }
  return d
}
/** m: how far a ride goes in its cycle */
export const rideLength = (legs: readonly Leg[], speeds: Readonly<Record<string, number>>): number =>
  legs.reduce((a, l) => a + speeds[l.role] * l.seconds, 0)

/** A service (the sim's stand-in for pieces in action): its pieces stand in their slots, at rest (the rest role) for
 *  `rest` s, then each starts its work (the work role, a loop) `lag` s after the one before, the first on the right
 *  of the line, until the cycle ends and they rest again. Its phase changes as each piece starts, so the renderer
 *  gives each its clip; a piece's own lag ±0.2 s (jitter); a reserve's pieces rest. fileSpacing: the pieces' interval
 *  (m) */
export function serveScript(
  places: readonly [number, number][],
  roles: { rest: string; work: string },
  times: { rest: number; lag: number; cycle: number },
  fileSpacing: number,
): Script<ServePhase> {
  const n = places.length
  if (!(times.rest >= 0 && times.lag >= 0 && times.rest + (n - 1) * times.lag < times.cycle)) {
    throw new Error(`arms: a service's ${n} pieces cannot all start within its ${times.cycle} s cycle`)
  }
  const started = (t: number) =>
    t < times.rest ? 0 : Math.min(n, Math.floor((t - times.rest) / Math.max(times.lag, 1e-9)) + 1)
  const turn = serveOrder(places)
  return {
    men: n,
    cycle: times.cycle,
    bearer: 0,
    fileSpacing,
    roles: [roles.rest, roles.work],
    phase: (t, reserve) => {
      const k = reserve ? 0 : started(t)
      return { phase: `work:${k}`, start: k === 0 ? 0 : times.rest + (k - 1) * times.lag, started: k }
    },
    moving: () => false,
    man: (i, t, p, jitter, out) => {
      out.x = places[i][0]
      out.z = places[i][1]
      out.face = 0
      const working = turn[i] < p.started
      out.role = working ? roles.work : roles.rest
      out.since = working ? times.rest + turn[i] * times.lag + jitter * 0.2 : 0
      out.moving = false
      return out
    },
  }
}

/** A ground box in the world (m): taken by a unit, its approach or its whole ride */
export interface Box {
  x0: number
  z0: number
  x1: number
  z1: number
}
/** the world box of a frame's rectangle (across a0..a1, ahead z0..z1, m) of a unit at (x, z) heading h */
export function boxOf(x: number, z: number, h: number, a0: number, a1: number, z0: number, z1: number): Box {
  const c = Math.cos(h)
  const s = Math.sin(h)
  const xs: number[] = []
  const zs: number[] = []
  for (const a of [a0, a1]) {
    for (const f of [z0, z1]) {
      xs.push(x + c * a + s * f)
      zs.push(z - s * a + c * f)
    }
  }
  return { x0: Math.min(...xs), z0: Math.min(...zs), x1: Math.max(...xs), z1: Math.max(...zs) }
}
/** placeArm's moves from the spot wanted (m: along the front, ahead), on a `grid` m grid within `reach` m, the
 *  nearest first (a move ahead or back counting three times one along the front): built once a reach and grid */
const candidates = new Map<string, [number, number][]>()
export function armCandidates(reach: number, grid: number): readonly [number, number][] {
  const key = `${reach},${grid}`
  let cands = candidates.get(key)
  if (!cands) {
    cands = []
    for (let i = -reach; i <= reach; i += grid) for (let j = -reach; j <= reach; j += grid) cands.push([i, j])
    const cost = (p: [number, number]) => Math.hypot(p[0], 3 * p[1])
    cands.sort((p, q) => cost(p) - cost(q) || p[0] - q[0] || p[1] - q[1])
    candidates.set(key, cands)
  }
  return cands
}
/** whether two boxes overlap (touching edges do not) */
export const overlaps = (p: Box, q: Box): boolean => p.x0 < q.x1 && q.x0 < p.x1 && p.z0 < q.z1 && q.z0 < p.z1

/** where an arm's unit goes on a side: its footprint (the unit's frame: across a0..a1, ahead z0..z1, m: every place
 *  its men take over its cycle), its heading (rad: the side's plus `turn`), and the spot it wants for its footprint's
 *  middle (`ahead` m in front of the side's front, `across` m along the front from `at`, the field's centre between
 *  the fronts, toward +x for either side: the same spot along the front); the nearest spot on a `grid` m grid within
 *  `reach` m of it (a move ahead or back counting three times one along the front: it keeps its distance from the
 *  lines) whose footprint lies within the play area (±play m), on the side's own half of the field (its side of the
 *  line through `at` between the fronts), off the blocked ground (sampled every 2.5 m) and clear of the boxes taken
 *  (taken: pushed onto; returned with the place); with `back`, never ahead of the spot wanted (along the front or
 *  back from it: the battle's posts keep the gap between the lines); with `allows`, only where it allows the
 *  footprint's world box (the battle's friendly-line rule). The sides face +z (side 0) and −z, as the infantry's
 *  layout. null: no room */
export function placeArm(
  foot: { a0: number; a1: number; z0: number; z1: number },
  side: number,
  want: { turn: number; ahead: number; across: number; back?: boolean; allows?: (box: Box) => boolean },
  at: readonly [number, number],
  front: number,
  blocked: Blocked,
  taken: Box[],
  play = 235,
  grid = 5,
  reach = 120,
): { x: number; z: number; heading: number; box: Box } | null {
  const sh = side === 0 ? 0 : Math.PI
  const heading = sh + want.turn
  // the footprint's centre wanted: the side's front (front m from the centre) and ahead of it
  const cx = at[0] + want.across
  const cz = at[1] + (side === 0 ? want.ahead - front : front - want.ahead)
  const mid = [(foot.a0 + foot.a1) / 2, (foot.z0 + foot.z1) / 2]
  const c = Math.cos(heading)
  const s = Math.sin(heading)
  for (const [di, dj] of armCandidates(reach, grid)) {
    if (want.back && (side === 0 ? dj > 0 : dj < 0)) continue
    // (the unit's origin: the footprint's centre at the candidate)
    const ux = cx + di - (c * mid[0] + s * mid[1])
    const uz = cz + dj - (-s * mid[0] + c * mid[1])
    const box = boxOf(ux, uz, heading, foot.a0, foot.a1, foot.z0, foot.z1)
    if (box.x0 < -play || box.x1 > play || box.z0 < -play || box.z1 > play) continue
    if (side === 0 ? box.z1 > at[1] : box.z0 < at[1]) continue
    if (taken.some(t => overlaps(t, box))) continue
    if (want.allows && !want.allows(box)) continue
    if (!clearIn(box, blocked)) continue
    taken.push(box)
    return { x: ux, z: uz, heading, box }
  }
  return null
}
/** a box's ground clear of the blocked ground (sampled every 2.5 m, its edges included) */
export function clearIn(b: Box, blocked: Blocked): boolean {
  for (let x = b.x0; x <= b.x1 + 1e-9; x += 2.5) {
    for (let z = b.z0; z <= b.z1 + 1e-9; z += 2.5) if (blocked(Math.min(x, b.x1), Math.min(z, b.z1))) return false
  }
  return true
}
/** a set of places' footprint in their frame (across a0..a1, ahead z0..z1, m) padded by pad, and stretched ahead
 *  by go m (a ride's length) */
export function footprint(
  places: readonly [number, number][],
  pad: number,
  go = 0,
): { a0: number; a1: number; z0: number; z1: number } {
  const xs = places.map(p => p[0])
  const zs = places.map(p => p[1])
  return {
    a0: Math.min(...xs) - pad,
    a1: Math.max(...xs) + pad,
    z0: Math.min(...zs) - pad,
    z1: Math.max(...zs) + go + pad,
  }
}

/** An arm of the demo (the scenario's, src/scenarios/armies-demo.ts): its name and page switch (?<name>=0: left out;
 *  the first arm, the line infantry, is always on the page), the ruleset's unit type and the formation its script
 *  stands in, its figure (data/figures/<figure>.unitdata), each side's uniform, its script, a man's weight in the
 *  trodden mask, and its look's own switches. A drill marches up in column and deploys into its type's line
 *  (drillScript); a ride's legs name the figure's roles; a service gives its pieces a rest role and a work role, at
 *  rest for `rest` s, each starting `lag` s after the one before, its cycle `cycle` s; one figure a company */
export interface ArmSpec {
  name: string
  /** a switch it answers to besides its own (?<group>=0: every arm of the group left out; its own wins) */
  group?: string
  unitType: string
  formation: string
  figure: string
  sides: readonly [string, string]
  script:
    | { kind: 'drill' }
    | { kind: 'ride'; legs: readonly Leg[] }
    | { kind: 'serve'; rest: string; work: string; restSeconds: number; lag: number; cycle: number }
  tread: number
  /** its simple shadows' share of the samples raised by this (1 to 1.5; none: 1), never past the ground's shade */
  shadowDarken?: number
  /** whether its units carry colours (none: they do) */
  flags?: boolean
  /** its figure's colour roles shown otherwise than the figure's unit data says (a stand-in: the light cavalry's
   *  cuirass, its metal role, painted as its coat) */
  parts?: Readonly<Record<string, FigurePart>>
}

/** a unit's footprint in its own frame (across a0..a1, ahead z0..z1, m) */
export interface Foot {
  a0: number
  a1: number
  z0: number
  z1: number
}
/** m of open ground kept round an infantry unit's footprint */
const DRILL_MARGIN = 3

/** An arm's script (drillScript, rideScript, serveScript) from its spec, its type's geometry and formation, and its
 *  figure's roles' root speeds (m/s; a drill's march and run); and its men's footprints in its frame (m): at work
 *  (every place they take over the cycle: a drill's line, its approach and its column; a ride's whole ride) and at rest
 *  (a reserve's: a drill's column, a ride's halted slots) */
export function armScript(
  spec: ArmSpec,
  g: Geometry,
  place: (g: Geometry) => Placement[],
  speeds: Readonly<Record<string, number>>,
): { script: Script; work: Foot; rest: Foot } {
  const sc = spec.script
  if (sc.kind === 'drill') {
    const speed = { march: speeds.march ?? 0, run: speeds.run ?? 0 }
    if (!(speed.march > 0 && speed.run > 0)) throw new Error(`arms: ${spec.name}'s march and run roles have no speed`)
    const d: Drill = { ...g }
    const e = extents(d)
    const m = DRILL_MARGIN
    return {
      script: drillScript(d, speed),
      work: { a0: -e.halfFront - m, a1: e.halfFront + m, z0: -(APPROACH + e.columnDepth) - m, z1: m },
      rest: { a0: -e.columnHalf - m, a1: e.columnHalf + m, z0: -e.columnDepth - m, z1: m },
    }
  }
  if (sc.kind === 'ride') {
    const places = formationSlots(g, place)
    return {
      script: rideScript(places, sc.legs, speeds, g.fileSpacing),
      work: footprint(places, 3, rideLength(sc.legs, speeds)),
      rest: footprint(places, 3),
    }
  }
  const places = companySlots(g, place)
  const pieces = place(g)
  const interval = pieces.length > 1 ? Math.abs(pieces[1].x - pieces[0].x) : g.fileSpacing
  // (a piece and its crew stand about 3 m round its place)
  const foot = footprint(places, 5)
  return {
    script: serveScript(
      places,
      { rest: sc.rest, work: sc.work },
      { rest: sc.restSeconds, lag: sc.lag, cycle: sc.cycle },
      interval,
    ),
    work: foot,
    rest: foot,
  }
}

/** The unit ?lookat=<arm> looks at: of an arm's units, the one nearest `focus` (the fight's middle) whose place is
 *  within the camera's play area (±play m: the camera reaches it), else the nearest of all; null with none */
export function lookAtUnit(
  units: readonly { x: number; z: number }[],
  focus: readonly [number, number],
  play: number,
): { x: number; z: number } | null {
  const inPlay = units.filter(u => Math.abs(u.x) <= play && Math.abs(u.z) <= play)
  const from = inPlay.length > 0 ? inPlay : units
  let best: { x: number; z: number } | null = null
  let d = Infinity
  for (const u of from) {
    const e = Math.hypot(u.x - focus[0], u.z - focus[1])
    if (e < d) {
      d = e
      best = u
    }
  }
  return best
}

/** Where ?lookat=<arm>[,<radius m>] starts the camera (src/look/main.ts): on that arm's unit (arms: each arm on the
 *  page by name, the place of its unit to look at: lookAtUnit), or on the fight's middle (fight), at that zoom (30 m by
 *  default); null without ?lookat. A clear error for a radius that is not a positive number, or an arm not on the page,
 *  naming those that are (none under ?sim, nor with ?cavalry=0 and ?artillery=0). (?lookat without ?battle: main.ts's)
 */
export function lookAtSpot(
  want: string | null,
  arms: Readonly<Record<string, { x: number; z: number }>>,
  fight: readonly [number, number],
): { x: number; z: number; radius: number } | null {
  if (want === null) return null
  const [name, r, ...more] = want.split(',')
  const radius = r === undefined ? 30 : Number(r)
  const names = Object.keys(arms)
  if (name !== 'fight' && !Object.hasOwn(arms, name)) {
    const on = names.length > 0 ? `the arms on this page: ${names.join(', ')}` : 'no other arm on this page'
    throw new Error(`?lookat=${want}: not fight nor an arm on this page (${on}; ?sim leaves them out, as ?<arm>=0)`)
  }
  if (!(radius > 0) || more.length > 0) throw new Error(`?lookat=${want}: <arm>[,<radius m>], a radius above 0`)
  const at = name === 'fight' ? { x: fight[0], z: fight[1] } : arms[name]
  return { x: at.x, z: at.z, radius }
}
