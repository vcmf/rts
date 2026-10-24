// Commands (docs/proposals/sim-design.md §4): the only way into the simulation. The sim stamps each
// command with the next tick and a sequence number, quantises its positions to 1 cm, and applies it at the
// start of that tick after validating it; an invalid command is dropped with a reason and changes nothing.
// Only external commands (player, scripts) go into the replay log. Shapes and order presets are named by
// the ruleset (decision 0015).
import type { Handle } from './handle.ts'
import { quantise, PI } from './num.ts'
import {
  type World,
  M_TICK,
  M_SEQ,
  M_FREE,
  SIDES,
  O_MOVE,
  O_FORM,
  O_WHEEL,
  O_FACE,
  O_CHARGE,
  CH_CLOSING,
  MORALE_STATES,
  outOfFight,
  FIRE_AT_WILL,
  formationSlot,
  typeOf,
} from './world.ts'
import { spawnFire } from './fire.ts'
import { spawnMorale } from './morale.ts'
import { GAP_UNKNOWN } from './melee.ts'
import {
  allocOrder,
  appendOrder,
  clearOrders,
  ordersFree,
  rebalance,
  resetTrail,
  removeMan,
  RETIRE,
  fillRetire,
} from './formation.ts'
import { nextInt } from './rng.ts'
import { columnsOf } from './columns.ts'

export type Command =
  | { type: 'move'; id: Handle; points: [number, number][]; append: boolean }
  | { type: 'form'; id: Handle; shape: string }
  | { type: 'wheel'; id: Handle; angle: number }
  | { type: 'face'; id: Handle }
  | { type: 'retire'; id: Handle; metres: number }
  | { type: 'halt'; id: Handle }
  | { type: 'style'; id: Handle; preset: string }
  | {
      // unit: the unit type (the ruleset's first when left out); shape: the type's start when left out
      type: 'debug-spawn'
      side: number
      x: number
      z: number
      heading: number
      shape?: string
      men: number
      quality?: number
      fire?: string
      unit?: string
    }
  | { type: 'fire'; id: Handle; mode: string; target?: Handle }
  | { type: 'side'; side: number; x: number; z: number }
  | { type: 'debug-kill'; id: Handle; men: number }
  | { type: 'debug-morale'; id: Handle; quality: number }
  | { type: 'charge'; id: Handle; target: Handle }
  // what `issue` stamps in place of a command it cannot take (an unknown type, malformed waypoints): dropped with
  // its reason when applied, and saved and replayed like any other (#155)
  | { type: 'refused'; reason: string }
export interface Stamped {
  tick: number
  seq: number
  cmd: Command
}
export interface Dropped {
  tick: number
  seq: number
  reason: string
}

export const MAX_POINTS = 64
export const COMMAND_TYPES = [
  'move',
  'form',
  'wheel',
  'face',
  'retire',
  'halt',
  'style',
  'fire',
  'side',
  'debug-spawn',
  'debug-kill',
  'debug-morale',
  'charge',
] as const
export const FIRE_MODES = ['at will', 'hold'] // index = FIRE_AT_WILL, FIRE_HOLD

// a type the sim knows (`COMMAND_TYPES`; not `refused`, which only `issue` makes)
export const isCommandType = (t: unknown): boolean => (COMMAND_TYPES as readonly unknown[]).includes(t)
// why `issue` refuses a command: a `refused` command carries one of these and nothing else
export const REFUSALS = [
  'unknown command',
  'malformed command',
  'malformed waypoints',
  'no waypoints',
  'too many waypoints',
] as const

// each type's fields and what each must be (a field marked ? may be left out; quantiseCommand gives its default):
// id: a handle; int: a count or a side; num: a number (its range is the rules', checked when applied); str: a
// string; bool: a flag; pts: 1..MAX_POINTS [x, z] number pairs. Every number finite, so a queued command is also
// what a JSON replay log holds (no NaN or ∞ turned into null)
type Kind = 'id' | 'int' | 'num' | 'str' | 'bool' | 'pts'
const SCHEMA: Record<string, string[]> = {
  move: ['id:id', 'points:pts', 'append?:bool'],
  form: ['id:id', 'shape:str'],
  wheel: ['id:id', 'angle:num'],
  face: ['id:id'],
  retire: ['id:id', 'metres:num'],
  halt: ['id:id'],
  style: ['id:id', 'preset:str'],
  'debug-spawn': [
    'side:int',
    'x:num',
    'z:num',
    'heading:num',
    'shape?:str',
    'men:int',
    'quality?:num',
    'fire?:str',
    'unit?:str',
  ],
  fire: ['id:id', 'mode:str', 'target?:id'],
  side: ['side:int', 'x:num', 'z:num'],
  'debug-kill': ['id:id', 'men:int'],
  'debug-morale': ['id:id', 'quality:num'],
  charge: ['id:id', 'target:id'],
}

// stamps a command for the next tick; `log` receives it when the command is external. It never throws: a command
// that is not one, of an unknown type, with a field of the wrong kind or waypoints that are not 1..64 [x, z] number
// pairs, is stamped as `refused` with the reason it is dropped for (#155). So every queued and logged command is
// canonical: a save writes it and reads it back as it was, and a replay re-issuing it gets the same command, the
// same sequence number and the same drop.
export function issue(w: World, cmd: Command, log?: Stamped[]): Stamped {
  const s: Stamped = { tick: w.meta[M_TICK] + 1, seq: w.meta[M_SEQ]++, cmd: normaliseCommand(cmd) }
  w.pending.push(s)
  if (log) log.push(s)
  return s
}
const finiteNumber = (v: unknown): v is number => typeof v === 'number' && v === v && v !== Infinity && v !== -Infinity
const refused = (reason: (typeof REFUSALS)[number]): Command => ({ type: 'refused', reason })
// a command checked once against its type's fields, then quantised: canonical, or `refused` with why. Total (each
// field of what it is given is read once, and a getter or a Proxy that throws makes it a malformed command) and
// idempotent: a canonical command comes back equal
export function normaliseCommand(cmd: unknown): Command {
  try {
    if (typeof cmd !== 'object' || cmd === null) return refused('unknown command')
    const c = cmd as Record<string, unknown>
    const type = c.type
    if (type === 'refused') {
      const r = c.reason // a replay's refused command comes back as it was; any other reason is not one
      return typeof r === 'string' && (REFUSALS as readonly string[]).includes(r)
        ? { type: 'refused', reason: r }
        : refused('unknown command')
    }
    if (typeof type !== 'string' || !isCommandType(type)) return refused('unknown command')
    const out: Record<string, unknown> = { type }
    for (const spec of SCHEMA[type]) {
      const [name, kind] = spec.split(':') as [string, Kind]
      const optional = name.endsWith('?')
      const k = optional ? name.slice(0, -1) : name
      const v = c[k]
      if (v === undefined && optional) continue
      if (kind === 'pts') {
        const p = waypoints(v)
        if (typeof p === 'string') return refused(p)
        out[k] = p
      } else if (kind === 'str') {
        if (typeof v !== 'string') return refused('malformed command')
        out[k] = wellFormedString(v)
      } else if (kind === 'bool') {
        if (typeof v !== 'boolean') return refused('malformed command')
        out[k] = v
      } else {
        if (!finiteNumber(v)) return refused('malformed command')
        out[k] = v
      }
    }
    return quantiseCommand(out as unknown as Command)
  } catch {
    return refused('malformed command') // a field whose read threw (a getter, a Proxy)
  }
}
// waypoints as given, checked with a plain index loop (a hole in a sparse array is no pair): a fresh array of
// [x, z] number pairs, or why not
function waypoints(v: unknown): [number, number][] | (typeof REFUSALS)[number] {
  if (!Array.isArray(v)) return 'malformed waypoints'
  const n: number = v.length
  if (n === 0) return 'no waypoints'
  if (n > MAX_POINTS) return 'too many waypoints'
  const out: [number, number][] = []
  for (let i = 0; i < n; i++) {
    const p: unknown = v[i]
    if (!Array.isArray(p) || p.length !== 2) return 'malformed waypoints'
    const x: unknown = p[0]
    const z: unknown = p[1]
    if (!finiteNumber(x) || !finiteNumber(z)) return 'malformed waypoints'
    out.push([x, z])
  }
  return out
}
// a string with each lone surrogate replaced by U+FFFD (String.prototype.toWellFormed), so the queued string is the
// one a save's UTF-8 holds
function wellFormedString(s: string): string {
  let out = ''
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      const d = s.charCodeAt(i + 1)
      if (d >= 0xdc00 && d <= 0xdfff) {
        out += s[i] + s[i + 1]
        i++
        continue
      }
    }
    out += c >= 0xd800 && c <= 0xdfff ? '\ufffd' : s[i]
  }
  return out
}
// quantises a command already checked (normaliseCommand): positions to 1 cm, angles to 0.1 mrad, ids and counts to
// integers, and the defaults of the fields left out. A spawn's quality: −1 marks none given (the ruleset's), any
// other negative becomes −2 (refused when applied); so quantising a quantised command changes nothing
export function quantiseCommand(c: Command): Command {
  const qa = (a: number) => Math.round(a * 10000) / 10000 + 0 // + 0: a value rounding to zero is +0 (#157)
  switch (c.type) {
    case 'move':
      return {
        type: 'move',
        id: c.id | 0,
        points: c.points.map(([x, z]) => [quantise(x), quantise(z)]),
        append: !!c.append,
      }
    case 'form':
      return { type: 'form', id: c.id | 0, shape: c.shape }
    case 'wheel':
      return { type: 'wheel', id: c.id | 0, angle: qa(c.angle) }
    case 'face':
      return { type: 'face', id: c.id | 0 }
    case 'retire':
      return { type: 'retire', id: c.id | 0, metres: quantise(c.metres) }
    case 'halt':
      return { type: 'halt', id: c.id | 0 }
    case 'style':
      return { type: 'style', id: c.id | 0, preset: c.preset }
    case 'debug-spawn':
      return {
        type: 'debug-spawn',
        side: c.side | 0,
        x: quantise(c.x),
        z: quantise(c.z),
        heading: qa(c.heading),
        shape: c.shape ?? '',
        men: c.men | 0,
        quality: c.quality === undefined || c.quality === -1 ? -1 : c.quality < 0 ? -2 : qa(c.quality),
        fire: c.fire ?? FIRE_MODES[FIRE_AT_WILL],
        unit: c.unit ?? '',
      }
    case 'fire':
      return { type: 'fire', id: c.id | 0, mode: c.mode, target: (c.target ?? 0) | 0 }
    case 'side':
      return { type: 'side', side: c.side | 0, x: qa(c.x), z: qa(c.z) }
    case 'debug-kill':
      return { type: 'debug-kill', id: c.id | 0, men: c.men | 0 }
    case 'debug-morale':
      return { type: 'debug-morale', id: c.id | 0, quality: qa(c.quality) }
    case 'charge':
      return { type: 'charge', id: c.id | 0, target: c.target | 0 }
    default:
      return c
  }
}

const inside = (w: World, x: number, z: number): boolean => {
  const t = w.terrain
  const e = (t.n - 1) * t.cell
  return x >= t.x0 && z >= t.z0 && x <= t.x0 + e && z <= t.z0 + e
}
const finite = (v: number): boolean => v === v && v !== Infinity && v !== -Infinity

// applies the commands stamped for tick t, in sequence order; returns the dropped ones
export function applyCommands(w: World, t: number): Dropped[] {
  const dropped: Dropped[] = []
  const keep: Stamped[] = []
  for (const s of w.pending) {
    if (s.tick > t) {
      keep.push(s)
      continue
    }
    const why =
      s.tick < t
        ? 'stale tick'
        : s.cmd.type === 'refused'
          ? s.cmd.reason
          : !isCommandType(s.cmd.type) // a guard: `issue` stamps none, but `pending` is an open array
            ? 'unknown command'
            : apply(w, s.cmd)
    if (why) dropped.push({ tick: t, seq: s.seq, reason: why })
  }
  w.pending = keep
  return dropped
}

// replaces (or appends to) a formation's orders with new ones of the given types; '' or why not
function giveOrders(
  w: World,
  i: number,
  types: number[],
  append: boolean,
  fill: (n: number, k: number) => void,
  player: boolean,
): string {
  let room = ordersFree(w)
  if (!append) for (let n = w.f.ordHead[i]; n >= 0; n = w.ord.next[n]) room++
  if (types.length > room) return 'order pool full'
  if (!append) clearOrders(w, i)
  types.forEach((t, k) => {
    const n = allocOrder(w, t)
    fill(n, k)
    appendOrder(w, i, n)
  })
  w.f.status[i] = 0
  w.f.blockedFor[i] = 0
  if (player) playerOrdered(w, i) // a scenario's plan is not the player: the standing behaviour carries on
  return ''
}
// the player's order is obeyed: the square against cavalry stands down for this spell of threat and forgets the
// shape it would form back into (a charge replaced by another order ends at the melee step)
function playerOrdered(w: World, i: number): void {
  const f = w.f
  f.autoFrom[i] = 0
  if (f.alertAt[i]) f.refugeOff[i] = 1
}

// applies a command now, as the tick applies a stamped one (plan.ts: a scenario's plan); '' or why it was dropped
// (not as the player's: it does not stand the square against cavalry down)
export const applyNow = (w: World, c: Command): string => apply(w, normaliseCommand(c), false)
function apply(w: World, c: Command, player = true): string {
  if (c.type === 'refused') return c.reason
  const f = w.f
  const o = w.ord
  const cr = w.cr
  if (c.type === 'debug-spawn') {
    if (c.side < 0 || c.side >= SIDES) return 'no such side'
    const type = c.unit ? cr.typeIndex(c.unit) : 0
    if (type < 0) return 'no such unit type'
    const U = cr.types[type]
    const shape = c.shape ? U.shapeIndex(c.shape) : U.start
    if (shape < 0) return 'no such shape'
    if (c.men <= 0 || c.men > U.slots) return 'no room for those men'
    if (!inside(w, c.x, c.z)) return 'outside the map'
    if (Math.abs(c.heading) > 4 * PI) return 'heading out of range'
    const q = c.quality === undefined || c.quality === -1 ? cr.rs.morale.quality : c.quality // −1: the ruleset's
    if (q < 0 || q > 1) return 'no such quality'
    const mode = FIRE_MODES.indexOf(c.fire ?? FIRE_MODES[FIRE_AT_WILL])
    if (mode < 0) return 'no such fire mode'
    if (w.meta[M_FREE] === 0) return 'no free formation slot'
    const i = w.free[--w.meta[M_FREE]]
    f.alive[i] = 1
    f.side[i] = c.side
    f.type[i] = type
    f.shape[i] = shape
    f.style[i] = cr.presetIndex(cr.rs.start.orders)
    f.drill[i] = 1
    f.x[i] = c.x
    f.z[i] = c.z
    f.heading[i] = c.heading
    f.px[i] = c.x
    f.pz[i] = c.z
    f.ph[i] = c.heading
    f.men[i * cr.maxC] = c.men
    rebalance(w, i)
    w.sides.spawned[c.side] += c.men
    resetTrail(w, i)
    spawnFire(w, i)
    spawnMorale(w, i, q)
    f.fireMode[i] = mode
    return ''
  }
  if (c.type === 'side') {
    // the direction of a side's rear, where its routers run
    if (c.side < 0 || c.side >= SIDES) return 'no such side'
    const l = Math.sqrt(c.x * c.x + c.z * c.z)
    if (!finite(l) || l < 1e-6) return 'no such direction'
    w.sides.rearX[c.side] = c.x / l
    w.sides.rearZ[c.side] = c.z / l
    return ''
  }
  const i = formationSlot(w, c.id)
  if (i < 0) return 'no such formation'
  // out of the fight (routing, rallying, shattered): only the debug commands reach it
  if (outOfFight(f.mstate[i]) && c.type !== 'debug-kill' && c.type !== 'debug-morale') return MORALE_STATES[f.mstate[i]]
  // in melee: only the debug commands (it ends by a rout, docs/systems/melee.md)
  // (a scenario's plan's order is queued, for after the melee: it stands while it fights; but it does not charge)
  if (f.foe[i] && c.type !== 'debug-kill' && c.type !== 'debug-morale' && (player || c.type === 'charge')) {
    return 'in melee'
  }
  switch (c.type) {
    case 'move': {
      for (const [x, z] of c.points) if (!inside(w, x, z)) return 'waypoint outside the map'
      return giveOrders(
        w,
        i,
        c.points.map(() => O_MOVE),
        c.append,
        (n, k) => {
          o.x[n] = c.points[k][0]
          o.z[n] = c.points[k][1]
          o.resolved[n] = 1
        },
        player,
      )
    }
    case 'form': {
      const s = typeOf(w, i).shapeIndex(c.shape)
      if (s < 0) return 'no such shape'
      return giveOrders(
        w,
        i,
        [O_FORM],
        false,
        n => {
          o.shape[n] = s
        },
        player,
      )
    }
    case 'wheel':
      if (c.angle === 0 || Math.abs(c.angle) > 2 * PI) return 'no such wheel'
      return giveOrders(
        w,
        i,
        [O_WHEEL],
        false,
        n => {
          o.a[n] = c.angle
        },
        player,
      )
    case 'face':
      return giveOrders(w, i, [O_FACE], false, () => {}, player)
    case 'retire': // the Retire drill (formation.ts)
      if (c.metres <= 0 || c.metres > 1000) return 'no such retreat'
      return giveOrders(w, i, RETIRE, false, (n, k) => fillRetire(w, n, k, c.metres), player)
    case 'halt':
      clearOrders(w, i)
      f.status[i] = 0
      f.blockedFor[i] = 0
      if (player) playerOrdered(w, i)
      return ''
    case 'charge': {
      // docs/systems/melee.md
      const U = typeOf(w, i)
      const ch = U.charge
      if (!ch) return 'cannot charge'
      if (f.trans[i]) return 'changing shape'
      if (!ch.from[f.shape[i]]) return 'cannot charge from this shape'
      if (f.blownUntil[i] > w.meta[M_TICK] + 1) return 'blown'
      const j = formationSlot(w, c.target)
      if (j < 0 || f.side[j] === f.side[i]) return 'no such target'
      const why = giveOrders(w, i, [O_CHARGE], false, () => {}, player)
      if (why) return why
      f.chTarget[i] = c.target
      f.chPhase[i] = CH_CLOSING
      f.chRun[i] = 0
      f.chGap[i] = GAP_UNKNOWN
      f.chUntil[i] = 0
      return ''
    }
    case 'style': {
      const p = cr.presetIndex(c.preset)
      if (p < 0) return 'no such order preset'
      f.style[i] = p
      return ''
    }
    case 'debug-morale': // the quality its morale relaxes toward (scripted morale tests)
      if (c.quality < 0 || c.quality > 1) return 'no such quality'
      f.quality[i] = c.quality
      return ''
    case 'fire': {
      const m = FIRE_MODES.indexOf(c.mode)
      if (m < 0) return 'no such fire mode'
      const t = c.target ?? 0
      const j = t ? formationSlot(w, t) : -1
      if (t && (j < 0 || f.side[j] === f.side[i])) return 'no such target'
      f.fireMode[i] = m
      f.prefer[i] = t
      return ''
    }
    case 'debug-kill': {
      if (c.men <= 0) return 'no men'
      const C = typeOf(w, i).C
      const CS = cr.maxC
      for (let k = 0; k < c.men; k++) {
        // each man from a company drawn by the sim RNG, weighted by its men
        let tot = 0
        for (let q = 0; q < C; q++) tot += f.men[i * CS + q]
        if (!tot) break
        let r = nextInt(w.rng, tot)
        let q = 0
        while (r >= f.men[i * CS + q]) {
          r -= f.men[i * CS + q]
          q++
        }
        removeMan(w, i, q) // through the re-packing gate
      }
      return ''
    }
  }
  return 'unknown command'
}

// frees an empty formation's slot: its orders, every column of its row zeroed, the generation moved on
export function reapFormation(w: World, i: number): void {
  clearOrders(w, i)
  const gen = w.f.gen[i]
  const ver = w.f.trailVer[i]
  const N = w.f.alive.length
  for (const a of columnsOf(w.f)) {
    const k = a.length / N
    a.fill(0, i * k, i * k + k)
  }
  // the generation moves on (old handles go stale); the trail version keeps counting (it keys the arc cache)
  w.f.gen[i] = (gen + 1) & ((1 << 19) - 1)
  w.f.trailVer[i] = ver + 1
  w.f.ordHead[i] = -1
  w.f.ordTail[i] = -1
  w.free[w.meta[M_FREE]++] = i
}
