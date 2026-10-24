// The map language (docs/proposals/map-engine.md §3): the map file, its features, and the kinds catalogue
// (maps/kinds.json) as TypeScript types. A map is plain JSON: these types describe what the validator
// (src/map/validate.ts) accepts, they do not check it.

export type Pt = [number, number] // [x, z], metres: x east, z north, origin at the map's centre
export const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const
export type Season = (typeof SEASONS)[number]

// the shapes (§3.1): exactly one per feature, or none for the kinds that take their place from a reference
export const SHAPES = ['point', 'line', 'area', 'circle', 'ellipse'] as const
export type ShapeName = (typeof SHAPES)[number]
export type Area = Pt[][] // an outer ring, then holes; rings close implicitly
export type Circle = [Pt, number] // centre, radius
// centre, radius along its axis, across it, the axis's angle (rad from +x toward +z)
export type Ellipse = [Pt, number, number, number]

// a ramp (§3.1): a number between stops, over a closed input: distance in from an area's edge, or along a line
export type Ramp = { edge?: [number, number][]; along?: [number, number][] }
export type AttrValue = number | string | boolean | Ramp | Record<string, number | string>
export type Attrs = Record<string, AttrValue>

export interface Along {
  id: string
  from: number
  to: number
} // metres along the referenced line
export interface Origin {
  generator: string
  params: Record<string, unknown>
  version: number
  parent?: string
} // parent: the feature a child was generated from

// a feature's own fields; every other key is an attribute from the catalogue
export const RESERVED = [
  'id',
  'kind',
  'preset',
  'note',
  'source',
  'priority',
  'state',
  'seasons',
  'gen',
  'origin',
  ...SHAPES,
  'on',
  'carries',
  'crosses',
  'near',
  'along',
  'follow',
  'clear',
] as const
export const REFS = ['on', 'carries', 'crosses', 'near', 'along'] as const
export type RefName = (typeof REFS)[number]

export interface Feature {
  id: string
  kind?: string // a dotted path in the catalogue; may come from the preset instead
  preset?: string // a map-level preset (§3.2)
  note?: string
  source?: string // one of the map's sources, or "invented"
  priority?: number // who wins an overlap; the kind's default otherwise
  state?: string // a scenario's overlay (§3.5)
  seasons?: Partial<Record<Season, Attrs>>
  gen?: Record<string, Record<string, unknown>> // one generator and its parameters (§3.4; generators arrive in M3)
  origin?: Origin // where a generated (or pinned) feature came from
  point?: Pt
  line?: Pt[]
  area?: Area
  circle?: Circle
  ellipse?: Ellipse
  on?: string
  carries?: string
  crosses?: string
  near?: Pt
  along?: Along
  [attr: string]: unknown
}

export interface MapFile {
  format: 1
  id: string
  name: string
  note?: string
  seed: number // a uint32
  season: Season // the default season
  datum?: number // the height of the map's zero above sea level, m (metadata)
  extent: { w: number; h: number } // everything the map describes, backdrop included, m
  play: { w: number; h: number } // the battle's area, centred, m
  sources?: { id: string; kind: string; ref?: string; note?: string }[]
  presets?: Record<string, { kind: string } & Attrs>
  features: Feature[]
}

// the kinds catalogue (maps/kinds.json)

// list: of strings; entries: of objects, checked by their generator (generator parameters)
export type AttrType = 'number' | 'int' | 'enum' | 'string' | 'object' | 'list' | 'entries'
export interface FieldSpec {
  type: AttrType
  unit?: string
  min?: number
  max?: number
  values?: string[]
  even?: boolean
}
export interface AttrSpec extends FieldSpec {
  layers: string[]
  season?: boolean // may be overridden per season
  ramp?: ('edge' | 'along')[] // may be a ramp over these inputs
  fields?: Record<string, FieldSpec> // for type 'object'
  less?: [string, string] // for type 'object': the first field must be less than the second
  note?: string
}
export interface KindSpec {
  shapes?: (ShapeName | 'none')[]
  // reference field → the category it points at, optionally ':<shape>' ("water:line"), or 'point' for `near`
  refs?: Partial<Record<RefName, string>>
  optional?: RefName[]
  priority?: number
  edit?: boolean // a relief edit (applied after every shape exists, §4)
  set: Attrs
  seasons?: Partial<Record<Season, Attrs>>
  states?: Record<string, Attrs>
  note?: string
}
export interface Catalogue {
  format: 1
  note?: string
  layers: Record<string, string>
  categories: Record<string, { layers: string[] }>
  attributes: Record<string, AttrSpec>
  kinds: Record<string, KindSpec>
}

// the specs: src/map/generators.ts
export const GENERATORS = ['meander', 'clump', 'street-village', 'scatter', 'group'] as const
export const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/
