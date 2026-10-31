// The grass's flow as textures (?grass=flow, docs/plans/done/grass-flow.md), made once on load, so the ground, the
// bake and the clumps read the same flow with one fetch instead of evaluating it (five value noises a call; the
// strokes made several calls a pixel). The field: flowAt in src/look/shaders/meadow.glsl, here in JS (its hash in
// float64: the textures, not the GLSL, are the field wherever they reach)
import { TILE_O } from './tile.ts'
import { Constants } from '@babylonjs/core/Engines/constants.js'
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture.js'
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js'
import type { Scene } from '@babylonjs/core/scene.js'
import { D } from './spec.ts'
import { FLOW, FLOW_TEXEL, flowBytes, mHash, mValue } from './flow-field.ts'

export const flowDefines = (): string[] =>
  [
    ['SCALE', FLOW.scale],
    ['WARP', FLOW.warp],
    ['WARP_AMT', FLOW.warpAmt],
    ['OCT2', FLOW.oct2],
    ['OCT2_K', FLOW.oct2K],
    ['TURNS', FLOW.turns],
    ['LIE_SCALE', FLOW.lieScale],
    ['LIE_LO', FLOW.lieLo],
    ['LIE_HI', FLOW.lieHi],
  ].map(([k, v]) => `#define FLOW_${k} ${(v as number).toFixed(4)}`)

// the strokes' noise: value noise of period COMB_PERIOD lattice cells, COMB_RES texels a cell, tiling (R one octave, G
// another offset), read stretched along the flow (combedBrush)
export const COMB_PERIOD = 32
export const COMB_RES = 4

export interface FlowTextures {
  flow: RawTexture
  comb: RawTexture
  ms: number
}
export function buildFlow(scene: Scene): FlowTextures {
  const t0 = performance.now()
  const TILE = D.spec.tile
  const n = Math.round(TILE / FLOW_TEXEL)
  const f = flowBytes(TILE_O.x, TILE_O.y, TILE)
  const flow = new RawTexture(f, n, n, Constants.TEXTUREFORMAT_RGBA, scene, false, false, Texture.BILINEAR_SAMPLINGMODE)
  flow.wrapU = flow.wrapV = Texture.CLAMP_ADDRESSMODE
  // the comb's noise, tiling: the lattice wraps at COMB_PERIOD
  const m = COMB_PERIOD * COMB_RES
  const c = new Uint8Array(m * m * 4)
  const w = (p: number) => ((p % COMB_PERIOD) + COMB_PERIOD) % COMB_PERIOD
  const tiled = (x: number, y: number, o: number) => mValue(x, y, (a, b) => mHash(w(a) + o, w(b) + o))
  for (let j = 0; j < m; j++) {
    for (let i = 0; i < m; i++) {
      const k = (j * m + i) * 4
      const x = i / COMB_RES
      const y = j / COMB_RES
      c[k] = Math.round(tiled(x, y, 0) * 255)
      c[k + 1] = Math.round(tiled(x, y, 57) * 255)
      c[k + 2] = 0
      c[k + 3] = 255
    }
  }
  // (no mips: read at level 0 where the strokes show, a footprint under 0.15 m, about a texel)
  const comb = new RawTexture(c, m, m, Constants.TEXTUREFORMAT_RGBA, scene, false, false, Texture.BILINEAR_SAMPLINGMODE)
  comb.wrapU = comb.wrapV = Texture.WRAP_ADDRESSMODE
  return { flow, comb, ms: performance.now() - t0 }
}
