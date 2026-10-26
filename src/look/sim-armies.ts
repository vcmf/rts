// The look page's armies played by the sim (docs/plans/active/battle-threads.md, PR 4b; the page at ?sim): the
// battle on the look world's sim map (maps/painted-world.ts) in the battle's workers (src/app/battle-link.ts), or on
// the page when it cannot share memory with them. The page lays its battalions out as the script does
// (src/look/world/armies.ts layout) and spawns them by commands, so a session still replays: each advances in column
// to 90 m short of the fight's middle, deploys into line there, and fires at will. No Babylon.
import lookSimUrl from '../../data/painted-world.simdata?url'
import { loadSimData, compileRuleset, formationHandle, typeOf, type Command, type World } from '../sim/index.ts'
import { napoleonic } from '../rulesets/napoleonic.ts'
import { MAP_VERSIONS } from '../scenarios/maps.ts'
import { PAGE_SCENARIOS } from '../scenarios/page.ts'
import { MainLink, WorkerLink, type BattleLink } from '../app/battle-link.ts'
import { SimMen } from './sim-men.ts'
import type { Battalion } from './world/armies.ts'

/** How far short of the fight's middle (m) each battalion halts and deploys. */
export const SHORT = 90

/** Where battalion `b` marches to: along its heading, `SHORT` m short of the line through `mid` across it. */
export function marchTo(b: Battalion, mid: readonly [number, number]): [number, number] {
  const fx = Math.sin(b.heading)
  const fz = Math.cos(b.heading)
  const ahead = Math.max(0, (mid[0] - b.x) * fx + (mid[1] - b.z) * fz - SHORT)
  return [b.x + fx * ahead, b.z + fz * ahead]
}

/** The commands that bring the battalions on: each spawned where it is laid out, in column, firing at will. */
export const spawns = (bs: readonly Battalion[], men: number): Command[] =>
  bs.map(b => ({
    type: 'debug-spawn',
    side: b.side,
    x: b.x,
    z: b.z,
    heading: b.heading,
    shape: 'column',
    men,
    fire: 'at will',
  }))

/** A battalion's orders so far: its march sent, seen under way (the page sees the battle a frame late), its line. */
export interface Orders {
  marched: boolean
  moving: boolean
  formed: boolean
}

/** The orders a battalion is due given its formation `i` now: its march once, its line once it has halted there. */
export function ordersDue(w: World, i: number, to: readonly [number, number], state: Orders): Command[] {
  const f = w.f
  const id = formationHandle(w, i)
  if (!state.marched) {
    state.marched = true
    return [{ type: 'move', id, points: [[to[0], to[1]]], append: false }]
  }
  if (f.ordHead[i] >= 0) state.moving = true
  const shape = typeOf(w, i).shapes[f.shape[i]].name
  if (state.moving && !state.formed && f.ordHead[i] < 0 && !f.trans[i] && shape === 'column') {
    state.formed = true
    return [{ type: 'form', id, shape: 'line' }]
  }
  return []
}

/** The sim playing the page's armies: its men as the renderer's source, the battle, and the page's tick (each
 * frame: the battle's frame on the page's thread, the orders due). */
export interface SimPlay {
  source: SimMen
  link: BattleLink
  tick(dt: number): void
}

/** The sim playing the battalions `bs` (`men` figures each) on the look world. */
export async function playSim(bs: readonly Battalion[], men: number, mid: readonly [number, number]): Promise<SimPlay> {
  const bytes = new Uint8Array(await (await fetch(lookSimUrl)).arrayBuffer())
  const data = loadSimData(bytes, MAP_VERSIONS['painted-world'])
  const cr = compileRuleset(napoleonic)
  let link: BattleLink | null = null
  if (crossOriginIsolated) {
    const wl = new WorkerLink(
      new Worker(new URL('../app/sim-worker.ts', import.meta.url), { type: 'module' }),
      new Worker(new URL('../app/men-worker.ts', import.meta.url), { type: 'module' }),
      bytes,
      data,
      cr,
      'look-armies',
    )
    try {
      await wl.ready()
      link = wl
    } catch (e) {
      console.warn(`the battle runs on the page: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  const battle = link ?? new MainLink(data, cr, PAGE_SCENARIOS['look-armies'])
  for (const c of spawns(bs, men)) battle.command(c)
  const source = new SimMen(
    bs,
    men,
    () => battle.see(),
    () => battle.published(),
  )
  const to = bs.map(b => marchTo(b, mid))
  const states: Orders[] = bs.map(() => ({ marched: false, moving: false, formed: false }))
  return {
    source,
    link: battle,
    tick: (dt: number) => {
      battle.frame(dt)
      const w = battle.see().w
      for (let k = 0; k < bs.length; k++) {
        const i = source.formationOf(k)
        if (i < 0 || !w.f.alive[i]) continue
        for (const c of ordersDue(w, i, to[k], states[k])) battle.command(c)
      }
    },
  }
}
