// Artillery (docs/systems/artillery.md; docs/plans/active/s1d3-artillery.md; docs/proposals/sim-design.md §8):
// step 9. Each piece of a battery (a company with men) chooses a target as musketry does, with its own arc and
// range, and when loaded fires either a cone (inside cone.range) or a ray: one ball walked in 2 m steps over
// the heightfield on a flat trajectory aimed to first graze at the aim point. It grazes and bounces, buries
// in ground rising too steeply, and wherever it is low over the ground it cuts through every company block on
// its line, friend or enemy: the men in its lane fall by the chord it cuts through the block and the block's
// density, and each man struck slows it. So a column end-on suffers through all its ranks, and a ball over a
// crest flies on over the hollow behind it.
//
// What a piece reads of others was fixed before the step (positions after movement, men); losses are owed as
// whole men (step 11 removes them), and every draw is keyed by tick, battery, piece and purpose.
import { type World, M_TICK, M_SEED, MAX_FORMATIONS, O_DRESS, FIRE_AT_WILL, SHOT_RAY, SHOT_CONE, outOfFight, formationSlot as slotOf, formationHandle as handleOf, typeOf } from './world.ts'
import { blockGeometry, useReach, chooseTarget, chosen, aimAt, sees, clearShare, oweByMen, distToSegment, RETARGET_TICKS, type FireGeo } from './fire.ts'
import { layoutOf } from './formation.ts'
import { heightAt } from './terrain.ts'
import { MAX_COMPANIES } from './ruleset.ts'
import { keyedStream, nextUnit } from './rng.ts'
import { sin, cos } from './num.ts'
import { DT } from './time.ts'

const sqrt = Math.sqrt
const K_RELOAD = 21, K_RAY = 22, K_CONE = 23   // keyed draws: purpose tags
const STEP = 2          // metres a ball moves per step
const AHEAD = 2         // the piece stands this far ahead of its detachment's front rank
const ks = new Uint32Array(4)

// a battery may fire: of a type with artillery, in a shape it fires from, halted (no order at its head but a
// dress), not changing shape, in the fight and not in melee, at will
export function mayShoot(w: World, i: number): boolean {
  const f = w.f, A = typeOf(w, i).artillery, n = f.ordHead[i]
  return !!A && !!A.from[f.shape[i]] && f.fireMode[i] === FIRE_AT_WILL && !outOfFight(f.mstate[i]) && !f.foe[i] && !f.trans[i] && (n < 0 || w.ord.type[n] === O_DRESS)
}

// step 9
export function artilleryStep(w: World): void {
  const f = w.f, CS = w.cr.maxC, N = MAX_FORMATIONS, tick = w.meta[M_TICK] + 1, seed = w.meta[M_SEED]
  let any = false
  for (let i = 0; i < N; i++) {
    if (!f.alive[i] || !typeOf(w, i).artillery) continue
    if (mayShoot(w, i)) any = true; else for (let c = 0, C = typeOf(w, i).C; c < C; c++) f.target[i * CS + c] = 0
  }
  if (!any) return
  // the fire step's geometry when it built one this tick (positions do not change between steps 8 and 10)
  const G = w.scratch.fireGeoTick === tick ? w.scratch.fireGeo! : blockGeometry(w); w.scratch.fireGeoTick = tick
  const rev = w.scratch.reverse === true
  for (let n = 0; n < N; n++) {
    const i = rev ? N - 1 - n : n
    if (!f.alive[i] || !mayShoot(w, i)) continue
    const U = typeOf(w, i), A = U.def.artillery!, h = handleOf(w, i)
    useReach(A.ray.range, U.artillery!.cosArc)
    for (let c = 0; c < U.C; c++) {
      const k = i * CS + c
      if (f.men[k] <= 0) continue
      let m = -2
      if ((tick + i) % RETARGET_TICKS === 0) { f.target[k] = chooseTarget(w, G, i, c); m = chosen() }
      const j = slotOf(w, f.target[k]); if (j < 0) { f.target[k] = 0; continue }
      if (f.reload[k] > 0) continue
      if (m === -2) m = aimAt(w, G, k, j)
      // no target in sight, or a friend across the line of fire: try again in 0.5 s
      if (m < 0 || clearShare(w, G, i, c, G.cx[m], G.cz[m]) < 1) { f.reload[k] = RETARGET_TICKS * DT; continue }
      const mx = G.ox[k] + G.fx[k] * AHEAD, mz = G.oz[k] + G.fz[k] * AHEAD   // the muzzle
      const d = sqrt((G.cx[m] - mx) * (G.cx[m] - mx) + (G.cz[m] - mz) * (G.cz[m] - mz))
      if (d <= A.cone.range) cone(w, G, i, k, j, mx, mz, G.cx[m], G.cz[m], d, keyedStream(ks, seed, tick, h, c, K_CONE))
      else ray(w, G, i, k, mx, mz, G.cx[m], G.cz[m], keyedStream(ks, seed, tick, h, c, K_RAY))
      const crew = Math.min(3, A.crew / f.men[k])   // fewer men reload slower
      f.reload[k] = A.reload * (1 + A.reloadJitter * (2 * nextUnit(keyedStream(ks, seed, tick, h, c, K_RELOAD)) - 1)) * Math.max(1, crew)
      f.volleyTick[k] = tick
    }
  }
}

// men struck per cone shot at range d (linear in the table, 0 past its last point)
function coneHits(T: [number, number][], d: number): number {
  if (d >= T[T.length - 1][0]) return 0
  for (let k = 1; k < T.length; k++) if (d < T[k][0]) { const u = (d - T[k - 1][0]) / (T[k][0] - T[k - 1][0]); return T[k - 1][1] + (T[k][1] - T[k - 1][1]) * u }
  return 0
}
// the cone from piece k (muzzle mx, mz) toward (ax, az), d away: hits(d) × the target's depth factor, spread over
// the enemy companies whose centres lie inside it and in range, that the piece sees, weighted by their men
const coneJ = new Int32Array(MAX_FORMATIONS), perJ = new Int32Array(MAX_FORMATIONS), coneMask = new Uint8Array(MAX_FORMATIONS * MAX_COMPANIES), coneMen = new Int32Array(MAX_FORMATIONS)
function cone(w: World, G: FireGeo, i: number, k: number, j: number, mx: number, mz: number, ax: number, az: number, d: number, rs: Uint32Array): void {
  const f = w.f, CS = w.cr.maxC, A = typeOf(w, i).def.artillery!.cone, ux = (ax - mx) / d, uz = (az - mz) / d, cosH = cos(A.half)
  const lambda = coneHits(A.hits, d) * w.cr.depthByKind[layoutOf(w, j).kind]
  let n = Math.floor(lambda); if (nextUnit(rs) < lambda - n) n++
  f.shotKind[k] = SHOT_CONE; f.shotX[k] = ax; f.shotZ[k] = az
  if (!n) return
  // the companies in the cone, by formation (slot order), and their men
  let nj = 0, tot = 0
  for (let e = 0; e < MAX_FORMATIONS; e++) {
    if (!f.alive[e] || f.side[e] === f.side[i]) continue
    let men = 0
    for (let q = 0, C = typeOf(w, e).C; q < C; q++) {
      const m = e * CS + q, dx = G.cx[m] - mx, dz = G.cz[m] - mz, r = sqrt(dx * dx + dz * dz)
      const inside = f.men[m] > 0 && r <= A.range && dx * ux + dz * uz >= r * cosH && sees(w, G, k, m)
      coneMask[e * MAX_COMPANIES + q] = inside ? 1 : 0; if (inside) men += f.men[m]
    }
    if (men) { coneJ[nj++] = e; coneMen[e] = men; tot += men }
  }
  if (!tot) return
  // each man struck: first a formation weighted by its men in the cone, then a company in it (oweByMen)
  const per = perJ.fill(0, 0, nj)
  for (let s = 0; s < n; s++) { let r = Math.floor(nextUnit(rs) * tot), p = 0; for (; p < nj - 1; p++) { if (r < coneMen[coneJ[p]]) break; r -= coneMen[coneJ[p]] } per[p]++ }
  for (let p = 0; p < nj; p++) if (per[p]) oweByMen(w, coneJ[p], coneMask.subarray(coneJ[p] * MAX_COMPANIES, coneJ[p] * MAX_COMPANIES + MAX_COMPANIES), per[p], rs)
}

// the length of the segment (x0, z0)–(x1, z1) inside company block m of battalion e: the block's rectangle grown
// by half the ball's lane, so a ball skimming its edge strikes the edge file
function chord(G: FireGeo, e: number, m: number, x0: number, z0: number, x1: number, z1: number, lane: number): number {
  const hx = G.bx[e] + lane / 2, zlo = G.bz0[e] - lane / 2, zhi = G.bz1[e] + lane / 2, ca = G.ca[m], sa = G.sa[m]
  const ax = x0 - G.ox[m], az = z0 - G.oz[m], bx = x1 - G.ox[m], bz = z1 - G.oz[m]
  const lx0 = ax * ca + az * sa, lz0 = -ax * sa + az * ca, lx1 = bx * ca + bz * sa, lz1 = -bx * sa + bz * ca
  let t0 = 0, t1 = 1
  const slab = (p: number, q: number, lo: number, hi: number): boolean => {
    const dd = q - p
    if (dd === 0) return p >= lo && p <= hi
    let ta = (lo - p) / dd, tb = (hi - p) / dd; if (ta > tb) { const s = ta; ta = tb; tb = s }
    if (ta > t0) t0 = ta; if (tb < t1) t1 = tb; return t0 <= t1
  }
  if (!slab(lx0, lx1, -hx, hx) || !slab(lz0, lz1, zlo, zhi)) return 0
  return (t1 - t0) * sqrt((x1 - x0) * (x1 - x0) + (z1 - z0) * (z1 - z0))
}

// one ball from piece k of battery i: aimed at (ax, az) with keyed dispersion, walked over the ground until its
// energy is spent, it buries, or it leaves the map. Where it is low over the ground it strikes every block it
// crosses (the battery's own excepted). Returns nothing; records where it stopped
const cand = new Int32Array(MAX_FORMATIONS)
function ray(w: World, G: FireGeo, i: number, k: number, mx: number, mz: number, ax: number, az: number, rs: Uint32Array): void {
  const f = w.f, CS = w.cr.maxC, R = typeOf(w, i).def.artillery!.ray, drop = typeOf(w, i).artillery!.drop, data = w.data, T = w.terrain
  // the aim, dispersed across and in range
  const a = R.spread * (2 * nextUnit(rs) - 1), D0 = sqrt((ax - mx) * (ax - mx) + (az - mz) * (az - mz)), D = D0 * (1 + R.short * (2 * nextUnit(rs) - 1))
  const ca = cos(a), sa = sin(a), ex = (ax - mx) / D0, ez = (az - mz) / D0, ux = ex * ca - ez * sa, uz = ex * sa + ez * ca
  // the flat trajectory: y(s) = y0 + v·s − drop·s²/2, through the ground at the aim point (first graze)
  let y = heightAt(data, mx, mz) + R.muzzle
  const yT = heightAt(data, mx + ux * D, mz + uz * D)
  let v = (yT - y) / D + drop * D / 2, energy = R.energy
  // the formations whose blocks can lie on its line (the battery's own excepted)
  const reachMax = R.energy, ex1 = mx + ux * reachMax, ez1 = mz + uz * reachMax
  let nc = 0
  for (let e = 0; e < MAX_FORMATIONS; e++) if (f.alive[e] && e !== i && distToSegment(f.x[e], f.z[e], mx, mz, ex1, ez1) <= G.reach[e]) cand[nc++] = e
  const xmin = T.x0, zmin = T.z0, xmax = T.x0 + (T.n - 1) * T.cell, zmax = T.z0 + (T.n - 1) * T.cell
  let x = mx, z = mz, g = heightAt(data, x, z)
  while (energy > 0) {
    const x1 = x + ux * STEP, z1 = z + uz * STEP
    if (x1 < xmin || x1 > xmax || z1 < zmin || z1 > zmax) break
    const g1 = heightAt(data, x1, z1), v1 = v - drop * STEP
    let y1 = y + (v + v1) / 2 * STEP
    v = v1; energy -= STEP
    if (y1 < g1) {   // a graze: it buries in ground rising too steeply, else bounces off it
      const rise = (g1 - g) / STEP
      if (rise > R.bury) { x = x1; z = z1; break }
      v = rise + R.restitution * (rise - v); y1 = g1; energy -= R.graze
    }
    if (y1 - g1 <= R.height && nc) {   // low enough to strike men: every block it cuts on this step
      for (let p = 0; p < nc && energy > 0; p++) {
        const e = cand[p], C = typeOf(w, e).C, area = 2 * G.bx[e] * (G.bz1[e] - G.bz0[e])
        for (let q = 0; q < C && energy > 0; q++) {
          const m = e * CS + q; if (f.men[m] <= 0) continue
          const L = chord(G, e, m, x, z, x1, z1, R.width); if (L <= 0) continue
          const lambda = L * R.width * (f.men[m] / area) * R.kill * Math.min(1, 2 * energy / R.energy)
          let hits = Math.floor(lambda); if (nextUnit(rs) < lambda - hits) hits++
          if (hits) { f.owed[m] += hits; energy -= hits * R.perMan }
        }
      }
    }
    x = x1; z = z1; y = y1; g = g1
  }
  f.shotKind[k] = SHOT_RAY; f.shotX[k] = x; f.shotZ[k] = z
}

// piece c of battery i fires one cone at (ax, az) now, as the step would (tests, debugging)
export function shootCone(w: World, i: number, c: number, j: number, ax: number, az: number): void {
  const G = blockGeometry(w), k = i * w.cr.maxC + c, mx = G.ox[k] + G.fx[k] * AHEAD, mz = G.oz[k] + G.fz[k] * AHEAD
  cone(w, G, i, k, j, mx, mz, ax, az, sqrt((ax - mx) * (ax - mx) + (az - mz) * (az - mz)), keyedStream(ks, w.meta[M_SEED], w.meta[M_TICK], handleOf(w, i), c, K_CONE))
}
// piece c of battery i fires one ball at (ax, az) now, as the step would (tests, debugging: it rebuilds the block
// geometry); the men it strikes are owed (step 11 removes them). Returns where it stopped
export function shootRay(w: World, i: number, c: number, ax: number, az: number): [number, number] {
  const G = blockGeometry(w), k = i * w.cr.maxC + c, mx = G.ox[k] + G.fx[k] * AHEAD, mz = G.oz[k] + G.fz[k] * AHEAD
  ray(w, G, i, k, mx, mz, ax, az, keyedStream(ks, w.meta[M_SEED], w.meta[M_TICK], handleOf(w, i), c, K_RAY))
  return [w.f.shotX[k], w.f.shotZ[k]]
}
