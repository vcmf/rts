// The unit data files (data/figures/<figure>.unitdata, written by tools/bake-figure.py; docs/plans/active/armies-demo.md):
// their decoder and their checks. No Babylon: the tests read it in Node. A figure's clips are named by ROLE (halt,
// march, run, fire: decision 0015, the page never names a clip), each a range of the baked animation's 12 fps steps
export interface UnitRange { start: number; end: number; loop: boolean; clips: string[]; seconds: number; speed: number }   // speed: m/s the root moves at for the feet to stay planted
export interface UnitLod { name: string; vertices: number; triangles: number }
export interface UnitData {
  fps: number; mPerUnit: number; bones: string[]
  lods: UnitLod[]   // nearest first, each lighter than the one before (the page draws the last far, the one before it near, a first of three nearest)
  ranges: Record<string, UnitRange>
  palette: string[]   // the colour roles, in order: a vertex's role is an index into it (an army's colours paint it)
  vat: { width: number; height: number; data: Uint16Array }
  mesh: Record<string, { positions: Float32Array; normals: Float32Array; roles: Uint8Array; boneIndices: Uint8Array; boneWeights: Float32Array; indices: Uint16Array }>
}

/** a mesh skinned to the figure's bones (a LOD's, or the shadow proxy's) */
export interface SkinnedMesh { positions: Float32Array; normals: Float32Array; boneIndices: Uint8Array; boneWeights: Float32Array; indices: Uint16Array }

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
  d.lods.forEach((l, i) => { if (i > 0 && !(l.triangles < d.lods[i - 1].triangles)) bad.push(`${l.name}: not lighter than ${d.lods[i - 1].name} (the LODs nearest first)`) })
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

// a half float (IEEE 754 binary16, as the bake writes the animation) as a number
export function fromHalf(h: number): number {
  const s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 0x1f, m = h & 0x3ff
  return e === 0 ? s * m * 2 ** -24 : e === 31 ? (m ? NaN : s * Infinity) : s * (1 + m / 1024) * 2 ** (e - 15)
}

/** a LOD's every vertex posed at every baked step (batch B, ?uvat): skinned here once, at load, from the baked bone
 *  matrices exactly as units.vert skins them, so the far LOD and the shadow pass read a vertex's place and normal (two
 *  texels) instead of four bone matrices (sixteen). RGBA float32, width 2 × vertices (place, then normal), one row a
 *  step; the place and the normal in the figure's own frame, as the skinned ones */
export function posedVertices(d: UnitData, lod: string): { width: number; height: number; data: Float32Array } { return posedMesh(d, d.mesh[lod]) }
/** a skinned mesh's vertices posed at every baked step (posedVertices' layout) */
export function posedMesh(d: UnitData, m: SkinnedMesh): { width: number; height: number; data: Float32Array } {
  const nv = m.positions.length / 3, rows = d.vat.height, W = d.vat.width, src = d.vat.data
  const out = new Float32Array(nv * 2 * rows * 4), sk = new Float64Array(16)
  for (let f = 0; f < rows; f++) for (let v = 0; v < nv; v++) {
    sk.fill(0)
    for (let i = 0; i < 4; i++) {
      const w = m.boneWeights[v * 4 + i]; if (w === 0) continue
      const o = (f * W + m.boneIndices[v * 4 + i] * 4) * 4   // the bone's four texels: its matrix, column by column
      for (let c = 0; c < 16; c++) sk[c] += fromHalf(src[o + c]) * w
    }
    const x = m.positions[v * 3], y = m.positions[v * 3 + 1], z = m.positions[v * 3 + 2]
    const nx = m.normals[v * 3], ny = m.normals[v * 3 + 1], nz = m.normals[v * 3 + 2], o = (f * nv * 2 + v * 2) * 4
    for (let r = 0; r < 3; r++) {
      out[o + r] = sk[r] * x + sk[4 + r] * y + sk[8 + r] * z + sk[12 + r]
      out[o + 4 + r] = sk[r] * nx + sk[4 + r] * ny + sk[8 + r] * nz
    }
    out[o + 3] = 1
  }
  return { width: nv * 2, height: rows, data: out }
}

/** the figure's shadow caster (the shadow fix, docs/plans/active/armies-demo.md): built at load from a LOD, a pair of
 *  crossed quads for each bone that carries at least minVerts of its vertices (by their heaviest weight) over minLen m
 *  long, along the
 *  part's long axis (its vertices' principal axis, end to end) and as wide as most of it (the 85th percentile of their
 *  distance from the axis, either way), each quad's four corners skinned wholly to the bone. Two crossed quads cast a
 *  part's shadow from any side of the sun; four triangles a part, drawn both sides. No era names: the parts are
 *  wherever the figure's own weights put them */
export function shadowProxy(d: UnitData, lod: string, minVerts = 8, minLen = 0.14): SkinnedMesh {
  const m = d.mesh[lod], nv = m.positions.length / 3, groups = new Map<number, number[]>()
  for (let v = 0; v < nv; v++) {
    let bi = 0; for (let i = 1; i < 4; i++) if (m.boneWeights[v * 4 + i] > m.boneWeights[v * 4 + bi]) bi = i
    const b = m.boneIndices[v * 4 + bi], g = groups.get(b); if (g) g.push(v); else groups.set(b, [v])
  }
  const pos: number[] = [], nor: number[] = [], bones: number[] = [], idx: number[] = []
  const P = (v: number, k: number) => m.positions[v * 3 + k]
  for (const [b, vs] of [...groups].sort((x, y) => x[0] - y[0])) {
    if (vs.length < minVerts) continue
    const c = [0, 1, 2].map(k => vs.reduce((a, v) => a + P(v, k), 0) / vs.length)
    const cov = [0, 1, 2].map(i => [0, 1, 2].map(j => vs.reduce((a, v) => a + (P(v, i) - c[i]) * (P(v, j) - c[j]), 0) / vs.length))
    let ax = [0.3, 1, 0.2]   // the principal axis, by power iteration
    for (let it = 0; it < 32; it++) { const n = [0, 1, 2].map(i => cov[i][0] * ax[0] + cov[i][1] * ax[1] + cov[i][2] * ax[2]), l = Math.hypot(...n) || 1; ax = n.map(x => x / l) }
    const cross = (p: number[], q: number[]) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]]
    const ref = Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], u0 = cross(ax, ref), lu = Math.hypot(...u0), u = u0.map(x => x / lu), w = cross(ax, u)
    const proj = (v: number, a: number[]) => (P(v, 0) - c[0]) * a[0] + (P(v, 1) - c[1]) * a[1] + (P(v, 2) - c[2]) * a[2]
    const t = vs.map(v => proj(v, ax)), t0 = Math.min(...t), t1 = Math.max(...t)
    if (t1 - t0 < minLen) continue   // (a hand, a foot: under a texel of the map's at the default zoom)
    const half = (a: number[]) => { const q = vs.map(v => Math.abs(proj(v, a))).sort((x, y) => x - y); return Math.max(0.02, q[Math.floor(0.85 * (q.length - 1))]) }
    for (const [side, n] of [[u, w], [w, u]] as const) {
      const h = half(side), base = pos.length / 3
      for (const [tt, ss] of [[t0, -h], [t0, h], [t1, h], [t1, -h]]) { for (let k = 0; k < 3; k++) { pos.push(c[k] + ax[k] * tt + side[k] * ss); nor.push(n[k]) } bones.push(b) }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
    }
  }
  const n = pos.length / 3, bi = new Uint8Array(n * 4), bw = new Float32Array(n * 4)
  for (let v = 0; v < n; v++) { bi[v * 4] = bones[v]; bw[v * 4] = 1 }
  return { positions: Float32Array.from(pos), normals: Float32Array.from(nor), boneIndices: bi, boneWeights: bw, indices: Uint16Array.from(idx) }
}
