// Every construct the sim bans (decision 0006, 0005), one per marked line. test/lint.test.ts lints this
// file as if it were in src/sim/ and expects exactly the marked lines to fail.
export function banned(x: number): number[] {
  const out: number[] = []
  out.push(Math.sin(x)) // BANNED
  out.push(Math.cos(x)) // BANNED
  out.push(Math.tan(x)) // BANNED
  out.push(Math.atan2(x, 1)) // BANNED
  out.push(Math.asin(x)) // BANNED
  out.push(Math.exp(x)) // BANNED
  out.push(Math.log(x)) // BANNED
  out.push(Math.pow(x, 2)) // BANNED
  out.push(Math.hypot(x, 1)) // BANNED
  out.push(Math.cbrt(x)) // BANNED
  out.push(Math.random()) // BANNED
  out.push(Math.fround(x)) // BANNED
  out.push(x ** 2) // BANNED
  let y = x; y **= 2; out.push(y) // BANNED
  out.push(Date.now()) // BANNED
  out.push(new Date().getTime()) // BANNED
  out.push(performance.now()) // BANNED
  const f = new Float32Array(1); out.push(f[0]) // BANNED
  const m = new Map<number, number>(); out.push(m.size) // BANNED
  const s = new Set<number>(); out.push(s.size) // BANNED
  const { sin } = Math; out.push(sin(x)) // BANNED
  return out
}
// an import from outside src/sim/
export { buildSimData } from '../../tools/build-sim-data.ts' // BANNED
// allowed: exact operations
export const ok = (x: number): number => Math.sqrt(x * x + 1) / 2 + Math.floor(x) + Math.abs(x) + Math.min(x, 1)
