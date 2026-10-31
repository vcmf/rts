// The demo map's battle at the division scale (docs/plans/active/division-armies.md, decision 0076): each side's order
// of battle (corps of the ruleset's compositions, filled up to a figure budget), and where each unit stands: the first
// corps in line along the front, each by the scenario's template (its first line deploying and firing, its guns
// before it, its horse riding along the front), the rest in column behind. Era-generic (decision 0015): the unit types,
// the corps and the template are the ruleset's and the scenario's data (src/rulesets/napoleonic-division.ts,
// src/scenarios/armies-demo.ts). Deterministic. No Babylon: the tests read it in Node.
//
// Frames as src/look/world/armies.ts: side 0 faces +z (heading 0), side 1 −z (heading π); a unit's frame has x across
// and z ahead
import type { Battalion, Blocked } from './armies.ts'
import { boxOf, clearIn, overlaps, placeArm, type Box, type Foot } from './arms.ts'

/** a corps' units: so many of each unit type, in the order they are fielded */
export type Composition = readonly { readonly type: string; readonly count: number }[]

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
 *  the side ends there. A type without a size or of no figures: a loud failure */
export function orderOfBattle(spec: BattleSpec, sizes: Readonly<Record<string, number>>): Fielded[] {
  const out: Fielded[] = []
  let left = Math.floor(spec.figures / 2)
  let corps = 0
  const take = (c: Composition, repeat: boolean): boolean => {
    for (const { type, count } of c) {
      const n = sizes[type]
      if (!(n > 0)) throw new Error(`battle: the unit type ${type} has no size (${Object.keys(sizes).join(', ')})`)
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
  if (spec.repeat.length === 0) return out
  while (take(spec.repeat, true));
  return out
}

/** a side's figures: its units' sizes summed */
export const figuresOf = (order: readonly Fielded[], sizes: Readonly<Record<string, number>>): number =>
  order.reduce((a, u) => a + sizes[u.type], 0)

/** A row of the template: the unit types standing side by side along the corps' front (left to right, from side 0's
 *  view), their origins `ahead` m in front of the side's front, turned `turn` rad from the side's heading */
export interface Post {
  units: readonly string[]
  ahead: number
  turn?: number
}
/** Where the battle's units stand: the first `engaged` repeated corps a side side by side along the front, `corpsGap`
 *  m apart, each by its posts (a unit type a post names taken from the corps' units in order; the corps' others in
 *  reserve), a row's units `gap` m apart */
export interface Deploy {
  engaged: number
  corpsGap: number
  gap: number
  posts: readonly Post[]
}
/** a unit type's ground on the field: its footprints at work and at rest (its frame, m) and its script's cycle (s) */
export interface FieldKind {
  work: Foot
  rest: Foot
  cycle: number
}

/** the demo field: the centre between the two fronts and the gap between them, m (about a volley's range) */
export const FIELD: { readonly centre: readonly [number, number]; readonly gap: number } = { centre: [0, 0], gap: 110 }
/** m: a reserve's front stands at least this far behind its side's front */
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

/** One engaged corps' wants by its posts' rows (their `across` set when the corps is placed), from its units (types,
 *  in fielding order: each post takes from them); its width along the front (its widest row, m) and the units it
 *  left for the reserve */
function corpsWants(
  units: readonly string[],
  kinds: Readonly<Record<string, FieldKind>>,
  deploy: Deploy,
): { rows: { want: Want; width: number }[][]; width: number; left: string[] } {
  const left = [...units]
  const rows = deploy.posts.map(post => {
    const turn = post.turn ?? 0
    const row: { want: Want; width: number }[] = []
    for (const type of post.units) {
      const k = left.indexOf(type)
      if (k < 0) continue
      left.splice(k, 1)
      const b = boxAt(kinds[type].work, turn)
      // (the origin `ahead` m before the front; the footprint's centre where its box puts it)
      row.push({ want: { type, turn, ahead: post.ahead + (b.z0 + b.z1) / 2, across: 0 }, width: b.x1 - b.x0 })
    }
    return row
  })
  const widthOf = (row: { width: number }[]) =>
    row.reduce((a, u) => a + u.width, 0) + deploy.gap * Math.max(0, row.length - 1)
  return { rows, width: Math.max(0, ...rows.map(widthOf)), left }
}

/** Every unit of both sides' orders of battle (`orders[side]`) placed on the field: each side's first
 *  `deploy.engaged` repeated corps along the front by the template (placeArm: the spot nearest its post's, clear of the
 *  others and of the blocked ground, a unit with none joins the reserve), the rest at rest in column behind
 *  (RESERVE_BACK m at least: a pass over the grid's spots, the nearest the front and the middle first, for each unit
 *  in turn). Within ±extent m (past the camera's play area: the tile's), each side on its own half. Its units by type,
 *  each wearing its type's uniform of its side (`uniforms[type][side]`), the engaged ones' cycles staggered. A side
 *  with no room for its order of battle: a loud failure */
export function battleLayout(
  orders: readonly (readonly Fielded[])[],
  kinds: Readonly<Record<string, FieldKind>>,
  deploy: Deploy,
  blocked: Blocked,
  uniforms: Readonly<Record<string, readonly [string, string]>>,
  extent: number,
  field = FIELD,
): Record<string, Battalion[]> {
  const out: Record<string, Battalion[]> = {}
  const taken: Box[] = []
  for (const [side, order] of orders.entries()) {
    for (const u of order) {
      if (!kinds[u.type]) throw new Error(`battle: no field kind for the unit type ${u.type}`)
      if (!uniforms[u.type]) throw new Error(`battle: no uniforms for the unit type ${u.type}`)
    }
    const add = (type: string, b: Placed) => (out[type] ??= []).push({ side, uniform: uniforms[type][side], ...b })
    const at: SideField = { side, kinds, blocked, taken, extent, field, add }
    placeReserves(at, placeEngaged(at, order, deploy))
  }
  return out
}

/** a unit placed, before its side and uniform */
type Placed = Omit<Battalion, 'side' | 'uniform'>
/** what placing a side's units reads and fills: its side, the types' ground, the blocked ground, the boxes taken (both
 *  sides'), the area (±extent m) and the field, and where a unit placed goes */
interface SideField {
  side: number
  kinds: Readonly<Record<string, FieldKind>>
  blocked: Blocked
  taken: Box[]
  extent: number
  field: typeof FIELD
  add: (type: string, b: Placed) => void
}

/** the side's engaged corps placed by the template, side by side along the front; returns the side's other units'
 *  types, in order (the engaged corps' own first: their second line stands nearest the front) */
function placeEngaged(at: SideField, order: readonly Fielded[], deploy: Deploy): string[] {
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
  let x = -(engaged.reduce((a, c) => a + c.width, 0) + deploy.corpsGap * Math.max(0, engaged.length - 1)) / 2
  for (const c of engaged) {
    for (const row of c.rows) reserves.push(...placeRow(at, row, x + c.width / 2, deploy.gap, staggered))
    x += c.width + deploy.corpsGap
    reserves.push(...c.left)
  }
  return [...reserves, ...order.filter(u => !corpsIds.includes(u.corps)).map(u => u.type)]
}

/** a row of an engaged corps placed along the front, centred `centre` m along it, its units `gap` m apart, each at the
 *  spot nearest its own and never ahead of it (placeArm with back), its cycle staggered after the last of its type's
 *  (staggered: each type's count so far); returns the types of those it had no room for */
function placeRow(
  at: SideField,
  row: readonly { want: Want; width: number }[],
  centre: number,
  gap: number,
  staggered: Record<string, number>,
): string[] {
  const left: string[] = []
  let x = centre - (row.reduce((a, u) => a + u.width, 0) + gap * (row.length - 1)) / 2
  for (const { want, width } of row) {
    const across = x + width / 2
    x += width + gap
    const kind = at.kinds[want.type]
    const front = at.field.gap / 2
    const p = placeArm(
      kind.work,
      at.side,
      { ...want, across, back: true },
      at.field.centre,
      front,
      at.blocked,
      at.taken,
      at.extent,
    )
    if (!p) {
      left.push(want.type)
      continue
    }
    const k = (staggered[want.type] = (staggered[want.type] ?? -1) + 1)
    at.add(want.type, { x: p.x, z: p.z, heading: p.heading, offset: (k * STAGGER) % kind.cycle })
  }
  return left
}

/** the reserves (types, in order) placed at rest in column: each at the first of the grid's spots, the nearest the
 *  front and the middle first, that takes it (each type's pass resumes where its last unit stood: a spot refused stays
 *  refused, the ground only fills) */
function placeReserves(at: SideField, reserves: readonly string[]): void {
  const { side, field, extent } = at
  const h = side === 0 ? 0 : Math.PI
  const ahead = side === 0 ? 1 : -1
  const front = field.gap / 2
  const spots = reserveSpots(extent, front)
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
      if (at.taken.some(t => overlaps(t, b)) || !clearIn(b, at.blocked)) continue
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

// the reserves' spots (m: across the front, behind it), RESERVE_BACK m back at least, the nearest the front and the
// middle first: the same for either side, built once an extent
const spotsByExtent = new Map<string, [number, number][]>()
function reserveSpots(extent: number, front: number): [number, number][] {
  const key = `${extent},${front}`
  let s = spotsByExtent.get(key)
  if (!s) {
    s = []
    for (let bi = Math.ceil(RESERVE_BACK / GRID); bi * GRID <= extent + front; bi++) {
      for (let ai = -Math.floor(extent / GRID); ai * GRID <= extent; ai++) s.push([ai * GRID, bi * GRID])
    }
    s.sort((p, q) => 0.5 * Math.abs(p[0]) + p[1] - (0.5 * Math.abs(q[0]) + q[1]) || p[0] - q[0] || p[1] - q[1])
    spotsByExtent.set(key, s)
  }
  return s
}

/** The battle the page asks for (src/look/main.ts): ?battle=<name> (bare: the default), or the old ?armies=<n>
 *  (n battalions a side of `legacy` figures) as the battle whose budget is nearest its figures; null: no armies. A
 *  name not among `names`, a count not 1 to 40, or both switches: a clear error */
export function battleChoice(
  q: URLSearchParams,
  budgets: Readonly<Record<string, number>>,
  def: string,
  legacy: number,
): string | null {
  const battle = q.get('battle')
  const armies = q.get('armies')
  const names = Object.keys(budgets)
  if (battle !== null && armies !== null) throw new Error('?battle and ?armies both given: ?battle alone (or ?armies)')
  if (battle !== null) {
    const name = battle === '' ? def : battle
    if (!Object.hasOwn(budgets, name)) throw new Error(`?battle must be one of ${names.join(', ')}, not ${battle}`)
    return name
  }
  if (armies === null) return null
  if (!(/^\d+$/.test(armies) && +armies >= 1 && +armies <= 40)) {
    throw new Error(`?armies must be 1 to 40 (old battalions a side, mapped onto ?battle), not ${armies}`)
  }
  const figures = +armies * legacy * 2
  return names.reduce((a, n) => (Math.abs(budgets[n] - figures) < Math.abs(budgets[a] - figures) ? n : a))
}

/** The page's address with the battle chosen in its panel: ?battle=<name>, or no armies (null), the old ?armies
 *  dropped, every other switch kept */
export function battleHref(href: string, name: string | null): string {
  const u = new URL(href)
  u.searchParams.delete('armies')
  if (name === null) u.searchParams.delete('battle')
  else u.searchParams.set('battle', name)
  return u.href
}
