// The demo map's battle at the division scale (docs/plans/active/division-armies.md, decision 0099): each side's order
// of battle (corps of the ruleset's compositions, filled up to a figure budget), and where each unit stands: the first
// corps in line along the front, each by the scenario's template (its first line deploying and firing, its guns
// before it, its horse riding along the front), the rest in column behind. Era-generic (decision 0015): the unit types,
// the corps and the template are the ruleset's and the scenario's data (src/rulesets/napoleonic-division.ts,
// src/scenarios/armies-demo.ts). Deterministic. No Babylon: the tests read it in Node.
//
// Frames as src/look/world/armies.ts: side 0 faces +z (heading 0), side 1 −z (heading π); a unit's frame has x across
// and z ahead
import type { Composition } from '../../sim/ruleset.ts'
import type { Battalion, Blocked } from './armies.ts'
import { boxOf, clearIn, overlaps, placeArm, type Box, type Foot } from './arms.ts'

/** A battle's size: each side fields the `once` corps (in order: the reserve cavalry corps, for one), then the
 *  `repeat` corps again and again, up to half the `figures` budget */
export interface BattleSpec {
  figures: number
  once: readonly Composition[]
  repeat: Composition
}

/** a unit of a side's order of battle: its type, its corps (an index in the side's fielding order) and whether that
 *  corps is one of the repeated ones (the line corps the template deploys) */
export interface Fielded {
  type: string
  corps: number
  repeat: boolean
}

/** One side's order of battle: the battle's `once` corps, then its `repeat` corps, each unit taken in order while
 *  it fits in half the budget (figures by unit type: sizes); a corps is cut at its first unit that does not fit, and
 *  the side ends there (or when a corps adds no unit). A type without a size or of no figures, or a corps of no
 *  figures: a loud failure */
export function orderOfBattle(spec: BattleSpec, sizes: Readonly<Record<string, number>>): Fielded[] {
  for (const c of [...spec.once, spec.repeat]) checkComposition(c, sizes)
  const out: Fielded[] = []
  let left = Math.floor(spec.figures / 2)
  let corps = 0
  const take = (c: Composition, repeat: boolean): boolean => {
    for (const { type, count } of c) {
      const n = sizes[type]
      for (let k = 0; k < count; k++) {
        if (n > left) return false
        left -= n
        out.push({ type, corps, repeat })
      }
    }
    corps++
    return true
  }
  for (const c of spec.once) if (!take(c, false)) return out
  // (until a corps does not fit, or adds no unit)
  for (let n = -1; n < out.length;) {
    n = out.length
    if (!take(spec.repeat, true)) break
  }
  return out
}

/** a corps' types all sized (above 0 figures) and its units some figures in all (an empty repeated corps would be
 *  fielded forever), or a loud failure */
function checkComposition(c: Composition, sizes: Readonly<Record<string, number>>): void {
  for (const { type } of c) {
    if (!(sizes[type] > 0)) {
      throw new Error(`battle: the unit type ${type} has no size (${Object.keys(sizes).join(', ')})`)
    }
  }
  const figures = c.reduce((a, u) => a + u.count * sizes[u.type], 0)
  if (!(figures > 0)) throw new Error(`battle: a corps of no figures (${JSON.stringify(c)})`)
}

/** a side's figures: its units' sizes summed */
export const figuresOf = (order: readonly Fielded[], sizes: Readonly<Record<string, number>>): number =>
  order.reduce((a, u) => a + sizes[u.type], 0)

/** A post of the template: unit types standing side by side along the corps' front (left to right, from side 0's
 *  view), their origins `ahead` m in front of the side's front, turned `turn` rad from the side's heading */
export interface Post {
  units: readonly string[]
  ahead: number
  turn?: number
}
/** Where the battle's units stand: the first `engaged` repeated corps a side side by side along the front,
 *  `corpsGap` m apart, each one row across the front, its posts left to right (a corps right of the middle mirrored,
 *  so each corps' last post stands nearest it; a unit type a post names taken from the corps' units in order; the
 *  corps' others in reserve), its units `gap` m apart */
export interface Deploy {
  engaged: number
  corpsGap: number
  gap: number
  posts: readonly Post[]
}
/** a unit type's ground on the field: its footprints at work and at rest (its frame, m), its script's cycle (s) and
 *  whether it fires (a drill's volleys, a service's guns: nothing of its side may stand before it) */
export interface FieldKind {
  work: Foot
  rest: Foot
  cycle: number
  fires: boolean
}

/** the demo field: the centre between the two fronts and the gap between them, m (about a volley's range) */
export const FIELD: { readonly centre: readonly [number, number]; readonly gap: number } = { centre: [0, 0], gap: 110 }
/** m: a reserve stands at least this far behind its side's front, and behind every engaged footprint of its side it
 *  overlaps across */
export const RESERVE_BACK = 40
/** m: the reserves' grid of spots */
const GRID = 5
/** s between one engaged unit's cycle start and the next's of its type */
const STAGGER = 9.7

/** a want for placeArm: the footprint's centre `across` m along the front, `ahead` m in front of it */
interface Want {
  type: string
  turn: number
  ahead: number
  across: number
}

/** the world box of a footprint for a unit at the origin heading h (its width along x and its centre's offset) */
const boxAt = (f: Foot, h: number): Box => boxOf(0, 0, h, f.a0, f.a1, f.z0, f.z1)

/** One engaged corps' row: its wants by its posts, left to right (their `across` set when the corps is placed), from
 *  its units (types, in fielding order: each post takes from them); its width along the front (m) and the units it
 *  left for the reserve */
function corpsWants(
  units: readonly string[],
  kinds: Readonly<Record<string, FieldKind>>,
  deploy: Deploy,
): { row: { want: Want; width: number }[]; width: number; left: string[] } {
  const left = [...units]
  const row: { want: Want; width: number }[] = []
  for (const post of deploy.posts) {
    const turn = post.turn ?? 0
    for (const type of post.units) {
      const k = left.indexOf(type)
      if (k < 0) continue
      left.splice(k, 1)
      const b = boxAt(kinds[type].work, turn)
      // (the origin `ahead` m before the front; the footprint's centre where its box puts it)
      row.push({ want: { type, turn, ahead: post.ahead + (b.z0 + b.z1) / 2, across: 0 }, width: b.x1 - b.x0 })
    }
  }
  const width = row.reduce((a, u) => a + u.width, 0) + deploy.gap * Math.max(0, row.length - 1)
  return { row, width, left }
}

/** The battle's units by type, and how many engaged units a side found no legal spot and stand in reserve */
export interface Layout {
  units: Record<string, Battalion[]>
  fellBack: number[]
}

/** Every unit of both sides' orders of battle (`orders[side]`) placed on the field, under two friendly-line rules: no
 *  unit stands before a firing unit of its side it overlaps across, and no engaged unit stands behind another of its
 *  side it overlaps across (along the front, an engaged unit's ground is its own). Each side's first `deploy.engaged`
 *  repeated corps stand along the front by the template (placeArm: the legal spot nearest its post's, never ahead of
 *  it, clear of the others and of the blocked ground; a unit with none joins the reserve, with a warning), then the
 *  rest at rest in column behind (RESERVE_BACK m behind the front and behind every engaged footprint they overlap
 *  across: a pass over the grid's spots, the nearest the front and the middle first). Within ±extent m (past the
 *  camera's play area: the tile's), each side on its own half. Its units by type, each wearing its type's uniform of
 *  its side (`uniforms[type][side]`), the engaged ones' cycles staggered. A side with no room for its order of
 *  battle: a loud failure */
export function battleLayout(
  orders: readonly (readonly Fielded[])[],
  kinds: Readonly<Record<string, FieldKind>>,
  deploy: Deploy,
  blocked: Blocked,
  uniforms: Readonly<Record<string, readonly [string, string]>>,
  extent: number,
  field = FIELD,
): Layout {
  const units: Record<string, Battalion[]> = {}
  const taken: Box[] = []
  const fellBack: number[] = []
  for (const [side, order] of orders.entries()) {
    for (const u of order) {
      if (!kinds[u.type]) throw new Error(`battle: no field kind for the unit type ${u.type}`)
      if (!uniforms[u.type]) throw new Error(`battle: no uniforms for the unit type ${u.type}`)
    }
    const add = (type: string, b: Placed) => (units[type] ??= []).push({ side, uniform: uniforms[type][side], ...b })
    const at: SideField = { side, kinds, blocked, taken, engaged: [], extent, field, add }
    const { reserves, fell } = placeEngaged(at, order, deploy)
    if (fell > 0) {
      console.warn(`armies: ${fell} engaged units of side ${side} found no legal spot and stand in reserve (battle.ts)`)
    }
    fellBack.push(fell)
    placeReserves(at, reserves)
  }
  return { units, fellBack }
}

/** a unit placed, before its side and uniform */
type Placed = Omit<Battalion, 'side' | 'uniform'>
/** what placing a side's units reads and fills: its side, the types' ground, the blocked ground, the boxes taken (both
 *  sides'), its engaged units' boxes, the area (±extent m) and the field, and where a unit placed goes */
interface SideField {
  side: number
  kinds: Readonly<Record<string, FieldKind>>
  blocked: Blocked
  taken: Box[]
  engaged: Box[]
  extent: number
  field: typeof FIELD
  add: (type: string, b: Placed) => void
}

/** whether two boxes overlap across the front (x: both sides' fronts run along x) */
const across = (p: Box, q: Box): boolean => p.x0 < q.x1 && q.x0 < p.x1
/** m a box's front edge stands ahead of the field's centre line by its side's way (side 0 faces +z) */
const foreOf = (side: number, b: Box): number => (side === 0 ? b.z1 : -b.z0)
/** m a box's rear edge stands ahead, the same way */
const rearOf = (side: number, b: Box): number => (side === 0 ? b.z0 : -b.z1)

/** the side's engaged corps placed by the template, side by side along the front, each engaged unit's ground across
 *  the front its own (no other engaged unit of its side overlaps it across: none stands before or behind it); returns
 *  the side's other units' types, in order (the engaged corps' own first: their second line stands nearest the front),
 *  and how many engaged units found no legal spot (in reserve with them) */
function placeEngaged(at: SideField, order: readonly Fielded[], deploy: Deploy): { reserves: string[]; fell: number } {
  const corpsIds = [...new Set(order.filter(u => u.repeat).map(u => u.corps))].slice(0, deploy.engaged)
  const engaged = corpsIds.map(c =>
    corpsWants(
      order.filter(u => u.corps === c).map(u => u.type),
      at.kinds,
      deploy,
    ),
  )
  const reserves: string[] = []
  const staggered: Record<string, number> = {}
  let fell = 0
  let x = -(engaged.reduce((a, c) => a + c.width, 0) + deploy.corpsGap * Math.max(0, engaged.length - 1)) / 2
  for (const c of engaged) {
    // (a corps right of the middle mirrored: each corps' last post stands nearest the middle)
    const mirrored = x + c.width / 2 > 0 ? [...c.row].reverse() : c.row
    const left = placeRow(at, mirrored, x, deploy.gap, staggered)
    fell += left.length
    reserves.push(...left, ...c.left)
    x += c.width + deploy.corpsGap
  }
  return { reserves: [...reserves, ...order.filter(u => !corpsIds.includes(u.corps)).map(u => u.type)], fell }
}

/** an engaged corps' row placed along the front from `start` m (its left edge), its units `gap` m apart, each at the
 *  legal spot nearest its own and never ahead of it (placeArm with back and allows: no engaged box of its side across
 *  it), its cycle staggered after the last of its type's (staggered: each type's count so far); returns the types of
 *  those with no legal spot */
function placeRow(
  at: SideField,
  row: readonly { want: Want; width: number }[],
  start: number,
  gap: number,
  staggered: Record<string, number>,
): string[] {
  const left: string[] = []
  const allows = (b: Box) => !at.engaged.some(e => across(e, b))
  let x = start
  for (const { want, width } of row) {
    const wanted = { ...want, across: x + width / 2, back: true, allows }
    x += width + gap
    const kind = at.kinds[want.type]
    const front = at.field.gap / 2
    const p = placeArm(kind.work, at.side, wanted, at.field.centre, front, at.blocked, at.taken, at.extent)
    if (!p) {
      left.push(want.type)
      continue
    }
    at.engaged.push(at.taken[at.taken.length - 1])
    const k = (staggered[want.type] = (staggered[want.type] ?? -1) + 1)
    at.add(want.type, { x: p.x, z: p.z, heading: p.heading, offset: (k * STAGGER) % kind.cycle })
  }
  return left
}

/** the reserves (types, in order) placed at rest in column: each at the first of the grid's spots, the nearest the
 *  front and the middle first, that takes it: clear, and RESERVE_BACK m behind every engaged box of its side it
 *  overlaps across (each type's pass resumes where its last unit stood: a spot refused stays refused, the engaged
 *  boxes fixed and the ground only filling) */
function placeReserves(at: SideField, reserves: readonly string[]): void {
  const { side, field, extent } = at
  const h = side === 0 ? 0 : Math.PI
  const ahead = side === 0 ? 1 : -1
  const front = field.gap / 2
  const spots = reserveSpots(extent, field)
  const behindEngaged = (b: Box) =>
    at.engaged.every(e => !across(e, b) || foreOf(side, b) <= rearOf(side, e) - RESERVE_BACK)
  const cursor: Record<string, number> = {}
  for (const [placed, type] of reserves.entries()) {
    const f = at.kinds[type].rest
    let k = cursor[type] ?? 0
    for (; k < spots.length; k++) {
      const [ac, bh] = spots[k]
      const x = field.centre[0] + ac
      const z = field.centre[1] - ahead * (front + bh)
      const b = boxOf(x, z, h, f.a0, f.a1, f.z0, f.z1)
      if (b.x0 < -extent || b.x1 > extent || b.z0 < -extent || b.z1 > extent) continue
      if (side === 0 ? b.z1 > field.centre[1] : b.z0 < field.centre[1]) continue
      if (!behindEngaged(b) || at.taken.some(t => overlaps(t, b)) || !clearIn(b, at.blocked)) continue
      at.taken.push(b)
      at.add(type, { x, z, heading: h, offset: 0, reserve: true })
      break
    }
    cursor[type] = k
    if (k >= spots.length) {
      throw new Error(
        `armies: room for only ${placed} of ${reserves.length} reserves for side ${side} within ±${extent} m (no spot for a ${type}; src/look/world/battle.ts)`,
      )
    }
  }
}

/** The reserves' spots (m: across the front from the field's centre, behind the front), RESERVE_BACK m back at least,
 *  every row and column one whose unit's origin is on the field (±extent m) for either side, the nearest the front
 *  and the middle first: built once a field and extent */
const spotsByField = new Map<string, [number, number][]>()
export function reserveSpots(extent: number, field: typeof FIELD): [number, number][] {
  const key = `${extent},${field.centre.join()},${field.gap}`
  let s = spotsByField.get(key)
  if (!s) {
    s = []
    // (side 0's origin at z = cz − front − bh, side 1's at cz + front + bh: within ±extent for the side farther in)
    const back = extent + Math.abs(field.centre[1]) - field.gap / 2
    const across = extent + Math.abs(field.centre[0])
    for (let bi = Math.ceil(RESERVE_BACK / GRID); bi * GRID <= back; bi++) {
      for (let ai = -Math.floor(across / GRID); ai * GRID <= across; ai++) s.push([ai * GRID, bi * GRID])
    }
    s.sort((p, q) => 0.5 * Math.abs(p[0]) + p[1] - (0.5 * Math.abs(q[0]) + q[1]) || p[0] - q[0] || p[1] - q[1])
    spotsByField.set(key, s)
  }
  return s
}
