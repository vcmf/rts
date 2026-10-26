// The map editor's fields (docs/plans/active/m7-editor.md M7c): what the form shows of a feature and of the map, and
// the edits it makes, as pure functions on the map's intent. A form sets values; the validator judges them at once
// (decision 0066): nothing here checks a range or a type beyond reading the text as the field's kind of value.
// Tested in test/map-fields.test.ts.
import type { AttrSpec, AttrValue, Catalogue, Feature, MapFile } from '../../map/schema.ts'
import { RESERVED } from '../../map/schema.ts'
import { allowedIn, categoryOf, kindChain, type Issue } from '../../map/catalogue.ts'
import { featureKind } from '../../map/validate.ts'
import { GENERATOR_SPECS, childOf } from '../../map/generators.ts'
import { resolve } from '../../map/resolve.ts'
import { sameJson } from '../../map/write.ts'

/**
 * One attribute in the form: its spec (none for one the kind's category does not take), its own value, and the one it
 * would have without it (its kind's, its preset's, the season's and the state's: `resolve`).
 */
export interface AttrRow {
  name: string
  spec: AttrSpec | undefined
  own: unknown
  inherited: AttrValue | undefined
}

const presetsOf = (map: MapFile) => (map.presets ?? {}) as Record<string, Record<string, unknown>>

/**
 * The attributes of a feature's form: each the kind's category takes, in the catalogue's order, then any other the
 * feature sets (so it can be seen and removed). What each inherits is what `resolve` (the one place the order lives)
 * gives the feature without its own attributes; none where it cannot resolve (an unknown kind, preset or state).
 */
export function attrRows(cat: Catalogue, f: Feature, map: MapFile): AttrRow[] {
  const kind = featureKind(f, presetsOf(map))
  const chain = kind ? kindChain(cat, kind) : null
  let inherited: Record<string, AttrValue> = {}
  try {
    const bare = Object.fromEntries(Object.entries(f).filter(([k]) => (RESERVED as readonly string[]).includes(k)))
    inherited = resolve(bare as Feature, map, cat).attrs
  } catch {
    // not resolvable as it is: no hints (the validator says why)
  }
  const rows: AttrRow[] = []
  if (chain) {
    const category = categoryOf(kind!)
    for (const [name, spec] of Object.entries(cat.attributes)) {
      if (allowedIn(cat, spec, category)) rows.push({ name, spec, own: f[name], inherited: inherited[name] })
    }
  }
  for (const [name, v] of Object.entries(f)) {
    if (!(RESERVED as readonly string[]).includes(name) && !rows.some(r => r.name === name)) {
      rows.push({ name, spec: cat.attributes[name], own: v, inherited: inherited[name] })
    }
  }
  return rows
}

/** A value as the form shows it: text as it is, numbers plainly, anything else as JSON; none as empty. */
export function showValue(v: unknown): string {
  if (v === undefined) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return JSON.stringify(v)
}

/** What a field's text means: a value to set, the field removed (empty: it inherits), or text that is no value. */
export type Parsed = { value: unknown } | { remove: true } | { error: string }

/**
 * A field's text as a value, by the kind of value the field holds: `text` for one of words (an enum, a string, a
 * note), `number` for a number (text that is no number stays text, for the validator to name), `json` for the rest
 * (objects, lists, ramps, seasons). A number field that may be a ramp takes JSON when its text is an object.
 */
export function parseInput(as: 'text' | 'number' | 'json', text: string): Parsed {
  const t = text.trim()
  if (t === '') return { remove: true }
  if (as === 'text') return { value: t }
  if (as === 'number' && !t.startsWith('{')) {
    const n = Number(t)
    return { value: Number.isFinite(n) ? n : t }
  }
  try {
    return { value: JSON.parse(t) as unknown }
  } catch {
    return { error: `"${t.length > 40 ? t.slice(0, 40) + '…' : t}" is no JSON` }
  }
}
/** How an attribute's text is read: by its spec's type (one it does not know: as JSON). */
export function attrInput(spec: AttrSpec | undefined): 'text' | 'number' | 'json' {
  if (spec?.type === 'number' || spec?.type === 'int') return 'number'
  if (spec?.type === 'enum' || spec?.type === 'string') return 'text'
  return 'json'
}

/** An object with one field set, or removed (`undefined`), the others in their order; a new field goes last. */
export function setField<T extends object>(o: T, key: string, value: unknown): T {
  const out = { ...o } as Record<string, unknown>
  if (value === undefined) delete out[key]
  else out[key] = value
  return out as T
}

/**
 * The map with a feature's id changed from `from` to `to`, and every place that names it: the references (`on`,
 * `carries`, `crosses`, `along.id`), shared edges and kept-off lines (`follow`, `clear`), a generator's selectors, and
 * a pinned child's `origin.parent`. When it has children (it generates them, or some are pinned), their ids follow
 * (`<from>-<n>` becomes `<to>-<n>`: a pinned child's own, and wherever one is named). Features that name nothing of it
 * are kept as they are (the same objects).
 */
export function renameFeature(map: MapFile, from: string, to: string): MapFile {
  // its children: generated ones (an author's feature cannot take `<from>-<n>` while it generates: the validator
  // reserves the form), and pinned ones by their recorded parent; another feature named like a child is not one
  const generates = map.features.some(
    f =>
      f.id === from &&
      Object.keys(f.gen ?? {}).some(g => Object.hasOwn(GENERATOR_SPECS, g) && !!GENERATOR_SPECS[g].childKinds),
  )
  const pinned = new Set(
    map.features.filter(f => f.origin?.parent === from && childOf(f.id)?.parent === from).map(f => f.id),
  )
  const swap = (v: unknown) => {
    if (v === from) return to
    const c = typeof v === 'string' ? childOf(v) : null
    return c?.parent === from && (generates || pinned.has(v as string)) ? `${to}-${c.n}` : v
  }
  const ids = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(e => ids(e))
    if (typeof v === 'object' && v !== null && swap((v as { id?: unknown }).id) !== (v as { id?: unknown }).id) {
      return { ...v, id: swap((v as { id: unknown }).id) }
    }
    return v
  }
  // a generator's selectors, in its parameters or in a pinned child's record of them
  const selectors = (name: string, params: unknown): unknown => {
    const selects = Object.hasOwn(GENERATOR_SPECS, name) ? (GENERATOR_SPECS[name].selects ?? []) : []
    if (typeof params !== 'object' || params === null) return params
    const p = { ...params } as Record<string, unknown>
    for (const k of selects) if (Array.isArray(p[k])) p[k] = (p[k] as unknown[]).map(swap)
    return p
  }
  const features = map.features.map(f => {
    const g: Feature = { ...f }
    if (g.id === from || pinned.has(g.id)) g.id = swap(g.id) as string
    for (const r of ['on', 'carries', 'crosses'] as const) if (g[r] !== undefined) g[r] = swap(g[r]) as string
    if (g.along !== undefined) g.along = ids(g.along) as Feature['along']
    if (g.follow !== undefined) g.follow = ids(g.follow)
    if (g.clear !== undefined) g.clear = ids(g.clear)
    if (g.gen && typeof g.gen === 'object') {
      g.gen = Object.fromEntries(
        Object.entries(g.gen).map(([name, params]) => [name, selectors(name, params)]),
      ) as Feature['gen']
    }
    if (g.origin && typeof g.origin === 'object') {
      const params = selectors(g.origin.generator, g.origin.params) as Record<string, unknown>
      g.origin = { ...g.origin, params, ...(g.origin.parent === from ? { parent: to } : {}) }
    }
    return sameJson(g, f) ? f : g
  })
  return { ...map, features }
}

/** The ids a renamed map holds more than once that the map before did not (a rename's children onto taken ids). */
export function newClashes(before: MapFile, after: MapFile): string[] {
  const twice = (m: MapFile) => {
    const seen = new Set<string>()
    const out = new Set<string>()
    for (const f of m.features) (seen.has(f.id) ? out : seen).add(f.id)
    return out
  }
  const was = twice(before)
  return [...twice(after)].filter(id => !was.has(id))
}

/** The validator's problems at a field's path (`features[3].height`, `seed`), and anything under it. */
export function problemsAt(issues: Issue[], path: string): Issue[] {
  return issues.filter(i => i.path === path || i.path.startsWith(path + '.') || i.path.startsWith(path + '['))
}
