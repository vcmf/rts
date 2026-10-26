// The soldier layer (cosmetic, every frame): one figure per man walking to his place in his battalion.
// Ported from the prototype's soldier layer (prototypes/formation-core.js). The sim keeps men per company
// and which slots are filled (decisions 0007, 0018); this layer decides who stands where and who falls:
// a man keeps his slot while it stays filled; when men fall, those whose slots emptied fall first; men
// whose slots moved walk to the nearest free filled slot; Face about relabels the men through the shape's
// half-turn. No DOM: tested in Node (test/soldiers.test.ts).
import type { World, Places } from '../sim/index.ts'
import {
  mkPlaces,
  placesCtx,
  placeAtSlot,
  filledSlots,
  menOf,
  groundGAt,
  cellK,
  impAt,
  typeOf,
  targetShape,
  makeHandle,
  KIND_FORMATION,
  DT,
  M_TICK,
  MS_RALLYING,
  fleeing,
} from '../sim/index.ts'
import type { Scene, Obstacle } from './scene.ts'
import { cosmeticRng } from './scene.ts'
import { CLASS_STYLE } from './style.ts'
import { Men, MAN_ALIVE, MAN_SETTLED, grown } from './men.ts'

export const AHEAD = 0.6
export const WALK = 1.35
export const RUN = 3.2
export const SEP = 0.52
const SC = 1.05 // neighbour grid cell (≥ 2·SEP: the 2×2 cells nearest a man hold every neighbour within SEP)
// the sway's sine, from a table (32,000 sines a frame at 16,000 men)
const WAVE_N = 1024
const WAVE = Float64Array.from({ length: WAVE_N + 1 }, (_, k) => Math.sin((k / WAVE_N) * 2 * Math.PI))
const wave = (a: number): number => {
  const u = (a / (2 * Math.PI)) * WAVE_N
  const k = Math.floor(u)
  const q = k & (WAVE_N - 1)
  return WAVE[q] + (WAVE[q + 1] - WAVE[q]) * (u - k)
}

// pose: what the places were last framed from (still: unchanged, so settled men need no new place); type: the
// unit type's name (cr.types: infantry, cavalry, battery in the Napoleonic ruleset); figure: how its men are drawn
// (UnitType.figure: foot, mounted, crewed); group: which of `step`'s groups it steps in; ids: its men's indices in
// the layer's `men`, the first n of them, in the order they joined
export interface Unit {
  i: number
  group: number
  gen: number
  side: number
  type: string
  figure: string
  ids: Int32Array
  n: number
  faces: number
  sway: number
  sig: Int32Array
  pose: Float64Array
  // bumped whenever what the battalion is drawn from changes: its men stepped (unless every one was skipped, settled
  // and still), matched again (losses, slots, Face about), or a company's volley (the renderers re-draw it then:
  // battle threads PR 4b); volleys: its companies' last volley ticks, as last seen
  rev: number
  volleys: Int32Array
}

const NO_UNITS: readonly Unit[] = []

export class SoldierLayer {
  w: World
  scene: Scene
  units = new Map<number, Unit>()
  // every man, standing or fallen (a fallen man's cross is drawn where he lies, his battalion here or gone)
  men = new Men()
  // formations that left the field (handle → the men they took), until their units go
  private leaving = new Map<number, number>()
  private ctxA: Places
  private ctx0: Places
  private rnd = cosmeticRng(7)
  private treesByClass: Uint8Array
  // per unit type, how fast its men walk and run to their places: at least the infantry's, faster for a type
  // whose pace (or its routers') would leave them behind (troopers at the trot)
  private walkOf: Float64Array
  private runOf: Float64Array
  alphaNow = 1
  // `step`'s groups: how many (0 before the first step), and the units in each
  private grouped = 0
  private byGroup: Unit[][] = []
  // the neighbour grid: per cell the first man, per man the next, and the men's positions as the round began
  private cellHead: Int32Array
  private cellNext = new Int32Array(1024)
  private flatX = new Float64Array(1024)
  private flatZ = new Float64Array(1024)
  private nFlat = 0
  // the cells holding men, the first nTouched (a typed array: an array's `length = 0` frees its store, and it
  // grew again every round)
  private touched = new Int32Array(1024)
  private nTouched = 0
  private SN: number
  // `sync`'s scratch: per slot, filled and claimed; the men who must find a new slot; a place
  private occ = new Uint8Array(0)
  private claimed = new Uint8Array(0)
  private displaced = new Int32Array(0)
  private p = [0, 0, 0]
  private anch = [0, 0, 0]
  // per obstacle cell, the trunks in it and the 8 around it (the cells scene.ts eachObstacle visits), flattened:
  // cell k's are [treeAt[k], treeAt[k + 1]) of treeX, treeZ, treeR; most cells have none. The grid has a ring
  // of cells outside the scene's, so a man just off its edge still sees the trunks inside
  private treeAt: Int32Array
  private treeX: Float64Array
  private treeZ: Float64Array
  private treeR: Float64Array
  constructor(w: World, scene: Scene) {
    this.w = w
    this.scene = scene
    this.ctxA = mkPlaces(w)
    this.ctx0 = mkPlaces(w)
    this.poseNow = new Float64Array(8 + 2 * w.cr.maxNB)
    // a charging type's gallop too
    const top = w.cr.types.map(U =>
      Math.max(
        ...[...U.shapes.flatMap(L => [L.pace, L.roadPace]), ...(U.charge ? [U.charge.pace] : [])]
          .filter(p => p >= 0)
          .map(p => w.cr.paceSpeed[p]),
      ),
    )
    this.walkOf = Float64Array.from(top, v => Math.max(WALK, 1.2 * v))
    this.runOf = Float64Array.from(top, v => Math.max(RUN, 1.2 * w.cr.rs.morale.routPace * v))
    this.treesByClass = Uint8Array.from(Object.keys(w.cr.rs.terrain), name =>
      (CLASS_STYLE[name]?.trees ?? 0) > 0 ? 1 : 0,
    )
    const span = (w.terrain.n - 1) * w.terrain.cell
    this.SN = Math.ceil(span / SC) + 1
    this.cellHead = new Int32Array(this.SN * this.SN).fill(-1)
    const n = scene.obstacleN
    const N = n + 2
    const near: Obstacle[] = []
    this.treeAt = new Int32Array(N * N + 1)
    for (let b = -1; b <= n; b++) {
      for (let a = -1; a <= n; a++) {
        this.treeAt[(b + 1) * N + a + 1] = near.length
        for (let db = -1; db <= 1; db++) {
          for (let da = -1; da <= 1; da++) {
            const p = a + da
            const q = b + db
            if (p >= 0 && q >= 0 && p < n && q < n) near.push(...scene.obstacleGrid[q * n + p])
          }
        }
      }
    }
    this.treeAt[N * N] = near.length
    this.treeX = Float64Array.from(near, o => o.x)
    this.treeZ = Float64Array.from(near, o => o.z)
    this.treeR = Float64Array.from(near, o => o.r)
  }
  // the obstacle cell at (x, z) in the ringed grid, −1 farther out (no trunk within reach)
  private treeCell(x: number, z: number): number {
    const s = this.scene
    const N = s.obstacleN + 2
    const i = Math.floor((x - s.x0) / s.obstacleCell) + 1
    const j = Math.floor((z - s.z0) / s.obstacleCell) + 1
    return i < 0 || j < 0 || i >= N || j >= N ? -1 : j * N + i
  }

  // the anchor this frame: interpolated between ticks (alpha), extrapolated `ahead` seconds
  anchor(i: number, alpha: number, ahead: number): [number, number, number] {
    const out: [number, number, number] = [0, 0, 0]
    this.anchorTo(i, alpha, ahead, out)
    return out
  }
  /** `anchor` into `out` (x, z, heading), allocating nothing. */
  private anchorTo(i: number, alpha: number, ahead: number, out: number[]): void {
    const f = this.w.f
    let dh = f.heading[i] - f.ph[i]
    dh = Math.atan2(Math.sin(dh), Math.cos(dh))
    out[0] = f.px[i] + (f.x[i] - f.px[i]) * alpha + f.vx[i] * ahead
    out[1] = f.pz[i] + (f.z[i] - f.pz[i]) * alpha + f.vz[i] * ahead
    out[2] = f.ph[i] + dh * alpha + f.omega[i] * ahead
  }
  // places for formation i at this frame: ahead (where the men aim) and now; `place` reads the last framed
  frame(i: number, alpha: number): void {
    const t = (this.w.meta[M_TICK] - 1 + alpha) * DT
    const A = this.framed
    const a = this.anch
    this.anchorTo(i, alpha, AHEAD, a)
    A[0] = a[0]
    A[1] = a[1]
    A[2] = a[2]
    this.anchorTo(i, alpha, 0, a)
    A[3] = a[0]
    A[4] = a[1]
    A[5] = a[2]
    placesCtx(this.ctxA, i, A[0], A[1], A[2], t + AHEAD, AHEAD - (1 - alpha) * DT)
    placesCtx(this.ctx0, i, A[3], A[4], A[5], t, -(1 - alpha) * DT)
  }
  private framed = new Float64Array(6) // the anchors the last frame() used: ahead, then now
  private kindOf(i: number): number {
    return typeOf(this.w, i).shapes[targetShape(this.w, i)].kind
  }
  // a man's place (`ahead`: where he aims; a place on impassable ground falls back to the place now)
  place(i: number, s: number, ahead: boolean, out: number[], imp?: Uint8Array): number[] {
    if (!ahead) return placeAtSlot(this.ctx0, s, out)
    placeAtSlot(this.ctxA, s, out)
    if (impAt(this.w.terrain, imp ?? this.w.terrain.imp[this.kindOf(i)], out[0], out[1])) placeAtSlot(this.ctx0, s, out)
    return out
  }
  // what the places of formation i were framed from (call after frame(i)): the anchors, the trail, the lags
  // and their rates; returns how many entries of out it wrote
  private poseOf(i: number, out: Float64Array): number {
    const f = this.w.f
    const NB = typeOf(this.w, i).NB
    const NS = this.w.cr.maxNB
    out.set(this.framed)
    out[6] = f.trailVer[i]
    out[7] = f.trans[i]
    for (let j = 0; j < NB; j++) {
      out[8 + 2 * j] = f.lags[i * NS + j]
      out[9 + 2 * j] = f.lagRate[i * NS + j]
    }
    return 8 + 2 * NB
  }

  // what decides which slots are filled: men per company, shape, the shape it changes to, the lean, faces
  private sign(sig: Int32Array, i: number): void {
    const f = this.w.f
    const C = typeOf(this.w, i).C
    const CS = this.w.cr.maxC
    for (let c = 0; c < C; c++) sig[c] = f.men[i * CS + c]
    sig[C] = f.shape[i]
    sig[C + 1] = f.trans[i]
    sig[C + 2] = f.tShape[i]
    sig[C + 3] = f.lean[i]
    sig[C + 4] = f.faces[i]
  }
  private same(sig: Int32Array, i: number): boolean {
    const f = this.w.f
    const C = typeOf(this.w, i).C
    const CS = this.w.cr.maxC
    for (let c = 0; c < C; c++) if (sig[c] !== f.men[i * CS + c]) return false
    return (
      sig[C] === f.shape[i] &&
      sig[C + 1] === f.trans[i] &&
      sig[C + 2] === f.tShape[i] &&
      sig[C + 3] === f.lean[i] &&
      sig[C + 4] === f.faces[i]
    )
  }
  // matches the men to the sim: new battalions, battalions gone, Face about, losses, slots that moved.
  // Call it after every tick (`step` calls it too, once a round): a Face about is relabelled through the
  // shape it turned in, which a later change of shape within the same frame would otherwise replace.
  // `departed`: the tick's formations that left the field (TickResult), with the men they took
  sync(alpha: number, departed?: readonly { id: number; men: number }[]): void {
    const w = this.w
    const f = w.f
    const N = f.alive.length
    const M = this.men
    const p = this.p
    if (departed) for (const d of departed) this.leaving.set(d.id, d.men)
    // a formation gone: its men fell, unless it left the field (S1e-1), when the men it took go with it and any
    // more the layer still had standing (killed in that same tick) fall
    for (const u of this.units.values()) {
      const i = u.i
      if (!f.alive[i] || f.gen[i] !== u.gen) {
        const h = makeHandle(KIND_FORMATION, i, u.gen)
        const took = this.leaving.get(h)
        let fall = Infinity
        if (took !== undefined) {
          this.leaving.delete(h)
          fall = this.standing(u) - took
        }
        for (let k = 0; k < u.n; k++) {
          const m = u.ids[k]
          if (M.flags[m] & MAN_ALIVE) {
            if (fall <= 0) M.leave(m)
            else {
              M.flags[m] &= ~MAN_ALIVE
              fall--
            }
          }
        }
        this.units.delete(i)
        this.leaveGroup(u)
      }
    }
    // a departure no battalion here matched (one the layer never had: spawned and gone between two syncs, as a men
    // worker behind its ring sees) is done with: kept, a later formation with the same handle would be taken to leave
    this.leaving.clear()
    for (let i = 0; i < N; i++) {
      if (!f.alive[i]) continue
      let u = this.units.get(i)
      if (u) this.seeVolleys(u)
      // which slots are filled changes only with the men, the shape (or the one it changes to), the lean
      // and Face about: nothing to match otherwise
      if (u && this.same(u.sig, i)) continue
      this.frame(i, alpha)
      const U = typeOf(w, i)
      const C = U.C
      const slots = U.slots
      if (!u) {
        u = {
          i,
          group: 0,
          gen: f.gen[i],
          side: f.side[i],
          type: U.name,
          figure: U.def.figure,
          ids: new Int32Array(slots),
          n: 0,
          faces: f.faces[i],
          sway: 0,
          sig: new Int32Array(C + 5),
          pose: new Float64Array(8 + 2 * w.cr.maxNB).fill(NaN),
          rev: 0,
          volleys: new Int32Array(w.cr.maxC),
        }
        this.units.set(i, u)
        this.joinGroup(u)
        this.seeVolleys(u)
      }
      this.sign(u.sig, i)
      u.rev++
      if (u.faces !== f.faces[i]) {
        // Face about: each man's slot is now the half-turn of his old one
        const T = U.shapes[f.shape[i]].turn
        if (T) {
          for (let k = u.faces; k < f.faces[i]; k++) {
            for (let j = 0; j < u.n; j++) {
              const m = u.ids[j]
              if (M.flags[m] & MAN_ALIVE) M.s[m] = T.m[M.s[m]]
            }
          }
        }
        u.faces = f.faces[i]
      }
      if (this.occ.length < slots) {
        this.occ = new Uint8Array(slots)
        this.claimed = new Uint8Array(slots)
      }
      // no more are displaced than stand
      if (this.displaced.length < u.n) this.displaced = new Int32Array(u.n)
      const occ = this.occ.fill(0, 0, slots)
      const claimed = this.claimed.fill(0, 0, slots)
      const displaced = this.displaced
      let nd = 0
      const F = filledSlots(w, i)
      const a = i * (w.cr.maxC + 1)
      for (let k = F.at[a], e = F.at[a + C]; k < e; k++) occ[F.s[k]] = 1
      let alive = 0
      for (let j = 0; j < u.n; j++) {
        const m = u.ids[j]
        if (M.flags[m] & MAN_ALIVE) {
          alive++
          const s = M.s[m]
          if (occ[s] && !claimed[s]) claimed[s] = 1
          else displaced[nd++] = m
        }
      }
      const men = menOf(w, i)
      // losses: the displaced fall first, then men drawn at random
      while (alive > men) {
        const fromDisplaced = nd > 0 // a displaced man holds no claim; one drawn at random frees his slot
        const m = fromDisplaced ? displaced[--nd] : this.nthStanding(u, Math.floor(this.rnd() * alive))
        M.flags[m] &= ~MAN_ALIVE
        M.vx[m] = 0
        M.vz[m] = 0
        alive--
        if (!fromDisplaced) claimed[M.s[m]] = 0
      }
      // the displaced walk to the nearest free filled slot
      for (let k = 0; k < nd; k++) {
        const m = displaced[k]
        if (!(M.flags[m] & MAN_ALIVE)) continue
        let best = -1
        let bd = Infinity
        for (let s = 0; s < slots; s++) {
          if (occ[s] && !claimed[s]) {
            this.place(i, s, false, p)
            const d = (p[0] - M.x[m]) * (p[0] - M.x[m]) + (p[1] - M.z[m]) * (p[1] - M.z[m])
            if (d < bd) {
              bd = d
              best = s
            }
          }
        }
        if (best >= 0) {
          M.s[m] = best
          claimed[best] = 1
          M.flags[m] &= ~MAN_SETTLED
        }
      }
      // new men (a battalion appearing): at their places
      for (let s = 0; s < slots && alive < men; s++) {
        if (occ[s] && !claimed[s]) {
          this.place(i, s, false, p)
          this.enlist(u, M.add(s, p[0], p[1], this.rnd() * 6.28, this.rnd() * 6.28))
          claimed[s] = 1
          alive++
        }
      }
    }
  }
  /**
   * Where company `c`'s front rank stands: the middle of its standing men, into `out` (x, z). Returns how many
   * stand in it (0: none, and `out` untouched).
   */
  frontRank(u: Unit, c: number, out: number[]): number {
    const g0 = typeOf(this.w, u.i).geo
    const RF = g0.ranks * g0.files
    const M = this.men
    let x = 0
    let z = 0
    let n = 0
    for (let j = 0; j < u.n; j++) {
      const m = u.ids[j]
      const s = M.s[m]
      if (M.flags[m] & MAN_ALIVE && Math.floor(s / RF) === c && Math.floor((s % RF) / g0.files) === 0) {
        x += M.x[m]
        z += M.z[m]
        n++
      }
    }
    if (n) {
      out[0] = x / n
      out[1] = z / n
    }
    return n
  }
  /** Takes a battalion's companies' last volleys: a new one moves its revision on (its company fires). */
  private seeVolleys(u: Unit): void {
    const f = this.w.f
    const C = this.w.cr.maxC
    for (let c = 0; c < C; c++) {
      const t = f.volleyTick[u.i * C + c]
      if (t !== u.volleys[c]) {
        u.volleys[c] = t
        u.rev++
      }
    }
  }
  /** How many of a battalion's men stand. */
  private standing(u: Unit): number {
    const F = this.men.flags
    let n = 0
    for (let k = 0; k < u.n; k++) if (F[u.ids[k]] & MAN_ALIVE) n++
    return n
  }
  /** The index of a battalion's `r`-th standing man, in the order they joined. */
  private nthStanding(u: Unit, r: number): number {
    const F = this.men.flags
    for (let k = 0; k < u.n; k++) if (F[u.ids[k]] & MAN_ALIVE && r-- === 0) return u.ids[k]
    throw new Error(`battalion ${u.i}: no standing man ${r} (the standing count drifted)`)
  }
  /** Adds man `m` to a battalion's list, growing it if full. */
  private enlist(u: Unit, m: number): void {
    if (u.n === u.ids.length) u.ids = grown(u.ids, Math.max(8, u.n * 2))
    u.ids[u.n++] = m
  }

  /**
   * One step: the men of one group of battalions steer to their places for `dt` seconds of game time. A round
   * (groups 0 to `groups` − 1) starts with a sync and the neighbour grid's rebuild, so the round's groups share one
   * grid as one ungrouped step does (each man pushed by where the others stood when the round began). Men lost or
   * added within a round show in the grid at the next. A battalion keeps its group while it lasts: the clock
   * (src/render/men-clock.ts) gives each group the game time since that group's last step.
   * @param dt game seconds this group's step covers
   * @param alpha the tick's interpolation, 0 to 1
   * @param group the group to step, 0 to `groups` − 1
   * @param groups how many groups a round has (a new count shares every battalion out again)
   */
  step(dt: number, alpha: number, group: number, groups: number): void {
    this.alphaNow = alpha
    if (group === 0) {
      this.sync(alpha)
      if (groups !== this.grouped) this.shareOut(groups)
      this.buildGrid()
    }
    this.steer(dt, alpha, this.byGroup[group] ?? NO_UNITS)
  }
  /** Shares every battalion out among `groups` groups, about the same men in each: the largest first, each to the
   * lightest group. */
  private shareOut(groups: number): void {
    this.grouped = groups
    this.byGroup = Array.from({ length: groups }, () => [])
    const bySize = [...this.units.values()].sort((a, b) => menOf(this.w, b.i) - menOf(this.w, a.i) || a.i - b.i)
    for (const u of bySize) this.joinGroup(u)
  }
  /** Puts a battalion in the group with the fewest men now (none before the first step: `shareOut` does it). */
  private joinGroup(u: Unit): void {
    if (this.grouped === 0) return
    let g = 0
    let least = Infinity
    for (let k = 0; k < this.grouped; k++) {
      const men = this.byGroup[k].reduce((n, v) => n + menOf(this.w, v.i), 0)
      if (men < least) {
        least = men
        g = k
      }
    }
    u.group = g
    this.byGroup[g].push(u)
  }
  /** Takes a battalion that is gone out of its group. */
  private leaveGroup(u: Unit): void {
    const list = this.byGroup[u.group]
    const k = list ? list.indexOf(u) : -1
    if (k >= 0) list.splice(k, 1)
  }
  /** Rebuilds the neighbour grid (cells and linked lists in typed arrays) from where the men stand now. */
  private buildGrid(): void {
    const t = this.w.terrain
    const x0 = t.x0
    const z0 = t.z0
    const SN = this.SN
    for (let k = 0; k < this.nTouched; k++) this.cellHead[this.touched[k]] = -1
    this.nTouched = 0
    this.nFlat = 0
    const M = this.men
    for (const u of this.units.values()) {
      for (let j = 0; j < u.n; j++) {
        const m = u.ids[j]
        if (M.flags[m] & MAN_ALIVE) {
          const mx = M.x[m]
          const mz = M.z[m]
          const ci = Math.floor((mx - x0) / SC)
          const cj = Math.floor((mz - z0) / SC)
          const cell = ci >= 0 && cj >= 0 && ci < SN && cj < SN ? ci * SN + cj : -1
          const k = this.nFlat++
          if (k >= this.cellNext.length) this.grow()
          this.flatX[k] = mx
          this.flatZ[k] = mz
          if (cell >= 0) {
            if (this.cellHead[cell] < 0) this.touched[this.nTouched++] = cell
            this.cellNext[k] = this.cellHead[cell]
            this.cellHead[cell] = k
          } else this.cellNext[k] = -1
        }
      }
    }
  }
  /** Steers the men of `units` to their places for `dt` game seconds, at the tick's interpolation `alpha`. */
  private steer(dt: number, alpha: number, units: readonly Unit[]): void {
    const w = this.w
    const f = w.f
    const t = w.terrain
    const x0 = t.x0
    const z0 = t.z0
    const xMax = x0 + (t.n - 1) * t.cell
    const zMax = z0 + (t.n - 1) * t.cell
    const SN = this.SN
    const p = this.p
    const TA = this.treeAt
    const TX = this.treeX
    const TZ = this.treeZ
    const TR = this.treeR
    const tt = w.meta[M_TICK] * DT * 0.35
    const X = this.flatX
    const Z = this.flatZ
    const head = this.cellHead
    const next = this.cellNext
    const M = this.men
    const MX = M.x
    const MZ = M.z
    const MVX = M.vx
    const MVZ = M.vz
    const FL = M.flags
    const MS = M.s
    const MDX = M.dx
    const MDZ = M.dz
    const MHX = M.hx
    const MHZ = M.hz
    for (const u of units) {
      const i = u.i
      this.frame(i, alpha)
      const busy = !!(f.trans[i] || f.ordHead[i] >= 0)
      // sway eases out at the halt, so the ranks come to rest
      u.sway += ((busy ? 1 : 0) - u.sway) * Math.min(1, dt * 0.8)
      // still: halted, and every place framed as last frame, so a settled man's place has not moved
      const pose = this.poseNow
      const np = this.poseOf(i, pose)
      let still = !busy
      for (let k = 0; still && k < np; k++) still = pose[k] === u.pose[k]
      for (let k = 0; k < np; k++) u.pose[k] = pose[k]
      const kind = this.kindOf(i)
      const imp = t.imp[kind]
      const ty = f.type[i]
      const WALKu = this.walkOf[ty]
      const RUNu = this.runOf[ty]
      const ids = u.ids
      // (a man not skipped: the battalion's revision moves on)
      let touched = false
      for (let j = 0, n = u.n; j < n; j++) {
        const m = ids[j]
        const fl = FL[m]
        if (!(fl & MAN_ALIVE) || (still && fl & MAN_SETTLED)) continue
        touched = true
        this.place(i, MS[m], true, p, imp)
        let mx = MX[m]
        let mz = MZ[m]
        const here = cellK(t, mx, mz)
        const inTrees = this.treesByClass[t.cls[here]] === 1
        // personal drift: the ranks loosen among trees, break up when the battalion routs or shatters, and are
        // still loose while it rallies
        const amp = (fleeing(f.mstate[i]) ? 1.5 : f.mstate[i] === MS_RALLYING ? 0.6 : inTrees ? 0.3 : 0.1) * u.sway
        let tx = p[0]
        let tz = p[1]
        if (amp > 1e-4) {
          tx += amp * wave(tt + MDX[m])
          tz += amp * wave(tt * 0.8 + MDZ[m])
        }
        // a place inside a trunk moves to its edge: a stable place to stand, not a tug of war
        let tc = this.treeCell(tx, tz)
        if (tc >= 0) {
          for (let k = TA[tc], e = TA[tc + 1]; k < e; k++) {
            const ox = TX[k]
            const oz = TZ[k]
            const ex = tx - ox
            const ez = tz - oz
            const d = Math.sqrt(ex * ex + ez * ez)
            const R = TR[k] + 0.4
            if (d < R) {
              if (d > 1e-6) {
                tx = ox + (ex / d) * R
                tz = oz + (ez / d) * R
              } else tx = ox + R
            }
          }
        }
        // settled: a man at his place while his battalion is halted holds still until his place moves
        if (fl & MAN_SETTLED) {
          if (busy || Math.hypot(tx - MHX[m], tz - MHZ[m]) > 0.3) FL[m] = fl & ~MAN_SETTLED
          else {
            MVX[m] = 0
            MVZ[m] = 0
            continue
          }
        }
        const dx = tx - mx
        const dz = tz - mz
        const dist = Math.sqrt(dx * dx + dz * dz)
        if (!busy && u.sway < 0.05 && dist < 0.25) {
          FL[m] |= MAN_SETTLED
          MHX[m] = tx
          MHZ[m] = tz
          MVX[m] = 0
          MVZ[m] = 0
          continue
        }
        // never frozen mid-step
        const gs = Math.max(
          0.15,
          dist > 1e-6 ? groundGAt(t, here, kind, dx / dist, dz / dist) : groundGAt(t, here, kind, 0, 0),
        )
        const top = (dist > 2.5 ? RUNu : WALKu) * gs
        const want = dist < 0.08 ? 0 : Math.min(top, dist / 0.7)
        let wx = dist > 1e-6 ? (dx / dist) * want : 0
        let wz = dist > 1e-6 ? (dz / dist) * want : 0
        // his cell and the neighbouring cells on the sides of it he is nearer to
        const u0 = (mx - x0) / SC
        const v0 = (mz - z0) / SC
        const ci = Math.floor(u0)
        const cj = Math.floor(v0)
        const a0 = u0 - ci < 0.5 ? ci - 1 : ci
        const b0 = v0 - cj < 0.5 ? cj - 1 : cj
        for (let a = a0; a <= a0 + 1; a++) {
          for (let b = b0; b <= b0 + 1; b++) {
            if (a < 0 || b < 0 || a >= SN || b >= SN) continue
            for (let k = head[a * SN + b]; k >= 0; k = next[k]) {
              // himself: at distance 0, skipped
              const ex = mx - X[k]
              const ez = mz - Z[k]
              const d2 = ex * ex + ez * ez
              if (d2 < SEP * SEP && d2 > 1e-8) {
                const d = Math.sqrt(d2)
                const push = ((SEP - d) / SEP) * 1.8
                wx += (ex / d) * push
                wz += (ez / d) * push
              }
            }
          }
        }
        // while walking, steer round the trunks just ahead
        let vx = MVX[m]
        let vz = MVZ[m]
        const walking = Math.min(1, Math.sqrt(vx * vx + vz * vz) / 0.5)
        tc = this.treeCell(mx, mz)
        if (walking > 0 && tc >= 0) {
          for (let k = TA[tc], e = TA[tc + 1]; k < e; k++) {
            const ex = mx - TX[k]
            const ez = mz - TZ[k]
            const d = Math.sqrt(ex * ex + ez * ez)
            const R = TR[k] + 0.35
            if (d < R + 0.8 && d > 1e-6) {
              const push = ((R + 0.8 - d) / 0.8) * 1.4 * walking
              wx += (ex / d) * push
              wz += (ez / d) * push
            }
          }
        }
        const kk = Math.min(1, dt * 5)
        vx += (wx - vx) * kk
        vz += (wz - vz) * kk
        // arrived: come to rest
        if (dist < 0.08) {
          const damp = Math.max(0, 1 - dt * 8)
          vx *= damp
          vz *= damp
        }
        const sp2 = vx * vx + vz * vz
        const cap = RUNu * gs
        if (sp2 > cap * cap) {
          const r = cap / Math.sqrt(sp2)
          vx *= r
          vz *= r
        }
        const nx = mx + vx * dt
        const nz = mz + vz * dt
        // never onto impassable ground, nor off the map
        if (impAt(t, imp, nx, nz) && !imp[here]) {
          vx = 0
          vz = 0
        } else {
          mx = nx
          mz = nz
        }
        tc = this.treeCell(mx, mz)
        if (tc >= 0) {
          for (let k = TA[tc], e = TA[tc + 1]; k < e; k++) {
            // never inside a trunk
            const ex = mx - TX[k]
            const ez = mz - TZ[k]
            const d = Math.sqrt(ex * ex + ez * ez)
            const R = TR[k] + 0.3
            if (d < R && d > 1e-6) {
              mx = TX[k] + (ex / d) * R
              mz = TZ[k] + (ez / d) * R
            }
          }
        }
        // a trunk's push never takes him off the map
        MX[m] = Math.min(xMax, Math.max(t.x0, mx))
        MZ[m] = Math.min(zMax, Math.max(t.z0, mz))
        MVX[m] = vx
        MVZ[m] = vz
      }
      if (touched) u.rev++
    }
  }
  private poseNow: Float64Array
  /** Doubles the grid's per-man arrays. */
  private grow(): void {
    const n = this.cellNext.length * 2
    this.cellNext = grown(this.cellNext, n)
    this.flatX = grown(this.flatX, n)
    this.flatZ = grown(this.flatZ, n)
    // no more cells hold men than there are men
    this.touched = grown(this.touched, n)
  }
  // how far men stand from their places (a measurement): max and mean, metres
  slotError(): { max: number; mean: number } {
    let max = 0
    let sum = 0
    let n = 0
    const p = [0, 0, 0]
    for (const u of this.units.values()) {
      this.frame(u.i, this.alphaNow)
      for (let j = 0; j < u.n; j++) {
        const m = u.ids[j]
        if (this.men.flags[m] & MAN_ALIVE) {
          this.place(u.i, this.men.s[m], false, p)
          const d = Math.hypot(this.men.x[m] - p[0], this.men.z[m] - p[1])
          max = Math.max(max, d)
          sum += d
          n++
        }
      }
    }
    return { max, mean: n ? sum / n : 0 }
  }
}
