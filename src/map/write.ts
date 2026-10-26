// The editor's stable save (docs/plans/active/m7-editor.md, decision 0066): a map written back into the text it was
// read from, rewriting only what changed. An unchanged feature or field keeps its bytes, whatever its layout; a changed
// one is written in place in the file's one layout (src/map/format.ts), a new feature appended, a deleted one cut with
// its separator. Tested in test/map-write.test.ts.
import type { Feature, MapFile } from './schema.ts'
import { formatMap, formatValue } from './format.ts'

/** A span of the text: [start, end). */
interface Span {
  start: number
  end: number
}
/** An object's member: its key, where its key starts, its value's span. */
interface Member {
  key: string
  at: number
  value: Span
}
/** A replacement of a span of the old text. */
interface Patch extends Span {
  text: string
}

const isWs = (c: string) => c === ' ' || c === '\n' || c === '\r' || c === '\t'
const skipWs = (s: string, i: number) => {
  while (i < s.length && isWs(s[i])) i++
  return i
}
/** Where the JSON value starting at i ends (the text is valid JSON: it parsed). */
function endOf(s: string, i: number): number {
  const c = s[i]
  if (c === '"') {
    let j = i + 1
    while (s[j] !== '"') j += s[j] === '\\' ? 2 : 1
    return j + 1
  }
  if (c === '{' || c === '[') {
    let depth = 0
    let j = i
    do {
      const d = s[j]
      if (d === '"') {
        j = endOf(s, j)
        continue
      }
      if (d === '{' || d === '[') depth++
      else if (d === '}' || d === ']') depth--
      j++
    } while (depth > 0)
    return j
  }
  let j = i
  while (j < s.length && !isWs(s[j]) && s[j] !== ',' && s[j] !== ']' && s[j] !== '}') j++
  return j
}
/** The members of the object opening at i. */
function membersOf(s: string, i: number): Member[] {
  const out: Member[] = []
  let j = skipWs(s, i + 1)
  while (s[j] === '"') {
    const keyEnd = endOf(s, j)
    const start = skipWs(s, skipWs(s, keyEnd) + 1) // past the colon
    const end = endOf(s, start)
    out.push({ key: JSON.parse(s.slice(j, keyEnd)) as string, at: j, value: { start, end } })
    j = skipWs(s, end)
    if (s[j] === ',') j = skipWs(s, j + 1)
  }
  return out
}
/** The elements of the array opening at i. */
function elementsOf(s: string, i: number): Span[] {
  const out: Span[] = []
  let j = skipWs(s, i + 1)
  while (s[j] !== ']') {
    const end = endOf(s, j)
    out.push({ start: j, end })
    j = skipWs(s, end)
    if (s[j] === ',') j = skipWs(s, j + 1)
  }
  return out
}

/** JSON values equal, objects' keys in any order. */
export function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a)) {
    const bb = b as unknown[]
    return a.length === bb.length && a.every((x, k) => sameJson(x, bb[k]))
  }
  const ka = Object.keys(a).filter(k => (a as Record<string, unknown>)[k] !== undefined)
  const kb = Object.keys(b).filter(k => (b as Record<string, unknown>)[k] !== undefined)
  return (
    ka.length === kb.length &&
    ka.every(k => sameJson((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
  )
}

/** Applies patches that do not overlap to the text; new line breaks take the text's own (CRLF in a CRLF file). */
function patched(s: string, patches: Patch[]): string {
  const crlf = s.includes('\r\n')
  let out = s
  for (const p of [...patches].sort((a, b) => b.start - a.start)) {
    const text = crlf ? p.text.replace(/\r?\n/g, '\r\n') : p.text
    out = out.slice(0, p.start) + text + out.slice(p.end)
  }
  return out
}

/** The whitespace from the start of the line to i, if only whitespace precedes i on its line. */
function indentAt(s: string, i: number): string | null {
  let j = i
  while (j > 0 && (s[j - 1] === ' ' || s[j - 1] === '\t')) j--
  return j === 0 || s[j - 1] === '\n' ? s.slice(j, i) : null
}

/**
 * The features array rewritten: the patches to its elements when the kept features stay in their order and the new
 * ones come last (the editor's edits), else the array's text rebuilt with each unchanged feature's old text.
 */
function featurePatches(s: string, open: Span, features: Feature[], write: (f: Feature) => string): Patch[] {
  const els = elementsOf(s, open.start)
  if (!els.length || !features.length) {
    return [{ ...open, text: features.length ? formatValue('features', features) : '[]' }]
  }
  const old = els.map(e => JSON.parse(s.slice(e.start, e.end)) as Feature | null)
  // an element that is no feature (a hand edit in progress): nothing to match, the list written afresh
  if (!old.every(f => typeof f === 'object' && f !== null && typeof f.id === 'string')) {
    return [{ ...open, text: formatValue('features', features) }]
  }
  const ids = old.map(f => f!.id)
  const byId = new Map(features.map(f => [f.id, f]))
  const oldIndex = new Map(ids.map((id, k) => [id, k]))
  const unique = new Set(ids).size === ids.length && byId.size === features.length
  const kept = features.filter(f => oldIndex.has(f.id))
  const inOrder =
    unique &&
    kept.length > 0 &&
    kept.every((f, k) => k === 0 || oldIndex.get(f.id)! > oldIndex.get(kept[k - 1].id)!) &&
    features.slice(kept.length).every(f => !oldIndex.has(f.id))
  // what goes between two features: the old text's, else a new line at the first one's indent
  const ind = indentAt(s, els[0].start)
  const sep = els.length > 1 ? s.slice(els[0].end, els[1].start) : ind !== null ? `,\n${ind}` : ', '
  if (!inOrder) {
    const text = features
      .map(f => {
        const k = oldIndex.get(f.id)
        return k !== undefined && unique && sameJson(old[k], f) ? s.slice(els[k].start, els[k].end) : write(f)
      })
      .join(sep)
    return [{ start: els[0].start, end: els[els.length - 1].end, text }]
  }
  const patches: Patch[] = []
  const lastKept = oldIndex.get(kept[kept.length - 1].id)!
  for (let k = 0; k < lastKept; k++) {
    const f = byId.get(ids[k])
    if (!f) {
      patches.push({ start: els[k].start, end: els[k + 1].start, text: '' })
    } // cut with the separator after it
    else if (!sameJson(old[k], f)) patches.push({ ...els[k], text: write(f) })
  }
  const last = features.find(f => f.id === ids[lastKept])!
  if (!sameJson(old[lastKept], last)) patches.push({ ...els[lastKept], text: write(last) })
  // the features after the last kept one were all deleted: cut them with the separators before them, and append
  const added = features.slice(kept.length).map(f => sep + write(f))
  patches.push({ start: els[lastKept].end, end: els[els.length - 1].end, text: added.join('') })
  return patches
}

/** How a changed feature is written into the file. */
export type FeatureWriter = (f: Feature) => string
/** A changed feature on one line. */
const oneLine: FeatureWriter = f => JSON.stringify(f)

/**
 * A writer that keeps an earlier text's bytes for a feature equal to one of that text's (an edit undone after a save
 * comes back as the file first had it), else writes it on one line. The editor makes one when it reads the file.
 */
export function writerFrom(earlier: string | null): FeatureWriter {
  const known = new Map<string, { value: Feature; text: string }>()
  try {
    if (earlier !== null) JSON.parse(earlier) // the scan below reads valid JSON only
    const e = earlier === null ? null : skipWs(earlier, 0)
    const features =
      e === null || earlier![e] !== '{' ? undefined : membersOf(earlier!, e).find(m => m.key === 'features')
    if (features && earlier![features.value.start] === '[') {
      for (const el of elementsOf(earlier!, features.value.start)) {
        const text = earlier!.slice(el.start, el.end)
        const value = JSON.parse(text) as Feature
        if (typeof value?.id === 'string') known.set(value.id, { value, text })
      }
    }
  } catch {
    known.clear() // not a map's text: nothing to reuse
  }
  return f => {
    const k = known.get(f.id)
    return k && sameJson(k.value, f) ? k.text : oneLine(f)
  }
}

/**
 * The map's file, written into the text it was read from (`base`): only what changed is rewritten (decision 0066).
 * With no base, or one that is not a JSON object with a list of features, the map in the file's one layout
 * (`formatMap`). A changed feature is written by `write` (on one line; `writerFrom` keeps an earlier text's bytes).
 */
export function writeMap(base: string | null, map: MapFile, write: FeatureWriter = oneLine): string {
  let parsed: unknown
  try {
    parsed = base === null ? null : JSON.parse(base)
  } catch {
    parsed = null
  }
  const start = base === null ? 0 : skipWs(base, 0)
  if (
    base === null ||
    typeof parsed !== 'object' ||
    parsed === null ||
    Array.isArray(parsed) ||
    base[start] !== '{' ||
    !Array.isArray((parsed as { features?: unknown }).features)
  ) {
    return formatMap(map)
  }
  const s = base
  const members = membersOf(s, start)
  const old = parsed as Record<string, unknown>
  const now = map as unknown as Record<string, unknown>
  const features = members.find(m => m.key === 'features')
  if (!features || members.length !== new Set(members.map(m => m.key)).size) return formatMap(map)
  const patches: Patch[] = []
  const gone = (m: Member) => m.key !== 'features' && now[m.key] === undefined
  let lastKept = members.length - 1
  while (gone(members[lastKept])) lastKept--
  // fields cut after the last kept one go with the separators before them
  if (lastKept < members.length - 1) {
    const end = members[members.length - 1].value.end
    patches.push({ start: members[lastKept].value.end, end, text: '' })
  }
  members.forEach((m, k) => {
    if (m.key === 'features') {
      patches.push(...featurePatches(s, m.value, map.features, write))
    } else if (gone(m)) {
      if (k < lastKept) patches.push({ start: m.at, end: members[k + 1].at, text: '' }) // with the separator after it
    } else if (!sameJson(old[m.key], now[m.key])) {
      patches.push({ ...m.value, text: formatValue(m.key, now[m.key]) })
    }
  })
  // fields new to the file go before the features, at their indent
  const lead = indentAt(s, features.at)
  const added = Object.keys(now)
    .filter(key => now[key] !== undefined && !(key in old))
    .map(key => `${JSON.stringify(key)}: ${formatValue(key, now[key])},${lead !== null ? `\n${lead}` : ' '}`)
  if (added.length) patches.push({ start: features.at, end: features.at, text: added.join('') })
  return patched(s, patches)
}
