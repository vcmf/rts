// The kinds catalogue (maps/kinds.json, docs/proposals/map-engine.md §3.2): a kind's chain of presets along its
// dotted path, the metadata it inherits, and the check of the catalogue itself.
import type { AttrSpec, AttrValue, Catalogue, FieldSpec, KindSpec, RefName, ShapeName, Season } from './schema.ts'
import { REFS, SEASONS, SHAPES } from './schema.ts'

// the catalogue's attribute types (list and entries are for generator parameters)
const TYPES = ['number', 'int', 'enum', 'string', 'object']

export interface Issue {
  id: string | null
  path: string
  message: string
}

// 'veg.wood.broad' → ['veg.wood', 'veg.wood.broad']: every prefix from the category's first kind on. Null when
// the kind or one of its prefixes is not in the catalogue.
export function kindChain(cat: Catalogue, kind: string): string[] | null {
  const parts = kind.split('.')
  if (parts.length < 2 || !(parts[0] in cat.categories)) return null
  const chain: string[] = []
  for (let k = 2; k <= parts.length; k++) {
    const name = parts.slice(0, k).join('.')
    if (!Object.hasOwn(cat.kinds, name)) return null
    chain.push(name)
  }
  return chain
}

export const categoryOf = (kind: string): string => kind.split('.')[0]
// is a selector a category or a kind of the catalogue (rather than a feature's id)?
export const isKindName = (cat: Catalogue, sel: string): boolean =>
  Object.hasOwn(cat.categories, sel) || kindChain(cat, sel) !== null

// what a kind inherits: each of these comes from the deepest preset along the chain that sets it
export interface KindMeta {
  shapes: (ShapeName | 'none')[]
  refs: Partial<Record<RefName, string>>
  optional: RefName[]
  priority: number
  edit: boolean
}
export function kindMeta(cat: Catalogue, chain: string[]): KindMeta {
  const m: KindMeta = { shapes: [], refs: {}, optional: [], priority: 0, edit: false }
  for (const name of chain) {
    const k = cat.kinds[name]
    if (k.shapes) m.shapes = k.shapes
    if (k.refs) m.refs = k.refs
    if (k.optional) m.optional = k.optional
    if (k.priority !== undefined) m.priority = k.priority
    if (k.edit !== undefined) m.edit = k.edit
  }
  return m
}

// may this attribute be set on a kind of this category?
export const allowedIn = (cat: Catalogue, spec: AttrSpec, category: string): boolean =>
  spec.layers.some(l => cat.categories[category].layers.includes(l))

// one value against its spec; ramps are allowed only where the spec says. Returns the problem, or null.
export function checkValue(spec: AttrSpec | FieldSpec, v: unknown, rampOk = false): string | null {
  if ('ramp' in spec && spec.ramp && rampOk && typeof v === 'object' && v !== null && !Array.isArray(v)) {
    return checkRamp(spec, v as Record<string, unknown>)
  }
  switch (spec.type) {
    case 'number':
    case 'int': {
      if (typeof v !== 'number' || !Number.isFinite(v)) return `must be a number${spec.unit ? ` (${spec.unit})` : ''}`
      if (spec.type === 'int' && !Number.isInteger(v)) return 'must be a whole number'
      if (spec.min !== undefined && v < spec.min) {
        return `must be at least ${spec.min}${spec.unit ? ' ' + spec.unit : ''}`
      }
      if (spec.max !== undefined && v > spec.max) {
        return `must be at most ${spec.max}${spec.unit ? ' ' + spec.unit : ''}`
      }
      if (spec.even && v % 2 !== 0) return 'must be even'
      return null
    }
    case 'enum':
      return typeof v === 'string' && spec.values!.includes(v) ? null : `must be one of ${spec.values!.join(', ')}`
    case 'string':
      return typeof v === 'string' ? null : 'must be a string'
    case 'list':
      return Array.isArray(v) && v.length > 0 && v.every(x => typeof x === 'string') ? null : 'must be a list of names'
    case 'entries':
      return Array.isArray(v) && v.length > 0 && v.every(x => typeof x === 'object' && x !== null && !Array.isArray(x))
        ? null
        : 'must be a list of objects'
    case 'object': {
      if (typeof v !== 'object' || v === null || Array.isArray(v)) return 'must be an object'
      const fields = (spec as AttrSpec).fields ?? {}
      for (const [k, fv] of Object.entries(v)) {
        if (!Object.hasOwn(fields, k)) return `has an unknown field "${k}" (known: ${Object.keys(fields).join(', ')})`
        const e = checkValue(fields[k], fv)
        if (e) return `${k} ${e}`
      }
      for (const k of Object.keys(fields)) if (!(k in v)) return `needs its field "${k}"`
      const less = (spec as AttrSpec).less
      const o = v as Record<string, number>
      if (less && !(o[less[0]] < o[less[1]])) return `${less[0]} must be less than ${less[1]}`
      return null
    }
  }
}

function checkRamp(spec: AttrSpec, v: Record<string, unknown>): string | null {
  const keys = Object.keys(v)
  if (keys.length !== 1 || !spec.ramp!.includes(keys[0] as 'edge')) {
    return `a ramp has one input, one of ${spec.ramp!.join(', ')}`
  }
  const stops = v[keys[0]]
  if (!Array.isArray(stops) || stops.length < 2) return 'a ramp needs at least 2 stops'
  let last = -Infinity
  for (const s of stops) {
    if (!Array.isArray(s) || s.length !== 2 || typeof s[0] !== 'number' || !Number.isFinite(s[0])) {
      return 'each stop is [input, value]'
    }
    if (s[0] < 0) return "a stop's input is a distance, at least 0"
    if (s[0] <= last) return 'stops must increase along their input'
    last = s[0]
    const e = checkValue({ ...spec, ramp: undefined }, s[1])
    if (e) return `a stop's value ${e}`
  }
  return null
}

// the catalogue's own check: run by the tests and before any map is validated
export function checkCatalogue(cat: Catalogue): Issue[] {
  const out: Issue[] = []
  const bad = (path: string, message: string) => out.push({ id: null, path, message })
  if (cat.format !== 1) bad('format', 'must be 1')
  for (const [c, def] of Object.entries(cat.categories)) {
    for (const l of def.layers) {
      if (!Object.hasOwn(cat.layers, l)) bad(`categories.${c}`, `names an unknown layer "${l}"`)
    }
  }
  for (const [a, s] of Object.entries(cat.attributes)) {
    for (const l of s.layers) if (!Object.hasOwn(cat.layers, l)) bad(`attributes.${a}`, `names an unknown layer "${l}"`)
    if (!TYPES.includes(s.type)) bad(`attributes.${a}`, `unknown type "${s.type}" (${TYPES.join(', ')})`)
    for (const [fname, fs] of Object.entries(s.fields ?? {})) {
      if (!TYPES.includes(fs.type) || fs.type === 'object') {
        bad(`attributes.${a}.fields.${fname}`, `unknown or nested type "${fs.type}"`)
      }
    }
    if (s.type === 'enum' && !s.values?.length) bad(`attributes.${a}`, 'an enum needs values')
    if (s.type === 'object' && !s.fields) bad(`attributes.${a}`, 'an object needs fields')
  }
  for (const [name, k] of Object.entries(cat.kinds)) {
    const p = `kinds.${name}`
    const chain = kindChain(cat, name)
    if (!chain) {
      bad(p, 'its category or a shorter prefix of its path is not in the catalogue')
      continue
    }
    if (chain.length === 1 && !k.shapes) bad(p, 'the first kind of a path must give its shapes')
    for (const s of k.shapes ?? []) {
      if (s !== 'none' && !(SHAPES as readonly string[]).includes(s)) bad(p, `unknown shape "${s}"`)
    }
    for (const [r, target] of Object.entries(k.refs ?? {})) {
      const [tc, ts] = String(target).split(':')
      if (!(REFS as readonly string[]).includes(r)) bad(`${p}.refs.${r}`, 'unknown reference field')
      else if (
        r === 'near'
          ? target !== 'point'
          : !Object.hasOwn(cat.categories, tc) || (ts !== undefined && !(SHAPES as readonly string[]).includes(ts))
      ) {
        bad(`${p}.refs.${r}`, `"${target}" must be a category, optionally ":<shape>" (or "point" for near)`)
      }
    }
    for (const r of k.optional ?? []) {
      if (!Object.hasOwn(k.refs ?? {}, r)) bad(`${p}.optional`, `"${r}" is not one of its references`)
    }
    checkSet(cat, categoryOf(name), k.set, `${p}.set`, bad)
    for (const [season, attrs] of Object.entries(k.seasons ?? {})) {
      if (!(SEASONS as readonly string[]).includes(season)) bad(`${p}.seasons`, `unknown season "${season}"`)
      checkSet(cat, categoryOf(name), attrs, `${p}.seasons.${season}`, bad, true)
    }
    for (const [st, attrs] of Object.entries(k.states ?? {})) {
      checkSet(cat, categoryOf(name), attrs, `${p}.states.${st}`, bad)
    }
  }
  return out
}

function checkSet(
  cat: Catalogue,
  category: string,
  attrs: Record<string, AttrValue>,
  path: string,
  bad: (p: string, m: string) => void,
  seasonal = false,
): void {
  for (const [a, v] of Object.entries(attrs)) {
    const spec = Object.hasOwn(cat.attributes, a) ? cat.attributes[a] : undefined
    if (!spec) {
      bad(`${path}.${a}`, 'unknown attribute')
      continue
    }
    if (!allowedIn(cat, spec, category)) bad(`${path}.${a}`, `is not an attribute of category ${category}`)
    if (seasonal && !spec.season) bad(`${path}.${a}`, 'cannot change with the season')
    const e = checkValue(spec, v, true)
    if (e) bad(`${path}.${a}`, e)
  }
}

// the states a kind may take (§3.5): merged along its chain, the deeper preset's overlay winning per attribute
export function kindStates(cat: Catalogue, chain: string[]): Record<string, Record<string, AttrValue>> {
  const out: Record<string, Record<string, AttrValue>> = {}
  for (const name of chain) {
    for (const [st, attrs] of Object.entries(cat.kinds[name].states ?? {})) out[st] = { ...out[st], ...attrs }
  }
  return out
}

export const kindSeason = (cat: Catalogue, chain: string[], season: Season): Record<string, AttrValue> =>
  Object.assign({}, ...chain.map(n => (cat.kinds[n] as KindSpec).seasons?.[season] ?? {}))
