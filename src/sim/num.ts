// The simulation's maths (decision 0006): IEEE + − × / and sqrt are correctly rounded and identical
// in every JS engine; Math.sin and the other transcendental functions are not. So sin, cos and atan2
// are polynomials built only from exact operations, and give the same bits everywhere.
export const PI = 3.141592653589793
export const TWO_PI = 6.283185307179586
const HALF_PI = 1.5707963267948966
// π/2 split in two (Cody–Waite) so the range reduction loses no bits for angles up to a few hundred radians
const HALF_PI_HI = 1.5707963267341256, HALF_PI_LO = 6.077100506506192e-11

// sin and cos on [−π/4, π/4]: Taylor series to x^17 and x^16 (error < 1e-16 there)
function sinCore(x: number): number {
  const x2 = x * x
  return x * (1 + x2 * (-1 / 6 + x2 * (1 / 120 + x2 * (-1 / 5040 + x2 * (1 / 362880 + x2 * (-1 / 39916800
    + x2 * (1 / 6227020800 + x2 * (-1 / 1307674368000 + x2 * (1 / 355687428096000)))))))))
}
function cosCore(x: number): number {
  const x2 = x * x
  return 1 + x2 * (-1 / 2 + x2 * (1 / 24 + x2 * (-1 / 720 + x2 * (1 / 40320 + x2 * (-1 / 3628800
    + x2 * (1 / 479001600 + x2 * (-1 / 87178291200 + x2 * (1 / 20922789888000))))))))
}
// x = k·π/2 + r with |r| ≤ π/4. Exact while k·π/2 (hi part) is exact: |x| up to about 1e5, far beyond any
// angle the sim forms (headings are kept in (−π, π]); larger inputs are a bug and throw
export const TRIG_DOMAIN = 1e5
function reduce(x: number): [number, number] {
  if (!(x <= TRIG_DOMAIN && x >= -TRIG_DOMAIN) && x === x) throw new RangeError(`trig argument ${x} outside ±${TRIG_DOMAIN}`)
  const k = Math.round(x / HALF_PI)
  return [k, (x - k * HALF_PI_HI) - k * HALF_PI_LO]
}
export function sin(x: number): number {
  const [k, r] = reduce(x), q = ((k % 4) + 4) % 4
  return q === 0 ? sinCore(r) : q === 1 ? cosCore(r) : q === 2 ? -sinCore(r) : -cosCore(r)
}
export function cos(x: number): number {
  const [k, r] = reduce(x), q = ((k % 4) + 4) % 4
  return q === 0 ? cosCore(r) : q === 1 ? -sinCore(r) : q === 2 ? -cosCore(r) : sinCore(r)
}
// atan on [0, 2 − √3]: Taylor series to t^25 (error < 1e-15 there)
function atanCore(t: number): number {
  const t2 = t * t
  let s = 1 / 25
  for (let n = 23; n >= 1; n -= 2) s = 1 / n - t2 * s
  return t * s
}
const SQRT3 = Math.sqrt(3), TAN_PI_12 = 2 - SQRT3
// atan for t ≥ 0
function atanPos(t: number): number {
  if (t > 1) return HALF_PI - atanPos(1 / t)
  if (t > TAN_PI_12) return PI / 6 + atanCore((t * SQRT3 - 1) / (t + SQRT3))
  return atanCore(t)
}
// the angle of (x, y) from the +x axis, like Math.atan2(y, x), in (−π, π]: unlike Math, a negative zero y
// on the negative x axis gives +π, and zero results are +0 (the sim has no use for signed zeros)
export function atan2(y: number, x: number): number {
  if (x === 0 && y === 0) return 0
  const ax = x < 0 ? -x : x, ay = y < 0 ? -y : y
  let a = ay <= ax ? atanPos(ay / ax) : HALF_PI - atanPos(ax / ay)
  if (x < 0) a = PI - a
  return y < 0 ? -a : a
}
// an angle in (−π, π]
export function wrapAngle(a: number): number {
  if (!(a <= TRIG_DOMAIN && a >= -TRIG_DOMAIN) && a === a) throw new RangeError(`angle ${a} outside ±${TRIG_DOMAIN}`)
  const k = Math.round(a / TWO_PI)
  const r = a - k * TWO_PI
  return r <= -PI ? r + TWO_PI : r > PI ? r - TWO_PI : r
}
// e^x for x in [−700, 700] (more than any decay or slope factor needs): x = k·ln2 + r with |r| ≤ ln2/2,
// e^r by Taylor to r^16 (error < 1e-17 there), then k exact doublings or halvings
const LN2_HI = 0.6931471803691238, LN2_LO = 1.9082149292705877e-10, LN2 = 0.6931471805599453
export function exp(x: number): number {
  if (x !== x) return x
  if (x > 700 || x < -700) throw new RangeError(`exp argument ${x} outside ±700`)
  const k = Math.round(x / LN2), r = (x - k * LN2_HI) - k * LN2_LO
  let s = 1, term = 1
  for (let n = 1; n <= 16; n++) { term = term * r / n; s += term }
  if (k > 0) for (let i = 0; i < k; i++) s *= 2
  else for (let i = 0; i < -k; i++) s /= 2
  return s
}

// command positions are quantised to 1 cm when the sim stamps them
export const quantise = (v: number): number => Math.round(v * 100) / 100

export class NonFiniteState extends Error {}
export function assertFinite(name: string, a: Float64Array): void {
  for (let i = 0; i < a.length; i++) {
    const v = a[i]
    if (v !== v || v === Infinity || v === -Infinity) throw new NonFiniteState(`${name}[${i}] = ${v}`)
  }
}
