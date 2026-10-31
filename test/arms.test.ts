// The armies demo's other arms (docs/plans/done/cavalry-artillery-demo.md): their scripts (src/look/world/arms.ts:
// the infantry's behind the same interface, unchanged; a ride; a service), their places on the demo map clear of the
// infantry and of one another, their figures (data/figures/fr-cuirassier.unitdata, fr-foot-artillery.unitdata,
// written by tools/bake-figure.py) whole, dressed from the dyes, and their shadows' pure parts: the contacts' spread,
// the shape's heights (their mean, a regression), the texel fitted to a big figure
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { describe, expect, it, vi } from 'vitest'
import { napoleonic } from '../src/rulesets/napoleonic.ts'
import { UNIFORMS } from '../src/rulesets/napoleonic-uniforms.ts'
import { DYES } from '../src/rulesets/napoleonic-dyes.ts'
import { CYCLE, layout, manAt, phaseAt, slots, type Drill, type ManState } from '../src/look/world/armies.ts'
import {
  armScript,
  battalionBoxes,
  boxOf,
  drillScript,
  formationSlots,
  lookAtSpot,
  placeArm,
  placeArmUnits,
  rideDistance,
  rideScript,
  serveScript,
  serveOrder,
  type Box,
} from '../src/look/world/arms.ts'
import { dressAll, dressed, FIGURE_PARTS } from '../src/look/world/dyes.ts'
import { ARMIES_DEMO, ARMS_DEMO } from '../src/scenarios/armies-demo.ts'
import {
  FIGURE_HEIGHT,
  LEGACY_ROLES,
  MAN_R,
  manRadius,
  groundFollowY,
  MAX_ROLES,
  SPREAD_FROM,
  cellHeights,
  checkFigure,
  contactReach,
  decodeUnits,
  fitTexel,
  halved,
  heightAt,
  PLANE,
  planeAt,
  trianglePlane,
  posedVertices,
  shadowShape,
  type UnitData,
} from '../src/look/units-data.ts'
import { bakePair, contactFor, decalStrip, gradientAlong, shadowHeightScale } from '../src/look/shadow-look.ts'
import { TR_EVERY, takeSteps, treadDue } from '../src/look/trodden.ts'

const figure = (name: string): UnitData =>
  decodeUnits(new Uint8Array(readFileSync(new URL(`../data/figures/${name}.unitdata`, import.meta.url))).buffer)
const INFANTRY = figure('fr-line-infantry')
const CAVALRY = figure('fr-cuirassier')
const BATTERY = figure('fr-foot-artillery')
const SUN = (() => {
  const v = [-0.7, 0.45, 0.55]
  const l = Math.hypot(...v)
  return v.map(x => x / l) as [number, number, number]
})()
const man = (): ManState => ({ x: 0, z: 0, face: 0, role: '', since: 0, moving: false })
const speedsOf = (d: UnitData) => Object.fromEntries(Object.entries(d.ranges).map(([k, r]) => [k, r.speed]))

describe("the infantry's script behind the arms' interface (drillScript)", () => {
  const g = napoleonic.types.infantry.geometry
  const d: Drill = { ...g }
  const sp = { march: 0.9, run: 3.2 }
  const s = drillScript(d, sp)
  it("gives phaseAt's phases, manAt's men, the line's bearer and the cycle as before", () => {
    const sl = slots(d)
    expect([s.men, s.cycle, s.fileSpacing]).toEqual([sl.line.length, CYCLE, d.fileSpacing])
    for (const t of [0, 30, 46, 52, 70, 109]) {
      const p = s.phase(t, false)
      expect(p).toEqual(phaseAt(d, t, sp.march, sp.run))
      for (const i of [0, 77, 413]) {
        expect(s.man(i, t, p, 0.3, man())).toEqual(manAt(d, sl, i, t, p, sp.run, sp.march, 0.3, man()))
      }
      expect(s.moving(p)).toBe(p.phase === 'column' || p.phase === 'deploy')
    }
    expect(s.phase(30, true).phase).toBe('halt')
    const [bx, bz] = sl.line[s.bearer]
    expect(Math.abs(bx)).toBeLessThanOrEqual(d.fileSpacing + 1e-9) // (six companies: the gap between two at the middle)
    expect(bz).toBeCloseTo(-d.rankSpacing, 9)
  })
})

describe('a ride (rideScript)', () => {
  const places: [number, number][] = [
    [0, 0],
    [1, 0],
    [0, -3],
  ]
  const legs = [
    { role: 'halt', seconds: 2 },
    { role: 'walk', seconds: 4 },
    { role: 'trot', seconds: 3 },
    { role: 'halt', seconds: 1 },
  ]
  const speeds = { halt: 0, walk: 1.5, trot: 3 }
  const s = rideScript(places, legs, speeds, 1)
  it("goes leg by leg at each role's speed, halted where it ends, and starts again where it began", () => {
    expect(s.cycle).toBe(10)
    expect(s.roles).toEqual(['halt', 'walk', 'trot'])
    const at = (t: number) => s.man(1, t, s.phase(t, false), 0, man())
    expect(at(1)).toMatchObject({ x: 1, z: 0, role: 'halt', moving: false })
    expect(at(4).z).toBeCloseTo(3, 9)
    expect(at(4)).toMatchObject({ role: 'walk', moving: true })
    expect(at(7.5).z).toBeCloseTo(6 + 4.5, 9)
    expect(at(9.5).z).toBeCloseTo(15, 9)
    expect(at(9.5).role).toBe('halt')
    expect(rideDistance(legs, [0, 2, 6, 9], speeds, 10)).toBeCloseTo(15, 9)
  })
  it("names a new phase each leg, moving only while its role has a speed, each man's clip from the leg's start", () => {
    expect([1, 3, 7, 9.5].map(t => s.phase(t, false).phase)).toEqual(['0:halt', '1:walk', '2:trot', '3:halt'])
    expect([1, 3, 7, 9.5].map(t => s.moving(s.phase(t, false)))).toEqual([false, true, true, false])
    expect(s.man(0, 7, s.phase(7, false), 0.5, man()).since).toBeCloseTo(6 + 0.5 * 0.4, 9)
  })
  it('refuses a leg whose role has no speed, or a leg of no time', () => {
    expect(() => rideScript(places, [{ role: 'canter', seconds: 2 }], speeds, 1)).toThrow(/canter/)
    expect(() => rideScript(places, [{ role: 'walk', seconds: 0 }], speeds, 1)).toThrow(/lasts/)
  })
  it('carries its leg on its phase', () => {
    expect([1, 3, 7, 9.5].map(t => s.phase(t, false).leg)).toEqual([0, 1, 2, 3])
  })
})

describe('a service (serveScript)', () => {
  const places: [number, number][] = [0, 1, 2, 3].map(i => [i * 16, 0])
  const s = serveScript(places, { rest: 'halt', work: 'fire' }, { rest: 5, lag: 2, cycle: 30 }, 16)
  it('rests, then starts each piece lag s after the one before, the right of the line first, never moving', () => {
    // (the places from left, x 0, to right, x 48: the rightmost starts first)
    const roles = (t: number) => places.map((_, i) => s.man(i, t, s.phase(t, false), 0, man()).role)
    expect(roles(4)).toEqual(['halt', 'halt', 'halt', 'halt'])
    expect(roles(5.5)).toEqual(['halt', 'halt', 'halt', 'fire'])
    expect(roles(9.5)).toEqual(['halt', 'fire', 'fire', 'fire'])
    expect(roles(29)).toEqual(['fire', 'fire', 'fire', 'fire'])
    expect([4, 5.5, 7.5, 9.5, 11.5].map(t => s.phase(t, false).started)).toEqual([0, 1, 2, 3, 4])
    expect(s.moving(s.phase(20, false))).toBe(false)
    expect(s.man(1, 20, s.phase(20, false), 0, man()).since).toBe(9)
    expect(
      serveOrder([
        [5, 0],
        [-5, 0],
        [20, 0],
      ]),
    ).toEqual([1, 2, 0])
  })
  it('refuses pieces that cannot all start within the cycle', () => {
    expect(() => serveScript(places, { rest: 'h', work: 'f' }, { rest: 20, lag: 5, cycle: 30 }, 16)).toThrow(/cycle/)
  })
})

describe("the arms' places (placeArm, formationSlots)", () => {
  it("stands a regiment's squadrons as the ruleset's column, files across, ranks behind", () => {
    const t = napoleonic.types.cavalry
    const p = formationSlots(t.geometry, t.formations.column.place)
    const g = t.geometry
    expect(p.length).toBe(g.companies * g.files * g.ranks)
    expect(Math.max(...p.map(q => q[0])) - Math.min(...p.map(q => q[0]))).toBeCloseTo((g.files - 1) * g.fileSpacing, 9)
    expect(p[g.files]).toEqual([p[0][0], p[0][1] - g.rankSpacing])
  })
  const open = () => false
  it('takes the wanted spot when it is clear, on its own half, clear of what is taken', () => {
    const foot = { a0: -5, a1: 5, z0: -2, z1: 2 }
    const taken: Box[] = []
    const a = placeArm(foot, 0, { turn: 0, ahead: 10, across: 20 }, [0, 0], 55, open, taken)
    expect(a).toEqual({ x: 20, z: -45, heading: 0 })
    const b = placeArm(foot, 1, { turn: 0, ahead: 10, across: 20 }, [0, 0], 55, open, taken)
    expect(b).toMatchObject({ x: 20, z: 45 })
    expect(b?.heading).toBeCloseTo(Math.PI, 12)
    // (a second unit at the same spot moves, along the front first)
    const c = placeArm(foot, 0, { turn: 0, ahead: 10, across: 20 }, [0, 0], 55, open, taken)
    expect(c?.z).toBe(-45)
    expect(Math.abs((c?.x ?? 0) - 20)).toBeGreaterThanOrEqual(10)
    expect(taken.length).toBe(3)
  })
  it("never crosses into the other side's half, and is null with no room", () => {
    const foot = { a0: -5, a1: 5, z0: -2, z1: 60 }
    const p = placeArm(foot, 0, { turn: 0, ahead: 40, across: 0 }, [0, 0], 55, open, [])
    expect(p && boxOf(p.x, p.z, p.heading, -5, 5, -2, 60).z1).toBeLessThanOrEqual(0)
    expect(placeArm(foot, 0, { turn: 0, ahead: 10, across: 0 }, [0, 0], 55, () => true, [])).toBeNull()
  })
  // the demo map's blocked ground (test/armies.test.ts reads it the same way)
  const bits = gunzipSync(readFileSync(new URL('./fixtures/demo-map-blocked.bin.gz', import.meta.url)))
  const N = 961
  const bit = (i: number, j: number) =>
    i < 0 || j < 0 || i >= N || j >= N || ((bits[(j * N + i) >> 3] >> ((j * N + i) & 7)) & 1) === 1
  const demo = (x: number, z: number) => {
    const i = Math.floor((x + 240) / 0.5)
    const j = Math.floor((z + 240) / 0.5)
    return bit(i, j) || bit(i + 1, j) || bit(i, j + 1) || bit(i + 1, j + 1)
  }
  const drill: Drill = { ...napoleonic.types.infantry.geometry }
  it('fields each arm on both sides of the demo map at 1 to 40 battalions, clear of the infantry and of one another', () => {
    for (const n of [1, 10, 20, 40]) {
      const bs = layout(n, drill, demo, ARMIES_DEMO.sides)
      const taken = battalionBoxes(bs, drill)
      const inf = taken.length
      for (const spec of ARMS_DEMO) {
        const t = napoleonic.types[spec.unitType]
        const d = spec.figure === 'fr-cuirassier' ? CAVALRY : BATTERY
        const { foot } = armScript(spec, t.geometry, t.formations[spec.formation].place, speedsOf(d))
        const units = placeArmUnits(spec, foot, [0, 0], 55, demo, taken)
        expect(
          units.map(u => u.side),
          `${spec.name} at ${n}`,
        ).toEqual([0, 1])
      }
      const arms = taken.slice(inf)
      for (const [i, a] of arms.entries()) {
        for (const b of taken.slice(0, inf + i)) {
          expect(a.x0 >= b.x1 || b.x0 >= a.x1 || a.z0 >= b.z1 || b.z0 >= a.z1, `n ${n}`).toBe(true)
        }
        for (let x = a.x0; x <= a.x1; x += 2.5) for (let z = a.z0; z <= a.z1; z += 2.5) expect(demo(x, z)).toBe(false)
      }
    }
  })
  it('warns and leaves a side out when it has no room', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const spec = ARMS_DEMO[0]
    const t = napoleonic.types[spec.unitType]
    const { foot } = armScript(spec, t.geometry, t.formations[spec.formation].place, speedsOf(BATTERY))
    expect(placeArmUnits(spec, foot, [0, 0], 55, () => true, [])).toEqual([])
    expect(warn).toHaveBeenCalledTimes(2)
    warn.mockRestore()
  })
})

describe('the figures (fr-cuirassier, fr-foot-artillery)', () => {
  it('decode whole: their roles in order, at most four, each with a clip; their parts; their height', () => {
    expect(CAVALRY.roles).toEqual(['halt', 'walk', 'trot', 'gallop'])
    expect(BATTERY.roles).toEqual(['halt', 'fire'])
    for (const d of [CAVALRY, BATTERY]) {
      expect(d.roles.length).toBeLessThanOrEqual(MAX_ROLES)
      expect(Object.keys(d.parts ?? {}).sort()).toEqual([...d.palette].sort())
      expect(d.lods.map(l => l.triangles)).toEqual([...d.lods.map(l => l.triangles)].sort((a, b) => b - a))
      expect(d.bones.length).toBeLessThan(255)
    }
    expect(CAVALRY.height).toBeGreaterThan(2.4)
    expect(BATTERY.height).toBeGreaterThan(1.6)
    expect(CAVALRY.ranges.walk.speed).toBeCloseTo(1.7, 3)
    expect(CAVALRY.ranges.gallop.speed).toBeGreaterThan(CAVALRY.ranges.trot.speed)
  })
  // the owner, 2026-10-28: lighter horses, under +1 ms with a regiment in view (the plan's horse bench)
  it("switches the horse's LODs at a man's height, its own height kept for its shadow; the others at their own", () => {
    expect([CAVALRY.lodHeight, CAVALRY.height > 2.4]).toEqual([1.8, true])
    expect(BATTERY.lodHeight).toBe(BATTERY.height)
    const u = readFileSync(new URL('../src/look/units.ts', import.meta.url), 'utf8').replace(/\s+/g, '')
    expect(u).toContain('this.farK.set(this.lodH*pxPerM,this.lodPx)')
    expect(u).toContain('this.drawsAt(h,px,split,camPos,this.lodH*pxPerM,tinyBand)')
    expect(u).toContain('this.shadowTip=(this.figH*Math.hypot(SUN.x,SUN.z))/SUN.y')
  })
  it("bakes the horse's LODs light, the faces the RTS camera never sees culled: under the infantryman's per pixel", () => {
    const tris = CAVALRY.lods.map(l => l.triangles)
    expect(tris[0]).toBeLessThan(1200)
    expect(tris[1]).toBeLessThan(300)
  })
  it('gives the horse no nearest LOD (its near drawn up close: the owner, 2026-10-29), the others theirs', () => {
    // (the figure's file says which it has: two LODs, no nearest; units.ts draws a figure with two so, none shipped)
    expect(CAVALRY.lods.map(l => l.name)).toEqual(['lod1', 'lod2'])
    expect(INFANTRY.lods.length).toBe(3)
    expect(BATTERY.lods.length).toBe(3)
    const u = readFileSync(new URL('../src/look/units.ts', import.meta.url), 'utf8').replace(/\s+/g, '')
    expect(u).toContain('this.hasNearest=data.lods.length>2')
  })
  it("the infantryman's file (none of the fields): the legacy roles, his parts the page's own, 1.8 m", () => {
    expect([INFANTRY.roles, INFANTRY.parts, INFANTRY.height, INFANTRY.lodHeight]).toEqual([
      [...LEGACY_ROLES],
      null,
      FIGURE_HEIGHT,
      FIGURE_HEIGHT,
    ])
  })
  it('checkFigure finds a role without clips, too many roles, a colour role without a part', () => {
    const base = {
      roles: ['a'],
      ranges: { a: CAVALRY.ranges.halt },
      parts: { x: 'coat' },
      palette: ['x'],
      height: 2,
      lodHeight: 1.8,
    }
    expect(checkFigure(base)).toEqual([])
    expect(checkFigure({ ...base, roles: ['a', 'b'] })[0]).toMatch(/b has no clip/)
    expect(checkFigure({ ...base, roles: ['a', 'a', 'a', 'a', 'a'] })[0]).toMatch(/1 to 4/)
    expect(checkFigure({ ...base, palette: ['x', 'y'] })[0]).toMatch(/y names no part/)
  })
  it('are dressed from the dyes for their own parts: every arm uniform, never a raw colour', () => {
    for (const spec of ARMS_DEMO) {
      const d = spec.figure === 'fr-cuirassier' ? CAVALRY : BATTERY
      const dress = Object.fromEntries(spec.sides.map(id => [id, UNIFORMS[id]]))
      const worn = dressAll(dress, DYES, { parts: d.parts ?? undefined })
      for (const id of spec.sides) {
        expect(Object.keys(worn[id].colours).sort()).toEqual([...d.palette].sort())
        for (const c of Object.values(worn[id].colours)) {
          expect([...Object.values(DYES.dyes), ...Object.values(DYES.materials)]).toContain(c)
        }
      }
    }
    expect(dressed(UNIFORMS['fr-foot-artillery'], DYES, { parts: BATTERY.parts ?? undefined }).colours.paint).toBe(
      DYES.dyes['carriage-olive'],
    )
  })
  it('refuses a part that is no cloth part, the boots or a material', () => {
    expect(() => dressed(UNIFORMS['fr-line'], DYES, { parts: { ...FIGURE_PARTS, coat: 'hat' } })).toThrow(/hat/)
  })
})

describe("the spread figures' shadows", () => {
  it('spread past their root: a horse and a gun, not the infantryman', () => {
    const reach = (d: UnitData) => contactReach(posedVertices(d, d.lods[d.lods.length - 1].name))
    expect(reach(INFANTRY)).toBeLessThan(SPREAD_FROM)
    expect(reach(CAVALRY)).toBeGreaterThan(SPREAD_FROM)
    expect(reach(BATTERY)).toBeGreaterThan(SPREAD_FROM)
  })
  it("keeps the infantryman's texel, and grows a big figure's until its cells fit", () => {
    expect(fitTexel(0.05, 4, 6, 0.2, 192)).toBe(0.05)
    const t = fitTexel(0.05, 8, 12, 0.2, 192)
    expect(t).toBeGreaterThan(0.05)
    expect(Math.ceil(12 / t / 8) * 8 + 2 * Math.ceil(0.2 / t / 8) * 8 + 16).toBeLessThanOrEqual(192)
  })
  it('reads a height across a projected triangle, held within its corners; edge on, its lowest', () => {
    expect(heightAt(0, 0, 10, 0, 0, 10, [0, 1, 2], 5, 0)).toBeCloseTo(0.5, 12)
    expect(heightAt(0, 0, 10, 0, 0, 10, [0, 1, 2], 0, 5)).toBeCloseTo(1, 12)
    expect(heightAt(0, 0, 10, 0, 0, 10, [0, 1, 2], -3, -3)).toBe(0)
    expect(heightAt(0, 0, 1, 1, 2, 2, [3, 1, 2], 1, 1)).toBe(1)
  })
  it('reads the same heights from its plane a triangle at a time as point by point', () => {
    const p = new Float64Array(PLANE)
    trianglePlane(0, 0, 10, 0, 0, 10, 0, 1, 2, p)
    for (const [x, y] of [
      [5, 0],
      [0, 5],
      [2, 3],
      [-3, -3],
      [9, 9],
    ] as const) {
      expect(planeAt(p, x, y)).toBeCloseTo(heightAt(0, 0, 10, 0, 0, 10, [0, 1, 2], x, y), 12)
    }
  })
  it("averages a cell's heights over its coverage; halves an image by its means", () => {
    const acc = new Float32Array(9)
    const accH = new Float32Array(9)
    acc[4] = 1
    accH[4] = 0.5
    const out = new Uint8Array(9)
    cellHeights(acc, accH, [1], 3, 3, [1, 1, 1, 1], 2, out, 0, 3)
    expect(out[4]).toBe(64)
    expect([...halved(Uint8Array.from([0, 2, 9, 9, 4, 6, 9, 9]), 4, 2)]).toEqual([3, 9])
  })
  // the review's finding: the heights were blurred only over the shape's own blur's reach, the soft bake's wider reach
  // left at the top, so a soft halo of 0.2 to 0.36 m round each hoof read as a shadow's tip, light and soft
  it("holds a contact's height across the soft reach past the blur's, the top only past the fill", () => {
    const iw = 40
    const acc = new Float32Array(iw * iw)
    const accH = new Float32Array(iw * iw)
    acc[20 * iw + 20] = 1
    accH[20 * iw + 20] = 0.1
    const out = new Uint8Array(iw * iw)
    cellHeights(acc, accH, [0.25, 0.5, 0.25], iw, iw, [20, 20, 20, 20], 2, out, 0, iw, undefined, 10)
    const v = Math.round((255 * 0.1) / 2)
    expect(out[20 * iw + 20]).toBe(v)
    expect(out[20 * iw + 28]).toBe(v) // (8 texels out: past the blur's 1, within the fill's 10)
    expect(out[28 * iw + 13]).toBe(v)
    expect(out[20 * iw + 39]).toBe(255) // (19 out: past the fill)
    expect(out[0]).toBe(255)
  })
  // the regression: the bin's coverage was divided by its steps before the blur and its heights' sum was not, so a
  // bin of n steps read n times too high (the halt's six-step bins all at the top: a horse's whole shadow light)
  it("reads the hooves low in every bin: each cell's median height under half the figure's", () => {
    const d = CAVALRY
    const far = d.lods[d.lods.length - 1].name
    const s = shadowShape(d, far, SUN, d.roles, { facings: 8, soft: 0.12, steps: 8, heights: true })
    const hw = s.width >> 1
    const H = s.heights ?? new Uint8Array(0)
    for (let row = 0; row < s.bins.reduce((a, b) => a + b, 0); row++) {
      const bx = Math.floor(row / s.rowsPerBlock) * 8
      const by = row % s.rowsPerBlock
      const vals: number[] = []
      for (let y = 0; y < s.cellH; y += 2) {
        for (let x = 0; x < s.cellW; x += 2) {
          const X = bx * s.cellW + x
          const Y = by * s.cellH + y
          if (s.data[(Y * s.width + X) * 2] > 128) vals.push(H[(Y >> 1) * hw + (X >> 1)])
        }
      }
      vals.sort((a, b) => a - b)
      expect(vals[vals.length >> 1], `row ${row}`).toBeLessThan(128)
    }
  }, 60000)
  it("lays a spread figure's close rows at its contacts' reach and the ramp past it, the soldier's as before", () => {
    const base = { across: [-1, 1], along: [-1, 6] } as const
    const full = { across: [-1.5, 1.5], along: [-1.5, 6.5] } as const
    expect(decalStrip(base, full, 0, 0.7, 1.5, 0, 0)).toEqual(decalStrip(base, full, 0, 0.7, 1.5))
    const s = decalStrip(base, full, 0, 1, 1.5, 0, 1.3)
    const at = (r: number) => s.box[1] + r * s.box[3]
    expect(at(s.rows[1])).toBeCloseTo(1.3, 9)
    expect(at(s.rows[2])).toBeCloseTo(2.8, 9)
  })
  it("floors a spread figure's lift over its footprint (unitdecal.vert, the source)", () => {
    const v = readFileSync(new URL('../src/look/shaders/unitdecal.vert', import.meta.url), 'utf8').replace(/\s+/g, '')
    expect(v).toContain('#ifdefSH_SPREAD')
    expect(v).toContain('floatlift=max(uDecalLift*smoothstep(0.0,LIFT_RAMP,l.y),SPREAD_FLOOR);')
  })
  // the review's finding (round 2): the scale chain end to end, the scale from the shape's own top (not the figure's
  // height), the shader's al as written (its uShLen dropped, the spread gradient no longer a soldier's)
  it("reads a spread figure's gradient over its shape as a soldier's: the real chain from the shape to the shader", () => {
    const d = BATTERY
    const far = d.lods[d.lods.length - 1].name
    const shape = shadowShape(d, far, SUN, d.roles, { facings: 8, soft: 0.12, steps: 0, heights: true })
    const sun = { x: SUN[0], y: SUN[1], z: SUN[2] }
    const scale = shadowHeightScale(shape.heightTop, sun)
    expect(Math.abs(shape.heightTop - d.height)).toBeGreaterThan(0.05) // (the figure's height would be another scale)
    const src = (f: string) => readFileSync(new URL(`../src/look/${f}`, import.meta.url), 'utf8').replace(/\s+/g, '')
    expect(src('units.ts')).toContain("m.setFloat('uShHeight',shadowHeightScale(shape.heightTop,SUN))")
    const line = /floatal=(hh\*uShHeight[^;]*);/.exec(src('shaders/unitdecal.frag'))
    expect(line, 'the heights path of unitdecal.frag').not.toBeNull()
    const al = new Function('hh', 'uShHeight', 'uShLen', `return ${line?.[1]}`) as (...a: number[]) => number
    // a texel's height h (its share of the top) casts h × top × tan along the ground: as far along as a soldier's sole
    // would be from his shadow's point there
    for (const len of [0.7, 1]) {
      for (const hh of [0.05, 0.3, 0.8]) {
        const cast = hh * shape.heightTop * (Math.hypot(sun.x, sun.z) / sun.y)
        expect(al(hh, scale, len)).toBeCloseTo(gradientAlong(false, cast, 0, len), 9)
        expect(gradientAlong(true, 0, cast, len)).toBeCloseTo(gradientAlong(false, cast, 0, len), 9)
      }
    }
  })
})

describe('the shapes baked in order (bakePair)', () => {
  const fake = () => ({ disposed: false })
  it('frees the per-step shape when the averaged one fails after it', () => {
    const near = fake()
    expect(() =>
      bakePair(
        () => near,
        () => {
          throw new Error('far')
        },
        b => (b.disposed = true),
        () => false,
      ),
    ).toThrow('far')
    expect(near.disposed).toBe(true)
  })
  it('falls back to no per-step shape when its failure allows, throws any other', () => {
    const big = new Error('too large')
    const r = bakePair(
      () => {
        throw big
      },
      fake,
      () => {},
      e => e === big,
    )
    expect([r.near, r.fellBack]).toEqual([null, big])
    expect(() =>
      bakePair(
        () => {
          throw new Error('other')
        },
        fake,
        () => {},
        e => e === big,
      ),
    ).toThrow('other')
  })
})

describe("the trodden mask's draws (takeSteps, treadDue)", () => {
  // the review's finding: the arms' moved flags were cleared every frame, drawn or not, so a column that halted
  // between two draws (TR_EVERY apart) was never trodden where it halted
  it("keeps an arm's steps until a draw takes them: a column halting between two draws is trodden where it halts", () => {
    const arm = { trod: false }
    let at = -1
    const frame = (T: number, moved: boolean) => {
      if (moved) arm.trod = true
      const drawn = takeSteps([arm], T, at)
      if (drawn) at = T
      return drawn
    }
    expect(frame(0, true)).toBe(true)
    expect(frame(0.1, true)).toBe(false) // (moved, too soon)
    expect(frame(0.2, false)).toBe(false) // (halted)
    expect(frame(0.3, false)).toBe(true) // (its last steps drawn)
    expect(frame(0.6, false)).toBe(false) // (nothing new)
    expect(TR_EVERY).toBe(0.25)
    expect(treadDue(false, 5, -1)).toBe(true)
  })
})

describe("a spread figure's contact and view sphere (contactFor, manRadius)", () => {
  // the review's finding (round 2): ?ushcontact=1 put one oval round a whole horse or a gun and its crew
  it("draws no contact oval for a figure on more than its root, the page's for a soldier", () => {
    const c = { pad: 0.1, dark: 1, soft: 0.5, mode: 'step' as const }
    expect(contactFor(c, 0)).toBe(c)
    expect(contactFor(c, 1.36)).toBeNull()
    expect(contactFor(null, 0)).toBeNull()
  })
  // the review's finding (round 2): the sphere was its reach alone, a horse's 1.4 m, under its 2.66 m height
  it("holds the whole figure: its reach across and half its height up and down, the infantryman's 1.6 m at least", () => {
    expect(manRadius(1.2, 2.66)).toBeCloseTo(Math.hypot(1.2, 1.33), 12)
    expect(manRadius(0.5, 1.8)).toBe(MAN_R)
    // a spread figure's sphere grows by the slope its vertices may follow, as its battalion's bounds (slopePad)
    expect(manRadius(1.2, 2.66, 0.96)).toBeCloseTo(Math.hypot(1.2, 1.33 + 0.96), 12)
    expect(manRadius(1.2, 2.66, 0)).toBe(manRadius(1.2, 2.66))
    expect(manRadius(1.2, 2.66, 0.5)).toBeGreaterThan(manRadius(1.2, 2.66))
    const u = readFileSync(new URL('../src/look/units.ts', import.meta.url), 'utf8').replace(/\s+/g, '')
    expect(u).toContain('this.manR=manRadius(reach,this.figH,this.slopePad)')
    const reach = (d: UnitData) => {
      const pv = posedVertices(d, d.lods[d.lods.length - 1].name)
      let r = 0
      for (let i = 0; i < pv.data.length; i += 8) r = Math.max(r, Math.hypot(pv.data[i], pv.data[i + 2]))
      return r
    }
    expect(manRadius(reach(CAVALRY), CAVALRY.height)).toBeGreaterThan(reach(CAVALRY))
    // (the infantryman's too: his musket's 1.7 m reach and his height, 1.95 m, not the 1.6 m it was)
    expect(manRadius(reach(INFANTRY), INFANTRY.height)).toBeCloseTo(Math.hypot(reach(INFANTRY), 0.9), 12)
  })
})

describe('a spread figure on sloping ground (GROUND_FOLLOW)', () => {
  // the owner's still, 2026-10-28 (output/armies-review/25-cavalry-artillery/owner/crew-legs-sunk.png): a gun and its
  // four gunners are one rigid figure placed at its root's ground, so on a slope the men downhill of the root sank to
  // the knees (1.04 m of drop within a piece's 3.6 m on the demo map) and those uphill floated
  const d = BATTERY
  const far = d.lods[d.lods.length - 1].name
  const pv = posedVertices(d, far)
  const slope = (x: number, z: number) => 0.3 * x + 0.1 * z
  // the posed far LOD's feet (its lowest vertices within 5 cm) at one step, placed at (10, 4) on the slope
  const feet = (follow: boolean) => {
    const nv = pv.width / 2
    const s = d.ranges.fire.start + 40
    const err: number[] = []
    const [rx, rz] = [10, 4]
    for (let v = 0; v < nv; v++) {
      const o = (s * nv * 2 + v * 2) * 4
      const [x, y, z] = [pv.data[o] + rx, pv.data[o + 1] + slope(rx, rz), pv.data[o + 2] + rz]
      if (pv.data[o + 1] > 0.05) continue
      const yy = follow ? groundFollowY(y, x, z, rx, rz, slope) : y
      err.push(Math.abs(yy - pv.data[o + 1] - slope(x, z)))
    }
    return Math.max(...err)
  }
  it("sets each foot, wheel and trail end on the ground under it, not at the root's height", () => {
    expect(feet(false)).toBeGreaterThan(0.4) // (sunk or floating by a hand or more)
    expect(feet(true)).toBeLessThan(1e-9)
  })
  it('keeps what stands upright upright: a vertical line moves as one', () => {
    expect(groundFollowY(1.7, 3, 2, 0, 0, slope) - groundFollowY(0, 3, 2, 0, 0, slope)).toBeCloseTo(1.7, 12)
  })
  it("is what units.vert does for a spread figure's every LOD, and units.ts turns it on for spread figures only", () => {
    const src = (f: string) => readFileSync(new URL(`../src/look/${f}`, import.meta.url), 'utf8').replace(/\s+/g, '')
    expect(src('shaders/units.vert')).toContain(
      '#ifdefined(GROUND_FOLLOW)&&!defined(DEPTH)w.y+=groundH(w.xz)-groundH(finalWorld[3].xz);#endif',
    )
    const u = src('units.ts')
    expect(u).toContain("constfollow=this.spread>0?['#defineGROUND_FOLLOW']:[]")
    expect(u.split('...follow]').length - 1 + u.split('...follow,').length - 1).toBe(3) // (near, far, tiny)
  })
})

describe("the guns' shadows a little darker (SH_DARKEN)", () => {
  it("raises the battery's share by under a fifth, capped at the look's darkest, and leaves the others", () => {
    const k = ARMS_DEMO.find(a => a.name === 'artillery')?.shadowDarken ?? 1
    expect(k).toBeGreaterThan(1)
    expect(k).toBeLessThanOrEqual(1.2)
    expect(ARMS_DEMO.find(a => a.name === 'cavalry')?.shadowDarken ?? 1).toBe(1)
    const f = readFileSync(new URL('../src/look/shaders/unitdecal.frag', import.meta.url), 'utf8').replace(/\s+/g, '')
    // (applied to the share before its cap: never past the ground's shade k, the soldiers' core)
    expect(f.indexOf('v*=SH_DARKEN;')).toBeLessThan(f.indexOf('floata=min(1.0,v/dm);'))
    expect(f.indexOf('v*=SH_DARKEN;')).toBeGreaterThan(0)
  })
})

describe('?lookat (lookAtSpot)', () => {
  const arms = { cavalry: { x: 50, z: -25 }, artillery: { x: 21, z: 25 } }
  const fight: [number, number] = [3, 4]
  it("starts on an arm's first unit or the fight's middle, at 30 m or the radius asked", () => {
    expect(lookAtSpot(null, arms, fight)).toBeNull()
    expect(lookAtSpot('cavalry', arms, fight)).toEqual({ x: 50, z: -25, radius: 30 })
    expect(lookAtSpot('artillery,12.5', arms, fight)).toEqual({ x: 21, z: 25, radius: 12.5 })
    expect(lookAtSpot('fight,80', {}, fight)).toEqual({ x: 3, z: 4, radius: 80 })
  })
  it('names the arms on the page, or none (?sim, ?cavalry=0 and ?artillery=0), and refuses a bad radius', () => {
    expect(() => lookAtSpot('horse', arms, fight)).toThrow(/the arms on this page: cavalry, artillery/)
    expect(() => lookAtSpot('cavalry', {}, fight)).toThrow(/no other arm on this page/)
    expect(() => lookAtSpot('toString', {}, fight)).toThrow(/no other arm on this page/)
    for (const bad of ['cavalry,0', 'cavalry,-3', 'cavalry,x', 'cavalry,', 'cavalry,10,2']) {
      expect(() => lookAtSpot(bad, arms, fight)).toThrow(/a radius above 0/)
    }
  })
})
