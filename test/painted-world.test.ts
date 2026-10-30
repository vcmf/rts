// The look page's world as a sim map (maps/painted-world.ts, docs/plans/done/battle-threads.md, PR 4a): the
// committed sim data against the look data it was built from, and a battle on it.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { root, longIt } from './fx.ts'
import { loadSimData, compileRuleset, formationHandle, play } from '../src/sim/index.ts'
import { napoleonic } from '../src/rulesets/napoleonic.ts'
import { MAP_VERSIONS } from '../src/scenarios/maps.ts'
import { lookCross } from '../src/scenarios/look-world.ts'
import { Battle } from '../src/app/battle.ts'
import { D } from '../src/look/spec.ts'
import { decodeLook, unpackSpans } from '../src/look/world/data.ts'
import { setHeightfield, heightAt } from '../src/look/heightfield.ts'
import { WATER_FILL, decodeWater, sampleRGBA } from '../src/look/world/water-data.ts'
import { BUILDINGS, FOOT, toLocal } from '../src/look/world/buildings.ts'
import { WET, FROM_COVER } from '../maps/painted-world.ts'
import { coverAt } from '../src/look/world/cover.ts'

const sim = loadSimData(
  new Uint8Array(fs.readFileSync(path.join(root, 'data', 'painted-world.simdata'))),
  MAP_VERSIONS['painted-world'],
)
const lookFile = fs.readFileSync(path.join(root, 'data', 'painted-world.lookdata'))
const look = decodeLook(lookFile.buffer.slice(lookFile.byteOffset, lookFile.byteOffset + lookFile.byteLength))
setHeightfield(look.hf, look.far, D.spec.tile / 2)

describe('the look world as a sim map', () => {
  it('spans the look tile, and every sim height node is the look ground there', () => {
    const H = sim.height
    expect([H.x0, H.z0]).toEqual([-D.spec.tile / 2, -D.spec.tile / 2])
    let worst = 0
    let n = 0
    for (let j = 0; j < H.nz; j += 7) {
      for (let i = 0; i < H.nx; i += 7) {
        worst = Math.max(worst, Math.abs(H.h[j * H.nx + i] - heightAt(H.x0 + i * H.cell, H.z0 + j * H.cell)))
        n++
      }
    }
    expect([n > 3000, worst]).toEqual([true, 0])
  })
  it("is water where the look's water is wet (the ford too), as deep, and dry elsewhere", () => {
    const water = unpackSpans(look.water, WATER_FILL)
    const W = look.water
    const F = sim.fine
    const wet = sim.classes.indexOf('water')
    let wetCells = 0
    for (let j = 0; j < F.nz; j++) {
      for (let i = 0; i < F.nx; i++) {
        const [r, g, b, a] = sampleRGBA(water, W.n, W.cell, W.x0, W.z0, F.x0 + i * F.cell, F.z0 + j * F.cell)
        const d = decodeWater(r, g, b, a).depth
        const isWet = d > WET
        if (isWet) wetCells++
        expect(F.cls[j * F.nx + i] === wet).toBe(isWet)
        // stored as float32, then in mm
        expect(F.depth[j * F.nx + i]).toBe(isWet ? Math.round(Math.fround(d) * 1000) : 0)
      }
    }
    // the river runs the tile's length: about 2,000 cells of 2 m
    expect(wetCells).toBeGreaterThan(1500)
    expect(sim.classes.indexOf('bridge') < 0 || !F.cls.includes(sim.classes.indexOf('bridge'))).toBe(true)
  })
  // checked apart from the build's own functions: a node takes one of the four cover cells it is the corner of, a
  // building's footprint by the look's own toLocal and FOOT
  it("has every other node's class from a look cover cell at its corner, a building's, or the slope's", () => {
    const F = sim.fine
    const inFoot = (x: number, z: number) =>
      BUILDINGS.some(b => {
        const [lx, lz] = toLocal(b.yaw, x - b.x, z - b.z)
        const f = FOOT[b.model]
        return f.r !== undefined
          ? Math.hypot(lx, lz) <= f.r * b.scale + 1e-9
          : Math.abs(lx) <= f.hx! * b.scale + 1e-9 && Math.abs(lz) <= f.hz! * b.scale + 1e-9
      })
    for (let j = 0; j < F.nz; j += 3) {
      for (let i = 0; i < F.nx; i += 3) {
        const x = F.x0 + i * F.cell
        const z = F.z0 + j * F.cell
        const got = sim.classes[F.cls[j * F.nx + i]]
        if (got === 'water') continue
        if (inFoot(x, z)) {
          expect(got).toBe('denseWood')
          continue
        }
        const around = [-1, 1].flatMap(dx => [-1, 1].map(dz => FROM_COVER[coverAt(look.cover, x + dx, z + dz)]))
        if (got === 'rough') expect(around).toContain('open')
        else expect(around).toContain(got)
      }
    }
  })
  it('blocks the paths in water too deep to wade and in the buildings', () => {
    const c = sim.cost
    const F = sim.fine
    // (the cost grid's whole cells: none past its last, 794.8 m of the 800)
    const cellAt = (x: number, z: number) => {
      const i = Math.floor((x - c.x0) / c.cell)
      const j = Math.floor((z - c.z0) / c.cell)
      return i < c.nx && j < c.nz ? c.g[j * c.nx + i] : 0
    }
    for (let j = 0; j < F.nz; j++) {
      for (let i = 0; i < F.nx; i++) {
        if (F.depth[j * F.nx + i] > napoleonic.water.limit * 1000) {
          expect(cellAt(F.x0 + i * F.cell, F.z0 + j * F.cell)).toBe(0)
        }
      }
    }
    for (const b of BUILDINGS) expect(cellAt(b.x, b.z)).toBe(0)
  })
  longIt('a battle on it runs, and its replay reproduces every hash point', () => {
    const cr = compileRuleset(napoleonic)
    const b = new Battle(sim, lookCross, cr)
    // the spawns apply at the first tick
    b.advanceBy(0.1)
    // the two sides march at each other, 300 m apart, and the first line fires
    const f = b.w.f
    const south = [...f.alive.keys()].filter(i => f.alive[i] && f.side[i] === 0)
    for (const i of south) {
      b.command({ type: 'move', id: formationHandle(b.w, i), points: [[f.x[i], 0]], append: false })
    }
    b.advanceBy(60)
    const alive = [...f.alive].filter(a => a).length
    const { replay, hashes } = b.replay()
    expect([alive, south.length, b.dropped.length]).toEqual([8, 4, 0])
    // marching on its ground (measured: 54 m in the first minute, over the fields and rough slopes, the column
    // forming first)
    for (const i of south) expect(f.z[i]).toBeGreaterThan(-120)
    expect(play(replay, sim, cr, lookCross, hashes)).toBeNull()
  })
})
