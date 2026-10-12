// meander (docs/proposals/map-engine.md §3.4, docs/plans/active/m3-generators.md): a stream's bends along its guide
// line, the valley's axis. The Kinoshita curve of the look world's river (src/look/world/author.ts, step 1) in the
// exact maths: the channel's direction swings as θ0·sin φ (with a little skew and fattening), φ advancing along the
// channel; each bend varies its amplitude and length by a seeded, slowly varying noise; a cubic restoring term holds
// the channel inside its belt (± amplitude across the guide); the bends ease to nothing over half a wavelength at each
// end, so the stream starts and ends on its guide.
import type { Pt } from './schema.ts'
import { lineLength, pointAt } from './geometry.ts'
import { random } from './seed.ts'
import { valueNoise } from './noise.ts'
import { cos, sin, PI } from '../sim/num.ts'

export interface MeanderParams { amplitude: number; wavelength?: number; bend?: number }
export const MEANDER_DEFAULTS = { wavelengthWidths: 11, bend: 1.2 }
const JS = 0.03, JF = 0.02   // Kinoshita's skew and fattening (the look world's values)

// Bessel J0 by the mean of cos(x sin t): sinuosity = 1 / J0(θ0)
function J0(x: number): number { let s = 0; for (let i = 0; i < 64; i++) s += cos(x * sin((i + 0.5) / 64 * PI)); return s / 64 }
const smooth = (s: number): number => { const t = s < 0 ? 0 : s > 1 ? 1 : s; return t * t * (3 - 2 * t) }
const cm = (v: number): number => Math.round(v * 100) / 100

export function meander(guide: Pt[], width: number, p: MeanderParams, seed: number): Pt[] {
  const len = lineLength(guide), ds = width / 4, belt = p.amplitude
  const valleyLam = p.wavelength ?? MEANDER_DEFAULTS.wavelengthWidths * width, base = p.bend ?? MEANDER_DEFAULTS.bend
  const rnd = random(seed), nA = (k: number) => 0.5 + 0.5 * valueNoise(seed, k * 1.3, 3.1), nL = (k: number) => 0.5 + 0.5 * valueNoise(seed + 1, k * 1.1, 7.7)
  const U: number[] = [0], V: number[] = [0]
  let u = 0, v = 0, ph = rnd() * 2 * PI
  for (let guard = 0; u < len && guard < 1e6; guard++) {
    const bend = ph / PI
    const th0 = Math.min(1.85, base * (0.65 + 0.7 * nA(bend)))                           // ±35% per bend; ≤ 1.85 keeps loops from touching
    const lam = valleyLam * (0.65 + 0.7 * nL(bend)) / J0(th0)                             // along the channel
    let th = th0 * sin(ph) + th0 * th0 * th0 * (JS * cos(3 * ph) - JF * sin(3 * ph))
    const vb = v / belt; th -= 1.2 * vb * vb * vb                                          // free in the middle, firm at the belt's edge
    u += cos(th) * ds; v += sin(th) * ds; ph += 2 * PI * ds / lam
    U.push(Math.min(u, len)); V.push(v)
  }
  // onto the guide, easing the bends out at both ends; a point about every half width, the last on the guide's end
  const ease = valleyLam / 2, out: Pt[] = []
  for (let k = 0; k < U.length; k += 2) {
    const w = smooth(Math.min(U[k], len - U[k]) / ease), [gx, gz, tx, tz] = pointAt(guide, U[k])
    out.push([cm(gx - tz * V[k] * w), cm(gz + tx * V[k] * w)])
  }
  const end = guide[guide.length - 1], last = out[out.length - 1]
  if (last[0] !== end[0] || last[1] !== end[1]) out.push([end[0], end[1]])
  // drop repeated points (rounding can merge two)
  return out.filter((q, k) => k === 0 || q[0] !== out[k - 1][0] || q[1] !== out[k - 1][1])
}
