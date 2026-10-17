// The grass's flow as textures (?grass=flow, docs/plans/active/grass-flow.md), made once on load, so the ground, the
// bake and the clumps read the same flow with one fetch instead of evaluating it (five value noises a call; the
// strokes made several calls a pixel). The field: flowAt in src/look/shaders/meadow.glsl, here in JS (its hash in
// float64: the textures, not the GLSL, are the field wherever they reach)
import { Constants } from '@babylonjs/core/Engines/constants.js'
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture.js'
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js'
import type { Scene } from '@babylonjs/core/scene.js'
import { D } from './spec.ts'
import { sstep } from './noise.ts'

const fract = (x: number) => x - Math.floor(x)
// mHash and mValue (src/look/shaders/meadow.glsl)
function mHash(x: number, y: number): number {
  let a = fract(x * 0.1031), b = fract(y * 0.1030), c = fract(x * 0.0973)
  const d = a * (b + 33.33) + b * (c + 33.33) + c * (a + 33.33); a += d; b += d; c += d
  return fract((a + b) * c)
}
function mValue(x: number, y: number): number {
  const i = Math.floor(x), j = Math.floor(y); let u = x - i, v = y - j; u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v)
  const a = mHash(i, j), b = mHash(i + 1, j), c = mHash(i, j + 1), e = mHash(i + 1, j + 1)
  return (a + (b - a) * u) * (1 - v) + (c + (e - c) * u) * v
}
// the field's numbers, one home: this and the GLSL (flowDefines) both read them. scale: its patches (m, a patch combed
// one way over 30-60 m, as the references); warp, warpAmt: the domain warp's scale and reach; oct2, oct2K: the second
// octave's weight and frequency; turns: how far the angle wanders (rad); lieScale, lieLo, lieHi: how far it lies over
export const FLOW = { scale: 70, warp: 120, warpAmt: 0.9, oct2: 0.2, oct2K: 2.1, turns: 7.5, lieScale: 19, lieLo: 0.2, lieHi: 0.8 }
export const flowDefines = (): string[] => [['SCALE', FLOW.scale], ['WARP', FLOW.warp], ['WARP_AMT', FLOW.warpAmt], ['OCT2', FLOW.oct2], ['OCT2_K', FLOW.oct2K], ['TURNS', FLOW.turns], ['LIE_SCALE', FLOW.lieScale], ['LIE_LO', FLOW.lieLo], ['LIE_HI', FLOW.lieHi]]
  .map(([k, v]) => `#define FLOW_${k} ${(v as number).toFixed(4)}`)
export function flowAt(x: number, z: number): [number, number, number] {
  const F = FLOW, qx = x / F.scale + (mValue(x / F.warp, z / F.warp) - 0.5) * F.warpAmt, qz = z / F.scale + (mValue(x / F.warp + 19, z / F.warp + 19) - 0.5) * F.warpAmt
  const a = (mValue(qx, qz) * (1 - F.oct2) + mValue(qx * F.oct2K + 5, qz * F.oct2K + 5) * F.oct2) * F.turns
  return [Math.cos(a), Math.sin(a), sstep(F.lieLo, F.lieHi, mValue(x / F.lieScale + 31, z / F.lieScale + 31))]
}

// FLOW_TEXEL m texels over the tile: RG the lean (×0.5 + 0.5), B how far it lies over; bilinear
export const FLOW_TEXEL = 2
// the strokes' noise: value noise of period COMB_PERIOD lattice cells, COMB_RES texels a cell, tiling (R one octave, G
// another offset), read stretched along the flow (combedBrush)
export const COMB_PERIOD = 32, COMB_RES = 4

export interface FlowTextures { flow: RawTexture; comb: RawTexture; ms: number }
export function buildFlow(scene: Scene): FlowTextures {
  const t0 = performance.now(), TILE = D.spec.tile, n = Math.round(TILE / FLOW_TEXEL), f = new Uint8Array(n * n * 4)
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const [dx, dz, lie] = flowAt((i + 0.5) * FLOW_TEXEL - TILE / 2, (j + 0.5) * FLOW_TEXEL - TILE / 2), k = (j * n + i) * 4
    f[k] = Math.round((dx * 0.5 + 0.5) * 255); f[k + 1] = Math.round((dz * 0.5 + 0.5) * 255); f[k + 2] = Math.round(lie * 255); f[k + 3] = 255
  }
  const flow = new RawTexture(f, n, n, Constants.TEXTUREFORMAT_RGBA, scene, false, false, Texture.BILINEAR_SAMPLINGMODE)
  flow.wrapU = flow.wrapV = Texture.CLAMP_ADDRESSMODE
  // the comb's noise, tiling: the lattice wraps at COMB_PERIOD
  const m = COMB_PERIOD * COMB_RES, c = new Uint8Array(m * m * 4)
  const tiled = (x: number, y: number, o: number) => {
    const i = Math.floor(x), j = Math.floor(y); let u = x - i, v = y - j; u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v)
    const w = (p: number) => ((p % COMB_PERIOD) + COMB_PERIOD) % COMB_PERIOD, h = (a: number, b: number) => mHash(w(a) + o, w(b) + o)
    return (h(i, j) + (h(i + 1, j) - h(i, j)) * u) * (1 - v) + (h(i, j + 1) + (h(i + 1, j + 1) - h(i, j + 1)) * u) * v
  }
  for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) {
    const k = (j * m + i) * 4, x = i / COMB_RES, y = j / COMB_RES
    c[k] = Math.round(tiled(x, y, 0) * 255); c[k + 1] = Math.round(tiled(x, y, 57) * 255); c[k + 2] = 0; c[k + 3] = 255
  }
  // (no mips: read at level 0 where the strokes show, a footprint under 0.15 m, about a texel)
  const comb = new RawTexture(c, m, m, Constants.TEXTUREFORMAT_RGBA, scene, false, false, Texture.BILINEAR_SAMPLINGMODE)
  comb.wrapU = comb.wrapV = Texture.WRAP_ADDRESSMODE
  return { flow, comb, ms: performance.now() - t0 }
}
