// The draft page's compile worker (docs/plans/done/m1-language.md M1b): validate, expand, apply, draw, off the
// page's thread, with the same code the map CLI runs in Node (src/map/).
import type { Catalogue, MapFile } from '../../map/schema.ts'
import type { MapFiles } from '../../map/dem.ts'
import { checkFiles, validate } from '../../map/validate.ts'
import { expand } from '../../map/expand.ts'
import { apply, LAYER_NAMES } from '../../map/apply.ts'
import { draft } from '../../map/draft.ts'
import type { CompileReply, CompileRequest, LayerName } from './protocol.ts'

self.onmessage = (e: MessageEvent<CompileRequest>) => {
  const { seq, mapText, kindsText, files } = e.data
  const fail = (path: string, message: string) =>
    (self as unknown as Worker).postMessage({
      seq,
      ok: false,
      issues: [{ id: null, path, message }],
    } satisfies CompileReply)
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
    compile(seq, map, cat, held(files ?? {}))
  } catch (err) {
    fail('', `the compiler failed: ${(err as Error).message} (a bug, or a catalogue the validator does not check)`)
  }
}

// the heightfields this worker holds, by name: the version it was last sent and its bytes, kept across compiles so a
// file is hashed and decoded once (checkFiles remembers the bytes it has read)
const kept = new Map<string, { version: number; bytes: Uint8Array }>()
function held(files: CompileRequest['files']): MapFiles {
  const out: MapFiles = new Map()
  for (const [name, f] of Object.entries(files)) {
    if (f.bytes) kept.set(name, { version: f.version, bytes: new Uint8Array(f.bytes) })
    const k = kept.get(name)
    if (k && k.version === f.version) out.set(name, k.bytes)
  }
  return out
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
  const t2 = performance.now()
  const img = draft(L)
  const t3 = performance.now()
  const layers = Object.fromEntries(LAYER_NAMES.map(n => [n, L[n].buffer as ArrayBuffer])) as Record<
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
    height: L.height.buffer as ArrayBuffer,
    depth: L.depth.buffer as ArrayBuffer,
    layers,
    table: L.table,
    ms: { validate: t1 - t0, apply: t2 - t1, draw: t3 - t2 },
  }
  ;(self as unknown as Worker).postMessage(reply, [reply.rgba, reply.height, reply.depth, ...Object.values(layers)])
}
