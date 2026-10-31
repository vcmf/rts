// The meadow's clumps as the GPU draws them (src/look/meadow.ts): the pack's grass (data/meadow-grass.json, a
// triangle list) indexed and normalised to a height of 1, a clump thinned to every other blade (the grass detail's
// Balanced, src/look/grass-detail.ts), and a clump's widest radius. Pure: no Babylon, so the tests read it.

/** An indexed clump: positions normalised to a height of 1 (top: the height in the export's units), normals, each
 * vertex's height along its blade (aV) and the triangles' indices */
export interface Clump {
  pos: number[]
  nrm: number[]
  vv: number[]
  idx: number[]
  top: number
}
/** A clump as data/meadow-grass.json exports it: a triangle list */
export interface ClumpSource {
  pos: number[]
  nrm: number[]
  v: number[]
}

/** A clump of the export indexed (corners sharing position, normal and aV become one vertex), normalised to a height
 * of 1 (the shader scales it to HEIGHT) */
export function indexClump(c: ClumpSource): Clump {
  const pos: number[] = []
  const nrm: number[] = []
  const vv: number[] = []
  const idx: number[] = []
  const seen = new Map<string, number>()
  let top = 0
  for (let t = 1; t < c.pos.length; t += 3) top = Math.max(top, c.pos[t])
  for (let t = 0; t < c.v.length; t++) {
    const p = [c.pos[t * 3] / top, c.pos[t * 3 + 1] / top, c.pos[t * 3 + 2] / top]
    const key = [...p, c.nrm[t * 3], c.nrm[t * 3 + 1], c.nrm[t * 3 + 2], c.v[t]].join(',')
    let k = seen.get(key)
    if (k === undefined) {
      k = vv.length
      seen.set(key, k)
      pos.push(...p)
      nrm.push(c.nrm[t * 3], c.nrm[t * 3 + 1], c.nrm[t * 3 + 2])
      vv.push(c.v[t])
    }
    idx.push(k)
  }
  return { pos, nrm, vv, idx, top }
}

/** Every other blade of a clump: its triangles joined into blades by shared positions, the blades in the order their
 * first triangle comes, the even ones kept, and only their vertices; normalised again to a height of 1 (top the kept
 * blades' height), so the thinned clump stands as tall as the whole one */
export function thinClump(c: Clump): Clump {
  const key = (v: number) => `${c.pos[v * 3]},${c.pos[v * 3 + 1]},${c.pos[v * 3 + 2]}`
  const parent = new Map<string, string>()
  const find = (a: string): string => {
    let r = a
    while (parent.get(r) !== r) r = parent.get(r)!
    return r
  }
  for (const v of c.idx) if (!parent.has(key(v))) parent.set(key(v), key(v))
  for (let t = 0; t < c.idx.length; t += 3) {
    const a = find(key(c.idx[t]))
    for (let q = 1; q < 3; q++) {
      const b = find(key(c.idx[t + q]))
      if (a !== b) parent.set(b, a)
    }
  }
  const blade = new Map<string, number>()
  const remap = new Map<number, number>()
  const out: Clump = { pos: [], nrm: [], vv: [], idx: [], top: c.top }
  for (let t = 0; t < c.idx.length; t += 3) {
    const r = find(key(c.idx[t]))
    if (!blade.has(r)) blade.set(r, blade.size)
    if (blade.get(r)! % 2) continue
    for (let q = 0; q < 3; q++) {
      const v = c.idx[t + q]
      let w = remap.get(v)
      if (w === undefined) {
        w = out.vv.length
        remap.set(v, w)
        out.pos.push(c.pos[v * 3], c.pos[v * 3 + 1], c.pos[v * 3 + 2])
        out.nrm.push(c.nrm[v * 3], c.nrm[v * 3 + 1], c.nrm[v * 3 + 2])
        out.vv.push(c.vv[v])
      }
      out.idx.push(w)
    }
  }
  // (renormalised: had the tallest blade gone, the kept ones would stand shorter than the whole clump)
  let h = 0
  for (let i = 1; i < out.pos.length; i += 3) h = Math.max(h, out.pos[i])
  if (h > 0 && h !== 1) {
    for (let i = 0; i < out.pos.length; i++) out.pos[i] /= h
    out.top *= h
  }
  return out
}

/** A clump's widest radius in data/meadow-grass.json's units (its positions are normalised to a height of 1) */
export function clumpRadius(c: Clump): number {
  let w = 0
  for (let i = 0; i < c.pos.length; i += 3) w = Math.max(w, Math.hypot(c.pos[i], c.pos[i + 2]))
  return w * c.top
}
