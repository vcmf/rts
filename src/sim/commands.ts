// Commands (docs/proposals/sim-design.md §4): the only way into the simulation. The sim stamps each
// command with the next tick and a sequence number, quantises its positions to 1 cm, and applies it at
// the start of that tick after validating it; an invalid command is dropped with a reason, never thrown.
// Only external commands (player, scripts) go into the replay log.
import { type Handle, KIND_FORMATION, handleKind, handleIndex, handleGen, makeHandle } from './handle.ts'
import { quantise } from './num.ts'
import { allocNode, freeList } from './pool.ts'
import { type World, M_TICK, M_SEQ, M_FREE, SIDES } from './world.ts'

export type Command =
  | { type: 'move'; id: Handle; points: [number, number][]; append: boolean }
  | { type: 'halt'; id: Handle }
  | { type: 'debug-spawn'; side: number; men: number; x: number; z: number; facing: number }
  | { type: 'debug-kill'; id: Handle; men: number }
export interface Stamped { tick: number; seq: number; cmd: Command }
export interface Dropped { tick: number; seq: number; reason: string }

const MAX_POINTS = 64

// stamps a command for the next tick; `log` receives it when the command is external
export function issue(w: World, cmd: Command, log?: Stamped[]): Stamped {
  const s: Stamped = { tick: w.meta[M_TICK] + 1, seq: w.meta[M_SEQ]++, cmd: quantiseCommand(cmd) }
  w.pending.push(s)
  if (log) log.push(s)
  return s
}
function quantiseCommand(c: Command): Command {
  switch (c.type) {
    case 'move': return { type: 'move', id: c.id | 0, points: c.points.slice(0, MAX_POINTS).map(([x, z]) => [quantise(x), quantise(z)]), append: !!c.append }
    case 'halt': return { type: 'halt', id: c.id | 0 }
    case 'debug-spawn': return { type: 'debug-spawn', side: c.side | 0, men: c.men | 0, x: quantise(c.x), z: quantise(c.z), facing: quantise(c.facing) }
    case 'debug-kill': return { type: 'debug-kill', id: c.id | 0, men: c.men | 0 }
  }
}

// the slot of a live formation handle, or −1
export function formationSlot(w: World, h: Handle): number {
  if (h < 0 || handleKind(h) !== KIND_FORMATION) return -1
  const i = handleIndex(h)
  return i < w.f.alive.length && w.f.alive[i] && w.f.gen[i] === handleGen(h) ? i : -1
}
export const formationHandle = (w: World, i: number): Handle => makeHandle(KIND_FORMATION, i, w.f.gen[i])

const inside = (w: World, x: number, z: number): boolean => {
  const c = w.data.cost
  return x >= c.x0 && z >= c.z0 && x <= c.x0 + c.nx * c.cell && z <= c.z0 + c.nz * c.cell
}
const finite = (v: number): boolean => v === v && v !== Infinity && v !== -Infinity

// applies the commands stamped for tick t, in sequence order; returns the dropped ones
export function applyCommands(w: World, t: number): Dropped[] {
  const dropped: Dropped[] = [], keep: Stamped[] = []
  for (const s of w.pending) {
    if (s.tick !== t) { keep.push(s); continue }
    const why = apply(w, s.cmd)
    if (why) dropped.push({ tick: t, seq: s.seq, reason: why })
  }
  w.pending = keep
  return dropped
}

function apply(w: World, c: Command): string {
  const f = w.f
  switch (c.type) {
    case 'debug-spawn': {
      if (c.side < 0 || c.side >= SIDES) return 'no such side'
      if (c.men <= 0) return 'no men'
      if (!finite(c.x) || !finite(c.z) || !finite(c.facing) || !inside(w, c.x, c.z)) return 'outside the map'
      if (w.meta[M_FREE] === 0) return 'no free formation slot'
      const i = w.free[--w.meta[M_FREE]]
      f.alive[i] = 1; f.side[i] = c.side; f.men[i] = c.men; f.x[i] = c.x; f.z[i] = c.z; f.facing[i] = c.facing; f.speed[i] = 0
      f.wpHead[i] = -1; f.wpTail[i] = -1
      return ''
    }
    case 'move': {
      const i = formationSlot(w, c.id); if (i < 0) return 'no such formation'
      if (c.points.length === 0) return 'no waypoints'
      for (const [x, z] of c.points) if (!finite(x) || !finite(z) || !inside(w, x, z)) return 'waypoint outside the map'
      if (!c.append) { freeList(w.wp, f.wpHead[i]); f.wpHead[i] = -1; f.wpTail[i] = -1 }
      for (const [x, z] of c.points) {
        const n = allocNode(w.wp, x, z); if (n < 0) return 'waypoint pool full'
        if (f.wpTail[i] < 0) f.wpHead[i] = n; else w.wp.next[f.wpTail[i]] = n
        f.wpTail[i] = n
      }
      return ''
    }
    case 'halt': {
      const i = formationSlot(w, c.id); if (i < 0) return 'no such formation'
      freeList(w.wp, f.wpHead[i]); f.wpHead[i] = -1; f.wpTail[i] = -1
      return ''
    }
    case 'debug-kill': {
      const i = formationSlot(w, c.id); if (i < 0) return 'no such formation'
      if (c.men <= 0) return 'no men'
      f.men[i] = Math.max(0, f.men[i] - c.men)
      return ''
    }
  }
}
