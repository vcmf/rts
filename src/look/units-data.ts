// The unit data files (data/figures/<figure>.unitdata, written by tools/bake-figure.py;
// docs/plans/active/armies-demo.md): their decoder and their checks. No Babylon: the tests read it in Node. A figure's
// clips are named by ROLE (halt, march, run, fire: decision 0015, the page never names a clip), each a range of the
// baked animation's 12 fps steps
export interface UnitRange {
  start: number
  end: number
  loop: boolean
  clips: string[]
  seconds: number
  // speed: m/s the root moves at for the feet to stay planted
  speed: number
}
export interface UnitLod {
  name: string
  vertices: number
  triangles: number
}
/** the unit data format this page reads: 3, the triangles wound for Babylon (clockwise fronts) and the bones' parents;
 *  2's were wound inside out (#164) */
export const UNIT_VERSION = 3
export interface UnitData {
  version: number
  fps: number
  mPerUnit: number
  bones: string[]
  parents: number[] // each bone's parent (its nearest deforming ancestor), -1 for a root
  // nearest first, each lighter than the one before (the page draws the last far, the one before it near, a first of
  // three nearest)
  lods: UnitLod[]
  ranges: Record<string, UnitRange>
  palette: string[] // the colour roles, in order: a vertex's role is an index into it (an army's colours paint it)
  vat: { width: number; height: number; data: Uint16Array }
  mesh: Record<
    string,
    {
      positions: Float32Array
      normals: Float32Array
      roles: Uint8Array
      boneIndices: Uint8Array
      boneWeights: Float32Array
      indices: Uint16Array
    }
  >
}

/** a mesh skinned to the figure's bones (a LOD's, or the shadow proxy's) */
export interface SkinnedMesh {
  positions: Float32Array
  normals: Float32Array
  boneIndices: Uint8Array
  boneWeights: Float32Array
  indices: Uint16Array
}

const TYPES = { float32: Float32Array, uint8: Uint8Array, uint16: Uint16Array } as const

// the file written by tools/bake-figure.py: b'UNIT', u32 version, u32 header length, the JSON header, the buffers
export function decodeUnits(buf: ArrayBuffer): UnitData {
  const dv = new DataView(buf)
  if (String.fromCharCode(...new Uint8Array(buf, 0, 4)) !== 'UNIT') throw new Error('unit data: not a UNIT file')
  const version = dv.getUint32(4, true)
  const hl = dv.getUint32(8, true)
  if (version !== UNIT_VERSION) throw new Error(versionError(version))
  const h = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 12, hl))) as {
    fps: number
    mPerUnit: number
    bones: string[]
    parents: number[]
    lods: UnitLod[]
    ranges: Record<string, UnitRange>
    palette: string[]
    vat: { width: number; height: number; halfFloat: boolean }
    buffers: { name: string; offset: number; bytes: number; type: keyof typeof TYPES }[]
  }
  const base = 12 + hl
  const arrays = new Map<string, Float32Array | Uint8Array | Uint16Array>()
  for (const b of h.buffers) {
    const T = TYPES[b.type]
    if (!T) throw new Error(`unit data: buffer ${b.name} has type ${b.type}`)
    if (base + b.offset + b.bytes > buf.byteLength) {
      throw new Error(`unit data: buffer ${b.name} runs past the end of the file`)
    }
    arrays.set(b.name, new T(buf.slice(base + b.offset, base + b.offset + b.bytes)))
  }
  const get = <K extends Float32Array | Uint8Array | Uint16Array>(name: string, T: { new (...a: never[]): K }): K => {
    const a = arrays.get(name)
    if (!(a instanceof T)) throw new Error(`unit data: missing or mistyped buffer ${name}`)
    return a
  }
  const mesh: UnitData['mesh'] = {}
  for (const l of h.lods) {
    mesh[l.name] = {
      positions: get(`${l.name}.positions`, Float32Array),
      normals: get(`${l.name}.normals`, Float32Array),
      roles: get(`${l.name}.roles`, Uint8Array),
      boneIndices: get(`${l.name}.boneIndices`, Uint8Array),
      boneWeights: get(`${l.name}.boneWeights`, Float32Array),
      indices: get(`${l.name}.indices`, Uint16Array),
    }
  }
  const data: UnitData = {
    version,
    fps: h.fps,
    mPerUnit: h.mPerUnit,
    bones: h.bones,
    parents: h.parents,
    lods: h.lods,
    ranges: h.ranges,
    palette: h.palette,
    mesh,
    vat: { width: h.vat.width, height: h.vat.height, data: get('vat', Uint16Array) },
  }
  checkUnits(data)
  return data
}

const versionError = (v: number) =>
  `unit data: version ${v}, this page reads ${UNIT_VERSION}` +
  (v === 2 ? ' (version 2 was wound inside out, #164)' : '') +
  ': rebake it with tools/bake-figure.py'

// every size the file states agrees with its buffers; every bone index, colour role and range lies inside its table
export function checkUnits(d: UnitData): void {
  if (d.version !== UNIT_VERSION) throw new Error(versionError(d.version))
  const bad: string[] = []
  const nb = d.bones.length
  if (d.parents?.length !== nb || d.parents.some((p, i) => p < -1 || p >= nb || p === i)) {
    bad.push(`the bones' parents are not ${nb} bone indices (or -1)`)
  }
  if (d.vat.width !== (nb + 1) * 4) bad.push(`vat width ${d.vat.width} is not (bones + 1) × 4 = ${(nb + 1) * 4}`)
  if (d.vat.data.length !== d.vat.width * d.vat.height * 4) {
    bad.push(`vat holds ${d.vat.data.length} values, not width × height × 4`)
  }
  d.lods.forEach((l, i) => {
    if (i > 0 && !(l.triangles < d.lods[i - 1].triangles)) {
      bad.push(`${l.name}: not lighter than ${d.lods[i - 1].name} (the LODs nearest first)`)
    }
  })
  for (const l of d.lods) {
    const m = d.mesh[l.name]
    const n = l.vertices
    if (
      m.positions.length !== n * 3 ||
      m.normals.length !== n * 3 ||
      m.roles.length !== n ||
      m.boneIndices.length !== n * 4 ||
      m.boneWeights.length !== n * 4
    ) {
      bad.push(`${l.name}: a vertex buffer is not ${n} vertices long`)
    }
    if (m.indices.length !== l.triangles * 3) {
      bad.push(`${l.name}: ${m.indices.length} indices for ${l.triangles} triangles`)
    }
    for (const i of m.indices) {
      if (i >= n) {
        bad.push(`${l.name}: index ${i} past ${n} vertices`)
        break
      }
    }
    for (const b of m.boneIndices) {
      if (b >= nb) {
        bad.push(`${l.name}: bone index ${b} past ${nb} bones`)
        break
      }
    }
    for (const r of m.roles) {
      if (r >= d.palette.length) {
        bad.push(`${l.name}: colour role ${r} past the palette's ${d.palette.length}`)
        break
      }
    }
    for (let v = 0; v < n; v++) {
      const s = m.boneWeights[v * 4] + m.boneWeights[v * 4 + 1] + m.boneWeights[v * 4 + 2] + m.boneWeights[v * 4 + 3]
      if (Math.abs(s - 1) > 1e-3) {
        bad.push(`${l.name}: vertex ${v}'s weights sum to ${s}`)
        break
      }
    }
  }
  for (const [k, r] of Object.entries(d.ranges)) {
    if (!(r.start >= 0 && r.end > r.start && r.end < d.vat.height)) {
      bad.push(`range ${k} [${r.start}, ${r.end}] outside the ${d.vat.height} baked steps`)
    }
  }
  if (bad.length) throw new Error('unit data:\n  ' + bad.join('\n  '))
}

// a half float (IEEE 754 binary16, as the bake writes the animation) as a number
export function fromHalf(h: number): number {
  const s = h & 0x8000 ? -1 : 1
  const e = (h >> 10) & 0x1f
  const m = h & 0x3ff
  return e === 0 ? s * m * 2 ** -24 : e === 31 ? (m ? NaN : s * Infinity) : s * (1 + m / 1024) * 2 ** (e - 15)
}

/** a LOD's every vertex posed at every baked step (batch B, ?uvat): skinned here once, at load, from the baked bone
 *  matrices exactly as units.vert skins them, so the far LOD and the shadow pass read a vertex's place and normal (two
 *  texels) instead of four bone matrices (sixteen). RGBA float32, width 2 × vertices (place, then normal), one row a
 *  step; the place and the normal in the figure's own frame, as the skinned ones */
export function posedVertices(d: UnitData, lod: string): { width: number; height: number; data: Float32Array } {
  return posedMesh(d, d.mesh[lod])
}
/** a skinned mesh's vertices posed at every baked step (posedVertices' layout) */
export function posedMesh(d: UnitData, m: SkinnedMesh): { width: number; height: number; data: Float32Array } {
  const nv = m.positions.length / 3
  const rows = d.vat.height
  const W = d.vat.width
  const src = d.vat.data
  const out = new Float32Array(nv * 2 * rows * 4)
  const sk = new Float64Array(16)
  for (let f = 0; f < rows; f++) {
    for (let v = 0; v < nv; v++) {
      sk.fill(0)
      for (let i = 0; i < 4; i++) {
        const w = m.boneWeights[v * 4 + i]
        if (w === 0) continue
        const o = (f * W + m.boneIndices[v * 4 + i] * 4) * 4 // the bone's four texels: its matrix, column by column
        for (let c = 0; c < 16; c++) sk[c] += fromHalf(src[o + c]) * w
      }
      const x = m.positions[v * 3]
      const y = m.positions[v * 3 + 1]
      const z = m.positions[v * 3 + 2]
      const nx = m.normals[v * 3]
      const ny = m.normals[v * 3 + 1]
      const nz = m.normals[v * 3 + 2]
      const o = (f * nv * 2 + v * 2) * 4
      for (let r = 0; r < 3; r++) {
        out[o + r] = sk[r] * x + sk[4 + r] * y + sk[8 + r] * z + sk[12 + r]
        out[o + 4 + r] = sk[r] * nx + sk[4 + r] * ny + sk[8 + r] * nz
      }
      out[o + 3] = 1
    }
  }
  return { width: nv * 2, height: rows, data: out }
}

/** a figure's parts (the shadow proxy's and the tiny LOD's): each bone that carries at least minVerts of a LOD's
 *  vertices (by their heaviest weight) over minLen m long, along the part's long axis (its vertices' principal axis,
 *  end to end, t0 to t1 from its centre c) and as wide as most of it (the 85th percentile of their distance from the
 *  axis, along u and along w). No era names: the parts are wherever the figure's own weights put them.
 *  The figure's contact with the ground (#165): a bone too small to be a part (a foot, its toes) whose vertices come
 *  within `contact` m of the figure's lowest point lends them to the part up its chain of parents (through other
 *  small bones: the toes to the foot to the shin), whose axis then runs on to them (t0, t1; not its width) by at most
 *  `reach` m (a hem or a scabbard hung from the hips does not stretch the hips to the ground): the parts reach the
 *  ground where the figure stands, so the shadow proxy's shadow starts at the soles, not at the ankles 13 cm up */
export interface Part {
  bone: number
  vs: number[]
  c: number[]
  ax: number[]
  u: number[]
  w: number[]
  t0: number
  t1: number
  hu: number
  hw: number
  lent: number[] // the small bones' vertices lent to it at the ground (their colour the tiny LOD's too)
}
export function boneParts(d: UnitData, lod: string, minVerts = 8, minLen = 0.14, contact = 0.15, reach = 0.25): Part[] {
  const m = d.mesh[lod]
  const nv = m.positions.length / 3
  const groups = new Map<number, number[]>()
  for (let v = 0; v < nv; v++) {
    let bi = 0
    for (let i = 1; i < 4; i++) if (m.boneWeights[v * 4 + i] > m.boneWeights[v * 4 + bi]) bi = i
    const b = m.boneIndices[v * 4 + bi]
    const g = groups.get(b)
    if (g) g.push(v)
    else groups.set(b, [v])
  }
  const P = (v: number, k: number) => m.positions[v * 3 + k]
  const out: Part[] = []
  for (const [b, vs] of [...groups].sort((x, y) => x[0] - y[0])) {
    if (vs.length < minVerts) continue
    const c = [0, 1, 2].map(k => vs.reduce((a, v) => a + P(v, k), 0) / vs.length)
    const cov = [0, 1, 2].map(i =>
      [0, 1, 2].map(j => vs.reduce((a, v) => a + (P(v, i) - c[i]) * (P(v, j) - c[j]), 0) / vs.length),
    )
    let ax = [0.3, 1, 0.2] // the principal axis, by power iteration
    for (let it = 0; it < 32; it++) {
      const n = [0, 1, 2].map(i => cov[i][0] * ax[0] + cov[i][1] * ax[1] + cov[i][2] * ax[2])
      const l = Math.hypot(...n) || 1
      ax = n.map(x => x / l)
    }
    const cross = (p: number[], q: number[]) => [
      p[1] * q[2] - p[2] * q[1],
      p[2] * q[0] - p[0] * q[2],
      p[0] * q[1] - p[1] * q[0],
    ]
    const ref = Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]
    const u0 = cross(ax, ref)
    const lu = Math.hypot(...u0)
    const u = u0.map(x => x / lu)
    const w = cross(ax, u)
    const proj = (v: number, a: number[]) => (P(v, 0) - c[0]) * a[0] + (P(v, 1) - c[1]) * a[1] + (P(v, 2) - c[2]) * a[2]
    const t = vs.map(v => proj(v, ax))
    const t0 = Math.min(...t)
    const t1 = Math.max(...t)
    if (t1 - t0 < minLen) continue // (a hand, a foot: under a texel of the map's at the default zoom)
    const half = (a: number[]) => {
      const q = vs.map(v => Math.abs(proj(v, a))).sort((x, y) => x - y)
      return Math.max(0.02, q[Math.floor(0.85 * (q.length - 1))])
    }
    out.push({ bone: b, vs, c, ax, u, w, t0, t1, hu: half(u), hw: half(w), lent: [] })
  }
  // the ground contact: each left-out bone with a vertex within `contact` of the lowest, lent to its part (#165)
  let lowest = Infinity
  for (let v = 0; v < nv; v++) lowest = Math.min(lowest, P(v, 1))
  const partOf = new Map(out.map(p => [p.bone, p]))
  for (const [b, vs] of groups) {
    if (partOf.has(b) || !vs.some(v => P(v, 1) < lowest + contact)) continue
    // up its chain, through other left-out bones, to the first that is a part
    let a = d.parents[b]
    while (a >= 0 && !partOf.has(a)) a = d.parents[a]
    const p = partOf.get(a)
    if (!p) {
      console.warn(`unit data: ${d.bones[b]} touches the ground but no part is up its chain; its shadow is left out`)
      continue
    }
    const ts = vs.map(v => (P(v, 0) - p.c[0]) * p.ax[0] + (P(v, 1) - p.c[1]) * p.ax[1] + (P(v, 2) - p.c[2]) * p.ax[2])
    const t0 = Math.min(p.t0, ...ts)
    const t1 = Math.max(p.t1, ...ts)
    // a foot under a shin, not a hem or a scabbard hung from the hips: the axis runs on by at most `reach`
    if (p.t0 - t0 + (t1 - p.t1) > reach) continue
    p.t0 = t0
    p.t1 = t1
    p.lent.push(...vs)
  }
  return out
}

/** the figure's shadow caster (the shadow fix, docs/plans/active/armies-demo.md): built at load from a LOD's parts
 *  (boneParts), a pair of crossed quads a part, each quad's four corners skinned wholly to the part's bone. Two crossed
 *  quads cast a part's shadow from any side of the sun; four triangles a part, drawn both sides */
export function shadowProxy(d: UnitData, lod: string, minVerts = 8, minLen = 0.14): SkinnedMesh {
  const pos: number[] = []
  const nor: number[] = []
  const bones: number[] = []
  const idx: number[] = []
  for (const { bone: b, c, ax, u, w, t0, t1, hu, hw } of boneParts(d, lod, minVerts, minLen)) {
    for (const [side, n, h] of [
      [u, w, hu],
      [w, u, hw],
    ] as const) {
      const base = pos.length / 3
      for (const [tt, ss] of [
        [t0, -h],
        [t0, h],
        [t1, h],
        [t1, -h],
      ]) {
        for (let k = 0; k < 3; k++) {
          pos.push(c[k] + ax[k] * tt + side[k] * ss)
          nor.push(n[k])
        }
        bones.push(b)
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
    }
  }
  return skinned(pos, nor, bones, idx)
}
function skinned(pos: number[], nor: number[], bones: number[], idx: number[]): SkinnedMesh {
  const n = pos.length / 3
  const bi = new Uint8Array(n * 4)
  const bw = new Float32Array(n * 4)
  for (let v = 0; v < n; v++) {
    bi[v * 4] = bones[v]
    bw[v * 4] = 1
  }
  return {
    positions: Float32Array.from(pos),
    normals: Float32Array.from(nor),
    boneIndices: bi,
    boneWeights: bw,
    indices: Uint16Array.from(idx),
  }
}

// a mesh as seen by `views` orthographic cameras `elev` above the horizon round the figure (its rest pose, a res²
// depth buffer each): calls hit(triangle, its barycentric weights) for each pixel's nearest triangle
function rasterSeen(
  pos: Float32Array,
  idx: Uint16Array,
  hit: (t: number, w0: number, w1: number, w2: number) => void,
  elev = 0.87,
  views = 8,
  res = 96,
): void {
  const nv = pos.length / 3
  const nt = idx.length / 3
  const depth = new Float64Array(res * res)
  const id = new Int32Array(res * res)
  const bw = new Float64Array(res * res * 2)
  const px = new Float64Array(nv * 3)
  for (let k = 0; k < views; k++) {
    const az = ((k + 0.5) / views) * 2 * Math.PI
    const ce = Math.cos(elev)
    const se = Math.sin(elev)
    // the view, its right
    const f = [-ce * Math.sin(az), -se, -ce * Math.cos(az)]
    const r = [Math.cos(az), 0, -Math.sin(az)]
    const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]] // and its up
    for (let v = 0; v < nv; v++) {
      const x = pos[v * 3]
      const y = pos[v * 3 + 1]
      const z = pos[v * 3 + 2]
      // (a fixed scale, 3 m across the buffer centred on the figure's root: every mesh of a figure on the same pixels)
      px[v * 3] = ((x * r[0] + y * r[1] + z * r[2] + 1.5) / 3) * res
      px[v * 3 + 1] = ((x * u[0] + y * u[1] + z * u[2] + 1.5) / 3) * res
      px[v * 3 + 2] = x * f[0] + y * f[1] + z * f[2]
    }
    depth.fill(Infinity)
    id.fill(-1)
    for (let t = 0; t < nt; t++) {
      const a = idx[t * 3] * 3
      const b = idx[t * 3 + 1] * 3
      const c = idx[t * 3 + 2] * 3
      const area = (px[b] - px[a]) * (px[c + 1] - px[a + 1]) - (px[c] - px[a]) * (px[b + 1] - px[a + 1])
      if (Math.abs(area) < 1e-12) continue
      const bx0 = Math.max(0, Math.floor(Math.min(px[a], px[b], px[c])))
      const bx1 = Math.min(res - 1, Math.ceil(Math.max(px[a], px[b], px[c])))
      const by0 = Math.max(0, Math.floor(Math.min(px[a + 1], px[b + 1], px[c + 1])))
      const by1 = Math.min(res - 1, Math.ceil(Math.max(px[a + 1], px[b + 1], px[c + 1])))
      for (let y = by0; y <= by1; y++) {
        for (let x = bx0; x <= bx1; x++) {
          const qx = x + 0.5
          const qy = y + 0.5
          const w0 = ((px[b] - qx) * (px[c + 1] - qy) - (px[c] - qx) * (px[b + 1] - qy)) / area
          const w1 = ((px[c] - qx) * (px[a + 1] - qy) - (px[a] - qx) * (px[c + 1] - qy)) / area
          if (w0 < 0 || w1 < 0 || w0 + w1 > 1) continue
          const zz = w0 * px[a + 2] + w1 * px[b + 2] + (1 - w0 - w1) * px[c + 2]
          const i = y * res + x
          if (zz < depth[i]) {
            depth[i] = zz
            id[i] = t
            bw[i * 2] = w0
            bw[i * 2 + 1] = w1
          }
        }
      }
    }
    for (let i = 0; i < res * res; i++) {
      if (id[i] >= 0) hit(id[i], bw[i * 2], bw[i * 2 + 1], 1 - bw[i * 2] - bw[i * 2 + 1])
    }
  }
}
/** each triangle of a LOD's mesh as seen: the pixels it covers from round the figure (rasterSeen), so what the figure
 *  hides (the insides of its arms, its undersides, what the pack covers) counts for nothing */
export function seenArea(d: UnitData, lod: string, elev = 0.87): Float64Array {
  const m = d.mesh[lod]
  const out = new Float64Array(m.indices.length / 3)
  rasterSeen(
    m.positions,
    m.indices,
    t => {
      out[t]++
    },
    elev,
  )
  return out
}

/** the tiny LOD's colour weights a vertex: one a colour role, up to this many roles (three vec4 attributes) */
export const TINY_ROLES = 12
/** the tiny LOD (docs/plans/active/armies-32k.md, step 3): a LOD's parts (boneParts) as boxes, eight corners each
 *  shared by its faces (their normals from the box's centre), each corner skinned wholly to the part's bone,
 *  wound with their fronts out (Babylon's clockwise: a front's right-hand normal into the box, as the bake's figure,
 *  #164). A corner's colour is a mix of the roles (`weights`, TINY_ROLES a vertex, summing to 1): their shares
 *  of its eighth of the part as a camera `elev` above the horizon sees it from round the figure (seenArea: what the
 *  figure hides counts for nothing), with `own` of the whole part's shares, so a box reads as the mean colour of what
 *  it stands for (a single role spread over a box's face reads louder than on the figure); then `figure` of the whole
 *  figure's seen colour mixed in, and calibrated (`calibrate` rounds) so the boxes' seen pixels hold each role in the
 *  far LOD's share. `roles` is the corner's largest (the masks' coat role). About a fifth of the far LOD's vertices:
 *  the wide view pays a vertex's posing for every vertex of every figure */
export function tinyMesh(
  d: UnitData,
  lod: string,
  minVerts = 8,
  minLen = 0.14,
  elev = 0.87,
  own = 0.25,
  figure = 0.35,
  calibrate = 4,
): SkinnedMesh & { roles: Uint8Array; weights: Float32Array } {
  const NR = d.palette.length
  if (NR > TINY_ROLES) throw new Error(`unit data: ${NR} colour roles, the tiny LOD mixes at most ${TINY_ROLES}`)
  const m = d.mesh[lod]
  const pos: number[] = []
  const nor: number[] = []
  const bones: number[] = []
  const idx: number[] = []
  const roles: number[] = []
  const weights: number[] = []
  const parts = boneParts(d, lod, minVerts, minLen)
  const partOf = new Map<number, number>()
  parts.forEach((p, i) => {
    for (const v of [...p.vs, ...p.lent]) partOf.set(v, i) // (the lent feet too: the shin box's foot takes the shoes)
  })
  // each part's area by role and eighth (index 8: the whole part), seen from above: a triangle's role is its first
  // vertex's (the bake splits by role), its eighth its centroid's side of the part's axis, u and w
  const area = parts.map(() => new Float64Array(9 * NR))
  const P = (v: number, k: number) => m.positions[v * 3 + k]
  const seen = seenArea(d, lod, elev)
  for (let t = 0; t < m.indices.length; t += 3) {
    const [a, b, c] = [m.indices[t], m.indices[t + 1], m.indices[t + 2]]
    const pi = partOf.get(a)
    if (pi === undefined) continue
    const q = parts[pi]
    const g = [0, 1, 2].map(k => (P(a, k) + P(b, k) + P(c, k)) / 3 - q.c[k])
    const dot = (x: number[]) => g[0] * x[0] + g[1] * x[1] + g[2] * x[2]
    const oct = (dot(q.ax) > (q.t0 + q.t1) / 2 ? 1 : 0) + (dot(q.u) > 0 ? 2 : 0) + (dot(q.w) > 0 ? 4 : 0)
    const wgt = seen[t / 3] // (its pixels as seen from round the figure: seenArea)
    area[pi][oct * NR + m.roles[a]] += wgt
    area[pi][8 * NR + m.roles[a]] += wgt
  }
  const shares = (a: Float64Array, o: number) => {
    let all = 0
    for (let i = 0; i < NR; i++) all += a[o * NR + i]
    return Array.from({ length: NR }, (_, i) => (all > 0 ? a[o * NR + i] / all : 0))
  }
  // the faces by corner (corner k: bit 0 the axis's end, bit 1 u's side, bit 2 w's side)
  const FACES = [
    [0, 2, 6, 4],
    [1, 5, 7, 3],
    [0, 4, 5, 1],
    [2, 3, 7, 6],
    [0, 1, 3, 2],
    [4, 6, 7, 5],
  ]
  parts.forEach(({ bone: b, c, ax, u, w, t0, t1, hu, hw }, pi) => {
    const base = pos.length / 3
    const mid = (t0 + t1) / 2
    const cs: number[][] = []
    const whole = shares(area[pi], 8)
    for (let k = 0; k < 8; k++) {
      const tt = k & 1 ? t1 : t0
      const su = k & 2 ? hu : -hu
      const sw = k & 4 ? hw : -hw
      const p = [0, 1, 2].map(i => c[i] + ax[i] * tt + u[i] * su + w[i] * sw)
      const o = [0, 1, 2].map(i => ax[i] * (tt - mid) + u[i] * su + w[i] * sw)
      const l = Math.hypot(...o) || 1
      const oc = shares(area[pi], k)
      const has = oc.some(x => x > 0)
      const mix = whole.map((x, i) => (has ? (1 - own) * oc[i] + own * x : x))
      cs.push(p)
      pos.push(...p)
      nor.push(...o.map(x => x / l))
      bones.push(b)
      roles.push(mix.indexOf(Math.max(...mix)))
      for (let i = 0; i < TINY_ROLES; i++) weights.push(mix[i] ?? 0)
    }
    const centre = [0, 1, 2].map(i => c[i] + ax[i] * mid)
    for (const f of FACES) {
      // its front outward, for Babylon (left-handed, clockwise fronts): the face's right-hand normal toward the box's
      // centre, else turned
      const [a, bb, cc] = f.map(k => cs[k])
      const e1 = [0, 1, 2].map(i => bb[i] - a[i])
      const e2 = [0, 1, 2].map(i => cc[i] - a[i])
      const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]
      const out = n[0] * (a[0] - centre[0]) + n[1] * (a[1] - centre[1]) + n[2] * (a[2] - centre[2]) > 0
      const q = out ? [f[0], f[3], f[2], f[1]] : f
      idx.push(base + q[0], base + q[1], base + q[2], base + q[0], base + q[2], base + q[3])
    }
  })
  // calibrated: each role's weights scaled by its share of the far LOD's pixels over its share of the boxes' (the
  // boxes' silhouettes are not the parts': a musket's box shows more wood than the musket), each corner's renormalised
  const W = Float32Array.from(weights)
  const P32 = Float32Array.from(pos)
  const I16 = Uint16Array.from(idx)
  const want = new Float64Array(NR)
  // (the far LOD's seen pixels by role)
  seen.forEach((px, t) => {
    want[m.roles[m.indices[t * 3]]] += px
  })
  // (a share of the figure's whole seen colour in every corner first: a box of one role, the musket's, could not move)
  const sw0 = want.reduce((x, y) => x + y, 0)
  for (let v = 0; v < W.length / TINY_ROLES; v++) {
    for (let i = 0; i < NR; i++) W[v * TINY_ROLES + i] = (1 - figure) * W[v * TINY_ROLES + i] + (figure * want[i]) / sw0
  }
  for (let it = 0; it < calibrate; it++) {
    const got = new Float64Array(NR)
    rasterSeen(
      P32,
      I16,
      (t, w0, w1, w2) => {
        const a = I16[t * 3] * TINY_ROLES
        const b = I16[t * 3 + 1] * TINY_ROLES
        const c = I16[t * 3 + 2] * TINY_ROLES
        for (let i = 0; i < NR; i++) got[i] += w0 * W[a + i] + w1 * W[b + i] + w2 * W[c + i]
      },
      elev,
    )
    const sw = want.reduce((x, y) => x + y, 0)
    const sg = got.reduce((x, y) => x + y, 0)
    const k = Array.from(want, (x, i) => (got[i] > 0 ? x / sw / (got[i] / sg) : 1))
    for (let v = 0; v < W.length / TINY_ROLES; v++) {
      let s2 = 0
      for (let i = 0; i < NR; i++) {
        W[v * TINY_ROLES + i] *= k[i]
        s2 += W[v * TINY_ROLES + i]
      }
      for (let i = 0; i < NR; i++) W[v * TINY_ROLES + i] /= s2 || 1
    }
  }
  for (let v = 0; v < roles.length; v++) {
    let bi = 0
    for (let i = 1; i < NR; i++) if (W[v * TINY_ROLES + i] > W[v * TINY_ROLES + bi]) bi = i
    roles[v] = bi
  }
  return { ...skinned(pos, nor, bones, idx), roles: Uint8Array.from(roles), weights: W }
}

/** the simple shadow's shape (decision 0049): an atlas, a cell a facing (columns) and a role (rows), R8 */
export interface ShadowShape {
  width: number
  height: number
  data: Uint8Array
  channels: 1 | 2 // 2 with a soft bake: R the shape, G the same blurred by `soft` (interleaved)
  facings: number
  roles: string[]
  // a cell's texels across and along the shadow, its empty border (texels)
  cellW: number
  cellH: number
  margin: number
  texel: number // m a texel
  // m: what a cell holds, from the man's root (the shadow's frame)
  across: [number, number]
  along: [number, number]
  // m: the box the shape alone fills (its own blur's reach), inside across and along (the soft bake's reach on top,
  // whole blocks of 8 texels): the far strip's (decalStrip, src/look/shadow-look.ts), decision 0049's own
  base: { across: [number, number]; along: [number, number] }
  dir: [number, number] // the shadow's direction on the ground (x, z): away from the sun
  // the step bins (?ushstep, docs/plans/done/step-shadows.md): a role's bins (1 each: today's averaged shape) and
  // its first cell row; the rows stacked in blocks of rowsPerBlock, side by side (stepAtlasLayout)
  bins: number[]
  binRow: number[]
  rowsPerBlock: number
  blocks: number
}

/** A man's step in his n-step clip (first step start) as units.vert poses him, from the shader's mod m (in [0, n]:
 *  a GPU's mod can return n itself): ⌊start + m⌋ − start (units.vert's int(), in float32), the exact n wrapped to 0,
 *  clamped into [0, n − 1] (unitdecal.vert mirrors it). His shadow's step is so his figure's on every GPU */
export function stepIndex(start: number, m: number, n: number): number {
  const i = Math.trunc(Math.fround(start + m)) - start
  return Math.min(Math.max(i === n ? 0 : i, 0), n - 1)
}
/** The bin a man at step i of an n-step clip draws when it is baked in k bins (bin j holding the steps from ⌊jn/k⌋ to
 *  ⌊(j+1)n/k⌋ − 1): ⌈(i+1)k/n⌉ − 1, computed in integers as ⌊((i+1)k − 1)/n⌋ (exact on any GPU; unitdecal.vert's
 *  copy is the same integer expression) and clamped into [0, k − 1] */
export function stepBin(i: number, n: number, k: number): number {
  return Math.min(Math.max(Math.floor(((i + 1) * k - 1) / n), 0), k - 1)
}
/** The steps of bin j of k in an n-step clip starting at `start`: at most `samples` of them, evenly */
export function binSteps(start: number, n: number, k: number, j: number, samples: number): number[] {
  const a = Math.floor((j * n) / k)
  const b = Math.floor(((j + 1) * n) / k)
  const m = Math.min(b - a, samples)
  return Array.from({ length: m }, (_, i) => start + a + Math.floor((i * (b - a)) / m))
}
/** The two bins either side of step i (their centres (j + ½)n/k) and the second's share, for ?ushstep's blend
 *  (unitdecal.vert's SH_STEP_BLEND mirrors it): wrapped round the loop */
export function stepBlend(i: number, n: number, k: number): { j0: number; j1: number; s: number } {
  const p = ((i + 0.5) * k) / n - 0.5
  const f = Math.floor(p)
  const bin = (j: number) => Math.min(Math.max(j % k, 0), k - 1)
  return { j0: bin(f + k), j1: bin(f + 1), s: Math.min(Math.max(p - f, 0), 1) }
}

/** The step atlas cannot fit the texture size (stepAtlasLayout) */
export class AtlasTooLarge extends Error {
  override name = 'AtlasTooLarge'
}
/** The step atlas's layout: `rows` rows of `facings` cells (cellW × cellH texels) in blocks side by side, as few
 *  blocks as keep each side within max texels, the one nearest square among them. Throws when none fits */
export function stepAtlasLayout(
  cellW: number,
  cellH: number,
  facings: number,
  rows: number,
  max = 4096,
): { blocks: number; rowsPerBlock: number; width: number; height: number } {
  let best: { blocks: number; rowsPerBlock: number; width: number; height: number } | null = null
  for (let b = 1; b <= rows; b++) {
    const rowsPerBlock = Math.ceil(rows / b)
    const width = b * facings * cellW
    const height = rowsPerBlock * cellH
    if (width > max) break
    if (height > max) continue
    if (!best || Math.max(width, height) < Math.max(best.width, best.height)) {
      best = { blocks: b, rowsPerBlock, width, height }
    }
  }
  if (!best) {
    throw new AtlasTooLarge(`the step atlas's ${rows} rows of ${facings} cells of ${cellW} × ${cellH} exceed ${max}`)
  }
  return best
}

/** The simple shadow's shape (decision 0049, docs/plans/active/simple-soldier-shadows.md), baked at load from the
 *  figure: a LOD posed at each step of a role's clip (up to maxSteps of them, evenly), turned to each of `facings`
 *  facings (the figure's own turn, as units.ts writes it), its triangles projected along the sun (sun: toward it,
 *  y > 0) onto the ground at its root and rasterised in the shadow's frame (along it, away from the sun; across it),
 *  averaged over the steps (a marching man's legs are one soft wedge) and blurred (blur: its sigma, m). soft (m,
 *  0: none): a second channel, the same shape blurred by that sigma instead and brought back to the shape's own darkest
 *  value in its cell (a softer edge, not a lighter shadow: the close zoom's, decision 0062). Every soldier
 *  of a figure casts it: no era names, the roles are the bake's (decision 0015). posed: the LOD's posedVertices, if
 *  already made. steps (0: the average above): the shape per animation step instead (?ushstep,
 *  docs/plans/done/step-shadows.md): a role's clip in min(n, steps) bins (stepBin), each the average of up to
 *  binSamples of its own steps, a row of facings a bin, the rows in blocks within maxSize texels a side
 *  (stepAtlasLayout) */
export function shadowShape(
  d: UnitData,
  lod: string,
  sun: readonly [number, number, number],
  roles: readonly string[],
  {
    facings = 16,
    texel = 0.05,
    blur = 0.06,
    maxSteps = 12,
    soft = 0,
    posed = null as ReturnType<typeof posedVertices> | null,
    steps = 0,
    binSamples = 4,
    maxSize = 4096,
  } = {},
): ShadowShape {
  if (!(soft >= 0)) throw new Error(`shadowShape: the soft blur must be 0 or more m, not ${soft}`)
  if (!(sun[1] > 0.05)) throw new Error(`shadowShape: the sun must be above the horizon (y ${sun[1]})`)
  const m = d.mesh[lod]
  if (!m) throw new Error(`shadowShape: no LOD ${lod}`)
  const pv = posed ?? posedVertices(d, lod)
  const nv = m.positions.length / 3
  const idx = m.indices
  const l = Math.hypot(sun[0], sun[2]) || 1
  const A = [-sun[0] / l, -sun[2] / l]
  const C = [-A[1], A[0]]
  const kx = sun[0] / sun[1]
  const kz = sun[2] / sun[1]
  // a role's clip (an error when the figure has none)
  const clipOf = (r: string): UnitRange => {
    const rg = d.ranges[r]
    if (!rg) throw new Error(`shadowShape: the figure has no clips for the role ${r}`)
    return rg
  }
  const stepsOf = (rg: UnitRange) => {
    const n = rg.end - rg.start
    const k = Math.min(n, maxSteps)
    return Array.from({ length: k }, (_, i) => rg.start + Math.floor((i * n) / k))
  }
  // a role's bins, each its steps (today: one bin, up to maxSteps of the clip's steps evenly; ?ushstep: k = min(n,
  // steps) bins, each up to binSamples of its own)
  const bins = roles.map(r => {
    const rg = clipOf(r)
    if (steps <= 0) return [stepsOf(rg)]
    const n = rg.end - rg.start
    const k = Math.min(n, steps)
    return Array.from({ length: k }, (_, j) => binSteps(rg.start, n, k, j, binSamples))
  })
  const binRow = bins.map((_, r) => bins.slice(0, r).reduce((a, b) => a + b.length, 0))
  const rowsAll = bins.reduce((a, b) => a + b.length, 0)
  // the projections: [role][facing][step] → (across, along) a vertex, and the bounds over all of them
  const proj = (f: number, a: number, out: Float64Array) => {
    const ca = Math.cos(a)
    const sa = Math.sin(a)
    for (let v = 0; v < nv; v++) {
      const o = (f * nv * 2 + v * 2) * 4
      const x = pv.data[o]
      const y = pv.data[o + 1]
      const z = pv.data[o + 2]
      const wx = ca * x + sa * z - kx * y
      const wz = -sa * x + ca * z - kz * y
      out[v * 2] = wx * C[0] + wz * C[1]
      out[v * 2 + 1] = wx * A[0] + wz * A[1]
    }
  }
  const buf = new Float64Array(nv * 2)
  let c0 = Infinity
  let c1 = -Infinity
  let a0 = Infinity
  let a1 = -Infinity
  for (const ss of bins.flat()) {
    for (const f of ss) {
      for (let k = 0; k < facings; k++) {
        proj(f, (2 * Math.PI * k) / facings, buf)
        for (let v = 0; v < nv; v++) {
          c0 = Math.min(c0, buf[v * 2])
          c1 = Math.max(c1, buf[v * 2])
          a0 = Math.min(a0, buf[v * 2 + 1])
          a1 = Math.max(a1, buf[v * 2 + 1])
        }
      }
    }
  }
  // the blur's reach to spare either way, and an empty border so the bilinear reads never cross into a neighbour
  // (its mips are read too, the mask's texels coarser than its own: a cell's border and size whole texels of the fourth
  // mip, so no mip up to it bleeds into a neighbour)
  // (the soft bake's wider reach on top, in whole blocks of 8 texels: the shape's texels and its mips' then fall where
  // they fall without it, base the box it fills alone, so the far zooms' strip draws as before)
  const pad = 3 * blur
  const margin = 8
  const ex = soft > 0 ? Math.ceil(Math.max(0, 3 * soft - pad) / texel / 8) * 8 : 0
  c0 -= pad
  c1 += pad
  a0 -= pad
  a1 += pad
  const bw = Math.ceil((c1 - c0) / texel / 8) * 8
  const bh = Math.ceil((a1 - a0) / texel / 8) * 8
  const base = { across: [c0, c0 + bw * texel] as [number, number], along: [a0, a0 + bh * texel] as [number, number] }
  c0 -= ex * texel
  a0 -= ex * texel
  const iw = bw + 2 * ex
  const ih = bh + 2 * ex
  const cellW = iw + 2 * margin
  const cellH = ih + 2 * margin
  const lay =
    steps > 0
      ? stepAtlasLayout(cellW, cellH, facings, rowsAll, maxSize)
      : { blocks: 1, rowsPerBlock: roles.length, width: cellW * facings, height: cellH * roles.length }
  const W = lay.width
  const H = lay.height
  const ch = soft > 0 ? 2 : 1
  const out = new Uint8Array(W * H * ch)
  const sw = iw
  const sh = ih
  const cov = new Uint8Array(sw * sh)
  const sp = new Float64Array(nv * 2)
  const acc = new Float32Array(iw * ih)
  const tmp = new Float32Array(iw * ih)
  const acc2 = new Float32Array(iw * ih)
  // the blurs' kernels (separable): the shape's, then the soft one's
  const kernel = (sigma: number) => {
    const sg = sigma / texel
    const R = Math.max(1, Math.ceil(3 * sg))
    const ker = Array.from({ length: 2 * R + 1 }, (_, i) => Math.exp(-((i - R) ** 2) / (2 * sg * sg)))
    const ks = ker.reduce((a, b) => a + b, 0)
    return ker.map(v => v / ks)
  }
  const kers = soft > 0 ? [kernel(blur), kernel(soft)] : [kernel(blur)]
  // a cell (role r's bin j, facing k) at its block's column and its row in the block
  const cells = bins.flatMap((rb, r) => rb.map((ss, j) => ({ ss, row: binRow[r] + j })))
  for (const { ss, row } of cells) {
    const bx = Math.floor(row / lay.rowsPerBlock) * facings
    const by = row % lay.rowsPerBlock
    for (let k = 0; k < facings; k++) {
      acc.fill(0)
      for (const f of ss) {
        proj(f, (2 * Math.PI * k) / facings, buf)
        cov.fill(0)
        // each triangle's projection, the texels whose centres it covers
        for (let v = 0; v < nv; v++) {
          sp[v * 2] = (buf[v * 2] - c0) / texel
          sp[v * 2 + 1] = (buf[v * 2 + 1] - a0) / texel
        }
        for (let t = 0; t < idx.length; t += 3) {
          const i0 = idx[t] * 2
          const i1 = idx[t + 1] * 2
          const i2 = idx[t + 2] * 2
          const ax = sp[i0]
          const ay = sp[i0 + 1]
          const bx = sp[i1]
          const by = sp[i1 + 1]
          const cx = sp[i2]
          const cy = sp[i2 + 1]
          // (a convex triangle: each texel row's centre line meets its edges in one span)
          const y0 = Math.max(0, Math.ceil(Math.min(ay, by, cy) - 0.5))
          const y1 = Math.min(sh - 1, Math.floor(Math.max(ay, by, cy) - 0.5))
          for (let y = y0; y <= y1; y++) {
            const py = y + 0.5
            let lo = Infinity
            let hi = -Infinity
            for (let e = 0; e < 3; e++) {
              const px0 = e === 0 ? ax : e === 1 ? bx : cx
              const py0 = e === 0 ? ay : e === 1 ? by : cy
              const px1 = e === 0 ? bx : e === 1 ? cx : ax
              const py1 = e === 0 ? by : e === 1 ? cy : ay
              if ((py0 <= py && py1 >= py) || (py1 <= py && py0 >= py)) {
                const x = py1 === py0 ? Math.min(px0, px1) : px0 + ((px1 - px0) * (py - py0)) / (py1 - py0)
                const x2 = py1 === py0 ? Math.max(px0, px1) : x
                lo = Math.min(lo, x)
                hi = Math.max(hi, x2)
              }
            }
            const x0 = Math.max(0, Math.ceil(lo - 0.5))
            const x1 = Math.min(sw - 1, Math.floor(hi - 0.5))
            for (let x = x0; x <= x1; x++) cov[y * sw + x] = 1
          }
        }
        for (let i = 0; i < cov.length; i++) acc[i] += cov[i]
      }
      // (the blurs only over the texels the shape covers and their reach: the rest of the cell stays 0)
      let bx0 = iw
      let bx1 = -1
      let by0 = ih
      let by1 = -1
      for (let y = 0; y < ih; y++) {
        for (let x = 0; x < iw; x++) {
          if (acc[y * iw + x] === 0) continue
          acc[y * iw + x] /= ss.length
          bx0 = Math.min(bx0, x)
          bx1 = Math.max(bx1, x)
          by0 = Math.min(by0, y)
          by1 = Math.max(by1, y)
        }
      }
      if (bx1 < 0) continue
      // blurred across, then along (each channel by its kernel); the soft one brought to the shape's darkest value
      let peak = 0
      kers.forEach((ker, c) => {
        const R = (ker.length - 1) / 2
        const x0 = Math.max(0, bx0 - R)
        const x1 = Math.min(iw - 1, bx1 + R)
        const y0 = Math.max(0, by0 - R)
        const y1 = Math.min(ih - 1, by1 + R)
        for (let y = by0; y <= by1; y++) {
          for (let x = x0; x <= x1; x++) {
            let s = 0
            for (let j = -R; j <= R; j++) {
              const xx = x + j
              if (xx >= 0 && xx < iw) s += acc[y * iw + xx] * ker[j + R]
            }
            tmp[y * iw + x] = s
          }
        }
        let top = 0
        for (let y = y0; y <= y1; y++) {
          for (let x = x0; x <= x1; x++) {
            let s = 0
            for (let j = -R; j <= R; j++) {
              const yy = y + j
              if (yy >= by0 && yy <= by1) s += tmp[yy * iw + x] * ker[j + R]
            }
            acc2[y * iw + x] = s
            top = Math.max(top, s)
          }
        }
        if (c === 0) peak = top
        const g = c === 0 || top === 0 ? 1 : Math.min(peak, 1) / top
        for (let y = y0; y <= y1; y++) {
          for (let x = x0; x <= x1; x++) {
            const v = Math.round(255 * Math.min(1, acc2[y * iw + x] * g))
            out[((by * cellH + margin + y) * W + (bx + k) * cellW + margin + x) * ch + c] = v
          }
        }
      })
    }
  }
  return {
    width: W,
    height: H,
    data: out,
    channels: ch,
    facings,
    roles: [...roles],
    cellW,
    cellH,
    margin,
    texel,
    across: [c0, c0 + iw * texel],
    along: [a0, a0 + ih * texel],
    base,
    dir: [A[0], A[1]],
    bins: bins.map(b => b.length),
    binRow,
    rowsPerBlock: lay.rowsPerBlock,
    blocks: lay.blocks,
  }
}

/** The far figure's growth across (the far LOD drawn wider as it shrinks on screen, src/look/units.ts): up to maxXZ,
 *  but never wider than 95 % of a file (fileSpacing, m), the figure's shoulders measured as the far LOD's vertices
 *  (positions, m) between 1.2 and 1.5 m up. A figure with no width there (no vertex in the band, or one) is not
 *  widened: 1, never −0 (found in #130's review: an empty band's width, −Infinity, gave a scale of −0) */
export function farWidthScale(positions: Float32Array, fileSpacing: number, maxXZ: number): number {
  let x0 = Infinity
  let x1 = -Infinity
  for (let v = 0; v < positions.length / 3; v++) {
    const y = positions[v * 3 + 1]
    if (y > 1.2 && y < 1.5) {
      x0 = Math.min(x0, positions[v * 3])
      x1 = Math.max(x1, positions[v * 3])
    }
  }
  return x1 > x0 ? Math.min(maxXZ, (0.95 * fileSpacing) / (x1 - x0)) : 1
}

/** Whether a battalion is drawn at the near LOD, by its figure's height on screen (px) against the switch (lodPx):
 *  on from 10 % over it, off from 10 % under it, as it was (wasNear) between, so a battalion at the switch does not
 *  flicker. (A battalion split at the nearest LOD is near whatever this says: src/look/units.ts) */
export function drawsNear(px: number, wasNear: boolean, lodPx: number): boolean {
  return wasNear ? px >= lodPx * 0.9 : px >= lodPx * 1.1
}

/** Whether a battalion not drawn near is drawn at the tiny LOD: below its switch (tinyPx, the figure's height on
 *  screen) with the near LOD's 10 % either way (wasTiny: as it was between) */
export function drawsTiny(px: number, wasTiny: boolean, tinyPx: number): boolean {
  return wasTiny ? px < tinyPx * 1.1 : px < tinyPx * 0.9
}

/** m: how high over a clip's lowest point a vertex still counts as a foot on the ground (contactOvals) */
const FOOT_H = 0.12
/** m: an oval's least half-size (a foot seen end on) */
const FOOT_MIN = 0.05

/** The oval holding the points (x, z): centred on their box, its half-sizes the box's in proportion, grown until every
 *  point lies in it; [cx, cz, ax, az] (m) */
export function enclosingOval(pts: readonly (readonly [number, number])[]): [number, number, number, number] {
  if (pts.length === 0) return [0, 0, 0, 0]
  const xs = pts.map(p => p[0])
  const zs = pts.map(p => p[1])
  const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)]
  const c = [(x0 + x1) / 2, (z0 + z1) / 2]
  const h = [Math.max(FOOT_MIN, (x1 - x0) / 2), Math.max(FOOT_MIN, (z1 - z0) / 2)]
  const k = Math.max(...pts.map(p => Math.hypot((p[0] - c[0]) / h[0], (p[1] - c[1]) / h[1])))
  return [c[0], c[1], h[0] * k, h[1] * k]
}

/** The contact shadow's oval at each of the figure's baked steps (decision 0071), in his own
 *  frame (x across him, z along him, m from his root): [cx, cz, ax, az] a step, over his feet (the posed LOD's
 *  vertices within FOOT_H of his clip's lowest). step: the feet at that step (it follows them); stride: the feet over
 *  the step's whole clip (one oval a clip); root: none (a disc about the root, its radius the contact's pad). No era
 *  names: the clips are the figure's own (decision 0015). posed: posedVertices of the LOD */
export function contactOvals(
  d: UnitData,
  posed: ReturnType<typeof posedVertices>,
  mode: 'root' | 'stride' | 'step',
): Float32Array {
  const rows = posed.height
  const nv = posed.width / 2
  const out = new Float32Array(rows * 4)
  if (mode === 'root') return out
  const at = (s: number, v: number) => (s * nv * 2 + v * 2) * 4
  const feet = (s: number, floor: number): [number, number][] => {
    const p: [number, number][] = []
    for (let v = 0; v < nv; v++) {
      const o = at(s, v)
      if (posed.data[o + 1] <= floor + FOOT_H) p.push([posed.data[o], posed.data[o + 2]])
    }
    return p
  }
  const lowest = (s0: number, s1: number) => {
    let y = Infinity
    for (let s = s0; s < s1; s++) for (let v = 0; v < nv; v++) y = Math.min(y, posed.data[at(s, v) + 1])
    return y
  }
  const clipOf = (s: number) => Object.values(d.ranges).find(r => s >= r.start && s < r.end) ?? { start: s, end: s + 1 }
  const floors = new Map<number, number>()
  const strides = new Map<number, [number, number, number, number]>()
  for (let s = 0; s < rows; s++) {
    const c = clipOf(s)
    if (!floors.has(c.start)) floors.set(c.start, lowest(c.start, c.end))
    const floor = floors.get(c.start) ?? 0
    if (mode === 'step') {
      out.set(enclosingOval(feet(s, floor)), s * 4)
      continue
    }
    if (!strides.has(c.start)) {
      const pts = Array.from({ length: c.end - c.start }, (_, i) => feet(c.start + i, floor))
      strides.set(c.start, enclosingOval(pts.flat()))
    }
    out.set(strides.get(c.start) ?? [0, 0, 0, 0], s * 4)
  }
  return out
}
