// The map page's form (docs/plans/active/m7-editor.md M7c, M7d): the selected feature's fields (its generator and its
// parameters too), or with no selection the map's own, built from the catalogue and set through the editor
// (./editor.ts) one edit at a time.
// - A field shows the editor's copy, unless it holds text typed and not applied yet (`pending`). That text is applied
//   when the field changes (Enter, the focus leaving it) and before any command of the editor (`flush`: a press on the
//   map, a key, a button), so it is never lost to a drag nor applied to a copy that moved on. Refused (no value, or the
//   editor said no), it stays with its reason under it until it is changed or Escape drops it.
// - The page's problems (the validator's at once after an edit, then the compile's of that copy: a generator that
//   cannot place what it was asked) show under the most specific field their path falls in, those of no field above
//   the feature's JSON, which is to read and copy only (its shape and references are edited on the map).
// - A generated feature can be pinned (its expansion copied into the file: ./pin.ts).
// - The form is built again only when its fields change (another kind); otherwise its inputs are given their values
//   in place, so the field the focus moved to stays.
import type { Catalogue, Feature, MapFile } from '../../map/schema.ts'
import { GENERATORS, SEASONS } from '../../map/schema.ts'
import { GENERATOR_SPECS } from '../../map/generators.ts'
import { kindChain, kindStates, type Issue } from '../../map/catalogue.ts'
import { featureKind, presetsOf } from '../../map/validate.ts'
import type { Editor } from './editor.ts'
import {
  attrInput,
  attrRows,
  genOf,
  paramRows,
  parseInput,
  problemsAt,
  showValue,
  withGenerator,
  withParam,
  type AttrRow,
  type InputKind,
  type ParamRow,
} from './fields.ts'

/** One row of the form: its key, label, input and the hint beside it. */
interface Row {
  key: string
  label: string
  value: unknown
  as: InputKind
  options?: string[] // a choice among these ('' first: none, it inherits)
  hint?: string
  disabled?: boolean
  lines?: boolean // several lines (a note): a text box, which keeps its line breaks
  path?: string // its problems' path, from the view's base (default: its key)
  // the field it sets and that field's new value, from the value read, or why it cannot be set; default: the field
  // named by its key, to the value
  to?: (value: unknown) => [string, unknown] | string
}
/** Sets a field: whether the copy changed (true), was refused (false: the editor's message says why), or not (null). */
type Setter = (key: string, value: unknown) => boolean | null
/** What the form shows: its rows, their problems and those of no row, the feature as JSON (none for the map's form). */
interface View {
  sig: string // the fields: a change builds the form again
  rows: Row[]
  set: Setter
  byRow: Map<string, Issue[]> // the problems of each row, by its key
  rest: Issue[]
  json: string | null
  pin: boolean // a generated feature: it can be pinned
}
/** A row's elements, to be given new values in place. */
interface Shown {
  input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
  hint: HTMLElement
  bad: HTMLElement
}

/** A field spec's range as a hint ('' for none). */
const rangeOf = (s: { min?: number; max?: number } | undefined) =>
  s && (s.min !== undefined || s.max !== undefined) ? `${s.min ?? '…'} to ${s.max ?? '…'}` : ''

/**
 * The problems by the row each falls in: the most specific one whose path is the problem's or holds it (a generator's
 * parameter rather than the generator), and those of no row.
 */
function assign(issues: Issue[], rows: Row[], base: string): { byRow: Map<string, Issue[]>; rest: Issue[] } {
  const byRow = new Map<string, Issue[]>()
  const rest: Issue[] = []
  const pathOf = (r: Row) => (base ? `${base}.${r.path ?? r.key}` : (r.path ?? r.key))
  for (const i of issues) {
    let best: Row | null = null
    for (const r of rows) {
      if (problemsAt([i], pathOf(r)).length && (!best || pathOf(r).length > pathOf(best).length)) best = r
    }
    if (best) byRow.set(best.key, [...(byRow.get(best.key) ?? []), i])
    else rest.push(i)
  }
  return { byRow, rest }
}

/** An attribute's row: its value, and as hints its range, what it inherits, what overrides it, its ramp. */
function attrRow(r: AttrRow): Row {
  const s = r.spec
  const range = rangeOf(s)
  // its own value overridden by the map's season or the feature's state: what it is there
  const over = r.own !== undefined && r.effective !== undefined && showValue(r.effective) !== showValue(r.own)
  const hint = [
    range,
    r.inherited !== undefined ? `inherits ${showValue(r.inherited)}` : '',
    over ? `the season or the state makes it ${showValue(r.effective)}` : '',
    s?.ramp ? `a ramp over ${s.ramp.join(' or ')}` : '',
    s ? '' : 'not an attribute of this kind',
  ]
    .filter(Boolean)
    .join(' · ')
  return {
    key: r.name,
    label: s?.unit ? `${r.name} (${s.unit})` : r.name,
    value: r.own,
    as: attrInput(s),
    options: s?.type === 'enum' ? ['', ...(s.values ?? [])] : undefined,
    hint,
  }
}

/**
 * A feature's generator and its parameters (M7d): the generator a choice of every one the engine has (what fits the
 * feature is the validator's to say), or JSON when its `gen` is not one generator's (a hand edit's slip, to mend); each
 * parameter read as its spec's type, its unit, range and whether it is required as hints. `current` is the feature as
 * the copy holds it when a row is applied.
 */
function genRows(f: Feature, current: () => Feature | undefined): Row[] {
  const g = genOf(f)
  if (f.gen !== undefined && !g) {
    return [{ key: 'gen', label: 'generator', value: f.gen, as: 'json', hint: '{ "<generator>": { params } }' }]
  }
  const gen: Row = {
    key: 'gen',
    label: 'generator',
    value: g?.name,
    as: 'text',
    options: ['', ...GENERATORS],
    hint: g ? 'Pin copies what it makes into the file' : '',
    // the same generator keeps its parameters; another starts with none
    to: v => ['gen', v === g?.name ? f.gen : withGenerator(v as string | undefined)],
  }
  return [gen, ...paramRows(f).map(r => paramRow(r, g!.name, current))]
}
/** A generator's parameter's row. */
function paramRow(r: ParamRow, gen: string, current: () => Feature | undefined): Row {
  const s = r.spec
  const selects = Object.hasOwn(GENERATOR_SPECS, gen) && !!GENERATOR_SPECS[gen].selects?.includes(r.name)
  const hint = [
    rangeOf(s),
    s?.required ? 'required' : '',
    selects ? 'ids, categories or kinds' : '',
    s ? '' : `not a parameter of ${gen}`,
  ]
    .filter(Boolean)
    .join(' · ')
  return {
    key: `gen:${r.name}`,
    label: s?.unit ? `${r.name} (${s.unit})` : r.name,
    value: r.own,
    as: attrInput(s),
    options: s?.type === 'enum' ? ['', ...(s.values ?? [])] : undefined,
    hint,
    path: `gen.${gen}.${r.name}`,
    to: v => {
      const now = current()
      const g = now ? withParam(now, r.name, v) : null
      return g === null ? 'it has no generator now' : ['gen', g]
    },
  }
}

const JSON_MAX = 20000 // characters of a feature's JSON shown (a long ring's are many): the file holds them all
/** A feature as JSON for the panel, cut at JSON_MAX characters. */
function shortJson(f: Feature): string {
  const s = JSON.stringify(f)
  return s.length > JSON_MAX ? `${s.slice(0, JSON_MAX)}… (${s.length} characters; the file holds them all)` : s
}

/** An element with some of its properties set. */
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, unknown> = {},
): HTMLElementTagNameMap[K] {
  return Object.assign(document.createElement(tag), props)
}

/**
 * The panel's form: the selection's fields, or the map's, each set through the editor, with the text typed in them and
 * not applied yet held until it is.
 */
export class Form {
  private box: HTMLElement
  private editor: Editor
  private cat: Catalogue | null = null
  private last: unknown[] = []
  private sig = ''
  private view: View | null = null
  private shown = new Map<string, Shown>()
  private rest = el('div')
  private json: HTMLTextAreaElement | null = null
  private pinButton: HTMLButtonElement | null = null
  /** The page's problems of the copy: the validator's at once after an edit, then the compile's. */
  private issues: () => Issue[]
  /** Text typed in a field and not applied yet, by the field's key, and why it was refused ('' : not tried yet). */
  private pending = new Map<string, { text: string; why: string }>()
  /** Whose fields the pending text is (the file, and the feature or none for the map's): another's drops it. */
  private whose: string | null = null

  constructor(box: HTMLElement, editor: Editor, issues: () => Issue[]) {
    this.box = box
    this.editor = editor
    this.issues = issues
  }

  /**
   * Shows the selection's fields, or the map's; nothing when the editor has no copy. Unless `force`, only when what
   * it shows may have changed.
   */
  update(cat: Catalogue | null, force = false): void {
    this.cat = cat
    const ed = this.editor
    const f = ed.selected ? ed.feature(ed.selected) : undefined
    // another map's or another selection's fields: the text typed and not applied goes
    const whose = `${ed.file}#${f ? f.id : ''}`
    if (whose !== this.whose) this.pending.clear()
    this.whose = whose
    const key = [ed.doc, f, this.issues(), cat, ed.enabled, ed.idle, ed.noFile]
    if (!force && key.length === this.last.length && key.every((k, i) => k === this.last[i])) return
    this.last = key
    const view = !ed.doc ? null : f ? this.feature(f, ed.doc, cat) : this.map(ed.doc)
    this.view = view
    if (!view) {
      this.sig = ''
      this.box.replaceChildren()
    } else if (view.sig !== this.sig) this.build(view)
    else this.fill(view)
  }

  /** Applies the text typed in every field and not tried yet: before a press on the map, and a save. */
  flush(): void {
    for (const [key, p] of [...this.pending]) if (!p.why) this.apply(key)
  }
  /** Whether a field holds text not applied (typed, or refused): work the page would lose if it closed. */
  get holding(): boolean {
    return this.pending.size > 0
  }
  /** Whether a field holds text it could not apply (what the field shows is not in the copy). */
  get refused(): boolean {
    return [...this.pending.values()].some(p => !!p.why)
  }
  /** Whether an element is one of the form's fields holding text not applied (its own undo is the browser's). */
  holds(target: EventTarget | null): boolean {
    const key = (target as HTMLElement | null)?.dataset?.key
    return !!key && this.box.contains(target as Node) && this.pending.has(key)
  }

  /** Applies a field's pending text: set, or kept with why not. */
  private apply(key: string): void {
    const p = this.pending.get(key)
    const row = this.view?.rows.find(r => r.key === key)
    if (!p || !row) {
      this.pending.delete(key) // a field the form no longer has: its text goes with it
      return
    }
    // the text stays the field's while it is applied (a refresh meanwhile shows it, the caret where it was)
    const parsed = parseInput(row.as, p.text)
    let done: boolean | null
    if ('error' in parsed) done = false
    else {
      const value = 'remove' in parsed ? undefined : parsed.value
      const to = row.to ? row.to(value) : ([key, value] as [string, unknown])
      if (typeof to === 'string') {
        this.pending.set(key, { text: p.text, why: to })
        this.update(this.cat, true)
        return
      }
      done = this.view!.set(to[0], to[1])
    }
    if (done === false) {
      const why = 'error' in parsed ? parsed.error : this.editor.message || 'refused'
      this.pending.set(key, { text: p.text, why })
    } else this.pending.delete(key)
    this.update(this.cat, true)
  }

  /**
   * A feature's view: its own fields, its attributes, its seasons, its generator and its parameters; its problems of
   * no field; its JSON.
   */
  private feature(f: Feature, doc: MapFile, cat: Catalogue | null): View {
    const id = f.id
    const rows = [
      ...this.ownRows(f, doc, cat),
      ...(cat ? attrRows(cat, f, doc).map(attrRow) : []),
      { key: 'seasons', label: 'seasons', value: f.seasons, as: 'json', hint: '{ "winter": { … } }' } satisfies Row,
      ...genRows(f, () => this.editor.feature(id)),
    ]
    const base = `features[${doc.features.indexOf(f)}]`
    // the problems of no row (its shape, its references, a shared edge): above the feature's JSON
    const { byRow, rest } = assign(problemsAt(this.issues(), base), rows, base)
    const pin = f.gen !== undefined
    return {
      // the fields, not the feature: another feature of the kind keeps the form (and the focus a Tab moved on to)
      // its fields' kinds, not their choices (a new choice is given in place)
      sig: JSON.stringify(['feature', rows.map(r => [r.key, r.label, r.as, !!r.options, r.lines]), pin]),
      rows,
      set: (key, value) => this.editor.setField(key, value),
      byRow,
      rest,
      json: shortJson(f),
      pin,
    }
  }
  /** A feature's own fields: its id (shown), kind, preset, priority, state, source and note. */
  private ownRows(f: Feature, doc: MapFile, cat: Catalogue | null): Row[] {
    const presets = presetsOf(doc)
    const kind = featureKind(f, presets)
    const chain = cat && kind ? kindChain(cat, kind) : null
    const states = cat && chain ? Object.keys(kindStates(cat, chain)) : []
    const sources = (Array.isArray(doc.sources) ? doc.sources : []).map(s => s?.id).filter(x => typeof x === 'string')
    const rows: Row[] = [
      {
        key: 'id',
        label: 'id',
        value: f.id,
        as: 'text',
        disabled: true,
        hint: 'set when it is made; renamed in the file (it seeds its generator and names its children)',
      },
      {
        key: 'kind',
        label: 'kind',
        value: f.kind,
        as: 'text',
        options: cat ? ['', ...Object.keys(cat.kinds)] : undefined,
      },
    ]
    if (Object.keys(presets).length || f.preset !== undefined) {
      rows.push({ key: 'preset', label: 'preset', value: f.preset, as: 'text', options: ['', ...Object.keys(presets)] })
    }
    rows.push(
      { key: 'priority', label: 'priority', value: f.priority, as: 'number', hint: 'who wins an overlap' },
      { key: 'state', label: 'state', value: f.state, as: 'text', options: ['', ...states] },
      { key: 'source', label: 'source', value: f.source, as: 'text', options: ['', ...sources, 'invented'] },
      { key: 'note', label: 'note', value: f.note, as: 'raw', lines: true },
    )
    return rows
  }

  /** The map's view: its own fields (its id shown), its problems of no field. */
  private map(doc: MapFile): View {
    const noFile = this.editor.noFile
    const rows: Row[] = [
      {
        key: 'id',
        label: 'map id',
        value: doc.id,
        as: 'text',
        disabled: true,
        hint: noFile ? 'names the file its first save makes' : 'names the file',
      },
      { key: 'name', label: 'name', value: doc.name, as: 'text' },
      { key: 'note', label: 'note', value: doc.note, as: 'raw', lines: true },
      { key: 'seed', label: 'seed', value: doc.seed, as: 'number' },
      { key: 'season', label: 'season', value: doc.season, as: 'text', options: ['', ...SEASONS] },
      { key: 'datum', label: 'datum (m)', value: doc.datum, as: 'number', hint: "the map's zero above the sea" },
      { key: 'extent', label: 'extent', value: doc.extent, as: 'json', hint: '{ "w": m, "h": m }' },
      { key: 'play', label: 'play', value: doc.play, as: 'json', hint: '{ "w": m, "h": m }' },
      { key: 'sources', label: 'sources', value: doc.sources, as: 'json', hint: '[{ "id", "kind", "ref"?, "note"? }]' },
      { key: 'presets', label: 'presets', value: doc.presets, as: 'json', hint: '{ "name": { "kind", … } }' },
    ]
    // the map's problems (its features' are theirs); of no row, those of no feature
    const { byRow, rest } = assign(
      this.issues().filter(x => !x.path.startsWith('features')),
      rows,
      '',
    )
    return {
      sig: JSON.stringify(['map', rows.map(r => [r.key, r.label, r.as, !!r.options, r.lines])]),
      rows,
      set: (key, value) => this.editor.setMapField(key, value),
      byRow,
      rest: rest.filter(x => x.id === null),
      json: null,
      pin: false,
    }
  }

  /** Builds the form for a view whose fields differ from the last one's. */
  private build(view: View): void {
    this.sig = view.sig
    this.shown.clear()
    // text typed in a field this form does not have goes (another kind's attribute)
    for (const key of [...this.pending.keys()]) if (!view.rows.some(r => r.key === key)) this.pending.delete(key)
    const table = el('div', { className: 'fields' })
    for (const r of view.rows) {
      const input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement = r.options
        ? el('select')
        : r.lines
          ? el('textarea', { rows: 2, spellcheck: false })
          : el('input', { spellcheck: false })
      input.dataset.key = r.key
      input.addEventListener('input', () => {
        this.pending.set(r.key, { text: input.value, why: '' })
        this.fillRow(r.key)
      })
      input.addEventListener('change', () => this.apply(r.key))
      input.addEventListener('keydown', (e: Event) => {
        if ((e as KeyboardEvent).key !== 'Escape' || !this.pending.has(r.key)) return
        // Escape drops the text typed (the map's Escape is for the map)
        e.stopPropagation()
        this.pending.delete(r.key)
        this.update(this.cat, true)
      })
      const hint = el('span', { className: 'hint' })
      const bad = el('span', { className: 'bads' })
      const row = el('label', { className: 'row' })
      row.append(el('span', { className: 'k', textContent: r.label }), input, hint, bad)
      table.append(row)
      this.shown.set(r.key, { input, hint, bad })
    }
    this.rest = el('div')
    const parts: HTMLElement[] = [table]
    this.pinButton = null
    if (view.pin) {
      this.pinButton = el('button', {
        type: 'button',
        textContent: 'Pin',
        title: 'copy what its generator makes into the file: the feature stops being generated, its children stay',
      })
      this.pinButton.addEventListener('click', () => {
        this.flush()
        // as a save: what a field shows and could not apply would be lost with the rows the pin takes away
        if (this.refused) {
          this.editor.note('a field holds text it could not apply: mend it, or Escape drops it; not pinned')
        } else this.editor.pin()
      })
      parts.push(this.pinButton)
    }
    parts.push(this.rest)
    this.json = null
    if (view.json !== null) {
      this.json = el('textarea', {
        className: 'json',
        spellcheck: false,
        rows: 4,
        readOnly: true,
        title: 'the feature as JSON, to copy',
      })
      parts.push(this.json)
    }
    // the focus in a field replaced goes to its new field, or to the form (never to the page, whose keys are the map's)
    const focus = this.box.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.key : null
    this.box.replaceChildren(...parts)
    if (focus !== null) {
      const again = focus ? this.shown.get(focus)?.input : undefined
      ;(again ?? this.box).focus()
    }
    this.fill(view)
  }

  /** Gives the form's inputs, hints and problems the view's values, in place. */
  private fill(view: View): void {
    for (const r of view.rows) this.fillRow(r.key)
    if (this.pinButton) this.pinButton.disabled = !this.editor.enabled || !this.editor.idle
    this.rest.replaceChildren(...this.problems(view.rest.map(i => i.message)))
    // only when it changed: a part selected in it to copy stays selected
    if (this.json && view.json !== null && this.json.value !== view.json) this.json.value = view.json
  }
  /** One row's input (its pending text, else the copy's value), hint and problems (a refusal's first). */
  private fillRow(key: string): void {
    const view = this.view!
    const r = view.rows.find(x => x.key === key)!
    const s = this.shown.get(key)!
    const p = this.pending.get(key)
    const value = p ? p.text : showValue(r.value, r.as)
    if (s.input instanceof HTMLSelectElement) {
      // a value the choice does not offer (a hand edit's slip) is shown all the same, for the validator names it
      const opts = r.options!.includes(value) ? r.options! : [...r.options!, value]
      if ([...s.input.options].map(o => o.value).join('\n') !== opts.join('\n')) {
        s.input.replaceChildren(...opts.map(o => new Option(o === '' ? '—' : o, o)))
      }
    }
    if (s.input.value !== value) s.input.value = value
    // a field that cannot be set now is read-only (its text can still be selected and copied); a choice is disabled
    const off = !this.editor.enabled || !this.editor.idle || !!r.disabled
    if (s.input instanceof HTMLSelectElement) s.input.disabled = off
    else s.input.readOnly = off
    s.hint.textContent = r.hint ?? ''
    const found = (view.byRow.get(key) ?? []).map(i => i.message)
    s.bad.replaceChildren(...this.problems(p?.why ? [`not applied: ${p.why}`, ...found] : found))
  }

  /** Problems, or a refusal, as lines under a field. */
  private problems(messages: string[]): HTMLElement[] {
    return messages.map(m => el('span', { className: 'bad', textContent: m }))
  }
}
