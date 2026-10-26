// The look page's armies from the sim (docs/plans/active/battle-threads.md, PR 4b): each drawn battalion is a sim
// formation, each figure one of its men in the men worker's published frame (src/app/battle-frame.ts), read where he
// stands: his place, the way he faces (his velocity's, at rest his formation's heading), his role (run, march, halt;
// fire while his company's volley is fresh) and when it began. The renderer (src/look/units.ts) asks it in place of
// the script (src/look/world/armies.ts) at ?sim. No Babylon: the tests read it in Node.
import { typeOf, DT, M_TICK, type World } from '../sim/index.ts'
import type { SoldierLayer, Unit } from '../render/soldiers.ts'
import { MAN_ALIVE } from '../render/men.ts'
import type { Battalion } from './world/armies.ts'

/** A man as the renderer draws him: where (world x, z), the way he faces (rad, the figure's yaw as a battalion's
 * heading: (sin, cos) ahead), his role, when it began (the page's clock, s), and whether he is drawn at all. */
export interface SourceMan {
  x: number
  z: number
  yaw: number
  role: 'halt' | 'march' | 'run' | 'fire'
  since: number
  shown: boolean
}

// a man's speed (m/s) from which he marches, and runs; how long a volley is fired (s, its clip's)
export const MARCH_FROM = 0.3
export const RUN_FROM = 2.2
export const FIRE_FOR = 0.6
const ROLES = ['halt', 'march', 'run', 'fire'] as const

/** The battalions to place this frame of `dt` real seconds: `n` over the frames a step at `fps` steps a second is sure
 * to have (the whole of them: at 30 Hz a step has 2 or 3 frames, so half each), so every one can be placed once a step
 * whatever the frame rate, at least one. */
export const placeQuota = (n: number, dt: number, fps: number): number =>
  Math.max(1, Math.ceil(n / Math.max(1, Math.floor(1 / (dt * fps) + 1e-9))))

/** Which of `n` battalions to place this frame: those `due`, looked at in turn from `next` (round robin: one passed
 * over now is looked at first again only after the others), at most `quota`, into `out`; returns where the next
 * frame starts. */
export function pickPlacings(
  n: number,
  next: number,
  quota: number,
  due: (k: number) => boolean,
  out: number[],
): number {
  out.length = 0
  let k = 0
  for (; k < n && out.length < quota; k++) {
    const b = (next + k) % n
    if (due(b)) out.push(b)
  }
  return n ? (next + k) % n : 0
}

/** What the page reads this frame: the world and the soldier layer of the newest published frame. */
export interface Seen {
  w: World
  layer: SoldierLayer
}

/** Where the renderer's men stand when not the script's: once a frame `frame`, then each man of each battalion. */
export interface MenSource {
  /** The renderer's frame at the page's clock `T` (the men's role starts are on it). */
  frame(T: number): void
  /** Whether battalion `k` is drawn otherwise than when it was last placed: the men worker's revision of it moved on
   * (its men stepped, matched again, a volley), its last volley went stale (the fire role ends with time), or it was
   * matched or lost since. */
  moved(k: number): boolean
  /** Battalion `k` (its index in the renderer's battalions) about to be placed: its centre into `at` (x, z), where
   * its men not drawn are put (none of them at the origin); false when it has no men to draw. */
  begin(k: number, at: number[]): boolean
  /** Man `i` of the battalion begun into `out`. */
  man(i: number, out: SourceMan): SourceMan
}

/** The sim's men, as the renderer's battalions and figures. */
export class SimMen implements MenSource {
  private readonly bs: readonly Battalion[]
  private readonly see: () => Seen
  private seen: Seen | null = null
  // each drawn battalion's formation (−1: not yet matched), found by where it was spawned
  private readonly formation: Int32Array
  private gen: Int32Array
  // per battalion, per man: his role (an index into ROLES) and since when (the page's clock)
  private readonly role: Uint8Array[]
  private readonly since: Float64Array[]
  // refresh() ran since the renderer's last frame (the page's tick runs first: the renderer reads what it took)
  private refreshed = false
  private T = 0
  // per battalion, as last placed: the revision of its unit (−1: none: unmatched or gone), and the tick its last fresh
  // volley goes stale at (−1: none fresh)
  private readonly placedRev: Float64Array
  private readonly fireUntil: Float64Array
  // the battalion begun: its index, unit, its type's slots' companies, and its men's roles
  private k = -1
  private u: Unit | null = null
  private slotC: Int32Array = new Int32Array(0)

  /** `bs`: the battalions drawn, as spawned (their places match their formations); `men`: figures a battalion; `see`
   * the newest frame (src/app/battle-link.ts). */
  constructor(bs: readonly Battalion[], men: number, see: () => Seen) {
    this.bs = bs
    this.see = see
    this.formation = new Int32Array(bs.length).fill(-1)
    this.placedRev = new Float64Array(bs.length).fill(NaN)
    this.fireUntil = new Float64Array(bs.length).fill(-1)
    this.gen = new Int32Array(bs.length)
    this.role = bs.map(() => new Uint8Array(men))
    this.since = bs.map(() => new Float64Array(men))
  }

  /** Takes the newest frame (held until the next take) and matches what is not matched yet: the page's tick calls it
   * each frame, shown or not, so the orders read the battle as it is. */
  refresh(): void {
    const s = this.see()
    this.seen = s
    if (this.formation.includes(-1)) this.match(s)
    this.refreshed = true
  }

  frame(T: number): void {
    this.T = T
    // (the frame the page's tick took this frame, or a new one when the renderer runs first or alone)
    if (!this.refreshed) this.refresh()
    this.refreshed = false
  }

  /** Matches each drawn battalion not yet matched to the formation of its side nearest its spawn place (each once). */
  private match(s: Seen): void {
    const f = s.w.f
    const taken = new Set(this.formation)
    for (let k = 0; k < this.bs.length; k++) {
      // matched once: a formation gone stays gone (its men hidden)
      if (this.formation[k] >= 0) continue
      const b = this.bs[k]
      let best = -1
      let bd = 25 * 25 // within 25 m of where it was spawned
      for (const u of s.layer.units.values()) {
        if (taken.has(u.i) || f.side[u.i] !== b.side) continue
        const d = (f.x[u.i] - b.x) ** 2 + (f.z[u.i] - b.z) ** 2
        if (d < bd) {
          bd = d
          best = u.i
        }
      }
      if (best >= 0) {
        this.formation[k] = best
        this.gen[k] = f.gen[best]
        taken.add(best)
      }
    }
  }

  /** The formation drawn as battalion `k` now (−1: not matched yet, or gone: its slot may be another's since). */
  formationOf(k: number): number {
    return this.unitOf(k)?.i ?? -1
  }

  /** The frame taken this frame (null before the first). */
  current(): Seen | null {
    return this.seen
  }

  /** The formation drawn as battalion `k`, and its unit in the layer (null: none yet, or gone). */
  private unitOf(k: number): Unit | null {
    const s = this.seen
    const i = this.formation[k]
    if (!s || i < 0 || !s.w.f.alive[i] || s.w.f.gen[i] !== this.gen[k]) return null
    return s.layer.units.get(i) ?? null
  }

  moved(k: number): boolean {
    const u = this.unitOf(k)
    if (!u) return this.placedRev[k] !== -1
    const until = this.fireUntil[k]
    return u.rev !== this.placedRev[k] || (until >= 0 && this.seen!.w.meta[M_TICK] >= until)
  }

  begin(k: number, at: number[]): boolean {
    this.k = k
    const u = (this.u = this.unitOf(k))
    this.placedRev[k] = u ? u.rev : -1
    this.fireUntil[k] = -1
    if (!u) {
      // unmatched yet, or gone: where it was laid out
      at[0] = this.bs[k].x
      at[1] = this.bs[k].z
      return false
    }
    const s = this.seen!
    at[0] = s.w.f.x[u.i]
    at[1] = s.w.f.z[u.i]
    this.slotC = typeOf(s.w, u.i).slotC
    // its fire roles' end: the last of its fresh volleys plus FIRE_FOR
    const w = s.w
    const C = w.cr.maxC
    const fresh = FIRE_FOR / DT
    for (let c = 0; c < C; c++) {
      const shot = w.f.volleyTick[u.i * C + c]
      if (shot && w.meta[M_TICK] - shot < fresh) this.fireUntil[k] = Math.max(this.fireUntil[k], shot + fresh)
    }
    return true
  }

  /** Man `i` of the battalion begun into `out`; shown false when it has no such man standing. */
  man(i: number, out: SourceMan): SourceMan {
    const u = this.u
    if (!u || i >= u.n) {
      out.shown = false
      return out
    }
    const s = this.seen!
    const M = s.layer.men
    const m = u.ids[i]
    if (!(M.flags[m] & MAN_ALIVE)) {
      out.shown = false
      return out
    }
    const w = s.w
    const f = w.f
    const vx = M.vx[m]
    const vz = M.vz[m]
    const speed = Math.hypot(vx, vz)
    let role: number = speed > RUN_FROM ? 2 : speed > MARCH_FROM ? 1 : 0
    if (role === 0) {
      // firing: his company's volley within FIRE_FOR s (the sim's tick of it, at the frame's tick)
      const c = this.slotC[M.s[m]]
      const shot = f.volleyTick[u.i * w.cr.maxC + c]
      if (shot && (w.meta[M_TICK] - shot) * DT < FIRE_FOR) role = 3
    }
    const roles = this.role[this.k]
    const since = this.since[this.k]
    if (roles[i] !== role) {
      roles[i] = role
      since[i] = this.T
    }
    out.x = M.x[m]
    out.z = M.z[m]
    out.yaw = speed > MARCH_FROM ? Math.atan2(vx, vz) : f.heading[u.i]
    out.role = ROLES[role]
    out.since = since[i]
    out.shown = true
    return out
  }
}
