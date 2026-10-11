// A span grid of the look data (src/look/world/data.ts: the bank normals, the water data) as an RGBA8 texture over
// the tile: clamped at the edges, bilinear, no mips. The uncovered texels take `fill` (RGBA bytes). No mips: the shore
// band (src/look/shaders/shore.glsl) must read the same value at a world point from the terrain and from the water,
// and a mip level follows each surface's own screen derivatives (a steep bank would read a coarser level than the
// flat water where the two meet).
import { Constants } from '@babylonjs/core/Engines/constants.js'
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture.js'
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js'
import type { Scene } from '@babylonjs/core/scene.js'
import { unpackSpans, type SpanGrid } from './world/data.ts'

export function spanTexture(scene: Scene, g: SpanGrid, fill: [number, number, number, number], name: string): RawTexture {
  const tex = RawTexture.CreateRGBATexture(unpackSpans(g, fill), g.n, g.n, scene, false, false, Texture.BILINEAR_SAMPLINGMODE, Constants.TEXTURETYPE_UNSIGNED_BYTE)
  tex.wrapU = tex.wrapV = Texture.CLAMP_ADDRESSMODE; tex.name = name
  return tex
}
