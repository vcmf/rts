// The S1c scenarios (docs/plans/active/s1c-fire-morale.md): two lines of 400 exchange fire across open ground
// on the formation field (centred at x −120, z 120, in the north-west, west of the wood; S1c-4 moved them
// there from the southern strip, too narrow for a 93 m line), the second of lower quality. Each side's
// rear is set, so a router runs away from the fight. `firefight` makes one at any range; `runFirefight` runs
// it to the first rout (the calibration, tools/calibrate-fire.ts, and the tests). The calibration runs on
// `levelled` data: the field rolls (the ground can hide the lines from each other at long range), and the
// fire model's numbers are tuned apart from what the ground does to them.
import type { World, Scenario, SimData, Compiled } from '../sim/index.ts'
import { issue, makeWorld, advanceTick, menOf, outOfFight } from '../sim/index.ts'

export const FIGHT_Z = 120
export const FIGHT_X = -120
export const MEN = 400
export const STRONG = 0.8
export const WEAK = 0.65
const E = 1.5707963267948966

// a scenario's name carries every parameter that is not the default, so a replay cannot be played against a
// variant it was not recorded on (replay.ts checks the name)
function scenarioName(base: string, range: number, qa: number, qb: number): string {
  const q = qa === STRONG && qb === WEAK ? '' : `-q${qa}-${qb}`
  return range === 100 && !q ? base : `${base}-${range}${q}`
}
// each side's rear: side 0 runs west, side 1 east
function setSides(w: World): void {
  issue(w, { type: 'side', side: 0, x: -1, z: 0 })
  issue(w, { type: 'side', side: 1, x: 1, z: 0 })
}

export function firefight(range: number, qa = STRONG, qb = WEAK): Scenario {
  return {
    name: scenarioName('s1c-firefight', range, qa, qb),
    setup(w: World) {
      setSides(w)
      issue(w, {
        type: 'debug-spawn',
        side: 0,
        x: FIGHT_X - range / 2,
        z: FIGHT_Z,
        heading: E,
        shape: 'line',
        men: MEN,
        quality: qa,
      })
      issue(w, {
        type: 'debug-spawn',
        side: 1,
        x: FIGHT_X + range / 2,
        z: FIGHT_Z,
        heading: -E,
        shape: 'line',
        men: MEN,
        quality: qb,
      })
    },
  }
}
export const s1cFirefight = firefight(100)

// the same field with its heightfield levelled to 0 (classes and water kept): not a replayable data set
export const levelled = (d: SimData): SimData => ({
  ...d,
  height: { ...d.height, h: new Float64Array(d.height.h.length) },
})

// first: the slot that routed first (−1: none); termLosses, termRecent: the two morale terms of the router at
// the break (how much each took off its quality)
export interface FightResult {
  first: number
  tick: number
  lossA: number
  lossB: number
  termLosses: number
  termRecent: number
}
// runs a firefight to the first rout or `maxTicks`; slot 0 is the stronger line, slot 1 the weaker
export function runFirefight(
  data: SimData,
  cr: Compiled,
  seed: number,
  range: number,
  maxTicks: number,
  qa = STRONG,
  qb = WEAK,
): FightResult {
  const w = makeWorld(data, cr, seed, false)
  firefight(range, qa, qb).setup(w)
  for (let t = 0; t < maxTicks; t++) {
    advanceTick(w)
    // a break: routing, or shattered at once
    const a = outOfFight(w.f.mstate[0])
    const b = outOfFight(w.f.mstate[1])
    if (a || b) {
      const i = a ? 0 : 1
      const M = cr.rs.morale
      const start = w.f.startMen[i]
      return {
        first: i,
        tick: w.meta[0],
        lossA: w.f.startMen[0] - menOf(w, 0),
        lossB: w.f.startMen[1] - menOf(w, 1),
        termLosses: (M.losses * (start - menOf(w, i))) / start,
        termRecent: (M.recent * w.f.recent[i]) / start,
      }
    }
  }
  return {
    first: -1,
    tick: maxTicks,
    lossA: w.f.startMen[0] - menOf(w, 0),
    lossB: w.f.startMen[1] - menOf(w, 1),
    termLosses: 0,
    termRecent: 0,
  }
}

// three lines a side, BRIGADE_GAP apart centre to centre (a 93 m line and a 20 m interval;
// docs/plans/active/s1c2-morale-machine.md): the inner lines have both flanks secured, the outer ones one; a
// break shocks its neighbours. Three lines need 319 m: the field's western band (x −175..−75, z −170..150)
// holds them, west of the wood, and the lines see each other across it
export const BRIGADE_X = -125
export const BRIGADE_Z = -10
export const BRIGADE_GAP = 113
export function brigade(range: number, qa = STRONG, qb = WEAK): Scenario {
  return {
    name: scenarioName('s1c-brigade', range, qa, qb),
    setup(w: World) {
      setSides(w)
      for (const [side, x, h, q] of [
        [0, BRIGADE_X - range / 2, E, qa],
        [1, BRIGADE_X + range / 2, -E, qb],
      ]) {
        for (let k = -1; k <= 1; k++) {
          issue(w, {
            type: 'debug-spawn',
            side,
            x,
            z: BRIGADE_Z + k * BRIGADE_GAP,
            heading: h,
            shape: 'line',
            men: MEN,
            quality: q,
          })
        }
      }
    },
  }
}
export const s1cBrigade = brigade(100)

// first: the side whose battalion broke first (−1: none; 2: both in the same tick); tick: when; then,
// `window` ticks after it, how many of each side are out of the fight and the tick of the last break. Every
// break counts, a second one after a rally too (brokeTick is stamped at each)
export interface BrigadeResult {
  first: number
  tick: number
  outA: number
  outB: number
  last: number
}
export function runBrigade(
  data: SimData,
  cr: Compiled,
  seed: number,
  range: number,
  maxTicks: number,
  window: number,
  qa = STRONG,
  qb = WEAK,
): BrigadeResult {
  const w = makeWorld(data, cr, seed, false)
  brigade(range, qa, qb).setup(w)
  let first = -1
  let tick = maxTicks
  let last = 0
  // out of the fight, or gone (reaped): the spawn order fills slots 0–5, side 0 first
  const count = (side: number) => {
    let n = 0
    for (let i = side * 3; i < side * 3 + 3; i++) {
      if (!w.f.alive[i] || w.f.side[i] !== side || outOfFight(w.f.mstate[i])) n++
    }
    return n
  }
  for (let t = 1; t <= maxTicks && (first < 0 || t <= tick + window); t++) {
    advanceTick(w)
    let broke = 0 // bit per side that had a break this tick
    for (let i = 0; i < 6; i++) if (w.f.alive[i] && w.f.brokeTick[i] === t) broke |= 1 << w.f.side[i]
    if (!broke) continue
    last = t
    if (first < 0) {
      first = broke === 3 ? 2 : broke === 1 ? 0 : 1
      tick = t
    }
  }
  return { first, tick, outA: count(0), outB: count(1), last }
}
