// The map page's form (docs/plans/active/m7-editor.md M7c): the selected feature's fields, or with no selection the
// map's own, built from the catalogue and set through the editor (./editor.ts) one edit at a time.
// - A field shows the editor's copy, unless it holds text typed and not applied yet (`pending`). That text is applied
//   when the field changes (Enter, the focus leaving it) and before any command of the editor (`flush`: a press on the
//   map, a key, a button), so it is never lost to a drag nor applied to a copy that moved on. Refused (no value, or the
//   editor said no), it stays with its reason under it until it is changed or Escape drops it.
// - The validator's problems show under their fields, those of no field above the feature's JSON, which is to read
//   and copy only (its shape and references are edited on the map).
// - The form is built again only when its fields change (another kind); otherwise its inputs are given their values
//   in place, so the field the focus moved to stays.
import type { Catalogue, Feature, MapFile } from '../../map/schema.ts'
import { SEASONS } from '../../map/schema.ts'
import { kindChain, kindStates, type Issue } from '../../map/catalogue.ts'
import { featureKind } from '../../map/validate.ts'
import type { Editor } from './editor.ts'
import { attrInput, attrRows, parseInput, presetsOf, problemsAt, showValue } from './fields.ts'

type Input = 'text' | 'raw' | 'number' | 'json' | 'any'
/** One row of the form: its key, label, input and the hint beside it. */
interface Row {
  key: string
  label: string
  value: unknown
  as: Input
  options?: string[] // a choice among these ('' first: none, it inherits)
  hint?: string
  disabled?: boolean
  lines?: boolean // several lines (a note): a text box, which keeps its line breaks
}
/** Sets a field: whether the copy changed (true), was refused (false: the editor's message says why), or not (null). */
type Setter = (key: string, value: unknown) => boolean | null
/** What the form shows: its rows, the problems of no row, the feature as JSON (none for the map's form). */
interface View {
  sig: string // the fields: a change builds the form again
  base: string // the path its rows' paths start from
  rows: Row[]
  set: Setter
  rest: Issue[]
  json: string | null
}
/** A row's elements, to be given new values in place. */
interface Shown {
  input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
  hint: HTMLElement
  bad: HTMLElement
}

/** An element with some of its properties set. */
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, unknown> = {},
): HTMLElementTagNameMap[K] {
  return Object.assign(document.createElement(tag), props)
}

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
  /** Text typed in a field and not applied yet, by the field's key, and why it was refused ('' : not tried yet). */
  private pending = new Map<string, { text: string; why: string }>()
  /** Whose fields the pending text is (the file, and the feature or none for the map's): another's drops it. */
  private whose: string | null = null

  constructor(box: HTMLElement, editor: Editor) {
    this.box = box
    this.editor = editor
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
    const key = [ed.doc, f, ed.issues, cat, ed.enabled, ed.idle, ed.noFile]
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

  /** Applies the text typed in every field and not tried yet: before any command of the editor. */
  flush(): void {
    for (const [key, p] of [...this.pending]) if (!p.why) this.apply(key)
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
    this.pending.delete(key)
    const parsed = parseInput(row.as, p.text)
    let done: boolean | null
    if ('error' in parsed) {
      this.pending.set(key, { text: p.text, why: parsed.error })
      done = false
    } else {
      done = this.view!.set(key, 'remove' in parsed ? undefined : parsed.value)

      if (done === false) this.pending.set(key, { text: p.text, why: this.editor.message || 'refused' })
    }
    // an edit made refreshed the form; a refusal or no change does it here
    if (done !== true) this.update(this.cat, true)
  }

  private feature(f: Feature, doc: MapFile, cat: Catalogue | null): View {
    const i = doc.features.indexOf(f)
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
    for (const r of cat ? attrRows(cat, f, doc) : []) {
      const s = r.spec
      const range = s && (s.min !== undefined || s.max !== undefined) ? `${s.min ?? '…'} to ${s.max ?? '…'}` : ''
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
      rows.push({
        key: r.name,
        label: s?.unit ? `${r.name} (${s.unit})` : r.name,
        value: r.own,
        as: attrInput(s),
        options: s?.type === 'enum' ? ['', ...(s.values ?? [])] : undefined,
        hint,
      })
    }
    rows.push({ key: 'seasons', label: 'seasons', value: f.seasons, as: 'json', hint: '{ "winter": { … } }' })
    const base = `features[${i}]`
    // the problems of no row (its shape, its references, a shared edge, a generator): above the feature's JSON
    const rest = problemsAt(this.editor.issues, base).filter(
      x => !rows.some(r => problemsAt([x], `${base}.${r.key}`).length),
    )
    return {
      // the fields, not the feature: a rename keeps the form (and the focus a Tab moved on to)
      sig: JSON.stringify(['feature', rows.map(r => [r.key, r.label, r.as, r.options, r.lines])]),
      base,
      rows,
      set: (key, value) => this.editor.setField(key, value),
      rest,
      json: JSON.stringify(f),
    }
  }

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
    return {
      sig: JSON.stringify(['map', rows.map(r => [r.key, r.label, r.as, r.options, r.lines])]),
      base: '',
      rows,
      set: (key, value) => this.editor.setMapField(key, value),
      // the map's problems of no row (its features' are theirs)
      rest: this.editor.issues.filter(
        x => x.id === null && !rows.some(r => problemsAt([x], r.key).length) && !x.path.startsWith('features'),
      ),
      json: null,
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
    const parts: HTMLElement[] = [table, this.rest]
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
    this.box.replaceChildren(...parts)
    this.fill(view)
  }

  /** Gives the form's inputs, hints and problems the view's values, in place. */
  private fill(view: View): void {
    for (const r of view.rows) this.fillRow(r.key)
    this.rest.replaceChildren(...this.problems(view.rest.map(i => i.message)))
    if (this.json && view.json !== null) this.json.value = view.json
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
    s.input.disabled = !this.editor.enabled || !this.editor.idle || !!r.disabled
    s.hint.textContent = r.hint ?? ''
    const found = problemsAt(this.editor.issues, view.base ? `${view.base}.${r.key}` : r.key).map(i => i.message)
    s.bad.replaceChildren(...this.problems(p?.why ? [`not applied: ${p.why}`, ...found] : found))
  }

  private problems(messages: string[]): HTMLElement[] {
    return messages.map(m => el('span', { className: 'bad', textContent: m }))
  }
}
