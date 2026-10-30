// The selected unit's info box (docs/proposals/formations.md § 5): every number the sim uses on it, for debugging,
// each read through the accessor the sim reads (src/sim/traits.ts, levelOf, effectiveBar, the sectors' weights), none
// recomputed here. Builds the block geometry and the faces on the world it reads (a frame's world has its own scratch).
import {
  type World,
  typeOf,
  levelOf,
  effectiveBar,
  menOf,
  blockGeometry,
  buildFaces,
  pointWeights,
  firingMen,
  changeProgress,
  outOfFight,
  formationSlot,
  MORALE_STATES,
  FIRE_MODES,
  MAX_FORMATIONS,
  M_TICK,
  DT,
  T_HITS,
  T_FLANK,
  T_REAR,
  T_BRACE,
  T_BRACE_FLANK,
  T_BRACE_REAR,
} from '../sim/index.ts'
import { traitOf, fireOf, shockOf, meleeOf, flankShockOf, movesOf, allRoundOf } from '../sim/traits.ts'

const n2 = (v: number) => v.toFixed(2)
const SIDES = ['front', 'flank', 'rear']

/** The info box's lines for formation i. */
export function unitCard(w: World, i: number): string[] {
  const f = w.f
  const U = typeOf(w, i)
  const rs = w.cr.rs
  const L = levelOf(w, i)
  const lv = f.level[i]
  const men = menOf(w, i)
  const shape = U.shapes[f.shape[i]].name
  const changing = f.trans[i]
    ? ` → ${U.shapes[f.tShape[i]].name} (${Math.round(100 * changeProgress(w, i, w.meta[M_TICK] * DT))}%)`
    : ''
  const next = lv < rs.levels.length ? `, ${Math.floor(f.pts[i])} of ${rs.levels[lv].points} points` : ''
  let firing = 0
  for (let c = 0; c < U.C; c++) firing += firingMen(w, i, c)
  const t = (k: number) => traitOf(w, i, k)
  const hits = allRoundOf(w, i)
    ? `${n2(t(T_HITS))} every side`
    : `${n2(t(T_HITS))} front, × ${n2(t(T_FLANK))} flank, × ${n2(t(T_REAR))} rear`
  const out: string[] = [
    `#${i} ${U.name} · ${shape}${changing} · ${FIRE_MODES[f.fireMode[i]]} · ${men} figures (${men * rs.menPerFigure} men)`,
    `  level ${lv} ${L.name}${next}${f.up[i] ? ' (up this battle)' : ''}`,
    `  morale: ${MORALE_STATES[f.mstate[i]]} · bar ${f.bar[i].toFixed(1)}, effective ${effectiveBar(w, i, f.flanks[i]).toFixed(1)} of ${f.barMax[i].toFixed(0)} · drain ${f.drain[i].toFixed(1)} · flanks secured ${f.flanks[i]}`,
    `  toughness ${n2(L.toughness)} · shock taken × ${n2(shockOf(w, i))} · flank shock × ${n2(flankShockOf(w, i))}`,
    `  musket: ${U.def.fires ? `${firing} in its sections' firing ranks (those its depth masks too) × fire ${n2(fireOf(w, i))} × precision ${n2(L.precision)}, reload ${(rs.fire.reload * L.reload).toFixed(1)} s, long range ${rs.fire.maxRange} m` : 'none'}`,
    `  melee ${n2(meleeOf(w, i))} · hits taken ${hits}`,
    `  braced ${n2(t(T_BRACE))} front, ${n2(t(T_BRACE_FLANK))} flank, ${n2(t(T_BRACE_REAR))} rear · ${movesOf(w, i) ? 'may move' : 'cannot move'}`,
  ]
  // the enemies in the sectors' reach, nearest first, and the side each threatens from (its centre's weights)
  const G = blockGeometry(w)
  buildFaces(w, G)
  const wt = new Float64Array(3)
  const near: [number, string][] = []
  for (let e = 0; e < MAX_FORMATIONS; e++) {
    if (!f.alive[e] || f.side[e] === f.side[i] || outOfFight(f.mstate[e])) continue
    const d = Math.hypot(f.x[e] - f.x[i], f.z[e] - f.z[i])
    if (d > rs.sectors.reach) continue
    pointWeights(w, i, f.x[e], f.z[e], wt)
    const by = [0, 1, 2]
      .filter(k => wt[k] > 0.005)
      .map(k => `${SIDES[k]} ${n2(wt[k])}`)
      .join(', ')
    near.push([d, `#${e} ${typeOf(w, e).name} at ${d.toFixed(0)} m: ${by}`])
  }
  near.sort((a, b) => a[0] - b[0])
  const foe = f.foe[i] ? formationSlot(w, f.foe[i]) : -1
  out.push(
    `  nearest enemy ${near.length ? near[0][0].toFixed(0) + ' m' : `none within ${rs.sectors.reach} m`}${foe >= 0 ? ` · in melee with #${foe}` : ''}`,
  )
  for (const [, line] of near) out.push(`    ${line}`)
  return out
}
