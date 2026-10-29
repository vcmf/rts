// The look world's spec, heightfield and data (docs/plans/done/l0-spine.md, L0a): every invariant throws on a
// spec that breaks it (each with a negative case), heightAt follows the mesh's triangle split, and the committed
// look data is what the authoring step builds now.
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  FOLLOW,
  FocusFollow,
  SPEC,
  TUNED_R,
  ZoomHold,
  bakeMB,
  bakesMB,
  checkView,
  clearBelow,
  clearRadius,
  derive,
  eyeReach,
  footprintOf,
  groundOf,
  groundUnder,
  holdView,
  maxGrid,
  nearFrameOf,
  nearReachOf,
  shadowMapSize,
  spreadOf,
  type HoldGround,
  type NodeGrid,
  type Spec,
  type WorldGround,
} from '../src/look/spec.ts'
import { groundAt, heightAt, setHeightfield, type Heightfield } from '../src/look/heightfield.ts'
import { checkLookData, decodeLook, encodeLook } from '../src/look/world/data.ts'
import { longIt } from './fx.ts'
import { LOOK_FILE, buildLookData } from '../tools/build-look-data.ts'

const with_ = (f: (s: Spec) => void): Spec => {
  const s = structuredClone(SPEC)
  f(s)
  return s
}

// the ground SPEC assumed before A1b: the tile 0..25 m, the focus on its 8 m plane
const OLD: WorldGround = { lo: 0, hi: 25, farLo: 0, focus: [8, 8] }

describe('world spec', () => {
  it('derives the real spec', () => {
    const d = derive(SPEC)
    expect(d.farCell / d.cell).toBeCloseTo(8, 12)
    expect(SPEC.play + checkView(SPEC, OLD).footprint).toBeLessThanOrEqual(SPEC.far / 2)
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
})

describe("the camera's reach (footprintOf, nearReachOf, checkView)", () => {
  it('is what checkView checks, the frame below the focus within the margin on the old range, the whole frame farther', () => {
    const near = nearReachOf(SPEC, OLD)
    expect(footprintOf(SPEC, OLD)).toBe(checkView(SPEC, OLD).footprint)
    expect(near).toBeGreaterThan(0)
    expect(near).toBeLessThanOrEqual(SPEC.margin)
    expect(near).toBeLessThan(footprintOf(SPEC, OLD))
  })
  it('reaches farther on a wider frame, at a longer zoom and with the focus higher over the ground', () => {
    const fp = footprintOf(SPEC, OLD)
    expect(
      footprintOf(
        with_(s => (s.camera.aspectMax = 2.4)),
        OLD,
      ),
    ).toBeGreaterThan(fp)
    expect(
      footprintOf(
        with_(s => (s.camera.rMax = 300)),
        OLD,
      ),
    ).toBeGreaterThan(fp)
    expect(
      nearReachOf(
        with_(s => (s.camera.rMax = 300)),
        OLD,
      ),
    ).toBeGreaterThan(nearReachOf(SPEC, OLD))
    expect(footprintOf(SPEC, { ...OLD, focus: [8, 40] })).toBeGreaterThan(fp)
    expect(nearReachOf(SPEC, { ...OLD, focus: [8, 40] })).toBeGreaterThan(nearReachOf(SPEC, OLD))
  })
  it("is Infinity when a frame corner nears the horizon, the frame's bottom still finite", () => {
    const low = with_(s => (s.camera.betaMax = 1.4))
    expect(footprintOf(low, OLD)).toBe(Infinity)
    expect(Number.isFinite(nearReachOf(low, OLD))).toBe(true)
  })
  it('is Infinity below the focus when the eye could not clear the highest tile ground within rMax', () => {
    const high = { ...OLD, hi: 300 }
    expect(nearReachOf(SPEC, high)).toBe(Infinity)
    // (the whole frame reaches farthest on the lowest ground)
    expect(footprintOf(SPEC, high)).toBe(footprintOf(SPEC, OLD))
    expect(() => checkView(SPEC, high)).toThrow(/inside the highest tile ground/)
  })
  it('refuses a world whose frame would see past the far ring, or whose ranges are out of order', () => {
    expect(() => checkView(SPEC, { ...OLD, farLo: -400 })).toThrow(/sees past the world/)
    expect(() => checkView(SPEC, { ...OLD, focus: [9, 8] })).toThrow(/out of order/)
  })
})

describe('the focus on the ground (FocusFollow, groundUnder)', () => {
  const plane = (x: number, z: number) => 10 + 0.2 * x - 0.1 * z
  it('reads a plane at the focus, and a narrow ditch at a fraction of its depth', () => {
    expect(groundUnder(plane, 30, -20, 12)).toBeCloseTo(plane(30, -20), 9)
    const ditch = (x: number) => (Math.abs(x) < 1 ? -2 : 0)
    // (3 samples of 13 in a ditch through the focus, the most a ditch narrower than the rings' spacing takes)
    expect(groundUnder(ditch, 0, 0, 12)).toBeCloseTo((3 * -2) / 13, 9)
  })
  it('spreads with the zoom, within its limits', () => {
    expect(spreadOf(SPEC.camera.rMin)).toBe(FOLLOW.spreadMin)
    expect(spreadOf(100)).toBeCloseTo(15, 9)
    expect(spreadOf(SPEC.camera.rMax)).toBe(FOLLOW.spreadMax)
  })
  it('keeps a world of one height on it without reading the ground', () => {
    const f = new FocusFollow([8, 8])
    const no = () => {
      throw new Error('read')
    }
    expect(f.step(0, 0, 125, 0, no)).toBe(8)
    expect(f.step(3, 0, 125, 1 / 60, no)).toBe(8)
  })
  it('takes the first frame and a jump at once, eases up a slope, follows down it at once', () => {
    const f = new FocusFollow([0, 100])
    const step = (x: number) => f.step(x, 0, 20, 1 / 60, plane)
    expect(step(0)).toBeCloseTo(10, 9)
    // a pan up the slope (1.8 m a frame of 1/60 s: a fast pan at 20 m): below the ground, rising every frame
    let y = 10
    for (let x = 1.8; x < 60; x += 1.8) {
      const v = step(x)
      expect(v).toBeGreaterThan(y)
      expect(v).toBeLessThan(plane(x, 0))
      y = v
    }
    // held still, it settles on the ground within a few easing times
    let v = 0
    for (let i = 0; i < 240; i++) v = f.step(59.4, 0, 20, 1 / 60, plane)
    expect(v).toBeCloseTo(plane(59.4, 0), 3)
    // down the slope: on the ground every frame (never above it)
    expect(step(50)).toBeCloseTo(plane(50, 0), 9)
    // a jump (a tool's new view): at once
    expect(step(-40)).toBeCloseTo(plane(-40, 0), 9)
  })
  it("clamps to the world's focus range", () => {
    const f = new FocusFollow([12, 20])
    expect(f.step(-100, 0, 20, 0, plane)).toBe(12)
    expect(f.step(100, 0, 20, 0, plane)).toBe(20)
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
  // a world as the hold reads it: the ground, its highest within a reach (here: everywhere), the demo's 8 m plane
  const world = (ground: (x: number, z: number) => number, top: number, focus: [number, number] = [8, 8]) =>
    ({ ground, highest: () => top, follow: new FocusFollow(focus) }) satisfies HoldGround
  it('keeps the focus within the play area', () => {
    const v = view(100, 400, -300)
    holdView(
      SPEC,
      new ZoomHold(),
      v,
      world(() => 0, 0),
      0,
    )
    expect([v.target.x, v.target.z]).toEqual([SPEC.play, -SPEC.play])
  })
  it('never reads the ground from clearBelow out (the eye clears the highest ground within its reach there)', () => {
    expect(clearBelow(SPEC, 25 - c.focusY)).toBeLessThan(TUNED_R) // (the demo's zooms, 45 m out, never read it)
    expect(eyeReach(SPEC)).toBeCloseTo(c.rMax * Math.sin(c.betaMax), 9)
    const reads: number[] = []
    const ground = (x: number) => {
      reads.push(x)
      return 25
    }
    const below = clearBelow(SPEC, 25 - c.focusY)
    holdView(SPEC, new ZoomHold(), view(below), world(ground, 25), 0)
    expect(reads).toEqual([])
    holdView(SPEC, new ZoomHold(), view(below - 1), world(ground, 25), 0)
    expect(reads.length).toBeGreaterThan(0)
  })
  it('reads the rise near the focus, not the world: on a high plateau with the focus on it, 20 m is not held', () => {
    const v = view(20)
    holdView(
      SPEC,
      new ZoomHold(),
      v,
      world(() => 67, 68, [30, 67]),
      0,
    )
    expect(v.target.y).toBe(67)
    expect(v.radius).toBe(20)
  })
  it("holds the zoom out over a hill and brings the player's zoom back past it (#145)", () => {
    const z = new ZoomHold()
    const hill = (x: number) => (x > 50 && x < 150 ? 18 : 0)
    const w = world(hill, 18)
    const v = view(c.rMin, -100)
    // (the eye about 5 m short of the focus in x: over the hill from a focus about 55 m on)
    const frames = (x: number) => {
      v.target.x = x
      holdView(SPEC, z, v, w, 1 / 60)
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

// (these set the heightfield: after the heightfield's own tests)
describe("a world's ground from its data (groundOf, maxGrid)", () => {
  // a 5×5 grid of 100 m cells from −200 m: a ridge along x = 100, the far ring a flat 2 m
  const n = 5
  const h = new Float32Array(n * n).map((_, k) => (k % n === 3 ? 30 : 4 + (k % n)))
  const hf: NodeGrid = { n, cell: 100, x0: -200, z0: -200, h }
  const far: NodeGrid = { n: 2, cell: 2000, x0: -1000, z0: -1000, h: new Float32Array([2, 2, 2, 2]) }
  it("takes the tile's range, the far ring's lowest, and the focus's range in play (or the world's plane)", () => {
    const s = with_(v => (v.play = 150))
    expect(groundOf(s, hf, far, null)).toEqual({ lo: 4, hi: 30, farLo: 2, focus: [5, 30] }) // (x −100 to 100 in play)
    expect(groundOf(s, hf, far, 8).focus).toEqual([8, 8])
  })
  it('bounds the ground within a reach: never under a node it holds, never the far side of the grid', () => {
    const top = maxGrid(hf, 2)
    expect(top(-200, 0, 10)).toBe(6) // (blocks of 2 cells: x −200..0 holds the nodes at −200, −100 and 0)
    expect(top(-200, 0, 250)).toBe(30)
    expect(top(100, 100, 1)).toBe(30)
    expect(top(5000, 0, 10)).toBe(-Infinity)
  })
  it('holds every point of the ground drawn (bilinear in a cell) under the bound at that point', () => {
    setHeightfield({ ...hf, h, min: 4, max: 30 }, { ...hf, h }, 1e4)
    const top = maxGrid(hf, 1)
    for (let k = 0; k < 200; k++) {
      const x = -200 + ((k * 37) % 400)
      const z = -200 + ((k * 91) % 400)
      expect(groundAt(x, z)).toBeLessThanOrEqual(top(x, z, 0) + 1e-9)
    }
  })
})

describe("each world's data against the camera (checkView, nearFrameOf)", () => {
  for (const file of fs.readdirSync('data').filter(f => f.endsWith('.lookdata'))) {
    longIt(`${file}: the whole frame inside the far ring, the frame below the focus row inside the tile`, () => {
      const b = fs.readFileSync(`data/${file}`)
      const d = decodeLook(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer)
      setHeightfield(d.hf, d.far, SPEC.tile / 2)
      const g = groundOf(SPEC, d.hf, d.far, d.world.kind === 'map' ? null : SPEC.camera.focusY)
      expect(() => checkView(SPEC, g)).not.toThrow()
      // the follow's want (it is never above it)
      const [lo, hi] = g.focus
      const focusY = (x: number, z: number, r: number) =>
        lo === hi ? lo : Math.max(lo, Math.min(hi, groundUnder(groundAt, x, z, spreadOf(r))))
      expect(nearFrameOf(SPEC, groundAt, focusY)).toBeLessThanOrEqual(SPEC.tile / 2)
    })
  }
})
