// A scenario's plan (docs/systems/sides.md; docs/plans/active/s1e2-sides.md; docs/proposals/sim-design.md §12:
// "the enemy's plan is scripted per scenario"): timed commands for the formations of the side it scripts, step 3 of the tick. A plan is
// attached to a world like its terrain (`attachScenario`): the steps are the scenario's, and which have run follows
// from the tick, so saves and replays need nothing more. Its commands pass the same validation as a player's, are
// applied directly and are not logged: a replay re-derives them (docs/proposals/sim-design.md §4).
//
// A step names its formation by the order the scenario spawned it in (`unit`): a fresh world hands out slots in
// order at generation 0, so the handle is fixed. A target (a charge's, a preferred fire target) names an enemy
// unit the same way.
import { type World, M_TICK, M_END, M_WINNER, M_LIMIT, M_PLAN, END_NONE, END_SIDE0, END_SIDE1, END_DRAW, outOfFight } from './world.ts'
import { menOf } from './formation.ts'
import { fnv1a } from './hash.ts'
import { makeHandle, KIND_FORMATION } from './handle.ts'
import { applyNow, type Command, type Dropped } from './commands.ts'
import { TICK_HZ } from './time.ts'

// a step's command: any command for one formation, its `id` (and any `target`) given as unit numbers
export type PlanCommand = Command extends infer C ? C extends { id: number } ? Omit<C, 'id'> : never : never
export interface PlanStep { at: number; unit: number; cmd: PlanCommand }   // at: seconds from the start
// what a world needs of its scenario beyond its setup: the plan and the time limit
export interface ScenarioRules { plan?: PlanStep[]; minutes?: number }

export const unitHandle = (unit: number): number => makeHandle(KIND_FORMATION, unit, 0)
// attaches a scenario's plan and time limit to a world: a world never attached records them (the limit, and a hash
// of the plan and limit, never 0, are state); one attached before (a loaded save) must be given the same again
export function attachScenario(w: World, s: ScenarioRules): void {
  const plan = s.plan ?? [], limit = s.minutes ? Math.round(s.minutes * 60 * TICK_HZ) : 0
  // no plan and no limit: nothing to record (a world without them hashes as one never attached), but one made with
  // a plan cannot be given none
  if (!plan.length && !limit) { if (w.meta[M_PLAN]) throw new Error('this world was made with another plan or time limit'); w.plan = []; w.planHash = 0; w.planDue = []; return }
  const h = (fnv1a(new TextEncoder().encode(JSON.stringify([plan, limit]))) | 0) || 1
  if (!w.meta[M_PLAN]) { if (w.meta[M_TICK] !== 0) throw new Error('a plan is attached before the first tick'); w.meta[M_PLAN] = h; w.meta[M_LIMIT] = limit }
  else if (w.meta[M_PLAN] !== h) throw new Error('this world was made with another plan or time limit')
  for (const p of plan) if (!(Math.round(p.at * TICK_HZ) >= 1)) throw new Error(`a plan step at ${p.at} s comes before the first tick`)
  // the steps sorted by the tick they fall due on (in plan order within a tick), and those ticks
  w.plan = plan.map((p, k) => [Math.round(p.at * TICK_HZ), k, p] as const).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(e => e[2])
  w.planDue = w.plan.map(p => Math.round(p.at * TICK_HZ)); w.planHash = h
}
// a world made with a plan has it attached (advanceTick asks before anything changes)
export function checkPlan(w: World): void {
  if (w.meta[M_PLAN] && w.planHash !== w.meta[M_PLAN]) throw new Error('the scenario\'s plan is not attached (attachScenario): a loaded save needs it')
}

// step 3: the steps due this tick, in plan order; a dropped one is reported with sequence −1
export function planStep(w: World, dropped: Dropped[]): void {
  const t = w.meta[M_TICK] + 1, D = w.planDue
  let lo = 0, hi = D.length; while (lo < hi) { const m = (lo + hi) >> 1; if (D[m] < t) lo = m + 1; else hi = m }   // the first due at t or later
  for (let k = lo; k < D.length && D[k] === t; k++) {
    const s = w.plan[k]
    const c = { ...s.cmd, id: unitHandle(s.unit) } as Command & { target?: number }
    // a target names a unit; none (or a negative one) is no target
    if (c.type === 'charge' || c.type === 'fire') { if (c.target !== undefined && c.target >= 0) c.target = unitHandle(c.target); else delete c.target }
    const why = applyNow(w, c)
    if (why) dropped.push({ tick: t, seq: -1, reason: `plan: ${why}` })
  }
}

// each side's men in the fight as a share of those it spawned (1 for a side that spawned none)
export function fightShares(w: World): [number, number] {
  const f = w.f, inFight = [0, 0]
  for (let i = 0; i < f.alive.length; i++) if (f.alive[i] && !outOfFight(f.mstate[i])) inFight[f.side[i]] += menOf(w, i)
  return [0, 1].map(s => w.sides.spawned[s] ? inFight[s] / w.sides.spawned[s] : 1) as [number, number]
}
// step 13, the end (S1e-2): a side is broken when the men it has in the fight fall to end.broken of the men it
// spawned (out of the fight: gone, routing, rallying, shattered, left the field); its enemy wins, and two broken
// on one tick is a draw. At the scenario's time limit the side with the larger share in the fight wins, a draw
// within end.margin. Decided once; the battle runs on after it
export function endStep(w: World): void {
  if (w.meta[M_END]) return
  const E = w.cr.rs.end, t = w.meta[M_TICK] + 1, share = fightShares(w), limit = w.meta[M_LIMIT]
  const broken = share.map((v, s) => w.sides.spawned[s] > 0 && v <= E.broken)
  let r = END_NONE
  if (broken[0] && broken[1]) r = END_DRAW
  else if (broken[0]) r = END_SIDE1
  else if (broken[1]) r = END_SIDE0
  else if (limit && t >= limit) r = Math.abs(share[0] - share[1]) <= E.margin ? END_DRAW : share[0] > share[1] ? END_SIDE0 : END_SIDE1
  if (r !== END_NONE) { w.meta[M_END] = t; w.meta[M_WINNER] = r }
}
