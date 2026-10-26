// The look page's armies played by the sim (docs/plans/active/battle-threads.md, PR 4b; the page at ?sim): the
// battle on the look world's sim map (maps/painted-world.ts) in the battle's workers (src/app/battle-link.ts), or on
// the page when it cannot share memory with them. The page lays its battalions out as the script does
// (src/look/world/armies.ts layout) and spawns them by commands, so a session still replays: each advances in its
// approach shape to SHORT m short of the fight's middle, takes its fighting shape there, and fires at will. The era's
// names (its ruleset, unit type and shapes) come from the scenario's data (src/scenarios/armies-demo.ts; decision
// 0015: the page names none). No Babylon.
import lookSimUrl from '../../data/painted-world.simdata?url'
import { loadSimData, compileRuleset, formationHandle, typeOf, M_TICK, type Command, type World } from '../sim/index.ts'
import { rulesetOf } from '../rulesets/index.ts'
import { MAP_VERSIONS } from '../scenarios/maps.ts'
import { lookArmies } from '../scenarios/look-world.ts'
import { startLink, type BattleLink } from '../app/battle-link.ts'
import { SimMen } from './sim-men.ts'
import type { Battalion } from './world/armies.ts'

/** How far short of the fight's middle (m) each battalion halts and takes its fighting shape. */
export const SHORT = 90
/** A march shorter than this (m) is not sent: the battalion is there already (the front rows, 55 m from the middle). */
const THERE = 2

/** The armies' era content, by name: the ruleset, the unit type, the shapes it approaches and fights in. */
export interface SimArmies {
  ruleset: string
  unitType: string
  approach: string
  fight: string
}

/** Where battalion `b` marches to: along its heading, `SHORT` m short of the line through `mid` across it. */
export function marchTo(b: Battalion, mid: readonly [number, number]): [number, number] {
  const fx = Math.sin(b.heading)
  const fz = Math.cos(b.heading)
  const ahead = Math.max(0, (mid[0] - b.x) * fx + (mid[1] - b.z) * fz - SHORT)
  return [b.x + fx * ahead, b.z + fz * ahead]
}

/** The commands that bring the battalions on: each spawned where it is laid out, in its approach shape, firing at
 * will, `men` strong. */
export const spawns = (bs: readonly Battalion[], men: number, a: SimArmies): Command[] =>
  bs.map(b => ({
    type: 'debug-spawn',
    side: b.side,
    x: b.x,
    z: b.z,
    heading: b.heading,
    shape: a.approach,
    men,
    fire: 'at will',
    unit: a.unitType,
  }))

/** A battalion's orders so far: its march sent (or none needed), seen under way (the page sees the battle a frame
 * late) or there already, its fighting shape. */
export interface Orders {
  marched: boolean
  moving: boolean
  formed: boolean
  // the tick its march was sent at (a march refused, never seen under way, counts as done after GIVE_UP)
  sentAt: number
}
/** Ticks after which a march never seen under way is taken as refused (its battalion then forms where it stands). */
export const GIVE_UP = 60

/** The orders battalion `b` (formation `i` now) is due: its march once (none when it is there already), its fighting
 * shape once it has marched and halted. */
export function ordersDue(
  w: World,
  i: number,
  b: Battalion,
  to: readonly [number, number],
  a: SimArmies,
  state: Orders,
): Command[] {
  const f = w.f
  const id = formationHandle(w, i)
  if (!state.marched) {
    state.marched = true
    state.sentAt = w.meta[M_TICK]
    if (Math.hypot(to[0] - b.x, to[1] - b.z) < THERE) {
      state.moving = true
      return []
    }
    return [{ type: 'move', id, points: [[to[0], to[1]]], append: false }]
  }
  if (f.ordHead[i] >= 0 || w.meta[M_TICK] - state.sentAt > GIVE_UP) state.moving = true
  const shape = typeOf(w, i).shapes[f.shape[i]].name
  if (state.moving && !state.formed && f.ordHead[i] < 0 && !f.trans[i] && shape === a.approach) {
    state.formed = true
    return [{ type: 'form', id, shape: a.fight }]
  }
  return []
}

/** The sim playing the page's armies: its men as the renderer's source, the battle, and the page's tick (each
 * frame: the battle's frame on the page's thread, the orders due, read from the frame the renderer took). */
export interface SimPlay {
  source: SimMen
  link: BattleLink
  tick(dt: number): void
}

/** The sim playing the battalions `bs` (`men` figures each: as many men each, at most the unit type's slots) on the
 * look world, its era `a`. */
export async function playSim(
  bs: readonly Battalion[],
  men: number,
  mid: readonly [number, number],
  a: SimArmies,
): Promise<SimPlay> {
  const bytes = new Uint8Array(await (await fetch(lookSimUrl)).arrayBuffer())
  const data = loadSimData(bytes, MAP_VERSIONS['painted-world'])
  const cr = compileRuleset(rulesetOf(a.ruleset))
  const t = cr.typeIndex(a.unitType)
  if (t < 0) throw new Error(`?sim: the ruleset ${a.ruleset} has no unit type ${a.unitType}`)
  const type = cr.types[t]
  // in the workers when the page shares memory with them (and not told ?thread=main), as the sim page
  const own = new URLSearchParams(location.search).get('thread') === 'main' || !crossOriginIsolated
  const battle = await startLink({
    bytes,
    data,
    cr,
    scenario: lookArmies,
    key: 'look-armies',
    ruleset: a.ruleset,
    workers: own
      ? null
      : () => [
          new Worker(new URL('../app/sim-worker.ts', import.meta.url), { type: 'module' }),
          new Worker(new URL('../app/men-worker.ts', import.meta.url), { type: 'module' }),
        ],
  })
  // as many men as figures, at most the type's slots (the figures past them are not drawn)
  for (const c of spawns(bs, Math.min(men, type.slots), a)) battle.command(c)
  const source = new SimMen(bs, men, () => battle.see())
  const to = bs.map(b => marchTo(b, mid))
  const states: Orders[] = bs.map(() => ({ marched: false, moving: false, formed: false, sentAt: 0 }))
  return {
    source,
    link: battle,
    tick: (dt: number) => {
      battle.frame(dt)
      // the newest frame, taken here each frame (the renderer reads the same: one read a frame), shown or not
      source.refresh()
      const w = source.current()!.w
      for (let k = 0; k < bs.length; k++) {
        const i = source.formationOf(k)
        if (i < 0 || !w.f.alive[i]) continue
        for (const c of ordersDue(w, i, bs[k], to[k], a, states[k])) battle.command(c)
      }
    },
  }
}
