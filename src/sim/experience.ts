// Experience (docs/proposals/morale-bar-model.md § 7): a formation's points come from fighting, and at its next
// level's points it goes up a level, once a battle. The credits for men struck and charges turned away are given
// where they happen (fire, artillery, melee); the step after morale gives the seconds under fire and the enemies
// broken in front, then the level ups.
import { type World, MAX_FORMATIONS, M_TICK, levelOf, outOfFight } from './world.ts'
import { blockGeometry, reachOf } from './fire.ts'
import { pointWeights } from './sectors.ts'
import { DT, TICK_HZ } from './time.ts'

/** `men` (expected, after the target's toughness) struck by formation `by`, credited when it is in the fight. */
export function creditMen(w: World, by: number, men: number): void {
  if (by >= 0 && !outOfFight(w.f.mstate[by])) w.f.pts[by] += men * w.cr.rs.points.man
}

/** A charge turned away by formation j, credited when it is in the fight. */
export function creditRepulse(w: World, j: number): void {
  if (!outOfFight(w.f.mstate[j])) w.f.pts[j] += w.cr.rs.points.repulse
}

const wt = new Float64Array(3)
/**
 * Step 12's end, after every formation's morale: each formation in the fight is credited its second under fire (a man
 * lost in the last `points.window` seconds) and each enemy that broke this tick in its front (front weight at least ½)
 * within its fire range; then any that has reached its next level's points goes up (`levelUp`).
 */
export function experienceStep(w: World): void {
  const f = w.f
  const P = w.cr.rs.points
  const tick = w.meta[M_TICK] + 1
  const window = Math.round(P.window * TICK_HZ)
  let broke = false
  for (let j = 0; j < MAX_FORMATIONS; j++) if (f.alive[j] && f.brokeTick[j] === tick) broke = true
  // the faces of this tick, for the front (built with the geometry)
  if (broke && w.scratch.fireGeoTick !== tick) {
    w.scratch.fireGeo = blockGeometry(w)
    w.scratch.fireGeoTick = tick
  }
  for (let i = 0; i < MAX_FORMATIONS; i++) {
    if (!f.alive[i] || outOfFight(f.mstate[i])) continue
    if (f.lastLoss[i] > 0 && tick - f.lastLoss[i] < window) f.pts[i] += P.fire * DT
    if (broke) {
      const R = reachOf(w, i).range
      for (let j = 0; j < MAX_FORMATIONS; j++) {
        if (!f.alive[j] || f.brokeTick[j] !== tick || f.side[j] === f.side[i]) continue
        const dx = f.x[j] - f.x[i]
        const dz = f.z[j] - f.z[i]
        if (dx * dx + dz * dz <= R * R && pointWeights(w, i, f.x[j], f.z[j], wt)[0] >= 0.5) f.pts[i] += P.broke
      }
    }
    levelUp(w, i)
  }
}

/**
 * Formation i up a level (§ 7) when its points reach the next level's, below level 6 and not yet up this battle: its
 * maximum bar scaled to the new level's, its bar full and its losses' cost written off, its drill the new level's.
 */
export function levelUp(w: World, i: number): void {
  const f = w.f
  const L = w.cr.rs.levels
  const l = f.level[i]
  if (f.up[i] || l >= L.length || f.pts[i] < L[l].points) return
  f.barMax[i] *= L[l].bar / L[l - 1].bar
  f.level[i] = l + 1
  f.up[i] = 1
  f.bar[i] = f.barMax[i]
  f.cost[i] = 0
  f.drill[i] = levelOf(w, i).drill
}
