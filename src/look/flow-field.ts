// The combed meadow's flow field (docs/plans/done/grass-flow.md): pure arithmetic of a world point, shared by the page
// (src/look/flow.ts, its texture) and the tile worker (src/look/tile-worker.ts: a moved tile's flow, G3c). No Babylon.
import { sstep } from './noise.ts'

const fract = (x: number) => x - Math.floor(x)
// mHash and mValue (src/look/shaders/meadow.glsl)
export function mHash(x: number, y: number): number {
  let a = fract(x * 0.1031)
  let b = fract(y * 0.103)
  let c = fract(x * 0.0973)
  const d = a * (b + 33.33) + b * (c + 33.33) + c * (a + 33.33)
  a += d
  b += d
  c += d
  return fract((a + b) * c)
}
// (h: the lattice's hash, mHash by default; the comb's wraps it to tile)
export function mValue(x: number, y: number, h: (i: number, j: number) => number = mHash): number {
  const i = Math.floor(x)
  const j = Math.floor(y)
  let u = x - i
  let v = y - j
  u = u * u * (3 - 2 * u)
  v = v * v * (3 - 2 * v)
  const a = h(i, j)
  const b = h(i + 1, j)
  const c = h(i, j + 1)
  const e = h(i + 1, j + 1)
  return (a + (b - a) * u) * (1 - v) + (c + (e - c) * u) * v
}
// the field's numbers, one home: this and the GLSL (flowDefines) both read them. scale: its patches (m, a patch combed
// one way over 30-60 m, as the references); warp, warpAmt: the domain warp's scale and reach; oct2, oct2K: the second
// octave's weight and frequency; turns: how far the angle wanders (rad); lieScale, lieLo, lieHi: how far it lies over
export const FLOW = {
  scale: 70,
  warp: 120,
  warpAmt: 0.9,
  oct2: 0.2,
  oct2K: 2.1,
  turns: 7.5,
  lieScale: 19,
  lieLo: 0.2,
  lieHi: 0.8,
}

export function flowAt(x: number, z: number): [number, number, number] {
  const F = FLOW
  const qx = x / F.scale + (mValue(x / F.warp, z / F.warp) - 0.5) * F.warpAmt
  const qz = z / F.scale + (mValue(x / F.warp + 19, z / F.warp + 19) - 0.5) * F.warpAmt
  const a = (mValue(qx, qz) * (1 - F.oct2) + mValue(qx * F.oct2K + 5, qz * F.oct2K + 5) * F.oct2) * F.turns
  return [Math.cos(a), Math.sin(a), sstep(F.lieLo, F.lieHi, mValue(x / F.lieScale + 31, z / F.lieScale + 31))]
}

// FLOW_TEXEL m texels over the tile: RG the lean (×0.5 + 0.5), B how far it lies over; bilinear
export const FLOW_TEXEL = 2

/** The flow over a tile of side `tile` m centred on (cx, cz): its texels' bytes (FLOW_TEXEL, RGBA) */
export function flowBytes(cx: number, cz: number, tile: number): Uint8Array {
  const n = Math.round(tile / FLOW_TEXEL)
  const f = new Uint8Array(n * n * 4)
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const [dx, dz, lie] = flowAt(cx + (i + 0.5) * FLOW_TEXEL - tile / 2, cz + (j + 0.5) * FLOW_TEXEL - tile / 2)
      const k = (j * n + i) * 4
      f[k] = Math.round((dx * 0.5 + 0.5) * 255)
      f[k + 1] = Math.round((dz * 0.5 + 0.5) * 255)
      f[k + 2] = Math.round(lie * 255)
      f[k + 3] = 255
    }
  }
  return f
}
