// The map page's form (docs/plans/active/m7-editor.md M7c): the selected feature's fields, or with no selection the
// map's own, built from the catalogue and set through the editor (./editor.ts) one edit at a time. An input applies
// when it changes (Enter, or the focus leaving it); the validator's problems are shown under their fields, and those
// of no field above the feature's JSON. The form is built again only when its fields change (another selection, a new
// kind); otherwise its inputs are given the values in place, so the field a click or Tab moved to is still there after
// the edit the move applied, and a refused change shows the value the feature still has. Text typed and not yet
// applied (a field, the JSON) is left as it is by a refresh from elsewhere (a file read in, a save's reply).
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
/** What the form shows: its rows, the problems of no row, the feature as JSON (none for the map's form). */
interface View {
  sig: string // the fields: a change builds the form again
  base: string // the path its rows' paths start from
  rows: Row[]
  set: (key: string, value: unknown) => void
  rest: Issue[]
  json: string | null
}
/** A row's elements, to be given new values in place. */
interface Shown {
  input: HTMLInputElement | HTMLSelectElement
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
  private shown = new Map<string, Shown>()
  private rest = el('div')
  private json: HTMLTextAreaElement | null = null
  /** The fields typed in since they were last given their values (the JSON's key is '#json'). */
  private typed = new Set<string>()
  /** Whose fields the form shows (another selection's are given their values, typed or not). */
  private whose: string | null = null
  /** How many times the form was given its values: a change that gave none (refused, or no change) gives them. */
  private fills = 0
  /** Called for a change of the map's id (the page moves the new map to its file). */
  onMapId: (id: string) => void = () => {}

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
    const key = [ed.doc, f, ed.issues, cat, ed.enabled, ed.idle, ed.noFile]
    if (!force && key.length === this.last.length && key.every((k, i) => k === this.last[i])) return
    this.last = key
    const view = !ed.doc ? null : f ? this.feature(f, ed.doc, cat) : this.map(ed.doc)
    const whose = f ? `feature ${f.id}` : 'map'
    if (whose !== this.whose) this.typed.clear()
    this.whose = whose
    if (!view) {
      this.sig = ''
      this.box.replaceChildren()
    } else if (view.sig !== this.sig) this.build(view)
    else this.fill(view)
  }

  private feature(f: Feature, doc: MapFile, cat: Catalogue | null): View {
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
    const base = `features[${i}]`
    // the problems of no row (its shape, its references, a shared edge, a generator): above the feature's JSON
    const rest = problemsAt(this.editor.issues, base).filter(
      x => !rows.some(r => problemsAt([x], `${base}.${r.key}`).length),
    )
    return {
      // the fields, not the feature: a rename keeps the form (and the focus a Tab moved on to)
      sig: JSON.stringify(['feature', rows.map(r => [r.key, r.label, r.as, r.options])]),
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
        disabled: !noFile,
        hint: noFile ? 'names the file its first save makes' : 'names the file',
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
    return {
      sig: JSON.stringify(['map', rows.map(r => [r.key, r.label, r.as, r.options])]),
      base: '',
      rows,
      set: (key, value) => {
        if (key === 'id') this.onMapId(typeof value === 'string' ? value : '')
        else this.editor.setMapField(key, value)
      },
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
    const table = el('div', { className: 'fields' })
    for (const r of view.rows) {
      let input: HTMLInputElement | HTMLSelectElement
      if (r.options) input = el('select')
      else input = el('input', { spellcheck: false })
      input.dataset.key = r.key
      input.addEventListener('input', () => this.typed.add(r.key))
      input.addEventListener('change', () => {
        const parsed = parseInput(r.as, input.value)
        const fills = this.fills
        this.typed.delete(r.key)
        if ('error' in parsed) this.editor.note(`${r.key}: ${parsed.error}; nothing changed`)
        else view.set(r.key, 'remove' in parsed ? undefined : parsed.value)
        // a change the editor refused (or that changed nothing) shows what the field still holds
        if (this.fills === fills) this.update(this.cat, true)
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
      const json = el('textarea', { spellcheck: false, rows: 6 })
      json.dataset.key = '#json'
      json.addEventListener('input', () => this.typed.add('#json'))
      // applied, the JSON is the feature's again; refused, it stays as typed, to be mended
      const apply = () => {
        const doc = this.editor.doc
        this.editor.setFeature(json.value)
        if (this.editor.doc !== doc) {
          this.typed.delete('#json')
          this.update(this.cat, true)
        }
      }
      const button = el('button', { textContent: 'apply JSON', title: 'Cmd or Ctrl Enter' })
      button.addEventListener('click', apply)
      json.addEventListener('keydown', e => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) apply()
      })
      this.json = json
      parts.push(json, button)
    }
    this.box.replaceChildren(...parts)
    this.fill(view)
  }

  /** Gives the form's inputs, hints and problems the view's values, in place. */
  private fill(view: View): void {
    this.fills++
    const off = !this.editor.enabled || !this.editor.idle
    for (const r of view.rows) {
      const s = this.shown.get(r.key)!
      const value = showValue(r.value)
      if (s.input instanceof HTMLSelectElement) {
        // a value the choice does not offer (a hand edit's slip) is shown all the same, for the validator names it
        const opts = r.options!.includes(value) ? r.options! : [...r.options!, value]
        if ([...s.input.options].map(o => o.value).join('\n') !== opts.join('\n')) {
          s.input.replaceChildren(...opts.map(o => new Option(o === '' ? '—' : o, o)))
        }
      }
      if (!this.typed.has(r.key)) s.input.value = value
      s.input.disabled = off || !!r.disabled
      s.hint.textContent = r.hint ?? ''
      s.bad.replaceChildren(
        ...this.problems(problemsAt(this.editor.issues, view.base ? `${view.base}.${r.key}` : r.key)),
      )
    }
    this.rest.replaceChildren(...this.problems(view.rest))
    if (this.json && view.json !== null && !this.typed.has('#json')) this.json.value = view.json
  }

  private problems(found: Issue[]): HTMLElement[] {
    return found.map(i => el('span', { className: 'bad', textContent: i.message }))
  }
}
