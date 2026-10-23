// The S1d-3 scenarios (docs/plans/active/s1d3-artillery.md): a foot battery of 8 pieces fires on a battalion of
// 400. `gunFight` sets up one case along the formation field's diagonal (the field is 360 m: the long cases stand
// about 400 m apart, corner to corner) and `runGuns` runs it; the calibration (tools/calibrate-artillery.ts) and
// the tests run them on levelled ground, the crest case on a ridge raised for it (`ridged`). `s1dGuns` is the
// page's: a battery and a battalion a side.
import type { World, Scenario, SimData, Compiled } from '../sim/index.ts'
import { issue, makeWorld, advanceTick, menOf, outOfFight, PI } from '../sim/index.ts'

export const GUNS = 96
export const INF = 400
export const GUN_CASES = ['line', 'column', 'canister', 'crest'] as const
export type GunCase = (typeof GUN_CASES)[number]
const NE = PI / 4
const SW = (-3 * PI) / 4
// the long cases: the battery at (−140, −140) facing north-east, the battalion about 396 m off facing it; canister:
// about 150 m. The battalion holds its fire (the guns' effect alone)
export const LONG = 140
export const NEAR = 52
export function gunFight(kind: GunCase): Scenario {
  const far = kind === 'canister' ? NEAR : LONG
  return {
    name: `s1d-guns-${kind}`,
    setup(w: World) {
      issue(w, { type: 'side', side: 0, x: -1, z: -1 })
      issue(w, { type: 'side', side: 1, x: 1, z: 1 })
      issue(w, {
        type: 'debug-spawn',
        side: 0,
        unit: 'battery',
        x: -far,
        z: -far,
        heading: NE,
        shape: 'unlimbered',
        men: GUNS,
      })
      issue(w, {
        type: 'debug-spawn',
        side: 1,
        x: far,
        z: far,
        heading: SW,
        shape: kind === 'column' ? 'column' : 'line',
        men: INF,
        fire: 'hold',
      })
    },
  }
}
// the crest case's ground: levelled, with a ridge 5 m high across the line of fire, its top 50 m in front of the
// battalion and its slopes 1 in 4 (rise over run), so a ball grazing its face rises over the battalion behind it
export function ridged(d: SimData): SimData {
  const H = d.height
  const h = new Float64Array(H.h.length)
  // the ridge line, along the diagonal
  const s0 = Math.SQRT2 * (LONG - 50 / Math.SQRT2)
  for (let j = 0; j < H.nz; j++) {
    for (let i = 0; i < H.nx; i++) {
      const x = H.x0 + i * H.cell
      const z = H.z0 + j * H.cell
      const s = (x + z) / Math.SQRT2
      h[j * H.nx + i] = Math.max(0, 5 - Math.abs(s - s0) * 0.25)
    }
  }
  return { ...d, height: { ...H, h } }
}
// first: −1 none broke, else the tick the battalion went out of the fight; lost: its men lost by `ticks` (or the
// break)
export interface GunResult {
  broke: number
  lost: number
}
export function runGuns(data: SimData, cr: Compiled, seed: number, kind: GunCase, ticks: number): GunResult {
  const w = makeWorld(data, cr, seed, false)
  gunFight(kind).setup(w)
  for (let t = 0; t < ticks; t++) {
    advanceTick(w)
    if (outOfFight(w.f.mstate[1])) return { broke: w.meta[0], lost: w.f.startMen[1] - menOf(w, 1) }
  }
  return { broke: -1, lost: w.f.startMen[1] - menOf(w, 1) }
}

// the page's: a battery on the hill in the south-west (21 m; the field rolls, and lower down its sight lines are
// cut), facing north-east, and across the stream a battalion in column facing it, about 320 m off (beyond
// canister), both holding fire; the page lets the guns fire
export const s1dGuns: Scenario = {
  name: 's1d-guns',
  setup(w: World) {
    issue(w, { type: 'side', side: 0, x: -1, z: -1 })
    issue(w, { type: 'side', side: 1, x: 1, z: 1 })
    issue(w, {
      type: 'debug-spawn',
      side: 0,
      unit: 'battery',
      x: -100,
      z: -50,
      heading: NE,
      shape: 'unlimbered',
      men: GUNS,
      fire: 'hold',
    })
    issue(w, { type: 'debug-spawn', side: 1, x: 150, z: 150, heading: SW, shape: 'column', men: INF, fire: 'hold' })
  },
}
