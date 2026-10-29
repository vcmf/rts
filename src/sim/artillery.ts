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
import {
  type World,
  M_TICK,
  M_SEED,
  MAX_FORMATIONS,
  O_DRESS,
  FIRE_AT_WILL,
  SHOT_RAY,
  SHOT_CONE,
  outOfFight,
  formationSlot as slotOf,
  formationHandle as handleOf,
  typeOf,
} from './world.ts'
import {
  blockGeometry,
  exposure,
  reachOf,
  chooseTarget,
  chosen,
  aimAt,
  sees,
  clearShare,
  oweByMen,
  distToSegment,
  RETARGET_TICKS,
  type FireGeo,
} from './fire.ts'
import { heightAt } from './terrain.ts'
import { MAX_COMPANIES } from './ruleset.ts'
import { keyedStream, nextUnit } from './rng.ts'
import { sin, cos } from './num.ts'
import { DT } from './time.ts'

const sqrt = Math.sqrt
// keyed draws: purpose tags
const K_RELOAD = 21
const K_RAY = 22
const K_CONE = 23
const ks = new Uint32Array(4)

// a battery may fire: of a type with artillery, in a shape it fires from, halted (no order at its head but a
// dress), not changing shape, in the fight and not in melee, at will
export function mayShoot(w: World, i: number): boolean {
  const f = w.f
  const A = typeOf(w, i).artillery
  const n = f.ordHead[i]
  return (
    !!A &&
    !!A.from[f.shape[i]] &&
    f.fireMode[i] === FIRE_AT_WILL &&
    !outOfFight(f.mstate[i]) &&
    !f.foe[i] &&
    !f.trans[i] &&
    (n < 0 || w.ord.type[n] === O_DRESS)
  )
}

// step 9
export function artilleryStep(w: World): void {
  const f = w.f
  const CS = w.cr.maxC
  const N = MAX_FORMATIONS
  const tick = w.meta[M_TICK] + 1
  const seed = w.meta[M_SEED]
  let any = false
  for (let i = 0; i < N; i++) {
    if (!f.alive[i] || !typeOf(w, i).artillery) continue
    if (mayShoot(w, i)) any = true
    else for (let c = 0, C = typeOf(w, i).C; c < C; c++) f.target[i * CS + c] = 0
  }
  if (!any) return
  // the fire step's geometry when it built one this tick (positions do not change between steps 8 and 10)
  const G = w.scratch.fireGeoTick === tick ? w.scratch.fireGeo! : blockGeometry(w)
  w.scratch.fireGeoTick = tick
  const rev = w.scratch.reverse === true
  for (let n = 0; n < N; n++) {
    const i = rev ? N - 1 - n : n
    if (!f.alive[i] || !mayShoot(w, i)) continue
    const U = typeOf(w, i)
    const A = U.def.artillery!
    const h = handleOf(w, i)
    const RE = reachOf(w, i)
    for (let c = 0; c < U.C; c++) {
      const k = i * CS + c
      if (f.men[k] <= 0) continue
      let m = -2
      if ((tick + i) % RETARGET_TICKS === 0) {
        f.target[k] = chooseTarget(w, G, i, c, RE)
        m = chosen()
      }
      const j = slotOf(w, f.target[k])
      if (j < 0) {
        f.target[k] = 0
        continue
      }
      if (f.reload[k] > 0) continue
      if (m === -2) m = aimAt(w, G, k, j, RE)
      // no target in sight, or a friend across the line of fire: try again in 0.5 s
      if (m < 0 || clearShare(w, G, i, c, G.cx[m], G.cz[m]) < 1) {
        f.reload[k] = RETARGET_TICKS * DT
        continue
      }
      // the muzzle
      const mx = G.ox[k] + G.fx[k] * A.ahead
      const mz = G.oz[k] + G.fz[k] * A.ahead
      const d = sqrt((G.cx[m] - mx) * (G.cx[m] - mx) + (G.cz[m] - mz) * (G.cz[m] - mz))
      if (d <= A.cone.range) cone(w, G, i, k, j, mx, mz, G.cx[m], G.cz[m], d, keyedStream(ks, seed, tick, h, c, K_CONE))
      else ray(w, G, i, k, mx, mz, G.cx[m], G.cz[m], keyedStream(ks, seed, tick, h, c, K_RAY))
      const crew = Math.min(A.crewSlow, A.crew / f.men[k]) // fewer men reload slower
      f.reload[k] =
        A.reload *
        (1 + A.reloadJitter * (2 * nextUnit(keyedStream(ks, seed, tick, h, c, K_RELOAD)) - 1)) *
        Math.max(1, crew)
      f.volleyTick[k] = tick
    }
  }
}

// men struck per cone shot at range d (linear in the table, 0 past its last point)
function coneHits(T: [number, number][], d: number): number {
  if (d >= T[T.length - 1][0]) return 0
  for (let k = 1; k < T.length; k++) {
    if (d < T[k][0]) {
      const u = (d - T[k - 1][0]) / (T[k][0] - T[k - 1][0])
      return T[k - 1][1] + (T[k][1] - T[k - 1][1]) * u
    }
  }
  return 0
}
// the cone from piece k (muzzle mx, mz) toward (ax, az), d away: hits(d) × the aimed target's exposure, spread over
// the enemy companies whose centres lie inside it and in range, that the piece sees, weighted by their men
const coneJ = new Int32Array(MAX_FORMATIONS)
const perJ = new Int32Array(MAX_FORMATIONS)
const coneMask = new Uint8Array(MAX_FORMATIONS * MAX_COMPANIES)
const coneMen = new Int32Array(MAX_FORMATIONS)
function cone(
  w: World,
  G: FireGeo,
  i: number,
  k: number,
  j: number,
  mx: number,
  mz: number,
  ax: number,
  az: number,
  d: number,
  rs: Uint32Array,
): void {
  const f = w.f
  const CS = w.cr.maxC
  const A = typeOf(w, i).def.artillery!.cone
  const ux = (ax - mx) / d
  const uz = (az - mz) / d
  const cosH = cos(A.half)
  const lambda = coneHits(A.hits, d) * exposure(w, G, k, j)
  let n = Math.floor(lambda)
  if (nextUnit(rs) < lambda - n) n++
  f.shotKind[k] = SHOT_CONE
  f.shotX[k] = ax
  f.shotZ[k] = az
  if (!n) return
  // the companies in the cone, by formation (slot order), and their men
  let nj = 0
  let tot = 0
  for (let e = 0; e < MAX_FORMATIONS; e++) {
    if (!f.alive[e] || f.side[e] === f.side[i]) continue
    let men = 0
    for (let q = 0, C = typeOf(w, e).C; q < C; q++) {
      const m = e * CS + q
      const dx = G.cx[m] - mx
      const dz = G.cz[m] - mz
      const r = sqrt(dx * dx + dz * dz)
      const inside = f.men[m] > 0 && r <= A.range && dx * ux + dz * uz >= r * cosH && sees(w, G, k, m)
      coneMask[e * MAX_COMPANIES + q] = inside ? 1 : 0
      if (inside) men += f.men[m]
    }
    if (men) {
      coneJ[nj++] = e
      coneMen[e] = men
      tot += men
    }
  }
  if (!tot) return
  // each man struck: first a formation weighted by its men in the cone, then a company in it (oweByMen)
  const per = perJ.fill(0, 0, nj)
  for (let s = 0; s < n; s++) {
    let r = Math.floor(nextUnit(rs) * tot)
    let p = 0
    for (; p < nj - 1; p++) {
      if (r < coneMen[coneJ[p]]) break
      r -= coneMen[coneJ[p]]
    }
    per[p]++
  }
  for (let p = 0; p < nj; p++) {
    if (per[p]) {
      oweByMen(
        w,
        coneJ[p],
        coneMask.subarray(coneJ[p] * MAX_COMPANIES, coneJ[p] * MAX_COMPANIES + MAX_COMPANIES),
        per[p],
        rs,
      )
    }
  }
}

// where the line from (x0, z0) along (ux, uz), out to L metres, enters and leaves company block m of battalion e
// (its rectangle grown by half the ball's lane, so a ball skimming its edge strikes the edge file): the distances
// along the line, in `span`; false when it misses
const span = [0, 0]
function crossing(
  G: FireGeo,
  e: number,
  m: number,
  x0: number,
  z0: number,
  ux: number,
  uz: number,
  L: number,
  lane: number,
): boolean {
  const hx = G.bx[e] + lane / 2
  const zlo = G.bz0[e] - lane / 2
  const zhi = G.bz1[e] + lane / 2
  const ca = G.ca[m]
  const sa = G.sa[m]
  const ax = x0 - G.ox[m]
  const az = z0 - G.oz[m]
  // the line in the block frame
  const lx = ax * ca + az * sa
  const lz = -ax * sa + az * ca
  const dx = ux * ca + uz * sa
  const dz = -ux * sa + uz * ca
  let t0 = 0
  let t1 = L
  for (let n = 0; n < 2; n++) {
    const p = n ? lz : lx
    const d = n ? dz : dx
    const lo = n ? zlo : -hx
    const hi = n ? zhi : hx
    if (d === 0) {
      if (p < lo || p > hi) return false
      continue
    }
    let ta = (lo - p) / d
    let tb = (hi - p) / d
    if (ta > tb) {
      const q = ta
      ta = tb
      tb = q
    }
    if (ta > t0) t0 = ta
    if (tb < t1) t1 = tb
    if (t0 > t1) return false
  }
  span[0] = t0
  span[1] = t1
  return true
}

// one ball from piece k of battery i: aimed at (ax, az) with keyed dispersion, walked over the ground until its
// energy is spent, it buries, or it leaves the map. Where it is low over the ground it strikes every block it
// crosses (the battery's own excepted). Its line on the ground is straight, so where it enters and leaves each
// block is found once; each step strikes the blocks whose span it overlaps. Records where it stopped
const bE = new Int32Array(MAX_FORMATIONS * MAX_COMPANIES)
const bM = new Int32Array(MAX_FORMATIONS * MAX_COMPANIES)
const bIn = new Float64Array(MAX_FORMATIONS * MAX_COMPANIES)
const bOut = new Float64Array(MAX_FORMATIONS * MAX_COMPANIES)
function ray(
  w: World,
  G: FireGeo,
  i: number,
  k: number,
  mx: number,
  mz: number,
  ax: number,
  az: number,
  rs: Uint32Array,
): void {
  const f = w.f
  const CS = w.cr.maxC
  const R = typeOf(w, i).def.artillery!.ray
  const drop = typeOf(w, i).artillery!.drop
  const data = w.data
  const T = w.terrain
  const STEP = R.step
  // the aim, dispersed across and in range
  const a = R.spread * (2 * nextUnit(rs) - 1)
  const D0 = sqrt((ax - mx) * (ax - mx) + (az - mz) * (az - mz))
  const D = D0 * (1 + R.short * (2 * nextUnit(rs) - 1))
  const ca = cos(a)
  const sa = sin(a)
  const ex = (ax - mx) / D0
  const ez = (az - mz) / D0
  const ux = ex * ca - ez * sa
  const uz = ex * sa + ez * ca
  // the flat trajectory: y(s) = y0 + v·s − drop·s²/2, through the ground at the aim point (first graze)
  let y = heightAt(data, mx, mz) + R.muzzle
  const yT = heightAt(data, mx + ux * D, mz + uz * D)
  let v = (yT - y) / D + (drop * D) / 2
  let energy = R.energy
  // the blocks on its line, out to the farthest it can go (the battery's own excepted), in slot and company order
  const L = R.energy
  const ex1 = mx + ux * L
  const ez1 = mz + uz * L
  let nb = 0
  for (let e = 0; e < MAX_FORMATIONS; e++) {
    if (!f.alive[e] || e === i || distToSegment(f.x[e], f.z[e], mx, mz, ex1, ez1) > G.reach[e] + R.width / 2) continue
    for (let q = 0, C = typeOf(w, e).C; q < C; q++) {
      const m = e * CS + q
      if (f.men[m] > 0 && crossing(G, e, m, mx, mz, ux, uz, L, R.width)) {
        bE[nb] = e
        bM[nb] = m
        bIn[nb] = span[0]
        bOut[nb] = span[1]
        nb++
      }
    }
  }
  const xmin = T.x0
  const zmin = T.z0
  const xmax = T.x0 + (T.n - 1) * T.cell
  const zmax = T.z0 + (T.n - 1) * T.cell
  let s = 0
  let g = heightAt(data, mx, mz)
  while (energy > 0) {
    const s1 = s + STEP
    const x1 = mx + ux * s1
    const z1 = mz + uz * s1
    if (x1 < xmin || x1 > xmax || z1 < zmin || z1 > zmax) break
    const g1 = heightAt(data, x1, z1)
    const v1 = v - drop * STEP
    let y1 = y + ((v + v1) / 2) * STEP
    v = v1
    energy -= STEP
    if (y1 < g1) {
      // a graze: it buries in ground rising too steeply, else bounces off it
      const rise = (g1 - g) / STEP
      if (rise > R.bury) {
        s = s1
        break
      }
      v = rise + R.restitution * (rise - v)
      y1 = g1
      energy -= R.graze
    }
    if (y1 - g1 <= R.height) {
      // low enough to strike men: every block whose span this step overlaps
      for (let p = 0; p < nb && energy > 0; p++) {
        const len = Math.min(s1, bOut[p]) - Math.max(s, bIn[p])
        if (len <= 0) continue
        const e = bE[p]
        const m = bM[p]
        const area = 2 * G.bx[e] * (G.bz1[e] - G.bz0[e])
        const lambda = len * R.width * (f.men[m] / area) * R.kill * Math.min(1, (2 * energy) / R.energy)
        let hits = Math.floor(lambda)
        if (nextUnit(rs) < lambda - hits) hits++
        if (hits) {
          f.owed[m] += hits
          energy -= hits * R.perMan
        }
      }
    }
    s = s1
    y = y1
    g = g1
  }
  f.shotKind[k] = SHOT_RAY
  f.shotX[k] = mx + ux * s
  f.shotZ[k] = mz + uz * s
}

// piece c of battery i fires one cone at (ax, az) now, as the step would (tests, debugging)
export function shootCone(w: World, i: number, c: number, j: number, ax: number, az: number): void {
  const G = blockGeometry(w)
  const k = i * w.cr.maxC + c
  const mx = G.ox[k] + G.fx[k] * typeOf(w, i).def.artillery!.ahead
  const mz = G.oz[k] + G.fz[k] * typeOf(w, i).def.artillery!.ahead
  cone(
    w,
    G,
    i,
    k,
    j,
    mx,
    mz,
    ax,
    az,
    sqrt((ax - mx) * (ax - mx) + (az - mz) * (az - mz)),
    keyedStream(ks, w.meta[M_SEED], w.meta[M_TICK], handleOf(w, i), c, K_CONE),
  )
}
// piece c of battery i fires one ball at (ax, az) now, as the step would (tests, debugging: it rebuilds the block
// geometry); the men it strikes are owed (step 11 removes them). Returns where it stopped
export function shootRay(w: World, i: number, c: number, ax: number, az: number): [number, number] {
  const G = blockGeometry(w)
  const k = i * w.cr.maxC + c
  const mx = G.ox[k] + G.fx[k] * typeOf(w, i).def.artillery!.ahead
  const mz = G.oz[k] + G.fz[k] * typeOf(w, i).def.artillery!.ahead
  ray(w, G, i, k, mx, mz, ax, az, keyedStream(ks, w.meta[M_SEED], w.meta[M_TICK], handleOf(w, i), c, K_RAY))
  return [w.f.shotX[k], w.f.shotZ[k]]
}
