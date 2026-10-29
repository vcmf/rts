// The look world's spec, heightfield and data (docs/plans/done/l0-spine.md, L0a): every invariant throws on a
// spec that breaks it (each with a negative case), heightAt follows the mesh's triangle split, and the committed
// look data is what the authoring step builds now.
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  SPEC,
  TUNED_R,
  ZoomHold,
  bakeMB,
  bakesMB,
  checkGround,
  clearBelow,
  clearRadius,
  derive,
  footprintOf,
  holdView,
  nearReachOf,
  shadowMapSize,
  type Spec,
} from '../src/look/spec.ts'
import { heightAt, setHeightfield, type Heightfield } from '../src/look/heightfield.ts'
import { checkLookData, decodeLook, encodeLook } from '../src/look/world/data.ts'
import { LOOK_FILE, buildLookData } from '../tools/build-look-data.ts'

const with_ = (f: (s: Spec) => void): Spec => {
  const s = structuredClone(SPEC)
  f(s)
  return s
}

describe('world spec', () => {
  it('derives the real spec', () => {
    const d = derive(SPEC)
    expect(d.farCell / d.cell).toBeCloseTo(8, 12)
    expect(SPEC.play + d.footprint).toBeLessThanOrEqual(SPEC.far / 2)
  })
  const cases: [string, (s: Spec) => void, RegExp][] = [
    [
      'far cells not a whole number of tile cells',
      s => {
        s.farSub = 181
      },
      /grid: a far cell/,
    ],
    [
      'tile edge off the far grid',
      s => {
        s.far = 2600 + 2600 / 182
        s.farSub = 183
      },
      /tile edge does not lie/,
    ],
    [
      'tile too small for play + margin',
      s => {
        s.play = 300
      },
      /coverage: tile\/2/,
    ],
    [
      'a frame corner near the horizon',
      s => {
        s.camera.betaMax = 1.3
      },
      /horizon/,
    ],
    [
      'a view past the far ring',
      s => {
        s.far = 1200
        s.farSub = 84
      },
      /a view sees past the world/,
    ],
    [
      'yaw beyond ±45°',
      s => {
        s.camera.yawRange = Math.PI / 3
      },
      /decision 0010/,
    ],
    [
      'camera limits out of order',
      s => {
        s.camera.rMin = 300
      },
      /limits out of order/,
    ],
    [
      'light map too coarse',
      s => {
        s.sizes.lightMap = 1024
      },
      /light map texel/,
    ],
    [
      'occlusion cell over its texel target',
      s => {
        s.texel.ao = 2
      },
      /occlusion cell 3 m > 2 m/,
    ],
    [
      'occlusion cell as wide as the narrowest channel',
      s => {
        s.texel.ao = 10
        s.sizes.aoCell = 4
      },
      /narrowest channel/,
    ],
    [
      'a far cell spanning an odd number of tile cells',
      s => {
        s.tileSub = 392
      },
      /odd number of tile cells/,
    ],
    [
      'the frame below the focus past the margin',
      s => {
        s.camera.rMax = 320
      },
      /beside the play edge/,
    ],
    [
      'a camera held inside the highest ground even at the widest zoom',
      s => {
        s.ground.hi = 160
      },
      /horizon|inside/,
    ],
    [
      'no clearance over the ground',
      s => {
        s.camera.clearance = 0
      },
      /clearance/,
    ],
    [
      'the occlusion ring past the heightfield margin',
      s => {
        s.aoRing = 60
      },
      /occlusion ring/,
    ],
    [
      'a bake over the min-spec texture size',
      s => {
        s.sizes.reflMask = 16384
      },
      /min-spec/,
    ],
    [
      'sun depth range out of order',
      s => {
        s.depth.near = 2000
      },
      /depth range/,
    ],
    [
      'water texels not dividing the tile',
      s => {
        s.water.texel = 0.3
      },
      /water: the tile/,
    ],
    [
      'a water depth range without the shore',
      s => {
        s.water.depth = [0.5, 2.5]
      },
      /water: the depth range/,
    ],
    [
      'no shore band',
      s => {
        s.water.band = 0
      },
      /water: the shore band/,
    ],
    [
      'bank colours past the bank normals',
      s => {
        s.bank.paint = 13
      },
      /bank: the banks' colours/,
    ],
    [
      'too many stones for the foam loop',
      s => {
        s.water.stones = 100
      },
      /water: the stones/,
    ],
    [
      'road grid listing less than the junction weight reads',
      s => {
        s.road.reach = 5
      },
      /road: the paint/,
    ],
    [
      'road search narrower than the paint',
      s => {
        s.road.near = 2.4
      },
      /road: near/,
    ],
    [
      'road paint short of the warp and the edge',
      s => {
        s.road.paint = 3.0
      },
      /road: paint short/,
    ],
    [
      'macro texels not dividing the tile',
      s => {
        s.macro.texel = 0.3
      },
      /macro: the tile/,
    ],
    [
      'a macro bake over the min-spec texture size',
      s => {
        s.macro.far = 0.25
      },
      /bake: macro far ring/,
    ],
    [
      'a macro bake draw out of range',
      s => {
        s.macro.bakeTile = 16
      },
      /macro: a bake draw/,
    ],
    [
      'road cells not dividing the tile',
      s => {
        s.road.cell = 7
      },
      /road: the tile/,
    ],
    [
      'bank texels not dividing the tile',
      s => {
        s.bank.texel = 0.3
      },
      /bank: the tile/,
    ],
    [
      'bank normals over the min-spec texture size',
      s => {
        s.bank.texel = 0.08
      },
      /bake: bank normals/,
    ],
    [
      'a bank fade not positive',
      s => {
        s.bank.fade = 0
      },
      /bank: the fades/,
    ],
    [
      'water texels not dividing the tile',
      s => {
        s.water.texel = 0.3
      },
      /water: the tile/,
    ],
    [
      'water data over the min-spec texture size',
      s => {
        s.water.texel = 0.08
      },
      /bake: water data/,
    ],
    [
      'a water depth range without the shore',
      s => {
        s.water.depth = [0.5, 2]
      },
      /water: the depth range/,
    ],
    [
      'a detail size not positive',
      s => {
        s.detail.px = 0
      },
      /detail: sizes/,
    ],
    [
      'a Kuwahara radius past its loop',
      s => {
        s.macro.kuwahara = 3
      },
      /macro: the Kuwahara radius/,
    ],
  ]
  for (const [name, f, msg] of cases) {
    it(`throws: ${name}`, () => {
      expect(() => derive(with_(f))).toThrow(msg)
    })
  }
  it("bakes the light map at its texel target, about 0.5 m (no finer than the trunks' strips need)", () => {
    const texel = SPEC.tile / SPEC.sizes.lightMap
    expect(texel).toBeLessThanOrEqual(SPEC.texel.light)
    expect(texel).toBeGreaterThan(0.45)
    expect(() =>
      derive(
        with_(s => {
          s.sizes.lightMap = Math.floor(s.tile / s.texel.light) - 1
        }),
      ),
    ).toThrow(/light map texel/)
  })
  it("counts the light map and the soldiers' shade in the bake budget, each with its depth buffer", () => {
    const at = (n: number) =>
      bakesMB(
        derive(
          with_(s => {
            s.sizes.lightMap = n
          }),
        ),
        1000,
        1000,
      )
    expect(at(3072) - at(1536)).toBeCloseTo(4 * (bakeMB(3072, 3072) - bakeMB(1536, 1536)), 9)
  })
  it('sizes the shadow map at the texel target on the ground, and refuses one over min-spec', () => {
    const d = derive(SPEC)
    const sin = 0.45
    const sm = shadowMapSize(d, 1203.3, 730.1, sin)
    expect(1203.3 / sm.w).toBeLessThanOrEqual(SPEC.texel.shadow)
    // light-space y, stretched on the ground by 1/sin(elevation)
    expect(730.1 / sm.h / sin).toBeLessThanOrEqual(SPEC.texel.shadow)
    expect(() => shadowMapSize(d, 4000, 700, sin)).toThrow(/shadow map .*min-spec/)
    expect(() =>
      shadowMapSize(
        derive(
          with_(s => {
            s.minSpec.bakeMB = 100
          }),
        ),
        1203.3,
        730.1,
        sin,
      ),
    ).toThrow(/MB of bakes/)
  })
  it('holds the closest zoom out over high ground, never from 45 m out (decision 0051)', () => {
    const c = SPEC.camera
    const flat = () => 0
    const hill = () => 18
    expect(clearRadius(c, c.rMin, -2, c.betaMax, 0, c.focusY, 0, flat)).toBe(c.rMin) // flat ground: the eye 16.4 m up
    const r = clearRadius(c, c.rMin, -2, c.betaMax, 0, c.focusY, 0, hill)
    expect(r * Math.cos(c.betaMax) + c.focusY - 18).toBeGreaterThanOrEqual(c.clearance)
    expect(r * Math.cos(c.betaMax) + c.focusY - 18 - c.clearance).toBeLessThan(1e-3 * Math.cos(c.betaMax) + 1e-9)
    expect(clearRadius(c, c.rMin, -2, c.betaMax, 0, c.focusY, 0, () => 400)).toBe(c.rMax)
  })
  it('finds the held radius on a steep slope rising under the eye (0.5 m a metre), the least radius that clears', () => {
    const c = SPEC.camera
    const a = -2
    const b = c.betaMax
    const ca = Math.cos(a)
    const sa = Math.sin(a)
    // the ground rises 0.5 m a metre away from the focus toward the eye, from 6 m at the focus
    const slope = (x: number, z: number) => 6 + 0.5 * (x * ca + z * sa)
    const clear = (q: number) =>
      q * Math.cos(b) + c.focusY - slope(q * ca * Math.sin(b), q * sa * Math.sin(b)) - c.clearance
    const r = clearRadius(c, c.rMin, a, b, 0, c.focusY, 0, slope)
    // the least radius that clears, to 1 mm
    expect(clear(r)).toBeGreaterThanOrEqual(0)
    expect(clear(r - 2e-3)).toBeLessThan(0)
    expect(r).toBeGreaterThan(c.rMin)
    expect(r).toBeLessThan(c.rMax)
  })
  it("keeps the player's zoom apart from the held one: it comes back in on lower ground (ZoomHold)", () => {
    const z = new ZoomHold()
    let ground = 0
    let cam = 15
    const hold = (w: number) => Math.max(w, 10 + ground) // a stand-in hold: held out over ground, as clearRadius
    cam = z.step(cam, hold)
    expect(cam).toBe(15)
    // over a hill: held out
    ground = 13
    cam = z.step(cam, hold)
    expect(cam).toBe(23)
    cam = z.step(cam, hold)
    expect(cam).toBe(23)
    expect(z.wanted).toBe(15) // (the shown radius is not taken as wanted)
    // past it: back in to the wanted zoom
    ground = 0
    cam = z.step(cam, hold)
    expect(cam).toBe(15)
    // the player zooms out: the new wanted one
    cam = z.step(40, hold)
    expect(cam).toBe(40)
    expect(z.wanted).toBe(40)
    ground = 35
    cam = z.step(cam, hold)
    expect(cam).toBe(45)
    // zooming in while held: wanted moves, still held
    cam = z.step(30, hold)
    expect(z.wanted).toBe(30)
    expect(cam).toBe(45)
    // the page's inputs and the tools set it explicitly: a set equal to the radius shown still lands
    ground = 13
    z.set(15)
    cam = z.step(cam, hold)
    expect(cam).toBe(23)
    z.set(23)
    cam = z.step(cam, hold)
    expect(z.wanted).toBe(23)
    expect(cam).toBe(23)
    // (23 was asked for: no coming back in to 15)
    ground = 0
    cam = z.step(cam, hold)
    expect(cam).toBe(23)
  })
  it('refuses ground outside its range', () => {
    expect(() => checkGround(SPEC, 0.4, 20.3, 2.2)).not.toThrow()
    expect(() => checkGround(SPEC, -3, 20.3, 2.2)).toThrow(/outside the spec/)
    expect(() => checkGround(SPEC, 0.4, 30, 2.2)).toThrow(/outside the spec/)
    expect(() => checkGround(SPEC, 0.4, 20.3, -1)).toThrow(/outside the spec/)
  })
})

describe("the camera's reach (footprintOf, nearReachOf)", () => {
  it('is what derive checks, the frame below the focus within the margin, the whole frame farther', () => {
    const near = nearReachOf(SPEC)
    expect(footprintOf(SPEC)).toBe(derive(SPEC).footprint)
    expect(near).toBeGreaterThan(0)
    expect(near).toBeLessThanOrEqual(SPEC.margin)
    expect(near).toBeLessThan(footprintOf(SPEC))
  })
  it('reaches farther on a wider frame and at a longer zoom', () => {
    const fp = footprintOf(SPEC)
    expect(footprintOf(with_(s => (s.camera.aspectMax = 2.4)))).toBeGreaterThan(fp)
    expect(footprintOf(with_(s => (s.camera.rMax = 300)))).toBeGreaterThan(fp)
    expect(nearReachOf(with_(s => (s.camera.rMax = 300)))).toBeGreaterThan(nearReachOf(SPEC))
  })
  it("is Infinity when a frame corner nears the horizon, the frame's bottom still finite", () => {
    const low = with_(s => (s.camera.betaMax = 1.4))
    expect(footprintOf(low)).toBe(Infinity)
    expect(Number.isFinite(nearReachOf(low))).toBe(true)
  })
  it('is Infinity below the focus when the eye could not clear the highest tile ground within rMax', () => {
    const high = with_(s => (s.ground.hi = 300))
    expect(nearReachOf(high)).toBe(Infinity)
    expect(footprintOf(high)).toBe(footprintOf(SPEC)) // (the whole frame reaches farthest on the lowest ground)
  })
})

describe("a bake's memory (bakeMB)", () => {
  it('counts RGBA8 unless given, in MiB', () => {
    expect(bakeMB(1024, 1024)).toBe(4)
    expect(bakeMB(1024, 1024, 16)).toBe(16)
    expect(bakeMB(8192, 1, 16)).toBe(0.125)
    expect(bakeMB(0, 4096)).toBe(0)
  })
})

describe("the camera's hold a frame (holdView, clearBelow in src/look/spec.ts, run by src/look/post.ts)", () => {
  const c = SPEC.camera
  const view = (radius: number, x = 0, z = 0) => ({ alpha: -2, beta: c.betaMax, radius, target: { x, y: c.focusY, z } })
  it('keeps the focus within the play area', () => {
    const z = new ZoomHold()
    const v = view(100, 400, -300)
    holdView(SPEC, z, v, () => 0, clearBelow(SPEC))
    expect([v.target.x, v.target.z]).toEqual([SPEC.play, -SPEC.play])
  })
  it('never reads the ground from clearBelow out (the eye clears the highest ground there)', () => {
    expect(clearBelow(SPEC)).toBeLessThan(TUNED_R) // (today's zooms, 45 m out, never read it)
    const reads: number[] = []
    const ground = (x: number) => {
      reads.push(x)
      return SPEC.ground.hi
    }
    holdView(SPEC, new ZoomHold(), view(clearBelow(SPEC)), ground, clearBelow(SPEC))
    expect(reads).toEqual([])
    holdView(SPEC, new ZoomHold(), view(clearBelow(SPEC) - 1), ground, clearBelow(SPEC))
    expect(reads.length).toBeGreaterThan(0)
  })
  it("holds the zoom out over a hill and brings the player's zoom back past it (#145)", () => {
    const z = new ZoomHold()
    const hill = (x: number) => (x > 50 && x < 150 ? 18 : 0)
    const v = view(c.rMin, -100)
    // (the eye about 5 m short of the focus in x: over the hill from a focus about 55 m on)
    const frames = (x: number) => {
      v.target.x = x
      holdView(SPEC, z, v, hill, clearBelow(SPEC))
      return v.radius
    }
    expect(frames(-100)).toBe(c.rMin)
    const held = frames(100)
    expect(held).toBeGreaterThan(c.rMin)
    expect(v.radius * Math.cos(c.betaMax) + c.focusY - 18).toBeGreaterThanOrEqual(c.clearance)
    expect(frames(220)).toBe(c.rMin) // (panned past it: the player's zoom, not the held one)
    expect(z.wanted).toBe(c.rMin)
  })
})

describe('heightfield', () => {
  // a 2×2-cell field with a known saddle: the split decides the answer inside each cell
  const h = new Float32Array([0, 1, 2, 3, 4, 5, 6, 7, 8])
  const hf: Heightfield = { n: 3, cell: 2, x0: -2, z0: -2, h, min: 0, max: 8 }
  setHeightfield(hf, { ...hf }, 100)
  it('returns the nodes at the nodes', () => {
    for (let j = 0; j < 3; j++) {
      for (let i = 0; i < 3; i++) expect(heightAt(-2 + 2 * i, -2 + 2 * j)).toBeCloseTo(h[j * 3 + i], 6)
    }
  })
  it('splits each cell from (x1, z0) to (x0, z1), as CreateGround does', () => {
    h[4] = 10 // raise the centre node (1, 1): it is corner 11 of cell (0, 0), on that cell's upper-right triangle only
    expect(heightAt(-1.5, -1.5)).toBeCloseTo(0 + 0.25 * 1 + 0.25 * 3, 6) // lower-left triangle: no centre node
    expect(heightAt(-0.5, -0.5)).toBeGreaterThan(5) // upper-right triangle: pulled up by it
    h[4] = 4
  })
})

describe('look data', () => {
  it('round-trips through encode and decode', () => {
    const bytes = buildLookData()
    const d = decodeLook(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)
    expect(Buffer.compare(Buffer.from(encodeLook(d)), Buffer.from(bytes))).toBe(0)
    expect(d.hf.n).toBe(SPEC.tileSub + 1 + 2 * derive(SPEC).hfMargin)
  })
  it('refuses data built for another spec', () => {
    const bytes = buildLookData()
    const d = decodeLook(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)
    expect(() => checkLookData(derive(SPEC), d)).not.toThrow()
    expect(() =>
      checkLookData(
        derive(
          with_(s => {
            s.aoMargin = 60
            s.aoRing = 60
          }),
        ),
        d,
      ),
    ).toThrow(/heightfield .* nodes/)
    expect(() =>
      checkLookData(
        derive(
          with_(s => {
            s.far = 2600 + (2 * 2600) / 182
            s.farSub = 184
          }),
        ),
        d,
      ),
    ).toThrow(/far ring/)
    expect(() =>
      checkLookData(
        derive(
          with_(s => {
            s.water.texel = 1
          }),
        ),
        d,
      ),
    ).toThrow(/water data/)
    expect(() =>
      checkLookData(
        derive(
          with_(s => {
            s.macro.cover = 4
          }),
        ),
        d,
      ),
    ).toThrow(/cover/)
  })
  it('the committed file is what the authoring step builds (else run node tools/build-look-data.ts)', () => {
    expect(Buffer.compare(fs.readFileSync(LOOK_FILE), Buffer.from(buildLookData()))).toBe(0)
  })
})
