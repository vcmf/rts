// The soldier layer (cosmetic, every frame): one figure per man walking to his place in his battalion.
// Ported from the prototype's soldier layer (prototypes/formation-core.js). The sim keeps men per company
// and which slots are filled (decisions 0007, 0018); this layer decides who stands where and who falls:
// a man keeps his slot while it stays filled; when men fall, those whose slots emptied fall first; men
// whose slots moved walk to the nearest free filled slot; Face about relabels the men through the shape's
// half-turn. No DOM: tested in Node (test/soldiers.test.ts).
import type { World, Places } from '../sim/index.ts'
import { mkPlaces, placesCtx, placeAt, occupied, menOf, slotIndex, groundG, cellK, DT, M_TICK, MS_RALLYING, fleeing } from '../sim/index.ts'
import type { Scene } from './scene.ts'
import { eachObstacle, cosmeticRng } from './scene.ts'
import { CLASS_STYLE } from './style.ts'

export const AHEAD = 0.6, WALK = 1.35, RUN = 3.2, SEP = 0.52
const SC = 0.6   // neighbour grid cell (≥ SEP: the 3×3 search sees every neighbour)

export interface Man { s: number; x: number; z: number; vx: number; vz: number; alive: boolean; dx: number; dz: number; settled: boolean; hx: number; hz: number }
export interface Unit { i: number; gen: number; side: number; men: Man[]; faces: number; sway: number; sig: Int32Array }

export class SoldierLayer {
  w: World; scene: Scene
  units = new Map<number, Unit>()
  fallen: Man[] = []                       // men of battalions that are gone
  private ctxA: Places; private ctx0: Places; private rnd = cosmeticRng(7); private treesByClass: Uint8Array
  alphaNow = 1
  private cellHead: Int32Array; private cellNext = new Int32Array(1024); private flat: Man[] = []; private touched: number[] = []; private SN: number
  constructor(w: World, scene: Scene) {
    this.w = w; this.scene = scene; this.ctxA = mkPlaces(w); this.ctx0 = mkPlaces(w)
    this.treesByClass = Uint8Array.from(Object.keys(w.cr.rs.terrain), name => ((CLASS_STYLE[name]?.trees ?? 0) > 0 ? 1 : 0))
    const span = (w.terrain.n - 1) * w.terrain.cell; this.SN = Math.ceil(span / SC) + 1; this.cellHead = new Int32Array(this.SN * this.SN).fill(-1)
  }

  // the anchor this frame: interpolated between ticks (alpha), extrapolated `ahead` seconds
  anchor(i: number, alpha: number, ahead: number): [number, number, number] {
    const f = this.w.f
    let dh = f.heading[i] - f.ph[i]; dh = Math.atan2(Math.sin(dh), Math.cos(dh))
    return [f.px[i] + (f.x[i] - f.px[i]) * alpha + f.vx[i] * ahead, f.pz[i] + (f.z[i] - f.pz[i]) * alpha + f.vz[i] * ahead, f.ph[i] + dh * alpha + f.omega[i] * ahead]
  }
  // places for formation i at this frame: ahead (where the men aim) and now; `place` reads the last framed
  frame(i: number, alpha: number): void {
    const t = (this.w.meta[M_TICK] - 1 + alpha) * DT
    const [hx, hz, h] = this.anchor(i, alpha, AHEAD), [x0, z0, h0] = this.anchor(i, alpha, 0)
    placesCtx(this.ctxA, i, hx, hz, h, t + AHEAD, AHEAD - (1 - alpha) * DT)
    placesCtx(this.ctx0, i, x0, z0, h0, t, -(1 - alpha) * DT)
  }
  private kindOf(i: number): number { const f = this.w.f; return this.w.cr.shapes[f.trans[i] ? f.tShape[i] : f.shape[i]].kind }
  private slotRC(s: number): [number, number, number] { const g = this.w.cr.geo, RF = g.ranks * g.files; return [Math.floor(s / RF), Math.floor((s % RF) / g.files), s % g.files] }
  // a man's place (`ahead`: where he aims; a place on impassable ground falls back to the place now)
  place(i: number, s: number, ahead: boolean, out: number[]): number[] {
    const [c, r, f] = this.slotRC(s)
    if (!ahead) return placeAt(this.ctx0, c, r, f, out)
    placeAt(this.ctxA, c, r, f, out)
    if (this.w.terrain.imp[this.kindOf(i)][cellK(this.w.terrain, out[0], out[1])]) placeAt(this.ctx0, c, r, f, out)
    return out
  }

  // what decides which slots are filled: men per company, shape, the shape it changes to, the lean, faces
  private sign(sig: Int32Array, i: number): void {
    const f = this.w.f, C = this.w.cr.geo.companies
    for (let c = 0; c < C; c++) sig[c] = f.men[i * C + c]
    sig[C] = f.shape[i]; sig[C + 1] = f.trans[i]; sig[C + 2] = f.tShape[i]; sig[C + 3] = f.lean[i]; sig[C + 4] = f.faces[i]
  }
  private same(sig: Int32Array, i: number): boolean {
    const f = this.w.f, C = this.w.cr.geo.companies
    for (let c = 0; c < C; c++) if (sig[c] !== f.men[i * C + c]) return false
    return sig[C] === f.shape[i] && sig[C + 1] === f.trans[i] && sig[C + 2] === f.tShape[i] && sig[C + 3] === f.lean[i] && sig[C + 4] === f.faces[i]
  }
  // matches the men to the sim: new battalions, battalions gone, Face about, losses, slots that moved.
  // Call it after every tick (and `step` calls it each frame): a Face about is relabelled through the
  // shape it turned in, which a later change of shape within the same frame would otherwise replace.
  sync(alpha: number): void {
    const w = this.w, f = w.f, g = w.cr.geo, N = f.alive.length, p = [0, 0, 0]
    for (const [i, u] of this.units) if (!f.alive[i] || f.gen[i] !== u.gen) { for (const m of u.men) { if (m.alive) m.alive = false; this.fallen.push(m) } this.units.delete(i) }
    for (let i = 0; i < N; i++) {
      if (!f.alive[i]) continue
      let u = this.units.get(i)
      // which slots are filled changes only with the men, the shape (or the one it changes to), the lean
      // and Face about: nothing to match otherwise
      if (u && this.same(u.sig, i)) continue
      this.frame(i, alpha)
      if (!u) { u = { i, gen: f.gen[i], side: f.side[i], men: [], faces: f.faces[i], sway: 0, sig: new Int32Array(g.companies + 5) }; this.units.set(i, u) }
      this.sign(u.sig, i)
      if (u.faces !== f.faces[i]) {   // Face about: each man's slot is now the half-turn of his old one
        const T = w.cr.shapes[f.shape[i]].turn
        for (let k = u.faces; k < f.faces[i]; k++) if (T) for (const m of u.men) if (m.alive) m.s = T.m[m.s]
        u.faces = f.faces[i]
      }
      const slots = w.cr.slots, occ = new Uint8Array(slots), claimed = new Uint8Array(slots)
      for (let c = 0; c < g.companies; c++) for (let r = 0; r < g.ranks; r++) for (let q = 0; q < g.files; q++) if (occupied(w, i, c, r, q)) occ[slotIndex(g, c, r, q)] = 1
      const displaced: Man[] = []
      let alive = 0
      for (const m of u.men) if (m.alive) { alive++; if (occ[m.s] && !claimed[m.s]) claimed[m.s] = 1; else displaced.push(m) }
      const men = menOf(w, i)
      // losses: the displaced fall first, then men drawn at random
      while (alive > men) {
        const fromDisplaced = displaced.length > 0   // a displaced man holds no claim; one drawn at random frees his slot
        const m = fromDisplaced ? displaced.pop()! : (() => { const live = u!.men.filter(x => x.alive); return live[Math.floor(this.rnd() * live.length)] })()
        m.alive = false; m.vx = 0; m.vz = 0; alive--; if (!fromDisplaced) claimed[m.s] = 0
      }
      // the displaced walk to the nearest free filled slot
      for (const m of displaced) {
        if (!m.alive) continue
        let best = -1, bd = Infinity
        for (let s = 0; s < slots; s++) if (occ[s] && !claimed[s]) { this.place(i, s, false, p); const d = (p[0] - m.x) * (p[0] - m.x) + (p[1] - m.z) * (p[1] - m.z); if (d < bd) { bd = d; best = s } }
        if (best >= 0) { m.s = best; claimed[best] = 1; m.settled = false }
      }
      // new men (a battalion appearing): at their places
      for (let s = 0; s < slots && alive < men; s++) if (occ[s] && !claimed[s]) {
        this.place(i, s, false, p)
        u.men.push({ s, x: p[0], z: p[1], vx: 0, vz: 0, alive: true, dx: this.rnd() * 6.28, dz: this.rnd() * 6.28, settled: false, hx: 0, hz: 0 })
        claimed[s] = 1; alive++
      }
    }
  }

  // one frame: sync, then every man steers to his place
  step(dt: number, alpha: number): void {
    this.alphaNow = alpha
    this.sync(alpha)
    const w = this.w, f = w.f, t = w.terrain, x0 = t.x0, z0 = t.z0, SN = this.SN, p = [0, 0, 0]
    // neighbour grid: cells and linked lists in typed arrays, rebuilt every frame
    for (const c of this.touched) this.cellHead[c] = -1
    this.flat.length = 0; this.touched.length = 0
    for (const u of this.units.values()) for (const m of u.men) if (m.alive) {
      const ci = Math.floor((m.x - x0) / SC), cj = Math.floor((m.z - z0) / SC), cell = ci >= 0 && cj >= 0 && ci < SN && cj < SN ? ci * SN + cj : -1
      const k = this.flat.length; this.flat.push(m)
      if (k >= this.cellNext.length) { const n = new Int32Array(this.cellNext.length * 2); n.set(this.cellNext); this.cellNext = n }
      if (cell >= 0) { if (this.cellHead[cell] < 0) this.touched.push(cell); this.cellNext[k] = this.cellHead[cell]; this.cellHead[cell] = k } else this.cellNext[k] = -1
    }
    const tt = w.meta[M_TICK] * DT * 0.35
    for (const u of this.units.values()) {
      const i = u.i; this.frame(i, alpha)
      const busy = !!(f.trans[i] || f.ordHead[i] >= 0)
      u.sway += ((busy ? 1 : 0) - u.sway) * Math.min(1, dt * 0.8)   // sway eases out at the halt, so the ranks come to rest
      const kind = this.kindOf(i), imp = t.imp[kind]
      for (const m of u.men) {
        if (!m.alive) continue
        this.place(i, m.s, true, p)
        const inTrees = this.treesByClass[t.cls[cellK(t, m.x, m.z)]] === 1
        // personal drift: the ranks loosen among trees, break up when the battalion routs or shatters, and are
        // still loose while it rallies
        const amp = (fleeing(f.mstate[i]) ? 1.5 : f.mstate[i] === MS_RALLYING ? 0.6 : inTrees ? 0.3 : 0.1) * u.sway
        let tx = p[0] + amp * Math.sin(tt + m.dx), tz = p[1] + amp * Math.sin(tt * 0.8 + m.dz)
        // a place inside a trunk moves to its edge: a stable place to stand, not a tug of war
        eachObstacle(this.scene, tx, tz, o => { const ex = tx - o.x, ez = tz - o.z, d = Math.sqrt(ex * ex + ez * ez), R = o.r + 0.4
          if (d < R) { if (d > 1e-6) { tx = o.x + ex / d * R; tz = o.z + ez / d * R } else tx = o.x + R } })
        // settled: a man at his place while his battalion is halted holds still until his place moves
        if (m.settled && (busy || Math.hypot(tx - m.hx, tz - m.hz) > 0.3)) m.settled = false
        if (m.settled) { m.vx = 0; m.vz = 0; continue }
        const dx = tx - m.x, dz = tz - m.z, dist = Math.sqrt(dx * dx + dz * dz)
        if (!busy && u.sway < 0.05 && dist < 0.25) { m.settled = true; m.hx = tx; m.hz = tz; m.vx = 0; m.vz = 0; continue }
        const gs = Math.max(0.15, dist > 1e-6 ? groundG(t, m.x, m.z, kind, dx / dist, dz / dist) : groundG(t, m.x, m.z, kind, 0, 0))   // never frozen mid-step
        const top = (dist > 2.5 ? RUN : WALK) * gs, want = dist < 0.08 ? 0 : Math.min(top, dist / 0.7)
        let wx = dist > 1e-6 ? dx / dist * want : 0, wz = dist > 1e-6 ? dz / dist * want : 0
        const ci = Math.floor((m.x - x0) / SC), cj = Math.floor((m.z - z0) / SC)
        for (let a = ci - 1; a <= ci + 1; a++) for (let b = cj - 1; b <= cj + 1; b++) {
          if (a < 0 || b < 0 || a >= SN || b >= SN) continue
          for (let k = this.cellHead[a * SN + b]; k >= 0; k = this.cellNext[k]) { const o = this.flat[k]; if (o === m) continue
            const ex = m.x - o.x, ez = m.z - o.z, d2 = ex * ex + ez * ez
            if (d2 < SEP * SEP && d2 > 1e-8) { const d = Math.sqrt(d2), push = (SEP - d) / SEP * 1.8; wx += ex / d * push; wz += ez / d * push } }
        }
        const walking = Math.min(1, Math.sqrt(m.vx * m.vx + m.vz * m.vz) / 0.5)   // while walking, steer round the trunks just ahead
        if (walking > 0) eachObstacle(this.scene, m.x, m.z, o => { const ex = m.x - o.x, ez = m.z - o.z, d = Math.sqrt(ex * ex + ez * ez), R = o.r + 0.35
          if (d < R + 0.8 && d > 1e-6) { const push = (R + 0.8 - d) / 0.8 * 1.4 * walking; wx += ex / d * push; wz += ez / d * push } })
        const kk = Math.min(1, dt * 5); m.vx += (wx - m.vx) * kk; m.vz += (wz - m.vz) * kk
        if (dist < 0.08) { const damp = Math.max(0, 1 - dt * 8); m.vx *= damp; m.vz *= damp }   // arrived: come to rest
        const sp2 = m.vx * m.vx + m.vz * m.vz, cap = RUN * gs; if (sp2 > cap * cap) { const r = cap / Math.sqrt(sp2); m.vx *= r; m.vz *= r }
        const nx = m.x + m.vx * dt, nz = m.z + m.vz * dt
        if (imp[cellK(t, nx, nz)] && !imp[cellK(t, m.x, m.z)]) { m.vx = 0; m.vz = 0 } else { m.x = nx; m.z = nz }   // never onto impassable ground
        eachObstacle(this.scene, m.x, m.z, o => { const ex = m.x - o.x, ez = m.z - o.z, d = Math.sqrt(ex * ex + ez * ez), R = o.r + 0.3   // never inside a trunk
          if (d < R && d > 1e-6) { m.x = o.x + ex / d * R; m.z = o.z + ez / d * R } })
      }
    }
  }
  // how far men stand from their places (a measurement): max and mean, metres
  slotError(): { max: number; mean: number } {
    let max = 0, sum = 0, n = 0; const p = [0, 0, 0]
    for (const u of this.units.values()) { this.frame(u.i, this.alphaNow)
      for (const m of u.men) if (m.alive) { this.place(u.i, m.s, false, p); const d = Math.hypot(m.x - p[0], m.z - p[1]); max = Math.max(max, d); sum += d; n++ } }
    return { max, mean: n ? sum / n : 0 }
  }
}
