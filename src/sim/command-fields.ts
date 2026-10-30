// What a command is (docs/systems/sim-spine.md, Commands; #155): one table, per type, of its fields in save order
// and what each must be. `normaliseCommand` checks a command against it once, `quantiseCommand` quantises by it and
// the save writes and reads by it (serialize.ts), so the three cannot disagree on a type or a field.
import { quantise } from './num.ts'
import type { Command } from './commands.ts'

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
export type CommandType = (typeof COMMAND_TYPES)[number]
export const FIRE_MODES = ['at will', 'hold'] // index = FIRE_AT_WILL, FIRE_HOLD
// why `issue` refuses a command: a `refused` command carries one of these and nothing else
export const REFUSALS = [
  'unknown command',
  'malformed command',
  'malformed waypoints',
  'no waypoints',
  'too many waypoints',
] as const
export type Refusal = (typeof REFUSALS)[number]
export const MAX_POINTS = 64

// id: a handle; int: a count, a side or a level (int32); cm: a position, a length or a bar's points, to 0.01; ang: an
// angle or a direction, to 0.1 mrad; str: a string; bool: a flag; pts: 1..MAX_POINTS [x, z] pairs, to 1 cm; reason: one
// of REFUSALS
export type FieldKind = 'id' | 'int' | 'cm' | 'ang' | 'str' | 'bool' | 'pts' | 'reason'
export interface Field {
  name: string
  kind: FieldKind
  def?: string | number | boolean // a field with a default may be left out
}
const F = (name: string, kind: FieldKind, def?: string | number | boolean): Field => ({ name, kind, def })
export const COMMAND_FIELDS: Record<CommandType | 'refused', readonly Field[]> = {
  move: [F('id', 'id'), F('append', 'bool', false), F('points', 'pts')],
  form: [F('id', 'id'), F('shape', 'str')],
  wheel: [F('id', 'id'), F('angle', 'ang')],
  face: [F('id', 'id')],
  retire: [F('id', 'id'), F('metres', 'cm')],
  halt: [F('id', 'id')],
  style: [F('id', 'id'), F('preset', 'str')],
  'debug-spawn': [
    F('side', 'int'),
    F('x', 'cm'),
    F('z', 'cm'),
    F('heading', 'ang'),
    F('shape', 'str', ''), // '': the type's start
    F('men', 'int'),
    F('level', 'int', 0), // 0: the ruleset's
    F('bar', 'cm', 0), // 0: its level's
    F('fire', 'str', FIRE_MODES[0]),
    F('unit', 'str', ''), // '': the ruleset's first type
  ],
  'debug-kill': [F('id', 'id'), F('men', 'int')],
  'debug-morale': [F('id', 'id'), F('bar', 'cm')],
  fire: [F('id', 'id'), F('mode', 'str'), F('target', 'id', 0)],
  side: [F('side', 'int'), F('x', 'ang'), F('z', 'ang')],
  charge: [F('id', 'id'), F('target', 'id')],
  // what `issue` stamps in place of a command it cannot take
  refused: [F('reason', 'reason')],
}

// a type the sim knows (`COMMAND_TYPES`; not `refused`, which only `issue` makes)
export const isCommandType = (t: unknown): t is CommandType => (COMMAND_TYPES as readonly unknown[]).includes(t)
// the sim's one test of a number fit to hold: finite and within a bound that quantising keeps exact (1e9 × 1e4 is
// far inside 2^53, so quantising a quantised value gives it back)
export const BOUND = 1e9
export const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && v === v && v <= BOUND && v >= -BOUND
const isInt32 = (v: unknown): v is number =>
  Number.isInteger(v) && (v as number) >= -2147483648 && (v as number) <= 2147483647

const refused = (reason: Refusal): Command => ({ type: 'refused', reason })
// a command checked once against its type's fields, then quantised: canonical, or `refused` with why. Total (each
// field of what it is given is read once, and a getter or a Proxy that throws makes it a malformed command) and
// idempotent: a canonical command comes back equal
export function normaliseCommand(cmd: unknown): Command {
  try {
    if (typeof cmd !== 'object' || cmd === null) return refused('unknown command')
    const c = cmd as Record<string, unknown>
    const type = c.type
    if (type !== 'refused' && !isCommandType(type)) return refused('unknown command')
    const out: Record<string, unknown> = { type }
    for (const f of COMMAND_FIELDS[type]) {
      const v = c[f.name]
      if (v === undefined && f.def !== undefined) continue
      const why = check(f.kind, v)
      if (typeof why === 'string') return refused(why)
      out[f.name] = why.v
    }
    return quantiseCommand(out as unknown as Command)
  } catch {
    return refused('malformed command') // a field whose read threw (a getter, a Proxy)
  }
}
// a value checked against its kind: the value to keep (a fresh copy of waypoints, a well-formed string), or why not
function check(kind: FieldKind, v: unknown): { v: unknown } | Refusal {
  switch (kind) {
    case 'id':
    case 'int':
      return isInt32(v) ? { v } : 'malformed command'
    case 'cm':
    case 'ang':
      return isFiniteNumber(v) ? { v } : 'malformed command'
    case 'str':
      return typeof v === 'string' ? { v: wellFormedString(v) } : 'malformed command'
    case 'bool':
      return typeof v === 'boolean' ? { v } : 'malformed command'
    case 'reason': // a replay's refused command comes back as it was; any other reason is not one
      return typeof v === 'string' && (REFUSALS as readonly string[]).includes(v) ? { v } : 'unknown command'
    case 'pts': {
      const p = waypoints(v)
      return typeof p === 'string' ? p : { v: p }
    }
  }
}
// waypoints as given, checked with a plain index loop (a hole in a sparse array is no pair): a fresh array of
// [x, z] number pairs, or why not
function waypoints(v: unknown): [number, number][] | Refusal {
  if (!Array.isArray(v)) return 'malformed waypoints'
  const n: unknown = v.length
  if (!Number.isInteger(n) || (n as number) < 0) return 'malformed waypoints' // a Proxy's length can be anything
  if (n === 0) return 'no waypoints'
  if ((n as number) > MAX_POINTS) return 'too many waypoints'
  const out: [number, number][] = []
  for (let i = 0; i < (n as number); i++) {
    const p: unknown = v[i]
    if (!Array.isArray(p) || p.length !== 2) return 'malformed waypoints'
    const x: unknown = p[0]
    const z: unknown = p[1]
    if (!isFiniteNumber(x) || !isFiniteNumber(z)) return 'malformed waypoints'
    out.push([x, z])
  }
  return out
}
// a string with each lone surrogate replaced by U+FFFD (String.prototype.toWellFormed, past this target), so the
// queued string is the one a save's UTF-8 holds
function wellFormedString(s: string): string {
  if (!/[\ud800-\udfff]/.test(s)) return s
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
    out += c >= 0xd800 && c <= 0xdfff ? '�' : s[i]
  }
  return out
}

const qa = (a: number): number => Math.round(a * 10000) / 10000 + 0 // + 0: a value rounding to zero is +0 (#157)
// quantises a command already checked (normaliseCommand) by its type's fields, giving the defaults of those left
// out; quantising a quantised command changes nothing
export function quantiseCommand(c: Command): Command {
  const fields = COMMAND_FIELDS[c.type as CommandType | 'refused'] as readonly Field[] | undefined
  if (!fields) return c
  const src = c as unknown as Record<string, unknown>
  const out: Record<string, unknown> = { type: c.type }
  for (const f of fields) out[f.name] = quantiseField(f.kind, src[f.name] ?? f.def)
  return out as unknown as Command
}
function quantiseField(kind: FieldKind, v: unknown): unknown {
  switch (kind) {
    case 'id':
    case 'int':
      return (v as number) | 0
    case 'cm':
      return quantise(v as number)
    case 'ang':
      return qa(v as number)
    case 'bool':
      return !!v
    case 'pts':
      return (v as [number, number][]).map(([x, z]) => [quantise(x), quantise(z)])
    default:
      return v
  }
}
