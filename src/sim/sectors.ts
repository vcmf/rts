// Sectors (docs/proposals/sectors-model.md): where a threat stands to a formation, front, flank or rear, as weights
// that sum to 1, read the same by fire, charges and morale. Each formation's face is read once a tick from its
// placed blocks (the fire step's geometry); a point's weights come from an angle measure without trigonometry; a
// threat's are the mean over slices of its block. Scratch, not state: rebuilt from positions.
//
// Its numbers are the ruleset's `sectors` (SectorsDef).
import { type World, MAX_FORMATIONS, typeOf } from './world.ts'
import type { FireGeo } from './fire.ts'
import type { SectorsDef } from './ruleset.ts'
import { layoutOf } from './formation.ts'
import { sin, cos } from './num.ts'
import { allRoundOf, blendOf } from './traits.ts'

/** The face's kinds (§ 2): none (changing shape), one (a formed shape's front), all (braced), trail (head and tail). */
export const FACE_NONE = 0
export const FACE_ONE = 1
export const FACE_ALL = 2
export const FACE_TRAIL = 3

/**
 * Each formation's face: its kind, and two frames, 0 for the front and 1 for the rear (the same frame for kinds one and
 * none; the head and tail companies' for a trail). A frame: its origin, its heading as a unit vector (s, c) (ahead is
 * (s, c), right is (c, −s)), and its box in that frame: L and R across, F (front edge) and B (rear edge) along, metres.
 */
export interface Faces {
  kind: Uint8Array
  ox: Float64Array
  oz: Float64Array
  s: Float64Array
  c: Float64Array
  L: Float64Array
  R: Float64Array
  F: Float64Array
  B: Float64Array
}

const corner = new Float64Array(8)
const ends = new Float64Array(2)

function facesOf(w: World): Faces {
  const s = w.scratch
  if (s.faces) return s.faces
  const n = MAX_FORMATIONS * 2
  return (s.faces = {
    kind: new Uint8Array(MAX_FORMATIONS),
    ox: new Float64Array(n),
    oz: new Float64Array(n),
    s: new Float64Array(n),
    c: new Float64Array(n),
    L: new Float64Array(n),
    R: new Float64Array(n),
    F: new Float64Array(n),
    B: new Float64Array(n),
  })
}

/** Company k's block's four corners in world space, into `corner` as x0, z0, … x3, z3 (from `blockGeometry`). */
function cornersOf(G: FireGeo, j: number, k: number): void {
  const hx = G.bx[j]
  ends[0] = G.bz0[j]
  ends[1] = G.bz1[j]
  let n = 0
  for (let e = 0; e < 2; e++) {
    const lz = ends[e]
    for (let sx = -1; sx <= 1; sx += 2) {
      const lx = sx * hx
      corner[n++] = G.ox[k] + lx * G.ca[k] - lz * G.sa[k]
      corner[n++] = G.oz[k] + lx * G.sa[k] + lz * G.ca[k]
    }
  }
}

/** Frame q (formation j's frame 0 or 1) set to origin (x, z) and heading (s, c), its box emptied. */
function openFrame(F: Faces, q: number, x: number, z: number, s: number, c: number): void {
  F.ox[q] = x
  F.oz[q] = z
  F.s[q] = s
  F.c[q] = c
  F.L[q] = Infinity
  F.R[q] = -Infinity
  F.F[q] = -Infinity
  F.B[q] = Infinity
}

/** Frame q's box grown by company k's block (the corners projected on the frame). */
function growFrame(F: Faces, q: number, G: FireGeo, j: number, k: number): void {
  cornersOf(G, j, k)
  for (let n = 0; n < 4; n++) {
    const dx = corner[2 * n] - F.ox[q]
    const dz = corner[2 * n + 1] - F.oz[q]
    const x = dx * F.c[q] - dz * F.s[q]
    const y = dx * F.s[q] + dz * F.c[q]
    F.L[q] = Math.min(F.L[q], x)
    F.R[q] = Math.max(F.R[q], x)
    F.F[q] = Math.max(F.F[q], y)
    F.B[q] = Math.min(F.B[q], y)
  }
}

/**
 * Builds every live formation's face from the placed blocks in `G` (`blockGeometry`, after the tick's movement), into
 * the world's scratch (§ 2). Companies without men are left out.
 */
export function buildFaces(w: World, G: FireGeo): Faces {
  const F = facesOf(w)
  const f = w.f
  const CS = w.cr.maxC
  for (let j = 0; j < MAX_FORMATIONS; j++) {
    if (!f.alive[j]) continue
    const def = layoutOf(w, j).def
    const kind = f.trans[j] ? FACE_NONE : allRoundOf(w, j) ? FACE_ALL : def.trail ? FACE_TRAIL : FACE_ONE
    F.kind[j] = kind
    if (kind === FACE_ALL) continue
    const C = typeOf(w, j).C
    if (kind === FACE_TRAIL) {
      let head = -1
      let tail = -1
      for (let q = 0; q < C; q++) {
        if (f.men[j * CS + q] <= 0) continue
        if (head < 0) head = q
        tail = q
      }
      if (head < 0) continue
      for (const [fr, q] of [
        [0, head],
        [1, tail],
      ]) {
        const k = j * CS + q
        openFrame(F, 2 * j + fr, G.cx[k], G.cz[k], G.fx[k], G.fz[k])
        growFrame(F, 2 * j + fr, G, j, k)
      }
      continue
    }
    openFrame(F, 2 * j, f.x[j], f.z[j], sin(f.heading[j]), cos(f.heading[j]))
    for (let q = 0; q < C; q++) if (f.men[j * CS + q] > 0) growFrame(F, 2 * j, G, j, j * CS + q)
    copyFrame(F, 2 * j, 2 * j + 1)
  }
  return F
}

/** Frame `to` set to a copy of frame `from` (a shape with one face has the same frame front and rear). */
function copyFrame(F: Faces, from: number, to: number): void {
  F.ox[to] = F.ox[from]
  F.oz[to] = F.oz[from]
  F.s[to] = F.s[from]
  F.c[to] = F.c[from]
  F.L[to] = F.L[from]
  F.R[to] = F.R[from]
  F.F[to] = F.F[from]
  F.B[to] = F.B[from]
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)

/**
 * The weight toward frame q's front (side 1) or rear (side −1) of the point (x, y) in that frame (§ 3): the blend
 * centred on T (its formation's shape's, src/sim/traits.ts) on the angle measure t = o / (max(d, 0) + o + c), o metres
 * beyond the face's nearer end and d ahead of its edge (with T 0.5: 1 within 35° of straight ahead from the nearer
 * end, 0 past 55°), times the corner ramp (1 ahead of the edge, 0 a corner's length c behind it).
 */
function sideWeight(S: SectorsDef, T: number, F: Faces, q: number, x: number, y: number, side: number): number {
  const o = Math.max(F.L[q] - x, x - F.R[q], 0)
  const d = side > 0 ? y - F.F[q] : F.B[q] - y
  const t = o / (Math.max(d, 0) + o + S.corner)
  return clamp01((T + S.blend.H - t) / (2 * S.blend.H)) * clamp01(1 + d / S.corner)
}

/** The world point (px, pz) in frame q, as (x, y) into `xy`. */
function toFrame(F: Faces, q: number, px: number, pz: number, xy: Float64Array): void {
  const dx = px - F.ox[q]
  const dz = pz - F.oz[q]
  xy[0] = dx * F.c[q] - dz * F.s[q]
  xy[1] = dx * F.s[q] + dz * F.c[q]
}

/** Front and rear into out[0], out[2], flank the rest, rescaled when front and rear overlap. */
function finish(front: number, rear: number, out: Float64Array): Float64Array {
  const sum = front + rear
  if (sum > 1) {
    front /= sum
    rear /= sum
  }
  out[0] = front
  out[2] = rear
  out[1] = 1 - front - rear
  return out
}

const xy = new Float64Array(2)
const px = new Float64Array(4)
const py = new Float64Array(4)
// the corners in order round the rectangle: (−,0) (+,0) (+,1) (−,1)
const RING = [0, 1, 3, 2]

/**
 * The weights (front, flank, rear) of the world point (x, z), metres, to formation j (§ 3), into `out`. The faces
 * must have been built this tick (`buildFaces`).
 */
export function pointWeights(w: World, j: number, x: number, z: number, out: Float64Array): Float64Array {
  const F = facesOf(w)
  const S = w.cr.rs.sectors
  const kind = F.kind[j]
  if (kind === FACE_ALL) return finish(1, 0, out)
  const T = blendOf(w, j)
  toFrame(F, 2 * j, x, z, xy)
  const front = kind === FACE_NONE ? 0 : sideWeight(S, T, F, 2 * j, xy[0], xy[1], 1)
  toFrame(F, 2 * j + 1, x, z, xy)
  const rear = sideWeight(S, T, F, 2 * j + 1, xy[0], xy[1], -1)
  return finish(front, rear, out)
}

/**
 * The mean over sectors.slices of the weight toward frame q's front (side 1) or rear (−1) of the block of company k of
 * formation i, each slice read at its nearest point to the frame's box (§ 4).
 */
function blockSide(
  S: SectorsDef,
  T: number,
  F: Faces,
  q: number,
  G: FireGeo,
  i: number,
  k: number,
  side: number,
): number {
  cornersOf(G, i, k)
  let x0 = Infinity
  let x1 = -Infinity
  for (let n = 0; n < 4; n++) {
    toFrame(F, q, corner[2 * n], corner[2 * n + 1], xy)
    px[n] = xy[0]
    py[n] = xy[1]
    x0 = Math.min(x0, xy[0])
    x1 = Math.max(x1, xy[0])
  }
  const mid = (F.F[q] + F.B[q]) / 2
  const N = x1 > x0 ? S.slices : 1
  let sum = 0
  for (let s = 0; s < N; s++) {
    const x = N === 1 ? x0 : x0 + ((s + 0.5) * (x1 - x0)) / N
    let ymin = Infinity
    let ymax = -Infinity
    for (let e = 0; e < 4; e++) {
      const a = RING[e]
      const b = RING[(e + 1) % 4]
      const lo = Math.min(px[a], px[b])
      const hi = Math.max(px[a], px[b])
      if (x < lo || x > hi) continue
      const y = hi === lo ? py[a] : py[a] + ((x - px[a]) * (py[b] - py[a])) / (px[b] - px[a])
      const y2 = hi === lo ? py[b] : y
      ymin = Math.min(ymin, y, y2)
      ymax = Math.max(ymax, y, y2)
    }
    const y = ymin > F.F[q] ? ymin : ymax < F.B[q] ? ymax : Math.min(Math.max(mid, ymin), ymax)
    sum += sideWeight(S, T, F, q, x, y, side)
  }
  return sum / N
}

/**
 * The weights (front, flank, rear) of company k's block (of formation i) as a threat to formation j (§ 4), into `out`:
 * the mean over slices across j's face of each slice's nearest point. The faces must have been built this tick.
 */
export function threatWeights(w: World, G: FireGeo, j: number, i: number, k: number, out: Float64Array): Float64Array {
  const F = facesOf(w)
  const kind = F.kind[j]
  if (kind === FACE_ALL) return finish(1, 0, out)
  const S = w.cr.rs.sectors
  const T = blendOf(w, j)
  const front = kind === FACE_NONE ? 0 : blockSide(S, T, F, 2 * j, G, i, k, 1)
  const rear = blockSide(S, T, F, 2 * j + 1, G, i, k, -1)
  return finish(front, rear, out)
}

/** A table's value for the weights: its front, flank and rear values times the weights (front, flank, rear). */
export const byWeights = (t: { front: number; flank: number; rear: number }, wt: ArrayLike<number>): number =>
  t.front * wt[0] + t.flank * wt[1] + t.rear * wt[2]
