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

export interface Man {
  s: number
  x: number
  z: number
  vx: number
  vz: number
  alive: boolean
  dx: number
  dz: number
  settled: boolean
  hx: number
  hz: number
}
// pose: what the places were last framed from (still: unchanged, so settled men need no new place); type: the
// unit type's name (cr.types: infantry, cavalry, battery in the Napoleonic ruleset); figure: how its men are drawn
// (UnitType.figure: foot, mounted, crewed); group: which of `step`'s groups it steps in
export interface Unit {
  i: number
  group: number
  gen: number
  side: number
  type: string
  figure: string
  men: Man[]
  faces: number
  sway: number
  sig: Int32Array
  pose: Float64Array
}

export class SoldierLayer {
  w: World
  scene: Scene
  units = new Map<number, Unit>()
  fallen: Man[] = [] // men of battalions that are gone
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
  // the group count the units were last shared out for (`step`), and whether units came or went since
  private grouped = 0
  private regroup = false
  // the neighbour grid: per cell the first man, per man the next, and the men's positions as the frame began
  private cellHead: Int32Array
  private cellNext = new Int32Array(1024)
  private flatX = new Float64Array(1024)
  private flatZ = new Float64Array(1024)
  private nFlat = 0
  private touched: number[] = []
  private SN: number
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
    const f = this.w.f
    let dh = f.heading[i] - f.ph[i]
    dh = Math.atan2(Math.sin(dh), Math.cos(dh))
    return [
      f.px[i] + (f.x[i] - f.px[i]) * alpha + f.vx[i] * ahead,
      f.pz[i] + (f.z[i] - f.pz[i]) * alpha + f.vz[i] * ahead,
      f.ph[i] + dh * alpha + f.omega[i] * ahead,
    ]
  }
  // places for formation i at this frame: ahead (where the men aim) and now; `place` reads the last framed
  frame(i: number, alpha: number): void {
    const t = (this.w.meta[M_TICK] - 1 + alpha) * DT
    const A = this.framed
    const [hx, hz, h] = this.anchor(i, alpha, AHEAD)
    const [x0, z0, h0] = this.anchor(i, alpha, 0)
    A[0] = hx
    A[1] = hz
    A[2] = h
    A[3] = x0
    A[4] = z0
    A[5] = h0
    placesCtx(this.ctxA, i, hx, hz, h, t + AHEAD, AHEAD - (1 - alpha) * DT)
    placesCtx(this.ctx0, i, x0, z0, h0, t, -(1 - alpha) * DT)
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
  // Call it after every tick (and `step` calls it each frame): a Face about is relabelled through the
  // shape it turned in, which a later change of shape within the same frame would otherwise replace.
  // `departed`: the tick's formations that left the field (TickResult), with the men they took
  sync(alpha: number, departed?: readonly { id: number; men: number }[]): void {
    const w = this.w
    const f = w.f
    const N = f.alive.length
    const p = [0, 0, 0]
    if (departed) for (const d of departed) this.leaving.set(d.id, d.men)
    // a formation gone: its men fell, unless it left the field (S1e-1), when the men it took go with it and any
    // more the layer still had standing (killed in that same tick) fall
    for (const [i, u] of this.units) {
      if (!f.alive[i] || f.gen[i] !== u.gen) {
        const h = makeHandle(KIND_FORMATION, i, u.gen)
        const took = this.leaving.get(h)
        let fall = Infinity
        if (took !== undefined) {
          this.leaving.delete(h)
          fall = u.men.filter(m => m.alive).length - took
        }
        for (const m of u.men) {
          if (m.alive) {
            if (fall <= 0) continue
            m.alive = false
            fall--
          }
          this.fallen.push(m)
        }
        this.units.delete(i)
        this.regroup = true
      }
    }
    for (let i = 0; i < N; i++) {
      if (!f.alive[i]) continue
      let u = this.units.get(i)
      // which slots are filled changes only with the men, the shape (or the one it changes to), the lean
      // and Face about: nothing to match otherwise
      if (u && this.same(u.sig, i)) continue
      this.frame(i, alpha)
      const U = typeOf(w, i)
      const C = U.C
      if (!u) {
        u = {
          i,
          group: 0,
          gen: f.gen[i],
          side: f.side[i],
          type: U.name,
          figure: U.def.figure,
          men: [],
          faces: f.faces[i],
          sway: 0,
          sig: new Int32Array(C + 5),
          pose: new Float64Array(8 + 2 * w.cr.maxNB).fill(NaN),
        }
        this.units.set(i, u)
        this.regroup = true
      }
      this.sign(u.sig, i)
      if (u.faces !== f.faces[i]) {
        // Face about: each man's slot is now the half-turn of his old one
        const T = U.shapes[f.shape[i]].turn
        for (let k = u.faces; k < f.faces[i]; k++) if (T) for (const m of u.men) if (m.alive) m.s = T.m[m.s]
        u.faces = f.faces[i]
      }
      const slots = U.slots
      const occ = new Uint8Array(slots)
      const claimed = new Uint8Array(slots)
      const F = filledSlots(w, i)
      const a = i * (w.cr.maxC + 1)
      for (let k = F.at[a], e = F.at[a + C]; k < e; k++) occ[F.s[k]] = 1
      const displaced: Man[] = []
      let alive = 0
      for (const m of u.men) {
        if (m.alive) {
          alive++
          if (occ[m.s] && !claimed[m.s]) claimed[m.s] = 1
          else displaced.push(m)
        }
      }
      const men = menOf(w, i)
      // losses: the displaced fall first, then men drawn at random
      while (alive > men) {
        const fromDisplaced = displaced.length > 0 // a displaced man holds no claim; one drawn at random frees his slot
        const m = fromDisplaced
          ? displaced.pop()!
          : (() => {
              const live = u!.men.filter(x => x.alive)
              return live[Math.floor(this.rnd() * live.length)]
            })()
        m.alive = false
        m.vx = 0
        m.vz = 0
        alive--
        if (!fromDisplaced) claimed[m.s] = 0
      }
      // the displaced walk to the nearest free filled slot
      for (const m of displaced) {
        if (!m.alive) continue
        let best = -1
        let bd = Infinity
        for (let s = 0; s < slots; s++) {
          if (occ[s] && !claimed[s]) {
            this.place(i, s, false, p)
            const d = (p[0] - m.x) * (p[0] - m.x) + (p[1] - m.z) * (p[1] - m.z)
            if (d < bd) {
              bd = d
              best = s
            }
          }
        }
        if (best >= 0) {
          m.s = best
          claimed[best] = 1
          m.settled = false
        }
      }
      // new men (a battalion appearing): at their places
      for (let s = 0; s < slots && alive < men; s++) {
        if (occ[s] && !claimed[s]) {
          this.place(i, s, false, p)
          u.men.push({
            s,
            x: p[0],
            z: p[1],
            vx: 0,
            vz: 0,
            alive: true,
            dx: this.rnd() * 6.28,
            dz: this.rnd() * 6.28,
            settled: false,
            hx: 0,
            hz: 0,
          })
          claimed[s] = 1
          alive++
        }
      }
    }
  }

  /**
   * One step: the men of one group of battalions steer to their places for `dt` seconds of game time. A round
   * (groups 0 to `groups` − 1) starts with a sync, the units shared out among the groups if they changed, and the
   * neighbour grid's rebuild, so the round's groups share one grid as one ungrouped step does (each man pushed by
   * where the others stood when the round began). Men lost or added within a round show in the grid at the next.
   */
  step(dt: number, alpha: number, group = 0, groups = 1): void {
    this.alphaNow = alpha
    if (group === 0) {
      this.sync(alpha)
      if (this.regroup || groups !== this.grouped) this.shareOut(groups)
      this.buildGrid()
    }
    this.steer(dt, alpha, group)
  }
  // the units among `groups` groups, about the same men in each: the largest first, each to the lightest group
  private shareOut(groups: number): void {
    const load = new Float64Array(groups)
    const standing = (u: Unit) => u.men.reduce((n, m) => n + (m.alive ? 1 : 0), 0)
    const bySize = [...this.units.values()].map(u => ({ u, n: standing(u) }))
    bySize.sort((a, b) => b.n - a.n || a.u.i - b.u.i)
    for (const { u, n } of bySize) {
      let g = 0
      for (let k = 1; k < groups; k++) if (load[k] < load[g]) g = k
      u.group = g
      load[g] += n
    }
    this.grouped = groups
    this.regroup = false
  }
  // the neighbour grid: cells and linked lists in typed arrays, with the men's positions as it is built
  private buildGrid(): void {
    const t = this.w.terrain
    const x0 = t.x0
    const z0 = t.z0
    const SN = this.SN
    for (const c of this.touched) this.cellHead[c] = -1
    this.touched.length = 0
    this.nFlat = 0
    for (const u of this.units.values()) {
      for (const m of u.men) {
        if (m.alive) {
          const ci = Math.floor((m.x - x0) / SC)
          const cj = Math.floor((m.z - z0) / SC)
          const cell = ci >= 0 && cj >= 0 && ci < SN && cj < SN ? ci * SN + cj : -1
          const k = this.nFlat++
          if (k >= this.cellNext.length) this.grow()
          this.flatX[k] = m.x
          this.flatZ[k] = m.z
          if (cell >= 0) {
            if (this.cellHead[cell] < 0) this.touched.push(cell)
            this.cellNext[k] = this.cellHead[cell]
            this.cellHead[cell] = k
          } else this.cellNext[k] = -1
        }
      }
    }
  }
  private steer(dt: number, alpha: number, group: number): void {
    const w = this.w
    const f = w.f
    const t = w.terrain
    const x0 = t.x0
    const z0 = t.z0
    const xMax = x0 + (t.n - 1) * t.cell
    const zMax = z0 + (t.n - 1) * t.cell
    const SN = this.SN
    const p = [0, 0, 0]
    const TA = this.treeAt
    const TX = this.treeX
    const TZ = this.treeZ
    const TR = this.treeR
    const tt = w.meta[M_TICK] * DT * 0.35
    const X = this.flatX
    const Z = this.flatZ
    const head = this.cellHead
    const next = this.cellNext
    for (const u of this.units.values()) {
      const i = u.i
      if (u.group !== group) continue
      this.frame(i, alpha)
      const busy = !!(f.trans[i] || f.ordHead[i] >= 0)
      // sway eases out at the halt, so the ranks come to rest
      u.sway += ((busy ? 1 : 0) - u.sway) * Math.min(1, dt * 0.8)
      // still: halted, and every place framed as last frame, so a settled man's place has not moved
      const pose = this.poseNow
      const np = this.poseOf(i, pose)
      let still = !busy
      for (let k = 0; still && k < np; k++) still = pose[k] === u.pose[k]
      u.pose.set(pose.subarray(0, np))
      const kind = this.kindOf(i)
      const imp = t.imp[kind]
      const ty = f.type[i]
      const WALKu = this.walkOf[ty]
      const RUNu = this.runOf[ty]
      for (const m of u.men) {
        if (!m.alive || (still && m.settled)) continue
        this.place(i, m.s, true, p, imp)
        const here = cellK(t, m.x, m.z)
        const inTrees = this.treesByClass[t.cls[here]] === 1
        // personal drift: the ranks loosen among trees, break up when the battalion routs or shatters, and are
        // still loose while it rallies
        const amp = (fleeing(f.mstate[i]) ? 1.5 : f.mstate[i] === MS_RALLYING ? 0.6 : inTrees ? 0.3 : 0.1) * u.sway
        let tx = p[0]
        let tz = p[1]
        if (amp > 1e-4) {
          tx += amp * wave(tt + m.dx)
          tz += amp * wave(tt * 0.8 + m.dz)
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
        if (m.settled && (busy || Math.hypot(tx - m.hx, tz - m.hz) > 0.3)) m.settled = false
        if (m.settled) {
          m.vx = 0
          m.vz = 0
          continue
        }
        const dx = tx - m.x
        const dz = tz - m.z
        const dist = Math.sqrt(dx * dx + dz * dz)
        if (!busy && u.sway < 0.05 && dist < 0.25) {
          m.settled = true
          m.hx = tx
          m.hz = tz
          m.vx = 0
          m.vz = 0
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
        const mx = m.x
        const mz = m.z
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
        const walking = Math.min(1, Math.sqrt(m.vx * m.vx + m.vz * m.vz) / 0.5)
        tc = this.treeCell(m.x, m.z)
        if (walking > 0 && tc >= 0) {
          for (let k = TA[tc], e = TA[tc + 1]; k < e; k++) {
            const ex = m.x - TX[k]
            const ez = m.z - TZ[k]
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
        m.vx += (wx - m.vx) * kk
        m.vz += (wz - m.vz) * kk
        // arrived: come to rest
        if (dist < 0.08) {
          const damp = Math.max(0, 1 - dt * 8)
          m.vx *= damp
          m.vz *= damp
        }
        const sp2 = m.vx * m.vx + m.vz * m.vz
        const cap = RUNu * gs
        if (sp2 > cap * cap) {
          const r = cap / Math.sqrt(sp2)
          m.vx *= r
          m.vz *= r
        }
        const nx = m.x + m.vx * dt
        const nz = m.z + m.vz * dt
        // never onto impassable ground, nor off the map
        if (impAt(t, imp, nx, nz) && !imp[here]) {
          m.vx = 0
          m.vz = 0
        } else {
          m.x = nx
          m.z = nz
        }
        tc = this.treeCell(m.x, m.z)
        if (tc >= 0) {
          for (let k = TA[tc], e = TA[tc + 1]; k < e; k++) {
            // never inside a trunk
            const ex = m.x - TX[k]
            const ez = m.z - TZ[k]
            const d = Math.sqrt(ex * ex + ez * ez)
            const R = TR[k] + 0.3
            if (d < R && d > 1e-6) {
              m.x = TX[k] + (ex / d) * R
              m.z = TZ[k] + (ez / d) * R
            }
          }
        }
        // a trunk's push never takes him off the map
        m.x = Math.min(xMax, Math.max(t.x0, m.x))
        m.z = Math.min(zMax, Math.max(t.z0, m.z))
      }
    }
  }
  private poseNow: Float64Array
  private grow(): void {
    const n = this.cellNext.length * 2
    const a = new Int32Array(n)
    const x = new Float64Array(n)
    const z = new Float64Array(n)
    a.set(this.cellNext)
    x.set(this.flatX)
    z.set(this.flatZ)
    this.cellNext = a
    this.flatX = x
    this.flatZ = z
  }
  // how far men stand from their places (a measurement): max and mean, metres
  slotError(): { max: number; mean: number } {
    let max = 0
    let sum = 0
    let n = 0
    const p = [0, 0, 0]
    for (const u of this.units.values()) {
      this.frame(u.i, this.alphaNow)
      for (const m of u.men) {
        if (m.alive) {
          this.place(u.i, m.s, false, p)
          const d = Math.hypot(m.x - p[0], m.z - p[1])
          max = Math.max(max, d)
          sum += d
          n++
        }
      }
    }
    return { max, mean: n ? sum / n : 0 }
  }
}
