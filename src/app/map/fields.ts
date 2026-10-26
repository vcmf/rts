// The map editor's fields (docs/plans/active/m7-editor.md M7c, M7d): what the form shows of a feature (its generator
// and its parameters too) and of the map, and the edits it makes, as pure functions on the map's intent. A form sets
// values; the validator judges them at once (decision 0066): nothing here checks a range or a type beyond reading the
// text as the field's kind of value.
// Tested in test/map-fields.test.ts.
import type { AttrSpec, AttrValue, Catalogue, Feature, FieldSpec, MapFile } from '../../map/schema.ts'
import { RESERVED } from '../../map/schema.ts'
import { GENERATOR_SPECS, type ParamSpec } from '../../map/generators.ts'
import { allowedIn, categoryOf, kindChain, type Issue } from '../../map/catalogue.ts'
import { featureKind, presetsOf } from '../../map/validate.ts'
import { resolve } from '../../map/resolve.ts'

/**
 * One attribute in the form: its spec (none for one the kind's category does not take), its own value, and the one it
 * would have without it (its kind's, its preset's, the season's and the state's: `resolve`).
 */
export interface AttrRow {
  name: string
  spec: AttrSpec | undefined
  own: unknown
  inherited: AttrValue | undefined
  /** What it is in the map's season and the feature's state: another than its own when one of them overrides it. */
  effective: AttrValue | undefined
}

/**
 * The attributes of a feature's form: each the kind's category takes, in the catalogue's order, then any other the
 * feature sets (so it can be seen and removed). What each inherits is what `resolve` (the one place the order lives)
 * gives the feature without its own attributes; none where it cannot resolve (an unknown kind, preset or state).
 */
export function attrRows(cat: Catalogue, f: Feature, map: MapFile): AttrRow[] {
  const kind = featureKind(f, presetsOf(map))
  const chain = kind ? kindChain(cat, kind) : null
  // inherited: the kind's and the preset's, in the map's season, with none of the feature's own (its seasons and state
  // are its own too); effective: everything, its state with it. Each apart: a state the kind lacks loses only the
  // second (the validator says why)
  const own = new Set(['seasons', 'state'])
  const bare = Object.fromEntries(
    Object.entries(f).filter(([k]) => (RESERVED as readonly string[]).includes(k) && !own.has(k)),
  ) as Feature
  const tryResolve = (g: Feature) => {
    try {
      return resolve(g, map, cat).attrs
    } catch {
      return {} as Record<string, AttrValue>
    }
  }
  const inherited = tryResolve(bare)
  const effective = tryResolve(f)
  const rows: AttrRow[] = []
  if (chain) {
    const category = categoryOf(kind!)
    for (const [name, spec] of Object.entries(cat.attributes)) {
      if (allowedIn(cat, spec, category)) {
        rows.push({ name, spec, own: f[name], inherited: inherited[name], effective: effective[name] })
      }
    }
  }
  for (const [name, v] of Object.entries(f)) {
    if (!(RESERVED as readonly string[]).includes(name) && !rows.some(r => r.name === name)) {
      // set but not the kind's: no spec (its form says so), even when the catalogue knows it for other kinds
      rows.push({ name, spec: undefined, own: v, inherited: inherited[name], effective: effective[name] })
    }
  }
  return rows
}

/**
 * A value as the form shows it: text as it is (quoted in a field read as JSON, so it reads back as text), numbers
 * plainly, anything else as JSON; none as empty.
 */
export function showValue(v: unknown, as: InputKind = 'text'): string {
  if (v === undefined) return ''
  if (typeof v === 'string') return as === 'json' || as === 'any' ? JSON.stringify(v) : v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return JSON.stringify(v)
}

const DECIMAL = /^-?(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?$/
/**
 * How a field's text is read: words (`text`, trimmed), words as typed (`raw`: a note), a decimal number, JSON, or for a
 * field of no known kind JSON when it is and else words (`any`).
 */
export type InputKind = 'text' | 'raw' | 'number' | 'json' | 'any'
/** What a field's text means: a value to set, the field removed (empty: it inherits), or text that is no value. */
export type Parsed = { value: unknown } | { remove: true } | { error: string }

/**
 * A field's text as a value, by the kind of value the field holds: `text` for one of words (an enum, a string, a
 * note), `number` for a number (text that is no number stays text, for the validator to name), `json` for the rest
 * (objects, lists, ramps, seasons). A number field that may be a ramp takes JSON when its text is an object.
 */
export function parseInput(as: InputKind, text: string): Parsed {
  // several lines of words (a note) are kept as typed, its spaces and line breaks too
  if (as === 'raw') return text === '' ? { remove: true } : { value: text }
  const t = text.trim()
  if (t === '') return { remove: true }
  if (as === 'text') return { value: t }
  if (as === 'number' && !t.startsWith('{')) {
    // decimal and finite only: `0x20`, `Infinity` or `1e400` are no numbers of a map, and stay text for the validator
    return { value: DECIMAL.test(t) && Number.isFinite(Number(t)) ? Number(t) : t }
  }
  try {
    return { value: JSON.parse(t) as unknown }
  } catch {
    // a field of no known kind (an attribute the catalogue does not have): JSON when it is, else text
    if (as === 'any') return { value: t }
    return { error: `"${t.length > 40 ? t.slice(0, 40) + '…' : t}" is no JSON` }
  }
}
/** How an attribute's or a parameter's text is read: by its spec's type (none: JSON when it is, else text). */
export function attrInput(spec: FieldSpec | undefined): InputKind {
  if (!spec) return 'any'
  if (spec.type === 'number' || spec.type === 'int') return 'number'
  if (spec.type === 'enum' || spec.type === 'string') return 'text'
  return 'json'
}

/** An object with one field set, or removed (`undefined`), the others in their order; a new field goes last. */
export function setField<T extends object>(o: T, key: string, value: unknown): T {
  const out = { ...o } as Record<string, unknown>
  if (value === undefined) delete out[key]
  else out[key] = value
  return out as T
}

/** The validator's problems at a field's path (`features[3].height`, `seed`), and anything under it. */
export function problemsAt(issues: Issue[], path: string): Issue[] {
  return issues.filter(i => i.path === path || i.path.startsWith(path + '.') || i.path.startsWith(path + '['))
}

/** A feature's generator and its parameters, or null: none, or a `gen` not of the one form `{ name: { params } }`. */
export function genOf(f: Feature): { name: string; params: Record<string, unknown> } | null {
  const g = f.gen as unknown
  if (typeof g !== 'object' || g === null || Array.isArray(g)) return null
  const names = Object.keys(g)
  const params = names.length === 1 ? (g as Record<string, unknown>)[names[0]] : undefined
  if (typeof params !== 'object' || params === null || Array.isArray(params)) return null
  return { name: names[0], params: params as Record<string, unknown> }
}

/** A parameter of a feature's generator in the form: its spec (none for one the generator does not take), its value. */
export interface ParamRow {
  name: string
  spec: ParamSpec | undefined
  own: unknown
}
/**
 * The parameters of a feature's generator: each its spec takes, in the spec's order, then any other the feature sets
 * (so it can be seen and removed). None for no generator, or one the engine does not have.
 */
export function paramRows(f: Feature): ParamRow[] {
  const g = genOf(f)
  if (!g) return []
  const spec = Object.hasOwn(GENERATOR_SPECS, g.name) ? GENERATOR_SPECS[g.name] : undefined
  const rows: ParamRow[] = Object.entries(spec?.params ?? {}).map(([name, s]) => ({
    name,
    spec: s,
    own: g.params[name],
  }))
  for (const [name, v] of Object.entries(g.params)) {
    if (!rows.some(r => r.name === name)) rows.push({ name, spec: undefined, own: v })
  }
  return rows
}

/**
 * A feature's `gen` with another generator, its parameters empty (another generator's do not carry over: what one
 * means by `count` is not what another does), or none (`undefined`).
 */
export function withGenerator(name: string | undefined): Feature['gen'] {
  return name === undefined ? undefined : { [name]: {} }
}
/** A feature's `gen` with one parameter set, or removed (`undefined`); null when it has no generator to set it on. */
export function withParam(f: Feature, key: string, value: unknown): Feature['gen'] | null {
  const g = genOf(f)
  return g ? { [g.name]: setField(g.params, key, value) } : null
}
