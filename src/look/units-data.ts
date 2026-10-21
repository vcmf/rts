// The unit data files (data/figures/<figure>.unitdata, written by tools/bake-figure.py; docs/plans/active/armies-demo.md):
// their decoder and their checks. No Babylon: the tests read it in Node. A figure's clips are named by ROLE (halt,
// march, run, fire: decision 0015, the page never names a clip), each a range of the baked animation's 12 fps steps
export interface UnitRange { start: number; end: number; loop: boolean; clips: string[]; seconds: number; speed: number }   // speed: m/s the root moves at for the feet to stay planted
export interface UnitLod { name: string; vertices: number; triangles: number }
export interface UnitData {
  fps: number; mPerUnit: number; bones: string[]; lods: UnitLod[]; ranges: Record<string, UnitRange>
  palette: string[]   // the colour roles, in order: a vertex's role is an index into it (an army's colours paint it)
  vat: { width: number; height: number; data: Uint16Array }
  mesh: Record<string, { positions: Float32Array; normals: Float32Array; roles: Uint8Array; boneIndices: Uint8Array; boneWeights: Float32Array; indices: Uint16Array }>
}

const TYPES = { float32: Float32Array, uint8: Uint8Array, uint16: Uint16Array } as const

// the file written by tools/bake-figure.py: b'UNIT', u32 version, u32 header length, the JSON header, the buffers
export function decodeUnits(buf: ArrayBuffer): UnitData {
  const dv = new DataView(buf)
  if (String.fromCharCode(...new Uint8Array(buf, 0, 4)) !== 'UNIT') throw new Error('unit data: not a UNIT file')
  const version = dv.getUint32(4, true), hl = dv.getUint32(8, true)
  if (version !== 2) throw new Error(`unit data: version ${version}, this page reads 2 (rebake: tools/bake-figure.py)`)
  const h = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 12, hl))) as {
    fps: number; mPerUnit: number; bones: string[]; lods: UnitLod[]; ranges: Record<string, UnitRange>; palette: string[]
    vat: { width: number; height: number; halfFloat: boolean }; buffers: { name: string; offset: number; bytes: number; type: keyof typeof TYPES }[]
  }
  const base = 12 + hl, arrays = new Map<string, Float32Array | Uint8Array | Uint16Array>()
  for (const b of h.buffers) {
    const T = TYPES[b.type]; if (!T) throw new Error(`unit data: buffer ${b.name} has type ${b.type}`)
    if (base + b.offset + b.bytes > buf.byteLength) throw new Error(`unit data: buffer ${b.name} runs past the end of the file`)
    arrays.set(b.name, new T(buf.slice(base + b.offset, base + b.offset + b.bytes)))
  }
  const get = <K extends Float32Array | Uint8Array | Uint16Array>(name: string, T: { new(...a: never[]): K }): K => {
    const a = arrays.get(name); if (!(a instanceof T)) throw new Error(`unit data: missing or mistyped buffer ${name}`); return a
  }
  const mesh: UnitData['mesh'] = {}
  for (const l of h.lods) mesh[l.name] = {
    positions: get(`${l.name}.positions`, Float32Array), normals: get(`${l.name}.normals`, Float32Array), roles: get(`${l.name}.roles`, Uint8Array),
    boneIndices: get(`${l.name}.boneIndices`, Uint8Array), boneWeights: get(`${l.name}.boneWeights`, Float32Array), indices: get(`${l.name}.indices`, Uint16Array),
  }
  const data: UnitData = { fps: h.fps, mPerUnit: h.mPerUnit, bones: h.bones, lods: h.lods, ranges: h.ranges, palette: h.palette, mesh, vat: { width: h.vat.width, height: h.vat.height, data: get('vat', Uint16Array) } }
  checkUnits(data)
  return data
}

// every size the file states agrees with its buffers; every bone index, colour role and range lies inside its table
export function checkUnits(d: UnitData): void {
  const bad: string[] = [], nb = d.bones.length
  if (d.vat.width !== (nb + 1) * 4) bad.push(`vat width ${d.vat.width} is not (bones + 1) × 4 = ${(nb + 1) * 4}`)
  if (d.vat.data.length !== d.vat.width * d.vat.height * 4) bad.push(`vat holds ${d.vat.data.length} values, not width × height × 4`)
  for (const l of d.lods) {
    const m = d.mesh[l.name], n = l.vertices
    if (m.positions.length !== n * 3 || m.normals.length !== n * 3 || m.roles.length !== n || m.boneIndices.length !== n * 4 || m.boneWeights.length !== n * 4) bad.push(`${l.name}: a vertex buffer is not ${n} vertices long`)
    if (m.indices.length !== l.triangles * 3) bad.push(`${l.name}: ${m.indices.length} indices for ${l.triangles} triangles`)
    for (const i of m.indices) if (i >= n) { bad.push(`${l.name}: index ${i} past ${n} vertices`); break }
    for (const b of m.boneIndices) if (b >= nb) { bad.push(`${l.name}: bone index ${b} past ${nb} bones`); break }
    for (const r of m.roles) if (r >= d.palette.length) { bad.push(`${l.name}: colour role ${r} past the palette's ${d.palette.length}`); break }
    for (let v = 0; v < n; v++) { const s = m.boneWeights[v * 4] + m.boneWeights[v * 4 + 1] + m.boneWeights[v * 4 + 2] + m.boneWeights[v * 4 + 3]; if (Math.abs(s - 1) > 1e-3) { bad.push(`${l.name}: vertex ${v}'s weights sum to ${s}`); break } }
  }
  for (const [k, r] of Object.entries(d.ranges)) if (!(r.start >= 0 && r.end > r.start && r.end < d.vat.height)) bad.push(`range ${k} [${r.start}, ${r.end}] outside the ${d.vat.height} baked steps`)
  if (bad.length) throw new Error('unit data:\n  ' + bad.join('\n  '))
}
