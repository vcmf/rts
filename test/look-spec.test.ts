// The look world's spec, heightfield and data (docs/plans/done/l0-spine.md, L0a): every invariant throws on a
// spec that breaks it (each with a negative case), heightAt follows the mesh's triangle split, and the committed
// look data is what the authoring step builds now.
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SPEC, checkGround, derive, shadowMapSize, type Spec } from '../src/look/spec.ts'
import { heightAt, setHeightfield, type Heightfield } from '../src/look/heightfield.ts'
import { checkLookData, decodeLook, encodeLook } from '../src/look/world/data.ts'
import { LOOK_FILE, buildLookData } from '../tools/build-look-data.ts'

const with_ = (f: (s: Spec) => void): Spec => { const s = structuredClone(SPEC); f(s); return s }

describe('world spec', () => {
  it('derives the real spec', () => {
    const d = derive(SPEC)
    expect(d.farCell / d.cell).toBeCloseTo(8, 12)
    expect(SPEC.play + d.footprint).toBeLessThanOrEqual(SPEC.far / 2)
  })
  const cases: [string, (s: Spec) => void, RegExp][] = [
    ['far cells not a whole number of tile cells', s => { s.farSub = 181 }, /grid: a far cell/],
    ['tile edge off the far grid', s => { s.far = 2600 + 2600 / 182; s.farSub = 183 }, /tile edge does not lie/],
    ['tile too small for play + margin', s => { s.play = 300 }, /coverage: tile\/2/],
    ['a frame corner near the horizon', s => { s.camera.betaMax = 1.3 }, /horizon/],
    ['a view past the far ring', s => { s.far = 1200; s.farSub = 84 }, /a view sees past the world/],
    ['yaw beyond ±45°', s => { s.camera.yawRange = Math.PI / 3 }, /decision 0010/],
    ['camera limits out of order', s => { s.camera.rMin = 300 }, /limits out of order/],
    ['light map too coarse', s => { s.sizes.lightMap = 1024 }, /light map texel/],
    ['occlusion cell over its texel target', s => { s.texel.ao = 2 }, /occlusion cell 3 m > 2 m/],
    ['occlusion cell as wide as the narrowest channel', s => { s.texel.ao = 10; s.sizes.aoCell = 4 }, /narrowest channel/],
    ['a far cell spanning an odd number of tile cells', s => { s.tileSub = 392 }, /odd number of tile cells/],
    ['the frame below the focus past the margin', s => { s.camera.rMax = 320 }, /beside the play edge/],
    ['the closest camera below the highest ground', s => { s.ground.hi = 40 }, /horizon|inside/],
    ['the occlusion ring past the heightfield margin', s => { s.aoRing = 60 }, /occlusion ring/],
    ['a bake over the min-spec texture size', s => { s.sizes.reflMask = 16384 }, /min-spec/],
    ['sun depth range out of order', s => { s.depth.near = 2000 }, /depth range/],
    ['water texels not dividing the tile', s => { s.water.texel = 0.3 }, /water: the tile/],
    ['a water depth range without the shore', s => { s.water.depth = [0.5, 2.5] }, /water: the depth range/],
    ['no shore band', s => { s.water.band = 0 }, /water: the shore band/],
    ['bank colours past the bank normals', s => { s.bank.paint = 13 }, /bank: the banks' colours/],
    ['too many stones for the foam loop', s => { s.water.stones = 100 }, /water: the stones/],
    ['road grid listing less than the junction weight reads', s => { s.road.reach = 5 }, /road: the paint/],
    ['road search narrower than the paint', s => { s.road.near = 4 }, /road: near/],
    ['macro texels not dividing the tile', s => { s.macro.texel = 0.3 }, /macro: the tile/],
    ['a macro bake over the min-spec texture size', s => { s.macro.far = 0.25 }, /bake: macro far ring/],
    ['a macro bake draw out of range', s => { s.macro.bakeTile = 16 }, /macro: a bake draw/],
    ['a Kuwahara radius past its loop', s => { s.macro.kuwahara = 3 }, /macro: the Kuwahara radius/],
  ]
  for (const [name, f, msg] of cases) it(`throws: ${name}`, () => { expect(() => derive(with_(f))).toThrow(msg) })
  it('sizes the shadow map at the texel target on the ground, and refuses one over min-spec', () => {
    const d = derive(SPEC), sin = 0.45, sm = shadowMapSize(d, 1203.3, 730.1, sin)
    expect(1203.3 / sm.w).toBeLessThanOrEqual(SPEC.texel.shadow)
    expect(730.1 / sm.h / sin).toBeLessThanOrEqual(SPEC.texel.shadow)   // light-space y, stretched on the ground by 1/sin(elevation)
    expect(() => shadowMapSize(d, 4000, 700, sin)).toThrow(/shadow map .*min-spec/)
    expect(() => shadowMapSize(derive(with_(s => { s.minSpec.bakeMB = 100 })), 1203.3, 730.1, sin)).toThrow(/MB of bakes/)
  })
  it('refuses ground outside its range', () => {
    expect(() => checkGround(SPEC, 0.4, 20.3, 2.2)).not.toThrow()
    expect(() => checkGround(SPEC, -3, 20.3, 2.2)).toThrow(/outside the spec/)
    expect(() => checkGround(SPEC, 0.4, 30, 2.2)).toThrow(/outside the spec/)
    expect(() => checkGround(SPEC, 0.4, 20.3, -1)).toThrow(/outside the spec/)
  })
})

describe('heightfield', () => {
  // a 2×2-cell field with a known saddle: the split decides the answer inside each cell
  const h = new Float32Array([0, 1, 2, 3, 4, 5, 6, 7, 8]), hf: Heightfield = { n: 3, cell: 2, x0: -2, z0: -2, h, min: 0, max: 8 }
  setHeightfield(hf, { ...hf }, 100)
  it('returns the nodes at the nodes', () => { for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) expect(heightAt(-2 + 2 * i, -2 + 2 * j)).toBeCloseTo(h[j * 3 + i], 6) })
  it('splits each cell from (x1, z0) to (x0, z1), as CreateGround does', () => {
    h[4] = 10   // raise the centre node (1, 1): it is corner 11 of cell (0, 0), on that cell's upper-right triangle only
    expect(heightAt(-1.5, -1.5)).toBeCloseTo(0 + 0.25 * 1 + 0.25 * 3, 6)    // lower-left triangle: no centre node
    expect(heightAt(-0.5, -0.5)).toBeGreaterThan(5)                          // upper-right triangle: pulled up by it
    h[4] = 4
  })
})

describe('look data', () => {
  it('round-trips through encode and decode', () => {
    const bytes = buildLookData(), d = decodeLook(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)
    expect(Buffer.compare(Buffer.from(encodeLook(d)), Buffer.from(bytes))).toBe(0)
    expect(d.hf.n).toBe(SPEC.tileSub + 1 + 2 * derive(SPEC).hfMargin)
  })
  it('refuses data built for another spec', () => {
    const bytes = buildLookData(), d = decodeLook(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)
    expect(() => checkLookData(derive(SPEC), d)).not.toThrow()
    expect(() => checkLookData(derive(with_(s => { s.aoMargin = 60; s.aoRing = 60 })), d)).toThrow(/heightfield .* nodes/)
    expect(() => checkLookData(derive(with_(s => { s.far = 2600 + 2 * 2600 / 182; s.farSub = 184 })), d)).toThrow(/far ring/)
    expect(() => checkLookData(derive(with_(s => { s.water.texel = 1 })), d)).toThrow(/water data/)
    expect(() => checkLookData(derive(with_(s => { s.macro.cover = 4 })), d)).toThrow(/cover/)
  })
  it('the committed file is what the authoring step builds (else run node tools/build-look-data.ts)', () => {
    expect(Buffer.compare(fs.readFileSync(LOOK_FILE), Buffer.from(buildLookData()))).toBe(0)
  })
})
