// The map page's form (docs/plans/active/m7-editor.md M7c): the selected feature's fields, or with no selection the
// map's own, built from the catalogue and set through the editor (./editor.ts) one edit at a time. An input applies
// when it changes (Enter, or the focus leaving it); the validator's problems are shown under their fields. The form is
// rebuilt only when what it shows changes, so a field being typed in is never replaced under the typing.
import type { Catalogue, Feature, MapFile } from '../../map/schema.ts'
import { SEASONS } from '../../map/schema.ts'
import { kindChain, kindStates, type Issue } from '../../map/catalogue.ts'
import { featureKind } from '../../map/validate.ts'
import type { Editor } from './editor.ts'
import { attrInput, attrRows, parseInput, problemsAt, showValue } from './fields.ts'

type Input = 'text' | 'number' | 'json'
/** One row of the form: its key, label, input and the hint beside it. */
interface Row {
  key: string
  label: string
  value: unknown
  as: Input
  options?: string[] // a choice among these ('' first: none, it inherits)
  hint?: string
  disabled?: boolean
}

/** An element with some of its properties set. */
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, unknown> = {},
): HTMLElementTagNameMap[K] {
  return Object.assign(document.createElement(tag), props)
}

/** The form's state: what it last showed, so it is rebuilt only when that changes. */
export class Form {
  private box: HTMLElement
  private editor: Editor
  private shown: unknown[] = []
  /** Called for a change of the map's id (the page moves the new map to its file). */
  onMapId: (id: string) => void = () => {}

  constructor(box: HTMLElement, editor: Editor) {
    this.box = box
    this.editor = editor
  }

  /** Shows the selection's fields, or the map's; nothing when the editor has no copy. */
  update(cat: Catalogue | null): void {
    const ed = this.editor
    const f = ed.selected ? ed.feature(ed.selected) : undefined
    const key = [ed.doc, f, ed.issues, cat, ed.enabled, ed.idle, ed.noFile]
    if (key.length === this.shown.length && key.every((k, i) => k === this.shown[i])) return
    this.shown = key
    const focus = (document.activeElement as HTMLElement | null)?.dataset?.key
    if (!ed.doc) this.box.replaceChildren()
    else if (f) this.feature(f, ed.doc, cat)
    else this.map(ed.doc)
    // the focus stays on the field it was in (the form was rebuilt after its change)
    if (focus) (this.box.querySelector(`[data-key="${CSS.escape(focus)}"]`) as HTMLElement | null)?.focus()
  }

  private feature(f: Feature, doc: MapFile, cat: Catalogue | null): void {
    const i = doc.features.indexOf(f)
    const presets = (doc.presets ?? {}) as Record<string, Record<string, unknown>>
    const kind = featureKind(f, presets)
    const chain = cat && kind ? kindChain(cat, kind) : null
    const states = cat && chain ? Object.keys(kindStates(cat, chain)) : []
    const sources = (Array.isArray(doc.sources) ? doc.sources : []).map(s => s?.id).filter(x => typeof x === 'string')
    const rows: Row[] = [
      { key: 'id', label: 'id', value: f.id, as: 'text', hint: 'a rename follows every reference' },
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
      { key: 'note', label: 'note', value: f.note, as: 'text' },
    )
    for (const r of cat ? attrRows(cat, f, doc) : []) {
      const s = r.spec
      const range = s && (s.min !== undefined || s.max !== undefined) ? `${s.min ?? '…'} to ${s.max ?? '…'}` : ''
      const hint = [
        range,
        r.inherited !== undefined ? `inherits ${showValue(r.inherited)}` : '',
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
        options: s?.type === 'enum' ? ['', ...s.values!] : undefined,
        hint,
      })
    }
    rows.push({ key: 'seasons', label: 'seasons', value: f.seasons, as: 'json', hint: '{ "winter": { … } }' })
    const set = (key: string, value: unknown) => this.editor.setField(key, value)
    const table = this.rows(rows, `features[${i}]`, set)
    // the whole feature as JSON, for what the rows do not show (its shape, references, a generator)
    const json = el('textarea', { value: JSON.stringify(f, null, 1), spellcheck: false, rows: 6 })
    json.dataset.key = '#json'
    const apply = el('button', { textContent: 'apply JSON', title: 'Cmd or Ctrl Enter' })
    apply.addEventListener('click', () => this.editor.setFeature(json.value))
    json.addEventListener('keydown', e => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) this.editor.setFeature(json.value)
    })
    const whole = this.problems(this.editor.issues.filter(x => x.path === `features[${i}]`))
    this.box.replaceChildren(...whole, table, json, apply)
  }

  private map(doc: MapFile): void {
    const rows: Row[] = [
      {
        key: 'id',
        label: 'map id',
        value: doc.id,
        as: 'text',
        disabled: !this.editor.noFile,
        hint: this.editor.noFile ? 'names the file its first save makes' : 'names the file',
      },
      { key: 'name', label: 'name', value: doc.name, as: 'text' },
      { key: 'note', label: 'note', value: doc.note, as: 'text' },
      { key: 'seed', label: 'seed', value: doc.seed, as: 'number' },
      { key: 'season', label: 'season', value: doc.season, as: 'text', options: ['', ...SEASONS] },
      { key: 'datum', label: 'datum (m)', value: doc.datum, as: 'number', hint: "the map's zero above the sea" },
      { key: 'extent', label: 'extent', value: doc.extent, as: 'json', hint: '{ "w": m, "h": m }' },
      { key: 'play', label: 'play', value: doc.play, as: 'json', hint: '{ "w": m, "h": m }' },
      { key: 'sources', label: 'sources', value: doc.sources, as: 'json', hint: '[{ "id", "kind", "ref"?, "note"? }]' },
      { key: 'presets', label: 'presets', value: doc.presets, as: 'json', hint: '{ "name": { "kind", … } }' },
    ]
    const set = (key: string, value: unknown) => {
      if (key === 'id') this.onMapId(typeof value === 'string' ? value : '')
      else this.editor.setMapField(key, value)
    }
    this.box.replaceChildren(this.rows(rows, '', set))
  }

  /** The rows as a table; each input applies its text on change, through `set` (undefined: the field removed). */
  private rows(rows: Row[], base: string, set: (key: string, value: unknown) => void): HTMLElement {
    const table = el('div', { className: 'fields' })
    const off = !this.editor.enabled || !this.editor.idle
    for (const r of rows) {
      const shown = showValue(r.value)
      let input: HTMLInputElement | HTMLSelectElement
      if (r.options) {
        const select = el('select')
        const opts = r.options.includes(shown) ? r.options : [...r.options, shown]
        select.append(...opts.map(o => new Option(o === '' ? '—' : o, o)))
        select.value = shown
        input = select
      } else input = el('input', { value: shown, spellcheck: false })
      input.dataset.key = r.key
      input.disabled = off || !!r.disabled
      input.addEventListener('change', () => {
        const parsed = parseInput(r.as, input.value)
        if ('error' in parsed) return this.editor.note(`${r.key}: ${parsed.error}; nothing changed`)
        set(r.key, 'remove' in parsed ? undefined : parsed.value)
      })
      const path = base ? `${base}.${r.key}` : r.key
      const row = el('label', { className: 'row' })
      row.append(el('span', { className: 'k', textContent: r.label }), input)
      if (r.hint) row.append(el('span', { className: 'hint', textContent: r.hint }))
      row.append(...this.problems(problemsAt(this.editor.issues, path)))
      table.append(row)
    }
    return table
  }

  private problems(found: Issue[]): HTMLElement[] {
    return found.map(i => el('span', { className: 'bad', textContent: i.message }))
  }
}
