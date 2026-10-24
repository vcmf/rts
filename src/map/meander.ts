// meander (docs/proposals/map-engine.md §3.4, docs/plans/done/m3-generators.md): a stream's bends along its guide
// line, the valley's axis. The Kinoshita curve of the look world's river (src/look/world/author.ts, step 1) in the
// exact maths: the channel's direction swings as θ0·sin φ (with a little skew and fattening), φ advancing along the
// channel; each bend varies its amplitude and length by a seeded, slowly varying noise; a cubic restoring term holds
// the channel inside its belt (± amplitude across the guide), and its heading never strays past HEADING_MAX from the
// guide's, so it always advances; the bends ease to nothing over half a wavelength at each end, so the stream starts
// and ends on its guide.
import type { Pt } from './schema.ts'
import { lineLength } from './geometry.ts'
import { random } from './seed.ts'
import { valueNoise } from './noise.ts'
import { atan2, cos, sin, PI } from '../sim/num.ts'
import { cm, smooth } from './util.ts'

export interface MeanderParams {
  amplitude: number
  wavelength?: number
  bend?: number
}
export const MEANDER_DEFAULTS = { wavelengthWidths: 11, bend: 1.2 }
const JS = 0.03
const JF = 0.02 // Kinoshita's skew and fattening (the look world's values)
// the channel's heading never strays more than this from the guide's, so it always advances along the guide: on a
// straight guide the line cannot cross itself, whatever the seed (no goosenecks; the price of a guarantee)
export const HEADING_MAX = 1.45 // rad, about 83°

// Bessel J0 by the mean of cos(x sin t): sinuosity = 1 / J0(θ0)
function J0(x: number): number {
  let s = 0
  for (let i = 0; i < 64; i++) s += cos(x * sin(((i + 0.5) / 64) * PI))
  return s / 64
}

// the guide's frame at distance u: the point on the guide, and a normal that turns smoothly through each vertex
// (blended over up to `blend` m each side, never more than half a neighbouring segment), so the offsets neither
// gap nor fold where the guide bends
function frame(guide: Pt[], cum: number[], u: number, blend: number): [number, number, number, number] {
  // the segment holding u, by bisection on the cumulative lengths (u only grows, but bisection keeps this pure)
  let lo = 0
  let hi = guide.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (cum[mid] <= u) lo = mid
    else hi = mid
  }
  const L = cum[hi] - cum[lo]
  const t = L > 0 ? Math.min(1, Math.max(0, (u - cum[lo]) / L)) : 0
  const tx = (guide[hi][0] - guide[lo][0]) / (L || 1)
  const tz = (guide[hi][1] - guide[lo][1]) / (L || 1)
  const gx = guide[lo][0] + t * (guide[hi][0] - guide[lo][0])
  const gz = guide[lo][1] + t * (guide[hi][1] - guide[lo][1])
  const k = hi
  // the vertex nearest u, if within its blend zone
  for (const v of [k - 1, k]) {
    if (v <= 0 || v >= guide.length - 1) continue
    const d = Math.min(blend, (cum[v] - cum[v - 1]) / 2, (cum[v + 1] - cum[v]) / 2)
    const off = u - cum[v]
    if (off <= -d || off >= d) continue
    const ax = guide[v][0] - guide[v - 1][0]
    const az = guide[v][1] - guide[v - 1][1]
    const la = Math.sqrt(ax * ax + az * az)
    const bx = guide[v + 1][0] - guide[v][0]
    const bz = guide[v + 1][1] - guide[v][1]
    const lb = Math.sqrt(bx * bx + bz * bz)
    const w = smooth((off + d) / (2 * d))
    const mx = (ax / la) * (1 - w) + (bx / lb) * w
    const mz = (az / la) * (1 - w) + (bz / lb) * w
    const l = Math.sqrt(mx * mx + mz * mz)
    return [gx, gz, mx / l, mz / l]
  }
  return [gx, gz, tx, tz]
}

export function meander(guide: Pt[], width: number, p: MeanderParams, seed: number): Pt[] {
  const len = lineLength(guide)
  const ds = width / 4
  const belt = p.amplitude
  if (belt < width) {
    throw new Error(`the belt's half-width (amplitude ${belt} m) must be at least the stream's width (${width} m)`)
  }
  const cum = [0]
  for (let k = 1; k < guide.length; k++) {
    cum.push(
      cum[k - 1] +
        Math.sqrt(
          (guide[k][0] - guide[k - 1][0]) * (guide[k][0] - guide[k - 1][0]) +
            (guide[k][1] - guide[k - 1][1]) * (guide[k][1] - guide[k - 1][1]),
        ),
    )
    if (k < guide.length - 1) {
      const ax = guide[k][0] - guide[k - 1][0]
      const az = guide[k][1] - guide[k - 1][1]
      const bx = guide[k + 1][0] - guide[k][0]
      const bz = guide[k + 1][1] - guide[k][1]
      // a guide may turn up to 90° at a vertex (sharper exactly when the directions' dot product is negative; no
      // cosine: cos(π/2) is not 0 in floats), and the turn must be eased over enough guide: the normal turns through
      // the vertex over 2d, d = min(3·belt, half of each neighbouring segment), an arc of radius about 2d / θ, which
      // must hold the belt (with the 35% the bends may overshoot it) on its inside, so d ≥ 0.7 · belt · θ
      if (ax * bx + az * bz < 0) {
        throw new Error(`the guide turns more than 90° at point ${k}; meander needs gentler turns`)
      }
      const theta = Math.abs(atan2(ax * bz - az * bx, ax * bx + az * bz))
      const need = 0.7 * belt * theta
      const d = Math.min(3 * belt, Math.sqrt(ax * ax + az * az) / 2, Math.sqrt(bx * bx + bz * bz) / 2)
      if (d < need) {
        throw new Error(
          `the guide's segments either side of point ${k} are too short for its turn and a ${belt} m belt: make each at least ${Math.ceil(2 * need)} m, or the turn gentler`,
        )
      }
    }
  }
  const valleyLam = p.wavelength ?? MEANDER_DEFAULTS.wavelengthWidths * width
  const base = p.bend ?? MEANDER_DEFAULTS.bend
  const rnd = random(seed)
  const nA = (k: number) => 0.5 + 0.5 * valueNoise(seed, k * 1.3, 3.1)
  const nL = (k: number) => 0.5 + 0.5 * valueNoise(seed + 1, k * 1.1, 7.7)
  const U: number[] = [0]
  const V: number[] = [0]
  let u = 0
  let v = 0
  let ph = rnd() * 2 * PI
  while (u < len) {
    const bend = ph / PI
    const th0 = Math.min(HEADING_MAX, base * (0.65 + 0.7 * nA(bend))) // ±35% per bend
    const lam = (valleyLam * (0.65 + 0.7 * nL(bend))) / J0(th0) // along the channel
    let th = th0 * sin(ph) + th0 * th0 * th0 * (JS * cos(3 * ph) - JF * sin(3 * ph))
    const vb = v / belt
    th -= 1.2 * vb * vb * vb // free in the middle, firm at the belt's edge
    th = th > HEADING_MAX ? HEADING_MAX : th < -HEADING_MAX ? -HEADING_MAX : th // always advancing (cos th > 0)
    u += cos(th) * ds
    v += sin(th) * ds
    ph += (2 * PI * ds) / lam
    U.push(Math.min(u, len))
    V.push(v)
  }
  // onto the guide, easing the bends out at both ends; a point about every half width, the last on the guide's end
  const ease = valleyLam / 2
  const blend = 3 * belt
  const out: Pt[] = []
  for (let k = 0; k < U.length; k += 2) {
    const w = smooth(Math.min(U[k], len - U[k]) / ease)
    const [gx, gz, tx, tz] = frame(guide, cum, U[k], blend)
    out.push([cm(gx - tz * V[k] * w), cm(gz + tx * V[k] * w)])
  }
  const end = guide[guide.length - 1]
  const last = out[out.length - 1]
  if (last[0] !== end[0] || last[1] !== end[1]) out.push([end[0], end[1]])
  // drop repeated points (rounding can merge two)
  return out.filter((q, k) => k === 0 || q[0] !== out[k - 1][0] || q[1] !== out[k - 1][1])
}
