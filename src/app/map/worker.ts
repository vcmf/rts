// The draft page's compile worker (docs/plans/done/m1-language.md M1b): validate, expand, apply, draw, off the
// page's thread, with the same code the map CLI runs in Node (src/map/).
import type { Catalogue, MapFile } from '../../map/schema.ts'
import type { MapFiles } from '../../map/dem.ts'
import { checkFiles, validate } from '../../map/validate.ts'
import { expand } from '../../map/expand.ts'
import { apply, LAYER_NAMES } from '../../map/apply.ts'
import { draft } from '../../map/draft.ts'
import { bakeInk, bakeMasks, bakeRelief, waysOf, type LightDir } from '../../render/lit/bake.ts'
import { overlay, unitKinds } from '../../render/lit/overlays.ts'
import type { Layers } from '../../map/apply.ts'
import { napoleonic } from '../../rulesets/napoleonic.ts'
import { classifyNapoleonic } from '../../rulesets/napoleonic-ground.ts'
import type { CompileReply, CompileRequest, LayerName, OverlayReply, OverlayRequest } from './protocol.ts'

// the map view's one light, from the north-west for now (docs/plans/active/one-map-austerlitz.md, open question 6)
const LIGHT: LightDir = 'nw'
// the ruleset the overlays read the ground with (the page's one era for now)
const RULESET = napoleonic
const CLASSIFY = classifyNapoleonic
// the last compiled layers, for the overlays
let last: Layers | null = null

self.onmessage = (e: MessageEvent<CompileRequest | OverlayRequest>) => {
  if (e.data.type === 'overlay') {
    const { seq, spec } = e.data
    const t0 = performance.now()
    const rgba = last && spec ? overlay(last, RULESET, CLASSIFY, spec).buffer : null
    const reply: OverlayReply = { type: 'overlay', seq, rgba: rgba as ArrayBuffer | null, ms: performance.now() - t0 }
    ;(self as unknown as Worker).postMessage(reply, rgba ? [rgba as ArrayBuffer] : [])
    return
  }
  const { seq, mapText, kindsText, files } = e.data
  const fail = (path: string, message: string) =>
    (self as unknown as Worker).postMessage({
      seq,
      ok: false,
      issues: [{ id: null, path, message }],
    } satisfies CompileReply)
  // the files first, whatever else fails: the page counts them as held once sent
  const { files: mine, missing } = held(files ?? {})
  if (missing.length) {
    ;(self as unknown as Worker).postMessage({ seq, ok: false, issues: [], missing } satisfies CompileReply)
    return
  }
  let map: unknown
  let cat: Catalogue
  try {
    cat = JSON.parse(kindsText) as Catalogue
  } catch (err) {
    fail('maps/kinds.json', `not valid JSON: ${(err as Error).message}`)
    return
  }
  try {
    map = JSON.parse(mapText)
  } catch (err) {
    fail('', `not valid JSON: ${(err as Error).message}`)
    return
  }
  try {
    compile(seq, map, cat, mine)
  } catch (err) {
    fail('', `the compiler failed: ${(err as Error).message} (a bug, or a catalogue the validator does not check)`)
  }
}

// the heightfields this worker holds, by name: the version it was last sent and its bytes, kept across compiles so a
// file is hashed and decoded once (checkFiles remembers the bytes it has read)
const kept = new Map<string, { version: number; bytes: Uint8Array }>()
/**
 * Stores the files a request carries, drops those its map no longer names, and returns the map's files with the
 * names it was told it holds but does not.
 */
function held(files: CompileRequest['files']): { files: MapFiles; missing: string[] } {
  for (const name of [...kept.keys()]) if (!(name in files)) kept.delete(name)
  const out: MapFiles = new Map()
  const missing: string[] = []
  for (const [name, f] of Object.entries(files)) {
    if (f.bytes) kept.set(name, { version: f.version, bytes: new Uint8Array(f.bytes) })
    const k = kept.get(name)
    if (k && k.version === f.version) out.set(name, k.bytes)
    else missing.push(name)
  }
  return { files: out, missing }
}

function compile(seq: number, map: unknown, cat: Catalogue, files: MapFiles): void {
  const t0 = performance.now()
  const issues = validate(map, cat)
  if (issues.length) {
    ;(self as unknown as Worker).postMessage({ seq, ok: false, issues } satisfies CompileReply)
    return
  }
  const checked = checkFiles(map as MapFile, cat, files)
  if (checked.issues.length) {
    ;(self as unknown as Worker).postMessage({ seq, ok: false, issues: checked.issues } satisfies CompileReply)
    return
  }
  const ex = expand(map as MapFile, cat)
  if (ex.issues.length) {
    ;(self as unknown as Worker).postMessage({ seq, ok: false, issues: ex.issues } satisfies CompileReply)
    return
  }
  const t1 = performance.now()
  const L = apply(ex.map, cat, checked.dems)
  last = L
  const t2 = performance.now()
  const img = draft(L)
  const t3 = performance.now()
  const relief = bakeRelief(L.height, L.nx + 1, L.nz + 1, L.cell, LIGHT)
  const masks = bakeMasks(L)
  const ink = bakeInk(L, waysOf(ex.map.features, L.table))
  const t4 = performance.now()
  // copies go to the page: the worker keeps the layers for the overlays (`last`)
  const layers = Object.fromEntries(LAYER_NAMES.map(n => [n, L[n].slice().buffer as ArrayBuffer])) as Record<
    LayerName,
    ArrayBuffer
  >
  const reply: CompileReply = {
    seq,
    ok: true,
    map: ex.map,
    w: img.w,
    h: img.h,
    rgba: img.data.buffer as ArrayBuffer,
    cell: L.cell,
    nx: L.nx,
    nz: L.nz,
    x0: L.x0,
    z0: L.z0,
    height: L.height.slice().buffer as ArrayBuffer,
    depth: L.depth.slice().buffer as ArrayBuffer,
    layers,
    table: L.table,
    units: unitKinds(RULESET),
    relief: relief.buffer as ArrayBuffer,
    light: LIGHT,
    masks: masks.buffer as ArrayBuffer,
    ink: ink.buffer as ArrayBuffer,
    ms: { validate: t1 - t0, apply: t2 - t1, draw: t3 - t2, bake: t4 - t3 },
  }
  ;(self as unknown as Worker).postMessage(reply, [
    reply.rgba,
    reply.height,
    reply.depth,
    reply.relief,
    reply.masks,
    reply.ink,
    ...Object.values(layers),
  ])
}
